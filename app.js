/* ======= DOM refs ======= */
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

const helpModal = document.getElementById('help');
const helpClose = document.getElementById('help-close');
const helpX = document.getElementById('help-x');

/* ======= Tiles config ======= */
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
let answerCoef = {a2:0,a1:0,a0:0}; // สำหรับตรวจพหุนาม/จำนวนเต็ม

/* ======= Utils ======= */
const uid = ()=> Math.random().toString(36).slice(2);
const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));

function showWorkspace(which){
  wsSolve.style.display = (which==='solve') ? 'block':'none';
  wsMul.style.display   = (which==='mul')   ? 'block':'none';
  wsDiv.style.display   = (which==='div')   ? 'block':'none';
}

/* ======= Render ======= */
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

    // pointer handler (works on mouse & touch)
    el.addEventListener('pointerdown', e=>{
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
    }, {passive:false});

    el.addEventListener('pointermove', e=>{
      if(!dragging) return;
      const p = pt(e);
      tiles = tiles.map(tt=>{
        const off = dragging.offsets.find(o=>o.id===tt.id);
        if(!off) return tt;
        return {...tt, x:p.x - off.dx, y:p.y - off.dy};
      });
      render();
    });

    el.addEventListener('pointerup', ()=>{
      dragging = null;
    });

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

/* ======= Geometry helpers ======= */
function pt(e){
  const rect = board.getBoundingClientRect();
  const pageX = (e.pageX !== undefined) ? e.pageX : (e.touches && e.touches[0].pageX);
  const pageY = (e.pageY !== undefined) ? e.pageY : (e.touches && e.touches[0].pageY);
  const clientX = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0].clientX);
  const clientY = (e.clientY !== undefined) ? e.clientY : (e.touches && e.touches[0].clientY);
  const x = ((clientX ?? 0) - rect.left) / zoom;
  const y = ((clientY ?? 0) - rect.top) / zoom;
  return {x,y};
}
function overlaps(x,y,w,h,t){
  return !(x+w < t.x || x > t.x+t.w || y+h < t.y || y > t.y+t.h);
}
function findFreeSpot(w,h){
  const margin = 20;
  const startX = 280, startY = 100;
  let x=startX, y=startY;
  const step = 20;
  const limitX = 1800, limitY=1200;
  let tries=0;
  while(tries<2000){
    const collide = tiles.some(t=>overlaps(x,y,w,h,t));
    if(!collide) return {x,y};
    x += step; if(x+w+margin>limitX){ x=startX; y += step; if(y+h+margin>limitY){ y=startY; } }
    tries++;
  }
  return {x:startX,y:startY};
}

/* ======= Palette (add tiles) ======= */
palette.querySelectorAll('.pal-item').forEach(el=>{
  el.addEventListener('click', ()=>{
    const type = el.dataset.type;
    const tdef = TYPES[type];
    const id = uid();
    const start = findFreeSpot(tdef.w, tdef.h);
    tiles.push({id, type, x:start.x, y:start.y, w:tdef.w, h:tdef.h});
    selection = new Set([id]);
    render();
  });
});

/* ======= Board background interactions ======= */
board.addEventListener('pointerdown', e=>{
  // ถ้าแตะที่ input/textarea/ select ให้ปล่อยให้โฟกัสได้
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
  if(tag === 'input' || tag === 'textarea' || tag === 'select') return;

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

board.addEventListener('pointermove', e=>{
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
});
board.addEventListener('pointerup', ()=>{
  dragging=null;
  if(selRect){
    const {x0,y0,x1,y1} = selRect;
    const minx=Math.min(x0,x1),maxx=Math.max(x0,x1),miny=Math.min(y0,y1),maxy=Math.max(y0,y1);
    selection = new Set(tiles.filter(t=> t.x>=minx && t.y>=miny && (t.x+t.w)<=maxx && (t.y+t.h)<=maxy).map(t=>t.id));
    selRect=null; render();
  }
});

/* ======= Toolbar actions ======= */
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
  clones.forEach(c=> selection.add(c.id));
  render();
};
document.getElementById('btn-zoom-in').onclick  = ()=>{ zoom = clamp(zoom*1.25, .4, 2.2); render(); };
document.getElementById('btn-zoom-out').onclick = ()=>{ zoom = clamp(zoom*0.8,  .4, 2.2); render(); };

document.getElementById('btn-help').onclick = ()=>{
  helpModal.style.display='flex';
};
helpX.onclick = ()=>{
  stopYouTube();
  helpModal.style.display='none';
};
/* (รองรับกรณีมีปุ่ม help-close) */
const hc = document.getElementById('help-close');
if(hc){ hc.onclick = ()=>{ stopYouTube(); helpModal.style.display='none'; }; }

function stopYouTube(){
  const iframe = document.getElementById('ytplayer');
  if(!iframe) return;
  const src = iframe.getAttribute('src');
  iframe.setAttribute('src', src); // reload เพื่อหยุดเล่น
}

document.getElementById('mode').onchange = (e)=>{ mode = e.target.value; newExample(); };
document.getElementById('btn-new').onclick = ()=> newExample();
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};

/* ======= ตรวจคำตอบ ======= */
checkBtn.onclick = ()=>{
  checkResult.textContent=''; checkResult.style.color='';
  const givenRaw = answerInput.value;
  const given = givenRaw.replace(/\s+/g,'').replace(/−/g,'-');
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
  if(eqCoef(parsed, answerCoef)){ good(); } else { bad(); }

  function good(){ checkResult.textContent='ถูกต้อง'; checkResult.style.color='#16a34a'; }
  function bad(){ checkResult.textContent='ไม่ถูกต้อง'; checkResult.style.color='#dc2626'; }
};
function eqCoef(a,b){ return a.a2===b.a2 && a.a1===b.a1 && a.a0===b.a0; }

/* ======= Parser พหุนาม (ดีกรี ≤ 2) ======= */
function sanitizeInput(s){
  return String(s||'')
    .replace(/−/g,'-')
    .replace(/·|×/g,'*')
    .replace(/x²/gi,'x^2')
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
function coefToHTML({a2,a1,a0}){
  const parts=[];
  if(a2){ parts.push((a2===1?'':a2===-1?'-':a2)+'x<sup>2</sup>'); }
  if(a1){ parts.push((a1===1?'':a1===-1?'-':a1)+'x'); }
  if(a0){ parts.push(String(a0)); }
  return parts.length? parts.join(' + ').replace(/\+ -/g,'+ (-') : '0';
}

/* ======= Random helpers ======= */
function rint(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function coin(){ return Math.random()<.5 ? -1 : 1; }
function randNZ(){ let v=0; while(v===0){ v = coin()*rint(1,15); } return v; }

/* สร้างพจน์ด้วยกฎเรื่องวงเล็บ:
   - ถ้าดีกรีสูงสุดเป็น 2 และค่าสัมประสิทธิ์พจน์กำลังสองเป็นลบ -> ไม่ต้องใส่วงเล็บที่ ax^2
   - พจน์ x หรือ ค่าคงที่: ถ้าค่าสัมประสิทธิ์เป็นลบ ให้ใส่วงเล็บรอบทั้งพจน์ (เช่น (−5x), (−7))
   - ถ้าดีกรีสูงสุดเป็น 1 และสัมประสิทธิ์ของ x เป็นลบ -> ไม่ต้องใส่วงเล็บที่ bx
*/
function monoHTML(k, pow, topDegree){
  const neg = k < 0;
  if(pow===2){
    if(neg && topDegree===2){
      const kk = Math.abs(k);
      return (kk===1?'-':'-'+kk) + 'x<sup>2</sup>'; // ไม่มีวงเล็บ
    }
    if(k===1) return 'x<sup>2</sup>';
    if(k===-1) return '(-x<sup>2</sup>)';
    return (neg?`(${k})`:k)+'x<sup>2</sup>';
  }
  if(pow===1){
    if(neg && topDegree===1){
      const kk = Math.abs(k);
      return (kk===1?'-':'-'+kk) + 'x'; // ไม่มีวงเล็บ
    }
    if(k===1) return 'x';
    if(k===-1) return '(-x)';
    return (neg?`(${k})`:k)+'x';
  }
  return (neg?`(${k})`:String(k));
}

/* สุ่ม p(x) หรือ q(x) ตามกติกา (ดีกรี 1 หรือ 2, ค่าสัมประสิทธิ์จาก [-15,15]\{0}) */
function randPolyOperandDx(){
  const degree = Math.random()<0.5 ? 1 : 2; // อนุญาตทั้งดีกรี 1 และ 2
  let a=0,b=0,c=0;
  if(degree===2){
    a = randNZ(); b = randNZ(); c = randNZ();
  }else{
    b = randNZ(); c = randNZ();
  }
  const topDeg = degree;
  // HTML ตามกติกาวงเล็บ
  const parts = [];
  if(topDeg===2){
    parts.push( monoHTML(a,2,topDeg) );
    parts.push( ' + ' + monoHTML(b,1,topDeg) );
  }else{
    parts.push( monoHTML(b,1,topDeg) );
  }
  parts.push( ' + ' + monoHTML(c,0,topDeg) );
  let html = parts.join('').replace(/\+ \(-/g,'+ (-');
  // ครอบด้วย [ ] ตามข้อกำหนด
  html = '[' + html + ']';
  // ค่าสัมประสิทธิ์รวม (ใช้ตรวจคำตอบ)
  return {
    coef:{a2:(topDeg===2?a:0), a1:b, a0:c},
    html, degree:topDeg
  };
}

/* ======= สุ่มโจทย์ตามเมนู ======= */
function newExample(){
  showSol=false; document.getElementById('btn-solution').textContent='เฉลย';
  answerInput.value=''; checkResult.textContent='';
  tiles=[]; selection.clear();
  showWorkspace(null);

  if(mode==='int_add'){
    const a=randNZ(), b=randNZ(); const bStr = b<0?`(${b})`:b;
    problemText = `${a} + ${bStr}`; const sum=a+b;
    answerCoef={a2:0,a1:0,a0:sum}; problemAnswer=String(sum);
  }else if(mode==='int_sub'){
    const a=randNZ(), b=randNZ(); const bStr = b<0?`(${b})`:b;
    problemText = `${a} - ${bStr}`; const res=a-b;
    answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
  }else if(mode==='int_mul'){
    const a=randNZ(), b=randNZ(); const bStr = b<0?`(${b})`:b;
    problemText = `${a} × ${bStr}`; const res=a*b;
    answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
    showWorkspace('mul'); mulMult.textContent=b; mulMcand.textContent=a;
  }else if(mode==='int_div'){
    // ค่าภายในช่วง [-15,15]\{0}
    const divisor=randNZ(), q=randNZ(), dividend=divisor*q;
    const dStr = divisor<0?`(${divisor})`:divisor;
    problemText = `${dividend} ÷ ${dStr}`;
    answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); divDivisor.textContent=divisor; divQuot.value='';
  }else if(mode==='poly_add' || mode==='poly_sub' || mode==='poly_mul' || mode==='poly_div'){
    const P=randPolyOperandDx();
    const Q=randPolyOperandDx();

    if(mode==='poly_add'){
      problemText = `${P.html} + ${Q.html}`;
      const sum={a2:P.coef.a2+Q.coef.a2, a1:P.coef.a1+Q.coef.a1, a0:P.coef.a0+Q.coef.a0};
      answerCoef=sum; problemAnswer=coefToHTML(sum);
    }else if(mode==='poly_sub'){
      problemText = `${P.html} - ${Q.html}`;
      const res={a2:P.coef.a2-Q.coef.a2, a1:P.coef.a1-Q.coef.a1, a0:P.coef.a0-Q.coef.a0};
      answerCoef=res; problemAnswer=coefToHTML(res);
    }else if(mode==='poly_mul'){
      problemText = `${P.html} × ${Q.html}`;
      // คูณพหุนามดีกรี ≤ 2 แบบตรงไปตรงมา
      const prod={
        a2: P.coef.a2*Q.coef.a2, // x^4 (จะไม่ใช้ ตรวจเฉพาะดีกรี ≤ 2) แต่เราจะลดรูปเป็นดีกรี≤2 โดยจัดเงื่อนไข: ให้ P,Q อย่างน้อยด้านหนึ่งเป็นดีกรี 1 เพื่อไม่ให้เกิน 2
        a1: 0,
        a0: 0
      };
      // เพื่อคุมดีกรีผลลัพธ์ ≤ 2: บังคับอย่างน้อยหนึ่งตัวเป็นดีกรี 1
      if(P.degree===2 && Q.degree===2){
        // บังคับใหม่อย่างน้อยหนึ่งด้านเป็น 1
        const Q2 = randPolyOperandDx();
        Q.coef = Q2.coef; Q.html = Q2.html; Q.degree = 1;
        problemText = `${P.html} × ${Q.html}`;
      }
      // คูณจริง
      const A=P.coef, B=Q.coef;
      const out = {
        a2: A.a2*B.a0 + A.a1*B.a1 + A.a0*B.a2, // รวมพจน์กำลังสองหลังคูณ
        a1: A.a1*B.a0 + A.a0*B.a1,
        a0: A.a0*B.a0
      };
      answerCoef=out; problemAnswer=coefToHTML(out);
      showWorkspace('mul');
      mulMult.innerHTML = (B.a1? `${B.a1===1?'':' '+B.a1}x` : '') + (B.a0? (B.a0>=0? ' + '+B.a0 : ' '+B.a0) : (B.a1? '':'?'));
      mulMcand.innerHTML = (A.a1? `${A.a1===1?'':' '+A.a1}x` : '') + (A.a0? (A.a0>=0? ' + '+A.a0 : ' '+A.a0) : (A.a1? '':'?'));
    }else if(mode==='poly_div'){
      problemText = `${P.html} ÷ ${Q.html}`;
      // เพื่อไม่ซับซ้อน: ทำให้หารลงตัวโดยสร้าง dividend = (linear)*(Q) แล้วให้ตอบ linear
      // ถ้า Q เป็นดีกรี 2 ให้บังคับ Q เป็นดีกรี 1 เพื่อคุมผลลัพธ์ (ตามสเปคเดิมก็อยากให้ตัวหารดีกรี 1)
      if(Q.degree===2){
        const Q1 = randPolyOperandDx();
        Q.coef = Q1.coef; Q.html = Q1.html; Q.degree=1;
        problemText = `${P.html} ÷ ${Q.html}`;
      }
      // สร้าง L(x) = ux + v (แบบสุ่มในช่วงที่กำหนด)
      const u = randNZ(), v = randNZ();
      const A = Q.coef; // (sx + t) หรือ (rx^2+...แต่บังคับเป็น 1 ไปแล้ว)
      // dividend = Q * L
      const dividend = {
        a2: A.a1*u,             // (sx)*u -> x^2
        a1: A.a1*v + A.a0*u,    // sx*v + t*u
        a0: A.a0*v
      };
      // ปรับ P ให้เป็น dividend (เพื่อให้โจทย์ตรงตามรูป [p(x)] ÷ [q(x)])
      const Phtml = `[${coefToHTMLDisplay(dividend)}]`; // แสดงแบบพหุนามด้วยกติกาวงเล็บลบ
      problemText = `${Phtml} ÷ ${Q.html}`;
      answerCoef = {a2:0,a1:u,a0:v};
      problemAnswer = coefToHTML(answerCoef);
      showWorkspace('div');
      divDivisor.innerHTML = coefToHTMLDisplay(Q.coef,true); // แสดงเป็นรูปเชิงเส้น
      divQuot.value='';
    }
  }else if(mode==='solve_lin'){
    // ax + b = cx + d, สุ่มทุกตัวใน [-15,15]\{0} และให้คำตอบเป็นจำนวนเต็ม
    const a=randNZ(), c=randNZ(), x=rint(-15,15) || 1; // x อาจเป็น 0 ได้? คุณต้องการไม่เอา 0 ในก่อนหน้า แต่ระบุเฉพาะการสุ่มสัมประสิทธิ์ ผมให้ x ไม่เป็น 0 เพื่อหลีกเลี่ยง trivial
    const b=randNZ();
    const d=a*x + b - c*x;
    problemText = `${a===1?'':a}x${b>=0?'+':''}${b} = ${c===1?'':c}x${d>=0?'+':''}${d}`;
    answerCoef={a2:0,a1:1,a0:-x}; problemAnswer=`x = ${x}`;
    showWorkspace('solve');
  }
  render();
}

/* Helper: แสดงพหุนามด้วยกติกาวงเล็บของคุณ */
function coefToHTMLDisplay({a2,a1,a0}, preferLinear=false){
  const parts=[];
  // ถ้า preferLinear ให้ไม่สร้างพจน์กำลังสอง (ใช้กับตัวหาร)
  if(!preferLinear && a2){
    if(a2<0){
      const kk=Math.abs(a2); parts.push((kk===1?'-':'-'+kk)+'x<sup>2</sup>');
    }else{
      parts.push((a2===1?'':' '+a2)+'x<sup>2</sup>');
    }
  }
  if(a1){
    if(a1<0){
      if(!a2){ // top degree=1 และเป็นลบ -> ไม่ใส่วงเล็บ
        const kk=Math.abs(a1); parts.push((kk===1?'-':'-'+kk)+'x');
      }else{
        parts.push(' + ' + (a1===-1?'(-x)':'('+a1+'x)'));
      }
    }else{
      parts.push((parts.length?' + ':'') + (a1===1?'x':a1+'x'));
    }
  }
  if(a0){
    if(a0<0) parts.push(' + ('+a0+')');
    else parts.push((parts.length?' + ':'')+a0);
  }
  return parts.join('').replace(/\+ \(-/g,'+ (-');
}

/* ======= เริ่มทำงาน ======= */
document.getElementById('btn-new').focus();
newExample();
render();
