/* 
Version: 2025-08-17 r10.4
- เพิ่มปุ่ม 👤 (login/profile) + บันทึก Google Sheet
- เพิ่มปุ่ม 📖 (lesson modal) + วิดีโอตามเมนู
- เพิ่มเมนู Pre-Test / Post-Test (เปิดหน้าใหม่)
- นับจำนวนข้อตอบถูกแบบไม่กดเฉลย ต่อเมนู ส่งขึ้นชีตเมื่อ login
- คงกฎสุ่ม/ตรวจคำตอบจาก r9 (สรุปไว้ย่อๆ ในคอมเมนต์)
*/

/* ====== Google Apps Script Config ====== */
const GAS_URL = "https://script.google.com/macros/s/AKfycbxVEsAHPrttyRtmX2P_CLNemCV_mdc7cFb7nK1N93hB0QmmqrCxTXHYdhAoCoAoBPVYVg/exec";
const SHEET_NAME = "data";

/* ====== DOM ====== */
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

const modeSel = document.getElementById('mode');
const newBtn  = document.getElementById('btn-new');

/* Help + Lesson modals */
const help = document.getElementById('help');
const helpX = document.getElementById('help-x');
const ytframe = document.getElementById('ytframe');

const lesson = document.getElementById('lesson');
const lessonX = document.getElementById('lesson-x');
const lessonBtn = document.getElementById('btn-lesson');
const lessonFrame = document.getElementById('lessonFrame');

/* Login modal */
const btnLogin = document.getElementById('btn-login');
const loginModal = document.getElementById('loginModal');
const loginX = document.getElementById('login-x');
const loginName = document.getElementById('login-name');
const loginLast = document.getElementById('login-lastname');
const loginClass = document.getElementById('login-class');
const loginSubmit = document.getElementById('btn-login-submit');
const loginMsg = document.getElementById('login-msg');

const profilePane = document.getElementById('profile-pane');
const profileName = document.getElementById('profile-name');
const profileClass = document.getElementById('profile-class');
const profilePre = document.getElementById('profile-pre');
const profilePost = document.getElementById('profile-post');

const sAddInt = document.getElementById('s-add-int');
const sSubInt = document.getElementById('s-sub-poly') ? document.getElementById('s-sub-int') : null; // เผื่อ DOM มี/ไม่มี
const sMulInt = document.getElementById('s-mul-int');
const sDivInt = document.getElementById('s-div-int');
const sAddPoly= document.getElementById('s-add-poly');
const sSubPoly= document.getElementById('s-sub-poly');
const sMulPoly= document.getElementById('s-mul-poly');
const sDivPoly= document.getElementById('s-div-poly');
const sSolve  = document.getElementById('s-solve');

/* ====== State ====== */
let tiles = [];           // {id,type,x,y,w,h}
let selection = new Set();
let dragging = null;      // {ids, offsets[]}
let selRect = null;
let zoom = 1;
let showSol = false;
let mode = modeSel.value;

let problemText = '';
let problemAnswer = '';
let answerCoef = {a2:0,a1:0,a0:0};

/* login/profile state */
let currentUser = null;   // {name, lastname, Class, pre, post, counters:{}}
let counters = {
  add_int:0, sub_int:0, multi_int:0, div_int:0,
  add_poly:0, sub_poly:0, multi_poly:0, div_poly:0,
  solve_poly:0
};

/* ====== Utils ====== */
const uid = ()=> Math.random().toString(36).slice(2);
const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));
function randNZ15(){ let v=0; while(!v){ v=(Math.random()<.5?-1:1)*(Math.floor(Math.random()*15)+1); } return v; }
function randNZ9(){ let v=0; while(!v){ v=(Math.random()<.5?-1:1)*(Math.floor(Math.random()*9)+1); } return v; }
function rint(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

/* ====== Tiles config (คงเดิม) ====== */
const TYPES = {
  x2:      {labelHTML:'x<sup>2</sup>',   w:120, h:120, color:'var(--blue)',   shape:'square', neg:'neg_x2'},
  neg_x2:  {labelHTML:'-x<sup>2</sup>',  w:120, h:120, color:'var(--red)',    shape:'square', neg:'x2'},
  x:       {labelHTML:'x',               w:120, h:30,  color:'var(--green)',  shape:'rect',   neg:'neg_x'},
  neg_x:   {labelHTML:'-x',              w:120, h:30,  color:'var(--red)',    shape:'rect',   neg:'x'},
  one:     {labelHTML:'1',               w:30,  h:30,  color:'var(--yellow)', shape:'mini',   neg:'neg_one'},
  neg_one: {labelHTML:'-1',              w:30,  h:30,  color:'var(--red)',    shape:'mini',   neg:'one'}
};

/* ====== Workspaces visibility ====== */
function showWorkspace(which){
  wsSolve.style.display = (which==='solve') ? 'block':'none';
  wsMul.style.display   = (which==='mul')   ? 'block':'none';
  wsDiv.style.display   = (which==='div')   ? 'block':'none';
}

/* ====== Pointer helpers ====== */
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

/* ====== Render ====== */
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
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      if(!selection.has(t.id)){
        if(!e.shiftKey) selection.clear();
        selection.add(t.id);
      }else if(e.shiftKey){ selection.delete(t.id); }
      const p = pt(e);
      const ids = Array.from(selection);
      const offsets = ids.map(id=>{
        const k = tiles.find(x=>x.id===id);
        return {id, dx:p.x - k.x, dy:p.y - k.y};
      });
      dragging = {ids, offsets};
      render();
    };
    const moveDrag = (e)=>{
      if(!dragging) return;
      const p = pt(e);
      tiles = tiles.map(k=>{
        const off = dragging.offsets.find(o=>o.id===k.id);
        if(!off) return k;
        return {...k, x:p.x - off.dx, y:p.y - off.dy};
      });
      render();
    };
    const endDrag = ()=>{
      dragging=null;
    };

    el.addEventListener('pointerdown', startDrag, {passive:false});
    window.addEventListener('pointermove', moveDrag, {passive:false});
    window.addEventListener('pointerup', endDrag, {passive:false});
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

/* ====== Palette add ====== */
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

/* ====== Board pointer interactions ====== */
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

board.addEventListener('pointerdown', (e)=>{e.preventDefault(); beginZone(e);}, {passive:false});
window.addEventListener('pointermove', (e)=>{e.preventDefault(); moveZone(e);}, {passive:false});
window.addEventListener('pointerup', endZone, {passive:false});

/* ====== Toolbar actions ====== */
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
  selection.clear();               // ยกเลิก select ต้นฉบับ (ปัญหาลากติด)
  clones.forEach(c=> selection.add(c.id));
  render();
};
document.getElementById('btn-zoom-in').onclick  = ()=>{ zoom = clamp(zoom*1.25, .4, 2.2); render(); };
document.getElementById('btn-zoom-out').onclick = ()=>{ zoom = clamp(zoom*0.8,  .4, 2.2); render(); };

/* ====== Help modal ====== */
document.getElementById('btn-help').onclick   = ()=> help.style.display='flex';
helpX.onclick = ()=>{ 
  help.style.display='none';
  const src = ytframe.src; ytframe.src = src; // stop video
};

/* ====== Lesson modal 📖 ====== */
const LESSON_URL = {
  int_add:  "https://www.youtube.com/embed/CAywl7PRu74?si=oohFr4aSHuJNJXMq",
  int_sub:  "https://www.youtube.com/embed/VcCwksc542k?si=iieOZFX83gzbQD4T",
  int_mul:  "https://www.youtube.com/embed/CZ7KB4qXIG8?si=sDwM0cDwLE8XOwwz",
  int_div:  "https://www.youtube.com/embed/AWdSwZl7GXA?si=lR0vUDsG9MTVH0Oy",
  poly_add: "https://www.youtube.com/embed/Z9poGbeeq1Q?si=Xqo6UlrE7l9E8YFa",
  poly_sub: "https://www.youtube.com/embed/Z9poGbeeq1Q?si=Xqo6UlrE7l9E8YFa",
  poly_mul: "https://www.youtube.com/embed/lWqybjwE2io?si=-OW80uiGDH_Nyn7h",
  poly_div: "https://www.youtube.com/embed/_VWSpo62__8?si=KlgGbVjJYBxCJssg",
  solve_lin:"https://www.youtube.com/embed/Z18zPt__6wg?si=WjSRqp_RyGzEF-3J",
  pre_test: "", post_test: ""
};
lessonBtn.onclick = ()=>{
  const m = modeSel.value;
  const url = LESSON_URL[m] || "";
  if(!url){ alert('ไม่มีวิดีโอสำหรับเมนูนี้'); return; }
  lessonFrame.src = url;
  lesson.style.display='flex';
};
lessonX.onclick = ()=>{
  lesson.style.display='none';
  const src = lessonFrame.src; lessonFrame.src = src; // stop
};

/* ====== Mode & examples ====== */
/*  กฎสุ่ม (สรุปรุ่น r9):
    - จำนวนเต็ม: สุ่มใน [-15,15]\{0}, แบ่งบวก/ลบ/คูณ/หาร (หารเป็นโจทย์ลงตัว)
    - พหุนาม: บวก/ลบ ดีกรีสุ่ม 1 หรือ 2, สุ่มใน [-9,9]\{0}; คูณจำกัดดีกรีตัวประกอบ ≤1; 
      หาร ตัวหารรูป (sx+t), สุ่มให้ลงตัว; การแสดงโจทย์ครอบ [ ... ] พจน์ลบครอบ ()
      เฉลยไม่แสดงวงเล็บเหลี่ยม
*/
modeSel.onchange = ()=>{
  mode = modeSel.value;
  if(mode==='pre_test'){ window.location.href = 'pretest.html'; return; }
  if(mode==='post_test'){ window.location.href = 'posttest.html'; return; }
  newExample();
};
newBtn.onclick = ()=> newExample();

/* ====== Normalizer (ผู้ใช้กำหนดโจทย์เอง) ====== */
document.getElementById('normalizeInput').addEventListener('keydown', (e)=>{
  if(e.key==='Enter'){
    const v = e.target.value.trim();
    if(v){
      problemText = v; solutionBox.innerHTML=''; checkResult.textContent='';
      render();
    }
  }
});

/* ====== Generator helpers (เหมือนรุ่นก่อน) ====== */
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
function buildPoly(deg){
  if(deg===2){
    const a = randNZ9(), b = randNZ9(), c = randNZ9();
    const t2 = fmtTerm.x2(a,true);
    const t1 = fmtTerm.x1(b,2);
    const t0 = fmtTerm.c(c);
    const inner = [t2, ' + '+t1, ' + '+t0].join('').replace(/\+ \(-/g,'+ (-');
    return {coef:{a2:a,a1:b,a0:c}, html:`[${inner}]`};
  }else{
    const b = randNZ9(), c = randNZ9();
    const t1 = fmtTerm.x1(b,1);
    const t0 = fmtTerm.c(c);
    const inner = [t1, ' + '+t0].join('').replace(/\+ \(-/g,'+ (-');
    return {coef:{a2:0,a1:b,a0:c}, html:`[${inner}]`};
  }
}

/* ====== Example generator (ตาม r9) ====== */
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
    showWorkspace('mul'); mulMult.textContent=b; mulMcand.textContent=a;
  }else if(mode==='int_div'){
    let divisor=randNZ15(), q=randNZ15();
    const dividend=divisor*q;
    problemText = `${dividend} ÷ ${divisor<0?`(${divisor})`:divisor}`;
    answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); divDivisor.textContent=divisor; divQuot.value='';
  }else if(mode==='poly_add' || mode==='poly_sub' || mode==='poly_mul'){
    // บวก/ลบ: ดีกรี 1 หรือ 2 (สุ่ม), คูณ: จำกัดดีกรีตัวประกอบ ≤1
    const degP = (mode==='poly_mul') ? 1 : (Math.random()<.5?2:1);
    const degQ = (mode==='poly_mul') ? 1 : (Math.random()<.5?2:1);
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
      answerCoef = mulCoef(P.coef, Q.coef); // เพดานผลลัพธ์ตามธรรมชาติ (≤36 โดยสุ่มใน ±9)
      problemAnswer = coefToHTML(answerCoef);
      showWorkspace('mul');
      mulMult.innerHTML = coefToHTML(Q.coef).replace(/\+ \(-/g,'+ (-');
      mulMcand.innerHTML = coefToHTML(P.coef).replace(/\+ \(-/g,'+ (-');
    }
  }else if(mode==='poly_div'){
    // ตัวหาร (sx+t), ตัวตั้งสร้างจาก (sx+t)*(ax+b) ให้ลงตัวแน่นอน
    let s=randNZ9(), t=randNZ9(), a=randNZ9(), b=randNZ9();
    // dividend = (ax+b)(sx+t) = (a*s)x^2 + (a*t + b*s)x + (b*t)
    const A2 = a*s, A1 = a*t + b*s, A0 = b*t;
    const dividendHTML = `[${(A2===0?'':(A2===1?'':'')+(A2? 'x<sup>2</sup>':''))}${A2? (A1>=0?' + ':' + '):''}${(A1>=0?'': '(')}${A1>=0?A1:(A1+')')}x + ${(A0>=0?'': '(')}${A0>=0?A0:(A0+')')}]`.replace(/\+ -/g,'+ (-');
    const divisorHTML = `[${s===1?'':'('+s+')'}x${t>=0?'+':''}${t}]`.replace(/\(\-1\)x/g,'(-1)x');

    problemText = `${dividendHTML} ÷ ${divisorHTML}`;
    answerCoef = {a2:0,a1:a, a0:b};
    problemAnswer = coefToHTML(answerCoef);

    showWorkspace('div');
    divDivisor.innerHTML = `${s===1?'':'('+s+')'}x${t>=0?'+':''}${t}`.replace(/\(\-1\)x/g,'(-1)x');
    divQuot.value='';
  }else if(mode==='solve_lin'){
    // เหมือน r9: สุ่ม [-15,15]\{0} ให้ค่าที่แสดงไม่เกินช่วง
    let a,b,c,x,d,ok=false;
    while(!ok){
      a=randNZ15(); b=randNZ15(); c=randNZ15(); x = rint(-15,15); if(x===0) continue;
      d = a*x + b - c*x;
      if(Math.abs(d)<=15){ ok=true; }
    }
    problemText = `${a===1?'':a===-1?'-':''}x${b>=0?'+':''}${b} = ${c===1?'':c===-1?'-':''}x${d>=0?'+':''}${d}`.replace(/\+\-/g,'-');
    answerCoef={a2:0,a1:1,a0:-x}; problemAnswer=`x = ${x}`;
    showWorkspace('solve');
  }

  render();
}

/* ====== Parser (รับ () และ [] ) ====== */
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

/* ====== Answer checking + ส่งสถิติขึ้นชีต ====== */
checkBtn.onclick = ()=>{
  checkResult.textContent=''; checkResult.style.color='';
  const givenRaw = answerInput.value;
  const given = givenRaw.replace(/\s+/g,'').replace(/−/g,'-').replace(/\[/g,'(').replace(/\]/g,')');
  const stripPar = (s)=>{ let r=s; while(r.startsWith('(') && r.endsWith(')')) r=r.slice(1,-1); return r; };

  let correct=false;

  if(['int_add','int_sub','int_mul','int_div'].includes(mode)){
    const s = stripPar(given);
    if(!/^-?\d+$/.test(s)){ return bad(); }
    correct = (parseInt(s,10) === answerCoef.a0);
  }else if(mode==='solve_lin'){
    let s = stripPar(given);
    let m = s.match(/^x=?(-?\d+)$/i); if(m){ s=m[1]; }
    if(!/^-?\d+$/.test(s)){ return bad(); }
    const val = parseInt(s,10);
    const truth = -answerCoef.a0;
    correct = (val===truth);
  }else{
    const parsed = parsePoly(given);
    if(!parsed){ return bad(); }
    correct = equalsCoef(parsed, answerCoef);
  }

  if(correct){ 
    good(); 
    // ถ้าไม่ได้กดโชว์เฉลย และมีผู้ใช้ล็อกอิน → นับ+ส่งขึ้นชีต
    if(!showSol && currentUser){
      const key = counterKeyFromMode(mode);
      if(key){
        counters[key] = (counters[key]||0) + 1;
        pushMenuCounter(currentUser, key, counters[key]);
        reflectCountersToUI();
      }
    }
  } else { bad(); }

  function good(){ checkResult.textContent='ถูกต้อง'; checkResult.style.color='#16a34a'; }
  function bad(){ checkResult.textContent='ไม่ถูกต้อง'; checkResult.style.color='#dc2626'; }
};
function counterKeyFromMode(m){
  switch(m){
    case 'int_add':  return 'add_int';
    case 'int_sub':  return 'sub_int';
    case 'int_mul':  return 'multi_int';
    case 'int_div':  return 'div_int';
    case 'poly_add': return 'add_poly';
    case 'poly_sub': return 'sub_poly';
    case 'poly_mul': return 'multi_poly';
    case 'poly_div': return 'div_poly';
    case 'solve_lin':return 'solve_poly';
    default: return null;
  }
}

/* ====== Login & Profile ====== */
btnLogin.onclick = ()=>{
  if(currentUser){
    // โหมดโปรไฟล์
    showProfilePane();
  }else{
    // โหมดฟอร์ม
    profilePane.style.display='none';
    loginModal.style.display='flex';
  }
};
loginX.onclick = ()=>{ loginModal.style.display='none'; };
loginSubmit.onclick = async ()=>{
  const name = (loginName.value||'').trim();
  const lastname = (loginLast.value||'').trim();
  const Class = (loginClass.value||'').trim();
  if(!name || !lastname || !Class){
    loginMsg.textContent = 'กรุณากรอกข้อมูลให้ครบถ้วน'; return;
  }
  try{
    await fetch(GAS_URL, {
      method:'POST',
      mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ sheet:SHEET_NAME, action:'login', name, lastname, Class })
    });
    currentUser = {name, lastname, Class, pre: null, post: null};
    loginMsg.textContent = 'บันทึกข้อมูลเข้าสู่ระบบแล้ว';
    // สลับเป็นหน้าโปรไฟล์
    showProfilePane();
  }catch(e){
    loginMsg.textContent = 'ไม่สามารถบันทึกได้';
  }
};
function showProfilePane(){
  // แสดงโปรไฟล์ + ค่าปัจจุบันบน UI
  loginModal.style.display='flex';
  document.querySelector('.login-form').style.display='none';
  profilePane.style.display='block';
  profileName.textContent = `${currentUser.name} ${currentUser.lastname}`;
  profileClass.textContent = `ชั้นเรียน: ${currentUser.Class}`;
  profilePre.textContent = currentUser.pre ?? '-';
  profilePost.textContent = currentUser.post ?? '-';
  reflectCountersToUI();
}
function reflectCountersToUI(){
  if(sAddInt) sAddInt.textContent = counters.add_int;
  if(document.getElementById('s-sub-int')) document.getElementById('s-sub-int').textContent = counters.sub_int;
  if(sMulInt) sMulInt.textContent = counters.multi_int;
  if(sDivInt) sDivInt.textContent = counters.div_int;
  if(sAddPoly) sAddPoly.textContent = counters.add_poly;
  if(sSubPoly) sSubPoly.textContent = counters.sub_poly;
  if(sMulPoly) sMulPoly.textContent = counters.multi_poly;
  if(sDivPoly) sDivPoly.textContent = counters.div_poly;
  if(sSolve) sSolve.textContent = counters.solve_poly;
}
document.getElementById('btn-logout').onclick = ()=>{
  currentUser = null;
  counters = {add_int:0, sub_int:0, multi_int:0, div_int:0, add_poly:0, sub_poly:0, multi_poly:0, div_poly:0, solve_poly:0};
  document.querySelector('.login-form').style.display='block';
  profilePane.style.display='none';
  loginModal.style.display='none';
};

/* ====== Push counters to Sheet ====== */
async function pushMenuCounter(user, col, value){
  try{
    await fetch(GAS_URL, {
      method:'POST',
      mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        sheet:SHEET_NAME, action:'menuCounter',
        name:user.name, lastname:user.lastname, Class:user.Class,
        column:col, value
      })
    });
  }catch(e){ /* เงียบไว้ */ }
}

/* ====== Solution toggle ====== */
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};

/* ====== Init ====== */
document.getElementById('btn-new').focus();
newExample();
render();
