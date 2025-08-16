/* Version 1.12 (2025-08-17)
   - Pointer Events all across; touch-action:none on board
   - Reworked problem generators:
     * Integers: [-15,15]\{0}, division always exact
     * Poly add/sub: deg 1 or 2, coeffs in [-9,9]\{0}
     * Poly mul: both factors deg<=1; coeffs in [-9,9]\{0}; |coef(result)|<=36
     * Poly div: divisor s x + t (s!=0); quotient either ax+b OR k; choose
                 s,t,a,b,k from [-20,20]\{0}; dividend=divisor*quotient;
                 keep only when all |dividend coefs|<=20; verify equality
   - Unified formatter: problem uses [ ... ], solution no [ ]
   - Fixed missing closing parens cases for (-bx), (-c)
   - Mul/Div workspace text uses the same formatter
   - Input cell widths mobile-safe
*/

///////////////////// DOM /////////////////////
const board = document.getElementById('board');
const palette = document.getElementById('palette');

const solutionBox = document.getElementById('solution');
const problemBox = document.getElementById('problem');
const answerInput = document.getElementById('answerInput');
const checkBtn = document.getElementById('btn-check');
const checkResult = document.getElementById('checkResult');

const wsSolve = document.getElementById('ws-solve');
const wsMul   = document.getElementById('ws-mul');
const wsDiv   = document.getElementById('ws-div');
const mulMult = document.getElementById('mul-mult');
const mulMcand= document.getElementById('mul-mcand');
const divDivisor = document.getElementById('div-divisor');
const divQuot    = document.getElementById('div-quot');

// stop pointer-start bubbling for inputs
['pointerdown'].forEach(evt=>{
  if(divQuot){ divQuot.addEventListener(evt, e=>e.stopPropagation()); }
  if(answerInput){ answerInput.addEventListener(evt, e=>e.stopPropagation()); }
});

///////////////////// Tiles settings /////////////////////
const TYPES = {
  x2:      {labelHTML:'x<sup>2</sup>',   w:120, h:120, color:'var(--blue)',   shape:'square', neg:'neg_x2'},
  neg_x2:  {labelHTML:'-x<sup>2</sup>',  w:120, h:120, color:'var(--red)',    shape:'square', neg:'x2'},
  x:       {labelHTML:'x',               w:30,  h:120, color:'var(--green)',  shape:'rectV',  neg:'neg_x'}, // เริ่มเป็นแนวตั้ง
  neg_x:   {labelHTML:'-x',              w:30,  h:120, color:'var(--red)',    shape:'rectV',  neg:'x'},
  one:     {labelHTML:'1',               w:30,  h:30,  color:'var(--yellow)', shape:'mini',   neg:'neg_one'},
  neg_one: {labelHTML:'-1',              w:30,  h:30,  color:'var(--red)',    shape:'mini',   neg:'one'}
};

let tiles = [];     // {id,type,x,y,w,h}
let selection = new Set();
let dragging = null; // {ids,offsets[]}
let selRect = null;
let zoom = 1;
let showSol = false;
let mode = document.getElementById('mode').value;

let problemText = '';
let problemAnswer = '';
let answerCoef = {a2:0,a1:0,a0:0}; // สำหรับตรวจพหุนาม/จำนวนเต็ม

///////////////////// Utils /////////////////////
const uid = ()=> Math.random().toString(36).slice(2);
const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));

const rint = (a,b)=> Math.floor(Math.random()*(b-a+1))+a;
const randNZ = (min,max)=>{
  let v=0; while(v===0){ v = rint(min,max); }
  return v;
};

// pointer coords to board space
function pxy(e){
  const rect = board.getBoundingClientRect();
  return { x:(e.clientX-rect.left)/zoom, y:(e.clientY-rect.top)/zoom };
}

function overlaps(x,y,w,h,t){
  return !(x+w < t.x || x > t.x+t.w || y+h < t.y || y > t.y+t.h);
}
function freeSpot(w,h){
  const margin=20, startX=260,startY=140, step=22, limitX=2400,limitY=1600;
  let x=startX,y=startY, tries=0;
  while(tries<3000){
    const clash = tiles.some(t=>overlaps(x,y,w,h,t));
    if(!clash) return {x,y};
    x+=step; if(x+w+margin>limitX){ x=startX; y+=step; if(y+h+margin>limitY){ y=startY; } }
    tries++;
  }
  return {x:startX,y:startY};
}

///////////////////// Rendering /////////////////////
function render(){
  // draw tiles
  board.querySelectorAll('.tile').forEach(el=>el.remove());
  tiles.forEach(t=>{
    const el = document.createElement('div');
    el.className = 'tile' + (selection.has(t.id)?' selected':'');
    el.style.background = TYPES[t.type].color;
    el.style.left = t.x+'px'; el.style.top=t.y+'px';
    el.style.width=t.w+'px'; el.style.height=t.h+'px';
    const showLabel = true;
    el.innerHTML = showLabel? `<span>${TYPES[t.type].labelHTML}</span>`:'';

    // pointer events
    const onDown = (e)=>{
      e.preventDefault(); e.stopPropagation();
      if(!selection.has(t.id)){ selection = new Set([t.id]); }
      const ids = Array.from(selection);
      const p = pxy(e);
      const offsets = ids.map(id=>{
        const k = tiles.find(x=>x.id===id);
        return {id, dx:p.x-k.x, dy:p.y-k.y};
      });
      dragging = {ids, offsets};
    };
    el.addEventListener('pointerdown', onDown);
    board.appendChild(el);
  });

  // selection rect
  const oldSel = board.querySelector('.sel-rect'); if(oldSel) oldSel.remove();
  if(selRect){
    const r = document.createElement('div');
    r.className='sel-rect';
    const x = Math.min(selRect.x0, selRect.x1);
    const y = Math.min(selRect.y0, selRect.y1);
    const w = Math.abs(selRect.x1 - selRect.x0);
    const h = Math.abs(selRect.y1 - selRect.y0);
    r.style.left=x+'px'; r.style.top=y+'px'; r.style.width=w+'px'; r.style.height=h+'px';
    board.appendChild(r);
  }

  board.style.transform = `scale(${zoom})`;
  problemBox.innerHTML = problemText;
  solutionBox.innerHTML = showSol ? `<b>เฉลย:</b> ${problemAnswer}` : '';
}

///////////////////// Palette /////////////////////
palette.querySelectorAll('.pal-item').forEach(el=>{
  const addTile = ()=>{
    const type = el.dataset.type;
    const tdef = TYPES[type];
    const id = uid();
    const start = freeSpot(tdef.w,tdef.h);
    tiles.push({id, type, x:start.x,y:start.y, w:tdef.w,h:tdef.h});
    selection = new Set([id]);
    render();
  };
  el.addEventListener('pointerdown', (e)=>{ e.preventDefault(); addTile(); });
});

///////////////////// Board pointer interactions /////////////////////
board.addEventListener('pointerdown', (e)=>{
  if(e.button!==0) return;
  const p = pxy(e);
  const hit = tiles.slice().reverse().find(t=> p.x>=t.x && p.x<=t.x+t.w && p.y>=t.y && p.y<=t.y+t.h);
  if(hit){
    selection = new Set([hit.id]);
    const ids = Array.from(selection);
    const offsets = ids.map(id=>{
      const k = tiles.find(x=>x.id===id);
      return {id, dx:p.x-k.x, dy:p.y-k.y};
    });
    dragging = {ids, offsets};
  }else{
    selection.clear();
    selRect = {x0:p.x,y0:p.y,x1:p.x,y1:p.y};
  }
  render();
});
window.addEventListener('pointermove', (e)=>{
  if(dragging){
    e.preventDefault();
    const p = pxy(e);
    tiles = tiles.map(t=>{
      const off = dragging.offsets.find(o=>o.id===t.id);
      if(!off) return t;
      return {...t, x:p.x-off.dx, y:p.y-off.dy};
    });
    render();
  }else if(selRect){
    e.preventDefault();
    const p = pxy(e); selRect.x1=p.x; selRect.y1=p.y; render();
  }
},{passive:false});
window.addEventListener('pointerup', ()=>{
  if(dragging) dragging=null;
  if(selRect){
    const {x0,y0,x1,y1} = selRect;
    const minx=Math.min(x0,x1),maxx=Math.max(x0,x1),miny=Math.min(y0,y1),maxy=Math.max(y0,y1);
    selection = new Set(tiles.filter(t=> t.x>=minx && t.y>=miny && (t.x+t.w)<=maxx && (t.y+t.h)<=maxy).map(t=>t.id));
    selRect=null; render();
  }
});

///////////////////// Toolbar actions /////////////////////
document.getElementById('btn-reset').onclick = ()=>{ tiles=[]; selection.clear(); zoom=1; render(); };
document.getElementById('btn-delete').onclick = ()=>{ tiles = tiles.filter(t=>!selection.has(t.id)); selection.clear(); render(); };
document.getElementById('btn-flip').onclick   = ()=>{ tiles = tiles.map(t=> selection.has(t.id) ? ({...t, type:TYPES[t.type].neg}) : t); render(); };
document.getElementById('btn-zero').onclick   = ()=>{
  const idsByType = (type)=> tiles.filter(t=>selection.has(t.id) && t.type===type).map(t=>t.id);
  ['x2','x','one'].forEach(base=>{
    const pos = idsByType(base), neg = idsByType(TYPES[base].neg);
    const n = Math.min(pos.length, neg.length);
    const kill = new Set([...pos.slice(0,n), ...neg.slice(0,n)]);
    tiles = tiles.filter(t=> !kill.has(t.id));
  });
  selection.clear(); render();
};
document.getElementById('btn-rotate').onclick = ()=>{
  tiles = tiles.map(t=>{
    if(!selection.has(t.id)) return t;
    // toggle แนวตั้ง/แนวนอนสำหรับชิ้น x
    if(TYPES[t.type].shape==='rectV'){
      return {...t, w:t.h, h:t.w};
    }
    return {...t, w:t.h, h:t.w};
  }); render();
};
document.getElementById('btn-duplicate').onclick = ()=>{
  const selectedTiles = tiles.filter(t=> selection.has(t.id));
  const clones = selectedTiles.map((t,i)=>{
    const dx = 20*(i+1), dy = 20*(i+1);
    return {...t, id:uid(), x:t.x+dx, y:t.y+dy};
  });
  tiles = [...tiles, ...clones];
  // เลือกเฉพาะตัวใหม่ (แก้ปัญหาลากติดตัวเดิม)
  selection = new Set(clones.map(c=>c.id));
  render();
};
document.getElementById('btn-zoom-in').onclick  = ()=>{ zoom = clamp(zoom*1.25, .5, 2.2); render(); };
document.getElementById('btn-zoom-out').onclick = ()=>{ zoom = clamp(zoom*0.8,  .5, 2.2); render(); };

// popup
const help = document.getElementById('help');
document.getElementById('btn-help').onclick   = ()=> help.style.display='flex';
document.getElementById('help-x').onclick     = ()=> help.style.display='none';

///////////////////// Mode & Examples /////////////////////
document.getElementById('mode').onchange = (e)=>{ mode = e.target.value; newExample(); };
document.getElementById('btn-new').onclick = ()=> newExample();
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};

///////////////////// Formatter /////////////////////
// สร้างสตริงพหุนามตามกฎวงเล็บ
function fmtX2(a, isLead){
  if(a===1)  return 'x<sup>2</sup>';
  if(a===-1) return '-x<sup>2</sup>';
  return `${a}x<sup>2</sup>`;
}
function fmtX(b, deg){
  if(b===1)  return 'x';
  if(b===-1) return (deg===1 ? '-x' : '(-x)');
  if(b<0)    return (deg===2 ? `(${b}x)` : `${b}x`);
  return `${b}x`;
}
function fmtC(c, deg){
  if(c<0) return `(${c})`;
  return `${c}`;
}
// รับ coef -> html (problem=true ใส่ [ ])
function polyToHTML({a2=0,a1=0,a0=0}, problemWrap=true){
  const deg = a2!==0 ? 2 : 1;
  let out = '';
  if(deg===2){
    const t2 = fmtX2(a2, true);
    const t1 = a1 ? ' + ' + fmtX(a1,2) : '';
    const t0 = a0 ? ' + ' + fmtC(a0,2) : '';
    out = `${t2}${t1}${t0}`.replace(/\+ \(\-/g, '+ (-');
  }else{
    const t1 = fmtX(a1,1);
    const t0 = a0 ? ' + ' + fmtC(a0,1) : '';
    out = `${t1}${t0}`.replace(/\+ \(\-/g, '+ (-');
  }
  return problemWrap ? `[${out}]` : out;
}

// แปลงเป็น plain สำหรับตรวจ
function polyToPlain(c){ return polyToHTML(c,false).replace(/<sup>2<\/sup>/g,'^2'); }

///////////////////// Algebra helpers /////////////////////
const addCoef = (A,B)=>({a2:A.a2+B.a2, a1:A.a1+B.a1, a0:A.a0+B.a0});
function mulCoef(A,B){
  const res = {a2:0,a1:0,a0:0};
  [[2,A.a2],[1,A.a1],[0,A.a0]].forEach(([pa,ka])=>{
    [[2,B.a2],[1,B.a1],[0,B.a0]].forEach(([pb,kb])=>{
      const pow=pa+pb, k=ka*kb;
      if(pow===2) res.a2+=k; else if(pow===1) res.a1+=k; else res.a0+=k;
    });
  });
  return res;
}

///////////////////// Random builders /////////////////////
function buildPolyDeg12(rangeMin, rangeMax){ // random deg 1 or 2
  const deg = Math.random()<.5 ? 2 : 1;
  if(deg===2){
    const a=randNZ(rangeMin,rangeMax), b=randNZ(rangeMin,rangeMax), c=randNZ(rangeMin,rangeMax);
    return {coef:{a2:a,a1:b,a0:c}, html:polyToHTML({a2:a,a1:b,a0:c},true)};
  }else{
    const b=randNZ(rangeMin,rangeMax), c=randNZ(rangeMin,rangeMax);
    return {coef:{a2:0,a1:b,a0:c}, html:polyToHTML({a2:0,a1:b,a0:c},true)};
  }
}

function buildLinear(rangeMin, rangeMax){
  const a=randNZ(rangeMin,rangeMax), b=randNZ(rangeMin,rangeMax);
  return {coef:{a2:0,a1:a,a0:b}, html:polyToHTML({a2:0,a1:a,a0:b},true)};
}

function buildMulLinear(){ // both deg<=1, [-9,9]\{0}, cap |coef|<=36
  while(true){
    const A = buildLinear(-9,9).coef;
    const B = buildLinear(-9,9).coef;
    const P = mulCoef(A,B);
    if(Math.max(Math.abs(P.a2),Math.abs(P.a1),Math.abs(P.a0))<=36){
      return {A,B,P};
    }
  }
}

function buildDivExact(){ // divisor s x + t, quotient ax+b OR k; params in [-20,20]\{0}
  while(true){
    const s = randNZ(-20,20), t = randNZ(-20,20);
    const choiceLinear = Math.random()<0.7;
    if(choiceLinear){
      const a = randNZ(-20,20), b = randNZ(-20,20); // quotient = ax + b
      const A2 = s*a, A1 = s*b + t*a, A0 = t*b;
      if([A2,A1,A0].every(v=>Math.abs(v)<=20)){
        const dividend = {a2:A2,a1:A1,a0:A0};
        const divisor  = {a2:0,a1:s,a0:t};
        const quotient = {a2:0,a1:a,a0:b};
        const check = mulCoef(divisor,quotient);
        if(check.a2===A2 && check.a1===A1 && check.a0===A0){
          return {dividend, divisor, quotient};
        }
      }
    }else{
      const k = randNZ(-20,20); // quotient = k (nonzero), dividend linear
      const A1 = s*k, A0 = t*k;
      if([A1,A0].every(v=>Math.abs(v)<=20)){
        const dividend = {a2:0,a1:A1,a0:A0};
        const divisor  = {a2:0,a1:s,a0:t};
        const quotient = {a2:0,a1:0,a0:k};
        const check = mulCoef(divisor,quotient);
        if(check.a2===0 && check.a1===A1 && check.a0===A0){
          return {dividend, divisor, quotient};
        }
      }
    }
  }
}

///////////////////// Example generator /////////////////////
function showWorkspace(which){
  wsSolve.style.display = which==='solve'?'block':'none';
  wsMul  .style.display = which==='mul'  ?'block':'none';
  wsDiv  .style.display = which==='div'  ?'block':'none';
}

function newExample(){
  showSol=false; document.getElementById('btn-solution').textContent='เฉลย';
  answerInput.value=''; checkResult.textContent='';
  tiles=[]; selection.clear(); showWorkspace(null);

  if(mode==='int_add'){
    const a=randNZ(-15,15), b=randNZ(-15,15);
    problemText = `${a} + ${b<0?`(${b})`:b}`;
    const sum=a+b; answerCoef={a2:0,a1:0,a0:sum}; problemAnswer=String(sum);
  }else if(mode==='int_sub'){
    const a=randNZ(-15,15), b=randNZ(-15,15);
    problemText = `${a} - ${b<0?`(${b})`:b}`;
    const res=a-b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
  }else if(mode==='int_mul'){
    const a=randNZ(-15,15), b=randNZ(-15,15);
    problemText = `${a} × ${b<0?`(${b})`:b}`;
    const res=a*b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
    showWorkspace('mul'); mulMult.innerHTML = `${b<0?`(${b})`:b}`; mulMcand.innerHTML = `${a<0?`(${a})`:a}`;
  }else if(mode==='int_div'){
    const divisor=randNZ(-15,15), q=randNZ(-15,15), dividend=divisor*q;
    problemText = `${dividend} ÷ ${divisor<0?`(${divisor})`:divisor}`;
    answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); divDivisor.innerHTML = `${divisor<0?`(${divisor})`:divisor}`; divQuot.value='';
  }else if(mode==='poly_add' || mode==='poly_sub'){
    const P = buildPolyDeg12(-9,9);
    const Q = buildPolyDeg12(-9,9);
    if(mode==='poly_add'){
      problemText = `${P.html} + ${Q.html}`;
      answerCoef = addCoef(P.coef,Q.coef);
    }else{
      problemText = `${P.html} - ${Q.html}`;
      answerCoef = addCoef(P.coef, {a2:-Q.coef.a2, a1:-Q.coef.a1, a0:-Q.coef.a0});
    }
    problemAnswer = polyToHTML(answerCoef,false); // เฉลยไม่ใส่ [ ]
  }else if(mode==='poly_mul'){
    const {A,B,P} = buildMulLinear();
    const Ah = polyToHTML(A,true), Bh = polyToHTML(B,true);
    problemText = `${Ah} × ${Bh}`;
    answerCoef = P; problemAnswer = polyToHTML(P,false);
    showWorkspace('mul');
    mulMcand.innerHTML = polyToHTML(A,false);
    mulMult .innerHTML = polyToHTML(B,false);
  }else if(mode==='poly_div'){
    const {dividend, divisor, quotient} = buildDivExact();
    problemText = `${polyToHTML(dividend,true)} ÷ ${polyToHTML(divisor,true)}`;
    answerCoef = quotient; problemAnswer = polyToHTML(quotient,false);
    showWorkspace('div');
    divDivisor.innerHTML = polyToHTML(divisor,false);
    divQuot.value='';
  }

  render();
}

///////////////////// Parser (simple for checking) /////////////////////
function sanitizeInput(s){
  return String(s||'')
    .replace(/−/g,'-')
    .replace(/·|×/g,'*')
    .replace(/x²/gi,'x^2')
    .replace(/\[/g,'(').replace(/\]/g,')')
    .replace(/\s+/g,'')
    .trim();
}
function parsePoly(input){
  const s = sanitizeInput(input);
  if(s.length===0) return null;
  if(/[^0-9xX+\-^()]/.test(s)) return null;
  let i=0;
  const peek=()=>s[i]||'';
  const eat=(ch)=> (s[i]===ch?(i++,true):false);
  const coef=(a2=0,a1=0,a0=0)=>({a2,a1,a0});
  const add=(A,B)=>({a2:A.a2+B.a2,a1:A.a1+B.a1,a0:A.a0+B.a0});
  const mulK=(k,A)=>({a2:k*A.a2,a1:k*A.a1,a0:k*A.a0});

  function factor(){
    let sign=1;
    if(eat('+')){} else if(eat('-')) sign=-1;
    if(eat('(')){
      const e = expr(); if(!eat(')')) return null; return mulK(sign,e);
    }
    let num=''; while(/[0-9]/.test(peek())) num+=s[i++];
    let c = (num===''?1:parseInt(num,10));
    if(peek().toLowerCase()==='x'){
      i++; let p=1;
      if(eat('^')){ if(peek()==='2'){i++; p=2;} else return null; }
      return mulK(sign*c, p===2?coef(1,0,0):coef(0,1,0));
    }else{
      if(num==='') return null;
      return mulK(sign*c, coef(0,0,1));
    }
  }
  function term(){ const f=factor(); if(!f) return null; return f; }
  function expr(){
    let v=term(); if(!v) return null;
    while(true){
      if(eat('+')){ const t=term(); if(!t) return null; v=add(v,t); }
      else if(eat('-')){ const t=term(); if(!t) return null; v=add(v,mulK(-1,t)); }
      else break;
    }
    return v;
  }
  const res = expr();
  if(!res || i!==s.length) return null;
  res.a2|=0; res.a1|=0; res.a0|=0; return res;
}

///////////////////// Checking /////////////////////
checkBtn.onclick = ()=>{
  checkResult.textContent=''; checkResult.style.color='';
  const givenRaw = answerInput.value;
  const given = givenRaw.replace(/\s+/g,'').replace(/−/g,'-').replace(/\[/g,'(').replace(/\]/g,')');
  const stripPar = (s)=>{ let r=s; while(r.startsWith('(')&&r.endsWith(')')) r=r.slice(1,-1); return r; };

  if(['int_add','int_sub','int_mul','int_div'].includes(mode)){
    const s = stripPar(given);
    if(!/^-?\d+$/.test(s)){ bad(); return; }
    if(parseInt(s,10) === answerCoef.a0){ good(); } else { bad(); }
    return;
  }
  const parsed = parsePoly(given);
  if(!parsed){ bad(); return; }
  if(equalsCoef(parsed, answerCoef)){ good(); } else { bad(); }

  function good(){ checkResult.textContent='ถูกต้อง'; checkResult.style.color='#16a34a'; }
  function bad(){ checkResult.textContent='ไม่ถูกต้อง'; checkResult.style.color='#dc2626'; }
};
const equalsCoef = (a,b)=> a.a2===b.a2 && a.a1===b.a1 && a.a0===b.a0;

///////////////////// Init /////////////////////
document.getElementById('btn-new').focus();
newExample();
render();
