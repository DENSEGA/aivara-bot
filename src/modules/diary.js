const { Markup } = require('telegraf');
const { addDiaryEntry, getLastDiaryEntries } = require('../services/sheets');

function setupDiaryModule(bot, mainMenu) {
  bot.hears('📓 Дневник', (ctx) => {
    ctx.session.mode = 'diary';
    ctx.session.diary = { step: 'menu' };

    return ctx.reply(
      '📓 *Дневник*\n\nВыбери действие:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✏️ Новая запись', 'diary_new')],
          [Markup.button.callback('📖 Последние записи', 'diary_last')],
        ]),
      }
    );
  });
}

async function handleCallback(ctx) {
  const data = ctx.callbackQuery.data;
  await ctx.answerCbQuery();

  if (data === 'diary_new') {
    ctx.session.diary = { step: 'writing' };
    return ctx.reply('✏️ Пиши свою запись — я сохраню её в дневник:');
  }

  if (data === 'diary_last') {
    try {
      const entries = await getLastDiaryEntries(5);

      if (entries.length === 0) {
        return ctx.reply('📓 Дневник пока пуст.');
      }

      const text = entries
        .reverse()
        .map(({ date, time, entry }) => `📅 *${date}* ${time}\n${entry}`)
        .join('\n\n───────────\n\n');

      return ctx.reply(`📖 *Последние записи:*\n\n${text}`, { parse_mode: 'Markdown' }).catch(() =>
        ctx.reply(`📖 Последние записи:\n\n${text}`)
      );
    } catch (err) {
      console.error('Ошибка чтения дневника:', err.message);
      return ctx.reply('❌ Не удалось загрузить записи.');
    }
  }
}

async function handleMessage(ctx) {
  const diary = ctx.session.diary;
  if (!diary || diary.step !== 'writing') return;

  const entry = ctx.message.text;

  try {
    const { date, time } = await addDiaryEntry(entry);
    ctx.session.diary = { step: 'menu' };

    const preview = entry.length > 200 ? entry.substring(0, 200) + '...' : entry;

    return ctx.reply(
      `✅ *Запись сохранена*\n📅 ${date} ${time}\n\n${preview}`,
      { parse_mode: 'Markdown' }
    ).catch(() => ctx.reply(`✅ Запись сохранена — ${date} ${time}`));
  } catch (err) {
    console.error('Ошибка записи в дневник:', err.message);
    return ctx.reply('❌ Не удалось сохранить запись.');
  }
}

module.exports = { setupDiaryModule, handleCallback, handleMessage };
