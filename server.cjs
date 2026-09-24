'use strict';
// Servidor local sin dependencias npm. Requiere Node.js y una instalación de LaTeX.
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {execFile,spawnSync}=require('node:child_process');
const {promisify}=require('node:util');
require('./soil.js');
require('./latex.js');
const run=promisify(execFile);
const PORT=Number(process.env.PORT||8080);
const HOST=process.env.HOST||'127.0.0.1';
const STATIC={'/':'index.html','/index.html':'index.html','/relaciones-volumetricas.html':'relaciones-volumetricas.html','/styles.css':'styles.css','/soil.js':'soil.js','/latex.js':'latex.js','/app.js':'app.js'};
let cachedCompiler;

function findCompiler() {
  if(cachedCompiler)return cachedCompiler;
  const candidates=[process.env.SOIL_PDFLATEX,'pdflatex'];
  if(process.platform==='win32') {
    for(const base of [path.join(process.env.LOCALAPPDATA||'','Programs'),process.env.ProgramFiles||'C:\\Program Files']) {
      candidates.push(path.join(base,'MiKTeX','miktex','bin','x64','pdflatex.exe'));
    }
  }
  for(const candidate of candidates.filter(Boolean)) {
    const check=spawnSync(candidate,['--version'],{encoding:'utf8',timeout:10000,windowsHide:true});
    if(check.status===0){cachedCompiler={file:candidate,miktex:/miktex/i.test(check.stdout)};return cachedCompiler;}
  }
  throw Object.assign(new Error('No se encontró pdflatex. Instala MiKTeX o TeX Live y reinicia el servidor. También puedes indicar la ruta en SOIL_PDFLATEX.'),{status:503});
}

function buildReport(payload) {
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Solicitud no válida.');
  const {input,gammaw,system,project=''}=payload;
  if(!input||typeof input!=='object'||Array.isArray(input)||!Object.keys(input).length)throw new Error('Ingresa los datos conocidos de la muestra.');
  if(!['SI','CGS'].includes(system))throw new Error('Sistema de unidades no válido.');
  if(typeof project!=='string'||project.length>120)throw new Error('El nombre debe contener como máximo 120 caracteres.');
  if(typeof gammaw!=='number'||!Number.isFinite(gammaw)||gammaw<=0)throw new Error('El peso específico del agua debe ser positivo.');
  for(const [key,value] of Object.entries(input)) {
    if(!Object.hasOwn(Soil.byKey,key)||key==='gammaw'||typeof value!=='number'||!Number.isFinite(value))throw new Error('Los datos contienen una variable o un valor no válido.');
  }
  // Se recalcula desde los datos originales; no se aceptan fórmulas ni LaTeX del cliente.
  const result=Soil.solve(input,gammaw);
  if(result.errors.length)throw new Error(result.errors.join('\n'));
  return {...result,system,project,date:new Date()};
}

async function compilePdf(tex) {
  const compiler=findCompiler();
  const tempRoot=await fs.realpath(os.tmpdir());
  const dir=await fs.mkdtemp(path.join(tempRoot,'soil-latex-'));
  try {
    await fs.writeFile(path.join(dir,'informe.tex'),tex,'utf8');
    const args=['-no-shell-escape','-interaction=nonstopmode','-halt-on-error','-file-line-error'];
    if(compiler.miktex)args.push('--disable-installer');
    args.push('informe.tex');
    for(let pass=0;pass<2;pass++) {
      try {
        await run(compiler.file,args,{cwd:dir,timeout:90000,maxBuffer:2*1024*1024,windowsHide:true,env:{...process.env,openin_any:'p',openout_any:'p',TEXMFOUTPUT:dir}});
      } catch(error) {
        const output=String(error.stdout||'')+'\n'+String(error.stderr||'');
        const useful=output.split(/\r?\n/).filter(line=>/^!|^informe\.tex:|not found|Emergency stop/i.test(line)).slice(0,5).join('\n');
        const reason=error.killed?'La compilación excedió el tiempo permitido.':useful||'Revisa la instalación y los paquetes de LaTeX.';
        throw Object.assign(new Error(`No se pudo compilar el PDF. ${reason} Si falta un paquete, instálalo desde MiKTeX Console o TeX Live y vuelve a exportar. Puedes descargar el archivo .tex desde la página.`),{status:422});
      }
    }
    const pdf=await fs.readFile(path.join(dir,'informe.pdf'));
    if(pdf.subarray(0,5).toString()!=='%PDF-')throw new Error('El compilador no produjo un PDF válido.');
    return pdf;
  } finally {
    const resolved=path.resolve(dir);
    if(path.dirname(resolved)===tempRoot&&path.basename(resolved).startsWith('soil-latex-'))await fs.rm(resolved,{recursive:true,force:true});
  }
}

function createServer({compile=compilePdf,publicOrigin=process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL||''}={}) {
  let publicUrl=null;
  if(publicOrigin){
    publicUrl=new URL(publicOrigin);
    if(!['http:','https:'].includes(publicUrl.protocol)||publicUrl.username||publicUrl.password||publicUrl.pathname!=='/'||publicUrl.search||publicUrl.hash)throw new Error('PUBLIC_ORIGIN debe ser la dirección base de la web, por ejemplo https://suelos.example.com');
  }
  let running=0;
  return http.createServer(async(req,res)=>{
    const host=req.headers.host||'';
    const localHost=/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
    if(!localHost&&host!==publicUrl?.host){res.writeHead(403);res.end();return;}
    const origin=req.headers.origin;
    // El origen null permite el HTML independiente abierto desde file://.
    const allowed=!origin||(localHost&&(origin==='null'||origin===`http://${host}`))||(publicUrl&&origin===publicUrl.origin);
    if(!allowed){res.writeHead(403);res.end();return;}
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','SAMEORIGIN');
    res.setHeader('Cache-Control','no-store');
    function json(status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));}
    const url=new URL(req.url,`http://${host}`).pathname;
    if(req.method==='OPTIONS') {
      res.writeHead(204,{'Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});res.end();return;
    }
    if(req.method==='GET'&&url==='/api/health') {
      try{findCompiler();json(200,{ready:true});}catch(error){json(200,{ready:false,message:error.message});}return;
    }
    if(req.method==='POST'&&url==='/api/pdf') {
      if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){json(415,{error:'Se requiere application/json.'});return;}
      if(running>=2){json(429,{error:'Se están compilando otros reportes. Vuelve a intentar en un momento.'});return;}
      running++;
      try {
        let size=0;const chunks=[];
        for await(const chunk of req){size+=chunk.length;if(size>32768){json(413,{error:'Solicitud demasiado grande.'});return;}chunks.push(chunk);}
        let report;
        try{report=buildReport(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(error){json(400,{error:error.message});return;}
        const pdf=await compile(SoilLatex.build(report));
        res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="relaciones-volumetricas.pdf"','Content-Length':pdf.length});res.end(pdf);
      } catch(error) {json(error.status||500,{error:error.status?error.message:'No se pudo generar el reporte. Revisa la consola del servidor.'});if(!error.status)console.error(error);}
      finally {running--;}
      return;
    }
    if(req.method==='GET'&&Object.hasOwn(STATIC,url)) {
      try{const file=STATIC[url],data=await fs.readFile(path.join(__dirname,file));const type=file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html';res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`});res.end(data);}catch{json(404,{error:'Archivo no encontrado.'});}return;
    }
    json(404,{error:'Ruta no encontrada.'});
  });
}

if(require.main===module) {
  const server=createServer();
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`El puerto ${PORT} está ocupado. Cierra el servidor anterior o cambia PORT.`:error.message);process.exitCode=1;});
  server.listen(PORT,HOST,()=>{
    console.log(`Abre ${process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL||`http://127.0.0.1:${PORT}`} en tu navegador.\nPulsa Ctrl+C para detener el servidor.`);
    try{findCompiler();console.log('LaTeX disponible: listo para exportar PDF.');}catch(error){console.log(error.message);}
  });
}
module.exports={createServer,buildReport,compilePdf,findCompiler};
