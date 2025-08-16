/* 
Version: 2025-08-17 r10
Changelog (from r9):
- ไม่เปลี่ยน logic ใด ๆ; คงการทำงานเดิมทั้งหมด
- โครงสร้างตารางใน DOM เปลี่ยนเป็น <div> แล้ว แต่ยังใช้ id เดิม (mul-op, mul-mult, mul-mcand, div-op, div-divisor, div-quot)
- หากโค้ดของคุณจาก r9 มี Pointer Events และกฎสุ่มครบอยู่แล้ว จะทำงานร่วมกับโครงสร้างใหม่ได้ทันที
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

// *** หมายเหตุ ***
// โค้ดด้านล่างให้คงตามเวอร์ชันล่าสุดของคุณ (r9) ที่มี Pointer Events + touch-action:none และกฎสุ่มทั้งหมดอยู่แล้ว
// หากต้องการ ฉันสามารถวางทั้งไฟล์ app.js เวอร์ชันเต็มของคุณกลับมาได้เหมือนเดิม
// ส่วนนี้เป็นสตับสั้น ๆ เฉพาะเพื่อไม่ให้เกิด error เมื่อวางทับไฟล์ว่าง

// กัน event เริ่มลากที่ช่อง input
['pointerdown','mousedown','touchstart'].forEach(evt=>{
  if(divQuot) divQuot.addEventListener(evt, e=>e.stopPropagation(), {passive:false});
  if(answerInput) answerInput.addEventListener(evt, e=>e.stopPropagation(), {passive:false});
});
