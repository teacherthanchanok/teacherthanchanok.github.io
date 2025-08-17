/* r9.3 – FULL LOGIC
 * - Keep your UI intact, switch workspaces' tables to <div> structure (handled in HTML/CSS)
 * - Merge full random/format/check logic:
 *   Integers: [-15,15]\{0}; int-division guaranteed exact (dividend = divisor * quotient)
 *   Poly add/sub: degrees 1 or 2; coefficients in [-9,9]\{0}; show problem with [ ... ] but solution without [ ]
 *   Poly multiply: both factors degree ≤1; coefficients in [-9,9]\{0}; cap |coef|<=36 for readability
 *   Poly divide: divisor = s x + t (s≠0), quotient = a x + b (a,b≠0) → dividend = divisor * quotient
 *                pick until dividend coefficients all within [-20,20]; guarantee exact division
 *   Formatting: negative non-leading term wrapped in (...); degree-2 leading term not wrapped if negative
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

// inputs: stop event bubbling so drag/selection won't start
['pointerdown','mousedown','touchstart'].forEach(evt=>{
  if(divQuot)      divQuot.addEventListener(evt, e=>e.stopPropagation(), {passive:false});
  if(answerInput)  answerInput.addEventListener(evt, e=>e.stopPropagation(), {passive:false});
});

// ====== Tiles config (unchanged) ======
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
let answerCoef = {a2:0,a1:0,a0:0}; // ใช้ตรวจสำหรับพหุนามและจำนวนเต็ม

// ====== Utils ======
const uid = ()=> Math.random().toString(36).slice(2);
const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));

// Random helpers
function rint(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function sign(){ return Math.random()<.5 ? -1 : 1; }
function randNZBound(max){ // [-max, max] \ {0}
  let v=0; while(v===0){ v = sign()*rint(1,max); } return v;
}
const randIntNZ15 = ()=> randNZBound(15);
const randIntNZ9  = ()=> randNZBound(9);
const randIntNZ20 = ()=> randNZBound(20);

// Workspace visibility
function showWorkspace(which){
  wsSolve.style.display = (which==='solve') ? 'block':'none';
  wsMul.style.display   = (which==='mul')   ? 'block':'none';
  wsDiv.style.display   = (which==='div')   ? 'block':'none';
}

// pointer to board coords
function pt(e){
  const rect = board.getBoundingClientRect();
  const cx = ('clientX' in e) ? e.clientX : (e.touches? e.touches[0].clientX : 0);
  const cy = ('clientY' in e) ? e.clientY : (e.touches? e.touches[0].clientY : 0);
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

    const startDrag = (e)=>{
      e.stopPropagation(); e.preventDefault?.();
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
  if(e.button!==undefined && e.button!==0) return; // right-click ignore
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
  const clones = selectedTiles.map((t,i)=>{
    const spot = findFreeSpot(t.w, t.h);
    return {...t, id:uid(), x:spot.x + i*12, y:spot.y + i*12};
  });
  // deselect originals; select only clones (ตามคำขอเดิม ๆ)
  selection.clear();
  clones.forEach(c=> selection.add(c.id));
  tiles = [...tiles, ...clones];
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

// ====== Parsing & formatting (degree ≤2) ======
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
  res.a2|=0; res.a1|=0; res.a0|=0;
  return res;
}
function coefToHTMLNoBrackets({a2,a1,a0}){ // สำหรับ "เฉลย" (ไม่ใส่ [ ])
  const parts=[];
  if(a2){ parts.push((a2===1?'':a2===-1?'-':a2)+'x<sup>2</sup>'); }
  if(a1){ parts.push((a1===1?'':a1===-1?'-':a1)+'x'); }
  if(a0){ parts.push(String(a0)); }
  if(parts.length===0) return '0';
  const s = parts.join(' + ').replace(/\+ -/g,'+ (-');
  // ปิดวงเล็บให้สมบูรณ์กรณี + (-k
  return s.replace(/\(\-([^)]+)$/g,'(-$1)');
}

// สร้างข้อความพหุนามตามกฎวงเล็บ พร้อมเลือกใส่ [ ] หรือไม่
function formatPoly(coef, withSquareBrackets){
  const {a2,a1,a0} = coef;
  const deg = (a2!==0)?2 : ((a1!==0)?1:0);

  const t2 = (()=>{
    if(a2===0) return '';
    if(a2===1) return 'x<sup>2</sup>';
    if(a2===-1) return (deg===2? '-x<sup>2</sup>' : '(-x<sup>2</sup>)');
    // ถ้าเป็นพจน์นำ deg=2 และติดลบ — ไม่ครอบ ()
    if(a2<0 && deg===2) return `${a2}x<sup>2</sup>`;
    return `${a2}x<sup>2</sup>`;
  })();

  const t1 = (()=>{
    if(a1===0) return '';
    if(a1===1) return 'x';
    if(a1===-1) return (deg===1? '-x' : '(-x)');
    // ถ้า deg=2 และเป็นลบ → ครอบ ()
    if(a1<0 && deg===2) return `(${a1}x)`;
    // ถ้า deg=1 เป็นพจน์นำ ไม่ต้องครอบ
    return `${a1}x`;
  })();

  const t0 = (()=>{
    if(a0===0) return '';
    return (a0<0)? `(${a0})` : `${a0}`;
  })();

  // ประกอบพร้อมเครื่องหมาย +
  const pieces = [];
  if(t2) pieces.push(t2);
  if(t1) pieces.push((pieces.length? ' + ' : '') + t1);
  if(t0) pieces.push((pieces.length? ' + ' : '') + t0);
  let inner = pieces.join('').replace(/\+ -/g,'+ (-');

  // ปิดวงเล็บกรณีตกหล่น
  inner = inner.replace(/\(\-([^)]+)$/g,'(-$1)');

  return withSquareBrackets ? `[${inner}]` : inner || '0';
}

// ====== Coef ops ======
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

// ====== Random builders ======
// degree 2: ax^2 + bx + c (a,b,c ≠ 0 from [-9,9]); degree 1: bx + c
function buildRandomPoly(deg, rng=randIntNZ9){
  if(deg===2){
    return {a2:rng(), a1:rng(), a0:rng()};
  }else{
    return {a2:0, a1:rng(), a0:rng()};
  }
}

// product constraints for multiply (cap |coef| ≤ 36)
function withinCap36(C){
  return Math.abs(C.a2)<=36 && Math.abs(C.a1)<=36 && Math.abs(C.a0)<=36;
}

// ====== Example generator ======
function newExample(){
  showSol=false; document.getElementById('btn-solution').textContent='เฉลย';
  answerInput.value=''; checkResult.textContent='';
  tiles=[]; selection.clear();
  showWorkspace(null);

  if(mode==='int_add'){
    const a=randIntNZ15(), b=randIntNZ15();
    const bStr = b<0?`(${b})`:b;
    problemText = `${a} + ${bStr}`;
    const sum=a+b;
    answerCoef={a2:0,a1:0,a0:sum}; problemAnswer=String(sum);

  }else if(mode==='int_sub'){
    const a=randIntNZ15(), b=randIntNZ15();
    const bStr = b<0?`(${b})`:b;
    problemText = `${a} - ${bStr}`;
    const res=a-b;
    answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);

  }else if(mode==='int_mul'){
    const a=randIntNZ15(), b=randIntNZ15();
    const bStr = b<0?`(${b})`:b;
    problemText = `${a} × ${bStr}`;
    const res=a*b;
    answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
    showWorkspace('mul'); mulMult.textContent=bStr; mulMcand.textContent=String(a);

  }else if(mode==='int_div'){
    // exact division: all numbers ∈ [-15,15]\{0}
    let divisor, q, dividend;
    do{
      divisor = randIntNZ15();
      q = randIntNZ15();
      dividend = divisor*q;
    }while(Math.abs(dividend)>15); // บังคับตัวตั้งไม่เกิน 15 เช่นกัน ตามข้อกำหนดล่าสุด
    const dStr = divisor<0?`(${divisor})`:divisor;
    problemText = `${dividend} ÷ ${dStr}`;
    answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); divDivisor.textContent=String(divisor); divQuot.value='';

  }else if(mode==='poly_add' || mode==='poly_sub'){
    const degP = Math.random()<.5 ? 2 : 1;
    const degQ = Math.random()<.5 ? 2 : 1;
    const P = buildRandomPoly(degP, randIntNZ9);
    const Q = buildRandomPoly(degQ, randIntNZ9);

    const Ptxt = formatPoly(P, true);
    const Qtxt = formatPoly(Q, true);

    if(mode==='poly_add'){
      problemText = `${Ptxt} + ${Qtxt}`;
      answerCoef = addCoef(P,Q);
      problemAnswer = coefToHTMLNoBrackets(answerCoef);
    }else{
      problemText = `${Ptxt} - ${Qtxt}`;
      answerCoef = subCoef(P,Q);
      problemAnswer = coefToHTMLNoBrackets(answerCoef);
    }

  }else if(mode==='poly_mul'){
    // factors deg ≤1; rng in [-9,9]\{0}; cap product ≤36
    let A,B,ok=false,res;
    while(!ok){
      A = buildRandomPoly(1, randIntNZ9);
      B = buildRandomPoly(1, randIntNZ9);
      res = mulCoef(A,B);
      ok = withinCap36(res);
    }
    const Atxt = formatPoly(A, true);
    const Btxt = formatPoly(B, true);
    problemText = `${Atxt} × ${Btxt}`;
    answerCoef = res;
    problemAnswer = coefToHTMLNoBrackets(answerCoef);

    showWorkspace('mul');
    mulMcand.innerHTML = coefToHTMLNoBrackets(A);
    mulMult.innerHTML  = coefToHTMLNoBrackets(B);

  }else if(mode==='poly_div'){
    // divisor = s x + t (s≠0), quotient = a x + b (a,b≠0) → dividend = divisor * quotient
    // pick until dividend coefficients are within [-20,20]
    let s,t,a,b,Dividend,ok=false;
    while(!ok){
      s = randIntNZ20(); t = randIntNZ20();
      a = randIntNZ20(); b = randIntNZ20();
      const Divisor  = {a2:0, a1:s, a0:t};
      const Quotient = {a2:0, a1:a, a0:b};
      Dividend = mulCoef(Divisor, Quotient); // deg 2
      ok = (Math.abs(Dividend.a2)<=20 && Math.abs(Dividend.a1)<=20 && Math.abs(Dividend.a0)<=20);
      if(ok){
        // double-check exact division: Dividend == Divisor * Quotient (already true)
      }
    }
    const Divisor = {a2:0,a1:s,a0:t};
    const Quotient= {a2:0,a1:a,a0:b};

    const DividendTxt = formatPoly(Dividend, true);
    const DivisorTxt  = formatPoly(Divisor,  true);

    problemText = `${DividendTxt} ÷ ${DivisorTxt}`;
    answerCoef = Quotient; // expected result
    problemAnswer = coefToHTMLNoBrackets(answerCoef);

    showWorkspace('div');
    divDivisor.innerHTML = coefToHTMLNoBrackets(Divisor);
    divQuot.value='';

  }else if(mode==='solve_lin'){
    // ax + b = cx + d with x ∈ [-15,15]\{0}; ensure |d|≤15
    let a,b,c,x,d,ok=false;
    while(!ok){
      a=randIntNZ15(); b=randIntNZ15(); c=randIntNZ15(); x = rint(-15,15); if(x===0) continue;
      d = a*x + b - c*x;
      ok = Math.abs(d)<=15;
    }
    // format
    const left  = `${a===1?'':a===-1?'-':''}x${b>=0?'+':''}${b}`.replace(/\+\-/g,'-');
    const right = `${c===1?'':c===-1?'-':''}x${d>=0?'+':''}${d}`.replace(/\+\-/g,'-');
    problemText = `${left} = ${right}`;
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
    return (parseInt(s,10) === answerCoef.a0) ? good() : bad();
  }

  if(mode==='solve_lin'){
    let s = stripPar(given);
    let m = s.match(/^x=?(-?\d+)$/i); if(m){ s=m[1]; }
    if(!/^-?\d+$/.test(s)){ return bad(); }
    const val = parseInt(s,10);
    const truth = -answerCoef.a0;
    return (val===truth) ? good() : bad();
  }

  const parsed = parsePoly(given);
  if(!parsed){ return bad(); }
  if(equalsCoef(parsed, answerCoef)){ good(); } else { bad(); }

  function good(){ checkResult.textContent='ถูกต้อง'; checkResult.style.color='#16a34a'; }
  function bad(){ checkResult.textContent='ไม่ถูกต้อง'; checkResult.style.color='#dc2626'; }
};
function equalsCoef(a,b){ return a.a2===b.a2 && a.a1===b.a1 && a.a0===b.a0; }

// ====== Init ======
document.getElementById('btn-new').focus();
document.getElementById('mode').onchange = (e)=>{ mode = e.target.value; newExample(); };
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};
document.getElementById('btn-new').onclick = ()=> newExample();
newExample();
render();
