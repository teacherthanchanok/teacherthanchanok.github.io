/*
Version: 2025-08-16-fullrules-pe2
Changelog:
- เปลี่ยนเป็น Pointer Events ทั้งหมด + listener non-passive ในจุดที่ preventDefault()
- รวมกฎสุ่มโจทย์ครบ: พหุนาม บวก/ลบ/คูณ/หาร, จำกัดช่วง, เพดานผลคูณ, หารลงตัว
- การหารจำนวนเต็ม: แสดงทุกจำนวนในช่วง [-15,15], ไม่เอา 0, dividend ไม่เกินขอบเขต
- ตัวหารพหุนามรองรับรูป sx+t (s ≠ 0 และอนุญาต s ≠ 1 ตามที่ขอ), ตัวตั้งสุ่มจากผลคูณ (ลงตัว)
- Solution ใช้ format ตรรกะเดียวกับโจทย์ (แต่ไม่ครอบ [ ])
- ตาราง mul/div แสดงตัวประกอบตรงตามรูปแบบ
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

// input fields must not start board drag
['pointerdown'].forEach(evt=>{
  [divQuot, answerInput, normalizeInput].forEach(el=>{
    if(!el) return;
    el.addEventListener(evt, e=>{ e.stopPropagation(); }, {passive:false});
  });
});

// ====== Tiles config ======
const TYPES = {
  x2:      {labelHTML:'x<sup>2</sup>',   w:120, h:120, color:'var(--blue)',   shape:'square', neg:'neg_x2'},
  neg_x2:  {labelHTML:'-x<sup>2</sup>',  w:120, h:120, color:'var(--red)',    shape:'square', neg:'x2'},
  x:       {labelHTML:'x',               w:30,  h:120, color:'var(--green)',  shape:'rect',   neg:'neg_x'},      // แนวตั้ง
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

// RNG ±1..maxAbs (ไม่เอา 0)
function randNZ(maxAbs=15){
  let v=0; while(v===0){ v = (Math.random()<.5?-1:1) * (Math.floor(Math.random()*maxAbs)+1); }
  return v;
}
function rint(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

// Workspace visibility
function showWorkspace(which){
  wsSolve.style.display = (which==='solve') ? 'block':'none';
  wsMul.style.display   = (which==='mul')   ? 'block':'none';
  wsDiv.style.display   = (which==='div')   ? 'block':'none';
}

// pointer helpers
function ptFromClient(cx, cy){
  const rect = board.getBoundingClientRect();
  return { x: (cx - rect.left)/zoom, y: (cy - rect.top)/zoom };
}
function pt(e){ return ptFromClient(e.clientX, e.clientY); }

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
const fmtTerm = {
  x2(k, isLeadDeg2){
    if(k===1)  return 'x<sup>2</sup>';
    if(k===-1) return isLeadDeg2 ? '-x<sup>2</sup>' : '(-x<sup>2</sup>)';
    return (k<0 && !isLeadDeg2) ? `(${k}x<sup>2</sup>)` : `${k}x<sup>2</sup>`;
  },
  x1(k, deg){
    if(k===1)  return 'x';
    if(k===-1) return (deg===1 ? '-x' : '(-x)');
    return (k<0 && deg===2) ? `(${k}x)` : `${k}x`;
  },
  c(k){
    return (k<0) ? `(${k})` : `${k}`;
  }
};

// สร้างพหุนามตามกฎข้อ 3/4 และคืนทั้ง coef และ html
function buildPolyByDegree(deg, maxAbs){
  if(deg===2){
    const a = randNZ(maxAbs), b = randNZ(maxAbs), c = randNZ(maxAbs);
    const inner = [
      fmtTerm.x2(a,true),
      ' + ' + fmtTerm.x1(b,2),
      ' + ' + fmtTerm.c(c)
    ].join('').replace(/\+ \(-/g,'+ (-').replace(/\+ -/g,'+ (-');
    return { coef:{a2:a,a1:b,a0:c}, html: `[${inner}]` };
  }else{
    const b = randNZ(maxAbs), c = randNZ(maxAbs);
    const inner = [
      fmtTerm.x1(b,1),
      ' + ' + fmtTerm.c(c)
    ].join('').replace(/\+ \(-/g,'+ (-').replace(/\+ -/g,'+ (-');
    return { coef:{a2:0,a1:b,a0:c}, html: `[${inner}]` };
  }
}

// แปลง coef -> html โดยใช้กฎวงเล็บเดียวกับโจทย์ (แต่ไม่ครอบ [])
function coefToPrettyHTML({a2,a1,a0}){
  const parts=[];
  if(a2){ parts.push((a2===1?'':a2===-1?'-':a2)+'x<sup>2</sup>'); }
  if(a1){
    if(a2) parts.push(' + ' + (a1===1?'':a1===-1?'-':fmtTerm.x1(a1, a2?2:1)));
    else   parts.push((a1===1?'x':a1===-1?'-x':fmtTerm.x1(a1, a2?2:1)));
  }
  if(a0){
    if(a2 || a1) parts.push(' + ' + fmtTerm.c(a0));
    else parts.push(fmtTerm.c(a0));
  }
  const s = parts.join('').replace(/\+ \(-/g,'+ (-').replace(/\+ -/g,'+ (-');
  return s || '0';
}

// รวม/คูณ coef
function addCoef(A,B){ return {a2:A.a2+B.a2, a1:A.a1+B.a1, a0:A.a0+B.a0}; }
function subCoef(A,B){ return {a2:A.a2-B.a2, a1:A.a1-B.a1, a0:A.a0-B.a0}; }
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

// ตรวจเพดานหลังคูณ (|coef| <= maxAbs)
function withinCap(coef, maxAbs){
  return Math.abs(coef.a2)<=maxAbs && Math.abs(coef.a1)<=maxAbs && Math.abs(coef.a0)<=maxAbs;
}

// ====== Parser สำหรับตรวจคำตอบ (รองรับ [] ) ======
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
function equalsCoef(a,b){ return a.a2===b.a2 && a.a1===b.a1 && a.a0===b.a0; }

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

    // tile pointerdown
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
const beginZone = (e)=>{
  if(e.button!==undefined && e.button!==0) return; // mouse right
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
};
const moveZone = (e)=>{
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
};
const endZone = ()=>{
  if(dragging) dragging=null;
  if(selRect){
    const {x0,y0,x1,y1} = selRect;
    const minx=Math.min(x0,x1),maxx=Math.max(x0,x1),miny=Math.min(y0,y1),maxy=Math.max(y0,y1);
    selection = new Set(tiles.filter(t=> t.x>=minx && t.y>=miny && (t.x+t.w)<=maxx && (t.y+t.h)<=maxy).map(t=>t.id));
    selRect=null; render();
  }
};

board.addEventListener('pointerdown', beginZone, {passive:false});
window.addEventListener('pointermove', moveZone, {passive:false});
window.addEventListener('pointerup', endZone, {passive:false});
window.addEventListener('pointercancel', endZone, {passive:false});

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
  const gap = 18;
  let dx = 0, dy = 0;
  const clones = selectedTiles.map((t,i)=>{
    const spot = findFreeSpot(t.w, t.h);
    const extra = {x: spot.x + dx, y: spot.y + dy};
    dx += gap; dy += gap/2;
    return {...t, id:uid(), x:extra.x, y:extra.y};
  });
  tiles = [...tiles, ...clones];
  selection.clear();           // ยกเลิก select ต้นฉบับ
  clones.forEach(c=> selection.add(c.id)); // select ตัวใหม่แทน
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
  if(ytframe){ const src = ytframe.src; ytframe.src = src; }
}

// ====== สุ่มโจทย์ ======
let lastMulStrings = {mcand:'?', mult:'?'};
let lastDivStrings = {dividend:'?', divisor:'?', quotient:'?'};

function newExample(){
  showSol=false; document.getElementById('btn-solution').textContent='เฉลย';
  answerInput.value=''; checkResult.textContent='';
  tiles=[]; selection.clear();
  showWorkspace(null);

  // โหมดจำนวนเต็ม
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
    showWorkspace('mul'); if(mulMult) mulMult.textContent=(b); if(mulMcand) mulMcand.textContent=(a);
    lastMulStrings = {mcand:String(a), mult:String(b)};
  }else if(mode==='int_div'){
    // ทั้งตัวหาร/ตัวตั้ง/ผลหาร อยู่ใน [-15,15] ไม่เอา 0 และตัวตั้งต้องไม่เกินขอบด้วย
    let divisor, q, dividend;
    do{
      divisor = randNZ(15);
      q       = randNZ(15);
      dividend = divisor*q;
    }while(Math.abs(dividend)>15); // จำกัดตัวตั้งด้วย
    problemText = `${dividend} ÷ ${divisor<0?`(${divisor})`:divisor}`;
    answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); if(divDivisor) divDivisor.textContent=divisor; if(divQuot) divQuot.value='';
    lastDivStrings = {dividend:String(dividend), divisor:String(divisor), quotient:String(q)};
  }

  // โหมดพหุนาม (ตามกฎล่าสุด)
  else if(mode==='poly_add' || mode==='poly_sub'){
    const degP = Math.random()<.5 ? 2 : 1;
    const degQ = Math.random()<.5 ? 2 : 1;
    const P = buildPolyByDegree(degP, 9);
    const Q = buildPolyByDegree(degQ, 9);

    if(mode==='poly_add'){
      problemText = `${P.html} + ${Q.html}`;
      answerCoef  = addCoef(P.coef, Q.coef);
      problemAnswer = coefToPrettyHTML(answerCoef);   // เฉลยไม่ติด []
    }else{
      problemText = `${P.html} - ${Q.html}`;
      answerCoef  = subCoef(P.coef, Q.coef);
      problemAnswer = coefToPrettyHTML(answerCoef);
    }
  }else if(mode==='poly_mul'){
    // กฎ: ทั้งสองข้างดีกรีไม่เกิน 1, ค่าสุ่มใน [-9,9]\{0}, และเพดานผลคูณ |coef|<=36
    let P,Q,prod;
    do{
      const pDeg = 1, qDeg = 1;       // บังคับ deg ≤ 1 ทั้งคู่
      P = buildPolyByDegree(pDeg, 9);
      Q = buildPolyByDegree(qDeg, 9);
      prod = mulCoef(P.coef, Q.coef);
    }while(!withinCap(prod,36));
    problemText = `${P.html} × ${Q.html}`;
    answerCoef  = prod;
    problemAnswer = coefToPrettyHTML(answerCoef);
    showWorkspace('mul');
    if(mulMult)  mulMult.innerHTML  = coefToPrettyHTML(Q.coef);
    if(mulMcand) mulMcand.innerHTML = coefToPrettyHTML(P.coef);
    lastMulStrings = {mcand:coefToPrettyHTML(P.coef), mult:coefToPrettyHTML(Q.coef)};
  }else if(mode==='poly_div'){
    // กฎล่าสุด:
    // - ตัวหาร: sx + t, s ∈ [-20,20]\{0}, อนุญาตสหกรณ์ทั่วไป (รวมทั้ง s≠1 ได้)
    // - ตัวตั้ง (dividend) = (quotient poly) * (divisor) และต้อง "หารลงตัว"
    // - โควตา (quotient) อาจดีกรี 1 หรือ 2; สุ่ม coef จาก [-20,20]\{0}
    // - แสดง dividend ที่ได้หลังคูณ และตรวจว่า |coef| ของ dividend ≤ 20 และไม่มีศูนย์
    let s,t,degQ,qPoly,dividend,ok=false;
    while(!ok){
      s = randNZ(20);                 // อนุญาต ±2..±20 รวมทั้ง -1 และ 1 ด้วยก็ได้ แต่ถ้าอยากกัน 1 ให้เพิ่ม while(s===1) s=randNZ(20);
      t = randNZ(20);
      const chooseDeg = (Math.random()<.5?1:2);
      qPoly = buildPolyByDegree(chooseDeg, 20).coef;  // โควตา
      const divisor = {a2:0,a1:s,a0:t};               // sx + t
      dividend = mulCoef(qPoly, divisor);
      // ตรวจ dividend ไม่เกิน ±20 และไม่มีค่าสัมประสิทธิ์เป็น 0 (ถ้า term นั้นควรอยู่)
      const inRange = Math.abs(dividend.a2)<=20 && Math.abs(dividend.a1)<=20 && Math.abs(dividend.a0)<=20;
      const nonZeroOK = true; // อนุญาตศูนย์ในพจน์ที่ไม่เกิดขึ้นได้ (เช่น ถ้าดีกรีท้าย ๆ หาย) — หากต้อง “ไม่เอา 0 ทุกสัมประสิทธิ์” ให้เปลี่ยนเป็น: (dividend.a2!==0 || qPoly.a2!==0) && (dividend.a1!==0) && (dividend.a0!==0)
      ok = inRange && nonZeroOK;
    }
    // แสดงผล
    const divisorHTML  = `[${fmtTerm.x1(s,1)} + ${fmtTerm.c(t)}]`.replace(/\+ \(-/g,'+ (-');
    const dividendHTML = `[${coefToPrettyHTML(dividend)}]`;
    problemText = `${dividendHTML} ÷ ${divisorHTML}`;
    answerCoef  = qPoly;                                 // โควตาคือคำตอบ
    problemAnswer = coefToPrettyHTML(answerCoef);        // เฉลยไม่ติด []

    showWorkspace('div');
    if(divDivisor) divDivisor.innerHTML = `${(s===1?'':s===-1?'-':'')+'x'}${t>=0?'+':''}${t}`.replace(/\+\-/g,'-');
    if(divQuot)    divQuot.value = '';
    lastDivStrings = {dividend:coefToPrettyHTML(dividend), divisor:`${(s===1?'':s===-1?'-':'')+'x'}${t>=0?'+':''}${t}`, quotient:coefToPrettyHTML(qPoly)};
  }else if(mode==='solve_lin'){
    // ax + b = cx + d โดย x ∈ [-15,15]\{0} และ d แสดงไม่เกิน ±15
    let a,b,c,x,d,ok=false;
    while(!ok){
      a=randNZ(15); b=randNZ(15); c=randNZ(15);
      x = rint(-15,15); if(x===0) continue;
      d = a*x + b - c*x;
      if(Math.abs(d)<=15){ ok=true; }
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

// ====== เริ่มทำงาน ======
document.getElementById('mode').addEventListener('change', (e)=>{ mode = e.target.value; newExample(); });
document.getElementById('btn-new').addEventListener('click', ()=> newExample());
document.getElementById('btn-solution').addEventListener('click', (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
});

document.getElementById('btn-new').focus();
newExample();
render();
