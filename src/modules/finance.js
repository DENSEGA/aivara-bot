const { Markup } = require('telegraf');
const { getObjects, getCategories, addExpense, getReport } = require('../services/sheets');
const { hasAccess } = require('../services/roles');

function setupFinanceModule(bot) {
  bot.hears('💰 Финансы', async (ctx) => {
    if (!hasAccess(ctx.from.id, 'finance')) return ctx.reply('⛔ Нет доступа.');
    ctx.session.mode = 'finance';
    ctx.session.finance = { step: 'menu' };

    return ctx.reply('💰 *Финансы — ЭкоКаркас*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить расход', 'fin_add')],
        [
          Markup.button.callback('📊 Сегодня', 'fin_rep_day'),
          Markup.button.callback('📊 Месяц', 'fin_rep_month'),
        ],
        [Markup.button.callback('📊 Всё время', 'fin_rep_all')],
        [
          Markup.button.callback('📋 Объекты', 'fin_objects'),
          Markup.button.callback('➕ Новый объект', 'fin_add_object'),
        ],
      ]),
    });
  });
}

async function handleCallback(ctx) {
  const data = ctx.callbackQuery.data;
  await ctx.answerCbQuery();

  // === ДОБАВИТЬ РАСХОД ===
  if (data === 'fin_add') {
    try {
      const objects = await getObjects();
      if (!objects.length) return ctx.reply('❌ Объекты не найдены в таблице.');
      ctx.session.finance = { step: 'select_object', objects };
      const buttons = objects.map((o) => [Markup.button.callback(o.name, `fin_obj_${o.index}`)]);
      return ctx.reply('🏗 *Выбери объект:*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    } catch (err) {
      console.error('Ошибка загрузки объектов:', err.message);
      return ctx.reply('❌ Не удалось загрузить объекты.');
    }
  }

  // Выбор объекта → категория
  if (data.startsWith('fin_obj_')) {
    const idx = parseInt(data.replace('fin_obj_', ''), 10);
    const obj = ctx.session.finance.objects?.[idx];
    if (!obj) return ctx.reply('❌ Объект не найден.');
    ctx.session.finance.selectedObject = obj.name;
    ctx.session.finance.step = 'select_category';
    const cats = getCategories();
    ctx.session.finance.categories = cats;
    const buttons = cats.map((c, i) => [Markup.button.callback(c, `fin_cat_${i}`)]);
    return ctx.reply(`📁 *${obj.name}*\n\nКатегория:`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
  }

  // Выбор категории → сумма
  if (data.startsWith('fin_cat_')) {
    const idx = parseInt(data.replace('fin_cat_', ''), 10);
    const cat = ctx.session.finance.categories?.[idx];
    if (!cat) return ctx.reply('❌ Категория не найдена.');
    ctx.session.finance.selectedCategory = cat;
    ctx.session.finance.step = 'enter_amount';
    return ctx.reply(`🏗 *${ctx.session.finance.selectedObject}*\n📁 ${cat}\n\n💵 Введи сумму:`, { parse_mode: 'Markdown' });
  }

  // === ОТЧЁТЫ ===
  if (data.startsWith('fin_rep_')) {
    const period = data.replace('fin_rep_', ''); // day, month, all
    ctx.session.finance = { step: 'report', period };
    return ctx.reply('📊 *Формат отчёта:*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 Короткий (суммы)', `fin_repdo_${period}_short`)],
        [Markup.button.callback('📖 Полный (с деталями)', `fin_repdo_${period}_full`)],
      ]),
    });
  }

  if (data.startsWith('fin_repdo_')) {
    const parts = data.replace('fin_repdo_', '').split('_');
    const period = parts[0];
    const mode = parts[1];
    try {
      const text = await getReport(period, mode);
      return ctx.reply(text, { parse_mode: 'Markdown' }).catch(() => ctx.reply(text));
    } catch (err) {
      console.error('Ошибка отчёта:', err.message);
      return ctx.reply('❌ Не удалось сформировать отчёт.');
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

  // === ДОБАВИТЬ ОБЪЕКТ ===
  if (data === 'fin_add_object') {
    if (!hasAccess(ctx.from.id, 'objectsEdit')) return ctx.reply('⛔ Нет прав на редактирование объектов.');
    ctx.session.finance = { step: 'new_object' };
    return ctx.reply('🏗 Введи название нового объекта:');
  }
}

async function handleMessage(ctx) {
  const fin = ctx.session.finance;
  if (!fin) return;

  // Ввод суммы
  if (fin.step === 'enter_amount') {
    const text = ctx.message.text.replace(/\s/g, '').replace(',', '.');
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Введи корректное число:');
    fin.amount = amount;
    fin.step = 'enter_comment';
    return ctx.reply(`💵 *${amount.toLocaleString('ru-RU')} ₽*\n\n✏️ Комментарий (или «-»):`, { parse_mode: 'Markdown' });
  }

  // Комментарий → подтверждение
  if (fin.step === 'enter_comment') {
    fin.comment = ctx.message.text === '-' ? '' : ctx.message.text;
    fin.step = 'confirm';
    const preview =
      `🏗 ${fin.selectedObject}\n📁 ${fin.selectedCategory}\n💵 ${fin.amount.toLocaleString('ru-RU')} ₽` +
      (fin.comment ? `\n✏️ ${fin.comment}` : '');
    return ctx.reply(`📋 *Проверь:*\n\n${preview}`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Записать', 'fin_confirm_yes')],
        [Markup.button.callback('❌ Отменить', 'fin_confirm_no')],
      ]),
    });
  }

  // Новый объект
  if (fin.step === 'new_object') {
    const name = ctx.message.text.trim();
    if (!name || name.length < 2) return ctx.reply('❌ Слишком короткое название.');
    try {
      const { addObject } = require('../services/sheets');
      await addObject(name);
      ctx.session.finance = { step: 'menu' };
      return ctx.reply(`✅ Объект *${name}* добавлен!`, { parse_mode: 'Markdown' });
    } catch (err) {
      return ctx.reply('❌ Не удалось добавить объект.');
    }
  }
}

async function handleConfirm(ctx) {
  const data = ctx.callbackQuery.data;
  await ctx.answerCbQuery();
  const fin = ctx.session.finance;

  if (data === 'fin_confirm_yes' && fin) {
    try {
      const result = await addExpense({
        object: fin.selectedObject,
        category: fin.selectedCategory,
        amount: fin.amount,
        comment: fin.comment,
        msgId: String(ctx.callbackQuery.message?.message_id || ''),
      });

      // Мини-сводка за сегодня
      let todayText = '';
      try {
        const todayReport = await getReport('day', 'short');
        todayText = `\n\n───────────\n${todayReport}`;
      } catch (e) { /* ignore */ }

      ctx.session.finance = { step: 'menu' };
      return ctx.editMessageText(
        `✅ *Записано!*\n\n📅 ${result.date}\n🏗 ${result.object}\n📁 ${result.category}\n💵 ${result.amount.toLocaleString('ru-RU')} ₽` +
        (result.comment ? `\n✏️ ${result.comment}` : '') + todayText,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('Ошибка записи:', err.message);
      return ctx.reply('❌ Не удалось записать расход.');
    }
  }

  if (data === 'fin_confirm_no') {
    ctx.session.finance = { step: 'menu' };
    return ctx.editMessageText('❌ Отменено.');
  }
}

module.exports = { setupFinanceModule, handleCallback, handleMessage, handleConfirm };
