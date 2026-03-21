const { Markup } = require('telegraf');
const { hasAccess } = require('../../services/roles');

const tasks = []; let taskId = 1;

function setupTasksModule(bot) {
  bot.hears('👥 Задачи', (ctx) => {
    if (!hasAccess(ctx.from.id, 'tasks')) return ctx.reply('⛔ Нет доступа.');
    ctx.session.mode = 'tasks'; ctx.session.tasks = { step: 'menu' };
    const btns = [[Markup.button.callback('📋 Мои задачи', 'task_my')]];
    if (hasAccess(ctx.from.id, 'tasksManage')) { btns.push([Markup.button.callback('➕ Поставить задачу', 'task_new')]); btns.push([Markup.button.callback('📊 Все задачи', 'task_all')]); }
    return ctx.reply('👥 *Задачи*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard(btns) });
  });
}

async function handleCallback(ctx) {
  const data = ctx.callbackQuery.data; await ctx.answerCbQuery();
  if (data === 'task_my') {
    const my = tasks.filter((t) => t.assignee === ctx.from.id && t.status !== 'done');
    if (!my.length) return ctx.reply('✅ Нет активных задач.');
    return ctx.reply(`📋 *Твои задачи:*\n\n${my.map(t=>`📌 *#${t.id}* ${t.text}\n⏰ ${t.deadline||'без срока'}`).join('\n\n')}`, { parse_mode: 'Markdown' });
  }
  if (data === 'task_new') { ctx.session.tasks = { step: 'new_text' }; return ctx.reply('📝 Опиши задачу:'); }
  if (data === 'task_all') {
    const active = tasks.filter(t=>t.status!=='done');
    if (!active.length) return ctx.reply('✅ Нет задач.');
    return ctx.reply(`📊 *Все:*\n\n${active.map(t=>`${t.status==='new'?'🔵':'🟡'} *#${t.id}* ${t.text}\n👤 ${t.assigneeName} | ⏰ ${t.deadline||'-'}`).join('\n\n')}`, { parse_mode: 'Markdown' });
  }
  if (data.startsWith('task_done_')) {
    const task = tasks.find(t=>t.id===parseInt(data.replace('task_done_','')));
    if (task) { task.status='done';
      if (task.creator!==ctx.from.id) try { await ctx.telegram.sendMessage(task.creator, `✅ #${task.id} выполнена!\n📝 ${task.text}\n👤 ${ctx.from.first_name}`, {parse_mode:'Markdown'}); } catch(e) {}
      return ctx.reply(`✅ #${task.id} выполнена.`);
    }
  }
}

async function handleMessage(ctx) {
  const t = ctx.session.tasks; if (!t) return;
  if (t.step==='new_text') { t.taskText=ctx.message.text; t.step='new_assignee'; return ctx.reply('👤 Chat ID или «мне»:'); }
  if (t.step==='new_assignee') {
    const inp=ctx.message.text.trim().toLowerCase();
    if (inp==='мне'||inp==='себе') { t.assigneeId=ctx.from.id; t.assigneeName=ctx.from.first_name; }
    else { t.assigneeId=parseInt(inp); t.assigneeName=`ID:${t.assigneeId}`; }
    t.step='new_deadline'; return ctx.reply('⏰ Дедлайн? (`25.03.2026` или «-»)', { parse_mode:'Markdown' });
  }
  if (t.step==='new_deadline') {
    const dl=ctx.message.text==='-'?null:ctx.message.text.trim();
    const task = { id:taskId++, text:t.taskText, assignee:t.assigneeId, assigneeName:t.assigneeName, creator:ctx.from.id, deadline:dl, status:'new', created:new Date().toISOString() };
    tasks.push(task);
    if (task.assignee!==ctx.from.id) try { await ctx.telegram.sendMessage(task.assignee, `📌 *#${task.id}*\n📝 ${task.text}\n⏰ ${dl||'-'}\nОт: ${ctx.from.first_name}`,
      { parse_mode:'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Выполнено', `task_done_${task.id}`)]]) }); } catch(e) {}
    ctx.session.tasks={step:'menu'};
    return ctx.reply(`✅ *#${task.id}*\n📝 ${task.text}\n👤 ${task.assigneeName}\n⏰ ${dl||'-'}`, {parse_mode:'Markdown'});
  }
}

module.exports = { setupTasksModule, handleCallback, handleMessage };
