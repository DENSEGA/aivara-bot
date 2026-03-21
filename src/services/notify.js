// ============================================================
// AIVARA Bot v4.0 — Кросс-бот уведомления
// ============================================================

let adminBot = null;
let teamBot = null;

function setBots(admin, team) {
  adminBot = admin;
  teamBot = team;
}

async function notifyAdmin(chatId, text, extra = {}) {
  if (!adminBot) return;
  try { await adminBot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown', ...extra }); } catch (e) { console.error('Notify admin error:', e.message); }
}

async function notifyTeam(chatId, text, extra = {}) {
  if (!teamBot) return;
  try { await teamBot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown', ...extra }); } catch (e) { console.error('Notify team error:', e.message); }
}

module.exports = { setBots, notifyAdmin, notifyTeam };
