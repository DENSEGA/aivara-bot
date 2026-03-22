'use strict';

const OpenAI = require('openai');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { File } = require('node:buffer');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================
// PATHS
// openai.js: AIVARA/src/services/openai.js
// houses:    AIVARA/houses
// ============================================================

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const HOUSES_DIR = path.join(PROJECT_ROOT, 'houses');
const TEMP_DIR_PRIMARY = path.join(PROJECT_ROOT, 'temp');
const TEMP_DIR_FALLBACK = path.join(os.tmpdir(), 'aivara-temp');

function ensureDirSync(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
  } catch {
    return null;
  }
}

const TEMP_DIR = ensureDirSync(TEMP_DIR_PRIMARY) || ensureDirSync(TEMP_DIR_FALLBACK);

function assertExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    const err = new Error(`${label} не найден: ${filePath}`);
    err.code = 'ENOENT';
    throw err;
  }
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function toDataUrl(filePath) {
  const mime = mimeFromPath(filePath);
  const b64 = fs.readFileSync(filePath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

function truncatePrompt(prompt, max = 3800) {
  if (!prompt) return '';
  if (prompt.length <= max) return prompt;
  return prompt.slice(0, max - 3) + '...';
}

function logOpenAIError(prefix, err) {
  console.error(prefix, {
    name: err?.name,
    message: err?.message,
    status: err?.status,
    code: err?.code,
    type: err?.type,
    request_id: err?.request_id
  });
  if (err?.stack) {
    console.error(err.stack.split('\n').slice(0, 8).join('\n'));
  }
}

// ============================================================
// BASIC COMPAT FUNCTIONS
// ============================================================

async function chat(messages) {
  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 2000,
    temperature: 0.7
  });
  return r.choices?.[0]?.message?.content || '';
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

  return r.text || '';
}

// Оставляем для совместимости, если где-то ещё вызывается text-to-image
async function generateImage(prompt) {
  try {
    const p = truncatePrompt(String(prompt || ''), 3800);

    const r = await openai.images.generate({
      model: 'dall-e-3',
      prompt: p,
      n: 1,
      size: '1792x1024'
    });

    if (r?.data?.[0]?.url) {
      const buf = await downloadFile(r.data[0].url);
      const outPath = path.join(TEMP_DIR, `generated_${Date.now()}.png`);
      fs.writeFileSync(outPath, buf);
      return outPath;
    }

    throw new Error('images.generate вернул пустой результат');
  } catch (err) {
    logOpenAIError('generateImage error:', err);
    throw err;
  }
}

// ============================================================
// HOUSES MAP
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

function getReferenceKey(params = {}) {
  if (params.houseType === 'module') return 'module';
  if (params.style === 'A-frame') return 'A-frame';

  const floors = String(params.floors || '1');
  const key = `${params.style}_${floors}`;

  if (HOUSE_MAP[key]) return key;

  if (params.style === 'Классический') {
    return floors === '2' ? 'Классический_2' : 'Классический_1';
  }

  if (params.style === 'Современный') {
    return floors === '2' ? 'Современный_2' : 'Современный_1';
  }

  if (params.style === 'Скандинавский') return 'Скандинавский_1';
  return 'Барнхаус_1';
}

function getReferencePath(params = {}) {
  assertExists(HOUSES_DIR, 'Папка houses');

  const key = getReferenceKey(params);
  const fileName = HOUSE_MAP[key];

  if (!fileName) {
    throw new Error(`Нет файла для ключа дома: ${key}`);
  }

  const filePath = path.join(HOUSES_DIR, fileName);
  assertExists(filePath, 'Файл дома');

  return filePath;
}

// ============================================================
// EDIT OPTIONS
// ============================================================

const FACADE_EDIT = {
  'Металлический сайдинг / софиты':
    'металлический фасад, сайдинг/софиты, реалистичная фактура металла',
  'Имитация бруса':
    'фасад из имитации бруса, натуральная текстура древесины',
  'Штукатурка (мокрый фасад)':
    'штукатурный фасад, светлая минеральная фактура',
  'Фасадная плитка Hauberk':
    'фасадная плитка Hauberk, кирпичный ритм плитки',
  'Комбинация: металл + дерево':
    'комбинированный фасад: тёмный металл и тёплые деревянные акценты',
  'Комбинация: металл + штукатурка':
    'комбинированный фасад: светлая штукатурка и тёмные металлические элементы'
};

const ROOF_EDIT = {
  'Профнастил':
    'кровля из профнастила, видимый профиль листов',
  'Металлочерепица':
    'кровля из металлочерепицы, реалистичный рисунок волн',
  'Мягкая кровля':
    'мягкая кровля, матовая битумная черепица',
  'Фальц':
    'фальцевая кровля, ровные standing seam швы'
};

function getWindowColorText(params = {}) {
  if (params.windowColor && String(params.windowColor).trim()) {
    return `цвет рам окон: ${String(params.windowColor).trim()}`;
  }

  if (params.windows && params.windows.includes('ламинация')) {
    return 'цвет рам окон: ламинация под дерево, коричневый';
  }
  if (params.windows && params.windows.includes('бел')) {
    return 'цвет рам окон: белый';
  }
  if (params.windows && params.windows.includes('чер')) {
    return 'цвет рам окон: чёрный';
  }

  return 'цвет рам окон: тёмно-серый графит';
}

// ============================================================
// PROMPTS
// ============================================================

function buildHouseEditPrompt(params = {}) {
  const facade = FACADE_EDIT[params.facade] || 'современная реалистичная отделка фасада';
  const roof = ROOF_EDIT[params.roofMaterial] || 'реалистичная кровля';
  const windows = getWindowColorText(params);

  const facadeColor = params.facadeColor ? `; желаемый цвет фасада: ${params.facadeColor}` : '';
  const roofColor = params.roofColor ? `; желаемый цвет кровли: ${params.roofColor}` : '';

  const prompt = `
Ты выполняешь фотореалистичное редактирование изображения реального дома.

Используй входное референсное изображение как фиксированную основу.
Сохрани дом и всю сцену максимально идентичными оригиналу.

КАТЕГОРИЧЕСКИ НЕЛЬЗЯ МЕНЯТЬ:
- форму дома
- этажность
- геометрию крыши
- уклон крыши
- высоту стен
- пропорции дома
- расположение, количество и размер окон
- расположение и размер дверей
- форму террасы, крыльца и фундамента
- ракурс камеры
- перспективу
- кадрирование
- композицию
- ландшафт
- деревья
- дорожки
- объекты вокруг

НЕЛЬЗЯ:
- добавлять этажи
- убирать этажи
- добавлять окна
- удалять окна
- менять архитектуру
- менять форму кровли
- менять форму дома

МОЖНО ИЗМЕНИТЬ ТОЛЬКО:
1. фасад -> ${facade}${facadeColor}
2. кровлю -> ${roof}${roofColor}
3. ${windows}

ТРЕБОВАНИЯ К КАЧЕСТВУ:
- фотореализм
- реальный построенный дом
- естественный свет
- реальные материалы
- естественные тени
- без CGI-вида
- без мультяшности

Если изменилось что-либо кроме фасада, кровли и цвета рам окон, результат неверный.
  `.trim();

  return truncatePrompt(prompt, 3800);
}

// Для совместимости со старым импортом
const buildHousePrompt = buildHouseEditPrompt;

// ============================================================
// RESPONSES API IMAGE EDIT
// ============================================================

function extractImageBase64(response) {
  const output = Array.isArray(response?.output) ? response.output : [];
  const imageCall = output.find((item) => item?.type === 'image_generation_call');
  return imageCall?.result || null;
}

async function editHouseFromReference(params = {}) {
  try {
    const referencePath = getReferencePath(params);
    const dataUrl = toDataUrl(referencePath);
    const prompt = buildHouseEditPrompt(params);

    const mainModel = process.env.OPENAI_MAIN_MODEL || 'gpt-4o-mini';
    const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

    console.log('=== AIVARA HOUSE EDIT ===');
    console.log('HOUSES_DIR:', HOUSES_DIR);
    console.log('REFERENCE:', referencePath);
    console.log('TEMP_DIR:', TEMP_DIR);
    console.log('MAIN_MODEL:', mainModel);
    console.log('IMAGE_MODEL:', imageModel);
    console.log('PROMPT_LEN:', prompt.length);

    const response = await openai.responses.create({
      model: mainModel,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: dataUrl, detail: 'high' }
          ]
        }
      ],
      tools: [
        {
          type: 'image_generation',
          action: 'edit',
          model: imageModel,
          size: '1536x1024',
          quality: 'high',
          background: 'auto',
          output_format: 'png'
        }
      ],
      tool_choice: { type: 'image_generation' }
    });

    const imageBase64 = extractImageBase64(response);

    if (!imageBase64) {
      console.error('RAW OUTPUT TYPES:', (response?.output || []).map(x => x?.type));
      throw new Error('В ответе нет image_generation_call.result');
    }

    const outPath = path.join(TEMP_DIR, `house_edit_${Date.now()}.png`);
    fs.writeFileSync(outPath, Buffer.from(imageBase64, 'base64'));

    console.log('OUTPUT:', outPath);

    return outPath;
  } catch (err) {
    logOpenAIError('editHouseFromReference error:', err);
    throw err;
  }
}

// ============================================================
// MAIN EXPORT FOR BOT
// ============================================================

async function generateHouseRenders(params = {}) {
  const editedPath = await editHouseFromReference(params);

  return {
    frontPath: editedPath,
    backPath: editedPath
  };
}

module.exports = {
  chat,
  generateImage,
  downloadFile,
  transcribeVoice,
  generateHouseRenders,
  buildHousePrompt,
  buildHouseEditPrompt
};
