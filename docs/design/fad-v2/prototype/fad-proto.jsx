/* FAD V2 — prototype core: phone frame, router, timer + requirements engine */

function FadApp(){
  const [tab, setTab] = React.useState('tasks');
  const [stack, setStack] = React.useState([{screen:'tasks', params:null, dir:'fwd'}]);
  const [timers, setTimers] = React.useState({});   // {id:{status,elapsed}}
  const [reqs, setReqs] = React.useState({});        // {id:{checks,counts,photos}}
  const [sheet, setSheet] = React.useState(false);   // ＋ action sheet
  const [scale, setScale] = React.useState(1);
  const [call, setCall] = React.useState(null);      // {with, type, elapsed, minimized}
  const scrollRef = React.useRef(null);

  // scale the fixed-size phone to always fit the viewport (so the bottom nav is never clipped)
  React.useEffect(()=>{
    const fit=()=> setScale(Math.min(1, (window.innerHeight-24)/858, (window.innerWidth-24)/402));
    fit(); window.addEventListener('resize', fit); return ()=>window.removeEventListener('resize', fit);
  },[]);

  const TAB_SCREEN = {tasks:'tasks', chat:'chatlist', history:'history', account:'account'};

  // tick running timers
  React.useEffect(()=>{
    const iv = setInterval(()=>{
      setTimers(prev=>{
        let changed=false; const next={...prev};
        for(const id in prev){ if(prev[id].status==='running'){ next[id]={...prev[id], elapsed:prev[id].elapsed+1}; changed=true; } }
        return changed?next:prev;
      });
      setCall(c=> c ? {...c, elapsed:c.elapsed+1} : c);
    },1000);
    return ()=>clearInterval(iv);
  },[]);

  // scroll to top on navigation
  React.useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop=0; },[stack.length, tab]);

  const nav = {
    go(screen, params=null, dir='fwd'){ setStack(s=>[...s,{screen,params,dir}]); },
    back(){ setStack(s=> s.length>1 ? s.slice(0,-1).map((x,i,a)=> i===a.length-1?{...x,dir:'back'}:x) : s); },
    tab(k){ setTab(k); setStack([{screen:TAB_SCREEN[k]||'tasks', params:null, dir:'fwd'}]); },
    current: tab,
    // timer
    timerFor(id){ return timers[id] || {status:'idle', elapsed:0}; },
    startTimer(id){ setTimers(t=>({...t,[id]:{status:'running', elapsed:(t[id]&&t[id].elapsed)||0}})); },
    pauseTimer(id){ setTimers(t=>({...t,[id]:{...t[id], status:'paused'}})); },
    resumeTimer(id){ setTimers(t=>({...t,[id]:{...t[id], status:'running'}})); },
    completeTimer(id){ setTimers(t=>({...t,[id]:{...t[id], status:'done'}})); },
    // requirements
    reqFor(id){ return reqs[id] || {checks:{}, counts:{}, photos:0, itemPhotos:{}}; },
    toggleCheck(id,key){ setReqs(r=>{ const cur=r[id]||{checks:{},counts:{},photos:0,itemPhotos:{}}; return {...r,[id]:{...cur, checks:{...cur.checks,[key]:!cur.checks[key]}}}; }); },
    setCount(id,key,val){ setReqs(r=>{ const cur=r[id]||{checks:{},counts:{},photos:0,itemPhotos:{}}; return {...r,[id]:{...cur, counts:{...cur.counts,[key]:Math.max(0,val)}}}; }); },
    addPhoto(id){ setReqs(r=>{ const cur=r[id]||{checks:{},counts:{},photos:0,itemPhotos:{}}; return {...r,[id]:{...cur, photos:cur.photos+1}}; }); },
    addItemPhoto(id,key){ setReqs(r=>{ const cur=r[id]||{checks:{},counts:{},photos:0,itemPhotos:{}}; const ip=cur.itemPhotos||{}; return {...r,[id]:{...cur, itemPhotos:{...ip,[key]:(ip[key]||0)+1}}}; }); },
    openSheet(){ setSheet(true); }, closeSheet(){ setSheet(false); },
    call,
    startCall(withName, type='audio'){ setCall({with:withName, type, elapsed:0, minimized:false}); },
    endCall(){ setCall(null); },
    minimizeCall(){ setCall(c=> c?{...c, minimized:true}:c); },
    expandCall(){ setCall(c=> c?{...c, minimized:false}:c); },
  };

  const cur = stack[stack.length-1];
  const SCREENS = {
    tasks:window.ScreenTasks, detail:window.ScreenDetail, requirements:window.ScreenRequirements, complete:window.ScreenComplete,
    supplies:window.ScreenSupplies, expense:window.ScreenExpense, aihelp:window.ScreenAIHelp, comments:window.ScreenComments,
    report:window.ScreenReport, reports:window.ScreenReports,
    chatlist:window.ScreenChat, chatthread:window.ScreenChatThread, notifs:window.ScreenNotifs,
    account:window.ScreenAccount, history:window.ScreenHistory,
    notifprefs:window.ScreenNotifPrefs, tutorial:window.ScreenTutorial, create:window.ScreenCreate, property:window.ScreenProperty,
    myroster:window.ScreenMyRoster, timeoff:window.ScreenTimeOff, reviews:window.ScreenReviews,
  };
  const Comp = SCREENS[cur.screen] || (()=> <div style={{padding:40,color:'#fff'}}>missing {cur.screen}</div>);

  // sticky running-timer pill
  const runId = Object.keys(timers).find(id=> timers[id].status==='running' || timers[id].status==='paused');
  const runTask = runId && TASKS[runId];
  const onOwnTask = (cur.screen==='detail'||cur.screen==='complete') && cur.params && cur.params.task && cur.params.task.id===runId;
  const showPill = runTask && !onOwnTask;

  const sheetOpts = [
    {ic:'flag', cls:'task', t:'Report an issue', d:'Snap it — Friday drafts the task', go:()=>{nav.closeSheet(); nav.go('report',null,'up');}},
    {ic:'plus', cls:'ment', t:'Create a task', d:'Fill in a new job yourself', go:()=>{nav.closeSheet(); nav.go('create',null,'up');}},
    {ic:'msg', cls:'ok', t:'Message the team', d:'Open team chat', go:()=>{nav.closeSheet(); nav.tab('chat');}},
  ];

  return (
    <NavCtx.Provider value={nav}>
      <div className="proto-stage">
        <div className="phone" style={{transform:`scale(${scale})`, transformOrigin:'center center', flex:'0 0 auto'}}>
          <div className="island"/>
          <div className="phone-screen">
            <div className={"scr "+(cur.dir||'fwd')} key={stack.length+'-'+cur.screen} ref={scrollRef}
                 style={{display:'flex',flexDirection:'column',width:'100%',height:'100%',overflow:'hidden'}}>
              <Comp {...(cur.params||{})} curTab={tab}/>
            </div>
            {showPill && (
              <div className={"timerpill"+(timers[runId].status==='paused'?' paused':'')} style={call&&call.minimized?{top:92}:null} onClick={()=>nav.go('detail',{task:runTask})}>
                <span className="pdot"/>
                <span className="ptime">{fmtTimer(timers[runId].elapsed)}</span>
                <span className="pname">· {runTask.title}</span>
                <span className="pgo"><Icon n="chevR" s={2.4}/></span>
              </div>
            )}
            {sheet && (
              <div className="sheet-ov" onClick={nav.closeSheet}>
                <div className="sheet" onClick={e=>e.stopPropagation()}>
                  <div className="sheet-handle"/>
                  <div style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:22,padding:'6px 6px 4px'}}>New</div>
                  {sheetOpts.map((o,i)=>(
                    <div key={i} className="sheet-opt tap" onClick={o.go}>
                      <span className={"oi n-ic "+o.cls}><Icon n={o.ic} s={1.9}/></span>
                      <div style={{flex:1}}><div className="ot">{o.t}</div><div className="od">{o.d}</div></div>
                      <span className="schev faint"><Icon n="chevR" s={2}/></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {call && !call.minimized && <CallScreen/>}
            {call && call.minimized && <CallPill/>}
          </div>
          <div className="homebar"/>
        </div>
      </div>
    </NavCtx.Provider>
  );
}

// helper: format seconds → 0h 00m 00s / 00:00
function fmtTimer(sec){
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  const p=(n)=>String(n).padStart(2,'0');
  return h>0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
function fmtDur(sec){
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60);
  return h>0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m`;
}

Object.assign(window, { FadApp, fmtTimer, fmtDur });
