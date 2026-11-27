// ================= 마을 동물 (11-27) =================
// 사장님네 동물들이 마을을 돌아다닌다. 그림은 data/art/<key>/ (없으면 그 동물은 안 나온다 — 공개본엔 없다).
//  · 호두: 고양이 (아메리칸 컬, 짧은 다리, 삼색) — 부비부비·배까기·기지개·식빵 골골·우다다
//  · 박하: 강아지 (블랙탄 단모 닥스훈트) — 꼬리 살랑·킁킁·배까기·놀자 자세·호두 쫓아가기
// 9동작: sit·walkA·walkB·run·belly·stretch·rub·loaf·sleep (코덱스 3x3 시트 → art/cut.py)
(function(){
  const POSES=['sit','walkA','walkB','run','belly','stretch','rub','loaf','sleep','punchA','punchB','crouch','pounce'];   // 뒤 넷은 호두 덤 그림 (둘이 놀기)
  const KINDS={
    cat:{H:20,walk:20,run:62,lines:{run:'우다다다!',belly:['골골골…','배 만져도 돼… 조금만'],stretch:'으아아암~',loaf:'그르릉… 골골…',
          rub:n=>`(${n}에게 부비부비) 그르릉~`,click:['그르릉~ 골골골 ♡','그르릉… 골골…'],wake:'으아암… 깼다냥',pal:'킁… (모른 척)'},
         sleepNight:.25,sleepDay:.05},
    dog:{H:19,walk:24,run:78,lines:{run:'신난다!! 멍!',belly:['배 긁어 주세요!','헥헥 ♡'],stretch:'놀자 놀자!',loaf:'(턱 괴고 쉬는 중)',
          rub:n=>`(${n}에게 꼬리 살랑살랑) 멍!`,click:['멍멍! ♡','헥헥… 좋아요!'],wake:'(벌떡) 멍?',pal:'킁킁… 호두 냄새!'},
         sleepNight:.2,sleepDay:.04},
  };
  // size: 따로 맞춘 크기(scales.json)가 없을 때 쓰는 기본 크기 — 사장님이 맞춘 값 그대로
  const PETS=[{key:'pet-hodu',name:'호두',kind:'cat',x:.42,y:.62,size:.85},{key:'pet-baka',name:'박하',kind:'dog',x:.58,y:.66,size:1}];
  const rnd=(a,b)=>a+Math.random()*(b-a), pickOne=a=>Array.isArray(a)?a[Math.floor(Math.random()*a.length)]:a;
  const live=[];

  for(const cfg of PETS){
    fetch(`/art/${cfg.key}/sheet.json`).then(r=>r.ok?r.json():null).then(meta=>{
      if(!meta||!meta.sit)return;
      const K=KINDS[cfg.kind], IM={}, need=POSES.filter(p=>meta[p]);let n=0;
      const pet={cfg,K,IM,ready:false,x:W*cfg.x,y:H*cfg.y,tx:0,ty:0,flip:false,act:'sit',until:0,target:null,say:null,sayUntil:0,hearts:[],purrUntil:0,box:null};
      pet.tx=pet.x;pet.ty=pet.y;
      for(const p of need){const im=new Image();im.onload=()=>{if(++n===need.length)pet.ready=true};im.src=`/art/${cfg.key}/${p}.png`;IM[p]=im}
      live.push(pet);
    }).catch(()=>{});
  }

  // 크기 비율: 주민 그림과 같은 자리(data/art/scales.json)에 동물 이름(pet-hodu 등)으로 저장한다
  const sizeOf=pet=>((typeof ART!=='undefined'&&ART.scales)||{})[pet.cfg.key]||pet.cfg.size||1;
  const say=(pet,t,ms)=>{pet.say=t;pet.sayUntil=performance.now()+(ms||2200)};
  const heart=(pet,x,y)=>pet.hearts.push({x,y,t0:performance.now()});
  const goTo=(pet,x,y)=>{pet.tx=Math.max(10,Math.min(W-10,x));pet.ty=Math.max(30,Math.min(H-6,y))};

  function choose(pet,now){
    const K=pet.K, L=K.lines, hr=new Date().getHours(), night=(hr>=23||hr<7);
    const r=Math.random(), ppl=[...people.values()].filter(p=>p.drawn);
    const others=live.filter(o=>o!==pet&&o.ready);
    if(r<(night?K.sleepNight:K.sleepDay)){pet.act='sleep';pet.until=now+rnd(8000,18000);return}
    const r2=Math.random();
    if(r2<0.28){pet.act='walk';goTo(pet,pet.x+rnd(-90,90),pet.y+rnd(-40,40));pet.until=now+12000}
    else if(r2<0.40){pet.act='run';goTo(pet,rnd(20,W-20),rnd(40,H-10));pet.until=now+8000;if(Math.random()<.5)say(pet,L.run,1500)}
    else if(r2<0.58&&ppl.length){pet.target=ppl[Math.floor(Math.random()*ppl.length)];pet.act='seek';pet.until=now+15000}
    else if(r2<0.64&&others.length){pet.target=others[0];pet.act='seek';pet.until=now+12000}       // 다른 동물한테 가 보기
    else if(r2<0.72){pet.act='belly';pet.until=now+rnd(4000,7000);say(pet,pickOne(L.belly),2600)}
    else if(r2<0.80){pet.act='stretch';pet.until=now+2400;say(pet,L.stretch,1800)}
    else if(r2<0.92){pet.act='loaf';pet.until=now+rnd(5000,9000);if(pet.cfg.kind==='cat')pet.purrUntil=pet.until;say(pet,L.loaf,2600)}
    else{pet.act='sit';pet.until=now+rnd(3000,6000)}
  }

  function step(pet,dt,now){
    const K=pet.K;
    if(pet.scene)return;           // 둘이 노는 장면 중에는 장면이 움직인다
    if(now>pet.until&&pet.act!=='seek'&&pet.act!=='rub')choose(pet,now);
    if(pet.act==='seek'){
      const t=pet.target, isPet=t&&t.cfg;
      const gone=!t||(isPet?!t.ready:!people.has(t.agent&&t.agent.id));
      if(gone||now>pet.until){pet.act='sit';pet.until=now+2000;pet.target=null}
      else{const side=pet.x<t.x?-1:1;goTo(pet,t.x+side*(isPet?14:12),t.y+(isPet?0:3));
        if(Math.hypot(pet.tx-pet.x,pet.ty-pet.y)<2){pet.act='rub';pet.flip=side>0;pet.until=now+rnd(3000,5000);
          if(pet.cfg.kind==='cat')pet.purrUntil=pet.until;
          say(pet,isPet?K.lines.pal:K.lines.rub(((t.agent&&t.agent.title)||'').slice(0,8)),2600)}}
    }
    if(pet.act==='rub'){
      if(Math.random()<dt*2.2)heart(pet,pet.x+(pet.flip?-6:6),pet.y-K.H);
      if(now>pet.until){pet.act='sit';pet.until=now+rnd(2000,4000);pet.target=null}
    }
    if(pet.act==='walk'||pet.act==='run'||pet.act==='seek'){
      const dx=pet.tx-pet.x,dy=pet.ty-pet.y,d=Math.hypot(dx,dy),sp=(pet.act==='run'?K.run:K.walk)*dt;
      if(d>0.6){pet.x+=dx/d*Math.min(sp,d);pet.y+=dy/d*Math.min(sp,d);if(Math.abs(dx)>0.3)pet.flip=dx<0}
      else if(pet.act!=='seek'){pet.act=Math.random()<.5?'sit':'loaf';pet.until=now+rnd(2500,5000)}
    }
    if(pet.purrUntil>now&&Math.random()<dt*0.8)heart(pet,pet.x+rnd(-4,4),pet.y-K.H-2);
  }

  function pose(pet,now){
    const a=pet.act, has=k=>pet.IM[k]&&pet.IM[k].naturalWidth;
    if(a==='flee'||a==='chase')return Math.floor(now/100)%2?'run':'walkA';
    if(a==='punch')return has('punchA')?(Math.floor(now/160)%2?'punchA':'punchB'):(Math.floor(now/160)%2?'stretch':'sit');
    if(a==='crouch')return has('crouch')?'crouch':'stretch';
    if(a==='pounce')return has('pounce')?'pounce':'run';
    if(a==='yelp')return 'sit';
    if(a==='walk'||a==='seek')return Math.floor(now/170)%2?'walkA':'walkB';
    if(a==='run')return Math.floor(now/110)%2?'run':'walkA';
    return {belly:'belly',stretch:'stretch',rub:'rub',loaf:'loaf',sleep:'sleep'}[a]||'sit';
  }

  function draw(pet,now){
    const IM=pet.IM, k=pose(pet,now), im=IM[k]&&IM[k].complete&&IM[k].naturalWidth?IM[k]:IM.sit;
    if(!im||!im.naturalWidth)return;
    const s=pet.K.H*sizeOf(pet)/IM.sit.naturalHeight, w=im.naturalWidth*s, h=im.naturalHeight*s;
    const hop=(pet.act==='run'||pet.act==='flee'||pet.act==='chase')?Math.abs(Math.sin(now/90))*1.5:pet.act==='pounce'?(pet.jump||0):0;
    const shake=pet.act==='yelp'?Math.sin(now/30)*0.6:0;
    const wag=(pet.cfg.kind==='dog'&&pet.act==='rub')?Math.sin(now/60)*0.4:0;
    const breathe=(pet.act==='loaf'||pet.act==='sleep'||pet.act==='belly')?Math.sin(now/600)*0.25:0;
    ctx.save();ctx.imageSmoothingEnabled=true;
    ctx.fillStyle='rgba(0,0,0,.16)';ctx.beginPath();ctx.ellipse(pet.x,pet.y,w*0.36,1.6,0,0,7);ctx.fill();
    const y=pet.y-h-hop+breathe;
    // 그림은 오른쪽을 본다 → 왼쪽으로 갈 때 뒤집는다
    if(pet.flip){ctx.translate(pet.x+wag+shake,0);ctx.scale(-1,1);ctx.drawImage(im,-w/2,y,w,h)}else ctx.drawImage(im,pet.x-w/2+wag+shake,y,w,h);
    ctx.restore();
    pet.box={x:pet.x-w/2,y,w,h};
    if(pet.act==='sleep'){const z=(now/800)%1;ctx.fillStyle=`rgba(255,255,255,${1-z})`;ctx.font='6px monospace';ctx.fillText('z',pet.x+5,pet.y-h-2-z*7)}
  }

  function drawOver(pet,now){
    pet.hearts=pet.hearts.filter(hh=>now-hh.t0<1400);
    for(const hh of pet.hearts){const t=(now-hh.t0)/1400;ctx.globalAlpha=1-t;ctx.fillStyle=hh.star?'#ffcf33':'#ff6b9a';ctx.font=(hh.star?'7px':'6px')+' sans-serif';ctx.fillText(hh.star?'✦':'♥',hh.x+(hh.star?Math.cos(hh.a)*t*6:0),hh.y-(hh.star?Math.sin(hh.a)*t*6:t*10));ctx.globalAlpha=1}
    if(pet.say&&now<pet.sayUntil&&pet.box){
      const t=`${pet.cfg.name}: ${pet.say}`;
      ctx.font='5.5px sans-serif';const tw=ctx.measureText(t).width+6, bx=Math.max(2,Math.min(W-tw-2,pet.x-tw/2)), by=pet.box.y-11;
      ctx.fillStyle='rgba(255,255,255,.93)';ctx.strokeStyle='rgba(120,90,60,.6)';ctx.lineWidth=.4;
      ctx.beginPath();ctx.roundRect?ctx.roundRect(bx,by,tw,8,3):ctx.rect(bx,by,tw,8);ctx.fill();ctx.stroke();
      ctx.fillStyle='#5a4030';ctx.fillText(t,bx+3,by+5.8);
    }
  }

  // 소리: 누를 때만 (브라우저가 눌러야 소리를 허락한다). 고양이 = 그르릉, 강아지 = 짧게 「왈!」 두 번
  let AC=null;
  const ac=()=>(AC=AC||new (window.AudioContext||window.webkitAudioContext)());
  function purr(sec){
    try{const A=ac(), n=A.sampleRate*sec, buf=A.createBuffer(1,n,A.sampleRate), d=buf.getChannelData(0);
      for(let i=0;i<n;i++){const t=i/A.sampleRate;const am=Math.pow(Math.max(0,Math.sin(Math.PI*2*24*t)),3);const env=Math.min(1,t*4,(sec-t)*3);d[i]=(Math.random()*2-1)*am*env*0.9}
      const src=A.createBufferSource();src.buffer=buf;const lp=A.createBiquadFilter();lp.type='lowpass';lp.frequency.value=380;
      const g=A.createGain();g.gain.value=0.5;src.connect(lp).connect(g).connect(A.destination);src.start()}catch(e){}
  }
  function bark(){
    try{const A=ac();
      for(const t0 of [0,0.22]){const o=A.createOscillator(),g=A.createGain(),f=A.createBiquadFilter(),t=A.currentTime+t0;
        o.type='sawtooth';o.frequency.setValueAtTime(820,t);o.frequency.exponentialRampToValueAtTime(380,t+0.12);
        f.type='bandpass';f.frequency.value=900;f.Q.value=1.2;
        g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.35,t+0.015);g.gain.exponentialRampToValueAtTime(0.0001,t+0.14);
        o.connect(f).connect(g).connect(A.destination);o.start(t);o.stop(t+0.16)}}catch(e){}
  }

  function hitPet(e){
    const b=cv.getBoundingClientRect(), x=(e.clientX-b.left)/SCALE, y=(e.clientY-b.top)/SCALE, m=2;
    return live.filter(p=>p.ready&&p.box).sort((a,c)=>c.y-a.y)
      .find(p=>x>=p.box.x-m&&x<=p.box.x+p.box.w+m&&y>=p.box.y-m&&y<=p.box.y+p.box.h+m);
  }
  cv.addEventListener('mousedown',e=>{
    if(e.button!==0)return;const pet=hitPet(e);if(!pet)return;
    e.stopImmediatePropagation();e.preventDefault();
    const now=performance.now(), L=pet.K.lines;
    if(pet.act==='sleep'){pet.act='stretch';pet.until=now+2400;say(pet,L.wake,1800);return}
    pet.act=Math.random()<.5?'belly':'loaf';pet.until=now+5500;say(pet,pickOne(L.click),2600);
    if(pet.cfg.kind==='cat'){pet.purrUntil=pet.until;purr(2.4)}else bark();
    for(let i=0;i<4;i++)heart(pet,pet.x+rnd(-5,5),pet.y-pet.K.H);
  },true);
  cv.addEventListener('mousemove',e=>{if(hitPet(e))cv.style.cursor='pointer'});
  // 우클릭: 크기 조절 (60~200%)
  cv.addEventListener('contextmenu',e=>{
    const pet=hitPet(e);if(!pet)return;
    e.stopImmediatePropagation();e.preventDefault();
    const k=pet.cfg.key, v0=Math.round(sizeOf(pet)*100), dlg=document.getElementById('confirm');
    dlg.innerHTML=`<div class="cbox" style="width:min(380px,92vw)"><h3>🐾 ${esc(pet.cfg.name)} 크기</h3>
      <p style="font-size:13px">📏 <input type="range" id="petScale" min="60" max="200" step="5" value="${v0}" style="vertical-align:middle;width:200px"> <b id="petScaleV">${v0}%</b></p>
      <p style="font-size:11.5px;opacity:.7">움직이면 마을에서 바로 보이고, 손을 떼면 저장돼요.</p>
      <div class="cbtn"><button data-c="p100">100%로</button><button data-c="no">닫기</button></div></div>`;
    dlg.style.display='flex';
    const sl=dlg.querySelector('#petScale');
    const show=v=>{ART.scales={...(ART.scales||{}),[k]:v/100};dlg.querySelector('#petScaleV').textContent=v+'%'};
    const save=async v=>{const r=await mbPost('/api/art/scale',{key:k,scale:v/100});if(r&&r.error)toast(r.error)};
    sl.oninput=()=>show(+sl.value);sl.onchange=()=>save(+sl.value);
    dlg.onclick=e2=>{const c=e2.target.dataset&&e2.target.dataset.c;
      if(e2.target===dlg||c==='no'){dlg.style.display='none'}
      else if(c==='p100'){sl.value=100;show(100);save(100)}};
  },true);

  // ---------- 둘이 놀기 (11-27 사장님: 박하가 호두를 쫓고, 호두가 냥냥펀치, 사이좋게 뒹굴기) ----------
  let scene=null, nextScene=performance.now()+rnd(15000,30000);
  const move=(pet,x,y,sp,dt)=>{x=Math.max(10,Math.min(W-10,x));y=Math.max(30,Math.min(H-6,y));
    const dx=x-pet.x,dy=y-pet.y,d=Math.hypot(dx,dy);if(d>0.5){pet.x+=dx/d*Math.min(sp*dt,d);pet.y+=dy/d*Math.min(sp*dt,d);if(Math.abs(dx)>0.3)pet.flip=dx<0}return d};
  const face=(a,b)=>{a.flip=b.x<a.x};
  const stars=(x,y)=>{const t0=performance.now();for(let i=0;i<5;i++)cat0().hearts.push({x,y,t0,star:true,a:rnd(0,6.28)})};
  const cat0=()=>live.find(p=>p.cfg.kind==='cat'), dog0=()=>live.find(p=>p.cfg.kind==='dog');
  function startScene(kind,now){
    const c=cat0(), d=dog0();
    c.scene=d.scene=true;c.target=d.target=null;c.purrUntil=0;
    scene={kind,t0:now,phase:0,c,d};
    if(kind==='chase'){c.act='flee';d.act='chase';say(c,'냐아앙!!',1800);say(d,'거기 서~ 멍멍!',1800)}
    else if(kind==='punch'){scene.phase=-1;c.act='sit';d.act='walk'}
    else{const mx=(c.x+d.x)/2,my=(c.y+d.y)/2;scene.mx=Math.max(30,Math.min(W-30,mx));scene.my=Math.max(40,Math.min(H-10,my));c.act='walk';d.act='walk'}
  }
  function endScene(now){
    const {c,d}=scene;c.scene=d.scene=false;c.until=now+rnd(2500,4000);d.until=now+rnd(2500,4000);
    if(c.act!=='belly'&&c.act!=='sit')c.act='sit';if(d.act!=='belly'&&d.act!=='sit')d.act='sit';
    scene=null;nextScene=now+rnd(30000,60000);
  }
  function runScene(dt,now){
    const {c,d}=scene, t=now-scene.t0;
    if(scene.kind==='chase'){
      // 호두는 박하 반대쪽으로 달아나고, 박하는 호두를 쫓는다 (조금 느려서 못 잡는다)
      if(!scene.fx||Math.hypot(scene.fx-c.x,scene.fy-c.y)<6){const ax=c.x-d.x,ay=c.y-d.y,al=Math.hypot(ax,ay)||1;
        scene.fx=c.x+ax/al*70+rnd(-30,30);scene.fy=c.y+ay/al*30+rnd(-25,25);
        if(scene.fx<20||scene.fx>W-20)scene.fx=W-scene.fx;if(scene.fy<40||scene.fy>H-8)scene.fy=H*0.6}
      // 너무 가까워지면(구석에 몰리면) 호두가 반대편 넓은 곳으로 확 빠져나간다
      if(Math.hypot(c.x-d.x,c.y-d.y)<16){scene.fx=c.x<W/2?W*0.8:W*0.2;scene.fy=rnd(H*0.45,H*0.8)}
      move(c,scene.fx,scene.fy,c.K.run*0.95,dt);
      {const ax=c.x-d.x,ay=c.y-d.y,al=Math.hypot(ax,ay)||1;move(d,c.x-ax/al*12,c.y-ay/al*12,d.K.run*0.68,dt)}   // 꼬리 바로 뒤까지만
      if(t>7000){
        if(Math.random()<0.6){scene={kind:'punch',t0:now,phase:-1,c,d};c.act='sit';d.act='walk'}
        else{say(c,'헥헥… 따돌렸다냥',1800);say(d,'헥헥헥…',1800);endScene(now)}
      }
      return;
    }
    if(scene.kind==='punch'){
      // 박하가 앉아 쳐다보고 → 호두가 냥냥펀치 → 박하 깨갱하고 배 깐다
      if(scene.phase===-1){c.act='sit';d.act='walk';const side=d.x<c.x?-1:1;
        if(move(d,c.x+side*19,c.y,d.K.walk*2,dt)<1||t>6000){scene.phase=0;scene.t0=now}else return}
      const t2=now-scene.t0;
      face(c,d);face(d,c);
      if(scene.phase===0){c.act='punch';d.act='sit';say(c,'냥냥펀치!!',2200);scene.phase=1}
      if(scene.phase===1){if(Math.random()<dt*6)stars(d.x+(d.flip?2:-2),d.y-d.K.H*0.8);
        if(t2>2300){c.act='sit';d.act='yelp';say(d,'깨갱… 항복!',1800);say(c,'흥.',1500);scene.phase=2}}
      if(scene.phase===2&&t2>3300){d.act='belly';d.until=now+3000;scene.phase=3}
      if(scene.phase===3&&t2>5500)endScene(now);
      return;
    }
    if(scene.kind==='play'){
      // 가운데로 모여서 → 박하 놀자 자세·호두 웅크리기 → 호두가 덮치기 → 둘이 뒹굴뒹굴
      if(scene.phase===0){const a=move(c,scene.mx-9,scene.my,c.K.walk*1.6,dt), b=move(d,scene.mx+9,scene.my,d.K.walk*1.6,dt);
        if((a<1&&b<1)||t>6000){scene.phase=1;scene.t1=now;face(c,d);face(d,c);c.act='crouch';d.act='stretch';say(d,'놀자 놀자!',1800)}}
      else{const u=now-scene.t1;
        if(scene.phase===1&&u>1800){scene.phase=2;c.act='pounce';scene.px=c.x;say(c,'냥!',1200)}
        if(scene.phase===2){const k=Math.min(1,(u-1800)/600);c.x=scene.px+(d.x-scene.px)*0.5*k;c.jump=Math.sin(k*Math.PI)*7;
          if(k>=1){c.jump=0;scene.phase=3;c.act='belly';d.act='belly';say(c,'둘이 뒹굴뒹굴~',2600);say(d,'헥헥 ♡',2600)}}
        if(scene.phase===3){if(Math.floor(u/450)%2){c.flip=!c.flip;d.flip=!d.flip;scene.u=u}
          if(Math.random()<dt*3){heart(c,c.x,c.y-c.K.H);heart(d,d.x,d.y-d.K.H)}
          if(u>6500){c.act='loaf';d.act='loaf';say(c,'그르릉…',1500);endScene(now)}}
      }
    }
  }

  window.PET={tick(dt,now,drawables){
                const c=cat0(), d=dog0();
                if(scene)runScene(dt,now);
                else if(c&&d&&c.ready&&d.ready&&now>nextScene&&c.act!=='sleep'&&d.act!=='sleep'){const r=Math.random();startScene(r<0.4?'chase':r<0.65?'punch':'play',now)}
                else if(c&&d&&now>nextScene)nextScene=now+10000;      // 누가 자고 있으면 조금 뒤에
                for(const p of live)if(p.ready){step(p,dt,now);drawables.push({y:p.y,f:()=>draw(p,now)})}},
              play(kind){const c=cat0(),d=dog0();if(c&&d&&c.ready&&d.ready){if(scene)endScene(performance.now());startScene(kind,performance.now())}},
              over(now){for(const p of live)if(p.ready)drawOver(p,now)}, live};
})();
