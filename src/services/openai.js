const OpenAI = require('openai');
const https = require('https');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chat(messages) {
  const r = await openai.chat.completions.create({ model: 'gpt-5.2', messages, max_tokens: 2000, temperature: 0.7 });
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

// ============================================================
// v4.0 RENDER PROMPTS — усовершенствованные промты
// Character bible по 16 реальным рендерам ЭкоКаркас
// Каждый параметр из сметы напрямую влияет на генерацию
// ============================================================

const STYLE_BIBLE = {
  'Барнхаус': {
    body: 'barnhouse timber-frame house, elongated rectangular volume with strict linear proportions, steep symmetrical gable roof with long ridge line and generous 500mm overhanging eaves, dark charcoal-gray vertical corrugated metal cladding (profnastil) covering both walls and gable ends, natural warm honey-brown horizontal wood plank accent panels flanking each window and around entrance door, tall narrow rectangular windows with thin matte-black metal frames, visible dark graphite rain gutters and downpipes, concrete strip foundation painted dark gray, dark composite or metal entrance steps with 3-4 treads, two wall-mounted warm-white LED sconce lights flanking entrance',
    colors: 'walls: dark charcoal-gray corrugated metal (RAL 7024). accents: warm honey-brown natural wood planks (horizontal). window frames: matte black. roof: same dark charcoal metal. foundation: dark gray concrete. gutters: dark graphite',
    signature: 'industrial barn aesthetic, dark metal dominance with warm wood accents creating contrast',
  },
  'Скандинавский': {
    body: 'Scandinavian barnhouse-style timber-frame house, elongated rectangular plan, steep symmetrical gable roof with prominent ridge and wide overhanging eaves, white or cream-white vertical board-and-batten wood plank cladding on walls, dark charcoal-brown wood trim on gable edges and fascia boards, large panoramic floor-to-ceiling windows and sliding glass doors with thin black frames, a long open wooden deck terrace running along the front facade with composite dark-brown decking boards, warm LED path bollard lights along walkway, matte black exterior wall sconce lights, visible dark metal rain gutters',
    colors: 'walls: white or cream-white vertical wood planks (board-and-batten). trim/fascia: dark charcoal-brown wood. windows: thin matte black frames. terrace deck: dark brown composite. roof: dark gray or black matte material. path lights: warm LED bollards',
    signature: 'clean white minimalism with panoramic glazing and nature integration',
  },
  'Классический': {
    body: 'classic traditional timber-frame house, well-proportioned rectangular plan with possible L-shape or cross-gable extensions, multi-pitched roof with prominent ridge and wide overhanging eaves trimmed with natural warm-brown wood fascia boards, smooth white or light cream rendered stucco walls, dark-framed rectangular windows in varied sizes (mix of standard and tall panoramic), covered front porch or terrace with dark metal or wood support columns, warm LED wall sconce lights on facade, dark gray concrete foundation strip, visible dark metal rain gutters with round downpipes, landscaped front with ornamental shrubs and stone pathway',
    colors: 'walls: white or light cream smooth stucco. roof trim/fascia: warm natural brown wood. window frames: dark charcoal or dark brown. roof: dark charcoal-gray metal tile with wave profile. columns: dark metal or stained wood. foundation: gray concrete',
    signature: 'warm traditional elegance with stucco and wood accents',
  },
  'Современный': {
    body: 'modern contemporary timber-frame house, clean rectangular plan, single-pitch mono-slope shed roof angled from high front wall down to lower back, white brick-pattern or light brick-texture facade cladding, large floor-to-ceiling panoramic windows and glass sliding doors with thin black frames, open covered terrace with exposed dark-stained wooden beam columns supporting the extended roof overhang, dark composite or wood deck flooring on terrace with 3-4 wide entrance steps, visible dark metal chimney pipe on roof, minimal landscaping with clean lines, warm LED wall sconce lights, dark gray concrete foundation strip',
    colors: 'walls: white or light cream brick-pattern cladding tiles. roof: dark anthracite gray metal standing-seam. columns: dark-stained natural wood or dark metal. terrace deck: dark brown composite. windows: thin matte black frames. chimney: dark metal pipe. foundation: dark gray',
    signature: 'minimalist cubic forms with mono-slope roof and panoramic glazing',
  },
  'A-frame': {
    body: 'A-frame triangular cabin house, dramatic 60-degree steep roof planes starting from near ground level forming both walls and roof as one continuous surface, dark charcoal metal standing-seam or corrugated roofing on both sloped planes, full-height triangular glass front facade with floor-to-ceiling glazing divided by thin dark metal mullions, visible interior through glass (cozy seating area), dark-stained wood vertical plank cladding on narrow gable-end side walls, raised on low concrete foundation, wide wooden entrance deck platform with 4-5 wide steps spanning full front width, dark composite decking, compact footprint approximately 6x8 meters, warm outdoor seating visible on deck platform',
    colors: 'roof/wall planes: dark charcoal-gray metal (corrugated or standing-seam). front glass: floor-to-ceiling clear glass with dark metal mullions. side walls: dark-stained wood vertical planks. deck: warm brown composite or natural wood. steps: dark-stained wood. base: gray concrete',
    signature: 'dramatic triangular silhouette, glass gable, cabin-in-woods feeling',
  },
};

const ROOF_DESC = {
  'Двускатная': 'classic symmetrical gable roof with two equal sloping planes meeting at prominent center ridge line, steep 35-40 degree pitch, wide 400-500mm overhanging eaves with visible dark fascia boards, clean straight ridge with dark metal ridge cap, triangular gable ends visible on short sides',
  'Односкатная': 'modern single mono-pitch shed roof sloping in one direction from tall front wall down to lower rear wall, 12-18 degree angle creating dramatic asymmetric profile, extended front overhang supported by exposed dark wooden beam columns forming covered terrace, clean horizontal roofline on high side',
  'Вальмовая': 'four-sided hip roof with all four sides sloping inward to short ridge, no exposed gable ends, gentle 25-30 degree pitch, wide overhanging eaves all around with dark fascia trim, elegant traditional appearance with prominent dark metal gutters',
  'Плоская': 'flat roof with minimal invisible drainage slope, clean sharp horizontal roofline creating modern cubic appearance, dark metal edge trim, hidden internal gutters, modern boxy minimalist look',
};

const ROOF_MATERIAL_DESC = {
  'Профнастил': 'dark charcoal-gray corrugated metal sheet roofing, visible subtle vertical ribbed texture, matte industrial finish',
  'Металлочерепица': 'dark charcoal-gray metal tile roofing with elegant repeating wave-shaped profile mimicking ceramic tiles, visible horizontal shadow lines, matte finish',
  'Мягкая кровля': 'dark charcoal-gray architectural bitumen shingles, flat layered fish-scale or rectangular pattern, subtle shadow lines, matte velvety texture',
};

const FACADE_DESC = {
  'Металлический сайдинг / софиты': 'dark charcoal-gray vertical corrugated metal siding on walls with ventilated metal soffit panels under eaves, industrial barnhouse look',
  'Имитация бруса': 'horizontal natural wood plank cladding in warm honey-brown tone, visible horizontal tongue-and-groove joints, natural wood grain texture',
  'Штукатурка (мокрый фасад)': 'smooth white or light cream rendered EIFS stucco finish, perfectly flat clean surface, dark trim strips at floor line and base',
  'Фасадная плитка Hauberk': 'gray or dark-gray brick-pattern facade bitumen tiles covering all walls, subtle rectangular brick texture, white painted corner boards',
  'Комбинация: металл + дерево': 'combination facade: dark charcoal-gray vertical corrugated metal cladding on main wall areas with warm honey-brown horizontal wood plank accent panels flanking windows and around entrance',
  'Комбинация: металл + штукатурка': 'combination facade: smooth white stucco render on main wall surfaces with dark charcoal metal panel accent strips at corners and around window groups',
};

const FLOORS_DESC = {
  '1': 'single-story (one floor), low elongated horizontal proportions, all rooms on ground level, walls approximately 2.7m high, roof starts directly above first-floor walls, windows only on ground level, house appears wide and grounded',
  '1.5': 'one-and-a-half story with habitable attic mansard, ground floor plus upper level under roof slope, MUST have triangular decorative window centered in the gable end wall — this is the KEY distinguishing feature, gable-end window follows roof angle creating triangular or trapezoidal glass area, possible additional small dormer windows on roof slope, knee walls approximately 1.5m on upper floor',
  '2': 'full two-story house, two complete floors with full-height 2.5m walls on both levels, second floor windows aligned directly above first floor windows in regular grid, dark horizontal trim strip between first and second floor creating visual separation, total wall height approximately 5.2m, compact near-square footprint, possible second-floor balcony with dark metal railing',
};

// ============================================================
// v4.0 — УЛУЧШЕННЫЙ buildHousePrompt
// Более точная привязка к параметрам сметы
// Размеры/пропорции рассчитываются по этажности
// ============================================================
function buildHousePrompt(params, view) {
  const style = STYLE_BIBLE[params.style] || STYLE_BIBLE['Современный'];
  const area = parseFloat(params.area) || 90;
  const wCount = parseInt(params.windowsCount) || 8;

  // v4.0: Точный расчёт пропорций по этажности
  let sizeDesc;
  if (params.floors === '2') {
    const halfArea = Math.round(area / 2);
    const side2 = Math.round(Math.sqrt(halfArea));
    sizeDesc = `compact ${side2}m x ${side2}m footprint (${halfArea} sq.m per floor, ${area} sq.m total), two full floors creating near-square compact volume`;
  } else if (params.floors === '1.5') {
    const groundArea = Math.round(area * 0.65);
    const side15 = Math.round(Math.sqrt(groundArea));
    sizeDesc = `${side15}m x ${side15}m footprint (${area} sq.m total including mansard), moderate proportions`;
  } else {
    const sideLen = Math.round(Math.sqrt(area));
    sizeDesc = `elongated ${sideLen}m x ${Math.round(sideLen * 0.8)}m footprint (${area} sq.m single floor), wide low-profile horizontal appearance`;
  }

  const floorsDesc = FLOORS_DESC[params.floors] || FLOORS_DESC['1'];
  const roofDesc = ROOF_DESC[params.roofType] || ROOF_DESC['Двускатная'];
  const roofMatDesc = ROOF_MATERIAL_DESC[params.roofMaterial] || ROOF_MATERIAL_DESC['Профнастил'];
  const facadeDesc = FACADE_DESC[params.facade] || 'neutral light-colored siding';

  // v4.0: Окна — точное описание из параметров сметы
  let windowDesc = `exactly ${wCount} windows visible on this facade`;
  if (params.windows && params.windows.includes('ламинация')) {
    windowDesc += params.windows.includes('2 стороны')
      ? ', PVC frames with wood-grain lamination on BOTH sides (warm brown-toned)'
      : ', PVC frames with wood-grain lamination on exterior (warm brown-toned)';
  } else {
    windowDesc += ', clean white PVC double-glazed frames';
  }
  if (params.floors === '1.5') windowDesc += ', MUST include triangular gable window and optional dormer skylights';
  if (params.floors === '2') windowDesc += ', windows on BOTH floors in aligned grid pattern';

  // v4.0: Дверь — точное соответствие
  let doorDesc = 'standard metal entrance door with dark finish';
  if (params.door) {
    if (params.door.includes('пластик')) doorDesc = 'modern white PVC entrance door with frosted glass insert, contemporary look';
    else if (params.door.includes('премиум')) doorDesc = 'premium heavy metal entrance door with decorative forged panel, dark bronze finish, elegant handle';
    else if (params.door.includes('стандарт')) doorDesc = 'standard quality metal entrance door with clean panel design, dark graphite finish';
    else if (params.door.includes('эконом')) doorDesc = 'basic metal entrance door, simple flat panel, dark gray finish';
  }

  // v4.0: Терраса — полная детализация
  let terraceDesc = '';
  if (params.terrace && parseFloat(params.terraceArea) > 0) {
    const tArea = parseFloat(params.terraceArea);
    if (params.terraceType === 'открытая') {
      terraceDesc = `open wooden deck terrace (${tArea} sq.m) with dark-brown composite decking boards extending from front facade`;
      if (params.terraceRailing > 0) terraceDesc += `, wooden or metal railing along ${params.terraceRailing} running meters, railing height ~1m with vertical balusters`;
      if (params.terraceSteps) terraceDesc += ', wide wooden entrance steps with 3-4 treads leading up to deck';
    } else {
      terraceDesc = `enclosed glazed terrace / winter garden (${tArea} sq.m) with full-height glass walls and transparent roof, visible warm interior lighting`;
      if (params.terraceRailing > 0) terraceDesc += `, lower portion with solid railing below glass`;
      if (params.terraceSteps) terraceDesc += ', entrance steps with roof-covered landing';
    }
  }

  // ========== МОДУЛЬ ==========
  if (params.houseType === 'module') {
    const modCount = params.modulesCount || 1;
    const modWord = modCount === 1 ? 'a single modular' : `${modCount} modular`;
    const modConnect = modCount > 1 ? ', modules connected side by side sharing common wall, forming single unified building' : '';
    return `Photorealistic architectural exterior photograph of ${modWord} prefabricated timber-frame cabin${modCount > 1 ? 's' : ''}${modConnect}. Modern compact design with flat or shallow mono-pitch metal standing-seam roof. Composite wood panel facade with dark accents. Large rectangular windows with thin dark frames. ${sizeDesc}. House placed on visible screw pile foundation. ${terraceDesc ? terraceDesc + '. ' : ''}Flat green manicured lawn, mature pine trees and birch trees in background, ornamental shrubs. ${view === 'front' ? 'Front facade view showing main entrance, camera at eye level, slight 20-degree angle to left' : 'Rear garden view, camera at eye level, slight 20-degree angle to right'}. Golden hour warm evening sunlight, soft warm shadows. Professional architectural magazine photography, ultra-photorealistic archviz V-Ray quality, sharp material textures, no text, no people, no CGI artifacts, 8K resolution.`;
  }

  // ========== ОСНОВНОЙ ПРОМТ ==========
  const parts = [
    'Photorealistic architectural exterior photograph of a residential timber-frame house',
    style.body,
    floorsDesc,
    sizeDesc,
    roofDesc,
    roofMatDesc,
    facadeDesc,
    windowDesc,
    doorDesc,
  ];

  if (terraceDesc) parts.push(terraceDesc);
  parts.push('house stands on concrete strip foundation with dark gray painted base, visible screw pile caps under foundation');
  parts.push(style.colors);

  if (view === 'front') {
    parts.push('CAMERA: front facade three-quarter view from eye level (1.5m height), camera positioned slightly to the left at 20-degree angle showing both front and one side wall for depth, centered on entrance, entire house visible in frame with generous sky space above');
  } else {
    parts.push('CAMERA: rear garden three-quarter view from eye level (1.5m height), camera positioned slightly to the right at 20-degree angle showing back facade and one side wall, entire house visible, backyard perspective with more lawn');
  }

  parts.push('ENVIRONMENT: flat well-manicured bright green lawn, mature deciduous trees and tall pine/spruce trees forming dense green background, ornamental shrubs (boxwood spheres, japanese maples with red leaves, blooming cherry trees), gray stone paver walkway leading to entrance, no cars, no people, no fences in front');
  parts.push('LIGHTING: warm golden hour evening light from left side, soft warm glow from wall-mounted LED sconce lights on facade (2-3 lights), gentle ambient fill, soft natural shadows on lawn, warm dramatic mood');
  parts.push(`STYLE: ultra-photorealistic architectural visualization (archviz), V-Ray or Corona renderer quality, sharp details on all materials, shallow depth-of-field with soft background trees, ${style.signature}. No text, no watermarks, no people, no CGI artifacts, no cartoon, no illustration, 16:9 aspect ratio, 8K resolution.`);

  let prompt = parts.join('. ') + '.';
  if (prompt.length > 3800) prompt = prompt.substring(0, 3800) + '. 8K ultra-photorealistic archviz.';
  return prompt;
}

async function generateHouseRenders(params) {
  const frontPrompt = buildHousePrompt(params, 'front');
  const backPrompt = buildHousePrompt(params, 'back');

  console.log('=== DALL-E v4.0 FRONT ===');
  console.log(frontPrompt.substring(0, 500) + '...');
  console.log(`Length: ${frontPrompt.length} chars`);
  console.log('=== DALL-E v4.0 BACK ===');
  console.log(backPrompt.substring(0, 500) + '...');
  console.log(`Length: ${backPrompt.length} chars`);

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

module.exports = { chat, generateImage, downloadFile, transcribeVoice, generateHouseRenders, buildHousePrompt };
