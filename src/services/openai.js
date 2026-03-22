'use strict';

const OpenAI = require('openai');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { File } = require('node:buffer');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================
// PATHS (ВАЖНО: openai.js в AIVARA/src/services/openai.js)
// ============================================================
const HOUSES_DIR = path.join(__dirname, '..', '..', 'houses'); // AIVARA/houses
const PROJECT_ROOT = path.join(__dirname, '..', '..');         // AIVARA
const TEMP_DIR_PRIMARY = path.join(PROJECT_ROOT, 'temp');      // AIVARA/temp
const TEMP_DIR_FALLBACK = path.join(os.tmpdir(), 'aivara-temp'); // OS temp fallback

function ensureDirSync(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    return dirPath;
  } catch (_) {
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

function truncatePrompt(p, max = 3800) {
  if (!p) return '';
  if (p.length <= max) return p;
  return p.slice(0, max - 3) + '...';
}

function logOpenAIError(prefix, err) {
  const payload = {
    name: err?.name,
    message: err?.message,
    status: err?.status,
    code: err?.code,
    type: err?.type,
    request_id: err?.request_id
  };
  console.error(prefix, payload);
  if (err?.stack) console.error(err.stack.split('\n').slice(0, 8).join('\n'));
}

// ============================================================
// COMPAT: chat / download / transcribe
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
  // Совместимо с твоей текущей схемой (Buffer -> File)
  const file = new File([fileBuffer], 'voice.ogg', { type: 'audio/ogg' });
  const r = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: 'ru'
  });
  return r.text || '';
}

// ============================================================
// OPTIONAL: generateImage (text-to-image) — оставляем для совместимости
// ============================================================
async function generateImage(prompt) {
  try {
    const p = truncatePrompt(String(prompt || ''), 3800);

    const r = await openai.images.generate({
      model: 'gpt-image-1',     // если обновится API — меняй здесь
      prompt: p,
      size: '1536x1024',
      quality: 'high',
      output_format: 'png'
    });

    if (r?.data?.[0]?.b64_json) {
      const outPath = path.join(TEMP_DIR, `generated_${Date.now()}.png`);
      fs.writeFileSync(outPath, Buffer.from(r.data[0].b64_json, 'base64'));
      return outPath;
    }

    if (r?.data?.[0]?.url) {
      const outPath = path.join(TEMP_DIR, `generated_${Date.now()}.png`);
      const buf = await downloadFile(r.data[0].url);
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
// HOUSE MAP (AIVARA/houses)
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

  // если вдруг запросили то, чего нет — мягкий fallback
  if (HOUSE_MAP[key]) return key;
  if (params.style === 'Классический') return floors === '2' ? 'Классический_2' : 'Классический_1';
  if (params.style === 'Современный') return floors === '2' ? 'Современный_2' : 'Современный_1';
  if (params.style === 'Скандинавский') return 'Скандинавский_1';
  return 'Барнхаус_1';
}

function getReferencePath(params = {}) {
  assertExists(HOUSES_DIR, 'Папка houses');
  const key = getReferenceKey(params);
  const fileName = HOUSE_MAP[key];
  if (!fileName) throw new Error(`Нет маппинга HOUSE_MAP для ключа: ${key}`);

  const p = path.join(HOUSES_DIR, fileName);
  assertExists(p, 'Файл дома');
  return p;
}

// ============================================================
// EDIT OPTIONS (фасад / кровля / окна)
// ============================================================
const FACADE_EDIT = {
  'Металлический сайдинг / софиты': 'металлический фасад (сайдинг/софиты), реалистичная фактура металла',
  'Имитация бруса': 'фасад из имитации бруса, натуральная фактура древесины',
  'Штукатурка (мокрый фасад)': 'штукатурный фасад (мокрый фасад), минеральная фактура',
  'Фасадная плитка Hauberk': 'фасадная плитка Hauberk, кирпичный/плиточный ритм',
  'Комбинация: металл + дерево': 'комбинация фасада: тёмный металл + тёплые деревянные акценты',
  'Комбинация: металл + штукатурка': 'комбинация фасада: светлая штукатурка + тёмные металлические элементы'
};

const ROOF_EDIT = {
  'Профнастил': 'кровля из профнастила, видимый профиль листов',
  'Металлочерепица': 'кровля из металлочерепицы, реалистичный рисунок волн',
  'Мягкая кровля': 'мягкая кровля (битумная черепица), матовая слоистая фактура',
  'Фальц': 'фальцевая кровля (standing seam), ровные фальцевые швы'
};

function getWindowColorText(params = {}) {
  if (params.windowColor && String(params.windowColor).trim()) {
    return `цвет рам окон: ${String(params.windowColor).trim()}`;
  }
  if (params.windows && params.windows.includes('ламинация')) return 'цвет рам окон: ламинация под дерево (коричневый)';
  if (params.windows && params.windows.includes('бел')) return 'цвет рам окон: белый';
  if (params.windows && params.windows.includes('чер')) return 'цвет рам окон: чёрный';
  return 'цвет рам окон: тёмно‑серый/графит';
}

// ============================================================
// PROMPT ENGINEERING (СТРОГИЙ RU ШАБЛОН)
// ============================================================
function buildHouseEditPrompt(params = {}) {
  const facade = FACADE_EDIT[params.facade] || 'современная отделка фасада (реалистичные материалы)';
  const roof = ROOF_EDIT[params.roofMaterial] || 'кровля из металла (реалистичная фактура)';
  const windowColor = getWindowColorText(params);

  const facadeColor = params.facadeColor ? `; желаемый цвет фасада: ${params.facadeColor}` : '';
  const roofColor = params.roofColor ? `; желаемый цвет кровли: ${params.roofColor}` : '';

  const prompt = `
Ты — ассистент по фотореалистичному РЕДАКТИРОВАНИЮ изображения дома.

ОСНОВА:
Используй входное (референсное) изображение дома как единственную основу.
СОХРАНИ дом и сцену максимально идентичными референсу.

КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО МЕНЯТЬ:
- геометрию дома, форму, пропорции, размеры
- этажность (количество этажей)
- геометрию/уклон/форму крыши
- расположение, размеры и количество окон
- расположение, размеры и внешний контур дверей
- террасу/крыльцо/фундамент (форма и размеры)
- ракурс камеры, перспективу, кадрирование, композицию
- окружение, ландшафт, деревья, дорожки, объекты вокруг
- добавлять людей, машины, надписи, логотипы, водяные знаки

РАЗРЕШЕНО ИЗМЕНИТЬ ТОЛЬКО СЛЕДУЮЩЕЕ:
1) ФАСАД: ${facade}${facadeColor}
2) КРОВЛЮ (материал/цвет): ${roof}${roofColor}
3) ${windowColor}

КАЧЕСТВО:
Фотореализм, реальные материалы, естественный свет и тени, без CGI‑вида.

Если изменилось что-то кроме фасада, кровли и цвета рам окон — результат неверный.
  `.trim();

  return truncatePrompt(prompt, 3800);
}

// Для совместимости со старым кодом
const buildHousePrompt = buildHouseEditPrompt;

// ============================================================
// CORE: edit from reference using Responses API + image_generation tool
// ============================================================
function extractImageBase64FromResponses(response) {
  const calls = Array.isArray(response?.output) ? response.output : [];
  const call = calls.find((o) => o?.type === 'image_generation_call');

  // В docs result хранит base64 картинку
  const b64 = call?.result;
  const revised = call?.revised_prompt;

  return { b64, revised, call };
}

async function editHouseFromReference(params = {}) {
  try {
    const referencePath = getReferencePath(params);
    const dataUrl = toDataUrl(referencePath);
    const prompt = buildHouseEditPrompt(params);

    // mainline model (НЕ gpt-image-*)
    const MAIN_MODEL = process.env.OPENAI_MAIN_MODEL || 'gpt-4o-mini';

    // модель генерации задаём ВНУТРИ инструмента
    const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

    console.log('=== AIVARA EDIT MODE ===');
    console.log('HOUSES_DIR:', HOUSES_DIR);
    console.log('REFERENCE:', referencePath);
    console.log('TEMP_DIR:', TEMP_DIR);
    console.log('MAIN_MODEL:', MAIN_MODEL);
    console.log('IMAGE_MODEL:', IMAGE_MODEL);
    console.log('PROMPT_LEN:', prompt.length);

    const resp = await openai.responses.create({
      model: MAIN_MODEL,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            // detail=original помогает отправить исходник без "пережатия"
            { type: 'input_image', image_url: dataUrl, detail: 'original' }
          ]
        }
      ],
      tools: [
        {
          type: 'image_generation',
          action: 'edit',
          model: IMAGE_MODEL,
          input_fidelity: 'high',
          size: '1536x1024',
          quality: 'high',
          output_format: 'png'
        }
      ],
      tool_choice: { type: 'image_generation' }
    });

    const { b64, revised } = extractImageBase64FromResponses(resp);

    if (revised) {
      console.log('REVISED_PROMPT (short):', String(revised).slice(0, 180));
    }

    if (!b64) {
      console.error('RAW RESPONSE (types):', (resp?.output || []).map((x) => x?.type));
      throw new Error('Не найден image_generation_call.result (base64) в ответе');
    }

    const outPath = path.join(TEMP_DIR, `house_edit_${Date.now()}.png`);
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
    console.log('OUTPUT:', outPath);

    return outPath;
  } catch (err) {
    logOpenAIError('editHouseFromReference error:', err);
    throw err;
  }
}

async function generateHouseRenders(params = {}) {
  const editedPath = await editHouseFromReference(params);
  return { frontPath: editedPath, backPath: editedPath };
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
