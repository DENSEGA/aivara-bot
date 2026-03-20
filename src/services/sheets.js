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

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;

/**
 * Получить список объектов из листа "objects"
 * Столбец A — названия, начиная со строки 2
 */
async function getObjects() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'objects!A2:A50',
  });
  const rows = res.data.values || [];
  return rows
    .map((row, i) => ({ index: i, name: (row[0] || '').trim() }))
    .filter((obj) => obj.name.length > 0);
}

/**
 * Категории расходов
 */
function getCategories() {
  return [
    'Материалы',
    'Работа',
    'Доставка',
    'Инструмент',
    'Проект',
    'Коммуникации',
    'Прочее',
  ];
}

/**
 * Записать расход в лист "finance"
 * Столбцы: timestamp | type | amount | object | category | comment | source | msg_id | day_key
 */
async function addExpense({ object, category, amount, comment, msgId }) {
  const sheets = getSheets();
  const now = new Date();
  const timestamp = now.toISOString();
  const dayKey = now.toISOString().split('T')[0];
  const displayDate = now.toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'finance!A:I',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        timestamp,
        'expense',
        amount,
        object,
        category,
        comment || '',
        'telegram_bot',
        msgId || '',
        dayKey,
      ]],
    },
  });

  return { date: displayDate, object, category, amount, comment };
}

/**
 * Сумма расходов по объекту за текущий месяц
 */
async function getMonthTotal(objectName) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'finance!A:I',
  });

  const rows = res.data.values || [];
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  let total = 0;

  for (const row of rows.slice(1)) {
    const [, type, amountStr, obj] = row;
    const dayKey = row[8];
    if (!obj || !dayKey || type !== 'expense' || obj !== objectName) continue;

    const parts = dayKey.split('-');
    if (parts.length !== 3) continue;
    if (parseInt(parts[0]) === currentYear && parseInt(parts[1]) - 1 === currentMonth) {
      total += parseFloat(amountStr) || 0;
    }
  }
  return total;
}

/**
 * Итоги по всем объектам за текущий месяц
 */
async function getAllTotals() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'finance!A:I',
  });

  const rows = res.data.values || [];
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const totals = {};
  let grandTotal = 0;

  for (const row of rows.slice(1)) {
    const [, type, amountStr, obj] = row;
    const dayKey = row[8];
    if (!obj || !dayKey || type !== 'expense') continue;

    const parts = dayKey.split('-');
    if (parts.length !== 3) continue;
    if (parseInt(parts[0]) === currentYear && parseInt(parts[1]) - 1 === currentMonth) {
      const amt = parseFloat(amountStr) || 0;
      totals[obj] = (totals[obj] || 0) + amt;
      grandTotal += amt;
    }
  }
  return { totals, grandTotal };
}

/**
 * Записать в лист "daylog" (дневник)
 */
async function addDiaryEntry(entry) {
  const sheets = getSheets();
  const now = new Date();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'daylog!A:B',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[now.toISOString(), entry]],
    },
  });

  return {
    date: now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  };
}

/**
 * Последние записи дневника
 */
async function getLastDiaryEntries(count = 5) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'daylog!A:B',
  });

  const rows = res.data.values || [];
  return rows.slice(1).slice(-count).map(([timestamp, entry]) => {
    const d = new Date(timestamp);
    return {
      date: d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      entry,
    };
  });
}

module.exports = {
  getObjects, getCategories, addExpense,
  getMonthTotal, getAllTotals,
  addDiaryEntry, getLastDiaryEntries,
};
