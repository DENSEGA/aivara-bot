const { chat, generateImage, downloadFile, transcribeVoice } = require('../services/openai');

const SYSTEM_PROMPT = `Ты — AIVARA, умный AI-ассистент. Ты помогаешь с любыми вопросами: строительство домов (ИЖС, каркасные дома), эзотерика, Таро, контент, бизнес, погода, поиск информации — что угодно.

Правила:
- Отвечай кратко и по делу, на русском
- Если спрашивают про погоду — скажи что не имеешь доступа к реальному времени, но можешь обсудить прогнозы
- Если просят сгенерировать картинку — скажи использовать команду /image
- Будь дружелюбным и полезным`;

const chatHistory = new Map();
const MAX_HISTORY = 30;

function setupChatGPTModule(bot) {
  bot.hears('🤖 ChatGPT', (ctx) => {
    ctx.session.mode = 'chatgpt';
    return ctx.reply(
      '🤖 *AI-ассистент AIVARA*\n\n' +
      'Пиши вопрос текстом или отправь голосовое 🎤\n\n' +
      '📌 Команды:\n' +
      '/clear — очистить историю\n' +
      '/image описание — сгенерировать картинку',
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('clear', (ctx) => {
    if (ctx.session?.mode !== 'chatgpt') return;
    chatHistory.delete(ctx.from.id);
    return ctx.reply('🗑 История очищена.');
  });

  bot.command('image', async (ctx) => {
    if (ctx.session?.mode !== 'chatgpt') return;
    const prompt = ctx.message.text.replace('/image', '').trim();
    if (!prompt) return ctx.reply('✏️ Опиши что нарисовать:\n/image красивый дом в стиле барнхаус');
    await ctx.reply('🎨 Генерирую...');
    try {
      const url = await generateImage(prompt);
      return ctx.replyWithPhoto(url, { caption: `🎨 ${prompt}` });
    } catch (err) {
      console.error('DALL-E ошибка:', err.message);
      return ctx.reply('❌ Не удалось сгенерировать. Попробуй другой промт.');
    }
  });
}

async function handleMessage(ctx) {
  const userId = ctx.from.id;
  const userMessage = ctx.message.text;
  await processMessage(ctx, userId, userMessage);
}

async function handleVoice(ctx) {
  const userId = ctx.from.id;
  try {
    // Получаем ссылку на файл
    const fileId = ctx.message.voice.file_id;
    const fileLink = await ctx.telegram.getFileLink(fileId);

    await ctx.reply('🎤 Распознаю голос...');
    const buffer = await downloadFile(fileLink.href);
    const text = await transcribeVoice(buffer);

    if (!text || text.trim().length === 0) {
      return ctx.reply('❌ Не удалось распознать. Попробуй ещё раз.');
    }

    await ctx.reply(`💬 _"${text}"_`, { parse_mode: 'Markdown' });
    return await processMessage(ctx, userId, text);
  } catch (err) {
    console.error('Voice ошибка:', err.message);
    return ctx.reply('❌ Ошибка распознавания голоса.');
  }
}

async function processMessage(ctx, userId, userMessage) {
  if (!chatHistory.has(userId)) chatHistory.set(userId, []);
  const history = chatHistory.get(userId);
  history.push({ role: 'user', content: userMessage });
  while (history.length > MAX_HISTORY) history.shift();

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];

  try {
    await ctx.sendChatAction('typing');
    const reply = await chat(messages);
    history.push({ role: 'assistant', content: reply });
    return ctx.reply(reply, { parse_mode: 'Markdown' }).catch(() => ctx.reply(reply));
  } catch (err) {
    console.error('ChatGPT ошибка:', err.message);
    return ctx.reply('❌ Ошибка ChatGPT. Попробуй ещё раз.');
  }
}

module.exports = { setupChatGPTModule, handleMessage, handleVoice };
