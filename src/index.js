require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const { isAuthorized, hasAccess, getUserRole } = require('./services/roles');
const { setupFinanceModule, handleCallback: finCb, handleMessage: finMsg, handleConfirm: finConfirm } = require('./modules/finance');
const { setupChatGPTModule, handleMessage: gptMsg, handleVoice: gptVoice } = require('./modules/chatgpt');
const { setupDiaryModule, handleCallback: diaryCb, handleMessage: diaryMsg } = require('./modules/diary');
const { setupTasksModule, handleCallback: taskCb, handleMessage: taskMsg } = require('./modules/tasks');
const { setupReminders } = require('./services/reminders');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Сессия
bot.use(session());
bot.use((ctx, next) => {
  if (!ctx.session) ctx.session = { mode: null, finance: {}, diary: {}, tasks: {} };
  return next();
});

// Проверка доступа
bot.use((ctx, next) => {
  if (!ctx.from) return next();
  if (!isAuthorized(ctx.from.id)) {
    return ctx.reply('⛔ Нет доступа. Обратись к администратору.');
  }
  return next();
});

// === ГЛАВНОЕ МЕНЮ ===
function getMainMenu(chatId) {
  const role = getUserRole(chatId);
  const rows = [];

  if (hasAccess(chatId, 'finance')) {
    rows.push(['💰 Финансы', '🤖 ChatGPT']);
  } else {
    rows.push(['🤖 ChatGPT']);
  }

  if (hasAccess(chatId, 'diary')) {
    rows.push(['📓 Дневник', '👥 Задачи']);
  } else if (hasAccess(chatId, 'tasks')) {
    rows.push(['👥 Задачи']);
  }

  if (hasAccess(chatId, 'settings')) {
    rows.push(['⚙️ Настройки', '🏠 Меню']);
  } else {
    rows.push(['🏠 Меню']);
  }

  return Markup.keyboard(rows).resize();
}

const WELCOME = (name, role) => {
  const roleNames = { admin: '👑 Администратор', partner: '🤝 Партнёр', worker: '👷 Сотрудник' };
  return `🌟 *AIVARA Bot v2.0*\n\n` +
    `Привет, ${name}!\n` +
    `Роль: ${roleNames[role] || role}\n\n` +
    `💰 *Финансы* — расходы и отчёты\n` +
    `🤖 *ChatGPT* — AI-ассистент (текст + голос)\n` +
    `📓 *Дневник* — записи и напоминания\n` +
    `👥 *Задачи* — управление командой\n\n` +
    `Выбери модуль 👇`;
};

bot.command('start', (ctx) => {
  ctx.session.mode = null;
  const role = getUserRole(ctx.from.id);
  return ctx.reply(WELCOME(ctx.from.first_name, role), {
    parse_mode: 'Markdown',
    ...getMainMenu(ctx.from.id),
  });
});

bot.hears('🏠 Меню', (ctx) => {
  ctx.session.mode = null;
  return ctx.reply('Выбери модуль 👇', getMainMenu(ctx.from.id));
});

// === ПОДКЛЮЧЕНИЕ МОДУЛЕЙ ===
setupFinanceModule(bot);
setupChatGPTModule(bot);
setupDiaryModule(bot);
setupTasksModule(bot);

// Контент — заглушка
bot.hears('📋 Контент', (ctx) => {
  ctx.session.mode = 'content';
  return ctx.reply('🚧 Модуль контент-плана — в разработке.');
});

// Настройки — заглушка
bot.hears('⚙️ Настройки', (ctx) => {
  if (!hasAccess(ctx.from.id, 'settings')) return ctx.reply('⛔ Нет доступа.');
  return ctx.reply(
    '⚙️ *Настройки*\n\n' +
    'Управление пользователями и настройки бота — в разработке.\n\n' +
    'Текущие пользователи задаются через переменную `USERS` на Railway.',
    { parse_mode: 'Markdown' }
  );
});

// === ГОЛОСОВЫЕ СООБЩЕНИЯ ===
bot.on('voice', async (ctx) => {
  const mode = ctx.session?.mode;

  // В режиме ChatGPT — отправляем в GPT
  if (mode === 'chatgpt') {
    return gptVoice(ctx);
  }

  // В других режимах — распознаём и обрабатываем как текст
  try {
    const { downloadFile, transcribeVoice } = require('./services/openai');
    const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    await ctx.reply('🎤 Распознаю...');
    const buffer = await downloadFile(fileLink.href);
    const text = await transcribeVoice(buffer);
    if (!text) return ctx.reply('❌ Не удалось распознать.');
    await ctx.reply(`💬 _"${text}"_`, { parse_mode: 'Markdown' });
    // Создаём фейковый текстовый message для обработки
    ctx.message.text = text;
    return handleTextMessage(ctx);
  } catch (err) {
    console.error('Voice ошибка:', err.message);
    return ctx.reply('❌ Ошибка распознавания голоса.');
  }
});

// === CALLBACK КНОПКИ ===
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data.startsWith('fin_confirm_')) return finConfirm(ctx);
  if (data.startsWith('fin_')) return finCb(ctx);
  if (data.startsWith('diary_')) return diaryCb(ctx);
  if (data.startsWith('task_')) return taskCb(ctx);
});

// === ТЕКСТОВЫЕ СООБЩЕНИЯ ===
function handleTextMessage(ctx) {
  const mode = ctx.session?.mode;
  if (mode === 'chatgpt') return gptMsg(ctx);
  if (mode === 'diary') return diaryMsg(ctx);
  if (mode === 'finance') return finMsg(ctx);
  if (mode === 'tasks') return taskMsg(ctx);
  return ctx.reply('Выбери модуль из меню 👇', getMainMenu(ctx.from.id));
}

bot.on('text', handleTextMessage);

// === ЗАПУСК ===
bot.launch()
  .then(() => {
    console.log('✅ AIVARA Bot v2.0 запущен!');
    setupReminders(bot);
  })
  .catch((err) => console.error('❌ Ошибка:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
