/* Algebra Tiles by Kru Zack — app.js (r10.4.1)
Change log:
- REMOVE Google Sheet / login counters / GAS fetch — no tracking or saving
- Keep everything else: pointer events, generators, consistent brackets, div-based tables
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

const linksModal = document.getElementById('linksModal');
const videoModal = document.getElementById('videoModal');
const helpModal  = document.getElementById('help');
const topicVideo = document.getElementById('topicVideo');

// inputs must not start drag
['pointerdown'].forEach(evt=>{
  if(divQuot) divQuot.addEventListener(evt, e=>e.stopPropagation());
  if(answerInput) answerInput.addEventListener(evt, e=>e.stopPropagation());
});

// ====== Tiles config ======
const TYPES = {
  x2:      {labelHTML:'x<sup>2</sup>',   w:120, h:120, color:'var(--blue)',   shape:'square', neg:'neg_x2'},
  neg_x2:  {labelHTML:'-x<sup>2</sup>',  w:120, h:120, color:'var(--red)',    shape:'square', neg:'x2'},
  x:       {labelHTML:'x',               w:30,  h:120, color:'var(--green)',  shape:'rectV',  neg:'neg_x'}, // vertical first
  neg_x:   {labelHTML:'-x',              w:30,  h:120, color:'var(--red)',    shape:'rectV',  neg:'x'},
  one:     {labelHTML:'1',               w:30,  h:30,  color:'var(--yellow)', shape:'mini',   neg:'neg_one'},
  neg_one: {labelHTML:'-1',              w:30,  h:30,  color:'var(--red)',    shape:'mini',   neg:'one'}
};

let tiles = [];     // {id,type,x,y,w,h}
let selection = new Set();
let dragging = null; // {ids,offsets[]}
let selRect = null;
let zoom = 1;
let showSol = false;
let modeElem = document.getElementById('mode');
let mode = modeElem ? modeElem.value : 'int_add';

let problemText = '';
let problemAnswer = '';
let answerCoef = {a2:0,a1:0,a0:0}; // สำหรับตรวจพหุนาม/จำนวนเต็ม

// ====== Utils ======
const uid = ()=> Math.random().toString(36).slice(2);
const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));

// RNG helpers
function rint(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function randNZIn(a,b){ let v=0; while(v===0){ v=rint(a,b); } return v; }
const rng = {
  int15(){return randNZIn(-15,15);},
  int12(){return randNZIn(-12,12);},
  int9(){return randNZIn(-9,9);},
  int20(){return randNZIn(-20,20);}
};

// Workspace visibility
function showWorkspace(which){
  wsSolve.style.display = (which==='solve') ? 'block':'none';
  wsMul.style.display   = (which==='mul')   ? 'block':'none';
  wsDiv.style.display   = (which==='div')   ? 'block':'none';
}

// pointer to board coords (Pointer Events)
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

    const showLabel = (t.h >= 50 || TYPES[t.type].shape!=='rectH');
    el.innerHTML = showLabel ? '<span>'+TYPES[t.type].labelHTML+'</span>' : '';

    // pointer handlers
    const onDown = (e)=>{
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
    el.addEventListener('pointerdown', onDown);
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
  el.addEventListener('pointerdown', (e)=>{e.preventDefault(); addTile();});
});

// ====== Board interactions (Pointer Events) ======
const beginZone = (e)=>{
  if(e.button!==undefined && e.button!==0) return; // only main button
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
window.addEventListener('pointermove', (e)=>{ if(dragging||selRect){ e.preventDefault(); moveZone(e);} }, {passive:false});
window.addEventListener('pointerup', endZone, {passive:false});

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
    const sh = TYPES[t.type].shape;
    if(!selection.has(t.id)) return t;
    if(sh==='rectV') return {...t, w:120, h:30,      /* flip to horizontal */};
    if(sh==='rectH') return {...t, w:30,  h:120};
    return t;
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
  // ยกเลิก select ต้นฉบับ ให้เลือกเฉพาะที่เพิ่มมา
  selection.clear();
  clones.forEach(c=> selection.add(c.id));
  render();
};
document.getElementById('btn-zoom-in').onclick  = ()=>{ zoom = clamp(zoom*1.25, .4, 2.2); render(); };
document.getElementById('btn-zoom-out').onclick = ()=>{ zoom = clamp(zoom*0.8,  .4, 2.2); render(); };

// help modal
document.getElementById('btn-help').onclick   = ()=> helpModal.style.display='flex';
document.getElementById('help-x').onclick     = ()=> helpModal.style.display='none';

// links modal
document.getElementById('btn-links').onclick  = ()=> linksModal.style.display='flex';
document.querySelectorAll('.close-x[data-close="#linksModal"]').forEach(b=>{
  b.addEventListener('click', ()=> linksModal.style.display='none');
});

// video modal by mode
document.getElementById('btn-idea').onclick = ()=>{
  const url = videoURLByMode(mode);
  topicVideo.src = url;
  videoModal.style.display='flex';
};
document.querySelectorAll('.close-x[data-close="#videoModal"]').forEach(b=>{
  b.addEventListener('click', ()=>{
    // stop video
    const u = topicVideo.src; topicVideo.src=''; topicVideo.src=u.replace('&autoplay=1','');
    videoModal.style.display='none';
  });
});
function videoURLByMode(m){
  switch(m){
    case 'int_add': return 'https://www.youtube.com/embed/CAywl7PRu74?autoplay=1';
    case 'int_sub': return 'https://www.youtube.com/embed/VcCwksc542k?autoplay=1';
    case 'int_mul': return 'https://www.youtube.com/embed/CZ7KB4qXIG8?autoplay=1';
    case 'int_div': return 'https://www.youtube.com/embed/AWdSwZl7GXA?autoplay=1';
    case 'poly_add': return 'https://www.youtube.com/embed/Z9poGbeeq1Q?autoplay=1';
    case 'poly_sub': return 'https://www.youtube.com/embed/Z9poGbeeq1Q?autoplay=1';
    case 'poly_mul': return 'https://www.youtube.com/embed/lWqybjwE2io?autoplay=1';
    case 'poly_div': return 'https://www.youtube.com/embed/_VWSpo62__8?autoplay=1';
    case 'solve_lin': return 'https://www.youtube.com/embed/Z18zPt__6wg?autoplay=1';
    default: return '';
  }
}

// ====== Mode & examples ======
modeElem.onchange = (e)=>{ mode = e.target.value; newExample(); };
document.getElementById('btn-new').onclick = ()=> newExample();
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};

// manual input (optional, basic passthrough to boxes)
const manualInput = document.getElementById('manualInput');
const btnApplyManual = document.getElementById('btn-apply-manual');
if(btnApplyManual){
  btnApplyManual.onclick = ()=>{
    const s = (manualInput.value||'').trim();
    if(!s) return;
    problemText = s; problemAnswer = ''; showSol=false;
    solutionBox.innerHTML=''; render();
  };
}

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
function coefToHTML({a2,a1,a0}, wrap=false){
  // present WITHOUT square brackets by default (solutions)
  const parts=[];
  if(a2){ parts.push(termDeg2(a2,true)); }
  if(a1){ parts.push(termDeg1(a1, a2?2:1)); }
  if(a0){ parts.push(termC(a0, a2?2: (a1?1:0))); }
  const s = parts.length? parts.join(' + ').replace(/\+ -/g,'+ (-') : '0';
  return wrap ? `[${s}]` : s;
}
function termDeg2(k,isLead){
  if(k===1)  return 'x<sup>2</sup>';
  if(k===-1) return isLead ? '-x<sup>2</sup>' : '(-x<sup>2</sup>)';
  return (k<0 && !isLead) ? `(${k}x<sup>2</sup>)` : `${k}x<sup>2</sup>`;
}
function termDeg1(k,deg){
  if(k===1)  return 'x';
  if(k===-1) return (deg===1 ? '-x' : '(-x)');
  return (k<0 && deg===2) ? `(${k}x)` : `${k}x`;
}
function termC(k,deg){
  return (k<0 && deg>0) ? `(${k})` : `${k}`;
}

// add/mul helpers
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

// Build random polynomials (deg 1 or 2) with bracket rules
function buildPolyDeg(deg, range='9'){ // range '9' => [-9,9]\{0}, '20' => [-20,20]\{0}
  const pick = (range==='20') ? rng.int20 : rng.int9;
  if(deg===2){
    const a = pick(), b = pick(), c = pick();
    const t2 = termDeg2(a,true);
    const t1 = termDeg1(b,2);
    const t0 = termC(c,2);
    const inner = [t2, ' + '+t1, ' + '+t0].join('').replace(/\+ \(-/g,'+ (-');
    return {coef:{a2:a,a1:b,a0:c}, html:`[${inner}]`};
  }else{
    const b = pick(), c = pick();
    const t1 = termDeg1(b,1);
    const t0 = termC(c,1);
    const inner = [t1, ' + '+t0].join('').replace(/\+ \(-/g,'+ (-');
    return {coef:{a2:0,a1:b,a0:c}, html:`[${inner}]`};
  }
}

// ====== Example generator ======
function newExample(){
  showSol=false; document.getElementById('btn-solution').textContent='เฉลย';
  answerInput.value=''; checkResult.textContent='';
  tiles=[]; selection.clear();
  showWorkspace(null);

  if(mode==='int_add'){
    const a=rng.int15(), b=rng.int15();
    problemText = `${a} + ${b<0?`(${b})`:b}`;
    const sum=a+b; answerCoef={a2:0,a1:0,a0:sum}; problemAnswer=String(sum);
  }else if(mode==='int_sub'){
    const a=rng.int15(), b=rng.int15();
    problemText = `${a} - ${b<0?`(${b})`:b}`;
    const res=a-b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
  }else if(mode==='int_mul'){
    const a=rng.int15(), b=rng.int15();
    problemText = `${a} × ${b<0?`(${b})`:b}`;
    const res=a*b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
    showWorkspace('mul'); mulMult.textContent=b; mulMcand.textContent=a;
  }else if(mode==='int_div'){
    // integer division must be exact; choose divisor, quotient in [-12,12]\{0}
    const divisor=rng.int12(), q=rng.int12(), dividend=divisor*q;
    problemText = `${dividend} ÷ ${divisor<0?`(${divisor})`:divisor}`;
    answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); divDivisor.textContent=divisor; divQuot.value='';
  }else if(mode==='poly_add' || mode==='poly_sub' || mode==='poly_mul'){
    // deg limits:
    //  - add/sub: P,Q deg 1 or 2; coeffs in [-9,9]\{0}
    //  - mul: both factors deg <=1; coeffs in [-9,9]\{0}; cap shown coef |<=36 (guaranteed by range)
    const degP = (mode==='poly_mul') ? 1 : (Math.random()<.5 ? 2 : 1);
    const degQ = (mode==='poly_mul') ? 1 : (Math.random()<.5 ? 2 : 1);
    const P = buildPolyDeg(degP,'9');
    const Q = buildPolyDeg(degQ,'9');

    if(mode==='poly_add'){
      problemText = `${P.html} + ${Q.html}`;
      answerCoef = addCoef(P.coef, Q.coef);
      problemAnswer = coefToHTML(answerCoef,false);
    }else if(mode==='poly_sub'){
      problemText = `${P.html} - ${Q.html}`;
      answerCoef = addCoef(P.coef, {a2:-Q.coef.a2, a1:-Q.coef.a1, a0:-Q.coef.a0});
      problemAnswer = coefToHTML(answerCoef,false);
    }else{
      // multiply (deg<=1 each)
      problemText = `${P.html} × ${Q.html}`;
      answerCoef = mulCoef(P.coef, Q.coef);
      problemAnswer = coefToHTML(answerCoef,false);
      showWorkspace('mul');
      mulMult.innerHTML = coefToHTML(Q.coef,false).replace(/\+ \(-/g,'+ (-');
      mulMcand.innerHTML = coefToHTML(P.coef,false).replace(/\+ \(-/g,'+ (-');
    }
  }else if(mode==='poly_div'){
    // divisor: s x + t (s≠0) with s,t in [-9,9]\{0}
    // quotient: deg 1 or 2? spec earlier says divisor deg<=1; dividend formed by divisor*quotient; keep dividend coefficients bounded
    const s = rng.int9(), t = rng.int9();
    const quotientDeg = Math.random()<.5?1:2;
    const Q = buildPolyDeg(quotientDeg, '9'); // quotient
    // Dividend = (s x + t) * Q
    const D = mulCoef({a2:0,a1:s,a0:t}, Q.coef);

    // ensure readable dividend (limit magnitude)
    if (Math.abs(D.a2)>36 || Math.abs(D.a1)>36 || Math.abs(D.a0)>36) { return newExample(); }

    const divisorHTML = `[${termDeg1(s,1)} + ${termC(t,1)}]`.replace(/\+ \(-/g,'+ (-');
    const dividendHTML = coefToHTML(D,true);

    problemText = `${dividendHTML} ÷ ${divisorHTML}`;
    answerCoef = Q.coef; // quotient
    problemAnswer = coefToHTML(answerCoef,false);

    showWorkspace('div');
    divDivisor.innerHTML = `x${t>=0?'+':''}${t}`.replace('1x','x'); // simplified text cell
    divQuot.value='';
  }else if(mode==='solve_lin'){
    // a x + b = c x + d ; choose to keep numbers readable
    let a,b,c,x,d,ok=false;
    while(!ok){
      a=rng.int15(); b=rng.int15(); c=rng.int15(); x = rint(-15,15); if(x===0) continue;
      d = a*x + b - c*x;
      if(Math.abs(d)<=15){ ok=true; }
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
    if(!/^-?\d+$/.test(s)){ return bad(); }
    if(parseInt(s,10) === answerCoef.a0){ return good(); } else { return bad(); }
  }
  if(mode==='solve_lin'){
    let s = stripPar(given);
    let m = s.match(/^x=?(-?\d+)$/i); if(m){ s=m[1]; }
    if(!/^-?\d+$/.test(s)){ return bad(); }
    const val = parseInt(s,10);
    const truth = -answerCoef.a0;
    if(val===truth){ return good(); } else { return bad(); }
  }
  const parsed = parsePoly(given);
  if(!parsed){ return bad(); }
  if(equalsCoef(parsed, answerCoef)){ return good(); } else { return bad(); }

  function good(){ checkResult.textContent='ถูกต้อง ✅'; checkResult.style.color='#16a34a'; }
  function bad(){ checkResult.textContent='ไม่ถูก ❌ ลองใหม่'; checkResult.style.color='#dc2626'; }
};
function equalsCoef(a,b){ return a.a2===b.a2 && a.a1===b.a1 && a.a0===b.a0; }

// ====== Init ======
document.getElementById('btn-new').focus();
newExample();
render();
