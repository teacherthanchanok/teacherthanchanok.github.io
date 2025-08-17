/* Algebra Tiles by Kru Zack — app.js  (quiz-integrated)  v2025-08-17a
   เพิ่มโหมดแบบทดสอบก่อน/หลังเรียน + ตัวจับเวลา + บันทึกคะแนนไป Google Sheet (ถ้า login แล้ว)
   หมายเหตุ: โค้ดส่วนกระเบื้อง/กฎสุ่มดั้งเดิมยังคงเดิมทั้งหมด
*/

// ====== CONFIG สำหรับบันทึกคะแนน ======
const GAS_URL = "https://script.google.com/macros/s/AKfycbxVEsAHPrttyRtmX2P_CLNemCV_mdc7cFb7nK1N93hB0QmmqrCxTXHYdhAoCoAoBPVYVg/exec";
const SHEET_NAME = "data";

// ====== DOM หลักเดิม ======
const board = document.getElementById('board');
const palette = document.getElementById('palette');
const solutionBox = document.getElementById('solution');
const problemBox = document.getElementById('problem');
const answerInput = document.getElementById('answerInput');
const checkBtn = document.getElementById('btn-check');
const checkResult = document.getElementById('checkResult');
const workRow = document.getElementById('work-row');
const tilesWrap = document.getElementById('tiles-wrap');

// โหมดตารางคูณ/หาร
const wsSolve = document.getElementById('ws-solve');
const wsMul   = document.getElementById('ws-mul');
const wsDiv   = document.getElementById('ws-div');
const mulMult = document.getElementById('mul-mult');
const mulMcand= document.getElementById('mul-mcand');
const divDivisor = document.getElementById('div-divisor');
const divQuot    = document.getElementById('div-quot');

// ทำให้ input ไม่เริ่มลาก
['pointerdown'].forEach(evt=>{
  if(divQuot) divQuot.addEventListener(evt, e=>e.stopPropagation(), {passive:false});
  if(answerInput) answerInput.addEventListener(evt, e=>e.stopPropagation(), {passive:false});
});

// ====== โซนแบบทดสอบ ======
const quizPage   = document.getElementById('quizPage');
const quizTitle  = document.getElementById('quizTitle');
const quizForm   = document.getElementById('quizForm');
const quizTimeEl = document.getElementById('quizTime');
const quizBar    = document.getElementById('quizBar');
const quizSubmit = document.getElementById('quizSubmit');
const quizExit   = document.getElementById('quizExit');
const quizModal  = document.getElementById('quizModal');
const quizModalX = document.getElementById('quizModalX');
const quizModalClose = document.getElementById('quizModalClose');
const quizModalTitle = document.getElementById('quizModalTitle');
const quizModalBody  = document.getElementById('quizModalBody');

// ====== เข้าสู่ระบบง่าย ๆ (จำไว้ในหน้านี้) ======
const loginBtn = document.getElementById('btn-login');
const loginModal = document.getElementById('loginModal');
const loginModalX = document.getElementById('loginModalX');
const btnDoLogin = document.getElementById('btnDoLogin');
const inpName = document.getElementById('inpName');
const inpLastname = document.getElementById('inpLastname');
const inpClass = document.getElementById('inpClass');

window.currentUser = null; // {name, lastname, Class}

// เปิด/ปิด login
if(loginBtn){
  loginBtn.onclick = ()=> loginModal.style.display='flex';
}
if(loginModalX){
  loginModalX.onclick = ()=> loginModal.style.display='none';
}
if(btnDoLogin){
  btnDoLogin.onclick = ()=>{
    const name = (inpName.value||'').trim();
    const lastname = (inpLastname.value||'').trim();
    const Class = (inpClass.value||'').trim();
    if(!name || !lastname || !Class){ alert('กรอกข้อมูลให้ครบก่อนค่ะ'); return; }
    window.currentUser = {name, lastname, Class};
    loginModal.style.display='none';
    alert('บันทึกข้อมูลเข้าสู่ระบบเรียบร้อย');
  };
}

// ====== Tiles config (ของเดิม) ======
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
let answerCoef = {a2:0,a1:0,a0:0};

// ====== Utils เดิม ======
const uid = ()=> Math.random().toString(36).slice(2);
const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));
function randNZRange(a,b){ // random int in [a,b] excluding 0
  let v=0; while(v===0){ v = Math.floor(Math.random()*(b-a+1))+a; }
  return v;
}
function randNZ(){ return randNZRange(-15,15); }
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
  const cx = e.clientX;
  const cy = e.clientY;
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

// ====== Render tiles ======
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

    // pointer handlers
    const startDrag = (e)=>{
      e.stopPropagation(); e.preventDefault();
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
      dragging = {ids, offsets};
      render();
    };
    el.addEventListener('pointerdown', startDrag, {passive:false});
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
  el.addEventListener('pointerdown', (e)=>{e.preventDefault(); addTile();}, {passive:false});
});

// ====== Board interactions (Pointer Events) ======
const beginZone = (e)=>{
  if(e.button!==undefined && e.button!==0) return;
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
    const p = pt(e);
    tiles = tiles.map(t=>{
      const off = dragging.offsets.find(o=>o.id===t.id);
      if(!off) return t;
      return {...t, x:p.x - off.dx, y:p.y - off.dy};
    });
    render();
  }else if(selRect){
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

// ====== Toolbar actions (ของเดิม) ======
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
  selection.clear(); // ยกเลิก select ของต้นฉบับ
  clones.forEach(c=> selection.add(c.id));
  render();
};
document.getElementById('btn-zoom-in').onclick  = ()=>{ zoom = clamp(zoom*1.25, .4, 2.2); render(); };
document.getElementById('btn-zoom-out').onclick = ()=>{ zoom = clamp(zoom*0.8,  .4, 2.2); render(); };

// popup ช่วยเหลือ + หยุดวิดีโอเมื่อปิด
const help = document.getElementById('help');
const ytframe = document.getElementById('ytframe');
document.getElementById('btn-help').onclick   = ()=> help.style.display='flex';
document.getElementById('help-x').onclick     = closeHelp;
function closeHelp(){
  help.style.display='none';
  if(ytframe){ const src = ytframe.src; ytframe.src = src; }
}

// ====== เปลี่ยนโหมด ======
document.getElementById('mode').onchange = (e)=>{ mode = e.target.value; handleModeChange(); };
document.getElementById('btn-new').onclick = ()=> newExample();
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};

// ====== QUIZ DATA (20 ข้อ/รายการ) ======
function h(s){return s.replace(/\^2/g,'<sup>2</sup>');}

const PRE_QUESTIONS = [
  {q:"-7 + 12 = ?", opts:["-19","5","19","-5"], a:1},
  {q:"14 - (-9) = ?", opts:["23","5","-23","-5"], a:0},
  {q:"(-6) × 8 = ?", opts:["-48","48","-14","14"], a:0},
  {q:"54 ÷ -9 = ?", opts:["-6","6","-9","9"], a:0},
  {q:h("(2x^2 + 3x - 5) + (x^2 - 4x + 6)"), opts:[h("3x^2 - x + 1"), h("3x^2 + 7x + 11"), h("x^2 - x + 11"), h("2x^2 - x + 1")], a:0},
  {q:h("(-x^2 + 4x + 7) + (2x^2 - 3x - 2)"), opts:[h("x^2 + x + 5"), h("-x^2 + x + 5"), h("x^2 - x - 5"), h("-x^2 + x - 5")], a:0},
  {q:h("(3x^2 - 5x + 1) + (-2x^2 + x - 4)"), opts:[h("x^2 - 4x - 3"), h("x^2 + 4x + 5"), h("-x^2 + 4x - 3"), h("x^2 - 4x + 3")], a:0},
  {q:h("(4x^2 + 3x - 6) - (2x^2 - x + 5)"), opts:[h("2x^2 + 4x - 11"), h("6x^2 + 2x - 1"), h("2x^2 + 4x - 1"), h("2x^2 - 2x - 11")], a:0},
  {q:h("(x^2 - 4x + 3) - (2x^2 - 3x - 5)"), opts:[h("-x^2 - x + 8"), h("-x^2 + x - 8"), h("x^2 - x + 8"), h("-x^2 - x - 8")], a:0},
  {q:h("(5x^2 + 2x - 9) - (3x^2 - 4x + 1)"), opts:[h("2x^2 + 6x - 10"), h("8x^2 - 2x - 10"), h("2x^2 - 2x - 8"), h("8x^2 + 6x - 10")], a:0},
  {q:h("(x + 3)(x - 2)"), opts:[h("x^2 + x - 6"), h("x^2 - x + 6"), h("x^2 - 5x - 6"), h("x^2 + 5x - 6")], a:0},
  {q:h("(2x - 1)(x + 4)"), opts:[h("2x^2 + 7x - 4"), h("2x^2 - 7x + 4"), h("2x^2 + 3x + 4"), h("2x^2 - 3x - 4")], a:0},
  {q:h("(x - 5)(x - 1)"), opts:[h("x^2 - 6x + 5"), h("x^2 + 6x + 5"), h("x^2 - 4x - 5"), h("x^2 - 6x - 5")], a:0},
  {q:h("(x^2 + 5x + 6) ÷ (x + 2)"), opts:[h("x + 3"), h("x - 3"), h("x + 2"), h("x - 2")], a:0},
  {q:h("(2x^2 - 3x - 2) ÷ (x - 2)"), opts:[h("2x + 1"), h("2x - 1"), h("x + 2"), h("x - 2")], a:0},
  {q:h("(x^2 - 9) ÷ (x - 3)"), opts:[h("x + 3"), h("x - 3"), h("x + 9"), h("x - 9")], a:0},
  {q:"2x + 5 = 15", opts:["x = 5","x = -5","x = 10","x = -10"], a:0},
  {q:"3x - 7 = 2", opts:["x = 3","x = -3","x = 5","x = -5"], a:0},
  {q:"5x + 9 = -6", opts:["x = -3","x = 3","x = -15","x = 15"], a:0},
  {q:"4x - 12 = 0", opts:["x = 3","x = -3","x = 12","x = -12"], a:0},
];

const POST_QUESTIONS = [
  {q:"-15 + 8 = ?", opts:["-23","-7","23","7"], a:1},
  {q:"-12 - (-5) = ?", opts:["-17","-7","7","17"], a:1},
  {q:"(-9) × (-4) = ?", opts:["-36","36","13","-13"], a:1},
  {q:"(-45) ÷ 5 = ?", opts:["-9","9","-5","5"], a:0},
  {q:h("(3x^2 - 2x + 7) + (x^2 + 5x - 4)"), opts:[h("4x^2 + 3x + 3"), h("2x^2 + 7x + 3"), h("4x^2 - 7x + 3"), h("3x^2 + 7x + 11")], a:0},
  {q:h("(-2x^2 + 6x - 1) + (5x^2 - 3x + 4)"), opts:[h("3x^2 + 3x + 3"), h("-7x^2 + 9x + 3"), h("7x^2 + 3x - 5"), h("3x^2 - 9x + 3")], a:0},
  {q:h("(4x^2 + x - 5) + (2x^2 - 3x + 6)"), opts:[h("6x^2 - 2x + 1"), h("2x^2 + 4x + 1"), h("6x^2 + 4x + 11"), h("2x^2 - 2x - 1")], a:0},
  {q:h("(6x^2 - 3x + 2) - (4x^2 + x - 5)"), opts:[h("2x^2 - 4x + 7"), h("10x^2 - 2x - 3"), h("2x^2 + 4x - 7"), h("6x^2 - 4x + 7")], a:0},
  {q:h("(x^2 + 7x - 4) - (3x^2 - 2x + 1)"), opts:[h("-2x^2 + 9x - 5"), h("-2x^2 - 9x - 5"), h("2x^2 + 9x - 3"), h("-2x^2 + 5x + 1")], a:0},
  {q:h("(2x^2 + 5x + 9) - (x^2 - 4x + 3)"), opts:[h("x^2 + 9x + 6"), h("3x^2 + x + 12"), h("x^2 + x + 12"), h("x^2 - 9x - 6")], a:0},
  {q:h("(x + 4)(x - 3)"), opts:[h("x^2 + x - 12"), h("x^2 - x + 12"), h("x^2 + 7x - 12"), h("x^2 - 7x + 12")], a:0},
  {q:h("(2x + 5)(x - 2)"), opts:[h("2x^2 + x - 10"), h("2x^2 - x + 10"), h("2x^2 + 3x - 10"), h("2x^2 - 3x + 10")], a:0},
  {q:h("(x - 7)(x + 2)"), opts:[h("x^2 - 5x - 14"), h("x^2 + 5x + 14"), h("x^2 - 9x + 14"), h("x^2 + 9x - 14")], a:0},
  {q:h("(x^2 + 7x + 10) ÷ (x + 5)"), opts:[h("x + 2"), h("x + 5"), h("x - 2"), h("x - 5")], a:0},
  {q:h("(3x^2 + 5x - 2) ÷ (x + 2)"), opts:[h("3x - 1"), h("3x + 1"), h("x + 3"), h("x - 3")], a:0},
  {q:h("(x^2 - 16) ÷ (x - 4)"), opts:[h("x + 4"), h("x - 4"), h("x + 16"), h("x - 16")], a:0},
  {q:"7x - 4 = 17", opts:["x = 3","x = 7","x = -3","x = -7"], a:1},
  {q:"2x + 9 = -5", opts:["x = -7","x = 7","x = -14","x = 14"], a:0},
  {q:"4x - 8 = 20", opts:["x = 7","x = -7","x = 12","x = -12"], a:0},
  {q:"5x + 6 = 0", opts:["x = -6/5","x = 6/5","x = -5","x = 5"], a:0},
];

// ====== สร้างแบบฟอร์มแบบทดสอบ ======
let quizTimer = null;
let quizRemain = 0;
let quizType = 'pre'; // 'pre' หรือ 'post'

function secondsToMMSS(t){
  const m = Math.floor(t/60).toString().padStart(2,'0');
  const s = Math.floor(t%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}
function startTimer(total){
  quizRemain = total;
  const totalT = total;
  quizTimeEl.textContent = secondsToMMSS(quizRemain);
  quizBar.style.width = '0%';
  if(quizTimer) clearInterval(quizTimer);
  quizTimer = setInterval(()=>{
    quizRemain--;
    if(quizRemain<0){ clearInterval(quizTimer); quizTimer=null; submitQuiz(true); return; }
    quizTimeEl.textContent = secondsToMMSS(quizRemain);
    const done = (totalT-quizRemain)/totalT*100;
    quizBar.style.width = `${Math.min(100,Math.max(0,done))}%`;
  },1000);
}

function renderQuiz(list, title, type){
  // เปิดโหมด quiz
  document.body.classList.add('quiz-mode');
  quizPage.classList.remove('hidden');
  quizPage.setAttribute('aria-hidden','false');
  tilesWrap.style.display='none';
  workRow.style.display='none';
  quizTitle.textContent = title;
  quizType = type; // 'pre' หรือ 'post'

  // สร้างข้อสอบ
  quizForm.innerHTML = '';
  list.forEach((it,idx)=>{
    const item = document.createElement('div');
    item.className = 'qitem';
    const qid = `q${idx}`;
    item.innerHTML = `
      <div class="qtext">ข้อ ${idx+1}) ${it.q}</div>
      ${it.opts.map((t,i)=>`
        <label class="qopt"><input type="radio" name="${qid}" value="${i}"> ${t}</label>
      `).join('')}
    `;
    quizForm.appendChild(item);
  });

  // ปุ่ม
  quizSubmit.onclick = ()=> submitQuiz(false);
  quizExit.onclick = ()=> exitQuiz();

  // เริ่มจับเวลา 30 นาที
  startTimer(30*60);
}

function exitQuiz(){
  if(quizTimer) { clearInterval(quizTimer); quizTimer=null; }
  document.body.classList.remove('quiz-mode');
  quizPage.classList.add('hidden');
  quizPage.setAttribute('aria-hidden','true');
  tilesWrap.style.display='';
  workRow.style.display='';
}

function submitQuiz(timeup){
  // ตรวจคำตอบ
  const qList = (quizType==='pre') ? PRE_QUESTIONS : POST_QUESTIONS;
  let score = 0;
  qList.forEach((it,idx)=>{
    const name = `q${idx}`;
    const picked = quizForm.querySelector(`input[name="${name}"]:checked`);
    if(picked && Number(picked.value)===it.a) score++;
  });
  const total = qList.length;

  // แสดงโมดัล
  quizModal.style.display='flex';
  quizModalTitle.textContent = timeup ? "หมดเวลา!" : "ผลลัพธ์แบบทดสอบ";
  quizModalBody.innerHTML = `ได้คะแนน <b>${score}</b> จากทั้งหมด <b>${total}</b> ข้อ`;
  const closeAll = ()=>{ quizModal.style.display='none'; exitQuiz(); };
  quizModalX.onclick = closeAll;
  quizModalClose.onclick = closeAll;

  // บันทึกคะแนนถ้า login แล้ว
  if(window.currentUser){
    const payload = {
      sheet: SHEET_NAME,
      name: window.currentUser.name,
      lastname: window.currentUser.lastname,
      Class: window.currentUser.Class,
      // เขียนลงคอลัมน์ตามที่ขอ: pre-test / post-test
      ...(quizType==='pre' ? {"pre-test":score} : {"post-test":score})
    };
    // ส่งแบบ no-cors (ไม่รอผลตอบกลับ)
    try{
      fetch(GAS_URL, {
        method:'POST',
        mode:'no-cors',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
    }catch(err){ /* เงียบ ๆ */ }
  }
}

// ====== สลับโหมดเมื่อเปลี่ยน dropdown ======
function handleModeChange(){
  if(mode==='pretest'){
    renderQuiz(PRE_QUESTIONS, 'แบบทดสอบก่อนเรียน (30 นาที)', 'pre');
    return;
  }
  if(mode==='posttest'){
    renderQuiz(POST_QUESTIONS, 'แบบทดสอบหลังเรียน (30 นาที)', 'post');
    return;
  }
  // กลับโหมด Tiles
  exitQuiz();
  newExample(); // สร้างโจทย์ตามโหมดเดิม
}

// ====== (ด้านล่างคง logic การสุ่ม/ตรวจคำตอบดั้งเดิมไว้) ======
// ---- Parser / โจทย์ / ตรวจคำตอบ (ย่อไว้แบบเดิมของคุณ) ----
// *** หมายเหตุ: เพื่อลดความยาว ตัดเฉพาะส่วนที่จำเป็นใช้งานร่วมกับ UI ***
function sanitizeInput(s){
  return String(s||'')
    .replace(/−/g,'-').replace(/·|×/g,'*').replace(/x²/gi,'x^2')
    .replace(/\[/g,'(').replace(/\]/g,')').replace(/\s+/g,'').trim();
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
function coefToHTML({a2,a1,a0}){
  const parts=[];
  if(a2){ parts.push((a2===1?'':a2===-1?'-':a2)+'x<sup>2</sup>'); }
  if(a1){ parts.push((a1===1?'':a1===-1?'-':a1)+'x'); }
  if(a0){ parts.push(String(a0)); }
  return parts.length? parts.join(' + ').replace(/\+ -/g,'+ (-') : '0';
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
  return res;
}

// ====== ตัวอย่างโจทย์ตามโหมด (ตัดเหลือหลัก ๆ เพื่อให้ทำงานร่วมกับ UI เดิม) ======
function newExample(){
  showSol=false; document.getElementById('btn-solution').textContent='เฉลย';
  answerInput.value=''; checkResult.textContent='';
  tiles=[]; selection.clear();
  showWorkspace(null);

  if(mode==='int_add'){
    const a=randNZ(), b=randNZ();
    problemText = `${a} + ${b<0?`(${b})`:b}`;
    const sum=a+b; answerCoef={a2:0,a1:0,a0:sum}; problemAnswer=String(sum);
  }else if(mode==='int_sub'){
    const a=randNZ(), b=randNZ();
    problemText = `${a} - ${b<0?`(${b})`:b}`;
    const res=a-b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
  }else if(mode==='int_mul'){
    const a=randNZ(), b=randNZ();
    problemText = `${a} × ${b<0?`(${b})`:b}`;
    const res=a*b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
    showWorkspace('mul'); mulMult.textContent=b; mulMcand.textContent=a;
  }else if(mode==='int_div'){
    // ให้ลงตัวเสมอในช่วง [-15,15]\{0}
    const divisor=randNZ(); const q=randNZ(); const dividend=divisor*q;
    problemText = `${dividend} ÷ ${divisor<0?`(${divisor})`:divisor}`;
    answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); divDivisor.textContent=divisor; divQuot.value='';
  }else if(mode==='poly_add' || mode==='poly_sub' || mode==='poly_mul'){
    const degP = Math.random()<.5 ? 2 : 1;
    const degQ = Math.random()<.5 ? 2 : 1;
    const P = buildPoly(degP);
    const Q = buildPoly(degQ);

    if(mode==='poly_add'){
      problemText = `${P.html} + ${Q.html}`;
      answerCoef = addCoef(P.coef, Q.coef);
      problemAnswer = coefToHTML(answerCoef);
    }else if(mode==='poly_sub'){
      problemText = `${P.html} - ${Q.html}`;
      answerCoef = addCoef(P.coef, {a2:-Q.coef.a2, a1:-Q.coef.a1, a0:-Q.coef.a0});
      problemAnswer = coefToHTML(answerCoef);
    }else{
      problemText = `${P.html} × ${Q.html}`;
      answerCoef = mulCoef(P.coef, Q.coef);
      problemAnswer = coefToHTML(answerCoef);
      showWorkspace('mul');
      mulMult.innerHTML = coefToHTML(Q.coef).replace(/\+ \(-/g,'+ (-');
      mulMcand.innerHTML = coefToHTML(P.coef).replace(/\+ \(-/g,'+ (-');
    }
  }else if(mode==='poly_div'){
    // ตัวหารรูป (x + d) ให้ลงตัวและอ่านง่าย
    let a,b,d,ok=false;
    while(!ok){
      a = randNZ(); b = randNZ(); d = randNZ();
      const A2 = a;
      const A1 = a*d + b;
      const A0 = b*d;
      if( Math.abs(A1)<=15 && Math.abs(A0)<=15 ){ ok=true; }
    }
    const dividendHTML = `[${(a===1?'':a===-1?'-':'') + 'x<sup>2</sup>'} + ${(a*d+b)>=0? (a*d+b) : `(${a*d+b})`}x + ${(b*d)>=0? (b*d) : `(${b*d})`}]`
      .replace(/\+ -/g,'+ (-');
    const divisorHTML = `[x${d>=0?'+':''}${d}]`;

    problemText = `${dividendHTML} ÷ ${divisorHTML}`;
    answerCoef = {a2:0, a1:a, a0:b};
    problemAnswer = coefToHTML(answerCoef);

    showWorkspace('div');
    divDivisor.innerHTML = `x${d>=0?'+':''}${d}`;
    divQuot.value='';
  }else if(mode==='solve_lin'){
    // โหมดสมการ (ของเดิม)
    let a,b,c,x,d,ok=false;
    while(!ok){
      a=randNZ(); b=randNZ(); c=randNZ(); x = rint(-15,15); if(x===0) continue;
      d = a*x + b - c*x;
      if(Math.abs(d)<=15){ ok=true; }
    }
    problemText = `${a===1?'':a===-1?'-':''}x${b>=0?'+':''}${b} = ${c===1?'':c===-1?'-':''}x${d>=0?'+':''}${d}`.replace(/\+\-/g,'-');
    answerCoef={a2:0,a1:1,a0:-x}; problemAnswer=`x = ${x}`;
    showWorkspace('solve');
  }

  render();
}

// ==== ผู้ช่วยสร้างพหุนามแบบสุ่ม (ใช้ช่วง [-9,9]\{0}) ====
function buildPoly(deg){
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
    c(k, deg){
      return (k<0) ? `(${k})` : `${k}`;
    }
  };
  const r9 = ()=> randNZRange(-9,9);
  if(deg===2){
    const a = r9(), b = r9(), c = r9();
    const t2 = fmtTerm.x2(a,true);
    const t1 = fmtTerm.x1(b,2);
    const t0 = fmtTerm.c(c,2);
    const inner = [t2, ' + '+t1, ' + '+t0].join('').replace(/\+ \(-/g,'+ (-');
    return {coef:{a2:a,a1:b,a0:c}, html:`[${inner}]`};
  }else{
    const b = r9(), c = r9();
    const t1 = fmtTerm.x1(b,1);
    const t0 = fmtTerm.c(c,1);
    const inner = [t1,' + '+t0].join('').replace(/\+ \(-/g,'+ (-');
    return {coef:{a2:0,a1:b,a0:c}, html:`[${inner}]`};
  }
}

// ====== ตรวจคำตอบ (ของเดิม) ======
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
