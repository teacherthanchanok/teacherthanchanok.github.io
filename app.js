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

// ป้องกันไม่ให้เริ่ม drag เมื่อแตะใน input
['mousedown','touchstart','pointerdown'].forEach(evt=>{
  if(divQuot) divQuot.addEventListener(evt, e=>e.stopPropagation());
  if(answerInput) answerInput.addEventListener(evt, e=>e.stopPropagation());
});

// ====== Tiles config ======
// x และ -x เป็นแท่งแนวตั้งตั้งแต่แรก
const TYPES = {
  x2:      {labelHTML:'x<sup>2</sup>',   w:120, h:120, color:'var(--blue)',   shape:'square', neg:'neg_x2'},
  neg_x2:  {labelHTML:'-x<sup>2</sup>',  w:120, h:120, color:'var(--red)',    shape:'square', neg:'x2'},
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

function randNZ15(){ let v=0; while(v===0){ v = (Math.random()<.5?-1:1) * (Math.floor(Math.random()*15)+1);} return v; }
function randNZ9(){ let v=0; while(v===0){ v = (Math.random()<.5?-1:1) * (Math.floor(Math.random()*9)+1);} return v; }
function rint(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

function showWorkspace(which){
  wsSolve.style.display = (which==='solve') ? 'block':'none';
  wsMul.style.display   = (which==='mul')   ? 'block':'none';
  wsDiv.style.display   = (which==='div')   ? 'block':'none';
}

// pointer -> board coords (รวม touch)
function pt(e){
  const rect = board.getBoundingClientRect();
  const cx = (e.touches? e.touches[0].clientX : e.clientX);
  const cy = (e.touches? e.touches[0].clientY : e.clientY);
  return { x: (cx - rect.left)/zoom, y: (cy - rect.top)/zoom };
}
function overlaps(x,y,w,h,t){
  return !(x+w < t.x || x > t.x+t.w || y+h < t.y || y > t.y+t.h);
}
function findFreeSpot(w,h){
  const margin = 20;
  const startX = 260, startY = 100;
  let x=startX, y=startY;
  const step = 24;
  const limitX = 2200, limitY=1500;
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
  board.querySelectorAll('.tile').forEach(el=>el.remove());
  tiles.forEach(t=>{
    const el = document.createElement('div');
    el.className = 'tile' + (selection.has(t.id) ? ' selected' : '');
    el.style.background = TYPES[t.type].color;
    el.style.left = t.x + 'px';
    el.style.top  = t.y + 'px';
    el.style.width  = t.w + 'px';
    el.style.height = t.h + 'px';
    const showLabel = (t.w>=50 || t.h>=50);
    el.innerHTML = showLabel ? '<span>'+TYPES[t.type].labelHTML+'</span>' : '';

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
    el.addEventListener('mousedown', startDrag);
    el.addEventListener('touchstart', startDrag, {passive:false});
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
  el.addEventListener('mousedown', addTile);
  el.addEventListener('touchstart', (e)=>{e.preventDefault(); addTile();}, {passive:false});
});

// ====== Board interactions ======
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
board.addEventListener('mousedown', beginZone);
window.addEventListener('mousemove', moveZone);
window.addEventListener('mouseup', endZone);
board.addEventListener('touchstart', (e)=>{e.preventDefault(); beginZone(e);},{passive:false});
window.addEventListener('touchmove', (e)=>{e.preventDefault(); moveZone(e);},{passive:false});
window.addEventListener('touchend', endZone);

// ====== Toolbar ======
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
  // เลิก select ต้นฉบับ
  selection.clear();
  // สร้าง clone แบบวางเหลื่อมไม่ซ้อนกัน
  const clones = selectedTiles.map((t,i)=>{
    const gap = 18*i;
    const spot = findFreeSpot(t.w, t.h);
    return {...t, id:uid(), x:spot.x+gap, y:spot.y+gap};
  });
  tiles = [...tiles, ...clones];
  clones.forEach(c=> selection.add(c.id)); // select เฉพาะตัวใหม่
  render();
};
document.getElementById('btn-zoom-in').onclick  = ()=>{ zoom = clamp(zoom*1.25, .4, 2.2); render(); };
document.getElementById('btn-zoom-out').onclick = ()=>{ zoom = clamp(zoom*0.8,  .4, 2.2); render(); };

// popup
const help = document.getElementById('help');
const ytframe = document.getElementById('ytframe');
document.getElementById('btn-help').onclick   = ()=> help.style.display='flex';
document.getElementById('help-x').onclick     = closeHelp;
function closeHelp(){ help.style.display='none'; const src = ytframe.src; ytframe.src = src; }

// ====== Parser & formatting ======
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

// แสดงพจน์ตามกฎวงเล็บ (ใช้กับโจทย์และเฉลย)
const fmtTerm = {
  x2(k, isLeadDeg2){
    if(k===1)  return 'x<sup>2</sup>';
    if(k===-1) return isLeadDeg2 ? '-x<sup>2</sup>' : '(-x<sup>2</sup>)';
    return (k<0 && !isLeadDeg2) ? `(${k}x<sup>2</sup>)` : `${k}x<sup>2</sup>`;
  },
  x1(k, deg){ // deg = 1 หรือ 2
    if(k===1)  return 'x';
    if(k===-1) return (deg===1 ? '-x' : '(-x)');
    return (k<0 && deg===2) ? `(${k}x)` : `${k}x`;
  },
  c(k){ return (k<0) ? `(${k})` : `${k}`; }
};

// คืน string ด้านในของวงเล็บเหลี่ยม (ไม่รวม [ ])
function polyInnerHTML(coef, assumedDeg){
  const parts=[];
  if(assumedDeg===2){
    parts.push(fmtTerm.x2(coef.a2,true));
    parts.push(` + ${fmtTerm.x1(coef.a1,2)}`);
    parts.push(` + ${fmtTerm.c(coef.a0)}`);
  }else{ // deg 1
    parts.push(fmtTerm.x1(coef.a1,1));
    parts.push(` + ${fmtTerm.c(coef.a0)}`);
  }
  return parts.join('').replace(/\+ -/g,'+ (-');
}

// ใช้สำหรับเฉลย (ไม่ห่อด้วย [])
function coefToHTML(coef){
  const deg = (coef.a2!==0)?2:1;
  return polyInnerHTML(coef,deg);
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
const withinCap36 = (C)=> Math.abs(C.a2)<=36 && Math.abs(C.a1)<=36 && Math.abs(C.a0)<=36;

// สร้างพหุนามดีกรี 1 หรือ 2 โดยค่าสัมประสิทธิ์ใน [-9,9]\{0}
function buildPoly(deg){
  if(deg===2){
    const a=randNZ9(), b=randNZ9(), c=randNZ9();
    return {coef:{a2:a,a1:b,a0:c}, html:`[${polyInnerHTML({a2:a,a1:b,a0:c},2)}]`};
  }else{
    const b=randNZ9(), c=randNZ9();
    return {coef:{a2:0,a1:b,a0:c}, html:`[${polyInnerHTML({a2:0,a1:b,a0:c},1)}]`};
  }
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
    showWorkspace('mul'); mulMult.textContent=b; mulMcand.textContent=a;
  }else if(mode==='int_div'){
    // จำกัดทุกค่าที่แสดงให้อยู่ใน [-15,15] และไม่เป็นศูนย์
    let divisor, q, dividend;
    do { divisor = randNZ15(); q = randNZ15(); dividend = divisor*q; } while(Math.abs(dividend)>15);
    problemText = `${dividend} ÷ ${divisor<0?`(${divisor})`:divisor}`;
    answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); divDivisor.textContent=divisor; if(divQuot) divQuot.value='';
  }else if(mode==='poly_add' || mode==='poly_sub'){
    const degP = Math.random()<.5 ? 2 : 1;
    const degQ = Math.random()<.5 ? 2 : 1;
    const P = buildPoly(degP);
    const Q = buildPoly(degQ);

    if(mode==='poly_add'){
      problemText = `${P.html} + ${Q.html}`;
      answerCoef = addCoef(P.coef, Q.coef);
      problemAnswer = coefToHTML(answerCoef);
    }else{
      problemText = `${P.html} - ${Q.html}`;
      answerCoef = addCoef(P.coef, {a2:-Q.coef.a2, a1:-Q.coef.a1, a0:-Q.coef.a0});
      problemAnswer = coefToHTML(answerCoef);
    }
  }else if(mode==='poly_mul'){
    // ตัวตั้งและตัวคูณดีกรีไม่เกิน 1, สุ่มจนกว่า result ไม่เกินเพดาน 36
    let P, Q, prod;
    do{
      P = buildPoly(1);
      Q = buildPoly(1);
      prod = mulCoef(P.coef, Q.coef);
    }while(!withinCap36(prod));
    problemText = `${P.html} × ${Q.html}`;
    answerCoef = prod;
    problemAnswer = coefToHTML(answerCoef);
    showWorkspace('mul');
    mulMult.innerHTML  = P.html; // ใส่ [] ครบถ้วนเพื่อไม่ให้วงเล็บหาย
    mulMcand.innerHTML = Q.html;
  }else if(mode==='poly_div'){
    // ตัวหารดีกรี <= 1 และ “หารลงตัว” เท่านั้น
    // เลือก quotient = (ax + b) แล้วสุ่มตัวหาร (x + d) หรือ (sx + t) ดีกรี 1, คำนวณ dividend จากการคูณ
    let a,b,s,t,divisorCoef,quot,dividend,ok=false;
    while(!ok){
      // quotient
      a = randNZ9(); b = randNZ9();
      quot = {a2:0,a1:a,a0:b};
      // divisor: เลือกแบบ x + d (s=1) หรือ sx + t (แต่เพื่อความง่าย/อ่านง่าย เลือกส=1 เสมอ)
      s = 1; t = randNZ9();
      divisorCoef = {a2:0,a1:s,a0:t};
      dividend = mulCoef(quot, divisorCoef);
      ok = withinCap36(dividend); // ค่าสัมประสิทธิ์ไม่เกิน 36
    }
    const dividendHTML = `[${polyInnerHTML(dividend,2)}]`;
    const divisorHTML  = `[${polyInnerHTML(divisorCoef,1)}]`;
    problemText = `${dividendHTML} ÷ ${divisorHTML}`;
    answerCoef = quot;
    problemAnswer = coefToHTML(answerCoef);
    showWorkspace('div');
    divDivisor.innerHTML = divisorHTML; if(divQuot) divQuot.value='';
  }else if(mode==='solve_lin'){
    // ax + b = cx + d โดยค่าที่แสดงทุกตัวอยู่ใน [-15,15] และ x เป็นจำนวนเต็ม
    let a,b,c,x,d,ok=false;
    while(!ok){
      a=randNZ15(); b=randNZ15(); c=randNZ15(); x=rint(-15,15); if(x===0) continue;
      d = a*x + b - c*x;
      ok = (Math.abs(d)<=15);
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
document.getElementById('mode').onchange = (e)=>{ mode = e.target.value; newExample(); };
document.getElementById('btn-new').onclick = ()=> newExample();
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};
document.getElementById('btn-new').focus();
newExample();
render();
