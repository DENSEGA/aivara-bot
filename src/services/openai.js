const OpenAI = require('openai');
const fs = require('fs');
const https = require('https');
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ======================= CHAT =======================
async function chat(messages) {
  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages
  });
  return r.choices[0].message.content;
}

// ======================= IMAGE =======================
async function generateImage(prompt) {
  const r = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1792x1024'
  });
  return r.data[0].url;
}

// ======================= DOWNLOAD =======================
async function downloadFile(url, filename) {
  const filePath = path.join(__dirname, '..', '..', 'temp', filename);

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(filePath));
      });
    }).on('error', reject);
  });
}

// ======================= SPEECH =======================
async function transcribeVoice(filePath) {
  const r = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'gpt-4o-transcribe'
  });
  return r.text;
}

// ============================================================
// СЛОВАРИ
// ============================================================

const STYLE = {
  'Барнхаус': 'modern barnhouse architecture, elongated rectangular shape, minimalistic, Scandinavian rural style',
  'Скандинавский': 'Scandinavian country house, calm, cozy, minimal design',
  'Классический': 'classic suburban house, traditional proportions, family home style',
  'Современный': 'modern contemporary country house, clean lines, large windows',
  'A-frame': 'A-frame cabin, triangular roof shape'
};

const ROOF = {
  'Двускатная': 'gable roof with realistic pitch',
  'Односкатная': 'mono-pitch shed roof, modern slope',
  'Вальмовая': 'hip roof, suburban proportions',
  'Плоская': 'flat roof with slight slope'
};

const ROOF_MAT = {
  'Профнастил': 'corrugated metal roofing, visible waves, matte reflections',
  'Металлочерепица': 'metal tile roofing, realistic pattern',
  'Мягкая кровля': 'bitumen shingles, layered texture',
  'Фальц': 'standing seam metal roof, straight seams, premium minimal look'
};

const FACADE = {
  'Металлический сайдинг / софиты': 'dark metal facade, vertical panels',
  'Имитация бруса': 'wood facade, natural grain',
  'Штукатурка (мокрый фасад)': 'light plaster facade',
  'Фасадная плитка Hauberk': 'brick style facade panels',
  'Комбинация: металл + дерево': 'metal and wood combined facade',
  'Комбинация: металл + штукатурка': 'plaster and metal combined facade'
};

const FLOORS = {
  '1': `
STRICTLY ONE STORY HOUSE.
NO SECOND FLOOR.
NO ATTIC.
NO DORMERS.
ALL WINDOWS ON ONE LEVEL ONLY.
LOW HEIGHT BUILDING.
`,
  '1.5': `
ONE FULL FLOOR + ATTIC UNDER ROOF.
ATTIC SMALLER THAN MAIN FLOOR.
`,
  '2': `
STRICTLY TWO STORY HOUSE.
CLEAR SECOND FLOOR WINDOWS.
FULL HEIGHT SECOND LEVEL.
`
};

// ============================================================
// PROMPT BUILDER
// ============================================================

function buildHousePrompt(params, view) {
  const area = parseFloat(params.area) || 90;
  const floors = FLOORS[params.floors] || FLOORS['1'];

  const prompt = `
Ultra photorealistic image of a real built house, not a render.

ARCHITECTURE:
${STYLE[params.style] || STYLE['Барнхаус']}
${floors}

SIZE:
house area about ${area} square meters, realistic proportions

ROOF:
${ROOF[params.roofType]}
${ROOF_MAT[params.roofMaterial]}

FACADE:
${FACADE[params.facade]}

WINDOWS:
realistic windows, reflections of trees and sky

ENVIRONMENT:
real natural landscape, uneven grass, trees, bushes, no perfect symmetry

LIGHT:
soft natural light, golden hour, real shadows

CAMERA:
${view === 'back' ? 'rear view' : 'front view'}
real camera 35mm, no drone

QUALITY:
ultra realistic, real photo look, no CGI, no cartoon
`;

  return prompt;
}

// ============================================================
// ГЕНЕРАЦИЯ ДОМОВ
// ============================================================

async function generateHouseRenders(params) {
  const frontPrompt = buildHousePrompt(params, 'front');
  const backPrompt = buildHousePrompt(params, 'back');

  const [frontUrl, backUrl] = await Promise.all([
    generateImage(frontPrompt),
    generateImage(backPrompt)
  ]);

  const frontPath = await downloadFile(frontUrl, 'front.png');
  const backPath = await downloadFile(backUrl, 'back.png');

  return {
    frontPath,
    backPath
  };
}

// ============================================================

module.exports = {
  chat,
  generateImage,
  transcribeVoice,
  generateHouseRenders,
  buildHousePrompt
};