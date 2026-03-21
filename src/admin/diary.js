const { Markup } = require('telegraf');
const { addDiaryEntry, getLastDiaryEntries } = require('../../services/sheets');

function setupDiaryModule(bot) {
  bot.hears('📓 Дневник', (ctx) => {
    ctx.session.mode = 'diary'; ctx.session.diary = { step: 'menu' };
    return ctx.reply('📓 *Дневник и напоминания*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('✏️ Новая запись', 'diary_new')], [Markup.button.callback('⏰ С напоминанием', 'diary_reminder')], [Markup.button.callback('📖 Последние', 'diary_last')]]) });
  });
}

async function handleCallback(ctx) {
  const data = ctx.callbackQuery.data; await ctx.answerCbQuery();
  if (data === 'diary_new') { ctx.session.diary = { step: 'writing' }; return ctx.reply('✏️ Пиши запись:'); }
  if (data === 'diary_reminder') { ctx.session.diary = { step: 'reminder_text' }; return ctx.reply('✏️ Текст напоминания:'); }
  if (data === 'diary_last') {
    try {
      const entries = await getLastDiaryEntries(7);
      if (!entries.length) return ctx.reply('📓 Пусто.');
      const text = entries.reverse().map(({ date, time, entry, reminder }) => {
        let l = `📅 *${date}* ${time}\n${entry}`; if (reminder) l += `\n⏰ ${reminder}`; return l;
      }).join('\n\n───────────\n\n');
      return ctx.reply(`📖 *Последние:*\n\n${text}`, { parse_mode: 'Markdown' }).catch(() => ctx.reply(text));
    } catch(e) { return ctx.reply('❌ Ошибка.'); }
  }
}

async function handleMessage(ctx) {
  const d = ctx.session.diary; if (!d) return;
  if (d.step === 'writing') {
    try { const { date, time } = await addDiaryEntry(ctx.message.text); ctx.session.diary = { step: 'menu' };
      return ctx.reply(`✅ *Сохранено*\n📅 ${date} ${time}`, { parse_mode: 'Markdown' }); } catch(e) { return ctx.reply('❌ Ошибка.'); }
  }
  if (d.step === 'reminder_text') { d.reminderText = ctx.message.text; d.step = 'reminder_time';
    return ctx.reply('⏰ Когда? Формат: `21.03.2026 09:00` или `завтра 9:00`', { parse_mode: 'Markdown' }); }
  if (d.step === 'reminder_time') {
    const rt = parseReminderTime(ctx.message.text.trim());
    try { await addDiaryEntry(d.reminderText, rt || ctx.message.text.trim()); ctx.session.diary = { step: 'menu' };
      return ctx.reply(`✅ *Напоминание*\n📝 ${d.reminderText}\n⏰ ${rt || ctx.message.text.trim()}`, { parse_mode: 'Markdown' }); }
    catch(e) { return ctx.reply('❌ Ошибка.'); }
  }
}

function parseReminderTime(text) {
  const now = new Date();
  let m = text.match(/завтра\s+(\d{1,2}):(\d{2})/i);
  if (m) { const d = new Date(now); d.setDate(d.getDate()+1); d.setHours(parseInt(m[1]),parseInt(m[2]),0,0); return d.toISOString(); }
  m = text.match(/через\s+(\d+)\s+час/i); if (m) return new Date(now.getTime()+parseInt(m[1])*3600000).toISOString();
  m = text.match(/через\s+(\d+)\s+мин/i); if (m) return new Date(now.getTime()+parseInt(m[1])*60000).toISOString();
  m = text.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m) return new Date(parseInt(m[3]),parseInt(m[2])-1,parseInt(m[1]),parseInt(m[4]),parseInt(m[5])).toISOString();
  return null;
}

module.exports = { setupDiaryModule, handleCallback, handleMessage };
