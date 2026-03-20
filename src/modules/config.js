const { Markup } = require('telegraf');
const { hasAccess } = require('../services/roles');
const { getPriceList, getCoefficients, getCompanyInfo } = require('../services/sheets');
const { generateEstimatePDF } = require('../services/pdf');

function setupConfigModule(bot) {
  bot.hears('🏠 Смета', async (ctx) => {
    if (!hasAccess(ctx.from.id, 'finance')) return ctx.reply('⛔ Нет доступа.');
    ctx.session.mode = 'config';
    ctx.session.config = { step: 'client_name' };
    return ctx.reply('🏠 *Конфигуратор дома*\n\nВведи ФИО заказчика:', { parse_mode: 'Markdown' });
  });
}

async function handleCallback(ctx) {
  const data = ctx.callbackQuery.data;
  await ctx.answerCbQuery();
  const cfg = ctx.session.config;
  if (!cfg) return;

  if (data.startsWith('cfg_floors_')) {
    cfg.floors = data.replace('cfg_floors_', '');
    cfg.step = 'style';
    return ctx.reply('🎨 *Стиль дома:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Барнхаус', 'cfg_style_barnhouse')],
        [Markup.button.callback('Скандинавский', 'cfg_style_scandinavian')],
        [Markup.button.callback('Классический', 'cfg_style_classic')],
        [Markup.button.callback('Современный', 'cfg_style_modern')],
        [Markup.button.callback('A-frame', 'cfg_style_aframe')],
        [Markup.button.callback('Модуль', 'cfg_style_module')],
      ]) });
  }

  if (data.startsWith('cfg_style_')) {
    const m = { barnhouse:'Барнхаус', scandinavian:'Скандинавский', classic:'Классический', modern:'Современный', aframe:'A-frame', module:'Модуль' };
    cfg.style = m[data.replace('cfg_style_', '')] || 'Барнхаус';
    if (cfg.style === 'Модуль') {
      cfg.step = 'modules_count';
      return ctx.reply('🧱 *Количество модулей:*', { parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('1', 'cfg_mod_1'), Markup.button.callback('2', 'cfg_mod_2'), Markup.button.callback('3', 'cfg_mod_3')]]) });
    }
    cfg.step = 'bedrooms';
    return askBedrooms(ctx);
  }

  if (data.startsWith('cfg_mod_')) { cfg.modulesCount = parseInt(data.replace('cfg_mod_', '')); cfg.step = 'bedrooms'; return askBedrooms(ctx); }

  if (data.startsWith('cfg_bed_')) {
    cfg.bedrooms = parseInt(data.replace('cfg_bed_', ''));
    cfg.step = 'wall_insulation';
    return ctx.reply('🧱 *Утепление стен:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('150 мм', 'cfg_ins_150')], [Markup.button.callback('200 мм', 'cfg_ins_200')]]) });
  }

  if (data.startsWith('cfg_ins_')) {
    cfg.wallInsulation = parseInt(data.replace('cfg_ins_', ''));
    cfg.step = 'roof_type';
    return ctx.reply('🏗 *Тип крыши:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Двускатная', 'cfg_roof_double')], [Markup.button.callback('Односкатная', 'cfg_roof_single')],
        [Markup.button.callback('Вальмовая', 'cfg_roof_hip')], [Markup.button.callback('Плоская', 'cfg_roof_flat')],
      ]) });
  }

  if (data.startsWith('cfg_roof_')) {
    const m = { double:'Двускатная', single:'Односкатная', hip:'Вальмовая', flat:'Плоская' };
    cfg.roofType = m[data.replace('cfg_roof_', '')] || 'Двускатная';
    cfg.step = 'roof_material';
    return ctx.reply('🪵 *Покрытие крыши:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Профнастил', 'cfg_roofm_profnastil')],
        [Markup.button.callback('Металлочерепица', 'cfg_roofm_metallocherepica')],
        [Markup.button.callback('Мягкая кровля', 'cfg_roofm_soft')],
      ]) });
  }

  if (data.startsWith('cfg_roofm_')) {
    const m = { profnastil:'Профнастил', metallocherepica:'Металлочерепица', soft:'Мягкая кровля' };
    cfg.roofMaterial = m[data.replace('cfg_roofm_', '')] || 'Профнастил';
    cfg.step = 'facade';
    return ctx.reply('🏠 *Фасад:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Металл / софиты', 'cfg_fas_metal')], [Markup.button.callback('Имитация бруса', 'cfg_fas_wood')],
        [Markup.button.callback('Штукатурка', 'cfg_fas_plaster')], [Markup.button.callback('Плитка Hauberk', 'cfg_fas_hauberk')],
        [Markup.button.callback('Металл + дерево', 'cfg_fas_combo1')], [Markup.button.callback('Металл + штукатурка', 'cfg_fas_combo2')],
      ]) });
  }

  if (data.startsWith('cfg_fas_')) {
    const m = { metal:'Металлический сайдинг / софиты', wood:'Имитация бруса', plaster:'Штукатурка (мокрый фасад)', hauberk:'Фасадная плитка Hauberk', combo1:'Комбинация: металл + дерево', combo2:'Комбинация: металл + штукатурка' };
    cfg.facade = m[data.replace('cfg_fas_', '')] || 'Металлический сайдинг / софиты';
    cfg.step = 'windows';
    return ctx.reply('🪟 *Окна:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('ПВХ белые', 'cfg_win_white')],
        [Markup.button.callback('Ламинация 1 сторона', 'cfg_win_lam1')],
        [Markup.button.callback('Ламинация 2 стороны', 'cfg_win_lam2')],
      ]) });
  }

  if (data.startsWith('cfg_win_')) {
    const m = { white:'Окно ПВХ белые', lam1:'Окно ПВХ ламинация 1 сторона', lam2:'Окно ПВХ ламинация 2 стороны' };
    cfg.windows = m[data.replace('cfg_win_', '')] || 'Окно ПВХ белые';
    cfg.step = 'windows_count';
    return ctx.reply('🪟 Сколько окон? (введи число):');
  }

  if (data.startsWith('cfg_door_')) {
    const m = { eco:'Дверь входная металлическая (эконом)', std:'Дверь входная металлическая (стандарт)', prem:'Дверь входная металлическая (премиум)', plastic:'Дверь входная пластиковая' };
    cfg.door = m[data.replace('cfg_door_', '')] || 'Дверь входная металлическая (стандарт)';
    cfg.step = 'terrace';
    return ctx.reply('🏡 *Терраса:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('Нет', 'cfg_ter_no')], [Markup.button.callback('Открытая', 'cfg_ter_open')], [Markup.button.callback('Закрытая', 'cfg_ter_closed')]]) });
  }

  if (data.startsWith('cfg_ter_')) {
    const v = data.replace('cfg_ter_', '');
    if (v === 'no') { cfg.terrace = null; cfg.terraceArea = 0; cfg.step = 'confirm'; return showConfirmation(ctx, cfg); }
    cfg.terrace = v === 'open' ? 'Терраса открытая (материал + работа)' : 'Терраса закрытая (материал + работа)';
    cfg.terraceType = v === 'open' ? 'открытая' : 'закрытая';
    cfg.step = 'terrace_area';
    return ctx.reply('📐 Площадь террасы (м²):');
  }

  if (data === 'cfg_generate') return generatePDF(ctx);
  if (data === 'cfg_cancel') { ctx.session.config = null; ctx.session.mode = null; return ctx.editMessageText('❌ Отменено.'); }
}

function askBedrooms(ctx) {
  return ctx.reply('🛏 *Количество спален:*', { parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('1', 'cfg_bed_1'), Markup.button.callback('2', 'cfg_bed_2'), Markup.button.callback('3', 'cfg_bed_3')],
      [Markup.button.callback('4', 'cfg_bed_4'), Markup.button.callback('5', 'cfg_bed_5')],
    ]) });
}

async function showConfirmation(ctx, cfg) {
  const fm = { '1':'1 этаж', '1.5':'1.5 (мансарда)', '2':'2 этажа' };
  let t = `📋 *Проверь параметры:*\n\n👤 ${cfg.clientName}\n📐 ${cfg.area} м²\n🏗 ${fm[cfg.floors]||cfg.floors}\n🎨 ${cfg.style}${cfg.modulesCount?` (${cfg.modulesCount} мод.)`:''}\n🛏 ${cfg.bedrooms} спален\n🧱 Стены: ${cfg.wallInsulation} мм\n🏗 ${cfg.roofType}, ${cfg.roofMaterial}\n🏠 ${cfg.facade}\n🪟 ${cfg.windows}, ${cfg.windowsCount} шт\n🚪 ${cfg.door}\n`;
  if (cfg.terrace) t += `🏡 Терраса ${cfg.terraceType}, ${cfg.terraceArea} м²\n`;
  return ctx.reply(t, { parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('✅ Сформировать PDF', 'cfg_generate')], [Markup.button.callback('❌ Отменить', 'cfg_cancel')]]) });
}

// ============================================================
// РАСЧЁТ СМЕТЫ — ВСЕ ФОРМУЛЫ
// ============================================================
function calculateEstimate(cfg, priceMap, coefficients) {
  const area = parseFloat(cfg.area);
  const terraceArea = parseFloat(cfg.terraceArea) || 0;

  // Поиск цены по названию (точное или частичное совпадение)
  const p = (name) => {
    if (priceMap[name] !== undefined) return priceMap[name];
    const key = Object.keys(priceMap).find(k => k.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(k.toLowerCase()));
    return key ? priceMap[key] : 0;
  };

  // Геометрия
  const wallH1 = parseFloat(coefficients['Высота стен 1 этаж (м)']) || 2.7;
  const wallH2 = parseFloat(coefficients['Высота стен 2 этаж (м)']) || 2.5;
  const wallHM = parseFloat(coefficients['Высота стен мансарда (м)']) || 1.5;
  const wallHeight = cfg.floors === '2' ? wallH1 + wallH2 : cfg.floors === '1.5' ? wallH1 + wallHM : wallH1;
  const perimeter = Math.sqrt(area) * 4;
  const wallArea = Math.round(perimeter * wallHeight);
  const roofCoeff = parseFloat(coefficients[`Коэфф. крыши ${cfg.roofType.toLowerCase()}`]) || { 'Двускатная':1.3, 'Односкатная':1.15, 'Вальмовая':1.4, 'Плоская':1.05 }[cfg.roofType] || 1.3;
  const roofArea = Math.round(area * roofCoeff);

  // 1. ФУНДАМЕНТ: (площадь + терраса) / 2.5 = кол-во свай
  const svaiCount = Math.ceil((area + terraceArea) / 2.5);
  const foundation = (svaiCount * (p('Винтовая свая 108×2500 мм') || 6500)) + (svaiCount * (p('Оголовок 250×250') || 250)) + (svaiCount * (p('Монтаж свай (работа)') || 2500)) + (area * (p('Обвязка доской 200*50') || p('Обвязка доской') || 1500));

  // 2. КАРКАС: площадь × цена/м²
  let fk = 'Каркас 1 этаж';
  if (cfg.floors === '2') fk = 'Каркас 2 этажа';
  else if (cfg.floors === '1.5') fk = 'Каркас 1.5 этажа (мансарда)';
  if (cfg.style === 'A-frame') fk = 'Каркас A-frame';
  if (cfg.style === 'Модуль') fk = `Каркас модуль (${cfg.modulesCount||1} модул${(cfg.modulesCount||1)===1?'ь':'я'})`;
  const frame = area * (p(fk) || p('Каркас дома (материал + работа)') || 45000);

  // 3. УТЕПЛЕНИЕ: площади × цены
  const insWall = cfg.wallInsulation === 150 ? p('Утепление стен 150 мм (минвата)') || 500 : p('Утепление стен 200 мм (минвата)') || 750;
  const totalSurface = wallArea + roofArea + area;
  const insulation = (wallArea * insWall) + (roofArea * (p('Утепление кровли 200 мм') || 750)) + (area * (p('Утепление пола 200 мм') || 750)) + (totalSurface * (p('Пароизоляция') || 150)) + (totalSurface * (p('Ветрозащита') || 100));

  // 4. КРОВЛЯ: площадь крыши × цена + периметр × водосток/подшивка
  const rmMap = { 'Профнастил':'Профнастил (материал + монтаж)', 'Металлочерепица':'Металлочерепица (материал + монтаж)', 'Мягкая кровля':'Мягкая кровля (материал + монтаж)' };
  const rsMap = { 'Двускатная':'Наценка двускатная крыша', 'Односкатная':'Наценка односкатная крыша', 'Вальмовая':'Наценка вальмовая крыша', 'Плоская':'Наценка плоская крыша' };
  const roof = (roofArea * (p(rmMap[cfg.roofMaterial]) || 2500)) + (roofArea * (p(rsMap[cfg.roofType]) || 500)) + (perimeter * (p('Водосточная система') || 2500)) + (perimeter * (p('Подшивка свесов софитами') || 3500));

  // 5. ФАСАД: площадь стен × цена/м²
  const facade = wallArea * (p(cfg.facade) || 3000);

  // 6. ОКНА: среднее окно 2 м², кол-во × 2 × цена + монтаж + откосы
  const wc = parseInt(cfg.windowsCount) || 8;
  const wArea = wc * 2;
  const windows = (wArea * (p(cfg.windows) || 11000)) + (wArea * (p('Монтаж окна (работа)') || 5500)) + (wc * (p('Откосы и подоконник') || 7000));

  // 7. ДВЕРЬ: штучная + монтаж
  const door = (p(cfg.door) || 42000) + (p('Монтаж входной двери') || 12000);

  // 8. ТЕРРАСА: площадь × цена/м²
  let terrace = 0;
  if (cfg.terrace && terraceArea > 0) {
    terrace = terraceArea * (p(cfg.terrace) || (cfg.terraceType === 'открытая' ? 20000 : 40000));
  }

  const grandTotal = Math.round(foundation + frame + insulation + roof + facade + windows + door + terrace);

  console.log(`=== СМЕТА: ${cfg.clientName} ===`);
  console.log(`Площадь: ${area}м² | Терраса: ${terraceArea}м² | Периметр: ${perimeter.toFixed(1)}м | Стены: ${wallArea}м² | Крыша: ${roofArea}м² | Сваи: ${svaiCount}шт`);
  console.log(`Фундамент: ${foundation} | Каркас: ${frame} | Утепление: ${insulation} | Кровля: ${Math.round(roof)} | Фасад: ${facade} | Окна: ${windows} | Дверь: ${door} | Терраса: ${terrace}`);
  console.log(`ИТОГО: ${grandTotal}`);

  return { grandTotal };
}

async function generatePDF(ctx) {
  const cfg = ctx.session.config;
  await ctx.editMessageText('⏳ Считаю смету...');
  try {
    const [priceRows, coefficients, companyInfo] = await Promise.all([getPriceList(), getCoefficients(), getCompanyInfo()]);
    const priceMap = {};
    for (const row of priceRows) { const n = (row[1]||'').trim(); const v = parseFloat(row[3]); if (n && !isNaN(v)) priceMap[n] = v; }

    const { grandTotal } = calculateEstimate(cfg, priceMap, coefficients);

    const sectionsList = ['Фундамент (сваи)', 'Каркас дома', 'Утепление (стены, кровля, пол)', `Кровля (${cfg.roofType.toLowerCase()}, ${cfg.roofMaterial.toLowerCase()})`, `Фасад (${cfg.facade.toLowerCase()})`, `Окна (${cfg.windowsCount} шт)`, 'Входная дверь'];
    if (cfg.terrace) sectionsList.push(`Терраса ${cfg.terraceType} (${cfg.terraceArea} м²)`);

    const fm = { '1':'1 этаж', '1.5':'1.5 (мансарда)', '2':'2 этажа' };
    const pdfData = {
      clientName: cfg.clientName, area: cfg.area, floors: fm[cfg.floors]||cfg.floors,
      style: cfg.style + (cfg.modulesCount ? ` (${cfg.modulesCount} мод.)` : ''),
      bedrooms: cfg.bedrooms, wallInsulation: `${cfg.wallInsulation} мм`,
      roofType: cfg.roofType, roofMaterial: cfg.roofMaterial, facade: cfg.facade,
      windows: cfg.windows.replace('Окно ПВХ ', ''), windowsCount: cfg.windowsCount, door: cfg.door,
      terrace: cfg.terrace ? `${cfg.terraceType}, ${cfg.terraceArea} м²` : null,
      sectionsList, grandTotal, company: companyInfo,
    };

    const pdfPath = await generateEstimatePDF(pdfData);
    const discount = Math.round(grandTotal * 0.02);
    const finalTotal = grandTotal - discount;

    await ctx.replyWithDocument(
      { source: pdfPath, filename: `Смета_${cfg.clientName.replace(/\s/g, '_')}.pdf` },
      { caption: `✅ *${cfg.clientName}*\n\n💰 Стоимость: *${grandTotal.toLocaleString('ru-RU')} ₽*\n🎁 Скидка 2%: *-${discount.toLocaleString('ru-RU')} ₽*\n✅ Итого: *${finalTotal.toLocaleString('ru-RU')} ₽*\n📐 За м²: *${Math.round(finalTotal/parseFloat(cfg.area)).toLocaleString('ru-RU')} ₽*`, parse_mode: 'Markdown' }
    );
    try { require('fs').unlinkSync(pdfPath); } catch(e) {}
    ctx.session.config = null; ctx.session.mode = null;
  } catch (err) {
    console.error('PDF ошибка:', err.message, err.stack);
    return ctx.reply('❌ Ошибка: ' + err.message);
  }
}

async function handleMessage(ctx) {
  const cfg = ctx.session.config;
  if (!cfg) return;
  if (cfg.step === 'client_name') { cfg.clientName = ctx.message.text.trim(); cfg.step = 'area'; return ctx.reply('📐 Площадь дома (м², от 60 до 280):'); }
  if (cfg.step === 'area') {
    const a = parseFloat(ctx.message.text.replace(',', '.'));
    if (isNaN(a) || a < 60 || a > 280) return ctx.reply('❌ От 60 до 280 м²:');
    cfg.area = a; cfg.step = 'floors';
    return ctx.reply('🏗 *Этажность:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('1 этаж', 'cfg_floors_1')], [Markup.button.callback('1.5 (мансарда)', 'cfg_floors_1.5')], [Markup.button.callback('2 этажа', 'cfg_floors_2')]]) });
  }
  if (cfg.step === 'windows_count') {
    const c = parseInt(ctx.message.text);
    if (isNaN(c) || c < 1 || c > 30) return ctx.reply('❌ От 1 до 30:');
    cfg.windowsCount = c; cfg.step = 'door';
    return ctx.reply('🚪 *Входная дверь:*', { parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('Металл (эконом)', 'cfg_door_eco')], [Markup.button.callback('Металл (стандарт)', 'cfg_door_std')], [Markup.button.callback('Металл (премиум)', 'cfg_door_prem')], [Markup.button.callback('Пластиковая', 'cfg_door_plastic')]]) });
  }
  if (cfg.step === 'terrace_area') {
    const a = parseFloat(ctx.message.text.replace(',', '.'));
    if (isNaN(a) || a <= 0) return ctx.reply('❌ Введи площадь:');
    cfg.terraceArea = a; cfg.step = 'confirm';
    return showConfirmation(ctx, cfg);
  }
}

module.exports = { setupConfigModule, handleCallback, handleMessage };