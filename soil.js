/* Motor de cálculo compartido por la página y las comprobaciones. */
(function (root) {
  'use strict';
  const variables = [
    ['W','W','Peso total','weight'], ['Ws','Ws','Peso de sólidos','weight'],
    ['Ww','Ww','Peso de agua','weight'], ['V','V','Volumen total','volume'],
    ['Vs','Vs','Volumen de sólidos','volume'], ['Vv','Vv','Volumen de vacíos','volume'],
    ['Vw','Vw','Volumen de agua','volume'], ['Va','Va','Volumen de aire','volume'],
    ['Gs','Gs','Gravedad específica','ratio'], ['w','ω','Contenido de humedad','percent'],
    ['e','e','Relación de vacíos','ratio'], ['n','n','Porosidad','percent'],
    ['S','S','Grado de saturación','percent'], ['gamma','γ','Peso unitario húmedo','density'],
    ['gammad','γd','Peso unitario seco','density'], ['gammasat','γsat','Peso unitario saturado','density'],
    ['gammasub','γ′','Peso unitario sumergido','density'], ['gammaw','γw','Peso específico del agua','density']
  ].map(([key,symbol,label,type]) => ({key,symbol,label,type}));
  const byKey = Object.fromEntries(variables.map(v => [v.key,v]));
  const rules = [];
  function rule(out, deps, expression, calculate) { rules.push({out,deps,expression,calculate}); }
  function sum(total,a,b) {
    rule(total,[a,b],`${a} + ${b}`,(x,y)=>x+y);
    rule(a,[total,b],`${total} − ${b}`,(x,y)=>x-y);
    rule(b,[total,a],`${total} − ${a}`,(x,y)=>x-y);
  }
  function product(total,a,b) {
    rule(total,[a,b],`${a} × ${b}`,(x,y)=>x*y);
    rule(a,[total,b],`${total} / ${b}`,(x,y)=>y===0?NaN:x/y);
    rule(b,[total,a],`${total} / ${a}`,(x,y)=>y===0?NaN:x/y);
  }
  sum('W','Ws','Ww'); sum('V','Vs','Vv'); sum('Vv','Vw','Va');
  product('Ww','w','Ws'); product('Vv','e','Vs'); product('Vv','n','V');
  product('Vw','S','Vv'); product('W','gamma','V'); product('Ws','gammad','V');
  product('Ww','Vw','gammaw');
  rule('n',['e'],'e / (1 + e)',e=>e/(1+e));
  rule('e',['n'],'n / (1 − n)',n=>n===1?NaN:n/(1-n));
  rule('Ws',['Gs','Vs','gammaw'],'Gs × Vs × gammaw',(g,v,w)=>g*v*w);
  rule('Vs',['Ws','Gs','gammaw'],'Ws / (Gs × gammaw)',(w,g,gw)=>w/(g*gw));
  rule('Gs',['Ws','Vs','gammaw'],'Ws / (Vs × gammaw)',(w,v,gw)=>w/(v*gw));
  rule('gammad',['gamma','w'],'gamma / (1 + w)',(g,w)=>g/(1+w));
  rule('gamma',['gammad','w'],'gammad × (1 + w)',(g,w)=>g*(1+w));
  rule('w',['gamma','gammad'],'gamma / gammad − 1',(g,d)=>g/d-1);
  rule('gammad',['Gs','gammaw','e'],'Gs × gammaw / (1 + e)',(g,w,e)=>g*w/(1+e));
  rule('e',['Gs','gammaw','gammad'],'Gs × gammaw / gammad − 1',(g,w,d)=>g*w/d-1);
  rule('Gs',['gammad','e','gammaw'],'gammad × (1 + e) / gammaw',(d,e,w)=>d*(1+e)/w);
  rule('e',['Gs','w','S'],'Gs × w / S',(g,w,s)=>s===0?NaN:g*w/s);
  rule('S',['Gs','w','e'],'Gs × w / e',(g,w,e)=>e===0?NaN:g*w/e);
  rule('w',['S','e','Gs'],'S × e / Gs',(s,e,g)=>s*e/g);
  rule('Gs',['S','e','w'],'S × e / w',(s,e,w)=>w===0?NaN:s*e/w);
  rule('gamma',['Gs','gammaw','w','e'],'Gs × gammaw × (1 + w) / (1 + e)',(g,gw,w,e)=>g*gw*(1+w)/(1+e));
  rule('gammasat',['Gs','e','gammaw'],'(Gs + e) × gammaw / (1 + e)',(g,e,w)=>(g+e)*w/(1+e));
  rule('gammasub',['gammasat','gammaw'],'gammasat − gammaw',(g,w)=>g-w);
  rule('gammasat',['gammasub','gammaw'],'gammasub + gammaw',(g,w)=>g+w);
  const fmt = value => Number(value.toPrecision(6)).toLocaleString('es-MX',{maximumSignificantDigits:6});
  const unit = (key,system) => ({weight:system==='SI'?'kN':'gf',volume:system==='SI'?'m³':'cm³',density:system==='SI'?'kN/m³':'gf/cm³',percent:'%',ratio:'—'})[byKey[key].type];
  const display = (key,value) => fmt(byKey[key].type==='percent'?value*100:value);
  function expressionText(expression, values) {
    return expression.replace(/[A-Za-z]+/g,key=>values ? `(${fmt(values[key])})` : byKey[key].symbol);
  }
  function validate(key,value) {
    if (!Number.isFinite(value)) return 'debe ser un número finito';
    if (value<0 && key!=='gammasub') return 'no puede ser negativo';
    if (['W','Ws','V','Vs','Gs','gamma','gammad','gammasat','gammaw'].includes(key) && value<=0) return 'debe ser mayor que cero';
    if (['n','S'].includes(key) && value>1) return 'no puede superar el 100 %';
    if (key==='n' && value===1) return 'debe ser menor que el 100 % para un suelo con sólidos';
    return '';
  }
  function solve(input,gammaw=9.81) {
    const values = {...input,gammaw}, steps=[], errors=[], warnings=[];
    for (const [key,val] of Object.entries(values)) {
      if (!byKey[key]) { errors.push(`Variable desconocida: ${key}`); continue; }
      const error=validate(key,val); if(error) errors.push(`${byKey[key].symbol}: ${error}.`);
    }
    if(errors.length) return {values,steps,errors,warnings,inputKeys:Object.keys(input)};
    for(let pass=0;pass<60;pass++) {
      let changed=false;
      for(const r of rules) {
        if(Object.hasOwn(values,r.out) || !r.deps.every(k=>Object.hasOwn(values,k))) continue;
        let value=r.calculate(...r.deps.map(k=>values[k]));
        if(!Number.isFinite(value)) continue;
        if(value<0 && value>-1e-12) value=0;
        values[r.out]=value;
        steps.push({key:r.out,expression:r.expression,formula:`${byKey[r.out].symbol} = ${expressionText(r.expression)}`,substitution:expressionText(r.expression,values),value});
        changed=true;
      }
      if(!changed) break;
    }
    for(const [key,val] of Object.entries(values)) {
      const error=validate(key,val); if(error) errors.push(`${byKey[key].symbol} calculado: ${error}. Revisa los datos.`);
    }
    const conflicts=new Set();
    for(const r of rules) {
      if(!Object.hasOwn(values,r.out) || !r.deps.every(k=>Object.hasOwn(values,k))) continue;
      const expected=r.calculate(...r.deps.map(k=>values[k]));
      if(Number.isFinite(expected) && Math.abs(expected-values[r.out])>1e-5*Math.max(1e-9,Math.abs(expected),Math.abs(values[r.out]))) {
        const signature=[r.out,...r.deps].sort().join(',');
        if(!conflicts.has(signature)) errors.push(`Datos incompatibles: ${byKey[r.out].symbol} = ${expressionText(r.expression)} no se cumple con los valores ingresados.`);
        conflicts.add(signature);
      }
    }
    if(values.Gs!==undefined && (values.Gs<2 || values.Gs>3.5)) warnings.push('Gs está fuera del intervalo típico de 2 a 3.5. Verifica el material y las unidades.');
    const missing=variables.filter(v=>!Object.hasOwn(values,v.key));
    if(missing.length) warnings.push(`Cálculo parcial. Faltan datos independientes para obtener: ${missing.map(v=>v.symbol).join(', ')}.`);
    return {values,steps,errors:[...new Set(errors)],warnings,inputKeys:Object.keys(input)};
  }
  function classify(values) {
    const lines=[];
    if(values.S!==undefined) lines.push(`Saturación: ${display('S',values.S)} %. ${values.S>=0.995?'Suelo saturado':values.S>=0.85?'Suelo casi saturado':values.S>=0.5?'Suelo parcialmente saturado':'Suelo con bajo grado de saturación'}.`);
    if(values.e!==undefined) lines.push(`Relación de vacíos: ${fmt(values.e)}. La interpretación de la compacidad depende del tipo de suelo y de sus valores de referencia.`);
    return lines;
  }
  root.Soil={variables,byKey,fmt,unit,display,solve,classify,validate};
})(globalThis);
