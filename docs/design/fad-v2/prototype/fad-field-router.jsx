/* FAD V2 — Field desktop router. Hash-synced; FIELDGO swaps screens. */
const FS = ()=>window.FADFIELDSCREENS, FS2 = ()=>window.FADFIELDSCREENS2;
const FROUTES = {
  tasks:    ()=>FS().FieldDay,
  task:     ()=>FS().FieldTaskDetail,
  schedule: ()=>FS().FieldSchedule,
  timeoff:  ()=>FS().FieldTimeOff,
  reports:  ()=>FS2().FieldReports,
  chat:     ()=>FS2().FieldChat,
  reviews:  ()=>FS2().FieldReviews,
  notif:    ()=>FS2().FieldNotifs,
  account:  ()=>FS2().FieldAccount,
};

function FieldDesktopApp(){
  const [screen,setScreen] = React.useState(()=> (location.hash||'').replace('#','') || 'tasks');
  React.useEffect(()=>{
    window.__FIELDROUTER = (key)=>{ if(FROUTES[key]){ location.hash = key; } };
    const onHash = ()=>{ const k=(location.hash||'').replace('#','')||'tasks'; setScreen(FROUTES[k]?k:'tasks'); document.querySelector('.dmain')?.scrollTo(0,0); window.scrollTo(0,0); };
    window.addEventListener('hashchange',onHash);
    return ()=>{ window.removeEventListener('hashchange',onHash); window.__FIELDROUTER=null; };
  },[]);
  const Comp = (FROUTES[screen]||FROUTES.tasks)();
  if(!Comp) return <div style={{color:'#889',padding:40,fontFamily:'monospace'}}>Loading {screen}…</div>;
  return <div className="fad-route" key={screen}><Comp/></div>;
}

window.FADFIELDROUTER = { FieldDesktopApp, FROUTES };
