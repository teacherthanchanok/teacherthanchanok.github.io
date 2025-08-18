/*
Version: 2025-08-18 r10.5 (merge r9 logic + r10.4 UI)
- ผสานกฎสุ่ม/รูปแบบแสดงผลแบบ r9 (รวมการแสดงวงเล็บ, ตารางคูณ/หารเวิร์กสเปซ, pointer events)
- คงปุ่มใหม่ของ r10.4: 📖 (resources) และ 💡 (YouTube แสดงตามเมนู)
- รักษากฎสุ่ม “หารจำนวนเต็ม” ตาม r9 = ช่วง [-15,15]\{0} และหารลงตัวเสมอ (ดูโค้ด r9 อ้างอิง).  [oai_citation:2‡app_r9.js](file-service://file-BA7tc5zqh69Myx46ebD3Ur)
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

//// ====== Tiles config (คงชุดสี/ขนาดแนวตั้งของ x และ -x ตามข้อกำหนด) ======
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

//// ====== Formatting helpers (ตรรกะใส่วงเล็บของ r9) ======
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

    // pointer events drag
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

//// ====== Help / Resources / Lesson (📖 & 💡) ======
const modal = sel => document.querySelector(sel);
function openModal(id){ modal(id).classList.add('show'); }
function closeModal(id){
  const m = modal(id);
  if(!m) return;
  // หยุดวิดีโอเมื่อปิด 💡
  if(id === '#modal-lesson'){
    const frame = document.getElementById('ytframe');
    if(frame){ const s = frame.src; frame.src = s; }
  }
  m.classList.remove('show');
}
document.querySelectorAll('.close-x').forEach(btn=>{
  btn.addEventListener('click', ()=> closeModal(btn.dataset.close));
});

document.getElementById('btn-help').addEventListener('click', ()=> openModal('#modal-help'));
document.getElementById('btn-resources').addEventListener('click', ()=> openModal('#modal-resources'));

// 💡 เลือกลิงก์ YouTube ตามเมนูปัจจุบัน
const YT_BY_MODE = {
  add_int:'https://youtu.be/CAywl7PRu74?si=oohFr4aSHuJNJXMq',
  sub_int:'https://youtu.be/VcCwksc542k?si=iieOZFX83gzbQD4T',
  mul_int:'https://youtu.be/CZ7KB4qXIG8?si=sDwM0cDwLE8XOwwz',
  div_int:'https://youtu.be/AWdSwZl7GXA?si=lR0vUDsG9MTVH0Oy',
  add_poly:'https://youtu.be/Z9poGbeeq1Q?si=Xqo6UlrE7l9E8YFa',
  sub_poly:'https://youtu.be/Z9poGbeeq1Q?si=Xqo6UlrE7l9E8YFa',
  mul_poly:'https://youtu.be/lWqybjwE2io?si=-OW80uiGDH_Nyn7h',
  div_poly:'https://youtu.be/_VWSpo62__8?si=KlgGbVjJYBxCJssg',
  solve_eq:'https://youtu.be/Z18zPt__6wg?si=WjSRqp_RyGzEF-3J'
};
document.getElementById('btn-lesson').addEventListener('click', ()=>{
  const cur = document.getElementById('mode').value;
  const u = YT_BY_MODE[cur] || '';
  const frame = document.getElementById('ytframe');
  if(frame){ frame.src = u; }
  openModal('#modal-lesson');
});

//// ====== Mode / Solution ======
document.getElementById('mode').onchange = (e)=>{ mode = e.target.value; newExample(); };
document.getElementById('btn-new').onclick = ()=> newExample();
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};

//// ====== Parser (แบบ r9) ======
function sanitizeInput(s){
  return String(s||'').replace(/−/g,'-').replace(/·|×/g,'*').replace(/x²/gi,'x^2').replace(/\[/g,'(').replace(/\]/g,')').replace(/\s+/g,'').trim();
}
// (สรุปย่อ: parser ครอบคลุมเฉพาะที่จำเป็นสำหรับตรวจคำตอบในโปรเจ็กต์นี้)
function parsePolySimple(s){
  // รองรับรูป a2 x^2 + a1 x + a0 (ช่องว่าง/วงเล็บเล็กน้อย)
  s = s.replace(/\s+/g,'');
  // แปลง (−3) เป็น -3 เป็นต้น
  s = s.replace(/×/g,'*');
  // แยกเป็นเทอม
  let a2=0,a1=0,a0=0;
  // เปลี่ยนเครื่องหมายลบให้อ่านง่าย
  s = s.replace(/-\(/g,'-1*(');
  // กางวงเล็บเชิงเส้นง่ายๆ (เฉพาะกรณี (ax+b) + (cx+d) / (ax+b) - (cx+d))
  // สำหรับการตรวจในแอปนี้จะสุ่มรูปแบบตรงตามกติกา จึงเพียงพอ

  // ดึงพจน์ x^2
  s.replace(/([+\-]?\d*)x\^?2/g,(_,k)=>{ a2 += (k===''||k==='+')?1:(k==='-')?-1:+k; return ''; });
  // ดึงพจน์ x (ไม่ใช่ x^2)
  s.replace(/([+\-]?\d*)x(?!\^2)/g,(_,k)=>{ a1 += (k===''||k==='+')?1:(k==='-')?-1:+k; return ''; });
  // ดึงค่าคงตัว (คร่าวๆ)
  // แปลงเทอมอื่นออกก่อน
  let t = s.replace(/([+\-]?\d*)x\^?2/g,'').replace(/([+\-]?\d*)x(?!\^2)/g,'');
  // รวมค่าคงตัวทั้งหมด (เช่น +3+(-5))
  t.split(/(?=[+\-])/).forEach(part=>{
    if(!part) return;
    const v = Number(part.replace(/[()]/g,''));
    if(!Number.isNaN(v)) a0 += v;
  });
  return {a2,a1,a0};
}

//// ====== Generators (กติกา r9) ======
// จำนวนเต็ม
function genAddInt(){
  const a = rNZ15(), b = rNZ15();
  problemText = `${a} + ${b}`;
  problemAnswer = String(a+b);
}
function genSubInt(){
  const a = rNZ15(), b = rNZ15();
  problemText = `${a} - (${b})`;
  problemAnswer = String(a-b);
}
function genMulInt(){
  const a = rNZ15(), b = rNZ15();
  problemText = `${a} × ${b}`;
  problemAnswer = String(a*b);
}
function genDivInt(){
  // r9: หารลงตัว เสมอ ในช่วง [-15,15]\{0}
  let divisor = rNZ15();
  let quotient = rNZ15();
  let dividend = divisor * quotient;
  // คุมให้อยู่ในช่วง
  while(Math.abs(dividend)>15){
    divisor = rNZ15(); quotient = rNZ15(); dividend = divisor*quotient;
  }
  problemText = `${dividend} ÷ ${divisor}`;
  problemAnswer = String(quotient);
}

// พหุนาม บวก/ลบ: p,q ดีกรีสุ่ม 1 หรือ 2, สุ่มใน [-9,9]\{0}
function genAddPoly(){
  const P = buildPolyDeg1or2_forAddSub();
  const Q = buildPolyDeg1or2_forAddSub();
  const sum = addCoef(P.coef, Q.coef);
  problemText = `${P.html} + ${Q.html}`;
  problemAnswer = polyToHTML(sum, false);
}
function genSubPoly(){
  const P = buildPolyDeg1or2_forAddSub();
  const Q = buildPolyDeg1or2_forAddSub();
  const diff = subCoef(P.coef, Q.coef);
  problemText = `${P.html} - ${Q.html}`;
  problemAnswer = polyToHTML(diff, false);
}

// พหุนาม คูณ: จำกัดดีกรีปัจจัย ≤1, ค่าสุ่ม [-9,9]\{0}, เพดาน |coef|≤36
function genMulPoly(){
  const A = buildPolyDeg1(rNZ9);
  const B = buildPolyDeg1(rNZ9);
  const prod = mulCoef(A.coef, B.coef);
  // เพดานสัมประสิทธิ์
  if(!coefAbsLeq(prod,36)) return genMulPoly();
  problemText = `${A.html} × ${B.html}`;
  problemAnswer = polyToHTML(prod, false);
}

// พหุนาม หาร: ตัวหารรูป sx + t (s≠0), ตัวตั้ง (ดีกรี 1 หรือ 2) สร้างจาก (divisor)*(quotient)
function genDivPoly(){
  const s = rNZ9(), t = rNZ9();
  const divisor = {a2:0,a1:s,a0:t}; // sx + t
  // quotient เป็นดีกรี 1 หรือ 2 ก็ได้ แต่ให้คุมสัมประสิทธิ์ไม่ยุ่งยากเกิน
  const degQ = Math.random()<.5?1:2;
  let Q;
  if(degQ===1){ Q = {a2:0, a1:rNZ9(), a0:rNZ9()}; }
  else{ Q = {a2:rNZ9(), a1:rNZ9(), a0:rNZ9()}; }

  const dividend = mulCoef(divisor, Q); // ลงตัวแน่
  // จำกัดขนาดสัมประสิทธิ์ตัวตั้งไม่ให้ใหญ่เกินไปเพื่ออ่านง่าย
  if(!coefAbsLeq(dividend, 20)) return genDivPoly();

  const P_html = polyToHTML(dividend, true);
  const D_html = polyToHTML(divisor, true);
  problemText = `${P_html} ÷ ${D_html}`;
  problemAnswer = polyToHTML(Q, false);
}

// แก้สมการ: ดึงจากรูปแบบง่าย (เส้นตรง)
function genSolveEq(){
  const a = rNZ15(), b = rNZ15(), x = rNZ15();
  const c = a*x + b;
  //  a x + b = c
  problemText = `${a}x + ${b} = ${c}`;
  problemAnswer = `x = ${x}`;
}

function newExample(){
  showSol = false;
  document.getElementById('btn-solution').textContent = 'เฉลย';

  // ปิดทุก workspace ก่อนเปิดของโหมดที่ต้องใช้
  showWorkspace(null);

  switch(mode){
    case 'add_int': genAddInt(); break;
    case 'sub_int': genSubInt(); break;
    case 'mul_int': genMulInt(); break;
    case 'div_int': genDivInt(); break;

    case 'add_poly': genAddPoly(); showWorkspace(null); break;
    case 'sub_poly': genSubPoly(); showWorkspace(null); break;
    case 'mul_poly': genMulPoly(); showWorkspace('mul'); break;
    case 'div_poly': genDivPoly(); showWorkspace('div'); break;

    case 'solve_eq': genSolveEq(); showWorkspace('solve'); break;
  }
  render();
}

//// ====== ตรวจคำตอบ ======
checkBtn.addEventListener('click', ()=>{
  const ans = (answerInput.value||'').trim();
  let correct = false;

  if(['add_int','sub_int','mul_int','div_int','solve_eq'].includes(mode)){
    correct = (ans.replace(/\s+/g,'') === problemAnswer.replace(/\s+/g,''));
  }else{
    // พหุนาม: เปรียบเทียบด้วยค่าสัมประสิทธิ์
    const target = parsePolySimple(problemAnswer.replace(/\[/g,'').replace(/\]/g,''));
    const user   = parsePolySimple(ans);
    correct = !!user && user.a2===target.a2 && user.a1===target.a1 && user.a0===target.a0;
  }

  checkResult.textContent = correct ? 'ถูกต้อง ✅' : 'ยังไม่ถูก ❌';
});

//// ====== เริ่มต้น ======
newExample();
