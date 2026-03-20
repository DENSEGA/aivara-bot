const { Markup } = require('telegraf');
const { addDiaryEntry, getLastDiaryEntries } = require('../services/sheets');

function setupDiaryModule(bot) {
  bot.hears('📓 Дневник', (ctx) => {
    ctx.session.mode = 'diary';
    ctx.session.diary = { step: 'menu' };
    return ctx.reply('📓 *Дневник и напоминания*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✏️ Новая запись', 'diary_new')],
        [Markup.button.callback('⏰ Запись с напоминанием', 'diary_reminder')],
        [Markup.button.callback('📖 Последние записи', 'diary_last')],
      ]),
    });
  });
}

async function handleCallback(ctx) {
  const data = ctx.callbackQuery.data;
  await ctx.answerCbQuery();

  if (data === 'diary_new') {
    ctx.session.diary = { step: 'writing' };
    return ctx.reply('✏️ Пиши запись:');
  }

  if (data === 'diary_reminder') {
    ctx.session.diary = { step: 'reminder_text' };
    return ctx.reply('✏️ Напиши текст напоминания:');
  }

  if (data === 'diary_last') {
    try {
      const entries = await getLastDiaryEntries(7);
      if (!entries.length) return ctx.reply('📓 Дневник пуст.');

      const text = entries.reverse().map(({ date, time, entry, reminder }) => {
        let line = `📅 *${date}* ${time}\n${entry}`;
        if (reminder) line += `\n⏰ Напоминание: ${reminder}`;
        return line;
      }).join('\n\n───────────\n\n');

      return ctx.reply(`📖 *Последние записи:*\n\n${text}`, { parse_mode: 'Markdown' }).catch(() => ctx.reply(text));
    } catch (err) {
      console.error('Ошибка дневника:', err.message);
      return ctx.reply('❌ Не удалось загрузить записи.');
    }
  }
}

async function handleMessage(ctx) {
  const diary = ctx.session.diary;
  if (!diary) return;

  // Простая запись
  if (diary.step === 'writing') {
    try {
      const { date, time } = await addDiaryEntry(ctx.message.text);
      ctx.session.diary = { step: 'menu' };
      const preview = ctx.message.text.length > 200 ? ctx.message.text.substring(0, 200) + '...' : ctx.message.text;
      return ctx.reply(`✅ *Сохранено*\n📅 ${date} ${time}\n\n${preview}`, { parse_mode: 'Markdown' });
    } catch (err) {
      return ctx.reply('❌ Ошибка сохранения.');
    }
  }

  // Напоминание — текст
  if (diary.step === 'reminder_text') {
    diary.reminderText = ctx.message.text;
    diary.step = 'reminder_time';
    return ctx.reply(
      '⏰ Когда напомнить?\n\nФормат: `ДД.ММ.ГГГГ ЧЧ:ММ`\nПример: `21.03.2026 09:00`\n\nИли напиши: `завтра 9:00`, `через 2 часа`',
      { parse_mode: 'Markdown' }
    );
  }

  // Напоминание — время
  if (diary.step === 'reminder_time') {
    const timeText = ctx.message.text.trim();
    const reminderTime = parseReminderTime(timeText);

    try {
      await addDiaryEntry(diary.reminderText, reminderTime || timeText);
      ctx.session.diary = { step: 'menu' };
      return ctx.reply(
        `✅ *Напоминание сохранено*\n\n📝 ${diary.reminderText}\n⏰ ${reminderTime || timeText}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      return ctx.reply('❌ Ошибка сохранения напоминания.');
    }
  }
}

function parseReminderTime(text) {
  const now = new Date();

  // "завтра 9:00"
  const tomorrowMatch = text.match(/завтра\s+(\d{1,2}):(\d{2})/i);
  if (tomorrowMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(parseInt(tomorrowMatch[1]), parseInt(tomorrowMatch[2]), 0, 0);
    return d.toISOString();
  }

  // "через N часов"
  const hoursMatch = text.match(/через\s+(\d+)\s+час/i);
  if (hoursMatch) {
    const d = new Date(now.getTime() + parseInt(hoursMatch[1]) * 3600000);
    return d.toISOString();
  }

  // "через N минут"
  const minMatch = text.match(/через\s+(\d+)\s+мин/i);
  if (minMatch) {
    const d = new Date(now.getTime() + parseInt(minMatch[1]) * 60000);
    return d.toISOString();
  }

  // "ДД.ММ.ГГГГ ЧЧ:ММ"
  const dateMatch = text.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (dateMatch) {
    const d = new Date(
      parseInt(dateMatch[3]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[1]),
      parseInt(dateMatch[4]), parseInt(dateMatch[5])
    );
    return d.toISOString();
  }

  return null;
}

module.exports = { setupDiaryModule, handleCallback, handleMessage };
