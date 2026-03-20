const ROLES = {
  admin: { finance: true, financeDelete: true, objects: true, objectsEdit: true, reports: true, chatgpt: true, diary: true, tasks: true, tasksManage: true, settings: true, users: true, config: true },
  partner: { finance: true, financeDelete: false, objects: true, objectsEdit: false, reports: true, chatgpt: true, diary: true, tasks: true, tasksManage: false, settings: false, users: false, config: true },
  worker: { finance: false, financeDelete: false, objects: false, objectsEdit: false, reports: false, chatgpt: false, diary: false, tasks: true, tasksManage: false, settings: false, users: false, config: false },
};

function parseUsers() {
  const str = process.env.USERS || `${process.env.ADMIN_CHAT_ID}:admin`;
  const users = {};
  str.split(',').forEach((e) => { const [id, role] = e.trim().split(':'); if (id && role) users[Number(id)] = role.trim(); });
  return users;
}

let cache = null;
function getUsers() { if (!cache) cache = parseUsers(); return cache; }
function getUserRole(chatId) { return getUsers()[chatId] || null; }
function hasAccess(chatId, perm) { const r = getUserRole(chatId); return r && ROLES[r] ? !!ROLES[r][perm] : false; }
function isAuthorized(chatId) { return !!getUserRole(chatId); }
function reloadUsers() { cache = null; }

module.exports = { getUserRole, hasAccess, isAuthorized, reloadUsers, ROLES };
