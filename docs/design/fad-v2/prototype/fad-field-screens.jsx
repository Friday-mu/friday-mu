/* FAD V2 — Field desktop screens · part 1: My Day, Task detail, Schedule, Time off */
const { DI, PriD } = window.FADD;
const { FieldShell, FieldAskPanel, FIELD_ME, fieldToast } = window.FADFIELD;

/* small helpers */
function SrcChip({source}){
  if(!source) return null;
  return <span className={source.src==='gy'?'srcbz srcgy':'srcbz'}><DI n="box" s={2} style={{width:9,height:9}}/> {source.label}</span>;
}
function OccBadge({occ, occState}){
  const tone = occState==='in' ? 'red' : occState==='soon' ? 'amber' : 'green';
  return <span className={"bdg "+tone+" dot"}>{occ}</span>;
}
function fmtClock(sec){
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60, p=n=>String(n).padStart(2,'0');
  return h>0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/* ============================ MY DAY ============================ */
function FTaskRow({t}){
  const open=()=>window.FIELDGO('task', t);
  return (
    <div className="qrow" onClick={open} style={{cursor:'pointer',gridTemplateColumns:'auto 1fr auto'}}>
      <span className="pri-wrap" style={{display:'flex',alignItems:'center'}}><PriD level={t.priority}/></span>
      <div style={{minWidth:0,display:'flex',flexDirection:'column',gap:7}}>
        <div style={{display:'flex',alignItems:'center',gap:9,flexWrap:'wrap'}}>
          <span className="tt" style={{fontSize:14.5,lineHeight:1.3}}>{t.title}</span>
          {t.priority==='urgent' && <span className="bdg red dot">urgent</span>}
        </div>
        <div className="qmeta">
          <span className="pcodeD">{t.code}</span>
          <span>{(t.meta&&t.meta[0])||t.dept}</span><span className="d">·</span>
          <span>{t.addr}</span>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8,whiteSpace:'nowrap'}}>
        <OccBadge occ={t.occ} occState={t.occState}/>
        <span className="row" style={{gap:8}}>
          <span className="mono faint" style={{fontSize:11}}>{(t.meta&&t.meta[1])||t.due}</span>
          <SrcChip source={t.source}/>
          <span className="faint"><DI n="chevR" s={2}/></span>
        </span>
      </div>
    </div>
  );
}
function FieldDay(){
  const L = window.TASK_LIST;
  const panel = <FieldAskPanel scope="My day"
    aware="Aware of: your 4 jobs today, the SD-10 water fault history, drive order across Tamarin & Grand Baie, and your protected 12:30 lunch."
    msgs={[
      {t:"Morning Ishant 👋 You've got <b>4 jobs</b> today plus <b>1 overdue</b>. The <b>SD-10 water fault</b> is urgent — and this property has tripped its pump 3× in 60 days, so check the breaker before resetting."},
      {me:"true", t:"What's the best order?"},
      {t:"Do <b>GBH-B4 turnover</b> first (check-in at 15:00), then <b>SD-10</b> after — they're both West, so you save a Tamarin round-trip. I kept 12:30–13:30 free.", done:"Suggested route · 18 min saved"},
    ]}/>;
  return (
    <FieldShell active="tasks" panel={panel}
      eyebrow={<><DI n="spark" s={1.6} style={{color:'var(--indigo-bright)'}}/> FRIDAY · YOUR DAY</>}
      title="Good morning, Ishant" sub="Friday, 30 May · West zone · 4 jobs today"
      actions={<><button className="dbtn ghost" onClick={()=>window.FIELDGO('schedule')}><DI n="cal" s={2}/> My week</button><button className="dbtn primary" onClick={()=>window.FIELDGO('reports')}><DI n="flag" s={2}/> Report an issue</button></>}>

      <div className="fai">
        <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday brief</span><span className="grow"/><span className="faint mono" style={{fontSize:10}}>updated 6m ago</span></div>
        <p><span className="hl">4 jobs today</span> + 1 overdue. The <span className="hl">SD-10 water fault</span> is urgent and recurring — check the breaker first. Best route: GBH-B4 turnover, then SD-10. Lunch protected 12:30–13:30.</p>
        <div className="acts"><button className="dbtn primary sm" onClick={()=>window.FIELDGO('task', L.today[1])}><DI n="play" s={2}/> Start SD-10</button><button className="dbtn ghost sm" onClick={()=>window.FIELDGO('schedule')}>See my route</button></div>
      </div>

      <div className="grid4" style={{marginTop:18}}>
        <div className="statc"><div className="n">4</div><div className="l">Jobs today</div><div className="d">2 housekeeping · 2 maint/admin</div></div>
        <div className="statc red"><div className="n">1</div><div className="l">Urgent</div><div className="d">SD-10 water</div></div>
        <div className="statc amber"><div className="n">1</div><div className="l">Overdue</div><div className="d">VA-3 internet · 5d</div></div>
        <div className="statc green"><div className="n">1h 25m</div><div className="l">Logged today</div><div className="d">2 jobs done</div></div>
      </div>

      <div className="dml">Overdue <span className="ct">{L.overdue.length}</span><span className="rule"/></div>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>{L.overdue.map((t,i)=><FTaskRow key={i} t={t}/>)}</div>

      <div className="dml">Today · Fri 30 May <span className="ct">{L.today.length}</span><span className="rule"/></div>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>{L.today.map((t,i)=><FTaskRow key={i} t={t}/>)}</div>

      <div className="dml">Tomorrow · Sat 31 May <span className="ct">{L.tomorrow.length}</span><span className="rule"/></div>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>{L.tomorrow.map((t,i)=><FTaskRow key={i} t={t}/>)}</div>
    </FieldShell>
  );
}

/* ============================ TASK DETAIL ============================ */
function CheckItem({item, checked, onToggle, photoCount, onPhoto}){
  return (
    <div className="setrow" style={{alignItems:'flex-start',gap:11,padding:'10px 0',cursor:'pointer'}} onClick={onToggle}>
      <span className={"fcheck"+(checked?' on':'')}>{checked && <DI n="check" s={2.6}/>}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,lineHeight:1.4,color: checked?'var(--tx-3)':'var(--tx)', textDecoration: checked?'line-through':'none'}}>
          {item.label} {item.req && <span className="bdg gray" style={{marginLeft:4}}>required</span>}
        </div>
        {item.photo && (
          <button className="aichip" style={{marginTop:7}} onClick={(e)=>{e.stopPropagation(); onPhoto();}}>
            <DI n="cam" s={1.9}/> {photoCount>0 ? `${photoCount} photo${photoCount>1?'s':''} added` : 'Add photo proof'}
          </button>
        )}
      </div>
    </div>
  );
}
function CountItem({item, count, onSet}){
  const low = count < item.par;
  return (
    <div className="setrow" style={{padding:'9px 0',alignItems:'center'}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13}}>{item.name||item.label}</div>
        <div className="faint mono" style={{fontSize:10,marginTop:2}}>par {item.par} {low && <span style={{color:'var(--amber)'}}>· {item.par-count} below par</span>}</div>
      </div>
      <div className="row" style={{gap:8}}>
        <button className="stepbtn" onClick={()=>onSet(count-1)}>−</button>
        <span className="mono" style={{minWidth:22,textAlign:'center',fontWeight:700,fontSize:14, color: low?'var(--amber)':'var(--tx)'}}>{count}</span>
        <button className="stepbtn" onClick={()=>onSet(count+1)}>+</button>
      </div>
    </div>
  );
}
function FieldTaskDetail(){
  const listItem = window.__FIELD_PARAM || window.TASK_LIST.today[1];
  const rich = (listItem.id && window.TASKS[listItem.id]) || null;
  const t = rich || {
    code:listItem.code, title:listItem.title, addr:listItem.addr,
    dept:(listItem.meta&&listItem.meta[0])||'general', priority:listItem.priority,
    occ:listItem.occ, occState:listItem.occState, source:listItem.source,
    due:(listItem.meta&&('Today · '+listItem.meta[1]))||listItem.due,
    desc:'Complete this job and log your time. Add photo proof where required, then mark it complete for your manager to review.',
    requirements:[], supplies:[],
  };
  const code = t.code;

  // interactive state
  const [timer,setTimer] = React.useState({status:'idle', elapsed: rich&&rich.id==='water'?5025:0});
  const [checks,setChecks] = React.useState({});
  const [counts,setCounts] = React.useState(()=>{ const c={}; (t.requirements||[]).forEach(r=>{ if(r.type==='inventory') r.items.forEach(it=> c[it.key]=it.count); }); return c; });
  const [photos,setPhotos] = React.useState({});

  React.useEffect(()=>{
    if(timer.status!=='running') return;
    const iv=setInterval(()=>setTimer(p=>({...p, elapsed:p.elapsed+1})),1000);
    return ()=>clearInterval(iv);
  },[timer.status]);

  const access = window.ACCESS[code] || {};
  const checkin = window.CHECKIN[code];
  const guide = window.GUIDE[code] || window.GUIDE_DEFAULT;
  const learning = t.learning;

  // proof gating
  const allChecks = []; (t.requirements||[]).forEach(r=>{ if(r.type==='check') r.items.forEach(it=>{ if(it.req) allChecks.push(it.key); }); });
  const photoReq = []; (t.requirements||[]).forEach(r=>{ if(r.type==='check') r.items.forEach(it=>{ if(it.photo) photoReq.push(it.key); }); });
  const reqDone = allChecks.every(k=>checks[k]) && photoReq.every(k=>(photos[k]||0)>0);
  const running = timer.status==='running' || timer.status==='paused';

  const back=()=>window.FIELDGO('tasks');

  const sidebar = (
    <div style={{display:'flex',flexDirection:'column',gap:12,position:'sticky',top:0}}>
      <div className="panel" style={{borderColor:'var(--indigo-line)'}}>
        <div className="dml" style={{margin:'0 0 10px'}}>Time on this job <span className="rule"/></div>
        <div style={{fontFamily:'var(--mono)',fontSize:34,fontWeight:600,letterSpacing:'-.02em',lineHeight:1,color: running?'var(--green)':'var(--tx-2)'}}>{fmtClock(timer.elapsed)}</div>
        <div className="faint" style={{fontSize:11,marginTop:6}}>Est. {t.est||'—'} · last here {t.last||'—'}</div>
        <div className="row" style={{gap:8,marginTop:12}}>
          {timer.status==='idle' && <button className="dbtn primary" style={{flex:1}} onClick={()=>setTimer(p=>({...p,status:'running'}))}><DI n="play" s={2}/> Start timer</button>}
          {timer.status==='running' && <button className="dbtn ghost" style={{flex:1}} onClick={()=>setTimer(p=>({...p,status:'paused'}))}><DI n="pause" s={2}/> Pause</button>}
          {timer.status==='paused' && <button className="dbtn primary" style={{flex:1}} onClick={()=>setTimer(p=>({...p,status:'running'}))}><DI n="play" s={2}/> Resume</button>}
        </div>
      </div>

      <div className="panel">
        <div className="dml" style={{margin:'0 0 8px'}}>Where & access <span className="rule"/></div>
        <div className="mapph"/>
        {checkin && <div style={{fontSize:12,lineHeight:1.5,color:'var(--tx-2)',marginTop:10}}>{checkin}</div>}
        <div className="kvlist" style={{marginTop:10}}>
          {access.lockbox && <div className="kv"><span className="k">Lockbox</span><span className="v mono">{access.lockbox}</span></div>}
          {access.alarm && <div className="kv"><span className="k">Alarm</span><span className="v mono">{access.alarm}</span></div>}
          {access.wifi && <div className="kv"><span className="k">Wi-Fi</span><span className="v mono">{access.wifi}</span></div>}
          {guide.parking && <div className="kv"><span className="k">Parking</span><span className="v">{guide.parking}</span></div>}
        </div>
      </div>

      <div className="panel">
        <div className="dml" style={{margin:'0 0 8px'}}>Job info <span className="rule"/></div>
        <div className="kvlist">
          <div className="kv"><span className="k">Assignee</span><span className="v"><span className="av1" style={{marginRight:6}}>{FIELD_ME.initials}</span>You</span></div>
          <div className="kv"><span className="k">Department</span><span className="v">{t.dept}</span></div>
          <div className="kv"><span className="k">Priority</span><span className="v" style={{textTransform:'capitalize'}}>{t.priority}</span></div>
          <div className="kv"><span className="k">Due</span><span className="v">{t.due}</span></div>
          {t.window && <div className="kv"><span className="k">Window</span><span className="v">{t.window}</span></div>}
          {t.refId && <div className="kv"><span className="k">Source</span><span className="v mono">{t.source&&t.source.label} {t.refId}</span></div>}
        </div>
        <button className="dbtn ghost" style={{width:'100%',marginTop:11}} onClick={()=>window.FIELDGO('chat')}><DI n="msg" s={2}/> Message my manager</button>
      </div>
    </div>
  );

  return (
    <FieldShell active="task"
      eyebrow={<><span className="pcodeD" style={{marginRight:8}}>{code}</span> {(t.source&&t.source.label)||'task'} {t.refId||''}</>}
      title={t.title} sub={<span className="row" style={{gap:8}}><span style={{textTransform:'capitalize'}}>{t.dept}</span><span className="d">·</span><span>{t.addr}</span></span>}
      actions={<>
        <button className="dbtn ghost" onClick={back}><DI n="chevL" s={2}/> My day</button>
        <button className="dbtn ghost" onClick={()=>window.FIELDGO('reports')}><DI n="flag" s={2}/> Report issue</button>
        <button className={"dbtn "+(reqDone&&running?'green':'')} disabled={!(reqDone&&running)} style={{opacity:(reqDone&&running)?1:.5}}
          onClick={()=>{ if(reqDone&&running){ setTimer(p=>({...p,status:'done'})); fieldToast('Job completed — sent to your manager for review','green'); window.FIELDGO('tasks'); } }}>
          <DI n="check" s={2}/> Complete job
        </button>
      </>}>

      <div className="ftask-lay">
        <div style={{minWidth:0}}>
          <div className="row" style={{gap:8,marginBottom:14,flexWrap:'wrap'}}>
            <OccBadge occ={t.occ} occState={t.occState}/>
            <span className="bdg gray dot" style={{textTransform:'capitalize'}}>{t.priority} priority</span>
            <SrcChip source={t.source}/>
          </div>

          <div className="panel" style={{marginBottom:14}}>
            <div style={{fontSize:13.5,lineHeight:1.6,color:'var(--tx)'}}>{t.desc}</div>
          </div>

          {learning && (
            <div className="gate" style={{borderStyle:'solid',marginBottom:14}}>
              <span style={{color:'var(--indigo-bright)',marginTop:1}}><DI n="spark" s={1.8}/></span>
              <span><b>Friday heads-up.</b> {learning}</span>
            </div>
          )}

          {(t.requirements||[]).length>0 ? (t.requirements||[]).map((r,ri)=>(
            <div key={ri} style={{marginBottom:14}}>
              <div className="dml">{r.title}{r.sub && <span className="ct" style={{textTransform:'none',letterSpacing:0,fontFamily:'var(--ui)'}}>{r.sub}</span>}<span className="rule"/></div>
              <div className="panel">
                {r.type==='check' && r.items.map((it,ii)=>(
                  <CheckItem key={ii} item={it} checked={!!checks[it.key]} onToggle={()=>setChecks(c=>({...c,[it.key]:!c[it.key]}))}
                    photoCount={photos[it.key]||0} onPhoto={()=>{ setPhotos(p=>({...p,[it.key]:(p[it.key]||0)+1})); fieldToast('Photo added'); }}/>
                ))}
                {r.type==='inventory' && r.items.map((it,ii)=>(
                  <CountItem key={ii} item={it} count={counts[it.key]} onSet={(v)=>setCounts(c=>({...c,[it.key]:Math.max(0,v)}))}/>
                ))}
              </div>
            </div>
          )) : (
            <div className="panel" style={{textAlign:'center',padding:'28px 0',color:'var(--tx-3)'}}>
              <div className="faint" style={{fontSize:12.5}}>No structured checklist on this job — start the timer, do the work and log a closing note.</div>
            </div>
          )}

          {(t.supplies||[]).length>0 && (
            <div style={{marginBottom:6}}>
              <div className="dml">Supplies used <span className="rule"/></div>
              <div className="panel">
                {t.supplies.map((s,si)=>(
                  <div key={si} className="setrow" style={{padding:'9px 0',alignItems:'center'}}>
                    <div style={{flex:1,minWidth:0}}><div style={{fontSize:13}}>{s.name}</div><div className="faint mono" style={{fontSize:10,marginTop:2}}>{s.meta}</div></div>
                    {s.sug && <span className="bdg indigo">suggested ×{s.qty}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="gate" style={{borderStyle:'dashed',marginTop:14,cursor:'pointer'}} onClick={()=>window.FIELDGO('chat')}>
            <span style={{color:'var(--indigo-bright)',marginTop:1}}><DI n="spark" s={1.8}/></span>
            <span><b>Stuck on something?</b> Ask Friday for the fix for this property, or message your manager.</span>
          </div>
        </div>
        {sidebar}
      </div>
    </FieldShell>
  );
}

/* ============================ SCHEDULE ============================ */
function FieldSchedule(){
  const R = window.MY_ROSTER;
  const today = window.TASK_LIST.today;
  const tomorrow = window.TASK_LIST.tomorrow;
  return (
    <FieldShell active="schedule"
      eyebrow="MY WORK" title="My schedule" sub={"Week of "+R.week+" · West zone"}
      actions={<><div className="weeksel"><span className="wbtn"><DI n="chevL" s={2}/></span><span className="wlabel">{R.week} <DI n="chevD" s={2.2} style={{width:12,height:12,opacity:.6}}/></span><span className="wbtn"><DI n="chevR" s={2}/></span></div><button className="dbtn ghost" onClick={()=>window.FIELDGO('timeoff')}><DI n="clock" s={2}/> Request time off</button></>}>

      <div className="dml">This week <span className="rule"/></div>
      <div className="fweek">
        {R.days.map((d,i)=>(
          <div key={i} className={"fday"+(d.state==='off'?' off':'')+(i===4?' on':'')}>
            <div className="fday-d">{d.d}</div>
            <div className="fday-n">{d.n}</div>
            <div className={"fday-shift "+(d.state==='off'?'off':'on')}>{d.shift}</div>
            {d.time && <div className="fday-time mono">{d.time}</div>}
          </div>
        ))}
      </div>

      <div className="grid3" style={{marginTop:6}}>
        <div className="statc"><div className="n">5</div><div className="l">Shifts this week</div><div className="d">West zone · 08:00–17:00</div></div>
        <div className="statc"><div className="n">9</div><div className="l">Jobs assigned</div><div className="d">4 today · 3 tomorrow</div></div>
        <div className="statc green"><div className="n">2 days</div><div className="l">Off</div><div className="d">Sat & Sun</div></div>
      </div>

      <div className="dml">Today · Fri 30 May <span className="ct">{today.length} jobs</span><span className="rule"/></div>
      <div className="panel" style={{padding:0,overflow:'hidden'}}>
        <table className="tbl">
          <thead><tr><th>Time</th><th>Job</th><th>Property</th><th>Occupancy</th><th>Priority</th><th></th></tr></thead>
          <tbody>
            {today.map((t,i)=>(
              <tr key={i} className="tdrow" style={{cursor:'pointer'}} onClick={()=>window.FIELDGO('task', t)}>
                <td className="mono faint">{(t.meta&&t.meta[1])||'—'}</td>
                <td><div className="tt">{t.title}</div><div className="sub">{(t.meta&&t.meta[0])||'general'}</div></td>
                <td><span className="pcodeD">{t.code}</span></td>
                <td><OccBadge occ={t.occ} occState={t.occState}/></td>
                <td><PriD level={t.priority}/></td>
                <td><span className="faint"><DI n="chevR" s={2}/></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="dml">Tomorrow · Sat 31 May <span className="ct">{tomorrow.length} jobs</span><span className="rule"/></div>
      <div className="panel" style={{padding:0,overflow:'hidden'}}>
        <table className="tbl">
          <tbody>
            {tomorrow.map((t,i)=>(
              <tr key={i} className="tdrow" style={{cursor:'pointer'}} onClick={()=>window.FIELDGO('task', t)}>
                <td className="mono faint" style={{width:80}}>{(t.meta&&t.meta[1])||'—'}</td>
                <td><div className="tt">{t.title}</div><div className="sub">{(t.meta&&t.meta[0])||'general'} · {t.addr}</div></td>
                <td style={{width:60}}><span className="pcodeD">{t.code}</span></td>
                <td style={{width:160,textAlign:'right'}}><span className="faint"><DI n="chevR" s={2}/></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FieldShell>
  );
}

/* ============================ TIME OFF ============================ */
function FieldTimeOff(){
  const TO = window.TIMEOFF;
  return (
    <FieldShell active="timeoff"
      eyebrow="MY WORK" title="Time off" sub="Annual leave balance & requests"
      actions={<button className="dbtn primary" onClick={()=>fieldToast('Time-off request form opened')}><DI n="plus" s={2}/> Request time off</button>}>

      <div className="grid3">
        <div className="statc green"><div className="n">{TO.balance} days</div><div className="l">Annual leave left</div><div className="d">resets 31 Dec</div></div>
        <div className="statc amber"><div className="n">{TO.pending}</div><div className="l">Pending requests</div><div className="d">awaiting manager</div></div>
        <div className="statc"><div className="n">4</div><div className="l">Taken this year</div><div className="d">3 annual · 1 sick</div></div>
      </div>

      <div className="dml">Requests <span className="ct">{TO.requests.length}</span><span className="rule"/></div>
      <div className="panel" style={{padding:0,overflow:'hidden'}}>
        <table className="tbl">
          <thead><tr><th>Dates</th><th>Days</th><th>Type</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {TO.requests.map((r,i)=>(
              <tr key={i}>
                <td><span className="tt">{r.dates}</span></td>
                <td className="mono faint">{r.days}d</td>
                <td>{r.type}</td>
                <td><span className={"bdg "+r.tone+" dot"}>{r.status}</span></td>
                <td style={{textAlign:'right'}}>{r.status==='Pending' ? <button className="dbtn ghost sm" onClick={()=>fieldToast('Request withdrawn')}>Withdraw</button> : <span className="faint mono" style={{fontSize:10}}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="gate" style={{borderStyle:'solid',marginTop:16}}>
        <span style={{color:'var(--indigo-bright)',marginTop:1}}><DI n="spark" s={1.8}/></span>
        <span><b>Friday tip.</b> Your team is lightest in the <b>2nd week of June</b> — requesting leave then is most likely to be approved without affecting coverage.</span>
      </div>
    </FieldShell>
  );
}

window.FADFIELDSCREENS = { FieldDay, FieldTaskDetail, FieldSchedule, FieldTimeOff };
