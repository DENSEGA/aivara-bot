/**
 * Система ролей и прав доступа
 * admin    — полный доступ ко всему
 * partner  — финансы (ввод, отчёты), объекты, дневник, ChatGPT
 * worker   — только свои задачи
 */

const ROLES = {
  admin: {
    finance: true, financeDelete: true,
    objects: true, objectsEdit: true,
    reports: true,
    chatgpt: true,
    diary: true,
    tasks: true, tasksManage: true,
    settings: true,
    users: true,
  },
  partner: {
    finance: true, financeDelete: false,
    objects: true, objectsEdit: false,
    reports: true,
    chatgpt: true,
    diary: true,
    tasks: true, tasksManage: false,
    settings: false,
    users: false,
  },
  worker: {
    finance: false, financeDelete: false,
    objects: false, objectsEdit: false,
    reports: false,
    chatgpt: false,
    diary: false,
    tasks: true, tasksManage: false,
    settings: false,
    users: false,
  },
};

function parseUsers() {
  const usersStr = process.env.USERS || `${process.env.ADMIN_CHAT_ID}:admin`;
  const users = {};
  usersStr.split(',').forEach((entry) => {
    const [id, role] = entry.trim().split(':');
    if (id && role) {
      users[Number(id)] = role.trim();
    }
  });
  return users;
}

let usersCache = null;

function getUsers() {
  if (!usersCache) usersCache = parseUsers();
  return usersCache;
}

function getUserRole(chatId) {
  const users = getUsers();
  return users[chatId] || null;
}

function hasAccess(chatId, permission) {
  const role = getUserRole(chatId);
  if (!role) return false;
  const perms = ROLES[role];
  return perms ? !!perms[permission] : false;
}

function isAuthorized(chatId) {
  return !!getUserRole(chatId);
}

function reloadUsers() {
  usersCache = null;
}

module.exports = { getUserRole, hasAccess, isAuthorized, reloadUsers, ROLES };
