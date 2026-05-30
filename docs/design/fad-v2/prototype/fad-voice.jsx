/* FAD V2 — Ask Friday VOICE MODE. Full-screen realtime voice overlay with an
   animated orb, tap-to-talk, server-VAD status chips, live transcript and a
   text-mode toggle. Reused by desktop ScreenAskFull + mobile MobileAsk.
   window.FADVOICE.VoiceOverlay({onClose, compact}) */
const VDI = (window.FADD && window.FADD.DI) || (()=>null);

/* scripted turn-taking so the demo feels alive */
const VOICE_SCRIPT = [
  {role:'you', t:'What needs me this morning?'},
  {role:'friday', t:'Three things: the SD-10 water fault is urgent, GBH-B4 needs a turnover before 3, and one owner statement is ready to send.'},
  {role:'you', t:'Draft the day and protect lunch.'},
  {role:'friday', t:'Done — 18 jobs across 4 staff, lunch held 12:30 to 1:30, zero guest conflicts. Want me to publish it?'},
];

function VoiceOverlay({onClose, compact}){
  // phases: idle → listening → thinking → speaking → (loop)
  const [phase,setPhase] = React.useState('idle');
  const [turn,setTurn] = React.useState(-1);     // index into VOICE_SCRIPT
  const [transcript,setTranscript] = React.useState('');
  const [connected,setConnected] = React.useState(false);
  const [muted,setMuted] = React.useState(false);
  const timers = React.useRef([]);
  const clearT = ()=>{ timers.current.forEach(clearTimeout); timers.current=[]; };
  const after = (ms,fn)=> timers.current.push(setTimeout(fn,ms));

  React.useEffect(()=>{ const k=e=>{ if(e.key==='Escape') onClose(); }; window.addEventListener('keydown',k); return ()=>{ window.removeEventListener('keydown',k); clearT(); }; },[]);

  // typewriter for a line
  const typeLine = (text, after_done)=>{
    setTranscript(''); let i=0;
    const step=()=>{ i+=Math.max(1,Math.round(text.length/26)); setTranscript(text.slice(0,i)); if(i<text.length) after(34,step); else after_done&&after(500,after_done); };
    step();
  };

  const connect = ()=>{ setConnected(true); listen(); };
  const listen = ()=>{
    clearT(); setPhase('listening');
    const next = Math.min(turn+1, VOICE_SCRIPT.length-1);
    const youLine = VOICE_SCRIPT.find((x,idx)=>idx>turn && x.role==='you');
    const yi = VOICE_SCRIPT.findIndex((x,idx)=>idx>turn && x.role==='you');
    if(!youLine){ setPhase('idle'); setTranscript('All caught up. Tap to talk.'); return; }
    // user "speaks"
    after(700,()=> typeLine(youLine.t, ()=>{
      setTurn(yi); setPhase('thinking');
      after(1100,()=>{
        const fr = VOICE_SCRIPT[yi+1];
        if(fr && fr.role==='friday'){ setPhase('speaking'); setTurn(yi+1); typeLine(fr.t, ()=> setPhase('idle')); }
        else setPhase('idle');
      });
    }));
  };
  const tap = ()=>{ if(!connected){ connect(); return; } if(phase==='idle') listen(); else { clearT(); setPhase('idle'); } };

  const STATUS = {
    idle: connected ? ['ready','var(--green)','realtime · ready'] : ['offline','var(--tx-3)','realtime · tap to connect'],
    listening:['live','var(--red)','realtime · listening'],
    thinking:['think','var(--amber)','realtime · thinking'],
    speaking:['speak','var(--indigo-bright)','realtime · Friday speaking'],
  }[phase];
  const youTurn = phase==='listening';

  const ui = (
    <div className={"voice-ov"+(compact?' compact':'')}>
      <div className="voice-top">
        <span className="voice-ctx"><span className="livedot" style={{background:'var(--indigo-bright)'}}/> ctx · all of FridayOS</span>
        <span className="faint mono" style={{fontSize:11}}>voice · realtime</span>
        <span className="grow" style={{flex:1}}/>
        <button className="voice-textbtn" onClick={onClose}><VDI n="msg" s={1.7}/> Text mode <span className="kbd">⌘J</span></button>
        <button className="voice-x" onClick={onClose}><VDI n="x" s={2}/></button>
      </div>

      <div className="voice-stage">
        <div className="voice-status" style={{borderColor:STATUS[1],color:STATUS[1]}}><span className="vs-dot" style={{background:STATUS[1]}}/> {STATUS[2]}</div>
        <div className={"voice-orb-wrap "+phase} onClick={tap}>
          <div className="voice-rays"/>
          <div className="voice-pulse"/>
          <div className="voice-orb"><div className="voice-orb-hl"/></div>
          {youTurn && <div className="voice-wave">{[0,1,2,3,4,5,6].map(i=><span key={i} style={{animationDelay:(i*0.09)+'s'}}/>)}</div>}
        </div>
        <div className="voice-label">{phase==='idle' ? (connected?'Tap to talk':'Tap to connect realtime') : phase==='listening' ? 'Listening…' : phase==='thinking' ? 'Friday is thinking…' : 'Friday'}</div>
        <div className="voice-transcript">{transcript || (connected?'':'Server VAD handles turns — just talk.')}</div>
      </div>

      <div className="voice-bottom">
        <div className="voice-input">
          <input className="finput" placeholder="…or type, then enter" onKeyDown={e=>{ if(e.key==='Enter'&&e.target.value.trim()){ window.fadToast&&window.fadToast('Sent to Friday'); e.target.value=''; } }}/>
          <button className={"voice-mic"+(youTurn?' on':'')} onClick={tap}><VDI n={muted?'micOff':'mic'} s={1.9}/></button>
        </div>
        <div className="voice-hint">tap mic to {connected?'talk':'connect realtime'} · server VAD handles turns · <span className="kbd">Esc</span> closes</div>
      </div>
    </div>
  );
  // desktop overlay must escape transformed ancestors (.dmain/.dbody) → portal to body.
  // mobile (compact) stays inside the relatively-positioned .mphone.
  return compact ? ui : (ReactDOM.createPortal ? ReactDOM.createPortal(ui, document.body) : ui);
}

window.FADVOICE = { VoiceOverlay };
