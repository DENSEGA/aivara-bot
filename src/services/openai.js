const OpenAI = require('openai');
const https = require('https');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateImage(prompt) {
  const r = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1792x1024'
  });
  return r.data[0].url;
}

function safeStr(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function normalizeParams(params = {}) {
  const normalized = {
    area: Number(params.area) > 0 ? Number(params.area) : 90,
    floors: ['1', '1.5', '2'].includes(String(params.floors)) ? String(params.floors) : '1',
    style: safeStr(params.style) || 'Барнхаус',
    roofType: safeStr(params.roofType) || 'Двускатная',
    roofMaterial: safeStr(params.roofMaterial) || 'Профнастил',
    facade: safeStr(params.facade) || 'Комбинированный',
    windowsCount: Number(params.windowsCount) > 0 ? Number(params.windowsCount) : 8,
    windows: safeStr(params.windows),
    door: safeStr(params.door),
    terrace: !!params.terrace,
    terraceArea: Number(params.terraceArea) > 0 ? Number(params.terraceArea) : 0,
    terraceType: safeStr(params.terraceType) || 'открытая',
    terraceRailing: Number(params.terraceRailing) > 0 ? Number(params.terraceRailing) : 0,
    terraceSteps: !!params.terraceSteps,
    houseType: safeStr(params.houseType) || 'house',
    modulesCount: Number(params.modulesCount) > 0 ? Number(params.modulesCount) : 1
  };

  // Жёсткая коррекция конфликтов
  if (normalized.floors === '1') {
    if (normalized.style === 'A-frame') {
      // A-frame почти всегда визуально воспринимается как двухуровневый,
      // поэтому его лучше оставлять отдельным типом.
    }
  }

  return normalized;
}

function getFootprint(area, floors) {
  if (floors === '2') {
    const side = Math.max(7, Math.round(Math.sqrt(area / 2)));
    return {
      width: side,
      depth: side,
      text: `compact footprint approximately ${side} by ${side} meters, two full floors of equal height`
    };
  }

  if (floors === '1.5') {
    const side = Math.max(8, Math.round(Math.sqrt(area * 0.68)));
    return {
      width: side,
      depth: side,
      text: `balanced footprint approximately ${side} by ${side} meters, one full floor plus attic level under roof`
    };
  }

  const width = Math.max(10, Math.round(Math.sqrt(area) * 1.25));
  const depth = Math.max(6, Math.round(area / width));
  return {
    width,
    depth,
    text: `elongated single-story footprint approximately ${width} by ${depth} meters`
  };
}

function getFloorRules(floors) {
  if (floors === '2') {
    return {
      positive: `
exactly two full floors, clearly visible ground floor and clearly visible second floor,
second-floor windows aligned with real upper level, realistic wall height proportions,
roof sits above the second floor, no attic-only interpretation
`,
      negative: `
do not generate one-story house, do not generate bungalow,
do not collapse second floor into attic, no misleading low upper facade
`
    };
  }

  if (floors === '1.5') {
    return {
      positive: `
one-and-a-half-story house, one full ground floor plus жилой мансардный уровень under the roof,
upper level must be visually smaller than ground floor,
roof volume clearly contains attic floor, realistic mansard proportions
`,
      negative: `
do not generate full two-story box house,
do not generate plain single-story bungalow
`
    };
  }

  return {
    positive: `
exactly one single story only, bungalow proportions, low overall building height,
roof begins directly above first-floor wall line,
all windows belong only to the ground floor,
no upper floor mass, no inhabited attic, no mansard level
`,
    negative: `
strictly no second floor,
strictly no half-story,
strictly no attic windows,
strictly no dormers,
strictly no upper balcony,
strictly no second-row windows,
strictly no tall facade suggesting two levels
`
  };
}

function getStyleTemplate(style, floors) {
  const map = {
    'Барнхаус': `
modern barnhouse architecture, simple elongated massing, clean gable silhouette,
minimal decorative elements, practical proportions, Scandinavian-inspired rural house
`,
    'Скандинавский': `
Scandinavian house architecture, restrained modern design, calm proportions,
clean facade lines, cozy but minimal appearance, functional exterior
`,
    'Классический': `
classic suburban residential architecture, more traditional window rhythm,
balanced composition, calm family house character
`,
    'Современный': `
modern contemporary country house, clean lines, large windows, restrained detailing,
architect-designed but buildable in real life
`,
    'Шале': `
modern chalet-inspired architecture, warm natural accents, expressive roof overhangs,
cozy country-house character, realistic buildable structure
`,
    'A-frame': `
A-frame cabin architecture, triangular roof-dominant form, compact alpine character
`
  };

  let result = map[style] || map['Современный'];

  if (style === 'Барнхаус' && floors === '1') {
    result += `
single-story barnhouse only, long low rectangular volume, no upper жилой level
`;
  }

  if (style === 'Барнхаус' && floors === '2') {
    result += `
two-story barnhouse with clear second floor, not a warehouse, not an exaggerated tall shed
`;
  }

  return result;
}

function getRoofTypeTemplate(roofType, floors) {
  const map = {
    'Двускатная': `
gable roof with realistic pitch, correct ridge line, structurally believable proportions
`,
    'Односкатная': `
single-slope shed roof with realistic load-bearing geometry, not futuristic,
practical residential proportions
`,
    'Вальмовая': `
hip roof with realistic eaves and residential proportions
`,
    'Плоская': `
low-slope flat roof with hidden drainage and realistic parapet details
`
  };

  let result = map[roofType] || map['Двускатная'];

  if (floors === '1') {
    result += `
roof proportion must stay low enough to preserve clear single-story appearance
`;
  }

  if (floors === '2') {
    result += `
roof must sit clearly above full second floor and not compress upper level
`;
  }

  return result;
}

function getRoofMaterialTemplate(roofMaterial) {
  const map = {
    'Профнастил': `
corrugated metal roofing with visible wave profile, matte industrial finish,
subtle real reflections, slight manufacturing irregularity, realistic joints and overlap lines
`,
    'Металлочерепица': `
metal tile roofing with believable tile profile, subtle sheen, realistic shadow pattern,
visible repetition typical for real metal tile sheets
`,
    'Фальц': `
standing seam metal roof, straight seam rhythm, premium restrained look,
soft realistic reflections, not mirror-like
`
  };

  return map[roofMaterial] || map['Профнастил'];
}

function getFacadeTemplate(facade, style) {
  const map = {
    'Штукатурка': `
facade finished with exterior plaster or stucco, fine mineral texture,
subtle unevenness, realistic corners, slight dirt near base and drainage areas
`,
    'Дерево': `
natural wood facade, visible grain, color variation, slight weathering,
real joints between boards, believable installation pattern
`,
    'Комбинированный': `
combined facade using two materials such as plaster and wood, or metal and wood,
well-designed contrast, realistic junctions, trim details, believable construction logic
`,
    'Кирпич': `
brick or clinker facade with real masonry rhythm, subtle tone variation,
natural mortar joints, realistic corner bonding
`,
    'Панели': `
modern facade panels with realistic seams, restrained reflectivity,
clear mounting rhythm, buildable system appearance
`
  };

  let result = map[facade] || map['Комбинированный'];

  if (style === 'Барнхаус') {
    result += `
facade should feel modern and minimal, without excessive classical decor
`;
  }

  return result;
}

function getWindowsTemplate(params) {
  const count = params.windowsCount || 8;
  let frame = 'thin dark aluminum frames';
  if (params.windows && params.windows.includes('ламинация')) {
    frame = 'wood-grain laminated PVC frames';
  } else if (params.windows && params.windows.includes('бел')) {
    frame = 'white PVC frames';
  }

  return `
approximately ${count} windows total, realistically distributed across visible facades,
window sizes must match house type and floor count,
glass with natural reflections of trees and sky, slight interior darkness,
no impossible window placement, frames: ${frame}
`;
}

function getDoorTemplate(params) {
  let door = 'dark metal entrance door with realistic handle and simple trim';
  if (params.door && params.door.includes('пластик')) {
    door = 'white PVC entrance door with glazed insert';
  } else if (params.door && params.door.includes('премиум')) {
    door = 'premium dark metal or bronze-toned entrance door with higher-end detailing';
  }

  return `
main entrance uses ${door}, residential scale, believable placement under canopy or near facade composition
`;
}

function getTerraceTemplate(params) {
  if (!params.terrace || params.terraceArea <= 0) {
    return `
no oversized terrace, only a modest entrance porch or minimal platform if needed
`;
  }

  const base =
    params.terraceType === 'закрытая'
      ? `enclosed terrace approximately ${params.terraceArea} square meters with real glazing divisions and believable support structure`
      : `open terrace approximately ${params.terraceArea} square meters with realistic decking boards and correct support geometry`;

  const railing = params.terraceRailing > 0
    ? `railing approximately ${params.terraceRailing} meters in visible length`
    : `minimal or no railing depending on design`;

  const steps = params.terraceSteps
    ? `with realistic entrance steps sized for actual human use`
    : `without exaggerated staircase`;

  return `
${base}, ${railing}, ${steps}, terrace must be proportional to the house and not dominate the composition
`;
}

function getEnvironmentTemplate(style) {
  return `
house placed on a believable landscaped suburban plot in a forest-edge setting,
mixed coniferous and deciduous trees in background,
natural uneven lawn with subtle variation in color and height,
ornamental shrubs placed asymmetrically,
a few young trees and mature pines,
concrete or stone path around the house with slight dirt near edges,
soil transitions near foundation are realistic,
no perfect catalog symmetry,
no fantasy garden,
no tropical plants,
overall environment should look like a real high-quality finished plot in Russia or Northern Europe
`;
}

function getLightingTemplate() {
  return `
soft natural late afternoon or golden-hour light,
physically correct sun direction,
realistic soft-edged shadows,
subtle bounce light from ground and facade,
facade wall lamps may be turned on with warm restrained glow,
no overexposure,
no dramatic cinematic fantasy lighting,
looks like a professional exterior real-estate photo
`;
}

function getCameraTemplate(view, floors) {
  if (view === 'back') {
    return `
rear three-quarter view from eye level,
camera distance enough to show the whole house,
lens equivalent around 28mm to 35mm,
verticals corrected,
no exaggerated perspective distortion
`;
  }

  let add = '';
  if (floors === '1') {
    add = 'camera should reinforce low horizontal bungalow proportions';
  } else if (floors === '2') {
    add = 'camera should clearly reveal both floors without ambiguity';
  }

  return `
front three-quarter view from eye level,
camera distance enough to show full facade and one side wall,
lens equivalent around 28mm to 35mm,
verticals corrected,
no drone view,
no top-down angle,
${add}
`;
}

function getQualityTemplate() {
  return `
ultra photorealistic architectural visualization,
indistinguishable from real photography,
physically based materials,
micro imperfections,
subtle construction tolerances,
realistic drainage elements,
realistic foundation plinth,
real believable facade details,
no cgi look,
no cartoon,
no concept art,
no sketch,
no glossy fake materials,
no surreal proportions,
no text,
no watermark
`;
}

function getSpecialScenarioTemplate(params) {
  const key = `${params.floors}|${params.style}|${params.roofMaterial}`;

  const scenarios = {
    '1|Барнхаус|Профнастил': `
single-story modern barnhouse with low elongated volume,
dark corrugated metal exterior or corrugated metal roof,
minimalistic composition,
strictly one level only,
real buildable proportions similar to premium modular or frame countryside houses
`,
    '1|Барнхаус|Металлочерепица': `
single-story barnhouse-inspired house with simpler rural character,
gable roof with metal tile,
elongated low body,
strictly one story,
practical frame-house proportions
`,
    '1|Современный|Фальц': `
single-story contemporary house with premium restrained appearance,
standing seam roof, large but believable windows,
clean geometry without turning into flat-roof villa
`,
    '2|Классический|Металлочерепица': `
two-story family house with traditional suburban appearance,
metal tile roof, balanced facade rhythm, believable Russian cottage settlement style
`
  };

  return scenarios[key] || '';
}

function buildHousePrompt(params, view = 'front') {
  const p = normalizeParams(params);
  const footprint = getFootprint(p.area, p.floors);
  const floorRules = getFloorRules(p.floors);

  const sections = [
    `Create an ultra-photorealistic exterior image of a real built private house, not a concept render.`,

    `ARCHITECTURAL TYPE:
${getSpecialScenarioTemplate(p)}
${getStyleTemplate(p.style, p.floors)}
${footprint.text}
${getFloorRules(p.floors).positive}
`,

    `STRICT NEGATIVE CONSTRAINTS:
${floorRules.negative}
do not invent extra balconies,
do not invent extra annexes,
do not add extra wings not implied by the footprint,
do not add additional floors hidden inside roof unless explicitly required
`,

    `ROOF:
${getRoofTypeTemplate(p.roofType, p.floors)}
${getRoofMaterialTemplate(p.roofMaterial)}
`,

    `FACADE AND OPENINGS:
${getFacadeTemplate(p.facade, p.style)}
${getWindowsTemplate(p)}
${getDoorTemplate(p)}
${getTerraceTemplate(p)}
`,

    `SITE AND LANDSCAPE:
${getEnvironmentTemplate(p.style)}
`,

    `LIGHTING:
${getLightingTemplate()}
`,

    `CAMERA:
${getCameraTemplate(view, p.floors)}
`,

    `QUALITY:
${getQualityTemplate()}
`,

    `The image must look like a premium real-estate photo of an actually constructed house.`
  ];

  let prompt = sections.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();

  if (prompt.length > 3800) {
    prompt = prompt.slice(0, 3780) + '\n\nultra realistic real house exterior photo.';
  }

  return prompt;
}

async function generateHouseRenders(params) {
  const frontPrompt = buildHousePrompt(params, 'front');
  const backPrompt = buildHousePrompt(params, 'back');

  console.log('=== FRONT PROMPT ===\n', frontPrompt);
  console.log('=== BACK PROMPT ===\n', backPrompt);

  const [frontUrl, backUrl] = await Promise.all([
    generateImage(frontPrompt),
    generateImage(backPrompt)
  ]);

  return { frontUrl, backUrl, frontPrompt, backPrompt };
}

module.exports = {
  buildHousePrompt,
  generateHouseRenders,
  generateImage
};