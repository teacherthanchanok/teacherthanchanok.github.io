/* --------- ตัวช่วยและ state หลัก (ให้ตรงกับของเดิม) --------- */
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

const TYPES = {
  x2:      {labelHTML:'x<sup>2</sup>',   w:120, h:120, color:'var(--blue)',   shape:'square', neg:'neg_x2'},
  neg_x2:  {labelHTML:'-x<sup>2</sup>',  w:120, h:120, color:'var(--red)',    shape:'square', neg:'x2'},
  x:       {labelHTML:'x',               w:120, h:30,  color:'var(--green)',  shape:'rect',   neg:'neg_x'},
  neg_x:   {labelHTML:'-x',              w:120, h:30,  color:'var(--red)',    shape:'rect',   neg:'x'},
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
let answerCoef = {a2:0,a1:0,a0:0}; // สำหรับตรวจพหุนาม/จำนวนเต็ม

const uid = ()=> Math.random().toString(36).slice(2);
const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));

/* --------- แสดง/ซ่อน workspace --------- */
function showWorkspace(which){
  wsSolve.style.display = (which==='solve') ? 'block':'none';
  wsMul.style.display   = (which==='mul')   ? 'block':'none';
  wsDiv.style.display   = (which==='div')   ? 'block':'none';
}

/* --------- Render หลัก (ให้คล้ายของเดิม) --------- */
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
    el.onmousedown = (e)=>{
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
      dragging = {ids, offsets};
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

  // ทำให้ input ในกระดานพิมพ์ได้ (กัน event bubbling)
  enableInputsTypingScope();
}

/* --------- Helpers --------- */
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
function enableInputsTypingScope(){
  const stopList = ['mousedown','touchstart','pointerdown'];
  document.querySelectorAll('#board input, #board textarea').forEach(inp=>{
    stopList.forEach(ev=> inp.addEventListener(ev, e=> e.stopPropagation(), {passive:false}));
  });
}

/* --------- โต้ตอบกระดาน --------- */
palette.querySelectorAll('.pal-item').forEach(el=>{
  el.addEventListener('mousedown', ()=>{
    const type = el.dataset.type;
    const tdef = TYPES[type];
    const id = uid();
    const start = findFreeSpot(tdef.w, tdef.h);
    tiles.push({id, type, x:start.x, y:start.y, w:tdef.w, h:tdef.h});
    selection = new Set([id]);
    render();
  });
});
board.addEventListener('mousedown', e=>{
  if(e.button!==0) return;
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
window.addEventListener('mousemove', e=>{
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
});
window.addEventListener('mouseup', ()=>{
  if(dragging) dragging=null;
  if(selRect){
    const {x0,y0,x1,y1} = selRect;
    const minx=Math.min(x0,x1),maxx=Math.max(x0,x1),miny=Math.min(y0,y1),maxy=Math.max(y0,y1);
    selection = new Set(tiles.filter(t=> t.x>=minx && t.y>=miny && (t.x+t.w)<=maxx && (t.y+t.h)<=maxy).map(t=>t.id));
    selRect=null; render();
  }
});

/* --------- ปุ่มเครื่องมือ (ของเดิม) --------- */
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

document.getElementById('btn-help').onclick   = ()=> help.style.display='flex';
document.getElementById('help-close').onclick = ()=> help.style.display='none';
document.getElementById('help-x').onclick     = ()=> help.style.display='none';

document.getElementById('mode').onchange = (e)=>{ mode = e.target.value; newExample(); };
document.getElementById('btn-new').onclick = ()=> newExample();
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};

/* --------- ตรวจคำตอบ (ของเดิม) --------- */
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

/* --------- Parser พหุนามเดิม (รองรับ () ในคำตอบผู้ใช้) --------- */
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

/* --------- สุ่มตัวเลข --------- */
function rint(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function randNZ15(){ let v=0; while(v===0){ v = rint(-15,15); } return v; }

/* --------- สร้าง p(x), q(x) ตามกติกา และใช้ [ ... ] ครอบ --------- */
function buildPolyRand() {
  const deg = Math.random() < 0.5 ? 2 : 1;
  if (deg === 2) {
    const a = randNZ15(), b = randNZ15(), c = randNZ15();
    const aTerm = (a===1) ? 'x<sup>2</sup>' : (a===-1 ? '-x<sup>2</sup>' : `${a}x<sup>2</sup>`); // a<0 ไม่ครอบ
    const bTerm = (b===1) ? 'x' : (b===-1 ? '(-x)' : (b<0 ? `(${b}x)` : `${b}x`)); // b<0 ครอบ
    const cTerm = (c<0) ? `(${c})` : `${c}`; // c<0 ครอบ
    const html = `${aTerm} + ${bTerm} + ${cTerm}`.replace(/\+ \(-/g,'+ (-');
    return { deg, coef:{a2:a, a1:b, a0:c}, html };
  } else {
    const b = randNZ15(), c = randNZ15();
    const bTerm = (b===1) ? 'x' : (b===-1 ? '-x' : `${b}x`); // ดีกรี1: b<0 ไม่ครอบ
    const cTerm = (c<0) ? `(${c})` : `${c}`; // c<0 ครอบ
    const html = `${bTerm} + ${cTerm}`.replace(/\+ \(-/g,'+ (-');
    return { deg, coef:{a2:0, a1:b, a0:c}, html };
  }
}
function addCoef(P,Q){ return {a2:P.a2+Q.a2, a1:P.a1+Q.a1, a0:P.a0+Q.a0}; }
function subCoef(P,Q){ return {a2:P.a2-Q.a2, a1:P.a1-Q.a1, a0:P.a0-Q.a0}; }
function mulLinearLinear(b,c,s,t){ return { a2: b*s, a1: b*t + c*s, a0: c*t }; }

/* --------- newExample: รวมเมนูทั้งหมด (เหมือนเดิม + ปรับพหุนาม & ช่องกรอก) --------- */
function newExample(){
  showSol=false; document.getElementById('btn-solution').textContent='เฉลย';
  answerInput.value=''; checkResult.textContent='';
  tiles=[]; selection.clear();
  showWorkspace(null);

  if (mode==='int_add'){
    const a=randNZ15(), b=randNZ15(); const bStr = b<0?`(${b})`:b;
    problemText = `${a} + ${bStr}`; const sum=a+b;
    answerCoef={a2:0,a1:0,a0:sum}; problemAnswer=String(sum);
  } else if (mode==='int_sub'){
    const a=randNZ15(), b=randNZ15(); const bStr = b<0?`(${b})`:b;
    problemText = `${a} - ${bStr}`; const res=a-b;
    answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
  } else if (mode==='int_mul'){
    const a=randNZ15(), b=randNZ15(); const bStr = b<0?`(${b})`:b;
    problemText = `${a} × ${bStr}`; const res=a*b;
    answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
    showWorkspace('mul'); mulMult.textContent=b; mulMcand.textContent=a;
  } else if (mode==='int_div'){
    const divisor=randNZ15(), q=randNZ15(), dividend=divisor*q; // ทั้งหมดอยู่ในช่วงตามกฎ
    const dStr = divisor<0?`(${divisor})`:divisor;
    problemText = `${dividend} ÷ ${dStr}`; answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); if(divDivisor) divDivisor.textContent=divisor; if(divQuot) divQuot.value='';
  } else if (mode==='poly_add' || mode==='poly_sub'){
    const P = buildPolyRand();
    const Q = buildPolyRand();
    const op = (mode==='poly_add') ? ' + ' : ' - ';
    problemText = `[${P.html}]${op}[${Q.html}]`;
    answerCoef = (mode==='poly_add') ? addCoef(P.coef,Q.coef) : subCoef(P.coef,Q.coef);
    problemAnswer = coefToHTML(answerCoef);
  } else if (mode==='poly_mul'){
    // จำกัดให้เชิงเส้นทั้งคู่
    let P = buildPolyRand(); while(P.deg!==1) P = buildPolyRand();
    let Q = buildPolyRand(); while(Q.deg!==1) Q = buildPolyRand();
    problemText = `[${P.html}] × [${Q.html}]`;
    answerCoef = mulLinearLinear(P.coef.a1, P.coef.a0, Q.coef.a1, Q.coef.a0);
    problemAnswer = coefToHTML(answerCoef);
    showWorkspace('mul');
    if (mulMult)  mulMult.innerHTML  = `${(Q.coef.a1===1?'':Q.coef.a1===-1?'-':'')}${(Math.abs(Q.coef.a1)===1?'x':Q.coef.a1+'x')}${Q.coef.a0>=0?'+':''}${Q.coef.a0}`;
    if (mulMcand) mulMcand.innerHTML = `${(P.coef.a1===1?'':P.coef.a1===-1?'-':'')}${(Math.abs(P.coef.a1)===1?'x':P.coef.a1+'x')}${P.coef.a0>=0?'+':''}${P.coef.a0}`;
  } else if (mode==='poly_div'){
    // ให้ q(x) เป็นเชิงเส้น และ p(x) = (เชิงเส้น)*q(x)
    let Q = buildPolyRand(); while(Q.deg!==1) Q = buildPolyRand();
    let P0 = buildPolyRand(); while(P0.deg!==1) P0 = buildPolyRand();
    const dividend = mulLinearLinear(P0.coef.a1, P0.coef.a0, Q.coef.a1, Q.coef.a0);
    // render dividend HTML ตามกฎ (deg 2 หรือ 1)
    const Ddeg = dividend.a2!==0 ? 2 : 1;
    let Dhtml;
    if (Ddeg===2){
      const a = dividend.a2, b = dividend.a1, c = dividend.a0;
      const aTerm = (a===1)?'x<sup>2</sup>':(a===-1?'-x<sup>2</sup>':`${a}x<sup>2</sup>`);
      const bTerm = (b===1)?'x':(b===-1?'(-x)':(b<0?`(${b}x)`:`${b}x`));
      const cTerm = (c<0)?`(${c})`:`${c}`;
      Dhtml = `${aTerm} + ${bTerm} + ${cTerm}`.replace(/\+ \(-/g,'+ (-');
    }else{
      const b = dividend.a1, c = dividend.a0;
      const bTerm = (b===1)?'x':(b===-1?'-x':`${b}x`);
      const cTerm = (c<0)?`(${c})`:`${c}`;
      Dhtml = `${bTerm} + ${cTerm}`.replace(/\+ \(-/g,'+ (-');
    }
    problemText = `[${Dhtml}] ÷ [${Q.html}]`;
    answerCoef = P0.coef;
    problemAnswer = coefToHTML(answerCoef);
    showWorkspace('div');
    if (divDivisor) divDivisor.innerHTML = Q.html;
    if (divQuot) divQuot.value = '';
  } else if (mode==='solve_lin'){
    // แบบเดิมของคุณ (ไม่เกี่ยวกับคำสั่งแก้เฉพาะ)
    const a=randNZ15(), c=randNZ15(), x=rint(-8,8)||1, b=randNZ15();
    const d=a*x + b - c*x;
    problemText = `${a===1?'':a}x${b>=0?'+':''}${b} = ${c===1?'':c}x${d>=0?'+':''}${d}`;
    answerCoef={a2:0,a1:1,a0:-x}; problemAnswer=`x = ${x}`;
    showWorkspace('solve');
  }

  render();
}

/* --------- เริ่มทำงาน --------- */
document.getElementById('btn-new').focus();
newExample();
render();
