/* 
Version: 2025-08-17 r11
Changelog (from r10):
- ใช้ Pointer Events (pointerdown/move/up/cancel) แทน mouse/touch แยกกันทั้งหมด
- กันการเลื่อน/ซูมของเบราว์เซอร์บนกระดานด้วย touch-action:none (อยู่ใน CSS) + preventDefault ระหว่างลาก
- ปรับกฎสุ่มโจทย์:
  • จำนวนเต็ม: สุ่มใน [-15,15]\{0} และ "หารจำนวนเต็ม" บังคับลงตัว โดยทุกค่าที่แสดง (dividend, divisor, quotient) อยู่ใน ±15
  • พหุนาม:
      - บวก/ลบ: p,q ดีกรีสุ่ม {1,2}, สัมประสิทธิ์ใน [-9,9]\{0}
      - คูณ: จำกัดปัจจัยทั้งสองเป็นดีกรี ≤1 (เชิงเส้น), สุ่มใน [-9,9]\{0}, ผลคูณกรองให้ |coef| ≤ 36
      - หาร: ตัวหารรูป s x + t (s≠0), เลือกผลหารเป็นค่าคงที่หรือเชิงเส้น (ดีกรี 0 หรือ 1) เพื่อให้ dividend ดีกรี 1 หรือ 2
              สุ่ม s,t,a,b ใน [-20,20]\{0}, สร้าง dividend = (sx+t)·(a x + b) หรือ (sx+t)·(b) และ "คัดเฉพาะ" กรณีที่ค่าสัมประสิทธิ์ของ dividend ทั้งหมดอยู่ใน [-20,20]
              ตรวจย้ำว่า Dividend == Divisor × Quotient เสมอ
- รูปแบบการพิมพ์พหุนาม:
  • โจทย์: แสดงเป็น [p(x)] ⍟ [q(x)] (ใช้วงเล็บเหลี่ยมเฉพาะโจทย์)
  • เฉลย/ตาราง: ไม่แสดง [ ], และใช้วงเล็บ () ครอบพจน์ลบที่ "ไม่ใช่พจน์นำ" ตามกฎ
  • ปิดวงเล็บครบถ้วน (ไม่มีวงเล็บตก)
- ตรรกะตารางคูณ/หาร (mul/div workspaces) ใช้ตัวจัดรูปเดียวกับโจทย์/เฉลย
- ปุ่ม “เพิ่มจำนวน”: ทำสำเนาแล้วเลือกเฉพาะสำเนา (ยกเลิกการเลือกต้นฉบับ) และจัดวางไม่ซ้อนกัน
*/

// ====== DOM ======
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

// กัน event บน input ไม่ให้ไปชนกลไกลาก
['pointerdown','mousedown','touchstart'].forEach(evt=>{
  if(divQuot) divQuot.addEventListener(evt, e=>e.stopPropagation(), {passive:false});
  if(answerInput) answerInput.addEventListener(evt, e=>e.stopPropagation(), {passive:false});
});

// ====== Tiles config ======
const TYPES = {
  x2:      {labelHTML:'x<sup>2</sup>',   w:120, h:120, color:'var(--blue)',   shape:'square', neg:'neg_x2'},
  neg_x2:  {labelHTML:'-x<sup>2</sup>',  w:120, h:120, color:'var(--red)',    shape:'square', neg:'x2'},
  x:       {labelHTML:'x',               w:120, h:30,  color:'var(--green)',  shape:'rect',   neg:'neg_x'},
  neg_x:   {labelHTML:'-x',              w:120, h:30,  color:'var(--red)',    shape:'rect',   neg:'x'},
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

// ====== Utils ======
const uid = ()=> Math.random().toString(36).slice(2);
const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));

// RNG in [lo,hi] integer
function rint(lo,hi){ return Math.floor(Math.random()*(hi-lo+1))+lo; }
// nonzero in [-M, M]
function randNZM(M){ let v=0; while(v===0){ v = (Math.random()<.5?-1:1) * rint(1,M); } return v; }
const randNZ15 = ()=> randNZM(15);
const randNZ9  = ()=> randNZM(9);
const randNZ20 = ()=> randNZM(20);

// Workspace visibility
function showWorkspace(which){
  wsSolve.style.display = (which==='solve') ? 'block':'none';
  wsMul.style.display   = (which==='mul')   ? 'block':'none';
  wsDiv.style.display   = (which==='div')   ? 'block':'none';
}

// pointer to board coords (PointerEvent-safe)
function ptFromClient(cx,cy){
  const rect = board.getBoundingClientRect();
  return { x: (cx - rect.left)/zoom, y: (cy - rect.top)/zoom };
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

// ====== Rendering ======
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

    // Pointer events on tile
    el.addEventListener('pointerdown', (e)=>{
      e.stopPropagation();
      e.preventDefault();
      if(!selection.has(t.id)){
        if(!e.shiftKey) selection.clear();
        selection.add(t.id);
      }else if(e.shiftKey){
        selection.delete(t.id);
      }
      const p = ptFromClient(e.clientX, e.clientY);
      const ids = Array.from(selection);
      const offsets = ids.map(id=>{
        const k = tiles.find(x=>x.id===id);
        return {id, dx:p.x - k.x, dy:p.y - k.y};
      });
      dragging = {ids, offsets};
      (e.target as Element).setPointerCapture?.(e.pointerId);
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

// ====== Board interactions (Pointer Events) ======
board.addEventListener('pointerdown', (e)=>{
  if(e.button!==undefined && e.button!==0) return;
  e.preventDefault();
  const p = ptFromClient(e.clientX, e.clientY);
  const hit = tiles.slice().reverse().find(t=> p.x>=t.x && p.x<=t.x+t.w && p.y>=t.y && p.y<=t.y+t.h);
  if(hit){
    if(!selection.has(hit.id)){ selection = new Set([hit.id]); }
    const ids = Array.from(selection);
    const offsets = ids.map(id=>{
      const k = tiles.find(x=>x.id===id);
      return {id, dx:p.x - k.x, dy:p.y - k.y};
    });
    dragging = {ids, offsets};
  }else{
    selection.clear();
    selRect = {x0:p.x, y0:p.y, x1:p.x, y1:p.y};
  }
  render();
}, {passive:false});

window.addEventListener('pointermove', (e)=>{
  if(!board) return;
  if(dragging){
    e.preventDefault();
    const p = ptFromClient(e.clientX, e.clientY);
    tiles = tiles.map(t=>{
      const off = dragging.offsets.find(o=>o.id===t.id);
      if(!off) return t;
      return {...t, x:p.x - off.dx, y:p.y - off.dy};
    });
    render();
  }else if(selRect){
    e.preventDefault();
    const p = ptFromClient(e.clientX, e.clientY);
    selRect.x1=p.x; selRect.y1=p.y; render();
  }
}, {passive:false});

function endPointer(){
  if(dragging) dragging=null;
  if(selRect){
    const {x0,y0,x1,y1} = selRect;
    const minx=Math.min(x0,x1),maxx=Math.max(x0,x1),miny=Math.min(y0,y1),maxy=Math.max(y0,y1);
    selection = new Set(tiles.filter(t=> t.x>=minx && t.y>=miny && (t.x+t.w)<=maxx && (t.y+t.h)<=maxy).map(t=>t.id));
    selRect=null; render();
  }
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

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
  const clones = selectedTiles.map(t=>{
    const spot = findFreeSpot(t.w, t.h);
    return {...t, id:uid(), x:spot.x, y:spot.y};
  });
  tiles = [...tiles, ...clones];
  // เลือกเฉพาะสำเนา (ยกเลิกต้นฉบับ)
  selection.clear();
  clones.forEach(c=> selection.add(c.id));
  render();
};
document.getElementById('btn-zoom-in').onclick  = ()=>{ zoom = clamp(zoom*1.25, .4, 2.2); render(); };
document.getElementById('btn-zoom-out').onclick = ()=>{ zoom = clamp(zoom*0.8,  .4, 2.2); render(); };

// popup open/close + stop video on close
const help = document.getElementById('help');
const ytframe = document.getElementById('ytframe');
document.getElementById('btn-help').onclick   = ()=> help.style.display='flex';
document.getElementById('help-x').onclick     = closeHelp;
function closeHelp(){
  help.style.display='none';
  // หยุดวิดีโอ
  const src = ytframe.src; ytframe.src = src;
}

// ====== Mode & examples ======
document.getElementById('mode').onchange = (e)=>{ mode = e.target.value; newExample(); };
document.getElementById('btn-new').onclick = ()=> newExample();
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

// ====== Formatting (โจทย์/เฉลย/ตาราง) ======
function termStr(power, k, {deg, isLead}){
  if(k===0) return '';
  const abs = Math.abs(k);
  const base = power===2 ? (abs===1 ? 'x<sup>2</sup>' : abs+'x<sup>2</sup>')
             : power===1 ? (abs===1 ? 'x' : abs+'x')
             : String(abs);
  if(k>0) return base;
  // k < 0
  // ถ้าเป็น "พจน์นำ" ของดีกรีนั้น ๆ → ไม่ครอบ
  if( (deg===2 && power===2 && isLead) || (deg===1 && power===1 && isLead) ) {
    return (abs===1 && power>0) ? ('-' + (power===2?'x<sup>2</sup>':'x')) : ('-' + base);
  }
  // อื่น ๆ → ครอบด้วย ()
  if(abs===1 && power>0) return '(-' + (power===2?'x<sup>2</sup>':'x') + ')';
  return '(-' + base + ')';
}
function formatPoly({a2=0,a1=0,a0=0}, {squareBrackets=false}={}){
  const deg = a2!==0 ? 2 : (a1!==0 ? 1 : 0);
  if(deg===0){ // ค่าคงที่
    const inner = a0>=0 ? String(a0) : ('-' + Math.abs(a0));
    return squareBrackets ? `[${inner}]` : inner;
  }
  const t2 = a2!==0 ? termStr(2,a2,{deg,isLead:true}) : '';
  const t1 = a1!==0 ? termStr(1,a1,{deg,isLead:(deg===1)}) : '';
  const t0 = a0!==0 ? termStr(0,a0,{deg,isLead:false}) : '';
  const parts = [];
  if(t2) parts.push(t2);
  if(t1) parts.push(t1);
  if(t0) parts.push(t0);
  const inner = parts.join(' + ');
  return squareBrackets ? `[${inner}]` : inner;
}
function formatLinear(a1,a0,{squareBrackets=false}={}){
  return formatPoly({a2:0,a1:a1,a0:a0},{squareBrackets});
}

// ====== Coef helpers ======
function addCoef(A,B){ return {a2:A.a2+B.a2, a1:A.a1+B.a1, a0:A.a0+B.a0}; }
function subCoef(A,B){ return {a2:A.a2-B.a2, a1:A.a1-B.a1, a0:A.a0-B.a0}; }
function mulCoef(A,B){
  const res = {a2:0,a1:0,a0:0};
  [[2,A.a2],[1,A.a1],[0,A.a0]].forEach(([pa,ka])=>{
    if(ka===0) return;
    [[2,B.a2],[1,B.a1],[0,B.a0]].forEach(([pb,kb])=>{
      if(kb===0) return;
      const pow=pa+pb, k=ka*kb;
      if(pow===2) res.a2+=k; else if(pow===1) res.a1+=k; else res.a0+=k;
    });
  });
  return res;
}
function within(obj,limit){ return Math.abs(obj.a2||0)<=limit && Math.abs(obj.a1||0)<=limit && Math.abs(obj.a0||0)<=limit; }

// ====== Random poly builders ======
function buildPolyDeg(deg, pick=randNZ9){ // deg=1|2, coef from [-9,9]\{0}
  if(deg===2){
    const a = pick(), b = pick(), c = pick();
    return {coef:{a2:a,a1:b,a0:c}, html:formatPoly({a2:a,a1:b,a0:c},{squareBrackets:true})};
  }else{
    const b = pick(), c = pick();
    return {coef:{a2:0,a1:b,a0:c}, html:formatPoly({a2:0,a1:b,a0:c},{squareBrackets:true})};
  }
}
function buildLinearForMul(){ // linear for multiplication in [-9,9]\{0}, ensure product cap later
  const b = randNZ9(), c = randNZ9();
  return {coef:{a2:0,a1:b,a0:c}, str:formatPoly({a2:0,a1:b,a0:c},{squareBrackets:true})};
}

// ====== Example generator ======
function newExample(){
  showSol=false; document.getElementById('btn-solution').textContent='เฉลย';
  answerInput.value=''; checkResult.textContent='';
  tiles=[]; selection.clear();
  showWorkspace(null);

  if(mode==='int_add'){
    const a=randNZ15(), b=randNZ15();
    problemText = `${a} + ${b<0?`(${b})`:b}`;
    const sum=a+b; answerCoef={a2:0,a1:0,a0:sum}; problemAnswer=String(sum);
  }else if(mode==='int_sub'){
    const a=randNZ15(), b=randNZ15();
    problemText = `${a} - ${b<0?`(${b})`:b}`;
    const res=a-b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
  }else if(mode==='int_mul'){
    const a=randNZ15(), b=randNZ15();
    problemText = `${a} × ${b<0?`(${b})`:b}`;
    const res=a*b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
    showWorkspace('mul'); 
    mulMult.innerHTML = String(b);
    mulMcand.innerHTML = String(a);
  }else if(mode==='int_div'){
    // ทุกค่าที่ "แสดง" ต้องอยู่ใน ±15 และลงตัว
    let divisor, q, dividend;
    do{
      divisor = randNZ15();
      q = randNZ15();
      dividend = divisor*q;
    }while(Math.abs(dividend)>15); // ให้ dividend <= 15 ด้วย
    problemText = `${dividend} ÷ ${divisor<0?`(${divisor})`:divisor}`;
    answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); 
    divDivisor.innerHTML = String(divisor);
    if(divQuot) divQuot.value='';
  }else if(mode==='poly_add' || mode==='poly_sub'){
    const degP = Math.random()<.5 ? 2 : 1;
    const degQ = Math.random()<.5 ? 2 : 1;
    const P = buildPolyDeg(degP, randNZ9);
    const Q = buildPolyDeg(degQ, randNZ9);
    if(mode==='poly_add'){
      problemText = `${P.html} + ${Q.html}`;
      answerCoef = addCoef(P.coef, Q.coef);
    }else{
      problemText = `${P.html} - ${Q.html}`;
      answerCoef = subCoef(P.coef, Q.coef);
    }
    problemAnswer = formatPoly(answerCoef,{squareBrackets:false});
  }else if(mode==='poly_mul'){
    // linear × linear, coef in [-9,9]\{0}, product cap |coef| ≤ 36
    let L1, L2, PROD;
    do{
      L1 = {a1:randNZ9(), a0:randNZ9()};
      L2 = {a1:randNZ9(), a0:randNZ9()};
      PROD = mulCoef({a2:0,a1:L1.a1,a0:L1.a0},{a2:0,a1:L2.a1,a0:L2.a0});
    }while(!(Math.abs(PROD.a2)<=36 && Math.abs(PROD.a1)<=36 && Math.abs(PROD.a0)<=36));
    const P = formatPoly({a2:0,a1:L1.a1,a0:L1.a0},{squareBrackets:true});
    const Q = formatPoly({a2:0,a1:L2.a1,a0:L2.a0},{squareBrackets:true});
    problemText = `${P} × ${Q}`;
    answerCoef = PROD;
    problemAnswer = formatPoly(PROD,{squareBrackets:false});

    showWorkspace('mul');
    mulMcand.innerHTML = formatPoly({a2:0,a1:L1.a1,a0:L1.a0},{squareBrackets:false});
    mulMult.innerHTML  = formatPoly({a2:0,a1:L2.a1,a0:L2.a0},{squareBrackets:false});
  }else if(mode==='poly_div'){
    // Divisor: s x + t (s≠0), Quotient: เลือกดีกรี 0 หรือ 1, coefใน [-20,20]\{0}
    // สร้าง dividend = divisor × quotient แล้ว "คัดเฉพาะ" กรณีที่ |coef(dividend)| ≤ 20
    let s,t,a,b,degQ,isOK=false, dividend, divisorStr, quotientCoef;
    while(!isOK){
      s = randNZ20(); t = randNZ20();
      degQ = Math.random() < 0.5 ? 0 : 1; // ทำให้ dividend อาจดีกรี 1 หรือ 2
      if(degQ===1){
        a = randNZ20(); b = randNZ20();
        dividend = mulCoef({a2:0,a1:s,a0:t}, {a2:0,a1:a,a0:b}); // (sx+t)(ax+b)
        isOK = within(dividend,20);
        quotientCoef = {a2:0,a1:a,a0:b};
      }else{
        b = randNZ20(); a = 0;
        dividend = mulCoef({a2:0,a1:s,a0:t}, {a2:0,a1:0,a0:b}); // (sx+t)*b
        isOK = (Math.abs(dividend.a1)<=20 && Math.abs(dividend.a0)<=20);
        quotientCoef = {a2:0,a1:0,a0:b};
      }
      // กันกรณี coefficient เกินช่วงหรือ 0 โดยบังเอิญ (เราเลือก nonzero แล้ว)
    }
    // ตรวจซ้ำ Dividend == Divisor × Quotient
    const checkDV = mulCoef({a2:0,a1:s,a0:t}, quotientCoef);
    if(!(checkDV.a2===dividend.a2 && checkDV.a1===dividend.a1 && checkDV.a0===dividend.a0)){
      return newExample();
    }
    const dividendStr = formatPoly(dividend,{squareBrackets:true});
    divisorStr  = formatPoly({a2:0,a1:s,a0:t},{squareBrackets:true});
    problemText = `${dividendStr} ÷ ${divisorStr}`;
    answerCoef = quotientCoef;
    problemAnswer = formatPoly(quotientCoef,{squareBrackets:false});

    showWorkspace('div');
    divDivisor.innerHTML = formatPoly({a2:0,a1:s,a0:t},{squareBrackets:false});
    if(divQuot) divQuot.value='';
  }else if(mode==='solve_lin'){
    // โอเคแล้วตามที่ผู้ใช้แจ้ง: สุ่มใน [-15,15]\{0}, ให้ค่าสมการอ่านง่าย
    let a,b,c,x,d,ok=false;
    while(!ok){
      a=randNZ15(); b=randNZ15(); c=randNZ15(); x = rint(-15,15); if(x===0) continue;
      d = a*x + b - c*x;
      if(Math.abs(d)<=15){ ok=true; }
    }
    const left  = formatLinear(a,b,{squareBrackets:false});
    const right = formatLinear(c,d,{squareBrackets:false});
    problemText = `${left} = ${right}`;
    answerCoef={a2:0,a1:1,a0:-x}; problemAnswer=`x = ${x}`;
    showWorkspace('solve');
  }

  render();
}

// ====== Answer checking ======
function equalsCoef(a,b){ return (a.a2|0)===(b.a2|0) && (a.a1|0)===(b.a1|0) && (a.a0|0)===(b.a0|0); }

checkBtn.onclick = ()=>{
  checkResult.textContent=''; checkResult.style.color='';
  const givenRaw = answerInput.value;
  const given = givenRaw.replace(/\s+/g,'').replace(/−/g,'-').replace(/\[/g,'(').replace(/\]/g,')');
  const stripPar = (s)=>{ let r=s; while(r.startsWith('(') && r.endsWith(')')) r=r.slice(1,-1); return r; };

  if(['int_add','int_sub','int_mul','int_div'].includes(mode)){
    const s = stripPar(given);
    if(!/^-?\d+$/.test(s)){ bad(); return; }
    if(parseInt(s,10) === (answerCoef.a0|0)){ good(); } else { bad(); }
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

// ====== Init ======
document.getElementById('btn-new').focus();
newExample();
render();
