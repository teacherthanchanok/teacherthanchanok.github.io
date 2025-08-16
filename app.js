/*
Version: 2025-08-17-resp-pe3
Changelog:
- เปลี่ยนเป็น Pointer Events (pointerdown/move/up/cancel) ทั้งหมด
- กันหน้าเลื่อน/ซูมระหว่างลาก (CSS ครอบ, และ preventDefault ใน pointermove เมื่อมีการลาก)
- ปรับการเรนเดอร์ให้ input ในตารางหารพิมพ์ได้แน่นอน และไม่ติด drag
- เพิ่ม logic วางไทล์ใหม่จาก “เพิ่มจำนวน” โดยไม่เลือกต้นฉบับ และกระจายไม่ซ้อนกัน
- ยังคงกฎสุ่มโจทย์/จัดวงเล็บ/ตารางคูณ–หารจากรอบก่อนหน้า
*/

// ====== DOM ======
const board = document.getElementById('board');
const palette = document.getElementById('palette');
const solutionBox = document.getElementById('solution');
const problemBox = document.getElementById('problem');
const answerInput = document.getElementById('answerInput');
const normalizeInput = document.getElementById('normalizeInput');
const checkBtn = document.getElementById('btn-check');
const checkResult = document.getElementById('checkResult');

const wsSolve = document.getElementById('ws-solve');
const wsMul   = document.getElementById('ws-mul');
const wsDiv   = document.getElementById('ws-div');
const mulMult = document.getElementById('mul-mult');
const mulMcand= document.getElementById('mul-mcand');
const divDivisor = document.getElementById('div-divisor');
const divQuot    = document.getElementById('div-quot');

// ป้องกันการเริ่มลากจาก input
['pointerdown','pointerup','pointermove'].forEach(evt=>{
  if(divQuot){ divQuot.addEventListener(evt, e=>e.stopPropagation()); }
  answerInput.addEventListener(evt, e=>e.stopPropagation());
  normalizeInput.addEventListener(evt, e=>e.stopPropagation());
});

// ====== Tiles config ======
const TYPES = {
  x2:      {labelHTML:'x<sup>2</sup>',   w:120, h:120, color:'var(--blue)',   shape:'square', neg:'neg_x2'},
  neg_x2:  {labelHTML:'-x<sup>2</sup>',  w:120, h:120, color:'var(--red)',    shape:'square', neg:'x2'},
  // ให้ x และ -x เริ่มแนวตั้งก่อน (w แคบ h สูง)
  x:       {labelHTML:'x',               w:30,  h:120, color:'var(--green)',  shape:'rect',   neg:'neg_x'},
  neg_x:   {labelHTML:'-x',              w:30,  h:120, color:'var(--red)',    shape:'rect',   neg:'x'},
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

// RNG helpers
function randNZ(maxAbs=15){
  let v=0;
  while(v===0){
    v = (Math.random()<.5?-1:1) * (Math.floor(Math.random()*maxAbs)+1);
  }
  return v;
}
function rint(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

// Workspace visibility
function showWorkspace(which){
  wsSolve.style.display = (which==='solve') ? 'block':'none';
  wsMul.style.display   = (which==='mul')   ? 'block':'none';
  wsDiv.style.display   = (which==='div')   ? 'block':'none';
}

// pointer to board coords
function pt(e){
  const rect = board.getBoundingClientRect();
  return { x: (e.clientX - rect.left)/zoom, y: (e.clientY - rect.top)/zoom };
}
function overlaps(x,y,w,h,t){
  return !(x+w < t.x || x > t.x+t.w || y+h < t.y || y > t.y+t.h);
}
function findFreeSpot(w,h){
  const margin = 20;
  const startX = 260, startY = 120;
  let x=startX, y=startY;
  const step = 22;
  const limitX = 2200, limitY=1600;
  let tries=0;
  while(tries<4000){
    const collide = tiles.some(t=>overlaps(x,y,w,h,t));
    if(!collide) return {x,y};
    x += step; if(x+w+margin>limitX){ x=startX; y += step; if(y+h+margin>limitY){ y=startY; } }
    tries++;
  }
  return {x:startX,y:startY};
}

// ====== Render ======
function render(){
  // tiles
  board.querySelectorAll('.tile').forEach(el=>el.remove());
  tiles.forEach(t=>{
    const el = document.createElement('div');
    el.className = 'tile' + (selection.has(t.id) ? ' selected' : '');
    el.style.background = getComputedStyle(document.documentElement).getPropertyValue(TYPES[t.type].color) || TYPES[t.type].color;
    el.style.left = t.x + 'px';
    el.style.top  = t.y + 'px';
    el.style.width  = t.w + 'px';
    el.style.height = t.h + 'px';
    const showLabel = (t.h >= 50 || TYPES[t.type].shape!=='rect');
    el.innerHTML = showLabel ? '<span>'+TYPES[t.type].labelHTML+'</span>' : '';

    // Pointer events
    el.addEventListener('pointerdown', (e)=>{
      e.stopPropagation();
      e.preventDefault();
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
    el.addEventListener('pointermove', (e)=>{
      if(!dragging) return;
      e.preventDefault();
      const p = pt(e);
      tiles = tiles.map(tt=>{
        const off = dragging.offsets.find(o=>o.id===tt.id);
        if(!off) return tt;
        return {...tt, x:p.x - off.dx, y:p.y - off.dy};
      });
      requestAnimationFrame(render);
    });
    el.addEventListener('pointerup', endPointerDrag);
    el.addEventListener('pointercancel', endPointerDrag);

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
  solutionBox.innerHTML = showSol ? '<b>เฉลย:</b> '+problemAnswer : '';
}

function endPointerDrag(e){
  if(dragging){
    e.preventDefault();
    dragging = null;
  }
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
  el.addEventListener('pointerdown', (e)=>{ e.preventDefault(); addTile(); });
});

// ====== Board interactions (Pointer Events) ======
board.addEventListener('pointerdown', (e)=>{
  // ignore if click on inputs
  if(e.target.closest('input,textarea,select,button')) return;
  if(e.button!==undefined && e.button!==0) return;
  e.preventDefault();
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

window.addEventListener('pointermove', (e)=>{
  if(dragging){
    e.preventDefault();
    const p = pt(e);
    tiles = tiles.map(t=>{
      const off = dragging.offsets.find(o=>o.id===t.id);
      if(!off) return t;
      return {...t, x:p.x - off.dx, y:p.y - off.dy};
    });
    requestAnimationFrame(render);
  }else if(selRect){
    e.preventDefault();
    const p = pt(e); selRect.x1=p.x; selRect.y1=p.y; render();
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
  // โคลนและกระจาย ไม่เลือกต้นฉบับ
  const selectedTiles = tiles.filter(t=> selection.has(t.id));
  const clones = selectedTiles.map((t,idx)=>{
    const spot = findFreeSpot(t.w, t.h);
    return {...t, id:uid(), x:spot.x + 10*idx, y:spot.y + 10*idx};
  });
  tiles = [...tiles, ...clones];
  selection = new Set(clones.map(c=>c.id)); // เลือกเฉพาะที่เพิ่มมา
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
  const src = ytframe.src; ytframe.src = src; // stop video
}

// ====== Mode & examples ======
document.getElementById('mode').onchange = (e)=>{ mode = e.target.value; newExample(); };
document.getElementById('btn-new').onclick = ()=> newExample();
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};

// ====== Parser/Formatter ======
// (เหมือนเดิม: รองรับ () และ [] ในการพิมพ์คำตอบ)
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

function joinTerms(parts){
  // parts เป็น array ของสตริงพจน์ที่ format วงเล็บเรียบร้อยแล้ว เช่น "x^2", "(−5x)", "(−3)"
  // เราจะต่อด้วย " + " เสมอ แล้วไม่ตัด ) ออก
  let out=[];
  for(const p of parts){
    if(p===''||p==='0') continue;
    if(out.length===0) out.push(p);
    else out.push(' + ' + p);
  }
  return out.length? out.join('') : '0';
}

function fmtX2(k, isLeadDeg2){
  if(k===0) return '';
  if(k===1)  return 'x<sup>2</sup>';
  if(k===-1) return isLeadDeg2 ? '-x<sup>2</sup>' : '(-x<sup>2</sup>)';
  return (k<0 && !isLeadDeg2) ? `(${k}x<sup>2</sup>)` : `${k}x<sup>2</sup>`;
}
function fmtX1(k, degLead){ // degLead = 1 หรือ 2
  if(k===0) return '';
  if(k===1)  return 'x';
  if(k===-1) return (degLead===1 ? '-x' : '(-x)');
  return (k<0 && degLead===2) ? `(${k}x)` : `${k}x`;
}
function fmtC(k){
  if(k===0) return '';
  return (k<0) ? `(${k})` : `${k}`;
}

function coefToHTML({a2,a1,a0}, degLead=null){
  // ใช้ตรรกะเดียวกับการแสดงโจทย์ (ไม่ใส่ [ ])
  const parts=[];
  if(a2){ parts.push(fmtX2(a2,true)); }
  if(a1){ parts.push(fmtX1(a1, a2?2:1)); }
  if(a0){ parts.push(fmtC(a0)); }
  return joinTerms(parts).replace(/\+ \(-/g,'+ (-');
}

// ====== Algebra helpers ======
function addCoef(A,B){ return {a2:A.a2+B.a2, a1:A.a1+B.a1, a0:A.a0+B.a0}; }
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

// ====== Poly builders (กฎจากรอบก่อน ๆ คงเดิม) ======
function buildPolyHTML(deg, rng=15){
  if(deg===2){
    const a = randNZ(rng), b = randNZ(rng), c = randNZ(rng);
    const t2 = fmtX2(a, true);
    const t1 = fmtX1(b, 2);
    const t0 = fmtC(c);
    return {coef:{a2:a,a1:b,a0:c}, html:`[${joinTerms([t2,t1,t0])}]`};
  }else{
    const b = randNZ(rng), c = randNZ(rng);
    const t1 = fmtX1(b, 1);
    const t0 = fmtC(c);
    return {coef:{a2:0,a1:b,a0:c}, html:`[${joinTerms([t1,t0])}]`};
  }
}

// ====== Example generator (ย่อ: เน้นเรื่องแสดงผล/PE) ======
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
    // แสดงเฉพาะที่หารลงตัว และทุกค่าภายใน [-15,15]\{0}
    let divisor,q,dividend;
    do{
      divisor = randNZ(15);
      q = randNZ(15);
      dividend = divisor*q;
    }while(Math.abs(dividend)>15); // ให้ตัวตั้งที่ "แสดง" ไม่เกินช่วงด้วย
    problemText = `${dividend} ÷ ${divisor<0?`(${divisor})`:divisor}`;
    answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); divDivisor.textContent=divisor; if(divQuot) divQuot.value='';
  }else if(mode==='poly_add' || mode==='poly_sub' || mode==='poly_mul'){
    const degP = Math.random()<.5 ? 2 : 1;
    const degQ = Math.random()<.5 ? 2 : 1;
    const rng = (mode==='poly_mul') ? 9 : 15; // คูณจำกัด 9
    const P = buildPolyHTML(degP, rng);
    const Q = buildPolyHTML(degQ, rng);

    if(mode==='poly_add'){
      problemText = `${P.html} + ${Q.html}`;
      answerCoef = addCoef(P.coef, Q.coef);
      problemAnswer = coefToHTML(answerCoef);
    }else if(mode==='poly_sub'){
      problemText = `${P.html} - ${Q.html}`;
      answerCoef = addCoef(P.coef, {a2:-Q.coef.a2, a1:-Q.coef.a1, a0:-Q.coef.a0});
      problemAnswer = coefToHTML(answerCoef);
    }else{
      // คูณ: จำกัดค่าสัมประสิทธิ์ผลลัพธ์ไม่เกิน 36
      let A=P, B=Q, PROD=mulCoef(P.coef,Q.coef);
      let tries=0;
      while((Math.max(Math.abs(PROD.a2),Math.abs(PROD.a1),Math.abs(PROD.a0))>36) && tries<100){
        A = buildPolyHTML(1,9);
        B = buildPolyHTML(1,9);
        PROD = mulCoef(A.coef,B.coef);
        tries++;
      }
      problemText = `${A.html} × ${B.html}`;
      answerCoef = PROD;
      problemAnswer = coefToHTML(answerCoef);
      showWorkspace('mul');
      mulMult.innerHTML = coefToHTML(B.coef);
      mulMcand.innerHTML = coefToHTML(A.coef);
    }
  }else if(mode==='poly_div'){
    // หารพหุนาม: ให้หารลงตัวเสมอ, ตัวหารดีกรี ≤ 1 (รวมรูป sx + t), ตัวตั้งดีกรี 1 หรือ 2
    // ใช้ช่วงกว้างกว่าเล็กน้อยในที่มาของสัมประสิทธิ์เพื่อให้ "ตัวตั้งที่แสดง" อยู่ใน [-15,15]
    const degDividend = Math.random()<.5 ? 2 : 1;

    let a=0,b=0,c=0, s=0,t=0; // divisor = s x + t
    let ok=false, dividendCoef={a2:0,a1:0,a0:0}, quotient={a2:0,a1:0,a0:0};
    while(!ok){
      // สุ่มผลหาร (quotient) เป็นดีกรี degDividend-1 อย่างน้อย 0 (เชิงเส้นหรือค่าคงที่)
      if(degDividend===2){ quotient={a2:0,a1:randNZ(15),a0:randNZ(15)}; }
      else { quotient={a2:0,a1:0,a0:randNZ(15)}; }

      s = randNZ(15); t = randNZ(15); // อนุญาต sx+t (s ≠ 0)
      const divisor = {a2:0,a1:s,a0:t};

      // dividend = quotient * divisor
      dividendCoef = mulCoef(quotient, divisor);

      // ข้อกำหนดแสดงไม่เกิน ±15
      const okRange = Math.max(Math.abs(dividendCoef.a2),Math.abs(dividendCoef.a1),Math.abs(dividendCoef.a0))<=15;
      ok = okRange;
    }

    const divHTML = `[${coefToHTML(dividendCoef)}] ÷ [${coefToHTML({a2:0,a1:s,a0:t})}]`;
    problemText = divHTML;

    // คำตอบคือ quotient
    answerCoef = quotient;
    problemAnswer = coefToHTML(answerCoef);

    // เติมใน workspace
    showWorkspace('div');
    divDivisor.innerHTML = coefToHTML({a2:0,a1:s,a0:t});
    if(divQuot) divQuot.value='';
  }else if(mode==='solve_lin'){
    // ax + b = cx + d  (d แสดงในช่วง ±15)
    let a,b,c,x,d,ok=false;
    while(!ok){
      a=randNZ(15); b=randNZ(15); c=randNZ(15); x = rint(-15,15); if(x===0) continue;
      d = a*x + b - c*x;
      ok = Math.abs(d)<=15;
    }
    problemText = `${a===1?'':a===-1?'-':''}x${b>=0?'+':''}${b} = ${c===1?'':c===-1?'-':''}x${d>=0?'+':''}${d}`.replace(/\+\-/g,'-');
    answerCoef={a2:0,a1:1,a0:-x}; problemAnswer=`x = ${x}`;
    showWorkspace('solve');
  }

  render();
}

// ====== Answer checking ======
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
