const { Markup } = require('telegraf');
const { hasAccess } = require('../services/roles');

// Задачи хранятся в памяти (при перезапуске сбрасываются)
// TODO: перенести в Google Sheets для постоянного хранения
const tasks = [];
let taskIdCounter = 1;

function setupTasksModule(bot) {
  bot.hears('👥 Задачи', (ctx) => {
    if (!hasAccess(ctx.from.id, 'tasks')) return ctx.reply('⛔ Нет доступа.');
    ctx.session.mode = 'tasks';
    ctx.session.tasks = { step: 'menu' };

    const buttons = [
      [Markup.button.callback('📋 Мои задачи', 'task_my')],
    ];

    if (hasAccess(ctx.from.id, 'tasksManage')) {
      buttons.push([Markup.button.callback('➕ Поставить задачу', 'task_new')]);
      buttons.push([Markup.button.callback('📊 Все задачи', 'task_all')]);
    }

    return ctx.reply('👥 *Задачи команды*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons),
    });
  });
}

async function handleCallback(ctx) {
  const data = ctx.callbackQuery.data;
  await ctx.answerCbQuery();

  if (data === 'task_my') {
    const myTasks = tasks.filter((t) => t.assignee === ctx.from.id && t.status !== 'done');
    if (!myTasks.length) return ctx.reply('✅ У тебя нет активных задач.');

    const text = myTasks.map((t) => {
      return `📌 *#${t.id}* ${t.text}\n⏰ ${t.deadline || 'без срока'}\nСтатус: ${t.status === 'new' ? '🔵 Новая' : '🟡 В работе'}`;
    }).join('\n\n');

    return ctx.reply(`📋 *Твои задачи:*\n\n${text}`, { parse_mode: 'Markdown' });
  }

  if (data === 'task_new') {
    ctx.session.tasks = { step: 'new_text' };
    return ctx.reply('📝 Опиши задачу:');
  }

  if (data === 'task_all') {
    const active = tasks.filter((t) => t.status !== 'done');
    if (!active.length) return ctx.reply('✅ Нет активных задач.');

    const text = active.map((t) => {
      const status = t.status === 'new' ? '🔵' : t.status === 'progress' ? '🟡' : '✅';
      return `${status} *#${t.id}* ${t.text}\n👤 ${t.assigneeName || 'не назначен'} | ⏰ ${t.deadline || 'без срока'}`;
    }).join('\n\n');

    return ctx.reply(`📊 *Все задачи:*\n\n${text}`, { parse_mode: 'Markdown' });
  }

  // Отметить задачу выполненной
  if (data.startsWith('task_done_')) {
    const id = parseInt(data.replace('task_done_', ''), 10);
    const task = tasks.find((t) => t.id === id);
    if (task) {
      task.status = 'done';
      // Уведомляем создателя
      if (task.creator !== ctx.from.id) {
        try {
          await ctx.telegram.sendMessage(
            task.creator,
            `✅ Задача *#${task.id}* выполнена!\n\n📝 ${task.text}\n👤 ${ctx.from.first_name}`,
            { parse_mode: 'Markdown' }
          );
        } catch (e) { /* ignore */ }
      }
      return ctx.reply(`✅ Задача #${id} отмечена как выполненная.`);
    }
  }
}

async function handleMessage(ctx) {
  const t = ctx.session.tasks;
  if (!t) return;

  if (t.step === 'new_text') {
    t.taskText = ctx.message.text;
    t.step = 'new_assignee';
    return ctx.reply('👤 Кому назначить? Введи Chat ID сотрудника\n(или «мне» чтобы назначить себе):');
  }

  if (t.step === 'new_assignee') {
    const input = ctx.message.text.trim().toLowerCase();
    if (input === 'мне' || input === 'себе') {
      t.assigneeId = ctx.from.id;
      t.assigneeName = ctx.from.first_name;
    } else {
      t.assigneeId = parseInt(input, 10);
      t.assigneeName = `ID:${t.assigneeId}`;
    }
    t.step = 'new_deadline';
    return ctx.reply('⏰ Дедлайн? (например: `25.03.2026` или «-» без срока)', { parse_mode: 'Markdown' });
  }

  if (t.step === 'new_deadline') {
    const deadline = ctx.message.text === '-' ? null : ctx.message.text.trim();
    const task = {
      id: taskIdCounter++,
      text: t.taskText,
      assignee: t.assigneeId,
      assigneeName: t.assigneeName,
      creator: ctx.from.id,
      deadline,
      status: 'new',
      created: new Date().toISOString(),
    };
    tasks.push(task);

    // Уведомляем исполнителя
    if (task.assignee !== ctx.from.id) {
      try {
        await ctx.telegram.sendMessage(
          task.assignee,
          `📌 *Новая задача #${task.id}*\n\n📝 ${task.text}\n⏰ ${deadline || 'без срока'}\n\nОт: ${ctx.from.first_name}`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Выполнено', `task_done_${task.id}`)],
            ]),
          }
        );
      } catch (e) {
        console.error('Не удалось уведомить:', e.message);
      }
    }

    ctx.session.tasks = { step: 'menu' };
    return ctx.reply(
      `✅ *Задача #${task.id} создана*\n\n📝 ${task.text}\n👤 ${task.assigneeName}\n⏰ ${deadline || 'без срока'}`,
      { parse_mode: 'Markdown' }
    );
  }
}

module.exports = { setupTasksModule, handleCallback, handleMessage };
