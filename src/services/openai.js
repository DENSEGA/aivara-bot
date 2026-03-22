const OpenAI = require('openai');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { File } = require('node:buffer');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================
// PATHS
// openai.js находится в: AIVARA/src/services/openai.js
// houses лежит в:        AIVARA/houses
// ============================================================

const HOUSES_DIR = path.join(__dirname, '..', '..', 'houses');
const TEMP_DIR = path.join(os.tmpdir(), 'aivara-renders');

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

ensureDirSync(TEMP_DIR);

// ============================================================
// БАЗОВЫЕ ФУНКЦИИ
// ============================================================

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
    model: 'gpt-image-1',
    prompt,
    size: '1536x1024'
  });

  // GPT Image обычно возвращает b64_json, но добавляю защиту и на URL
  if (r.data?.[0]?.b64_json) {
    const outPath = path.join(TEMP_DIR, `generated_${Date.now()}.png`);
    fs.writeFileSync(outPath, Buffer.from(r.data[0].b64_json, 'base64'));
    return outPath;
  }

  if (r.data?.[0]?.url) {
    const buf = await downloadFile(r.data[0].url);
    const outPath = path.join(TEMP_DIR, `generated_${Date.now()}.png`);
    fs.writeFileSync(outPath, buf);
    return outPath;
  }

  throw new Error('OpenAI image generation returned no image data');
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
// КАРТЫ ДОМОВ
// Используем только реально имеющиеся изображения
// ============================================================

const HOUSE_MAP = {
  'Барнхаус_1': 'barnhaus_1.png',
  'Скандинавский_1': 'scandinavian_1.png',
  'Классический_1': 'classic_1.png',
  'Классический_2': 'classic_2.png',
  'Современный_1': 'modern_1.png',
  'Современный_2': 'modern_2.png',
  'A-frame': 'a-frame.png',
  'module': 'module.jpg'
};

function getReferenceHouseFile(params) {
  // Отдельные спец-типы
  if (params.houseType === 'module') return HOUSE_MAP['module'];
  if (params.style === 'A-frame') return HOUSE_MAP['A-frame'];

  // Основной ключ: стиль + этажность
  const floors = String(params.floors || '1');
  const key = `${params.style}_${floors}`;

  if (HOUSE_MAP[key]) {
    return HOUSE_MAP[key];
  }

  // Мягкие fallback-и, чтобы ничего не падало
  if (params.style === 'Барнхаус') return HOUSE_MAP['Барнхаус_1'];
  if (params.style === 'Скандинавский') return HOUSE_MAP['Скандинавский_1'];
  if (params.style === 'Классический') {
    return floors === '2' ? HOUSE_MAP['Классический_2'] : HOUSE_MAP['Классический_1'];
  }
  if (params.style === 'Современный') {
    return floors === '2' ? HOUSE_MAP['Современный_2'] : HOUSE_MAP['Современный_1'];
  }

  return HOUSE_MAP['Барнхаус_1'];
}

// ============================================================
// ОПИСАНИЯ ТОЛЬКО ДЛЯ ИЗМЕНЯЕМЫХ ЭЛЕМЕНТОВ
// Меняем только:
// 1. фасад
// 2. кровлю
// 3. цвет окон
// ============================================================

const FACADE_EDIT = {
  'Металлический сайдинг / софиты':
    'dark charcoal metal siding facade with matching soffits',
  'Имитация бруса':
    'warm natural wood cladding facade with realistic grain',
  'Штукатурка (мокрый фасад)':
    'light plaster facade with subtle mineral texture',
  'Фасадная плитка Hauberk':
    'gray brick-pattern facade tiles with clear masonry rhythm',
  'Комбинация: металл + дерево':
    'combined facade of dark metal cladding and warm natural wood accents',
  'Комбинация: металл + штукатурка':
    'combined facade of light plaster and dark metal accent elements'
};

const ROOF_EDIT = {
  'Профнастил':
    'corrugated metal roofing with visible profile',
  'Металлочерепица':
    'metal tile roofing with realistic repeating wave profile',
  'Мягкая кровля':
    'bitumen shingle roofing with layered matte texture',
  'Фальц':
    'standing seam metal roofing with straight seam lines'
};

function getWindowColorText(params) {
  // Пытаемся взять пользовательский цвет напрямую
  if (params.windowColor && String(params.windowColor).trim()) {
    return String(params.windowColor).trim();
  }

  // Если ранее использовался параметр windows
  if (params.windows && params.windows.includes('ламинация')) {
    return 'brown wood-grain laminated window frames';
  }
  if (params.windows && params.windows.includes('бел')) {
    return 'white window frames';
  }
  if (params.windows && params.windows.includes('чер')) {
    return 'black window frames';
  }

  return 'dark gray window frames';
}

// ============================================================
// ЖЁСТКИЙ EDIT PROMPT
// ============================================================

function buildHouseEditPrompt(params) {
  const facadeText =
    FACADE_EDIT[params.facade] || 'modern realistic facade finish';
  const roofText =
    ROOF_EDIT[params.roofMaterial] || 'dark metal roofing';
  const windowText = getWindowColorText(params);

  return `
Ultra photorealistic edit of a real house photo.

IMPORTANT:
Use the provided reference image as the fixed base.
Preserve the exact building from the reference image.

DO NOT CHANGE:
- house shape
- floor count
- roof geometry
- roof slope
- wall height
- proportions
- window positions
- door positions
- terrace shape
- foundation shape
- camera angle
- perspective
- framing
- composition
- surrounding objects layout

Keep the same exact house and the same scene.

CHANGE ONLY THESE ELEMENTS:
1. facade finish -> ${facadeText}
2. roofing material -> ${roofText}
3. window frame color -> ${windowText}

REALISM REQUIREMENTS:
- must look like a real built house photo
- preserve realistic materials
- preserve realistic shadows
- preserve realistic reflections in windows
- no CGI look
- no cartoon look
- no redesign of architecture
- no extra windows
- no removed windows
- no added floors
- no changed roof form

If anything except facade, roof material, and window frame color changes, the result is incorrect.
`.trim();
}

// ============================================================
// ПОИСК И ПРОВЕРКА ФАЙЛА ДОМА
// ============================================================

function getReferenceHousePath(params) {
  const fileName = getReferenceHouseFile(params);
  const filePath = path.join(HOUSES_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Файл дома не найден: ${filePath}`);
  }

  return filePath;
}

// ============================================================
// ОСНОВНОЙ РЕЖИМ: РЕДАКТИРОВАНИЕ ПО ГОТОВОМУ ИЗОБРАЖЕНИЮ
// ============================================================

async function editHouseFromReference(params) {
  const referencePath = getReferenceHousePath(params);
  const prompt = buildHouseEditPrompt(params);

  console.log('=== HOUSES DIR ===');
  console.log(HOUSES_DIR);

  console.log('=== REFERENCE IMAGE ===');
  console.log(referencePath);

  console.log('=== EDIT PROMPT ===');
  console.log(prompt);
  console.log(`Length: ${prompt.length} chars`);

  const imageStream = fs.createReadStream(referencePath);

  const r = await openai.images.edit({
    model: 'gpt-image-1',
    image: imageStream,
    prompt,
    size: '1536x1024'
  });

  let outputBuffer = null;

  if (r.data?.[0]?.b64_json) {
    outputBuffer = Buffer.from(r.data[0].b64_json, 'base64');
  } else if (r.data?.[0]?.url) {
    outputBuffer = await downloadFile(r.data[0].url);
  } else {
    throw new Error('OpenAI image edit returned no image data');
  }

  const outPath = path.join(TEMP_DIR, `house_edit_${Date.now()}.png`);
  fs.writeFileSync(outPath, outputBuffer);

  return outPath;
}

// ============================================================
// СОВМЕСТИМОСТЬ СО СТАРОЙ ЛОГИКОЙ БОТА
// Раньше бот ждал frontPath и backPath.
// Сейчас у нас одна картинка.
// Возвращаем один и тот же путь в оба поля.
// ============================================================

async function generateHouseRenders(params) {
  const editedPath = await editHouseFromReference(params);

  return {
    frontPath: editedPath,
    backPath: editedPath
  };
}

// ============================================================

module.exports = {
  chat,
  generateImage,
  downloadFile,
  transcribeVoice,
  generateHouseRenders,
  buildHouseEditPrompt
};
