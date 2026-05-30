/* FAD V2 — States & Trust vocabulary.
   A global "AI health" mode lets every AI surface show its real operating
   state, not just the happy path. Surfaces read useHealth() and render the
   matching treatment. A floating toggle flips the whole app between modes
   so the failure/degraded states are first-class and demoable.

   Modes: healthy · stale · partial · fallback · failed  */
const { DI } = window.FADD;

const HEALTH_MODES = [
  ['healthy','Healthy','Live data · grounded answers'],
  ['stale','Stale data','Sync is behind — last known shown'],
  ['partial','Partial context','Some source data could not load'],
  ['fallback','Fallback answer','Not grounded in your data'],
  ['failed','Tool / API failed','A downstream service is down'],
];
const _hs = { v:'healthy', subs:new Set() };
function setHealth(v){ _hs.v=v; _hs.subs.forEach(f=>f(v)); }
function useHealth(){
  const [v,setV]=React.useState(_hs.v);
  React.useEffect(()=>{ _hs.subs.add(setV); return ()=>_hs.subs.delete(setV); },[]);
  return v;
}

/* ---- sync state chip (live / stale / failed) ---- */
function SyncChip({ source='Guesty', health }){
  const h = health||_hs.v;
  const map = {
    healthy:['live','Synced · just now','var(--green)'],
    stale:['stale','Stale · 12m ago','var(--amber)'],
    partial:['stale','Partial sync','var(--amber)'],
    fallback:['cached','Cached copy','var(--tx-3)'],
    failed:['failed','Sync failed','var(--red)'],
  };
  const [k,label,col]=map[h]||map.healthy;
  return (
    <span className={"syncchip "+k} title={source+' · '+label}>
      <span className="sc-dot" style={{background:col}}/>{source} · {label}
      {h==='failed' && <span className="sc-act" onClick={(e)=>{e.stopPropagation();window.fadToast&&window.fadToast('Reconnecting to '+source+'\u2026');}}>Reconnect</span>}
    </span>
  );
}

/* ---- provenance: what an answer is grounded in ---- */
function Provenance({ items, health }){
  const h = health||_hs.v;
  if(h==='fallback'){
    return <div className="prov fallback"><DI n="alert" s={1.6}/><span><b>General guidance</b> — not grounded in your data. Verify before sending.</span></div>;
  }
  if(h==='failed'){
    return <div className="prov failed"><DI n="alert" s={1.6}/><span><b>Couldn't generate a grounded draft</b> — the model API didn't respond. <span className="prov-retry" onClick={()=>window.fadToast&&window.fadToast('Retrying draft\u2026')}>Retry</span></span></div>;
  }
  const base = items||[['doc','reservation GY-q7ubP9Ak'],['home','GBH-B4 property facts'],['spark','2 active teachings']];
  const shown = h==='partial' ? base.slice(0,1) : base;
  return (
    <div className="prov">
      <span className="prov-lbl">Grounded in</span>
      {shown.map((s,i)=><span key={i} className="prov-chip"><DI n={s[0]} s={1.6}/>{s[1]}</span>)}
      {h==='partial' && <span className="prov-chip miss"><DI n="alert" s={1.6}/>guest history unavailable</span>}
    </div>
  );
}

/* ---- confidence meter ---- */
function ConfBar({ pct, health }){
  const h=health||_hs.v;
  const p = h==='fallback'?38 : h==='partial'?61 : (pct||88);
  const tone = p>=80?'var(--green)':p>=60?'var(--amber)':'var(--red)';
  return (
    <span className="confbar" title={"Friday confidence "+p+"%"}>
      <span className="cb-track"><i style={{width:p+'%',background:tone}}/></span>
      <span className="cb-num mono">{p}%</span>
    </span>
  );
}

/* ---- degraded / error banners (surface-level) ---- */
function StateBanner({ surface, health }){
  const h=health||_hs.v;
  if(h==='healthy') return null;
  const M={
    stale:['amber','clock',"Showing last-known data — "+(surface||'this view')+" last synced 12 minutes ago. Live sync is catching up."],
    partial:['amber','shield',"Partial context: some source records couldn't be loaded. Answers may be incomplete — fields below marked as unavailable."],
    fallback:['indigo','spark',"Friday is answering from general knowledge, not your data. Treat as a starting point and verify."],
    failed:['red','alert',"A downstream service is unavailable. Actions are paused and recommendations are read-only until it recovers."],
  };
  const [tone,ic,msg]=M[h];
  return (
    <div className={"statebanner "+tone}>
      <DI n={ic} s={1.7}/><span>{msg}</span>
      {h==='failed' && <button className="dbtn ghost sm" style={{marginLeft:'auto'}} onClick={()=>window.fadToast&&window.fadToast('Retrying\u2026')}>Retry</button>}
      {h==='stale' && <button className="dbtn ghost sm" style={{marginLeft:'auto'}} onClick={()=>window.fadToast&&window.fadToast('Forcing re-sync\u2026')}>Re-sync</button>}
    </div>
  );
}

/* ---- per-field source / provenance tag ---- */
const SRC_KINDS = {
  guesty:    ['var(--green)','Guesty'],
  breezeway: ['var(--teal,#3fb6c4)','Breezeway'],
  friday:    ['var(--indigo-bright)','FAD'],
  modeled:   ['var(--violet)','modeled'],
  stale:     ['var(--amber)','stale'],
  failed:    ['var(--red)','sync failed'],
};
function SourceTag({ kind='friday', note, onReconnect }){
  const [col,label] = SRC_KINDS[kind] || SRC_KINDS.friday;
  const title = note || (kind==='modeled' ? 'Forecast — not an observed value'
    : kind==='stale' ? 'Last sync past threshold'
    : kind==='failed' ? 'Sync errored' : 'from '+label);
  return (
    <span className={"srctag "+kind} title={title}>
      <span className="st-dot" style={{background:col}}/>{label}
      {kind==='failed' && <span className="st-act" onClick={(e)=>{e.stopPropagation();(onReconnect||(()=>window.fadToast&&window.fadToast('Reconnecting\u2026')))();}}>Reconnect</span>}
    </span>
  );
}
/* labelled field that carries its provenance */
function Field({ label, value, kind, note, mono }){
  return (
    <div className="kvp">
      <span className="kvp-l">{label}</span>
      <span className="kvp-v">
        <span className={mono?'mono':''}>{value}</span>
        {kind && <SourceTag kind={kind} note={note}/>}
      </span>
    </div>
  );
}

/* ---- the floating mode toggle ---- */
function AIStateToggle(){
  const h = useHealth();
  const [open,setOpen]=React.useState(false);
  const cur = HEALTH_MODES.find(m=>m[0]===h)||HEALTH_MODES[0];
  const tone = {healthy:'var(--green)',stale:'var(--amber)',partial:'var(--amber)',fallback:'var(--indigo-bright)',failed:'var(--red)'}[h];
  return (
    <div className={"aistate"+(open?' open':'')}>
      {open && <div className="aistate-menu">
        <div className="aistate-h">Simulate AI state</div>
        {HEALTH_MODES.map(m=>(
          <div key={m[0]} className={"aistate-opt"+(h===m[0]?' on':'')} onClick={()=>{setHealth(m[0]);setOpen(false);}}>
            <span className="ai-dot" style={{background:{healthy:'var(--green)',stale:'var(--amber)',partial:'var(--amber)',fallback:'var(--indigo-bright)',failed:'var(--red)'}[m[0]]}}/>
            <div><div className="ai-t">{m[1]}</div><div className="ai-s">{m[2]}</div></div>
            {h===m[0] && <DI n="check" s={2} style={{marginLeft:'auto',color:'var(--green)'}}/>}
          </div>
        ))}
      </div>}
      <button className="aistate-btn" onClick={()=>setOpen(o=>!o)}>
        <span className="ai-dot" style={{background:tone}}/> AI state: <b>{cur[1]}</b> <DI n="chevD" s={2} style={{width:11,height:11,transform:open?'rotate(180deg)':'none'}}/>
      </button>
    </div>
  );
}

window.FADSTATE = { useHealth, setHealth, SyncChip, Provenance, ConfBar, StateBanner, SourceTag, Field, AIStateToggle, HEALTH_MODES };
