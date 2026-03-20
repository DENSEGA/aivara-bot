const OpenAI = require('openai');
const https = require('https');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chat(messages) {
  const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages, max_tokens: 2000, temperature: 0.7 });
  return r.choices[0].message.content;
}

async function generateImage(prompt) {
  const r = await openai.images.generate({ model: 'dall-e-3', prompt, n: 1, size: '1792x1024' });
  return r.data[0].url;
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : require('http');
    proto.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) return downloadFile(res.headers.location).then(resolve).catch(reject);
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function transcribeVoice(fileBuffer) {
  const file = new File([fileBuffer], 'voice.ogg', { type: 'audio/ogg' });
  const r = await openai.audio.transcriptions.create({ model: 'whisper-1', file, language: 'ru' });
  return r.text;
}

async function generateHouseRenders(params) {
  const styleMap = {
    'Барнхаус': 'barnhouse style with dark metal cladding and wood accents',
    'Скандинавский': 'scandinavian minimalist style with light wood facade',
    'Классический': 'classic traditional style house',
    'Современный': 'modern contemporary style with flat elements',
    'A-frame': 'A-frame triangular house',
  };
  const styleDesc = styleMap[params.style] || 'modern house';
  const floorsDesc = params.floors === '2' ? 'two-story' : params.floors === '1.5' ? 'one and a half story with attic' : 'single-story';
  const roofDesc = (params.roofType || 'gable').toLowerCase();
  const terraceDesc = params.terrace ? `, with ${params.terraceType === 'закрытая' ? 'enclosed glass' : 'open wooden'} terrace` : '';

  const basePrompt = `Photorealistic architectural render of a ${floorsDesc} ${styleDesc} house, ${roofDesc} roof, on a green landscaped plot, sunny day, professional real estate photography style, high quality, 8k`;

  const frontPrompt = `${basePrompt}, front view facade${terraceDesc}, entrance visible`;
  const backPrompt = `${basePrompt}, rear view from garden${terraceDesc}, backyard perspective`;

  console.log('DALL-E front:', frontPrompt);
  console.log('DALL-E back:', backPrompt);

  const [frontUrl, backUrl] = await Promise.all([generateImage(frontPrompt), generateImage(backPrompt)]);
  const [frontBuf, backBuf] = await Promise.all([downloadFile(frontUrl), downloadFile(backUrl)]);

  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const frontPath = path.join(os.tmpdir(), `render_front_${Date.now()}.png`);
  const backPath = path.join(os.tmpdir(), `render_back_${Date.now()}.png`);
  fs.writeFileSync(frontPath, frontBuf);
  fs.writeFileSync(backPath, backBuf);

  return { frontPath, backPath };
}

module.exports = { chat, generateImage, downloadFile, transcribeVoice, generateHouseRenders };
