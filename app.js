/* 
Version: r10.4
Changelog:
- Added 📖 (links) modal and 💡 (lesson video) modal
- Kept r9 rules: full generator/checker, pointer events, integer/poly ranges, div tables
- Stop YouTube when closing modals
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

// NEW: help/links/lesson modals
const help = document.getElementById('help');
const helpX = document.getElementById('help-x');
const btnHelp = document.getElementById('btn-help');

const linksModal = document.getElementById('linksModal');
const linksX = document.getElementById('links-x');
const btnLinks = document.getElementById('btn-links');

const lessonModal = document.getElementById('lessonModal');
const lessonX = document.getElementById('lesson-x');
const btnLesson = document.getElementById('btn-lesson');
const lessonFrame = document.getElementById('lessonFrame');

const ytframe = document.getElementById('ytframe');

const modeSel = document.getElementById('mode');

// make inputs interactable (don’t start drag/select)
['pointerdown'].forEach(evt=>{
  if (divQuot) divQuot.addEventListener(evt, e=>e.stopPropagation());
  if (answerInput) answerInput.addEventListener(evt, e=>e.stopPropagation());
});

// ====== Tiles config ======
const TYPES = {
  x2:      {labelHTML:'x<sup>2</sup>',   w:120, h:120, color:'var(--blue)',   shape:'square', neg:'neg_x2'},
  neg_x2:  {labelHTML:'-x<sup>2</sup>',  w:120, h:120, color:'var(--red)',    shape:'square', neg:'x2'},
  x:       {labelHTML:'x',               w:30,  h:120, color:'var(--green)',  shape:'rect',   neg:'neg_x'}, // vertical first
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
let mode = modeSel.value;

let problemText = '';
let problemAnswer = '';
let answerCoef = {a2:0,a1:0,a0:0}; // สำหรับตรวจพหุนาม/จำนวนเต็ม

// ====== Utils ======
const uid = ()=> Math.random().toString(36).slice(2);
const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));

function randNZIn(a,b){
  // integer in [a,b] excluding 0
  let v=0;
  while(v===0){
    v = Math.floor(Math.random()*(b-a+1))+a;
  }
  return v;
}
const rint=(a,b)=> Math.floor(Math.random()*(b-a+1))+a;

// Workspace visibility
function showWorkspace(which){
  wsSolve.style.display = (which==='solve') ? 'block':'none';
  wsMul.style.display   = (which==='mul')   ? 'block':'none';
  wsDiv.style.display   = (which==='div')   ? 'block':'none';
}

// board coords
function pt(e){
  const rect = board.getBoundingClientRect();
  const cx = e.clientX ?? (e.touches? e.touches[0].clientX : 0);
  const cy = e.clientY ?? (e.touches? e.touches[0].clientY : 0);
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
    el.addEventListener('pointerdown', startDrag);
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
  el.addEventListener('pointerdown', (e)=>{ e.preventDefault(); addTile(); });
});

// ====== Board interactions via pointer events ======
function beginZone(e){
  if(e.button!==undefined && e.button!==0) return; // only left
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
}
function moveZone(e){
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
}
function endZone(){
  if(dragging) dragging=null;
  if(selRect){
    const {x0,y0,x1,y1} = selRect;
    const minx=Math.min(x0,x1),maxx=Math.max(x0,x1),miny=Math.min(y0,y1),maxy=Math.max(y0,y1);
    selection = new Set(tiles.filter(t=> t.x>=minx && t.y>=miny && (t.x+t.w)<=maxx && (t.y+t.h)<=maxy).map(t=>t.id));
    selRect=null; render();
  }
}

board.addEventListener('pointerdown', (e)=>{ e.preventDefault(); beginZone(e); }, {passive:false});
window.addEventListener('pointermove', (e)=>{ e.preventDefault(); moveZone(e); }, {passive:false});
window.addEventListener('pointerup', endZone);

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
  // ยกเลิกเลือกต้นฉบับ เหลือเลือกเฉพาะที่เพิ่มใหม่
  selection.clear();
  clones.forEach(c=> selection.add(c.id));
  render();
};
document.getElementById('btn-zoom-in').onclick  = ()=>{ zoom = clamp(zoom*1.25, .4, 2.2); render(); };
document.getElementById('btn-zoom-out').onclick = ()=>{ zoom = clamp(zoom*0.8,  .4, 2.2); render(); };

// popup help
btnHelp.onclick = ()=> help.style.display='flex';
helpX.onclick = ()=> { help.style.display='none'; const s=ytframe.src; ytframe.src=s; };

// ====== NEW: links modal (📖) ======
btnLinks.onclick = ()=> linksModal.style.display='flex';
linksX.onclick = ()=> { linksModal.style.display='none'; };

// ====== NEW: lesson modal (💡) with per-mode URLs ======
const LESSON_URLS = {
  int_add:  'https://www.youtube.com/embed/CAywl7PRu74',
  int_sub:  'https://www.youtube.com/embed/VcCwksc542k',
  int_mul:  'https://www.youtube.com/embed/CZ7KB4qXIG8',
  int_div:  'https://www.youtube.com/embed/AWdSwZl7GXA',
  poly_add: 'https://www.youtube.com/embed/Z9poGbeeq1Q',
  poly_sub: 'https://www.youtube.com/embed/Z9poGbeeq1Q',
  poly_mul: 'https://www.youtube.com/embed/lWqybjwE2io',
  poly_div: 'https://www.youtube.com/embed/_VWSpo62__8',
  solve_lin:'https://www.youtube.com/embed/Z18zPt__6wg'
};
btnLesson.onclick = ()=>{
  const m = modeSel.value;
  const url = LESSON_URLS[m] || '';
  lessonFrame.src = url;
  lessonModal.style.display='flex';
};
lessonX.onclick = ()=>{
  lessonModal.style.display='none';
  // stop video by resetting src
  const s = lessonFrame.src; lessonFrame.src = s;
};

// ====== Mode & examples ======
modeSel.onchange = (e)=>{ mode = e.target.value; newExample(); };
document.getElementById('btn-new').onclick = ()=> newExample();
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};

// ====== Parser / formatting (r9 rules retained) ======
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

// ====== Example generator (kept r9 constraints) ======
function newExample(){
  showSol=false; document.getElementById('btn-solution').textContent='เฉลย';
  answerInput.value=''; checkResult.textContent='';
  tiles=[]; selection.clear();
  showWorkspace(null);

  if(mode==='int_add'){
    const a=randNZIn(-15,15), b=randNZIn(-15,15);
    problemText = `${a} + ${b<0?`(${b})`:b}`;
    const sum=a+b; answerCoef={a2:0,a1:0,a0:sum}; problemAnswer=String(sum);
  }else if(mode==='int_sub'){
    const a=randNZIn(-15,15), b=randNZIn(-15,15);
    problemText = `${a} - ${b<0?`(${b})`:b}`;
    const res=a-b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
  }else if(mode==='int_mul'){
    const a=randNZIn(-15,15), b=randNZIn(-15,15);
    problemText = `${a} × ${b<0?`(${b})`:b}`;
    const res=a*b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
    showWorkspace('mul'); mulMult.textContent=b; mulMcand.textContent=a;
  }else if(mode==='int_div'){
    // divisor, quotient in [-15,15]\{0}, dividend = divisor*quotient
    const divisor=randNZIn(-15,15), q=randNZIn(-15,15), dividend=divisor*q;
    problemText = `${dividend} ÷ ${divisor<0?`(${divisor})`:divisor}`;
    answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); divDivisor.textContent=divisor; divQuot.value='';
  }else if(mode==='poly_add' || mode==='poly_sub' || mode==='poly_mul'){
    // r9: poly add/sub deg 1 or 2, coef in [-9,9]\{0}; multiply deg≤1
    const degP = (mode==='poly_mul') ? 1 : (Math.random()<.5 ? 2 : 1);
    const degQ = (mode==='poly_mul') ? 1 : (Math.random()<.5 ? 2 : 1);
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
      // clamp display to |coef| ≤ 36 (soft display rule)
      problemAnswer = coefToHTML(answerCoef);
      showWorkspace('mul');
      mulMult.innerHTML = formatPolyInline(Q.coef);
      mulMcand.innerHTML = formatPolyInline(P.coef);
    }
  }else if(mode==='poly_div'){
    // r9: divisor = (x + d) or sx+t, dividend generated to be divisible; coefs filtered small for display
    // Here choose linear divisor s x + t with s≠0 (|s|,|t| ≤ 9), quotient deg 1, dividend = divisor*quot
    let s=randNZIn(-9,9), t=randNZIn(-9,9), a=randNZIn(-9,9), b=randNZIn(-9,9);
    // dividend = (s x + t)(a x + b) = (sa)x^2 + (sb+ta)x + tb
    const A2 = s*a, A1 = s*b + t*a, A0 = t*b;
    problemText = `[${formatPolyInline({a2:A2,a1:A1,a0:A0})}] ÷ [${formatPolyLinear(s,t)}]`;
    answerCoef = {a2:0,a1:a,a0:b};
    problemAnswer = coefToHTML(answerCoef);
    showWorkspace('div');
    divDivisor.innerHTML = formatLinearPretty(s,t);
    divQuot.value='';
  }else if(mode==='solve_lin'){
    // ax + b = cx + d → find x
    let a,b,c,x,d,ok=false;
    while(!ok){
      a=randNZIn(-15,15); b=randNZIn(-15,15); c=randNZIn(-15,15); x = rint(-15,15); if(x===0) continue;
      d = a*x + b - c*x;
      if(Math.abs(d)<=15){ ok=true; }
    }
    problemText = `${a===1?'':a===-1?'-':''}x${b>=0?'+':''}${b} = ${c===1?'':c===-1?'-':''}x${d>=0?'+':''}${d}`.replace(/\+\-/g,'-');
    answerCoef={a2:0,a1:1,a0:-x}; problemAnswer=`x = ${x}`;
    showWorkspace('solve');
  }

  render();
}

function formatPolyInline(coef){
  // returns term formatting with () on negative non-leading terms, wrapped by nothing (for inline)
  const {a2,a1,a0} = coef;
  const parts=[];
  if(a2){ parts.push( a2===1?'x<sup>2</sup>': (a2===-1?'-x<sup>2</sup>':`${a2}x<sup>2</sup>`)); }
  if(a1){
    const t = (a1===1?'x': a1===-1?'-x': `${a1}x`);
    parts.push( a1<0 && parts.length? `(${t})` : t );
  }
  if(a0){
    parts.push( a0<0 && parts.length? `(${a0})` : `${a0}` );
  }
  return parts.length? parts.join(' + ').replace(/\+ -/g,'+ (-') : '0';
}
function formatPolyLinear(s,t){ // for bracketed divisor
  const inner = `${ s===1?'x': s===-1?'-x': `${s}x`} ${ t<0? '+ ('+t+')' : (t>0? '+ '+t : '') }`.replace(/\s+/g,' ').trim();
  return `[${inner}]`;
}
function formatLinearPretty(s,t){
  return `${ s===1?'x': s===-1?'-x': `${s}x` }${ t>=0?'+':'' }${ t }`.replace(/\+\-/, '-');
}

function buildPoly(deg){
  // coef in [-9,9]\{0}
  const pick = ()=> randNZIn(-9,9);
  if(deg===2){
    const a=pick(), b=pick(), c=pick();
    const html = `[${formatPolyInline({a2:a,a1:b,a0:c})}]`;
    return {coef:{a2:a,a1:b,a0:c}, html};
  }else{
    const b=pick(), c=pick();
    const html = `[${formatPolyInline({a2:0,a1:b,a0:c})}]`;
    return {coef:{a2:0,a1:b,a0:c}, html};
  }
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
