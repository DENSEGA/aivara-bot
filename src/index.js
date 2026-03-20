require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');

const { setupFinanceModule } = require('./modules/finance');
const { setupChatGPTModule } = require('./modules/chatgpt');
const { setupDiaryModule } = require('./modules/diary');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Сессия для хранения состояния пользователя
bot.use(session());

// Middleware: инициализация сессии
bot.use((ctx, next) => {
  if (!ctx.session) {
    ctx.session = { mode: null, finance: {}, diary: {} };
  }
  return next();
});

// Проверка доступа — только админ
const ADMIN_ID = Number(process.env.ADMIN_CHAT_ID);

bot.use((ctx, next) => {
  if (ctx.from && ctx.from.id !== ADMIN_ID) {
    return ctx.reply('⛔ Бот доступен только владельцу.');
  }
  return next();
});

// === ГЛАВНОЕ МЕНЮ ===
const mainMenu = Markup.keyboard([
  ['💰 Финансы', '🤖 ChatGPT'],
  ['📓 Дневник', '📋 Контент'],
  ['🏠 Главное меню']
]).resize();

bot.command('start', (ctx) => {
  ctx.session.mode = null;
  return ctx.reply(
    '🌟 *AIVARA Bot*\n\nПривет, Денис! Выбери модуль:',
    { parse_mode: 'Markdown', ...mainMenu }
  );
});

bot.hears('🏠 Главное меню', (ctx) => {
  ctx.session.mode = null;
  return ctx.reply('Выбери модуль:', mainMenu);
});

// === ПОДКЛЮЧЕНИЕ МОДУЛЕЙ ===
setupFinanceModule(bot, mainMenu);
setupChatGPTModule(bot, mainMenu);
setupDiaryModule(bot, mainMenu);

// Контент-план — заглушка
bot.hears('📋 Контент', (ctx) => {
  ctx.session.mode = 'content';
  return ctx.reply('🚧 Модуль контент-плана AIVARA — в разработке.');
});

// Обработка текста в зависимости от активного режима
bot.on('text', (ctx) => {
  const mode = ctx.session?.mode;

  if (mode === 'chatgpt') {
    return require('./modules/chatgpt').handleMessage(ctx);
  }
  if (mode === 'diary') {
    return require('./modules/diary').handleMessage(ctx);
  }
  if (mode === 'finance') {
    return require('./modules/finance').handleMessage(ctx);
  }

  return ctx.reply('Выбери модуль из меню 👇', mainMenu);
});

// Обработка callback-кнопок
bot.on('callback_query', (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data.startsWith('fin_')) {
    return require('./modules/finance').handleCallback(ctx);
  }
  if (data.startsWith('diary_')) {
    return require('./modules/diary').handleCallback(ctx);
  }
});

// === ЗАПУСК ===
bot.launch()
  .then(() => console.log('✅ AIVARA Bot запущен!'))
  .catch((err) => console.error('❌ Ошибка запуска:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
