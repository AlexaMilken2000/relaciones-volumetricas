'use strict';
const $ = id => document.getElementById(id);
const {variables,byKey,fmt,unit,display,solve,classify} = Soil;
const escapeHTML = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let current=null;
let system='SI';
let compiling=false;
let previewUrl=null;
let previewReport=null;
function clearPreview(){
  $('pdf-frame').removeAttribute('src');
  $('pdf-preview').hidden=true;
  $('save-pdf').removeAttribute('href');
  $('open-pdf').removeAttribute('href');
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  previewUrl=null;previewReport=null;
}
function showPreview(pdf,report){
  clearPreview();
  previewUrl=URL.createObjectURL(pdf);previewReport=report;
  $('pdf-frame').src=previewUrl;
  $('save-pdf').href=previewUrl;
  $('open-pdf').href=previewUrl;
  $('pdf-preview').hidden=false;
  $('pdf-preview').scrollIntoView({behavior:'smooth',block:'start'});
  $('pdf-preview-title').focus({preventScroll:true});
}
function updateExportButtons(){
  for(const id of ['print','download','download-tex']) $(id).disabled=!current;
  $('latex-pdf').disabled=!current||compiling;
}
const groups=[['Pesos',['W','Ws','Ww']],['Volúmenes',['V','Vs','Vv','Vw','Va']],['Propiedades',['Gs','w','e','n','S']],['Pesos unitarios',['gamma','gammad','gammasat','gammasub']]];
$('input-groups').innerHTML=groups.map(([name,keys])=>`<fieldset><legend>${name}</legend><div class="field-grid">${keys.map(key=>`<label class="field" for="input-${key}"><span class="field-name"><strong>${byKey[key].symbol}</strong> · ${byKey[key].label}</span><input id="input-${key}" data-key="${key}" inputmode="decimal" autocomplete="off" placeholder="${unit(key,system)}" aria-label="${byKey[key].label}, ${unit(key,system)}"></label>`).join('')}</div></fieldset>`).join('');

function showStatus(messages,error=false) {
  $('status').hidden=!messages.length;
  $('status').className=`status${error?'':' success'}`;
  $('status').setAttribute('role',error?'alert':'status');
  $('status').innerHTML=messages.length===1?escapeHTML(messages[0]):`<ul>${messages.map(m=>`<li>${escapeHTML(m)}</li>`).join('')}</ul>`;
}
function invalidate() {
  const hadReport=!!current;
  current=null;
  clearPreview();
  updateExportButtons();
  $('report').hidden=true;
  $('empty').hidden=false;
  $('print-help').hidden=true;
  if(hadReport) showStatus(['Cambiaste los datos. Vuelve a calcular para actualizar el informe.']);
}
function parseNumber(text) {
  const cleaned=text.trim();
  if(!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(cleaned)) return NaN;
  return Number(cleaned.replace(',','.'));
}
function readInput() {
  const input={},errors=[];
  for(const el of document.querySelectorAll('[data-key]')) {
    el.removeAttribute('aria-invalid');
    if(!el.value.trim()) continue;
    const key=el.dataset.key;
    let value=parseNumber(el.value);
    if(byKey[key].type==='percent') value/=100;
    const error=Soil.validate(key,value);
    if(error){errors.push(`${byKey[key].label}: ${error}.`);el.setAttribute('aria-invalid','true');}
    else input[key]=value;
  }
  const gammaw=parseNumber($('gammaw').value);
  const waterError=Soil.validate('gammaw',gammaw);
  $('gammaw').removeAttribute('aria-invalid');
  if(waterError){errors.push(`γw: ${waterError}.`);$('gammaw').setAttribute('aria-invalid','true');}
  if(!Object.keys(input).length && !errors.length) errors.push('Ingresa los datos conocidos de la muestra o usa el ejemplo.');
  return {input,gammaw,errors};
}
function calculate(event) {
  if(event) event.preventDefault();
  invalidate();
  const {input,gammaw,errors}=readInput();
  if(errors.length){showStatus(errors,true);document.querySelector('[aria-invalid=true]')?.focus();return;}
  const result=solve(input,gammaw);
  if(result.errors.length){showStatus(result.errors,true);return;}
  current={...result,system,project:$('project').value.trim(),date:new Date()};
  $('report').innerHTML=renderReport(current);
  $('report').hidden=false;
  $('empty').hidden=true;
  updateExportButtons();
  $('print-help').hidden=false;
  showStatus([result.warnings.some(w=>w.startsWith('Cálculo parcial'))?'Informe parcial disponible. Revisa los datos pendientes en el reporte.':`Informe listo. ${result.steps.length} pasos de cálculo completados.`]);
}
function table(keys,report,origin=false) {
  return `<table class="report-table"><thead><tr><th scope="col">Variable</th><th scope="col">Símbolo</th><th scope="col" class="numeric">Valor</th><th scope="col">Unidad</th>${origin?'<th scope="col">Origen</th>':''}</tr></thead><tbody>${keys.map(key=>`<tr><td>${byKey[key].label}</td><td>${byKey[key].symbol}</td><td class="numeric">${display(key,report.values[key])}</td><td>${unit(key,report.system)}</td>${origin?`<td class="tag">${key==='gammaw'?'Referencia':report.inputKeys.includes(key)?'Dato':'Calculado'}</td>`:''}</tr>`).join('')}</tbody></table>`;
}
function phaseDiagram(report) {
  const v=report.values;
  if(!['V','Vs','Vw','Va'].every(k=>Number.isFinite(v[k])) || v.V<=0) return '<p class="diagram-note">Para dibujar las fases a escala faltan los volúmenes. Agrega un volumen o peso de referencia y los datos necesarios para obtener Vs, Vw y Va. Los resultados disponibles se muestran en la tabla.</p>';
  const top=85,height=245,bottom=top+height,x=200,width=175,weightX=480,weightW=125;
  const hs=v.Vs/v.V*height,hw=v.Vw/v.V*height,ha=v.Va/v.V*height;
  const ys=bottom-hs,yw=ys-hw;
  const text=(tx,ty,content,anchor='middle',fill='#183b3b',size=13)=>`<text x="${tx}" y="${ty}" text-anchor="${anchor}" fill="${fill}" font-size="${size}" font-family="Segoe UI, Arial, sans-serif">${escapeHTML(content)}</text>`;
  const rect=(rx,ry,rw,rh,color)=>`<rect x="${rx}" y="${ry}" width="${rw}" height="${Math.max(0,rh)}" fill="${color}" stroke="white" stroke-width="1.5"/>`;
  const dimension=(dx,y1,y2,color)=>`<path d="M${dx-5} ${y1}h10 M${dx} ${y1}V${y2} M${dx-5} ${y2}h10" fill="none" stroke="${color}" stroke-width="1.4"/>`;
  let svg=text(x+width/2,30,'VOLUMEN','middle','#14655d',13)+text(weightX+weightW/2,30,'PESO','middle','#14655d',13);
  svg+=rect(x,top,width,ha,'#d6e2dd')+rect(x,yw,width,hw,'#3a829b')+rect(x,ys,width,hs,'#ad744b');
  if(ha>32) svg+=text(x+width/2,top+ha/2+4,'AIRE');
  if(hw>32) svg+=text(x+width/2,yw+hw/2+4,'AGUA','middle','#fff');
  if(hs>32) svg+=text(x+width/2,ys+hs/2+4,'SÓLIDOS','middle','#fff');
  // Vv queda a la izquierda de su propia cota; V usa una cota independiente a la derecha.
  if(ha+hw>0) {
    svg+=dimension(178,top,ys,'#a8563d');
    svg+=text(148,(top+ys)/2-6,'Vv','end','#a8563d',12)+text(148,(top+ys)/2+15,fmt(v.Vw+v.Va),'end','#a8563d',12);
  }
  svg+=dimension(400,top,bottom,'#47625b')+text(425,210,'V','start','#47625b',12);
  svg+=text(x+width/2,365,`V = ${fmt(v.V)} ${unit('V',report.system)}`,'middle','#183b3b',12);
  if(Number.isFinite(v.Ws)&&Number.isFinite(v.Ww)&&v.Ws+v.Ww>0) {
    const total=v.Ws+v.Ww,solid=v.Ws/total*height,water=v.Ww/total*height;
    svg+=rect(weightX,top,weightW,water,'#69a1b5')+rect(weightX,bottom-solid,weightW,solid,'#c59c55');
    if(solid>32) svg+=text(weightX+weightW/2,bottom-solid/2+4,'Ws');
    if(water>32) svg+=text(weightX+weightW/2,top+water/2+4,'Ww');
    svg+=text(weightX+weightW/2,60,'Wa = 0','middle','#5c706f',11)+text(weightX+weightW/2,365,`W = ${fmt(total)} ${unit('W',report.system)}`,'middle','#183b3b',12);
  } else svg+=text(weightX+weightW/2,185,'Faltan pesos','middle','#5c706f',12);
  const summary=`Volúmenes: sólidos ${fmt(v.Vs)}, agua ${fmt(v.Vw)}, aire ${fmt(v.Va)}, vacíos ${fmt(v.Vw+v.Va)} y total ${fmt(v.V)} ${unit('V',report.system)}.`;
  return `<figure class="phase-figure"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 390" role="img" aria-labelledby="phase-title phase-desc"><title id="phase-title">Diagrama de fases del suelo</title><desc id="phase-desc">${escapeHTML(summary)}</desc>${svg}</svg><figcaption>${escapeHTML(summary)} Las alturas representan las proporciones de cada columna. Las fases muy pequeñas se consultan en la tabla de resultados.</figcaption></figure>`;
}
function renderReport(report) {
  const keys=variables.filter(v=>report.values[v.key]!==undefined).map(v=>v.key);
  const summary=['e','n','S'].map(key=>`<div class="summary-card">${byKey[key].label}<strong>${report.values[key]!==undefined?display(key,report.values[key]):'—'}${byKey[key].type==='percent'&&report.values[key]!==undefined?' %':''}</strong><small>${byKey[key].symbol}${report.values[key]===undefined?' · pendiente':''}</small></div>`).join('');
  return `<header class="report-heading"><p class="eyebrow">MECÁNICA DE SUELOS · INFORME DE CÁLCULO</p><h2>Relaciones volumétricas</h2>${report.project?`<p class="project">${escapeHTML(report.project)}</p>`:''}<p class="report-meta">${report.date.toLocaleString('es-MX')} · Sistema ${report.system==='SI'?'SI (kN, m³)':'CGS (gf, cm³)'} · γw = ${fmt(report.values.gammaw)} ${unit('gammaw',report.system)}</p><p class="report-meta">Relaciones volumétricas y gravimétricas del suelo</p></header>
  <div class="summary-cards">${summary}</div>
  ${report.warnings.length?`<section class="report-section"><h3 class="section-title">Observaciones</h3><div class="notice">${report.warnings.map(w=>`<p>${escapeHTML(w)}</p>`).join('')}</div></section>`:''}
  <section class="report-section"><h3 class="section-title"><span>01</span> Datos de entrada</h3>${table(report.inputKeys,report)}<p class="report-note">Peso específico del agua: γw = ${fmt(report.values.gammaw)} ${unit('gammaw',report.system)}.</p></section>
  <section class="report-section"><h3 class="section-title"><span>02</span> Diagrama de fases del suelo</h3>${phaseDiagram(report)}</section>
  <section class="report-section"><h3 class="section-title"><span>03</span> Resultados</h3>${table(keys,report,true)}</section>
  <section class="report-section"><h3 class="section-title"><span>04</span> Desarrollo paso a paso</h3><p class="report-note">En las sustituciones, ω, n y S se usan como fracciones decimales. Los resultados se presentan en porcentaje. Se muestran hasta seis cifras significativas; el cálculo conserva la precisión interna.</p>${report.steps.length?report.steps.map((step,i)=>`<div class="step"><h4>Paso ${i+1} · ${byKey[step.key].label}</h4><p class="formula">${escapeHTML(step.formula)}</p><p class="substitution">${byKey[step.key].symbol} = ${escapeHTML(step.substitution)} = ${fmt(step.value)}${byKey[step.key].type==='percent'?' (fracción)':''}</p><p class="step-result">${byKey[step.key].symbol} = ${display(step.key,step.value)} ${unit(step.key,report.system)==='—'?'':unit(step.key,report.system)}</p></div>`).join(''):'<p class="report-note">No se obtuvieron variables adicionales. Agrega más datos independientes para ampliar el cálculo.</p>'}</section>
  <section class="report-section"><h3 class="section-title"><span>05</span> Interpretación</h3>${classify(report.values).map(line=>`<p class="report-note">${escapeHTML(line)}</p>`).join('')||'<p class="report-note">Faltan datos para interpretar la saturación y la relación de vacíos.</p>'}</section>
  <section class="report-section"><h3 class="section-title"><span>06</span> Fórmulas de referencia</h3><ul class="reference-list"><li>W = Ws + Ww; V = Vs + Vv; Vv = Vw + Va</li><li>ω = Ww / Ws; e = Vv / Vs; n = Vv / V = e / (1 + e)</li><li>S = Vw / Vv; Gs × ω = S × e</li><li>Gs = Ws / (Vs × γw)</li><li>γ = W / V = Gs × γw × (1 + ω) / (1 + e)</li><li>γd = Ws / V = Gs × γw / (1 + e)</li><li>γsat = (Gs + e) × γw / (1 + e); γ′ = γsat − γw</li></ul></section>
  <footer class="report-footer">Relaciones volumétricas</footer>`;
}

$('soil-form').addEventListener('submit',calculate);
$('soil-form').addEventListener('input',invalidate);
$('system').addEventListener('change',()=>{
  const next=$('system').value;
  if(next===system) return;
  const forward=next==='CGS';
  const factors={weight:1e6/9.80665,volume:1e6,density:1/9.80665,ratio:1,percent:1};
  for(const el of [...document.querySelectorAll('[data-key]'),$('gammaw')]) {
    const key=el.dataset.key||'gammaw',factor=factors[byKey[key].type],value=parseNumber(el.value);
    if(el.value.trim()&&Number.isFinite(value)) el.value=String(Number((value*(forward?factor:1/factor)).toPrecision(12)));
    if(el.dataset.key){el.placeholder=unit(key,next);el.setAttribute('aria-label',`${byKey[key].label}, ${unit(key,next)}`);}
  }
  system=next;
  document.querySelector('.density-unit').textContent=unit('gammaw',system);
  invalidate();
  showStatus(['Se convirtieron los datos numéricos al nuevo sistema de unidades. Pulsa Calcular para actualizar el informe.']);
});
$('example').addEventListener('click',()=>{
  for(const el of document.querySelectorAll('[data-key]')){el.value='';el.removeAttribute('aria-invalid');}
  const sample={Gs:2.65,w:15,e:0.65,V:system==='SI'?0.001:1000};
  for(const [key,value] of Object.entries(sample)) $(`input-${key}`).value=value;
  $('gammaw').value=system==='SI'?'9.81':'1';
  $('project').value='Muestra de ejemplo';
  calculate();
});
$('clear').addEventListener('click',()=>{
  invalidate();
  for(const el of document.querySelectorAll('[data-key]')){el.value='';el.removeAttribute('aria-invalid');}
  $('gammaw').value=system==='SI'?'9.81':'1';
  $('gammaw').removeAttribute('aria-invalid');
  $('project').value='';
  showStatus([]);
  $('project').focus();
});
$('print').addEventListener('click',()=>{if(current) window.print();});
function saveFile(blob,filename){
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
$('download-tex').addEventListener('click',()=>{
  if(!current)return;
  try{saveFile(new Blob([SoilLatex.build(current)],{type:'application/x-tex;charset=utf-8'}),'relaciones-volumetricas.tex');showStatus(['Archivo LaTeX descargado. Incluye el diagrama TikZ, los resultados y todas las sustituciones; no requiere imágenes adicionales.']);}
  catch(error){showStatus([`No se pudo preparar el archivo LaTeX: ${error.message}`],true);}
});
$('latex-pdf').addEventListener('click',async()=>{
  if(!current||compiling)return;
  if(previewReport===current&&previewUrl){$('pdf-preview').hidden=false;$('pdf-preview').scrollIntoView({behavior:'smooth',block:'start'});$('pdf-preview-title').focus({preventScroll:true});return;}
  const snapshot=current;
  compiling=true;updateExportButtons();$('latex-pdf').textContent='Compilando LaTeX…';
  showStatus(['Compilando el informe con LaTeX. La vista previa aparecerá cuando termine.']);
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),210000);
  try{
    const base=location.protocol==='file:'?'http://127.0.0.1:8080':'';
    const input=Object.fromEntries(snapshot.inputKeys.map(key=>[key,snapshot.values[key]]));
    const response=await fetch(`${base}/api/pdf`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input,gammaw:snapshot.values.gammaw,system:snapshot.system,project:snapshot.project}),signal:controller.signal});
    if(!response.ok){const detail=await response.json().catch(()=>null);throw new Error(detail?.error||'El servicio de LaTeX no está disponible en esta página.');}
    if(!response.headers.get('Content-Type')?.includes('application/pdf'))throw new Error('El servicio no devolvió un PDF válido.');
    const pdf=await response.blob();
    if(current!==snapshot){showStatus(['El cálculo cambió durante la exportación. Exporta de nuevo para descargar el reporte actualizado.']);return;}
    showPreview(pdf,snapshot);
    showStatus(['PDF listo. Revísalo en la vista previa y pulsa Descargar PDF cuando quieras guardarlo.']);
  }catch(error){
    const message=error.name==='AbortError'?'La compilación tardó demasiado. Inténtalo nuevamente.':error instanceof TypeError?(location.protocol==='file:'?'Inicia el servicio con iniciar-web.cmd y abre http://127.0.0.1:8080 para compilar.':'No se pudo conectar con el servicio de LaTeX. Inténtalo nuevamente en un momento.'):error.message;
    showStatus([message,'Puedes usar Descargar .tex para obtener el reporte completo y compilarlo por separado.'],true);
  }finally{clearTimeout(timeout);compiling=false;$('latex-pdf').textContent='Ver PDF LaTeX';updateExportButtons();}
});
$('close-preview').addEventListener('click',()=>{$('pdf-preview').hidden=true;$('latex-pdf').focus();});
$('preview-tex').addEventListener('click',()=>{$('download-tex').click();});
$('download').addEventListener('click',()=>{
  if(!current) return;
  let css=$('app-styles')?.textContent||'';
  if(!css) {
    try {css=Array.from(document.styleSheets).map(sheet=>Array.from(sheet.cssRules).map(rule=>rule.cssText).join('\n')).join('\n');}
    catch {css='body{font:15px Arial,sans-serif;color:#183b3b;margin:30px auto;max-width:850px;padding:20px}table{border-collapse:collapse;width:100%}th,td{padding:9px;border-bottom:1px solid #ccc;text-align:left}svg{width:100%;height:auto}.step,figure{break-inside:avoid}h3{break-after:avoid}p{line-height:1.6}@media print{.no-print{display:none}}';}
  }
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relaciones volumétricas</title><style>${css}\nbody{background:#fff}#report{max-width:900px;margin:24px auto}.standalone-tools{max-width:900px;margin:20px auto;padding:0 15px}@media print{#report{margin:0;max-width:none}}</style></head><body><div class="standalone-tools no-print"><button class="button primary" onclick="window.print()">Guardar como PDF / Imprimir</button><p class="print-help">Este informe está completo y disponible sin conexión. Puedes buscar y seleccionar su texto.</p></div><article id="report">${$('report').innerHTML}</article></body></html>`;
  const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='informe-relaciones-volumetricas.html';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
});
