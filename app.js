// ====== DOM ======
const board = document.getElementById('board');
const palette = document.getElementById('palette');
const solutionBox = document.getElementById('solution');
const problemBox = document.getElementById('problem');
const answerInput = document.getElementById('answerInput');
const checkBtn = document.getElementById('btn-check');
const checkResult = document.getElementById('checkResult');
const divDivisor = document.getElementById('div-divisor');
const divQuot    = document.getElementById('div-quot');

const wsSolve = document.getElementById('ws-solve');
const wsMul   = document.getElementById('ws-mul');
const wsDiv   = document.getElementById('ws-div');
const mulMult = document.getElementById('mul-mult');
const mulMcand= document.getElementById('mul-mcand');

// ทำให้ input ไม่ไปรบกวนการ drag
[divQuot, answerInput].forEach(el=>{
  if(!el) return;
  ['pointerdown'].forEach(evt=> el.addEventListener(evt, e=>e.stopPropagation()));
});

// ====== Tiles config ======
const TYPES = {
  x2:      {labelHTML:'x<sup>2</sup>',   w:120, h:120, color:'var(--blue)',   shape:'square', neg:'neg_x2'},
  neg_x2:  {labelHTML:'-x<sup>2</sup>',  w:120, h:120, color:'var(--red)',    shape:'square', neg:'x2'},
  x:       {labelHTML:'x',               w:30,  h:120, color:'var(--green)',  shape:'rect',   neg:'neg_x'}, // แนวตั้ง
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

// RNG helpers
function rint(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function randNZIn(min,max){ let v=0; while(v===0){ v=rint(min,max);} return v; }
const randNZ9  = ()=> randNZIn(-9,9);
const randNZ15 = ()=> randNZIn(-15,15);
const randNZ20 = ()=> randNZIn(-20,20);

// Workspace visibility
function showWorkspace(which){
  wsSolve.style.display = (which==='solve') ? 'block':'none';
  wsMul.style.display   = (which==='mul')   ? 'block':'none';
  wsDiv.style.display   = (which==='div')   ? 'block':'none';
}

// pointer helpers
function pt(e){
  const rect = board.getBoundingClientRect();
  return { x:(e.clientX-rect.left)/zoom, y:(e.clientY-rect.top)/zoom };
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
    const showLabel = (t.w >= 40 || t.h >= 40);
    el.innerHTML = showLabel ? '<span>'+TYPES[t.type].labelHTML+'</span>' : '';

    // Pointer events
    el.addEventListener('pointerdown', e=>{
      e.stopPropagation(); e.preventDefault();
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
      (e.target).setPointerCapture(e.pointerId);
      render();
    });
    el.addEventListener('pointermove', e=>{
      if(!dragging) return;
      const p = pt(e);
      tiles = tiles.map(ti=>{
        const off = dragging.offsets.find(o=>o.id===ti.id);
        if(!off) return ti;
        return {...ti, x:p.x - off.dx, y:p.y - off.dy};
      });
      render();
    });
    el.addEventListener('pointerup', ()=>{ dragging=null; });

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
    const def = TYPES[type];
    const id = uid();
    const start = findFreeSpot(def.w, def.h);
    tiles.push({id, type, x:start.x, y:start.y, w:def.w, h:def.h});
    selection = new Set([id]);
    render();
  };
  el.addEventListener('pointerdown', e=>{ e.preventDefault(); addTile(); });
});

// ====== Board interactions ======
board.addEventListener('pointerdown', e=>{
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
  // จัดเรียงใหม่แบบ grid ไม่ซ้อน
  const clones = [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(selectedTiles.length)));
  selectedTiles.forEach((t, i)=>{
    const base = findFreeSpot(t.w, t.h);
    const gx = base.x + (i%cols)*(t.w+12);
    const gy = base.y + Math.floor(i/cols)*(t.h+12);
    clones.push({...t, id:uid(), x:gx, y:gy});
  });
  tiles = [...tiles, ...clones];
  // เลือกเฉพาะของใหม่ ยกเลิกต้นฉบับ
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
  const src = ytframe.src; ytframe.src = src; // stop video
}

// ====== Mode & examples ======
document.getElementById('mode').onchange = (e)=>{ mode = e.target.value; newExample(); };
document.getElementById('btn-new').onclick = ()=> newExample();
document.getElementById('btn-solution').onclick = (e)=>{
  showSol = !showSol;
  e.target.textContent = showSol ? 'ซ่อนเฉลย' : 'เฉลย';
  render();
};

// ====== Formatting & parsing ======
// สร้างข้อความพหุนาม (ภายใน []), ใส่วงเล็บพจน์ลบที่ไม่ใช่พจน์นำ
function termX2(a, leadDeg2){
  if(a===1) return 'x<sup>2</sup>';
  if(a===-1) return leadDeg2 ? '-x<sup>2</sup>' : '(-x<sup>2</sup>)';
  return (a<0 && !leadDeg2) ? `(${a}x<sup>2</sup>)` : `${a}x<sup>2</sup>`;
}
function termX1(b, deg){ // deg = 1 หรือ 2
  if(b===1) return 'x';
  if(b===-1) return (deg===1?'-x':'(-x)');
  return (b<0 && deg===2) ? `(${b}x)` : `${b}x`;
}
function termC(c){ return (c<0)?`(${c})`:`${c}`; }

function polyToHTML({a2=0,a1=0,a0=0}){
  const parts=[];
  if(a2) parts.push(`${a2===1?'':a2===-1?'-':a2}x<sup>2</sup>`);
  if(a1) parts.push(`${a1===1?'':a1===-1?'-':a1}x`);
  if(a0) parts.push(String(a0));
  if(!parts.length) return '0';
  return parts.join(' + ').replace(/\+ -/g,'+ (-');
}

function buildPolyByDegree(deg, rng){ // rng(): random non-zero
  if(deg===2){
    const a=rng(), b=rng(), c=rng();
    const s = `${termX2(a,true)} + ${termX1(b,2)} + ${termC(c)}`.replace(/\+ -/g,'+ (-');
    return {coef:{a2:a,a1:b,a0:c}, html:`[${s}]`};
  }else{
    const b=rng(), c=rng();
    const s = `${termX1(b,1)} + ${termC(c)}`.replace(/\+ -/g,'+ (-');
    return {coef:{a2:0,a1:b,a0:c}, html:`[${s}]`};
  }
}
function addCoef(A,B){ return {a2:A.a2+B.a2, a1:A.a1+B.a1, a0:A.a0+B.a0}; }
function subCoef(A,B){ return {a2:A.a2-B.a2, a1:A.a1-B.a1, a0:A.a0-B.a0}; }
function mulCoef(A,B){
  const res = {a2:0,a1:0,a0:0};
  [[2,A.a2],[1,A.a1],[0,A.a0]].forEach(([pa,ka])=>{
    if(!ka) return;
    [[2,B.a2],[1,B.a1],[0,B.a0]].forEach(([pb,kb])=>{
      if(!kb) return;
      const pow=pa+pb, k=ka*kb;
      if(pow===2) res.a2+=k; else if(pow===1) res.a1+=k; else res.a0+=k;
    });
  });
  return res;
}

// ฟอร์แมตเฉลยแบบเดียวกับโจทย์ (ภายใน [])
function wrapDisplayFromCoef(coef, degGuess){
  let html;
  if((coef.a2||0)!==0) {
    html = `${termX2(coef.a2,true)} ${coef.a1?'+ '+termX1(coef.a1,2):''} ${coef.a0?'+ '+termC(coef.a0):''}`;
  }else{
    html = `${termX1(coef.a1||0,1)} ${coef.a0?'+ '+termC(coef.a0):''}`;
  }
  html = html.replace(/\s+/g,' ').trim().replace(/\+ -/g,'+ (-');
  return `[${html}]`;
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
    let divisor, q, dividend;
    do{
      divisor = randNZ15(); q = randNZ15(); dividend = divisor*q;
    }while(Math.abs(dividend)>15); // ตัวตั้ง/ตัวหาร/ผลลัพธ์ แสดงไม่เกิน ±15
    problemText = `${dividend} ÷ ${divisor<0?`(${divisor})`:divisor}`;
    answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
    showWorkspace('div'); divDivisor.textContent=divisor; divQuot.value='';
  }else if(mode==='poly_add' || mode==='poly_sub' || mode==='poly_mul'){
    // deg 1 หรือ 2 แบบ 50/50; ใช้ช่วง [-9,9]\{0}
    const degP = Math.random()<.5 ? 2 : 1;
    const degQ = Math.random()<.5 ? 2 : 1;
    const P = buildPolyByDegree(degP, randNZ9);
    const Q = buildPolyByDegree(degQ, randNZ9);

    if(mode==='poly_add'){
      problemText = `${P.html} + ${Q.html}`;
      answerCoef = addCoef(P.coef, Q.coef);
      problemAnswer = wrapDisplayFromCoef(answerCoef);
    }else if(mode==='poly_sub'){
      problemText = `${P.html} - ${Q.html}`;
      answerCoef = subCoef(P.coef, Q.coef);
      problemAnswer = wrapDisplayFromCoef(answerCoef);
    }else{
      problemText = `${P.html} × ${Q.html}`;
      answerCoef = mulCoef(P.coef, Q.coef);
      // เพดานสัมประสิทธิ์หลังคูณ |coef| ≤ 36
      ['a2','a1','a0'].forEach(k=>{ answerCoef[k] = Math.max(-36, Math.min(36, answerCoef[k])); });
      problemAnswer = wrapDisplayFromCoef(answerCoef);
      showWorkspace('mul');
      mulMult.innerHTML  = P.html.slice(1,-1);    // แสดงข้อความในตารางโดยคงวงเล็บครบ
      mulMcand.innerHTML = Q.html.slice(1,-1);
    }
  }else if(mode==='poly_div'){
    // สร้าง (dividend) = (s x + t) * (a x + b)
    // เงื่อนไข: s,t,a,b ∈ [-20,20]\{0} และ coef ของ dividend ทั้งหมดต้องอยู่ใน ±20 เพื่อแสดง
    let s,t,a,b,A2,A1,A0,ok=false;
    while(!ok){
      s = randNZ20(); t = randNZ20();
      // อนุญาต quotient ดีกรี 1 หรือ 0 → ใช้ (a x + b) โดย a หรือ b อาจเป็น 0? ตามโจทย์ “ไม่เอา 0 สำหรับทุกสัมประสิทธิ์ที่สุ่ม”
      a = randNZ20(); b = randNZ20();
      A2 = s*a;          // x^2
      A1 = s*b + t*a;    // x
      A0 = t*b;          // ค่าคงที่
      ok = [A2,A1,A0].every(v=>Math.abs(v)<=20) && A2!==0; // ยอมให้ดีกรี 1 ได้หรือไม่? อนุญาตถ้า A2==0 -> ดีกรี 1
      if([A2,A1,A0].every(v=>Math.abs(v)<=20)) ok = true;
    }
    const dividend = wrapDisplayFromCoef({a2:A2,a1:A1,a0:A0});
    const divisorHTML  = `[${termX1(s,1)} + ${termC(t)}]`.replace(/\+ -/g,'+ (-');
    problemText  = `${dividend} ÷ ${divisorHTML}`;
    answerCoef   = {a2:0,a1:a,a0:b}; // ผลหาร = a x + b
    problemAnswer= wrapDisplayFromCoef(answerCoef);
    showWorkspace('div');
    divDivisor.innerHTML = `${(s===1?'':s===-1?'-':s)}x${t>=0?'+':''}${t}`.replace(/\+ -/,'+ (-');
    divQuot.value='';
    // double-check: dividend == divisor * quotient (ตรวจสอบเชิงเลข)
    const chk = mulCoef({a2:0,a1:s,a0:t},{a2:0,a1:a,a0:b});
    if(!(chk.a2===A2 && chk.a1===A1 && chk.a0===A0)){
      // หากเกิดไม่ตรง (แทบจะไม่เกิด) สุ่มใหม่
      return newExample();
    }
  }else if(mode==='solve_lin'){
    // สุ่มในช่วง [-15,15]\{0} ให้ coefficients ที่แสดงไม่เกินช่วง
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
  // พหุนาม: ยอมรับเฉพาะ “รูปแยกสัมประสิทธิ์” ง่าย ๆ
  // เปรียบเทียบกับ answerCoef
  const parsed = parseSimplePoly(given);
  if(!parsed){ bad(); return; }
  if(parsed.a2===answerCoef.a2 && parsed.a1===answerCoef.a1 && parsed.a0===answerCoef.a0){ good(); } else { bad(); }

  function good(){ checkResult.textContent='ถูกต้อง'; checkResult.style.color='#16a34a'; }
  function bad(){ checkResult.textContent='ไม่ถูกต้อง'; checkResult.style.color='#dc2626'; }
};

// parser แบบเบา: รองรับเลขจำนวนเต็ม, x, x^2, วงเล็บ () ที่แปลงมาก่อนหน้า
function parseSimplePoly(s){
  if(/[^0-9xX+\-^()]/.test(s)) return null;
  // แทนที่ -- เป็น +, +- เป็น -
  s = s.replace(/--/g,'+').replace(/\+-/g,'-');
  // แยกด้วย + และ -
  let sign = 1, i=0;
  const takeNum = ()=>{ let m=s.slice(i).match(/^\d+/); if(!m) return null; i+=m[0].length; return parseInt(m[0],10); };
  let a2=0,a1=0,a0=0;
  while(i<s.length){
    if(s[i]==='+'){ sign=1; i++; continue; }
    if(s[i]==='-'){ sign=-1; i++; continue; }
    // factor
    let num = 0, hasNum=false;
    let j=i, m = s.slice(i).match(/^\d+/);
    if(m){ num=parseInt(m[0],10); hasNum=true; i+=m[0].length; }
    if(s[i]==='x' || s[i]==='X'){
      i++;
      let pow=1;
      if(s[i]==='^' && s[i+1]==='2'){ pow=2; i+=2; }
      const c = hasNum? num*sign : 1*sign;
      if(pow===2) a2+=c; else a1+=c;
    }else{
      if(!hasNum) return null;
      a0 += sign*num;
    }
  }
  return {a2,a1,a0};
}

// ====== Init ======
document.getElementById('btn-new').focus();
newExample();
render();
