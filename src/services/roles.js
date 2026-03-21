// ============================================================
// AIVARA Bot v4.0 — Система ролей (5 ролей, 2 бота)
// ============================================================

const ROLES = {
  admin: {
    bot: 'admin',
    finance: true, financeDelete: true, objects: true, objectsEdit: true,
    objectsView: true, stages: true, stagesEdit: true,
    reports: true, chatgpt: true, diary: true,
    tasks: true, tasksManage: true,
    config: true, gallery: true, compare: true,
    settings: true, users: true,
  },
  partner: {
    bot: 'admin',
    finance: true, financeDelete: false, objects: true, objectsEdit: false,
    objectsView: true, stages: true, stagesEdit: false,
    reports: true, chatgpt: true, diary: true,
    tasks: true, tasksManage: false,
    config: true, gallery: true, compare: true,
    settings: false, users: false,
  },
  foreman: {
    bot: 'team',
    finance: false, financeDelete: false, objects: false, objectsEdit: false,
    objectsView: true, stages: true, stagesEdit: true,
    reports: false, chatgpt: true, diary: false,
    tasks: true, tasksManage: true,
    config: false, gallery: false, compare: false,
    settings: false, users: false,
    // Специфичные для прораба
    photoReport: true, dailyReport: true, myObjects: true,
  },
  supply: {
    bot: 'team',
    finance: false, financeDelete: false, objects: false, objectsEdit: false,
    objectsView: true, stages: false, stagesEdit: false,
    reports: false, chatgpt: true, diary: false,
    tasks: true, tasksManage: false,
    config: false, gallery: false, compare: false,
    settings: false, users: false,
    // Специфичные для снабженца
    purchases: true, purchaseRequests: true,
  },
  worker: {
    bot: 'team',
    finance: false, financeDelete: false, objects: false, objectsEdit: false,
    objectsView: false, stages: false, stagesEdit: false,
    reports: false, chatgpt: false, diary: false,
    tasks: true, tasksManage: false,
    config: false, gallery: false, compare: false,
    settings: false, users: false,
  },
};

// Какие роли в каком боте
const ADMIN_BOT_ROLES = ['admin', 'partner'];
const TEAM_BOT_ROLES = ['foreman', 'supply', 'worker'];

function parseUsers() {
  const str = process.env.USERS || `${process.env.ADMIN_CHAT_ID}:admin`;
  const users = {};
  str.split(',').forEach((e) => {
    const [id, role] = e.trim().split(':');
    if (id && role) users[Number(id)] = role.trim();
  });
  return users;
}

let cache = null;
function getUsers() { if (!cache) cache = parseUsers(); return cache; }
function getUserRole(chatId) { return getUsers()[chatId] || null; }
function hasAccess(chatId, perm) {
  const r = getUserRole(chatId);
  return r && ROLES[r] ? !!ROLES[r][perm] : false;
}
function isAuthorized(chatId) { return !!getUserRole(chatId); }
function isAdminBotUser(chatId) {
  const r = getUserRole(chatId);
  return r && ADMIN_BOT_ROLES.includes(r);
}
function isTeamBotUser(chatId) {
  const r = getUserRole(chatId);
  return r && TEAM_BOT_ROLES.includes(r);
}
function reloadUsers() { cache = null; }

module.exports = {
  getUserRole, hasAccess, isAuthorized,
  isAdminBotUser, isTeamBotUser,
  reloadUsers, ROLES,
  ADMIN_BOT_ROLES, TEAM_BOT_ROLES,
};
