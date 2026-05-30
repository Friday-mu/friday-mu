/* FAD V2 — single-file prototype router (desktop + mobile).
   Registers window.__FADROUTER so the global FADGO(key) primitive
   (defined in fad-desktop.jsx) swaps the in-app screen instead of
   doing a full page load. Hash-synced for back/forward + refresh. */
const { DI } = window.FADD;

/* ---------------- DESKTOP routes ---------------- */
const S  = ()=>window.FADSCREENS, P = ()=>window.FADPROP, R = ()=>window.FADRES, T = ()=>window.FADTRAIN;
const DROUTES = {
  inbox:      ()=>S().ScreenInbox,
  ops:        ()=>S().ScreenOps,
  schedule:   ()=>S().ScreenSchedule,
  tasks:      ()=>S().ScreenAllTasks,
  approvals:  ()=>S().ScreenApprovals,
  roster:     ()=>S().ScreenRoster,
  supplies:   ()=>S().ScreenInventory,
  map:        ()=>S().ScreenMap,
  cal:        ()=>S().ScreenCalendar,
  prop:       ()=>S().ScreenProperties,
  allprops:   ()=>S().ScreenAllProperties,
  property:   ()=>P().ScreenProperty,
  res:        ()=>S().ScreenReservations,
  allres:     ()=>S().ScreenAllReservations,
  reservation:()=>R().ScreenReservation,
  own:        ()=>S().ScreenOwners,
  ownerstmt:  ()=>S().ScreenOwnerStatement,
  fin:        ()=>S().ScreenFinance,
  an:         ()=>S().ScreenAnalytics,
  ppl:        ()=>S().ScreenGuests,
  hr:         ()=>S().ScreenHR,
  rev:        ()=>S().ScreenReviews,
  notif:      ()=>S().ScreenNotifsMgr,
  settings:   ()=>S().ScreenSettings,
  training:   ()=>T().ScreenTraining,
  help:       ()=>S().ScreenHelp,
  askfull:    ()=>S().ScreenAskFull,
  more:       ()=>ModuleIndex,
};
const MODULE_GROUPS = [
  ['Today',     [['inbox','inbox','Inbox','Guest & team threads with AI drafts'],['ops','ops','Operations','Daily brief, schedule, live ops'],['cal','cal','Calendar','Portfolio occupancy timeline'],['notif','bell','Notifications','What Friday surfaced for you']]],
  ['Operations',[['schedule','cal','Schedule',"Friday's draft day plan"],['tasks','ops','All tasks','Every task across properties'],['approvals','check','Approvals','Vet field reports into tasks'],['roster','users','Roster','Staff coverage & time off'],['supplies','box','Supplies','Inventory across stores & vans'],['map','pin','Live map','Field staff on active jobs']]],
  ['Portfolio', [['prop','home','Properties','Units, condition & owners'],['res','doc','Reservations','Bookings across channels'],['own','owner','Owners','Statements & payouts']]],
  ['Business',  [['fin','coin','Finance','Period close, expenses, compliance'],['an','chart','Analytics','Revenue, occupancy, channels'],['ppl','users','Guests','Profiles & history'],['hr','users','Team / HR','Staff records & permissions'],['rev','star','Reviews','Ratings & AI replies']]],
  ['System',    [['training','spark','Training','Govern how Friday learns & acts'],['settings','gear','Settings','Roles, integrations, branding'],['askfull','spark','Ask Friday','The assistant, full screen'],['help','doc','Help','Guides & support']]],
];
function ModuleIndex(){
  const { Shell } = window.FADD;
  return (
    <Shell active="more" eyebrow="ALL MODULES" title="Everything in FAD" sub="Jump to any module — the rail covers the daily ones, this is the full map">
      {MODULE_GROUPS.map((g,gi)=>(
        <div key={gi} style={{marginBottom:18}}>
          <div className="dml">{g[0]}<span className="rule"/></div>
          <div className="grid3">
            {g[1].map((m,i)=>(
              <div key={i} className="panel tap modcard" onClick={()=>window.FADGO(m[0])}>
                <span className="modic"><DI n={m[1]} s={1.7}/></span>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13.5}}>{m[2]}</div>
                  <div className="faint" style={{fontSize:11.5,marginTop:2,lineHeight:1.4}}>{m[3]}</div>
                </div>
                <span className="modgo"><DI n="chevR" s={2}/></span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Shell>
  );
}

function DesktopApp(){
  const [screen,setScreen] = React.useState(()=> (location.hash||'').replace('#','') || 'ops');
  React.useEffect(()=>{
    window.__FADROUTER = (key)=>{ if(DROUTES[key]){ location.hash = key; } };
    const onHash = ()=>{ const k=(location.hash||'').replace('#','')||'ops'; setScreen(DROUTES[k]?k:'ops'); document.querySelector('.dmain')?.scrollTo(0,0); window.scrollTo(0,0); };
    window.addEventListener('hashchange',onHash);
    return ()=>{ window.removeEventListener('hashchange',onHash); window.__FADROUTER=null; };
  },[]);
  const Comp = (DROUTES[screen]||DROUTES.ops)();
  if(!Comp) return <div style={{color:'#889',padding:40,fontFamily:'monospace'}}>Loading {screen}…</div>;
  return <div className="fad-route" key={screen}><Comp/></div>;
}

/* ---------------- MOBILE routes ---------------- */
const M = ()=>window.FADMOBILE;
const MROUTES = {
  inbox:()=>M().MobileInbox, ops:()=>M().MobileOps, cal:()=>M().MobileCalendar, askm:()=>M().MobileAsk,
  schedule:()=>M().MobileSchedule, roster:()=>M().MobileRoster, res:()=>M().MobileReservations,
  approvals:()=>M().MobileApprovals, tasks:()=>M().MobileAllTasks, supplies:()=>M().MobileSupplies,
  prop:()=>M().MobileProperties, map:()=>M().MobileMap, fin:()=>M().MobileFinance, own:()=>M().MobileOwners,
  rev:()=>M().MobileReviews, an:()=>M().MobileAnalytics, hr:()=>M().MobileHR, ppl:()=>M().MobileGuests,
  notif:()=>M().MobileNotifs, thread:()=>M().MobileThread, mmore:()=>MobileMore,
};
const M_GROUPS = [
  ['Operations',[['schedule','cal','Schedule'],['tasks','ops','All tasks'],['approvals','check','Approvals'],['roster','users','Roster'],['supplies','box','Supplies'],['map','pin','Live map']]],
  ['Portfolio', [['prop','home','Properties'],['res','doc','Reservations'],['own','owner','Owners']]],
  ['Business',  [['fin','coin','Finance'],['an','chart','Analytics'],['ppl','users','Guests'],['hr','users','Team / HR'],['rev','star','Reviews']]],
  ['System',    [['notif','bell','Notifications'],['askm','spark','Ask Friday']]],
];
function MobileMore(){
  return (
    <div className="mphone">
      <div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>More</span></div>
      <div className="body">
        {M_GROUPS.map((g,gi)=>(
          <div key={gi} style={{marginBottom:14}}>
            <div className="dml" style={{margin:'4px 0 8px'}}>{g[0]}<span className="rule"/></div>
            <div className="mmore-grid">
              {g[1].map((m,i)=>(
                <div key={i} className="mmore-card" onClick={()=>window.FADGO(m[0])}>
                  <span className="mmore-ic"><DI n={m[1]} s={1.7}/></span>
                  <span>{m[2]}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{height:20}}/>
      </div>
      <window.FADMOBILE.MTabbar on="more"/>
    </div>
  );
}

function MobileApp(){
  const [screen,setScreen] = React.useState(()=> (location.hash||'').replace('#','') || 'inbox');
  React.useEffect(()=>{
    window.__FADROUTER = (key)=>{ if(MROUTES[key]) location.hash = key; else if(window.FAD_PAGEMAP_M&&window.FAD_PAGEMAP_M[key]) location.hash=key; };
    const onHash = ()=>{ const k=(location.hash||'').replace('#','')||'inbox'; setScreen(MROUTES[k]?k:'inbox'); };
    window.addEventListener('hashchange',onHash);
    return ()=>{ window.removeEventListener('hashchange',onHash); window.__FADROUTER=null; };
  },[]);
  const Comp = (MROUTES[screen]||MROUTES.inbox)();
  if(!Comp) return <div style={{color:'#889',padding:40,fontFamily:'monospace'}}>Loading {screen}…</div>;
  return <div className="fad-route-m" key={screen}><Comp/></div>;
}

window.FADROUTER = { DesktopApp, MobileApp, ModuleIndex, MobileMore };
