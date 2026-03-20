const { Markup } = require('telegraf');
const { hasAccess } = require('../services/roles');
const { getPriceList, buildPriceMap, getCoefficients, getCompanyInfo, num } = require('../services/sheets');
const { generateEstimatePDF } = require('../services/pdf');
const { generateHouseRenders } = require('../services/openai');

// ============================================================
// SETUP
// ============================================================
function setupConfigModule(bot) {
  bot.hears('🏠 Смета', async (ctx) => {
    if (!hasAccess(ctx.from.id, 'config')) return ctx.reply('⛔ Нет доступа.');
    ctx.session.mode = 'config';
    ctx.session.config = { step: 'house_type' };
    return ctx.reply('🏠 *Конфигуратор дома*\n\nВыбери тип:', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔹 Модули', 'cfg_type_module')],
        [Markup.button.callback('🔹 Дома Стандарт', 'cfg_type_standard')],
        [Markup.button.callback('🔹 Дома Стандарт +', 'cfg_type_standardplus')],
      ]),
    });
  });
}

// ============================================================
// CALLBACK HANDLER
// ============================================================
async function handleCallback(ctx) {
  const data = ctx.callbackQuery.data;
  await ctx.answerCbQuery();
  const c = ctx.session.config;
  if (!c) return;

  // === ТИП ДОМА ===
  if (data.startsWith('cfg_type_')) {
    c.houseType = data.replace('cfg_type_', ''); // module, standard, standardplus
    c.step = 'client_name';
    const typeName = { module: 'Модуль', standard: 'Стандарт', standardplus: 'Стандарт +' }[c.houseType];
    return ctx.reply(`📋 *${typeName}*\n\nВведи ФИО заказчика:`, { parse_mode: 'Markdown' });
  }

  // === МОДУЛИ: КОЛИЧЕСТВО ===
  if (data.startsWith('cfg_modcount_')) {
    c.modulesCount = parseInt(data.replace('cfg_modcount_', ''));
    c.step = 'svai_type';
    return askSvaiType(ctx);
  }

  // === ЭТАЖНОСТЬ ===
  if (data.startsWith('cfg_floors_')) {
    c.floors = data.replace('cfg_floors_', '');
    c.step = 'style';
    return ctx.reply('🎨 *Стиль:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Барнхаус', 'cfg_style_barnhouse')],
        [Markup.button.callback('Скандинавский', 'cfg_style_scandinavian')],
        [Markup.button.callback('Классический', 'cfg_style_classic')],
        [Markup.button.callback('Современный', 'cfg_style_modern')],
        [Markup.button.callback('A-frame', 'cfg_style_aframe')],
      ]) });
  }

  // === СТИЛЬ ===
  if (data.startsWith('cfg_style_')) {
    const m = { barnhouse:'Барнхаус', scandinavian:'Скандинавский', classic:'Классический', modern:'Современный', aframe:'A-frame' };
    c.style = m[data.replace('cfg_style_', '')] || 'Барнхаус';
    c.step = 'bedrooms';
    return askBedrooms(ctx);
  }

  if (data.startsWith('cfg_bed_')) { c.bedrooms = parseInt(data.replace('cfg_bed_', '')); c.step = 'svai_type'; return askSvaiType(ctx); }

  // === СВАИ ===
  if (data.startsWith('cfg_svai_')) {
    c.svaiType = data.replace('cfg_svai_', ''); // metal89, metal108, jb150_3, jb150_4, jb200_3, jb200_4
    c.step = c.houseType === 'module' ? 'terrace' : 'wall_insulation';
    if (c.houseType === 'module') return askTerrace(ctx);
    return ctx.reply('🧱 *Утепление стен:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('150 мм', 'cfg_ins_150')], [Markup.button.callback('200 мм', 'cfg_ins_200')]]) });
  }

  if (data.startsWith('cfg_ins_')) {
    c.wallInsulation = parseInt(data.replace('cfg_ins_', ''));
    c.step = 'roof_type';
    return ctx.reply('🏗 *Крыша:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('Двускатная', 'cfg_roof_double')], [Markup.button.callback('Односкатная', 'cfg_roof_single')], [Markup.button.callback('Вальмовая', 'cfg_roof_hip')], [Markup.button.callback('Плоская', 'cfg_roof_flat')]]) });
  }

  if (data.startsWith('cfg_roof_')) {
    const m = { double:'Двускатная', single:'Односкатная', hip:'Вальмовая', flat:'Плоская' };
    c.roofType = m[data.replace('cfg_roof_', '')];
    c.step = 'roof_material';
    return ctx.reply('🪵 *Покрытие:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('Профнастил', 'cfg_roofm_prof')], [Markup.button.callback('Металлочерепица', 'cfg_roofm_metal')], [Markup.button.callback('Мягкая кровля', 'cfg_roofm_soft')]]) });
  }

  if (data.startsWith('cfg_roofm_')) {
    const m = { prof:'Профнастил', metal:'Металлочерепица', soft:'Мягкая кровля' };
    c.roofMaterial = m[data.replace('cfg_roofm_', '')];
    c.step = 'facade';
    return ctx.reply('🏠 *Фасад:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Металл / софиты', 'cfg_fas_metal')], [Markup.button.callback('Имитация бруса', 'cfg_fas_wood')],
        [Markup.button.callback('Штукатурка', 'cfg_fas_plaster')], [Markup.button.callback('Плитка Hauberk', 'cfg_fas_hauberk')],
        [Markup.button.callback('Металл + дерево', 'cfg_fas_combo1')], [Markup.button.callback('Металл + штукатурка', 'cfg_fas_combo2')],
      ]) });
  }

  if (data.startsWith('cfg_fas_')) {
    const m = { metal:'Металлический сайдинг / софиты', wood:'Имитация бруса', plaster:'Штукатурка (мокрый фасад)', hauberk:'Фасадная плитка Hauberk', combo1:'Комбинация: металл + дерево', combo2:'Комбинация: металл + штукатурка' };
    c.facade = m[data.replace('cfg_fas_', '')];
    c.step = 'windows';
    return ctx.reply('🪟 *Окна:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('ПВХ белые', 'cfg_win_white')], [Markup.button.callback('Ламинация 1 сторона', 'cfg_win_lam1')], [Markup.button.callback('Ламинация 2 стороны', 'cfg_win_lam2')]]) });
  }

  if (data.startsWith('cfg_win_')) {
    const m = { white:'Окно ПВХ белые', lam1:'Окно ПВХ ламинация 1 сторона', lam2:'Окно ПВХ ламинация 2 стороны' };
    c.windows = m[data.replace('cfg_win_', '')];
    c.step = 'windows_count';
    return ctx.reply('🪟 Сколько окон?');
  }

  if (data.startsWith('cfg_door_')) {
    const m = { eco:'Дверь входная металлическая (эконом)', std:'Дверь входная металлическая (стандарт)', prem:'Дверь входная металлическая (премиум)', plastic:'Дверь входная пластиковая' };
    c.door = m[data.replace('cfg_door_', '')];
    c.step = 'terrace';
    return askTerrace(ctx);
  }

  // === ТЕРРАСА ===
  if (data.startsWith('cfg_ter_')) {
    const v = data.replace('cfg_ter_', '');
    if (v === 'no') { c.terrace = null; c.terraceArea = 0; c.terraceRailing = 0; c.terraceSteps = false; c.step = 'finishing'; return askFinishing(ctx); }
    c.terrace = v === 'open' ? 'Терраса открытая (материал + работа)' : 'Терраса закрытая (материал + работа)';
    c.terraceType = v === 'open' ? 'открытая' : 'закрытая';
    c.step = 'terrace_area';
    return ctx.reply('📐 Площадь террасы (м²):');
  }

  if (data.startsWith('cfg_tersteps_')) {
    c.terraceSteps = data.replace('cfg_tersteps_', '') === 'yes';
    c.step = 'finishing';
    return askFinishing(ctx);
  }

  // === ОТДЕЛКА ===
  if (data.startsWith('cfg_finish_')) {
    c.needFinishing = data.replace('cfg_finish_', '') === 'yes';
    if (c.needFinishing) { c.step = 'finish_walls'; return askFinishWalls(ctx); }
    c.step = 'engineering';
    return askEngineering(ctx);
  }

  if (data.startsWith('cfg_fwall_')) {
    const m = { gk:'Гипсокартон на стены (материал + работа)', vag:'Вагонка на стены (материал + работа)', sht:'Штукатурка стен', paint:'Покраска стен' };
    c.finishWalls = m[data.replace('cfg_fwall_', '')];
    c.step = 'finish_ceiling';
    return ctx.reply('🔲 *Потолок:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('Вагонка', 'cfg_fceil_vag')], [Markup.button.callback('Натяжной', 'cfg_fceil_nat')]]) });
  }

  if (data.startsWith('cfg_fceil_')) {
    c.finishCeiling = data.replace('cfg_fceil_', '') === 'vag' ? 'Вагонка потолок' : 'Натяжной потолок';
    c.step = 'finish_floor';
    return ctx.reply('🔲 *Пол:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('Ламинат', 'cfg_ffloor_lam')], [Markup.button.callback('Линолеум', 'cfg_ffloor_lin')], [Markup.button.callback('Кварцвинил', 'cfg_ffloor_kv')], [Markup.button.callback('Плитка', 'cfg_ffloor_tile')]]) });
  }

  if (data.startsWith('cfg_ffloor_')) {
    const m = { lam:'Ламинат (материал + укладка)', lin:'Линолеум (материал + укладка)', kv:'Кварцвинил (материал + укладка)', tile:'Плитка керамическая (материал + укладка)' };
    c.finishFloor = m[data.replace('cfg_ffloor_', '')];
    c.step = 'finish_doors';
    return ctx.reply('🚪 *Межкомнатные двери:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('Эконом', 'cfg_fdoor_eco')], [Markup.button.callback('Стандарт', 'cfg_fdoor_std')], [Markup.button.callback('Премиум', 'cfg_fdoor_prem')]]) });
  }

  if (data.startsWith('cfg_fdoor_')) {
    const m = { eco:'Дверь межкомнатная (эконом)', std:'Дверь межкомнатная (стандарт)', prem:'Дверь межкомнатная (премиум)' };
    c.finishDoors = m[data.replace('cfg_fdoor_', '')];
    c.step = 'engineering';
    return askEngineering(ctx);
  }

  // === ИНЖЕНЕРКА ===
  if (data.startsWith('cfg_eng_')) {
    const part = data.replace('cfg_eng_', '');
    if (part.startsWith('heat_')) { c.needHeating = part === 'heat_yes'; c.step = 'eng_plumbing'; return ctx.reply('🔧 *Сантехника нужна?*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Да', 'cfg_eng_plumb_yes')], [Markup.button.callback('❌ Нет', 'cfg_eng_plumb_no')]]) }); }
    if (part.startsWith('plumb_')) { c.needPlumbing = part === 'plumb_yes'; c.step = 'eng_electric'; return ctx.reply('⚡ *Электрика нужна?*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Да', 'cfg_eng_elec_yes')], [Markup.button.callback('❌ Нет', 'cfg_eng_elec_no')]]) }); }
    if (part.startsWith('elec_')) { c.needElectric = part === 'elec_yes'; c.step = 'eng_vent'; return ctx.reply('🌬 *Вентиляция нужна?*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Да', 'cfg_eng_vent_yes')], [Markup.button.callback('❌ Нет', 'cfg_eng_vent_no')]]) }); }
    if (part.startsWith('vent_')) { c.needVent = part === 'vent_yes'; c.step = 'septik'; return ctx.reply('🏗 *Септик нужен?*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Да', 'cfg_sept_yes')], [Markup.button.callback('❌ Нет', 'cfg_sept_no')]]) }); }
  }

  if (data.startsWith('cfg_sept_')) { c.needSeptik = data === 'cfg_sept_yes'; c.step = 'well';
    return ctx.reply('💧 *Скважина нужна?*', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('✅ Да', 'cfg_well_yes')], [Markup.button.callback('❌ Нет', 'cfg_well_no')]]) }); }

  if (data.startsWith('cfg_well_')) { c.needWell = data === 'cfg_well_yes'; c.step = 'render';
    return ctx.reply('🎨 *Добавить визуализацию дома (DALL-E)?*\n\n2 рендера: вид спереди + сзади\nГенерация ~30 сек', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('🎨 Да, добавить', 'cfg_render_yes')], [Markup.button.callback('❌ Без рендера', 'cfg_render_no')]]) }); }

  if (data.startsWith('cfg_render_')) { c.needRender = data === 'cfg_render_yes'; c.step = 'extra_discount';
    return ctx.reply('💰 *Дополнительная скидка?*\n\nВведи % (0 = без скидки):'); }

  if (data === 'cfg_generate') return generatePDF(ctx);
  if (data === 'cfg_cancel') { ctx.session.config = null; ctx.session.mode = null; return ctx.editMessageText('❌ Отменено.'); }
}

// ============================================================
// ASK HELPERS
// ============================================================
function askSvaiType(ctx) {
  return ctx.reply('🔩 *Тип свай:*', { parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Винтовые 89мм', 'cfg_svai_metal89')],
      [Markup.button.callback('Винтовые 108мм', 'cfg_svai_metal108')],
      [Markup.button.callback('ЖБ 150×150/3м', 'cfg_svai_jb150_3')],
      [Markup.button.callback('ЖБ 150×150/4м', 'cfg_svai_jb150_4')],
      [Markup.button.callback('ЖБ 200×200/3м', 'cfg_svai_jb200_3')],
      [Markup.button.callback('ЖБ 200×200/4м', 'cfg_svai_jb200_4')],
    ]) });
}

function askBedrooms(ctx) {
  return ctx.reply('🛏 *Спален:*', { parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('1','cfg_bed_1'),Markup.button.callback('2','cfg_bed_2'),Markup.button.callback('3','cfg_bed_3')],[Markup.button.callback('4','cfg_bed_4'),Markup.button.callback('5','cfg_bed_5')]]) });
}

function askTerrace(ctx) {
  return ctx.reply('🏡 *Терраса:*', { parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('Нет', 'cfg_ter_no')], [Markup.button.callback('Открытая', 'cfg_ter_open')], [Markup.button.callback('Закрытая', 'cfg_ter_closed')]]) });
}

function askFinishing(ctx) {
  const c = ctx.session.config;
  if (c.houseType === 'module') { c.needFinishing = false; c.step = 'engineering'; return askEngineering(ctx); }
  return ctx.reply('🎨 *Внутренняя отделка нужна?*', { parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('✅ Да', 'cfg_finish_yes')], [Markup.button.callback('❌ Нет', 'cfg_finish_no')]]) });
}

function askFinishWalls(ctx) {
  return ctx.reply('🔲 *Стены:*', { parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('Гипсокартон', 'cfg_fwall_gk')], [Markup.button.callback('Вагонка', 'cfg_fwall_vag')], [Markup.button.callback('Штукатурка', 'cfg_fwall_sht')], [Markup.button.callback('Покраска', 'cfg_fwall_paint')]]) });
}

function askEngineering(ctx) {
  return ctx.reply('🔥 *Отопление нужно?*', { parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('✅ Да', 'cfg_eng_heat_yes')], [Markup.button.callback('❌ Нет', 'cfg_eng_heat_no')]]) });
}

// ============================================================
// TEXT MESSAGE HANDLER
// ============================================================
async function handleMessage(ctx) {
  const c = ctx.session.config; if (!c) return;

  if (c.step === 'client_name') {
    c.clientName = ctx.message.text.trim();
    if (c.houseType === 'module') { c.step = 'modules_count';
      return ctx.reply('🧱 *Количество модулей:*', { parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('1', 'cfg_modcount_1'), Markup.button.callback('2', 'cfg_modcount_2'), Markup.button.callback('3', 'cfg_modcount_3')]]) });
    }
    c.step = 'area'; return ctx.reply('📐 Площадь дома (60–280 м²):');
  }

  if (c.step === 'area') {
    const a = parseFloat(ctx.message.text.replace(/\s/g, '').replace(',', '.'));
    if (isNaN(a) || a < 60 || a > 280) return ctx.reply('❌ От 60 до 280:');
    c.area = a; c.step = 'floors';
    return ctx.reply('🏗 *Этажность:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('1 этаж','cfg_floors_1')],[Markup.button.callback('1.5 (мансарда)','cfg_floors_1.5')],[Markup.button.callback('2 этажа','cfg_floors_2')]]) });
  }

  if (c.step === 'windows_count') {
    const n = parseInt(ctx.message.text); if (isNaN(n)||n<1||n>30) return ctx.reply('❌ От 1 до 30:');
    c.windowsCount = n; c.step = 'door';
    return ctx.reply('🚪 *Входная дверь:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('Металл эконом','cfg_door_eco')],[Markup.button.callback('Металл стандарт','cfg_door_std')],[Markup.button.callback('Металл премиум','cfg_door_prem')],[Markup.button.callback('Пластиковая','cfg_door_plastic')]]) });
  }

  if (c.step === 'terrace_area') {
    const a = parseFloat(ctx.message.text.replace(/\s/g, '').replace(',', '.'));
    if (isNaN(a)||a<=0) return ctx.reply('❌ Число:');
    c.terraceArea = a; c.step = 'terrace_railing';
    return ctx.reply('🏡 Ограждение террасы (погонных метров, 0 = нет):');
  }

  if (c.step === 'terrace_railing') {
    c.terraceRailing = parseFloat(ctx.message.text.replace(/\s/g, '').replace(',', '.')) || 0;
    c.step = 'terrace_steps';
    return ctx.reply('🪜 *Ступени / крыльцо?*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('✅ Да', 'cfg_tersteps_yes')], [Markup.button.callback('❌ Нет', 'cfg_tersteps_no')]]) });
  }

  if (c.step === 'extra_discount') {
    const d = parseFloat(ctx.message.text.replace(/\s/g, '').replace(',', '.')) || 0;
    c.extraDiscount = d; c.step = 'confirm';
    return showConfirmation(ctx, c);
  }
}

// ============================================================
// CONFIRMATION
// ============================================================
async function showConfirmation(ctx, c) {
  const typeName = { module:'Модуль', standard:'Стандарт', standardplus:'Стандарт +' }[c.houseType];
  const fm = { '1':'1 этаж', '1.5':'1.5 (мансарда)', '2':'2 этажа' };
  let t = `📋 *${typeName} — проверь:*\n\n👤 ${c.clientName}\n`;

  if (c.houseType === 'module') {
    t += `🧱 Модулей: ${c.modulesCount}\n`;
  } else {
    t += `📐 ${c.area} м² | ${fm[c.floors]||c.floors}\n🎨 ${c.style} | 🛏 ${c.bedrooms}\n🧱 Стены: ${c.wallInsulation} мм\n🏗 ${c.roofType}, ${c.roofMaterial}\n🏠 ${c.facade}\n🪟 ${c.windows}, ${c.windowsCount} шт\n🚪 ${c.door}\n`;
  }

  if (c.terrace) t += `🏡 Терраса ${c.terraceType}, ${c.terraceArea} м²${c.terraceRailing?' | огр. '+c.terraceRailing+'м':''}${c.terraceSteps?' | ступени':''}  \n`;
  if (c.needFinishing) t += `🎨 Отделка: да\n`;
  t += `🔥 Отопление: ${c.needHeating?'да':'нет'} | 🔧 Сантехника: ${c.needPlumbing?'да':'нет'}\n`;
  t += `⚡ Электрика: ${c.needElectric?'да':'нет'} | 🌬 Вентиляция: ${c.needVent?'да':'нет'}\n`;
  if (c.needSeptik) t += `🏗 Септик: да\n`;
  if (c.needWell) t += `💧 Скважина: да\n`;
  if (c.needRender) t += `🎨 Рендер: да\n`;
  if (c.extraDiscount > 0) t += `💰 Доп. скидка: ${c.extraDiscount}%\n`;

  return ctx.reply(t, { parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('✅ Сформировать PDF', 'cfg_generate')], [Markup.button.callback('❌ Отменить', 'cfg_cancel')]]) });
}

// ============================================================
// CALCULATION
// ============================================================
function calculate(c, priceMap, coefficients) {
  const p = (name) => {
    if (priceMap[name] !== undefined) return priceMap[name];
    const k = Object.keys(priceMap).find(k => k.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(k.toLowerCase()));
    return k ? priceMap[k] : 0;
  };

  let total = 0;
  const sections = [];

  if (c.houseType === 'module') {
    // Модули — целиком из прайса
    const modKey = `Каркас модуль (${c.modulesCount} модул${c.modulesCount===1?'ь':'я'})`;
    const modPrice = p(modKey) || p('Каркас модуль (1 модуль)') || 30000;
    // Для модулей площадь примерно 30 м² за модуль
    const modArea = c.modulesCount * 30;
    c.area = modArea; // для расчёта свай и PDF
    const modTotal = modArea * modPrice;
    total += modTotal;
    sections.push(`Модуль (${c.modulesCount} шт)`);
  } else {
    const area = parseFloat(c.area);
    const perimeter = Math.sqrt(area) * 4;
    const wallH = c.floors === '2' ? 5.2 : c.floors === '1.5' ? 4.2 : 2.7;
    const wallArea = Math.round(perimeter * wallH);
    const roofCoeff = { 'Двускатная':1.3, 'Односкатная':1.15, 'Вальмовая':1.4, 'Плоская':1.05 }[c.roofType] || 1.3;
    const roofArea = Math.round(area * roofCoeff);

    // Каркас
    let fk = c.floors==='2'?'Каркас 2 этажа':c.floors==='1.5'?'Каркас 1.5 этажа (мансарда)':'Каркас 1 этаж';
    if (c.style==='A-frame') fk='Каркас A-frame';
    total += area * (p(fk) || 45000);
    sections.push('Каркас дома');

    // Утепление
    const insW = c.wallInsulation===150 ? p('Утепление стен 150 мм (минвата)')||500 : p('Утепление стен 200 мм (минвата)')||750;
    const surf = wallArea + roofArea + area;
    total += wallArea*insW + roofArea*(p('Утепление кровли 200 мм')||750) + area*(p('Утепление пола 200 мм')||750) + surf*(p('Пароизоляция')||150) + surf*(p('Ветрозащита')||100);
    sections.push('Утепление');

    // Кровля
    const rmMap = { 'Профнастил':'Профнастил (материал + монтаж)', 'Металлочерепица':'Металлочерепица (материал + монтаж)', 'Мягкая кровля':'Мягкая кровля (материал + монтаж)' };
    const rsMap = { 'Двускатная':'Наценка двускатная крыша', 'Односкатная':'Наценка односкатная крыша', 'Вальмовая':'Наценка вальмовая крыша', 'Плоская':'Наценка плоская крыша' };
    total += roofArea*(p(rmMap[c.roofMaterial])||2500) + roofArea*(p(rsMap[c.roofType])||500) + perimeter*(p('Водосточная система')||2500) + perimeter*(p('Подшивка свесов софитами')||3500);
    sections.push(`Кровля (${c.roofType}, ${c.roofMaterial})`);

    // Фасад
    total += wallArea * (p(c.facade) || 3000);
    sections.push('Фасад');

    // Окна
    const wc = parseInt(c.windowsCount)||8; const wA = wc*2;
    total += wA*(p(c.windows)||11000) + wA*(p('Монтаж окна (работа)')||5500) + wc*(p('Откосы и подоконник')||7000);
    sections.push(`Окна (${wc} шт)`);

    // Дверь
    total += (p(c.door)||42000) + (p('Монтаж входной двери')||12000);
    sections.push('Входная дверь');
  }

  // Сваи (для всех типов)
  const area = parseFloat(c.area) || 90;
  const terraceArea = parseFloat(c.terraceArea) || 0;
  const svaiCount = Math.ceil((area + terraceArea) / 2.5);
  const svaiMap = {
    metal89: 'Винтовая свая 89×2500 мм', metal108: 'Винтовая свая 108×2500 мм',
    jb150_3: 'Железобетонные сваи 150х150/3000', jb150_4: 'Железобетонные сваи 150х150/4000',
    jb200_3: 'Железобетонные сваи 200х200/3000', jb200_4: 'Железобетонные сваи 200х200/4000',
  };
  const svaiName = svaiMap[c.svaiType] || 'Винтовая свая 108×2500 мм';
  total += svaiCount*(p(svaiName)||6500) + svaiCount*(p('Оголовок 250×250')||250) + svaiCount*(p('Монтаж свай (работа)')||2500) + area*(p('Обвязка доской 200*50')||p('Обвязка доской')||1500);
  sections.push('Фундамент (сваи)');

  // Терраса
  if (c.terrace && terraceArea > 0) {
    total += terraceArea * (p(c.terrace) || 20000);
    if (c.terraceRailing > 0) total += c.terraceRailing * (p('Ограждение террасы') || 8000);
    if (c.terraceSteps) total += p('Ступени / крыльцо простая доска') || 35000;
    sections.push(`Терраса ${c.terraceType}`);
  }

  // Отделка
  if (c.needFinishing && c.houseType !== 'module') {
    const a = parseFloat(c.area);
    const per = Math.sqrt(a)*4;
    const wH = c.floors==='2'?5.2:c.floors==='1.5'?4.2:2.7;
    const wA = Math.round(per*wH);
    total += wA * (p(c.finishWalls)||1000);
    total += a * (p(c.finishCeiling)||1800);
    total += a * (p(c.finishFloor)||3000);
    const doorCount = (c.bedrooms||3) + 1; // спальни + санузел
    total += doorCount * ((p(c.finishDoors)||10000) + (p('Монтаж межкомнатной двери')||8000));
    total += per * ((p('Плинтус напольный ПВХ')||100) + (p('Монтаж плинтуса')||200));
    sections.push('Внутренняя отделка');
  }

  // Инженерка
  if (c.needHeating) {
    const a = parseFloat(c.area) || 80;
    total += (p('Электрический котёл')||100000) + a*(p('Монтаж отопления (работа)')||2500);
    sections.push('Отопление');
  }
  if (c.needPlumbing) {
    total += 6*(p('Точка водоснабжения (подвод)')||4500) + 6*(p('Точка канализации (подвод)')||4500) + 6*(p('Монтаж сантехники (работа)')||4500);
    sections.push('Сантехника');
  }
  if (c.needElectric) {
    total += (p('Щиток электрический')||10000) + 12*(p('Автомат (1 шт)')||1500) + (p('УЗО')||2000) + (p('Заземление')||25000) + (p('Ввод электричества в дом')||40000) + 20*(p('Розетка (с монтажом)')||1500) + 10*(p('Выключатель (с монтажом)')||1500) + 15*(p('Точка освещения (с монтажом)')||1500);
    sections.push('Электрика');
  }
  if (c.needVent) { total += 50000; sections.push('Вентиляция'); }
  if (c.needSeptik) { total += p('Септик / выгребная яма') || 250000; sections.push('Септик'); }
  if (c.needWell) { total += p('Насосная станция / скважинный насос') || 350000; sections.push('Скважина'); }

  return { grandTotal: Math.round(total), sections };
}

// ============================================================
// GENERATE PDF
// ============================================================
async function generatePDF(ctx) {
  const c = ctx.session.config;
  await ctx.editMessageText('⏳ Считаю смету...');

  try {
    const [priceRows, coefficients, companyInfo] = await Promise.all([getPriceList(), getCoefficients(), getCompanyInfo()]);
    const priceMap = buildPriceMap(priceRows, c.houseType);
    // Добавляем ВСЕ цены как fallback (для позиций без меток)
    for (const row of priceRows) { const n=(row[1]||'').trim(); const v=num(row[3]); if(n&&v&&!priceMap[n]) priceMap[n]=v; }

    const { grandTotal, sections } = calculate(c, priceMap, coefficients);

    // Рендеры
    let renderPaths = null;
    if (c.needRender) {
      try {
        await ctx.telegram.sendMessage(ctx.from.id, '🎨 Генерирую рендеры дома...');
        renderPaths = await generateHouseRenders(c);
      } catch(e) { console.error('Render error:', e.message); await ctx.telegram.sendMessage(ctx.from.id, '⚠️ Рендеры не удались, формирую PDF без них.'); }
    }

    const fm = { '1':'1 этаж', '1.5':'1.5 (мансарда)', '2':'2 этажа' };
    const typeName = { module:'Модуль', standard:'Стандарт', standardplus:'Стандарт +' }[c.houseType];

    const pdfData = {
      clientName: c.clientName, area: c.area || (c.modulesCount*30), floors: fm[c.floors]||c.floors||'-',
      style: c.style||(c.houseType==='module'?'Модуль':'-'), bedrooms: c.bedrooms||'-',
      wallInsulation: c.wallInsulation ? `${c.wallInsulation} мм` : '-',
      roofType: c.roofType||'-', roofMaterial: c.roofMaterial||'-', facade: c.facade||'-',
      windows: c.windows?(c.windows.replace('Окно ПВХ ','')+', '+(c.windowsCount||0)+' шт'):'-',
      windowsCount: c.windowsCount||0, door: c.door||'-',
      terrace: c.terrace ? `${c.terraceType}, ${c.terraceArea} м²` : null,
      houseType: typeName, sectionsList: sections, grandTotal,
      extraDiscount: c.extraDiscount || 0,
      needFinishing: c.needFinishing, needHeating: c.needHeating, needPlumbing: c.needPlumbing,
      needElectric: c.needElectric, needVent: c.needVent, needSeptik: c.needSeptik, needWell: c.needWell,
      company: companyInfo, renderPaths,
    };

    await ctx.telegram.sendMessage(ctx.from.id, '📄 Формирую PDF...');
    const pdfPath = await generateEstimatePDF(pdfData);

    const disc2 = Math.round(grandTotal * 0.02);
    const discExtra = c.extraDiscount > 0 ? Math.round(grandTotal * c.extraDiscount / 100) : 0;
    const finalTotal = grandTotal - disc2 - discExtra;

    let caption = `✅ *${c.clientName}*\n📋 ${typeName}\n\n💰 Стоимость: *${grandTotal.toLocaleString('ru-RU')} ₽*\n🎁 Скидка 2%: *-${disc2.toLocaleString('ru-RU')} ₽*`;
    if (discExtra > 0) caption += `\n💰 Доп. скидка ${c.extraDiscount}%: *-${discExtra.toLocaleString('ru-RU')} ₽*`;
    caption += `\n✅ Итого: *${finalTotal.toLocaleString('ru-RU')} ₽*`;
    if (c.area) caption += `\n📐 За м²: *${Math.round(finalTotal/parseFloat(c.area||90)).toLocaleString('ru-RU')} ₽*`;

    await ctx.replyWithDocument({ source: pdfPath, filename: `Смета_${c.clientName.replace(/\s/g,'_')}.pdf` }, { caption, parse_mode: 'Markdown' });

    try { require('fs').unlinkSync(pdfPath); } catch(e) {}
    if (renderPaths) { try { require('fs').unlinkSync(renderPaths.frontPath); require('fs').unlinkSync(renderPaths.backPath); } catch(e) {} }
    ctx.session.config = null; ctx.session.mode = null;
  } catch(err) {
    console.error('PDF error:', err.message, err.stack);
    return ctx.reply('❌ Ошибка: ' + err.message);
  }
}

module.exports = { setupConfigModule, handleCallback, handleMessage };
