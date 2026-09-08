const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function createWindow(){
  const win=new BrowserWindow({width:1480,height:940,minWidth:1100,minHeight:720,backgroundColor:'#f5f6f8',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname,'renderer','index.html'));
}
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
ipcMain.handle('app-version',()=>app.getVersion());

function safeName(s){return String(s||'Rechnung').replace(/[<>:"/\\|?*\x00-\x1F]/g,'-')}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function money(n){return Number(n||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'})}
function deDate(v){return v?new Date(v+'T12:00:00').toLocaleDateString('de-DE'):''}

async function createInvoicePdf(d){
  // PDF/A-3B Basis-PDF. Die E-Rechnungs-/XML-Logik bleibt unverändert.
  const windir=process.env.WINDIR||'C:\\Windows';
  const fontDir=path.join(windir,'Fonts');
  const candidates=[
    [path.join(fontDir,'arial.ttf'),path.join(fontDir,'arialbd.ttf')],
    [path.join(fontDir,'segoeui.ttf'),path.join(fontDir,'segoeuib.ttf')]
  ];
  const pair=candidates.find(([regular,bold])=>fsSync.existsSync(regular)&&fsSync.existsSync(bold));
  if(!pair) throw new Error('Für den PDF/A-Export wurde keine geeignete Windows-Schrift (Arial/Segoe UI) gefunden.');
  const [regularFont,boldFont]=pair;

  return await new Promise((resolve,reject)=>{
    const chunks=[];
    const doc=new PDFDocument({
      size:'A4',margins:{top:51,bottom:57,left:51,right:51},autoFirstPage:true,
      pdfVersion:'1.7',subset:'PDF/A-3b',bufferPages:true,
      info:{Title:`Rechnung ${d.invoice.number}`,Author:d.seller.name,Creator:'InvoiceAssist'}
    });
    doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
    doc.registerFont('IA-Regular',regularFont);doc.registerFont('IA-Bold',boldFont);

    const W=doc.page.width,H=doc.page.height,L=51,R=W-51,contentW=R-L;
    const dark='#151922',muted='#5f6672',light='#d9dde3',lighter='#e8eaee';
    const text=v=>String(v??'');
    const setRegular=(size=9,color=dark)=>doc.font('IA-Regular').fontSize(size).fillColor(color);
    const setBold=(size=9,color=dark)=>doc.font('IA-Bold').fontSize(size).fillColor(color);
    const rightText=(value,x,y,w,size=9,bold=false,color=dark)=>{(bold?setBold:setRegular)(size,color);doc.text(text(value),x,y,{width:w,align:'right',lineBreak:false});};
    const leftText=(value,x,y,w,size=9,bold=false,color=dark)=>{(bold?setBold:setRegular)(size,color);doc.text(text(value),x,y,{width:w});};

    const logoPath=path.join(__dirname,'assets','Schnabel-Logo-Schwarz.png');
    const footerY=708;
    const firstPageContentBottom=640; // Platz für Hinweis + feste Fußzeile auf Seite 1 reservieren
    const otherPageContentBottom=760;

    function drawOfficeFooter(){
      doc.moveTo(L,footerY-12).lineTo(R,footerY-12).lineWidth(0.45).strokeColor(light).stroke();
      const gap=18,colW=(contentW-gap*2)/3,c1=L,c2=L+colW+gap,c3=L+(colW+gap)*2;
      const footerColor='#777b82',footerSize=5.9,lineH=9.4;
      const f=(value,x,yy,w=colW)=>{setRegular(footerSize,footerColor);doc.text(text(value),x,yy,{width:w,lineBreak:false});};
      let fy=footerY;
      f('dahler straße 15',c1,fy);fy+=lineH;
      f('58809 neuenrade',c1,fy);fy+=lineH;
      f('fon 02392 96387-0',c1,fy);fy+=lineH;
      f('fax 02392 64686',c1,fy);fy+=lineH*1.7;
      f('info@schnabel-architekten.de',c1,fy);fy+=lineH;
      f('www.schnabel-architekten.de',c1,fy);
      fy=footerY;
      f('tom schnabel',c2,fy);fy+=lineH;f('dipl.-ing. architekt',c2,fy);fy+=lineH;
      f('staatlich anerkannter sachverständiger',c2,fy);fy+=lineH;f('für schall- und wärmeschutz',c2,fy);fy+=lineH*1.7;
      f('frank schnabel',c2,fy);fy+=lineH;f('dr.-ing. beratender ingenieur',c2,fy);fy+=lineH;f('statik und tragwerksplanung',c2,fy);
      fy=footerY;
      f('Schnabel Architekt und Beratender Ingenieur',c3,fy);fy+=lineH;f('PartG mbB',c3,fy);fy+=lineH;
      f('Amtsgericht Essen: PR 4177',c3,fy);fy+=lineH;f('St.Nr. 302/5743/1079',c3,fy);fy+=lineH*1.7;
      f('Vereinigte Sparkasse im Märkischen Kreis',c3,fy);fy+=lineH;f('IBAN DE19 4585 1020 0093 0123 00',c3,fy);fy+=lineH;f('BIC WELADED1PLB',c3,fy);
    }

    function drawFirstPageHeader(){
      let y=51;
      leftText(d.seller.name,L,y,250,11,true);y+=30;
      leftText(d.seller.street,L,y,250,8,false,muted);y+=12;
      leftText(`${d.seller.zip} ${d.seller.city}`.trim(),L,y,250,8,false,muted);y+=12;
      if(d.seller.email){leftText(d.seller.email,L,y,250,8,false,muted);y+=12;}
      if(d.seller.phone){leftText(d.seller.phone,L,y,250,8,false,muted);y+=12;}
      if(fsSync.existsSync(logoPath))doc.image(logoPath,R-168,40,{fit:[168,88],align:'right',valign:'top'});
      y=190;leftText(d.buyer.name,L,y,300,9,true);y+=15;leftText(d.buyer.street,L,y,300,9);y+=14;leftText(`${d.buyer.zip} ${d.buyer.city}`.trim(),L,y,300,9);
      const titleY=305;leftText(d.invoice.type||'Rechnung',L,titleY,250,23,true);if(d.invoice.project)leftText(d.invoice.project,L,titleY+34,260,10,false,'#6b7280');
      const metaX=R-205;let my=titleY+2;
      leftText(`Rechnungsnr.: ${d.invoice.number}`,metaX,my,205,8.5,true);my+=15;
      leftText(`Datum: ${deDate(d.invoice.issueDate)}`,metaX,my,205,8.5);my+=15;
      leftText(`Fällig: ${deDate(d.invoice.dueDate)}`,metaX,my,205,8.5);my+=15;
      if(d.invoice.deliveryDate){leftText(`Leistungsdatum: ${deDate(d.invoice.deliveryDate)}`,metaX,my,205,8.5);my+=15;}
      else if(d.invoice.periodStart&&d.invoice.periodEnd){leftText(`Leistungszeitraum: ${deDate(d.invoice.periodStart)} – ${deDate(d.invoice.periodEnd)}`,metaX,my,205,8.2);my+=15;}
      if(d.invoice.buyerReference){leftText(`Käuferreferenz: ${d.invoice.buyerReference}`,metaX,my,205,8,false,'#555555');my+=14;}
      drawOfficeFooter();
      return 395;
    }

    function drawContinuationHeader(pageNo){
      setBold(12,dark);doc.text(`Rechnung ${d.invoice.number} – Fortsetzung`,L,48,{width:contentW-70});
      setRegular(7.5,muted);doc.text(`${d.buyer.name}${d.invoice.project?' · '+d.invoice.project:''}`,L,66,{width:contentW-70});
      rightText(`Seite ${pageNo}`,R-60,50,60,8,false,muted);
      doc.moveTo(L,84).lineTo(R,84).lineWidth(0.6).strokeColor(light).stroke();
      return 102;
    }

    // Breitere Zahlen-Spalten: Überschriften und Beträge bleiben sauber in einer Zeile.
    const cols=[L,L+245,L+292,L+344,L+420,R];
    function drawTableHeader(y){
      const heads=['BESCHREIBUNG','MENGE','EINHEIT','EINZELPREIS','GESAMT'];
      setBold(6.9,'#6b7280');
      doc.text(heads[0],cols[0]+3,y,{width:cols[1]-cols[0]-6,lineBreak:false});
      doc.text(heads[1],cols[1],y,{width:cols[2]-cols[1]-4,align:'right',lineBreak:false});
      doc.text(heads[2],cols[2]+4,y,{width:cols[3]-cols[2]-8,lineBreak:false});
      doc.text(heads[3],cols[3],y,{width:cols[4]-cols[3]-4,align:'right',lineBreak:false});
      doc.text(heads[4],cols[4],y,{width:cols[5]-cols[4]-4,align:'right',lineBreak:false});
      doc.moveTo(L,y+14).lineTo(R,y+14).lineWidth(0.6).strokeColor(light).stroke();
      return y+25;
    }

    let pageNo=1;
    let y=drawFirstPageHeader();
    if(d.invoice.introText){
      const introH=doc.heightOfString(text(d.invoice.introText),{width:contentW});
      leftText(d.invoice.introText,L,y,contentW,8.8,false,muted);y+=introH+18;
    }
    y=drawTableHeader(y);

    for(const item of d.items){
      const desc=text(item.description);
      setRegular(9,dark);
      const rowH=Math.max(31,doc.heightOfString(desc,{width:cols[1]-cols[0]-10})+12);
      const bottom=pageNo===1?firstPageContentBottom:otherPageContentBottom;
      if(y+rowH>bottom){
        doc.addPage();pageNo+=1;y=drawContinuationHeader(pageNo);y=drawTableHeader(y);
      }
      leftText(desc,cols[0]+4,y,cols[1]-cols[0]-10,9);
      rightText(Number(item.quantity).toLocaleString('de-DE'),cols[1],y,cols[2]-cols[1]-5,9);
      leftText(item.unit||'',cols[2]+4,y,cols[3]-cols[2]-8,9);
      rightText(money(item.unitPrice),cols[3],y,cols[4]-cols[3]-5,8.7);
      rightText(money(item.lineTotal),cols[4],y,cols[5]-cols[4]-4,8.7,true);
      doc.moveTo(L,y+rowH-4).lineTo(R,y+rowH-4).lineWidth(0.45).strokeColor(lighter).stroke();
      y+=rowH;
    }

    // Summenblock wird nie über einen Seitenumbruch auseinandergerissen.
    const prepaidRows=Array.isArray(d.invoice.prepaidInvoices)?d.invoice.prepaidInvoices:[];
    const totalNeeded=92+(Number(d.invoice.prepaid||0)>0?(34+Math.max(1,prepaidRows.length)*14):0);
    const bottom=pageNo===1?firstPageContentBottom:otherPageContentBottom;
    if(y+20+totalNeeded>bottom){doc.addPage();pageNo+=1;y=drawContinuationHeader(pageNo)+12;}
    y+=18;
    const sumX=R-250,labelW=128,amountW=122;
    leftText('Netto',sumX,y,labelW,9.5);rightText(money(d.invoice.net),sumX+labelW,y,amountW,9.5,true);y+=20;
    leftText('USt. 19 %',sumX,y,labelW,9.5);rightText(money(d.invoice.tax),sumX+labelW,y,amountW,9.5,true);y+=20;
    leftText('Brutto',sumX,y,labelW,9.5);rightText(money(d.invoice.gross),sumX+labelW,y,amountW,9.5,true);y+=23;
    if(Number(d.invoice.prepaid||0)>0){
      setBold(8.2,muted);doc.text('Bereits gezahlte Abschläge',sumX,y,{width:250});y+=15;
      for(const r of prepaidRows){leftText(`${r.number}${r.date?' · '+deDate(r.date):''}`,sumX,y,labelW+20,7.4,false,muted);rightText('− '+money(r.amount),sumX+labelW,y,amountW,7.8,false,muted);y+=14;}
      if(!prepaidRows.length){leftText('Bereits gezahlt',sumX,y,labelW,8,false,muted);rightText('− '+money(d.invoice.prepaid),sumX+labelW,y,amountW,8,false,muted);y+=14;}
      doc.moveTo(sumX,y+2).lineTo(R,y+2).lineWidth(0.7).strokeColor(dark).stroke();y+=10;
      leftText('Noch zu zahlen',sumX,y,labelW,11.5,true);rightText(money(d.invoice.due),sumX+labelW,y,amountW,11.5,true);y+=30;
    }else{
      doc.moveTo(sumX,y-6).lineTo(R,y-6).lineWidth(0.7).strokeColor(dark).stroke();
      leftText('Gesamtbetrag',sumX,y,labelW,11.5,true);rightText(money(d.invoice.gross),sumX+labelW,y,amountW,11.5,true);y+=30;
    }

    const noteText=d.invoice.notes||'Vielen Dank für Ihren Auftrag. Bitte überweisen Sie den Rechnungsbetrag innerhalb des angegebenen Zahlungsziels.';
    setRegular(8.1,muted);const noteH=doc.heightOfString(noteText,{width:contentW});
    const noteBottom=pageNo===1?firstPageContentBottom:otherPageContentBottom;
    if(y+20+noteH>noteBottom){doc.addPage();pageNo+=1;y=drawContinuationHeader(pageNo)+18;}
    leftText(noteText,L,y+18,contentW,8.1,false,muted);

    // Seitenzahlen auf Folgeseiten; die Kanzlei-Fußzeile bleibt ausschließlich auf Seite 1.
    const range=doc.bufferedPageRange();
    for(let i=1;i<range.count;i++){
      doc.switchToPage(range.start+i);
      rightText(`Seite ${i+1} von ${range.count}`,R-90,H-38,90,7,false,muted);
    }
    doc.switchToPage(range.start+range.count-1);
    doc.end();
  });
}
function toStructuredInput(p,fx){
  const{DocumentTypeCode,UnitCode,VatCategoryCode}=fx;
  const taxRegistrations=[];
  if(p.seller.vatId) taxRegistrations.push({id:p.seller.vatId,schemeId:'VA'});
  else if(p.seller.taxNumber) taxRegistrations.push({id:p.seller.taxNumber,schemeId:'FC'});
  const buyerTax=[]; if(p.buyer.vatId) buyerTax.push({id:p.buyer.vatId,schemeId:'VA'});
  const unit=u=>/std|hour|h\b/i.test(u||'')?UnitCode.HOUR:UnitCode.UNIT;
  const input={
    document:{id:p.invoice.number,issueDate:p.invoice.issueDate,dueDate:p.invoice.dueDate,typeCode:DocumentTypeCode.COMMERCIAL_INVOICE,businessProcessId:'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0',buyerReference:p.invoice.buyerReference||undefined,notes:p.invoice.notes?[{content:p.invoice.notes}]:undefined},
    seller:{name:p.seller.name,address:{line1:p.seller.street,city:p.seller.city,postalCode:p.seller.zip,country:'DE'},taxRegistrations,contact:{name:p.seller.contactName||p.seller.name,phone:p.seller.phone||undefined,email:p.seller.email||undefined},electronicAddress:p.seller.email?{value:p.seller.email,schemeID:'EM'}:undefined},
    buyer:{name:p.buyer.name,address:{line1:p.buyer.street,city:p.buyer.city,postalCode:p.buyer.zip,country:'DE'},taxRegistrations:buyerTax.length?buyerTax:undefined,electronicAddress:p.buyer.email?{value:p.buyer.email,schemeID:'EM'}:undefined},
    lines:p.items.map((x,i)=>({id:String(i+1),name:x.description,quantity:Number(x.quantity),unitCode:unit(x.unit),unitPrice:Number(x.unitPrice),lineTotal:Number(x.lineTotal),vatCategoryCode:VatCategoryCode.STANDARD_RATE,vatRatePercent:19})),
    totals:{lineTotal:Number(p.invoice.net),taxBasisTotal:Number(p.invoice.net),taxTotal:Number(p.invoice.tax),grandTotal:Number(p.invoice.gross),prepaidAmount:Number(p.invoice.prepaid||0)||undefined,duePayableAmount:Number(p.invoice.due??p.invoice.gross),currency:'EUR'},
    vatBreakdown:[{categoryCode:VatCategoryCode.STANDARD_RATE,ratePercent:19,taxableAmount:Number(p.invoice.net),taxAmount:Number(p.invoice.tax)}],
    payment:{meansCode:'58',iban:String(p.seller.iban||'').replace(/\s+/g,''),dueDate:p.invoice.dueDate,paymentReference:p.invoice.number},
  };
  if(p.invoice.deliveryDate) input.delivery={date:p.invoice.deliveryDate};
  else if(p.invoice.periodStart&&p.invoice.periodEnd) input.billingPeriod={startDate:p.invoice.periodStart,endDate:p.invoice.periodEnd};
  return input;
}
function getWindowsSrgbIccProfile(){
  // Für PDF/A-3B ist ein OutputIntent mit eingebettetem ICC-Farbprofil erforderlich.
  // Wir verwenden ausschließlich das lokal mit Windows installierte sRGB-Profil.
  // Es wird nichts aus dem Internet geladen und kein zusätzlicher Dienst verwendet.
  const windir=process.env.WINDIR||process.env.SystemRoot||'C:\\Windows';
  const colorDir=path.join(windir,'System32','spool','drivers','color');
  const preferred=[
    'sRGB Color Space Profile.icm',
    'sRGB IEC61966-2.1.icc',
    'sRGB IEC61966-2.1.icm'
  ];
  for(const name of preferred){
    const file=path.join(colorDir,name);
    if(fsSync.existsSync(file)) return fsSync.readFileSync(file);
  }
  if(fsSync.existsSync(colorDir)){
    const match=fsSync.readdirSync(colorDir).find(name=>/srgb/i.test(name)&&/\.(icc|icm)$/i.test(name));
    if(match) return fsSync.readFileSync(path.join(colorDir,match));
  }
  throw new Error('Das Windows-sRGB-Farbprofil wurde nicht gefunden. Für einen PDF/A-3B-konformen Export ist dieses Farbprofil erforderlich.');
}

async function getFx(){return import('@stackforge-eu/factur-x')}

ipcMain.handle('export-zugferd',async(_e,p)=>{
  try{
    // Deutsches ZUGFeRD-XRECHNUNG-Referenzprofil:
    // - BT-24 erhält die XRechnung-CIUS-Kennung
    // - eingebettete Datei heißt xrechnung.xml
    // - XMP-ConformanceLevel wird als XRECHNUNG deklariert
    // Dadurch passt der Hybrid-PDF-Container zur deutschen KoSIT-Prüfung (BR-DE-21).
    const fx=await getFx(),input=toStructuredInput(p,fx),vr=fx.validateInput(input,fx.Profile.EN16931,fx.Flavor.XRECHNUNG);
    if(!vr.valid) throw new Error('E-Rechnungsdaten unvollständig: '+vr.errors.map(e=>e.message||e).join('; '));
    const pdf=await createInvoicePdf(p);
    const rgbIccProfile=getWindowsSrgbIccProfile();
    const result=await fx.embedFacturX({
      pdf,input,
      profile:fx.Profile.EN16931,
      flavor:fx.Flavor.XRECHNUNG,
      validateXsd:true,
      unembeddedFonts:'throw',
      addPdfA3Metadata:true,
      rgbIccProfile,
      outputIntentIdentifier:'sRGB IEC61966-2.1',
      meta:{creator:'InvoiceAssist',author:p.seller.name,title:`Rechnung ${p.invoice.number}`}
    });
    const choice=await dialog.showSaveDialog({title:'ZUGFeRD-PDF speichern',defaultPath:safeName(`${p.invoice.number}-ZUGFeRD.pdf`),filters:[{name:'PDF',extensions:['pdf']}]});
    if(choice.canceled||!choice.filePath)return{ok:true,canceled:true};
    await fs.writeFile(choice.filePath,Buffer.from(result.pdf)); return{ok:true,path:choice.filePath};
  }catch(e){return{ok:false,error:e?.message||String(e)}}
});

ipcMain.handle('export-xrechnung',async(_e,p)=>{
  try{
    const fx=await getFx(),input=toStructuredInput(p,fx);
    const vr=fx.validateInput(input,fx.Profile.EN16931,fx.Flavor.XRECHNUNG);
    if(!vr.valid) throw new Error('XRechnungsdaten unvollständig: '+vr.errors.map(e=>e.message||e).join('; '));
    const result=fx.toXRechnung(input);
    const xml=result.xml;
    const xsd=await fx.validateXsd(xml,fx.Profile.EN16931);
    if(!xsd.valid) throw new Error('XSD-Validierung fehlgeschlagen: '+xsd.errors.map(e=>e.message||e).join('; '));
    const choice=await dialog.showSaveDialog({title:'XRechnung speichern',defaultPath:safeName(`${p.invoice.number}-XRechnung.xml`),filters:[{name:'XML',extensions:['xml']}]});
    if(choice.canceled||!choice.filePath)return{ok:true,canceled:true};
    await fs.writeFile(choice.filePath,xml,'utf8'); return{ok:true,path:choice.filePath};
  }catch(e){return{ok:false,error:e?.message||String(e)}}
});
