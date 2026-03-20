const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function generateEstimatePDF(data) {
  const tmpDir = os.tmpdir();
  const pdfPath = path.join(tmpDir, `estimate_${Date.now()}.pdf`);
  const pyScript = path.join(tmpDir, `gen_${Date.now()}.py`);

  const esc = (s) => (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');

  const discount2 = Math.round(data.grandTotal * 0.02);
  const discountExtra = data.extraDiscount > 0 ? Math.round(data.grandTotal * data.extraDiscount / 100) : 0;
  const finalTotal = data.grandTotal - discount2 - discountExtra;
  const priceM2 = data.area ? Math.round(finalTotal / parseFloat(data.area)) : 0;
  const sectionsJson = JSON.stringify(data.sectionsList || []);

  const logoPath = path.resolve(__dirname, '../../assets/logo.jpg');
  const photoPath = path.resolve(__dirname, '../../assets/director.jpg');
  const frontRender = data.renderPaths ? data.renderPaths.frontPath : '';
  const backRender = data.renderPaths ? data.renderPaths.backPath : '';

  const script = `# -*- coding: utf-8 -*-
import json, datetime, os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable, PageBreak
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

fd = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('DejaVu', fd+'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuBold', fd+'DejaVuSans-Bold.ttf'))
# Oblique fallback — используем обычные шрифты
pdfmetrics.registerFont(TTFont('DejaVuOblique', fd+'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuBoldOblique', fd+'DejaVuSans-Bold.ttf'))

G=HexColor('#81C784'); GD=HexColor('#388E3C'); GL=HexColor('#E8F5E9'); GA=HexColor('#A5D6A7')
GR=HexColor('#333333'); TD=HexColor('#2c2c2c'); TL=HexColor('#666666'); BD=HexColor('#C8E6C9'); SB=HexColor('#F1F8E9'); W=HexColor('#ffffff')

ts=ParagraphStyle('T',fontName='DejaVuBold',fontSize=20,textColor=GR,alignment=1,spaceAfter=3*mm)
ss=ParagraphStyle('S',fontName='DejaVu',fontSize=11,textColor=TL,alignment=1,spaceAfter=6*mm)
hs=ParagraphStyle('H',fontName='DejaVuBold',fontSize=12,textColor=GD,spaceBefore=5*mm,spaceAfter=3*mm)
ns=ParagraphStyle('N',fontName='DejaVu',fontSize=9.5,textColor=TD,leading=14)
sms=ParagraphStyle('Sm',fontName='DejaVu',fontSize=8.5,textColor=TL,leading=12)
bs=ParagraphStyle('B',fontName='DejaVuBold',fontSize=9.5,textColor=TD,leading=14)

phone1='${esc((data.company['Телефон']||'').split('  ')[0]||'')}'
phone2='${esc((data.company['Телефон']||'').split('  ')[1]||'')}'
email='${esc(data.company['Email']||'')}'
slogan='${esc(data.company['Слоган']||'')}'
inn='${esc(data.company['ИНН']||'')}'
address='${esc(data.company['Адрес']||'')}'
site='${esc(data.company['Сайт']||'')}'

def hf(c,doc):
    c.saveState(); w,h=A4; half=w/2
    c.setFillColor(W); c.rect(0,h-22*mm,half,22*mm,fill=1,stroke=0)
    c.setFillColor(GA); c.rect(half,h-22*mm,half,22*mm,fill=1,stroke=0)
    c.setStrokeColor(G); c.setLineWidth(1); c.line(0,h-22*mm,w,h-22*mm)
    try: c.drawImage('${esc(logoPath)}',12*mm,h-20.5*mm,width=18*mm,height=18*mm,preserveAspectRatio=True,mask='auto')
    except: pass
    c.setFillColor(GR); c.setFont('DejaVuBold',14); c.drawString(33*mm,h-11*mm,'ЭкоКаркас')
    c.setFont('DejaVu',7); c.setFillColor(TL); c.drawString(33*mm,h-16*mm,slogan)
    c.setFillColor(GR); c.setFont('DejaVuBold',7.5)
    c.drawRightString(w-14*mm,h-8*mm,phone1); c.drawRightString(w-14*mm,h-12.5*mm,phone2)
    c.setFont('DejaVu',7); c.drawRightString(w-14*mm,h-17*mm,email)
    c.setStrokeColor(GA); c.setLineWidth(0.5); c.line(12*mm,14*mm,w-12*mm,14*mm)
    c.setFillColor(TL); c.setFont('DejaVu',6)
    c.drawString(12*mm,9*mm,f'ИНН {inn} | {address} | {site}')
    c.drawRightString(w-12*mm,9*mm,f'стр. {doc.page}')
    c.restoreState()

doc=SimpleDocTemplate('${esc(pdfPath)}',pagesize=A4,topMargin=28*mm,bottomMargin=20*mm,leftMargin=14*mm,rightMargin=14*mm)
st=[]
date_str=datetime.datetime.now().strftime('%d.%m.%Y')
htype='${esc(data.houseType||'Стандарт')}'

st.append(Spacer(1,5*mm))
st.append(Paragraph('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ',ts))
st.append(Paragraph(f'на строительство каркасного дома ({htype})',ss))
st.append(HRFlowable(width='50%',thickness=1.5,color=G,spaceBefore=1*mm,spaceAfter=5*mm,hAlign='CENTER'))

cd=[[Paragraph('<b>Заказчик:</b>',bs),Paragraph('${esc(data.clientName)}',ns)],
    [Paragraph('<b>Дата:</b>',bs),Paragraph(date_str,ns)],
    [Paragraph('<b>Действительно:</b>',bs),Paragraph('14 дней',ns)]]
t=Table(cd,colWidths=[42*mm,135*mm])
t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2),('BACKGROUND',(0,0),(-1,-1),GL),('BOX',(0,0),(-1,-1),0.5,BD),('INNERGRID',(0,0),(-1,-1),0.3,BD),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8)]))
st.append(t)

# Параметры
st.append(Paragraph('Параметры дома',hs))
params=[['Параметр','Значение'],['Тип','${esc(data.houseType||'-')}'],['Площадь','${esc(str(data.area or '-'))} м²'],['Этажность','${esc(data.floors or '-')}'],['Стиль','${esc(data.style or '-')}'],['Спален','${esc(str(data.bedrooms or '-'))}'],['Утепление стен','${esc(data.wallInsulation or '-')}'],['Крыша','${esc((data.roofType or '')+', '+(data.roofMaterial or ''))}'],['Фасад','${esc(data.facade or '-')}'],['Окна','${esc(data.windows or '-')}'],['Входная дверь','${esc(data.door or '-')}']]
${data.terrace ? "params.append(['Терраса','"+esc(data.terrace)+"'])" : ""}
pd=[]
for i,row in enumerate(params):
    if i==0: pd.append([Paragraph(f'<b>{row[0]}</b>',ParagraphStyle('ph',fontName='DejaVuBold',fontSize=9,textColor=GR)),Paragraph(f'<b>{row[1]}</b>',ParagraphStyle('ph2',fontName='DejaVuBold',fontSize=9,textColor=GR))])
    elif row[1] and row[1]!='-' and row[1]!=', ': pd.append([Paragraph(row[0],ns),Paragraph(f'<b>{row[1]}</b>',bs)])
t2=Table(pd,colWidths=[72*mm,105*mm])
s2=[('BACKGROUND',(0,0),(-1,0),GA),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),('LEFTPADDING',(0,0),(-1,-1),8),('BOX',(0,0),(-1,-1),0.5,BD),('INNERGRID',(0,0),(-1,-1),0.3,BD)]
for i in range(1,len(pd)):
    if i%2==0: s2.append(('BACKGROUND',(0,i),(-1,i),SB))
t2.setStyle(TableStyle(s2))
st.append(t2)

# Состав
st.append(Spacer(1,3*mm)); st.append(Paragraph('Состав работ и материалов',hs))
secs=json.loads('${sectionsJson.replace(/'/g,"\\'")}')
sd=[[Paragraph('<b>Включено в стоимость</b>',ParagraphStyle('sh',fontName='DejaVuBold',fontSize=9.5,textColor=GR))]]
for s in secs: sd.append([Paragraph(f'✓  {s}',ns)])
t3=Table(sd,colWidths=[177*mm])
s3=[('BACKGROUND',(0,0),(-1,0),GA),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),('LEFTPADDING',(0,0),(-1,-1),10),('BOX',(0,0),(-1,-1),0.5,BD),('INNERGRID',(0,0),(-1,-1),0.3,BD)]
for i in range(1,len(sd)):
    if i%2==0: s3.append(('BACKGROUND',(0,i),(-1,i),SB))
t3.setStyle(TableStyle(s3))
st.append(t3)

# Итого
grand=${data.grandTotal}; disc2=${discount2}; discE=${discountExtra}; final=${finalTotal}; pm2=${priceM2}
st.append(Spacer(1,5*mm))
tb=Table([[Paragraph('<b>СТОИМОСТЬ:</b>',ParagraphStyle('tl',fontName='DejaVuBold',fontSize=14,textColor=GR)),Paragraph(f'<b>{grand:,} р.</b>'.replace(',',' '),ParagraphStyle('tv',fontName='DejaVuBold',fontSize=16,textColor=GR,alignment=2))]],colWidths=[105*mm,72*mm])
tb.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),GA),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('BOX',(0,0),(-1,-1),1,G)]))
st.append(tb)

# Скидка 2%
st.append(Spacer(1,3*mm))
dt=Table([[Paragraph('<b>Скидка от директора 2%:</b>',ParagraphStyle('dl',fontName='DejaVuBold',fontSize=12,textColor=GD)),Paragraph(f'<b>- {disc2:,} р.</b>'.replace(',',' '),ParagraphStyle('dv',fontName='DejaVuBold',fontSize=12,textColor=GD,alignment=2))]],colWidths=[105*mm,72*mm])
dt.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),GL),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('BOX',(0,0),(-1,-1),1,GA)]))
st.append(dt)

# Доп скидка
${discountExtra > 0 ? `
st.append(Spacer(1,2*mm))
de=Table([[Paragraph('<b>Доп. скидка ${data.extraDiscount}%:</b>',ParagraphStyle('el',fontName='DejaVuBold',fontSize=12,textColor=GD)),Paragraph(f'<b>- {discE:,} р.</b>'.replace(',',' '),ParagraphStyle('ev',fontName='DejaVuBold',fontSize=12,textColor=GD,alignment=2))]],colWidths=[105*mm,72*mm])
de.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),GL),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('BOX',(0,0),(-1,-1),1,GA)]))
st.append(de)
` : ''}

# Итого со скидкой
st.append(Spacer(1,3*mm))
fb=Table([[Paragraph('<b>ИТОГО СО СКИДКОЙ:</b>',ParagraphStyle('fl',fontName='DejaVuBold',fontSize=14,textColor=HexColor('#ffffff'))),Paragraph(f'<b>{final:,} р.</b>'.replace(',',' '),ParagraphStyle('fv',fontName='DejaVuBold',fontSize=16,textColor=HexColor('#ffffff'),alignment=2))]],colWidths=[105*mm,72*mm])
fb.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),GD),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12)]))
st.append(fb)

if pm2>0:
    st.append(Spacer(1,2*mm))
    st.append(Paragraph(f'Цена за м²: <b>{pm2:,} р./м²</b>'.replace(',',' '),ParagraphStyle('pm',fontName='DejaVu',fontSize=10,textColor=TL,alignment=1)))

# Подарок
st.append(Spacer(1,5*mm)); st.append(Paragraph('Подарок от компании',hs))
gd=[[Paragraph('<b>Подарок</b>',ParagraphStyle('gh',fontName='DejaVuBold',fontSize=9.5,textColor=GD)),Paragraph('<b>Стоимость</b>',ParagraphStyle('gv',fontName='DejaVuBold',fontSize=9.5,textColor=GD,alignment=2))],
    [Paragraph('<b>Аренда бытовки</b>',ParagraphStyle('g1',fontName='DejaVuBold',fontSize=10,textColor=GD)),Paragraph('<b>56 000 р.</b>',ParagraphStyle('g1v',fontName='DejaVuBold',fontSize=10,textColor=GD,alignment=2))],
    [Paragraph('<b>Аренда туалета</b>',ParagraphStyle('g2',fontName='DejaVuBold',fontSize=10,textColor=GD)),Paragraph('<b>28 000 р.</b>',ParagraphStyle('g2v',fontName='DejaVuBold',fontSize=10,textColor=GD,alignment=2))],
    [Paragraph('<b>ИТОГО ПОДАРОК:</b>',ParagraphStyle('gt',fontName='DejaVuBold',fontSize=11,textColor=W)),Paragraph('<b>84 000 р.</b>',ParagraphStyle('gtv',fontName='DejaVuBold',fontSize=12,textColor=W,alignment=2))]]
gt=Table(gd,colWidths=[125*mm,52*mm])
gt.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),GL),('BACKGROUND',(0,1),(-1,2),GL),('BACKGROUND',(0,3),(-1,3),G),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('BOX',(0,0),(-1,-1),1,GA),('LINEBELOW',(0,0),(-1,0),0.5,GA),('LINEBELOW',(0,1),(-1,1),0.3,GA),('LINEBELOW',(0,2),(-1,2),0.5,GA)]))
st.append(gt)

# Условия
st.append(Spacer(1,6*mm)); st.append(Paragraph('Условия',hs))
for n in ['Предложение действительно 14 дней','Гарантия: 3 года','Цены с учётом материалов и работ','Срок: 45-60 рабочих дней','Корректировка по результатам выезда']:
    st.append(Paragraph(f'• {n}',sms)); st.append(Spacer(1,1*mm))

# Фото + цитата
st.append(Spacer(1,8*mm))
st.append(HRFlowable(width='80%',thickness=0.5,color=GA,spaceBefore=2*mm,spaceAfter=6*mm,hAlign='CENTER'))
qs=ParagraphStyle('Q',fontName='DejaVuBoldOblique',fontSize=12,textColor=GR,leading=18,alignment=1,spaceAfter=3*mm)
nms=ParagraphStyle('Nm',fontName='DejaVuBold',fontSize=10,textColor=GD,alignment=1,spaceBefore=4*mm)
ps=ParagraphStyle('Ps',fontName='DejaVu',fontSize=9,textColor=TL,alignment=1)
try: photo=Image('${esc(photoPath)}',width=50*mm,height=50*mm); photo.hAlign='CENTER'
except: photo=Paragraph('',ns)
rc=Table([[Paragraph('<b>«Надёжность — это не слова.<br/>Это чувство, что всё<br/>сделано правильно.»</b>',qs)],[Paragraph('<b>Сегал Денис Игоревич</b>',nms)],[Paragraph('Руководитель компании «ЭкоКаркас»',ps)]],colWidths=[110*mm])
rc.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
ft=Table([[photo,rc]],colWidths=[55*mm,115*mm])
ft.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5)]))
st.append(ft)

# Рендеры
front_path='${esc(frontRender)}'
back_path='${esc(backRender)}'
if front_path and os.path.exists(front_path):
    st.append(PageBreak())
    st.append(Spacer(1,5*mm))
    st.append(Paragraph('Визуализация дома',hs))
    st.append(Spacer(1,3*mm))
    try:
        st.append(Paragraph('<b>Вид спереди</b>',ParagraphStyle('rf',fontName='DejaVuBold',fontSize=10,textColor=GD,alignment=1)))
        st.append(Spacer(1,2*mm))
        st.append(Image(front_path,width=170*mm,height=95*mm))
        st.append(Spacer(1,5*mm))
    except: pass
    if back_path and os.path.exists(back_path):
        try:
            st.append(Paragraph('<b>Вид сзади</b>',ParagraphStyle('rb',fontName='DejaVuBold',fontSize=10,textColor=GD,alignment=1)))
            st.append(Spacer(1,2*mm))
            st.append(Image(back_path,width=170*mm,height=95*mm))
        except: pass

doc.build(st,onFirstPage=hf,onLaterPages=hf)
`;

  fs.writeFileSync(pyScript, script, 'utf8');
  try {
    execSync(`python3 "${pyScript}"`, { timeout: 60000 });
    return pdfPath;
  } finally {
    try { fs.unlinkSync(pyScript); } catch(e) {}
  }
}

module.exports = { generateEstimatePDF };
