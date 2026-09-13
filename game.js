'use strict';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const scoreEl = document.getElementById('score'), waveEl = document.getElementById('wave'), livesEl = document.getElementById('lives'), superAmmoEl = document.getElementById('super-ammo');
const overlay = document.getElementById('overlay'), overlayMessage = document.getElementById('overlay-message'), startButton = document.getElementById('start-button');
const keys = new Set();
let state = 'title', score = 0, lives = 3, wave = 1, superAmmo = 3, lastTime = 0, animationId;
let player, aliens = [], bullets = [], bombs = [], particles = [], barriers = [], fleet = null, bombTimer = 0, elapsed = 0, shake = 0, superBeam = null;
let audioContext = null, audioMaster = null, drone = null;
const alienColors = ['#d43c58','#9b56d4','#75d36e','#a83b82','#c5ba4f','#eb5268'];
const alienRowIds = ['crown','spider','watcher','stalker','batwing','worm'];
function loadSprite(src) {
  const img = new Image();
  img.src = src;
  return img;
}
const sprites = {
  player: loadSprite('assets/player_idle_00.png'),
  bullet: loadSprite('assets/bullet_player_00.png'),
  bomb: loadSprite('assets/bomb_alien_00.png'),
  barrierFull: loadSprite('assets/barrier_block_full.png'),
  barrierCrack: loadSprite('assets/barrier_block_crack.png'),
  aliens: {
    crown: loadSprite('assets/alien_crown_idle_00.png'),
    spider: loadSprite('assets/alien_spider_idle_00.png'),
    watcher: loadSprite('assets/alien_watcher_idle_00.png'),
    stalker: loadSprite('assets/alien_stalker_idle_00.png'),
    batwing: loadSprite('assets/alien_batwing_idle_00.png'),
    worm: loadSprite('assets/alien_worm_idle_00.png')
  }
};
function spriteReady(img) { return img && img.complete && img.naturalWidth > 0; }
function drawSprite(img, x, y) {
  if (!spriteReady(img)) return false;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(x), Math.round(y));
  ctx.imageSmoothingEnabled = prev;
  return true;
}
const clamp = (n,min,max) => Math.max(min, Math.min(max,n));
function pad(n,len=6) { return String(n).padStart(len,'0'); }
function updateHud() { scoreEl.textContent=pad(score); waveEl.textContent=String(wave).padStart(2,'0'); livesEl.textContent='♥ '.repeat(Math.max(0,lives)).trim() || '—'; superAmmoEl.textContent=String(superAmmo); }
function makePlayer() { return { x:W/2-22,y:H-57,w:44,h:25,speed:390,cooldown:0,invuln:0 }; }
function makeAliens() {
  const rows = Math.min(5 + Math.floor((wave-1)/3), 6), cols = 10, gapX=66, gapY=45;
  const startX=(W-(cols-1)*gapX-38)/2, startY=72;
  aliens=[];
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) aliens.push({x:startX+c*gapX,y:startY+r*gapY,w:38,h:30,row:r,col:c,alive:true,color:alienColors[r%alienColors.length],phase:(r*7+c*3)%17});
  fleet={dir:1,speed:39+wave*8,step:0,drop:0,impact:0}; bombTimer=0;
}
function makeBarriers() { barriers=[]; for (const x of [165, 390, 615, 840]) { const blocks=[]; for(let yy=0;yy<4;yy++) for(let xx=0;xx<8;xx++) if(!(yy===0&&(xx<2||xx>5)) && !(yy===3&&(xx===3||xx===4))) blocks.push({x:x-36+xx*9,y:H-145+yy*9,w:8,h:8,hp:2}); barriers.push(blocks); } }
function resetGame() { score=0;lives=3;wave=1;superAmmo=3;player=makePlayer();makeAliens();makeBarriers();bullets=[];bombs=[];particles=[];elapsed=0;shake=0;superBeam=null;updateHud(); }
function initAudio() {
  if (audioContext) { if (audioContext.state === 'suspended') audioContext.resume(); return; }
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  audioContext = new AudioCtor(); audioMaster = audioContext.createGain(); audioMaster.gain.value=.16; audioMaster.connect(audioContext.destination);
  drone = audioContext.createOscillator(); const droneGain=audioContext.createGain(); drone.type='sine'; drone.frequency.value=48; droneGain.gain.value=.035; drone.connect(droneGain).connect(audioMaster); drone.start();
}
function tone(freq,duration,type='square',volume=.12,slide=0) {
  if (!audioContext || !audioMaster) return;
  const now=audioContext.currentTime, osc=audioContext.createOscillator(), gain=audioContext.createGain();
  osc.type=type; osc.frequency.setValueAtTime(freq,now); if(slide)osc.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),now+duration);
  gain.gain.setValueAtTime(.001,now); gain.gain.exponentialRampToValueAtTime(volume,now+.008); gain.gain.exponentialRampToValueAtTime(.001,now+duration);
  osc.connect(gain).connect(audioMaster); osc.start(now); osc.stop(now+duration+.02);
}
function startGame() { initAudio(); tone(110,.3,'sawtooth',.11,90); resetGame();state='playing';overlay.classList.remove('visible');lastTime=performance.now();cancelAnimationFrame(animationId);animationId=requestAnimationFrame(loop); }
function endGame(message) { state='gameover'; tone(62,.7,'sawtooth',.2,-38); overlayMessage.textContent=message; startButton.textContent='PRESS SPACE TO RESTART'; overlay.classList.add('visible'); }
function nextWave() { wave++; if(wave%3===0)superAmmo=Math.min(5,superAmmo+1); makeAliens(); makeBarriers(); player.x=W/2-player.w/2; updateHud(); burst(W/2,100,'#b5ef68',30); shake=.35; tone(70,.32,'sawtooth',.13,170); }
function shoot() { if(state!=='playing'||player.cooldown>0) return; initAudio(); bullets.push({x:player.x+player.w/2-2,y:player.y-10,w:4,h:16,vy:-600}); player.cooldown=.25; tone(520,.07,'square',.055,230); }
function fireSuperLaser() {
  // Vertical COLUMN wipe under the ship (same formation col = stacked aliens), never a horizontal row.
  if(state!=='playing'||superAmmo<=0||superBeam) return;
  const live=aliens.filter(a=>a.alive), playerCenter=player.x+player.w/2;
  if(!live.length) return;
  // Pick the living alien closest horizontally to the ship; wipe that alien's entire COLUMN (all rows in that col).
  let anchor=live[0], best=Math.abs(live[0].x+live[0].w/2-playerCenter);
  for(const a of live){
    const d=Math.abs(a.x+a.w/2-playerCenter);
    if(d<best || (d===best && a.y>anchor.y)){best=d;anchor=a;}
  }
  const targetCol=anchor.col;
  const targets=live.filter(a=>a.col===targetCol);
  // Sanity: must span multiple rows when a full stack exists (column), never a single shared row of many cols.
  superAmmo--; superBeam={col:targetCol,x:playerCenter,life:.62,max:.62};
  initAudio();
  for(const a of targets){a.alive=false;score+=(5-a.row)*10+10;burst(a.x+a.w/2,a.y+a.h/2,'#e7fbff',18);}
  shake=Math.max(shake,.42); tone(820,.4,'sawtooth',.2,-690); tone(1550,.24,'square',.1,-920); updateHud();
}
function rectHit(a,b) { return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y; }
function burst(x,y,color,count=10) { for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=35+Math.random()*130;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.5,max:.85,color,size:2+Math.random()*3});} }
function loseLife() { if(player.invuln>0)return; lives--;updateHud();burst(player.x+player.w/2,player.y+10,'#ff416d',30);shake=.6;tone(90,.35,'sawtooth',.18,-55);if(lives<=0){endGame('The last signal from Earth has gone quiet.');return;} player.x=W/2-player.w/2;player.invuln=2;bullets=[];bombs=[]; }
function update(dt) {
  elapsed+=dt; shake=Math.max(0,shake-dt*1.6); player.cooldown=Math.max(0,player.cooldown-dt);player.invuln=Math.max(0,player.invuln-dt); if(superBeam){superBeam.life-=dt;if(superBeam.life<=0)superBeam=null;}
  if(keys.has('ArrowLeft')||keys.has('a'))player.x-=player.speed*dt; if(keys.has('ArrowRight')||keys.has('d'))player.x+=player.speed*dt; player.x=clamp(player.x,20,W-player.w-20);
  if(keys.has(' ')||keys.has('Spacebar'))shoot();
  bullets.forEach(b=>b.y+=b.vy*dt); bullets=bullets.filter(b=>b.y>-25);
  fleet.step += dt*fleet.speed; fleet.impact=Math.max(0,fleet.impact-dt*2.5); const move = fleet.dir*dt*fleet.speed;
  aliens.forEach(a=>{if(a.alive)a.x+=move;});
  const live=aliens.filter(a=>a.alive);
  if(!live.length){nextWave();return;}
  const left=Math.min(...live.map(a=>a.x)), right=Math.max(...live.map(a=>a.x+a.w));
  if(right>W-22||left<22){fleet.dir*=-1;aliens.forEach(a=>{if(a.alive)a.y+=18;});fleet.impact=1;shake=Math.max(shake,.14);tone(55+wave*4,.11,'sawtooth',.045,28);}
  const lowest=Math.max(...live.map(a=>a.y+a.h));
  if(lowest>player.y-5){endGame('The invaders breached the last defense line.');return;}
  if(lowest>player.y-145)shake=Math.max(shake,.025);
  bombTimer-=dt;
  if(bombTimer<=0){const cols=[...new Set(live.map(a=>a.col))],col=cols[Math.floor(Math.random()*cols.length)],choices=live.filter(a=>a.col===col),a=choices[choices.length-1];bombs.push({x:a.x+a.w/2-2,y:a.y+a.h,w:5,h:13,vy:145+wave*13});bombTimer=Math.max(.28,1.05-wave*.055)+Math.random()*.75;tone(180+Math.random()*60,.09,'triangle',.025,-70);}
  bombs.forEach(b=>b.y+=b.vy*dt); bombs=bombs.filter(b=>b.y<H+20);
  for(const b of bullets){let hit=false;for(const a of aliens){if(a.alive&&rectHit(b,a)){a.alive=false;hit=true;score+=(5-a.row)*10+10;burst(a.x+a.w/2,a.y+a.h/2,a.color,15);shake=Math.max(shake,.12);tone(105+Math.random()*50,.16,'sawtooth',.14,-75);break;}}if(hit)b.y=-99;}
  for(const b of bombs){if(rectHit(b,player)){b.y=H+99;loseLife();} for(const shield of barriers) for(const block of shield){if(block.hp>0&&rectHit(b,block)){block.hp--;b.y=H+99;break;}}}
  for(const b of bullets){for(const shield of barriers)for(const block of shield){if(block.hp>0&&rectHit(b,block)){block.hp--;b.y=-99;break;}}}
  aliens.forEach(a=>{if(a.alive)for(const shield of barriers)for(const block of shield)if(block.hp>0&&rectHit(a,block))block.hp=0;});
  barriers.forEach(s=>{for(let i=s.length-1;i>=0;i--)if(s[i].hp<=0)s.splice(i,1);});
  particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=70*dt;p.life-=dt;});particles=particles.filter(p=>p.life>0);updateHud();
}
function drawAlien(a) {
  const twitch=Math.sin(elapsed*13+a.phase)*1.25, sway=Math.sin(elapsed*2.8+a.phase)*2;
  const id=alienRowIds[a.row%alienRowIds.length];
  const img=sprites.aliens[id];
  // Bitmap 40×32, hitbox 38×30 — bottom-centre pivot (1px x / 2px y pad)
  ctx.save();
  ctx.shadowColor=a.color;
  ctx.shadowBlur=9+Math.max(0,fleet.impact*10);
  if(!drawSprite(img, a.x-1+twitch, a.y-2+sway)){
    ctx.fillStyle=a.color;
    ctx.fillRect(Math.round(a.x+twitch),Math.round(a.y+sway),a.w,a.h);
  }
  ctx.restore();
}
function drawSuperBeam() {
  if(!superBeam) return;
  const progress=1-superBeam.life/superBeam.max, sweep=Math.min(H,H*(.2+progress*1.35)), top=Math.max(0,player.y-sweep), bottom=player.y;
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha=.18*(1-progress*.45);ctx.fillStyle='#8ff7ff';ctx.fillRect(superBeam.x-24,top,48,bottom-top);
  ctx.globalAlpha=.85*(1-progress*.35);ctx.fillStyle='#5cecff';ctx.shadowColor='#bdfcff';ctx.shadowBlur=28;ctx.fillRect(superBeam.x-8,top,16,bottom-top);
  ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.shadowBlur=12;ctx.fillRect(superBeam.x-2,top,4,bottom-top);
  const beamTop=0;ctx.globalAlpha=.72*(1-progress*.3);ctx.fillStyle='#70eaff';ctx.shadowBlur=18;ctx.fillRect(superBeam.x-5,beamTop,10,player.y-beamTop);
  ctx.fillStyle='#fff';ctx.shadowBlur=8;ctx.fillRect(superBeam.x-2,beamTop,4,player.y-beamTop);
  ctx.restore();
}
function drawPlayer() {
  if(player.invuln>0&&Math.floor(player.invuln*10)%2===0)return;
  ctx.save();
  ctx.shadowColor='#70eaff';
  ctx.shadowBlur=14;
  // Bitmap 48×32, hitbox 44×25 — bottom-centre pivot (2px x / 7px y pad)
  if(!drawSprite(sprites.player, player.x-2, player.y-7)){
    ctx.fillStyle='#70eaff';
    ctx.fillRect(Math.round(player.x),Math.round(player.y),player.w,player.h);
  }
  ctx.restore();
}
function draw() { ctx.clearRect(0,0,W,H);ctx.save();if(shake>0)ctx.translate((Math.random()-.5)*shake*18,(Math.random()-.5)*shake*14);ctx.fillStyle='#020207';ctx.fillRect(0,0,W,H);
  const haze=ctx.createRadialGradient(W*.5,H*.55,50,W*.5,H*.55,500);haze.addColorStop(0,'rgba(65,12,52,.24)');haze.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=haze;ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#b6a4ff';for(let i=0;i<80;i++){const x=(i*137)%W,y=(i*83+23)%H;ctx.globalAlpha=.16+((i*7)%6)/16;ctx.fillRect(x,y,1+(i%3===0),1+(i%5===0));}ctx.globalAlpha=1;
  ctx.strokeStyle='#3c183b';ctx.setLineDash([2,10]);ctx.beginPath();ctx.moveTo(0,H-34);ctx.lineTo(W,H-34);ctx.stroke();ctx.setLineDash([]);
  aliens.forEach(a=>{if(a.alive)drawAlien(a);});drawSuperBeam();
  barriers.forEach(s=>s.forEach(b=>{
    const img=b.hp===1?sprites.barrierCrack:sprites.barrierFull;
    ctx.save();
    ctx.shadowColor='#b5ef68';
    ctx.shadowBlur=8;
    ctx.globalAlpha=b.hp===1?.85:1;
    if(!drawSprite(img, b.x, b.y)){
      ctx.fillStyle='#b5ef68';
      ctx.globalAlpha=b.hp===1?.42:1;
      ctx.fillRect(b.x,b.y,b.w,b.h);
    }
    ctx.restore();
  }));
  drawPlayer();
  bullets.forEach(b=>{
    ctx.save();
    ctx.shadowColor='#fff';
    ctx.shadowBlur=10;
    if(!drawSprite(sprites.bullet, b.x, b.y)){
      ctx.fillStyle='#fff';
      ctx.fillRect(b.x,b.y,b.w,b.h);
    }
    ctx.restore();
  });
  bombs.forEach(b=>{
    ctx.save();
    ctx.shadowColor='#ff416d';
    ctx.shadowBlur=10;
    // Bitmap 8×16, hitbox 5×13 — top-centre align
    if(!drawSprite(sprites.bomb, b.x+(b.w-8)/2, b.y)){
      ctx.fillStyle='#ff416d';
      ctx.fillRect(b.x,b.y,b.w,b.h);
      ctx.fillRect(b.x-3,b.y+5,b.w+6,3);
    }
    ctx.restore();
  });
  particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size);});ctx.globalAlpha=1;ctx.restore(); }
function loop(now) { const dt=Math.min(.033,(now-lastTime)/1000);lastTime=now;if(state==='playing')update(dt);draw();if(state==='playing')animationId=requestAnimationFrame(loop); }
window.addEventListener('keydown',e=>{const k=e.key.length===1?e.key.toLowerCase():e.key;if(['ArrowLeft','ArrowRight',' ','a','d','r','f','Shift'].includes(k))e.preventDefault();if(e.repeat)return;keys.add(k);if(k==='r')startGame();if((k==='Shift'||k==='f')&&state==='playing')fireSuperLaser();if((k===' '||k==='Spacebar')&&state!=='playing')startGame();});
window.addEventListener('keyup',e=>{const k=e.key.length===1?e.key.toLowerCase():e.key;keys.delete(k);});
startButton.addEventListener('click',startGame);resetGame();draw();
// Redraw once sprites finish loading (file:// / static server relative paths)
Object.values(sprites).forEach(v=>{
  if(v && v.addEventListener) v.addEventListener('load',()=>{ if(state!=='playing') draw(); });
  else if(v && typeof v==='object') Object.values(v).forEach(img=>img.addEventListener('load',()=>{ if(state!=='playing') draw(); }));
});
