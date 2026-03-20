const { Markup } = require('telegraf');
const { hasAccess } = require('../services/roles');
const { getObjects, getPriceList, getCoefficients, getCompanyInfo } = require('../services/sheets');
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

  // === ЭТАЖНОСТЬ ===
  if (data.startsWith('cfg_floors_')) {
    cfg.floors = data.replace('cfg_floors_', '');
    cfg.step = 'style';
    return ctx.reply('🎨 *Стиль дома:*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Барнхаус', 'cfg_style_barnhouse')],
        [Markup.button.callback('Скандинавский', 'cfg_style_scandinavian')],
        [Markup.button.callback('Классический', 'cfg_style_classic')],
        [Markup.button.callback('Современный', 'cfg_style_modern')],
        [Markup.button.callback('A-frame', 'cfg_style_aframe')],
        [Markup.button.callback('Модуль', 'cfg_style_module')],
      ]),
    });
  }

  // === СТИЛЬ ===
  if (data.startsWith('cfg_style_')) {
    const styleMap = {
      barnhouse: 'Барнхаус', scandinavian: 'Скандинавский', classic: 'Классический',
      modern: 'Современный', aframe: 'A-frame', module: 'Модуль',
    };
    cfg.style = styleMap[data.replace('cfg_style_', '')] || 'Барнхаус';
    
    if (cfg.style === 'Модуль') {
      cfg.step = 'modules_count';
      return ctx.reply('🧱 *Количество модулей:*', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('1 модуль', 'cfg_mod_1'),
           Markup.button.callback('2 модуля', 'cfg_mod_2'),
           Markup.button.callback('3 модуля', 'cfg_mod_3')],
        ]),
      });
    }
    cfg.step = 'bedrooms';
    return askBedrooms(ctx);
  }

  // === МОДУЛИ ===
  if (data.startsWith('cfg_mod_')) {
    cfg.modulesCount = parseInt(data.replace('cfg_mod_', ''), 10);
    cfg.step = 'bedrooms';
    return askBedrooms(ctx);
  }

  // === СПАЛЬНИ ===
  if (data.startsWith('cfg_bed_')) {
    cfg.bedrooms = parseInt(data.replace('cfg_bed_', ''), 10);
    cfg.step = 'wall_insulation';
    return ctx.reply('🧱 *Утепление стен:*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('150 мм', 'cfg_ins_150')],
        [Markup.button.callback('200 мм', 'cfg_ins_200')],
      ]),
    });
  }

  // === УТЕПЛЕНИЕ СТЕН ===
  if (data.startsWith('cfg_ins_')) {
    cfg.wallInsulation = parseInt(data.replace('cfg_ins_', ''), 10);
    cfg.step = 'roof_type';
    return ctx.reply('🏗 *Тип крыши:*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Двускатная', 'cfg_roof_double')],
        [Markup.button.callback('Односкатная', 'cfg_roof_single')],
        [Markup.button.callback('Вальмовая', 'cfg_roof_hip')],
        [Markup.button.callback('Плоская', 'cfg_roof_flat')],
      ]),
    });
  }

  // === ТИП КРЫШИ ===
  if (data.startsWith('cfg_roof_')) {
    const roofMap = { double: 'Двускатная', single: 'Односкатная', hip: 'Вальмовая', flat: 'Плоская' };
    cfg.roofType = roofMap[data.replace('cfg_roof_', '')] || 'Двускатная';
    cfg.step = 'roof_material';
    return ctx.reply('🪵 *Покрытие крыши:*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Профнастил', 'cfg_roofm_profnastil')],
        [Markup.button.callback('Металлочерепица', 'cfg_roofm_metallocherepica')],
        [Markup.button.callback('Мягкая кровля', 'cfg_roofm_soft')],
      ]),
    });
  }

  // === ПОКРЫТИЕ КРЫШИ ===
  if (data.startsWith('cfg_roofm_')) {
    const matMap = { profnastil: 'Профнастил', metallocherepica: 'Металлочерепица', soft: 'Мягкая кровля' };
    cfg.roofMaterial = matMap[data.replace('cfg_roofm_', '')] || 'Профнастил';
    cfg.step = 'facade';
    return ctx.reply('🏠 *Фасад:*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Металл / софиты', 'cfg_fas_metal')],
        [Markup.button.callback('Имитация бруса', 'cfg_fas_wood')],
        [Markup.button.callback('Штукатурка', 'cfg_fas_plaster')],
        [Markup.button.callback('Плитка Hauberk', 'cfg_fas_hauberk')],
        [Markup.button.callback('Металл + дерево', 'cfg_fas_combo1')],
        [Markup.button.callback('Металл + штукатурка', 'cfg_fas_combo2')],
      ]),
    });
  }

  // === ФАСАД ===
  if (data.startsWith('cfg_fas_')) {
    const fasMap = {
      metal: 'Металлический сайдинг / софиты', wood: 'Имитация бруса',
      plaster: 'Штукатурка (мокрый фасад)', hauberk: 'Фасадная плитка Hauberk',
      combo1: 'Комбинация: металл + дерево', combo2: 'Комбинация: металл + штукатурка',
    };
    cfg.facade = fasMap[data.replace('cfg_fas_', '')] || 'Металлический сайдинг / софиты';
    cfg.step = 'windows';
    return ctx.reply('🪟 *Окна:*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('ПВХ белые', 'cfg_win_white')],
        [Markup.button.callback('Ламинация 1 сторона', 'cfg_win_lam1')],
        [Markup.button.callback('Ламинация 2 стороны', 'cfg_win_lam2')],
      ]),
    });
  }

  // === ОКНА ===
  if (data.startsWith('cfg_win_')) {
    const winMap = { white: 'Окно ПВХ белые', lam1: 'Окно ПВХ ламинация 1 сторона', lam2: 'Окно ПВХ ламинация 2 стороны' };
    cfg.windows = winMap[data.replace('cfg_win_', '')] || 'Окно ПВХ белые';
    cfg.step = 'windows_count';
    return ctx.reply('🪟 Сколько окон? (введи число):');
  }

  // === ВХОДНАЯ ДВЕРЬ ===
  if (data.startsWith('cfg_door_')) {
    const doorMap = {
      eco: 'Дверь входная металлическая (эконом)',
      std: 'Дверь входная металлическая (стандарт)',
      prem: 'Дверь входная металлическая (премиум)',
      plastic: 'Дверь входная пластиковая',
    };
    cfg.door = doorMap[data.replace('cfg_door_', '')] || 'Дверь входная металлическая (стандарт)';
    cfg.step = 'terrace';
    return ctx.reply('🏡 *Терраса:*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Нет', 'cfg_ter_no')],
        [Markup.button.callback('Открытая', 'cfg_ter_open')],
        [Markup.button.callback('Закрытая', 'cfg_ter_closed')],
      ]),
    });
  }

  // === ТЕРРАСА ===
  if (data.startsWith('cfg_ter_')) {
    const terVal = data.replace('cfg_ter_', '');
    if (terVal === 'no') {
      cfg.terrace = null;
      cfg.terraceArea = 0;
      cfg.step = 'confirm';
      return showConfirmation(ctx, cfg);
    }
    cfg.terrace = terVal === 'open' ? 'Терраса открытая (материал + работа)' : 'Терраса закрытая (материал + работа)';
    cfg.terraceType = terVal === 'open' ? 'открытая' : 'закрытая';
    cfg.step = 'terrace_area';
    return ctx.reply('📐 Площадь террасы (м²):');
  }

  // === ПОДТВЕРЖДЕНИЕ ===
  if (data === 'cfg_generate') {
    return generatePDF(ctx);
  }
  if (data === 'cfg_cancel') {
    ctx.session.config = null;
    ctx.session.mode = null;
    return ctx.editMessageText('❌ Отменено.');
  }
}

function askBedrooms(ctx) {
  return ctx.reply('🛏 *Количество спален:*', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback('1', 'cfg_bed_1'),
        Markup.button.callback('2', 'cfg_bed_2'),
        Markup.button.callback('3', 'cfg_bed_3'),
      ],
      [
        Markup.button.callback('4', 'cfg_bed_4'),
        Markup.button.callback('5', 'cfg_bed_5'),
      ],
    ]),
  });
}

async function showConfirmation(ctx, cfg) {
  const floorsMap = { '1': '1 этаж', '1.5': '1.5 этажа (мансарда)', '2': '2 этажа' };
  let text = `📋 *Проверь параметры:*\n\n` +
    `👤 ${cfg.clientName}\n` +
    `📐 Площадь: ${cfg.area} м²\n` +
    `🏗 Этажность: ${floorsMap[cfg.floors] || cfg.floors}\n` +
    `🎨 Стиль: ${cfg.style}${cfg.modulesCount ? ` (${cfg.modulesCount} мод.)` : ''}\n` +
    `🛏 Спален: ${cfg.bedrooms}\n` +
    `🧱 Утепление стен: ${cfg.wallInsulation} мм\n` +
    `🏗 Крыша: ${cfg.roofType}, ${cfg.roofMaterial}\n` +
    `🏠 Фасад: ${cfg.facade}\n` +
    `🪟 Окна: ${cfg.windows}, ${cfg.windowsCount} шт\n` +
    `🚪 Дверь: ${cfg.door}\n`;
  if (cfg.terrace) {
    text += `🏡 Терраса: ${cfg.terraceType}, ${cfg.terraceArea} м²\n`;
  }

  return ctx.reply(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('✅ Сформировать PDF', 'cfg_generate')],
      [Markup.button.callback('❌ Отменить', 'cfg_cancel')],
    ]),
  });
}

async function generatePDF(ctx) {
  const cfg = ctx.session.config;
  await ctx.editMessageText('⏳ Формирую смету...');

  try {
    const [priceRows, coefficients, companyInfo] = await Promise.all([
      getPriceList(), getCoefficients(), getCompanyInfo(),
    ]);

    // Строим прайс-мап: название → цена
    const priceMap = {};
    for (const row of priceRows) {
      if (row[1] && row[3]) {
        priceMap[row[1].trim()] = parseFloat(row[3]) || 0;
      }
    }

    // === РАСЧЁТ ===
    const area = parseFloat(cfg.area);
    const wallH = cfg.floors === '2' ? 5.2 : cfg.floors === '1.5' ? 4.2 : 2.7;
    const perimeter = Math.sqrt(area) * 4;
    const wallArea = perimeter * wallH;

    // Коэффициент крыши
    const roofCoeffMap = {
      'Двускатная': parseFloat(coefficients['Коэфф. крыши двускатная']) || 1.3,
      'Односкатная': parseFloat(coefficients['Коэфф. крыши односкатная']) || 1.15,
      'Вальмовая': parseFloat(coefficients['Коэфф. крыши вальмовая']) || 1.4,
      'Плоская': parseFloat(coefficients['Коэфф. крыши плоская']) || 1.05,
    };
    const roofCoeff = roofCoeffMap[cfg.roofType] || 1.3;
    const roofArea = area * roofCoeff;

    // Каркас — выбираем по этажности и стилю
    let frameKey = 'Каркас 1 этаж';
    if (cfg.floors === '2') frameKey = 'Каркас 2 этажа';
    else if (cfg.floors === '1.5') frameKey = 'Каркас 1.5 этажа (мансарда)';
    if (cfg.style === 'A-frame') frameKey = 'Каркас A-frame';
    if (cfg.style === 'Модуль') frameKey = `Каркас модуль (${cfg.modulesCount || 1} модул${cfg.modulesCount === 1 ? 'ь' : 'я'})`;
    const framePrice = priceMap[frameKey] || priceMap['Каркас дома (материал + работа)'] || 45000;

    // Сваи
    const svaiFactor = parseFloat(coefficients['Кол-во свай на 1 м² площади']) || 0.15;
    const svaiCount = Math.ceil(area * svaiFactor);
    // Берём первую сваю из прайса
    const svaiPrice = priceMap['Винтовая свая 108×2500 мм'] || priceMap['Винтовая свая 89×2500 мм'] || 6500;
    const ogolovokPrice = priceMap['Оголовок 250×250'] || 250;
    const montajSvaiPrice = priceMap['Монтаж свай (работа)'] || 2500;
    const obvyazkaPrice = priceMap['Обвязка доской 200*50 елочным соединение'] || priceMap['Обвязка доской'] || 1500;

    // Утепление
    const insWallKey = cfg.wallInsulation === 150 ? 'Утепление стен 150 мм (минвата)' : 'Утепление стен 200 мм (минвата)';
    const insWallPrice = priceMap[insWallKey] || 750;
    const insRoofPrice = priceMap['Утепление кровли 200 мм'] || 750;
    const insFloorPrice = priceMap['Утепление пола 200 мм'] || 750;
    const paroPrice = priceMap['Пароизоляция'] || 150;
    const vetroPrice = priceMap['Ветрозащита'] || 100;

    // Кровля
    const roofMatMap = {
      'Профнастил': 'Профнастил (материал + монтаж)',
      'Металлочерепица': 'Металлочерепица (материал + монтаж)',
      'Мягкая кровля': 'Мягкая кровля (материал + монтаж)',
    };
    const roofMatPrice = priceMap[roofMatMap[cfg.roofMaterial]] || 2500;
    const vodostokPrice = priceMap['Водосточная система'] || 2500;
    const podshivkaPrice = priceMap['Подшивка свесов софитами'] || 3500;

    // Фасад
    const facadePrice = priceMap[cfg.facade] || 3000;

    // Окна
    const winPrice = priceMap[cfg.windows] || 11000;
    const winMontaj = priceMap['Монтаж окна (работа)'] || 5500;
    const otkosyPrice = priceMap['Откосы и подоконник'] || 7000;
    const winCount = parseInt(cfg.windowsCount) || 8;
    const winAreaPerUnit = 1.2; // средняя площадь окна
    const winTotalArea = winCount * winAreaPerUnit;

    // Дверь
    const doorPrice = priceMap[cfg.door] || 42000;
    const doorMontaj = priceMap['Монтаж входной двери'] || 12000;

    // Терраса
    let terraceTotal = 0;
    if (cfg.terrace && cfg.terraceArea > 0) {
      const terPrice = priceMap[cfg.terrace] || 20000;
      terraceTotal = terPrice * cfg.terraceArea;
    }

    // Считаем разделы
    const totalArea = wallArea + roofArea + area; // стены + крыша + пол
    const sections = {
      foundation: svaiCount * svaiPrice + svaiCount * ogolovokPrice + svaiCount * montajSvaiPrice + perimeter * obvyazkaPrice,
      frame: area * framePrice,
      insulation: wallArea * insWallPrice + roofArea * insRoofPrice + area * insFloorPrice + totalArea * paroPrice + totalArea * vetroPrice,
      roof: roofArea * roofMatPrice + perimeter * vodostokPrice + perimeter * podshivkaPrice,
      facade: wallArea * facadePrice,
      windows: winTotalArea * winPrice + winTotalArea * winMontaj + winCount * otkosyPrice,
      door: doorPrice + doorMontaj,
      terrace: terraceTotal,
    };

    const grandTotal = Math.round(Object.values(sections).reduce((a, b) => a + b, 0));

    // Описания для PDF
    const sectionsList = [
      'Фундамент (сваи)',
      'Каркас дома',
      'Утепление (стены, кровля, пол)',
      `Кровля (${cfg.roofType.toLowerCase()}, ${cfg.roofMaterial.toLowerCase()})`,
      `Фасад (${cfg.facade.toLowerCase()})`,
      `Окна (${cfg.windowsCount} шт)`,
      `Входная дверь`,
    ];
    if (cfg.terrace) {
      sectionsList.push(`Терраса ${cfg.terraceType} (${cfg.terraceArea} м²)`);
    }

    // Параметры для PDF
    const floorsMap = { '1': '1 этаж', '1.5': '1.5 этажа (мансарда)', '2': '2 этажа' };
    const pdfData = {
      clientName: cfg.clientName,
      area: cfg.area,
      floors: floorsMap[cfg.floors] || cfg.floors,
      style: cfg.style + (cfg.modulesCount ? ` (${cfg.modulesCount} мод.)` : ''),
      bedrooms: cfg.bedrooms,
      wallInsulation: `${cfg.wallInsulation} мм`,
      roofType: cfg.roofType,
      roofMaterial: cfg.roofMaterial,
      facade: cfg.facade,
      windows: cfg.windows.replace('Окно ПВХ ', ''),
      windowsCount: cfg.windowsCount,
      door: cfg.door,
      terrace: cfg.terrace ? `${cfg.terraceType}, ${cfg.terraceArea} м²` : null,
      sectionsList,
      grandTotal,
      company: companyInfo,
    };

    const pdfPath = await generateEstimatePDF(pdfData);

    // Отправляем PDF
    await ctx.replyWithDocument(
      { source: pdfPath, filename: `Смета_${cfg.clientName.replace(/\s/g, '_')}.pdf` },
      { caption: `✅ Смета для *${cfg.clientName}* готова!\n\n💰 Итого: *${grandTotal.toLocaleString('ru-RU')} ₽*\n📐 Цена за м²: *${Math.round(grandTotal / area).toLocaleString('ru-RU')} ₽/м²*`, parse_mode: 'Markdown' }
    );

    // Удаляем временный файл
    try { require('fs').unlinkSync(pdfPath); } catch(e) {}

    ctx.session.config = null;
    ctx.session.mode = null;
  } catch (err) {
    console.error('Ошибка генерации PDF:', err.message, err.stack);
    return ctx.reply('❌ Ошибка при формировании сметы: ' + err.message);
  }
}

async function handleMessage(ctx) {
  const cfg = ctx.session.config;
  if (!cfg) return;

  // ФИО заказчика
  if (cfg.step === 'client_name') {
    cfg.clientName = ctx.message.text.trim();
    cfg.step = 'area';
    return ctx.reply('📐 Площадь дома (м², от 60 до 280):');
  }

  // Площадь
  if (cfg.step === 'area') {
    const area = parseFloat(ctx.message.text.replace(',', '.'));
    if (isNaN(area) || area < 60 || area > 280) {
      return ctx.reply('❌ Введи площадь от 60 до 280 м²:');
    }
    cfg.area = area;
    cfg.step = 'floors';
    return ctx.reply('🏗 *Этажность:*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('1 этаж', 'cfg_floors_1')],
        [Markup.button.callback('1.5 (мансарда)', 'cfg_floors_1.5')],
        [Markup.button.callback('2 этажа', 'cfg_floors_2')],
      ]),
    });
  }

  // Количество окон
  if (cfg.step === 'windows_count') {
    const count = parseInt(ctx.message.text);
    if (isNaN(count) || count < 1 || count > 30) {
      return ctx.reply('❌ Введи количество от 1 до 30:');
    }
    cfg.windowsCount = count;
    cfg.step = 'door';
    return ctx.reply('🚪 *Входная дверь:*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Металл (эконом)', 'cfg_door_eco')],
        [Markup.button.callback('Металл (стандарт)', 'cfg_door_std')],
        [Markup.button.callback('Металл (премиум)', 'cfg_door_prem')],
        [Markup.button.callback('Пластиковая', 'cfg_door_plastic')],
      ]),
    });
  }

  // Площадь террасы
  if (cfg.step === 'terrace_area') {
    const area = parseFloat(ctx.message.text.replace(',', '.'));
    if (isNaN(area) || area <= 0) {
      return ctx.reply('❌ Введи площадь террасы (число):');
    }
    cfg.terraceArea = area;
    cfg.step = 'confirm';
    return showConfirmation(ctx, cfg);
  }
}

module.exports = { setupConfigModule, handleCallback, handleMessage };
