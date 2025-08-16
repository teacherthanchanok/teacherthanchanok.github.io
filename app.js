// ====== DOM ======
const board = document.getElementById('board');
const palette = document.getElementById('palette');
const solutionBox = document.getElementById('solution');
const problemBox = document.getElementById('problem');
const normalizeInput = document.getElementById('normalizeInput');
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

// ป้องกัน pointer จาก input ไปเริ่มลาก
['pointerdown'].forEach(evt=>{
  if(divQuot) divQuot.addEventListener(evt, e=>e.stopPropagation());
  answerInput.addEventListener(evt, e=>e.stopPropagation());
  normalizeInput.addEventListener(evt, e=>e.stopPropagation());
});

// ====== Tiles config ======
const TYPES = {
  x2:      {labelHTML:'x<sup>2</sup>',   w:120, h:120, color:'var(--blue)',   shape:'square', neg:'neg_x2'},
  neg_x2:  {labelHTML:'-x<sup>2</sup>',  w:120, h:120, color:'var(--red)',    shape:'square', neg:'x2'},
  x:       {labelHTML:'x',               w:30,  h:120, color:'var(--green)',  shape:'rect',   neg:'neg_x'}, // แนวตั้ง
  neg_x:   {labelHTML:'-x',              w:30,  h:120, color:'var(--red)',    shape:'rect',   neg:'x'},
  one:     {labelHTML:'1',               w:30,  h:30,  color:'var(--yellow)', shape:'mini',   neg:'neg_one'},
  neg_one: {labelHTML:'-1',              w:30,  h:30,  color:'var(--red)',    shape:'mini',   neg:'one'}
};

let tiles = [];     // {id,type,x,y,w,h}
let selection = new Set();
let dragging = null; // {ids,offsets[],pointerId}
let selRect = null;
let zoom = 1;
let showSol = false;
let mode = document.getElementById('mode').value;

let problemText = '';
let problemAnswer = '';
let answerCoef = {a2:0,a1:0,a0:0};

// ====== Utils ======
const uid = ()=> Math.random().toString(36).slice(2);
const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));
const within = (v,lim)=> Math.abs(v) <= lim;

// RNG [-N,N]\{0}
const randNZ = (N)=>{ let v=0; while(v===0){ v = (Math.random()<.5?-1:1) * (Math.floor(Math.random()*N)+1); } return v; };
const rint = (a,b)=> Math.floor(Math.random()*(b-a+1))+a;

// Workspace visibility
function showWorkspace(which){
  wsSolve.style.display = (which==='solve') ? 'block':'none';
  wsMul.style.display   = (which==='mul')   ? 'block':'none';
  wsDiv.style.display   = (which==='div')   ? 'block':'none';
}

// pointer → board coords (คูณ zoom)
function pt(e){
  const rect = board.getBoundingClientRect();
  return { x: (e.clientX - rect.left)/zoom, y: (e.clientY - rect.top)/zoom };
}
function overlaps(x,y,w,h,t){
  return !(x+w < t.x || x > t.x+t.w || y+h < t.y || y > t.y+t.h);
}
function findFreeSpot(w,h){
  const margin = 20;
  const startX = 260, startY = 100;
  let x=startX, y=startY;
  const step = 20;
  const limitX = 2000, limitY=1400;
  let tries=0;
  while(tries<3000){
    const collide = tiles.some(t=>overlaps(x,y,w,h,t));
    if(!collide) return {x,y};
    x += step; if(x+w+margin>limitX){ x=startX; y += step; if(y+h+margin>limitY){ y=startY; } }
    tries++;
  }
  return {x:startX,y:startY};
}

// ====== Formatting (กฎวงเล็บ) ======
function termX2Lead(a){
  if(a===1)  return 'x<sup>2</sup>';
  if(a===-1) return '-x<sup>2</sup>';
  return `${a}x<sup>2</sup>`; // ไม่ครอบพจน์นำแม้ลบ
}
function termX1(b, deg){ // deg = 1 or 2
  if(b===1)  return 'x';
  if(b===-1) return (deg===1 ? '-x' : '(-x)');
  if(b<0)    return (deg===1 ? `${b}x` : `(${b}x)`);
  return `${b}x`;
}
function termC(c){ return c<0 ? `(${c})` : `${c}`; }

function formatPolyDisplay(coef, withBrackets){
  const deg = coef.a2 ? 2 : 1;
  const segs = [];
  if(deg===2){
    segs.push(termX2Lead(coef.a2));
    segs.push(termX1(coef.a1,2));
    segs.push(termC(coef.a0));
  }else{
    segs.push(termX1(coef.a1,1));
    segs.push(termC(coef.a0));
  }
  const inner = segs.join(' + ').replace(/\+ \(-/g,'+ (-');
  return withBrackets ? `[${inner}]` : inner;
}

function coefToHTML(c){ return formatPolyDisplay(c,false); }

// ====== Render ======
function render(){
  // tiles
  board.querySelectorAll('.tile').forEach(el=>el.remove());
  tiles.forEach(t=>{
    const el = document.createElement('div');
    el.className = 'tile' + (selection.has(t.id) ? ' selected' : '');
    el.style.background = TYPES[t.type].color;
    el.style.left = t.x + 'px';
    el.style.top  = t.y + 'px';
    el.style.width  = t.w + 'px';
    el.style.height = t.h + 'px';
    const showLabel = (t.h >= 50 || TYPES[t.type].shape!=='rect');
    el.innerHTML = showLabel ? '<span>'+TYPES[t.type].labelHTML+'</span>' : '';

    // pointer drag
    el.addEventListener('pointerdown', e=>{
      e.preventDefault(); e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      if(!selection.has(t.id)){
        if(!(e.shiftKey)) selection.clear();
        selection.add(t.id);
      }else if(e.shiftKey){
        selection.delete(t.id);
      }
      const p = pt(e);
      const ids = Array.from(selection);
      const offsets = ids.map(id=>{
        const k = tiles.find(x=>x.id===id);
        return {id, dx:p.x - k.x, dy:p.y - k.y};
      });
      dragging = {ids, offsets, pointerId:e.pointerId};
      render();
    }, {passive:false});

    board.appendChild(el);
  });

  // selection rect
  const oldSel = board.querySelector('.sel-rect');
  if(oldSel) oldSel.remove();
  if(selRect){
    const r = document.createElement('div');
    r.className='sel-rect';
    const x = Math.min(selRect.x0, selRect.x1);
    const y = Math.min(selRect.y0, selRect.y1);
    const w = Math.abs(selRect.x1 - selRect.x0);
    const h = Math.abs(selRect.y1 - selRect.y0);
    r.style.left = x+'px'; r.style.top=y+'px'; r.style.width=w+'px'; r.style.height=h+'px';
    board.appendChild(r);
  }

  board.style.transform = 'scale('+zoom+')';
  problemBox.innerHTML = problemText;
  solutionBox.innerHTML = showSol ? '<b>คำตอบที่ถูกต้อง:</b> '+problemAnswer : '';
}

// ====== Palette add ======
palette.querySelectorAll('.pal-item').forEach(el=>{
  const addTile = ()=>{
    const type = el.dataset.type;
    const tdef = TYPES[type];
    const id = uid();
    const start = findFreeSpot(tdef.w, tdef.h);
    tiles.push({id, type, x:start.x, y:start.y, w:tdef.w, h:tdef.h});
    selection = new Set([id]);
    render();
  };
  el.addEventListener('pointerdown', (e)=>{ e.preventDefault(); addTile(); }, {passive:false});
});

// ====== Board interactions ======
board.addEventListener('pointerdown', e=>{
  if(e.button!==undefined && e.button!==0) return;
  e.preventDefault(); board.setPointerCapture(e.pointerId);

  const p = pt(e);
  const hit = tiles.slice().reverse().find(t=> p.x>=t.x && p.x<=t.x+t.w && p.y>=t.y && p.y<=t.y+t.h);
  if(hit){
    if(!selection.has(hit.id)){ selection = new Set([hit.id]); }
    const ids = Array.from(selection);
    const offsets = ids.map(id=>{
      const k = tiles.find(x=>x.id===id);
      return {id, dx:p.x - k.x, dy:p.y - k.y};
    });
    dragging = {ids, offsets, pointerId:e.pointerId};
  }else{
    selection.clear();
    selRect = {x0:p.x, y0:p.y, x1:p.x, y1:p.y};
  }
  render();
},{passive:false});

window.addEventListener('pointermove', e=>{
  if(dragging){
    if(e.pointerId !== dragging.pointerId) return;
    e.preventDefault();
    const p = pt(e);
    tiles = tiles.map(t=>{
      const off = dragging.offsets.find(o=>o.id===t.id);
      if(!off) return t;
      return {...t, x:p.x - off.dx, y:p.y - off.dy};
    });
    render();
  }else if(selRect){
    e.preventDefault();
    const p = pt(e); selRect.x1=p.x; selRect.y1=p.y; render();
  }
},{passive:false});

window.addEventListener('pointerup', e=>{
  if(dragging && e.pointerId===dragging.pointerId){ try{board.releasePointerCapture(e.pointerId);}catch{} dragging=null; }
  if(selRect){
    const {x0,y0,x1,y1} = selRect;
    const minx=Math.min(x0,x1),maxx=Math.max(x0,x1),miny=Math.min(y0,y1),maxy=Math.max(y0,y1);
    selection = new Set(tiles.filter(t=> t.x>=minx && t.y>=miny && (t.x+t.w)<=maxx && (t.y+t.h)<=maxy).map(t=>t.id));
    selRect=null; render();
  }
});

// ====== Toolbar actions ======
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
  tiles = tiles.map(t=> {
    const shape = TYPES[t.type].shape;
    if(!selection.has(t.id) || shape!=='rect') return t;
    return {...t, w:t.h, h:t.w};
  });
  render();
};
document.getElementById('btn-duplicate').onclick = ()=>{
  const selectedTiles = tiles.filter(t=> selection.has(t.id));
  const clones = selectedTiles.map((t,i)=>{
    const spot = findFreeSpot(t.w, t.h);
    return {...t, id:uid(), x:spot.x + i*12, y:spot.y + i*12}; // กระจาย ไม่ซ้อน
  });
  tiles = [...tiles, ...clones];
  selection = new Set(clones.map(c=>c.id)); // เลิกเลือกต้นฉบับ
  render();
};
document.getElementById('btn-zoom-in').onclick  = ()=>{ zoom = clamp(zoom*1.25, .4, 2.2); render(); };
document.getElementById('btn-zoom-out').onclick = ()=>{ zoom = clamp(zoom*0.8,  .4, 2.2); render(); };

// popup
const help = document.getElementById('help');
const ytframe = document.getElementById('ytframe');
document.getElementById('btn-help').onclick   = ()=> help.style.display='flex';
document.getElementById('help-x').onclick     = ()=>{
  help.style.display='none'; const s=ytframe.src; ytframe.src=s;
};

// ====== Mode & buttons ======
document.getElementById('mode').onchange = (e)=>{ mode = e.target.value; newExample(); };
document.getElementById('btn-new').onclick = ()=> newExample();
normalizeInput.addEventListener('change', ()=> newExample());
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};

// ====== Parser (รับ () และ [] ) ======
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
  function peek(){ return s[i]||''; }
  function eat(ch){ if(s[i]===ch){ i++; return true;} return false; }
  function coef(a2=0,a1=0,a0=0){ return {a2,a1,a0}; }
  function add(A,B){ return {a2:A.a2+B.a2, a1:A.a1+B.a1, a0:A.a0+B.a0}; }
  function mulK(k,A){ return {a2:k*A.a2, a1:k*A.a1, a0:k*A.a0}; }

  function parseFactor(){
    let sign = 1;
    if(eat('+')){} else if(eat('-')){ sign = -1; }

    if(eat('(')){
      const e = parseExpr();
      if(!eat(')')) return null;
      return mulK(sign, e);
    }
    let numStr=''; while(/[0-9]/.test(peek())) numStr+=s[i++];
    let coeff = (numStr==='')?1:parseInt(numStr,10);
    if(peek().toLowerCase()==='x'){
      i++;
      let power = 1;
      if(eat('^')){ if(peek()==='2'){ i++; power = 2; } else return null; }
      return mulK(sign*coeff, power===2?coef(1,0,0):coef(0,1,0));
    }else{
      if(numStr==='') return null;
      return mulK(sign*coeff, coef(0,0,1));
    }
  }
  function parseTerm(){ const f = parseFactor(); if(!f) return null; return f; }
  function parseExpr(){
    let v = parseTerm(); if(!v) return null;
    while(true){
      if(eat('+')){ const t=parseTerm(); if(!t) return null; v=add(v,t); }
      else if(eat('-')){ const t=parseTerm(); if(!t) return null; v=add(v,mulK(-1,t)); }
      else break;
    }
    return v;
  }
  const res = parseExpr();
  if(res==null) return null;
  if(i!==s.length) return null;
  res.a2 |=0; res.a1|=0; res.a0|=0;
  return res;
}

function addCoef(A,B){ return {a2:A.a2+B.a2, a1:A.a1+B.a1, a0:A.a0+B.a0}; }
function mulCoef(A,B){
  const res = {a2:0,a1:0,a0:0};
  [[2,A.a2],[1,A.a1],[0,A.a0]].forEach(([pa,ka])=>{
    [[2,B.a2],[1,B.a1],[0,B.a0]].forEach(([pb,kb])=>{
      const pow=pa+pb, k=ka*kb;
      if(pow===2) res.a2+=k; else if(pow===1) res.a1+=k; else res.a0+=k;
    });
  });
  res.a2 = Math.max(-36, Math.min(36, res.a2));
  res.a1 = Math.max(-36, Math.min(36, res.a1));
  res.a0 = Math.max(-36, Math.min(36, res.a0));
  return res;
}

// ====== สร้างสตริงพหุนาม ======
function formatProblem(A, B, op){
  return `${formatPolyDisplay(A,true)} ${op} ${formatPolyDisplay(B,true)}`;
}
function formatAnswer(C){ // ไม่ใส่วงเล็บเหลี่ยม
  return formatPolyDisplay(C,false);
}

// ====== สุ่มพหุนาม ======
function randomDeg12Coef(maxAbs=9){
  const deg = Math.random()<.5 ? 2 : 1;
  if(deg===2) return {a2:randNZ(maxAbs), a1:randNZ(maxAbs), a0:randNZ(maxAbs)};
  return {a2:0, a1:randNZ(maxAbs), a0:randNZ(maxAbs)};
}
function degOf(c){ return c.a2 ? 2 : 1; }

// ====== Example generator ======
function newExample(){
  showSol=false; document.getElementById('btn-solution').textContent='เฉลย';
  answerInput.value=''; checkResult.textContent='';
  tiles=[]; selection.clear();
  showWorkspace(null);

  if(mode==='int_add'){
    const a=randNZ(15), b=randNZ(15);
    problemText = `${a} + ${b<0?`(${b})`:b}`;
    const sum=a+b; answerCoef={a2:0,a1:0,a0:sum}; problemAnswer=String(sum);
  }else if(mode==='int_sub'){
    const a=randNZ(15), b=randNZ(15);
    problemText = `${a} - ${b<0?`(${b})`:b}`;
    const res=a-b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
  }else if(mode==='int_mul'){
    const a=randNZ(15), b=randNZ(15);
    problemText = `${a} × ${b<0?`(${b})`:b}`;
    const res=a*b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
    showWorkspace('mul'); mulMult.textContent=b; mulMcand.textContent=a;
  }else if(mode==='int_div'){
    // โจทย์ลงตัวเสมอ
    const divisor = randNZ(15), q = randNZ(15), dividend = divisor*q;
    problemText = `${dividend} ÷ ${divisor<0?`(${divisor})`:divisor}`;
    answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); divDivisor.textContent=divisor; if(divQuot) divQuot.value='';
  }else if(mode==='poly_add' || mode==='poly_sub' || mode==='poly_mul'){
    let P,Q;
    if(mode==='poly_mul'){
      // ดีกรี ≤ 1 ทั้งคู่
      P = {a2:0,a1:randNZ(9),a0:randNZ(9)};
      Q = {a2:0,a1:randNZ(9),a0:randNZ(9)};
    }else{
      P = randomDeg12Coef(9);
      Q = randomDeg12Coef(9);
    }

    if(mode==='poly_add'){
      problemText = formatProblem(P,Q,'+');
      answerCoef = addCoef(P,Q);
      problemAnswer = formatAnswer(answerCoef);
    }else if(mode==='poly_sub'){
      problemText = formatProblem(P,Q,'-');
      answerCoef = addCoef(P,{a2:-Q.a2,a1:-Q.a1,a0:-Q.a0});
      problemAnswer = formatAnswer(answerCoef);
    }else{
      problemText = formatProblem(P,Q,'×');
      answerCoef = mulCoef(P,Q);
      problemAnswer = formatAnswer(answerCoef);
      showWorkspace('mul');
      mulMult.innerHTML = formatPolyDisplay(Q,false);
      mulMcand.innerHTML = formatPolyDisplay(P,false);
    }
  }else if(mode==='poly_div'){
    // ตัวหาร sx+t (s,t ∈ [-9,9]\{0})
    const s = randNZ(9), t = randNZ(9);
    const divisor = {a2:0,a1:s,a0:t};
    // ตัวตั้ง: สุ่มดีกรี 1 หรือ 2 แล้วคูณ divisor เพื่อให้ลงตัว
    const deg = Math.random()<.5 ? 1 : 2;
    let quotient = deg===1 ? {a2:0,a1:randNZ(9),a0:randNZ(9)} : {a2:randNZ(9),a1:randNZ(9),a0:randNZ(9)};
    // กรองให้สัมประสิทธิ์ของ dividend ที่แสดงไม่เกิน 15 เพื่ออ่านง่ายบนจอ
    let dividend = mulCoef(quotient, divisor);
    let guard = 0;
    while(!(within(dividend.a2) && within(dividend.a1,15) && within(dividend.a0,15)) && guard<200){
      quotient = deg===1 ? {a2:0,a1:randNZ(9),a0:randNZ(9)} : {a2:randNZ(9),a1:randNZ(9),a0:randNZ(9)};
      dividend = mulCoef(quotient, divisor);
      guard++;
    }
    // ตรวจซ้ำความถูกต้อง
    const recheck = mulCoef(quotient, divisor);
    const ok = (recheck.a2===dividend.a2 && recheck.a1===dividend.a1 && recheck.a0===dividend.a0);
    if(!ok){ return newExample(); }

    problemText = `${formatPolyDisplay(dividend,true)} ÷ ${formatPolyDisplay(divisor,true)}`;
    answerCoef = quotient;
    problemAnswer = formatAnswer(answerCoef);

    showWorkspace('div');
    divDivisor.innerHTML = formatPolyDisplay(divisor,false);
    if(divQuot) divQuot.value='';
  }else if(mode==='solve_lin'){
    // ax+b = cx+d ; ทุกค่าสุ่มใน [-15,15]\{0} และฝั่งขวาไม่เกินช่วง
    let a,b,c,x,d,ok=false;
    while(!ok){
      a=randNZ(15); b=randNZ(15); c=randNZ(15); x = rint(-15,15); if(x===0) continue;
      d = a*x + b - c*x;
      ok = within(d,15);
    }
    problemText = `${a===1?'':a===-1?'-':''}x${b>=0?'+':''}${b} = ${c===1?'':c===-1?'-':''}x${d>=0?'+':''}${d}`.replace(/\+\-/g,'-');
    answerCoef={a2:0,a1:1,a0:-x}; problemAnswer=`x = ${x}`;
    showWorkspace('solve');
  }

  render();
}

// ====== ตรวจคำตอบ ======
checkBtn.onclick = ()=>{
  checkResult.textContent=''; checkResult.style.color='';
  const givenRaw = answerInput.value;
  const given = givenRaw.replace(/\s+/g,'').replace(/−/g,'-').replace(/\[/g,'(').replace(/\]/g,')');
  const stripPar = (s)=>{ let r=s; while(r.startsWith('(') && r.endsWith(')')) r=r.slice(1,-1); return r; };

  if(['int_add','int_sub','int_mul','int_div'].includes(mode)){
    const s = stripPar(given);
    if(!/^-?\d+$/.test(s)){ bad(); return; }
    if(parseInt(s,10) === answerCoef.a0){ good(); } else { bad(); }
    return;
  }
  if(mode==='solve_lin'){
    let s = stripPar(given);
    let m = s.match(/^x=?(-?\d+)$/i); if(m){ s=m[1]; }
    if(!/^-?\d+$/.test(s)){ bad(); return; }
    const val = parseInt(s,10);
    const truth = -answerCoef.a0;
    if(val===truth){ good(); } else { bad(); }
    return;
  }
  const parsed = parsePoly(given);
  if(!parsed){ bad(); return; }
  if(equalsCoef(parsed, answerCoef)){ good(); } else { bad(); }

  function good(){ checkResult.textContent='ถูกต้อง'; checkResult.style.color='#16a34a'; }
  function bad(){ checkResult.textContent='ไม่ถูกต้อง'; checkResult.style.color='#dc2626'; }
};
function equalsCoef(a,b){ return a.a2===b.a2 && a.a1===b.a1 && a.a0===b.a0; }

// ====== Init ======
document.getElementById('btn-new').focus();
newExample();
render();
