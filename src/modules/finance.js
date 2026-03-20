const { Markup } = require('telegraf');
const { getObjects, getCategories, addExpense, getMonthTotal, getAllTotals } = require('../services/sheets');

function setupFinanceModule(bot, mainMenu) {
  bot.hears('💰 Финансы', async (ctx) => {
    ctx.session.mode = 'finance';
    ctx.session.finance = { step: 'menu' };

    return ctx.reply(
      '💰 *Финансы — ЭкоКаркас*\n\nВыбери действие:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('➕ Добавить расход', 'fin_add')],
          [Markup.button.callback('📊 Итоги по объекту', 'fin_totals')],
          [Markup.button.callback('📊 Все объекты за месяц', 'fin_all_totals')],
          [Markup.button.callback('📋 Список объектов', 'fin_objects')],
        ]),
      }
    );
  });
}

async function handleCallback(ctx) {
  const data = ctx.callbackQuery.data;
  await ctx.answerCbQuery();

  // === ДОБАВИТЬ РАСХОД — шаг 1: выбор объекта ===
  if (data === 'fin_add') {
    try {
      const objects = await getObjects();
      if (objects.length === 0) {
        return ctx.reply('❌ Объекты не найдены. Проверь лист "objects".');
      }

      ctx.session.finance = { step: 'select_object', objects };

      const buttons = objects.map((obj) =>
        [Markup.button.callback(obj.name, `fin_obj_${obj.index}`)]
      );

      return ctx.reply('🏗 Выбери объект:', Markup.inlineKeyboard(buttons));
    } catch (err) {
      console.error('Ошибка загрузки объектов:', err.message);
      return ctx.reply('❌ Не удалось загрузить объекты. Проверь настройки Google Sheets.');
    }
  }

  // === Выбор объекта — шаг 2: категория ===
  if (data.startsWith('fin_obj_')) {
    const objIndex = parseInt(data.replace('fin_obj_', ''), 10);
    const obj = ctx.session.finance.objects?.[objIndex];
    if (!obj) return ctx.reply('❌ Объект не найден, попробуй снова.');

    ctx.session.finance.selectedObject = obj.name;
    ctx.session.finance.step = 'select_category';

    const categories = getCategories();
    ctx.session.finance.categories = categories;

    const buttons = categories.map((cat, i) =>
      [Markup.button.callback(cat, `fin_cat_${i}`)]
    );

    return ctx.reply(
      `📁 Объект: *${obj.name}*\n\nВыбери категорию:`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
    );
  }

  // === Выбор категории — шаг 3: сумма ===
  if (data.startsWith('fin_cat_')) {
    const catIndex = parseInt(data.replace('fin_cat_', ''), 10);
    const cat = ctx.session.finance.categories?.[catIndex];
    if (!cat) return ctx.reply('❌ Категория не найдена.');

    ctx.session.finance.selectedCategory = cat;
    ctx.session.finance.step = 'enter_amount';

    return ctx.reply(
      `🏗 *${ctx.session.finance.selectedObject}*\n📁 ${cat}\n\n💵 Введи сумму (число):`,
      { parse_mode: 'Markdown' }
    );
  }

  // === ИТОГИ ПО ОБЪЕКТУ ===
  if (data === 'fin_totals') {
    try {
      const objects = await getObjects();
      ctx.session.finance = { step: 'totals', objects };

      const buttons = objects.map((obj) =>
        [Markup.button.callback(obj.name, `fin_total_${obj.index}`)]
      );

      return ctx.reply('📊 Выбери объект:', Markup.inlineKeyboard(buttons));
    } catch (err) {
      return ctx.reply('❌ Не удалось загрузить объекты.');
    }
  }

  if (data.startsWith('fin_total_')) {
    const objIndex = parseInt(data.replace('fin_total_', ''), 10);
    const obj = ctx.session.finance.objects?.[objIndex];
    if (!obj) return ctx.reply('❌ Объект не найден.');

    try {
      const total = await getMonthTotal(obj.name);
      const now = new Date();
      const monthName = now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

      return ctx.reply(
        `📊 *${obj.name}*\n📅 ${monthName}\n\n💰 Итого: *${total.toLocaleString('ru-RU')} ₽*`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      return ctx.reply('❌ Не удалось посчитать итоги.');
    }
  }

  // === ВСЕ ОБЪЕКТЫ ЗА МЕСЯЦ ===
  if (data === 'fin_all_totals') {
    try {
      const { totals, grandTotal } = await getAllTotals();
      const now = new Date();
      const monthName = now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

      if (Object.keys(totals).length === 0) {
        return ctx.reply(`📊 За ${monthName} расходов пока нет.`);
      }

      const lines = Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .map(([obj, sum]) => `  ${obj}: ${sum.toLocaleString('ru-RU')} ₽`);

      return ctx.reply(
        `📊 *Расходы за ${monthName}:*\n\n${lines.join('\n')}\n\n💰 *Итого: ${grandTotal.toLocaleString('ru-RU')} ₽*`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      return ctx.reply('❌ Не удалось загрузить итоги.');
    }
  }

  // === СПИСОК ОБЪЕКТОВ ===
  if (data === 'fin_objects') {
    try {
      const objects = await getObjects();
      const list = objects.map((o, i) => `${i + 1}. ${o.name}`).join('\n');
      return ctx.reply(`🏗 *Объекты (${objects.length}):*\n\n${list}`, { parse_mode: 'Markdown' });
    } catch (err) {
      return ctx.reply('❌ Не удалось загрузить объекты.');
    }
  }
}

async function handleMessage(ctx) {
  const finance = ctx.session.finance;
  if (!finance) return;

  // === Ввод суммы ===
  if (finance.step === 'enter_amount') {
    const text = ctx.message.text.replace(/\s/g, '').replace(',', '.');
    const amount = parseFloat(text);

    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Введи корректную сумму (число больше 0):');
    }

    finance.amount = amount;
    finance.step = 'enter_comment';

    return ctx.reply(
      `💵 Сумма: *${amount.toLocaleString('ru-RU')} ₽*\n\n✏️ Комментарий (или «-» чтобы пропустить):`,
      { parse_mode: 'Markdown' }
    );
  }

  // === Комментарий → запись ===
  if (finance.step === 'enter_comment') {
    const comment = ctx.message.text === '-' ? '' : ctx.message.text;

    try {
      const result = await addExpense({
        object: finance.selectedObject,
        category: finance.selectedCategory,
        amount: finance.amount,
        comment,
        msgId: String(ctx.message.message_id),
      });

      ctx.session.finance = { step: 'menu' };

      return ctx.reply(
        `✅ *Расход записан!*\n\n` +
        `📅 ${result.date}\n` +
        `🏗 ${result.object}\n` +
        `📁 ${result.category}\n` +
        `💵 ${result.amount.toLocaleString('ru-RU')} ₽` +
        (result.comment ? `\n✏️ ${result.comment}` : ''),
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('Ошибка записи расхода:', err.message);
      return ctx.reply('❌ Не удалось записать расход. Проверь доступ к таблице.');
    }
  }
}

module.exports = { setupFinanceModule, handleCallback, handleMessage };
