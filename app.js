// ====== DOM ======
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

// ป้องกันเริ่มลากเมื่อแตะ input
['pointerdown','touchstart','mousedown'].forEach(evt=>{
  if(divQuot) divQuot.addEventListener(evt, e=>e.stopPropagation(), {passive:false});
  if(answerInput) answerInput.addEventListener(evt, e=>e.stopPropagation(), {passive:false});
  if(normalizeInput) normalizeInput.addEventListener(evt, e=>e.stopPropagation(), {passive:false});
});

// ====== Tiles config ======
const TYPES = {
  x2:      {labelHTML:'x<sup>2</sup>',   w:120, h:120, color:'var(--blue)',   shape:'square', neg:'neg_x2'},
  neg_x2:  {labelHTML:'-x<sup>2</sup>',  w:120, h:120, color:'var(--red)',    shape:'square', neg:'x2'},
  x:       {labelHTML:'x',               w:30,  h:120, color:'var(--green)',  shape:'rect',   neg:'neg_x'},   // ให้ตั้งตรง
  neg_x:   {labelHTML:'-x',              w:30,  h:120, color:'var(--red)',    shape:'rect',   neg:'x'},       // ให้ตั้งตรง
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

// RNG [-9,9]\{0} หรือ [-15,15]\{0} แล้วแต่เมนู (จะเลือกในตัวโค้ด)
const randNZ = (lim=9)=>{ let v=0; while(v===0){ v=(Math.random()<.5?-1:1)*(Math.floor(Math.random()*lim)+1);} return v; };
const rint = (a,b)=> Math.floor(Math.random()*(b-a+1))+a;

// Workspace
function showWorkspace(which){
  wsSolve.style.display = (which==='solve') ? 'block':'none';
  wsMul.style.display   = (which==='mul')   ? 'block':'none';
  wsDiv.style.display   = (which==='div')   ? 'block':'none';
}

// pointer helpers (ใช้ pointer events อย่างเดียว)
function pxy(e){
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

    // start drag (pointer)
    el.addEventListener('pointerdown', (e)=>{
      e.stopPropagation();
      if(!selection.has(t.id)){
        if(!(e.shiftKey)) selection.clear();
        selection.add(t.id);
      }else if(e.shiftKey){
        selection.delete(t.id);
      }
      const p = pxy(e);
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
  solutionBox.innerHTML = showSol ? '<b>เฉลย:</b> '+problemAnswer : '';
}

// ====== Palette add ======
palette.querySelectorAll('.pal-item').forEach(el=>{
  const addTile = ()=>{
    const type = el.dataset.type;
    const tdef = TYPES[type];
    const id = uid();
    const start = findFreeSpot(tdef.w, tdef.h);
    tiles.push({id, type, x:start.x, y:start.y, w:tdef.w, h:tdef.h});
    // เลือกเฉพาะชิ้นที่เพิ่มใหม่ (ยกเลิกของเดิม)
    selection = new Set([id]);
    render();
  };
  el.addEventListener('pointerdown', (e)=>{ e.preventDefault(); addTile(); });
});

// ====== Board interactions (pointer events ทั้งหมด) ======
board.addEventListener('pointerdown', (e)=>{
  const p = pxy(e);
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

window.addEventListener('pointermove', (e)=>{
  if(!board) return;
  if(dragging){
    const p = pxy(e);
    tiles = tiles.map(t=>{
      const off = dragging.offsets.find(o=>o.id===t.id);
      if(!off) return t;
      return {...t, x:p.x - off.dx, y:p.y - off.dy};
    });
    render();
  }else if(selRect){
    const p = pxy(e); selRect.x1=p.x; selRect.y1=p.y; render();
  }
});

window.addEventListener('pointerup', ()=>{
  if(dragging) dragging=null;
  if(selRect){
    const {x0,y0,x1,y1} = selRect;
    const minx=Math.min(x0,x1),maxx=Math.max(x0,x1),miny=Math.min(y0,y1),maxy=Math.max(y0,y1);
    selection = new Set(tiles.filter(t=> t.x>=minx && t.y>=miny && (t.x+t.w)<=maxx && (t.y+t.h)<=maxy).map(t=>t.id));
    selRect=null; render();
  }
});

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
    // วางคลอนไม่ให้ซ้อน: สเต็ปเล็ก ๆ ต่อกัน
    const dx = 20*(i+1), dy = 15*(i+1);
    return {...t, id:uid(), x:t.x+dx, y:t.y+dy};
  });
  tiles = [...tiles, ...clones];
  // เลือกเฉพาะคลอนใหม่ (ยกเลิก select ตัวเดิม เพื่อแก้ปัญหาลากติด)
  selection = new Set(clones.map(c=>c.id));
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
  const src = ytframe.src; ytframe.src = src; // หยุดวิดีโอ
}

// ====== Mode & examples ======
document.getElementById('mode').onchange = (e)=>{ mode = e.target.value; newExample(); };
document.getElementById('btn-new').onclick = ()=> newExample();
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};

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

// ฟอร์แมตพหุนามแบบ “กฎโจทย์” (ไม่ครอบด้วย [])
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
  c(k){ return (k<0) ? `(${k})` : `${k}`; }
};
function formatPolyHTML(coef){
  const {a2,a1,a0} = coef;
  const deg = a2!==0 ? 2 : 1;
  if(deg===2){
    const t2 = fmtTerm.x2(a2,true);
    const t1 = a1!==0 ? ( (a1>=0?' + ':' + ') + fmtTerm.x1(a1,2) ) : '';
    const t0 = a0!==0 ? ( (a0>=0?' + ':' + ') + fmtTerm.c(a0) ) : '';
    return (t2 + t1 + t0).replace(/\+ \(-/g,'+ (-');
  }else{
    const t1 = fmtTerm.x1(a1,1);
    const t0 = a0!==0 ? ( (a0>=0?' + ':' + ') + fmtTerm.c(a0) ) : '';
    return (t1 + t0).replace(/\+ \(-/g,'+ (-');
  }
}

// บวก/ลบ/คูณ coefficients
const addCoef = (A,B)=> ({a2:A.a2+B.a2, a1:A.a1+B.a1, a0:A.a0+B.a0});
function mulCoef(A,B){
  const res = {a2:0,a1:0,a0:0};
  [[2,A.a2],[1,A.a1],[0,A.a0]].forEach(([pa,ka])=>{
    [[2,B.a2],[1,B.a1],[0,B.a0]].forEach(([pb,kb])=>{
      const pow=pa+pb, k=ka*kb;
      if(pow===2) res.a2+=k; else if(pow===1) res.a1+=k; else res.a0+=k;
    });
  });
  // เพดานแสดงผล ±36 หลังคูณ (ถ้าต้อง clamp)
  res.a2 = Math.max(-36, Math.min(36, res.a2));
  res.a1 = Math.max(-36, Math.min(36, res.a1));
  res.a0 = Math.max(-36, Math.min(36, res.a0));
  return res;
}

// สร้างพหุนามแบบสุ่ม (deg = 1 หรือ 2) ช่วงสัมประสิทธิ์ [-9,9]\{0}
function buildPoly(deg=1){
  if(deg===2){
    return { coef:{a2:randNZ(9), a1:randNZ(9), a0:randNZ(9)} };
  }
  return { coef:{a2:0, a1:randNZ(9), a0:randNZ(9)} };
}

// ====== Example generator ======
function newExample(){
  showSol=false; document.getElementById('btn-solution').textContent='เฉลย';
  answerInput.value=''; checkResult.textContent='';
  normalizeInput.value='';
  tiles=[]; selection.clear();
  showWorkspace(null);

  if(mode==='int_add'){
    const a=randNZ(15), b=randNZ(15);
    problemText = `${a} + ${b<0?`(${b})`:b}`;
    const sum=a+b; answerCoef={a2:0,a1:0,a0:sum}; problemAnswer=String(sum);
  }
  else if(mode==='int_sub'){
    const a=randNZ(15), b=randNZ(15);
    problemText = `${a} - ${b<0?`(${b})`:b}`;
    const res=a-b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
  }
  else if(mode==='int_mul'){
    const a=randNZ(15), b=randNZ(15);
    problemText = `${a} × ${b<0?`(${b})`:b}`;
    const res=a*b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
    showWorkspace('mul'); mulMult.innerHTML = String(b); mulMcand.innerHTML = String(a);
  }
  else if(mode==='int_div'){
    // สุ่มให้ “หารลงตัว” และผลลัพธ์/ตัวตั้ง/ตัวหารอยู่ในช่วง ±15, ไม่เอา 0
    let q, d, n; 
    do { q=randNZ(15); d=randNZ(15); n=q*d; } while(Math.abs(n)>15 || Math.abs(d)>15 || Math.abs(q)>15);
    problemText = `${n} ÷ ${d<0?`(${d})`:d}`;
    answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); divDivisor.textContent=d; divQuot.value='';
  }
  else if(mode==='poly_add' || mode==='poly_sub' || mode==='poly_mul'){
    // ตามกฎใหม่: สุ่มดีกรี 1 หรือ 2 (แต่คูณจำกัดดีกรี <=1) และค่าสัมประสิทธิ์ใน ±9
    const degP = (mode==='poly_mul') ? 1 : (Math.random()<.5?1:2);
    const degQ = (mode==='poly_mul') ? 1 : (Math.random()<.5?1:2);
    const P = buildPoly(degP);
    const Q = buildPoly(degQ);

    if(mode==='poly_add'){
      problemText = `[${formatPolyHTML(P.coef)}] + [${formatPolyHTML(Q.coef)}]`;
      answerCoef = addCoef(P.coef, Q.coef);
      problemAnswer = formatPolyHTML(answerCoef);
    }else if(mode==='poly_sub'){
      problemText = `[${formatPolyHTML(P.coef)}] - [${formatPolyHTML(Q.coef)}]`;
      answerCoef = addCoef(P.coef, {a2:-Q.coef.a2, a1:-Q.coef.a1, a0:-Q.coef.a0});
      problemAnswer = formatPolyHTML(answerCoef);
    }else{
      problemText = `[${formatPolyHTML(P.coef)}] × [${formatPolyHTML(Q.coef)}]`;
      answerCoef = mulCoef(P.coef, Q.coef);
      problemAnswer = formatPolyHTML(answerCoef);
      showWorkspace('mul');
      mulMult.innerHTML  = formatPolyHTML(Q.coef);
      mulMcand.innerHTML = formatPolyHTML(P.coef);
    }
  }
  else if(mode==='poly_div'){
    // แบ่งเป็นสองกรณี: ตัวตั้ง deg 1 หรือ 2; ตัวหาร deg 1 เสมอ (sx + t, s อนุญาตทุกจำนวนเต็ม ≠0)
    const dividendDeg = (Math.random()<.5 ? 1 : 2);

    let s,t,a,b; // divisor = sx + t, quotient = ax + b
    let ok = false;
    while(!ok){
      s = randNZ(9); t = randNZ(9);   // ตัวหารช่วง [-9,9]
      a = (dividendDeg===2) ? randNZ(9) : 0;  // ถ้าตัวตั้งดีกรี 2 -> ผลหารดีกรี 1
      b = randNZ(9);

      // สร้างตัวตั้งจาก (sx+t)*(ax+b)  และจำกัดค่าสัมประสิทธิ์ตัวตั้งให้อยู่ในช่วงที่ต้องการแสดง
      // (ตามรูปที่แนบ ต้องการให้เห็นค่าชัดเจน ไม่ล้น)
      const A2 = (dividendDeg===2) ? (s*a) : 0;
      const A1 = (dividendDeg===2) ? (s*b + t*a) : (s*b);
      const A0 = t*b;

      // เงื่อนไขตัวตั้งในช่วง [-20,20] ตามคำสั่งรอบล่าสุด
      if(Math.abs(A1)<=20 && Math.abs(A0)<=20 && Math.abs(A2)<=20){
        // แสดงผล
        const dividend = formatPolyHTML({a2:A2,a1:A1,a0:A0});
        const divisor  = formatPolyHTML({a2:0,a1:s,a0:t});
        problemText = `[${dividend}] ÷ [${divisor}]`;
        // ตรวจผลหาร
        answerCoef = {a2:0,a1:a,a0:b};
        problemAnswer = formatPolyHTML(answerCoef);

        // เติมตาราง
        showWorkspace('div');
        divDivisor.innerHTML = formatPolyHTML({a2:0,a1:s,a0:t});
        divQuot.value='';
        ok = true;
      }
    }
  }
  else if(mode==='solve_lin'){
    // a x + b = c x + d โดยดึง d ให้ไม่เกิน ±15
    let a,b,c,x,d,ok=false;
    while(!ok){
      a=randNZ(15); b=randNZ(15); c=randNZ(15); x = rint(-15,15); if(x===0) continue;
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
const equalsCoef = (a,b)=> a.a2===b.a2 && a.a1===b.a1 && a.a0===b.a0;

// ====== Init ======
document.getElementById('btn-new').focus();
newExample();
render();
