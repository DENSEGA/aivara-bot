const { chat, generateImage, downloadFile, transcribeVoice } = require('../services/openai');

const SYSTEM_PROMPT = `Ты — AIVARA, умный AI-ассистент. Помогаешь с любыми вопросами: строительство домов ИЖС, эзотерика, бизнес, контент — что угодно. Отвечай кратко, по делу, на русском.`;

const chatHistory = new Map();
const MAX_HISTORY = 30;

function setupChatGPTModule(bot) {
  bot.hears('🤖 ChatGPT', (ctx) => {
    ctx.session.mode = 'chatgpt';
    return ctx.reply('🤖 *AI-ассистент AIVARA*\n\nПиши вопрос или отправь голосовое 🎤\n\n/clear — очистить историю\n/image описание — картинка', { parse_mode: 'Markdown' });
  });
  bot.command('clear', (ctx) => { if (ctx.session?.mode !== 'chatgpt') return; chatHistory.delete(ctx.from.id); return ctx.reply('🗑 Очищено.'); });
  bot.command('image', async (ctx) => {
    if (ctx.session?.mode !== 'chatgpt') return;
    const prompt = ctx.message.text.replace('/image', '').trim();
    if (!prompt) return ctx.reply('✏️ /image красивый дом барнхаус');
    await ctx.reply('🎨 Генерирую...'); try { const url = await generateImage(prompt); return ctx.replyWithPhoto(url, { caption: `🎨 ${prompt}` }); }
    catch(e) { return ctx.reply('❌ Ошибка. Попробуй другой промт.'); }
  });
}

async function handleMessage(ctx) { await processMessage(ctx, ctx.from.id, ctx.message.text); }

async function handleVoice(ctx) {
  try {
    const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    await ctx.reply('🎤 Распознаю...'); const buf = await downloadFile(fileLink.href); const text = await transcribeVoice(buf);
    if (!text) return ctx.reply('❌ Не распознал.');
    await ctx.reply(`💬 _"${text}"_`, { parse_mode: 'Markdown' }); return await processMessage(ctx, ctx.from.id, text);
  } catch(e) { return ctx.reply('❌ Ошибка голоса.'); }
}

async function processMessage(ctx, userId, msg) {
  if (!chatHistory.has(userId)) chatHistory.set(userId, []);
  const h = chatHistory.get(userId); h.push({ role: 'user', content: msg });
  while (h.length > MAX_HISTORY) h.shift();
  try { await ctx.sendChatAction('typing'); const reply = await chat([{ role: 'system', content: SYSTEM_PROMPT }, ...h]);
    h.push({ role: 'assistant', content: reply }); return ctx.reply(reply, { parse_mode: 'Markdown' }).catch(() => ctx.reply(reply));
  } catch(e) { return ctx.reply('❌ Ошибка ChatGPT.'); }
}

module.exports = { setupChatGPTModule, handleMessage, handleVoice };
