const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function generateEstimatePDF(data) {
  const tmpDir = os.tmpdir();
  const pdfPath = path.join(tmpDir, `estimate_${Date.now()}.pdf`);
  const pyScript = path.join(tmpDir, `gen_${Date.now()}.py`);

  // Escape strings for Python
  const esc = (s) => (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');

  const discount = Math.round(data.grandTotal * 0.02);
  const finalTotal = data.grandTotal - discount;
  const priceM2 = Math.round(finalTotal / data.area);

  const sectionsJson = JSON.stringify(data.sectionsList);

  const script = `
# -*- coding: utf-8 -*-
import json
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os, datetime

fd = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('DejaVu', fd+'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuBold', fd+'DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuOblique', fd+'DejaVuSans-Oblique.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuBoldOblique', fd+'DejaVuSans-BoldOblique.ttf'))

GREEN = HexColor('#81C784')
GREEN_DARK = HexColor('#388E3C')
GREEN_LIGHT = HexColor('#E8F5E9')
GREEN_ACCENT = HexColor('#A5D6A7')
GRAPHITE = HexColor('#333333')
TEXT_DARK = HexColor('#2c2c2c')
TEXT_LIGHT = HexColor('#666666')
BORDER = HexColor('#C8E6C9')
SECTION_BG = HexColor('#F1F8E9')
WHITE = HexColor('#ffffff')

title_s = ParagraphStyle('T', fontName='DejaVuBold', fontSize=20, textColor=GRAPHITE, alignment=1, spaceAfter=3*mm)
sub_s = ParagraphStyle('Sub', fontName='DejaVu', fontSize=11, textColor=TEXT_LIGHT, alignment=1, spaceAfter=6*mm)
head_s = ParagraphStyle('H', fontName='DejaVuBold', fontSize=12, textColor=GREEN_DARK, spaceBefore=5*mm, spaceAfter=3*mm)
norm_s = ParagraphStyle('N', fontName='DejaVu', fontSize=9.5, textColor=TEXT_DARK, leading=14)
small_s = ParagraphStyle('S', fontName='DejaVu', fontSize=8.5, textColor=TEXT_LIGHT, leading=12)
bold_s = ParagraphStyle('B', fontName='DejaVuBold', fontSize=9.5, textColor=TEXT_DARK, leading=14)

logo_path = '${esc(path.resolve(__dirname, '../../assets/logo.jpg'))}'
photo_path = '${esc(path.resolve(__dirname, '../../assets/director.jpg'))}'

phone1 = '${esc(data.company['Телефон'] || '').split('  ')[0] || ''}'
phone2 = '${esc(data.company['Телефон'] || '').split('  ')[1] || ''}'
email = '${esc(data.company['Email'] || '')}'
slogan = '${esc(data.company['Слоган'] || '')}'
inn = '${esc(data.company['ИНН'] || '')}'
address = '${esc(data.company['Адрес'] || '')}'
site = '${esc(data.company['Сайт'] || '')}'
director = '${esc(data.company['Подпись (ФИО директора)'] || 'Сегал Ю.В')}'

def hf(c, doc):
    c.saveState()
    w, h = A4
    half = w/2
    c.setFillColor(WHITE)
    c.rect(0, h-22*mm, half, 22*mm, fill=1, stroke=0)
    c.setFillColor(GREEN_ACCENT)
    c.rect(half, h-22*mm, half, 22*mm, fill=1, stroke=0)
    c.setStrokeColor(GREEN)
    c.setLineWidth(1)
    c.line(0, h-22*mm, w, h-22*mm)
    try: c.drawImage(logo_path, 12*mm, h-20.5*mm, width=18*mm, height=18*mm, preserveAspectRatio=True, mask='auto')
    except: pass
    c.setFillColor(GRAPHITE)
    c.setFont('DejaVuBold', 14)
    c.drawString(33*mm, h-11*mm, 'ЭкоКаркас')
    c.setFont('DejaVu', 7)
    c.setFillColor(TEXT_LIGHT)
    c.drawString(33*mm, h-16*mm, slogan)
    c.setFillColor(GRAPHITE)
    c.setFont('DejaVuBold', 7.5)
    c.drawRightString(w-14*mm, h-8*mm, phone1)
    c.drawRightString(w-14*mm, h-12.5*mm, phone2)
    c.setFont('DejaVu', 7)
    c.drawRightString(w-14*mm, h-17*mm, email)
    c.setStrokeColor(GREEN_ACCENT)
    c.setLineWidth(0.5)
    c.line(12*mm, 14*mm, w-12*mm, 14*mm)
    c.setFillColor(TEXT_LIGHT)
    c.setFont('DejaVu', 6)
    c.drawString(12*mm, 9*mm, f'ИНН {inn} | {address} | {site}')
    c.drawRightString(w-12*mm, 9*mm, f'стр. {doc.page}')
    c.restoreState()

doc = SimpleDocTemplate('${esc(pdfPath)}', pagesize=A4, topMargin=28*mm, bottomMargin=20*mm, leftMargin=14*mm, rightMargin=14*mm)
st = []

now = datetime.datetime.now()
date_str = now.strftime('%d.%m.%Y')

st.append(Spacer(1, 5*mm))
st.append(Paragraph('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', title_s))
st.append(Paragraph('на строительство каркасного дома', sub_s))
st.append(HRFlowable(width='50%', thickness=1.5, color=GREEN, spaceBefore=1*mm, spaceAfter=5*mm, hAlign='CENTER'))

cd = [
    [Paragraph('<b>Заказчик:</b>', bold_s), Paragraph('${esc(data.clientName)}', norm_s)],
    [Paragraph('<b>Дата:</b>', bold_s), Paragraph(date_str, norm_s)],
    [Paragraph('<b>Действительно:</b>', bold_s), Paragraph('14 дней с даты составления', norm_s)],
]
t = Table(cd, colWidths=[42*mm, 135*mm])
t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2),('BACKGROUND',(0,0),(-1,-1),GREEN_LIGHT),('BOX',(0,0),(-1,-1),0.5,BORDER),('INNERGRID',(0,0),(-1,-1),0.3,BORDER),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8)]))
st.append(t)

st.append(Paragraph('Параметры дома', head_s))
params = [
    ['Параметр', 'Значение'],
    ['Общая площадь', '${esc(String(data.area))} м²'],
    ['Этажность', '${esc(data.floors)}'],
    ['Стиль', '${esc(data.style)}'],
    ['Количество спален', '${esc(String(data.bedrooms))}'],
    ['Утепление стен', '${esc(data.wallInsulation)}'],
    ['Утепление кровли / пол', '200 мм'],
    ['Крыша', '${esc(data.roofType)}, ${esc(data.roofMaterial)}'],
    ['Фасад', '${esc(data.facade)}'],
    ['Окна', '${esc(data.windows)}, ${esc(String(data.windowsCount))} шт'],
    ['Входная дверь', '${esc(data.door)}'],
]
${data.terrace ? `params.append(['Терраса', '${esc(data.terrace)}'])` : ''}

pd = []
for i, row in enumerate(params):
    if i == 0:
        pd.append([Paragraph(f'<b>{row[0]}</b>', ParagraphStyle('ph',fontName='DejaVuBold',fontSize=9,textColor=GRAPHITE)), Paragraph(f'<b>{row[1]}</b>', ParagraphStyle('ph2',fontName='DejaVuBold',fontSize=9,textColor=GRAPHITE))])
    else:
        pd.append([Paragraph(row[0], norm_s), Paragraph(f'<b>{row[1]}</b>', bold_s)])
t2 = Table(pd, colWidths=[72*mm, 105*mm])
s2 = [('BACKGROUND',(0,0),(-1,0),GREEN_ACCENT),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),('LEFTPADDING',(0,0),(-1,-1),8),('BOX',(0,0),(-1,-1),0.5,BORDER),('INNERGRID',(0,0),(-1,-1),0.3,BORDER)]
for i in range(1, len(params)):
    if i%2==0: s2.append(('BACKGROUND',(0,i),(-1,i),SECTION_BG))
t2.setStyle(TableStyle(s2))
st.append(t2)

st.append(Spacer(1, 3*mm))
st.append(Paragraph('Состав работ и материалов', head_s))
sections = json.loads('${sectionsJson.replace(/'/g, "\\'")}')
sd = [[Paragraph('<b>Включено в стоимость</b>', ParagraphStyle('sh',fontName='DejaVuBold',fontSize=9.5,textColor=GRAPHITE))]]
for name in sections:
    sd.append([Paragraph(f'✓  {name}', norm_s)])
t3 = Table(sd, colWidths=[177*mm])
s3 = [('BACKGROUND',(0,0),(-1,0),GREEN_ACCENT),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),('LEFTPADDING',(0,0),(-1,-1),10),('BOX',(0,0),(-1,-1),0.5,BORDER),('INNERGRID',(0,0),(-1,-1),0.3,BORDER)]
for i in range(1, len(sd)):
    if i%2==0: s3.append(('BACKGROUND',(0,i),(-1,i),SECTION_BG))
t3.setStyle(TableStyle(s3))
st.append(t3)

grand = ${data.grandTotal}
disc = ${discount}
final = ${finalTotal}
pm2 = ${priceM2}

st.append(Spacer(1, 5*mm))
tb = Table([[Paragraph('<b>СТОИМОСТЬ ДОМА:</b>', ParagraphStyle('tl',fontName='DejaVuBold',fontSize=14,textColor=GRAPHITE)), Paragraph(f'<b>{grand:,} ₽</b>'.replace(',', ' '), ParagraphStyle('tv',fontName='DejaVuBold',fontSize=16,textColor=GRAPHITE,alignment=2))]], colWidths=[105*mm, 72*mm])
tb.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),GREEN_ACCENT),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('BOX',(0,0),(-1,-1),1,GREEN)]))
st.append(tb)

st.append(Spacer(1, 3*mm))
dt = Table([[Paragraph('<b>Скидка от директора 2%:</b>', ParagraphStyle('dl',fontName='DejaVuBold',fontSize=12,textColor=GREEN_DARK)), Paragraph(f'<b>- {disc:,} ₽</b>'.replace(',', ' '), ParagraphStyle('dv',fontName='DejaVuBold',fontSize=12,textColor=GREEN_DARK,alignment=2))]], colWidths=[105*mm, 72*mm])
dt.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),GREEN_LIGHT),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('BOX',(0,0),(-1,-1),1,GREEN_ACCENT)]))
st.append(dt)

st.append(Spacer(1, 3*mm))
fb = Table([[Paragraph('<b>ИТОГО СО СКИДКОЙ:</b>', ParagraphStyle('fl',fontName='DejaVuBold',fontSize=14,textColor=WHITE)), Paragraph(f'<b>{final:,} ₽</b>'.replace(',', ' '), ParagraphStyle('fv',fontName='DejaVuBold',fontSize=16,textColor=WHITE,alignment=2))]], colWidths=[105*mm, 72*mm])
fb.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),GREEN_DARK),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12)]))
st.append(fb)

st.append(Spacer(1, 2*mm))
st.append(Paragraph(f'Цена за м²: <b>{pm2:,} ₽/м²</b>'.replace(',', ' '), ParagraphStyle('pm',fontName='DejaVu',fontSize=10,textColor=TEXT_LIGHT,alignment=1)))

st.append(Spacer(1, 5*mm))
st.append(Paragraph('Подарок от компании', head_s))
gd = [
    [Paragraph('<b>Подарок</b>', ParagraphStyle('gh',fontName='DejaVuBold',fontSize=9.5,textColor=GREEN_DARK)), Paragraph('<b>Стоимость</b>', ParagraphStyle('gv',fontName='DejaVuBold',fontSize=9.5,textColor=GREEN_DARK,alignment=2))],
    [Paragraph('<b>Аренда бытовки на время строительства</b>', ParagraphStyle('g1',fontName='DejaVuBold',fontSize=10,textColor=GREEN_DARK)), Paragraph('<b>56 000 ₽</b>', ParagraphStyle('g1v',fontName='DejaVuBold',fontSize=10,textColor=GREEN_DARK,alignment=2))],
    [Paragraph('<b>Аренда туалета на время строительства</b>', ParagraphStyle('g2',fontName='DejaVuBold',fontSize=10,textColor=GREEN_DARK)), Paragraph('<b>28 000 ₽</b>', ParagraphStyle('g2v',fontName='DejaVuBold',fontSize=10,textColor=GREEN_DARK,alignment=2))],
    [Paragraph('<b>ИТОГО ПОДАРОК:</b>', ParagraphStyle('gt',fontName='DejaVuBold',fontSize=11,textColor=WHITE)), Paragraph('<b>84 000 ₽</b>', ParagraphStyle('gtv',fontName='DejaVuBold',fontSize=12,textColor=WHITE,alignment=2))],
]
gt = Table(gd, colWidths=[125*mm, 52*mm])
gt.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),GREEN_LIGHT),('BACKGROUND',(0,1),(-1,2),GREEN_LIGHT),('BACKGROUND',(0,3),(-1,3),GREEN),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('BOX',(0,0),(-1,-1),1,GREEN_ACCENT),('LINEBELOW',(0,0),(-1,0),0.5,GREEN_ACCENT),('LINEBELOW',(0,1),(-1,1),0.3,GREEN_ACCENT),('LINEBELOW',(0,2),(-1,2),0.5,GREEN_ACCENT)]))
st.append(gt)

st.append(Spacer(1, 6*mm))
st.append(Paragraph('Условия', head_s))
for n in ['Предложение действительно 14 дней с даты составления', 'Гарантия: 3 года', 'Цены указаны с учётом материалов и работ', 'Срок строительства: 45–60 рабочих дней', 'Возможна корректировка по результатам выезда на участок']:
    st.append(Paragraph(f'• {n}', small_s))
    st.append(Spacer(1, 1*mm))

st.append(Spacer(1, 8*mm))
st.append(HRFlowable(width='80%', thickness=0.5, color=GREEN_ACCENT, spaceBefore=2*mm, spaceAfter=6*mm, hAlign='CENTER'))

quote_s = ParagraphStyle('Q', fontName='DejaVuBoldOblique', fontSize=12, textColor=GRAPHITE, leading=18, alignment=1, spaceAfter=3*mm)
name_s = ParagraphStyle('Nm', fontName='DejaVuBold', fontSize=10, textColor=GREEN_DARK, alignment=1, spaceBefore=4*mm)
pos_s = ParagraphStyle('Ps', fontName='DejaVu', fontSize=9, textColor=TEXT_LIGHT, alignment=1)

try:
    photo = Image(photo_path, width=50*mm, height=50*mm)
    photo.hAlign = 'CENTER'
except:
    photo = Paragraph('', norm_s)

qt = Paragraph('<i>«Надёжность — это не слова.<br/>Это чувство, что всё<br/>сделано правильно.»</i>', quote_s)
nt = Paragraph('<b>Сегал Денис Игоревич</b>', name_s)
pt = Paragraph('Руководитель компании «ЭкоКаркас»', pos_s)

rc = Table([[qt],[nt],[pt]], colWidths=[110*mm])
rc.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
ft = Table([[photo, rc]], colWidths=[55*mm, 115*mm])
ft.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5)]))
st.append(ft)

doc.build(st, onFirstPage=hf, onLaterPages=hf)
`;

  fs.writeFileSync(pyScript, script, 'utf8');

  try {
    execSync(`python3 "${pyScript}"`, { timeout: 30000 });
    return pdfPath;
  } finally {
    try { fs.unlinkSync(pyScript); } catch(e) {}
  }
}

module.exports = { generateEstimatePDF };
