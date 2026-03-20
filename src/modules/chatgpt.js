const { chat } = require('../services/openai');

const SYSTEM_PROMPT = `Ты — AIVARA, умный AI-ассистент Дениса. 
Ты помогаешь с вопросами по строительству домов (ИЖС, каркасные дома), 
эзотерике, Таро, созданию контента и любым другим задачам.
Отвечай кратко, по делу, на русском языке.`;

// История сообщений (в памяти, сбрасывается при перезапуске)
const chatHistory = new Map();
const MAX_HISTORY = 20;

function setupChatGPTModule(bot, mainMenu) {
  bot.hears('🤖 ChatGPT', (ctx) => {
    ctx.session.mode = 'chatgpt';
    return ctx.reply(
      '🤖 *ChatGPT режим*\n\nПиши любой вопрос — я отвечу.\n\nКоманды:\n/clear — очистить историю диалога\n/image [описание] — сгенерировать картинку',
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('clear', (ctx) => {
    if (ctx.session?.mode !== 'chatgpt') return;
    chatHistory.delete(ctx.from.id);
    return ctx.reply('🗑 История диалога очищена.');
  });

  bot.command('image', async (ctx) => {
    if (ctx.session?.mode !== 'chatgpt') return;

    const prompt = ctx.message.text.replace('/image', '').trim();
    if (!prompt) {
      return ctx.reply('✏️ Опиши что нарисовать: /image красивый закат над горами');
    }

    await ctx.reply('🎨 Генерирую изображение...');

    try {
      const { generateImage } = require('../services/openai');
      const url = await generateImage(prompt);
      return ctx.replyWithPhoto(url, { caption: `🎨 ${prompt}` });
    } catch (err) {
      console.error('DALL-E ошибка:', err.message);
      return ctx.reply('❌ Не удалось сгенерировать изображение. Попробуй другой промт.');
    }
  });
}

async function handleMessage(ctx) {
  const userId = ctx.from.id;
  const userMessage = ctx.message.text;

  // Получаем или создаём историю
  if (!chatHistory.has(userId)) {
    chatHistory.set(userId, []);
  }
  const history = chatHistory.get(userId);

  // Добавляем сообщение пользователя
  history.push({ role: 'user', content: userMessage });

  // Обрезаем историю
  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  // Формируем запрос
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
  ];

  try {
    await ctx.sendChatAction('typing');
    const reply = await chat(messages);

    // Сохраняем ответ в историю
    history.push({ role: 'assistant', content: reply });

    return ctx.reply(reply, { parse_mode: 'Markdown' }).catch(() => {
      // Если Markdown сломался — отправляем plain text
      return ctx.reply(reply);
    });
  } catch (err) {
    console.error('ChatGPT ошибка:', err.message);
    return ctx.reply('❌ Ошибка ChatGPT. Попробуй ещё раз.');
  }
}

module.exports = { setupChatGPTModule, handleMessage };
