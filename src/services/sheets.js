const { google } = require('googleapis');

let sheetsClient = null;

function getSheets() {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

const SID = () => process.env.GOOGLE_SHEETS_ID;

// Парсим число — убираем пробелы и запятые
function num(val) {
  if (!val) return 0;
  return parseFloat(String(val).replace(/\s/g, '').replace(',', '.')) || 0;
}

// ============ ОБЪЕКТЫ ============
async function getObjects() {
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SID(), range: 'objects!A2:A50' });
  return (res.data.values || []).map((row, i) => ({ index: i, name: (row[0] || '').trim() })).filter((o) => o.name.length > 0);
}

async function addObject(name) {
  await getSheets().spreadsheets.values.append({ spreadsheetId: SID(), range: 'objects!A:A', valueInputOption: 'USER_ENTERED', requestBody: { values: [[name]] } });
}

// ============ КАТЕГОРИИ ============
function getCategories() {
  return ['Материалы', 'Работа', 'Доставка', 'Инструмент', 'Проект', 'Коммуникации', 'Прочее'];
}

// ============ ФИНАНСЫ ============
async function addExpense({ object, category, amount, comment, msgId }) {
  const now = new Date();
  const timestamp = now.toISOString();
  const dayKey = timestamp.split('T')[0];
  const displayDate = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  await getSheets().spreadsheets.values.append({
    spreadsheetId: SID(), range: 'finance!A:I', valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[timestamp, 'expense', amount, object, category, comment || '', 'telegram_bot', msgId || '', dayKey]] },
  });
  return { date: displayDate, object, category, amount, comment };
}

async function getAllFinanceRows() {
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SID(), range: 'finance!A:I' });
  return (res.data.values || []).slice(1);
}

function filterByPeriod(rows, period) {
  const now = new Date();
  const todayKey = now.toISOString().split('T')[0];
  const cm = now.getMonth(), cy = now.getFullYear();
  return rows.filter((r) => {
    if (r[1] !== 'expense') return false;
    const dk = r[8]; if (!dk) return false;
    if (period === 'day') return dk === todayKey;
    if (period === 'month') { const p = dk.split('-'); return parseInt(p[0]) === cy && parseInt(p[1]) - 1 === cm; }
    return period === 'all';
  });
}

async function getReport(period, mode, objectFilter) {
  const rows = await getAllFinanceRows();
  let filtered = filterByPeriod(rows, period);
  if (objectFilter) filtered = filtered.filter((r) => r[3] === objectFilter);
  if (!filtered.length) {
    const pn = period === 'day' ? 'сегодня' : period === 'month' ? 'за месяц' : 'за всё время';
    return `📊 Расходов ${pn} нет.`;
  }
  if (mode === 'short') {
    const totals = {}; let grand = 0;
    for (const r of filtered) { const obj = r[3]; const amt = num(r[2]); totals[obj] = (totals[obj] || 0) + amt; grand += amt; }
    const lines = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([o, s]) => `  ${o}: ${s.toLocaleString('ru-RU')} ₽`);
    const pn = period === 'day' ? 'за сегодня' : period === 'month' ? 'за месяц' : 'за всё время';
    return `📊 *Расходы ${pn}:*\n\n${lines.join('\n')}\n\n💰 *Итого: ${grand.toLocaleString('ru-RU')} ₽*`;
  }
  const lines = filtered.map((r) => {
    const line = `📅 ${r[8]||''} | ${r[3]||''} | ${r[4]||''} | ${num(r[2]).toLocaleString('ru-RU')} ₽`;
    return r[5] ? line + `\n   💬 ${r[5]}` : line;
  });
  let grand = filtered.reduce((s, r) => s + num(r[2]), 0);
  const pn = period === 'day' ? 'за сегодня' : period === 'month' ? 'за месяц' : 'за всё время';
  let text = `📊 *Полный отчёт ${pn}:*\n\n${lines.join('\n\n')}\n\n💰 *Итого: ${grand.toLocaleString('ru-RU')} ₽*`;
  if (text.length > 4000) text = text.substring(0, 3950) + '\n\n... _(обрезано)_';
  return text;
}

// ============ ДНЕВНИК ============
async function addDiaryEntry(entry, reminderTime) {
  const now = new Date();
  await getSheets().spreadsheets.values.append({
    spreadsheetId: SID(), range: 'daylog!A:C', valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[now.toISOString(), entry, reminderTime || '']] },
  });
  return {
    date: now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  };
}

async function getLastDiaryEntries(count = 5) {
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SID(), range: 'daylog!A:C' });
  return (res.data.values || []).slice(1).slice(-count).map(([ts, entry, reminder]) => {
    const d = new Date(ts);
    return {
      date: d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      entry, reminder: reminder || null,
    };
  });
}

async function getReminders() {
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SID(), range: 'daylog!A:C' });
  return (res.data.values || []).slice(1).filter((r) => r[2] && r[2].trim()).map(([ts, entry, reminder], i) => ({ rowIndex: i + 2, entry, reminder }));
}

// ============ ПРАЙС с колонками G/H ============
async function getPriceList() {
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SID(), range: 'price!A:H' });
  return (res.data.values || []).slice(1);
}

function buildPriceMap(priceRows, houseType) {
  const map = {};
  for (const row of priceRows) {
    const name = (row[1] || '').trim();
    const price = num(row[3]);
    if (!name || !price) continue;
    const colG = (row[6] || '').trim().toLowerCase();
    const colH = (row[7] || '').trim().toLowerCase();
    if (houseType === 'module') {
      map[name] = price;
    } else if (houseType === 'standardplus') {
      if (colH.includes('стандарт')) map[name] = price;
    } else {
      if (colG.includes('стандарт')) map[name] = price;
    }
  }
  return map;
}

async function getCoefficients() {
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SID(), range: 'coefficients!A:C' });
  const coeffs = {};
  for (const [param, val] of (res.data.values || []).slice(1)) {
    if (param && val) coeffs[param] = parseFloat(String(val).replace(/\s/g, '').replace(',', '.')) || val;
  }
  return coeffs;
}

async function getCompanyInfo() {
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SID(), range: 'blank!A:B' });
  const info = {};
  for (const [param, val] of (res.data.values || []).slice(1)) { if (param) info[param] = val || ''; }
  return info;
}

// ============================================================
// ЭТАПЫ СТРОЙКИ (НОВОЕ в v4.0)
// ============================================================
// Лист stages: A=объект, B=этап, C=статус, D=прогресс%, E=назначен(chatId), F=дата_начала, G=дата_завершения, H=комментарий

const DEFAULT_STAGES = [
  'Фундамент (сваи)',
  'Каркас дома',
  'Утепление',
  'Кровля',
  'Фасад',
  'Окна и двери',
  'Инженерные системы',
  'Внутренняя отделка',
  'Сдача объекта',
];

const STAGE_STATUSES = {
  waiting: { emoji: '⏳', label: 'Ожидание' },
  active: { emoji: '🔨', label: 'В работе' },
  done: { emoji: '✅', label: 'Выполнен' },
};

/**
 * Получить все этапы по объекту
 */
async function getObjectStages(objectName) {
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SID(), range: 'stages!A:H' });
  const rows = (res.data.values || []).slice(1);
  return rows
    .map((row, i) => ({
      rowIndex: i + 2, // строка в таблице (1-indexed + header)
      object: (row[0] || '').trim(),
      stage: (row[1] || '').trim(),
      status: (row[2] || 'waiting').trim(),
      progress: parseInt(row[3]) || 0,
      assignee: (row[4] || '').trim(),
      startDate: (row[5] || '').trim(),
      endDate: (row[6] || '').trim(),
      comment: (row[7] || '').trim(),
    }))
    .filter((s) => s.object === objectName);
}

/**
 * Получить все объекты с их прогрессом
 */
async function getObjectsWithProgress() {
  const objects = await getObjects();
  const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SID(), range: 'stages!A:D' });
  const rows = (res.data.values || []).slice(1);

  return objects.map((obj) => {
    const stages = rows.filter((r) => (r[0] || '').trim() === obj.name);
    const totalStages = stages.length || 1;
    const doneStages = stages.filter((r) => (r[2] || '').trim() === 'done').length;
    const activeStages = stages.filter((r) => (r[2] || '').trim() === 'active').length;
    const progress = Math.round((doneStages / totalStages) * 100);

    let status = 'waiting';
    if (doneStages === totalStages && totalStages > 0) status = 'done';
    else if (activeStages > 0 || doneStages > 0) status = 'active';

    return {
      ...obj,
      totalStages,
      doneStages,
      activeStages,
      progress,
      status,
      hasStages: stages.length > 0,
    };
  });
}

/**
 * Создать этапы для объекта (по умолчанию)
 */
async function initObjectStages(objectName) {
  const existing = await getObjectStages(objectName);
  if (existing.length > 0) return existing;

  const rows = DEFAULT_STAGES.map((stage) => [objectName, stage, 'waiting', '0', '', '', '', '']);

  await getSheets().spreadsheets.values.append({
    spreadsheetId: SID(),
    range: 'stages!A:H',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  return await getObjectStages(objectName);
}

/**
 * Обновить статус этапа
 */
async function updateStageStatus(rowIndex, status, progress) {
  const now = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Обновляем C (статус) и D (прогресс)
  await getSheets().spreadsheets.values.update({
    spreadsheetId: SID(),
    range: `stages!C${rowIndex}:D${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[status, progress]] },
  });

  // Если статус = active и нет даты начала — ставим
  if (status === 'active') {
    const res = await getSheets().spreadsheets.values.get({ spreadsheetId: SID(), range: `stages!F${rowIndex}` });
    const startDate = (res.data.values || [])[0]?.[0];
    if (!startDate) {
      await getSheets().spreadsheets.values.update({
        spreadsheetId: SID(),
        range: `stages!F${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[now]] },
      });
    }
  }

  // Если статус = done — ставим дату завершения и прогресс 100
  if (status === 'done') {
    await getSheets().spreadsheets.values.update({
      spreadsheetId: SID(),
      range: `stages!D${rowIndex}:G${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['100', '', now]] },
    });
  }
}

/**
 * Назначить ответственного за этап
 */
async function assignStage(rowIndex, chatId) {
  await getSheets().spreadsheets.values.update({
    spreadsheetId: SID(),
    range: `stages!E${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[String(chatId)]] },
  });
}

/**
 * Добавить комментарий к этапу
 */
async function addStageComment(rowIndex, comment) {
  await getSheets().spreadsheets.values.update({
    spreadsheetId: SID(),
    range: `stages!H${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[comment]] },
  });
}

module.exports = {
  getObjects, addObject, getCategories, addExpense, getReport,
  addDiaryEntry, getLastDiaryEntries, getReminders,
  getPriceList, buildPriceMap, getCoefficients, getCompanyInfo, num,
  // Новое v4.0
  getObjectStages, getObjectsWithProgress, initObjectStages,
  updateStageStatus, assignStage, addStageComment,
  DEFAULT_STAGES, STAGE_STATUSES,
};
