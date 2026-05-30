/* FAD V2 — prototype screens A: My Tasks · Task detail (timer hub) · History */

function ScreenTasks(){
  const nav = useNav();
  const [seg,setSeg] = React.useState('today');
  const open = (item)=> nav.go('detail', {task: TASKS[item.id] || {
    id:item.code, code:item.code, addr:item.addr, area:(item.addr||'').toUpperCase(),
    title:item.title, dept:(item.meta&&item.meta[0])||'task', priority:item.priority,
    occ:item.occ, occState:item.occState, source:item.source, refId:'#112000000',
    due:'Today', desc:'Imported task — open to view details.', requirements:[], supplies:[],
  }});
  const card = (item,i)=> (
    <TaskCard key={item.code+i} onClick={()=>open(item)}
      pcode={item.code} addr={item.addr} title={item.title} priority={item.priority}
      accent={item.accent} meta={item.meta} occ={item.occ} occState={item.occState}
      due={item.due} source={item.source} selected={item.id==='turnover'&&seg==='today'}/>
  );
  const segs=[['today','Today'],['tomorrow','Tomorrow'],['week','Week'],['all','All']];
  return (
    <div className="fad">
      <StatusBar/>
      <AppHeader eyebrow="MY WORK" title="My Tasks"/>
      <div style={{padding:'0 16px'}}>
        <div className="tabbar-seg">
          {segs.map(([k,l])=><span key={k} className={"tabseg tap"+(seg===k?' on':'')} onClick={()=>setSeg(k)}>{l}</span>)}
        </div>
      </div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="between" style={{margin:'14px 0 4px'}}>
          <span className="chip on"><Icon n="sparkle" s={1.6}/> Sort: Friday suggested</span>
          <span className="row gap6 faint" style={{fontSize:12}}><Icon n="filter" s={2}/> Filter</span>
        </div>

        {seg==='today' && (<>
          <MLabel count="2">Overdue</MLabel>
          <div className="stack-sm">{TASK_LIST.overdue.map(card)}</div>
          <MLabel count="4">Today · Mon 1 Jun</MLabel>
          <div className="stack-sm">{TASK_LIST.today.map(card)}</div>
        </>)}

        {seg==='tomorrow' && (<>
          <MLabel count="3">Tomorrow · Tue 2 Jun</MLabel>
          <div className="stack-sm">{TASK_LIST.tomorrow.map(card)}</div>
          <div className="aigate mt16" style={{borderStyle:'solid'}}>
            <span className="ic" style={{fontSize:15}}><Icon n="sparkle" s={1.8}/></span>
            <span className="tx">Friday left Tuesday light so you have room for the SD-10 follow-up if it runs long.</span>
          </div>
        </>)}

        {seg==='week' && (<>
          <MLabel count="2 left today">This week</MLabel>
          {TASK_LIST.week.map((g,i)=>(
            <React.Fragment key={i}><div className="mlabel" style={{margin:'14px 2px 9px'}}><span>{g.day}</span><span className="rule"/></div>
            <div className="stack-sm">{g.items.map(card)}</div></React.Fragment>
          ))}
        </>)}

        {seg==='all' && (<>
          <MLabel count="2">Overdue</MLabel>
          <div className="stack-sm">{TASK_LIST.overdue.map(card)}</div>
          <MLabel count="4">Today</MLabel>
          <div className="stack-sm">{TASK_LIST.today.map(card)}</div>
          <MLabel count="3">Tomorrow</MLabel>
          <div className="stack-sm">{TASK_LIST.tomorrow.map(card)}</div>
          {TASK_LIST.week.map((g,i)=>(
            <React.Fragment key={i}><div className="mlabel" style={{margin:'14px 2px 9px'}}><span>{g.day}</span><span className="rule"/></div>
            <div className="stack-sm">{g.items.map(card)}</div></React.Fragment>
          ))}
        </>)}

        <div className="faint" style={{textAlign:'center',fontSize:11,marginTop:16,fontFamily:'var(--mono)'}}>Tap a task to open it</div>
      </div></div>
      <TabBar active="tasks"/>
    </div>
  );
}

function DetailHead({task}){
  return (
    <>
      <StatusBar/>
      <div className="detailtop">
        <div className="between">
          <BackBtn label="My Tasks"/>
          <div className="row gap6">
            <span className="srcchip bz"><Icon n="lock" s={2.2} style={{fontSize:9}}/> {task.refId}</span>
            <span className="badge gray">{task.code}</span>
          </div>
        </div>
      </div>
      <div className="apphead" style={{paddingTop:12}}>
        <div className="eyebrow">{task.dept.toUpperCase()} · {task.area}</div>
        <h1>{task.title}</h1>
        <div className="row gap6 mt8" style={{flexWrap:'wrap'}}>
          <Badge tone={task.priority==='urgent'?'red':task.priority==='high'?'amber':'gray'} dot>{task.priority}</Badge>
          <Badge tone="indigo">Open</Badge>
          <Occ state={task.occState}>{task.occ}</Occ>
        </div>
      </div>
    </>
  );
}

function SecLink({ic, ai, title, sum, count, accent, onClick, done}){
  return (
    <div className={"seclink tap"+(accent?"":"")} onClick={onClick} style={accent?{borderColor:'var(--indigo-line)'}:null}>
      <span className={"sic"+(ai?" ai":"")} style={done?{background:'var(--green-ghost)',borderColor:'transparent',color:'var(--green)'}:null}><Icon n={ic} s={1.8}/></span>
      <div className="smain">
        <div className="stitle">{title}</div>
        <div className="ssum">{sum}</div>
      </div>
      {count!=null && <span className="scount">{count}</span>}
      <span className="schev"><Icon n="chevR" s={2}/></span>
    </div>
  );
}

function ScreenDetail({task}){
  const nav = useNav();
  task = task || TASKS.water;
  const tm = nav.timerFor(task.id);
  const rf = nav.reqFor(task.id);
  const checkItems = (task.requirements||[]).filter(s=>s.type==='check').flatMap(s=>s.items);
  const doneChecks = checkItems.filter(i=>rf.checks[i.key]).length;
  const hasReq = (task.requirements||[]).length>0;
  const completed = task.completed || tm.status==='done';

  return (
    <div className="fad">
      <DetailHead task={task}/>
      <div className="fad-body"><div className="fad-scroll">

        {/* TIMER */}
        {tm.status==='idle' && !completed && (<>
          <button className="btn primary full tap" style={{height:50,fontSize:15,borderRadius:14}}
            onClick={()=>nav.startTimer(task.id)}><Icon n="play" s={2}/> Start task</button>
          <div className="row gap6 mt8" style={{justifyContent:'center'}}>
            <span className="faint" style={{fontFamily:'var(--mono)',fontSize:10.5}}>est. {task.est||'1h'} · last took {task.last||'—'}</span>
          </div>
        </>)}

        {(tm.status==='running'||tm.status==='paused') && (
          <div className="tcard" style={{alignItems:'center',gap:6,paddingTop:10}}>
            <div className="bigtimer" style={{padding:'6px 0 2px'}}>
              <div className="bt">{fmtTimer(tm.elapsed)}</div>
              <div className="bl">
                <span className="runbar" style={{background:'transparent',border:'none',padding:0}}>
                  <span className={"rdot "+(tm.status==='running'?'live':'')} style={{background:tm.status==='running'?'var(--green)':'var(--amber)',animation:tm.status==='running'?'pulse 1.6s infinite':'none'}}/>
                </span>
                {tm.status==='running'?'On task':'Paused'}
              </div>
            </div>
            <div className="timerbtns" style={{width:'100%'}}>
              {tm.status==='running'
                ? <button className="tbtn warn tap" onClick={()=>nav.pauseTimer(task.id)}><Icon n="pause" s={2}/> Pause</button>
                : <button className="tbtn go tap" onClick={()=>nav.resumeTimer(task.id)}><Icon n="play" s={2}/> Resume</button>}
              <button className="tbtn stop wide tap" onClick={()=>nav.go('complete',{task})}><Icon n="check" s={2.2}/> Complete</button>
            </div>
          </div>
        )}

        {completed && (
          <div className="tcard accent green" style={{gap:8}}>
            <div className="row gap10">
              <span className="hcheck" style={{width:34,height:34,flex:'0 0 34px',fontSize:17}}><Icon n="check" s={2.6}/></span>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:14}}>Completed</div>
                <div className="faint" style={{fontFamily:'var(--mono)',fontSize:10.5,marginTop:2}}>logged {task.loggedTime||fmtDur(tm.elapsed)} · proof attached</div>
              </div>
              <Badge tone="green" dot>Done</Badge>
            </div>
          </div>
        )}

        {/* CONTEXT */}
        {task.learning && (
          <div className="aigate" style={{borderStyle:'solid',marginTop:14}}>
            <span className="ic" style={{fontSize:15}}><Icon n="sparkle" s={1.8}/></span>
            <span className="tx">{task.learning}</span>
          </div>
        )}
        <MLabel rule={false}>Context</MLabel>
        <div className="tcard" style={{gap:11}}>
          <p style={{margin:0,fontSize:13.5,lineHeight:1.5,color:'var(--tx)'}}>{task.desc}</p>
          <div className="row" style={{flexWrap:'wrap',gap:7}}>
            <SrcChip src={task.source.src}>imported · {task.importedFrom||task.source.label}</SrcChip>
          </div>
        </div>

        <div style={{marginTop:4}}>
          <div className="frow"><div className="fl">Due</div><div className="fv">{task.due} {task.window&&<span className="muted">— {task.window}</span>}</div></div>
          <div className="frow"><div className="fl">Assignee</div><div className="fv"><span className="row gap6"><span className="avatar">{task.assignee||'IA'}</span> Ishant Ayadassen</span></div></div>
        </div>

        {/* HUB LINKS */}
        <MLabel rule={false}>On this task</MLabel>
        <div className="stack-sm">
          <SecLink ic="pin" title={"Property · "+task.code} sum="Map, check-in instructions & active issues"
            onClick={()=>nav.go('property',{task,completed})}/>
          {hasReq && <SecLink ic="check" accent title="Requirements" done={checkItems.length>0&&doneChecks===checkItems.length}
            sum={checkItems.length? (doneChecks===checkItems.length?'All checks complete ✓':'Checklists, inventory & inspection') : 'Checklists & inspection'}
            count={checkItems.length?doneChecks+'/'+checkItems.length:null}
            onClick={()=>nav.go('requirements',{task})}/>}
          <SecLink ic="box" title="Supplies used" sum="Friday suggested — confirm or edit qty"
            count={(task.supplies||[]).length} onClick={()=>nav.go('supplies',{task})}/>
          <SecLink ic="dollar" title="Expense report" sum="Scan a receipt — Friday fills it in"
            onClick={()=>nav.go('expense',{task})}/>
          <SecLink ic="sparkle" ai title="Ask Friday about this task" sum="Stuck? Add photos & describe the issue"
            onClick={()=>nav.go('aihelp',{task})}/>
          <SecLink ic="msg" title="Comments & activity" sum={completed?'Closing summary, comments & log':'Franny: “knock first, guest is sensitive”'}
            count="8" onClick={()=>nav.go('comments',{task})}/>
        </div>

        <button className="btn ghost full mt16 tap" style={{height:42,color:'var(--amber)'}} onClick={()=>nav.go('report',null,'up')}>
          <Icon n="flag" s={1.9}/> Report a related issue
        </button>
      </div></div>
      <TabBar active="tasks"/>
    </div>
  );
}

/* ---------- History ---------- */
function HistRow({title, pcode, dept, at, time, evi, onClick}){
  return (
    <div className={"hrow"+(onClick?" tap":"")} onClick={onClick}>
      <span className="hcheck"><Icon n="check" s={2.6}/></span>
      <div className="h-main">
        <div className="h-title">{title}</div>
        <div className="h-meta">
          <span className="pcode" style={{padding:'1px 6px',fontSize:10}}>{pcode}</span>
          <span>{dept}</span><span className="d">·</span><span>{at}</span>
          {evi && <span className="h-evi"><Icon n="cam" s={2}/></span>}
        </div>
      </div>
      <div className="h-time">{time}</div>
      <span className="schev faint" style={{marginLeft:8,display:'flex'}}><Icon n="chevR" s={2}/></span>
    </div>
  );
}
function ScreenHistory(){
  const nav = useNav();
  const open = (title,pcode,dept,time)=>{
    const prop = (window.PROPERTIES||[]).find(p=>p.code===pcode);
    const base = title.indexOf('Water Issue')>=0 ? TASKS.water : title.indexOf('Deep clean')>=0 ? TASKS.turnover : null;
    const addr = prop ? prop.name : (base?base.addr:pcode);
    const task = base
      ? {...base, code:pcode, addr, area:addr.toUpperCase(), completed:true, loggedTime:time}
      : {id:pcode, code:pcode, title, dept, addr, area:addr.toUpperCase(), occ:'Vacant', occState:'vacant',
         source:{src:'bz',label:'breezeway'}, refId:'#112516000', desc:'Completed task — imported from Breezeway.',
         requirements:[], supplies:[], completed:true, loggedTime:time};
    nav.go('detail',{task});
  };
  const R = (p)=> <HistRow {...p} onClick={()=>open(p.title,p.pcode,p.dept,p.time)}/>;
  return (
    <div className="fad">
      <StatusBar/>
      <AppHeader eyebrow="MY WORK" title="History" sub="Completed work · tap to reopen"/>
      <div className="fad-body"><div className="fad-scroll">
        <div className="statrow" style={{marginTop:4}}>
          <div className="stat green"><div className="n">18</div><div className="l">Done this wk</div></div>
          <div className="stat indigo"><div className="n">22h</div><div className="l">Logged</div></div>
          <div className="stat amber"><div className="n">92%</div><div className="l">On time</div></div>
        </div>
        <MLabel count="3">Today · Mon 1 Jun</MLabel>
        <div className="stack-sm">
          {R({title:'Replace shower head', pcode:'GBH-C5', dept:'maintenance', at:'14:20', time:'38m', evi:true})}
          {R({title:'Deep clean — turnover', pcode:'BS-1', dept:'housekeeping', at:'11:05', time:'1h 50m', evi:true})}
          {R({title:'Internet Top Up', pcode:'VA-4', dept:'admin', at:'09:40', time:'12m'})}
        </div>
        <MLabel count="4">Sun 31 May</MLabel>
        <div className="stack-sm">
          {R({title:'Water Issue', pcode:'SD-10', dept:'maintenance', at:'16:30', time:'1h 25m', evi:true})}
          {R({title:'Place anti-odor valve', pcode:'RCN-4', dept:'maintenance', at:'13:15', time:'25m'})}
          {R({title:'Lower the dining table', pcode:'RC-7', dept:'maintenance', at:'10:50', time:'40m', evi:true})}
          {R({title:'Restock welcome loadout', pcode:'GBH-B4', dept:'housekeeping', at:'09:10', time:'33m'})}
        </div>
      </div></div>
      <TabBar active="history"/>
    </div>
  );
}

Object.assign(window, { ScreenTasks, DetailHead, SecLink, ScreenDetail, HistRow, ScreenHistory });
