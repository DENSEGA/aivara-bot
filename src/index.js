require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const { isAuthorized, hasAccess, getUserRole } = require('./services/roles');
const { setupFinanceModule, handleCallback: finCb, handleMessage: finMsg, handleConfirm: finConfirm } = require('./modules/finance');
const { setupChatGPTModule, handleMessage: gptMsg, handleVoice: gptVoice } = require('./modules/chatgpt');
const { setupDiaryModule, handleCallback: diaryCb, handleMessage: diaryMsg } = require('./modules/diary');
const { setupTasksModule, handleCallback: taskCb, handleMessage: taskMsg } = require('./modules/tasks');
const { setupConfigModule, handleCallback: cfgCb, handleMessage: cfgMsg } = require('./modules/config');
const { setupReminders } = require('./services/reminders');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.use(session());
bot.use((ctx, next) => { if (!ctx.session) ctx.session = { mode: null, finance: {}, diary: {}, tasks: {}, config: {} }; return next(); });
bot.use((ctx, next) => { if (!ctx.from) return next(); if (!isAuthorized(ctx.from.id)) return ctx.reply('⛔ Нет доступа.'); return next(); });

function getMainMenu(chatId) {
  const rows = [];
  if (hasAccess(chatId, 'finance')) {
    rows.push(['💰 Финансы', '🏠 Смета']);
    rows.push(['🤖 ChatGPT', '📓 Дневник']);
  } else if (hasAccess(chatId, 'chatgpt')) {
    rows.push(['🤖 ChatGPT']);
  }
  if (hasAccess(chatId, 'tasks')) rows.push(['👥 Задачи']);
  if (hasAccess(chatId, 'settings')) rows.push(['⚙️ Настройки', '🔄 Меню']);
  else rows.push(['🔄 Меню']);
  return Markup.keyboard(rows).resize();
}

const WELCOME = (name, role) => {
  const rn = { admin: '👑 Администратор', partner: '🤝 Партнёр', worker: '👷 Сотрудник' };
  return `🌟 *AIVARA Bot v3.3*\n\nПривет, ${name}!\nРоль: ${rn[role]||role}\n\n` +
    `💰 *Финансы* — расходы и отчёты\n🏠 *Смета* — конфигуратор + PDF\n🤖 *ChatGPT* — AI (текст + голос)\n📓 *Дневник* — записи + напоминания\n👥 *Задачи* — команда\n\nВыбери модуль 👇`;
};

bot.command('start', (ctx) => { ctx.session.mode = null; return ctx.reply(WELCOME(ctx.from.first_name, getUserRole(ctx.from.id)), { parse_mode: 'Markdown', ...getMainMenu(ctx.from.id) }); });
bot.hears('🔄 Меню', (ctx) => { ctx.session.mode = null; return ctx.reply('Выбери модуль 👇', getMainMenu(ctx.from.id)); });

setupFinanceModule(bot);
setupChatGPTModule(bot);
setupDiaryModule(bot);
setupTasksModule(bot);
setupConfigModule(bot);

bot.hears('⚙️ Настройки', (ctx) => {
  if (!hasAccess(ctx.from.id, 'settings')) return ctx.reply('⛔ Нет доступа.');
  return ctx.reply('⚙️ *Настройки*\n\nПользователи: переменная USERS на Railway.', { parse_mode: 'Markdown' });
});

bot.on('voice', async (ctx) => {
  if (ctx.session?.mode === 'chatgpt') return gptVoice(ctx);
  try {
    const { downloadFile, transcribeVoice } = require('./services/openai');
    const fl = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    await ctx.reply('🎤 Распознаю...'); const buf = await downloadFile(fl.href); const text = await transcribeVoice(buf);
    if (!text) return ctx.reply('❌ Не распознал.');
    await ctx.reply(`💬 _"${text}"_`, { parse_mode: 'Markdown' });
    ctx.message.text = text; return handleTextMessage(ctx);
  } catch(e) { return ctx.reply('❌ Ошибка голоса.'); }
});

bot.on('callback_query', async (ctx) => {
  const d = ctx.callbackQuery.data;
  if (d.startsWith('fin_confirm_')) return finConfirm(ctx);
  if (d.startsWith('fin_')) return finCb(ctx);
  if (d.startsWith('diary_')) return diaryCb(ctx);
  if (d.startsWith('task_')) return taskCb(ctx);
  if (d.startsWith('cfg_')) return cfgCb(ctx);
});

function handleTextMessage(ctx) {
  const m = ctx.session?.mode;
  if (m === 'chatgpt') return gptMsg(ctx);
  if (m === 'diary') return diaryMsg(ctx);
  if (m === 'finance') return finMsg(ctx);
  if (m === 'tasks') return taskMsg(ctx);
  if (m === 'config') return cfgMsg(ctx);
  return ctx.reply('Выбери модуль 👇', getMainMenu(ctx.from.id));
}

bot.on('text', handleTextMessage);

bot.launch().then(() => { console.log('✅ AIVARA Bot v3.3 запущен!'); setupReminders(bot); }).catch((e) => console.error('❌', e));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
