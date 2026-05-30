/* FAD V2 — shared kit: icons + atoms. Exports to window. */
const { useState } = React;

/* ---------- navigation context ---------- */
const NavCtx = React.createContext(null);
const NAV_STUB = {
  go(){}, back(){}, tab(){}, openSheet(){}, closeSheet(){}, current:'tasks',
  timerFor(){ return {status:'idle', elapsed:0}; },
  startTimer(){}, pauseTimer(){}, resumeTimer(){}, completeTimer(){},
  reqFor(){ return {checks:{}, counts:{}, photos:0, itemPhotos:{}}; },
  toggleCheck(){}, setCount(){}, addPhoto(){}, addItemPhoto(){},
  call:null, startCall(){}, endCall(){}, minimizeCall(){}, expandCall(){},
};
const useNav = () => React.useContext(NavCtx) || NAV_STUB;

/* ---------- icons (lucide-ish, 24 stroke) ---------- */
const P = {
  bell:'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  search:'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-4.3-4.3',
  plus:'M12 5v14M5 12h14',
  cal:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  home:'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
  users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11',
  lock:'M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 8 0v4',
  clock:'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
  check:'M20 6 9 17l-5-5',
  chevR:'M9 6l6 6-6 6',
  chevL:'M15 6l-6 6 6 6',
  chevD:'M6 9l6 6 6-6',
  chevsU:'M7 11l5-5 5 5M7 18l5-5 5 5',
  chevsD:'M7 6l5 5 5-5M7 13l5 5 5-5',
  arrowU:'M12 19V5M5 12l7-7 7 7',
  diamond:'M12 2 22 12 12 22 2 12z',
  filter:'M22 3H2l8 9.46V19l4 2v-8.54z',
  x:'M18 6 6 18M6 6l12 12',
  play:'M6 4l14 8-14 8z',
  pause:'M6 4h4v16H6zM14 4h4v16h-4z',
  flag:'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z',
  pin:'M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12zM12 9m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
  cam:'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  box:'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12',
  wifi:'M5 12.55a11 11 0 0 1 14 0M2 8.82a16 16 0 0 1 20 0M8.5 16.43a6 6 0 0 1 7 0M12 20h.01',
  undo:'M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8',
  shield:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  user:'M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  mic:'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10a7 7 0 0 1-14 0M12 19v3',
  send:'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  alert:'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  dollar:'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  chart:'M3 3v18h18M18 17V9M13 17V5M8 17v-3',
  sparkle:'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4zM19 3v3M5 18v3M20.5 19.5h-3M6.5 4.5h-3',
  msg:'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z',
  mega:'M3 11v3a1 1 0 0 0 1 1h3l3.3 3.3a1 1 0 0 0 1.7-.7V7.4a1 1 0 0 0-1.7-.7L7 10H4a1 1 0 0 0-1 1zM18 8a5 5 0 0 1 0 8',
  gear:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  globe:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z',
  out:'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  at:'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94',
  star:'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z',
  bellOff:'M8.7 3A6 6 0 0 1 18 8c0 1.7.4 3 .9 4M6 8c0 7-3 9-3 9h13M10.3 21a1.94 1.94 0 0 0 3.4 0M2 2l20 20',
  pkg:'M16 16l-4 2-4-2M8 9l4-2 4 2M12 12v6',
  mail:'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6',
  grad:'M22 10v6M2 10l10-5 10 5-10 5zM6 12v5c0 1 2 3 6 3s6-2 6-3v-5',
  book:'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5z',
  help:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  car:'M5 17h14M6 17l-1-5 1.5-4a2 2 0 0 1 1.9-1.3h7.2a2 2 0 0 1 1.9 1.3L19 12l-1 5M5 17v2M19 17v2M7.5 12h9',
  trash:'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M18 6l-1 14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 6M10 11v6M14 11v6',
  drop:'M12 2.5S5 10 5 14a7 7 0 0 0 14 0c0-4-7-11.5-7-11.5z',
  zap:'M13 2 3 14h9l-1 8 10-12h-9z',
  info:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  phone:'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  video:'M23 7l-7 5 7 5zM3 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  micOff:'M1 1l22 22M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6M17 16.9A7 7 0 0 1 5 12M12 19v3',
  videoOff:'M16 16H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2m4 0h2a2 2 0 0 1 2 2v6M23 7l-5 3.5M1 1l22 22',
  phoneOff:'M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4 12.8 12.8 0 0 0 2.8.7 2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1M5 5a19 19 0 0 0 2 3.3M1 1l22 22M16.7 11A19 19 0 0 1 22 16.9',
  minimize:'M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3',
  expand:'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  volume:'M11 5 6 9H2v6h4l5 4zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07',
};
function Icon({n, s=2, style, cls}){
  const d = P[n] || '';
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={s}
      strokeLinecap="round" strokeLinejoin="round" className={cls} style={{width:'1em',height:'1em',...style}}
      dangerouslySetInnerHTML={{__html: d.split('M').filter(Boolean).map(seg=>`<path d="M${seg}"/>`).join('')}} />
  );
}

/* ---------- chrome ---------- */
function StatusBar(){
  return (
    <div className="statusbar">
      <span>9:41</span>
      <span className="sb-r">
        <span className="sb-bars"><i/><i/><i/><i/></span>
        <span style={{fontSize:13}}><Icon n="wifi" s={2.4}/></span>
        <span className="sb-batt"><i/></span>
      </span>
    </div>
  );
}

function AppHeader({eyebrow, title, sub, alert=true, onSearch=true}){
  const nav = useNav();
  return (
    <div className="apphead">
      <div className="head-row">
        <div className="col" style={{gap:3,minWidth:0,flex:1}}>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        <div className="row" style={{gap:8}}>
          {onSearch && <div className="iconbtn tap"><Icon n="search" s={2}/></div>}
          <div className={"iconbtn tap"+(alert?" alert":"")} onClick={()=>nav.go('notifs')}><Icon n="bell" s={2}/></div>
        </div>
      </div>
    </div>
  );
}

function AskBar({scope="Operations"}){
  return (
    <div className="askbar">
      <span className="spark" style={{fontSize:16}}><Icon n="sparkle" s={1.6}/></span>
      <span className="ask-tx">Ask Friday</span>
      <span className="ask-hint">{scope}</span>
    </div>
  );
}

function TabBar({active="tasks"}){
  const nav = useNav();
  const items = [
    {k:'tasks', n:'list', l:'Tasks'},
    {k:'chat', n:'msg', l:'Chat'},
    {k:'add', n:'plus', l:'', fab:true},
    {k:'history', n:'clock', l:'History'},
    {k:'account', n:'user', l:'Account'},
  ];
  return (
    <div className="tabbar">
      {items.map(it => it.fab ? (
        <div key={it.k} className="fab tap" onClick={()=>nav.go('report',null,'up')}><Icon n="plus" s={2.4}/></div>
      ) : (
        <div key={it.k} className={"tabitem tap"+(active===it.k?" on":"")} onClick={()=>nav.tab(it.k)}>
          <Icon n={it.n} s={2}/><span>{it.l}</span>
        </div>
      ))}
    </div>
  );
}

function BackBtn({label="Back"}){
  const nav = useNav();
  return <div className="backbtn tap" onClick={()=>nav.back()}><Icon n="chevL" s={2.2}/> {label}</div>;
}

/* ---------- atoms ---------- */
function PriorityGlyph({level}){
  const map = {urgent:'chevsU', high:'arrowU', med:'diamond', low:'chevsD'};
  const fill = level==='med';
  return (
    <span className={"pri "+level}>
      <svg viewBox="0 0 24 24" fill={fill?'currentColor':'none'} stroke="currentColor"
        strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
        dangerouslySetInnerHTML={{__html:(P[map[level]]||'').split('M').filter(Boolean).map(s=>`<path d="M${s}"/>`).join('')}} />
    </span>
  );
}

function Badge({tone='gray', dot=false, children}){
  return <span className={"badge "+tone+(dot?" dot":"")}>{children}</span>;
}

function SrcChip({src='bz', children, lock=true}){
  return (
    <span className={"srcchip "+src}>
      {lock && <span className="lock" style={{fontSize:9}}><Icon n="lock" s={2.2}/></span>}
      {children}
    </span>
  );
}

function Occ({state='in', children}){
  return <span className={"occ "+state}>{children}</span>;
}

/* ---------- task card ---------- */
function TaskCard({pcode, addr, title, meta, priority='med', accent, occ, occState, source, assignee, selected, due, status, onClick}){
  return (
    <div className={"tcard"+(accent?" accent "+accent:"")+(selected?" sel":"")+(onClick?" tap":"")} onClick={onClick}>
      <div className="t-top">
        <span className="pcode">{pcode}</span>
        <span className="addr">{addr}</span>
        <span className="grow"/>
        {due && <Badge tone={due.tone}>{due.label}</Badge>}
      </div>
      <div className="title">{title}</div>
      {meta && <div className="meta">{meta.map((m,i)=>(<React.Fragment key={i}>{i>0&&<span className="d">·</span>}<span>{m}</span></React.Fragment>))}</div>}
      <div className="t-foot">
        <PriorityGlyph level={priority}/>
        {occ && <Occ state={occState}>{occ}</Occ>}
        <span className="grow"/>
        {source && <SrcChip src={source.src}>{source.label}</SrcChip>}
        {assignee && <span className="avatar">{assignee}</span>}
      </div>
    </div>
  );
}

function MLabel({children, count, rule=true}){
  return <div className="mlabel"><span>{children}</span>{count!=null&&<span className="ct">{count}</span>}{rule&&<span className="rule"/>}</div>;
}

/* ---------- searchable property picker ---------- */
function PropPicker({value, onChange}){
  const [open,setOpen] = useState(false);
  const [q,setQ] = useState('');
  const list = (window.PROPERTIES||[]).filter(p=> (p.code+' '+p.name).toLowerCase().includes(q.toLowerCase()));
  const sel = (window.PROPERTIES||[]).find(p=>p.code===value);
  return (
    <div className="dd">
      <div className="dd-field tap" onClick={()=>setOpen(o=>!o)}>
        <span className="pcode">{value||'Select'}</span>
        <span className="dd-name">{sel?sel.name:'Tap to choose a property'}</span>
        <span className="dd-chev" style={{transform:open?'rotate(180deg)':'none'}}><Icon n="chevD" s={2}/></span>
      </div>
      {open && (
        <div className="dd-panel">
          <div className="dd-search">
            <Icon n="search" s={2}/>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Type to filter — e.g. SD or Tamarin"/>
            <span className="dd-ct">{list.length}</span>
          </div>
          <div className="dd-list">
            {list.map(p=>(
              <div key={p.code} className="dd-opt tap" onClick={()=>{onChange&&onChange(p.code);setOpen(false);setQ('');}}>
                <span className="pcode">{p.code}</span>
                <span className="dd-oname">{p.name}</span>
                {p.code===value && <span style={{color:'var(--indigo-bright)',display:'flex'}}><Icon n="check" s={2.4}/></span>}
              </div>
            ))}
            {list.length===0 && <div className="dd-empty">No property matches “{q}”</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- time formatting (shared) ---------- */
function fmtTimer(sec){
  sec=sec||0; const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  const p=(n)=>String(n).padStart(2,'0');
  return h>0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
function fmtDur(sec){
  sec=sec||0; const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60);
  return h>0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m`;
}

Object.assign(window, { NavCtx, useNav, NAV_STUB, Icon, StatusBar, AppHeader, AskBar, TabBar, BackBtn, PriorityGlyph, Badge, SrcChip, Occ, TaskCard, MLabel, PropPicker, fmtTimer, fmtDur });
