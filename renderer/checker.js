/* InvoiceAssist 0.8.3 – lokaler XRechnung-Prüfer
   Eigenständiges Renderer-Modul. Der bestehende Rechnungs-/Exportkern bleibt unberührt. */
(() => {
  const $ = id => document.getElementById(id);
  const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 });

  const local = (node, name) => {
    if (!node) return [];
    const ns = node.getElementsByTagNameNS ? Array.from(node.getElementsByTagNameNS('*', name)) : [];
    if (ns.length) return ns;
    return Array.from(node.getElementsByTagName('*')).filter(x => x.localName === name || x.nodeName.split(':').pop() === name);
  };
  const first = (node, name) => local(node, name)[0] || null;
  const text = node => String(node?.textContent || '').trim();
  const firstText = (node, name) => text(first(node, name));
  const direct = (node, name) => Array.from(node?.children || []).find(x => x.localName === name || x.nodeName.split(':').pop() === name) || null;
  const directText = (node, name) => text(direct(node, name));
  const num = value => {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const n = Number(raw.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const amount = value => {
    const n = num(value);
    return n === null ? null : n;
  };
  const deDate = value => {
    const v = String(value || '').trim();
    if (!v) return '—';
    let iso = v;
    if (/^\d{8}$/.test(v)) iso = `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
      const d = new Date(iso.slice(0,10) + 'T12:00:00');
      if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('de-DE');
    }
    return v;
  };
  const addr = a => [a?.street, [a?.zip, a?.city].filter(Boolean).join(' '), a?.country].filter(Boolean).join(', ');
  const fmtMoney = n => n === null || n === undefined ? '—' : money.format(n);
  const unitLabel = code => ({C62:'Stück',HUR:'Stunde',DAY:'Tag',MON:'Monat',KGM:'kg',MTR:'m',MTK:'m²',MTQ:'m³',LTR:'Liter'})[String(code||'').toUpperCase()] || code || '—';
  let currentData = null;
  let currentFile = null;

  function ublParty(node) {
    const party = first(node, 'Party') || node;
    const postal = first(party, 'PostalAddress');
    const countryNode = first(postal, 'Country');
    const legal = first(party, 'PartyLegalEntity');
    const partyName = first(party, 'PartyName');
    const contact = first(party, 'Contact');
    return {
      name: firstText(legal, 'RegistrationName') || firstText(partyName, 'Name') || firstText(party, 'Name'),
      street: firstText(postal, 'StreetName'),
      zip: firstText(postal, 'PostalZone'),
      city: firstText(postal, 'CityName'),
      country: firstText(countryNode, 'IdentificationCode'),
      email: firstText(contact, 'ElectronicMail')
    };
  }

  function parseUbl(doc) {
    const root = doc.documentElement;
    const supplier = first(root, 'AccountingSupplierParty');
    const customer = first(root, 'AccountingCustomerParty');
    const monetary = first(root, 'LegalMonetaryTotal');
    const taxTotal = first(root, 'TaxTotal');
    const payment = first(root, 'PaymentMeans');
    const account = first(payment, 'PayeeFinancialAccount');
    const lines = local(root, 'InvoiceLine').map((line, index) => {
      const item = first(line, 'Item');
      const price = first(line, 'Price');
      const qtyNode = direct(line, 'InvoicedQuantity') || first(line, 'InvoicedQuantity');
      return {
        id: directText(line, 'ID') || String(index + 1),
        description: firstText(item, 'Name') || firstText(item, 'Description') || '—',
        quantity: num(text(qtyNode)),
        unit: qtyNode?.getAttribute('unitCode') || '',
        unitPrice: amount(firstText(price, 'PriceAmount')),
        total: amount(directText(line, 'LineExtensionAmount') || firstText(line, 'LineExtensionAmount'))
      };
    });
    return {
      format: root.localName === 'CreditNote' ? 'XRechnung / UBL CreditNote' : 'XRechnung / UBL Invoice',
      recognized: true,
      invoiceNumber: directText(root, 'ID'),
      issueDate: directText(root, 'IssueDate'),
      dueDate: directText(root, 'DueDate') || firstText(first(root, 'PaymentTerms'), 'PaymentDueDate'),
      buyerReference: directText(root, 'BuyerReference'),
      currency: directText(root, 'DocumentCurrencyCode') || 'EUR',
      seller: ublParty(supplier),
      buyer: ublParty(customer),
      iban: firstText(account, 'ID'),
      net: amount(firstText(monetary, 'TaxExclusiveAmount') || firstText(monetary, 'LineExtensionAmount')),
      tax: amount(firstText(taxTotal, 'TaxAmount')),
      gross: amount(firstText(monetary, 'TaxInclusiveAmount')),
      dueAmount: amount(firstText(monetary, 'PayableAmount')),
      lines
    };
  }

  function ciiParty(node) {
    const address = first(node, 'PostalTradeAddress');
    return {
      name: directText(node, 'Name') || firstText(node, 'Name'),
      street: firstText(address, 'LineOne'),
      zip: firstText(address, 'PostcodeCode'),
      city: firstText(address, 'CityName'),
      country: firstText(address, 'CountryID'),
      email: firstText(first(node, 'URIUniversalCommunication'), 'URIID')
    };
  }

  function parseCii(doc) {
    const root = doc.documentElement;
    const documentNode = first(root, 'ExchangedDocument');
    const agreement = first(root, 'ApplicableHeaderTradeAgreement');
    const settlement = first(root, 'ApplicableHeaderTradeSettlement');
    const summation = first(settlement, 'SpecifiedTradeSettlementHeaderMonetarySummation');
    const paymentTerms = first(settlement, 'SpecifiedTradePaymentTerms');
    const account = first(settlement, 'PayeePartyCreditorFinancialAccount');
    const lines = local(root, 'IncludedSupplyChainTradeLineItem').map((line, index) => {
      const docLine = first(line, 'AssociatedDocumentLineDocument');
      const product = first(line, 'SpecifiedTradeProduct');
      const delivery = first(line, 'SpecifiedLineTradeDelivery');
      const agreementLine = first(line, 'SpecifiedLineTradeAgreement');
      const settlementLine = first(line, 'SpecifiedLineTradeSettlement');
      const qtyNode = first(delivery, 'BilledQuantity');
      const priceNode = first(agreementLine, 'NetPriceProductTradePrice');
      const sumNode = first(settlementLine, 'SpecifiedTradeSettlementLineMonetarySummation');
      return {
        id: firstText(docLine, 'LineID') || String(index + 1),
        description: firstText(product, 'Name') || firstText(product, 'Description') || '—',
        quantity: num(text(qtyNode)),
        unit: qtyNode?.getAttribute('unitCode') || '',
        unitPrice: amount(firstText(priceNode, 'ChargeAmount')),
        total: amount(firstText(sumNode, 'LineTotalAmount'))
      };
    });
    const issue = first(first(documentNode, 'IssueDateTime'), 'DateTimeString');
    const due = first(first(paymentTerms, 'DueDateDateTime'), 'DateTimeString');
    return {
      format: 'XRechnung / CII (UN/CEFACT)',
      recognized: true,
      invoiceNumber: directText(documentNode, 'ID') || firstText(documentNode, 'ID'),
      issueDate: text(issue),
      dueDate: text(due),
      buyerReference: firstText(agreement, 'BuyerReference'),
      currency: firstText(settlement, 'InvoiceCurrencyCode') || 'EUR',
      seller: ciiParty(first(agreement, 'SellerTradeParty')),
      buyer: ciiParty(first(agreement, 'BuyerTradeParty')),
      iban: firstText(account, 'IBANID'),
      net: amount(firstText(summation, 'TaxBasisTotalAmount') || firstText(summation, 'LineTotalAmount')),
      tax: amount(firstText(summation, 'TaxTotalAmount')),
      gross: amount(firstText(summation, 'GrandTotalAmount')),
      dueAmount: amount(firstText(summation, 'DuePayableAmount')),
      lines
    };
  }

  function parseInvoice(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror') || doc.documentElement?.localName === 'parsererror') throw new Error('Die XML-Datei ist nicht wohlgeformt und konnte nicht gelesen werden.');
    const rootName = doc.documentElement?.localName || '';
    if (rootName === 'Invoice' || rootName === 'CreditNote') return parseUbl(doc);
    if (rootName === 'CrossIndustryInvoice') return parseCii(doc);
    throw new Error(`XML erkannt, aber kein unterstütztes XRechnungsformat. Wurzelelement: ${rootName || 'unbekannt'}.`);
  }

  function makeChecks(data) {
    const checks = [];
    const add = (level, title, detail) => checks.push({ level, title, detail });
    add('ok', 'XML lesbar', 'Die Datei ist technisch wohlgeformtes XML.');
    add(data.recognized ? 'ok' : 'error', 'Rechnungsformat erkannt', data.format || 'Unbekanntes Format');
    add(data.invoiceNumber ? 'ok' : 'error', 'Rechnungsnummer', data.invoiceNumber || 'Fehlt');
    add(data.issueDate ? 'ok' : 'error', 'Rechnungsdatum', data.issueDate ? deDate(data.issueDate) : 'Fehlt');
    add(data.seller?.name ? 'ok' : 'error', 'Rechnungssteller', data.seller?.name || 'Fehlt');
    add(data.buyer?.name ? 'ok' : 'error', 'Rechnungsempfänger', data.buyer?.name || 'Fehlt');
    add(data.lines.length ? 'ok' : 'error', 'Rechnungspositionen', `${data.lines.length} Position${data.lines.length === 1 ? '' : 'en'} erkannt`);
    add(data.buyerReference ? 'ok' : 'warn', 'Käuferreferenz / Leitweg-ID', data.buyerReference || 'Nicht gefunden – bei vielen XRechnungen erforderlich.');
    add(data.currency ? 'ok' : 'warn', 'Währung', data.currency || 'Nicht gefunden');
    add(data.iban ? 'ok' : 'warn', 'IBAN', data.iban || 'Keine IBAN im strukturierten Datensatz gefunden.');
    if (data.net !== null && data.tax !== null && data.gross !== null) {
      const diff = Math.abs((data.net + data.tax) - data.gross);
      add(diff <= 0.02 ? 'ok' : 'error', 'Betragsplausibilität', diff <= 0.02 ? 'Netto + Steuer entspricht Brutto.' : `Abweichung von ${money.format(diff)} zwischen Netto + Steuer und Brutto.`);
    } else {
      add('warn', 'Betragsplausibilität', 'Nicht alle Summen konnten für den rechnerischen Vergleich ausgelesen werden.');
    }
    return checks;
  }

  function setText(id, value) { const node = $(id); if (node) node.textContent = value || '—'; }
  function renderChecks(checks) {
    const box = $('checkerChecks'); box.replaceChildren();
    for (const c of checks) {
      const row = document.createElement('div'); row.className = `checker-check ${c.level}`;
      const icon = document.createElement('span'); icon.className = 'checker-check-icon'; icon.textContent = c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '×';
      const body = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = c.title; const small = document.createElement('small'); small.textContent = c.detail;
      body.append(strong, small); row.append(icon, body); box.append(row);
    }
  }
  function renderPositions(lines, currency) {
    const body = $('checkerPositions'); body.replaceChildren();
    setText('checkerPositionMeta', `${lines.length} Position${lines.length === 1 ? '' : 'en'}`);
    for (const x of lines) {
      const tr = document.createElement('tr');
      const cells = [x.id || '—', x.description || '—', x.quantity === null ? '—' : number.format(x.quantity), unitLabel(x.unit), x.unitPrice === null ? '—' : money.format(x.unitPrice), x.total === null ? '—' : money.format(x.total)];
      cells.forEach((v, i) => { const td = document.createElement('td'); td.textContent = v; if ([2,4,5].includes(i)) td.className = 'num'; tr.appendChild(td); });
      body.appendChild(tr);
    }
  }
  function renderResult(data, file, checks) {
    $('checkerResult').hidden = false;
    setText('checkerFormat', data.format);
    setText('checkerFileName', file.name);
    const errors = checks.filter(x => x.level === 'error').length;
    const warnings = checks.filter(x => x.level === 'warn').length;
    setText('checkerOverall', errors ? 'Fehler gefunden' : warnings ? 'Plausibel mit Hinweisen' : 'Plausibel');
    setText('checkerOverallMeta', `${errors} Fehler · ${warnings} Hinweis${warnings === 1 ? '' : 'e'}`);
    $('checkerOverall').className = errors ? 'checker-overall-error' : warnings ? 'checker-overall-warn' : 'checker-overall-ok';
    renderChecks(checks);
    setText('checkInvoiceNumber', data.invoiceNumber);
    setText('checkIssueDate', deDate(data.issueDate));
    setText('checkDueDate', deDate(data.dueDate));
    setText('checkBuyerReference', data.buyerReference);
    setText('checkSeller', data.seller?.name);
    setText('checkSellerAddress', addr(data.seller) || '');
    setText('checkBuyer', data.buyer?.name);
    setText('checkBuyerAddress', addr(data.buyer) || '');
    setText('checkIban', data.iban);
    setText('checkCurrency', data.currency);
    setText('checkNet', fmtMoney(data.net));
    setText('checkTax', fmtMoney(data.tax));
    setText('checkGross', fmtMoney(data.gross));
    setText('checkDueAmount', fmtMoney(data.dueAmount));
    setText('checkFileInfoName', file.name);
    setText('checkFileSize', file.size < 1024 ? `${file.size} B` : file.size < 1024*1024 ? `${(file.size/1024).toFixed(1)} KB` : `${(file.size/1024/1024).toFixed(2)} MB`);
    renderPositions(data.lines, data.currency);
    currentData = data; currentFile = file;
    const pdfBtn = $('checkerPdfBtn'); if (pdfBtn) pdfBtn.disabled = false;
  }
  function showMessage(message, type = 'info') {
    const box = $('checkerMessage'); box.hidden = false; box.className = `checker-message ${type}`; box.textContent = message;
  }

  async function extractInvoiceXmlFromPdf(file) {
    if (!window.invoiceAssist?.extractZugferdXml) {
      throw new Error('Die ZUGFeRD-PDF-Funktion ist in dieser App-Version nicht verfügbar. Bitte InvoiceAssist 0.8.3 vollständig bauen.');
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await window.invoiceAssist.extractZugferdXml(bytes);
    if (!result?.ok) {
      const detail = String(result?.error || '');
      if (/embedded|attachment|xml|factur|zugferd|not found|nicht gefunden/i.test(detail)) {
        throw new Error('In dieser PDF konnte keine eingebettete ZUGFeRD-/Factur-X-Rechnungs-XML gefunden werden.');
      }
      throw new Error(`Die PDF konnte nicht als ZUGFeRD-/Factur-X-Rechnung gelesen werden${detail ? `: ${detail}` : '.'}`);
    }
    if (!result.xml) throw new Error('Die eingebettete Rechnungs-XML wurde gefunden, konnte aber nicht ausgelesen werden.');
    return { xml: result.xml, attachmentName: result.filename || 'factur-x.xml', profile: result.profile || '' };
  }

  async function handleFile(file) {
    $('checkerResult').hidden = true;
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return showMessage('Die Datei ist größer als 25 MB. Bitte eine normale E-Rechnungsdatei auswählen.', 'error');
    const isPdf = /\.pdf$/i.test(file.name) || /application\/pdf/i.test(file.type || '');
    const isXml = /\.xml$/i.test(file.name) || /xml/i.test(file.type || '');
    if (!isPdf && !isXml) return showMessage('Bitte eine XRechnung-XML oder eine ZUGFeRD-/Factur-X-PDF auswählen.', 'warn');
    showMessage(isPdf ? 'ZUGFeRD-PDF wird lokal gelesen und die eingebettete XML gesucht …' : 'XML-Datei wird lokal gelesen und geprüft …', 'info');
    try {
      let xml, embeddedName = '';
      if (isPdf) {
        const extracted = await extractInvoiceXmlFromPdf(file);
        xml = extracted.xml;
        embeddedName = extracted.attachmentName;
        var embeddedProfile = extracted.profile || '';
      } else {
        xml = await file.text();
      }
      const data = parseInvoice(xml);
      if (isPdf) data.format = `ZUGFeRD / Factur-X PDF${embeddedProfile ? ` · Profil ${embeddedProfile}` : ''} · ${data.format}`;
      const checks = makeChecks(data);
      renderResult(data, file, checks);
      const errors = checks.filter(x => x.level === 'error').length;
      const warnings = checks.filter(x => x.level === 'warn').length;
      showMessage(errors ? `Prüfung abgeschlossen: ${errors} Fehler gefunden.` : warnings ? `Prüfung abgeschlossen: plausibel, aber ${warnings} Hinweis${warnings === 1 ? '' : 'e'}.` : (isPdf ? `ZUGFeRD erkannt: eingebettete XML „${embeddedName}“ ausgelesen. Keine Auffälligkeiten in der lokalen Strukturprüfung.` : 'Prüfung abgeschlossen: keine Auffälligkeiten in der lokalen Strukturprüfung.'), errors ? 'error' : warnings ? 'warn' : 'success');
    } catch (err) {
      showMessage(err?.message || String(err), 'error');
    }
  }


  const htmlEsc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function printableInvoice(data, file) {
    const rows = (data.lines || []).map(x => `<tr><td>${htmlEsc(x.id||'—')}</td><td>${htmlEsc(x.description||'—')}</td><td class="r">${htmlEsc(x.quantity===null?'—':number.format(x.quantity))}</td><td>${htmlEsc(unitLabel(x.unit))}</td><td class="r">${htmlEsc(x.unitPrice===null?'—':money.format(x.unitPrice))}</td><td class="r">${htmlEsc(x.total===null?'—':money.format(x.total))}</td></tr>`).join('');
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>E-Rechnung ${htmlEsc(data.invoiceNumber||'')}</title><style>
      @page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;font-size:10pt;margin:0}h1{font-size:22pt;margin:0 0 4mm}.sub{color:#667085;margin-bottom:8mm}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8mm;margin:6mm 0}.box{border:1px solid #d7dce3;border-radius:6px;padding:5mm}.label{font-size:8pt;text-transform:uppercase;color:#667085;font-weight:bold;margin-bottom:2mm}.meta{display:grid;grid-template-columns:1fr 1fr;gap:3mm 8mm}.meta div{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:1.5mm 0}table{width:100%;border-collapse:collapse;margin-top:7mm}th,td{padding:2.5mm 2mm;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}th{font-size:8pt;text-transform:uppercase;color:#667085;background:#f7f7f7}.r{text-align:right;white-space:nowrap}.totals{width:75mm;margin:7mm 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:2mm 0;border-bottom:1px solid #ddd}.totals .grand{font-size:12pt;font-weight:bold;border-top:2px solid #111}.notice{margin-top:12mm;padding:4mm;border:1px solid #d7dce3;background:#f7f8fa;font-size:8.5pt;line-height:1.45}.footer{margin-top:5mm;color:#667085;font-size:8pt}@media print{button{display:none}}
    </style></head><body><h1>E-Rechnung</h1><div class="sub">Lesbare Darstellung der strukturierten XML-Rechnungsdaten</div>
    <div class="meta"><div><span>Rechnungsnummer</span><strong>${htmlEsc(data.invoiceNumber||'—')}</strong></div><div><span>Rechnungsdatum</span><strong>${htmlEsc(deDate(data.issueDate))}</strong></div><div><span>Fällig am</span><strong>${htmlEsc(deDate(data.dueDate))}</strong></div><div><span>Käuferreferenz</span><strong>${htmlEsc(data.buyerReference||'—')}</strong></div></div>
    <div class="grid"><div class="box"><div class="label">Rechnungssteller</div><strong>${htmlEsc(data.seller?.name||'—')}</strong><br>${htmlEsc(addr(data.seller)||'')}</div><div class="box"><div class="label">Rechnungsempfänger</div><strong>${htmlEsc(data.buyer?.name||'—')}</strong><br>${htmlEsc(addr(data.buyer)||'')}</div></div>
    <table><thead><tr><th>Pos.</th><th>Beschreibung</th><th class="r">Menge</th><th>Einheit</th><th class="r">Einzelpreis</th><th class="r">Gesamt</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="totals"><div><span>Netto</span><strong>${htmlEsc(fmtMoney(data.net))}</strong></div><div><span>Steuer</span><strong>${htmlEsc(fmtMoney(data.tax))}</strong></div><div><span>Brutto</span><strong>${htmlEsc(fmtMoney(data.gross))}</strong></div><div class="grand"><span>Zu zahlen</span><strong>${htmlEsc(fmtMoney(data.dueAmount))}</strong></div></div>
    <div class="box" style="margin-top:8mm"><div class="label">Zahlungsinformation</div><strong>IBAN:</strong> ${htmlEsc(data.iban||'—')} &nbsp;&nbsp; <strong>Währung:</strong> ${htmlEsc(data.currency||'—')}</div>
    <div class="notice"><strong>Hinweis:</strong> Diese PDF-/Druckansicht ist eine von InvoiceAssist erzeugte lesbare Darstellung der strukturierten E-Rechnungsdaten. Sie ersetzt oder verändert die Original-XML-Datei nicht. Für die elektronische Weiterverarbeitung und die darin enthaltenen strukturierten Rechnungsdaten bleibt die Original-XML maßgeblich.</div>
    <div class="footer">Quelle: ${htmlEsc(file?.name||'E-Rechnungsdatei')} · lokal mit InvoiceAssist aufbereitet</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`;
  }
  function saveAsPdfView() {
    if (!currentData) return showMessage('Bitte zuerst eine E-Rechnung einlesen.', 'warn');
    const w = window.open('', '_blank', 'width=1000,height=850');
    if (!w) return showMessage('Die PDF-/Druckansicht konnte nicht geöffnet werden.', 'error');
    w.document.open(); w.document.write(printableInvoice(currentData, currentFile)); w.document.close();
  }

  const input = $('checkerFileInput');
  const drop = $('checkerDropzone');
  const choose = $('checkerChooseBtn');
  if (!input || !drop || !choose) return;
  const pdfBtn = $('checkerPdfBtn'); if (pdfBtn) { pdfBtn.disabled = true; pdfBtn.addEventListener('click', saveAsPdfView); }
  choose.addEventListener('click', e => { e.stopPropagation(); input.click(); });
  input.addEventListener('change', () => handleFile(input.files?.[0]));
  drop.addEventListener('click', e => { if (e.target !== choose) input.click(); });
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  ['dragenter','dragover'].forEach(name => drop.addEventListener(name, e => { e.preventDefault(); drop.classList.add('dragging'); }));
  ['dragleave','drop'].forEach(name => drop.addEventListener(name, e => { e.preventDefault(); drop.classList.remove('dragging'); }));
  drop.addEventListener('drop', e => handleFile(e.dataTransfer?.files?.[0]));
})();
