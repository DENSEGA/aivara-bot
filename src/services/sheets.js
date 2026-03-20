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

// ============ ОБЪЕКТЫ ============

async function getObjects() {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: SID(), range: 'objects!A2:A50',
  });
  return (res.data.values || [])
    .map((row, i) => ({ index: i, name: (row[0] || '').trim() }))
    .filter((o) => o.name.length > 0);
}

async function addObject(name) {
  await getSheets().spreadsheets.values.append({
    spreadsheetId: SID(), range: 'objects!A:A',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[name]] },
  });
}

async function removeObject(name) {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: SID(), range: 'objects!A:A',
  });
  const rows = res.data.values || [];
  const idx = rows.findIndex((r, i) => i > 0 && r[0] && r[0].trim() === name);
  if (idx === -1) return false;
  // Очищаем ячейку
  await getSheets().spreadsheets.values.update({
    spreadsheetId: SID(), range: `objects!A${idx + 1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['']] },
  });
  return true;
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
    spreadsheetId: SID(), range: 'finance!A:I',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[timestamp, 'expense', amount, object, category, comment || '', 'telegram_bot', msgId || '', dayKey]],
    },
  });
  return { date: displayDate, object, category, amount, comment };
}

async function getAllFinanceRows() {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: SID(), range: 'finance!A:I',
  });
  return (res.data.values || []).slice(1); // без заголовка
}

function filterByPeriod(rows, period) {
  const now = new Date();
  const todayKey = now.toISOString().split('T')[0];
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  return rows.filter((row) => {
    if (row[1] !== 'expense') return false;
    const dayKey = row[8];
    if (!dayKey) return false;

    if (period === 'day') return dayKey === todayKey;
    if (period === 'month') {
      const p = dayKey.split('-');
      return parseInt(p[0]) === currentYear && parseInt(p[1]) - 1 === currentMonth;
    }
    if (period === 'all') return true;
    return false;
  });
}

async function getReport(period, mode, objectFilter) {
  const rows = await getAllFinanceRows();
  let filtered = filterByPeriod(rows, period);

  if (objectFilter) {
    filtered = filtered.filter((r) => r[3] === objectFilter);
  }

  if (filtered.length === 0) {
    const periodName = period === 'day' ? 'сегодня' : period === 'month' ? 'за месяц' : 'за всё время';
    return `📊 Расходов ${periodName} нет.`;
  }

  if (mode === 'short') {
    const totals = {};
    let grand = 0;
    for (const row of filtered) {
      const obj = row[3];
      const amt = parseFloat(row[2]) || 0;
      totals[obj] = (totals[obj] || 0) + amt;
      grand += amt;
    }
    const lines = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([obj, sum]) => `  ${obj}: ${sum.toLocaleString('ru-RU')} ₽`);

    const periodName = period === 'day' ? 'за сегодня' : period === 'month' ? 'за месяц' : 'за всё время';
    return `📊 *Расходы ${periodName}:*\n\n${lines.join('\n')}\n\n💰 *Итого: ${grand.toLocaleString('ru-RU')} ₽*`;
  }

  // Полный отчёт
  const lines = filtered.map((row) => {
    const date = row[8] || '';
    const obj = row[3] || '';
    const cat = row[4] || '';
    const amt = parseFloat(row[2]) || 0;
    const comment = row[5] || '';
    let line = `📅 ${date} | ${obj} | ${cat} | ${amt.toLocaleString('ru-RU')} ₽`;
    if (comment) line += `\n   💬 ${comment}`;
    return line;
  });

  let grand = filtered.reduce((s, r) => s + (parseFloat(r[2]) || 0), 0);
  const periodName = period === 'day' ? 'за сегодня' : period === 'month' ? 'за месяц' : 'за всё время';

  let text = `📊 *Полный отчёт ${periodName}:*\n\n${lines.join('\n\n')}\n\n💰 *Итого: ${grand.toLocaleString('ru-RU')} ₽*`;

  // Telegram limit 4096
  if (text.length > 4000) {
    text = text.substring(0, 3950) + '\n\n... _(список обрезан)_';
  }
  return text;
}

// ============ ДНЕВНИК ============

async function addDiaryEntry(entry, reminderTime) {
  const now = new Date();
  const row = [now.toISOString(), entry, reminderTime || ''];

  await getSheets().spreadsheets.values.append({
    spreadsheetId: SID(), range: 'daylog!A:C',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });

  return {
    date: now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  };
}

async function getLastDiaryEntries(count = 5) {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: SID(), range: 'daylog!A:C',
  });
  const rows = (res.data.values || []).slice(1).slice(-count);
  return rows.map(([ts, entry, reminder]) => {
    const d = new Date(ts);
    return {
      date: d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      entry, reminder: reminder || null,
    };
  });
}

async function getReminders() {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: SID(), range: 'daylog!A:C',
  });
  const rows = (res.data.values || []).slice(1);
  return rows
    .filter((r) => r[2] && r[2].trim())
    .map(([ts, entry, reminder], i) => ({
      rowIndex: i + 2,
      entry, reminder,
    }));
}

// ============ ПРАЙС ============

async function getPriceList() {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: SID(), range: 'price!A:F',
  });
  return (res.data.values || []).slice(1); // без заголовка
}

async function getCoefficients() {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: SID(), range: 'coefficients!A:C',
  });
  const rows = (res.data.values || []).slice(1);
  const coeffs = {};
  for (const [param, val] of rows) {
    if (param && val) coeffs[param] = parseFloat(val) || val;
  }
  return coeffs;
}

async function getCompanyInfo() {
  const res = await getSheets().spreadsheets.values.get({
    spreadsheetId: SID(), range: 'blank!A:B',
  });
  const rows = (res.data.values || []).slice(1);
  const info = {};
  for (const [param, val] of rows) {
    if (param) info[param] = val || '';
  }
  return info;
}

module.exports = {
  getObjects, addObject, removeObject,
  getCategories, addExpense, getReport,
  addDiaryEntry, getLastDiaryEntries, getReminders,
  getPriceList, getCoefficients, getCompanyInfo,
};
