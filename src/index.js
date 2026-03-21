require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const { isAuthorized, hasAccess, getUserRole, isAdminBotUser, isTeamBotUser } = require('./services/roles');
const { setBots } = require('./services/notify');
const { setupReminders } = require('./services/reminders');

// ============================================================
// ADMIN BOT — модули
// ============================================================
const { setupFinanceModule, handleCallback: finCb, handleMessage: finMsg, handleConfirm: finConfirm } = require('./admin/finance');
const { setupChatGPTModule, handleMessage: gptMsg, handleVoice: gptVoice } = require('./admin/chatgpt');
const { setupDiaryModule, handleCallback: diaryCb, handleMessage: diaryMsg } = require('./admin/diary');
const { setupTasksModule, handleCallback: taskCb, handleMessage: taskMsg } = require('./admin/tasks');
const { setupConfigModule, handleCallback: cfgCb, handleMessage: cfgMsg } = require('./admin/config');
const { setupObjectsModule, handleCallback: objCb, handleMessage: objMsg } = require('./admin/objects');

// ============================================================
// ADMIN BOT — создание и настройка
// ============================================================
const adminBot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

adminBot.use(session());
adminBot.use((ctx, next) => {
  if (!ctx.session) ctx.session = { mode: null, finance: {}, diary: {}, tasks: {}, config: {}, objects: {} };
  return next();
});
adminBot.use((ctx, next) => {
  if (!ctx.from) return next();
  if (!isAuthorized(ctx.from.id)) return ctx.reply('⛔ Нет доступа. Обратитесь к администратору.');
  if (!isAdminBotUser(ctx.from.id)) return ctx.reply('⛔ Этот бот для администраторов.\nИспользуйте @aivara_team_bot');
  return next();
});

function getAdminMenu(chatId) {
  const rows = [];
  if (hasAccess(chatId, 'finance')) {
    rows.push(['💰 Финансы', '🏠 Смета']);
    rows.push(['📋 Объекты', '🤖 ChatGPT']);
    rows.push(['📓 Дневник', '👥 Задачи']);
  } else if (hasAccess(chatId, 'chatgpt')) {
    rows.push(['🤖 ChatGPT']);
  }
  if (hasAccess(chatId, 'settings')) rows.push(['⚙️ Настройки', '🔄 Меню']);
  else rows.push(['🔄 Меню']);
  return Markup.keyboard(rows).resize();
}

const ADMIN_WELCOME = (name, role) => {
  const rn = {
    admin: '👑 Администратор',
    partner: '🤝 Партнёр',
  };
  return `🌟 *AIVARA Bot v4.0*\n\nПривет, ${name}!\nРоль: ${rn[role] || role}\n\n` +
    `💰 *Финансы* — расходы и отчёты\n` +
    `🏠 *Смета* — конфигуратор + PDF + рендеры\n` +
    `📋 *Объекты* — карточки + этапы + прогресс\n` +
    `🤖 *ChatGPT* — AI (текст + голос + картинки)\n` +
    `📓 *Дневник* — записи + напоминания\n` +
    `👥 *Задачи* — управление командой\n\nВыбери модуль 👇`;
};

adminBot.command('start', (ctx) => {
  ctx.session.mode = null;
  return ctx.reply(ADMIN_WELCOME(ctx.from.first_name, getUserRole(ctx.from.id)), {
    parse_mode: 'Markdown', ...getAdminMenu(ctx.from.id),
  });
});

adminBot.hears('🔄 Меню', (ctx) => {
  ctx.session.mode = null;
  return ctx.reply('Выбери модуль 👇', getAdminMenu(ctx.from.id));
});

// Модули Admin-бота
setupFinanceModule(adminBot);
setupChatGPTModule(adminBot);
setupDiaryModule(adminBot);
setupTasksModule(adminBot);
setupConfigModule(adminBot);
setupObjectsModule(adminBot);

adminBot.hears('⚙️ Настройки', (ctx) => {
  if (!hasAccess(ctx.from.id, 'settings')) return ctx.reply('⛔ Нет доступа.');
  return ctx.reply('⚙️ *Настройки*\n\nПользователи: переменная USERS на Railway.\n\nФормат: `chatId:role`\nРоли: admin, partner, foreman, supply, worker', { parse_mode: 'Markdown' });
});

// Голосовой ввод
adminBot.on('voice', async (ctx) => {
  if (ctx.session?.mode === 'chatgpt') return gptVoice(ctx);
  try {
    const { downloadFile, transcribeVoice } = require('./services/openai');
    const fl = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    await ctx.reply('🎤 Распознаю...');
    const buf = await downloadFile(fl.href);
    const text = await transcribeVoice(buf);
    if (!text) return ctx.reply('❌ Не распознал.');
    await ctx.reply(`💬 _"${text}"_`, { parse_mode: 'Markdown' });
    ctx.message.text = text;
    return handleAdminText(ctx);
  } catch (e) { return ctx.reply('❌ Ошибка голоса.'); }
});

// Callback handler — роутинг по префиксам
adminBot.on('callback_query', async (ctx) => {
  const d = ctx.callbackQuery.data;
  if (d.startsWith('fin_confirm_')) return finConfirm(ctx);
  if (d.startsWith('fin_')) return finCb(ctx);
  if (d.startsWith('diary_')) return diaryCb(ctx);
  if (d.startsWith('task_')) return taskCb(ctx);
  if (d.startsWith('cfg_')) return cfgCb(ctx);
  if (d.startsWith('obj_')) return objCb(ctx);
});

function handleAdminText(ctx) {
  const m = ctx.session?.mode;
  if (m === 'chatgpt') return gptMsg(ctx);
  if (m === 'diary') return diaryMsg(ctx);
  if (m === 'finance') return finMsg(ctx);
  if (m === 'tasks') return taskMsg(ctx);
  if (m === 'config') return cfgMsg(ctx);
  if (m === 'objects') return objMsg(ctx);
  return ctx.reply('Выбери модуль 👇', getAdminMenu(ctx.from.id));
}

adminBot.on('text', handleAdminText);

// ============================================================
// TEAM BOT — заглушка (делаем позже)
// ============================================================
let teamBot = null;

if (process.env.TELEGRAM_TEAM_BOT_TOKEN) {
  teamBot = new Telegraf(process.env.TELEGRAM_TEAM_BOT_TOKEN);

  teamBot.use(session());
  teamBot.use((ctx, next) => {
    if (!ctx.session) ctx.session = { mode: null };
    return next();
  });
  teamBot.use((ctx, next) => {
    if (!ctx.from) return next();
    if (!isAuthorized(ctx.from.id)) return ctx.reply('⛔ Нет доступа. Обратитесь к администратору.');
    if (!isTeamBotUser(ctx.from.id)) return ctx.reply('⛔ Этот бот для команды.\nИспользуйте @aivaradens_bot');
    return next();
  });

  const TEAM_WELCOME = (name, role) => {
    const rn = { foreman: '👷 Прораб', supply: '📦 Снабженец', worker: '🔧 Рабочий' };
    return `🌟 *AIVARA Team v4.0*\n\nПривет, ${name}!\nРоль: ${rn[role] || role}\n\n⚠️ _Модули Team-бота в разработке._\nСкоро: объекты, фото-отчёты, заявки на материал.`;
  };

  teamBot.command('start', (ctx) => {
    return ctx.reply(TEAM_WELCOME(ctx.from.first_name, getUserRole(ctx.from.id)), { parse_mode: 'Markdown' });
  });

  teamBot.on('text', (ctx) => {
    return ctx.reply('⚠️ Team-бот в разработке. Скоро будут доступны модули для прорабов, снабженцев и рабочих.');
  });
}

// ============================================================
// ЗАПУСК
// ============================================================
async function start() {
  // Регистрируем боты для кросс-уведомлений
  setBots(adminBot, teamBot);

  // Запуск Admin-бота
  await adminBot.launch();
  console.log('✅ AIVARA Admin Bot v4.0 запущен! (@aivaradens_bot)');

  // Запуск Team-бота (если токен есть)
  if (teamBot) {
    await teamBot.launch();
    console.log('✅ AIVARA Team Bot v4.0 запущен! (@aivara_team_bot)');
  } else {
    console.log('ℹ️ Team-бот не запущен (TELEGRAM_TEAM_BOT_TOKEN не задан)');
  }

  // Запуск планировщика напоминаний
  setupReminders(adminBot);
}

start().catch((e) => {
  console.error('❌ Ошибка запуска:', e);
  process.exit(1);
});

process.once('SIGINT', () => {
  adminBot.stop('SIGINT');
  if (teamBot) teamBot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  adminBot.stop('SIGTERM');
  if (teamBot) teamBot.stop('SIGTERM');
});
