/* app.js – keep original logic; add only handlers for 📖 & 💡& แก้ logic การแก้สมการ & เปลี่ยนลิ้งค์ยูทูป*/

/* ====== โค้ดเดิมทั้งหมดของคุณอยู่ข้างล่าง/ข้างบนนี้ได้ ไม่ต้องแก้ ====== */
/* ... (your existing logic for generating problems, checking answers, tiles, etc.) ... */

/* ---------- [เพิ่ม] ตัวช่วยเปิด/ปิด modal เดิมและใหม่ ---------- */
function openModal(el){ el.style.display = 'flex'; }
function closeModal(el){ el.style.display = 'none'; }

/* modal ที่มีอยู่แล้ว */
const helpModal  = document.getElementById('help');
const helpBtn    = document.getElementById('btn-help');
const helpClose  = document.getElementById('help-x');

if (helpBtn && helpModal && helpClose){
  helpBtn.addEventListener('click', () => openModal(helpModal));
  helpClose.addEventListener('click', () => closeModal(helpModal));
}

/* ---------- [เพิ่ม] 📖 ลิงก์แบบฝึก/แบบทดสอบ ---------- */
const linksBtn   = document.getElementById('btn-links');
const linksModal = document.getElementById('linksModal');
const linksClose = document.getElementById('links-x');

if (linksBtn && linksModal && linksClose){
  linksBtn.addEventListener('click', () => openModal(linksModal));
  linksClose.addEventListener('click', () => closeModal(linksModal));
  // ปิดเมื่อคลิกนอกการ์ด
  linksModal.addEventListener('click', (e)=>{
    if (e.target === linksModal) closeModal(linksModal);
  });
}

/* ---------- [เพิ่ม] 💡 วิดีโอ YouTube ต่อโหมด ---------- */
const videoBtn   = document.getElementById('btn-video');
const videoModal = document.getElementById('videoModal');
const videoClose = document.getElementById('video-x');
const videoFrame = document.getElementById('videoFrame');
const modeSelect = document.getElementById('mode');

const videoMap = {
  'int_add' : 'https://www.youtube.com/watch?v=0ROjOr4SKfw',
  'int_sub' : 'https://www.youtube.com/watch?v=q33QILkQf0Y',
  'int_mul' : 'https://www.youtube.com/watch?v=TB9OXuxQdCs',
  'int_div' : 'https://www.youtube.com/watch?v=8LDpZCzUoIc',
  'poly_add': 'https://www.youtube.com/watch?v=KmLNBd2RECA',
  'poly_sub': 'https://www.youtube.com/watch?v=dNqJO3qpXXM&t=2s',
  'poly_mul': 'https://www.youtube.com/watch?v=ZWaF0BxXCZc&t=1sc',
  'poly_div': 'https://www.youtube.com/watch?v=k1J6dBbQCis',
  'solve_lin': 'https://www.youtube.com/watch?v=88jWcKUn2LEE'
};

function currentVideoUrl(){
  const key = modeSelect ? modeSelect.value : 'int_add';
  return videoMap[key] || videoMap['int_add'];
}

function stopVideo(){
  if (!videoFrame) return;
  // เคล็ดลับหยุดเล่น: รีเซ็ต src ชั่วคราว
  const src = videoFrame.getAttribute('src');
  videoFrame.setAttribute('src', '');
  // หน่วง 0 แป๊บเดียว ป้องกันกระพริบ
  requestAnimationFrame(()=> videoFrame.setAttribute('src', src || ''));
}

if (videoBtn && videoModal && videoClose && videoFrame){
  videoBtn.addEventListener('click', () => {
    videoFrame.src = currentVideoUrl();
    openModal(videoModal);
  });
  videoClose.addEventListener('click', () => {
    closeModal(videoModal);
    stopVideo();
  });
  videoModal.addEventListener('click', (e)=>{
    if (e.target === videoModal){
      closeModal(videoModal);
      stopVideo();
    }
  });
}

/* ====== (จบส่วนที่เพิ่ม) ส่วนอื่นของแอปยังทำงานเหมือนเดิม ====== */
/*
Version: 2025-08-17 r9
Changelog (from r8):
- การสุ่ม "หารจำนวนเต็ม": บังคับให้แสดงตัวตั้ง/ตัวหารอยู่ในช่วง [-15,15]\{0} โดยเลือก quotient ให้ |divisor*quotient|≤15 (หารลงตัวเสมอ)
- ไม่แตะส่วนอื่น (Pointer Events, กฎสุ่มพหุนาม ฯลฯ คงเดิม)
*/

//// ====== DOM ======
const board = document.getElementById('board');
const palette = document.getElementById('palette');
const solutionBox = document.getElementById('solution');
const problemBox = document.getElementById('problem');
const answerInput = document.getElementById('answerInput');
const checkBtn = document.getElementById('btn-check');
const checkResult = document.getElementById('checkResult');
const normalizeInput = document.getElementById('normalizeInput');

const wsSolve = document.getElementById('ws-solve');
const wsMul   = document.getElementById('ws-mul');
const wsDiv   = document.getElementById('ws-div');
const mulMult = document.getElementById('mul-mult');
const mulMcand= document.getElementById('mul-mcand');
const divDivisor = document.getElementById('div-divisor');
const divQuot    = document.getElementById('div-quot');

// ป้องกัน input ไปแย่ง drag
['pointerdown'].forEach(evt=>{
  if(divQuot){ divQuot.addEventListener(evt, e=>e.stopPropagation()); }
  if(answerInput){ answerInput.addEventListener(evt, e=>e.stopPropagation()); }
  if(normalizeInput){ normalizeInput.addEventListener(evt, e=>e.stopPropagation()); }
});

//// ====== Tiles config ======
const TYPES = {
  x2:      {labelHTML:'x<sup>2</sup>',   w:120, h:120, color:'var(--blue)',   shape:'square', neg:'neg_x2'},
  neg_x2:  {labelHTML:'-x<sup>2</sup>',  w:120, h:120, color:'var(--red)',    shape:'square', neg:'x2'},
  x:       {labelHTML:'x',               w:30,  h:120, color:'var(--green)',  shape:'rect',   neg:'neg_x'},
  neg_x:   {labelHTML:'-x',              w:30,  h:120, color:'var(--red)',    shape:'rect',   neg:'x'},
  one:     {labelHTML:'1',               w:30,  h:30,  color:'var(--yellow)', shape:'mini',   neg:'neg_one'},
  neg_one: {labelHTML:'-1',              w:30,  h:30,  color:'var(--red)',    shape:'mini',   neg:'one'}
};

let tiles = [];
let selection = new Set();
let dragging = null;
let selRect = null;
let zoom = 1;
let showSol = false;
let mode = document.getElementById('mode').value;

let problemText = '';
let problemAnswer = '';
let answerCoef = {a2:0,a1:0,a0:0};

//// ====== Utils ======
const uid = ()=> Math.random().toString(36).slice(2);
const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));

function randNZMax(max){ let v=0; while(v===0){ v = (Math.random()<.5?-1:1) * (Math.floor(Math.random()*max)+1); } return v; }
const rNZ9  = ()=>randNZMax(9);
const rNZ15 = ()=>randNZMax(15);
const rNZ20 = ()=>randNZMax(20);

function rint(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

function showWorkspace(which){
  wsSolve.style.display = (which==='solve') ? 'block':'none';
  wsMul.style.display   = (which==='mul')   ? 'block':'none';
  wsDiv.style.display   = (which==='div')   ? 'block':'none';
}

function pt(e){
  const rect = board.getBoundingClientRect();
  return { x: (e.clientX - rect.left)/zoom, y: (e.clientY - rect.top)/zoom };
}
function overlaps(x,y,w,h,t){ return !(x+w < t.x || x > t.x+t.w || y+h < t.y || y > t.y+t.h); }
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

//// ====== Formatting helpers ======
function termX2(k, isLeadDeg2){
  if(k===1)  return 'x<sup>2</sup>';
  if(k===-1) return isLeadDeg2 ? '-x<sup>2</sup>' : '(-x<sup>2</sup>)';
  return (k<0 && !isLeadDeg2) ? `(${k}x<sup>2</sup>)` : `${k}x<sup>2</sup>`;
}
function termX1(k, deg){
  if(k===1)  return 'x';
  if(k===-1) return (deg===1 ? '-x' : '(-x)');
  return (k<0 && deg===2) ? `(${k}x)` : `${k}x`;
}
function termC(k){ return (k<0) ? `(${k})` : `${k}`; }

function polyToHTML(coef, outerBrackets){
  const {a2=0,a1=0,a0=0} = coef;
  const deg = a2 ? 2 : 1;
  const parts=[];
  if(a2){ parts.push( termX2(a2, true) ); }
  if(a1){ parts.push( termX1(a1, deg) ); }
  if(a0){ parts.push( termC(a0) ); }
  if(parts.length===0) parts.push('0');
  let s = parts.join(' + ');
  s = s.replace(/\+ \(-/g,'+ (-');
  return outerBrackets ? `[${s}]` : s;
}

function addCoef(A,B){ return {a2:(A.a2|0)+(B.a2|0), a1:(A.a1|0)+(B.a1|0), a0:(A.a0|0)+(B.a0|0)}; }
function subCoef(A,B){ return {a2:(A.a2|0)-(B.a2|0), a1:(A.a1|0)-(B.a1|0), a0:(A.a0|0)-(B.a0|0)}; }
function mulCoef(A,B){
  const res = {a2:0,a1:0,a0:0};
  [[2,A.a2|0],[1,A.a1|0],[0,A.a0|0]].forEach(([pa,ka])=>{
    [[2,B.a2|0],[1,B.a1|0],[0,B.a0|0]].forEach(([pb,kb])=>{
      const pow=pa+pb, k=ka*kb;
      if(pow===2) res.a2+=k; else if(pow===1) res.a1+=k; else res.a0+=k;
    });
  });
  return res;
}
function coefAbsLeq(A,limit){ return Math.abs(A.a2||0)<=limit && Math.abs(A.a1||0)<=limit && Math.abs(A.a0||0)<=limit; }

function buildPolyDeg1(rangeNZ){ const b = rangeNZ(), c = rangeNZ(); return {coef:{a2:0,a1:b,a0:c}, html: polyToHTML({a1:b,a0:c}, true)}; }
function buildPolyDeg1or2_forAddSub(){
  const deg = Math.random()<.5?2:1;
  if(deg===2){ const a=rNZ9(), b=rNZ9(), c=rNZ9(); return {coef:{a2:a,a1:b,a0:c}, html: polyToHTML({a2:a,a1:b,a0:c}, true)}; }
  else{ const b=rNZ9(), c=rNZ9(); return {coef:{a2:0,a1:b,a0:c}, html: polyToHTML({a1:b,a0:c}, true)}; }
}

//// ====== Render ======
function render(){
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

    el.addEventListener('pointerdown', (e)=>{
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      if(!selection.has(t.id)){
        if(!e.shiftKey) selection.clear();
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
      dragging = {ids, offsets};
      render();
    });
    board.appendChild(el);
  });

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
  el.addEventListener('pointerdown', (e)=>{e.preventDefault(); addTile();});
});

board.addEventListener('pointerdown', (e)=>{
  if(e.button!==0) return;
  board.setPointerCapture(e.pointerId);
  const p = pt(e);
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
});
board.addEventListener('pointermove', (e)=>{
  if(!board) return;
  if(dragging){
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
});
board.addEventListener('pointerup', ()=>{
  if(dragging) dragging=null;
  if(selRect){
    const {x0,y0,x1,y1} = selRect;
    const minx=Math.min(x0,x1),maxx=Math.max(x0,x1),miny=Math.min(y0,y1),maxy=Math.max(y0,y1);
    selection = new Set(tiles.filter(t=> t.x>=minx && t.y>=miny && (t.x+t.w)<=maxx && (t.y+t.h)<=maxy).map(t=>t.id));
    selRect=null; render();
  }
});

//// ====== Toolbar actions ======
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
    return {...t, id:uid(), x:spot.x + i*10, y:spot.y + i*10};
  });
  tiles = [...tiles, ...clones];
  selection = new Set(clones.map(c=>c.id));
  render();
};
document.getElementById('btn-zoom-in').onclick  = ()=>{ zoom = clamp(zoom*1.25, .4, 2.2); render(); };
document.getElementById('btn-zoom-out').onclick = ()=>{ zoom = clamp(zoom*0.8,  .4, 2.2); render(); };

const help = document.getElementById('help');
const ytframe = document.getElementById('ytframe');
document.getElementById('btn-help').onclick = ()=> help.style.display='flex';
document.getElementById('help-x').onclick   = ()=>{
  help.style.display='none';
  const src = ytframe.src; ytframe.src = src;
};

//// ====== Mode & examples ======
document.getElementById('mode').onchange = (e)=>{ mode = e.target.value; newExample(); };
document.getElementById('btn-new').onclick = ()=> newExample();
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};

//// ====== Parser (เหมือน r8) ======
function sanitizeInput(s){
  return String(s||'').replace(/−/g,'-').replace(/·|×/g,'*').replace(/x²/gi,'x^2').replace(/\[/g,'(').replace(/\]/g,')').replace(/\s+/g,'').trim();
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
function coefToHTML({a2,a1,a0}, withBrackets){ return polyToHTML({a2,a1,a0}, !!withBrackets); }
function equalsCoef(a,b){ return (a.a2|0)===(b.a2|0) && (a.a1|0)===(b.a1|0) && (a.a0|0)===(b.a0|0); }

//// ====== Example generator ======
function newExample(){
  showSol=false; document.getElementById('btn-solution').textContent='เฉลย';
  answerInput.value=''; checkResult.textContent='';
  tiles=[]; selection.clear();
  showWorkspace(null);

  if(mode==='int_add'){
    const a=rNZ15(), b=rNZ15();
    problemText = `${a} + ${b<0?`(${b})`:b}`;
    const sum=a+b; answerCoef={a2:0,a1:0,a0:sum}; problemAnswer=String(sum);
  }else if(mode==='int_sub'){
    const a=rNZ15(), b=rNZ15();
    problemText = `${a} - ${b<0?`(${b})`:b}`;
    const res=a-b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
  }else if(mode==='int_mul'){
    const a=rNZ15(), b=rNZ15();
    problemText = `${a} × ${b<0?`(${b})`:b}`;
    const res=a*b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
    showWorkspace('mul'); mulMult.textContent=b; mulMcand.textContent=a;
  }else if(mode==='int_div'){
    // NEW r9: ทั้ง dividend และ divisor ต้องอยู่ใน [-15,15]\{0}
    const divisor = rNZ15();
    const maxQ = Math.max(1, Math.floor(15/Math.abs(divisor))); // อย่างน้อย 1
    // สุ่มผลหารในช่วง [-maxQ, maxQ]\{0}
    let q = 0;
    while(q===0){ q = (Math.random()<.5?-1:1) * rint(1, maxQ); }
    const dividend = divisor * q; // จะอยู่ในช่วงแน่นอน
    problemText = `${dividend} ÷ ${divisor<0?`(${divisor})`:divisor}`;
    answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); divDivisor.textContent=divisor; divQuot.value='';
  }else if(mode==='poly_add' || mode==='poly_sub'){
    const P = buildPolyDeg1or2_forAddSub();
    const Q = buildPolyDeg1or2_forAddSub();
    if(mode==='poly_add'){ problemText = `${P.html} + ${Q.html}`; answerCoef = addCoef(P.coef, Q.coef); }
    else{ problemText = `${P.html} - ${Q.html}`; answerCoef = subCoef(P.coef, Q.coef); }
    problemAnswer = coefToHTML(answerCoef, false);
  }else if(mode==='poly_mul'){
    let A,B,ok=false;
    while(!ok){
      const p = buildPolyDeg1(rNZ9);
      const q = buildPolyDeg1(rNZ9);
      const prod = mulCoef(p.coef, q.coef);
      if(coefAbsLeq(prod,36)){ A=p; B=q; ok=true; }
    }
    problemText = `${A.html} × ${B.html}`;
    answerCoef = mulCoef(A.coef,B.coef);
    problemAnswer = coefToHTML(answerCoef, false);
    showWorkspace('mul');
    mulMult.innerHTML  = coefToHTML(B.coef,false);
    mulMcand.innerHTML = coefToHTML(A.coef,false);
  }else if(mode==='poly_div'){
    let s,t,a,b,c,degQ,dividend,divisor,quot,ok=false;
    while(!ok){
      s=rNZ20(); t=rNZ20();
      degQ = Math.random()<.5 ? 1 : 2;
      if(degQ===1){ a=rNZ20(); b=rNZ20(); c=0; quot={a2:0,a1:a,a0:b}; }
      else        { a=rNZ20(); b=rNZ20(); c=rNZ20(); quot={a2:a,a1:b,a0:c}; }
      divisor = {a2:0,a1:s,a0:t};
      dividend = mulCoef(divisor, quot);
      if(coefAbsLeq(dividend,20)) ok=true;
    }
    const check = mulCoef(divisor, quot);
    if(!equalsCoef(check, dividend)) return newExample();

    const dividendHTML = polyToHTML(dividend, true);
    const divisorHTML  = polyToHTML(divisor,  true);
    problemText   = `${dividendHTML} ÷ ${divisorHTML}`;
    answerCoef    = quot;
    problemAnswer = coefToHTML(answerCoef, false);
    showWorkspace('div');
    divDivisor.innerHTML = coefToHTML(divisor,false);
    divQuot.value='';
  
} else if (mode === 'solve_lin') {
  // ต้องการ "คำตอบเดียว" -> บังคับ a != c
  let a, b, c, x, d, ok = false;
  while (!ok) {
    a = rNZ15();          // สุ่มสัมประสิทธิ์ x (ฝั่งซ้าย) ∈ [-15,15]\{0}
    c = rNZ15();          // สุ่มสัมประสิทธิ์ x (ฝั่งขวา) ∈ [-15,15]\{0}
    if (a === c) continue; // ห้ามเท่ากัน เพื่อให้มีคำตอบเดียวเสมอ

    b = rNZ15();          // ค่าคงที่ฝั่งซ้าย
    x = rint(-15, 15);    // เฉลย x เป็นจำนวนเต็มช่วงเดียวกัน
    if (x === 0) continue;

    // คำนวณค่าคงที่ฝั่งขวาให้สอดคล้องกับเฉลยที่ตั้งไว้
    // จาก: a*x + b = c*x + d  ->  d = (a-c)*x + b
    d = (a - c) * x + b;

    // จำกัดขนาดพจน์คงที่ไม่ให้หลุดช่วงมากเกินไป (อ่านง่าย)
    if (Math.abs(d) <= 15) ok = true;
  }

  // แสดงโจทย์ (จัดรูปสวย ๆ เลี่ยง "+-" ให้เป็น "-")
  const ax = (a === 1 ? '' : a === -1 ? '-' : String(a)) + 'x';
  const cx = (c === 1 ? '' : c === -1 ? '-' : String(c)) + 'x';
  problemText = `ถ้า ${ax}${b >= 0 ? '+' : ''}${b} = ${cx}${d >= 0 ? '+' : ''}${d} แล้ว x มีค่า `.replace(/\+\-/g, '-');

  // เฉลย: x = ค่าเดียวที่ตั้งไว้
  answerCoef = { a2: 0, a1: 1, a0: -x };
  problemAnswer = `x = ${x}`;
  showWorkspace('solve');
}

  render();
}

//// ====== Checking ======
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

//// ====== Init ======
document.getElementById('btn-new').focus();
newExample();
render();
