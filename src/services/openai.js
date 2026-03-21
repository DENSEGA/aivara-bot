const OpenAI = require('openai');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chat(messages) {
  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 2000,
    temperature: 0.7
  });
  return r.choices[0].message.content;
}

async function generateImage(prompt) {
  const r = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1792x1024'
  });
  return r.data[0].url;
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : require('http');

    proto.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location).then(resolve).catch(reject);
      }

      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function transcribeVoice(fileBuffer) {
  const file = new File([fileBuffer], 'voice.ogg', { type: 'audio/ogg' });
  const r = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: 'ru'
  });
  return r.text;
}

// ============================================================
// v4.2 WORKING FINAL
// Короткие промты + усиленный контроль этажности
// ============================================================

const STYLE = {
  'Барнхаус':
    'dark charcoal vertical corrugated metal siding walls, warm brown horizontal wood plank accent panels around windows and entrance, thin black window frames, dark gray foundation, small warm LED wall lights, minimalist modern barnhouse appearance',

  'Скандинавский':
    'white vertical board-and-batten wood cladding walls, dark brown wood trim on fascia and gable edges, large panoramic windows with thin black frames, restrained Scandinavian look, clean cozy proportions',

  'Классический':
    'smooth white stucco render walls, warm brown wood fascia boards and eave trim, dark charcoal roof, dark-framed windows, warm LED wall lights, gray concrete foundation, balanced family house appearance',

  'Современный':
    'white brick-pattern facade tiles or light facade, dark-stained wood beam columns supporting roof overhang, large panoramic windows with black frames, clean modern lines, restrained premium look',

  'A-frame':
    'dramatic A-frame triangular house shape, steep roof planes from ground forming walls and roof as one surface, full-height triangular glass front facade with dark mullions, dark wood side walls, wide wood deck platform with steps'
};

const ROOF = {
  'Двускатная':
    'symmetrical gable roof, realistic residential pitch, dark overhanging eaves',
  'Односкатная':
    'modern mono-pitch shed roof sloping from high front to low rear, extended front overhang',
  'Вальмовая':
    'four-sided hip roof, all sides slope inward, wide eaves all around',
  'Плоская':
    'flat roof with sharp horizontal roofline, dark metal edge trim, modern cubic look'
};

const ROOF_MAT = {
  'Профнастил':
    'dark charcoal corrugated metal sheet roofing',
  'Металлочерепица':
    'dark charcoal metal tile roofing with wave profile',
  'Мягкая кровля':
    'dark charcoal architectural bitumen shingles',
  'Фальц':
    'dark charcoal standing seam metal roofing with straight seam lines'
};

const FACADE = {
  'Металлический сайдинг / софиты':
    'dark charcoal vertical corrugated metal siding, metal soffit under eaves',
  'Имитация бруса':
    'warm honey-brown horizontal wood plank cladding, visible joints and realistic wood grain',
  'Штукатурка (мокрый фасад)':
    'smooth white stucco render, dark trim at base and corners',
  'Фасадная плитка Hauberk':
    'gray brick-pattern facade tiles, white painted corner boards and window surrounds',
  'Комбинация: металл + дерево':
    'dark charcoal vertical corrugated metal on main walls, warm brown horizontal wood accent panels around windows and entrance',
  'Комбинация: металл + штукатурка':
    'white stucco main walls, dark charcoal metal accent strips at corners and around windows'
};

const FLOORS = {
  '1': `
STRICTLY ONE STORY HOUSE ONLY.
EXACTLY ONE GROUND FLOOR.

ABSOLUTE RULES:
no second floor,
no upper level,
no attic,
no mansard,
no dormers,
no balcony,
no second row of windows,
no windows above ground floor,
no tall facade,
no vertical two-story proportions.

ARCHITECTURE:
low horizontal bungalow proportions,
elongated rectangular shape,
roof sits directly on top of ground floor walls,
house is visually wide and low.

If the house has more than one floor, the image is incorrect.
`,

  '1.5': `
ONE-AND-A-HALF STORY HOUSE.
GROUND FLOOR PLUS HABITABLE ATTIC UNDER ROOF.

RULES:
attic level must be smaller than main floor,
possible attic glazing,
taller than one-story house,
lower than full two-story house.
`,

  '2': `
STRICTLY FULL TWO-STORY HOUSE.
TWO COMPLETE FLOORS.
CLEAR SECOND FLOOR WINDOWS.
FULL HEIGHT SECOND LEVEL.
NO SINGLE-STORY INTERPRETATION.
`
};

function getSizeText(area, floors) {
  if (floors === '2') {
    const s = Math.max(7, Math.round(Math.sqrt(area / 2)));
    return `compact ${s}x${s}m footprint, two full floors`;
  }

  if (floors === '1.5') {
    const s = Math.max(8, Math.round(Math.sqrt(area * 0.65)));
    return `${s}x${s}m footprint with habitable attic under roof`;
  }

  const w = Math.max(10, Math.round(Math.sqrt(area) * 1.3));
  const d = Math.max(6, Math.round(area / w));
  return `elongated ${w}x${d}m footprint, clearly horizontal single-story house, wide and low proportions`;
}

function getWindowsText(params, floorsKey) {
  const wCount = parseInt(params.windowsCount, 10) || 8;

  let frames = 'white PVC frames';
  if (params.windows && params.windows.includes('ламинация')) {
    frames = 'brown wood-grain laminated PVC frames';
  } else if (params.windows && params.windows.includes('чер')) {
    frames = 'thin black frames';
  }

  let extra = '';
  if (floorsKey === '1') {
    extra = 'ALL windows strictly on ground floor only, NO second row of windows anywhere';
  } else if (floorsKey === '2') {
    extra = 'windows clearly placed on both floors';
  } else {
    extra = 'main windows on ground floor with possible smaller attic glazing';
  }

  return `${wCount} realistic windows with ${frames}, natural reflections of trees and sky, ${extra}`;
}

function getDoorText(params) {
  let door = 'dark metal entrance door';

  if (params.door && params.door.includes('пластик')) {
    door = 'white PVC entrance door with glass panel';
  } else if (params.door && params.door.includes('премиум')) {
    door = 'premium dark bronze metal entrance door';
  }

  return door;
}

function getTerraceText(params) {
  if (!params.terrace || parseFloat(params.terraceArea) <= 0) {
    return '';
  }

  const tA = parseFloat(params.terraceArea);

  if (params.terraceType === 'открытая') {
    let terrace = `open terrace ${tA}sqm with dark composite or wood decking`;
    if (params.terraceRailing > 0) terrace += `, railing ${params.terraceRailing}m`;
    if (params.terraceSteps) terrace += ', entrance steps';
    return terrace;
  }

  let terrace = `enclosed glazed terrace ${tA}sqm with glass walls`;
  if (params.terraceSteps) terrace += ', entrance steps';
  return terrace;
}

function getLandscapeText() {
  return 'real landscaped plot, natural lawn with slight unevenness, pine and birch trees in background, ornamental shrubs, stone paver walkway, believable suburban environment';
}

function getLightText() {
  return 'golden hour warm evening light from left, soft realistic shadows, warm LED wall lights on facade';
}

function getCameraText(view, floorsKey) {
  if (view === 'back') {
    return 'rear three-quarter view from eye level, 20 degree angle right showing back facade and side wall, full house in frame';
  }

  if (floorsKey === '1') {
    return 'front three-quarter view from eye level, 20 degree angle left showing front and side wall, full house in frame, camera emphasizes low one-story proportions';
  }

  return 'front three-quarter view from eye level, 20 degree angle left showing front and side wall, full house in frame';
}

function getQualityText() {
  return 'ultra photorealistic real-world exterior photo, real built house, DSLR photo look, realistic materials, natural imperfections, no people, no text, no watermarks, no cartoon, no fake CGI look, high detail';
}

function getSpecialCase(params, floorsKey) {
  const key = `${floorsKey}|${params.style}|${params.roofMaterial}|${params.roofType}`;

  const map = {
    '1|Барнхаус|Профнастил|Двускатная':
      'single-story low elongated barnhouse, clearly one level only, no attic feeling, dark metal roof, dark vertical metal facade with warm wood accents',

    '1|Барнхаус|Фальц|Двускатная':
      'single-story premium barnhouse, clearly one level only, long low rectangular body, standing seam metal roof, no second floor, no upper glazing',

    '1|Барнхаус|Металлочерепица|Двускатная':
      'single-story barnhouse-inspired house, low wide proportions, clearly one level, practical rural modern appearance',

    '1|Современный|Профнастил|Односкатная':
      'single-story modern house with mono-pitch roof, low wide silhouette, one level only',

    '2|Классический|Металлочерепица|Вальмовая':
      'full two-story classical family house with hip roof, clearly visible second floor'
  };

  return map[key] || '';
}

function buildHousePrompt(params, view) {
  const area = parseFloat(params.area) || 90;
  const floorsKey = params.floors || '1';
  const style = STYLE[params.style] || STYLE['Барнхаус'];
  const floors = FLOORS[floorsKey] || FLOORS['1'];
  const roof = ROOF[params.roofType] || ROOF['Двускатная'];
  const roofMat = ROOF_MAT[params.roofMaterial] || ROOF_MAT['Профнастил'];
  const facade = FACADE[params.facade] || '';
  const size = getSizeText(area, floorsKey);
  const windows = getWindowsText(params, floorsKey);
  const door = getDoorText(params);
  const terrace = getTerraceText(params);
  const camera = getCameraText(view, floorsKey);
  const special = getSpecialCase(params, floorsKey);

  if (params.houseType === 'module') {
    const n = params.modulesCount || 1;
    const parts = [
      `Photorealistic exterior photo of ${n} modular prefab timber cabin${n > 1 ? 's connected side by side' : ''}`,
      'strictly low modular volume, no extra floors',
      size,
      'flat or shallow mono-pitch roof, large realistic windows, dark accents',
      terrace,
      'on screw pile foundation',
      getLandscapeText(),
      camera,
      getLightText(),
      getQualityText()
    ].filter(Boolean);

    return parts.join('. ') + '.';
  }

  if (params.style === 'A-frame') {
    const parts = [
      'Photorealistic exterior photo of a real built A-frame cabin',
      STYLE['A-frame'],
      `Roof: ${roofMat}`,
      size,
      windows,
      door,
      terrace,
      'on concrete foundation',
      getLandscapeText(),
      camera,
      getLightText(),
      getQualityText()
    ].filter(Boolean);

    return parts.join('. ') + '.';
  }

  const parts = [
    'Photorealistic exterior photo of a real built timber-frame house',
    special,
    floors,
    size,
    style,
    facade ? `Facade: ${facade}` : '',
    `Roof: ${roof}, ${roofMat}`,
    `${windows}. ${door}`,
    terrace,
    'on concrete strip foundation with gray base',
    getLandscapeText(),
    camera,
    getLightText(),
    getQualityText()
  ].filter(Boolean);

  let prompt = parts.join('. ') + '.';

  if (prompt.length > 3800) {
    prompt = prompt.substring(0, 3800) + '. ultra photorealistic exterior house photo.';
  }

  return prompt;
}

async function generateHouseRenders(params) {
  const frontPrompt = buildHousePrompt(params, 'front');
  const backPrompt = buildHousePrompt(params, 'back');

  console.log('=== DALL-E v4.2 FRONT ===');
  console.log(frontPrompt);
  console.log(`Length: ${frontPrompt.length} chars`);

  console.log('=== DALL-E v4.2 BACK ===');
  console.log(backPrompt);
  console.log(`Length: ${backPrompt.length} chars`);

  const [frontUrl, backUrl] = await Promise.all([
    generateImage(frontPrompt),
    generateImage(backPrompt)
  ]);

  const [frontBuf, backBuf] = await Promise.all([
    downloadFile(frontUrl),
    downloadFile(backUrl)
  ]);

  const frontPath = path.join(os.tmpdir(), `render_front_${Date.now()}.png`);
  const backPath = path.join(os.tmpdir(), `render_back_${Date.now()}.png`);

  fs.writeFileSync(frontPath, frontBuf);
  fs.writeFileSync(backPath, backBuf);

  return { frontPath, backPath };
}

module.exports = {
  chat,
  generateImage,
  downloadFile,
  transcribeVoice,
  generateHouseRenders,
  buildHousePrompt
};
