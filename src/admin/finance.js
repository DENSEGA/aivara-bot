const { Markup } = require('telegraf');
const { getObjects, getCategories, addExpense, getReport } = require('../../services/sheets');
const { hasAccess } = require('../../services/roles');

function setupFinanceModule(bot) {
  bot.hears('💰 Финансы', async (ctx) => {
    if (!hasAccess(ctx.from.id, 'finance')) return ctx.reply('⛔ Нет доступа.');
    ctx.session.mode = 'finance'; ctx.session.finance = { step: 'menu' };
    return ctx.reply('💰 *Финансы — ЭкоКаркас*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить расход', 'fin_add')],
        [Markup.button.callback('📊 Сегодня', 'fin_rep_day'), Markup.button.callback('📊 Месяц', 'fin_rep_month')],
        [Markup.button.callback('📊 Всё время', 'fin_rep_all')],
        [Markup.button.callback('📋 Объекты', 'fin_objects'), Markup.button.callback('➕ Новый объект', 'fin_add_object')],
      ]) });
  });
}

async function handleCallback(ctx) {
  const data = ctx.callbackQuery.data; await ctx.answerCbQuery();
  if (data === 'fin_add') {
    try {
      const objects = await getObjects();
      if (!objects.length) return ctx.reply('❌ Объекты не найдены.');
      ctx.session.finance = { step: 'select_object', objects };
      return ctx.reply('🏗 *Выбери объект:*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard(objects.map((o) => [Markup.button.callback(o.name, `fin_obj_${o.index}`)])) });
    } catch (err) { return ctx.reply('❌ Ошибка: ' + err.message); }
  }
  if (data.startsWith('fin_obj_')) {
    const obj = ctx.session.finance.objects?.[parseInt(data.replace('fin_obj_', ''))];
    if (!obj) return ctx.reply('❌ Не найден.'); ctx.session.finance.selectedObject = obj.name; ctx.session.finance.step = 'select_category';
    const cats = getCategories(); ctx.session.finance.categories = cats;
    return ctx.reply(`📁 *${obj.name}*\n\nКатегория:`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(cats.map((c, i) => [Markup.button.callback(c, `fin_cat_${i}`)])) });
  }
  if (data.startsWith('fin_cat_')) {
    const cat = ctx.session.finance.categories?.[parseInt(data.replace('fin_cat_', ''))];
    if (!cat) return; ctx.session.finance.selectedCategory = cat; ctx.session.finance.step = 'enter_amount';
    return ctx.reply(`🏗 *${ctx.session.finance.selectedObject}*\n📁 ${cat}\n\n💵 Введи сумму:`, { parse_mode: 'Markdown' });
  }
  if (data.startsWith('fin_rep_')) {
    const period = data.replace('fin_rep_', '');
    return ctx.reply('📊 *Формат:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('📋 Короткий', `fin_repdo_${period}_short`)], [Markup.button.callback('📖 Полный', `fin_repdo_${period}_full`)]]) });
  }
  if (data.startsWith('fin_repdo_')) {
    const [period, mode] = data.replace('fin_repdo_', '').split('_');
    try { const t = await getReport(period, mode); return ctx.reply(t, { parse_mode: 'Markdown' }).catch(() => ctx.reply(t)); }
    catch (err) { return ctx.reply('❌ Ошибка отчёта.'); }
  }
  if (data === 'fin_objects') {
    try { const obs = await getObjects(); return ctx.reply(`🏗 *Объекты (${obs.length}):*\n\n${obs.map((o,i)=>`${i+1}. ${o.name}`).join('\n')}`, { parse_mode: 'Markdown' }); }
    catch(e) { return ctx.reply('❌ Ошибка.'); }
  }
  if (data === 'fin_add_object') {
    if (!hasAccess(ctx.from.id, 'objectsEdit')) return ctx.reply('⛔ Нет прав.');
    ctx.session.finance = { step: 'new_object' }; return ctx.reply('🏗 Название нового объекта:');
  }
}

async function handleMessage(ctx) {
  const fin = ctx.session.finance; if (!fin) return;
  if (fin.step === 'enter_amount') {
    const amount = parseFloat(ctx.message.text.replace(/\s/g, '').replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Введи число:');
    fin.amount = amount; fin.step = 'enter_comment';
    return ctx.reply(`💵 *${amount.toLocaleString('ru-RU')} ₽*\n\n✏️ Комментарий (или «-»):`, { parse_mode: 'Markdown' });
  }
  if (fin.step === 'enter_comment') {
    fin.comment = ctx.message.text === '-' ? '' : ctx.message.text; fin.step = 'confirm';
    const preview = `🏗 ${fin.selectedObject}\n📁 ${fin.selectedCategory}\n💵 ${fin.amount.toLocaleString('ru-RU')} ₽` + (fin.comment ? `\n✏️ ${fin.comment}` : '');
    return ctx.reply(`📋 *Проверь:*\n\n${preview}`, { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('✅ Записать', 'fin_confirm_yes')], [Markup.button.callback('❌ Отменить', 'fin_confirm_no')]]) });
  }
  if (fin.step === 'new_object') {
    const name = ctx.message.text.trim(); if (name.length < 2) return ctx.reply('❌ Короткое название.');
    try { const { addObject } = require('../../services/sheets'); await addObject(name); ctx.session.finance = { step: 'menu' };
      return ctx.reply(`✅ Объект *${name}* добавлен!`, { parse_mode: 'Markdown' }); } catch(e) { return ctx.reply('❌ Ошибка.'); }
  }
}

async function handleConfirm(ctx) {
  const data = ctx.callbackQuery.data; await ctx.answerCbQuery(); const fin = ctx.session.finance;
  if (data === 'fin_confirm_yes' && fin) {
    try {
      const result = await addExpense({ object: fin.selectedObject, category: fin.selectedCategory, amount: fin.amount, comment: fin.comment, msgId: String(ctx.callbackQuery.message?.message_id || '') });
      let todayText = ''; try { todayText = '\n\n───────────\n' + await getReport('day', 'short'); } catch(e) {}
      ctx.session.finance = { step: 'menu' };
      return ctx.editMessageText(`✅ *Записано!*\n\n📅 ${result.date}\n🏗 ${result.object}\n📁 ${result.category}\n💵 ${result.amount.toLocaleString('ru-RU')} ₽${result.comment?'\n✏️ '+result.comment:''}${todayText}`, { parse_mode: 'Markdown' });
    } catch(e) { return ctx.reply('❌ Ошибка записи.'); }
  }
  if (data === 'fin_confirm_no') { ctx.session.finance = { step: 'menu' }; return ctx.editMessageText('❌ Отменено.'); }
}

module.exports = { setupFinanceModule, handleCallback, handleMessage, handleConfirm };
