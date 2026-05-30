/* FAD V2 — self-playing guided demo tour.
   Drives the desktop prototype (window.FADGO + real DOM clicks) through a
   scripted cross-module story, with a moving cursor, spotlight dimming,
   a caption bar, progress dots, and play / pause / restart / skip.
   Mount AFTER <DesktopApp/> in the demo HTML. */
const { useState, useRef, useEffect } = React;

/* ---------- tiny async helpers ---------- */
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function qs(sel, root){ return (root||document).querySelector(sel); }
function qsa(sel, root){ return [...(root||document).querySelectorAll(sel)]; }
async function waitFor(fn, timeout=2500){
  const t0=Date.now();
  while(Date.now()-t0<timeout){ const v=fn(); if(v) return v; await sleep(60); }
  return fn();
}
function byText(sel, re){ return qsa(sel).find(e=>re.test((e.textContent||'').trim())); }

/* ---------- count-up motion on visible stats ---------- */
function animateCounters(){
  qsa('.statc .n, .donut-num, .kpi .n').forEach(el=>{
    if(el.__counted) return;
    const raw=(el.textContent||'').trim();
    const m=raw.match(/^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/);
    if(!m) return;
    const pre=m[1], num=parseFloat(m[2].replace(/,/g,'')), suf=m[3];
    if(!isFinite(num)||num<=0){ return; }
    el.__counted=true;
    const dur=750, t0=performance.now(), hasComma=m[2].indexOf(',')>=0, dec=(m[2].split('.')[1]||'').length;
    function step(t){
      const k=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-k,3), v=num*e;
      let s=dec?v.toFixed(dec):Math.round(v).toString();
      if(hasComma) s=(+s).toLocaleString('en-US');
      el.textContent=pre+s+suf;
      if(k<1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

/* ====================================================================
   THE SCRIPT — each step:
   { go, caption, sub, wait, spot(), act(), chapter, hold }
   ==================================================================== */
function buildScript(D){
  return [
    { chapter:'Meet FAD', go:'ops', wait:700,
      caption:"This is FAD — Friday, your AI operations manager for short-stay rentals.",
      sub:"One workspace for the whole portfolio.", hold:3200 },

    { go:'ops', wait:500, spot:()=>byText('.fai, .fbar', /Friday|brief|tasks/i)||qs('.fai'),
      caption:"Every morning Friday writes the Daily Brief — what needs attention, already triaged.",
      sub:"32 tasks today, ranked. The manager starts here.", hold:3800 },

    { chapter:'Guest messaging', go:'inbox', wait:700, spot:()=>qs('.ibth.on')||qs('.ibth'),
      caption:"Guest messages land in one inbox — across Airbnb, Booking and direct.",
      sub:"Marie asks about check-in time.", hold:3400 },

    { go:'inbox', wait:300, spot:()=>byText('.bdg', /AI draft/i)||qs('.ibdraft, .ibmsg.me'),
      caption:"Friday has already drafted the reply — on-brand, ready to send.",
      sub:"The manager edits if needed, then sends. Most go out untouched.", hold:4000 },

    { chapter:'Closing the field loop', go:'approvals', wait:800, spot:()=>qs('.fai'),
      caption:"Out in the field, staff report issues. Friday triages them into tasks.",
      sub:"A pool-pump fault just came in — flagged urgent, recurring.", hold:3800 },

    { go:'approvals', wait:300,
      spot:()=>qs('.qrow .qactions .dbtn.green')?.closest('.qrow') || qs('.qrow'),
      cursor:()=>qs('.qrow .qactions .dbtn.green'),
      caption:"One click approves it — and the task is created and assigned instantly.",
      act:async()=>{ const b=qs('.qrow .qactions .dbtn.green'); if(b){ b.dispatchEvent(new MouseEvent('click',{bubbles:true})); } },
      hold:2600 },

    { go:'approvals', wait:1100, spot:()=>qs('.fadtoast')||qs('.qrow'),
      caption:"Assigned to the closest available tech — no manual dispatch.",
      sub:"Friday picked who, when and what parts to bring.", hold:3200 },

    { chapter:'Every task, one click deep', go:'tasks', wait:800,
      cursor:()=>qs('.tdrow'),
      caption:"Each task opens to the full picture — for the manager, not the field.",
      act:async()=>{ const r=await waitFor(()=>qs('.tdrow')); if(r) r.dispatchEvent(new MouseEvent('click',{bubbles:true})); },
      hold:1500 },

    { wait:900, spot:()=>qs('.tddrawer .fai')||qs('.tddrawer'),
      caption:"Friday's summary, the recurring-fault history, the suggested fix and parts.",
      sub:"Requirements, photos, supplies and cost — all mirrored from the field app.", hold:4200 },

    { wait:200, cursor:()=>byText('.tddrawer .tdfoot .dbtn', /complete/i),
      caption:"The manager can reassign, approve cost, or close it out from here.",
      act:async()=>{ const b=byText('.tddrawer .tdfoot .dbtn', /complete/i); if(b) b.dispatchEvent(new MouseEvent('click',{bubbles:true})); },
      hold:2400 },

    { wait:400, act:async()=>{ if(window.FADTASK&&window.FADTASK.close) window.FADTASK.close(); },
      caption:"Done — and the table behind it updates live.", hold:2000 },

    { chapter:'Friday keeps learning', go:'training', wait:900,
      cursor:()=>byText('.dtab', /Learning Queue/i),
      caption:"What makes Friday different: it learns your way of operating.",
      act:async()=>{ const t=await waitFor(()=>byText('.dtab', /Learning Queue/i)); if(t) t.dispatchEvent(new MouseEvent('click',{bubbles:true})); },
      hold:1600 },

    { wait:700, spot:()=>qs('.panel.lq'),
      caption:"It proposes rules from patterns it spots — each waits for your approval.",
      sub:"Nothing is applied until a human says yes.", hold:3800 },

    { wait:300, cursor:()=>qs('.panel.lq .dbtn.green'),
      caption:"Approve one, and it becomes a Teaching — applied everywhere, instantly.",
      act:async()=>{ const b=qs('.panel.lq .dbtn.green'); if(b) b.dispatchEvent(new MouseEvent('click',{bubbles:true})); },
      hold:2600 },

    { go:'training', wait:600, spot:()=>qs('.teach'),
      caption:"Now Friday follows that rule on every guest reply — getting better over time.",
      sub:"140 active teachings, learned from how the team actually works.", hold:4000 },

    { chapter:'FAD', go:'ops', wait:800,
      caption:"Friday runs the operation. The team runs the business.",
      sub:"FAD — AI operations for short-stay rentals.", hold:4200, end:true },
  ];
}

/* ---------- the controller UI + runner ---------- */
function DemoController(){
  const [on,setOn]      = useState(false);   // demo active
  const [playing,setPlaying] = useState(false);
  const [idx,setIdx]    = useState(-1);
  const [cap,setCap]    = useState(null);
  const [chapter,setChapter] = useState(null);
  const [spot,setSpot]  = useState(null);    // rect
  const [cursor,setCursor] = useState({x:innerWidth/2,y:innerHeight/2,down:false});
  const stop = useRef(false);
  const script = useRef(buildScript()).current;

  // counters animate whenever the route changes
  useEffect(()=>{
    const obs=()=>setTimeout(animateCounters,360);
    window.addEventListener('hashchange',obs);
    return ()=>window.removeEventListener('hashchange',obs);
  },[]);

  function rectOf(el){ if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; }
  async function moveCursorTo(el){
    if(!el) return;
    const r=el.getBoundingClientRect();
    setCursor(c=>({...c,x:r.left+r.width/2,y:r.top+Math.min(r.height/2,22),down:false}));
    await sleep(620);
    setCursor(c=>({...c,down:true})); await sleep(160); setCursor(c=>({...c,down:false}));
  }

  async function runFrom(start){
    stop.current=false; setPlaying(true);
    for(let i=Math.max(0,start); i<script.length; i++){
      if(stop.current) return;
      const s=script[i]; setIdx(i);
      if(s.chapter) setChapter(s.chapter);
      if(s.go){ window.FADGO(s.go); }
      await sleep(s.wait||500); if(stop.current) return;
      setTimeout(animateCounters,80);
      // caption
      setCap({t:s.caption,sub:s.sub,end:s.end});
      // spotlight
      const spotEl = s.spot? s.spot() : null;
      setSpot(rectOf(spotEl));
      // cursor move (to explicit cursor target, else to action/spot)
      const curEl = s.cursor? s.cursor() : null;
      if(curEl){ await moveCursorTo(curEl); if(stop.current) return; }
      // action
      if(s.act){ await s.act(); await sleep(360); setTimeout(animateCounters,80); }
      // re-evaluate spotlight after action (drawer opened etc.)
      if(s.spot){ await sleep(120); setSpot(rectOf(s.spot())); }
      await sleep(s.hold||2600); if(stop.current) return;
      setSpot(null);
    }
    setPlaying(false); setCap(c=>c&&{...c}); // keep last caption
  }

  function start(){ setOn(true); document.body.classList.add('demo-on'); setIdx(-1); setTimeout(()=>runFrom(0),200); }
  function exit(){ stop.current=true; setOn(false); setPlaying(false); setCap(null); setSpot(null); setChapter(null); document.body.classList.remove('demo-on'); }
  function pause(){ stop.current=true; setPlaying(false); }
  function resume(){ runFrom(idx+0>=0?idx:0); }
  function restart(){ stop.current=true; setTimeout(()=>{ setIdx(-1); setSpot(null); window.FADGO('ops'); setTimeout(()=>runFrom(0),300); },120); }
  function skip(){ stop.current=true; setTimeout(()=>runFrom(idx+1),120); }

  // launch FAB (always visible)
  if(!on){
    return <button className="demo-launch" onClick={start}>
      <span className="dl-ic">▶</span> Play product tour
    </button>;
  }

  const prog = Math.round(((idx+1)/script.length)*100);
  return (
    <div className="demo-layer">
      {/* spotlight */}
      {spot && <div className="demo-spot" style={{left:spot.x-8,top:spot.y-8,width:spot.w+16,height:spot.h+16}}/>}
      {!spot && <div className="demo-scrim-soft"/>}
      {/* fake cursor */}
      <div className={"demo-cursor"+(cursor.down?' down':'')} style={{transform:`translate(${cursor.x}px,${cursor.y}px)`}}>
        <svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 3l15 8.5-6.4 1.2 3.4 6.6-2.7 1.4-3.4-6.6L5 19z" fill="#fff" stroke="#1a2230" strokeWidth="1.2" strokeLinejoin="round"/></svg>
      </div>
      {/* caption bar */}
      {cap && <div className={"demo-cap"+(cap.end?' end':'')}>
        {chapter && <div className="demo-chapter">{chapter}</div>}
        <div className="demo-cap-t">{cap.t}</div>
        {cap.sub && <div className="demo-cap-sub">{cap.sub}</div>}
      </div>}
      {/* controls */}
      <div className="demo-ctl">
        <div className="demo-prog"><i style={{width:prog+'%'}}/></div>
        <div className="demo-btns">
          {playing
            ? <button className="dcbtn" onClick={pause} title="Pause">❚❚</button>
            : <button className="dcbtn" onClick={resume} title="Play">▶</button>}
          <button className="dcbtn" onClick={skip} title="Next">⏭</button>
          <button className="dcbtn" onClick={restart} title="Restart">↺</button>
          <span className="demo-step">{Math.max(1,idx+1)} / {script.length}</span>
          <span className="grow"/>
          <button className="dcbtn exit" onClick={exit}>Exit tour</button>
        </div>
      </div>
    </div>
  );
}

window.FADDEMO = { DemoController, animateCounters };
