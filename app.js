/***************** DOM refs *****************/
const board = document.getElementById('board');
const palette = document.getElementById('palette');
const problemBox = document.getElementById('problem');
const solutionBox = document.getElementById('solution');
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

/***************** Tile types *****************/
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
let dragging = null; // {ids,offsets[],pid}
let selRect = null;
let zoom = 1;
let showSol = false;
let mode = document.getElementById('mode').value;

let problemText = '';
let problemAnswer = '';
let answerCoef = {a2:0,a1:0,a0:0}; // ผลลัพธ์เชิงสัมประสิทธิ์

/***************** Utils *****************/
const uid = ()=> Math.random().toString(36).slice(2);
const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));

function pt(e){
  const rect = board.getBoundingClientRect();
  return { x: (e.clientX - rect.left)/zoom, y: (e.clientY - rect.top)/zoom };
}
function overlaps(x,y,w,h,t){
  return !(x+w < t.x || x > t.x+t.w || y+h < t.y || y > t.y+t.h);
}
function findFreeSpot(w,h){
  const margin = 20;
  const startX = 280, startY = 100;
  let x=startX, y=startY;
  const step = 20;
  const limitX = 2000, limitY=1400;
  let tries=0;
  while(tries<2000){
    const collide = tiles.some(t=>overlaps(x,y,w,h,t));
    if(!collide) return {x,y};
    x += step; if(x+w+margin>limitX){ x=startX; y += step; if(y+h+margin>limitY){ y=startY; } }
    tries++;
  }
  return {x:startX,y:startY};
}

/***************** Workspaces *****************/
function showWorkspace(which){
  wsSolve.style.display = (which==='solve') ? 'block':'none';
  wsMul.style.display   = (which==='mul')   ? 'block':'none';
  wsDiv.style.display   = (which==='div')   ? 'block':'none';
}

/***************** Render *****************/
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

    el.onpointerdown = (e)=>{
      e.preventDefault();
      e.stopPropagation();
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
      dragging = {ids, offsets, pid:e.pointerId};
      board.setPointerCapture?.(e.pointerId);
      render();
    };
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

/***************** Palette -> add tile *****************/
palette.querySelectorAll('.pal-item').forEach(el=>{
  el.addEventListener('pointerdown', ()=>{
    const type = el.dataset.type;
    const tdef = TYPES[type];
    const id = uid();
    const start = findFreeSpot(tdef.w, tdef.h);
    tiles.push({id, type, x:start.x, y:start.y, w:tdef.w, h:tdef.h});
    selection = new Set([id]);
    render();
  });
});

/***************** Board interactions (Pointer) *****************/
board.addEventListener('pointerdown', (e)=>{
  // ถ้าแตะบน input ใน workspace ให้โฟกัสและพิมพ์ได้
  if (e.target.matches('input,textarea,select')) return;

  if(e.button!==0 && e.pointerType==='mouse') return;
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
    dragging = {ids, offsets, pid:e.pointerId};
    board.setPointerCapture?.(e.pointerId);
  }else{
    selection.clear();
    selRect = {x0:p.x, y0:p.y, x1:p.x, y1:p.y};
  }
  render();
}, {passive:false});

window.addEventListener('pointermove', (e)=>{
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
}, {passive:false});

window.addEventListener('pointerup', ()=>{
  if(dragging) dragging=null;
  if(selRect){
    const {x0,y0,x1,y1} = selRect;
    const minx=Math.min(x0,x1),maxx=Math.max(x0,x1),miny=Math.min(y0,y1),maxy=Math.max(y0,y1);
    selection = new Set(tiles.filter(t=> t.x>=minx && t.y>=miny && (t.x+t.w)<=maxx && (t.y+t.h)<=maxy).map(t=>t.id));
    selRect=null; render();
  }
});

/***************** Toolbar actions *****************/
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
  tiles = tiles.map(t=>{
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

document.getElementById('btn-help').onclick   = ()=>{
  help.style.display='flex';
};
document.getElementById('help-close').onclick = closeHelp;
document.getElementById('help-x').onclick     = closeHelp;
function closeHelp(){
  // หยุดวิดีโอทันที
  const iframe = document.getElementById('yt');
  const src = iframe.getAttribute('src');
  iframe.setAttribute('src', src); // reload to stop
  help.style.display='none';
}

document.getElementById('mode').onchange = (e)=>{ mode = e.target.value; newExample(); };
document.getElementById('btn-new').onclick = ()=> newExample();
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};

/***************** ตรวจคำตอบ *****************/
checkBtn.onclick = ()=>{
  checkResult.textContent=''; checkResult.style.color='';
  const givenRaw = answerInput.value || (divQuot && divQuot.value) || '';
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

/***************** Parser พหุนาม (ดีกรี ≤ 2) *****************/
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

/***************** Random helpers & printers *****************/
function rint(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function nz15(){ let v=0; while(v===0){ v = (Math.random()<.5?-1:1) * rint(1,15); } return v; }

function termX2(a){
  if(a===1)  return 'x<sup>2</sup>';
  if(a===-1) return '-x<sup>2</sup>';
  return `${a}x<sup>2</sup>`;
}
function termX(b, wrapNeg){
  if(b===1)  return 'x';
  if(b===-1) return wrapNeg ? '(-x)' : '-x';
  return (b<0 && wrapNeg) ? `(${b}x)` : `${b}x`;
}
function termC(c, wrapNeg){
  return (c<0 && wrapNeg) ? `(${c})` : `${c}`;
}
function makePoly(deg){
  if(deg===2){
    const a=nz15(), b=nz15(), c=nz15();
    const html = [
      termX2(a),
      ' + ', termX(b,true),
      ' + ', termC(c,true)
    ].join('').replace(/\+ \(-/g,'+ (-');
    return { coef:{a2:a,a1:b,a0:c}, html:`[${html}]` };
  }else{
    const b=nz15(), c=nz15();
    const html = [
      termX(b,false),
      ' + ', termC(c,true)
    ].join('').replace(/\+ \(-/g,'+ (-');
    return { coef:{a2:0,a1:b,a0:c}, html:`[${html}]` };
  }
}
function randPQ(){
  const p = makePoly(Math.random()<.5?1:2);
  const q = makePoly(Math.random()<.5?1:2);
  return {p,q};
}

/***************** Generate problems *****************/
function newExample(){
  showSol=false; document.getElementById('btn-solution').textContent='เฉลย';
  answerInput.value=''; if(divQuot) divQuot.value='';
  checkResult.textContent='';
  tiles=[]; selection.clear();
  showWorkspace(null);

  if(mode==='int_add'){
    const a=nz15(), b=nz15(); const bStr = b<0?`(${b})`:b;
    problemText = `${a} + ${bStr}`; const sum=a+b;
    answerCoef={a2:0,a1:0,a0:sum}; problemAnswer=String(sum);

  }else if(mode==='int_sub'){
    const a=nz15(), b=nz15(); const bStr = b<0?`(${b})`:b;
    problemText = `${a} - ${bStr}`; const res=a-b;
    answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);

  }else if(mode==='int_mul'){
    const a=nz15(), b=nz15(); const bStr = b<0?`(${b})`:b;
    problemText = `${a} × ${bStr}`; const res=a*b;
    answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
    showWorkspace('mul'); mulMult.textContent=b; mulMcand.textContent=a;

  }else if(mode==='int_div'){
    const divisor=nz15(), q=nz15(), dividend=divisor*q;
    const dStr = divisor<0?`(${divisor})`:divisor;
    problemText = `${dividend} ÷ ${dStr}`; answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); divDivisor.textContent=divisor; divQuot.value='';

  }else if(mode==='poly_add'){
    const {p,q} = randPQ();
    const sum = {a2:p.coef.a2+q.coef.a2, a1:p.coef.a1+q.coef.a1, a0:p.coef.a0+q.coef.a0};
    problemText = `${p.html} + ${q.html}`;
    answerCoef=sum; problemAnswer=coefToHTML(sum);

  }else if(mode==='poly_sub'){
    const {p,q} = randPQ();
    const res = {a2:p.coef.a2-q.coef.a2, a1:p.coef.a1-q.coef.a1, a0:p.coef.a0-q.coef.a0};
    problemText = `${p.html} - ${q.html}`;
    answerCoef=res; problemAnswer=coefToHTML(res);

  }else if(mode==='poly_mul'){
    const {p,q} = randPQ();
    problemText = `${p.html} × ${q.html}`;
    // ผลตอบกลับในรูป a2,a1,a0 เพื่อใช้กับตัวตรวจ
    const A=p.coef, B=q.coef;
    const prod = {
      a2: (A.a2*B.a0) + (A.a1*B.a1) + (A.a0*B.a2),
      a1: (A.a1*B.a0) + (A.a0*B.a1),
      a0: (A.a0*B.a0)
    };
    answerCoef=prod; problemAnswer=coefToHTML(prod);
    showWorkspace('mul');
    mulMult.innerHTML  = `${(B.a2?termX2(B.a2)+' + ':'')}${B.a1?termX(B.a1,false):''}${(B.a1&&B.a0? ' + ':'')}${termC(B.a0,true)}`.replace(/\+ \+ /g,'+ ');
    mulMcand.innerHTML = `${(A.a2?termX2(A.a2)+' + ':'')}${A.a1?termX(A.a1,false):''}${(A.a1&&A.a0? ' + ':'')}${termC(A.a0,true)}`.replace(/\+ \+ /g,'+ ');

  }else if(mode==='poly_div'){
    // q(x) เลือกให้ดีกรี 1 เพื่อให้ลงตารางหาร
    const q1 = makePoly(1); // sx + t
    // สุ่มคำตอบ (ax + b) แล้วคูณกลับให้ได้ dividend
    const a = nz15(), b = nz15();
    const s = q1.coef.a1, t = q1.coef.a0;
    const dividend = { a2: s*a, a1: s*b + t*a, a0: t*b };
    problemText = `[${coefToHTML(dividend)}] ÷ ${q1.html}`;
    answerCoef = {a2:0, a1:a, a0:b}; problemAnswer = coefToHTML(answerCoef);
    showWorkspace('div');
    divDivisor.innerHTML = `${termX(s,false)}${t>=0?'+':''}${termC(t,true)}`.replace(/\+ \(-/g,'+ (-');
    divQuot.value='';

  }else if(mode==='solve_lin'){
    const a=nz15(), c=nz15(), x=nz15(), b=nz15();
    const d=a*x + b - c*x;
    problemText = `${a===1?'':a}x${b>=0?'+':''}${b} = ${c===1?'':c}x${d>=0?'+':''}${d}`;
    answerCoef={a2:0,a1:1,a0:-x}; problemAnswer=`x = ${x}`;
    showWorkspace('solve');
  }

  render();
}

/***************** Start *****************/
document.getElementById('btn-new').focus();
newExample();
render();
