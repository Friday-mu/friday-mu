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

function Topbar(){
  return (
    <div className="dtop">
      <span className="collapse" onClick={()=>window.FADGO('more')} style={{cursor:'pointer'}}><DI n="list" s={2}/></span>
      <span className="wm" onClick={()=>window.FADGO('ops')} style={{cursor:'pointer'}}>FAD</span>
      <span className="tlbl">Friday Retreats · Admin</span>
      <div className="dsearch" onClick={()=>window.FADGO('askfull')} style={{cursor:'pointer'}}><DI n="search" s={2}/> <span>Search or <b>Ask Friday</b>…</span><span className="k">⌘K</span></div>
      <div className="dtop-right">
        <span className="icbtn alert" onClick={()=>window.FADGO('notif')} style={{cursor:'pointer'}}><DI n="bell" s={2}/></span>
        <span className="icbtn"><DI n="sun" s={2}/></span>
        <span className="viewas"><span className="av">FG</span> Viewing as · GM <DI n="chevD" s={2.2} style={{width:13,height:13,opacity:.6}}/></span>
      </div>
    </div>
  );
}
function NItem({ic, label, ct, hot, on, k}){
  return <div className={"nitem"+(on?" on":"")} onClick={()=>k&&window.FADGO(k)} style={{cursor:k?'pointer':'default'}}><DI n={ic} s={1.9}/><span>{label}</span>{ct!=null&&<span className={"ct"+(hot?" hot":"")}>{ct}</span>}</div>;
}
function Rail({active}){
  return (
    <div className="drail">
      <div className="askfri" onClick={()=>window.FADGO('askfull')} style={{cursor:'pointer'}}><span style={{color:'var(--indigo-bright)',fontSize:15}}><DI n="spark" s={1.6}/></span><span className="af-t">Ask Friday</span><span className="af-x"><DI n="chevR" s={2}/></span></div>
      <div className="nsec">Today</div>
      <NItem ic="inbox" label="Inbox" ct="3" on={active==='inbox'} k="inbox"/>
      <NItem ic="ops" label="Operations" ct="6" hot on={active==='ops'} k="ops"/>
      <NItem ic="cal" label="Calendar" on={active==='cal'} k="cal"/>
      <div className="nsec">Portfolio</div>
      <NItem ic="home" label="Properties" on={active==='prop'} k="prop"/>
      <NItem ic="doc" label="Reservations" on={active==='res'} k="res"/>
      <NItem ic="owner" label="Owners" on={active==='own'} k="own"/>
      <div className="nsec">Business</div>
      <NItem ic="coin" label="Finance" on={active==='fin'} k="fin"/>
      <NItem ic="chart" label="Analytics" on={active==='an'} k="an"/>
      <NItem ic="users" label="Guests & Team" on={active==='ppl'} k="ppl"/>
      <div className="nsec">More</div>
      <NItem ic="star" label="Reviews" on={active==='rev'} k="rev"/>
      <NItem ic="spark" label="Training" on={active==='training'} k="training"/>
      <NItem ic="more" label="All modules" on={active==='more'} k="more"/>
      <div className="drail-foot"><span className="icbtn" onClick={()=>window.FADGO('settings')} style={{cursor:'pointer'}}><DI n="gear" s={2}/></span><span className="faint mono" style={{fontSize:10}}>FAD v2.0</span></div>
    </div>
  );
}
function Shell({active, eyebrow, title, sub, tabs, actions, panel, bare, children}){
  return (
    <div className="dwrap">
      <div className={"dapp"+(panel?" withpanel":"")}>
        <Topbar/>
        <Rail active={active}/>
        <div className="dmain">
          {!bare && <div className="dhead">
            <div style={{minWidth:0}}>{eyebrow&&<div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{sub&&<div className="sub">{sub}</div>}</div>
            <div className="row">{actions}</div>
          </div>}
          {!bare && tabs && <div className="dtabs">{tabs.map((t,i)=><span key={i} className={"dtab"+(t.on?" on":"")} onClick={()=>t.k&&window.FADGO(t.k)} style={{cursor:t.k?'pointer':'default'}}>{t.l}{t.ct!=null&&<span className="ct">{t.ct}</span>}</span>)}</div>}
          <div className="dbody">{children}</div>
        </div>
        {panel}
        {window.FADTASK && <window.FADTASK.Host/>}
      </div>
    </div>
  );
}

/* Reusable Ask Friday right-side panel (thin, context-aware, can act on the page) */
function AskPanel({scope, aware, msgs, action, done}){
  return (
    <div className="daside">
      <div className="afp-h">
        <div className="r1"><span className="tt"><span className="sp"><DI n="spark" s={1.6}/></span> Ask Friday</span><span className="icbtn" style={{width:26,height:26,border:'none',background:'transparent'}}><DI n="x" s={2}/></span></div>
        <div className="afp-scope"><span className="afp-chip" style={{color:'var(--indigo-bright)',borderColor:'var(--indigo-line)'}}><DI n="pin" s={2} style={{width:9,height:9}}/> {scope}</span><span className="afp-chip">All of FAD</span></div>
        <div className="afp-aware">{aware}</div>
      </div>
      <div className="afp-body">
        {msgs.map((m,i)=> m.me ? (
          <div key={i} className="afm me"><span className="ava me">FG</span><div className="bub" dangerouslySetInnerHTML={{__html:m.t}}/></div>
        ) : (
          <div key={i} className="afm"><span className="ava fr"><DI n="spark" s={1.5}/></span><div style={{minWidth:0}}>
            <div className="bub" dangerouslySetInnerHTML={{__html:m.t}}/>
            {m.action && <div className="afact"><div className="at"><DI n="shield" s={1.7} style={{color:'var(--indigo-bright)'}}/> {m.action.t}</div><div className="adesc">{m.action.d}</div><div className="arow"><button className="dbtn primary sm"><DI n="check" s={2}/> {m.action.btn}</button><button className="dbtn ghost sm">Tweak</button></div></div>}
            {m.done && <div className="afdone" style={{marginTop:8}}><DI n="check" s={2}/> {m.done}</div>}
          </div></div>
        ))}
      </div>
      <div className="afp-comp"><div className="afp-in"><DI n="spark" s={1.6} style={{color:'var(--tx-3)'}}/> <span>Ask or tell Friday to act…</span><span className="snd"><DI n="chevR" s={2.2}/></span></div></div>
    </div>
  );
}
window.FADD = { DI, PriD, Topbar, Rail, Shell, AskPanel };
