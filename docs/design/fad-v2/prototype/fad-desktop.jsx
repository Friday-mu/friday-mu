/* FAD V2 — Manager/GM desktop: shell + screens (static, full-length) */
const DP = {
  search:'M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-4.3-4.3',
  spark:'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z',
  bell:'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  gear:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  sun:'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  chevD:'M6 9l6 6 6-6', chevR:'M9 6l6 6-6 6', chevL:'M15 6l-6 6 6 6',
  inbox:'M22 12h-6l-2 3h-4l-2-3H2M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  ops:'M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9',
  cal:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  home:'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5', doc:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6',
  coin:'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11',
  owner:'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9 21v-6h6v6', chart:'M3 3v18h18M18 17V9M13 17V5M8 17v-3',
  more:'M5 12h.01M12 12h.01M19 12h.01', check:'M20 6 9 17l-5-5', x:'M18 6 6 18M6 6l12 12',
  flag:'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', clock:'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2',
  play:'M6 4l14 8-14 8z', pause:'M6 4h4v16H6zM14 4h4v16h-4z', undo:'M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8',
  shield:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', pin:'M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12zM12 9m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0',
  plus:'M12 5v14M5 12h14', filter:'M22 3H2l8 9.46V19l4 2v-8.54z', cam:'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  chevsU:'M7 11l5-5 5 5M7 18l5-5 5 5', chevsD:'M7 6l5 5 5-5M7 13l5 5 5-5', arrowU:'M12 19V5M5 12l7-7 7 7', diamond:'M12 2 22 12 12 22 2 12z',
  msg:'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z',
  list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', star:'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z',
  box:'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.3 7l8.7 5 8.7-5M12 22V12',
  building:'M3 21h18M5 21V7l8-4v18M19 21V11l-6-3M9 9v.01M9 12v.01M9 15v.01M9 18v.01',
  phone:'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  phoneOff:'M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4 12.8 12.8 0 0 0 2.8.7 2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1M5 5a19 19 0 0 0 2 3.3M1 1l22 22M16.7 11A19 19 0 0 1 19 13',
  video:'M23 7l-7 5 7 5zM1 5h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z',
  videoOff:'M16 16H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2m4 0h2a2 2 0 0 1 2 2v6M23 7l-5 3.5M1 1l22 22',
  mic:'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
  micOff:'M1 1l22 22M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V4a3 3 0 0 0-5.9-.6M19 10v2a7 7 0 0 1-.1 1.3M12 19v4M8 23h8',
  minimize:'M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3',
  expand:'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  volume:'M11 5 6 9H2v6h4l5 4zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07',
  bookmark:'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  unread:'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM18 4m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  userplus:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6',
  dlink:'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  lock:'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4', dollar:'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', alert:'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
};
function DI({n, s=2, style}){
  const d=DP[n]||'';
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={s} strokeLinecap="round" strokeLinejoin="round" style={{width:'1em',height:'1em',...style}}
    dangerouslySetInnerHTML={{__html:d.split('M').filter(Boolean).map(x=>`<path d="M${x}"/>`).join('')}}/>;
}
function PriD({level}){
  const m={urgent:'chevsU',high:'arrowU',med:'diamond',low:'chevsD'};
  return <span className={"pri "+level}><svg viewBox="0 0 24 24" fill={level==='med'?'currentColor':'none'} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{__html:(DP[m[level]]||'').split('M').filter(Boolean).map(x=>`<path d="M${x}"/>`).join('')}}/></span>;
}

/* ---- Global navigation primitive ----------------------------------------
   In the single-file prototype, fad-router.jsx registers window.__FADROUTER
   and FADGO swaps the in-app screen. On standalone per-screen pages there is
   no router, so FADGO falls back to a full page load via PAGEMAP. */
const FAD_PAGEMAP = {
  inbox:'FAD Manager - Inbox.html', ops:'FAD Manager - Operations.html', cal:'FAD Manager - Calendar.html',
  schedule:'FAD Manager - Schedule.html', tasks:'FAD Manager - All tasks.html', approvals:'FAD Manager - Approvals.html',
  roster:'FAD Manager - Roster.html', supplies:'FAD Manager - Supplies.html', map:'FAD Manager - Live Map.html',
  prop:'FAD Manager - Properties.html', allprops:'FAD Manager - All properties.html', property:'FAD Manager - Property record.html',
  res:'FAD Manager - Reservations.html', allres:'FAD Manager - All reservations.html', reservation:'FAD Manager - Reservation detail.html',
  own:'FAD Manager - Owners.html', ownerstmt:'FAD Manager - Owner statement.html',
  fin:'FAD Manager - Finance.html', an:'FAD Manager - Analytics.html', ppl:'FAD Manager - Guests.html', hr:'FAD Manager - HR.html',
  rev:'FAD Manager - Reviews.html', notif:'FAD Manager - Notifications.html', settings:'FAD Manager - Settings.html',
  training:'FAD Manager - Training.html', help:'FAD Manager - Help.html', askfull:'FAD Manager - Ask Friday.html',
  more:'FAD V2 \u2014 Manager (GM) Screens.html',
};
window.FADGO = function(key){
  if(window.__FADROUTER){ window.__FADROUTER(key); return; }
  const f = FAD_PAGEMAP[key];
  if(f) window.location.href = f;
};

/* ---- role-based views ("Viewing as") ------------------------------------- */
const RAIL_GROUPS = [
  ['Today', [['inbox','inbox','Inbox','3',true,['team']],['ops','ops','Operations','6',true],['cal','cal','Calendar']]],
  ['Portfolio', [['prop','home','Properties'],['res','doc','Reservations'],['own','owner','Owners']]],
  ['Business', [['fin','coin','Finance'],['an','chart','Analytics'],['ppl','users','Guests']]],
  ['Insights', [['rev','star','Reviews'],['training','spark','Training']]],
  ['Business units', [['syndic','building','Syndic'],['design','home','Design'],['agency','users','Agency']]],
  ['Growth & admin', [['leads','users','Leads / CRM'],['marketing','star','Marketing'],['legal','shield','Legal & Admin']]],
  ['Platform admin', [['tenant','gear','Tenant settings'],['billing','coin','Billing'],['admin','chart','Admin analytics']]],
  ['More', [['more','more','All modules']]],
];
const ROLES = {
  gm:        {label:'GM · Director', short:'GM', av:'FG', access:'*'},
  ops:       {label:'Ops Manager', short:'Ops Mgr', av:'BR', access:['inbox','ops','cal','prop','res','own','ppl','rev','training','more']},
  commercial:{label:'Commercial', short:'Commercial', av:'MO', access:['inbox','cal','res','ppl','leads','marketing','agency','rev','more']},
  finance:   {label:'Finance', short:'Finance', av:'CA', access:['inbox','fin','an','own','legal','billing','more']},
};
window.__FADROLE = window.__FADROLE || 'gm';
function useRole(){
  const [r,setR] = React.useState(window.__FADROLE);
  React.useEffect(()=>{ const h=()=>setR(window.__FADROLE); window.addEventListener('fad-role',h); return ()=>window.removeEventListener('fad-role',h); },[]);
  return r;
}
function setRole(r){
  if(r==='field'){ window.location.href='FAD V2 - Field Desktop (Prototype).html'; return; }
  window.__FADROLE = r; window.dispatchEvent(new Event('fad-role'));
  if(window.fadToast) window.fadToast('Now viewing as '+(ROLES[r]?ROLES[r].label:r));
  if(ROLES[r] && ROLES[r].access!=='*'){ var cur=(location.hash||'').replace('#',''); if(cur && ROLES[r].access.indexOf(cur)<0 && cur!=='askfull') window.FADGO('inbox'); }
}
function ViewAs(){
  const role = useRole();
  const [open,setOpen] = React.useState(false);
  React.useEffect(()=>{ const c=()=>setOpen(false); if(open) document.addEventListener('click',c); return ()=>document.removeEventListener('click',c); },[open]);
  const R = ROLES[role];
  return (
    <span className="viewas" style={{position:'relative'}} onClick={(e)=>{e.stopPropagation();setOpen(o=>!o);}}>
      <span className="av">{R.av}</span> Viewing as · {R.short} <DI n="chevD" s={2.2} style={{width:13,height:13,opacity:.6}}/>
      {open && <div className="viewas-menu">
        <div className="viewas-h">Switch role view</div>
        {Object.keys(ROLES).map(function(k){ return (
          <div key={k} className={"viewas-opt"+(k===role?' on':'')} onClick={(e)=>{e.stopPropagation();setRole(k);setOpen(false);}}>
            <span className="av">{ROLES[k].av}</span><div style={{flex:1,minWidth:0}}><div style={{fontSize:12.5,fontWeight:600}}>{ROLES[k].label}</div></div>{k===role&&<DI n="check" s={2} style={{color:'var(--indigo-bright)'}}/>}
          </div>
        ); })}
        <div className="viewas-opt" onClick={(e)=>{e.stopPropagation();setRole('field');}}><span className="av" style={{background:'var(--indigo-dim)',color:'var(--indigo-bright)'}}>IA</span><div style={{flex:1}}><div style={{fontSize:12.5,fontWeight:600}}>Field staff</div><div className="faint" style={{fontSize:10.5}}>opens the Field app ↗</div></div></div>
      </div>}
    </span>
  );
}
function Topbar(){
  return (
    <div className="dtop">
      <span className="collapse" onClick={()=>window.FADGO('more')} style={{cursor:'pointer'}}><DI n="list" s={2}/></span>
      <span className="wm" onClick={()=>window.FADGO('ops')} style={{cursor:'pointer'}}>FridayOS</span>
      <span className="tlbl"><span className="livedot" style={{marginRight:7}}/>Friday Retreats · Admin</span>
      <div className="dsearch" onClick={()=>window.FADASKUI?window.FADASKUI.openSearch():window.FADGO('askfull')} style={{cursor:'pointer'}}><DI n="search" s={2}/> <span>Search or <b>Ask Friday</b>…</span><span className="k">⌘K</span></div>
      <div className="dtop-right">
        <span className="icbtn askbtn" title="Ask Friday" onClick={()=>window.FADASKUI&&window.FADASKUI.openAsk()} style={{cursor:'pointer'}}><img className="askmk" src="friday-f.png" alt="" style={{width:18,height:18}}/></span>
        <span className="icbtn alert" onClick={()=>window.FADGO('notif')} style={{cursor:'pointer'}}><DI n="bell" s={2}/></span>
        <span className="icbtn"><DI n="sun" s={2}/></span>
        <ViewAs/>
      </div>
    </div>
  );
}
function NItem({ic, label, ct, hot, on, k}){
  return <div className={"nitem"+(on?" on":"")} onClick={()=>k&&window.FADGO(k)} style={{cursor:k?'pointer':'default'}}><DI n={ic} s={1.9}/><span>{label}</span>{ct!=null&&<span className={"ct"+(hot?" hot":"")}>{ct}</span>}</div>;
}
function Rail({active}){
  const role = useRole();
  const acc = ROLES[role].access;
  const allowed = k => acc==='*' || acc.indexOf(k)>=0;
  return (
    <div className="drail">
      <div className="askfri" onClick={()=>window.FADGO('askfull')} style={{cursor:'pointer'}}><img className="askmk" src="friday-f.png" alt=""/><span className="af-t">Ask Friday</span><span className="af-x"><DI n="chevR" s={2}/></span></div>
      {RAIL_GROUPS.map(function(grp){
        var vis = grp[1].filter(function(it){ return allowed(it[0]); });
        if(!vis.length) return null;
        return (
          <React.Fragment key={grp[0]}>
            <div className="nsec">{grp[0]}</div>
            {vis.map(function(it){ return <NItem key={it[0]} ic={it[1]} label={it[2]} ct={it[3]} hot={it[4]} on={active===it[0]||(it[5]&&it[5].indexOf(active)>=0)} k={it[0]}/>; })}
          </React.Fragment>
        );
      })}
      <div className="drail-foot"><span className="icbtn" onClick={()=>window.FADGO('settings')} style={{cursor:'pointer'}}><DI n="gear" s={2}/></span><span className="faint mono" style={{fontSize:10}}>FridayOS v2.0</span></div>
    </div>
  );
}
function Shell({active, eyebrow, title, sub, tabs, actions, panel, panelLabel, bare, children}){
  const [panelOpen,setPanelOpen] = React.useState(false);
  React.useEffect(()=>{
    window.__FADPANELOPEN = setPanelOpen;
    const h=()=>setPanelOpen(true);
    window.addEventListener('fad-open-panel',h);
    const esc=e=>{ if(e.key==='Escape') setPanelOpen(false); };
    window.addEventListener('keydown',esc);
    return ()=>{ if(window.__FADPANELOPEN===setPanelOpen) window.__FADPANELOPEN=null; window.removeEventListener('fad-open-panel',h); window.removeEventListener('keydown',esc); };
  },[]);
  const showPanel = panel && panelOpen;
  return (
    <div className="dwrap">
      <div className={"dapp"+(showPanel?" withpanel":"")}>
        <Topbar/>
        <Rail active={active}/>
        <div className="dmain">
          {!bare && <div className="dhead">
            <div style={{minWidth:0}}>{eyebrow&&<div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{sub&&<div className="sub">{sub}</div>}</div>
            <div className="row">{actions}{panel && <button className={"dbtn ghost"+(panelOpen?" on":"")} onClick={()=>setPanelOpen(o=>!o)} title="Toggle details panel"><DI n={panelLabel?panelLabel[1]:'doc'} s={1.8}/> {panelLabel?panelLabel[0]:'Details'}</button>}</div>
          </div>}
          {!bare && tabs && <div className="dtabs">{tabs.map((t,i)=><span key={i} className={"dtab"+(t.on?" on":"")} onClick={()=>t.fn?t.fn():(t.k&&window.FADGO(t.k))} style={{cursor:(t.fn||t.k)?'pointer':'default'}}>{t.l}{t.ct!=null&&<span className="ct">{t.ct}</span>}</span>)}</div>}
          <div className="dbody">{children}</div>
        </div>
        {showPanel && <div className="daside-host"><span className="daside-x" onClick={()=>setPanelOpen(false)} title="Close (Esc)"><DI n="x" s={2}/></span>{panel}</div>}
        {window.FADTASK && <window.FADTASK.Host/>}
        {window.FADASKUI && <window.FADASKUI.AskHost/>}
        {window.FADSYNDIC && <window.FADSYNDIC.LotDrawerHost/>}
        {window.FADDESIGN && <window.FADDESIGN.DesignDrawerHost/>}
      </div>
    </div>
  );
}

/* Reusable Ask Friday right-side panel (thin, context-aware, can act on the page) */
function AskPanel({scope, aware, msgs, action, done}){
  return (
    <div className="daside">
      <div className="afp-h">
        <div className="r1"><span className="tt"><img className="askmk" src="friday-f.png" alt=""/> Ask Friday</span><span className="icbtn" style={{width:26,height:26,border:'none',background:'transparent'}}><DI n="x" s={2}/></span></div>
        <div className="afp-scope"><span className="afp-chip" style={{color:'var(--indigo-bright)',borderColor:'var(--indigo-line)'}}><DI n="pin" s={2} style={{width:9,height:9}}/> {scope}</span><span className="afp-chip">All of FridayOS</span></div>
        <div className="afp-aware">{aware}</div>
      </div>
      <div className="afp-body">
        {msgs.map((m,i)=> m.me ? (
          <div key={i} className="afm me"><span className="ava me">FG</span><div className="bub" dangerouslySetInnerHTML={{__html:m.t}}/></div>
        ) : (
          <div key={i} className="afm"><span className="ava fr"><img className="askmk" src="friday-f.png" alt="" style={{width:'100%',height:'100%',borderRadius:'inherit'}}/></span><div style={{minWidth:0}}>
            <div className="bub" dangerouslySetInnerHTML={{__html:m.t}}/>
            {m.action && <div className="afact"><div className="at"><DI n="shield" s={1.7} style={{color:'var(--indigo-bright)'}}/> {m.action.t}</div><div className="adesc">{m.action.d}</div><div className="arow"><button className="dbtn primary sm"><DI n="check" s={2}/> {m.action.btn}</button><button className="dbtn ghost sm">Tweak</button></div></div>}
            {m.done && <div className="afdone" style={{marginTop:8}}><DI n="check" s={2}/> {m.done}</div>}
          </div></div>
        ))}
      </div>
      <div className="afp-comp"><div className="afp-in real"><input className="finput" placeholder="Ask or tell Friday to act…" onKeyDown={e=>{ if(e.key==='Enter'&&e.target.value.trim()){ window.fadToast&&window.fadToast('Sent to Friday'); e.target.value=''; } }}/><span className="snd"><DI n="chevR" s={2.2}/></span></div></div>
    </div>
  );
}
window.FADD = { DI, PriD, Topbar, Rail, Shell, AskPanel };
