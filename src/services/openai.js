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
    proto
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return downloadFile(res.headers.location).then(resolve).catch(reject);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
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
// v5.0 РЕНДЕРЫ — совместимо с твоим текущим ботом
// Главная задача: жёсткий контроль этажности + более живой реализм
// ============================================================

const STYLE = {
  'Барнхаус':
    'modern barnhouse architecture, elongated rectangular massing, restrained Scandinavian rural character, simple clean lines, buildable real-life proportions, no decorative excess',

  'Скандинавский':
    'Scandinavian country house architecture, calm cozy minimal design, practical proportions, restrained detailing, realistic frame-house appearance',

  'Классический':
    'classic family country house architecture, traditional suburban proportions, balanced residential composition, comfortable real-life family home',

  'Современный':
    'modern contemporary country house architecture, clean lines, large realistic windows, restrained premium detailing, buildable real-life design',

  'A-frame':
    'A-frame cabin architecture, steep triangular silhouette, roof planes descending low, compact alpine-style real built cabin'
};

const ROOF = {
  'Двускатная':
    'gable roof with realistic residential pitch, believable ridge line, practical overhangs',
  'Односкатная':
    'mono-pitch shed roof with realistic slope, practical residential geometry, not futuristic',
  'Вальмовая':
    'hip roof with realistic eaves and suburban residential proportions',
  'Плоская':
    'flat roof with low slope, hidden drainage or parapet, realistic modern residential geometry'
};

const ROOF_MAT = {
  'Профнастил':
    'dark charcoal corrugated metal roofing with visible wave profile, matte reflections, realistic joints and overlap lines',

  'Металлочерепица':
    'dark charcoal metal tile roofing with believable repeating profile, realistic sheet rhythm and subtle reflections',

  'Мягкая кровля':
    'dark charcoal bitumen shingles with layered roofing texture, soft matte finish and realistic material depth',

  'Фальц':
    'standing seam metal roof, straight seam rhythm, premium restrained appearance, subtle realistic reflections'
};

const FACADE = {
  'Металлический сайдинг / софиты':
    'facade finished with dark charcoal metal siding and matching soffits, realistic seams, slight waviness, subtle weathering',

  'Имитация бруса':
    'facade finished with warm honey-brown imitation timber cladding, visible wood grain, natural color variation, realistic plank joints',

  'Штукатурка (мокрый фасад)':
    'facade finished with light mineral plaster, subtle surface texture, realistic corners, slight dirt near the base',

  'Фасадная плитка Hauberk':
    'facade finished with brick-pattern facade tiles, realistic masonry rhythm, visible overlap texture, believable trim details',

  'Комбинация: металл + дерево':
    'combined facade of dark metal cladding and warm natural wood accent panels, realistic material junctions, restrained modern contrast',

  'Комбинация: металл + штукатурка':
    'combined facade of light plaster walls with dark metal accent strips and trims, restrained modern contrast and believable construction logic'
};

const FLOORS = {
  '1': `
CRITICAL ARCHITECTURAL RULE:
strictly ONE-STORY house only.
exactly one ground floor.
low horizontal bungalow proportions.
roof begins directly above first-floor walls.

ABSOLUTE RESTRICTIONS:
no second floor,
no half-story,
no mansard attic,
no dormer windows,
no upper-level windows,
no upper balcony,
no tall facade suggesting two levels.
`,

  '1.5': `
CRITICAL ARCHITECTURAL RULE:
one-and-a-half-story house.
one full ground floor plus attic level under the roof.

ABSOLUTE REQUIREMENTS:
attic level must be visibly smaller than the main floor,
roof volume clearly contains habitable attic,
upper glazing may exist only as attic-level glazing.

ABSOLUTE RESTRICTIONS:
not a full two-story box house,
not a plain single-story bungalow.
`,

  '2': `
CRITICAL ARCHITECTURAL RULE:
strictly TWO-STORY house.
two full visible floors.
clear first-floor windows and clear second-floor windows.

ABSOLUTE REQUIREMENTS:
full wall-height second level,
roof clearly located above the second floor,
overall proportions must clearly show two full levels.

ABSOLUTE RESTRICTIONS:
not one-story,
not mansard-only,
not compressed upper floor.
`
};

function getSizeText(area, floors) {
  if (floors === '2') {
    const s = Math.max(7, Math.round(Math.sqrt(area / 2)));
    return `compact footprint approximately ${s}x${s} meters, two full floors, realistic family-house proportions`;
  }

  if (floors === '1.5') {
    const s = Math.max(8, Math.round(Math.sqrt(area * 0.65)));
    return `balanced footprint approximately ${s}x${s} meters with habitable attic under the roof, realistic mansard proportions`;
  }

  const w = Math.max(10, Math.round(Math.sqrt(area) * 1.2));
  const d = Math.max(6, Math.round(area / w));
  return `elongated footprint approximately ${w}x${d} meters, single-story low horizontal house proportions`;
}

function getWindowText(params, floors) {
  const wCount = parseInt(params.windowsCount) || 8;

  let frame = 'white PVC window frames';
  if (params.windows && params.windows.includes('ламинация')) {
    frame = 'brown wood-grain laminated PVC window frames';
  }

  let floorRule = '';
  if (floors === '1') {
    floorRule = 'all windows belong only to the ground floor, no upper row of windows';
  } else if (floors === '2') {
    floorRule = 'windows clearly distributed across two full floors';
  } else {
    floorRule = 'ground-floor windows plus smaller attic-level glazing under the roof';
  }

  return `${wCount} realistically sized windows, ${frame}, natural reflections of sky and trees in glass, believable placement, ${floorRule}`;
}

function getDoorText(params) {
  let door = 'dark metal entrance door, realistic handle and trim';

  if (params.door && params.door.includes('пластик')) {
    door = 'white PVC entrance door with glazed insert, realistic handle and trim';
  } else if (params.door && params.door.includes('премиум')) {
    door = 'premium dark bronze metal entrance door with refined detailing, realistic handle and trim';
  }

  return door;
}

function getTerraceText(params) {
  if (!params.terrace || parseFloat(params.terraceArea) <= 0) {
    return 'small entrance porch only or minimal entrance platform, no oversized terrace';
  }

  const tA = parseFloat(params.terraceArea);

  if (params.terraceType === 'открытая') {
    let txt = `open terrace approximately ${tA} square meters with realistic wooden or composite decking boards`;
    if (params.terraceRailing > 0) txt += `, railing about ${params.terraceRailing} meters`;
    if (params.terraceSteps) txt += ', realistic entrance steps';
    txt += ', terrace proportional to the house and not dominating the architecture';
    return txt;
  }

  let txt = `enclosed glazed terrace approximately ${tA} square meters with realistic frame divisions and believable support structure`;
  if (params.terraceSteps) txt += ', realistic entrance steps';
  txt += ', proportional to the house';
  return txt;
}

function getLandscapeText() {
  return `
house placed on a believable landscaped plot near mixed forest,
realistic lawn with slight unevenness and color variation,
pine trees, birches, ornamental shrubs arranged asymmetrically,
concrete or stone pathways with slight wear and dirt near edges,
subtle soil transition near foundation,
no perfect catalog symmetry,
no fantasy garden,
looks like a real finished plot in Russia or Northern Europe
`;
}

function getLightingText() {
  return `
soft natural late-afternoon or golden-hour light,
physically correct sun direction,
realistic soft-edged shadows,
subtle warm facade wall lights if suitable,
no overexposure,
no surreal dramatic lighting,
looks like professional exterior real-estate photography
`;
}

function getCameraText(view, floors) {
  if (view === 'back') {
    return `
rear three-quarter eye-level view,
show the whole house and one side wall,
real-camera perspective, 28mm to 35mm lens,
no drone angle,
no top-down view,
vertical lines corrected
`;
  }

  let extra = '';
  if (floors === '1') extra = 'camera must clearly emphasize low one-story proportions';
  if (floors === '2') extra = 'camera must clearly show both floors without ambiguity';
  if (floors === '1.5') extra = 'camera must clearly show the main floor and attic under the roof';

  return `
front three-quarter eye-level view,
show full front facade and one side wall,
real-camera perspective, 28mm to 35mm lens,
no drone angle,
no top-down view,
vertical lines corrected,
${extra}
`;
}

function getSpecialCase(params) {
  const key = `${params.floors}|${params.style}|${params.roofMaterial}|${params.roofType}`;

  const map = {
    '1|Барнхаус|Профнастил|Двускатная':
      'single-story low elongated barnhouse, dark corrugated roof, restrained modern rural appearance, no attic feeling, no second level',

    '1|Барнхаус|Металлочерепица|Двускатная':
      'single-story barnhouse-inspired country house with practical rural character, elongated body, clear one-level proportions',

    '1|Барнхаус|Фальц|Двускатная':
      'single-story premium barnhouse with standing seam metal roof, elongated low rectangular volume, restrained minimal architecture, clearly one level only',

    '1|Современный|Профнастил|Односкатная':
      'single-story modern house with mono-pitch roof, wide low silhouette, realistic built project, no second floor',

    '1|Скандинавский|Мягкая кровля|Двускатная':
      'single-story Scandinavian house, calm cozy proportions, large realistic windows, restrained detailing, clearly one level only',

    '2|Классический|Металлочерепица|Вальмовая':
      'two-story classical family house, balanced suburban proportions, clear second floor, realistic cottage-settlement appearance',

    '2|Современный|Профнастил|Плоская':
      'two-story modern cubic house with flat roof, clear full second floor, premium but buildable architecture'
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
  const win = getWindowText(params, floorsKey);
  const door = getDoorText(params);
  const terrace = getTerraceText(params);
  const cam = getCameraText(view, floorsKey);
  const special = getSpecialCase(params);

  if (params.houseType === 'module') {
    const n = params.modulesCount || 1;

    let prompt = `
Ultra-photorealistic exterior image of ${n} modular prefab timber cabin${n > 1 ? 's connected side by side' : ''}.
Real built modular house, not concept art.
Strictly low modular volume, no extra floors, no invented wings.
Flat or shallow mono-pitch roof, realistic modular proportions, dark accents, large believable windows.
Facade with composite or wood-like panels, realistic seams and mounting rhythm.
${terrace}.
Placed on screw pile foundation.
${getLandscapeText()}
${getLightingText()}
${cam}
professional real-estate photography, physically based materials, micro imperfections, realistic drainage details, no people, no text, no cartoon, no glossy CGI look.
`;

    prompt = prompt.replace(/\n{2,}/g, '\n').trim();
    if (prompt.length > 3500) prompt = prompt.slice(0, 3500);
    return prompt;
  }

  if (params.style === 'A-frame') {
    let prompt = `
Ultra-photorealistic exterior image of a real built A-frame cabin.
${STYLE['A-frame']}.
Roof material: ${roofMat}.
${size}.
${win}.
${door}.
${terrace}.
Placed on realistic concrete foundation.
${getLandscapeText()}
${getLightingText()}
${cam}
professional exterior real-estate photo, physically accurate materials, subtle imperfections, realistic wood, realistic metal, no people, no text, no cartoon, no fake CGI look.
`;

    prompt = prompt.replace(/\n{2,}/g, '\n').trim();
    if (prompt.length > 3500) prompt = prompt.slice(0, 3500);
    return prompt;
  }

  let prompt = `
Ultra-photorealistic exterior image of a real built timber-frame country house.
Not a concept render, not a sketch, not CGI art.

${special}

ARCHITECTURAL STYLE:
${style}

FLOOR CONTROL:
${floors}

SIZE AND PROPORTIONS:
${size}

ROOF:
${roof}
${roofMat}

FACADE:
${facade}

OPENINGS:
${win}
${door}

TERRACE / PORCH:
${terrace}

SITE:
${getLandscapeText()}

LIGHT:
${getLightingText()}

CAMERA:
${cam}

QUALITY RULES:
indistinguishable from real photography,
physically based materials,
realistic construction tolerances,
realistic foundation plinth,
realistic gutter and drainage details,
subtle dirt near base,
natural reflections in windows,
no perfect geometry,
no fantasy elements,
no people,
no text,
no watermark,
no cartoon,
no glossy fake render look.
`;

  prompt = prompt.replace(/\n{2,}/g, '\n').trim();
  if (prompt.length > 3500) prompt = prompt.slice(0, 3500);

  return prompt;
}

async function generateHouseRenders(params) {
  const frontPrompt = buildHousePrompt(params, 'front');
  const backPrompt = buildHousePrompt(params, 'back');

  console.log('=== DALL-E v5 FRONT ===');
  console.log(frontPrompt);
  console.log(`Length: ${frontPrompt.length} chars`);

  console.log('=== DALL-E v5 BACK ===');
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