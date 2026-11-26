// 에이전트빌리지 — 초안 화면. 그림은 나중에 코덱스 그림으로 갈아끼운다.
// 세계는 작은 픽셀 캔버스(W×H)에 그리고 화면 크기에 맞게 키운다.
// 이름표·말풍선·메뉴는 글자가 깨지지 않게 HTML로 위에 얹는다.

const T = 16, COLS = 34, ROWS = 19, W = COLS * T, H = ROWS * T;
const cv = document.getElementById('cv');
let ctx = cv.getContext('2d');
const overlay = document.getElementById('overlay');
const R = 3;   // 그림(코덱스 일러스트)이 흐려지지 않게 캔버스를 3배로 그리고, 좌표는 그대로 세계 좌표를 쓴다
cv.width = W * R; cv.height = H * R;
let SCALE = 2;

// ---------- 작은 도구 ----------
function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0}
function rng(seed){return()=>((seed=Math.imul(seed^seed>>>15,seed|1)+0x6D2B79F5)>>>0)/4294967296}
const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h)};
function clean(s){return (s||'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*`#>|]/g,'').replace(/\s+/g,' ').trim()}
function short(s,n){s=clean(s);return s.length>n?s.slice(0,n-1)+'…':s}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ---------- 지형 ----------
// 위치는 코덱스 배경(art/background.png)에서 잰 비율. 배경을 바꾸면 여기만 다시 잰다
const FOUNT={x:0.503*W,y:0.47*H}, POND={x:0.49*W,y:0.83*H};
const inPlaza=(x,y,k=1)=>((x-FOUNT.x)/62)**2+((y-FOUNT.y)/52)**2<k;
const inPond=(x,y,k=1)=>((x-POND.x)/50)**2+((y-POND.y)/30)**2<k;
const nearFountain=(x,y)=>((x-FOUNT.x)/30)**2+((y-FOUNT.y)/24)**2<1;

// 주민이 쉴 자리: 마을 전체에 고르게, 분수·연못은 피한다
const SPOTS=[];{
  const r=rng(23);
  for(let gy=0;gy<5;gy++)for(let gx=0;gx<8;gx++){
    let x=(gx+.5)*W/8+(r()-.5)*22, y=(gy+.5)*H/5+12+(r()-.5)*14;
    if(nearFountain(x,y))x+=50;
    if(inPond(x,y,1.6))y-=34;
    SPOTS.push({x:Math.max(12,Math.min(W-12,x)),y:Math.max(26,Math.min(H-6,y))});
  }
  // 가운데부터 채워지게 정렬
  SPOTS.sort((a,b)=>Math.hypot(a.x-FOUNT.x,(a.y-FOUNT.y)*1.4)-Math.hypot(b.x-FOUNT.x,(b.y-FOUNT.y)*1.4));
}

const ground=document.createElement('canvas');ground.width=W;ground.height=H;
(function paintGround(){
  const g=ground.getContext('2d'), r=rng(7);
  const R=(x,y,w,h,c)=>{g.fillStyle=c;g.fillRect(x,y,w,h)};
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    R(x*T,y*T,T,T,(x+y)%2?'#8fcf6a':'#88c964');
    for(let i=0;i<3;i++)R(x*T+(r()*T|0),y*T+(r()*T|0),1,2,'#76b356');
  }
  const path='#e3c48f', pathD='#d3b07a';
  const P=(x,y,w,h)=>{R(x,y,w,h,path);for(let i=0;i<w*h/40;i++)R(x+r()*w,y+r()*h,2,1,pathD)};
  P(0,9*T,W,2*T); P(4*T+8,0,T,H); P(28*T+8,0,T,H);
  for(let y=-80;y<=80;y++)for(let x=-96;x<=96;x++){
    if((x*x)/(96*96)+(y*y)/(72*72)<1){g.fillStyle=((x>>3)+(y>>3))%2?'#d8d2c4':'#cfc8b8';g.fillRect(FOUNT.x+x,FOUNT.y+y,1,1)}
  }
  for(let y=-18;y<=18;y++)for(let x=-34;x<=34;x++){
    const k=(x*x)/(34*34)+(y*y)/(18*18);
    if(k<1){g.fillStyle=k>.8?'#5a9fd6':'#6fb6e8';g.fillRect(POND.x+x,POND.y+y,1,1)}
  }
  const F=['#ff8fb1','#ffe066','#ffffff','#b48cff','#ff9f5a'];
  for(let i=0;i<220;i++){
    const x=r()*W|0,y=r()*H|0;
    if(y>8.6*T&&y<11.2*T)continue;
    if(inPlaza(x,y,1.2)||inPond(x,y,1.1))continue;
    R(x,y,2,2,F[r()*F.length|0]);R(x,y+2,1,2,'#4f9a3c');
  }
})();

const TREES=[];{const r=rng(11);
  for(let i=0;i<70&&TREES.length<30;i++){
    const x=r()*W, y=10+r()*(H-10);
    if(y>8*T&&y<12*T)continue;
    if(inPlaza(x,y,1.3)||inPond(x,y,1.8))continue;
    if(SPOTS.some(s=>Math.hypot(s.x-x,s.y-y)<26))continue;
    if(TREES.some(t=>Math.hypot(t.x-x,t.y-y)<22))continue;
    TREES.push({x,y});
  }
}

function drawTree(x,y){
  rect(x-2,y-6,4,7,'#7a4a2a');
  ctx.fillStyle='#3f8a3a';ctx.beginPath();ctx.arc(x,y-12,9,0,7);ctx.fill();
  ctx.fillStyle='#53a64a';ctx.beginPath();ctx.arc(x-2,y-14,6,0,7);ctx.fill();
  rect(x+2,y-16,2,2,'#ff6b6b');
}

function drawFountain(t){
  const {x,y}=FOUNT;
  ctx.fillStyle='#9aa7b8';ctx.beginPath();ctx.ellipse(x,y,26,14,0,0,7);ctx.fill();
  ctx.fillStyle='#6fb6e8';ctx.beginPath();ctx.ellipse(x,y,22,11,0,0,7);ctx.fill();
  rect(x-3,y-16,6,16,'#b7c2d0');
  for(let k=0;k<6;k++){
    const p=((t/700)+k/6)%1, a=k*1.05;
    ctx.fillStyle=`rgba(255,255,255,${.9-p*.6})`;
    ctx.fillRect(x+Math.cos(a)*p*14,y-18+p*p*20-Math.sin(p*3.14)*6,2,2);
  }
}

// ---------- 미소녀 주민 (임시 도트) ----------
const HAIRS=['#5a3a2a','#f2c14e','#e86a8a','#6a8fe0','#2b2b3a','#c9c9d9','#e8834a','#8a5ad0','#4fb39a','#b0432f'];
const CLOTHES=['#ff8fa8','#7fb4ff','#ffd166','#9be08f','#c7a2ff','#ff9f6e','#6ed3d0','#f6f0e8'];
function lookOf(id){const h=hash(id);return{hair:HAIRS[h%HAIRS.length],cloth:CLOTHES[(h>>4)%CLOTHES.length],style:(h>>8)%4,ribbon:['#ff4d6d','#ffffff','#ffd23f','#4dabf7'][(h>>12)%4]}}

function drawGirl(x,y,L,walk,flip,raise,t){
  const o=x-6, q=y-21, sk='#ffe1cc', ol='#3b2a1f';
  rect(x-5,y-1,10,2,'rgba(0,0,0,.18)');
  if(L.style===0){rect(o+1,q+4,10,12,L.hair)}
  if(L.style===1){rect(o-2,q+5,3,9,L.hair);rect(o+11,q+5,3,9,L.hair);rect(o-1,q+4,2,2,L.ribbon);rect(o+11,q+4,2,2,L.ribbon)}
  if(L.style===3){rect(o+(flip?-2:11),q+3,3,10,L.hair)}
  rect(o+2,q+2,8,10,sk);
  rect(o+1,q,10,4,L.hair);rect(o+2,q-1,8,2,L.hair);
  rect(o+1,q+3,2,5,L.hair);rect(o+9,q+3,2,5,L.hair);
  rect(o+3,q+4,2,1,L.hair);rect(o+7,q+4,1,1,L.hair);
  if(L.style===2){rect(o+1,q+3,2,8,L.hair);rect(o+9,q+3,2,8,L.hair)}
  rect(o+3,q+6,2,3,ol);rect(o+7,q+6,2,3,ol);
  rect(o+3,q+6,1,1,'#fff');rect(o+7,q+6,1,1,'#fff');
  rect(o+2,q+9,2,1,'#ff9fb0');rect(o+8,q+9,2,1,'#ff9fb0');
  rect(o+5,q+10,2,1,'#c0604a');
  if(L.style!==1)rect(o+8,q,3,2,L.ribbon);
  rect(o+3,q+12,6,4,L.cloth);rect(o+2,q+15,8,3,L.cloth);
  rect(o+5,q+12,2,2,'#fff');
  rect(o+1,q+13,2,3,sk);
  if(raise){
    // 사장님 확인이 필요하면 손을 번쩍 든다. 손 둘레가 노랗게 깜빡여 멀리서도 보인다
    const k=(Math.sin((t||0)/180)+1)/2;
    ctx.fillStyle=`rgba(255,226,60,${.35+.45*k})`;ctx.beginPath();ctx.arc(o+11,q-4,4.5+k*2.5,0,7);ctx.fill();
    rect(o+10,q-2,2,15,L.cloth);rect(o+10,q-4,3,3,sk);rect(o+10,q-6,1,2,sk);rect(o+12,q-6,1,2,sk);
    if(k>.6){rect(o+15,q-9,1,3,'#fff6a0');rect(o+14,q-8,3,1,'#fff6a0');rect(o+6,q-8,1,1,'#fff6a0')}
  }else rect(o+9,q+13,2,3,sk);
  const a=walk?1:0;
  rect(o+3+a,q+18,2,3,sk);rect(o+7-a,q+18,2,3,sk);
  rect(o+3+a,q+20,2,1,ol);rect(o+7-a,q+20,2,1,ol);
}

// ---------- 주민 상태 ----------
const people=new Map();   // 마을 안 주민만
let agents=[];            // 마을 안·밖 전부

function spotFor(id){
  const used=new Set([...people.values()].map(p=>p.spot));
  let s=hash(id)%SPOTS.length;
  for(let k=0;k<SPOTS.length&&used.has(s);k++)s=(s+1)%SPOTS.length;
  return s;
}
function plazaPoint(r){const a=r()*6.28,d=30+r()*50;return{x:FOUNT.x+Math.cos(a)*d*1.3,y:FOUNT.y+Math.sin(a)*d*.8}}

let allAgents=[];
// 세션 목록 「🙈 숨김」: 고른 세션을 마을과 목록에서 감춘다 (세션 자체는 그대로, 다시 보이게 할 수 있음)
let HIDDEN=new Set(), hiddenAgents=[], orgHideMode=false;
async function setHidden(id,on){
  const s=new Set(HIDDEN);on?s.add(id):s.delete(id);HIDDEN=s;
  await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hiddenIds:[...s]})});
  if(on&&openId===id)closePanel();
  sync(allAgents);renderOrg();
}
function sync(list){
  // 매일 예약 작업이 새로 띄운 지난 회차는 주민·목록에서 빼고, 최근 회차의 「지난 회차」 안에서만 본다
  allAgents=list;
  hiddenAgents=list.filter(a=>HIDDEN.has(a.id)&&!a.hiddenRun);
  list=list.filter(a=>!a.hiddenRun&&!HIDDEN.has(a.id));   // 숨긴 세션은 마을·목록 어디에도 안 보인다
  agents=list.filter(a=>!a.guest);   // 이웃 빌리지 손님은 마을에만 보이고 목록·조직도에는 안 넣는다
  const seen=new Set();
  for(const a of list){
    if(!a.inside&&!a.visiting){const q=people.get(a.id);if(q&&!q.leaving){q.leaving=true;q.agent=a}continue}
    seen.add(a.id);
    let p=people.get(a.id);
    if(p&&p.leaving)p.leaving=false;
    if(!p&&a.visiting){
      // 마을 밖 세션이 할 말이 있어 잠깐 들어온다: 왼쪽 길에서 걸어와 상관 옆(없으면 광장 왼쪽)에 선다
      const v=list.filter(x=>x.visiting&&!x.parent).indexOf(a);
      const s={x:FOUNT.x-120+(v%3)*16,y:FOUNT.y-14+Math.floor(v/3)*16+(v%2)*5};
      p={spot:-1,visitor:true,home:s,x:-10,y:10*T,tx:s.x,ty:s.y,look:lookOf(a.id),r:rng(hash(a.id)),nextMove:performance.now()+5000,lastSpeech:a.speech,speechAt:performance.now(),els:makeEls(a.id)};
      people.set(a.id,p);
    }
    if(!p){
      const spot=spotFor(a.id), s=a.pos||SPOTS[spot];
      // 새로 들어온 주민은 마을 왼쪽 끝 길에서 걸어 들어온다 (아이콘을 끌어다 놓았으면 그 자리에 바로)
      const enter=joining.has(a.id)&&!dropped.has(a.id);joining.delete(a.id);dropped.delete(a.id);
      p={spot,home:{x:s.x,y:s.y},x:enter?-10:s.x,y:enter?10*T:s.y,tx:s.x,ty:s.y,look:lookOf(a.id),r:rng(hash(a.id)),nextMove:enter?performance.now()+4000:0,lastSpeech:a.speech,speechAt:0,els:makeEls(a.id)};
      people.set(a.id,p);
    }
    if(a.pos&&!p.dragging&&(a.pos.x!==p.home.x||a.pos.y!==p.home.y)&&!p.justDropped)p.home={x:a.pos.x,y:a.pos.y};
    if(a.speech!==p.lastSpeech){p.lastSpeech=a.speech;p.speechAt=performance.now()}
    if(p.agent&&p.agent.working&&!a.working&&!a.needsAction)p.cheer=performance.now()+2800;   // 일을 막 끝냄 → 만세 점프
    p.agent=a;
  }
  for(const [id,p] of people)if(!seen.has(id)&&!p.leaving){
    if(p.agent&&p.agent.guest){p.leaving=true;continue}   // 편지를 읽으면 이웃 손님은 왼쪽 길로 걸어 나간다
    p.els.tag.remove();p.els.bub.remove();people.delete(id)}
  const inside=list.filter(a=>a.inside);
  const w=inside.filter(a=>a.working).length, wt=inside.filter(a=>!a.working&&a.needsAction).length;
  document.getElementById('nWork').textContent=w;
  document.getElementById('nWait').textContent=wt;
  document.getElementById('nIdle').textContent=inside.length-w-wt;
  document.getElementById('hudWork').textContent=w||'';
  document.getElementById('hudWait').textContent=wt||'';
  const outs=list.filter(a=>!a.inside&&!a.guest);
  document.getElementById('nOut').textContent=outs.length;
  document.getElementById('outBadge').textContent=outs.filter(a=>a.needsAction).length?'❗':'';
  if(openId)renderPanel();
  if(outOpen)renderOutside();
  if(orgOpen)renderOrg();
  renderDock();
}

function makeEls(id){
  const tag=document.createElement('div');tag.className='tag';
  const bub=document.createElement('div');bub.className='bubble faint';
  bub.onclick=e=>{
    const ok=e.target.closest('[data-ok]');if(ok){e.stopPropagation();markAlertSeen(ok.dataset.ok);return}
    const r=e.target.closest('[data-id]');openPanel(r?r.dataset.id:id)};
  tag.onmousedown=e=>startDrag(e,id);   // 이름표를 끌어도 주민이 옮겨진다. 끌지 않고 떼면 대화창
  tag.oncontextmenu=bub.oncontextmenu=e=>{e.preventDefault();showMenu(e.clientX,e.clientY,id)};
  tag.onmouseenter=()=>{hoverTag=id};
  tag.onmouseleave=()=>{if(hoverTag===id)hoverTag=null};
  // 말풍선은 마우스 올림을 바꾸지 않는다 (커졌다 작아졌다 깜빡이던 원인 — 2026-11-26)
  overlay.append(bub,tag);
  return{tag,bub};
}

// 시킨 일을 끝내고 아직 사장님이 안 본 보고 (3시간 안): 손을 들고 「📣 다 했어요」 말풍선. 「✔ 확인」 누르면 내린다
function reportPending(a){
  if(!a||a.working||a.needsAction||a.maybeApproval||!a.inside||!a.speech)return false;
  if(typeof mail!=='undefined'&&mail&&a.id===mail.relayId)return false;      // 마을 관리소 답은 대화창으로
  if(!a.native&&!['completed','review_ready'].includes(a.statusCategory))return false;
  if(!a.lastActivityAt||Date.now()-a.lastActivityAt>3*3600e3)return false;
  return !(typeof alertSeen==='function'&&alertSeen(a));
}
function stateOf(a){
  if(a.maybeApproval)return'wait';
  if(a.working)return'work';
  if(a.needsAction)return'wait';   // 앱이 매 턴 남기는 요약에서 '사장님이 할 일'이 적힌 경우만
  if(reportPending(a))return'wait';
  if(a.stalled)return'stall';
  return'idle';
}

function step(p,dt,now){
  if(p.dragging){p.moving=false;return}
  if(p.leaving){
    // 할 말을 마친 방문자는 왼쪽 길로 걸어 나간다
    const dx=-14-p.x, dy=10*T-p.y, d=Math.hypot(dx,dy);
    if(d<3){p.els.tag.remove();p.els.bub.remove();people.delete(p.agent.id);return}
    const sp=34*dt;p.x+=dx/d*Math.min(sp,d);p.y+=dy/d*Math.min(sp,d);p.moving=true;p.flip=true;return;
  }
  if(p.talk&&talkStep(p,dt,now))return;
  if(p.hold&&now<p.hold){p.moving=false;return}   // 누가 말하러 오는 중이면 제자리에서 기다린다
  const a=p.agent, st=stateOf(a), home=p.home;
  if(forcedSleep(a)&&p.x>=0){p.cheer=p.wave=p.greet=0;p.trip=null;p.moving=false;p.tx=p.x;p.ty=p.y;return}   // 💤 그 자리에서 잔다 (부하도 상관을 안 따라감)
  if((p.cheer&&now<p.cheer)||(p.wave&&now<p.wave)||(p.greet&&now<p.greet)){p.moving=false;return}   // 만세·손 흔들기·인사 중엔 제자리
  if(st==='idle'&&!asleep(a,st)&&!p.follower)tryGreet(p,now);
  const lead=a.parent&&people.get(a.parent);
  // 사장님이 「따로 두기」 한 부하는 상관을 따라가지 않고 자기 자리에 머문다
  if(lead&&!(a.pos&&a.pos.free)){
    // 부하: 상관 오른쪽에 줄지어 따라다닌다 (자기 자리는 쓰지 않는다)
    const sib=[...people.values()].filter(q=>q.agent.parent===a.parent).sort((x,y)=>x.agent.id<y.agent.id?-1:1);
    const i=sib.indexOf(p);
    const fx=lead.x+13*(i+1), fy=lead.y+(i%2?4:0);
    const dx=fx-p.x, dy=fy-p.y, d=Math.hypot(dx,dy);
    // 걷기/서기를 매 순간 바꾸면 그림이 깜빡인다 → 4 넘게 벌어지면 걷기 시작, 1 안으로 붙으면 멈춤 (그 사이는 하던 대로)
    if(!p.moving&&d>4)p.moving=true; else if(p.moving&&d<1)p.moving=false;
    if(p.moving&&d>0.01){const sp=Math.max(30,d*3)*dt;p.x+=dx/d*Math.min(sp,d);p.y+=dy/d*Math.min(sp,d);if(Math.abs(dx)>0.3)p.flip=dx<0}
    else if(!p.moving)p.flip=lead.flip;
    p.follower=true;return;
  }
  p.follower=false;
  // 자는 주민은 돌아다니지 않는다: 자기 자리 근처면 그 자리에서 계속 잔다 (멀면 자리로만 걸어간다)
  if(asleep(a,st)){
    if(Math.hypot(home.x-p.x,home.y-p.y)<14){p.moving=false;p.tx=p.x;p.ty=p.y;return}
    p.tx=home.x;p.ty=home.y;p.nextMove=now+8000;
  }
  // 쉬는 주민의 산책: 가끔 분수대·연못까지 걸어가 잠깐 차를 마시고 자기 자리로 돌아온다
  else if(st==='idle'&&strollStep(p,now,home)){}
  // 사장님이 놓은 자리를 지키되 조금은 스스로 움직인다: 일하면 반경 약 1.5칸, 쉬면 반 칸
  else if(now>p.nextMove){
    const R=st==='work'?24:7;
    p.tx=Math.max(8,Math.min(W-8,home.x+(p.r()-.5)*2*R));
    p.ty=Math.max(24,Math.min(H-4,home.y+(p.r()-.5)*R));
    p.nextMove=now+(st==='work'?2500+p.r()*3000:6000+p.r()*6000);
  }
  if(st!=='idle')p.trip=null;
  const dx=p.tx-p.x, dy=p.ty-p.y, d=Math.hypot(dx,dy), sp=(st==='work'?26:p.trip?22:16)*dt*(p.x<0?3:1);
  if(!p.moving&&d>2)p.moving=true; else if(p.moving&&d<0.5)p.moving=false;
  if(p.moving&&d>0.01){p.x+=dx/d*Math.min(sp,d);p.y+=dy/d*Math.min(sp,d);if(Math.abs(dx)>0.3)p.flip=dx<0}
}

// ---------- 그리기 ----------
function isNight(){const h=new Date().getHours();return h>=19||h<6}

function frame(now){
  const dt=Math.min(.05,(now-(frame.t||now))/1000);frame.t=now;
  ctx.setTransform(R,0,0,R,0,0);
  const art=BG.complete&&BG.naturalWidth>0;
  if(art){ctx.imageSmoothingEnabled=true;ctx.drawImage(BG,0,0,W,H)}else ctx.drawImage(ground,0,0);
  const drawables=[];
  if(!art){for(const tr of TREES)drawables.push({y:tr.y,f:()=>drawTree(tr.x,tr.y)});
    drawables.push({y:FOUNT.y+12,f:()=>drawFountain(now)});}
  if(mailbox.enabled)drawables.push({y:POST.y,f:()=>drawPost(now)});
  for(const p of people.values()){
    step(p,dt,now);
    drawables.push({y:p.y,f:()=>{
      const st=stateOf(p.agent), bob=p.moving?Math.floor(now/180)%2:0;
      const st0=stateOf(p.agent), spr=sprite(p.agent.id);
      if(spr){p.h=drawSprite(spr,p,st0,now)}
      else{p.h=24;drawGirl(p.x,p.y-bob,p.look,p.moving&&bob,p.flip,st0==='wait',now)}
      if(kidsOf(p.agent.id).length)drawCrown(p.x,p.y-bob-p.h);
      if(false){ctx.strokeStyle=pick===p.agent.id?'#ffd23f':'#ffffff';ctx.lineWidth=1;ctx.strokeRect(p.x-8,p.y-25,16,27)}
      if(st==='work'){const k=Math.floor(now/250)%3;if(propOk('sparkle')){const z=4+((now/250)%3);ctx.globalAlpha=.85;ctx.drawImage(PROPS.sparkle,p.x+6,p.y-p.h-3-k,z,z);ctx.globalAlpha=1}else{rect(p.x+7,p.y-p.h-k,2,2,'#fff6a0');rect(p.x+8,p.y-p.h-1-k,1,4,'#fff6a0')}}

      if(asleep(p.agent,st)){const k=(now/700)%1;ctx.fillStyle=`rgba(255,255,255,${1-k})`;ctx.font='7px monospace';ctx.fillText('z',p.x+6,p.y-24-k*8)}
    }});
  }
  drawables.sort((a,b)=>a.y-b.y).forEach(d=>d.f());
  if(isNight()){ctx.fillStyle='rgba(30,20,70,.38)';ctx.fillRect(0,0,W,H)}
  placeLabels(now);
  requestAnimationFrame(frame);
}

// 「☀ 깨워 두기」: 주민마다 골라서, 오래 쉬어도 자지 않고 서서 돌아다니게 한다 (이 화면에 기억)
let AWAKE_IDS=new Set();try{AWAKE_IDS=new Set(JSON.parse(localStorage.getItem('village-awake-ids')||'[]'))}catch(e){}
let AWAKE_ALL=false;try{AWAKE_ALL=localStorage.getItem('village-awake')==='1'}catch(e){}
// 「💤 재우기」: 주민마다 골라서, 실제로 일하든 말든 화면에서는 제자리에서 자는 모습으로 (이 화면에 기억)
let SLEEP_IDS=new Set();try{SLEEP_IDS=new Set(JSON.parse(localStorage.getItem('village-sleep-ids')||'[]'))}catch(e){}
function forcedSleep(a){return SLEEP_IDS.has(a.id)}
function asleep(a,st){return forcedSleep(a)||(!AWAKE_ALL&&!AWAKE_IDS.has(a.id)&&st==='idle'&&isOld(a))}
function toggleSleep(id){
  const on=!SLEEP_IDS.has(id);on?SLEEP_IDS.add(id):SLEEP_IDS.delete(id);
  if(on&&AWAKE_IDS.has(id)){AWAKE_IDS.delete(id);try{localStorage.setItem('village-awake-ids',JSON.stringify([...AWAKE_IDS]))}catch(e){}}
  try{localStorage.setItem('village-sleep-ids',JSON.stringify([...SLEEP_IDS]))}catch(e){}
  const a=agents.find(v=>v.id===id);
  toast(on?`💤 「${short(a&&a.title||'',16)}」 재웠어요 (화면에서만 · 일은 그대로 해요)`:`☀ 「${short(a&&a.title||'',16)}」 깨웠어요`);
}
// 「☀ 모두 깨워 두기」: 🏡 메뉴에서 한 번에 (주민마다 고른 것과 따로 기억)
function toggleAwakeAll(){
  AWAKE_ALL=!AWAKE_ALL;try{localStorage.setItem('village-awake',AWAKE_ALL?'1':'0')}catch(e){}
  drawAwakeAll();toast(AWAKE_ALL?'☀ 모두 깨워 두었어요. 쉬어도 자지 않아요':'🌙 모두 원래대로: 오래 쉬면 자요 (따로 깨워 둔 주민은 그대로)');
}
function drawAwakeAll(){const b=document.getElementById('awakeAllBtn');if(b)b.textContent=AWAKE_ALL?'🌙 모두 원래대로 (오래 쉬면 잠)':'☀ 모두 깨워 두기 (쉬어도 안 잠)'}
setTimeout(drawAwakeAll,0);
// 녹화 단추는 🏡 단추(알림 숫자에 따라 길이가 바뀜) 바로 오른쪽에 붙인다 — 편지함 숫자를 가리지 않게
function placeRecBtn(){const h=document.getElementById('hudBtn'),r=document.getElementById('recBtn');if(h&&r)r.style.left=(h.getBoundingClientRect().right+8)+'px'}
setInterval(placeRecBtn,700);addEventListener('resize',placeRecBtn);setTimeout(placeRecBtn,0);
function toggleAwake(id){
  const on=!AWAKE_IDS.has(id);on?AWAKE_IDS.add(id):AWAKE_IDS.delete(id);
  if(on&&SLEEP_IDS.has(id)){SLEEP_IDS.delete(id);try{localStorage.setItem('village-sleep-ids',JSON.stringify([...SLEEP_IDS]))}catch(e){}}
  try{localStorage.setItem('village-awake-ids',JSON.stringify([...AWAKE_IDS]))}catch(e){}
  const a=agents.find(v=>v.id===id);
  toast(on?`☀ 「${short(a&&a.title||'',16)}」 깨워 두었어요. 쉬어도 자지 않아요`:`🌙 「${short(a&&a.title||'',16)}」 오래 쉬면 다시 자요`);
}
// 만나면 인사: 쉬는 주민 둘이 가까워지면 서로 마주 보고 손을 흔든다 (같은 짝은 1분에 한 번)
const GREETED=new Map();
function tryGreet(p,now){
  if(p.trip&&!p.trip.at)return;
  for(const q of people.values()){
    if(q===p||q.leaving||q.dragging||q.talk||(q.greet&&now<q.greet))continue;
    const qs=stateOf(q.agent);if(qs!=='idle'||asleep(q.agent,qs))continue;
    if(Math.hypot(q.x-p.x,q.y-p.y)>17)continue;
    const k=[p.agent.id,q.agent.id].sort().join('|');if(now-(GREETED.get(k)||-1e9)<60000)continue;
    GREETED.set(k,now);
    p.greet=q.greet=now+1900;p.flip=q.x<p.x;q.flip=p.x<q.x;p.moving=q.moving=false;return;
  }
}
// 산책: 30~90초마다 한 번쯤 3명 중 1명꼴로 광장·연못가에 가서 6초 머문다
function strollStep(p,now,home){
  if(!p.nextStroll){p.nextStroll=now+30000+p.r()*60000;return false}
  if(!p.trip){
    if(now<p.nextStroll)return false;
    p.nextStroll=now+40000+p.r()*60000;
    if(p.r()>0.35)return false;
    const t=p.r()<0.6?plazaPoint(p.r):{x:POND.x+(p.r()-.5)*120,y:POND.y-40-p.r()*12};
    p.trip={x:t.x,y:t.y,at:0};
  }
  const t=p.trip;
  if(!t.at){p.tx=t.x;p.ty=t.y;if(Math.hypot(t.x-p.x,t.y-p.y)<2){t.at=now;p.rest='tea'}return true}
  if(now-t.at<6000){p.tx=p.x;p.ty=p.y;return true}
  if(!t.back){t.back=true;p.rest='idle'}
  p.tx=home.x;p.ty=home.y;
  if(Math.hypot(home.x-p.x,home.y-p.y)<2){p.trip=null;p.nextMove=now+4000}
  return true;
}
// 쉬는 주민이 가만히 서 있을 땐 가끔 차를 마시거나 폰을 본다
function restPose(p,now){
  if(p.trip&&p.trip.at&&!p.trip.back)return'tea';
  if(!p.restUntil||now>p.restUntil){const r=p.r();p.rest=r<0.5?'idle':r<0.75?'tea':'phone';p.restUntil=now+7000+p.r()*9000}
  return p.rest||'idle';
}
// 마지막 말에서 첫 문장만 뽑아 짧게 (마크다운·표·링크 걷어 냄)
function firstSentence(s){
  let t=(s||'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\*\*|`|^#+ /gm,'').split('\n').map(x=>x.replace(/^[-*>|\d.\s]+/,'').trim()).filter(x=>x&&!/^[-|:\s]+$/.test(x))[0]||'';
  const m=t.match(/^.*?[.!?。](?=\s|$)/);if(m&&m[0].length>=8)t=m[0];
  return short(t,70);
}
// 「✔ 확인」: 확인 말풍선을 봤다고 표시 → 그 주민에게 새 활동이 생기기 전까지 마우스 올릴 때만 보인다 (이 화면에 기억)
let SEEN={};try{SEEN=JSON.parse(localStorage.getItem('village-alert-seen')||'{}')}catch(e){}
function alertSeen(a){return SEEN[a.id]&&SEEN[a.id]>=(a.lastActivityAt||0)}
function markAlertSeen(id){
  const a=agents.find(v=>v.id===id);if(!a)return;
  SEEN[id]=Math.max(a.lastActivityAt||0,a.neighborBackAt||0)||Date.now();try{localStorage.setItem('village-alert-seen',JSON.stringify(SEEN))}catch(e){}
  toast(`✔ 「${short(a.title,16)}」 확인 — 새 소식이 오면 다시 떠요`);
}
function isOld(a){return a.lastActivityAt&&Date.now()-a.lastActivityAt>3*3600e3}

// 주민 한 명이 지금 할 말 (없으면 null)
function say(p,now){
  const a=p.agent, st=stateOf(a), fresh=now-p.speechAt<12000&&p.speechAt>0;
  if(a.guest)return{text:a.speech,cls:'alert',k:'🏘 이웃 빌리지 손님'};
  if(a.neighborBack&&!(SEEN[a.id]&&SEEN[a.id]>=(a.neighborBackAt||0)))return{text:a.neighborBack,cls:'alert',k:'🏘 이웃 다녀왔어요'};   // 확인받고 돌아와 보고 (✔ 확인으로 숨김)   // 편지 들고 온 손님은 늘 말풍선을 띄운다
  if(fresh&&a.speech&&st!=='wait')return{text:a.speech,cls:'',k:'방금 한 말'};
  if(a.maybeApproval)return{text:'클로드 앱 승인 창을 기다리는 것 같아요 — '+(a.pendingTool||''),cls:'alert',k:'🔐 승인 필요?'};
  if(st==='wait'&&!a.needsAction&&!a.maybeApproval&&reportPending(a))return{text:firstSentence(a.speech),cls:'alert',k:'📣 다 했어요 · 보고'};
  if(st==='wait')return{text:a.needsAction||a.speech||'사장님 답을 기다려요',cls:'alert',k:'확인해 주세요'};
  if(st==='work')return{text:a.doing||'일하는 중',cls:'doing',k:'하는 일'};
  if(p.visitor&&a.speech)return{text:a.speech,cls:'',k:a.guest?'이웃 빌리지 손님':'보고하러 왔어요'};
  return null;
}

let hoverTag=null, HOV={id:null,want:null,since:0};
// 마우스 올림을 바로 바꾸지 않고 잠깐 같은 대상에 머물 때만 바꾼다 → 경계에서 왔다 갔다 깜빡이지 않게
function stableHover(now){
  const raw=(hoverTag&&people.has(hoverTag))?hoverTag:(hoverId&&people.has(hoverId)?hoverId:null);
  if(raw===HOV.id){HOV.want=raw;return HOV.id}
  if(raw!==HOV.want){HOV.want=raw;HOV.since=now}
  if(now-HOV.since>(raw?140:260))HOV.id=raw;   // 다른 주민으로는 0.14초, 비울 때는 0.26초 머물러야 바뀜
  return HOV.id;
}
function placeLabels(now){
  // 지금 마우스가 올라간 주민은 딱 한 명 (이름표·말풍선 위가 우선, 아니면 캔버스 위)
  const hovId=stableHover(now);
  const anyHov=!!hovId;
  const tags=[];
  for(const p of people.values()){
    const a=p.agent, st=stateOf(a), sx=p.x*SCALE, sy=p.y*SCALE;
    const {tag,bub}=p.els;
    const nk=kidsOf(a.id).filter(k=>people.has(k.id)).length;
    const hv=hovId===a.id;
    // 게임 명패: 왼쪽 상태 점 + 이름 + 부하 수. 상관은 금색 테, 마우스 올린 것은 크게·밝게, 나머지는 살짝 흐리게
    const drawing=Object.values(ART.jobs||{}).some(j=>j.sid===a.id&&(j.state==='drawing'||j.state==='cutting'));
    const tagHtml=`<i class="sd ${st}"></i>${drawing?'🎨 ':''}${a.guest?'🏘 ':p.visitor?'🌲 ':''}${a.neighborClone?'<span title="이웃 빌리지에 클론이 가 있어요">🏘</span>':''}${nk?'👑 ':''}<span>${esc(short(a.title,16))}</span>${nk?`<b>+${nk}</b>`:''}`;
    if(tag._html!==tagHtml){tag.innerHTML=tagHtml;tag._html=tagHtml}
    tag.className='tag'+(nk?' lead':'')+(hv?' hov':'')+(anyHov&&!hv?' dim':'');
    const vis=!(p.follower&&!hv&&hovId!==a.parent);
    tag.style.display=vis?'':'none';
    tag._x=sx;tag._y=sy+5;tag._hv=hv;
    if(vis)tags.push(tag);
    const me=say(p,now);
    const hov=hv;
    let show=false, cls='bubble', html='';
    if(!anyHov&&p.talk&&p.talk.phase==='say'){
      // 주민끼리 대화: 받는 주민 옆에 와서 하는 말
      const to=people.get(p.talk.to);
      cls='bubble talk';show=true;html=`<span class="k">→ ${esc(short(to?to.agent.title:'',12))}</span>${esc(p.talk.text)}`;
    }
    else if(!anyHov&&p.letterAt&&now-p.letterAt<2600){cls='bubble mini';show=true;html='📨'}
    else if(hov){
      // 마우스 올린 주민: 크게, 지금 상태 + 요약 + 방금 한 말까지
      cls='bubble big'+(me&&me.cls==='alert'?' alert':'');show=true;
      // 지금 상태 → 마지막에 한 일(마지막 말) → 클로드 앱 요약(최신일 때만, 예전 일 요약이면 뺀다)
      // 작게: 지금 상태 + 마지막에 한 일 한 문장만 (말풍선이 커서 뒤 주민을 가리지 않게)
      const lastDid=firstSentence(a.speech);
      const showLast=lastDid&&!(me&&me.cls!=='doing'&&me.text===a.speech);
      html=(me&&me.k!=='방금 한 말'?`<div class="bk">${esc(me.k)}</div><div class="bt">${esc(short(me.text,70))}</div>`:'')+
        (showLast?`<div class="bk">🕘 마지막에 한 일${a.speechAt?' · '+ago(Date.parse(a.speechAt)):''}</div><div class="bt">${esc(lastDid)}</div>`:'')+
        (!me&&!lastDid?`<div class="bt">아직 기록 없음</div>`:'')+
        (a.neighborClone?`<div class="bk">🏘 ${esc(a.neighborClone)}에 내 클론이 편지 들고 서 있어요 · 확인되면 알려 줄게요</div>`:'')+(a.guest?'<div class="bk">🏘 이웃 빌리지에서 편지 들고 왔어요 · 누르면 읽어요</div>':p.visitor?'<div class="bk">🌲 마을 밖에서 왔어요</div>':'');
    }
    else if(anyHov){show=false}         // 다른 주민에 마우스를 올리고 있으면 나머지 말풍선은 숨긴다
    else if(me&&me.cls==='alert'&&!p.follower&&!alertSeen(a)){
      // 아무 데도 안 올렸을 때는 확인이 필요한 말만 (「✔ 확인」 누르면 새 소식 전까지 마우스 올릴 때만)
      cls='bubble alert';show=true;html=`<span class="k">${esc(me.k)}</span>${esc(short(me.text,80))}<b class="okb" data-ok="${a.id}" title="봤어요 — 새 소식 전까지 말풍선 숨기기">✔ 확인</b>`;
    }
    if(!hov&&!anyHov&&!p.follower){
      // 상관: 따라다니는 부하들의 말을 한 말풍선에 줄줄이
      const lines=[...people.values()].filter(q=>q.follower&&q.agent.parent===a.id).map(q=>({q,s:say(q,now)})).filter(x=>x.s&&x.s.cls==='alert'&&!alertSeen(x.q.agent));
      if(lines.length){
        const mine=me&&me.cls==='alert';
        cls='bubble party alert';show=true;
        html=(mine?`<div class="pl me"><span class="k">${esc(me.k)}</span>${esc(short(me.text,60))}</div>`:'')+
          lines.slice(0,5).map(x=>`<div class="pl ${x.s.cls}" data-id="${x.q.agent.id}"><i></i><b>${esc(short(x.q.agent.title,8))}</b> ${esc(short(x.s.text,44))}</div>`).join('')+
          (lines.length>5?`<div class="pl more">외 ${lines.length-5}명</div>`:'');
      }
    }
    bub.className=cls+(show?'':' faint')+(anyHov&&!hov?' dim':'')+(hov?' hov':'');
    if(show&&bub._html!==html){bub.innerHTML=html;bub._html=html}
    // 말풍선이 화면 밖으로 잘리지 않게 가장자리에서 안쪽으로 당긴다
    const half=(bub.offsetWidth||190)/2+4;
    bub.style.left=Math.max(half,Math.min(W*SCALE-half,sx))+'px';bub.style.top=Math.max((bub.offsetHeight||40)+2,sy-((p.h||24)+2)*SCALE)+'px';
    // 마우스를 올린 주민의 말풍선·이름표는 다른 말풍선보다 늘 앞에 (뒤에 깔리면 못 읽는다)
    bub.style.zIndex=hov?5000:Math.round(p.y);tag.style.zIndex=hov?4999:Math.round(p.y);
  }
  // 이름표 겹침 풀기: 위에서부터 놓으면서, 이미 놓인 것과 겹치면 아래로 한 칸씩 비킨다 (마우스 올린 것은 제자리 우선)
  tags.sort((a,b)=>(b._hv-a._hv)||(a._y-b._y)||(a._x-b._x));
  const placed=[];
  for(const t of tags){
    const w=(t.offsetWidth||80), h=(t.offsetHeight||20);
    let y=t._y;
    for(let k=0;k<6;k++){
      const hit=placed.find(r=>Math.abs(r.x-t._x)<(r.w+w)/2+2&&Math.abs(r.y-y)<(r.h+h)/2+1);
      if(!hit)break;
      y=hit.y+(hit.h+h)/2+2;
    }
    placed.push({x:t._x,y,w,h});
    t.style.left=t._x+'px';t.style.top=y+'px';
  }
}

// ---------- 우클릭 메뉴 ----------
const menu=document.getElementById('menu');
function showMenu(x,y,id){
  {const g=byId(id);if(g&&g.guest){openGuest(g);return}}
  const a=agents.find(v=>v.id===id);if(!a)return;
  menu.innerHTML=`<div class="mhd">${esc(short(a.title,22))}</div>`+
    (a.visiting?`<button data-act="dismiss" class="hi">✔ 확인했어 · 마을 밖으로 돌려보내기</button>`:'')+
    `<button data-act="open">💬 대화 열기</button>`+
    `<button data-act="rename">✏️ 이름 바꾸기</button>`+
    `<button data-act="art">🎨 캐릭터 만들기·바꾸기</button>`+
    (a.id===mail.relayId?'':(a.engine&&a.engine!=='claude'?'':`<div class="mrow">🧠 모델 ${MODEL_KEYS.map(k=>`<span class="mchip${modelKey(a.model)===k?' on':''}" data-model="${k}">${MODEL_NAMES[k]}</span>`).join('')}</div>`)+
      `<div class="mrow">💪 노력도 ${EFFORTS.map(k=>`<span class="mchip${a.effort===k?' on':''}" data-effort="${k}">${EFFORT_NAMES[k]}</span>`).join('')}</div>`)+
    (stateOf(a)==='wait'?`<button data-act="seen">${alertSeen(a)?'🔔 확인 말풍선 다시 띄우기':'✔ 확인 · 말풍선 숨기기 (마우스 올리면 보임)'}</button>`:'')+
    (NB.enabled?`<button data-act="share">${(NB.share||[]).includes(a.id)?'🏘 이웃에게 공개 그만':'🏘 이웃에게 공개 (이름만 보임 · 부탁 받을 수 있음)'}</button>`:'')+
    `<button data-act="sleep">${SLEEP_IDS.has(a.id)?'☀ 그만 재우기 (원래대로)':'💤 재우기 (화면에서만 · 일은 계속)'}</button>`+
    `<button data-act="awake">${AWAKE_ALL?'☀ (지금 모두 깨워 둔 상태) ':''}${AWAKE_IDS.has(a.id)?'🌙 다시 재우기 (오래 쉬면 잠)':'☀ 깨워 두기 (쉬어도 안 잠)'}</button>`+
    `<button data-act="boss">🎖 상관 고르기</button>`+
    `<button data-act="pick">👥 부하 고르기</button>`+
    (kidsOf(a.id).length?`<button data-act="freeAll">📍 부하 모두 떼어 놓기</button><button data-act="followAll">🚶 부하 모두 붙이기</button>`:'')+
    `<button data-act="spawn">👶 부하 새로 만들기</button>`+
    (a.parent?((a.pos&&a.pos.free)?`<button data-act="follow">🚶 상관 따라다니기</button>`:`<button data-act="free">📍 이 자리에 따로 두기</button>`)+`<button data-act="unparent">↖ 상관에게서 떼기</button>`:'')+
    (a.link&&!a.native?`<button data-act="claude">↗ 클로드 앱에서 열기</button>`:'')+
    (a.inside?`<button data-act="out">🚪 마을 밖으로 내보내기</button>`:`<button data-act="in">🏡 ${a.visiting?'마을에 계속 머물게 하기':'마을로 들이기'}</button>`)+
    (a.id===mail.relayId?`<div class="sep"></div><div class="mhd">마을 관리소(우체부)는 보관·삭제할 수 없어요</div>`:
    `<div class="sep"></div><button data-act="archive">📦 보관하기 <small>(되살릴 수 있음)</small></button>`+
    `<button data-act="delete" class="danger">🗑 삭제 <small>(되돌릴 수 없음)</small></button>`);
  menu.style.display='block';
  const mw=menu.offsetWidth, mh=menu.offsetHeight;
  menu.style.left=Math.max(6,Math.min(x,innerWidth-mw-6))+'px';menu.style.top=Math.max(6,Math.min(y,innerHeight-mh-6))+'px';
  menu.onclick=e=>{
    if(e.target.dataset.model||e.target.dataset.effort){e.stopPropagation();setBrain(id,e.target.dataset.model?'model':'effort',e.target.dataset.model||e.target.dataset.effort);return}
    const act=e.target.dataset.act;if(!act)return;
    if(act==='rename'){e.stopPropagation();showRename(id);return}
    hideMenu();
    if(act==='open')openPanel(id);
    if(act==='awake')toggleAwake(id);
    if(act==='sleep')toggleSleep(id);
    if(act==='share'){const on=!(NB.share||[]).includes(id);mbPost('/api/neighbor/share',{id,on}).then(r=>{toast(r.ok?(on?'🏘 이웃에게 공개했어요':'공개를 그만했어요'):'못 했어요: '+(r.error||''));pollNeighborOnce()})}
    if(act==='seen'){if(alertSeen(a)){delete SEEN[id];try{localStorage.setItem('village-alert-seen',JSON.stringify(SEEN))}catch(e){}}else markAlertSeen(id)}
    if(act==='pick')startPick(id);
    if(act==='art')openArt(id);
    if(act==='claude')openInClaude(a);
    if(act==='freeAll')freeKids(id,true);
    if(act==='followAll')freeKids(id,false);
    if(act==='free'||act==='follow'){const p=people.get(id);const free=act==='free';
      if(free&&p){a.pos={x:p.x,y:p.y,free:true};p.home={x:p.x,y:p.y};savePos(id,p.x,p.y,true);toast('이 자리에 따로 두었습니다')}
      else{a.pos=null;savePos(id,0,0,false);toast('다시 상관을 따라다닙니다')}}
    if(act==='spawn')askSpawn(id);
    if(act==='dismiss')dismissVisitor(id);
    if(act==='boss')startBossPick(id);
    if(act==='archive')askRemove(id,'archive');
    if(act==='delete')askRemove(id,'delete');
    if(act==='unparent')setParent(id,null);
    if(act==='out')setInside(id,false);
    if(act==='in')setInside(id,true);
  };
}
// 메뉴 안에서 바로 새 이름을 쓴다(앱 창은 브라우저 입력 상자를 띄우지 못한다).
// 우체부가 클로드 앱의 세션 제목을 바꾸고, 다음 새로고침 때 이름표도 바뀐다.
function showRename(id){
  const a=agents.find(v=>v.id===id);if(!a)return;
  menu.innerHTML=`<div class="mhd">새 이름</div>`+
    `<input id="rnText" maxlength="120" style="width:100%;box-sizing:border-box;font:inherit;font-size:14px;padding:6px 8px;border:2px solid var(--line);border-radius:6px;margin:2px 0 4px">`+
    `<div id="rnNote" style="font-size:12px;opacity:.7;padding:0 4px 4px"></div>`+
    `<button data-act="ok">✔ 바꾸기</button><button data-act="cancel">취소</button>`;
  const box=document.getElementById('rnText'), note=document.getElementById('rnNote');
  // 입력칸이 들어가 메뉴가 길어졌으니 화면 밖으로 넘치지 않게 다시 맞춘다
  menu.style.top=Math.max(6,Math.min(parseFloat(menu.style.top)||0,innerHeight-menu.offsetHeight-6))+'px';
  menu.style.left=Math.max(6,Math.min(parseFloat(menu.style.left)||0,innerWidth-menu.offsetWidth-6))+'px';
  box.value=a.title||'';box.focus();box.select();
  const go=async()=>{
    const title=box.value.trim().replace(/\s+/g,' ');
    if(!title||title===a.title){hideMenu();return}
    box.disabled=true;note.textContent='우체부에게 맡기는 중…';
    try{
      const r=await fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:id,kind:'rename',title})});
      const j=await r.json();if(!r.ok)throw new Error(j.error||'실패');
      if(j.alias)note.textContent='마을 이름표를 바꾸는 중…';
      else if(!j.mail||!j.mail.alive)note.textContent='우체부가 쉬고 있어 「마을 관리소」 세션이 열리면 바뀝니다';
      else note.textContent='바꾸는 중…';
      for(let i=0;i<60;i++){
        await new Promise(r=>setTimeout(r,1500));
        const rc=await (await fetch('/api/receipt/'+j.id)).json();
        if(rc.pending)continue;
        if(rc.ok){a.title=title;sync(agents);poll(true);note.textContent=j.alias?'바꿨습니다 (마을 이름표 · 클로드 앱 제목은 그대로)':'바꿨습니다';setTimeout(hideMenu,1400)}
        else{note.textContent='못 바꿨습니다: '+(rc.error||'');box.disabled=false}
        return;
      }
      note.textContent='우체부가 답이 없습니다(대기열에 남아 있음)';
    }catch(err){note.textContent='보내기 실패: '+err.message;box.disabled=false}
  };
  box.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'&&!e.isComposing){e.preventDefault();go()}if(e.key==='Escape')hideMenu()});
  menu.onclick=e=>{e.stopPropagation();const act=e.target.dataset.act;if(act==='ok')go();if(act==='cancel')hideMenu()};
}
function hideMenu(){menu.style.display='none'}
addEventListener('click',e=>{if(!menu.contains(e.target))hideMenu()});
addEventListener('keydown',e=>{if(e.key==='Escape'){hideMenu();closePanel();closeOutside()}});

const joining=new Set();
async function setInside(id,inside){
  const a=agents.find(v=>v.id===id);if(a)a.inside=inside;
  if(inside)joining.add(id);
  if(!inside&&openId===id)closePanel();
  sync(agents);
  try{await fetch('/api/member',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,inside})})}catch(e){}
  poll(true);
}

// 누른 점이 그림의 실제 칠해진 부분인지 (투명한 빈 곳이면 뒤 주민을 고른다)
const ALPHA=new Map();
function alphaAt(d,x,y){
  const im=d.im;if(!im||!im.naturalWidth)return true;
  let m=ALPHA.get(im.src);
  if(!m){
    try{const c=document.createElement('canvas');const W=Math.min(160,im.naturalWidth),H=Math.round(im.naturalHeight*W/im.naturalWidth);c.width=W;c.height=H;
      const g=c.getContext('2d');g.drawImage(im,0,0,W,H);m={W,H,a:g.getImageData(0,0,W,H).data}}catch(e){m={W:0}}
    ALPHA.set(im.src,m);
  }
  if(!m.W)return true;
  let u=(x-d.x)/d.w;if(d.flip)u=1-u;const v=(y-d.y)/d.h;
  const px=Math.floor(u*m.W), py=Math.floor(v*m.H);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){   // 가장자리 한 칸 여유
    const X=px+dx,Y=py+dy;if(X<0||Y<0||X>=m.W||Y>=m.H)continue;
    if(m.a[(Y*m.W+X)*4+3]>40)return true;
  }
  return false;
}
function pickAt(e){
  const b=cv.getBoundingClientRect(), x=(e.clientX-b.left)/SCALE, y=(e.clientY-b.top)/SCALE;
  // 1) 그림 주민: 앞에 그려진(아래쪽) 주민부터, 실제로 칠해진 부분을 누른 주민
  const front=[...people.entries()].filter(([,p])=>p.drawn).sort((a,c)=>c[1].y-a[1].y);
  for(const [id,p] of front){const d=p.drawn;if(x>=d.x&&x<=d.x+d.w&&y>=d.y&&y<=d.y+d.h&&alphaAt(d,x,y))return id}
  // 2) 칠해진 곳은 아니지만(다리 사이 등) 그림 칸 안이면, 가운데가 가장 가까운 주민
  let near=null,nd=1e9;
  for(const [id,p] of front){const d=p.drawn;if(x>=d.x&&x<=d.x+d.w&&y>=d.y&&y<=d.y+d.h){const k=Math.abs(x-(d.x+d.w/2));if(k<nd){nd=k;near=id}}}
  if(near)return near;
  let best=null,bd=14;
  for(const [id,p] of people){if(p.drawn)continue;const h=p.h||24;if(Math.abs(p.x-x)<Math.max(7,h*0.28)&&y<p.y+2&&y>p.y-h){const d=Math.hypot(p.x-x,p.y-h/2-y);if(d<bd+h){bd=d-h;best=id}}}
  return best;
}
let hoverId=null;
cv.addEventListener('mousemove',e=>{if(!drag)hoverId=pickAt(e)});
cv.addEventListener('mouseleave',()=>hoverId=null);
cv.addEventListener('contextmenu',e=>{e.preventDefault();const id=pickAt(e);if(id)showMenu(e.clientX,e.clientY,id)});

// ---------- 끌어서 옮기기 ----------
// 주민(또는 이름표)을 누른 채 끌면 옮겨지고, 놓은 자리가 그 주민의 새 자리가 된다.
// 끌지 않고 떼면 그냥 누른 것으로 보고 대화창을 연다.
let drag=null;
function worldXY(e){const b=cv.getBoundingClientRect();return{x:(e.clientX-b.left)/SCALE,y:(e.clientY-b.top)/SCALE}}
function startDrag(e,id){
  if(e.button!==0)return;
  e.preventDefault();
  drag={id,sx:e.clientX,sy:e.clientY,moved:false,fromDock:!people.has(id)};
}
cv.addEventListener('mousedown',e=>{
  e.preventDefault();   // 빈 곳을 끌어도 글자 선택이 시작되지 않게
  const w=worldXY(e);
  if(mailbox.enabled&&Math.abs(w.x-POST.x)<11&&w.y>POST.y-36&&w.y<POST.y+3){openMailbox();return}
  const id=pickAt(e);if(id){startDrag(e,id);return}
  // 주민이 아닌 빈 마을을 누르면 열려 있던 창들을 닫는다
  closePanel();closeOutside();document.getElementById('hud').classList.remove('open');hideMenu();
  if(orgOpen)toggleOrg()});   // 세션 목록도 접는다
addEventListener('mousemove',e=>{
  if(!drag)return;
  if(!drag.moved&&Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)<5)return;
  drag.moved=true;document.body.classList.add('dragging');
  if(drag.fromDock){ghost(e);return}
  const p=people.get(drag.id);if(!p)return;
  const w=worldXY(e);p.dragging=true;p.x=Math.max(6,Math.min(W-6,w.x));p.y=Math.max(22,Math.min(H-2,w.y+10));
});
addEventListener('mouseup',e=>{
  if(!drag)return;
  const d=drag;drag=null;document.body.classList.remove('dragging');hideGhost();
  if(!d.moved){openPanel(d.id);return}
  const w=worldXY(e);
  const inMap=w.x>=0&&w.x<=W&&w.y>=0&&w.y<=H;
  if(d.fromDock){
    if(!inMap)return;
    const x=Math.max(6,Math.min(W-6,w.x)), y=Math.max(22,Math.min(H-2,w.y+10));
    const a=agents.find(v=>v.id===d.id);if(a)a.pos={x,y};
    dropped.add(d.id);setInside(d.id,true);savePos(d.id,x,y);return;
  }
  const p=people.get(d.id);if(!p)return;
  if(p.follower){
    // 따라다니던 부하를 끌어다 놓으면 그 자리에 따로 둔다 (상관·부하 관계는 그대로)
    p.dragging=false;p.home={x:p.x,y:p.y};p.tx=p.x;p.ty=p.y;p.follower=false;p.nextMove=performance.now()+4000;
    p.agent.pos={x:p.x,y:p.y,free:true};p.justDropped=true;setTimeout(()=>p.justDropped=false,6000);
    savePos(d.id,p.x,p.y,true);toast('이 자리에 따로 두었습니다. 다시 따라다니게 하려면 우클릭 → 🚶 상관 따라다니기');return}
  p.dragging=false;p.home={x:p.x,y:p.y};p.tx=p.x;p.ty=p.y;p.nextMove=performance.now()+4000;
  p.justDropped=true;setTimeout(()=>p.justDropped=false,6000);
  // 떼어 놓은 부하를 옮길 때도 「따로 두기」 표시를 지켜야 한다 (빠지면 다시 상관에게 붙어 버린다)
  const keepFree=!!p.agent.parent;
  p.agent.pos={x:p.x,y:p.y,...(keepFree?{free:true}:{})};
  savePos(d.id,p.x,p.y,keepFree?true:undefined);
});
function savePos(id,x,y,free){fetch('/api/pos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,x,y,free})}).catch(()=>{})}
const dropped=new Set();
const ghostEl=document.getElementById('ghost');
function ghost(e){
  const a=agents.find(v=>v.id===drag.id);if(!a)return;
  if(ghostEl.dataset.id!==a.id){ghostEl.dataset.id=a.id;ghostEl.innerHTML='';ghostEl.append(avatarCanvas(a.id,3))}
  ghostEl.style.display='block';ghostEl.style.left=e.clientX+'px';ghostEl.style.top=e.clientY+'px';
}
function hideGhost(){ghostEl.style.display='none';ghostEl.dataset.id=''}

// 주민 얼굴 그림 한 장 (아이콘·끌기용). 마을 캔버스와 같은 그리기 함수를 빌려 쓴다.
function avatarCanvas(id,scale){
  const spr=sprite(id);
  if(spr&&spr.portrait.complete){const im=new Image();im.src=spr.portrait.src;im.className='portrait';im.style.width=16*scale+'px';im.style.height=24*scale+'px';return im}
  const c=document.createElement('canvas');c.width=16;c.height=24;
  c.style.width=16*scale+'px';c.style.height=24*scale+'px';
  const save=ctx;ctx=c.getContext('2d');drawGirl(8,23,lookOf(id),false,false);ctx=save;
  return c;
}

// ---------- 마을 밖 아이콘 몇 개 ----------
const DOCK_MAX=6;
function renderDock(){
  const outs=agents.filter(a=>!a.inside&&!a.visiting);
  const rank=a=>(a.needsAction?2:0)+(a.working?1:0);
  const pick=[...outs].sort((a,b)=>rank(b)-rank(a)||(b.lastActivityAt||0)-(a.lastActivityAt||0)).slice(0,DOCK_MAX);
  const dock=document.getElementById('dock');
  const key=pick.map(a=>a.id+rank(a)).join()+outs.length;
  if(dock.dataset.key===key)return;dock.dataset.key=key;
  dock.innerHTML='';
  for(const a of pick){
    const b=document.createElement('div');b.className='dk';b.title=a.title+' — 끌어다 마을에 놓으면 들어옵니다';
    b.append(avatarCanvas(a.id,2));
    if(a.needsAction||a.working){const s=document.createElement('i');s.style.background=a.needsAction?'var(--alert)':'var(--work)';b.append(s)}
    const n=document.createElement('span');n.textContent=short(a.title,6);b.append(n);
    b.onmousedown=e=>startDrag(e,a.id);
    b.oncontextmenu=e=>{e.preventDefault();showMenu(e.clientX,e.clientY,a.id)};
    dock.append(b);
  }
  if(outs.length>pick.length){
    const m=document.createElement('div');m.className='dk more';m.textContent='+'+(outs.length-pick.length);m.title='마을 밖 전체 보기';
    m.onclick=toggleOutside;dock.append(m);
  }
}

// ---------- 마을 밖 목록 ----------
let outOpen=false;
function toggleOutside(){outOpen=!outOpen;document.getElementById('outside').classList.toggle('open',outOpen);if(outOpen)renderOutside()}
function closeOutside(){outOpen=false;document.getElementById('outside').classList.remove('open')}
window.toggleOutside=toggleOutside;
function renderOutside(){
  const list=agents.filter(a=>!a.inside);
  const box=document.getElementById('outList');
  box.innerHTML=list.length?list.map(a=>{
    const st=a.working?'<span class="pill" style="background:var(--work)">일하는 중</span>':a.needsAction?'<span class="pill" style="background:var(--alert)">기다림</span>':'';
    return `<div class="orow" data-id="${a.id}" title="우클릭: 메뉴">
      <div class="ot">${st}${esc(short(a.title,30))}</div>
      <div class="os">${esc(short(a.summary,60))||'&nbsp;'}</div>
      <div class="ob">🎖 상관: <span class="bosslink" data-boss="${a.id}" title="눌러서 상관 바꾸기">${a.parent?esc(short(nameOf(a.parent),18)):'없음'} ✎</span>${kidsOf(a.id).length?` · 부하 ${kidsOf(a.id).length}명`:''}</div>
      <div class="oa"><span>${ago(a.lastActivityAt)}</span><button data-in="${a.id}">🏡 들이기</button></div></div>`;
  }).join(''):'<div style="opacity:.6;padding:12px">마을 밖에 아무도 없어요</div>';
  box.querySelectorAll('[data-in]').forEach(b=>b.onclick=e=>{e.stopPropagation();setInside(b.dataset.in,true)});
  box.querySelectorAll('.bosslink').forEach(b=>b.onclick=e=>{e.stopPropagation();startBossPick(b.dataset.boss)});
  box.querySelectorAll('.orow').forEach(r=>{
    r.oncontextmenu=e=>{e.preventDefault();showMenu(e.clientX,e.clientY,r.dataset.id)};
    r.onclick=()=>openPanel(r.dataset.id);
  });
}

// ---------- 옆 창 ----------
let openId=null;
function openPanel(id){
  {const g=byId(id);if(g&&g.guest){openGuest(g);return}}
  {const a0=byId(id);if(a0&&a0.locked){toast('촬영 중에는 이 주민의 대화창을 열 수 없어요');return}}if(openId!==id){attach=[];renderAttach()}openId=id;renderPanel();document.getElementById('panel').classList.add('open')}
function closePanel(){openId=null;document.getElementById('panel').classList.remove('open')}
window.closePanel=closePanel;
function renderPanel(){
  const a=byId(openId);if(!a)return;
  const st=stateOf(a);
  const pill={work:['일하는 중','var(--work)'],wait:['사장님 기다림','var(--alert)'],stall:['멈춤','#888'],idle:['쉬는 중','var(--idle)']}[st];
  document.getElementById('pTitle').textContent=a.title;
  const av=document.getElementById('pAva');
  if(av.dataset.id!==a.id||av.dataset.st!==st){
    // 대화창 머리에 그 주민 그림 (확인을 기다리면 손 든 모습)
    av.dataset.id=a.id;av.dataset.st=st;av.innerHTML='';
    if(sprite(a.id)){const im=new Image();im.src=sprite(a.id).portrait.src;im.className='portrait';im.style.width='76px';im.style.height='90px';av.append(im)}
    else{
    const c=document.createElement('canvas');c.width=22;c.height=30;c.style.width='66px';c.style.height='90px';
    const save=ctx;ctx=c.getContext('2d');drawGirl(9,29,lookOf(a.id),false,false,st==='wait',600);ctx=save;
    av.append(c);
    }
  }
  document.getElementById('pMeta').innerHTML=`<span class="pill" style="background:${pill[1]}">${pill[0]}</span>${a.inside?'':'<span class="pill" style="background:#8a7a9a">마을 밖</span>'}${a.native?'<span class="pill" style="background:#7b5fb8">마을이 직접 돌림</span>':''}${a.engine==='codex'?'<span class="pill" style="background:#333">코덱스</span>':a.engine==='gemini'?'<span class="pill" style="background:#4a6fd8">제미나이</span>':''}${a.engine&&a.engine!=='claude'?'':esc(MODEL_NAMES[modelKey(a.model)]||a.model)}${a.effort?' · 노력도 '+esc(EFFORT_NAMES[a.effort]||a.effort):''} · ${a.turns}턴 · ${ago(a.lastActivityAt)}${a.queued?` · 대기 지시 ${a.queued}개`:''}${a.tokens&&a.tokens.week?`<br>🪙 토큰 오늘 <b>${kn(a.tokens.today)}</b> (출력 ${kn(a.tokens.todayOut)}) · 7일 <b>${kn(a.tokens.week)}</b> (출력 ${kn(a.tokens.weekOut)}) · 💰 ${moneyLine(a,true)}`:''}`;
  document.getElementById('pInfo').innerHTML=
    (a.summary?`<div class="irow"><span class="ik">📋 요약</span><span class="iv">${esc(clean(a.summary))}</span></div>`:'')+
    (a.doing?`<div class="irow"><span class="ik">🔨 마지막 한 일</span><span class="iv">${esc(a.doing)}</span></div>`:'')+
    (a.needsAction?`<div class="irow warn"><span class="ik">❗ 사장님 할 일</span><span class="iv">${esc(a.needsAction)}</span></div>`:'')+
    (a.maybeApproval?`<div class="visit" style="border-color:var(--alert);background:#ffe6e1">🔐 클로드 앱의 승인 창을 기다리는 것 같아요 (${esc(a.pendingTool||'')}). 승인은 클로드 앱 화면에서만 누를 수 있어요.</div>`:'')+
    (a.link&&!a.native?`<div class="iopen"><button class="mini" id="pClaude">↗ 클로드 앱에서 이 세션 열기</button></div>`:'')+
    (a.visiting?`<div class="visit">🌲 마을 밖에서 할 말이 있어 들어왔어요 <button class="mini" id="pDismiss">✔ 확인했어 · 돌려보내기</button><button class="mini" id="pStay">🏡 계속 머물게</button></div>`:'')+
    (a.runs?`<div class="runs">📅 <b>매일 작업</b> · 지난 회차 ${a.runs.length}개${a.olderWaiting?` <span style="color:var(--alert)">(그중 ${a.olderWaiting}개가 확인 기다림)</span>`:''}
      <button class="mini" id="pRunsToggle">보기</button><button class="mini" id="pRunsArchive">📦 지난 회차 보관</button>
      <div id="pRuns" style="display:none">${a.runs.map(r=>`<div class="run" data-run="${r.id}">${r.needsAction?'❗':'·'} ${ago(r.lastActivityAt)} — ${esc(short(r.needsAction||r.summary||r.title,60))}</div>`).join('')}</div></div>`:'')+
    (a.hiddenRun?`<div class="runs">📅 지난 회차입니다. <button class="mini" id="pRunHead">최근 회차로</button></div>`:'')+
    teamHtml(a)+`<div class="ipath" title="${esc(a.cwd)}">📁 ${esc(a.cwd)}</div>`;
  bindTeam();
  const pc=document.getElementById('pClaude');if(pc)pc.onclick=()=>openInClaude(a);
  const rt=document.getElementById('pRunsToggle');if(rt)rt.onclick=()=>{const d=document.getElementById('pRuns');d.style.display=d.style.display==='none'?'block':'none'};
  document.querySelectorAll('#pRuns [data-run]').forEach(r=>r.onclick=()=>openPanel(r.dataset.run));
  const rh=document.getElementById('pRunHead');if(rh)rh.onclick=()=>openPanel(a.runOf);
  const ra=document.getElementById('pRunsArchive');if(ra)ra.onclick=()=>archiveRuns(a);
  const pd=document.getElementById('pDismiss');if(pd)pd.onclick=()=>dismissVisitor(a.id);
  const ps=document.getElementById('pStay');if(ps)ps.onclick=()=>setInside(a.id,true);
  const log=document.getElementById('log');
  const mine=(sent[a.id]||[]).filter(o=>!o.landed);
  // 3초마다 새로 그리더라도 내용이 같으면 손대지 않고, 바뀌어도 사장님이 위를 보고 있으면 그 자리를 지킨다
  // 「⬆ 이전 대화 더 보기」로 불러온 옛 대화가 있으면 그 뒤에 새 대화를 이어 붙인다
  const H=HIST[a.id], key=m=>(m.at||'')+'|'+m.who+'|'+(m.text||'').slice(0,60);
  let recent=a.recent||[];
  if(H){const seen=new Set(H.list.map(key));recent=H.list.concat(recent.filter(m=>!seen.has(key(m))))}
  const moreBtn=(H?H.more:recent.length>=16)?`<button class="histmore" data-hist="1">${H&&H.busy?'불러오는 중…':'⬆ 이전 대화 더 보기'}</button>`:'';
  const html=moreBtn+(recent.map(m=>m.who==='file'?fileChips(m.files):`<div class="msg ${m.who}">${m.who==='boss'?esc(bossText(m.text)):linkText(m.text)}</div>`).join('')||
      `<div style="opacity:.6">${a.inside||a.visiting?'아직 대화가 없어요':'마을 밖 주민은 대화를 불러오지 않아요. 마을로 들이면 보입니다.'}</div>`)+
    mine.map((o,i)=>`<div class="msg boss ${o.state==='sent'?'':'sending'}">${esc(o.text)}<span class="st">${esc(o.note)}${o.state==='sent'?` <b class="sentx" data-sentx="${i}" title="이 표시 지우기 (메시지는 이미 전해졌어요)">✕</b>`:''}</span></div>`).join('');
  if(!log._histBound){log._histBound=1;log.addEventListener('click',e=>{if(e.target.closest('[data-hist]'))loadOlder(log._id)})}
  if(log._html!==html||log._id!==a.id){
    const atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<40, prev=log.scrollTop, fresh=log._id!==a.id;
    log.innerHTML=html;log._html=html;log._id=a.id;
    if(fresh||atBottom||log._jump){log.scrollTop=log.scrollHeight;log._jump=false}else log.scrollTop=prev;
  }
  document.getElementById('oSend').disabled=!mail.alive&&!a.native;
  // 일하는 중일 때만: 기다리지 않고 하던 일을 끊고 바로 읽게
  const on=document.getElementById('oNow');on.style.display=a.working&&a.id!==mail.relayId?'block':'none';on.disabled=!mail.alive&&!a.native;
  const nk=kidsOf(a.id).length;
  document.getElementById('teamWrap').style.display=nk?'block':'none';
  document.getElementById('teamN').textContent=nk;
  document.getElementById('oNote').textContent=mail.alive
    ?'우체부가 이 세션에 전달합니다. 일하는 중이면 지금 일이 끝난 뒤 이어서 처리합니다.'
    :'우체부가 쉬고 있어 보낼 수 없습니다. 클로드 앱에서 「마을 관리소」 세션이 열려 있어야 합니다.';
}
function ago(ms){if(!ms)return'';const m=Math.round((Date.now()-ms)/60000);return m<1?'방금':m<60?m+'분 전':m<1440?Math.round(m/60)+'시간 전':Math.round(m/1440)+'일 전'}

// ---------- 지시 보내기 ----------
const sent={};          // 세션 id → [{id,text,state,note,landed}]
let mail={alive:false};
async function sendOrder(now){
  const box=document.getElementById('oText'), to=openId;
  let text=box.value.trim();
  if((!text&&!attach.length)||!to)return;
  if(attach.length){
    const paths=[], files=attach;attach=[];renderAttach();
    for(const f of files){
      const r=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name,data:f.data})});
      const j=await r.json();if(j.path)paths.push(j.path);else{attach=files;renderAttach();toast('첨부 실패: '+(j.error||f.name));return}
    }
    text=(text||'첨부한 파일을 봐 주세요.')+'\n\n[첨부 파일 — Read 도구로 열어 보세요]\n'+paths.join('\n');
  }
  box.value='';growBox();
  const o={text,state:'sending',note:'우체부에게 맡기는 중…',landed:false};
  (sent[to]=sent[to]||[]).push(o);document.getElementById('log')._jump=true;renderPanel();
  {const q=people.get(to);if(q)q.wave=performance.now()+2600}   // 지시 받은 주민이 손을 흔든다
  try{
    const r=await fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to,text,now:now===true,team:kidsOf(to).length>0&&document.getElementById('oTeam').checked})});
    const j=await r.json();
    if(!r.ok)throw new Error(j.error||'실패');
    o.id=j.id;o.note='전달 대기 중…';renderPanel();
    for(let i=0;i<60;i++){
      await new Promise(r=>setTimeout(r,1500));
      const rc=await (await fetch('/api/receipt/'+o.id)).json();
      if(rc.pending)continue;
      if(rc.ok){o.state='sent';o.note=rc.stop?'하던 일을 멈추고 바로 전달함':/queued/i.test(rc.detail||'')?'전달됨 · 그 세션이 하던 일을 끝내면 읽어요':'전달됨';}
      else{o.state='fail';o.note='전달 실패: '+(rc.error||'');box.value=box.value||text}
      renderPanel();return;
    }
    o.note='우체부가 답이 없습니다 (아직 대기열에 있음)';renderPanel();
  }catch(e){o.state='fail';o.note='보내기 실패: '+e.message;box.value=box.value||text;renderPanel()}
}
document.getElementById('oSend').onclick=()=>sendOrder(false);
document.getElementById('oNow').onclick=()=>{
  const a=byId(openId);
  if(a&&!confirm(`「${a.title}」이(가) 하던 일을 멈추고 이 말을 바로 읽게 할까요?`))return;
  sendOrder(true);
};
document.getElementById('oText').addEventListener('keydown',e=>{
  // 엔터 = 보내기, 쉬프트+엔터 = 줄바꿈. 한글을 조합하는 중의 엔터는 글자 확정이라 보내지 않는다
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();sendOrder()}
});

// 보낸 지시가 대화 기록에 들어오면 임시 말풍선을 지운다
document.addEventListener('click',e=>{
  const x=e.target.closest('[data-sentx]');if(!x||!openId)return;
  const mine=(sent[openId]||[]).filter(o=>!o.landed);const o=mine[+x.dataset.sentx];if(o){o.landed=true;renderPanel()}
});
function markLanded(a){
  for(const o of sent[a.id]||[]){
    if(o.landed||o.state!=='sent')continue;
    if((a.recent||[]).some(m=>m.who==='boss'&&m.text.includes(o.text.slice(0,40))))o.landed=true;
  }
}

// ---------- 크기 맞추기·불러오기 ----------
function fit(){
  // 폰 세로 화면: 지도를 화면 높이에 맞추고 옆으로 밀어서 본다 (가로에 맞추면 너무 작다)
  const portrait=innerWidth<760&&innerHeight>innerWidth;
  const stage=document.getElementById('stage');
  if(portrait){
    SCALE=Math.max(1,(innerHeight-170)/H);
    stage.classList.add('pan');
    requestAnimationFrame(()=>{if(!stage._centered){stage.scrollLeft=(W*SCALE-innerWidth)/2;stage._centered=true}});
  }else{
    stage.classList.remove('pan');
    SCALE=Math.max(1,Math.min(innerWidth/W,innerHeight/H));
  }
  cv.style.width=W*SCALE+'px';cv.style.height=H*SCALE+'px';
  const wrap=document.getElementById('wrap');wrap.style.width=W*SCALE+'px';wrap.style.height=H*SCALE+'px';
}
addEventListener('resize',fit);fit();

let pollTimer=null;
let pollGen=0;
async function poll(once){
  // 다른 곳에서 poll(true) 로 당겨 부르면 이전 고리는 여기서 끊는다 (안 그러면 고리가 겹쳐 쌓여 요청이 폭증한다)
  clearTimeout(pollTimer);
  const g=++pollGen;
  try{
    const r=await fetch('/api/agents');const j=await r.json();
    mail=j.mail||{alive:false};
    document.getElementById('hudMail').textContent=mail.alive?'':'우체부 쉼';
    document.getElementById('mail').innerHTML=mail.alive?'📮 우체부 근무 중 — 지시 보낼 수 있음':'📭 우체부 쉬는 중 — 지켜보기만 됨';
    document.body.classList.toggle('film',!!j.film);FILM_ON=!!j.film;
    USAGE=j.usage;HIDDEN=new Set(((j.usage||{}).settings||{}).hiddenIds||[]);j.agents.forEach(markLanded);sync(j.agents);renderUsage(j.usage);
  }catch(e){}
  if(g===pollGen)pollTimer=setTimeout(poll,3000);
}
poll();requestAnimationFrame(frame);


// ---------- 지휘체계 ----------
// 상관(parent) ← 부하. 기본은 클로드 앱 기록상 "이 세션을 띄운 세션"이 상관이고, 사장님이 바꾸면 그게 이긴다.
const byId=id=>allAgents.find(a=>a.id===id)||agents.find(a=>a.id===id);
const kidsOf=id=>agents.filter(a=>a.parent===id);
const nameOf=id=>{const a=byId(id);return a?a.title:'(목록에 없음)'};

function drawCrown(x,y){
  if(propOk('crown')){ctx.drawImage(PROPS.crown,x-5.5,y-6,11,8.7);return}
  rect(x-4,y,9,3,'#ffd23f');rect(x-4,y-2,2,2,'#ffd23f');rect(x,y-3,1,3,'#ffd23f');rect(x+3,y-2,2,2,'#ffd23f');
  rect(x,y+1,1,1,'#e8574a');
}
function drawCommandLines(now){
  ctx.save();
  for(const p of people.values()){
    const par=p.agent.parent&&people.get(p.agent.parent);
    if(!par)continue;
    const hot=pick&&(pick===par.agent.id);
    ctx.strokeStyle=hot?'rgba(255,210,63,.95)':'rgba(255,248,234,.55)';
    ctx.lineWidth=hot?2:1;
    ctx.setLineDash([3,3]);ctx.lineDashOffset=-(now/80)%6;   // 상관 → 부하 쪽으로 흐르는 점선
    ctx.beginPath();ctx.moveTo(par.x,par.y-6);ctx.lineTo(p.x,p.y-6);ctx.stroke();
  }
  ctx.restore();
}

function teamHtml(a){
  const kids=kidsOf(a.id);
  const chip=(id,x)=>`<span class="chip" data-open="${id}">${esc(short(nameOf(id),16))}${x?`<b data-x="${x}" title="떼기">×</b>`:''}</span>`;
  return `<div class="team"><div class="thead"><span class="th">🎖 지휘체계</span><span class="tacts"><button class="mini" data-boss="${a.id}" title="상관 고르기">상관</button><button class="mini" data-pick="${a.id}" title="부하 고르기">부하</button><button class="mini" data-spawn="${a.id}" title="부하를 새로 만들기">＋새로</button></span></div>`+
    (kids.length?`<div class="tacts2"><button class="mini" data-freeall="${a.id}">📍 모두 떼기</button><button class="mini" data-followall="${a.id}">🚶 모두 붙이기</button></div>`:'')+
    `<div class="trow"><span class="tk">상관</span><span class="tv">${a.parent?chip(a.parent,'up:'+a.id)+(a.parentSet?'':' <small>(기본)</small>'):'<small>없음</small>'}</span></div>`+
    `<div class="trow"><span class="tk">부하 ${kids.length}</span><span class="tv">${kids.map(k=>chip(k.id,'kid:'+k.id)).join(' ')||'<small>없음</small>'}</span></div></div>`;
}
function bindTeam(){
  const box=document.getElementById('pInfo');
  box.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>startPick(b.dataset.pick));
  box.querySelectorAll('[data-boss]').forEach(b=>b.onclick=()=>startBossPick(b.dataset.boss));
  box.querySelectorAll('[data-spawn]').forEach(b=>b.onclick=()=>askSpawn(b.dataset.spawn));
  box.querySelectorAll('[data-freeall]').forEach(b=>b.onclick=()=>freeKids(b.dataset.freeall,true));
  box.querySelectorAll('[data-followall]').forEach(b=>b.onclick=()=>freeKids(b.dataset.followall,false));
  box.querySelectorAll('[data-open]').forEach(c=>c.onclick=e=>{if(e.target.dataset.x)return;openPanel(c.dataset.open)});
  box.querySelectorAll('[data-x]').forEach(x=>x.onclick=e=>{e.stopPropagation();const [,id]=x.dataset.x.split(':');setParent(id,null)});
}

async function setParent(child,parent,quiet,from){
  const a=byId(child);const old=a&&a.parent;
  if(a){a.parent=parent;a.parentSet=true}
  sync(agents);
  try{
    const r=await fetch('/api/tree',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({child,parent,from})});
    const j=await r.json();
    if(!r.ok){if(a)a.parent=old;sync(agents);toast(j.error||'못 바꿨습니다')}
  }catch(e){if(a)a.parent=old;sync(agents)}
  if(!quiet)poll(true);
}

// 부하 고르기: 목록에서 체크하면 부하로 들어가고, 체크를 풀면 빠진다 (바로 저장)
let pick=null;
function startPick(id){
  pick=id;hideMenu();
  document.getElementById('pickList').style.display='flex';
  renderPickList();
}
function endPick(){pick=null;document.getElementById('pickList').style.display='none'}
window.endPick=endPick;
function ancestorsOf(id){const out=new Set();let cur=byId(id)&&byId(id).parent;while(cur&&!out.has(cur)){out.add(cur);cur=byId(cur)&&byId(cur).parent}return out}
function renderPickList(){
  if(!pick)return;
  const box=document.getElementById('pickList');
  const q=(box.querySelector('#pkQ')||{}).value||'';
  const up=ancestorsOf(pick);
  const rows=agents.filter(a=>a.id!==pick&&(!q||a.title.includes(q)))
    .sort((x,y)=>(y.parent===pick)-(x.parent===pick)||(y.inside-x.inside)||((y.lastActivityAt||0)-(x.lastActivityAt||0)));
  const list=rows.map(a=>{
    const on=a.parent===pick, block=up.has(a.id);
    const now=a.parent&&a.parent!==pick?`<small>지금 상관: ${esc(short(nameOf(a.parent),12))} → 체크하면 옮겨옴</small>`:'';
    return `<label class="pk${block?' off':''}"><input type="checkbox" data-id="${a.id}" ${on?'checked':''} ${block?'disabled':''}>
      <span>${a.inside?'🏡':'🌲'} ${esc(short(a.title,34))}<br>${block?'<small>이 세션의 상관(윗선)이라 부하로 둘 수 없음</small>':now}</span></label>`;
  }).join('');
  const kept=box.querySelector('#pkRows');const sc=kept?kept.scrollTop:0;
  box.innerHTML=`<div class="pbox"><h3>👥 「${esc(short(nameOf(pick),20))}」의 부하 고르기</h3>
    <input id="pkQ" placeholder="이름으로 찾기" value="${esc(q)}">
    <div class="pkall"><button data-all="on">☑ 보이는 것 전체 선택</button><button data-all="off">☐ 전체 해제</button></div>
    <div id="pkRows">${list||'<div style="opacity:.6;padding:10px">없음</div>'}</div>
    <div class="cbtn"><span style="flex:1;font-size:12px;opacity:.7;align-self:center">부하 ${kidsOf(pick).length}명 · 체크하면 바로 저장</span><button data-act="endPick">다 됐어</button></div></div>`;
  box.querySelector('#pkRows').scrollTop=sc;
  const qi=box.querySelector('#pkQ');qi.oninput=()=>{renderPickList();const n=document.getElementById('pkQ');n.focus();n.setSelectionRange(n.value.length,n.value.length)};
  box.querySelectorAll('input[type=checkbox]').forEach(c=>c.onchange=()=>setParent(c.dataset.id,c.checked?pick:null,false,c.checked?null:pick).then(renderPickList));
  box.querySelectorAll('[data-all]').forEach(b=>b.onclick=async()=>{
    const on=b.dataset.all==='on';
    const ids=[...box.querySelectorAll('#pkRows input[type=checkbox]:not(:disabled)')].filter(c=>c.checked!==on).map(c=>c.dataset.id);
    if(on&&ids.length>8&&!confirm(`${ids.length}개 세션을 한꺼번에 부하로 넣을까요?`))return;
    b.disabled=true;
    for(const id of ids)await setParent(id,on?pick:null,true,on?null:pick);
    poll(true);renderPickList();
  });
  box.onclick=e=>{if(e.target===box)endPick()};
}
function togglePick(id){}
addEventListener('keydown',e=>{if(e.key==='Escape')endPick()});

function toast(msg){
  const t=document.getElementById('toast');t.textContent=msg;t.style.display='block';
  clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',2600);
}


// ---------- 보관·삭제 ----------
// 보관 = 클로드 앱 보관함으로 (다시 열 수 있음). 삭제 = 기록까지 지움 (되돌릴 수 없음, 클로드 앱이 매번 승인을 묻는다).
function askRemove(id,kind){
  const a=byId(id);if(!a)return;
  const del=kind==='delete';
  const dlg=document.getElementById('confirm');
  dlg.innerHTML=`<div class="cbox"><h3>${del?'🗑 세션 삭제':'📦 세션 보관'}</h3>
    <p><b>${esc(a.title)}</b></p>
    <p>${del?'대화 기록까지 지워지고 <b>되돌릴 수 없습니다.</b><br>보내면 클로드 앱의 「마을 관리소」 창에 승인 카드가 뜹니다. 거기서 한 번 더 승인해야 지워집니다.'
            :'클로드 앱 보관함으로 옮깁니다. 나중에 다시 열 수 있습니다.<br>일하는 중이거나 화면에 열려 있는 세션은 보관되지 않을 수 있습니다.'}</p>
    ${kidsOf(id).length?`<p>⚠ 이 세션의 부하 ${kidsOf(id).length}명은 상관이 없어집니다.</p>`:''}
    <div class="cbtn"><button data-c="no">취소</button><button data-c="yes" class="${del?'danger':''}">${del?'삭제 요청':'보관하기'}</button></div>
    <div class="cnote"></div></div>`;
  dlg.style.display='flex';
  const note=dlg.querySelector('.cnote');
  dlg.onclick=async e=>{
    const c=e.target.dataset.c;
    if(e.target===dlg||c==='no'){dlg.style.display='none';return}
    if(c!=='yes')return;
    e.target.disabled=true;note.textContent='우체부에게 맡기는 중…';
    try{
      const r=await fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:id,kind})});
      const j=await r.json();if(!r.ok)throw new Error(j.error||'실패');
      note.textContent=del?'클로드 앱 「마을 관리소」 창에서 승인해 주세요…':'보관하는 중…';
      for(let i=0;i<200;i++){
        await new Promise(r=>setTimeout(r,1500));
        const rc=await (await fetch('/api/receipt/'+j.id)).json();
        if(rc.pending)continue;
        if(rc.ok){note.textContent=del?'삭제했습니다':'보관했습니다';if(openId===id)closePanel();setTimeout(()=>dlg.style.display='none',900);poll(true)}
        else{note.textContent='못 했습니다: '+(rc.error||'');e.target.disabled=false}
        return;
      }
      note.textContent='아직 답이 없습니다 (승인 대기 중일 수 있음)';
    }catch(err){note.textContent='보내기 실패: '+err.message;e.target.disabled=false}
  };
}


// ---------- 상관 고르기 ----------
// 한 세션의 상관을 목록에서 하나 고른다. 자기 자신과 자기 아랫선(부하·부하의 부하)은 고를 수 없다.
function descendantsOf(id){const out=new Set(),st=[id];while(st.length){const c=st.pop();for(const k of kidsOf(c))if(!out.has(k.id)){out.add(k.id);st.push(k.id)}}return out}
let bossFor=null;
function startBossPick(id){bossFor=id;hideMenu();document.getElementById('pickList').style.display='flex';renderBossList()}
function renderBossList(){
  if(!bossFor)return;
  const me=byId(bossFor);if(!me)return;
  const box=document.getElementById('pickList');
  const q=(box.querySelector('#bkQ')||{}).value||'';
  const down=descendantsOf(bossFor);
  const rows=agents.filter(a=>a.id!==bossFor&&(!q||a.title.includes(q)))
    .sort((x,y)=>(y.id===me.parent)-(x.id===me.parent)||(kidsOf(y.id).length-kidsOf(x.id).length)||((y.lastActivityAt||0)-(x.lastActivityAt||0)));
  const list=`<label class="pk"><input type="radio" name="boss" value="" ${me.parent?'':'checked'}><span>⬆ 상관 없음 (맨 위)</span></label>`+
    rows.map(a=>{const block=down.has(a.id);const nk=kidsOf(a.id).length;
      return `<label class="pk${block?' off':''}"><input type="radio" name="boss" value="${a.id}" ${me.parent===a.id?'checked':''} ${block?'disabled':''}>
        <span>${a.inside?'🏡':'🌲'} ${nk?'👑 ':''}${esc(short(a.title,34))}${nk?` <small>부하 ${nk}명</small>`:''}${block?'<br><small>이 세션의 아랫선이라 상관으로 둘 수 없음</small>':''}</span></label>`}).join('');
  const sc=(box.querySelector('#pkRows')||{}).scrollTop||0;
  box.innerHTML=`<div class="pbox"><h3>🎖 「${esc(short(me.title,20))}」의 상관 고르기</h3>
    <input id="bkQ" placeholder="이름으로 찾기" value="${esc(q)}">
    <div id="pkRows">${list}</div>
    <div class="cbtn"><span style="flex:1;font-size:12px;opacity:.7;align-self:center">고르면 바로 저장</span><button data-act="endBossPick">다 됐어</button></div></div>`;
  box.querySelector('#pkRows').scrollTop=sc;
  const qi=box.querySelector('#bkQ');qi.oninput=()=>{renderBossList();const n=document.getElementById('bkQ');n.focus();n.setSelectionRange(n.value.length,n.value.length)};
  box.querySelectorAll('input[type=radio]').forEach(r=>r.onchange=()=>setParent(bossFor,r.value||null).then(renderBossList));
  box.onclick=e=>{if(e.target===box)endBossPick()};
}
function endBossPick(){bossFor=null;document.getElementById('pickList').style.display='none'}
window.endBossPick=endBossPick;
addEventListener('keydown',e=>{if(e.key==='Escape')endBossPick()});


// ---------- 마을 우체통 (피클과 주고받는 깃 우편함) ----------
const POST={x:0.645*W,y:0.56*H};   // 배경 그림 속 빨간 우체통 기둥 밑
let mailbox={enabled:false,letters:[],unread:0};
function drawPost(now){
  const {x,y}=POST;
  if(BG.complete&&BG.naturalWidth){
    // 배경 그림에 우체통이 이미 있다 → 안 읽은 편지가 있을 때만 깃발과 숫자를 얹는다
    if(!mailbox.unread)return;
    const k=Math.floor(now/300)%2, top=y-30;
    if(propOk('mailboxFlag')){const b=Math.sin(now/200)*0.7;ctx.drawImage(PROPS.mailboxFlag,x-11,y-33+b,22,23)}
    else{rect(x+6,top-8,1,10,'#3b2a1f');rect(x+7,top-8-k,6,4,'#ffd23f')}
    ctx.fillStyle='#e8574a';ctx.beginPath();ctx.arc(x-7,top-3,4.5,0,7);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 6px sans-serif';ctx.textAlign='center';ctx.fillText(String(Math.min(9,mailbox.unread)),x-7,top-1);ctx.textAlign='start';
    return;
  }
  rect(x-1,y-10,2,10,'#6b4a2e');                       // 기둥
  rect(x-7,y-22,14,12,'#d9443a');rect(x-7,y-22,14,2,'#f06a5c');rect(x-5,y-17,10,2,'#3b2a1f'); // 통·투입구
  rect(x-7,y-11,14,1,'#a83228');
  if(mailbox.unread){
    const k=Math.floor(now/300)%2;
    rect(x+7,y-30,1,10,'#3b2a1f');rect(x+8,y-30-k,6,4,'#ffd23f');   // 깃발이 올라가 펄럭인다
    ctx.fillStyle='#e8574a';ctx.beginPath();ctx.arc(x-6,y-24,4,0,7);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 6px sans-serif';ctx.textAlign='center';ctx.fillText(String(Math.min(9,mailbox.unread)),x-6,y-22);ctx.textAlign='start';
  }
}
async function pollMailbox(){
  try{mailbox=await (await fetch('/api/mailbox')).json();if(!mailbox.letters)mailbox.letters=[]}catch(e){}
  const b=document.getElementById('hudPost');if(b)b.textContent=mailbox.unread?'📮'+mailbox.unread:'';
  const mb=document.getElementById('mbBtn');if(mb)mb.style.display=mailbox.enabled?'':'none';
  const n=document.getElementById('mbN');if(n)n.textContent=mailbox.unread||'';
  if(mbOpen)renderMailbox();
  setTimeout(pollMailbox,15000);
}
let mbOpen=false, mbTab='to-claude', mbReply='';
function openMailbox(){mbOpen=true;document.getElementById('mailbox').style.display='flex';renderMailbox()}
function closeMailbox(){mbOpen=false;document.getElementById('mailbox').style.display='none'}
window.openMailbox=openMailbox;window.closeMailbox=closeMailbox;
function fmtTime(f){const m=/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)/.exec(f||'');return m?`${+m[2]}/${+m[3]} ${m[4]}:${m[5]}`:''}
function renderMailbox(){
  const box=document.getElementById('mailbox');
  const tabs=[['to-claude','📥 피클이 보낸 편지'],['to-pickle','📤 피클에게 보낸 편지'],['archive','🗂 보관']];
  const list=mailbox.letters.filter(L=>L.box===mbTab);
  const sessOpts=agents.map(a=>`<option value="${a.id}">${esc(short(a.title,30))}</option>`).join('');
  const keepCompose=box.querySelector('#mbBody');const draft=keepCompose?{s:box.querySelector('#mbSubj').value,b:keepCompose.value}:{s:'',b:''};
  const sc=(box.querySelector('.mblist')||{}).scrollTop||0;
  box.innerHTML=`<div class="mbbox"><header><h3>📮 피클 우체통</h3><button class="close" data-act="closeMailbox">×</button>
    <div class="mbsub">사장님 AI 비서 피클과 주고받는 편지함입니다. 피클은 몇 분마다 확인합니다.${mailbox.error?` <span style="color:var(--alert)">· 우편함 오류: ${esc(mailbox.error)}</span>`:''}</div></header>
    <div class="mbtabs">${tabs.map(([k,t])=>`<button data-tab="${k}" class="${k===mbTab?'on':''}">${t}${k==='to-claude'&&mailbox.unread?` <b>${mailbox.unread}</b>`:''}</button>`).join('')}</div>
    <div class="mblist">${list.map(L=>{
      const fw=L.forward;
      const who=L.box==='to-pickle'?`→ 피클 · 보낸 이: ${esc(L.from_name||'클로드')}`:L.box==='to-claude'?`피클 → ${esc(L.to_session||'사장님(마을)')}`:`${esc(L.from_name||L.from||'')} ${L.to?'→ '+esc(L.to):''}`;
      return `<div class="letter"><div class="lh"><b>${esc(L.subject||'(제목 없음)')}</b><span>${fmtTime(L.file)}</span></div>
        <div class="lw">${who}${fw?(fw.error?` · <span style="color:var(--alert)">전달 실패: ${esc(short(fw.error,60))}</span>`:` · ${fw.done?'✅':'📨'} ${esc(fw.toName||'')}에게 ${fw.done?'전달됨':'전달 중'}`):''}</div>
        <div class="lb">${esc(L.body)}</div>
        ${L.box==='to-claude'?`<div class="la"><button data-reply="${esc(L.path)}" data-subj="${esc(L.subject||'')}">↩ 답장</button>
          <select data-fwd="${esc(L.path)}"><option value="">세션에게 전해 주기…</option>${sessOpts}</select>
          <button data-ack="${esc(L.path)}">✔ 읽음(보관)</button></div>`:''}</div>`}).join('')||'<div style="opacity:.6;padding:14px">편지가 없어요</div>'}</div>
    <div class="mbcompose"><div class="mbto">✉ 피클에게 ${mbReply?`<small>(답장: ${esc(mbReply.split('/').pop())}) <a href="#" id="mbNoReply">취소</a></small>`:''}</div>
      <input id="mbSubj" placeholder="제목" value="${esc(draft.s)}"><textarea id="mbBody" placeholder="피클에게 할 말 (⌘+엔터로 보내기)">${esc(draft.b)}</textarea>
      <div class="cbtn"><span class="mbnote" style="flex:1;font-size:12px;opacity:.7;align-self:center">비밀번호·카드번호·고객 개인정보는 쓰지 마세요 (깃 저장소에 그대로 남습니다)</span><button id="mbSend">보내기</button></div></div></div>`;
  box.querySelector('.mblist').scrollTop=sc;
  box.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{mbTab=b.dataset.tab;renderMailbox()});
  box.querySelectorAll('[data-reply]').forEach(b=>b.onclick=()=>{mbReply=b.dataset.reply;renderMailbox();const sj=document.getElementById('mbSubj');if(!sj.value)sj.value='Re: '+b.dataset.subj;document.getElementById('mbBody').focus()});
  const nr=box.querySelector('#mbNoReply');if(nr)nr.onclick=e=>{e.preventDefault();mbReply='';renderMailbox()};
  box.querySelectorAll('[data-ack]').forEach(b=>b.onclick=async()=>{b.disabled=true;await mbPost('/api/mailbox/ack',{path:b.dataset.ack});pollMailboxNow()});
  box.querySelectorAll('[data-fwd]').forEach(sel=>sel.onchange=async()=>{if(!sel.value)return;sel.disabled=true;
    const r=await mbPost('/api/mailbox/forward',{path:sel.dataset.fwd,to:sel.value});toast(r.ok?'우체부가 그 세션에 전해 줍니다':'못 전했습니다: '+(r.error||''));pollMailboxNow()});
  const send=async()=>{
    const subject=box.querySelector('#mbSubj').value.trim(), body=box.querySelector('#mbBody').value.trim();
    if(!body){toast('할 말을 써 주세요');return}
    const bt=box.querySelector('#mbSend');bt.disabled=true;bt.textContent='보내는 중…';
    const r=await mbPost('/api/mailbox/send',{subject:subject||short(body,30),body,reply_to:mbReply});
    if(r.ok){box.querySelector('#mbSubj').value='';box.querySelector('#mbBody').value='';if(mbReply){await mbPost('/api/mailbox/ack',{path:mbReply})}mbReply='';mbTab='to-pickle';toast('피클에게 보냈습니다');pollMailboxNow()}
    else{toast('못 보냈습니다: '+(r.error||''));bt.disabled=false;bt.textContent='보내기'}
  };
  box.querySelector('#mbSend').onclick=send;
  box.querySelector('#mbBody').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();send()}});
  box.onclick=e=>{if(e.target===box)closeMailbox()};
}
async function mbPost(url,body){try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return await r.json()}catch(e){return{error:e.message}}}
async function pollMailboxNow(){try{mailbox=await (await fetch('/api/mailbox')).json();if(!mailbox.letters)mailbox.letters=[]}catch(e){}if(mbOpen)renderMailbox()}
addEventListener('keydown',e=>{if(e.key==='Escape')closeMailbox()});
pollMailbox();


// ---------- 방문자 돌려보내기 ----------
// 사장님이 확인하면 마을 밖으로 걸어 나간다. 그 세션에 새 활동이 생기면 다시 들어올 수 있다.
async function dismissVisitor(id){
  hideMenu();
  const a=byId(id);if(a)a.visiting=false;
  if(openId===id)closePanel();
  sync(agents);
  try{await fetch('/api/dismiss',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})}catch(e){}
  poll(true);
}


// ---------- 부하 새로 만들기 ----------
// 우체부(마을 관리소)가 상관과 같은 폴더에 새 세션을 띄우고, 화면이 그 세션을 상관 밑에 붙인다.
function askSpawn(lead){
  hideMenu();
  const a=lead?byId(lead):null;if(lead&&!a)return;
  document.getElementById('hud').classList.remove('open');
  const dlg=document.getElementById('confirm');
  dlg.innerHTML=`<div class="cbox"><h3>${a?`👶 「${esc(short(a.title,20))}」의 부하 새로 만들기`:'➕ 새 주민 만들기'}</h3>
    <div class="engs"><label><input type="radio" name="spEng" value="claude" checked>🟠 클로드</label><label><input type="radio" name="spEng" value="codex">⚫ 코덱스</label><label><input type="radio" name="spEng" value="gemini">🔷 제미나이</label></div>
    <p style="font-size:12px;opacity:.7">${a?`새 세션이 상관과 같은 폴더(${esc(short(a.cwd,40))})에서 바로 일을 시작합니다. 끝나면 상관에게 보고합니다.`:'상관 없이 마을에 사는 주민입니다. 다른 주민과 서로 말을 주고받을 수 있습니다.'}</p>
    ${a?'':'<input id="spCwd" placeholder="일할 폴더 (비우면 홈 폴더, 예: ~/Documents/프로젝트)">'}
    <input id="spTitle" placeholder="이름 (비우면 할 일 첫 줄로)" maxlength="58">
    <textarea id="spText" placeholder="이 부하에게 시킬 일"></textarea>
    <div class="sprow"><span id="spModelBox">🧠 <select id="spModel"><option value="sonnet">Sonnet (기본)</option><option value="opus">Opus</option><option value="haiku">Haiku</option><option value="fable">Fable</option></select></span>
      💪 <select id="spEffort"><option value="medium">보통</option><option value="low">낮음</option><option value="high">높음</option><option value="xhigh">아주 높음</option><option value="max">최대</option></select></div>
    <p style="font-size:11.5px;opacity:.65;margin:4px 0 0" id="spNote">마을이 직접 돌립니다. 클로드 앱 목록에는 안 나오고 마을에서 보고 지시합니다.</p>
    <div class="cbtn"><button data-c="no">취소</button><button data-c="yes">만들기</button></div>
    <div class="cnote"></div></div>`;
  dlg.style.display='flex';
  const note=dlg.querySelector('.cnote');
  const engOf=()=>dlg.querySelector('input[name=spEng]:checked').value;
  const ENG_NOTE={claude:'마을이 직접 돌립니다. 클로드 앱 목록에는 안 나오고 마을에서 보고 지시합니다.',
    codex:'코덱스(챗GPT 요금제)로 돕니다. 클로드 사용량은 늘지 않습니다. 모델은 코덱스 기본값을 씁니다.',
    gemini:'제미나이(안티그래비티, 구글 요금제)로 돕니다. 클로드 사용량은 늘지 않습니다. 모델은 안티그래비티 기본값을 씁니다.'};
  dlg.querySelectorAll('input[name=spEng]').forEach(r=>r.onchange=()=>{
    dlg.querySelector('#spModelBox').style.display=engOf()==='claude'?'':'none';
    dlg.querySelector('#spNote').textContent=ENG_NOTE[engOf()];
  });
  setTimeout(()=>dlg.querySelector('#spText').focus(),30);
  dlg.onclick=async e=>{
    const c=e.target.dataset.c;
    if(e.target===dlg||c==='no'){dlg.style.display='none';return}
    if(c!=='yes')return;
    const text=dlg.querySelector('#spText').value.trim(), title=dlg.querySelector('#spTitle').value.trim();
    if(!text){note.textContent='시킬 일을 써 주세요';return}
    e.target.disabled=true;note.textContent='새 부하를 깨우는 중…';
    try{
      const r=await fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:lead||'',kind:'spawn',title,text,engine:engOf(),cwd:(dlg.querySelector('#spCwd')||{}).value||'',model:dlg.querySelector('#spModel').value,effort:dlg.querySelector('#spEffort').value})});
      const j=await r.json();if(!r.ok)throw new Error(j.error||'실패');
      for(let i=0;i<80;i++){
        await new Promise(r=>setTimeout(r,1500));
        const rc=await (await fetch('/api/receipt/'+j.id)).json();
        if(rc.pending)continue;
        if(rc.ok&&rc.newSession){
          if(a){await setParent(rc.newSession,lead,true);if(!a.inside)await setInside(rc.newSession,false)}
          note.textContent=a?'만들었습니다. 곧 상관 옆에 나타납니다':'만들었습니다. 곧 마을에 나타납니다';toast(a?'새 부하가 생겼습니다':'새 주민이 생겼습니다');
          setTimeout(()=>dlg.style.display='none',1200);poll(true);
        }else{note.textContent='못 만들었습니다: '+(rc.error||'');e.target.disabled=false}
        return;
      }
      note.textContent='우체부가 답이 없습니다';
    }catch(err){note.textContent='실패: '+err.message;e.target.disabled=false}
  };
}


// ---------- 모델·노력도 ----------
const MODEL_KEYS=['opus','sonnet','haiku','fable'];
const MODEL_NAMES={opus:'Opus',sonnet:'Sonnet',haiku:'Haiku',fable:'Fable'};
const EFFORTS=['low','medium','high','xhigh','max'];
const EFFORT_NAMES={low:'낮음',medium:'보통',high:'높음',xhigh:'아주 높음',max:'최대'};
function modelKey(m){m=String(m||'');return MODEL_KEYS.find(k=>m.includes(k))||''}
async function setBrain(id,kind,value){
  hideMenu();
  const a=byId(id);
  try{
    const r=await fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:id,kind,value})});
    const j=await r.json();if(!r.ok)throw new Error(j.error||'실패');
    toast(kind==='model'?`모델을 ${MODEL_NAMES[value]}(으)로 바꾸는 중…`:`노력도를 ${EFFORT_NAMES[value]}(으)로 바꾸는 중…`);
    for(let i=0;i<80;i++){
      await new Promise(r=>setTimeout(r,1500));
      const rc=await (await fetch('/api/receipt/'+j.id)).json();
      if(rc.pending)continue;
      if(rc.ok){if(a){if(kind==='model')a.model=value;else a.effort=value}toast('바꿨습니다. 다음 턴부터 적용됩니다');poll(true)}
      else toast('못 바꿨습니다: '+short(rc.error||'',80));
      return;
    }
    toast('아직 답이 없습니다 (클로드 앱에서 승인을 기다릴 수 있음)');
  }catch(e){toast('못 바꿨습니다: '+e.message)}
}

// 대화창용: 링크 표시만 걷어 내고 줄바꿈은 살린다
// 세션 말 속 링크를 살린다: [글](https://…) 와 맨 주소는 누를 수 있게, [글](맥 경로) 는 글만
function linkText(s){
  let h=esc((s||'').replace(/\*\*/g,'').replace(/`/g,'').replace(/\n{3,}/g,'\n\n').trim());
  h=h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  h=h.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1');
  h=h.replace(/(^|[\s(（「])(https?:\/\/[^\s<)）」]+)/g,'$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  return h;
}
// 세션이 보낸 파일·문서: 누르면 새 탭에서 열린다
function fileChips(files){
  return `<div class="msg file">${(files||[]).map(f=>{
    const href=f.url||('/api/file?path='+encodeURIComponent(f.path));
    const icon=f.url?'📄':(/\.(png|jpe?g|gif|webp)$/i.test(f.path)?'🖼':/\.(mp4|mov|m4v|webm)$/i.test(f.path)?'🎞':/\.(mp3|wav|m4a)$/i.test(f.path)?'🔊':'📎');
    return `<a class="fchip" href="${esc(href)}" target="_blank" rel="noopener"${f.url?'':` data-view="${esc(href)}" data-vname="${esc(f.name||'파일')}"`}>${icon} ${esc(f.name||'파일')}${f.url?' <span style="opacity:.6">(문서 열기)</span>':''}</a>`}).join('')}</div>`;
}
function cleanBlock(s){return (s||'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\*\*/g,'').replace(/`/g,'').replace(/\n{3,}/g,'\n\n').trim()}

// ---------- 지시 칸: 크게·자동으로 늘리기, 그림 붙여넣기·끌어 놓기·파일 고르기 ----------
let attach=[];
const oText=document.getElementById('oText');
function growBox(){oText.style.height='auto';oText.style.height=Math.min(innerHeight*0.45,Math.max(44,oText.scrollHeight+4))+'px'}
oText.addEventListener('input',growBox);
function addFiles(files){
  for(const f of files){
    if(f.size>20e6){toast(f.name+' 은(는) 20MB가 넘어 못 붙입니다');continue}
    const rd=new FileReader();
    rd.onload=()=>{attach.push({name:f.name||('붙여넣은그림-'+Date.now()+'.png'),type:f.type,data:rd.result});renderAttach()};
    rd.readAsDataURL(f);
  }
}
function renderAttach(){
  const box=document.getElementById('oAttach');
  box.innerHTML=attach.map((f,i)=>`<span class="att">${f.type.startsWith('image/')?`<img src="${f.data}">`:'📄'}<small>${esc(short(f.name,18))}</small><b data-rm="${i}">×</b></span>`).join('');
  box.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{attach.splice(+b.dataset.rm,1);renderAttach()});
  document.getElementById('pFiles').classList.toggle('has',attach.length>0);
  document.getElementById('attN').textContent=attach.length?`(${attach.length}개)`:'';
  document.getElementById('attHint').textContent=attach.length?`📎 ${attach.length}개 함께 보냄`:'';
}
oText.addEventListener('paste',e=>{
  const fs=[...(e.clipboardData||{}).items||[]].filter(it=>it.kind==='file').map(it=>it.getAsFile()).filter(Boolean);
  if(fs.length){e.preventDefault();addFiles(fs)}
});
const orderBox=document.getElementById('order');
orderBox.addEventListener('dragover',e=>{e.preventDefault();orderBox.classList.add('drop')});
orderBox.addEventListener('dragleave',()=>orderBox.classList.remove('drop'));
orderBox.addEventListener('drop',e=>{e.preventDefault();orderBox.classList.remove('drop');addFiles([...e.dataTransfer.files])});
// 왼쪽 「붙일 파일」 칸에도 끌어다 놓을 수 있다
const filesBox=document.getElementById('pFiles');
filesBox.addEventListener('dragover',e=>{e.preventDefault();filesBox.classList.add('drop')});
filesBox.addEventListener('dragleave',()=>filesBox.classList.remove('drop'));
filesBox.addEventListener('drop',e=>{e.preventDefault();filesBox.classList.remove('drop');addFiles([...e.dataTransfer.files])});
document.getElementById('oFile').addEventListener('change',e=>{addFiles([...e.target.files]);e.target.value=''});


// ---------- 세션 목록 (조직도 카드) ----------
// 상관 없는 세션이 맨 위 카드, 누르면 아래로 부하 카드가 펼쳐진다. 카드마다 ⚙ 로 모든 설정(우클릭 메뉴와 같은 것)을 연다.
let orgOpen=false, orgQ='', orgFilter='all';
const orgExpanded=new Set();
function toggleOrg(){orgOpen=!orgOpen;document.getElementById('org').classList.toggle('open',orgOpen);if(orgOpen)renderOrg()}
window.toggleOrg=toggleOrg;
function orgCard(a,depth){
  const kids=kidsOf(a.id);
  const st=stateOf(a);
  const pill={work:['일하는 중','var(--work)'],wait:['확인 필요','var(--alert)'],stall:['멈춤','#888'],idle:['','']}[st];
  const open=orgExpanded.has(a.id);
  return `<div class="oc${st==='wait'?' w':''}" data-id="${a.id}" style="margin-left:${depth*14}px">
    <div class="oct">${sprite(a.id)?`<img class="portrait oimg" src="${sprite(a.id).portrait.src}">`:''}${kids.length?`<span class="tw" data-tw="${a.id}">${open?'▾':'▸'}</span>`:'<span class="tw"></span>'}
      ${a.inside?'🏡':a.visiting?'🚶':'🌲'}${a.native?(a.engine==='codex'?'⚫':a.engine==='gemini'?'🔷':'🧪'):''} <b>${esc(short(a.title,26))}</b>${kids.length?` <small>부하 ${kids.length}</small>`:''}
      <span class="ocb">${orgHideMode?`<button data-hide="${a.id}" title="마을·목록에서 숨기기">🙈</button>`:''}<button data-chat="${a.id}" title="대화·지시">💬</button><button data-gear="${a.id}" title="설정">⚙</button></span></div>
    <div class="ocs">${pill[0]?`<span class="pill" style="background:${pill[1]}">${pill[0]}</span>`:''}${esc(short(st==='wait'?a.needsAction:(a.doing&&st==='work'?a.doing:a.summary),70))}</div>
    ${kids.length?`<div class="ofold" data-tw="${a.id}">${open?'▾ 부하 접기':`▸ 부하 ${kids.length}명 펼치기`}${(()=>{const w=kids.filter(k=>stateOf(k)==='wait').length;return w&&!open?` <span style="color:var(--alert)">· 확인 필요 ${w}</span>`:''})()}</div>`:''}
    <div class="ocm">${esc(MODEL_NAMES[modelKey(a.model)]||'')}${a.effort?' · '+esc(EFFORT_NAMES[a.effort]||a.effort):''} · ${ago(a.lastActivityAt)}${a.tokens&&a.tokens.week?` · <span class="tk" title="오늘 / 7일 토큰 (출력)">🪙 오늘 ${kn(a.tokens.today)} · 7일 ${kn(a.tokens.week)} · ${moneyLine(a)}</span>`:''}</div></div>`+
    (open?kids.map(k=>orgCard(k,depth+1)).join(''):'');
}
function renderOrg(){
  const box=document.getElementById('orgList');if(!box)return;
  const ids=new Set(agents.map(a=>a.id));
  const match=a=>(!orgQ||a.title.includes(orgQ))&&(orgFilter==='all'||(orgFilter==='in'?a.inside:!a.inside));
  let roots;
  if(orgQ||orgFilter!=='all'){roots=agents.filter(match)}          // 찾을 때는 평평하게
  else roots=agents.filter(a=>!a.parent||!ids.has(a.parent));
  // 부하가 있는 헤드 세션이 맨 위 (부하 많은 순), 그 아래 혼자 일하는 세션. 같은 묶음 안에서는 확인 필요 → 최근 순
  const isHead=a=>kidsOf(a.id).length>0;
  roots.sort((x,y)=>(isHead(y)-isHead(x))||(isHead(x)&&isHead(y)?kidsOf(y.id).length-kidsOf(x.id).length:0)||(stateOf(y)==='wait')-(stateOf(x)==='wait')||(y.lastActivityAt||0)-(x.lastActivityAt||0));
  const sc=box.scrollTop;
  const heads=roots.filter(isHead), solos=roots.filter(a=>!isHead(a));
  box.innerHTML=(orgQ||orgFilter!=='all')?(roots.map(a=>orgCard(a,0)).join('')||'<div style="opacity:.6;padding:12px">없음</div>')
    :(heads.length?`<div class="osec">👑 헤드 세션 ${heads.length}</div>`+heads.map(a=>orgCard(a,0)).join(''):'')+
     (solos.length?`<div class="osec">🧍 혼자 일하는 세션 ${solos.length}</div>`+solos.map(a=>orgCard(a,0)).join(''):'');
  if(orgHideMode)box.innerHTML=`<div class="osec" style="color:var(--alert)">🙈 숨김 고르기 — 숨길 세션의 🙈 를 누르세요</div>`+box.innerHTML+
    `<div class="osec">🙈 숨긴 세션 ${hiddenAgents.length}</div>`+(hiddenAgents.map(a=>`<div class="oc" style="opacity:.75"><div class="oct">${esc(short(a.title,30))}<span class="ocb"><button data-unhide="${a.id}" title="다시 보이게">👁 보이기</button></span></div></div>`).join('')||'<div style="opacity:.6;padding:8px 12px">없음</div>');
  box.scrollTop=sc;
  box.querySelectorAll('[data-hide]').forEach(b=>b.onclick=e=>{e.stopPropagation();setHidden(b.dataset.hide,true);toast('숨겼어요. 「🙈 숨김」에서 다시 보이게 할 수 있어요')});
  box.querySelectorAll('[data-unhide]').forEach(b=>b.onclick=e=>{e.stopPropagation();setHidden(b.dataset.unhide,false)});
  box.querySelectorAll('[data-tw]').forEach(t=>t.onclick=e=>{e.stopPropagation();const id=t.dataset.tw;orgExpanded.has(id)?orgExpanded.delete(id):orgExpanded.add(id);renderOrg()});
  box.querySelectorAll('[data-chat]').forEach(b=>b.onclick=e=>{e.stopPropagation();openPanel(b.dataset.chat)});
  box.querySelectorAll('[data-gear]').forEach(b=>b.onclick=e=>{e.stopPropagation();const r=b.getBoundingClientRect();showMenu(r.right+4,r.top,b.dataset.gear)});
  box.querySelectorAll('.oc').forEach(c=>{
    c.onclick=()=>{const id=c.dataset.id;if(kidsOf(id).length){orgExpanded.has(id)?orgExpanded.delete(id):orgExpanded.add(id);renderOrg()}else openPanel(id)};
    c.oncontextmenu=e=>{e.preventDefault();showMenu(e.clientX,e.clientY,c.dataset.id)};
  });
}
(function initOrg(){
  const q=document.getElementById('orgQ');q.oninput=()=>{orgQ=q.value.trim();renderOrg()};
  document.querySelectorAll('#org [data-f]').forEach(b=>b.onclick=()=>{orgFilter=b.dataset.f;document.querySelectorAll('#org [data-f]').forEach(x=>x.classList.toggle('on',x===b));renderOrg()});
  document.getElementById('orgHide').onclick=()=>{orgHideMode=!orgHideMode;document.getElementById('orgHide').classList.toggle('on',orgHideMode);renderOrg()};
  document.getElementById('orgAll').onclick=()=>{const open=orgExpanded.size===0;orgExpanded.clear();if(open)agents.forEach(a=>{if(kidsOf(a.id).length)orgExpanded.add(a.id)});renderOrg()};
})();


// 지난 회차 한꺼번에 보관 (클로드 앱 보관함으로, 되살릴 수 있음)
async function archiveRuns(a){
  const runs=(a.runs||[]).filter(r=>!r.needsAction);
  const skip=(a.runs||[]).length-runs.length;
  if(!runs.length){toast('보관할 지난 회차가 없습니다'+(skip?` (확인 기다리는 ${skip}개는 남겨 둠)`:''));return}
  if(!confirm(`「${a.title}」의 지난 회차 ${runs.length}개를 클로드 앱 보관함으로 옮길까요?\n되살릴 수 있습니다.${skip?`\n확인을 기다리는 ${skip}개는 남겨 둡니다.`:''}`))return;
  let ok=0,fail=[];
  toast(`지난 회차 ${runs.length}개 보관하는 중…`);
  for(const r of runs){
    try{
      const j=await (await fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:r.id,kind:'archive'})})).json();
      if(!j.id){fail.push(j.error||'실패');continue}
      for(let i=0;i<40;i++){
        await new Promise(res=>setTimeout(res,1500));
        const rc=await (await fetch('/api/receipt/'+j.id)).json();
        if(rc.pending)continue;
        if(rc.ok)ok++;else fail.push(rc.error||'');
        break;
      }
    }catch(e){fail.push(e.message)}
  }
  toast(`보관 ${ok}개`+(fail.length?` · 실패 ${fail.length}개: ${short(fail[0],60)}`:''));
  poll(true);
}


// 마을이 사장님 말에 덧붙인 것(머리말·지휘체계 안내·피클 안내)은 빼고 사장님이 쓴 말만 보여 준다
function bossText(t){
  t=String(t||'');
  t=t.replace(/^📮\s*/,'').replace(/^【마을에서 온 [^】]*지시】[^\n]*\n?/,'');
  t=t.split(/\n+---\n\[(?:지휘체계|피클 우편함)\]/)[0];
  t=t.replace(/\n*\[첨부 파일 — Read 도구로 열어 보세요\]\n([\s\S]*)$/,(m,paths)=>'\n📎 '+paths.split('\n').filter(Boolean).map(x=>x.split('/').pop()).join(', '));
  return cleanBlock(t);
}


// ---------- 코덱스 그림 (배경·주민) ----------
const BG=new Image();BG.src='/art/background.png';
BG.onload=()=>{cv.style.imageRendering='auto'};
let CAST={};const SPRITES={};
// 그림 공방 상태: 세션↔캐릭터 짝, 그려 둔 캐릭터, 그리는 중인 일, 배경 버전. 10초마다 새로
let ART={cast:{},characters:[],jobs:{},bgVersion:0,artist:'',ownerName:'사장님'};
async function pollArt(){
  try{
    const j=await (await fetch('/api/art')).json();
    if(j.bgVersion!==ART.bgVersion&&j.bgVersion)BG.src='/art/background.png?v='+j.bgVersion;
    ART=j;CAST=j.cast||{};
    for(const k of new Set(Object.values(CAST)))loadSprite(k,(j.characters.find(c=>c.key===k)||{}).made);
    setOwner(j.ownerName||'사장님');
  }catch(e){}
  setTimeout(pollArt,10000);
}
pollArt();
async function pollArtOnce(){try{const j=await (await fetch('/api/art')).json();if(j.bgVersion!==ART.bgVersion&&j.bgVersion)BG.src='/art/background.png?v='+j.bgVersion;ART=j;CAST=j.cast||{}}catch(e){}}
function loadSprite(key,ver){
  if(SPRITES[key]&&SPRITES[key]._ver===ver)return;
  const sp={_ver:ver};
  for(const n of ['portrait','idle','work','walkA','walkB','raise','sleep','cheer','oops','tea','phone','wave']){const im=new Image();im.src=`/art/${key}/${n}.png${ver?'?v='+ver:''}`;sp[n]=im}
  SPRITES[key]=sp;
}
// 아직 id 를 모르는 세션은 이름으로도 짝짓는다
const CAST_BY_TITLE=[];   // [[/세션 이름 정규식/, '그림 이름'], …] 로 이름만 보고 짝지을 수 있다
function castKey(id){
  if(CAST[id])return CAST[id];
  const a=(typeof byId==='function')&&byId(id);
  if(a)for(const [rx,k] of CAST_BY_TITLE)if(rx.test(a.title||'')){if(!SPRITES[k])loadSprite(k);return k}
  // 코덱스·제미나이 주민은 따로 고르지 않으면 엔진 캐릭터(로고 인형을 든 소년)로
  if(a&&(a.engine==='codex'||a.engine==='gemini')){const k=a.engine;if(!SPRITES[k])loadSprite(k);return k}
  return null;
}
function sprite(id){const k=castKey(id);const sp=k&&SPRITES[k];return sp&&sp.idle.complete&&sp.idle.naturalWidth?sp:null}
const SPR_H=46;   // 그림 주민 키 (세계 좌표). 도트 주민은 24
// 일 끝 만세 때 머리 위로 터지는 반짝이·색종이
function drawConfetti(p,now,h){
  const t=1-(p.cheer-now)/2800, cols=['#ffd23f','#ff7aa8','#7ad3ff','#9be27a','#fff'];
  for(let i=0;i<10;i++){
    const a=i/10*6.28+i, r=6+t*16, x=p.x+Math.cos(a)*r, y=p.y-h-4+Math.sin(a)*r*0.7+t*t*10;
    ctx.globalAlpha=Math.max(0,1-t);ctx.fillStyle=cols[i%5];ctx.fillRect(x,y,1.6,1.6);
  }
  ctx.globalAlpha=1;
}
function drawSprite(sp,p,st,now){
  let im=sp.idle, jump=0, face=false;
  const ok=x=>x&&x.complete&&x.naturalWidth;
  const cheering=p.cheer&&now<p.cheer, waving=(p.wave&&now<p.wave)||(p.greet&&now<p.greet);
  // 걷기 두 장이 같은 그림이면(다리 모양이 안 바뀌는 주민) 번갈아 바꾸지 않고 한 장으로 통통 튀며 걷는다 → 깜빡임 없음
  const oneWalk=ok(sp.walkA)&&ok(sp.walkB)&&sp.walkA.naturalWidth===sp.walkB.naturalWidth&&sp.walkA.naturalHeight===sp.walkB.naturalHeight;
  if(forcedSleep(p.agent)&&!p.moving&&ok(sp.sleep))im=sp.sleep;   // 💤 강제로 재운 주민: 일하는 중이어도 자는 모습
  else if(p.moving){im=oneWalk?sp.walkA:(Math.floor(now/260)%2?sp.walkA:sp.walkB);if(oneWalk)jump=Math.abs(Math.sin(now/130))*1.6}
  else if(cheering){im=ok(sp.cheer)?sp.cheer:sp.raise;jump=Math.abs(Math.sin((p.cheer-now)/150))*7}   // 일 끝 → 만세 점프
  else if(waving){im=ok(sp.wave)?sp.wave:sp.raise;jump=Math.abs(Math.sin(now/120))*2;face=p.greet&&now<p.greet}
  else if(st==='wait')im=sp.raise;
  else if(st==='work')im=sp.work;
  else if(st==='stall')im=sp.oops;                 // 멈춤·오류 → 머리 긁적 당황
  else if(asleep(p.agent,st))im=sp.sleep;   // 자는 중: 쪼그려 앉아 눈 감은 그림 (없으면 서 있는 그림)
  else{const r=restPose(p,now);if(r!=='idle')im=sp[r]}   // 쉬는 중: 가끔 차·폰
  if(!ok(im))im=sp.idle;
  const s=SPR_H/sp.idle.naturalHeight, w=im.naturalWidth*s, h=im.naturalHeight*s;
  const bob=((!p.moving&&st==='work')?Math.sin(now/300)*0.6:0)-jump;
  if(cheering)drawConfetti(p,now,h);
  ctx.save();ctx.imageSmoothingEnabled=true;
  ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(p.x,p.y,w*0.32,2.2,0,0,7);ctx.fill();
  if(st==='wait'){const k=(Math.sin(now/180)+1)/2;ctx.fillStyle=`rgba(255,226,60,${.25+.35*k})`;ctx.beginPath();ctx.arc(p.x+w*0.18,p.y-h+4,5+k*3,0,7);ctx.fill()}
  // 걷기 그림은 오른쪽을 보고 있다 → 왼쪽으로 갈 때 뒤집는다
  if((p.moving||face)&&p.flip){ctx.translate(p.x,0);ctx.scale(-1,1);ctx.drawImage(im,-w/2,p.y-h+bob,w,h)}
  else ctx.drawImage(im,p.x-w/2,p.y-h+bob,w,h);
  ctx.restore();
  p.drawn={im,x:p.x-w/2,y:p.y-h+bob,w,h,flip:!!((p.moving||face)&&p.flip)};   // 누를 때 그림 모양으로 맞히려고 남긴다
  return h;
}

// 소품 그림 (코덱스 props 시트에서 잘라 낸 것)
const PROPS={};
for(const n of ['crown','mailbox','mailboxFlag','letter','sparkle','tree','flowers','sign']){const im=new Image();im.src=`/art/props/${n}.png`;PROPS[n]=im}
function propOk(n){const im=PROPS[n];return im&&im.complete&&im.naturalWidth>0}

// 클로드 앱의 그 세션 창 열기 (승인 창은 거기서 사장님이 직접 누른다)
function openInClaude(a){if(a&&a.link){location.href=a.link}}


// 부하 모두 떼어 놓기 / 모두 붙이기. 떼면 상관 둘레에 부채꼴로 벌려 세운다 (겹치지 않게)
function freeKids(lead,free){
  hideMenu();
  const L=people.get(lead);
  const kids=kidsOf(lead);
  let n=0;
  kids.forEach((k,i)=>{
    const p=people.get(k.id);
    if(free){
      if(!p)return;
      let x=p.x,y=p.y;
      if(L){const ang=-Math.PI*0.15+i*(Math.PI*1.3/Math.max(1,kids.length-1||1)), r=34+(i%2)*14;
        x=Math.max(10,Math.min(W-10,L.x+Math.cos(ang)*r*1.3));y=Math.max(30,Math.min(H-6,L.y+Math.sin(ang)*r*0.8))}
      k.pos={x,y,free:true};p.home={x,y};p.tx=x;p.ty=y;p.follower=false;p.justDropped=true;setTimeout(()=>p.justDropped=false,6000);
      savePos(k.id,x,y,true);n++;
    }else if(k.pos&&k.pos.free){k.pos=null;savePos(k.id,0,0,false);n++}
  });
  toast(free?`부하 ${n}명을 떼어 놓았습니다`:`부하 ${n}명이 다시 따라다닙니다`);
  if(openId)renderPanel();
}


// ---------- 사용량 (오른쪽 위) ----------
// 숫자를 한국식 단위로: 1.2억, 345만, 12만
function kn(n){n=+n||0;if(n>=1e8)return (n/1e8).toFixed(n>=1e9?0:1)+'억';if(n>=1e4)return Math.round(n/1e4)+'만';return String(n)}
function renderUsage(u){
  const box=document.getElementById('usage');if(!box||!u)return;
  const plan=u.plan, tok=u.tokens;
  let html='';
  if(plan&&plan.windows&&plan.windows.length){
    for(const w of plan.windows.filter(w=>w.percentUsed>0||/all models/i.test(w.label)).slice(0,3)){
      const pct=Math.max(0,Math.min(100,w.percentUsed||0));
      const name=/all models/i.test(w.label)?'주간 전체':/5-hour|5시간/i.test(w.label)?'5시간':w.label.replace('Weekly · ','주간 ');
      const left=(w.resetsIn||'').replace('d','일 ').replace('h','시간').replace('m','분');
      // 한 주 몫(월 요금 × 12/52) 중 얼마를 썼는지 원화로
      const st=(u.settings)||{}, wkWon=st.planKrw?st.planKrw*12/52:0;
      const wonTxt=/all models/i.test(w.label)&&wkWon?`<span class="uwk">한 주 ${won(wkWon)} 중 <b>${won(wkWon*pct/100)}</b></span>`:'';
      html+=`<div class="ur"><span class="un">${esc(name)}</span><span class="ub"><i style="width:${pct}%;background:${pct>85?'var(--alert)':pct>60?'#e0a23a':'var(--work)'}"></i></span><b>${pct}%</b>${wonTxt}<small>${esc(left)} 뒤 초기화</small></div>`;
      // 한 주에 쓸 수 있는 양을 API 정가로 치면: 초기화 이후 정가 환산 사용액 ÷ 사용 %
      if(/all models/i.test(w.label)&&w.usedUsd>0&&pct>=3){
        const rate=st.usdKrw||1400, used=w.usedUsd*rate, cap=used/(pct/100);
        html+=`<div class="ucap">📦 정가로 치면 한 주에 약 <b>${won(cap)}</b> 어치 쓸 수 있어요 · 지금까지 ${won(used)} (남은 ${won(cap-used)})</div>`;
      }
    }
  }else html+='<div class="ur"><small>요금제 사용량: 우체부가 읽어 오는 중…</small></div>';
  if(tok)html+=`<div class="ut">🪙 오늘 <b>${kn(tok.today)}</b> 토큰 (출력 ${kn(tok.todayOut)}) · 7일 ${kn(tok.week)}</div>`;
  else html+='<div class="ut"><small>토큰 세는 중…</small></div>';
  if(tok){
    const c=money(tok,null);
    html+=c.plan?`<div class="uw">💰 요금제 기준 오늘 <b>${won(c.plan.today)}</b> · 이번 주 ${won(c.plan.week)}</div>`
                :`<div class="uw">💰 요금제 기준: <a href="#" data-set="1">월 요금을 넣어 주세요</a></div>`;
    html+=`<div class="uw"><small>🧾 API 정가로 치면 오늘 ${won(c.api.today)} · 7일 ${won(c.api.week)}</small> <a href="#" data-set="1" title="월 요금·환율 바꾸기">⚙</a></div>`;
  }
  // 작게 보기(기본): 주간 % 막대 하나 + 오늘 금액. 누르면 자세히, 자세히에서 「접기」
  let open=false;try{open=localStorage.getItem('usageOpen')==='1'}catch(e){}
  if(!open){
    const wk=plan&&plan.windows&&plan.windows.find(w=>/all models/i.test(w.label));
    const pct=wk?Math.max(0,Math.min(100,wk.percentUsed||0)):null;
    const c=tok?money(tok,null):null;
    const today=c?(c.plan?c.plan.today:c.api.today):null;
    html=`<div class="umini" title="눌러서 자세히">🪙<span class="ub"><i style="width:${pct||0}%;background:${pct>85?'var(--alert)':pct>60?'#e0a23a':'var(--work)'}"></i></span><b>${pct==null?'…':pct+'%'}</b>${today!=null?`<small>오늘 ${won(today)}</small>`:''}</div>`;
  }else html=`<a href="#" class="ufold" title="작게 보기">▲ 접기</a>`+html;
  box.classList.toggle('mini',!open);
  if(box._h!==html&&!box.querySelector('.uset')){box.innerHTML=html;box._h=html;
    box.querySelectorAll('[data-set]').forEach(a=>a.onclick=e=>{e.preventDefault();e.stopPropagation();openMoneySettings()});
    const set=v=>{try{localStorage.setItem('usageOpen',v?'1':'0')}catch(e){};box._h='';renderUsage(USAGE)};
    const m=box.querySelector('.umini');if(m)m.onclick=()=>set(true);
    const f=box.querySelector('.ufold');if(f)f.onclick=e=>{e.preventDefault();set(false)};
  }
}

// ---------- 한화 환산 ----------
// 요금제 기준: (월 요금 × 12/52 = 한 주 몫) × 주간 사용 %. 오늘 몫과 세션 몫은 API 정가 비율로 나눈다(정확한 청구액이 아니라 추정).
// API 정가 기준: 응답마다 모델별 정가로 계산한 달러 × 환율.
let USAGE=null;
function won(v){if(v==null||isNaN(v))return'-';v=Math.round(v);return v>=10000?'₩'+(v/10000).toFixed(v>=1e6?0:1)+'만':'₩'+v.toLocaleString()}
function money(tok,sess){
  const st=(USAGE&&USAGE.settings)||{}, rate=st.usdKrw||1400;
  const tot=(USAGE&&USAGE.tokens)||tok;
  const src=sess||tok;
  const api={today:(src.todayUsd||0)*rate, week:(src.weekUsd||0)*rate};
  let plan=null;
  const wk=USAGE&&USAGE.plan&&USAGE.plan.windows&&USAGE.plan.windows.find(w=>/all models/i.test(w.label));
  if(st.planKrw&&wk&&tot&&tot.weekUsd>0){
    const weekCost=st.planKrw*12/52*(wk.percentUsed||0)/100;
    plan={week:weekCost*(src.weekUsd||0)/tot.weekUsd, today:weekCost*(src.todayUsd||0)/tot.weekUsd};
  }
  return {api,plan};
}
function openMoneySettings(){
  const box=document.getElementById('usage');const st=(USAGE&&USAGE.settings)||{};
  box.insertAdjacentHTML('beforeend',`<div class="uset">요금제 월 요금(원) <input id="usPlan" type="number" value="${st.planKrw||''}" placeholder="예: 300000">
    환율(원/달러) <input id="usRate" type="number" value="${st.usdKrw||1400}"><button id="usOk">저장</button><button id="usNo">취소</button></div>`);
  box.querySelector('#usNo').onclick=()=>{box.querySelector('.uset').remove();box._h=''};
  box.querySelector('#usOk').onclick=async()=>{
    await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planKrw:box.querySelector('#usPlan').value,usdKrw:box.querySelector('#usRate').value})});
    box.querySelector('.uset').remove();box._h='';poll(true);toast('저장했어요');
  };
}


// ---------- 폰으로 보기 ----------
async function showPhone(){
  const dlg=document.getElementById('confirm');
  let j={};try{j=await (await fetch('/api/phone')).json()}catch(e){}
  if(j.error){toast(j.error);return}
  if(!j.on){
    // 기본은 이 맥 안에서만 열린다. 켜면 같은 와이파이·테일스케일 기기가 열쇠 달린 주소로 들어올 수 있다
    dlg.innerHTML=`<div class="cbox"><h3>📱 폰으로 마을 보기</h3>
      <p>지금은 마을이 <b>이 맥 안에서만</b> 열려요. 켜면 같은 와이파이(또는 테일스케일)에 있는 폰이 열쇠 달린 주소로 들어올 수 있어요.</p>
      <p style="font-size:12px;opacity:.8">집 와이파이 주소는 <b>암호화가 없어서</b> 같은 와이파이에 있는 사람이 마음먹으면 열쇠를 엿볼 수 있어요. 그래서 카페·회사·공용 와이파이에서는 켜지 마세요. 테일스케일 주소는 암호화돼서 더 안전해요. 켜면 마을이 몇 초 동안 다시 켜집니다.</p>
      <div class="cbtn"><button data-c="no">닫기</button><button data-c="on">폰 접속 켜기</button></div></div>`;
    dlg.style.display='flex';
    dlg.onclick=async e=>{const c=e.target.dataset.c;if(e.target===dlg||c==='no'){dlg.style.display='none';return}
      if(c==='on'){await mbPost('/api/settings',{phone:true});dlg.style.display='none';toast('폰 접속을 켰어요. 마을이 다시 켜지는 중… 몇 초 뒤 다시 눌러 주세요')}};
    return}
  if(!j.url){toast('이 맥의 와이파이 주소를 못 찾았어요');return}
  dlg.innerHTML=`<div class="cbox"><h3>📱 폰으로 마을 보기</h3>
    <p>폰이 <b>집 와이파이</b>에 붙어 있으면, 폰 카메라로 아래 그림을 찍거나 주소를 여세요. 한 번 열면 폰이 기억합니다.</p>
    <div class="ptabs"><button data-t="home" class="on">🏠 집 와이파이</button><button data-t="out">🌍 집 밖 (테일스케일)</button></div>
    <div id="qr" style="display:flex;justify-content:center;margin:10px 0;min-height:190px;align-items:center"></div>
    <p id="purl" style="font-size:12px;word-break:break-all;background:#fff;border:1px solid var(--line);border-radius:6px;padding:5px"></p>
    <p id="pnote" style="font-size:12px;opacity:.8"></p>
    <p style="font-size:11.5px;opacity:.7">주소에는 열쇠가 들어 있어요. 다른 사람에게 보내지 마세요.</p>
    <div class="cbtn"><button data-c="off">폰 접속 끄기</button><button data-c="reset">열쇠 새로 만들기</button><button data-c="copy">주소 복사</button><button data-c="no">닫기</button></div></div>`;
  dlg.style.display='flex';
  let cur=j.url;
  const show=t=>{
    dlg.querySelectorAll('[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
    const qr=document.getElementById('qr');qr.innerHTML='';
    if(t==='home'){cur=j.url;document.getElementById('pnote').textContent='폰이 집 와이파이에 붙어 있을 때 쓰는 주소예요. 암호화가 없으니 우리 집 와이파이에서만 쓰세요. 누가 엿본 것 같으면 「열쇠 새로 만들기」를 누르세요.'}
    else{cur=j.tsUrl;document.getElementById('pnote').innerHTML=j.tsUrl
      ?'폰에 <b>테일스케일 앱</b>을 깔고 맥과 <b>같은 계정</b>으로 로그인한 뒤 이 주소를 여세요. LTE·밖 와이파이 어디서나 열립니다.'
      :(j.tsInstalled?'맥의 <b>테일스케일이 로그아웃</b> 상태예요. 맥 위쪽 메뉴 막대의 테일스케일 아이콘 → 로그인 하면 여기에 바깥 주소가 생깁니다. 폰에도 테일스케일 앱을 깔고 같은 계정으로 로그인하세요.'
        :'이 맥에 테일스케일이 없어요.')}
    document.getElementById('purl').textContent=cur||'(아직 주소 없음)';
    if(!cur)return;
    const draw=()=>{try{new QRCode(qr,{text:cur,width:190,height:190})}catch(e){qr.textContent='(그림을 못 그렸어요. 주소를 직접 여세요)'}};
    if(window.QRCode)draw();else{const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';sc.onload=draw;sc.onerror=draw;document.head.append(sc)}
  };
  show('home');
  dlg.onclick=async e=>{const c=e.target.dataset.c;if(e.target.dataset.t){show(e.target.dataset.t);return}
    if(e.target===dlg||c==='no'){dlg.style.display='none';return}
    if(c==='off'){await mbPost('/api/settings',{phone:false});dlg.style.display='none';toast('폰 접속을 껐어요. 이제 이 맥 안에서만 열려요');return}
    if(c==='reset'){await mbPost('/api/settings',{phoneReset:true});dlg.style.display='none';toast('열쇠를 새로 만들었어요. 폰에서는 새 주소로 다시 들어오세요');return}
    if(c==='copy'&&cur){try{await navigator.clipboard.writeText(cur);toast('주소를 복사했어요')}catch(err){toast('복사 실패')}}};
}
window.showPhone=showPhone;

// ---------- 파일을 창 아무 데나 떨어뜨려도 앱이 그 파일로 넘어가 버리지 않게 ----------
// (앱 창은 파일을 놓으면 그 파일을 열어 버린다. 대화창이 열려 있으면 거기 첨부로 받는다)
addEventListener('dragover',e=>{e.preventDefault()});
addEventListener('drop',e=>{e.preventDefault();if(e.target.closest&&e.target.closest('#order'))return;if(openId&&e.dataTransfer&&e.dataTransfer.files.length){addFiles([...e.dataTransfer.files]);toast('첨부했어요')}});

// ---------- 터치 (폰·패드) ----------
// 손가락으로 끌면 주민 옮기기, 길게 누르면 우클릭 메뉴. 마우스 처리 코드를 그대로 쓴다
(function touch(){
  let lp=null, start=null;
  const fake=(type,t,target)=>(target||window).dispatchEvent(new MouseEvent(type,{clientX:t.clientX,clientY:t.clientY,bubbles:true,button:0}));
  cv.addEventListener('touchstart',e=>{
    if(e.touches.length!==1)return;
    const t=e.touches[0];start={x:t.clientX,y:t.clientY};
    lp=setTimeout(()=>{lp=null;drag=null;const id=pickAt(t);if(id){showMenu(t.clientX,t.clientY,id)}},550);
    fake('mousedown',t,cv);
  },{passive:true});
  cv.addEventListener('touchmove',e=>{
    const t=e.touches[0];if(!t)return;
    if(start&&Math.hypot(t.clientX-start.x,t.clientY-start.y)>8&&lp){clearTimeout(lp);lp=null}
    if(drag){e.preventDefault();fake('mousemove',t)}
  },{passive:false});
  cv.addEventListener('touchend',e=>{
    const t=e.changedTouches[0];
    if(lp){clearTimeout(lp);lp=null}
    if(drag)fake('mouseup',t);
    start=null;
  });
})();

function moneyLine(a,long){
  const c=money(null,a.tokens);
  if(c.plan)return `요금제 기준 오늘 ${won(c.plan.today)}${long?' · 7일 '+won(c.plan.week):''}`;
  return `정가 환산 오늘 ${won(c.api.today)}${long?' · 7일 '+won(c.api.week):''}`;
}


// ---------- ⬆ 이전 대화 더 보기 ----------
// 평소엔 3초마다 기록 끝(16개)만 읽는다. 버튼을 누를 때만 서버가 그 주민 기록을 더 거슬러 읽어 30개씩 얹는다.
const HIST={};
async function loadOlder(id){
  const a=byId(id);if(!a)return;
  const cur=HIST[id];if(cur&&cur.busy)return;
  const have=cur?cur.list.length:(a.recent||[]).length;
  HIST[id]=Object.assign(cur||{list:a.recent||[],more:true},{busy:true});if(openId===id)renderPanel();
  try{
    const r=await (await fetch('/api/history?id='+encodeURIComponent(id)+'&have='+have)).json();
    const log=document.getElementById('log'),before=log?log.scrollHeight-log.scrollTop:0;
    HIST[id]={list:r.recent||[],more:!!r.more,busy:false};
    if(openId===id)renderPanel();
    if(log&&log._id===id)log.scrollTop=log.scrollHeight-before;   // 보던 자리 그대로
  }catch(e){HIST[id]={...HIST[id],busy:false};toast('이전 대화를 못 불러왔어요')}
}

// ---------- 🎨 캐릭터 만들기·바꾸기 ----------
// 설명을 쓰면 그대로, 비워 두면 세션 이름·하는 일에서 알아서 떠올려 그린다. 이미 그려 둔 캐릭터로 바꿔 끼울 수도 있다.
function openArt(id){
  hideMenu();
  const a=byId(id);if(!a)return;
  const cur=CAST[id];
  const dlg=document.getElementById('confirm');
  // 이 그림을 지금 누가 입고 있는지 그림 아래에 적는다 (11-26 사장님: 헷갈려)
  const users=k=>Object.keys(CAST).filter(i=>CAST[i]===k&&byId(i)).map(i=>i===id?'이 주민':short(nameOf(i),10));
  const list=(ART.characters||[]).map(c=>{const u=users(c.key);return `<button class="achar${c.key===cur?' on':''}" data-key="${c.key}" title="${esc(c.name||c.desc||c.key)}${u.length?' — 쓰는 중: '+esc(u.join(', ')):''}"><img src="/art/${c.key}/portrait.png${c.made?'?v='+c.made:''}"><small>${esc(short(c.name||c.desc||c.key,14))}</small>${u.length?`<small class="auser">👤 ${esc(u.length>2?u.slice(0,2).join(', ')+' 외 '+(u.length-2):u.join(', '))}</small>`:''}</button>`}).join('');
  const who=ART.artist==='codex'?'코덱스(이 맥)':ART.artist&&ART.artist.startsWith('session:')?`「${esc(short(nameOf(ART.artist.slice(8)),14))}」 세션(제미나이)`:'아직 안 정함 — ⚙ 마을 설정';
  dlg.innerHTML=`<div class="cbox" style="width:min(560px,94vw)"><h3>🎨 「${esc(short(a.title,18))}」 캐릭터</h3>
    <p style="font-size:12.5px">새로 그리기 — 어떤 아이였으면 좋겠는지 쓰세요. <b>비워 두면 세션 이름과 하는 일을 보고 알아서</b> 그립니다.</p>
    <textarea id="artDesc" placeholder="예: 은발 단발, 헤드폰, 노트북을 든 차분한 프로그래머 소녀"></textarea>
    <p style="font-size:11.5px;opacity:.7">그리는 사람: ${who} · 1~3분 걸리고, 다 되면 그 주민이 새 그림으로 바뀝니다.</p>
    <div class="artman"><b>직접 그려 오기</b> (제미나이·챗GPT 등 아무 이미지 도구)<br>
      ① <button data-c="copy">📋 그림 설명 복사</button> → ② 그 도구에 붙여 넣어 그림 받기 → ③ 받은 그림을 여기에 끌어다 놓거나 <button data-c="file">🖼 그림 올리기</button>
      <input type="file" id="artFile" accept="image/*" style="display:none">
      <textarea id="artPrompt" readonly style="display:none;height:70px;font-size:11px"></textarea></div>
    ${list?`<p style="font-size:12.5px;margin-top:10px">또는 이미 그려 둔 캐릭터로 바꾸기</p><div class="agrid">${list}</div>`:''}
    <div class="cbtn">${cur?'<button data-c="none">도트로 되돌리기</button>':''}<button data-c="no">닫기</button><button data-c="new">✏️ 새로 그리기</button></div>
    <div class="cnote"></div></div>`;
  dlg.style.display='flex';
  const note=dlg.querySelector('.cnote');
  // 그려 온 그림 받기: 파일 고르기 또는 끌어다 놓기 → 마을이 6칸을 잘라 입힌다
  const upload=async f=>{
    if(!f||!/^image\//.test(f.type||'')&&!/\.(png|jpe?g|webp|heic)$/i.test(f.name||'')){note.textContent='그림 파일을 올려 주세요';return}
    if(f.size>25e6){note.textContent='25MB 넘는 그림은 못 올려요';return}
    note.textContent='그림을 자르는 중… (몇 초)';
    const data=await new Promise(res=>{const rd=new FileReader();rd.onload=()=>res(rd.result);rd.readAsDataURL(f)});
    const r=await mbPost('/api/art/upload-sheet',{id,name:f.name,data,desc:dlg.querySelector('#artDesc').value});
    if(r.ok){CAST[id]=r.key;loadSprite(r.key);pollArt();toast('🎨 새 캐릭터를 입혔어요');note.textContent='입혔어요!';setTimeout(()=>dlg.style.display='none',900)}
    else note.textContent='못 입혔어요: '+(r.error||'');
  };
  dlg.querySelector('#artFile').onchange=e=>upload(e.target.files[0]);
  dlg.ondragover=e=>{e.preventDefault()};
  dlg.ondrop=e=>{e.preventDefault();upload(e.dataTransfer.files[0])};
  dlg.onclick=async e=>{
    const b=e.target.closest('button');
    if(e.target===dlg||(b&&b.dataset.c==='no')){dlg.style.display='none';return}
    if(!b)return;
    if(b.dataset.key){await mbPost('/api/art/assign',{id,key:b.dataset.key});CAST[id]=b.dataset.key;loadSprite(b.dataset.key);toast('캐릭터를 바꿨어요');dlg.style.display='none';pollArt();return}
    if(b.dataset.c==='copy'){
      const r=await mbPost('/api/art/prompt',{id,desc:dlg.querySelector('#artDesc').value});
      if(!r.ok){note.textContent='설명을 못 만들었어요: '+(r.error||'');return}
      const ta=dlg.querySelector('#artPrompt');ta.value=r.prompt;ta.style.display='block';ta.select();
      let ok=false;try{await navigator.clipboard.writeText(r.prompt);ok=true}catch(e){try{ok=document.execCommand('copy')}catch(e2){}}
      note.textContent=ok?'📋 복사했어요. 이미지 도구에 붙여 넣어 그림을 받은 뒤 여기에 올려 주세요.':'아래 글을 전부 복사해서(⌘A → ⌘C) 이미지 도구에 붙여 넣어 주세요.';return}
    if(b.dataset.c==='file'){dlg.querySelector('#artFile').click();return}
    if(b.dataset.c==='none'){await mbPost('/api/art/assign',{id,key:null});delete CAST[id];toast('도트 그림으로 되돌렸어요');dlg.style.display='none';return}
    if(b.dataset.c==='new'){
      b.disabled=true;note.textContent='그리기를 맡기는 중…';
      const r=await mbPost('/api/art/character',{id,desc:dlg.querySelector('#artDesc').value});
      if(r.ok){note.textContent=r.artist==='codex'?'코덱스가 그리는 중이에요 (1~3분). 창을 닫아도 됩니다.':'그림 담당 세션에 부탁했어요. 다 그리면 바뀝니다.';toast('🎨 그리기 시작');pollArt();setTimeout(()=>dlg.style.display='none',1600)}
      else{note.textContent='못 맡겼어요: '+(r.error||'');b.disabled=false}
    }
  };
}

// ---------- 🖼 배경 바꾸기 ----------
function openBackground(){
  const dlg=document.getElementById('confirm');
  dlg.innerHTML=`<div class="cbox" style="width:min(560px,94vw)"><h3>🖼 마을 배경</h3>
    <img src="/art/background.png?v=${ART.bgVersion||0}" style="width:100%;border-radius:8px;border:2px solid var(--line)">
    ${(ART.backgrounds||[]).length>1||(ART.backgrounds||[]).some(b=>b.from)?`<p style="font-size:12.5px;margin-top:8px"><b>배경 모음</b> — 눌러서 바꾸기</p><div class="bggrid">${(ART.backgrounds||[]).map(b=>`<button class="bgc${b.current?' on':''}" data-bg="${esc(b.id)}" title="${esc(b.name)}"><img src="/art/backgrounds/${esc(b.id)}.png"><small>${esc(b.name)}</small>${b.current?'':`<i data-bgdel="${esc(b.id)}" title="모음에서 빼기">✕</i>`}</button>`).join('')}</div>`:''}
    <p style="font-size:12.5px;margin-top:8px"><b>내 그림으로 바꾸기</b> — 가로로 긴 그림 파일을 고르세요.</p>
    <label class="clip">🖼 그림 파일 고르기<input type="file" id="bgFile" accept="image/*" hidden></label>
    <p style="font-size:12.5px;margin-top:10px"><b>새로 그리기</b> — 원하는 분위기를 쓰세요(비우면 기본 마을).</p>
    <textarea id="bgDesc" placeholder="예: 벚꽃이 핀 봄 마을, 해 질 녘"></textarea>
    <div class="cbtn"><button data-c="no">닫기</button><button data-c="draw">✏️ 새로 그리기</button></div>
    <div class="cnote"></div></div>`;
  dlg.style.display='flex';
  const note=dlg.querySelector('.cnote');
  dlg.querySelector('#bgFile').onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    const rd=new FileReader();rd.onload=async()=>{note.textContent='바꾸는 중…';const r=await mbPost('/api/art/background',{data:rd.result,name:f.name});
      if(r.ok){toast('배경을 바꿨어요');dlg.style.display='none';pollArt()}else note.textContent='못 바꿨어요: '+(r.error||'')};rd.readAsDataURL(f);
  };
  dlg.onclick=async e=>{
    const del=e.target.closest('[data-bgdel]');
    if(del){e.stopPropagation();if(confirm('이 배경을 모음에서 뺄까요?')){await mbPost('/api/art/bg-remove',{id:del.dataset.bgdel});await pollArtOnce();openBackground()}return}
    const b=e.target.closest('button');
    if(e.target===dlg||(b&&b.dataset.c==='no')){dlg.style.display='none';return}
    if(b&&b.dataset.bg){const r=await mbPost('/api/art/bg-use',{id:b.dataset.bg});if(r.ok){toast('배경을 바꿨어요');await pollArtOnce();openBackground()}else note.textContent='못 바꿨어요: '+(r.error||'');return}
    if(b&&b.dataset.c==='draw'){b.disabled=true;note.textContent='그리기를 맡기는 중…';
      const r=await mbPost('/api/art/background',{desc:dlg.querySelector('#bgDesc').value});
      if(r.ok){note.textContent='그리는 중이에요. 다 되면 배경이 바뀝니다 (지금 배경은 따로 보관).';setTimeout(()=>dlg.style.display='none',1600)}
      else{note.textContent='못 맡겼어요: '+(r.error||'');b.disabled=false}}
  };
}
window.openBackground=openBackground;

// ---------- ⚙ 마을 설정 (호칭, 그림 담당) ----------
function openSettings(){
  const dlg=document.getElementById('confirm');
  const sess=agents.filter(a=>!a.native).map(a=>`<option value="session:${a.id}" ${ART.artist==='session:'+a.id?'selected':''}>${esc(short(a.title,30))}</option>`).join('');
  dlg.innerHTML=`<div class="cbox"><h3>⚙ 마을 설정</h3>
    <p>나를 부르는 말 <input id="stOwner" value="${esc(ART.ownerName||'사장님')}" style="width:120px"></p>
    <p>그림 그리는 사람<br><select id="stArtist" style="max-width:100%"><option value="codex" ${ART.artist==='codex'?'selected':''}>코덱스 (이 맥의 codex 명령)</option>${sess}</select>
    <br><small style="opacity:.7">세션을 고르면 그 세션에게 제미나이 등으로 그려 달라고 부탁합니다.</small></p>
    <div class="cbtn"><button data-c="no">닫기</button><button data-c="yes">저장</button></div></div>`;
  dlg.style.display='flex';
  dlg.onclick=async e=>{
    const c=e.target.dataset.c;if(e.target===dlg||c==='no'){dlg.style.display='none';return}
    if(c==='yes'){await mbPost('/api/settings',{ownerName:dlg.querySelector('#stOwner').value,artist:dlg.querySelector('#stArtist').value});dlg.style.display='none';toast('저장했어요');pollArt()}
  };
}
window.openSettings=openSettings;
window.askSpawn=askSpawn;

// ---------- 호칭: 화면의 「사장님」을 설정한 이름으로 ----------
let OWNER='사장님';
function swapOwner(node,from,to){
  const w=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let t;
  while((t=w.nextNode()))if(t.nodeValue.includes(from))t.nodeValue=t.nodeValue.split(from).join(to);
  if(node.querySelectorAll)node.querySelectorAll('[placeholder],[title]').forEach(el=>{for(const k of ['placeholder','title'])if(el.getAttribute(k)&&el.getAttribute(k).includes(from))el.setAttribute(k,el.getAttribute(k).split(from).join(to))});
}
function setOwner(name){
  if(!name||name===OWNER)return;
  const old=OWNER;OWNER=name;swapOwner(document.body,old,name);swapOwner(document.body,'사장님',name);
}
new MutationObserver(ms=>{if(OWNER==='사장님')return;for(const m of ms)for(const n of m.addedNodes){if(n.nodeType===3){if(n.nodeValue.includes('사장님'))n.nodeValue=n.nodeValue.split('사장님').join(OWNER)}else if(n.nodeType===1)swapOwner(n,'사장님',OWNER)}})
  .observe(document.body,{childList:true,subtree:true});


function openCs(){}window.openCs=openCs;


// ---------- 주민끼리 대화 연출 ----------
// 마을을 거친 주민끼리의 말(서로 묻기·피클 편지·세션끼리 메시지)을, 보낸 주민이 받는 주민 옆으로 걸어가 말풍선으로 말하게 한다.
// 🔊 를 켜면 주민마다 다른 목소리로 읽는다. 🎬 다시 보기는 지난 대화를 기다림 없이 이어서 다시 보여 준다(촬영용).
let FILM_ON=false, TALK_SINCE=Date.now()-5000, TALKQ=[], talkBusy=false, TALK_VOICE=false;
// 대화 소리(맥 음성 읽기)는 뺐다 — 주민마다 다른 목소리를 불러 맥 음성 엔진이 메모리·CPU 를 먹었다 (2026-11-26)
async function pollTalks(){
  try{const j=await (await fetch('/api/talks?since='+TALK_SINCE)).json();
    for(const t of (j.talks||[])){TALK_SINCE=Math.max(TALK_SINCE,t.at);TALKQ.push(t)}runTalks()}catch(e){}
  setTimeout(pollTalks,3000);
}
function runTalks(){
  if(talkBusy)return;const t=TALKQ.shift();if(!t)return;
  talkBusy=true;playTalk(t).then(()=>{talkBusy=false;setTimeout(runTalks,400)});
}
function playTalk(t){return new Promise(res=>{
  // 피클 편지는 피클 캐릭터(그림 pickle 을 입은 주민)가 들고 가고, 피클에게 가는 답장은 그 캐릭터에게 걸어가 건넨다
  const pk=pickleActor();
  const to=t.to==='pickle'?pk:people.get(t.to);
  let from=t.from==='pickle'?pk:people.get(t.from);
  let text=t.text||'';
  if(t.from==='pickle')text='🥒 편지 왔어요: '+text;
  if(t.to==='pickle')text='🥒 피클에게 답장: '+text;
  if(!to||!from||from===to||from.talk){res();return}
  from.talk={to:t.to==='pickle'?to.agent.id:t.to,text:short(text,70),phase:'walk',at:performance.now(),done:res};
  setTimeout(()=>{if(from.talk&&from.talk.done===res)endTalk(from)},20000);   // 무슨 일이 있어도 20초면 끝
})}
function pickleActor(){
  for(const p of people.values())if(castKey(p.agent.id)==='pickle')return p;
  return people.get(mail.relayId);
}
function talkStep(p,dt,now){
  const tk=p.talk, q=people.get(tk.to);
  if(!q){endTalk(p);return false}
  const side=p.x<q.x?-1:1, fx=q.x+side*15, fy=q.y+2;
  q.hold=now+1500;   // 듣는 주민은 멈춰 기다린다
  if(tk.phase==='walk'){
    const dx=fx-p.x, dy=fy-p.y, d=Math.hypot(dx,dy);
    if(d>1.5&&now-tk.at<12000){const sp=Math.max(38,d*1.2)*dt;p.x+=dx/d*Math.min(sp,d);p.y+=dy/d*Math.min(sp,d);p.moving=true;p.flip=dx<0;return true}
    if(d>1.5){p.x=fx;p.y=fy}   // 화면이 가려져 그림이 느려도 말할 때는 꼭 옆에 붙어 있게
    tk.phase='say';p.moving=false;p.flip=q.x<p.x;q.letterAt=now;tk.until=now+Math.max(3200,tk.text.length*110);
  }
  if(tk.phase==='say'){p.moving=false;if(now<tk.until)return true;endTalk(p);return false}
  return false;
}
function endTalk(p){
  const tk=p.talk;if(!tk)return;p.talk=null;
  p.tx=p.home.x;p.ty=p.home.y;p.nextMove=performance.now()+2500;
  if(tk.done)tk.done();
}
// 주민마다 목소리·높낮이·빠르기를 정해 둔다 (같은 주민은 늘 같은 목소리)
async function replayTalks(){
  document.getElementById('hud').classList.remove('open');
  try{const j=await (await fetch('/api/talks?since='+(Date.now()-6*3600e3))).json();
    const list=(j.talks||[]).filter(t=>(t.to==='pickle'||people.has(t.to))&&(t.from==='pickle'||people.has(t.from))&&pickleActor()).slice(-12);
    if(!list.length){toast('다시 보여 줄 대화가 없어요 (지난 6시간)');return}
    toast(`🎬 지난 대화 ${list.length}개를 다시 보여 줘요`);TALKQ.push(...list);runTalks();
  }catch(e){toast('다시 보기 실패')}
}
window.replayTalks=replayTalks;
pollTalks();

// ---------- 🎬 촬영 모드 ----------
// 켜면 서버가 숨길 주민을 처음부터 안 보낸다. 여기서는 누구를 숨길지·잠글지 고르고 켜고 끈다.
// 촬영 모드·마을 북적이게는 촬영이 끝나 뺐다 (2026-11-26)


// ---------- 마을 녹화: 맥 앱이 마을 창 화면 + 맥 마이크 + 마을 소리를 한 파일로 찍는다 (싱크 자동) ----------
let recT0=0, recTick=0;
function toggleRec(){
  const h=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.rec;
  if(!h){toast('녹화는 맥 앱 「에이전트빌리지」 창에서만 됩니다');return}
  h.postMessage('toggle');
}
window.recState=function(st,msg){
  const b=document.getElementById('recBtn');if(!b)return;
  clearInterval(recTick);
  if(st==='rec'){
    recT0=Date.now();b.classList.add('recon');
    const draw=()=>{const s=Math.floor((Date.now()-recT0)/1000);b.textContent=`⏹ 녹화 멈추기 · ${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`};
    draw();recTick=setInterval(draw,500);toast('🔴 '+msg);
  }else{
    b.classList.remove('recon');b.textContent='⏺ 마을 녹화';
    if(st==='starting'||st==='saving'){b.textContent=msg}
    else if(st==='saved'){toast('💾 저장했어요: '+msg.split('/').slice(-2).join('/'))}
    else if(st==='error'){alert(msg)}
  }
};

// ---------- 이웃 빌리지: 다른 맥의 빌리지와 편지·파일·캐릭터·배경·부탁 주고받기 ----------
let NB={enabled:false,inbox:[],peers:[],unread:0,share:[]};
async function pollNeighbor(){
  try{NB=await (await fetch('/api/neighbor')).json();const b=document.getElementById('nbN');if(b)b.textContent=NB.unread?NB.unread:'';
    if(nbOpen)renderNeighbor()}catch(e){}
  setTimeout(pollNeighbor,NB.enabled?20000:60000);
}
setTimeout(pollNeighbor,3000);
let nbOpen=false;
// 이웃 빌리지 손님을 누르면: 편지면 읽음으로(손님이 돌아간다), 부탁이면 그대로 두고 이웃 빌리지 창을 연다
async function openGuest(g){
  for(const lid of (g.letterIds||(g.letterKind==='letter'?[g.letterId]:[]))){try{await fetch('/api/neighbor/act',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:lid,act:'read'})})}catch(e){}}   // 들고 온 편지 전부 읽음
  openNeighbor();
}
function openNeighbor(){nbOpen=true;document.getElementById('hud').classList.remove('open');renderNeighbor(true)}
const NB_KIND={letter:'✉️ 편지',request:'🙏 부탁',character:'🎁 캐릭터 선물',background:'🖼 배경 선물'};
function nbWhen(s){if(!s)return'';const d=new Date(s*1000);return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function renderNeighbor(fresh){
  const dlg=document.getElementById('confirm');
  if(!fresh&&dlg.style.display!=='flex')return;
  if(!fresh&&dlg.contains(document.activeElement)&&/TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName))return;   // 쓰는 중엔 다시 그리지 않음
  let h=`<div class="cbox nbbox" style="width:min(680px,96vw)"><h3>🏘 이웃 빌리지</h3>`;
  if(!NB.enabled){
    h+=`<p style="font-size:13px;line-height:1.6">다른 맥의 에이전트빌리지와 편지·파일·캐릭터·배경·부탁을 주고받습니다.<br>
      ① 깃허브에서 <b>비공개 저장소</b>를 하나 만들고 상대를 초대합니다.<br>② 두 맥 모두 그 저장소를 내려받습니다(clone). 예: <code>~/Documents/village-neighbor</code><br>③ 그 폴더와 내 빌리지 이름을 넣고 「연결」.</p>
      <p><input id="nbRepo" placeholder="저장소 폴더 (예: ~/Documents/village-neighbor)" value="${esc(NB.repo||'')}" style="width:100%"></p>
      <p><input id="nbName" placeholder="내 빌리지 이름 (예: 햇살 빌리지)" style="width:100%"></p>
      <div class="cbtn"><button data-c="no">닫기</button><button data-c="setup">🔗 연결</button></div><div class="cnote">${esc(NB.error||'')}</div></div>`;
  }else{
    const peers=NB.peers||[];
    const peerOpt=peers.map(p=>`<option value="${esc(p.id)}">${esc(p.name||p.id)}</option>`).join('');
    const pr=peers[0]||null;
    const resOpt=p=>(Array.isArray(p&&p.residents)?p.residents:[]).map(r=>`<option value="${esc(r.id)}">${esc(r.title)}</option>`).join('');
    const chars=(ART.characters||[]).map(c=>`<option value="${esc(c.key)}">${esc(c.name||c.key)}</option>`).join('');
    const bgs=(ART.backgrounds||[]).map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
    h+=`<div style="font-size:12px;opacity:.75">내 빌리지 「${esc(NB.me.name||'')}」 · 마지막으로 주고받음 ${NB.lastSync?ago(NB.lastSync*1000):'아직'} ${NB.error?`· <span style="color:var(--alert)">${esc(NB.error)}</span>`:''}
      <button class="mini" data-c="sync">🔄 지금 주고받기</button></div>`;
    h+=peers.length?`<div class="nbpeers">${peers.map(p=>`<span class="pill" style="background:#7b5fb8">🏘 ${esc(p.name)} · 공개 주민 ${Array.isArray(p.residents)?p.residents.length:0}명 · ${ago((Number(p.updated)||0)*1000)}</span>`).join(' ')}</div>`
      :`<p style="font-size:12.5px;color:var(--alert)">아직 상대 빌리지가 안 보여요. 상대 맥에서도 같은 저장소로 연결하면 여기 나타납니다.</p>`;
    h+=`<details ${fresh?'open':''} class="nbsec"><summary>✏️ 보내기</summary>
      <p>받는 빌리지 <select id="nbTo">${peerOpt}</select>
        <label><input type="radio" name="nbKind" value="letter" checked> ✉️ 주인에게 편지</label>
        <label><input type="radio" name="nbKind" value="request"> 🙏 주민에게 부탁</label>
        <select id="nbRes" style="display:none">${resOpt(pr)||'<option value="">(공개한 주민 없음)</option>'}</select></p>
      <input id="nbSubj" placeholder="제목 (없어도 됨)" style="width:100%">
      <textarea id="nbText" placeholder="할 말" style="width:100%;height:80px"></textarea>
      <p><label class="clip">📎 파일 붙이기<input type="file" id="nbFiles" multiple hidden></label> <span id="nbFileList" style="font-size:12px"></span></p>
      <div class="cbtn"><button data-c="send">📮 보내기</button></div>
      <p style="margin-top:8px">🎁 선물: <select id="nbChar">${chars}</select> <button class="mini" data-c="gchar">캐릭터 보내기</button>
        &nbsp; <select id="nbBg">${bgs}</select> <button class="mini" data-c="gbg">배경 보내기</button></p></details>`;
    const inbox=NB.inbox||[];
    h+=`<div class="nbsec"><b>📬 받은 것 ${inbox.length?`(${NB.unread} 새것)`:''}</b>${inbox.length?inbox.map(it=>{
      const fr=it.from||{};
      const files=(it.files||[]).map(n=>`<a href="/api/neighbor/file?id=${encodeURIComponent(it.id)}&name=${encodeURIComponent(n)}" target="_blank" data-view="/api/neighbor/file?id=${encodeURIComponent(it.id)}&name=${encodeURIComponent(n)}" data-vname="${esc(n)}">📎 ${esc(n)}</a>`).join(' ');
      const acts=it.kind==='request'&&it.state==='new'?`<button class="mini" data-act="deliver" data-id="${esc(it.id)}">➡️ 전달하기</button><button class="mini" data-act="dismiss" data-id="${esc(it.id)}">안 전할래</button>`
        :it.state==='new'?`<button class="mini" data-act="read" data-id="${esc(it.id)}">✔ 읽음</button>`:`<small style="opacity:.6">${{read:'읽음',delivered:'전달함',dismissed:'안 전함',done:'받아 둠'}[it.state]||''}</small>`;
      const extra=it.kind==='character'&&it.installed?'<small>→ 「캐릭터 바꾸기」 목록에 들어왔어요</small>':it.kind==='background'&&it.installed?'<small>→ 「배경 바꾸기」 모음에 들어왔어요</small>':it.error?`<small style="color:var(--alert)">${esc(it.error)}</small>`:'';
      const toName=it.toSession?((agents.find(a=>a.id===it.toSession)||{}).title||'?'):'';
      return `<div class="nbit${it.state==='new'?' new':''}"><div><b>${NB_KIND[it.kind]||'✉️'}</b> · ${esc(fr.name||'')}${fr.sessionTitle?' 「'+esc(fr.sessionTitle)+'」':''}${toName?' → '+esc(toName):''} · <small>${nbWhen(it.at)}</small> ${acts}</div>
        ${it.subject?`<div><b>${esc(it.subject)}</b></div>`:''}${it.text?`<div class="nbtxt">${esc(it.text)}</div>`:''}${files?`<div>${files}</div>`:''}${extra}</div>`}).join(''):'<div style="opacity:.6;padding:6px">아직 없어요</div>'}</div>`;
    const sent=NB.sent||[];
    if(sent.length)h+=`<details class="nbsec"><summary>📤 보낸 것 ${sent.length}</summary>${sent.map(s=>`<div class="nbit"><b>${NB_KIND[s.kind]||''}</b> · <small>${nbWhen(s.at)}</small> ${esc(s.subject||'')} ${esc((s.text||'').slice(0,80))}${(s.files||[]).length?` · 📎${s.files.length}`:''}</div>`).join('')}</details>`;
    h+=`<p style="font-size:11.5px;opacity:.7">상대에게는 내가 「🏘 이웃에게 공개」한 주민만 보입니다(주민 우클릭). 이웃의 부탁은 내가 「전달하기」를 눌러야 그 주민에게 들어가요.</p>
      <div class="cbtn"><button data-c="no">닫기</button></div><div class="cnote"></div></div>`;
  }
  const keep={text:(document.getElementById('nbText')||{}).value,subj:(document.getElementById('nbSubj')||{}).value};
  dlg.innerHTML=h;dlg.style.display='flex';
  if(keep.text&&document.getElementById('nbText'))document.getElementById('nbText').value=keep.text;
  if(keep.subj&&document.getElementById('nbSubj'))document.getElementById('nbSubj').value=keep.subj;
  const note=dlg.querySelector('.cnote');
  let picked=[];
  const fi=document.getElementById('nbFiles');
  if(fi)fi.onchange=async e=>{picked=[];for(const f of e.target.files){if(f.size>20e6){toast(f.name+' 은(는) 20MB가 넘어요');continue}
    picked.push({name:f.name,data:await new Promise(r=>{const rd=new FileReader();rd.onload=()=>r(rd.result);rd.readAsDataURL(f)})})}
    document.getElementById('nbFileList').textContent=picked.map(p=>p.name).join(', ')};
  dlg.querySelectorAll('input[name=nbKind]').forEach(r=>r.onchange=()=>{document.getElementById('nbRes').style.display=r.value==='request'&&r.checked?'':'none'});
  const nbTo=document.getElementById('nbTo');
  if(nbTo)nbTo.onchange=()=>{const p=(NB.peers||[]).find(x=>x.id===nbTo.value);document.getElementById('nbRes').innerHTML=resOptFor(p)};
  dlg.onclick=async e=>{
    const b=e.target.closest('button');
    if(e.target===dlg||(b&&b.dataset.c==='no')){dlg.style.display='none';nbOpen=false;return}
    if(!b)return;
    const go=async(url,body,okMsg)=>{b.disabled=true;note.textContent='…';const r=await mbPost(url,body);b.disabled=false;
      if(r.ok){note.textContent=okMsg;toast(okMsg);await pollNeighborOnce()}else note.textContent='못 했어요: '+(r.error||'');return r};
    if(b.dataset.c==='setup')return go('/api/neighbor/setup',{repo:document.getElementById('nbRepo').value,name:document.getElementById('nbName').value},'연결했어요');
    if(b.dataset.c==='sync')return go('/api/neighbor/sync',{},'주고받는 중이에요 (몇 초)');
    const to=nbTo&&nbTo.value;
    if(b.dataset.c==='send'){
      const kind=(dlg.querySelector('input[name=nbKind]:checked')||{}).value||'letter';
      const text=document.getElementById('nbText').value.trim();
      if(!text&&!picked.length){note.textContent='할 말이나 파일을 넣어 주세요';return}
      const r=await go('/api/neighbor/send',{to,kind,text,subject:document.getElementById('nbSubj').value,files:picked,to_session:kind==='request'?document.getElementById('nbRes').value:''},'📮 부쳤어요 (1분 안에 도착)');
      if(r&&r.ok){document.getElementById('nbText').value='';document.getElementById('nbSubj').value='';picked=[]}
      return}
    if(b.dataset.c==='gchar')return go('/api/neighbor/send',{to,kind:'character',key:document.getElementById('nbChar').value,text:'캐릭터 선물이에요!'},'🎁 캐릭터를 보냈어요');
    if(b.dataset.c==='gbg')return go('/api/neighbor/send',{to,kind:'background',bg:document.getElementById('nbBg').value,text:'배경 선물이에요!'},'🎁 배경을 보냈어요');
    if(b.dataset.act)return go('/api/neighbor/act',{id:b.dataset.id,act:b.dataset.act},{deliver:'➡️ 그 주민에게 전했어요',dismiss:'안 전하기로 했어요',read:'읽음'}[b.dataset.act]);
  };
}
function resOptFor(p){return(Array.isArray(p&&p.residents)?p.residents:[]).map(r=>`<option value="${esc(r.id)}">${esc(r.title)}</option>`).join('')||'<option value="">(공개한 주민 없음)</option>'}
async function pollNeighborOnce(){try{NB=await (await fetch('/api/neighbor')).json();const b=document.getElementById('nbN');if(b)b.textContent=NB.unread?NB.unread:'';renderNeighbor()}catch(e){}}
window.openNeighbor=openNeighbor;


// ---------- 앱 안에서 파일 보기 (그림·영상·소리·PDF·글) ----------
// 파일 칩을 누르면 맥 앱 대신 여기서 먼저 보여 준다. 「맥 앱으로 열기」로 예전처럼 열 수도 있다.
const VIEW_KIND=n=>/\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i.test(n)?'img':/\.(mp4|mov|m4v|webm)$/i.test(n)?'video':/\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(n)?'audio':/\.pdf$/i.test(n)?'pdf':/\.(md|txt|srt|vtt|json|csv|tsv|log|py|sh|html|xml|ya?ml)$/i.test(n)?'text':'other';
let VIEW={list:[],i:0};
function viewerEl(){
  let v=document.getElementById('viewer');if(v)return v;
  v=document.createElement('div');v.id='viewer';
  v.innerHTML=`<div class="vbar"><b id="vName"></b><span id="vPos"></span><a id="vOpen" target="_blank" rel="noopener">🖥 맥 앱으로 열기</a><button id="vClose" title="닫기 (Esc)">✕</button></div><div id="vBody"></div><button class="vnav" id="vPrev" title="앞 파일 (←)">‹</button><button class="vnav" id="vNext" title="다음 파일 (→)">›</button>`;
  document.body.appendChild(v);
  v.addEventListener('click',e=>{if(e.target===v||e.target.id==='vBody')closeViewer()});
  v.querySelector('#vClose').onclick=closeViewer;
  v.querySelector('#vPrev').onclick=e=>{e.stopPropagation();showView(VIEW.i-1)};
  v.querySelector('#vNext').onclick=e=>{e.stopPropagation();showView(VIEW.i+1)};
  return v;
}
function closeViewer(){const v=document.getElementById('viewer');if(!v)return;v.querySelectorAll('video,audio').forEach(m=>m.pause());v.classList.remove('open');document.getElementById('vBody').innerHTML=''}
async function showView(i){
  const L=VIEW.list;if(!L.length)return;VIEW.i=(i+L.length)%L.length;const f=L[VIEW.i];
  const v=viewerEl(), body=v.querySelector('#vBody');
  v.querySelectorAll('video,audio').forEach(m=>m.pause());
  v.querySelector('#vName').textContent=f.name;v.querySelector('#vPos').textContent=L.length>1?` ${VIEW.i+1}/${L.length}`:'';
  v.querySelector('#vOpen').href=f.href;
  v.querySelectorAll('.vnav').forEach(b=>b.style.display=L.length>1?'':'none');
  const k=VIEW_KIND(f.name), src=esc(f.href);
  if(k==='img')body.innerHTML=`<img src="${src}" alt="">`;
  else if(k==='video')body.innerHTML=`<video src="${src}" controls autoplay playsinline></video>`;
  else if(k==='audio')body.innerHTML=`<div class="vaud"><div style="font-size:54px">🔊</div><audio src="${src}" controls autoplay></audio></div>`;
  else if(k==='pdf')body.innerHTML=`<iframe src="${src}"></iframe>`;
  else if(k==='text'){body.innerHTML='<pre class="vtxt">불러오는 중…</pre>';try{const r=await fetch(f.href);const t=await r.text();if(L[VIEW.i]===f)body.querySelector('pre').textContent=t.length>400000?t.slice(0,400000)+'\n…(너무 길어 앞부분만)':t}catch(e){body.querySelector('pre').textContent='못 불러왔어요: '+e}}
  else body.innerHTML=`<div class="vaud"><div style="font-size:54px">📎</div><p>이 파일은 앱 안에서 미리 볼 수 없어요.<br>위의 「🖥 맥 앱으로 열기」를 눌러 주세요.</p></div>`;
  v.classList.add('open');
}
document.addEventListener('click',e=>{
  const a=e.target.closest('a[data-view]');if(!a||e.metaKey||e.ctrlKey)return;   // ⌘ 누르고 클릭하면 예전처럼 맥 앱으로
  e.preventDefault();e.stopPropagation();
  const box=a.closest('.msg,.nbitem,div')||document.body;
  const all=[...box.querySelectorAll('a[data-view]')];
  VIEW={list:all.map(x=>({href:x.dataset.view,name:x.dataset.vname||'파일'})),i:Math.max(0,all.indexOf(a))};
  showView(VIEW.i);
},true);
document.addEventListener('keydown',e=>{
  const v=document.getElementById('viewer');if(!v||!v.classList.contains('open'))return;
  if(e.key==='Escape'){e.preventDefault();closeViewer()}
  else if(e.key==='ArrowLeft'&&VIEW.list.length>1&&!/VIDEO|AUDIO/.test(document.activeElement.tagName)){e.preventDefault();showView(VIEW.i-1)}
  else if(e.key==='ArrowRight'&&VIEW.list.length>1&&!/VIDEO|AUDIO/.test(document.activeElement.tagName)){e.preventDefault();showView(VIEW.i+1)}
},true);

// ---- 대화창 넓이·닫기 손잡이·입력칸 자동 높이 (11-26) ----
// 왼쪽 가장자리 「◀ 마을」 손잡이: 누르면 닫히고, 좌우로 끌면 넓이가 바뀐다(다음에도 기억). 마을이 좁게 보여도 닫기 쉽게.
(function(){
  const panel=document.getElementById('panel'), grip=document.getElementById('pGrip'), ta=document.getElementById('oText');
  const KEY='vcPanelW';
  const setW=w=>{w=Math.max(560,Math.min(innerWidth-40,w));panel.style.setProperty('--pw',w+'px');return w};
  try{const w=+localStorage.getItem(KEY);if(w)setW(w)}catch(e){}
  let drag=null;
  grip.addEventListener('mousedown',e=>{if(innerWidth<=900)return;drag={x:e.clientX,w:panel.getBoundingClientRect().width,moved:false};
    panel.style.transition='none';e.preventDefault()});
  addEventListener('mousemove',e=>{if(!drag)return;const dx=drag.x-e.clientX;if(Math.abs(dx)>4)drag.moved=true;if(drag.moved)setW(drag.w+dx)});
  addEventListener('mouseup',()=>{if(!drag)return;const d=drag;drag=null;panel.style.transition='';
    if(d.moved){try{localStorage.setItem(KEY,Math.round(panel.getBoundingClientRect().width))}catch(e){}}else closePanel()});
  grip.addEventListener('click',()=>{if(innerWidth<=900)closePanel()});
  grip.addEventListener('dblclick',()=>{panel.style.removeProperty('--pw');try{localStorage.removeItem(KEY)}catch(e){}});
  // 입력칸은 두 줄에서 시작해 쓰는 만큼 늘어난다(화면 40%까지)
  const fit=()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight+4,innerHeight*0.4)+'px'};
  ta.addEventListener('input',fit);
  new MutationObserver(fit).observe(panel,{attributes:true,attributeFilter:['class']});
  const _v=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');
  Object.defineProperty(ta,'value',{get(){return _v.get.call(this)},set(x){_v.set.call(this,x);requestAnimationFrame(fit)}});
  fit();
})();

// ================= 일촌·미니홈피 (11-26) =================
// 깃허브 광장으로 일촌 신청 → 수락하면 둘만 쓰는 비공개 저장소가 생기고, 서로의 홈(마을 사진·주민·대문글·방명록·투데이)을 본다.
let IC=null, icView={vid:'me',tab:'home'}, icHome=null, icBusy=false, icAskedDist=false;
const icPost=async(act,body)=>{const r=await fetch('/api/ilchon/'+act,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});const j=await r.json();if(!r.ok||j.error)throw new Error(j.error||'실패');return j};
// 일촌 기능 소개 (11-27): 배포판은 처음에 일촌이 뭔지 알려 주고 쓸지 물어본다. 고르기 전에는 꺼져 있다
let icIntroShown=false;
function askIlchonFeature(force){
  if(icIntroShown&&!force)return;icIntroShown=true;
  const dlg=document.getElementById('confirm');
  dlg.innerHTML=`<div class="cbox"><h3>🤝 일촌 맺기를 쓸까요?</h3>${ICHON_INTRO}
      <div class="cbtn"><button data-c="no">안 쓸래요</button><button data-c="on">일촌 맺기 켜기</button></div></div>`;
  dlg.style.display='flex';
  dlg.onclick=async e=>{const c=e.target.dataset.c;if(!c&&e.target!==dlg)return;
    if(e.target===dlg)return;
    dlg.style.display='none';
    {const r=await mbPost('/api/settings',{ilchonOn:c==='on'});if(r&&r.error){toast(r.error);return}}
    toast(c==='on'?'일촌 맺기를 켰어요. 「일촌 신청」 탭에서 내 일촌 코드를 볼 수 있어요':'일촌 맺기는 꺼 두었어요. 「일촌 신청」 탭에서 언제든 켤 수 있어요');
    try{IC=await (await fetch('/api/ilchon')).json()}catch(err){}
    if(document.getElementById('ilchon').classList.contains('open'))renderIlchon()};
}
const ICHON_INTRO=`<p><b>일촌 맺기</b>는 다른 사람의 에이전트빌리지와 친구(일촌)를 맺는 기능이에요.</p>
      <ul style="margin:6px 0 8px 18px;padding:0;font-size:13.5px;line-height:1.6">
        <li>서로의 마을 이름·한마디·주민 캐릭터를 구경하고, 방명록에 인사를 남길 수 있어요.</li>
        <li>세션 이름·대화·작업물·파일은 <b>보이지 않고 주고받지도 않아요.</b> 주민은 캐릭터 그림으로만 보여요.</li>
        <li>깃허브 없이 「일촌 코드(VLG-…)」로 맺을 수 있어요. 글은 두 마을만 풀 수 있게 잠가서 오가요.</li>
        <li>안 써도 마을의 다른 기능은 그대로예요. 나중에 「일촌 신청」 탭에서 언제든 켜고 끌 수 있어요.</li>
      </ul>`;
async function pollIlchon(){
  try{IC=await (await fetch('/api/ilchon')).json();
    if(IC&&IC.featureAsked===false)askIlchonFeature();
    const b=document.getElementById('icN');if(b)b.textContent=((IC.incoming||[]).length+(IC.news||0)+(IC.boardNew||0))||'';
    const mb=document.getElementById('mbarIc');if(mb)mb.textContent=((IC.incoming||[]).length+(IC.news||0)+(IC.boardNew||0))||'';
    if(!icAskedDist&&IC.featureOn&&IC.distributor&&!IC.distributorAsked){icAskedDist=true;askDistributor()}
    if(document.getElementById('ilchon').classList.contains('open')&&icView.tab==='req'&&!icTyping())renderIlchon();
  }catch(e){}
  setTimeout(pollIlchon,30000);
}
setTimeout(pollIlchon,2500);
function icTyping(){const a=document.activeElement;return a&&document.getElementById('ilchon').contains(a)&&/INPUT|TEXTAREA/.test(a.tagName)}
function closeIlchon(){document.getElementById('ilchon').classList.remove('open');icView.play=false;const au=document.getElementById('icBgm');if(au)au.remove()}
window.closeIlchon=closeIlchon;
addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('ilchon').classList.contains('open')){const v=document.getElementById('icPhotoView');if(v){v.remove();return}closeIlchon()}});
async function openIlchon(vid,tab){
  document.getElementById('hud').classList.remove('open');
  icView={vid:vid||'me',tab:tab||'home',open:{},play:false};
  document.getElementById('ilchon').classList.add('open');
  try{IC=await (await fetch('/api/ilchon')).json()}catch(e){}
  await loadHome();renderIlchon();
}
window.openIlchon=openIlchon;
async function loadHome(){
  icHome=null;
  try{const r=await fetch('/api/ilchon/home?vid='+encodeURIComponent(icView.vid));const j=await r.json();icHome=r.ok?j:{error:j.error}}catch(e){icHome={error:'홈을 못 불러왔어요'}}
}
function icDay(s,short){if(!s)return'';const d=new Date((typeof s==='number'?s*1000:s));return short?`${d.getMonth()+1}.${d.getDate()}`:`${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
const icWho=f=>esc((f&&(f.callAs||f.owner||f.name))||'손님');
const fileB64=f=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(f)});
function renderIlchon(){
  const box=document.getElementById('ilchon'), H=icHome||{}, mine=icView.vid==='me';
  const ilchons=(IC&&IC.ilchons)||[], close=(IC&&IC.close)||[], inc=(IC&&IC.incoming)||[];
  const name=H.name||(IC&&IC.me&&IC.me.name)||'우리 마을';
  const posts=H.posts||[], diary=posts.filter(p=>p.kind==='diary'), photos=posts.filter(p=>p.kind==='photo');
  const tabs=[['home','홈'],['diary',`다이어리 ${diary.length||''}`],['photo',`사진첩 ${photos.length||''}`],['guest',`방명록 ${(H.guestbook||[]).length||''}`],
    ['ilchon',`일촌 ${mine?ilchons.length+close.length:(H.ilchons||[]).length}`]].filter(t=>!H.mini||['home','guest'].includes(t[0])).concat(mine?[['board',`📰 이웃 게시판${IC&&IC.boardNew?` <span id="icBadge">${IC.boardNew}</span>`:''}`],['req',`일촌 신청${inc.length?` <span id="icBadge">${inc.length}</span>`:''}`],['admin','관리']]:[]);
  // ---- 왼쪽: 프로필 ----
  let left=`<div class="ph" style="background-image:url('${esc(H.bgUrl||'')}')">${H.minimeUrl?`<img class="mm" src="${esc(H.minimeUrl)}">`:''}</div>
    <div class="mood">TODAY IS.. <b>${H.mood||'🙂'}</b> ${esc(H.line||'')}</div>
    <div class="nm">${esc(name)} ${mine?'<button class="sb mini2" data-ic="rename" title="마을 이름 바꾸기">✎</button>':''}</div>
    <div class="ow">${esc(H.owner||'')}의 홈${H.trust==='close'?' · 가까운 이웃':H.trust==='ilchon'?' · 일촌':''}</div>`;
  if(!mine)left+=`<div class="call">내가 부르는 이름 <b>${esc(H.callThem||'-')}</b><br>나를 부르는 이름 <b>${esc(H.calledByThem||'-')}</b></div>`;
  left+=mine&&icView.edit?`<textarea id="icIntro" placeholder="대문글 (일촌이 홈에 오면 보는 글)">${esc(H.intro||'')}</textarea><div style="display:flex;gap:6px"><button class="mh-btn" data-ic="intro-save">저장</button><button class="mh-btn gray" data-ic="intro-cancel">취소</button></div>`
    :`<div class="intro">${esc(H.intro||(mine?'대문글을 써 보세요 ✍':'(대문글이 없어요)'))}</div>${mine?'<button class="sb" data-ic="intro-edit">✎ 대문글 고치기</button>':''}`;
  if(H.bgmId)left+=`<div class="bgm">🎵 <span>${esc(H.bgm||'배경음악')}</span>${icView.play?`<iframe id="icBgm" src="https://www.youtube-nocookie.com/embed/${esc(H.bgmId)}?autoplay=1&loop=1&playlist=${esc(H.bgmId)}" allow="autoplay; encrypted-media" frameborder="0"></iframe>`:`<button class="sb" data-ic="play">▶ 듣기</button>`} <a href="${esc(H.bgmLink)}" target="_blank" rel="noopener">유튜브 뮤직에서 열기 ↗</a></div>`;
  left+=`<button class="sb" data-ic="surf">🌊 파도타기</button>`;
  if(!mine)left+=`<button class="sb" data-ic="go-me">🏠 내 홈으로</button>${H.mini?'':'<button class="sb" data-ic="letter">✉️ 편지 쓰기</button>'}`;
  // ---- 오른쪽 ----
  let pane='';
  if(H.mini&&!['home','guest'].includes(icView.tab))icView.tab='home';
  const T=icView.tab;
  if(H.error)pane=`<div class="mh-err">${esc(H.error)}</div>`;
  else if(T==='home'){
    pane+=`<div class="mh-sec">${mine?'우리':esc(H.owner||'')+'네'} 마을 방</div>
      <div class="mh-room" style="background-image:url('${esc(H.bgUrl||'')}')">${H.minimeUrl?`<img class="mmBig" src="${esc(H.minimeUrl)}">`:''}<div class="crew">${(H.residents||[]).map(r=>`<figure>${r.url?`<img src="${esc(r.url)}">`:'<div style="height:56px;font-size:34px">🙂</div>'}<figcaption>${esc(r.title)}</figcaption></figure>`).join('')}</div></div>`;
    if(mine&&(H.news||[]).length)pane+=`<div class="mh-sec">🔔 일촌 새소식</div>`+H.news.slice(0,6).map(n=>`<div class="mh-news" data-newsgo="${esc(n.vid)}" data-newskind="${esc(n.kind)}"><b>${esc(n.who||'')}</b> ${({diary:'다이어리',photo:'사진첩'}[n.kind]?`님이 ${({diary:'다이어리',photo:'사진첩'}[n.kind])}에 새 글`:'')} 「${esc(n.title||'')}」 <span class="when">${icDay(n.at,1)}</span></div>`).join('');
    if(H.mini)pane+=`<div class="mh-note">일촌과는 마을 이름·주민·방명록만 주고받아요 (안전을 위해 사진·글·파일은 주고받지 않아요).</div>`;
    if(!H.mini){pane+=`<div class="mh-sec">일촌평</div>`;
    if(!mine&&H.trust)pane+=`<div class="mh-write"><input id="icPy" maxlength="60" placeholder="${esc(H.owner||'')}님에게 일촌평 한 줄 (한 사람당 하나)"><button class="mh-btn" data-ic="py">등록</button></div>`;
    pane+=(H.pyeong||[]).map(x=>`<div class="mh-py">· ${esc(x.text)} <span class="who">(${icWho(x.from)})</span> <span class="when">${icDay(x.at,1)}</span></div>`).join('')||'<div class="mh-empty">아직 일촌평이 없어요</div>';
    pane+=`<div class="mh-sec">최근 글</div>`+(posts.slice(0,4).map(p=>`<div class="mh-news" data-tabgo="${p.kind}">${p.kind==='photo'?'📷':'📔'} ${esc(p.title||String(p.text||'').slice(0,30)||'(제목 없음)')} <span class="when">${icDay(p.at,1)}</span></div>`).join('')||'<div class="mh-empty">아직 글이 없어요</div>');
    }
    pane+=`<div class="mh-sec">최근 방명록</div>`+((H.guestbook||[]).slice(0,3).map(gbRow).join('')||'<div class="mh-empty">아직 방명록이 없어요</div>');
  }else if(T==='diary'){
    if(mine)pane+=`<div class="mh-form wide"><div style="display:flex;gap:6px"><select id="icDMood">${(H.moods||['😊']).map(m=>`<option>${m}</option>`).join('')}</select><input id="icDTitle" maxlength="80" placeholder="제목"></div>
      <textarea id="icDText" placeholder="오늘 우리 마을은…"></textarea><div style="display:flex;gap:8px;align-items:center"><label class="mh-note"><input type="checkbox" id="icDMe"> 나만 보기</label><span style="flex:1"></span><button class="mh-btn" data-ic="diary">📔 다이어리 쓰기</button></div></div>`;
    pane+=diary.map(postRow).join('')||'<div class="mh-empty">아직 다이어리가 없어요</div>';
  }else if(T==='photo'){
    if(mine)pane+=`<div class="mh-form wide"><input id="icPTitle" maxlength="80" placeholder="사진 제목"><input id="icPText" maxlength="300" placeholder="한마디"><div style="display:flex;gap:8px;align-items:center"><input type="file" id="icPFile" accept="image/*"><label class="mh-note"><input type="checkbox" id="icPMe"> 나만 보기</label><span style="flex:1"></span><button class="mh-btn" data-ic="photo">📷 올리기</button></div></div>`;
    pane+=photos.length?`<div class="mh-grid">${photos.map(p=>`<figure data-photo="${esc(p.id)}"><div style="background-image:url('${esc(p.url)}')"></div><figcaption>${esc(p.title||'')}${p.scope==='me'?' 🔒':''} <span>💬${(H.comments&&H.comments[p.id]||[]).length}</span></figcaption></figure>`).join('')}</div>`:'<div class="mh-empty">아직 사진이 없어요</div>';
  }else if(T==='guest'){
    if(!mine)pane+=`<div class="mh-write"><input id="icGb" maxlength="300" placeholder="${esc(H.owner||'')}님 홈에 한마디 남기기"><label class="mh-note" title="주인만 볼 수 있어요"><input type="checkbox" id="icGbS"> 🔒비밀</label><button class="mh-btn" data-ic="gb">남기기</button></div>`;
    if(!mine)pane+=`<div class="mh-note">이 방명록은 그 마을 주인이 올린 사본이에요. 글쓴이 이름은 주인 쪽 기록 그대로라, 내가 직접 이어진 일촌 글이 아니면 확인된 이름이 아니에요.</div>`;
    pane+=(H.guestbook||[]).map(gbRow).join('')||'<div class="mh-empty">아직 방명록이 없어요</div>';
  }else if(T==='ilchon'){
    if(mine){
      pane+=ilchons.map(p=>icCard(p,'일촌')).join('')+close.map(p=>icCard(p,'가까운 이웃')).join('');
      pane+=((IC&&IC.broken)||[]).map(b=>`<div class="mh-card"><div class="tx"><b>${esc(b.callThem||b.peerCode||b.peerLogin||'이름 모를 일촌')}</b><small>일촌 · 마을 정보가 안 왔거나 망가졌어요</small></div><button class="mh-btn gray" data-leave="${esc(b.repo)}" data-lname="${esc(b.callThem||b.peerCode||'')}">끊기</button></div>`).join('');
      if(!ilchons.length&&!close.length)pane+=`<div class="mh-empty">아직 일촌이 없어요. 「일촌 신청」 탭에서 깃허브 아이디로 신청해 보세요.</div>`;
    }else{
      const myPeers=new Set(ilchons.concat(close).map(p=>p.id));const meVid=IC&&IC.me&&IC.me.vid;
      pane+=(H.ilchons||[]).map(x=>`<div class="mh-card"><div class="tx"><b>${esc(x.name)}</b> <span class="call">${esc(x.callThem?'('+x.callThem+')':'')}</span>${x.code?`<small>🔑 ${esc(x.code)}</small>`:x.login?`<small>@${esc(x.login)}</small>`:''}</div>
        ${x.vid===meVid?'<span class="mh-note">나예요 👋</span>':myPeers.has(x.vid)?`<button class="mh-btn blue" data-home="${esc(x.vid)}">🌊 파도타기</button>`:(x.code||x.login)?`<button class="mh-btn" data-wantilchon="${esc(x.code||x.login)}">💌 일촌 신청</button>`:''}</div>`).join('')||'<div class="mh-empty">공개된 일촌이 없어요</div>';
      pane+=`<div class="mh-note">내 일촌이 아닌 집은 일촌을 맺어야 놀러 갈 수 있어요.</div>`;
    }
  }else if(T==='req'){pane=icReqPane()}
  else if(T==='board'){pane=icBoardPane()}
  else if(T==='admin'){
    pane+=`<div class="mh-sec">오늘의 기분 · 한마디</div><div class="mh-write"><select id="icMood">${(H.moods||[]).map(m=>`<option ${m===H.mood?'selected':''}>${m}</option>`).join('')}</select><input id="icLine" maxlength="60" value="${esc(H.line||'')}" placeholder="오늘의 한마디"><button class="mh-btn" data-ic="mood">저장</button></div>`;
    pane+=`<div class="mh-sec">스킨</div><div class="mh-skins">${(H.skinList||[]).map(k=>{const own=(H.skins||[]).includes(k.id);return `<button class="sk skin-${k.id} ${H.skin===k.id?'on':''}" data-skin="${k.id}"><i></i>${esc(k.name)}<small>${H.skin===k.id?'쓰는 중':''}</small></button>`}).join('')}</div>`;
    pane+=`<div class="mh-sec">대표 주민 (미니홈 사진에 서는 주민)</div><select id="icMini"><option value="">없음</option>${(H.chars||[]).map(c=>`<option value="${esc(c.key)}" ${c.key===(icHome.minimeUrl||'').split('/')[2]?'selected':''}>${esc(c.name)}</option>`).join('')}</select> <button class="mh-btn" data-ic="minime">정하기</button>`;
    pane+=`<div class="mh-sec">마을 방 배경</div><select id="icRoom"><option value="">지금 마을 배경</option>${(H.rooms||[]).map(r=>`<option value="${esc(r.id)}" ${r.id===H.room?'selected':''}>${esc(r.name||r.id)}</option>`).join('')}</select> <button class="mh-btn" data-ic="room">정하기</button>`;
    pane+=`<div class="mh-sec">배경음악 (BGM)</div><div class="mh-note">${H.bgmId?`지금: 🎵 ${esc(H.bgm)} <button class="mh-btn gray" data-ic="bgm-clear">빼기</button>`:'아직 없어요'}</div><div class="mh-write"><input id="icBgmUrl" placeholder="유튜브 뮤직 노래 링크 (공유 → 링크 복사)"><input id="icBgmTitle" maxlength="60" placeholder="곡 이름 (예: 가수 - 노래)" style="max-width:200px"><button class="mh-btn" data-ic="bgm">🎵 걸기</button></div><div class="mh-note">음악 파일은 주고받지 않고 링크만 걸어요. 일촌이 내 홈에서 ▶를 누르면 유튜브로 재생돼요.</div>`;
    if(IC&&IC.featureOn)pane+=`<div class="mh-sec">일촌 맺기</div><div class="mh-note">켜져 있어요. <button class="mh-btn gray" id="icFeatOff">일촌 맺기 끄기</button></div>`;
    pane+=`<div class="mh-sec">내 일촌 목록 공개</div><label class="mh-note"><input type="checkbox" id="icShareIds" ${IC&&IC.shareIlchonIds?'checked':''}> 내 홈에 일촌들의 일촌 코드·깃허브 아이디도 보여 주기</label><div class="mh-note">끄면(기본) 일촌 이름만 보여요. 켜면 내 일촌의 일촌이 그 사람에게 신청할 수 있지만, 내 인맥이 다른 일촌들에게 드러나요.</div>`;
  }
  box.innerHTML=`<div class="mh skin-${esc(H.skin||'sky')}"><div class="mh-top"><b>🏠 ${esc(name)}</b><span>${mine?'내 마을 홈피':'일촌 마을 홈피'}</span>
      <span class="tdy">TODAY <em>${H.today||0}</em> | TOTAL ${H.total||0}</span><button class="x" data-ic="close" title="닫기 (Esc)">×</button></div>
    <div class="mh-body"><div class="mh-left">${left}</div>
      <div class="mh-main"><div class="mh-tabs">${tabs.map(([k,t])=>`<button data-tab="${k}" class="${T===k?'on':''}">${t}</button>`).join('')}</div>
        <div class="mh-pane">${pane}</div></div></div></div>`;
  bindIlchon();
}
function postRow(p){
  const mine=icView.vid==='me', cs=(icHome.comments||{})[p.id]||[], open=icView.open&&icView.open[p.id];
  return `<div class="mh-post"><div class="ph-h"><b>${p.mood||''} ${esc(p.title||'(제목 없음)')}</b>${p.scope==='me'?' 🔒':''}<span class="when">${icDay(p.at)}</span>${mine?`<button class="del" data-pdel="${esc(p.id)}" title="지우기">✕</button>`:''}</div>
    ${p.url?`<img class="ph-img" src="${esc(p.url)}">`:''}<div class="ph-t">${esc(p.text||'')}</div>
    <div class="ph-c"><a data-ctoggle="${esc(p.id)}">💬 댓글 ${cs.length}</a></div>
    ${open?`<div class="ph-cl">${cs.map(c=>`<div>· <b>${icWho(c.from)}</b> ${esc(c.text)} <span class="when">${icDay(c.at,1)}</span></div>`).join('')}
      <div class="mh-write"><input data-cin="${esc(p.id)}" maxlength="300" placeholder="댓글 달기"><button class="mh-btn" data-cgo="${esc(p.id)}">등록</button></div></div>`:''}</div>`;
}
function gbRow(g){const mine=icView.vid==='me';return `<div class="mh-gb"><div class="gh">${mine?`<button class="del" data-gbdel="${esc(g.id)}" title="지우기">✕</button>`:''}<span class="who">${icWho(g.from)}</span> <small>${esc(g.from&&g.from.name||'')}</small>${g.secret?' <span class="sec">🔒 비밀글</span>':''}<span class="when">${icDay(g.at)}</span></div>
  <div class="gt">${esc(g.text)}</div>${g.reply?`<div class="rp">↳ <b>주인</b> ${esc(g.reply)}</div>`:''}
  ${mine?`<div class="mh-write sm"><input data-rin="${esc(g.id)}" maxlength="300" placeholder="답글" value="${esc(g.reply||'')}"><button class="mh-btn gray" data-rgo="${esc(g.id)}">답글</button></div>`:''}</div>`}
function icCard(p,kind){return `<div class="mh-card"><div class="thumb" style="background-image:url('/api/ilchon/file?vid=${encodeURIComponent(String(p.id).replace(/[^\w-]/g,''))}&name=bg.jpg')"></div>
  <div class="tx"><b>${esc(p.name||'이웃 마을')}</b> <span class="call">${esc(p.callThem?'· '+p.callThem:'')}</span><small>${kind} · ${esc(p.owner||'')}${p.peerCode?' · 🔑 '+esc(p.peerCode):p.peerLogin?' · @'+esc(p.peerLogin):''}${p.safety?`<br><span title="이 일촌에게 전화·메시지로 안전번호를 물어보세요. 같으면 둘 사이에 아무도 끼어들지 않은 거예요. 다르면 일촌을 끊고 다시 맺으세요.">🛡 안전번호 <b>${esc(p.safety)}</b> (상대 화면과 같은지 맞춰 보세요)</span>`:''}</small></div>
  <button class="mh-btn blue" data-home="${esc(p.id)}">홈 가기</button>${kind==='일촌'?`<button class="mh-btn gray" data-callas="${esc(p.repo)}" data-cur="${esc(p.callThem||'')}" title="내가 부르는 일촌명 바꾸기">✎</button><button class="mh-btn gray" data-leave="${esc(p.repo)}" data-lname="${esc(p.callThem||p.name||'')}" title="일촌 끊기">끊기</button>`:''}</div>`}
function icReqPane(){
  const I=IC||{};let h='';
  if(!I.featureOn){
    return `<div class="mh-sec">🤝 일촌 맺기 (꺼져 있음)</div><div class="mh-note">${ICHON_INTRO}</div><button class="mh-btn" id="icFeatOn">일촌 맺기 켜기</button>`;
  }
  if(I.relayOn){
    h+=`<div class="mh-sec">내 일촌 코드</div>`+(I.code?`<div class="mh-code"><b>${esc(I.code)}</b><button class="mh-btn" data-copycode="${esc(I.code)}">복사</button></div><div class="mh-note">이 코드를 알려 주면 누구나 깃허브 없이 일촌을 신청할 수 있어요. 글·사진은 두 마을만 풀 수 있게 잠가서 주고받아요.</div>`
      :`<div class="mh-err">${esc(I.relayError||'코드를 만드는 중이에요…')}</div>`);
  }
  if(!I.ghReady){
    h+=`<div class="mh-sec">깃허브로도 잇기 (선택)</div><div class="mh-note">깃허브 아이디로도 일촌을 맺을 수 있어요. 쓰려면 터미널에서 <b>직접</b> <code>gh auth login</code> 을 한 번 해 주세요.</div>`;
  }else{
  h+=`<div class="mh-sec">내 광장 (깃허브로 일촌 신청 받는 곳)</div>`;
  h+=I.plaza?`<div class="mh-note">켜져 있어요 ✅ 다른 사람이 내 깃허브 아이디 <b>@${esc(I.login)}</b> 로 일촌을 신청할 수 있어요.</div>`
    :`<div class="mh-note">아직 꺼져 있어요. 켜면 내 깃허브에 공개 저장소 <b>${esc(I.login)}/village-plaza</b>(신청함)가 만들어집니다.</div><button class="mh-btn" data-ic="plaza" style="margin-top:6px">📮 일촌 신청 받기 켜기</button>`;
  }
  h+=`<div class="mh-sec">받은 신청 ${(I.incoming||[]).length}</div>`;
  h+=(I.incoming||[]).map(x=>`<div class="mh-card"><div class="tx"><b>${esc(x.village)}</b> (${esc(x.owner)}) <small>${x.code?'🔑 '+esc(x.login):'@'+esc(x.login)} · "${esc(x.message||'일촌 맺어요!')}"</small>
      <small>나를 「${esc(x.callThem||'-')}」라 부르고 싶대요 · 상대를 부를 이름: <input data-callfor="${esc(x.issue)}" value="${esc(x.calledByThem||x.village)}" style="width:110px;font-size:12px;border:1px solid #ccc;border-radius:5px;padding:1px 4px"></small></div>
      <button class="mh-btn" data-accept="${esc(x.issue)}">수락</button><button class="mh-btn gray" data-reject="${esc(x.issue)}">거절</button></div>`).join('')||'<div class="mh-empty">받은 신청이 없어요</div>';
  h+=`<div class="mh-sec">일촌 신청하기</div><div class="mh-form">
    <label>상대 일촌 코드${I.ghReady?' 또는 깃허브 아이디':''}</label><input id="icTo" placeholder="예: VLG-7K3Q2M" value="${esc(icView.wantLogin||'')}">
    <label>내가 상대를 부를 일촌명</label><input id="icCall" maxlength="20" placeholder="예: 옆동네 마을">
    <label>상대가 나를 불러 줄 일촌명</label><input id="icCalled" maxlength="20" placeholder="예: 구독자 1호">
    <label>한마디</label><input id="icMsg" maxlength="300" placeholder="일촌 맺어요!">
    <div><button class="mh-btn" data-ic="request">💌 일촌 신청</button></div>
    <div class="mh-note">상대가 수락하면 둘만 쓰는 비공개 저장소가 생겨 편지·방문·홈 구경을 할 수 있어요. 일촌은 편지·방명록만 주고받고, 내 주민 세션에 일을 시킬 수는 없어요.</div></div>`;
  const out=(I.outgoing||[]);
  if(out.length)h+=`<div class="mh-sec">보낸 신청</div>`+out.map(x=>`<div class="mh-card"><div class="tx"><b>@${esc(x.login)}</b> <small>${{pending:'⏳ 기다리는 중',done:'✅ 일촌이 됐어요',rejected:'🙅 이번엔 안 됐어요'}[x.state]||x.state}${x.error?' · '+esc(x.error):''}</small></div></div>`).join('');
  if(I.error)h+=`<div class="mh-err" style="margin-top:8px">${esc(I.error)}</div>`;
  return h;
}
let icBoard=null;
async function loadBoard(){try{icBoard=await (await fetch('/api/ilchon/board')).json()}catch(e){icBoard={posts:[]}}}
function icBoardPane(){
  if(!icBoard){loadBoard().then(renderIlchon);return '<div class="mh-empty">불러오는 중…</div>'}
  const B=icBoard;
  let h=`<div class="mh-form wide"><textarea id="icBText" maxlength="500" placeholder="이웃들에게 한마디 (일촌의 일촌까지 퍼져요)"></textarea>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="mh-note">볼 수 있는 범위</span><select id="icBRange">${(B.ranges||[2,5,10]).map(r=>`<option value="${r}">${r}촌까지</option>`).join('')}</select>
    <span style="flex:1"></span><button class="mh-btn" data-ic="board-post">📰 올리기</button></div>
    <div class="mh-note">글은 일촌들의 앱이 받아서 범위 안의 다음 일촌에게 건네줘요. 비밀 이야기는 다이어리나 편지로. ${B.days||14}일 지나면 사라져요.</div></div>`;
  h+=(B.posts||[]).map(p=>{const o=p.origin||{};
    return `<div class="bd-post"><div class="bd-av">${p.avUrl?`<img src="${esc(p.avUrl)}">`:'🙂'}</div><div class="bd-b">
      <div class="bd-h"><b>${esc(p.callThem||o.owner||'')}</b> <small>${esc(o.name||'')}</small> <span class="bd-d">${p.mine?'나':p.dist+'촌'}</span>${!p.mine&&!p.verified?' <small class="bd-r" title="건너 건너 전해진 글이라 쓴 사람 이름이 진짜인지 확인할 수 없어요">· 전해 들은 글</small>':''} <span class="when">${icDay(p.at)}</span> <small class="bd-r">· ${p.range}촌까지</small></div>
      <div class="bd-t">${esc(p.text)}</div>
      <div class="bd-a">${p.mine?`<button class="mh-btn gray" data-bdel="${esc(p.id)}">지우기</button>`:
        (p.ilchon?`<button class="mh-btn blue" data-home="${esc(o.vid)}">🏠 홈 가기</button>`:((o.code||o.login)?`<button class="mh-btn" data-wantilchon="${esc(o.code||o.login)}">💌 일촌 신청</button>`:'<small class="mh-note">일촌 신청을 안 받는 마을이에요</small>'))+
        `<button class="mh-btn gray" data-bhide="${esc(p.id)}">숨기기</button>${p.verified?`<button class="mh-btn gray" data-bblock="${esc(o.vid)}" data-bpid="${esc(p.id)}" title="이 마을 글을 안 보고, 내가 더 건네지도 않아요">차단</button>`:''}`}</div></div></div>`}).join('')||'<div class="mh-empty">아직 게시판 글이 없어요. 첫 글을 남겨 보세요!</div>';
  if(B.blocked)h+=`<div class="mh-note" style="margin-top:8px">차단한 마을 ${B.blocked}곳 <button class="mh-btn gray" data-ic="unblock">모두 풀기</button></div>`;
  return h;
}
function photoView(id){
  const p=(icHome.posts||[]).find(x=>x.id===id);if(!p)return;
  icView.open[id]=true;
  const d=document.createElement('div');d.id='icPhotoView';d.className='mh-pv';
  d.innerHTML=`<div class="mh-pvb"><button class="x" data-pvx>×</button>${postRow(p)}</div>`;
  document.getElementById('ilchon').appendChild(d);
  d.onclick=e=>{if(e.target===d||e.target.dataset.pvx!==undefined)d.remove()};
  bindPostBits(d);
}
function bindPostBits(root){
  root.querySelectorAll('[data-ctoggle]').forEach(a=>a.onclick=()=>{const id=a.dataset.ctoggle;icView.open[id]=!icView.open[id];const pv=document.getElementById('icPhotoView');if(pv){pv.remove();photoView(id)}else renderIlchon()});
  root.querySelectorAll('[data-cgo]').forEach(b=>b.onclick=()=>{const id=b.dataset.cgo,i=root.querySelector(`[data-cin="${id}"]`);icAct('comment',{vid:icView.vid,id,text:i&&i.value},'댓글을 달았어요',()=>{const pv=document.getElementById('icPhotoView');if(pv){pv.remove();photoView(id)}})});
  root.querySelectorAll('input,textarea,select').forEach(el=>el.addEventListener('keydown',e=>e.stopPropagation()));
}
async function icAct(act,body,ok,after){
  if(icBusy)return;icBusy=true;
  try{await icPost(act,body);if(ok)toast(ok)}catch(e){toast(e.message)}
  icBusy=false;try{IC=await (await fetch('/api/ilchon')).json()}catch(e){}await loadHome();renderIlchon();if(after)after();
}
function bindIlchon(){
  const box=document.getElementById('ilchon');
  const v=id=>(document.getElementById(id)||{}).value||'';
  box.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{icView.tab=b.dataset.tab;if(b.dataset.tab==='board')icBoard=null;renderIlchon()});
  const bAct=(body,ok)=>icAct('board-act',body,ok,null).then(()=>{icBoard=null;renderIlchon()});
  box.querySelectorAll('[data-bdel]').forEach(b=>b.onclick=()=>{if(confirm('이 글을 지울까요? (이미 건네진 곳에선 기한이 지나야 사라져요)'))bAct({act:'delete',id:b.dataset.bdel},'지웠어요')});
  box.querySelectorAll('[data-bhide]').forEach(b=>b.onclick=()=>bAct({act:'hide',id:b.dataset.bhide},'숨겼어요'));
  box.querySelectorAll('[data-bblock]').forEach(b=>b.onclick=()=>{if(confirm('이 마을 글을 차단할까요? 내 게시판에 안 보이고, 내가 더 건네지도 않아요'))bAct({act:'block',vid:b.dataset.bblock,id:b.dataset.bpid},'차단했어요')});
  box.querySelectorAll('[data-tabgo]').forEach(b=>b.onclick=()=>{icView.tab=b.dataset.tabgo;renderIlchon()});
  box.querySelectorAll('[data-newsgo]').forEach(b=>b.onclick=()=>{const k=b.dataset.newskind;openIlchon(b.dataset.newsgo,k==='diary'||k==='photo'?k:k==='pyeong'?'home':'guest')});
  box.querySelectorAll('[data-home]').forEach(b=>b.onclick=()=>openIlchon(b.dataset.home,'home'));
  box.querySelectorAll('[data-wantilchon]').forEach(b=>b.onclick=async()=>{await openIlchon('me','req');icView.wantLogin=b.dataset.wantilchon;renderIlchon()});
  box.querySelectorAll('[data-photo]').forEach(f=>f.onclick=()=>photoView(f.dataset.photo));
  box.querySelectorAll('[data-pdel]').forEach(b=>b.onclick=()=>{if(confirm('이 글을 지울까요?'))icAct('post-delete',{id:b.dataset.pdel},'지웠어요')});
  box.querySelectorAll('[data-gbdel]').forEach(b=>b.onclick=()=>{if(confirm('이 방명록을 지울까요?'))icAct('guestbook-delete',{id:b.dataset.gbdel},'지웠어요')});
  box.querySelectorAll('[data-rgo]').forEach(b=>b.onclick=()=>{const i=box.querySelector(`[data-rin="${b.dataset.rgo}"]`);icAct('reply',{id:b.dataset.rgo,text:i&&i.value},'답글을 달았어요')});
  box.querySelectorAll('[data-skin]').forEach(b=>b.onclick=()=>icAct('profile',{skin:b.dataset.skin},'스킨을 바꿨어요'));
  const iss=x=>/^\d+$/.test(x)?+x:x;
  box.querySelectorAll('[data-accept]').forEach(b=>b.onclick=()=>{const i=box.querySelector(`[data-callfor="${b.dataset.accept}"]`);icAct('accept',{issue:iss(b.dataset.accept),callThem:i&&i.value},'일촌이 됐어요! 🎉 1~2분 뒤 홈이 보여요')});
  box.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>icAct('reject',{issue:iss(b.dataset.reject)},'거절했어요'));
  box.querySelectorAll('[data-copycode]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copycode);toast('일촌 코드를 복사했어요')}catch(e){toast(b.dataset.copycode)}});
  {const cb=box.querySelector('#icShareIds');if(cb)cb.onchange=()=>icAct('share-ids',{on:cb.checked},cb.checked?'일촌 코드도 보여 줘요':'일촌 이름만 보여 줘요')}
  {const fo=box.querySelector('#icFeatOn');if(fo)fo.onclick=()=>askIlchonFeature(true)}
  {const ff=box.querySelector('#icFeatOff');if(ff)ff.onclick=async()=>{if(!confirm('일촌 맺기를 끌까요? 맺은 일촌과는 주고받기를 멈춰요(끊기는 아니에요). 다시 켜면 이어져요.'))return;
    {const r=await mbPost('/api/settings',{ilchonOn:false});if(r&&r.error){toast(r.error);return}}
    toast('일촌 맺기를 껐어요');IC=await (await fetch('/api/ilchon')).json();renderIlchon()}}
  box.querySelectorAll('[data-leave]').forEach(b=>b.onclick=()=>{if(confirm(`「${b.dataset.lname||'이 일촌'}」 일촌을 끊을까요? 이제 서로 글·편지를 못 주고받아요.`))icAct('leave',{repo:b.dataset.leave},'일촌을 끊었어요')});
  box.querySelectorAll('[data-callas]').forEach(b=>b.onclick=()=>{const x=prompt('내가 부를 일촌명',b.dataset.cur||'');if(x!=null)icAct('rename',{repo:b.dataset.callas,callThem:x},'바꿨어요')});
  box.querySelectorAll('[data-ic]').forEach(b=>b.onclick=async()=>{
    const a=b.dataset.ic;
    if(a==='close')return closeIlchon();
    if(a==='go-me')return openIlchon('me','home');
    if(a==='intro-edit'){icView.edit=true;return renderIlchon()}
    if(a==='intro-cancel'){icView.edit=false;return renderIlchon()}
    if(a==='intro-save'){icView.edit=false;return icAct('profile',{intro:v('icIntro')},'대문글을 고쳤어요 (일촌에겐 1~2분 뒤 보여요)')}
    if(a==='rename'){const n=prompt('마을 이름',icHome&&icHome.name||'');if(n!=null)icAct('name',{name:n},'이름을 바꿨어요');return}
    if(a==='gb')return icAct('guestbook',{vid:icView.vid,text:v('icGb'),secret:(document.getElementById('icGbS')||{}).checked},'방명록을 남겼어요 🌰+1');
    if(a==='py')return icAct('pyeong',{vid:icView.vid,text:v('icPy')},'일촌평을 남겼어요');
    if(a==='diary')return icAct('post',{kind:'diary',title:v('icDTitle'),text:v('icDText'),mood:v('icDMood'),scope:(document.getElementById('icDMe')||{}).checked?'me':'all'},'다이어리를 썼어요');
    if(a==='photo'){const f=(document.getElementById('icPFile')||{}).files;if(!f||!f[0])return toast('사진을 골라 주세요');const img=await fileB64(f[0]);return icAct('post',{kind:'photo',title:v('icPTitle'),text:v('icPText'),image:img,scope:(document.getElementById('icPMe')||{}).checked?'me':'all'},'사진을 올렸어요')}
    if(a==='mood')return icAct('profile',{mood:v('icMood'),line:v('icLine')},'오늘의 기분을 바꿨어요');
    if(a==='minime')return icAct('profile',{minime:v('icMini')},'대표 주민을 정했어요');
    if(a==='room')return icAct('profile',{room:v('icRoom')},'마을 방 배경을 바꿨어요');
    if(a==='bgm')return icAct('bgm',{url:v('icBgmUrl'),title:v('icBgmTitle')},'배경음악을 걸었어요 🎵');
    if(a==='play'){icView.play=true;return renderIlchon()}
    if(a==='bgm-clear')return icAct('bgm-clear',{},'배경음악을 뺐어요');
    if(a==='surf'){try{const j=await icPost('surf');openIlchon(j.vid,'home')}catch(e){toast(e.message)}return}
    if(a==='plaza')return icAct('plaza',{},'일촌 신청 받기를 켰어요');
    if(a==='board-post'){icBoard=null;return icAct('board-post',{text:v('icBText'),range:+v('icBRange')},'게시판에 올렸어요 📰 (일촌에겐 1~2분 뒤)')}
    if(a==='unblock'){icBoard=null;return icAct('board-act',{act:'unblock-all'},'차단을 모두 풀었어요')}
    if(a==='request')return icAct('request',{login:v('icTo'),callThem:v('icCall'),calledByThem:v('icCalled'),message:v('icMsg')},'일촌 신청을 보냈어요 💌');
    if(a==='letter'){closeIlchon();openNeighbor();return}
  });
  const enter=(id,act)=>{const el=document.getElementById(id);if(el)el.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();box.querySelector(`[data-ic="${act}"]`).click()}})};
  enter('icGb','gb');enter('icPy','py');
  bindPostBits(box);
}
// 배포본 첫 실행: 이 마을을 만든 사람(배포자)과 일촌을 맺을지 묻는다
function askDistributor(){
  const d=IC.distributor, box=document.getElementById('ilchon');
  box.classList.add('open');
  const ready=(d.code&&IC.code)||(d.github&&IC.ghReady);
  box.innerHTML=`<div class="mh" style="height:auto;width:min(520px,94vw)"><div class="mh-top"><b>🎉 에이전트빌리지에 오신 걸 환영해요</b></div>
    <div class="mh-main" style="padding:16px 18px"><div style="font-size:15px;line-height:1.7">이 마을을 만든 <b style="color:#f07c00">${esc(d.name||d.github)}</b>님과 <b>일촌</b>을 맺을까요?</div>
    <div class="mh-note" style="margin:6px 0 12px">일촌이 되면 서로의 마을 이름·한마디·주민 캐릭터를 구경하고 방명록에 인사를 남길 수 있어요. 세션 이름·대화·작업물·파일은 보이지 않고, 상대가 내 주민에게 일을 시킬 수도 없어요.</div>
    ${ready?`<div class="mh-form" style="max-width:none">
      <label>${esc(d.name||d.github)}님을 부를 일촌명</label><input id="dCall" maxlength="20" value="마을 만든 이">
      <label>나를 불러 줄 일촌명</label><input id="dCalled" maxlength="20" placeholder="예: 영상 보고 온 이웃">
      <label>한마디</label><input id="dMsg" maxlength="300" placeholder="영상 보고 왔어요! 일촌 맺어요 🙌"></div>`
      :`<div class="mh-note">일촌은 깃허브로 이어져요. 먼저 터미널에서 <code>gh auth login</code> 을 <b>직접</b> 해 주세요. 그 뒤 「🏠 일촌·미니홈피 → 일촌 신청」에서 언제든 맺을 수 있어요.</div>`}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button class="mh-btn gray" data-d="no">안 맺을래요</button><button class="mh-btn gray" data-d="later">나중에</button>${ready?'<button class="mh-btn" data-d="yes">💌 일촌 맺기</button>':''}</div></div></div>`;
  box.querySelectorAll('input').forEach(el=>el.addEventListener('keydown',e=>e.stopPropagation()));
  box.querySelectorAll('[data-d]').forEach(b=>b.onclick=async()=>{
    const a=b.dataset.d;
    if(a==='later'){closeIlchon();return}
    try{await icPost('distributor',{yes:a==='yes',callThem:(document.getElementById('dCall')||{}).value,calledByThem:(document.getElementById('dCalled')||{}).value,message:(document.getElementById('dMsg')||{}).value});
      toast(a==='yes'?'일촌 신청을 보냈어요 💌 수락되면 「🏠 일촌」에 생겨요':'알겠어요. 언제든 「🏠 일촌」에서 맺을 수 있어요')}catch(e){toast(e.message)}
    closeIlchon();
  });
}

// ---- 언어 바꾸기 (11-26): 단추 글은 번역표에 걸리지 않게 \u 로 적는다 ----
(function(){
  const en=document.documentElement.lang==='en', b=document.getElementById('langBtn');
  if(b)b.textContent=en?'\uD83C\uDF10 \uD55C\uAD6D\uC5B4\uB85C \uBCF4\uAE30':'\uD83C\uDF10 English';
})();
async function toggleLang(){
  const en=document.documentElement.lang==='en';
  try{await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lang:en?'ko':'en'})})}catch(e){}
  location.reload();
}
window.toggleLang=toggleLang;


// ---- 화면 단추 처리 한곳 (11-27): 글 안에 넣는 onclick 을 없애고 화면 보호막에서 'unsafe-inline' 을 뺐다.
// 이제 화면에 남의 글이 몰래 끼어들어도 스크립트가 돌지 않는다. data-act 이름은 아래 목록에 있는 것만 실행한다.
const ACTS={
  toggleHud:()=>document.getElementById('hud').classList.toggle('open'),
  askSpawnTop:()=>askSpawn(null),
  ilchonHome:()=>openIlchon('me','home'),
  ilchonBoard:()=>openIlchon('me','board'),
};
for(const f of ['toggleOrg','toggleRec','replayTalks','toggleAwakeAll','openCs','showPhone','openIlchon','openNeighbor','openBackground',
  'openSettings','toggleLang','openMailbox','toggleOutside','closePanel','endPick','endBossPick','closeMailbox','closeCs'])
  ACTS[f]=()=>window[f]();
document.addEventListener('click',e=>{
  const el=e.target.closest&&e.target.closest('[data-act]');
  if(!el)return;
  const fn=Object.prototype.hasOwnProperty.call(ACTS,el.dataset.act)?ACTS[el.dataset.act]:null;
  if(fn)fn(e);
});
