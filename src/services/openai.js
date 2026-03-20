const OpenAI = require('openai');
const https = require('https');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chat(messages) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 2000,
    temperature: 0.7,
  });
  return response.choices[0].message.content;
}

async function generateImage(prompt) {
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
  });
  return response.data[0].url;
}

/**
 * Скачать файл по URL и вернуть Buffer
 */
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Транскрибировать голосовое сообщение
 */
async function transcribeVoice(fileBuffer) {
  const file = new File([fileBuffer], 'voice.ogg', { type: 'audio/ogg' });
  const response = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: 'ru',
  });
  return response.text;
}

module.exports = { chat, generateImage, downloadFile, transcribeVoice };
