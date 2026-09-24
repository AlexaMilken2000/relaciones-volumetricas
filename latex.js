/* Reporte LaTeX independiente: gráfico vectorial TikZ y fórmulas matemáticas. */
(function(root) {
  'use strict';
  const symbols={W:'W',Ws:'W_s',Ww:'W_w',V:'V',Vs:'V_s',Vv:'V_v',Vw:'V_w',Va:'V_a',Gs:'G_s',w:'\\omega',e:'e',n:'n',S:'S',gamma:'\\gamma',gammad:'\\gamma_d',gammasat:'\\gamma_{sat}',gammasub:"\\gamma'",gammaw:'\\gamma_w'};
  const escapes={'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','%':'\\%','_':'\\_','~':'\\textasciitilde{}','^':'\\textasciicircum{}','³':'\\textsuperscript{3}','²':'\\textsuperscript{2}','—':'---','–':'--','−':'-','γ':'\\ensuremath{\\gamma}','ω':'\\ensuremath{\\omega}','′':"'",'×':'\\ensuremath{\\times}','≈':'\\ensuremath{\\approx}','≤':'\\ensuremath{\\leq}','≥':'\\ensuremath{\\geq}'};
  function text(value) {return Array.from(String(value)).map(c=>escapes[c] || (/\s/.test(c)?' ':c.codePointAt(0)<256&&c.codePointAt(0)>=32?c:'?')).join('');}
  function number(value) {
    if(!Number.isFinite(value)) throw new Error('El reporte contiene un valor no finito.');
    const parts=Number(value.toPrecision(6)).toString().split('e');
    return parts.length===1?parts[0]:`${parts[0]} \\times 10^{${Number(parts[1])}}`;
  }
  // Las expresiones provienen exclusivamente de las reglas del motor; nunca se evalúa código.
  function expression(source,values) {
    const tokens=source.match(/[A-Za-z]+|\d+(?:\.\d+)?|[()+−×/]/g)||[];
    if(tokens.join('')!==source.replace(/\s/g,'')) throw new Error('Expresión no válida.');
    let index=0;
    function atom(){
      const token=tokens[index++];
      if(token==='('){const result=add();if(tokens[index++]!==')')throw new Error('Paréntesis incompletos.');return result;}
      if(Object.hasOwn(symbols,token))return {kind:'leaf',value:values?number(values[token]):symbols[token]};
      if(/^\d+(\.\d+)?$/.test(token))return {kind:'leaf',value:token};
      throw new Error('Símbolo no válido en la fórmula.');
    }
    function product(){let left=atom();while(['×','/'].includes(tokens[index])){const op=tokens[index++];left={op,left,right:atom()};}return left;}
    function add(){let left=product();while(['+','−'].includes(tokens[index])){const op=tokens[index++];left={op,left,right:product()};}return left;}
    function render(node,parent=0){
      if(node.kind==='leaf')return node.value.startsWith('-')?`\\left(${node.value}\\right)`:node.value;
      if(node.op==='/')return `\\frac{${render(node.left)}}{${render(node.right)}}`;
      const precedence=node.op==='×'?2:1;
      const output=`${render(node.left,precedence)} ${node.op==='×'?'\\cdot':node.op==='−'?'-':'+'} ${render(node.right,precedence+(node.op==='−'?1:0))}`;
      return precedence<parent?`\\left(${output}\\right)`:output;
    }
    const tree=add();if(index!==tokens.length)throw new Error('Fórmula incompleta.');return render(tree);
  }
  function unit(key,system){const raw=root.Soil.unit(key,system);return raw==='—'?'':`\\,\\text{${text(raw)}}`;}
  function resultValue(key,val,system){return number(root.Soil.byKey[key].type==='percent'?val*100:val)+unit(key,system);}
  function table(keys,report,origin=false) {
    const header=`Variable & Símbolo & Valor${origin?' & Origen':''} \\\\`;
    return [String.raw`\begin{longtable}{@{}p{${origin?'5.0':'6.5'}cm}cl${origin?'l':''}@{}}`,String.raw`\toprule`,header,String.raw`\midrule\endfirsthead`,String.raw`\toprule`,header,String.raw`\midrule\endhead`,String.raw`\bottomrule\endfoot`,...keys.map(key=>`${text(root.Soil.byKey[key].label)} & $${symbols[key]}$ & $${resultValue(key,report.values[key],report.system)}$${origin?` & ${key==='gammaw'?'Referencia':report.inputKeys.includes(key)?'Dato':'Calculado'}`:''} \\\\`),String.raw`\end{longtable}`].join('\n');
  }
  function diagram(report) {
    const v=report.values;
    if(!['V','Vs','Vw','Va'].every(k=>Number.isFinite(v[k]))||v.V<=0)return 'Faltan volúmenes para representar las fases a escala. Los resultados disponibles se incluyen en la tabla.';
    const hs=5*v.Vs/v.V,hw=5*v.Vw/v.V,ha=5*v.Va/v.V;
    const pos=x=>x.toFixed(6);
    const lines=[String.raw`\begin{center}\begin{tikzpicture}[x=1cm,y=1cm,font=\small]`,String.raw`\node[font=\bfseries,text=accent] at (2,6.1) {VOLUMEN};`,String.raw`\node[font=\bfseries,text=accent] at (7.7,6.1) {PESO};`];
    // Solo escribir dentro de una fase cuando caben la letra y sus márgenes.
    function phase(x,width,y,h,color,label){if(h<=0)return;lines.push(`\\filldraw[fill=${color},draw=white] (${x},${pos(y)}) rectangle (${x+width},${pos(y+h)});`);if(h>0.65)lines.push(`\\node[inner sep=3pt,text=${color==='air'?'black':'white'},font=\\bfseries] at (${x+width/2},${pos(y+h/2)}) {${label}};`);}
    phase(0,4,0,hs,'solid','SÓLIDOS');phase(0,4,hs,hw,'water','AGUA');phase(0,4,hs+hw,ha,'air','AIRE');
    if(hw+ha>0){lines.push(`\\draw[<->,red!65!black] (-0.4,${pos(hs)}) -- (-0.4,5);`);lines.push(`\\node[anchor=east,align=right,fill=white,inner sep=3pt,text=red!65!black] at (-1.05,${pos((hs+5)/2)}) {$V_v$\\\\[3pt]$${number(v.Vw+v.Va)}$};`);}
    lines.push(String.raw`\draw[<->] (4.4,0) -- (4.4,5);\node[anchor=west,fill=white,inner sep=3pt] at (4.85,2.5) {$V$};`);
    lines.push(`\\node at (2,-0.75) {$V = ${resultValue('V',v.V,report.system)}$};`);
    if(Number.isFinite(v.Ws)&&Number.isFinite(v.Ww)&&v.Ws+v.Ww>0){const total=v.Ws+v.Ww,solid=5*v.Ws/total;phase(6.5,2.4,0,solid,'weight','$W_s$');phase(6.5,2.4,solid,5-solid,'water','$W_w$');lines.push(String.raw`\node[fill=white,inner sep=3pt] at (7.7,5.55) {$W_a=0$};`);lines.push(`\\node at (7.7,-0.75) {$W=${resultValue('W',total,report.system)}$};`);}else lines.push(String.raw`\node at (7.7,2.5) {Faltan pesos};`);
    lines.push(String.raw`\end{tikzpicture}\end{center}`);
    lines.push(`\\noindent\\small Sólidos: $${resultValue('Vs',v.Vs,report.system)}$; agua: $${resultValue('Vw',v.Vw,report.system)}$; aire: $${resultValue('Va',v.Va,report.system)}$.\\par\\normalsize`);
    return lines.join('\n');
  }
  function build(report) {
    const {values,steps,inputKeys,system}=report;
    const keys=root.Soil.variables.filter(v=>Object.hasOwn(values,v.key)).map(v=>v.key);
    const date=new Date(report.date||Date.now());
    const content=[String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage[margin=2cm]{geometry}
\usepackage{amsmath,amssymb,booktabs,longtable,array,xcolor,tikz,fancyhdr}
\usepackage[unicode,hidelinks]{hyperref}
\definecolor{accent}{HTML}{14655D}
\definecolor{solid}{HTML}{AD744B}
\definecolor{water}{HTML}{3A829B}
\definecolor{air}{HTML}{D6E2DD}
\definecolor{weight}{HTML}{B08843}
\pagestyle{fancy}\fancyhf{}
\fancyhead[L]{\small Relaciones volumétricas}
\fancyhead[R]{\small Mecánica de suelos}
\fancyfoot[C]{\thepage}
\setlength{\headheight}{14pt}
\setlength{\parindent}{0pt}
\setlength{\emergencystretch}{2em}
\renewcommand{\arraystretch}{1.35}
% Reserva espacio antes de un bloque usando solo comandos de LaTeX.
\newcommand{\reservarespacio}[1]{%
  \par
  \ifdim\dimexpr\pagegoal-\pagetotal\relax<#1\relax
    \newpage
  \fi
}
\begin{document}
{\LARGE\bfseries\color{accent} Relaciones volumétricas\par}
\medskip
{\large Diagrama de fases e informe de cálculo\par}`];
    if(report.project)content.push(`\\medskip\\textbf{${text(report.project)}}\\par`);
    content.push(`\\medskip ${text(date.toLocaleString('es-MX'))} \\quad Sistema ${system} \\quad $\\gamma_w=${resultValue('gammaw',values.gammaw,system)}$\\par`);
    if(report.warnings?.length)content.push(String.raw`\section*{Observaciones}`,String.raw`\begin{itemize}`,...report.warnings.map(w=>`\\item ${text(w)}`),String.raw`\end{itemize}`);
    content.push(String.raw`\section{Datos de entrada}`,table(inputKeys,report));
    content.push(String.raw`\reservarespacio{9cm}`,String.raw`\section{Diagrama de fases del suelo}`,diagram(report));
    content.push(String.raw`\section{Resultados}`,table(keys,report,true));
    content.push(String.raw`\section{Desarrollo paso a paso}`,String.raw`Las sustituciones usan $\omega$, $n$ y $S$ como fracciones decimales. Sus resultados finales se expresan en porcentaje. Se muestran seis cifras significativas; los cálculos conservan la precisión interna.`);
    if(!steps.length)content.push('No se obtuvieron variables adicionales. Agrega datos independientes para ampliar el cálculo.');
    steps.forEach((step,i)=>{
      content.push(String.raw`\reservarespacio{4.5cm}`,`\\subsection*{Paso ${i+1}: ${text(root.Soil.byKey[step.key].label)}}`);
      content.push(`\\[${symbols[step.key]} = ${expression(step.expression)}\\]`);
      content.push(`\\[${symbols[step.key]} = ${expression(step.expression,values)} = ${number(step.value)}\\]`);
      content.push(`\\noindent\\textbf{Resultado:} $\\boxed{${symbols[step.key]} = ${resultValue(step.key,step.value,system)}}$\\par`);
    });
    content.push(String.raw`\section{Interpretación}`,...root.Soil.classify(values).map(line=>`${text(line)}\\par`));
    content.push(String.raw`\section{Fórmulas de referencia}
\begin{align*}
W &= W_s+W_w & V &= V_s+V_v & V_v &= V_w+V_a \\
\omega &= \frac{W_w}{W_s} & e &= \frac{V_v}{V_s} & n &= \frac{e}{1+e} \\
S &= \frac{V_w}{V_v} & G_s\omega &= Se & G_s &= \frac{W_s}{V_s\gamma_w}
\end{align*}
\[\gamma=\frac{W}{V}=\frac{G_s\gamma_w(1+\omega)}{1+e},\qquad
\gamma_d=\frac{W_s}{V}=\frac{G_s\gamma_w}{1+e}\]
\[\gamma_{sat}=\frac{(G_s+e)\gamma_w}{1+e},\qquad \gamma'=\gamma_{sat}-\gamma_w\]
\bigskip\hrule\medskip
{\small Relaciones volumétricas}
\end{document}`);
    return content.join('\n');
  }
  root.SoilLatex={build,expression,text,number};
})(globalThis);
