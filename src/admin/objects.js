const { Markup } = require('telegraf');
const { hasAccess } = require('../../services/roles');
const {
  getObjectsWithProgress, getObjectStages, initObjectStages,
  updateStageStatus, addStageComment, STAGE_STATUSES,
} = require('../../services/sheets');

// ============================================================
// SETUP
// ============================================================
function setupObjectsModule(bot) {
  bot.hears('📋 Объекты', async (ctx) => {
    if (!hasAccess(ctx.from.id, 'objectsView')) return ctx.reply('⛔ Нет доступа.');
    ctx.session.mode = 'objects';
    ctx.session.objects = { step: 'list' };
    return showObjectsList(ctx);
  });
}

// ============================================================
// ПРОГРЕСС-БАР
// ============================================================
function progressBar(percent, width = 10) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty) + ` ${percent}%`;
}

function statusEmoji(status) {
  return STAGE_STATUSES[status]?.emoji || '⏳';
}

// ============================================================
// СПИСОК ОБЪЕКТОВ С ПРОГРЕССОМ
// ============================================================
async function showObjectsList(ctx) {
  try {
    const objects = await getObjectsWithProgress();
    if (!objects.length) return ctx.reply('📋 Объекты не найдены.');

    let text = '📋 *Объекты — ЭкоКаркас*\n\n';

    const btns = [];
    for (const obj of objects) {
      const icon = obj.status === 'done' ? '✅' : obj.status === 'active' ? '🔨' : '⏳';
      const bar = progressBar(obj.progress, 8);

      text += `${icon} *${obj.name}*\n`;
      text += `   ${bar}\n`;
      text += `   Этапов: ${obj.doneStages}/${obj.totalStages}${obj.hasStages ? '' : ' _(нет этапов)_'}\n\n`;

      btns.push([Markup.button.callback(`${icon} ${obj.name}`, `obj_view_${obj.index}`)]);
    }

    btns.push([Markup.button.callback('🔄 Обновить', 'obj_refresh')]);

    return ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(btns) });
  } catch (err) {
    console.error('Objects error:', err.message);
    return ctx.reply('❌ Ошибка загрузки объектов: ' + err.message);
  }
}

// ============================================================
// КАРТОЧКА ОБЪЕКТА — детальный вид
// ============================================================
async function showObjectCard(ctx, objectName) {
  try {
    let stages = await getObjectStages(objectName);

    // Если этапов нет — инициализируем
    if (!stages.length) {
      stages = await initObjectStages(objectName);
    }

    const doneCount = stages.filter((s) => s.status === 'done').length;
    const progress = Math.round((doneCount / stages.length) * 100);

    let text = `🏗 *${objectName}*\n`;
    text += `${progressBar(progress, 12)}\n\n`;

    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const emoji = statusEmoji(s.status);
      const label = STAGE_STATUSES[s.status]?.label || 'Ожидание';
      text += `${emoji} *${s.stage}* — _${label}_`;
      if (s.startDate) text += ` (с ${s.startDate})`;
      if (s.endDate) text += ` → ${s.endDate}`;
      if (s.comment) text += `\n   💬 ${s.comment}`;
      text += '\n';
    }

    // Кнопки управления — только для тех кто может редактировать
    const btns = [];
    if (hasAccess(ctx.from.id, 'stagesEdit')) {
      // Показываем кнопки для этапов которые можно изменить
      for (const s of stages) {
        if (s.status === 'waiting') {
          btns.push([Markup.button.callback(`▶️ Начать: ${s.stage}`, `obj_stage_start_${s.rowIndex}`)]);
        } else if (s.status === 'active') {
          btns.push([Markup.button.callback(`✅ Завершить: ${s.stage}`, `obj_stage_done_${s.rowIndex}`)]);
        }
      }
      // Ограничиваем до 5 кнопок чтобы не было слишком длинно
      if (btns.length > 5) btns.length = 5;
    }

    btns.push([Markup.button.callback('💬 Комментарий', `obj_comment_${objectName}`)]);
    btns.push([Markup.button.callback('◀️ Назад к списку', 'obj_refresh')]);

    return ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(btns) });
  } catch (err) {
    console.error('Object card error:', err.message);
    return ctx.reply('❌ Ошибка: ' + err.message);
  }
}

// ============================================================
// CALLBACK HANDLER
// ============================================================
async function handleCallback(ctx) {
  const data = ctx.callbackQuery.data;
  await ctx.answerCbQuery();

  // Список объектов
  if (data === 'obj_refresh') {
    return showObjectsList(ctx);
  }

  // Просмотр объекта
  if (data.startsWith('obj_view_')) {
    const idx = parseInt(data.replace('obj_view_', ''));
    try {
      const objects = await getObjectsWithProgress();
      const obj = objects.find((o) => o.index === idx);
      if (!obj) return ctx.reply('❌ Объект не найден.');
      ctx.session.objects = { step: 'card', currentObject: obj.name };
      return showObjectCard(ctx, obj.name);
    } catch (err) {
      return ctx.reply('❌ Ошибка: ' + err.message);
    }
  }

  // Начать этап
  if (data.startsWith('obj_stage_start_')) {
    if (!hasAccess(ctx.from.id, 'stagesEdit')) return ctx.reply('⛔ Нет прав.');
    const rowIndex = parseInt(data.replace('obj_stage_start_', ''));
    try {
      await updateStageStatus(rowIndex, 'active', 0);
      await ctx.reply('🔨 Этап переведён *в работу*!', { parse_mode: 'Markdown' });
      // Обновить карточку
      const objName = ctx.session.objects?.currentObject;
      if (objName) return showObjectCard(ctx, objName);
    } catch (err) {
      return ctx.reply('❌ Ошибка: ' + err.message);
    }
  }

  // Завершить этап
  if (data.startsWith('obj_stage_done_')) {
    if (!hasAccess(ctx.from.id, 'stagesEdit')) return ctx.reply('⛔ Нет прав.');
    const rowIndex = parseInt(data.replace('obj_stage_done_', ''));
    try {
      await updateStageStatus(rowIndex, 'done', 100);
      await ctx.reply('✅ Этап *завершён*!', { parse_mode: 'Markdown' });
      const objName = ctx.session.objects?.currentObject;
      if (objName) return showObjectCard(ctx, objName);
    } catch (err) {
      return ctx.reply('❌ Ошибка: ' + err.message);
    }
  }

  // Комментарий к этапу — начало
  if (data.startsWith('obj_comment_')) {
    const objName = data.replace('obj_comment_', '');
    try {
      const stages = await getObjectStages(objName);
      const activeStages = stages.filter((s) => s.status === 'active' || s.status === 'waiting');
      if (!activeStages.length) return ctx.reply('Нет активных этапов для комментария.');

      ctx.session.objects = { step: 'select_stage_comment', currentObject: objName };
      const btns = activeStages.slice(0, 8).map((s) => [Markup.button.callback(`${statusEmoji(s.status)} ${s.stage}`, `obj_stagecomm_${s.rowIndex}`)]);
      return ctx.reply('💬 *Выбери этап:*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard(btns) });
    } catch (err) {
      return ctx.reply('❌ Ошибка: ' + err.message);
    }
  }

  // Выбрали этап для комментария
  if (data.startsWith('obj_stagecomm_')) {
    const rowIndex = parseInt(data.replace('obj_stagecomm_', ''));
    ctx.session.objects.step = 'write_comment';
    ctx.session.objects.commentRow = rowIndex;
    return ctx.reply('✏️ Напиши комментарий:');
  }
}

// ============================================================
// TEXT MESSAGE HANDLER
// ============================================================
async function handleMessage(ctx) {
  const o = ctx.session.objects;
  if (!o) return;

  if (o.step === 'write_comment' && o.commentRow) {
    try {
      await addStageComment(o.commentRow, ctx.message.text.trim());
      await ctx.reply('✅ Комментарий сохранён!');
      o.step = 'card';
      if (o.currentObject) return showObjectCard(ctx, o.currentObject);
    } catch (err) {
      return ctx.reply('❌ Ошибка: ' + err.message);
    }
  }
}

module.exports = { setupObjectsModule, handleCallback, handleMessage };
