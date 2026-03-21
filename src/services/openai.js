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
 
// ============================================================
// v4.0 РЕНДЕРЫ — переписаны по 20 реальным рендерам ЭкоКаркас
// Принцип: КОРОТКИЕ промты, ПРОСТАЯ форма, ЖЁСТКИЙ контроль этажности
// ============================================================
 
// По IMG_7417+7416: тёмный вертикальный профлист, дерево вокруг окон, прямоугольник
const STYLE = {
  'Барнхаус': 'dark charcoal vertical corrugated metal siding walls, warm brown horizontal wood plank accent panels around each window and door, thin black window frames, dark metal gable roof, dark gray foundation, small LED wall lights',
  // По IMG_7405+7404: белая вертикальная доска, панорамные окна, длинная терраса
  'Скандинавский': 'white vertical board-and-batten wood cladding walls, dark brown wood trim on fascia and gable edges, large panoramic floor-to-ceiling windows with thin black frames, dark composite deck terrace along front, LED path bollard lights',
  // По IMG_7415+7414+7408: белая штукатурка, тёплые коричневые карнизы, металлочерепица
  'Классический': 'smooth white stucco render walls, warm brown wood fascia boards and eave trim, dark charcoal metal tile roof, dark-framed windows, LED wall sconce lights, gray concrete foundation',
  // По IMG_7403+7402: белая кирпичная плитка, односкатная, деревянные столбы
  'Современный': 'white brick-pattern facade tiles, dark-stained wood beam columns supporting roof overhang, large panoramic windows with black frames, dark metal chimney pipe, dark composite deck, LED wall lights',
  // По IMG_7407+7406: треугольник, стеклянный фронтон, тёмный металл, деревянная площадка
  'A-frame': 'dramatic A-frame triangular shape, steep roof planes from ground forming walls and roof as one surface, dark charcoal corrugated metal roof, full-height triangular glass front facade with dark metal mullions, dark wood vertical plank side walls, wide wood deck platform with steps',
};
 
// Крыша — коротко
const ROOF = {
  'Двускатная': 'symmetrical gable roof, steep pitch, dark overhanging eaves',
  'Односкатная': 'modern mono-pitch shed roof sloping from high front to low rear, extended front overhang with exposed wood beam columns',
  'Вальмовая': 'four-sided hip roof, all sides slope inward, wide eaves all around',
  'Плоская': 'flat roof with sharp horizontal roofline, dark metal edge trim, modern cubic look',
};
 
// Материал крыши — коротко
const ROOF_MAT = {
  'Профнастил': 'dark charcoal corrugated metal sheet roofing',
  'Металлочерепица': 'dark charcoal metal tile roofing with wave profile',
  'Мягкая кровля': 'dark charcoal architectural bitumen shingles',
};
 
// Фасад — коротко, по рендерам
const FACADE = {
  'Металлический сайдинг / софиты': 'dark charcoal vertical corrugated metal siding, metal soffit under eaves',
  'Имитация бруса': 'warm honey-brown horizontal wood plank cladding, visible tongue-and-groove joints',
  'Штукатурка (мокрый фасад)': 'smooth white stucco render, dark trim at base and corners',
  'Фасадная плитка Hauberk': 'gray brick-pattern bitumen facade tiles, white painted corner boards and window surrounds',
  'Комбинация: металл + дерево': 'dark charcoal vertical corrugated metal on main walls, warm brown horizontal wood accent panels around windows and entrance',
  'Комбинация: металл + штукатурка': 'white stucco main walls, dark charcoal metal accent strips at corners and around windows',
};
 
// Этажность — ЖЁСТКИЙ контроль, это ключевое
const FLOORS = {
  '1': 'STRICTLY single-story ONE floor ONLY, low elongated horizontal rectangular shape, walls 2.7m high, roof directly above ground floor, NO second floor, NO attic windows, house is WIDE and LOW',
  '1.5': 'one-and-a-half story with mansard attic, ground floor plus habitable attic under roof, MUST have triangular decorative window in gable end wall, possible small dormer windows in roof slope, taller than single-story but shorter than full two-story',
  '2': 'full two-story house, compact near-square plan, two complete floors with windows on both levels, dark horizontal trim strip separating floors, second floor balcony with metal railing, total height about 5.2m walls',
};
 
// ============================================================
// Главная функция — КОРОТКИЙ промт
// ============================================================
function buildHousePrompt(params, view) {
  const area = parseFloat(params.area) || 90;
  const style = STYLE[params.style] || STYLE['Барнхаус'];
  const floors = FLOORS[params.floors] || FLOORS['1'];
  const roof = ROOF[params.roofType] || ROOF['Двускатная'];
  const roofMat = ROOF_MAT[params.roofMaterial] || ROOF_MAT['Профнастил'];
  const facade = FACADE[params.facade] || '';
  const wCount = parseInt(params.windowsCount) || 8;
 
  // Размер
  let size;
  if (params.floors === '2') {
    const s = Math.round(Math.sqrt(area / 2));
    size = `compact ${s}x${s}m footprint, two full floors`;
  } else if (params.floors === '1.5') {
    const s = Math.round(Math.sqrt(area * 0.65));
    size = `${s}x${s}m footprint with mansard attic`;
  } else {
    const w = Math.round(Math.sqrt(area) * 1.2);
    const d = Math.round(area / w);
    size = `elongated ${w}x${d}m footprint, single floor`;
  }
 
  // Окна
  let win = `${wCount} windows`;
  if (params.windows && params.windows.includes('ламинация')) win += ' with brown wood-grain laminated PVC frames';
  else win += ' with white PVC frames';
 
  // Дверь
  let door = 'dark metal entrance door';
  if (params.door && params.door.includes('пластик')) door = 'white PVC entrance door with glass panel';
  else if (params.door && params.door.includes('премиум')) door = 'premium dark bronze metal entrance door';
 
  // Терраса
  let terrace = '';
  if (params.terrace && parseFloat(params.terraceArea) > 0) {
    const tA = parseFloat(params.terraceArea);
    if (params.terraceType === 'открытая') {
      terrace = `open wood deck terrace ${tA}sqm with dark composite decking`;
      if (params.terraceRailing > 0) terrace += `, railing ${params.terraceRailing}m`;
      if (params.terraceSteps) terrace += ', wood entrance steps';
    } else {
      terrace = `enclosed glass terrace ${tA}sqm with glass walls and roof`;
      if (params.terraceSteps) terrace += ', entrance steps';
    }
  }
 
  // Камера
  const cam = view === 'front'
    ? 'front three-quarter view from eye level, 20deg angle left showing front and side wall, full house in frame'
    : 'rear three-quarter view from eye level, 20deg angle right showing back facade and side wall';
 
  // === МОДУЛЬ ===
  if (params.houseType === 'module') {
    const n = params.modulesCount || 1;
    return `Photorealistic exterior photo of ${n} modular prefab timber cabin${n > 1 ? 's connected side by side' : ''}, flat or shallow mono-pitch metal roof, composite wood panel facade, dark accents, large windows, on screw pile foundation. ${size}. ${terrace ? terrace + '. ' : ''}Green lawn, pine trees background. ${cam}. Golden hour light. Archviz V-Ray quality, sharp textures, no people, no text, no CGI look, 8K.`;
  }
 
  // === A-FRAME ===
  if (params.style === 'A-frame') {
    return `Photorealistic exterior photo of an A-frame cabin: ${STYLE['A-frame']}. ${roofMat}. ${size}. ${win}. ${door}. ${terrace ? terrace + '. ' : ''}On concrete foundation, green lawn, mixed trees background, ornamental shrubs. ${cam}. Golden hour warm light, LED wall lights on facade. Archviz V-Ray quality, no people, no text, no CGI, 8K.`;
  }
 
  // === ОСНОВНОЙ ===
  const parts = [
    `Photorealistic exterior photo of a timber-frame house`,
    floors,
    size,
    style,
    facade ? `Facade: ${facade}` : '',
    `Roof: ${roof}, ${roofMat}`,
    `${win}. ${door}`,
    terrace,
    `On concrete strip foundation with gray base, green manicured lawn, pine and birch trees background, ornamental shrubs, stone paver walkway`,
    cam,
    `Golden hour warm evening light from left, warm LED wall sconce lights on facade, soft shadows on lawn`,
    `Archviz V-Ray render quality, sharp material textures, no people, no text, no watermarks, no CGI artifacts, no cartoon, 8K resolution`,
  ].filter(Boolean);
 
  let prompt = parts.join('. ') + '.';
 
  // Обрезка до лимита DALL-E
  if (prompt.length > 3800) prompt = prompt.substring(0, 3800) + '. 8K photorealistic archviz.';
 
  return prompt;
}
 
async function generateHouseRenders(params) {
  const frontPrompt = buildHousePrompt(params, 'front');
  const backPrompt = buildHousePrompt(params, 'back');
 
  console.log('=== DALL-E v4.0 FRONT ===');
  console.log(frontPrompt);
  console.log(`Length: ${frontPrompt.length} chars`);
  console.log('=== DALL-E v4.0 BACK ===');
  console.log(backPrompt);
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
 
