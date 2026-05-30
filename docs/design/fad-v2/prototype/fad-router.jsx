/* FAD V2 — single-file prototype router (desktop + mobile).
   Registers window.__FADROUTER so the global FADGO(key) primitive
   (defined in fad-desktop.jsx) swaps the in-app screen instead of
   doing a full page load. Hash-synced for back/forward + refresh. */
const { DI } = window.FADD;

/* ---------------- DESKTOP routes ---------------- */
const S  = ()=>window.FADSCREENS, P = ()=>window.FADPROP, R = ()=>window.FADRES, T = ()=>window.FADTRAIN;
const DROUTES = {
  inbox:      ()=>S().ScreenInbox,
  team:       ()=>window.FADTEAM.ScreenTeamChat,
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
  rev:        ()=>window.FADREVIEWS.ScreenReviews,
  notif:      ()=>S().ScreenNotifsMgr,
  settings:   ()=>S().ScreenSettings,
  training:   ()=>T().ScreenTraining,
  syndic:     ()=>window.FADSYNDIC.ScreenSyndicBuildings,
  'synb-overview': ()=>window.FADSYNDIC.ScreenSyndicOverview,
  'synb-owners':   ()=>window.FADSYNDIC.ScreenSyndicOwners,
  'synb-charges':  ()=>window.FADSYNDIC.ScreenSyndicCharges||window.FADSYNDIC.ScreenSyndicOverview,
  'synb-payments': ()=>window.FADSYNDIC.ScreenSyndicPayments||window.FADSYNDIC.ScreenSyndicOverview,
  'synb-arrears':  ()=>window.FADSYNDIC.ScreenSyndicArrears||window.FADSYNDIC.ScreenSyndicOverview,
  'synb-agm':      ()=>window.FADSYNDIC.ScreenSyndicAGM||window.FADSYNDIC.ScreenSyndicOverview,
  'synb-docs':     ()=>window.FADSYNDIC.ScreenSyndicDocs||window.FADSYNDIC.ScreenSyndicOverview,
  'synb-compliance':()=>window.FADSYNDIC.ScreenSyndicCompliance||window.FADSYNDIC.ScreenSyndicOverview,
  'synb-onboard':  ()=>window.FADSYNDIC.ScreenSyndicOnboard||window.FADSYNDIC.ScreenSyndicBuildings,
  synportal:  ()=>window.FADSYNDIC.SyndicPortal,
  agency:     ()=>window.FADAGENCY.ScreenAgency,
  design:     ()=>window.FADDESIGN.ScreenDesign,
  leads:      ()=>window.FADLEADS.ScreenLeads,
  marketing:  ()=>window.FADMKTG.ScreenMarketing,
  legal:      ()=>window.FADLEGAL.ScreenLegal,
  tenant:     ()=>window.FADTENANT.ScreenTenant,
  billing:    ()=>window.FADBILL.ScreenBilling,
  admin:      ()=>window.FADADMIN.ScreenAdmin,
  'dz-portal':()=>window.FADDESIGN.DesignPortal,
  help:       ()=>S().ScreenHelp,
  askfull:    ()=>S().ScreenAskFull,
  more:       ()=>ModuleIndex,
};
const MODULE_GROUPS = [
  ['Today',     [['inbox','inbox','Inbox','Guest & team threads with AI drafts'],['ops','ops','Operations','Daily brief, schedule, live ops'],['cal','cal','Calendar','Portfolio occupancy timeline'],['notif','bell','Notifications','What Friday surfaced for you']]],
  ['Operations',[['schedule','cal','Schedule',"Friday's draft day plan"],['tasks','ops','All tasks','Every task across properties'],['approvals','check','Approvals','Vet field reports into tasks'],['roster','users','Roster','Staff coverage & time off'],['supplies','box','Supplies','Inventory across stores & vans'],['map','pin','Live map','Field staff on active jobs']]],
  ['Portfolio', [['prop','home','Properties','Units, condition & owners'],['res','doc','Reservations','Bookings across channels'],['own','owner','Owners','Statements & payouts']]],
  ['Business',  [['fin','coin','Finance','Period close, expenses, compliance'],['an','chart','Analytics','Revenue, occupancy, channels'],['ppl','users','Guests','Profiles & history'],['hr','users','Team / HR','Staff records & permissions'],['rev','star','Reviews','Ratings & AI replies']]],
  ['Growth & admin', [['leads','users','Leads / CRM','Capture & qualify inbound'],['marketing','star','Marketing','Campaigns, content calendar, social'],['legal','shield','Legal & Admin','Contracts, e-sign, compliance']]],
  ['System',    [['training','spark','Training','Govern how Friday learns & acts'],['settings','gear','Settings','Roles, integrations, branding'],['askfull','spark','Ask Friday','The assistant, full screen'],['help','doc','Help','Guides & support']]],
  ['Platform admin', [['tenant','gear','Tenant settings','Org config, modules, branding'],['billing','coin','Billing','Your FridayOS subscription'],['admin','chart','Admin analytics','Platform health & adoption']]],
];
function ModuleIndex(){
  const { Shell } = window.FADD;
  const [q,setQ]=React.useState('');
  const T=t=>window.fadToast&&window.fadToast(t);
  const BADGE={approvals:['5','amber'],rev:['100','red'],notif:['6','indigo'],inbox:['3','indigo'],fin:['tax due','red'],supplies:['low','amber'],own:['38','indigo']};
  const ql=q.trim().toLowerCase();
  const match=m=> !ql || m[2].toLowerCase().includes(ql) || (m[3]&&m[3].toLowerCase().includes(ql));
  const groups=MODULE_GROUPS.map(g=>[g[0],g[1].filter(match)]).filter(g=>g[1].length);
  const jump=[['approvals','check','3 reports to approve','amber'],['rev','star','100 reviews unreplied','red'],['fin','coin','Tourist tax window opens','red']];
  return (
    <Shell active="more" eyebrow="ALL MODULES" title="Everything in FAD" sub="Jump to any module — the rail covers the daily ones, this is the full map">
      <div className="fai">
        <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday · jump to what needs you</span></div>
        <div className="row" style={{gap:8,flexWrap:'wrap',marginTop:4}}>
          {jump.map((j,i)=>(<span key={i} className="aichip" style={{cursor:'pointer',borderColor:'var(--line-3)'}} onClick={()=>window.FADGO(j[0])}><span className="mdot" style={{background:'var(--'+j[3]+')',width:7,height:7,borderRadius:2,marginRight:6}}/>{j[2]} <DI n="chevR" s={1.6} style={{width:12,height:12,opacity:.6}}/></span>))}
        </div>
      </div>
      <div className="dsearch" style={{maxWidth:'none',margin:'14px 0 4px',background:'var(--card)'}}>
        <DI n="search" s={2}/>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search modules…" style={{flex:1,border:'none',background:'transparent',outline:'none',color:'var(--tx)',font:'inherit',fontSize:13}}/>
        {q && <span style={{cursor:'pointer'}} onClick={()=>setQ('')}><DI n="x" s={1.8}/></span>}
      </div>
      {groups.length===0 && <div className="muted-card" style={{marginTop:16}}><DI n="search" s={1.8}/> No modules match “{q}”.</div>}
      {groups.map((g,gi)=>(
        <div key={gi} style={{marginBottom:18}}>
          <div className="dml">{g[0]}<span className="rule"/></div>
          <div className="grid3">
            {g[1].map((m,i)=>{const b=BADGE[m[0]];return (
              <div key={i} className="panel tap modcard" onClick={()=>window.FADGO(m[0])}>
                <span className="modic"><DI n={m[1]} s={1.7}/></span>
                <div style={{minWidth:0,display:'flex',flexDirection:'column',gap:3}}>
                  <div className="row" style={{gap:7,alignItems:'center'}}><span style={{fontWeight:600,fontSize:13.5,whiteSpace:'nowrap'}}>{m[2]}</span>{b && <span className={"bdg "+b[1]}>{b[0]}</span>}</div>
                  <div className="faint" style={{fontSize:11.5,lineHeight:1.4}}>{m[3]}</div>
                </div>
                <span className="modgo"><DI n="chevR" s={2}/></span>
              </div>
            );})}
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
  training:()=>M().MobileTraining, settings:()=>M().MobileSettings, syndic:()=>M().MobileSyndic, design:()=>M().MobileDesign,
  leads:()=>M().MobileLeads, marketing:()=>M().MobileMarketing, legal:()=>M().MobileLegal, agency:()=>M().MobileAgency,
};
const M_GROUPS = [
  ['Operations',[['schedule','cal','Schedule'],['tasks','ops','All tasks'],['approvals','check','Approvals'],['roster','users','Roster'],['supplies','box','Supplies'],['map','pin','Live map']]],
  ['Portfolio', [['prop','home','Properties'],['res','doc','Reservations'],['own','owner','Owners']]],
  ['Business',  [['fin','coin','Finance'],['an','chart','Analytics'],['ppl','users','Guests'],['hr','users','Team / HR'],['rev','star','Reviews']]],
  ['Business units',[['syndic','building','Syndic'],['design','home','Design'],['agency','users','Agency']]],
  ['Growth & admin',[['leads','users','Leads / CRM'],['marketing','star','Marketing'],['legal','shield','Legal & Admin']]],
  ['System',    [['notif','bell','Notifications'],['training','spark','Training'],['settings','gear','Settings'],['askm','spark','Ask Friday']]],
];
function MobileMore(){
  return (
    <div className="mphone">
      <window.FADMOBILE.MStatusBar/>
      <div className="top"><span className="wm">FridayOS</span><span className="ttl" style={{flex:1}}>More</span></div>
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
  const [screen,setScreen] = React.useState(()=> (location.hash||'').replace('#','') || 'askm');
  const [loading,setLoading] = React.useState(false);
  React.useEffect(()=>{
    window.__FADROUTER = (key)=>{ if(MROUTES[key]) location.hash = key; else if(window.FAD_PAGEMAP_M&&window.FAD_PAGEMAP_M[key]) location.hash=key; };
    const onHash = ()=>{ const k=(location.hash||'').replace('#','')||'askm'; setScreen(MROUTES[k]?k:'askm'); setLoading(true); setTimeout(()=>setLoading(false),360); };
    window.addEventListener('hashchange',onHash);
    return ()=>{ window.removeEventListener('hashchange',onHash); window.__FADROUTER=null; };
  },[]);
  const Comp = (MROUTES[screen]||MROUTES.askm)();
  if(!Comp) return <div style={{color:'#889',padding:40,fontFamily:'monospace'}}>Loading {screen}…</div>;
  return <div className="fad-route-m" key={screen} style={{position:'relative',height:'100%'}}>
    <Comp/>
    {loading && <div className="mload"><div className="mload-draw" style={{width:56,height:56,display:'flex',alignItems:'center',justifyContent:'center',filter:'drop-shadow(0 8px 26px rgba(62,116,217,.42))'}} ref={el=>el&&window.fosDrawF&&window.fosDrawF(el,{size:56,color:'#3E74D9',width:2.8,dur:1.0})}/></div>}
  </div>;
}

window.FADROUTER = { DesktopApp, MobileApp, ModuleIndex, MobileMore };
