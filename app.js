/*
Version: 2025-08-17 r7
Changelog:
- รวมกฎสุ่ม/จัดรูปเฉลย/ตารางคูณ–หาร จากเวอร์ชันล่าสุดกลับเข้ามาทั้งหมด
- เปลี่ยนเป็น Pointer Events (pointerdown/move/up/cancel) แทน mouse/touch แยกกัน
- กันหน้าเลื่อนด้วย CSS touch-action:none (อ้างใน styles.css) และตั้ง listener เป็น {passive:false} ในส่วนที่เรียก preventDefault()
- ปรับปุ่ม "เพิ่มจำนวน" ให้เลือกเฉพาะตัวใหม่ และวางเหลื่อมไม่ซ้อนกัน
*/

(() => {
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

  // inputs ต้องไม่เริ่มลาก
  ['pointerdown'].forEach(evt=>{
    if(divQuot) divQuot.addEventListener(evt, e=>e.stopPropagation());
    if(answerInput) answerInput.addEventListener(evt, e=>e.stopPropagation());
  });

  // ====== Tiles config ======
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

  // ====== Utils ======
  const uid = ()=> Math.random().toString(36).slice(2);
  const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));

  // RNG in [-15,15] \ {0}
  function randNZ() { let v=0; while(v===0){ v = (Math.random()<.5?-1:1) * (Math.floor(Math.random()*15)+1); } return v; }
  // RNG in [-9,9] \ {0}
  function randNZ9(){ let v=0; while(v===0){ v=(Math.random()<.5?-1:1) * (Math.floor(Math.random()*9)+1);} return v; }
  function rint(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

  // Workspace visibility
  function showWorkspace(which){
    wsSolve.style.display = (which==='solve') ? 'block':'none';
    wsMul.style.display   = (which==='mul')   ? 'block':'none';
    wsDiv.style.display   = (which==='div')   ? 'block':'none';
  }

  // pointer to board coords
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
    el.addEventListener('pointerdown', (e)=>{e.preventDefault(); addTile();});
  });

  // ====== Board interactions (Pointer Events) ======
  const beginZone = (e)=>{
    if(e.button!==undefined && e.button!==0) return; // mouse right
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
  window.addEventListener('pointermove', moveZone, {passive:false});
  window.addEventListener('pointerup', endZone);
  window.addEventListener('pointercancel', endZone);

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
    const spacing = 12;
    const clones = selectedTiles.map((t,i)=>{
      return {...t, id:uid(), x:t.x + (i+1)*spacing, y:t.y + (i+1)*spacing};
    });
    tiles = [...tiles, ...clones];
    selection = new Set(clones.map(c=>c.id)); // เลือกเฉพาะตัวใหม่
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
    const src = ytframe.src; ytframe.src = src;
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
  function coefToHTML({a2,a1,a0}){
    const parts=[];
    if(a2){ parts.push((a2===1?'':a2===-1?'-':a2)+'x<sup>2</sup>'); }
    if(a1){ parts.push((a1===1?'':a1===-1?'-':a1)+'x'); }
    if(a0){ parts.push(String(a0)); }
    return parts.length? parts.join(' + ').replace(/\+ -/g,'+ (-') : '0';
  }

  // ====== Formatting helpers per rule ======
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
    c(k, deg){
      return (k<0) ? `(${k})` : `${k}`;
    }
  };

  function buildPoly(deg, use9=false){ // return {coef:{a2,a1,a0}, html:'[...]'}
    const R = use9 ? randNZ9 : randNZ;
    if(deg===2){
      const a = R(), b = R(), c = R();
      const t2 = fmtTerm.x2(a, true);
      const t1 = fmtTerm.x1(b, 2);
      const t0 = fmtTerm.c(c, 2);
      const inner = [t2, ' + '+t1, ' + '+t0]
        .join('').replace(/\+ \(-/g,'+ (-').replace(/\+ -/g,'+ (-');
      return {coef:{a2:a,a1:b,a0:c}, html:`[${inner}]`};
    }else{
      const b = R(), c = R();
      const t1 = fmtTerm.x1(b, 1);
      const t0 = fmtTerm.c(c, 1);
      const inner = [t1, ' + '+t0]
        .join('').replace(/\+ \(-/g,'+ (-').replace(/\+ -/g,'+ (-');
      return {coef:{a2:0,a1:b,a0:c}, html:`[${inner}]`};
    }
  }

  // Multiply two polynomials up to deg2 (brute-safe)
  function addCoef(A,B){ return {a2:A.a2+B.a2, a1:A.a1+B.a1, a0:A.a0+B.a0}; }
  function mulCoef(A,B){
    const res = {a2:0,a1:0,a0:0};
    [[2,A.a2],[1,A.a1],[0,A.a0]].forEach(([pa,ka])=>{
      [[2,B.a2],[1,B.a1],[0,B.a0]].forEach(([pb,kb])=>{
        const pow=pa+pb, k=ka*kb;
        if(pow===2) res.a2+=k; else if(pow===1) res.a1+=k; else res.a0+=k;
      });
    });
    // clamp หลังคูณเพดาน ±36 (ตามที่เคยกำหนด)
    res.a2 = Math.max(-36, Math.min(36, res.a2));
    res.a1 = Math.max(-36, Math.min(36, res.a1));
    res.a0 = Math.max(-36, Math.min(36, res.a0));
    return res;
  }

  // ====== Example generator (รวมกฎสุ่มล่าสุด) ======
  function newExample(){
    showSol=false; document.getElementById('btn-solution').textContent='เฉลย';
    answerInput.value=''; checkResult.textContent='';
    tiles=[]; selection.clear();
    showWorkspace(null);

    if(mode==='int_add'){
      const a=randNZ(), b=randNZ();
      problemText = `${a} + ${b<0?`(${b})`:b}`;
      const sum=a+b; answerCoef={a2:0,a1:0,a0:sum}; problemAnswer=String(sum);
    }else if(mode==='int_sub'){
      const a=randNZ(), b=randNZ();
      problemText = `${a} - ${b<0?`(${b})`:b}`;
      const res=a-b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
    }else if(mode==='int_mul'){
      const a=randNZ(), b=randNZ();
      problemText = `${a} × ${b<0?`(${b})`:b}`;
      const res=a*b; answerCoef={a2:0,a1:0,a0:res}; problemAnswer=String(res);
      showWorkspace('mul'); mulMult.textContent=b; mulMcand.textContent=a;
    }else if(mode==='int_div'){
      // ทั้งสุ่มและแสดงผลจำกัด [-15,15]\{0} และหารลงตัว
      let divisor, q, dividend;
      divisor = randNZ(); q = randNZ(); dividend = divisor*q;
      // แสดง
      problemText = `${dividend} ÷ ${divisor<0?`(${divisor})`:divisor}`;
      answerCoef={a2:0,a1:0,a0:q}; problemAnswer=String(q);
      showWorkspace('div'); divDivisor.textContent=divisor; divQuot.value='';
    }else if(mode==='poly_add' || mode==='poly_sub' || mode==='poly_mul'){
      // กฎใหม่: โจทย์คูณพหุนามใช้ช่วง [-9,9]\{0}; บวก/ลบใช้ช่วง [-15,15]\{0} เดิมก็ได้
      const use9 = (mode==='poly_mul'); // เฉพาะคูณ
      const degP = Math.random()<.5 ? 2 : 1;
      const degQ = Math.random()<.5 ? 2 : 1;
      const P = buildPoly(degP, use9);
      const Q = buildPoly(degQ, use9);

      if(mode==='poly_add'){
        problemText = `${P.html} + ${Q.html}`;
        answerCoef = addCoef(P.coef, Q.coef);
        problemAnswer = coefToHTML(answerCoef); // เฉลยไม่ต้องมี []
      }else if(mode==='poly_sub'){
        problemText = `${P.html} - ${Q.html}`;
        answerCoef = addCoef(P.coef, {a2:-Q.coef.a2, a1:-Q.coef.a1, a0:-Q.coef.a0});
        problemAnswer = coefToHTML(answerCoef);
      }else{
        problemText = `${P.html} × ${Q.html}`;
        answerCoef = mulCoef(P.coef, Q.coef);
        problemAnswer = coefToHTML(answerCoef);
        showWorkspace('mul');
        // เติมตัวอย่างตัวคูณ/ตัวตั้งในตารางคูณ โดยคงวงเล็บตามตรรกะเดียวกับโจทย์
        mulMult.innerHTML  = coefToHTML(Q.coef).replace(/\+ \(-/g,'+ (-');
        mulMcand.innerHTML = coefToHTML(P.coef).replace(/\+ \(-/g,'+ (-');
      }
    }else if(mode==='poly_div'){
      // กฎล่าสุด:
      // - ตัวหารดีกรีไม่เกิน 1: q(x)=sx+t (s อาจเป็น -1,1 หรืออื่น ๆ ได้)
      // - ใช้ช่วงสุ่มสำหรับการคูณ/หารเป็น [-9,9]\{0} เพื่อไม่โตเกินไป และบังคับหารลงตัว
      // - แสดง dividend coefficients ไม่เกิน ±15 (คุมการแสดงบนมือถือ) -> แต่จากรอบหลังอนุญาตมากขึ้นก็ได้
      // ที่นี่สร้างจาก (ax + b)*(sx + t) หรือ (ax^2+bx+c)*(sx+t) ก็ได้ แต่ให้หารลงตัวด้วย (sx+t)
      const useDegP = (Math.random()<.5 ? 1 : 2);
      const s = randNZ9(); const t = randNZ9(); // ตัวหาร
      let a,b,c;
      if(useDegP===1){
        // dividend = (a x + b) * (s x + t)
        let ok=false;
        while(!ok){
          a = randNZ9(); b = randNZ9();
          // คำนวณ dividend coef
          const A2 = a*s;
          const A1 = a*t + b*s;
          const A0 = b*t;
          // ยอมรับเลย (หารลงตัวแน่นอน)
          if(true){ ok=true;
            const polyHTML = `[${(A2===0?'':(A2===1?'':'') )}${A2? 'x<sup>2</sup>':''}${A1? (A2? ' + ':'') + (A1>=0?'': '(')+ (A1>=0? A1: A1+')') + 'x':''}${A0? (A2||A1? ' + ':'') + (A0>=0? A0 : '('+A0+')') : ''}]`
              .replace(/\+ -/g,'+ (-');
            const divisorHTML = `[${s===1?'':(s===-1?'-':s)}x${t>=0? ' + '+t : ' + ('+t+')'}]`.replace(/\+ -/g,'+ (-');

            problemText = `${polyHTML} ÷ ${divisorHTML}`;
            answerCoef = {a2:0, a1:a, a0:b};
            problemAnswer = coefToHTML(answerCoef);

            showWorkspace('div');
            divDivisor.innerHTML = `${(s===1?'':(s===-1?'-':s))}x${t>=0? ' + '+t : ' + ('+t+')'}`.replace(/\+ -/g,'+ (-');
            divQuot.value='';
          }
        }
      }else{
        // dividend = (a x^2 + b x + c) * (s x + t)
        let ok=false;
        while(!ok){
          a = randNZ9(); b = randNZ9(); c = randNZ9();
          const A3 = a*s;                 // x^3 (จะถูกตัดเหลือ 2 ภายหลังไม่ได้ จึงเลือกไม่โชว์ x^3 -> แต่เราจะคุมให้ a*s=0 โดยบังคับ a=0? ไม่ได้เพราะห้าม 0)
          // เพื่อไม่ให้เกินดีกรี 2 ตามโจทย์ต้น เราจะเลือกใช้ดีกรี 1 สำหรับ P เป็นหลัก
          // ดังนั้นหากเลือกดีกรี 2 เราจะปรับให้ a=0 ไม่ได้ จึงกลับไปใช้ดีกรี 1 ถ้าเกิดกรณีนี้
          ok = false;
          break; // ตัดทิ้งไปใช้เคส deg1 เสมอ เพื่อสอดคล้องเงื่อนไขเดิมที่ตัวหารดีกรี 1 และต้องแสดงได้ในตาราง 2x2
        }
        if(!ok){
          // fallback: ใช้ deg1
          mode='poly_div'; // คงเดิม
          const s2 = s, t2 = t;
          let aa=randNZ9(), bb=randNZ9();
          const A2 = aa*s2;
          const A1 = aa*t2 + bb*s2;
          const A0 = bb*t2;

          const polyHTML = `[${(A2? (A2===1?'':'') + 'x<sup>2</sup>':'' )}${A1? (A2? ' + ':'') + (A1>=0?'': '(')+ (A1>=0? A1: A1+')') + 'x':''}${A0? (A2||A1? ' + ':'') + (A0>=0? A0 : '('+A0+')') : ''}]`
            .replace(/\+ -/g,'+ (-');
          const divisorHTML = `[${s2===1?'':(s2===-1?'-':s2)}x${t2>=0? ' + '+t2 : ' + ('+t2+')'}]`.replace(/\+ -/g,'+ (-');

          problemText = `${polyHTML} ÷ ${divisorHTML}`;
          answerCoef = {a2:0, a1:aa, a0:bb};
          problemAnswer = coefToHTML(answerCoef);

          showWorkspace('div');
          divDivisor.innerHTML = `${(s2===1?'':(s2===-1?'-':s2))}x${t2>=0? ' + '+t2 : ' + ('+t2+')'}`.replace(/\+ -/g,'+ (-');
          divQuot.value='';
        }
      }
    }else if(mode==='solve_lin'){
      // สุ่มในช่วง [-15,15]\{0} ให้ coefficients ที่แสดงไม่เกินช่วง
      let a,b,c,x,d,ok=false;
      while(!ok){
        a=randNZ(); b=randNZ(); c=randNZ(); x = rint(-15,15); if(x===0) continue;
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
    const given = (givenRaw||'').replace(/\s+/g,'').replace(/−/g,'-').replace(/\[/g,'(').replace(/\]/g,')');
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
})();
