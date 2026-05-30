/* FAD V2 — Manager/GM desktop screens (static) */
const { DI, PriD, Shell, AskPanel } = window.FADD;
/* health hook shim — works whether or not fad-states.jsx is loaded on the page */
const useHealth = (window.FADSTATE && window.FADSTATE.useHealth) || (()=>{ React.useState(0); return 'healthy'; });

const opsTabs = (on)=>[
  {l:'Overview',on:on==='ov',k:'ops'},{l:'Schedule',on:on==='sc',k:'schedule'},{l:'All tasks',on:on==='ta',k:'tasks'},
  {l:'Approvals',ct:3,on:on==='ap',k:'approvals'},{l:'Roster',on:on==='ro',k:'roster'},{l:'Supplies',on:on==='su',k:'supplies'},{l:'Map',on:on==='mp',k:'map'},
];

/* ---------- 1 · Report approvals (closes the field-staff loop) ---------- */
function QRow({urgent, title, code, dept, by, when, photos, draft, note, xguest, onApprove, onDecline, onOpen}){
  return (
    <div className={"qrow"+(urgent?" urgent":"")}>
      <div className="qthumb" style={{cursor:onOpen?'pointer':'default'}} onClick={onOpen}/>
      <div style={{minWidth:0,display:'flex',flexDirection:'column',gap:7}}>
        <div style={{display:'flex',alignItems:'center',gap:9}}><span className="tt" style={{fontSize:14.5,lineHeight:1.3,cursor:onOpen?'pointer':'default'}} onClick={onOpen}>{title}</span>{urgent&&<span className="bdg red dot">urgent</span>}</div>
        <div className="qmeta"><span className="pcodeD">{code}</span><span>{dept}</span><span className="d">·</span><span>by {by}</span><span className="d">·</span><span>{when}</span><span className="d">·</span><span>{photos} photos</span></div>
        <div className="gate" style={{borderStyle:'solid'}}>
          <span style={{color:'var(--indigo-bright)',marginTop:1}}><DI n="spark" s={1.7}/></span>
          <span><b>Friday drafted:</b> {draft}. {note}</span>
        </div>
        {xguest && <div className="gate"><span style={{color:'var(--indigo-bright)',marginTop:1}}><DI n="msg" s={1.7}/></span><span><b>Guests in-house.</b> {xguest} <span className="aichip ai" style={{marginLeft:4,cursor:'pointer'}} onClick={()=>window.fadToast&&window.fadToast('Friday drafted a guest message')}><DI n="spark" s={1.5}/> Draft guest message</span></span></div>}
      </div>
      <div className="qactions">
        <button className="dbtn green sm" onClick={onApprove}><DI n="check" s={2}/> Approve &amp; assign</button>
        <button className="dbtn ghost sm" onClick={onOpen}>Edit draft</button>
        <button className="dbtn ghost sm" style={{color:'var(--tx-3)'}} onClick={onDecline}>Decline</button>
      </div>
    </div>
  );
}
function ScreenApprovals(){
  const REPORTS=[
    {id:'r1',urgent:true,title:'Pool pump making loud noise',code:'GBH-C5',dept:'maintenance',by:'Bryan',when:'3h ago',photos:'2',routine:false,
      draft:'Maintenance · Urgent · assign Matthieu',note:'3rd noise report here in 60 days — likely pump fault, consider the pool contractor.',
      xguest:'Pool will be briefly offline — message them to apologise & set expectations?',
      task:{code:'GBH-C5',title:'Service pool pump',dept:'maintenance',due:'Today',status:'Open',statusTone:'gray',pri:'urgent',occ:'Vacant',occTone:'green',who:'MD',addr:'Grand Baie',cost:'Rs 0'}},
    {id:'r2',urgent:false,title:'AC not cooling — master bedroom',code:'SD-10',dept:'maintenance',by:'Ishant',when:'2h ago',photos:'2',routine:true,
      draft:'Maintenance · High · assign Ishant',note:'Water pooling under the unit — added a ‘check drain line’ requirement.',
      task:{code:'SD-10',title:'AC not cooling — master bedroom',dept:'maintenance',due:'Today',status:'Open',statusTone:'gray',pri:'high',occ:'Vacant',occTone:'green',who:'IA',addr:'Tamarin',cost:'Rs 0'}},
    {id:'r3',urgent:false,title:'Internet keeps dropping',code:'VA-4',dept:'admin',by:'Ishant',when:'today',photos:'0',routine:true,
      draft:'Admin · Low · assign office',note:'Routine ISP top-up / reset — safe to auto-approve.',
      task:{code:'VA-4',title:'Internet top-up / reset',dept:'admin',due:'Today',status:'Open',statusTone:'gray',pri:'low',occ:'Vacant',occTone:'green',who:'',addr:'Grand Baie',cost:'Rs 0'}},
  ];
  const SUGG=[
    {id:'s1',title:'Schedule preventive service — GBH-C5 pool pump',codes:['GBH-C5'],meta:'pattern detected',note:'<b>Friday noticed</b> 3 pump-noise reports here in 60 days. A preventive service now likely avoids a peak-season breakdown — I drafted a task & flagged the pool contractor.',btn:'Accept & assign'},
    {id:'s2',title:'Batch AC filter changes — 3 villas overdue',codes:['SD-10','VA-3','RC-7'],meta:'maintenance',note:'<b>Friday noticed</b> filters at these 3 are past 90 days. Bundling them into one West-zone run on Thursday saves ~2 trips.',btn:'Create 3 tasks'},
  ];
  const [reports,setReports]=React.useState(REPORTS);
  const [sugg,setSugg]=React.useState(SUGG);
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const approve=r=>{ setReports(p=>p.filter(x=>x.id!==r.id)); T('Approved & assigned · task created','green'); };
  const decline=r=>{ setReports(p=>p.filter(x=>x.id!==r.id)); T('Report declined','red'); };
  const openReport=r=>window.FADTASK&&window.FADTASK.open(r.task);
  const approveRoutine=()=>{ const n=reports.filter(r=>r.routine).length; setReports(p=>p.filter(r=>!r.routine)); T(n+' routine reports approved','green'); };
  const acceptSugg=s=>{ setSugg(p=>p.filter(x=>x.id!==s.id)); T(s.btn==='Create 3 tasks'?'3 tasks created':'Accepted & assigned','green'); };
  const dismissSugg=s=>{ setSugg(p=>p.filter(x=>x.id!==s.id)); T('Suggestion dismissed'); };
  const urgentN=reports.filter(r=>r.urgent).length, routineN=reports.filter(r=>r.routine).length;
  return (
    <Shell active="ops" eyebrow={<><DI n="spark" s={1.6} style={{color:'var(--indigo-bright)'}}/> OPERATIONS</>} title="Report approvals"
      sub="Field reports waiting to be vetted into tasks"
      tabs={opsTabs('ap')}
      actions={<><button className="dbtn ghost"><DI n="filter" s={2}/> Filter</button><button className="dbtn primary" onClick={approveRoutine} disabled={!routineN} style={{opacity:routineN?1:.5}}><DI n="check" s={2}/> Approve all routine</button></>}>
      {reports.length>0 ? <div className="fai">
        <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday triage</span><span className="grow"/><span className="faint mono" style={{fontSize:10}}>updated 2m ago</span></div>
        <p><span className="hl">{reports.length} report{reports.length>1?'s':''}</span> in. {routineN>0?<>{routineN} look routine — I've pre-drafted them. </>:''}{urgentN>0?<><span className="hl">GBH-C5 pool pump</span> reads like a recurring fault, so I flagged it urgent and suggest a contractor.</>:''}</p>
        {routineN>0 && <div className="acts"><button className="dbtn primary sm" onClick={approveRoutine}><DI n="check" s={2}/> Approve {routineN} routine</button><button className="dbtn ghost sm" onClick={()=>T('Friday explained its triage')}>Why?</button></div>}
      </div> : null}
      <div className="grid4" style={{marginTop:18}}>
        <div className="statc amber"><div className="n">{reports.length}</div><div className="l">Pending</div><div className="d">oldest 2h ago</div></div>
        <div className="statc red"><div className="n">{urgentN}</div><div className="l">Urgent</div><div className="d">{urgentN?'pool pump':'none'}</div></div>
        <div className="statc green"><div className="n">12m</div><div className="l">Avg vet time</div><div className="d">this week</div></div>
        <div className="statc"><div className="n">28</div><div className="l">Approved · 7d</div><div className="d">86% kept Friday's draft</div></div>
      </div>
      {sugg.length>0 && <>
        <div className="dml">Friday learnings <span className="ct">{sugg.length} · suggested from patterns</span><span className="rule"/></div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {sugg.map(s=>(
            <div key={s.id} className="qrow" style={{borderStyle:'dashed',borderColor:'var(--indigo-line)'}}>
              <span className="qthumb" style={{display:'flex',alignItems:'center',justifyContent:'center',color:'var(--indigo-bright)',fontSize:18,background:'var(--indigo-ghost)',border:'none'}}><DI n="spark" s={1.6}/></span>
              <div style={{minWidth:0,display:'flex',flexDirection:'column',gap:7}}>
                <div style={{display:'flex',alignItems:'center',gap:9}}><span className="tt" style={{fontSize:14.5}}>{s.title}</span><span className="bdg indigo">suggested</span></div>
                <div className="qmeta">{s.codes.map((c,k)=><span key={k} className="pcodeD">{c}</span>)}<span className="d">·</span><span>{s.meta}</span></div>
                <div className="gate" style={{borderStyle:'solid'}}><span style={{color:'var(--indigo-bright)',marginTop:1}}><DI n="spark" s={1.7}/></span><span dangerouslySetInnerHTML={{__html:s.note}}/></div>
              </div>
              <div className="qactions"><button className="dbtn primary sm" onClick={()=>acceptSugg(s)}><DI n="check" s={2}/> {s.btn}</button><button className="dbtn ghost sm" onClick={()=>T('Opened to tweak')}>Tweak</button><button className="dbtn ghost sm" style={{color:'var(--tx-3)'}} onClick={()=>dismissSugg(s)}>Dismiss</button></div>
            </div>
          ))}
        </div>
      </>}
      <div className="dml">Waiting on you <span className="ct">{reports.length}</span><span className="rule"/></div>
      {reports.length>0
        ? <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {reports.map(r=><QRow key={r.id} {...r} onApprove={()=>approve(r)} onDecline={()=>decline(r)} onOpen={()=>openReport(r)}/>)}
          </div>
        : <div className="tdempty" style={{padding:'40px 0'}}><span className="tdempty-ic"><DI n="check" s={1.6}/></span><div style={{fontWeight:600,fontSize:14}}>All caught up</div><div className="faint" style={{fontSize:12}}>No reports waiting. Friday will surface the next one as it comes in.</div></div>}
    </Shell>
  );
}

/* ---------- 2 · Operations overview (workbench) ---------- */
function TaskTR({code, addr, title, dept, due, occ, occTone, pri, status, statusTone, who}){
  return (
    <tr className="tdrow" onClick={()=>window.FADTASK&&window.FADTASK.open({code,addr,title,dept,due,occ,occTone,pri,status,statusTone,who})}>
      <td><span className="pcodeD">{code}</span></td>
      <td><div className="tt">{title}</div><div className="sub">{dept} · {addr}</div></td>
      <td><span className={"bdg "+occTone+" dot"}>{occ}</span></td>
      <td className="mono faint">{due}</td>
      <td><PriD level={pri}/></td>
      <td><span className={"bdg "+statusTone}>{status}</span></td>
      <td><span className="av1">{who}</span></td>
    </tr>
  );
}
function Donut({segs, total}){
  let acc=0; const R=54, C=2*Math.PI*R;
  return (
    <div className="donut">
      <svg viewBox="0 0 128 128" style={{transform:'rotate(-90deg)'}}>
        <circle cx="64" cy="64" r={R} fill="none" stroke="var(--line-2)" strokeWidth="14"/>
        {segs.map((s,i)=>{ const len=C*(s.v/total); const off=C*(acc/total); acc+=s.v;
          return <circle key={i} cx="64" cy="64" r={R} fill="none" stroke={s.c} strokeWidth="14" strokeDasharray={len+' '+(C-len)} strokeDashoffset={-off} strokeLinecap="butt"/>; })}
      </svg>
      <div className="ctr"><span className="big">{total}</span><span className="cl">tasks today</span></div>
    </div>
  );
}
function OpsBriefText(){
  const H=useHealth();
  const M={
    healthy:<span className="ft"><b>Friday Daily Brief.</b> 32 tasks queued · Bryan on North, Ishant on the SD-10 leak · 2 jobs guest-blocked · lunch protected.</span>,
    stale:<span className="ft"><b>Friday Daily Brief.</b> 32 tasks queued · Bryan on North, Ishant on the SD-10 leak · 2 jobs guest-blocked. <span style={{color:'var(--amber)'}}>Last synced 12m ago — live data catching up.</span></span>,
    partial:<span className="ft"><b>Friday Daily Brief.</b> 32 tasks queued · 2 jobs guest-blocked. <span style={{color:'var(--amber)'}}>Roster data unavailable — staff-overload check skipped.</span></span>,
    fallback:<span className="ft"><b>Friday Daily Brief.</b> <span style={{color:'var(--indigo-bright)'}}>General morning shape — not grounded in today's data.</span> Verify task counts before acting.</span>,
    failed:<span className="ft"><b>Friday Daily Brief.</b> <span style={{color:'var(--red)'}}>Can't reach ops data — brief is read-only until sync recovers.</span></span>,
  };
  return M[H]||M.healthy;
}
function OpsBriefActions(){
  const H=useHealth(); const T=t=>window.fadToast&&window.fadToast(t);
  const dis = H==='failed';
  return <span className="fb"><button className="dbtn sm" disabled={dis} style={dis?{opacity:.5}:null} onClick={()=>T('Plan applied','green')}>Apply plan</button><button className="dbtn ghost sm" onClick={()=>T('Opened brief detail')}>Review <DI n="chevR" s={2}/></button></span>;
}
function OpsBriefProvenance(){
  const H=useHealth(), FS=window.FADSTATE;
  if(!FS || H==='healthy') return null;
  return <div style={{marginTop:8}}><FS.Provenance items={[['ops','32 tasks · today'],['users','4 staff on shift'],['box','West store supplies']]} health={H}/></div>;
}
function ScreenOps(){
  const segs=[{v:32,c:'var(--indigo)',l:'Open'},{v:3,c:'var(--red)',l:'Overdue'},{v:6,c:'var(--amber)',l:'Urgent'},{v:14,c:'var(--green)',l:'Done'}];
  const panel=<AskPanel scope="Operations · Overview"
    aware="Aware of: today's 32 tasks, 4 staff on, 2 guest-blocked jobs, supplies at West store."
    msgs={[
      {t:"Heavy day — <b>32 tasks</b>. 2 sit behind in-house guests (held urgent-only) and the West store is low on pipe sealant & towels."},
      {me:true, t:"Reassign the 3 overdue jobs and re-order the low supplies."},
      {t:"Done — moved 2 admin tasks to the office queue and 1 maintenance job to Matthieu (stand-by). Drafted a supply order.", done:"3 tasks reassigned · order drafted", action:{t:"Place supply order",d:"Pipe sealant ×12, bath towels ×10 to West store — Rs 2,140.",btn:"Place order"}},
    ]}/>;
  return (
    <Shell active="ops" eyebrow="OPERATIONS" title="Overview" sub="Mon 1 June · North + West · 4 staff on"
      tabs={opsTabs('ov')} panel={panel}
      actions={<><button className="dbtn ghost"><DI n="pin" s={1.9}/> Map</button><button className="dbtn primary"><DI n="plus" s={2}/> New task</button></>}>
      {window.FADSTATE && <window.FADSTATE.StateBanner surface="Operations"/>}
      <div style={{display:'grid',gridTemplateColumns:'1.55fr 1fr',gap:10}}>
        <div className="donutwrap">
          <Donut segs={segs} total={55}/>
          <div className="dleg">
            {segs.map((s,i)=>(<div key={i} className="li"><span className="sw" style={{background:s.c}}/><div className="col"><span className="lv">{s.v}</span><span className="ll">{s.l}</span></div></div>))}
          </div>
        </div>
        <div className="panel" style={{display:'flex',flexDirection:'column',gap:9}}>
          <div className="between"><span className="row" style={{gap:7,fontWeight:600,fontSize:13}}><DI n="flag" s={1.8} style={{color:'var(--amber)'}}/> Needs attention</span><span className="bdg gray">5</span></div>
          <div className="between" style={{fontSize:12}}><span className="dim">Reports to approve</span><span className="row" style={{gap:7}}><span className="bdg amber">3</span><DI n="chevR" s={2} style={{color:'var(--tx-3)'}}/></span></div>
          <div className="divider" style={{height:1,background:'var(--line-2)'}}/>
          <div className="between" style={{fontSize:12}}><span className="dim">Recurring · GBH-C5 pump</span><span className="bdg red dot">fault</span></div>
          <div className="divider" style={{height:1,background:'var(--line-2)'}}/>
          <div className="between" style={{fontSize:12}}><span className="dim">Guest-blocked jobs</span><span className="row" style={{gap:7}}><span className="bdg gray">2</span><DI n="chevR" s={2} style={{color:'var(--tx-3)'}}/></span></div>
          <div className="divider" style={{height:1,background:'var(--line-2)'}}/>
          <div className="between" style={{fontSize:12}}><span className="dim">SLA at risk · today</span><span className="bdg amber">1</span></div>
        </div>
      </div>
      <div className="fbar" style={{marginTop:12}}>
        <span className="fi"><DI n="spark" s={1.6}/></span>
        <OpsBriefText/>
        <OpsBriefActions/>
      </div>
      <OpsBriefProvenance/>
      <div className="dml" style={{marginTop:16}}>My tasks <span className="ct">4</span><span className="rule"/></div>
      <div className="grid2" style={{gap:8}}>
        {[
          {t:'Approve 3 field reports',meta:'pool pump · AC · internet',pri:'high',ic:'flag',go:()=>window.FADGO('approvals')},
          {t:'Call owner — GBH-B4 pump approval',meta:'preventive service · Rs 3,500',pri:'high',ic:'phone',go:()=>window.FADTASK&&window.FADTASK.open({code:'GBH-B4',title:'Call owner — pump approval',dept:'admin',due:'today',occ:'',occTone:'green',pri:'high',status:'Open',statusTone:'gray',who:'FG'})},
          {t:'Review April owner statement',meta:'Beaumont Trust · ready to send',pri:'med',ic:'coin',go:()=>window.FADGO('ownerstmt')},
          {t:'Counter-sign cleaning contract',meta:'CleanCo · via Xodo Sign',pri:'med',ic:'shield',go:()=>window.FADGO('legal')},
        ].map((m,i)=>(
          <div key={i} className="panel tap" style={{padding:11,cursor:'pointer'}} onClick={m.go}>
            <div className="between"><div className="row" style={{gap:10}}><span className={"pri "+m.pri}><DI n={m.ic} s={2} style={{width:11,height:11}}/></span><div><div className="tt" style={{fontSize:13}}>{m.t}</div><div className="sub">{m.meta}</div></div></div><DI n="chevR" s={2} style={{color:'var(--tx-3)'}}/></div>
          </div>
        ))}
      </div>
      <div className="grid2" style={{marginTop:16,alignItems:'start'}}>
        <div>
          <div className="dml">Fix today <span className="rule"/></div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <div className="panel" style={{padding:11}}><div className="between"><div className="row"><span className="pri urgent"><DI n="flag" s={2} style={{width:11,height:11}}/></span><div><div className="tt" style={{fontSize:13}}>3 reports need approval</div><div className="sub">pool pump · AC · internet</div></div></div><button className="dbtn sm">Review</button></div></div>
            <div className="panel" style={{padding:11}}><div className="between"><div className="row"><span className="pri high"><DI n="clock" s={2} style={{width:11,height:11}}/></span><div><div className="tt" style={{fontSize:13}}>3 tasks overdue</div><div className="sub">2 admin · 1 maintenance</div></div></div><button className="dbtn sm">Reassign</button></div></div>
            <div className="panel" style={{padding:11}}><div className="between"><div className="row"><span className="pri low"><DI n="more" s={2} style={{width:11,height:11}}/></span><div><div className="tt" style={{fontSize:13}}>Supplies low · West store</div><div className="sub">pipe sealant · towels below par</div></div></div><button className="dbtn sm">Order</button></div></div>
          </div>
        </div>
        <div>
          <div className="dml">Staff load <span className="rule"/></div>
          <div className="panel">
            {[['Bryan Ramluckun','North','88','warn'],['Ishant Ayadassen','West','64',''],['Catherine Appadoo','North','52',''],['Matthieu Duval','stand-by','30','']].map((s,i)=>(
              <div key={i} className="zperson" style={{padding:'7px 0',borderTop:i?'1px solid var(--line-2)':'none'}}>
                <span className="av1">{s[0].split(' ').map(w=>w[0]).join('')}</span>
                <div style={{flex:1,minWidth:0}}><div className="row between"><span style={{fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s[0]}</span><span className="faint mono" style={{fontSize:9.5,flex:'0 0 auto',marginLeft:8}}>{s[1]}</span></div><div className="load"><i className={s[3]} style={{width:s[2]+'%'}}/></div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="dml">Today's tasks <span className="ct">6 of 32</span><span className="rule"/></div>
      <div className="panel" style={{padding:'12px 4px'}}>
        <table className="tbl">
          <thead><tr><th>Property</th><th>Task</th><th>Occupancy</th><th>Due</th><th>Pri</th><th>Status</th><th>Who</th></tr></thead>
          <tbody>
            <TaskTR code="BW-C4" addr="Flic en Flac" title="Investigate worsening leak" dept="maintenance" due="08:00" occ="Guest in" occTone="red" pri="urgent" status="In progress" statusTone="indigo" who="BR"/>
            <TaskTR code="SD-10" addr="Tamarin" title="Water Issue" dept="maintenance" due="09:00" occ="Vacant" occTone="green" pri="urgent" status="Open" statusTone="gray" who="IA"/>
            <TaskTR code="GBH-B4" addr="Grand Baie" title="Deep clean — turnover" dept="housekeeping" due="by 15:00" occ="Check-in 15:00" occTone="amber" pri="high" status="Scheduled" statusTone="violet" who="IA"/>
            <TaskTR code="RC-7" addr="Pereybère" title="Lower the dining table" dept="maintenance" due="11:00" occ="Check-in 15:00" occTone="amber" pri="med" status="Open" statusTone="gray" who="CA"/>
            <TaskTR code="GBH-C5" addr="Grand Baie" title="Replace shower head" dept="maintenance" due="13:00" occ="Vacant" occTone="green" pri="med" status="Done" statusTone="green" who="BR"/>
            <TaskTR code="VA-3" addr="Grand Baie" title="Internet top up" dept="admin" due="overdue" occ="Vacant" occTone="green" pri="high" status="Blocked" statusTone="red" who="IA"/>
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/* ---------- 3 · Schedule draft-plan ---------- */
function SCell({type, title, sub, span}){
  if(!type) return <div className="sgcell"/>;
  const open=()=>window.FADTASK&&window.FADTASK.open({title, code:(title||'').split(' ')[0], dept:'operations', due:sub||'today', status:'Scheduled', statusTone:'violet', occ:'', occTone:'green', pri:'med', who:''});
  return <div className="sgcell" style={span?{gridColumn:'span '+span}:null}><div className={"sblock "+type} onClick={open} style={{cursor:'pointer'}}><span className="grip">⠿</span>{title}{sub&&<span className="sm">{sub}</span>}</div></div>;
}
function ScreenSchedule(){
  const [view,setView]=React.useState('user');
  const [applied,setApplied]=React.useState(false);
  const [unassigned,setUnassigned]=React.useState([['LB-2','Syndic fee readjust'],['OSA','Photographer deal']]);
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const times=['08','09','10','11','12','13','14','15','16'];
  const userRows=[
    {who:'BR',nm:'Bryan',cells:[['ind','BW-C4 leak','maint'],0,['grn','GBH-C5 shower'],0,'lunch',['ind','RCN-4 valve'],0,['amb','Inspection','GBH-C8'],0]},
    {who:'IA',nm:'Ishant',cells:[0,['ind','SD-10 water','urgent'],0,['amb','RC-7 table'],'lunch',['grn','GBH-B4 turnover','by 15:00',2],0,0,0]},
    {who:'CA',nm:'Catherine',cells:[['grn','BS-1 clean'],0,['amb','Inspection','moved'],0,'lunch',0,['ind','VA-4 wifi'],0,0]},
    {who:'MD',nm:'Matthieu · stand-by',cells:[0,0,0,0,'lunch',0,0,0,0]},
  ];
  const propRows=[
    {who:'BW-C4',nm:'Beachfront',cells:[['ind','Leak · BR','maint'],0,0,0,'lunch',0,0,0,0]},
    {who:'SD-10',nm:'Sunset Dr',cells:[0,['ind','Water · IA','urgent'],0,0,'lunch',0,0,0,0]},
    {who:'GBH-B4',nm:'Pool & Gym',cells:[0,0,0,0,'lunch',['grn','Turnover · IA','by 15:00',2],0,0,0]},
    {who:'RC-7',nm:'Royal Court',cells:[0,0,0,['amb','Table · IA'],'lunch',0,0,0,0]},
    {who:'GBH-C5',nm:'Pool & Gym',cells:[0,0,['grn','Shower · BR'],0,'lunch',0,0,0,0]},
  ];
  const rows = view==='prop'?propRows:userRows;
  const cell=(c,j)=>{
    if(c===0) return <div key={j} className="sgcell"/>;
    if(c==='lunch') return <div key={j} className="sgcell"><div className="sblock lunch">Lunch</div></div>;
    return <SCell key={j} type={c[0]} title={c[1]} sub={c[2]} span={c[3]}/>;
  };
  return (
    <Shell active="ops" eyebrow="OPERATIONS" title="Schedule"
      sub="Mon 1 June · draft ready for review"
      tabs={opsTabs('sc')}
      actions={<><button className="dbtn ghost" onClick={()=>{setApplied(false);T('Reverted to draft');}}><DI n="undo" s={1.9}/> Undo</button><button className="dbtn ghost" onClick={()=>T('Schedule cleared')}>Clear</button><button className="dbtn primary" onClick={()=>{setApplied(true);T('Draft applied · 18 jobs scheduled','green');}}><DI n="check" s={2}/> {applied?'Re-apply':'Apply draft'}</button></>}>
      <div className="fbar">
        <span className="fi"><DI n="spark" s={1.6}/></span>
        <span className="ft">{applied?<><b>Schedule applied.</b> 18 jobs live across 4 staff · everyone notified · lunch protected · 0 guest conflicts.</>:<><b>Friday drafted the day.</b> 18 jobs across 4 staff · lunch protected · 0 guest conflicts · Tuesday left light for the SD-10 follow-up.</>}</span>
        <span className={"bdg "+(applied?'green':'amber')}>{applied?'Applied':'Draft'}</span>
        {!applied && <span className="fb"><button className="dbtn primary sm" onClick={()=>{setApplied(true);T('Draft applied · 18 jobs scheduled','green');}}><DI n="check" s={2}/> Apply</button><button className="dbtn ghost sm">Review <DI n="chevR" s={2}/></button></span>}
      </div>
      <div className="between" style={{margin:'16px 0 9px'}}>
        <div className="vseg">
          <span className={"vs"+(view==='user'?' on':'')} onClick={()=>setView('user')}><DI n="users" s={1.8}/> By staff · day</span>
          <span className={"vs"+(view==='prop'?' on':'')} onClick={()=>setView('prop')}><DI n="home" s={1.8}/> By property</span>
          <span className={"vs"+(view==='week'?' on':'')} onClick={()=>setView('week')}><DI n="cal" s={1.8}/> By staff · week</span>
        </div>
        <span className="draghint"><span style={{fontSize:12}}>⠿</span> Drag a block to reschedule · drop unscheduled jobs onto the grid</span>
      </div>
      {view==='week'
        ? <div className="panel" style={{padding:'30px 0',textAlign:'center'}}><div className="tdempty-ic" style={{margin:'0 auto 10px'}}><DI n="cal" s={1.6}/></div><div style={{fontWeight:600,fontSize:14}}>Week view</div><div className="faint" style={{fontSize:12,marginTop:3}}>Mon–Sun coverage across all staff · switch back to a day view to edit blocks.</div></div>
        : <div className="sgrid">
        <div className="sgrow head"><div className="sgname faint" style={{fontWeight:600}}>{view==='prop'?'Property':'Staff'}</div>{times.map((t,i)=><div key={i} className="sgtime">{t}:00</div>)}</div>
        {rows.map((r,i)=>(
          <div key={i} className="sgrow">
            <div className="sgname">{view==='prop'?<span className="pcodeD">{r.who}</span>:<span className="av1">{r.who}</span>} <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.nm}</span></div>
            {r.cells.map((c,j)=>cell(c,j))}
          </div>
        ))}
      </div>}
      <div className="dml">Unassigned <span className="ct">{unassigned.length?unassigned.length+' · drag onto the grid':'all placed'}</span><span className="rule"/></div>
      {unassigned.length
        ? <div className="dropzone row" style={{gap:9,padding:11,flexWrap:'wrap'}}>
            {unassigned.map((u,i)=>(<div key={i} className="panel" style={{padding:'8px 11px',flex:'0 0 auto'}}><span className="row" style={{gap:9}}><span className="grip faint">⠿</span><span className="pcodeD">{u[0]}</span> {u[1]} <span className="bdg amber">unassigned</span></span></div>))}
            <button className="dbtn sm ghost" onClick={()=>{setUnassigned([]);T('Friday placed 2 jobs into open slots','green');}}><DI n="spark" s={1.7}/> Let Friday place these</button>
          </div>
        : <div className="afdone"><DI n="check" s={2}/> All jobs placed — Friday slotted them into open windows.</div>}
    </Shell>
  );
}

/* ---------- 4 · Roster / coverage ---------- */
function ZPerson({initials, name, role, load, tone, status, statusTone}){
  return (
    <div className="zperson">
      <span className="av1">{initials}</span>
      <div style={{flex:1,minWidth:0}}><div className="row between"><span style={{fontSize:12.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{name}</span><span className={"bdg "+statusTone}>{status}</span></div><div className="load"><i className={tone} style={{width:load+'%'}}/></div></div>
    </div>
  );
}
function ScreenRoster(){
  const days=[['Mon','25'],['Tue','26'],['Wed','27'],['Thu','28'],['Fri','29'],['Sat','30'],['Sun','31']];
  const staff=[
    {i:'BH',nm:'Bryan Henri',role:'field · ops · north',week:['north','north','north','north','north','off','off']},
    {i:'CH',nm:'Catherine Henri',role:'field · ops · north',week:['north','north','north','north','north','off','off']},
    {i:'FH',nm:'Franny Henri',role:'ops_manager · north',week:['north','north','north','north','north','off','off']},
    {i:'IA',nm:'Ishant Ayadassen',role:'director · admin · west',week:['west','west','west','west','west','off','off']},
    {i:'MO',nm:'Mary Oladimeji',role:'commercial · office',week:['on','on','on','on','on','off','off']},
    {i:'MD',nm:'Mathias Duval',role:'commercial · north',week:['north','north','north','north','north','off','off']},
  ];
  const lbl={north:'North',west:'West',on:'On',off:'Off',sb:'Stand-by',leave:'Leave'};
  const byDay=[['Mon',33],['Tue',70],['Wed',19],['Thu',32],['Fri',4],['Sat',10],['Sun',19]];
  const byDept=[['inspection',84],['maintenance',67],['office',31],['cleaning',5]];
  const byAsg=[['Unassigned',87],['Bryan Henri',39],['Franny Henri',16],['Ishant Ayad…',11],['Catherine…',11],['Mathias Du…',10]];
  const mx=(a)=>Math.max(...a.map(x=>x[1]));
  const Bars=({data,max})=>(<div className="rbars">{data.map((d,i)=>(<div key={i} className="rbar"><span className="bl">{d[0]}</span><span className="bt"><i style={{width:(d[1]/max*100)+'%'}}/></span><span className="bv">{d[1]}</span></div>))}</div>);
  const panel=<AskPanel scope="Operations · Roster"
    aware="Aware of: 187 tasks this week, 6 staff, zones, weekend fairness, standby/off & night-shift rules."
    msgs={[
      {t:"This week has <b>187 tasks</b> — inspection-heavy (84). <b>87 are unassigned</b> and Tuesday is overloaded (70). Bryan's at 39, others light."},
      {me:true, t:"Balance Tuesday and assign the unassigned inspections fairly."},
      {t:"Drafted — pulled 22 jobs off Tuesday to Wed/Thu, and spread the 87 unassigned across the 6 staff by zone fit. Weekend kept off.", done:"Draft updated · 0 unassigned", action:{t:"Publish roster",d:"Publishes the week to all 6 staff; notifies anyone whose shift changed.",btn:"Publish week"}},
    ]}/>;
  return (
    <Shell active="ops" eyebrow="OPERATIONS" title="Roster" sub="25 – 31 May · HR directory · 6 staff"
      tabs={opsTabs('ro')} panel={panel}
      actions={<><div className="weeksel"><span className="wbtn"><DI n="chevL" s={2}/></span><span className="wlabel">25–31 May <DI n="chevD" s={2.2} style={{width:12,height:12,opacity:.6}}/></span><span className="wbtn"><DI n="chevR" s={2}/></span></div><button className="dbtn ghost sm">Today</button><button className="dbtn ghost">Save draft</button><button className="dbtn primary"><DI n="check" s={2}/> Publish</button></>}>
      <div className="fbar">
        <span className="fi"><DI n="spark" s={1.6}/></span>
        <span className="ft"><b>Friday Consult · roster coverage agent.</b> 187 tasks · 87 unassigned · Tuesday busiest — ask it to balance, check zone fit or weekend fairness.</span>
        <span className="bdg amber">Draft</span>
        <span className="fb"><button className="dbtn primary sm"><DI n="check" s={2}/> Apply draft</button><button className="dbtn ghost sm">Discard</button><button className="dbtn ghost sm">Review <DI n="chevR" s={2}/></button></span>
      </div>
      <div className="rtoprow" style={{marginTop:14}}>
        <div className="panel">
          <div><div style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:17,color:'#f3f6fb'}}>187 tasks</div><div className="faint" style={{fontSize:11}}>scheduled 25–31 May</div></div>
          <div className="rstat3">
            <div className="statc" style={{padding:'8px 9px'}}><div className="n">6</div><div className="l">Active</div></div>
            <div className="statc" style={{padding:'8px 9px'}}><div className="n">6</div><div className="l">Assignable</div></div>
            <div className="statc" style={{padding:'8px 9px'}}><div className="n" style={{color:'var(--tx-3)'}}>0</div><div className="l">No login</div></div>
          </div>
        </div>
        <div className="rreview">
          <span className="bdg gray" style={{alignSelf:'flex-start'}}>Review</span>
          <div className="ri red"><div className="rt">87 unassigned</div><div className="rd">Assign before publishing.</div></div>
          <div className="ri amber"><div className="rt">17 high priority</div><div className="rd">Check coverage before handoff.</div></div>
          <div className="ri"><div className="rt">Tue busiest · 70 · Bryan top · 39</div></div>
        </div>
        <div className="panel"><div className="dml" style={{margin:'0 0 4px'}}>Tasks by day <span className="rule"/></div><Bars data={byDay} max={mx(byDay)}/></div>
        <div className="panel"><div className="dml" style={{margin:'0 0 4px'}}>By department <span className="rule"/></div><Bars data={byDept} max={mx(byDept)}/><div className="dml" style={{margin:'8px 0 4px'}}>By assignee <span className="rule"/></div><Bars data={byAsg.slice(0,4)} max={mx(byAsg)}/></div>
      </div>
      <div className="between" style={{margin:'16px 0 8px'}}>
        <span className="faint" style={{fontSize:11,fontFamily:'var(--mono)'}}>Tap a cell to change zone or status · colours = zone, maroon = off</span>
        <span className="row" style={{gap:10,fontSize:10.5}}><span className="faint mono">LEGEND</span><span className="bdg" style={{background:'rgba(74,155,118,.15)',color:'#5cc090'}}>North/On</span><span className="bdg" style={{background:'rgba(79,114,207,.18)',color:'#8fabf2'}}>West</span><span className="bdg" style={{background:'rgba(207,102,96,.13)',color:'#d07d78'}}>Off</span></span>
      </div>
      <div className="rweek" style={{minWidth:0}}>
        <div className="rwrow head"><div className="rwname" style={{fontFamily:'var(--mono)',fontSize:9,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--tx-3)'}}>Staff</div>{days.map((d,i)=><div key={i} className="rwhd">{d[0]}<div className="dd">{d[1]}</div></div>)}</div>
        {staff.map((s,i)=>(
          <div key={i} className="rwrow">
            <div className="rwname"><span className="av1">{s.i}</span><div style={{minWidth:0}}><div className="nm">{s.nm}</div><div className="rl">{s.role}</div></div></div>
            {s.week.map((c,j)=>(<div key={j} className="rcw"><div className={"rcell "+c}><span className="ed"><DI n="chevD" s={2.4}/></span>{lbl[c]}</div></div>))}
          </div>
        ))}
      </div>
    </Shell>
  );
}

/* ---------- Manager PWA shell mock (shared shell, bottom nav + Ask Friday) ---------- */
function PWAShell(){
  return (
    <div className="dwrap">
      <div className="pwaframe">
        <div className="pwa-top"><span className="wm">FridayOS</span><span className="faint" style={{fontSize:11,fontFamily:'var(--mono)'}}>GM · Friday Retreats</span><span className="grow"/><span className="icbtn alert" style={{width:30,height:30}}><DI n="bell" s={2}/></span></div>
        <div className="pwa-body">
          <div className="eyebrow" style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--tx-3)',marginBottom:6}}>OPERATIONS</div>
          <div style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:26,marginBottom:12}}>Overview</div>
          <div className="grid3" style={{gap:8}}><div className="statc" style={{padding:'10px 11px'}}><div className="n" style={{fontSize:20}}>32</div><div className="l">Open</div></div><div className="statc red" style={{padding:'10px 11px'}}><div className="n" style={{fontSize:20}}>3</div><div className="l">Overdue</div></div><div className="statc amber" style={{padding:'10px 11px'}}><div className="n" style={{fontSize:20}}>6</div><div className="l">Urgent</div></div></div>
          <div className="fai" style={{marginTop:12,padding:12}}><div className="fh"><span className="bdg indigo"><DI n="spark" s={1.5}/> Daily Brief</span></div><p style={{fontSize:12.5}}>32 tasks queued · 3 reports to approve · everyone's lunch protected.</p></div>
        </div>
        <div className="pwa-tab">
          <div className="pwa-ti on"><DI n="inbox" s={2}/><span>Inbox</span></div>
          <div className="pwa-ti"><DI n="ops" s={2}/><span>Ops</span></div>
          <div className="pwa-fab"><DI n="spark" s={1.7}/></div>
          <div className="pwa-ti"><DI n="cal" s={2}/><span>Calendar</span></div>
          <div className="pwa-ti"><DI n="more" s={2}/><span>More</span></div>
        </div>
      </div>
    </div>
  );
}

window.FADSCREENS = { ScreenApprovals, ScreenOps, ScreenSchedule, ScreenRoster, ScreenMap, ScreenInbox, ScreenAllTasks, ScreenCalendar, ScreenInventory, ScreenReservations, ScreenProperties, ScreenGuests, ScreenSettings, ScreenHelp, ScreenAskFull, ScreenNotifsMgr, ScreenFinance, ScreenOwners, ScreenReviews, ScreenAnalytics, ScreenHR, ScreenAllProperties, ScreenAllReservations, ScreenOwnerStatement, PWAShell, QRow, TaskTR, SCell, ZPerson, Donut };

/* ---------- 24 · Owner detail + statement waterfall ---------- */
function OwSt({l,v,sub,tone,bold,indent}){
  return (
    <div className="drow" style={{borderBottom:bold?'none':'1px solid var(--line-2)',paddingLeft:indent?22:2}}>
      <span style={{color:bold?'var(--tx)':'var(--tx-2)',fontWeight:bold?700:400,fontSize:bold?13.5:12.5}}>{l}{sub&&<span className="faint mono" style={{fontSize:9,marginLeft:7}}>{sub}</span>}</span>
      <span className="mono" style={{textAlign:'right',fontWeight:bold?700:500,color:tone==='neg'?'var(--red)':tone==='pos'?'var(--green)':'var(--tx)'}}>{v}</span>
    </div>
  );
}
function ScreenOwnerStatement(){
  const lines=[
    ['SD-10 · James O.','r-1188','+€2,210','pos'],['GBH-B4 · Marie L.','r-1192','+€1,840','pos'],
    ['RC-7 · Priya & Sam','r-1199','+€1,560','pos'],['KS-5 · B. Adeyemi','r-1204','+€2,040','pos'],
  ];
  const OWSTATE={draft:['amber','Draft'],review:['indigo','In review'],sent:['green','Sent'],viewed:['green','Viewed']};
  const [status,setStatus]=React.useState('draft');
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  return (
    <Shell active="own" bare>
      <div className="row" style={{gap:11,marginBottom:14}}>
        <button className="dbtn ghost sm" onClick={()=>window.FADGO('own')}><DI n="chevL" s={2}/> Back</button>
        <span className="faint mono" style={{fontSize:11}}>Owners <span style={{color:'var(--tx-4)'}}>›</span> Beaumont Family Trust <span style={{color:'var(--tx-4)'}}>›</span> April 2026 statement</span>
      </div>
      <div className="rdgrid">
        <div className="rdctx">
          <div className="row between"><span style={{fontWeight:700,fontSize:13.5}}>Beaumont Family Trust</span><span className="bdg gray">current</span></div>
          <div className="faint" style={{fontSize:11,marginTop:3}}>2 properties · GBH-B4 · KS-5</div>
          <div className="row between" style={{margin:'12px 0',paddingTop:10,borderTop:'1px solid var(--line-2)'}}><div><div className="faint mono" style={{fontSize:9}}>STATEMENT</div><div style={{fontSize:13,fontWeight:600}}>April 2026</div></div><span className={"bdg "+OWSTATE[status][0]+" dot"}>{OWSTATE[status][1]}</span></div>
          <PField l="Period">1 – 30 Apr</PField>
          <PField l="Issued">May 3, 2026</PField>
          <PField l="Net payout" last><b style={{color:'var(--green)'}}>€5,127.40</b></PField>
          {status==='draft' && <button className="dbtn primary sm" style={{width:'100%',marginTop:12}} onClick={()=>{setStatus('review');T('Moved to review — verify the held expense');}}><DI n="check" s={1.7}/> Submit for review</button>}
          {status==='review' && <><button className="dbtn primary sm" style={{width:'100%',marginTop:12}} onClick={()=>{setStatus('sent');T('Statement sent to owner','green');setTimeout(()=>setStatus('viewed'),2600);}}><DI n="msg" s={1.7}/> Send to owner</button><div className="faint" style={{fontSize:10.5,marginTop:7,textAlign:'center'}}>Review the BL-12 held expense before sending</div></>}
          {(status==='sent'||status==='viewed') && <><button className="dbtn ghost sm" style={{width:'100%',marginTop:12}} onClick={()=>T('PDF downloaded')}><DI n="doc" s={1.7}/> Download PDF</button><div className="afdone" style={{marginTop:8}}><DI n="check" s={2}/> {status==='viewed'?'Owner opened this statement just now':'Sent — awaiting owner open'}</div></>}
          <div className="rdnav">
            <div className="it on"><DI n="coin" s={1.7}/> Statement</div>
            <div className="it"><DI n="list" s={1.7}/> Transactions</div>
            <div className="it"><DI n="home" s={1.7}/> Properties</div>
            <div className="it"><DI n="doc" s={1.7}/> Documents</div>
            <div className="it"><DI n="chart" s={1.7}/> Insights</div>
          </div>
        </div>
        <div>
          <div className="dhead" style={{marginBottom:14}}><div><div className="eyebrow">OWNER STATEMENT</div><h1>April 2026</h1></div><div className="row"><button className="dbtn"><DI n="spark" s={1.6}/> Ask Friday</button><button className="dbtn ghost">Recalculate</button></div></div>
          <div className="fbar" style={{marginBottom:14}}><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft"><b>Friday.</b> Statement reconciled against 4 reservations and 3 posted expenses. Net payout €5,127.40 — €43 retile (BL-12) excluded, awaiting your approval before it hits this owner.</span></div>
          <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'1.3fr 1fr',gap:14}}>
            <div className="panel">
              <div className="dml" style={{margin:'0 0 8px'}}>Statement waterfall<span className="rule"/></div>
              <OwSt l="Gross rental revenue" v="€7,650.00" sub="4 reservations" tone="pos"/>
              <OwSt l="Channel commissions" v="−€612.00" tone="neg" indent/>
              <OwSt l="Tourist tax (MRA)" v="−€420.00" tone="neg" indent/>
              <OwSt l="Net rental income" v="€6,618.00" bold/>
              <div style={{height:8}}/>
              <OwSt l="Management commission" v="−€993.00" sub="15%" tone="neg" indent/>
              <OwSt l="Commission VAT" v="−€148.95" tone="neg" indent/>
              <OwSt l="Maintenance & supplies" v="−€348.65" sub="3 expenses" tone="neg" indent/>
              <OwSt l="Net payout to owner" v="€5,127.40" bold tone="pos"/>
            </div>
            <div className="panel">
              <div className="dml" style={{margin:'0 0 6px'}}>Revenue by reservation<span className="rule"/></div>
              <table className="tbl"><tbody>{lines.map((r,i)=>(<tr key={i}><td className="tt" style={{fontSize:12}}>{r[0]}</td><td className="mono faint" style={{fontSize:9.5}}>{r[1]}</td><td className="mono" style={{textAlign:'right',color:'var(--green)'}}>{r[2]}</td></tr>))}</tbody></table>
              <div className="dml" style={{margin:'14px 0 6px'}}>Deductions<span className="rule"/></div>
              <div className="rdflag" style={{fontSize:12}}><span>Cleaning · 4 turnovers</span><span className="mono">−€220.00</span></div>
              <div className="rdflag" style={{fontSize:12}}><span>Pipe sealant · SD-10</span><span className="mono">−€84.65</span></div>
              <div className="rdflag" style={{fontSize:12,borderBottom:'none'}}><span>AC service · KS-5</span><span className="mono">−€44.00</span></div>
              <div className="gate" style={{borderStyle:'solid',marginTop:12}}><span style={{color:'var(--amber)'}}><DI n="flag" s={1.7}/></span><span>BL-12 retile <b>€43</b> held — needs owner approval before inclusion.</span></div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
function PField({l,children,last}){return <div className="drow" style={last?{borderBottom:'none'}:null}><span className="faint">{l}</span><span style={{textAlign:'right'}}>{children}</span></div>;}

/* ---------- 22 · All properties (Guesty "Listed listings" flat table) ---------- */
function ScreenAllProperties(){
  const rows=[
    ['BS-1','Modern Apt in Secure Gated Residence','Les Jardins d\u2019Anna 2, Flic en Flac','green','€55','New'],
    ['BW-C4','Beachfront Apt with Pool · Sunset Views','Coastal Road, Flic en Flac','red','€72','Beachfront'],
    ['GBH-B4','Apt with Pool & Gym · Minutes to Beach','Géranium Road, Grand Baie','red','€40','Pool'],
    ['GBH-C3','Apt with Pool & Gym · Near Beach','Géranium Road, Grand Baie','amber','€48','Pool'],
    ['GBH-C5','Apt with Pool & Gym · Near Shops','Géranium Road, Grand Baie','green','€62','Pool'],
    ['GBH-C8','Apt with Pool & Gym · Near Amenities','Géranium Road, Grand Baie','red','€57','Pool'],
    ['KS-5','Apt with Rooftop Pool · Sunset Views','Kensington Square, Grand Baie','green','€76','Rooftop'],
    ['LB-C','3 Villas Complex with Pool · Up to 18 Guests','Avenue Pailles en Queue, Flic en Flac','red','€179','Group'],
    ['LV-10','Cozy Apt with Pool · 12 Min Walk to Beach','Avenue Des Colombes, Flic en Flac','green','€67','—'],
    ['RC-15','Mountain View Penthouse · 4 Min Walk','Avenue Des Toucans, Flic en Flac','green','€90','Penthouse'],
    ['SD-10','Beachfront Apt with Sea Views · 1 Min Beach','Les Sables D\u2019or Residence, Tamarin','green','€71','Beachfront'],
    ['VA-3','1 Bedroom Studio, 10 Mins Walk to Beach','Geranium Lane, Grand Baie','green','€36','Studio'],
    ['VA-C','Private Retreat · 6BR, Up to 15 Guests','Geranium Lane, Grand Baie','amber','€210','Group'],
  ];
  return (
    <Shell active="prop" eyebrow="PORTFOLIO" title="Listed listings" sub="25 listings"
      actions={<><button className="dbtn ghost"><DI n="list" s={1.9}/> Columns</button><button className="dbtn ghost"><DI n="search" s={2}/></button><button className="dbtn primary"><DI n="plus" s={2}/> Add property</button></>}>
      <div className="row" style={{gap:7,flexWrap:'wrap',marginBottom:12}}><span className="faint mono" style={{fontSize:10.5,marginRight:4}}>Filters</span><span className="aichip ai">Active status</span><span className="aichip ai">Listed on booking channels</span><span className="aichip" style={{color:'var(--tx-3)'}}>＋</span></div>
      <div className="panel" style={{padding:'12px 6px'}}>
        <table className="tbl"><thead><tr><th>Nickname ↑</th><th>Title</th><th>Type of unit</th><th>Address</th><th>Occ.</th><th style={{textAlign:'right'}}>Base</th><th>Tags</th></tr></thead>
        <tbody>{rows.map((r,i)=>(<tr key={i} className="tdrow" onClick={()=>window.FADGO('property')}>
          <td><span className="pcodeD">{r[0]}</span></td>
          <td className="tt" style={{maxWidth:280,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r[1]}</td>
          <td className="faint mono" style={{fontSize:10}}>SINGLE-UNIT</td>
          <td className="faint" style={{fontSize:11.5,maxWidth:230,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r[2]}</td>
          <td><span className="mdot" style={{background:r[3]==='red'?'var(--red)':r[3]==='amber'?'var(--amber)':'var(--green)',width:8,height:8}}/></td>
          <td className="mono" style={{textAlign:'right'}}>{r[4]}</td>
          <td>{r[5]!=='—'&&<span className="bdg gray">{r[5]}</span>}</td>
        </tr>))}</tbody></table>
      </div>
      <div className="faint mono" style={{fontSize:10,marginTop:10}}>Showing 13 of 25 · synced from Guesty · click a row to open the property record</div>
    </Shell>
  );
}

/* ---------- 23 · All reservations (Guesty "Upcoming Bookings" flat table) ---------- */
function ScreenAllReservations(){
  const rows=[
    ['Feb 1','Apr 30','GY-q7ubP9Ak','SV-140','4-Bedroom Villa, 12min Walk','Pamela Kearns','air'],
    ['Feb 22','May 7','GY-8nDNPvP7','GBH-C5','Apt with Pool & Gym','N. Mayeven','book'],
    ['Mar 20','May 23','HMEB32N5KM','RC-14','Modern Sea View Apt','Fernando Kanarski','air'],
    ['Mar 31','Jul 5','HMKDYX3S49','GBH-C8','Apt with Pool & Gym','Gael Le Metayer','book'],
    ['Apr 15','Apr 28','HMMKBPPX84','LB-C','3 Villas Complex','Francine De Gaye','dir'],
    ['Apr 17','May 17','GY-SQkmJteQ','GBH-C3','Apt with Pool & Gym','Li Da','air'],
    ['Apr 25','May 3','HMXBY4HJQF','RC-15','Mountain View Penthouse','Thomas Goddard','air'],
    ['Apr 29','May 2','HMBTY83JT8','RC-16','Sea View Penthouse','Yulinfeng Xie','book'],
    ['Apr 29','May 2','HMKRW2PWTX','SD-10','Beachfront Apt, Sea Views','Stuart Griffiths','air'],
    ['May 1','May 10','GY-FmncsBH5','LB-C','3 Villas Complex','Cyril','air'],
  ];
  const ch={air:['#e08e89','Airbnb'],book:['#9fb4ee','Booking'],dir:['#6cc79c','Direct']};
  return (
    <Shell active="res" eyebrow="RESERVATIONS" title="Upcoming bookings" sub="36 reservations"
      actions={<><button className="dbtn ghost"><DI n="list" s={1.9}/> Columns</button><button className="dbtn ghost"><DI n="filter" s={2}/></button><button className="dbtn primary"><DI n="plus" s={2}/> New booking</button></>}>
      <div className="row" style={{gap:7,flexWrap:'wrap',marginBottom:12}}><span className="faint mono" style={{fontSize:10.5,marginRight:4}}>Filters</span><span className="aichip ai">Check-out is in the future</span><span className="aichip ai">Status is Confirmed</span><span className="aichip" style={{color:'var(--tx-3)'}}>＋</span></div>
      <div className="panel" style={{padding:'12px 6px'}}>
        <table className="tbl"><thead><tr><th>Check-in ↑</th><th>Check-out</th><th>Confirmation</th><th>Listing</th><th>Guest</th><th>Channel</th></tr></thead>
        <tbody>{rows.map((r,i)=>(<tr key={i} className="tdrow" onClick={()=>window.FADGO('reservation')}>
          <td className="mono faint">{r[0]}, 2026</td>
          <td className="mono faint">{r[1]}, 2026</td>
          <td className="mono" style={{fontSize:11}}>{r[2]}</td>
          <td><span className="row" style={{gap:7}}><span className="pcodeD">{r[3]}</span><span className="faint" style={{fontSize:11,maxWidth:150,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r[4]}</span></span></td>
          <td className="tt">{r[5]}</td>
          <td><span className="row" style={{gap:6,fontSize:11.5}}><span className="mdot" style={{background:ch[r[6]][0],width:8,height:8,borderRadius:3}}/>{ch[r[6]][1]}</span></td>
        </tr>))}</tbody></table>
      </div>
      <div className="faint mono" style={{fontSize:10,marginTop:10}}>Showing 10 of 36 · column picker groups: Reservation · Listing · Guest · Financial · Payments · Accounting · click a row to open the reservation</div>
    </Shell>
  );
}

/* ---------- 18 · Owners ---------- */
function ScreenOwners(){
  const [tab,setTab]=React.useState('all');
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const rows=[
    ['Nitzana Holdings SA','1','€142,500','May 3','current'],['Beaumont Family Trust','2','€88,200','May 3','current'],
    ['Harrington, D.','1','€51,600','May 3','renewal'],['Chen, Y.','1','€34,100','May 3','current'],
    ['Mauritius Coastal Ltd','2','€77,900','May 3','current'],['Okonkwo, L.','1','€28,400','May 3','current'],
    ['Beaumont Family Trust II','3','€121,000','May 3','current'],['Solheim, H.','1','€19,800','May 3','renewal'],
  ];
  const openOwner=r=>window.FADTASK&&window.FADTASK.openOwner({name:r[0],status:r[4],ytd:r[2],units:+r[1],
    props:Array.from({length:+r[1]},(_,k)=>[['GBH-B4','SD-10','RC-7','VA-3','LB-2'][k]||'PR-'+k,['Apt with Pool & Gym','Villa Sud','Beach Bungalow','Hillside Studio','Garden Suite'][k]||'Unit '+k,['Grand Baie','Tamarin','Pereybère','Vacoas','Bel Ombre'][k]||'\u2014',['92%','78%','85%','71%','88%'][k]||'80%'])});
  const tabs=[{k:'all',l:'All owners',ct:38},{k:'statements',l:'Statements',ct:38},{k:'payouts',l:'Payouts',ct:5},{k:'documents',l:'Documents'},{k:'insights',l:'Insights'}];
  return (
    <Shell active="own" eyebrow="OWNERS" title="Owners" sub="Owner relationships · monthly statements · payouts · documents"
      tabs={tabs.map(t=>({l:t.l,ct:t.ct,on:tab===t.k,fn:()=>setTab(t.k)}))}
      actions={<><button className="dbtn ghost" onClick={()=>T('Filter owners')}><DI n="filter" s={2}/> Filter</button><button className="dbtn primary" onClick={()=>T('Add owner — invite to portal')}><DI n="plus" s={2}/> Add owner</button></>}>
      <div className="grid4">
        <div className="statc"><div className="n">38</div><div className="l">Owners</div><div className="d">+2 this quarter</div></div>
        <div className="statc"><div className="n">27</div><div className="l">Units managed</div></div>
        <div className="statc"><div className="n">€166k</div><div className="l">Payouts · April</div></div>
        <div className="statc amber"><div className="n">38</div><div className="l">Statements ready · May 3</div></div>
      </div>
      <div className="fai" style={{marginTop:13}}>
        <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday · owners</span></div>
        <p><b>38 April statements</b> are reconciled and ready to release — the period was locked Apr 27. <b>2 owners</b> are up for mandate renewal in 30 days (Harrington, Solheim); both are below-target on occupancy, worth a call before they shop around. <b>Nitzana Holdings</b> is your top relationship at €142.5k YTD.</p>
        <div className="acts"><button className="dbtn primary sm" onClick={()=>{setTab('statements');T('Jumped to statements');}}><DI n="coin" s={1.7}/> Release 38 statements</button><button className="dbtn ghost sm" onClick={()=>setTab('insights')}>See retention risk</button></div>
      </div>

      {tab==='all' && <>
        <div className="row between" style={{margin:'16px 0 8px'}}>
          <span className="vseg"><span className="vs on">All <span className="mono" style={{opacity:.6,fontSize:10}}>38</span></span><span className="vs" onClick={()=>T('Filtered: renewal due')}>Renewal due <span className="mono" style={{opacity:.6,fontSize:10}}>2</span></span><span className="vs" onClick={()=>T('Filtered: multi-unit')}>Multi-unit <span className="mono" style={{opacity:.6,fontSize:10}}>9</span></span></span>
          <span className="faint mono" style={{fontSize:10,alignSelf:'center'}}>Sorted by YTD payout ↓</span>
        </div>
        <div className="panel" style={{padding:'4px 4px'}}>
          {rows.map((r,i)=>(
            <div key={i} className="row between tdrow" style={{padding:'13px 12px',borderBottom:i<rows.length-1?'1px solid var(--line-2)':'none',cursor:'pointer'}} onClick={()=>openOwner(r)}>
              <div className="row" style={{gap:11}}><span className="av1" style={{width:30,height:30,fontSize:9}}>{r[0].split(/[ ,]/).filter(Boolean).map(w=>w[0]).slice(0,2).join('')}</span>
                <div><div style={{fontSize:13.5,fontWeight:600}}>{r[0]}</div><div className="faint mono" style={{fontSize:10.5,marginTop:2}}>{r[1]} {r[1]==='1'?'property':'properties'} · YTD {r[2]} · next statement {r[3]}</div></div></div>
              <span className="row" style={{gap:8}}><span className={"bdg "+(r[4]==='renewal'?'amber':'gray')}>{r[4]}</span><DI n="chevR" s={2} style={{color:'var(--tx-3)'}}/></span>
            </div>
          ))}
        </div>
      </>}

      {tab==='statements' && <OwnersStatements T={T}/>}
      {tab==='payouts' && <OwnersPayouts T={T}/>}
      {tab==='documents' && <OwnersDocuments T={T}/>}
      {tab==='insights' && <OwnersInsights/>}
    </Shell>
  );
}
function OwnersStatements({T}){
  const init=[
    {own:'Nitzana Holdings SA',unit:'RC-7 · RC-15',gross:'€11,420',fee:'−€2,284',net:'€8,910',state:'ready'},
    {own:'Beaumont Family Trust',unit:'GBH-B4 · SD-10',gross:'€7,200',fee:'−€1,440',net:'€5,610',state:'ready'},
    {own:'Harrington, D.',unit:'VA-3',gross:'€3,980',fee:'−€796',net:'€3,120',state:'review'},
    {own:'Chen, Y.',unit:'LB-2',gross:'€2,640',fee:'−€528',net:'€2,070',state:'ready'},
    {own:'Mauritius Coastal Ltd',unit:'KS-5 · PT-3',gross:'€6,310',fee:'−€1,262',net:'€4,920',state:'ready'},
    {own:'Solheim, H.',unit:'LB-C',gross:'€1,540',fee:'−€308',net:'€1,200',state:'sent'},
  ];
  const [st,setSt]=React.useState(init);
  const send=i=>{setSt(s=>s.map((x,k)=>k===i?{...x,state:'sent'}:x));T('Statement sent to owner portal','green');};
  const tone={ready:'green',review:'amber',sent:'gray'};
  const ready=st.filter(s=>s.state==='ready').length;
  return (<>
    <div className="row between" style={{margin:'16px 0 8px'}}>
      <div className="dml" style={{margin:0,flex:1}}>April 2026 statements <span className="ct">{st.length} · period locked Apr 27</span><span className="rule"/></div>
      <button className="dbtn primary sm" onClick={()=>{setSt(s=>s.map(x=>x.state==='ready'?{...x,state:'sent'}:x));T('Released '+ready+' statements','green');}}><DI n="check" s={2}/> Release {ready} ready</button>
    </div>
    <div className="panel" style={{padding:'10px 6px'}}>
      <table className="tbl"><thead><tr><th>Owner</th><th>Units</th><th style={{textAlign:'right'}}>Gross</th><th style={{textAlign:'right'}}>Mgmt fee</th><th style={{textAlign:'right'}}>Net payout</th><th>Status</th><th></th></tr></thead>
        <tbody>{st.map((s,i)=>(<tr key={i} className="tdrow">
          <td className="tt">{s.own}</td><td><span className="pcodeD">{s.unit}</span></td>
          <td className="mono" style={{textAlign:'right'}}>{s.gross}</td>
          <td className="mono faint" style={{textAlign:'right'}}>{s.fee}</td>
          <td className="mono" style={{textAlign:'right',fontWeight:700}}>{s.net}</td>
          <td><span className={"bdg "+tone[s.state]+" dot"}>{s.state}</span></td>
          <td style={{textAlign:'right'}}>{s.state==='sent'? <button className="dbtn sm ghost" onClick={()=>window.FADGO('ownerstmt')}>View</button> : s.state==='review'? <button className="dbtn sm ghost" onClick={()=>T('Opened for review')}>Review</button> : <button className="dbtn sm primary" onClick={()=>send(i)}>Send</button>}</td>
        </tr>))}</tbody>
      </table>
    </div>
    <div className="gate" style={{borderStyle:'solid',marginTop:12}}><span style={{color:'var(--amber)'}}><DI n="alert" s={1.6}/></span><span><b>Harrington needs review:</b> a Rs 8,700 water-heater repair on VA-3 lands in this period — Friday flagged it because it crosses the owner-approval threshold. Approve it and the statement moves to ready.</span></div>
  </>);
}
function OwnersPayouts({T}){
  const runs=[
    {when:'May 3, 2026','m':'April period',owners:38,amt:'€166,074',state:'scheduled',via:'SEPA · 2 batches'},
    {when:'Apr 3, 2026','m':'March period',owners:36,amt:'€151,210',state:'paid',via:'SEPA'},
    {when:'Mar 3, 2026','m':'February period',owners:35,amt:'€118,940',state:'paid',via:'SEPA'},
  ];
  const pend=[
    ['Nitzana Holdings SA','€8,910','EUR · Barclays','ready'],
    ['Beaumont Family Trust','€5,610','EUR · HSBC','ready'],
    ['Harrington, D.','€3,120','MUR · MCB','on hold'],
    ['Mauritius Coastal Ltd','€4,920','EUR · MCB','ready'],
  ];
  return (<>
    <div className="dml" style={{marginTop:16}}>Payout runs<span className="rule"/></div>
    <div className="panel" style={{padding:'10px 6px'}}>
      <table className="tbl"><thead><tr><th>Run date</th><th>Period</th><th style={{textAlign:'right'}}>Owners</th><th style={{textAlign:'right'}}>Amount</th><th>Method</th><th>Status</th></tr></thead>
        <tbody>{runs.map((r,i)=>(<tr key={i} className="tdrow" onClick={()=>T('Opened payout run · '+r.m)}>
          <td className="mono">{r.when}</td><td className="faint">{r.m}</td><td className="mono" style={{textAlign:'right'}}>{r.owners}</td>
          <td className="mono" style={{textAlign:'right',fontWeight:700}}>{r.amt}</td><td className="faint" style={{fontSize:11.5}}>{r.via}</td>
          <td><span className={"bdg "+(r.state==='paid'?'green':'amber')+" dot"}>{r.state}</span></td>
        </tr>))}</tbody>
      </table>
    </div>
    <div className="dml" style={{marginTop:16}}>Pending this run · May 3 <span className="ct">{pend.length}</span><span className="rule"/></div>
    <div className="panel" style={{padding:'4px 4px'}}>
      {pend.map((p,i)=>(<div key={i} className="row between" style={{padding:'12px',borderBottom:i<pend.length-1?'1px solid var(--line-2)':'none'}}>
        <div className="row" style={{gap:11}}><span className="av1" style={{width:28,height:28,fontSize:9}}>{p[0].split(/[ ,]/).filter(Boolean).map(w=>w[0]).slice(0,2).join('')}</span><div><div style={{fontSize:13,fontWeight:600}}>{p[0]}</div><div className="faint mono" style={{fontSize:10.5,marginTop:2}}>{p[2]}</div></div></div>
        <span className="row" style={{gap:10}}><span className="mono" style={{fontWeight:700}}>{p[1]}</span><span className={"bdg "+(p[3]==='on hold'?'amber':'green')+" dot"}>{p[3]}</span></span>
      </div>))}
    </div>
    <div className="gate" style={{borderStyle:'solid',marginTop:12}}><span style={{color:'var(--amber)'}}><DI n="alert" s={1.6}/></span><span><b>Harrington is on hold</b> — bank details failed validation on the MCB feed. I drafted a request for updated IBAN; send it and the payout clears for May 3.</span></div>
  </>);
}
function OwnersDocuments({T}){
  const docs=[
    ['Owner mandate · Nitzana Holdings','Management agreement','signed','12 Jan 2026','green'],
    ['Owner mandate · Beaumont Trust','Management agreement','signed','3 Feb 2026','green'],
    ['Owner mandate · Harrington','Management agreement','renewal due','expires 14 Jun','amber'],
    ['Owner mandate · Solheim','Management agreement','renewal due','expires 28 Jun','amber'],
    ['Tax residency · Chen, Y.','Compliance · KYC','on file','—','gray'],
    ['Bank mandate · Mauritius Coastal','Payout authorisation','signed','9 Mar 2026','green'],
  ];
  return (<>
    <div className="dml" style={{marginTop:16}}>Owner documents <span className="ct">{docs.length} · 2 need renewal</span><span className="rule"/></div>
    <div className="panel" style={{padding:'4px 4px'}}>
      {docs.map((d,i)=>(<div key={i} className="row between tdrow" style={{padding:'12px',borderBottom:i<docs.length-1?'1px solid var(--line-2)':'none',cursor:'pointer'}} onClick={()=>T('Opened '+d[0])}>
        <div className="row" style={{gap:11}}><span className="statc" style={{padding:7,border:'none',background:'var(--card-2)',color:'var(--tx-2)'}}><DI n="doc" s={1.7}/></span>
          <div><div style={{fontSize:13,fontWeight:600}}>{d[0]}</div><div className="faint" style={{fontSize:11,marginTop:2}}>{d[1]} · {d[3]}</div></div></div>
        <span className="row" style={{gap:8}}><span className={"bdg "+d[4]+(d[4]==='green'?' dot':'')}>{d[2]}</span>{d[2]==='renewal due'? <button className="dbtn sm" onClick={(e)=>{e.stopPropagation();window.FADGO('legal');}}>Renew</button> : <button className="dbtn sm ghost" onClick={(e)=>{e.stopPropagation();T('Downloading PDF…');}}>PDF</button>}</span>
      </div>))}
    </div>
  </>);
}
function OwnersInsights(){
  const top=[['Nitzana Holdings SA','€142,500',96],['Beaumont Family Trust II','€121,000',82],['Beaumont Family Trust','€88,200',60],['Mauritius Coastal Ltd','€77,900',53],['Harrington, D.','€51,600',35]];
  const maxv=142500;
  return (<>
    <div className="grid3" style={{marginTop:16}}>
      <div className="statc green"><div className="n">94%</div><div className="l">Owner retention · 12mo</div><div className="d">2 churned this year</div></div>
      <div className="statc amber"><div className="n">2</div><div className="l">Mandates expiring · 30d</div></div>
      <div className="statc"><div className="n">€4,370</div><div className="l">Avg payout / owner · April</div></div>
    </div>
    <div className="dtwocol" style={{marginTop:14,display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:14}}>
      <div className="panel">
        <div className="dml" style={{margin:'0 0 12px'}}>Top owners by YTD payout<span className="rule"/></div>
        {top.map((t,i)=>(<div key={i} className="row" style={{gap:10,marginBottom:11}}><span style={{width:150,fontSize:12.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t[0]}</span><span style={{flex:1,height:8,borderRadius:4,background:'var(--card-2)',overflow:'hidden'}}><i style={{display:'block',height:'100%',width:t[2]+'%',background:'linear-gradient(90deg,var(--indigo-bright),var(--indigo))',borderRadius:4}}/></span><span className="mono" style={{width:62,textAlign:'right',fontSize:11.5,fontWeight:600}}>{t[1]}</span></div>))}
        <div className="faint mono" style={{fontSize:10,marginTop:6}}>Top 5 owners = 58% of YTD payouts · concentration risk: moderate</div>
      </div>
      <div className="panel">
        <div className="dml" style={{margin:'0 0 8px'}}>Retention watch<span className="rule"/></div>
        <div className="fbar" style={{marginBottom:10}}><span className="fi"><DI n="spark" s={1.5}/></span><span className="ft" style={{fontSize:11.5}}><b>Friday.</b> Harrington & Solheim are both up for renewal and below occupancy target — a proactive call protects €71k of YTD payout.</span></div>
        {[['Harrington, D.','VA-3 · 71% occ · renewal 14 Jun','at risk','red'],['Solheim, H.','LB-C · 74% occ · renewal 28 Jun','at risk','red'],['Chen, Y.','LB-2 · 85% occ','stable','green']].map((r,i)=>(
          <div key={i} className="row between" style={{padding:'10px 0',borderBottom:i<2?'1px solid var(--line-2)':'none'}}><div><div style={{fontSize:12.5,fontWeight:600}}>{r[0]}</div><div className="faint mono" style={{fontSize:10,marginTop:2}}>{r[1]}</div></div><span className={"bdg "+r[3]+(r[3]==='green'?' dot':'')}>{r[2]}</span></div>
        ))}
      </div>
    </div>
  </>);
}

/* ---------- 19 · Reviews ---------- */
function Bar({v,max,c}){return <div style={{flex:1,height:7,borderRadius:4,background:'var(--card-2)',overflow:'hidden'}}><div style={{height:'100%',width:(v/max*100)+'%',background:c,borderRadius:4}}/></div>;}
function ScreenReviews(){
  const dist=[[5,7,'var(--green)'],[4,1,'var(--green)'],[3,0,'var(--tx-3)'],[2,1,'var(--red)'],[1,0,'var(--tx-3)']];
  const cohorts=[['Flic en Flac','4.65','68'],['Grand Baie / Mont Choisy','4.60','29'],['West Coast','5.00','3'],['Pereybère','—','0'],['Bel Ombre','—','0']];
  const latest=[['G4','Guest 48fb87','RC-15','Airbnb','4.0'],['GD','Guest d6143a','LB-C','Airbnb','2.0'],['G9','Guest 8bad11','RC-14','Airbnb','5.0'],['GB','Guest 6760ff','LF-7','Airbnb','5.0'],['G7','Guest 7a68af','RC-16','Airbnb','5.0']];
  const [rtab,setRtab]=React.useState('overview');
  return (
    <Shell active="rev" eyebrow="REVIEWS" title="Reviews" sub="Aggregate ratings · per-stay reviews · staff attribution · trending themes">
      <div className="dtabs" style={{marginTop:2,marginBottom:6}}>{[['overview','Overview'],['all','All reviews'],['staff','Staff performance']].map(t=><span key={t[0]} className={"dtab"+(rtab===t[0]?' on':'')} onClick={()=>setRtab(t[0])}>{t[1]}</span>)}</div>
      {rtab==='all' && <ReviewsAll/>}
      {rtab==='staff' && <ReviewsStaff/>}
      {rtab==='overview' && <>
      <div className="grid4">
        <div className="statc"><div className="n">4.56</div><div className="l" style={{color:'var(--red)'}}>−0.33 vs prior 30d</div></div>
        <div className="statc"><div className="n">9</div><div className="l">Reviews · 30d</div></div>
        <div className="statc"><div className="n">0%</div><div className="l">Reply rate · target ≥90%</div></div>
        <div className="statc amber"><div className="n">100</div><div className="l">Unreplied</div></div>
      </div>
      <div className="fbar" style={{marginTop:12}}><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft"><b>Friday.</b> 100 reviews unreplied (reply-rate is hurting ranking). I drafted on-brand responses for all — bulk-approve or edit individually.</span><span className="fb"><button className="dbtn sm">Review drafts</button></span></div>
      <div className="row" style={{gap:8,flexWrap:'wrap',marginTop:12}}>
        <span className="faint mono" style={{fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',alignSelf:'center'}}>Review sources</span>
        {window.FADSTATE && <><window.FADSTATE.SyncChip source="Airbnb"/><window.FADSTATE.SyncChip source="Booking.com"/></>}
        <span className="srctag"><span className="st-dot" style={{background:'var(--tx-4)'}}/>Google · not connected</span>
        <span className="srctag"><span className="st-dot" style={{background:'var(--tx-4)'}}/>Vrbo · not connected</span>
        <span className="aichip ai" style={{cursor:'pointer'}} onClick={()=>window.fadToast&&window.fadToast('Connect a review source')}><DI n="plus" s={1.6}/> Connect source</span>
      </div>
      <div className="dtwocol" style={{marginTop:14,display:'grid',gridTemplateColumns:'1.3fr 1fr',gap:14}}>
        <div className="panel">
          <div className="dml" style={{margin:'0 0 10px'}}>Star distribution · 30d<span className="rule"/></div>
          {dist.map((d,i)=>(<div key={i} className="row" style={{gap:10,marginBottom:9}}><span className="mono faint" style={{fontSize:11,width:10}}>{d[0]}</span><DI n="star" s={1.5} style={{color:'var(--amber)'}}/><Bar v={d[1]} max={7} c={d[2]}/><span className="mono faint" style={{fontSize:11,width:14,textAlign:'right'}}>{d[1]}</span></div>))}
          <div className="row" style={{gap:10,marginTop:14}}>
            <div className="statc" style={{flex:1}}><div className="n" style={{fontSize:18}}>4.76</div><div className="l">Airbnb · 82 reviews</div></div>
            <div className="statc" style={{flex:1}}><div className="n" style={{fontSize:18}}>4.17</div><div className="l">Booking.com · 18</div></div>
          </div>
        </div>
        <div className="panel">
          <div className="dml" style={{margin:'0 0 6px'}}>Average rating by cohort<span className="rule"/></div>
          <table className="tbl"><tbody>{cohorts.map((c,i)=>(<tr key={i}><td className="tt">{c[0]}</td><td className="mono" style={{textAlign:'right',color:c[1]==='—'?'var(--tx-3)':'var(--amber)'}}>{c[1]==='—'?'—':'★ '+c[1]}</td><td className="mono faint" style={{textAlign:'right'}}>{c[2]}</td></tr>))}</tbody></table>
        </div>
      </div>
      <div className="panel" style={{marginTop:14}}>
        <div className="dml" style={{margin:'0 0 6px'}}>Latest reviews<span className="rule"/></div>
        {latest.map((r,i)=>(<div key={i} className="row between tdrow" style={{padding:'10px 0',borderBottom:i<latest.length-1?'1px solid var(--line-2)':'none',cursor:'pointer'}} onClick={()=>window.FADTASK&&window.FADTASK.openReview({guest:r[1],prop:r[2],channel:r[3],rating:+r[4],ago:'2d ago',text:+r[4]<=3?"The apartment is in a great spot but the AC stopped cooling on the second night and it took a while to reach someone. Otherwise the stay was fine.":"Lovely stay — spotless apartment, smooth check-in and quick replies to every question. The location is perfect. We'd happily book again.",draft:+r[4]<=3?"Thank you for taking the time to share this, and apologies the AC fell short during your stay. We've since serviced the unit and reviewed our response times. We'd genuinely value the chance to host you again.":"Thank you so much for the kind words. It was a pleasure having you, and you're welcome back any time."})}><span className="row" style={{gap:9}}><span className="av1" style={{width:24,height:24,fontSize:8}}>{r[0]}</span><span style={{fontSize:12.5}}>{r[1]} · <span className="pcodeD">{r[2]}</span> · <span className="faint">{r[3]}</span></span></span><span className="mono" style={{color:+r[4]<3?'var(--red)':'var(--amber)',fontSize:12}}>★ {r[4]}</span></div>))}
      </div>
      </>}
    </Shell>
  );
}

/* Reviews — all reviews + reply management */
function ReviewsAll(){
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const [seg,setSeg]=React.useState('reply');
  const all=[
    {av:'AB',guest:'Anaïs B.',prop:'GBH-C8',ch:['Airbnb','#e08e89'],stars:2,when:'2h ago',state:'reply',txt:'Great spot but the AC stopped cooling on the second night and it took a while to reach someone.',draft:'Thank you for flagging this, Anaïs — apologies the AC fell short. We’ve since serviced the unit and tightened our response times. We’d love the chance to host you again.'},
    {av:'TR',guest:'Tomás R.',prop:'VA-3',ch:['Direct','#6cc79c'],stars:4,when:'5h ago',state:'reply',txt:'Lovely and clean, smooth check-in. Only the wifi dropped a couple of times.',draft:'Thanks so much, Tomás! Glad the stay was smooth — we’ve since boosted the wifi at VA-3. Come back any time!'},
    {av:'JO',guest:'James O.',prop:'SD-10',ch:['Booking','#9fb4ee'],stars:5,when:'1d ago',state:'reply',txt:'Had a water issue sorted within the hour. Super responsive team.',draft:'Thank you, James! Our team takes pride in fast fixes — it was a pleasure hosting you.'},
    {av:'ML',guest:'Marie L.',prop:'GBH-B4',ch:['Airbnb','#e08e89'],stars:5,when:'2d ago',state:'replied',txt:'Spotless on arrival — best cleaned villa we’ve stayed in.',draft:''},
    {av:'PS',guest:'Priya & Sam',prop:'RC-7',ch:['Airbnb','#e08e89'],stars:4,when:'1w ago',state:'replied',txt:'Lovely and clean, table was a bit high for the kids — fixed same day.',draft:''},
  ];
  const segs=[['reply','Needs reply',3],['replied','Replied',2],['low','Low ratings',1],['all','All',5]];
  const shown=all.filter(r=> seg==='all' || (seg==='low'? r.stars<=3 : r.state===seg));
  return (<>
    <div className="fbar" style={{marginTop:4}}><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft"><b>Friday.</b> 3 reviews need a reply — I drafted on-brand responses in each guest’s language. Approve individually or bulk-approve the 5-stars.</span><span className="fb"><button className="dbtn primary sm" onClick={()=>T('Approved & posted 1 reply','green')}>Approve 5-stars</button></span></div>
    <div className="row between" style={{margin:'14px 0 8px'}}>
      <span className="vseg">{segs.map(s=><span key={s[0]} className={"vs"+(seg===s[0]?' on':'')} onClick={()=>setSeg(s[0])}>{s[1]} <span className="mono" style={{opacity:.6,fontSize:10}}>{s[2]}</span></span>)}</span>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {shown.map((r,i)=>(
        <div key={i} className="panel" style={{padding:'13px 15px'}}>
          <div className="between" style={{alignItems:'flex-start',gap:12}}>
            <div className="row" style={{gap:11,minWidth:0}}>
              <span className="av1">{r.av}</span>
              <div style={{minWidth:0}}>
                <div className="row" style={{gap:8,flexWrap:'wrap'}}><span className="tt" style={{fontSize:13.5}}>{r.guest}</span><span className="pcodeD">{r.prop}</span><span className="row" style={{gap:5,fontSize:11.5}}><span className="mdot" style={{background:r.ch[1],width:8,height:8,borderRadius:3}}/>{r.ch[0]}</span><span className="mono" style={{color:r.stars<3?'var(--red)':'var(--amber)',fontSize:12}}>{'★'.repeat(r.stars)}<span style={{color:'var(--tx-4)'}}>{'★'.repeat(5-r.stars)}</span></span></div>
                <div style={{fontSize:13,lineHeight:1.55,marginTop:7}}>“{r.txt}”</div>
              </div>
            </div>
            <span className="faint mono" style={{fontSize:10,whiteSpace:'nowrap'}}>{r.when}</span>
          </div>
          {r.state==='reply' ? (
            <div className="ibdraft" style={{marginTop:11}}><div className="ibdraft-tag" style={{marginBottom:7}}><span className="bdg indigo"><DI n="spark" s={1.5}/> Friday reply draft</span></div>{r.draft}
              <div className="ibcomp-actions" style={{marginTop:9}}><button className="dbtn primary sm" onClick={()=>T('Reply posted to '+r.ch[0],'green')}><DI n="check" s={2}/> Approve &amp; post</button><button className="dbtn ghost sm" onClick={()=>T('Editing reply')}>Edit</button><button className="dbtn ghost sm" onClick={()=>T('Skipped')}>Skip</button></div>
            </div>
          ) : <div className="afdone" style={{marginTop:10}}><DI n="check" s={2}/> Replied · posted to {r.ch[0]}</div>}
        </div>
      ))}
    </div>
  </>);
}

/* Reviews — staff performance attribution */
function ReviewsStaff(){
  const staff=[
    {av:'IA',nm:'Ishant Ayadassen',role:'Field · West',n:23,avg:4.8,trend:'+0.2',top:'fast maintenance'},
    {av:'BR',nm:'Bryan Ramluckun',role:'Field · North',n:19,avg:4.6,trend:'+0.1',top:'spotless turnovers'},
    {av:'CA',nm:'Catherine Appadoo',role:'Field · North',n:17,avg:4.9,trend:'+0.3',top:'warm welcome'},
    {av:'MD',nm:'Mathias Duval',role:'Field · North',n:11,avg:4.4,trend:'−0.1',top:'thorough'},
  ];
  return (<>
    <div className="fbar" style={{marginTop:4}}><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft"><b>Friday.</b> Reviews are attributed to whoever did the turnover or maintenance on that stay. Catherine leads at 4.9 — guests repeatedly mention her welcome. Mathias dipped 0.1; worth a check-in.</span></div>
    <div className="panel" style={{padding:'10px 6px',marginTop:14}}>
      <table className="tbl"><thead><tr><th>Staff</th><th>Role</th><th style={{textAlign:'right'}}>Reviews</th><th style={{textAlign:'right'}}>Avg rating</th><th style={{textAlign:'right'}}>Trend</th><th>Guests mention</th></tr></thead>
        <tbody>{staff.map((s,i)=>(<tr key={i} className="tdrow" onClick={()=>window.fadToast&&window.fadToast('Opened '+s.nm)}>
          <td><span className="row" style={{gap:8}}><span className="av1" style={{width:26,height:26,fontSize:9}}>{s.av}</span><span className="tt">{s.nm}</span></span></td>
          <td className="faint">{s.role}</td>
          <td className="mono faint" style={{textAlign:'right'}}>{s.n}</td>
          <td className="mono" style={{textAlign:'right',fontWeight:700,color:s.avg>=4.7?'var(--green)':'var(--amber)'}}>{s.avg} ★</td>
          <td className="mono" style={{textAlign:'right',color:s.trend.startsWith('−')?'var(--red)':'var(--green)'}}>{s.trend}</td>
          <td className="faint" style={{fontSize:11.5}}>“{s.top}”</td>
        </tr>))}</tbody>
      </table>
    </div>
  </>);
}

/* ---------- 20 · Analytics ---------- */
function ScreenAnalytics(){
  const DATA={
    '7d':{ rev:'€9.4k',revD:'+18% vs prior 7d',bk:'17',nights:'168 nights',occ:'84%',adr:'€68',revpar:'€48',
      trend:[60,72,55,80,68,74,90], chan:[['Airbnb',10,59],['Manual',5,29],['Booking.com',1,6],['Direct',1,6]], lbl:['2026-05-23','2026-05-29'] },
    '30d':{ rev:'€40k',revD:'+1247% vs prior 30d',bk:'72',nights:'721 nights',occ:'88%',adr:'€71',revpar:'€50',
      trend:[28,62,70,88,60,54,66,72,68,58,62,64,60,76], chan:[['Airbnb',41,57],['Manual',25,35],['Booking.com',4,6],['Scraped (legacy)',2,3]], lbl:['2026-04-29','2026-05-29'] },
    '90d':{ rev:'€118k',revD:'+22% vs prior 90d',bk:'214',nights:'2,140 nights',occ:'81%',adr:'€69',revpar:'€46',
      trend:[40,52,60,72,66,70,84,78,62,58,70,80,74,88], chan:[['Airbnb',128,60],['Manual',62,29],['Booking.com',16,7],['Direct',8,4]], lbl:['2026-03-01','2026-05-29'] },
    'ytd':{ rev:'€263k',revD:'+34% vs prior year',bk:'468',nights:'4,610 nights',occ:'79%',adr:'€67',revpar:'€44',
      trend:[30,38,44,52,60,58,66,72,70,78,84,90], chan:[['Airbnb',281,60],['Manual',131,28],['Booking.com',33,7],['Direct',23,5]], lbl:['2026-01-01','2026-05-29'] },
  };
  const COL=['#e08e89','#9fb4ee','#6cc79c','var(--tx-3)'];
  const [range,setRange]=React.useState('30d');
  const [open,setOpen]=React.useState(false);
  const [atab,setAtab]=React.useState('Overview');
  const d=DATA[range];
  const top=[['RC-15','Mountain View Penthouse','9','47','100%','€4.7k'],['RC-16','Sea View Penthouse','7','50','100%','€5.7k'],['GBH-C5','Apt · Pool & Gym','5','42','100%','€1.9k'],['LB-C','3-Villa Complex','4','30','100%','€9.2k'],['SD-10','Beachfront · Sea View','4','37','100%','€2.7k']];
  const RL={'7d':'Last 7 days','30d':'Last 30 days','90d':'Last 90 days','ytd':'Year to date'};
  const T=t=>window.fadToast&&window.fadToast(t);
  return (
    <Shell active="an" eyebrow="ANALYTICS" title="Analytics" sub="Portfolio dashboards · scan-first · data across every module"
      tabs={['Overview','Revenue','Occupancy','Channels','Reviews','Team','Margin'].map(l=>({l,on:atab===l,fn:()=>setAtab(l)}))}
      actions={<><span className="aichip" style={{position:'relative'}} onClick={()=>setOpen(o=>!o)}>{RL[range]} <DI n="chevD" s={2} style={{width:11,height:11}}/>
        {open && <div className="tdmenu" style={{minWidth:150}} onClick={e=>e.stopPropagation()}>{Object.keys(RL).map(k=><div key={k} className="tdmenu-it" onClick={()=>{setRange(k);setOpen(false);T('Range: '+RL[k]);}}><span style={{fontSize:12.5}}>{RL[k]}</span></div>)}</div>}
      </span><button className="dbtn ghost" onClick={()=>T('Exporting analytics PDF\u2026')}><DI n="doc" s={1.8}/> Export PDF</button></>}>
      <div className="grid4">
        <div className="statc"><div className="n">{d.rev}</div><div className="l" style={{color:'var(--green)'}}>{d.revD}</div></div>
        <div className="statc"><div className="n">{d.bk}</div><div className="l">Bookings · {d.nights}</div></div>
        <div className="statc"><div className="n">{d.occ}</div><div className="l">Paid occupancy</div></div>
        <div className="statc"><div className="n">{d.adr}</div><div className="l">ADR · RevPAR {d.revpar}</div></div>
      </div>
      {atab==='Overview' && <>
      <div className="dtwocol" style={{marginTop:14,display:'grid',gridTemplateColumns:'1.6fr 1fr',gap:14}}>
        <div className="panel">
          <div className="dml" style={{margin:'0 0 12px'}}>Revenue trend · {RL[range].toLowerCase()}<span className="rule"/></div>
          <div className="row" style={{gap:5,alignItems:'flex-end',height:150}}>{d.trend.map((t,i)=><div key={range+i} style={{flex:1,height:t+'%',background:'linear-gradient(180deg,var(--indigo-bright),var(--indigo))',borderRadius:'3px 3px 0 0',opacity:.55+t/250,animation:'barGrow .5s cubic-bezier(.2,.7,.3,1)',transformOrigin:'bottom'}}/>)}</div>
          <div className="row between faint mono" style={{fontSize:9,marginTop:6}}><span>{d.lbl[0]}</span><span>{d.lbl[1]}</span></div>
        </div>
        <div className="panel">
          <div className="dml" style={{margin:'0 0 10px'}}>Channel mix<span className="rule"/></div>
          {d.chan.map((c,i)=>(<div key={i} className="row between" style={{padding:'8px 0',borderBottom:i<d.chan.length-1?'1px solid var(--line-2)':'none'}}><span className="row" style={{gap:8,fontSize:12.5}}><span className="mdot" style={{background:COL[i],width:8,height:8,borderRadius:3}}/>{c[0]}</span><span className="row" style={{gap:12}}><span className="mono faint" style={{fontSize:11}}>{c[1]}</span><span className="mono" style={{fontSize:12,fontWeight:600,width:34,textAlign:'right'}}>{c[2]}%</span></span></div>))}
        </div>
      </div>
      <div className="panel" style={{marginTop:14,padding:'12px 6px'}}>
        <div className="dml" style={{margin:'2px 12px 6px'}}>Top properties by bookings<span className="rule"/></div>
        <table className="tbl"><thead><tr><th>Property</th><th>Listing</th><th style={{textAlign:'right'}}>Bookings</th><th style={{textAlign:'right'}}>Nights</th><th style={{textAlign:'right'}}>Occ</th><th style={{textAlign:'right'}}>Revenue</th></tr></thead>
        <tbody>{top.map((t,i)=>(<tr key={i} className="tdrow" onClick={()=>window.FADGO('property')}><td><span className="pcodeD">{t[0]}</span></td><td className="faint" style={{fontSize:11.5}}>{t[1]}</td><td className="mono" style={{textAlign:'right'}}>{t[2]}</td><td className="mono faint" style={{textAlign:'right'}}>{t[3]}</td><td className="mono" style={{textAlign:'right',color:'var(--green)'}}>{t[4]}</td><td className="mono" style={{textAlign:'right',fontWeight:600}}>{t[5]}</td></tr>))}</tbody></table>
      </div>
      </>}
      {atab!=='Overview' && <AnalyticsPane tab={atab} d={d} RL={RL} range={range} top={top} COL={COL}/>}
    </Shell>
  );
}

function AnalyticsPane({tab,d,RL,range,top,COL}){
  const T=t=>window.fadToast&&window.fadToast(t);
  if(tab==='Revenue'){
    const lines=[['Gross booking value',d.rev],['Channel commission (~15%)','−'+(parseFloat(d.rev.replace(/[€k]/g,''))*0.15).toFixed(1)+'k'],['Cleaning & turnover recovered','+€'+(parseFloat(d.rev.replace(/[€k]/g,''))*0.08).toFixed(1)+'k'],['Tourist tax collected','€'+(parseFloat(d.rev.replace(/[€k]/g,''))*0.07).toFixed(1)+'k'],['Net to owners',d.rev]];
    return (<>
      <div className="panel" style={{marginTop:14}}>
        <div className="dml" style={{margin:'0 0 12px'}}>Revenue trend · {RL[range].toLowerCase()}<span className="rule"/></div>
        <div className="row" style={{gap:5,alignItems:'flex-end',height:190}}>{d.trend.map((t,i)=><div key={range+i} style={{flex:1,height:t+'%',background:'linear-gradient(180deg,var(--indigo-bright),var(--indigo))',borderRadius:'3px 3px 0 0',opacity:.55+t/250,animation:'barGrow .5s cubic-bezier(.2,.7,.3,1)',transformOrigin:'bottom'}}/>)}</div>
        <div className="row between faint mono" style={{fontSize:9,marginTop:6}}><span>{d.lbl[0]}</span><span>{d.lbl[1]}</span></div>
      </div>
      <div className="dtwocol" style={{marginTop:14,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>Revenue bridge · {RL[range].toLowerCase()}<span className="rule"/></div>
          {lines.map((l,i)=>(<div key={i} className="between" style={{padding:'11px 2px',borderBottom:i<lines.length-1?'1px solid var(--line-2)':'none'}}><span style={{fontSize:12.5,fontWeight:i===lines.length-1?700:400}}>{l[0]}</span><span className="mono" style={{fontWeight:i===lines.length-1?700:500}}>{l[1]}</span></div>))}
        </div>
        <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>Rate metrics<span className="rule"/></div>
          <div className="grid2" style={{marginTop:8}}>
            <div className="statc"><div className="n">{d.adr}</div><div className="l">ADR</div></div>
            <div className="statc"><div className="n">{d.revpar}</div><div className="l">RevPAR</div></div>
            <div className="statc"><div className="n">{d.occ}</div><div className="l">Paid occupancy</div></div>
            <div className="statc green"><div className="n">{d.revD.split(' ')[0]}</div><div className="l">vs prior period</div></div>
          </div>
        </div>
      </div>
      <div className="fbar" style={{marginTop:14}}><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft"><b>Friday.</b> ADR is holding at {d.adr} while occupancy climbs — the channel mix is healthy. Pushing direct bookings 5pts would add roughly €2.4k/mo in recovered commission.</span><span className="fb"><button className="dbtn sm" onClick={()=>window.FADGO('marketing')}>Direct-book plan</button></span></div>
    </>);
  }
  if(tab==='Occupancy'){
    const occ=[['RC-15','Mountain View Penthouse',100],['RC-16','Sea View Penthouse',100],['GBH-C5','Apt · Pool & Gym',100],['SD-10','Beachfront · Sea View',96],['VA-3','Villa Sud',78],['LB-2','Hillside Studio',74],['KS-5','Garden Suite',71]];
    return (<>
      <div className="grid4" style={{marginTop:14}}>
        <div className="statc"><div className="n">{d.occ}</div><div className="l">Portfolio occupancy</div></div>
        <div className="statc green"><div className="n">3</div><div className="l">At 100% · sold out</div></div>
        <div className="statc amber"><div className="n">3</div><div className="l">Below 80% target</div></div>
        <div className="statc"><div className="n">{d.nights}</div><div className="l">Booked nights</div></div>
      </div>
      <div className="panel" style={{marginTop:14}}>
        <div className="dml" style={{margin:'0 0 12px'}}>Occupancy by property · {RL[range].toLowerCase()}<span className="rule"/></div>
        {occ.map((o,i)=>(<div key={i} className="row" style={{gap:10,marginBottom:11}}><span className="pcodeD" style={{width:62}}>{o[0]}</span><span className="faint" style={{width:150,fontSize:11.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{o[1]}</span><span style={{flex:1,height:8,borderRadius:4,background:'var(--card-2)',overflow:'hidden'}}><i style={{display:'block',height:'100%',width:o[2]+'%',background:o[2]>=80?'var(--green)':'var(--amber)',borderRadius:4}}/></span><span className="mono" style={{width:42,textAlign:'right',fontSize:12,fontWeight:600,color:o[2]>=80?'var(--green)':'var(--amber)'}}>{o[2]}%</span></div>))}
      </div>
      <div className="fbar" style={{marginTop:14}}><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft"><b>Friday.</b> KS-5, LB-2 and VA-3 are dragging the average. Two are on owners up for renewal — a small rate cut on midweek nights could lift them above target before the renewal conversation.</span></div>
    </>);
  }
  if(tab==='Channels'){
    return (<>
      <div className="dtwocol" style={{marginTop:14,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <div className="panel"><div className="dml" style={{margin:'0 0 10px'}}>Channel mix · bookings<span className="rule"/></div>
          {d.chan.map((c,i)=>(<div key={i} className="row" style={{gap:10,marginBottom:10}}><span style={{width:110,fontSize:12.5}}><span className="mdot" style={{background:COL[i],width:8,height:8,borderRadius:3,marginRight:7}}/>{c[0]}</span><span style={{flex:1,height:8,borderRadius:4,background:'var(--card-2)',overflow:'hidden'}}><i style={{display:'block',height:'100%',width:c[2]+'%',background:COL[i],borderRadius:4}}/></span><span className="mono" style={{width:48,textAlign:'right',fontSize:12,fontWeight:600}}>{c[2]}%</span></div>))}
        </div>
        <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>Commission cost by channel<span className="rule"/></div>
          <table className="tbl"><thead><tr><th>Channel</th><th style={{textAlign:'right'}}>Rate</th><th style={{textAlign:'right'}}>Est. fee</th></tr></thead>
            <tbody>{[['Airbnb','15%','€5.9k'],['Booking.com','17%','€1.2k'],['Manual / Direct','0%','€0'],['Vrbo','8%','€0']].map((r,i)=>(<tr key={i}><td className="tt">{r[0]}</td><td className="mono faint" style={{textAlign:'right'}}>{r[1]}</td><td className="mono" style={{textAlign:'right',fontWeight:600,color:r[2]==='€0'?'var(--green)':'var(--tx)'}}>{r[2]}</td></tr>))}</tbody>
          </table>
          <div className="faint mono" style={{fontSize:10,marginTop:8}}>Direct share grows margin — every point shifted from Airbnb saves ~15%.</div>
        </div>
      </div>
      <div className="fbar" style={{marginTop:14}}><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft"><b>Friday.</b> Airbnb drives 60% of bookings but ~€5.9k/period in commission. A returning-guest direct-book nudge is your highest-ROI margin lever.</span><span className="fb"><button className="dbtn sm" onClick={()=>window.FADGO('marketing')}>Draft nudge</button></span></div>
    </>);
  }
  if(tab==='Reviews'){
    return (<>
      <div className="grid4" style={{marginTop:14}}>
        <div className="statc"><div className="n">4.56</div><div className="l" style={{color:'var(--red)'}}>−0.33 vs prior 30d</div></div>
        <div className="statc"><div className="n">9</div><div className="l">Reviews · 30d</div></div>
        <div className="statc amber"><div className="n">100</div><div className="l">Unreplied</div></div>
        <div className="statc"><div className="n">4.76</div><div className="l">Airbnb avg · 82 reviews</div></div>
      </div>
      <div className="fbar" style={{marginTop:14}}><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft"><b>Friday.</b> Reply-rate is hurting ranking — 100 reviews are unreplied. Drafts are ready in the Reviews module.</span><span className="fb"><button className="dbtn sm primary" onClick={()=>window.FADGO('rev')}>Open Reviews</button></span></div>
    </>);
  }
  if(tab==='Team'){
    const team=[['IA','Ishant Ayadassen','West',64,'96%',4.8],['BR','Bryan Ramluckun','North',58,'94%',4.6],['CA','Catherine Appadoo','North',47,'98%',4.9],['MD','Mathias Duval','North',31,'90%',4.4]];
    return (<>
      <div className="grid4" style={{marginTop:14}}>
        <div className="statc"><div className="n">180</div><div className="l">Jobs completed · 30d</div></div>
        <div className="statc green"><div className="n">95%</div><div className="l">On-time rate</div></div>
        <div className="statc"><div className="n">2.1h</div><div className="l">Avg job duration</div></div>
        <div className="statc"><div className="n">4.7 ★</div><div className="l">Guest-attributed rating</div></div>
      </div>
      <div className="panel" style={{marginTop:14,padding:'10px 6px'}}>
        <div className="dml" style={{margin:'2px 12px 6px'}}>Field productivity · 30d<span className="rule"/></div>
        <table className="tbl"><thead><tr><th>Staff</th><th>Zone</th><th style={{textAlign:'right'}}>Jobs</th><th style={{textAlign:'right'}}>On-time</th><th style={{textAlign:'right'}}>Rating</th></tr></thead>
          <tbody>{team.map((s,i)=>(<tr key={i} className="tdrow" onClick={()=>window.FADGO('hr')}><td><span className="row" style={{gap:8}}><span className="av1" style={{width:24,height:24,fontSize:8}}>{s[0]}</span><span className="tt">{s[1]}</span></span></td><td className="faint">{s[2]}</td><td className="mono" style={{textAlign:'right'}}>{s[3]}</td><td className="mono" style={{textAlign:'right',color:'var(--green)'}}>{s[4]}</td><td className="mono" style={{textAlign:'right',fontWeight:600,color:s[5]>=4.7?'var(--green)':'var(--amber)'}}>{s[5]} ★</td></tr>))}</tbody>
        </table>
      </div>
    </>);
  }
  if(tab==='Margin'){
    const cats=[['Cleaning & turnover','Rs 84,200',40],['Maintenance & repairs','Rs 62,100',30],['Supplies & consumables','Rs 31,400',15],['Utilities recharged','Rs 18,700',9],['Other opex','Rs 11,992',6]];
    return (<>
      <div className="grid4" style={{marginTop:14}}>
        <div className="statc"><div className="n">€166k</div><div className="l">Gross revenue</div></div>
        <div className="statc"><div className="n">Rs 208k</div><div className="l">Operating expenses</div></div>
        <div className="statc green"><div className="n">62%</div><div className="l">Net margin</div></div>
        <div className="statc"><div className="n">€2.6k</div><div className="l">Avg mgmt fee / unit</div></div>
      </div>
      <div className="panel" style={{marginTop:14}}>
        <div className="dml" style={{margin:'0 0 12px'}}>Operating expense breakdown · this period<span className="rule"/></div>
        {cats.map((c,i)=>(<div key={i} className="row" style={{gap:10,marginBottom:11}}><span style={{width:190,fontSize:12.5}}>{c[0]}</span><span style={{flex:1,height:8,borderRadius:4,background:'var(--card-2)',overflow:'hidden'}}><i style={{display:'block',height:'100%',width:c[2]+'%',background:'linear-gradient(90deg,var(--indigo-bright),var(--indigo))',borderRadius:4}}/></span><span className="mono" style={{width:90,textAlign:'right',fontSize:11.5,fontWeight:600}}>{c[1]}</span></div>))}
      </div>
      <div className="fbar" style={{marginTop:14}}><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft"><b>Friday.</b> Maintenance is 30% of opex this period — driven by the LC-9 roof and BL-12 retile. Excluding those one-offs, margin would be 68%.</span></div>
    </>);
  }
  return null;
}

/* ---------- 21 · HR ---------- */
function ScreenHR(){
  const staff=[['BH','Bryan Henri','Field · north','active','0'],['CH','Catherine Henri','Field · north','active','1'],['FH','Franny Henri','Ops Manager · north','active','—'],['IA','Ishant Ayadassen','Director · west','active','—'],['MO','Mary Oladimeji','Commercial & Mktg','active','—'],['MD','Mathias Duval','Commercial · north','active','—']];
  return (
    <Shell active="ppl" eyebrow="PEOPLE · HR" title="HR" sub="Staff · time-off · stats · permissions"
      tabs={[{l:'Staff',ct:6,on:true},{l:'Time-off',ct:1},{l:'Stats'},{l:'Insights'},{l:'Permissions'}]}
      actions={<button className="dbtn primary"><DI n="plus" s={2}/> Add staff</button>}>
      <div className="grid4">
        <div className="statc"><div className="n">18</div><div className="l">Team members</div></div>
        <div className="statc green"><div className="n">4</div><div className="l">On shift now</div></div>
        <div className="statc amber"><div className="n">1</div><div className="l">Time-off pending</div></div>
        <div className="statc"><div className="n">2</div><div className="l">Open positions</div></div>
      </div>
      <div className="row" style={{gap:7,flexWrap:'wrap',margin:'16px 0 8px'}}><span className="vseg"><span className="vs on">Active</span><span className="vs">Departing</span><span className="vs">Archived</span></span><span className="aichip ai">All roles</span><span className="aichip">Field</span><span className="aichip">Ops</span></div>
      <div className="panel" style={{padding:'12px 6px'}}>
        <table className="tbl"><thead><tr><th>Name</th><th>Role</th><th>Status</th><th style={{textAlign:'right'}}>Open tasks</th><th></th></tr></thead>
        <tbody>{staff.map((s,i)=>(<tr key={i} className="tdrow" onClick={()=>window.FADTASK&&window.FADTASK.openStaff({av:s[0],name:s[1],role:s[2],status:'active',zone:s[2].split('· ')[1]||'north',tasks:s[4]==='—'?null:+s[4],load:['64%','52%','—','—','—','—'][i]})}><td><span className="row" style={{gap:8}}><span className="av1" style={{width:26,height:26,fontSize:9}}>{s[0]}</span><span className="tt">{s[1]}</span></span></td><td className="faint">{s[2]}</td><td><span className="bdg green dot">Active</span></td><td className="mono" style={{textAlign:'right',color:s[4]!=='0'&&s[4]!=='—'?'var(--amber)':'var(--tx-3)'}}>{s[4]}</td><td style={{textAlign:'right'}}><button className="dbtn sm ghost">View</button></td></tr>))}</tbody></table>
      </div>
      <div className="dml" style={{marginTop:18}}>Time-off requests <span className="ct">queue · 3 pending</span><span className="rule"/></div>
      <LeaveQueue/>
    </Shell>
  );
}
function LeaveQueue(){
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const init=[
    {who:'Catherine Henri',av:'CH',type:'Annual leave',dates:'12–14 Jun · 3 days',cover:'Mathias on West',ok:true,state:'pending'},
    {who:'Bryan Henri',av:'BH',type:'Sick leave',dates:'31 May · 1 day',cover:'No cover on North — gap',ok:false,state:'pending'},
    {who:'Mathias Duval',av:'MD',type:'Annual leave',dates:'24–28 Jun · 5 days',cover:'Bryan + Catherine on North',ok:true,state:'pending'},
  ];
  const [rows,setRows]=React.useState(init);
  const set=(i,state)=>setRows(r=>r.map((x,k)=>k===i?{...x,state}:x));
  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {rows.map((r,i)=>(
        <div key={i} className="panel" style={{padding:'12px 14px',opacity:r.state==='pending'?1:.6}}>
          <div className="between">
            <div className="row" style={{gap:11,minWidth:0}}>
              <span className="av1">{r.av}</span>
              <div style={{minWidth:0}}>
                <div className="row" style={{gap:8}}><span className="tt" style={{fontSize:13.5}}>{r.who}</span><span className="bdg gray">{r.type}</span></div>
                <div className="faint mono" style={{fontSize:10.5,marginTop:3}}>{r.dates}</div>
                <div className="row" style={{gap:5,marginTop:5,fontSize:11}}><span className={"adot "+(r.ok?'ok':'rev')}/><span style={{color:r.ok?'var(--tx-2)':'var(--red)'}}>Coverage: {r.cover}</span></div>
              </div>
            </div>
            {r.state==='pending'
              ? <span className="row" style={{gap:7,flex:'0 0 auto'}}><button className="dbtn green sm" onClick={()=>{set(i,'approved');T('Leave approved','green');}}><DI n="check" s={2}/> Approve</button><button className="dbtn ghost sm" onClick={()=>{set(i,'declined');T('Leave declined');}}>Decline</button></span>
              : <span className={"bdg "+(r.state==='approved'?'green':'gray')+" dot"}>{r.state}</span>}
          </div>
          {!r.ok && r.state==='pending' && <div className="gate" style={{borderStyle:'solid',marginTop:10}}><DI n="alert" s={1.6} style={{color:'var(--amber)',flex:'0 0 auto'}}/><span><b>Friday:</b> approving this leaves North uncovered on 31 May. I can pull Mathias from standby — want me to draft the swap?</span></div>}
        </div>
      ))}
    </div>
  );
}

/* ---------- 17 · Finance (overview / period close) ---------- */
function FinanceCloseWizard({ start, onClose }){
  const STEPS=[
    {t:'Pre-flight checks',d:'Confirm all field reports are vetted and no captures are stuck in review.',body:[['Unvetted reports','0','ok'],['Receipts pending OCR','0','ok'],['Float cards reconciled','6 / 6','ok']]},
    {t:'FX rate lock',d:'Lock the EUR↔MUR rate used for this period\u2019s owner payouts.',body:[['Period rate (EUR→MUR)','48.62','ok'],['Source','Bank of Mauritius · 27 Apr','ok'],['Variance vs March','+0.4%','ok']]},
    {t:'Bank reconciliation',d:'Match platform payouts and card settlements to the bank feed.',body:[['Airbnb payouts matched','41 / 41','ok'],['Booking.com matched','18 / 18','ok'],['Unmatched lines','0','ok']]},
    {t:'Revenue reconciliation',d:'Reconcile gross booking value against recognised revenue.',body:[['Bookings recognised','72','ok'],['Discounts absorbed','Rs 1,250','warn'],['Fare-collapse splits','2','warn']]},
    {t:'Per-property roll-up',d:'Confirm each property\u2019s net before owner statements generate.',body:[['Properties rolled up','27 / 27','ok'],['Below-target flags','3','warn'],['Manual adjustments','1','warn']]},
    {t:'Tourist tax',d:'Generate and reconcile the MRA tourist-tax remittance.',body:[['Nights taxable','721','ok'],['Tax owed','€11,847','warn'],['MRA packet','Generated','ok']]},
    {t:'P&L preview',d:'Review the period P&L before locking.',body:[['Gross revenue','€166,074','ok'],['Expenses posted','Rs 208,392','ok'],['Net margin','62%','ok']]},
    {t:'Lock + post',d:'Lock the period, post to the ledger, and release the 38 owner statements.',body:[['Owner statements','38 ready','ok'],['Ledger entries','posted on lock','ok'],['Reopen','requires admin','warn']]},
  ];
  const [i,setI]=React.useState(start||0);
  const s=STEPS[i], last=i===STEPS.length-1;
  const T=t=>window.fadToast&&window.fadToast(t,'green');
  return (
    <>
      <div className="tdscrim" onClick={onClose}/>
      <div className="wiz" role="dialog" aria-label="Period close">
        <div className="wiz-side">
          <div className="wiz-eyebrow"><DI n="coin" s={1.6}/> PERIOD CLOSE</div>
          <div className="wiz-title">April 2026</div>
          <div className="wiz-steps">
            {STEPS.map((st,k)=>(
              <div key={k} className={"wiz-step"+(k===i?' on':'')+(k<i?' done':'')} onClick={()=>k<=i&&setI(k)}>
                <span className="ws-dot">{k<i?<DI n="check" s={3}/>:k+1}</span>
                <span>{st.t}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="wiz-main">
          <div className="between" style={{marginBottom:4}}>
            <span className="faint mono" style={{fontSize:10}}>STEP {i+1} OF {STEPS.length}</span>
            <span className="icbtn" style={{cursor:'pointer'}} onClick={onClose}><DI n="x" s={2}/></span>
          </div>
          <h2 className="wiz-h">{s.t}</h2>
          <p className="wiz-d">{s.d}</p>
          <div className="wiz-prog"><i style={{width:((i+1)/STEPS.length*100)+'%'}}/></div>
          <div className="panel" style={{padding:'4px 14px',marginTop:16}}>
            {s.body.map((b,k)=>(
              <div key={k} className="drow"><span className="faint">{b[0]}</span><span className="row" style={{gap:8}}><span className="mono" style={{color:b[2]==='warn'?'var(--amber)':'var(--tx)'}}>{b[1]}</span><span className={"adot "+(b[2]==='warn'?'rev':'ok')}/></span></div>
            ))}
          </div>
          {s.body.some(b=>b[2]==='warn') && <div className="fbar" style={{marginTop:12}}><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft" style={{fontSize:11.5}}><b>Friday.</b> The flagged items are explained and within tolerance — safe to continue, or open them first.</span></div>}
          <div className="wiz-foot">
            {i>0 && <button className="dbtn ghost" onClick={()=>setI(i-1)}><DI n="chevL" s={2}/> Back</button>}
            <span className="grow"/>
            {last
              ? <button className="dbtn green" onClick={()=>{T('Period locked · 38 statements released');onClose();}}><DI n="lock" s={1.8}/> Lock + post</button>
              : <button className="dbtn primary" onClick={()=>{setI(i+1);}}><DI n="check" s={2}/> Mark complete &amp; continue</button>}
          </div>
        </div>
      </div>
    </>
  );
}
function ScreenFinance(){
  const [wiz,setWiz]=React.useState(null);
  const brief=[
    ['red','COMPLIANCE','MRA tourist-tax window opens in 8 days','€11,847 unremitted across 7 months. Friday auto-generated the registration packet — Mary files before May 5 to avoid late-filing penalty stacking.'],
    ['amber','APPROVAL URGENCY','3 medium-tier approvals expire in <24h','Climate Tech · Aqua Plumbing · Pereybere Hardware (LC-9 roof). Deemed-approval fires automatically — nudge personally if you want a look first.'],
    ['amber','ANOMALY','Pereybere Hardware: 6 captures in 14 days','40% above the 90-day baseline. All LC-9. Likely April storm damage — flagging because the pattern broke, not because it\u2019s wrong.'],
    ['indigo','FORECAST','April expenses tracking 12% over March','Drivers: BL-12 retile (Rs 43k urgent) + LC-9 roof (pending Rs 22.5k). Excluding those two, the period is on baseline.'],
    ['red','REFUND RISK','Wilson M. has 2 prior refund attempts this year','Reservation r-2026-1192 — already requested a partial via Airbnb resolution centre. Pattern matches abuse-likely cohort.'],
    ['amber','CASHFLOW','Bryan\u2019s float card below 40% of target','Rs 1,847 left vs Rs 5,000 target. Top up before next week\u2019s VV-47 work to avoid him fronting personally.'],
  ];
  const tone={red:'var(--red)',amber:'var(--amber)',indigo:'var(--indigo)'};
  const steps=[['Pre-flight','done'],['FX rate','done'],['Bank recon','done'],['Revenue recon','done'],['Per-property','now'],['Tourist tax','todo'],['P&L preview','todo'],['Lock + post','todo']];
  const appr=[['Climate Tech Ltd','FR-REP','VV-47 · Aircon compressor failure','Rs 12,500','owner'],['Aqua Plumbing','FR-REP','PT-3 · Water heater leak + service','Rs 8,700','owner'],['Pereybere Hardware','FR-REP','LC-9 · Roof tile replacement','Rs 225,000','major'],['Pereybere Hardware','FR-MAI','PT-3 · Fence post + cement','Rs 785','owner'],['Aqua Plumbing','FR-REP','VV-47 · Tap replacement, en-suite','Rs 2,450','owner']];
  const T=t=>window.fadToast&&window.fadToast(t);
  return (
    <Shell active="fin" eyebrow="FINANCE" title="Overview" sub="April 2026 · period closing"
      tabs={[{l:'Overview',on:true},{l:'Transactions'},{l:'Approvals',ct:5},{l:'Owner statements'},{l:'Tourist tax'},{l:'P&L'},{l:'Float ledger'}]}
      actions={<><span className="aichip">ADMIN · Admin <DI n="chevD" s={2} style={{width:11,height:11}}/></span><button className="dbtn ghost" onClick={()=>setWiz(0)}>Close period</button><button className="dbtn primary" onClick={()=>T('Capture expense — scan a receipt')}><DI n="plus" s={2}/> Capture expense</button></>}>
      <div className="fai" style={{padding:'13px 15px'}}>
        <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday brief</span><span className="faint mono" style={{fontSize:10}}>2 urgent · 3 notice · 1 info · refreshed just now</span></div>
        <div className="grid3" style={{marginTop:12,gap:10}}>
          {brief.map((b,i)=>(
            <div key={i} className="panel tap" style={{padding:'11px 13px',borderLeft:'3px solid '+tone[b[0]],cursor:'pointer'}} onClick={()=>T('Opened source · '+b[1])}>
              <div className="row between"><span className="faint mono" style={{fontSize:9,letterSpacing:'.1em',color:tone[b[0]]}}><span className="mdot" style={{background:tone[b[0]],width:6,height:6,marginRight:5}}/>{b[1]}</span><span className="faint" style={{fontSize:9.5}}>Open source ↗</span></div>
              <div style={{fontWeight:600,fontSize:13,margin:'6px 0 4px'}}>{b[2]}</div>
              <div className="faint" style={{fontSize:11,lineHeight:1.5}}>{b[3]}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid4" style={{marginTop:14}}>
        <div className="statc"><div className="n">€166,074</div><div className="l">Payouts this period</div>{window.FADSTATE&&<div style={{marginTop:6}}><window.FADSTATE.SourceTag kind="guesty" note="Guesty accounting truth"/></div>}</div>
        <div className="statc"><div className="n">Rs 208,392</div><div className="l">Expenses posted</div>{window.FADSTATE&&<div style={{marginTop:6}}><window.FADSTATE.SourceTag kind="friday" note="FAD ledger"/></div>}</div>
        <div className="statc amber"><div className="n">5</div><div className="l">Pending approvals</div>{window.FADSTATE&&<div style={{marginTop:6}}><window.FADSTATE.SourceTag kind="friday" note="awaiting approval"/></div>}</div>
        <div className="statc red"><div className="n">€11,847</div><div className="l">Tourist tax owed</div>{window.FADSTATE&&<div style={{marginTop:6}}><window.FADSTATE.SourceTag kind="modeled" note="forecast remittance"/></div>}</div>
      </div>
      <div className="panel" style={{marginTop:14}}>
        <div className="row between"><div className="dml" style={{margin:0,flex:1}}>Open reconciliation items <span className="ct">5</span><span className="rule"/></div><button className="dbtn sm ghost" onClick={()=>T('Moved to period close')}>Resolve in period close</button></div>
        <div className="row" style={{gap:7,flexWrap:'wrap',margin:'10px 0'}}><span className="aichip">Resolution-centre sync · 1</span><span className="aichip">Special-offer fare collapse · 2</span><span className="aichip">Reservation change refund · 1</span><span className="aichip">Platform discount absorbed · 1</span></div>
        <table className="tbl"><tbody>
          <tr><td className="mono faint">r-2026-1192</td><td className="tt">Hugo Meunier</td><td><span className="pcodeD">PT-3</span></td><td className="faint">Platform discount absorbed</td><td className="mono" style={{textAlign:'right',fontWeight:600}}>Rs 1,250</td></tr>
          <tr><td className="mono faint">r-2026-1199</td><td className="tt">Wei Chen</td><td><span className="pcodeD">GBH-C8</span></td><td className="faint">Special-offer fare collapse</td><td className="mono" style={{textAlign:'right',color:'var(--amber)'}}>split only</td></tr>
          <tr><td className="mono faint">r-2026-1188</td><td className="tt">Eleanor Dray</td><td><span className="pcodeD">VV-47</span></td><td className="faint">Resolution-centre sync</td><td className="mono" style={{textAlign:'right',fontWeight:600}}>Rs 8,000</td></tr>
        </tbody></table>
      </div>
      <div className="dtwocol" style={{marginTop:14,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <div className="panel">
          <div className="row between"><div className="dml" style={{margin:0}}>Period close — April 2026<span className="rule"/></div><button className="dbtn sm" onClick={()=>setWiz(4)}>Resume close</button></div>
          <div className="faint mono" style={{fontSize:10,margin:'2px 0 12px'}}>Locked by Mary · 2026-04-27 14:32</div>
          {steps.map((s,i)=>(
            <div key={i} className="row" style={{gap:11,padding:'8px 0',borderBottom:i<steps.length-1?'1px solid var(--line-2)':'none'}}>
              <span className="faint mono" style={{fontSize:10,width:14}}>{i+1}</span>
              <span style={{width:18,height:18,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:s[1]==='done'?'var(--green-ghost)':s[1]==='now'?'var(--indigo-ghost)':'var(--card-2)',color:s[1]==='done'?'var(--green)':s[1]==='now'?'var(--indigo-bright)':'var(--tx-4)'}}>{s[1]==='done'?<DI n="check" s={2.6}/>:s[1]==='now'?<span style={{width:6,height:6,borderRadius:'50%',background:'var(--indigo-bright)'}}/>:''}</span>
              <span style={{fontSize:12.5,fontWeight:s[1]==='now'?600:400,color:s[1]==='todo'?'var(--tx-3)':'var(--tx)'}}>{s[0]}</span>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="row between"><div className="dml" style={{margin:0}}>Pending approvals <span className="ct">5</span><span className="rule"/></div><button className="dbtn sm ghost" onClick={()=>window.FADGO('approvals')}>Open inbox <DI n="chevR" s={2}/></button></div>
          <div style={{marginTop:6}}>
            {appr.map((a,i)=>(
              <div key={i} className="row between tdrow" style={{padding:'10px 0',borderBottom:i<appr.length-1?'1px solid var(--line-2)':'none',alignItems:'flex-start',cursor:'pointer'}} onClick={()=>T('Opened approval · '+a[0])}>
                <div style={{minWidth:0}}><div style={{fontSize:12.5,fontWeight:600}}>{a[0]} <span className="faint mono" style={{fontSize:9}}>{a[1]}</span></div><div className="faint" style={{fontSize:10.5,marginTop:2}}>{a[2]}</div></div>
                <div style={{textAlign:'right',flex:'0 0 auto',marginLeft:10}}><div className="mono" style={{fontSize:12,fontWeight:600}}>{a[3]}</div><span className={"bdg "+(a[4]==='major'?'red':'amber')} style={{marginTop:3}}>{a[4]==='major'?'MAJOR':'OWNER APPROVAL'}</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {wiz!=null && <FinanceCloseWizard start={wiz} onClose={()=>setWiz(null)}/>}
    </Shell>
  );
}

/* ---------- 12 · Guests (CRM) ---------- */
function ScreenGuests(){
  const rows=[
    ['Marie L.','GBH-B4','12','2 days ago','4.9','air',['VIP','Returning'],'Rs 318k'],
    ['Dieter K.','BW-C4','4','In-house','4.7','book',['Returning'],'Rs 196k'],
    ['James O.','SD-10','1','1 week ago','5.0','book',['New'],'Rs 33k'],
    ['The Roys','VA-3','3','In-house','4.8','dir',['Returning'],'Rs 142k'],
    ['Priya & Sam','RC-7','2','2 weeks ago','4.6','air',['Returning'],'Rs 88k'],
    ['B. Adeyemi','KS-5','6','Upcoming','4.9','book',['VIP'],'Rs 240k'],
  ];
  const ch={air:['Airbnb','#e08e89'],book:['Booking','#9fb4ee'],dir:['Direct','#6cc79c']};
  const [seg,setSeg]=React.useState('all');
  const segs=[['all','All',1240],['vip','VIP',38],['ret','Returning',412],['inh','In-house',11],['new','New',24]];
  const shown=rows.filter(r=> seg==='all' ? true : seg==='vip'?r[6].includes('VIP') : seg==='ret'?r[6].includes('Returning') : seg==='inh'?r[3]==='In-house' : r[6].includes('New'));
  const mix=[['Airbnb',52,'#e08e89'],['Booking.com',31,'#9fb4ee'],['Direct',17,'#6cc79c']];
  return (
    <Shell active="ppl" eyebrow="GUESTS" title="Guests" sub="1,240 guest profiles · synced from Guesty · CRM"
      actions={<><button className="dbtn ghost"><DI n="filter" s={2}/> Filter</button><button className="dbtn ghost" onClick={()=>window.fadToast&&window.fadToast('Exported guest list')}><DI n="doc" s={1.8}/> Export</button><button className="dbtn primary"><DI n="plus" s={2}/> Add guest</button></>}>
      <div className="grid4">
        <div className="statc"><div className="n">1,240</div><div className="l">Guest profiles</div><div className="d">+38 this month</div></div>
        <div className="statc green"><div className="n">33%</div><div className="l">Repeat-booker rate</div><div className="d">vs 28% last yr</div></div>
        <div className="statc"><div className="n">Rs 142k</div><div className="l">Avg lifetime value</div></div>
        <div className="statc amber"><div className="n">17%</div><div className="l">Direct-book share</div><div className="d">grow to cut fees</div></div>
      </div>
      <div className="fai" style={{marginTop:13}}>
        <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday · guest CRM</span></div>
        <p><b>38 VIPs</b> drive 24% of revenue. <b>412 repeat guests</b> haven't booked in 6+ months — a win-back email could recover an estimated <b>Rs 480k</b>. Direct-book share is low at 17%; nudging returning guests to book direct would save channel fees.</p>
        <div className="acts"><button className="dbtn primary sm" onClick={()=>window.FADGO('marketing')}><DI n="spark" s={1.7}/> Draft win-back campaign</button><button className="dbtn ghost sm" onClick={()=>window.fadToast&&window.fadToast('Opened VIP segment')}>View VIPs</button></div>
      </div>
      <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginTop:14}}>
        <div className="panel"><div className="dml" style={{margin:'0 0 10px'}}>Acquisition channel mix<span className="rule"/></div>
          {mix.map((m,i)=>(<div key={i} className="row" style={{gap:10,marginBottom:9}}><span style={{width:74,fontSize:12}}>{m[0]}</span><span style={{flex:1,height:8,borderRadius:4,background:'var(--card-2)',overflow:'hidden'}}><i style={{display:'block',height:'100%',width:m[1]+'%',background:m[2],borderRadius:4}}/></span><span className="mono faint" style={{width:34,textAlign:'right',fontSize:11}}>{m[1]}%</span></div>))}
        </div>
        <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>Top guests by lifetime value<span className="rule"/></div>
          <table className="tbl"><tbody>{[...rows].sort((a,b)=>parseInt(b[7].replace(/\D/g,''))-parseInt(a[7].replace(/\D/g,''))).slice(0,4).map((r,i)=>(<tr key={i} className="tdrow" onClick={()=>window.FADTASK&&window.FADTASK.openGuest({name:r[0],prop:r[1],stays:r[2],last:r[3],rating:r[4],channel:ch[r[5]][0],tags:r[6],ltv:r[7]})}><td><span className="row" style={{gap:7}}><span className="av1" style={{width:22,height:22,fontSize:8}}>{r[0].split(' ').map(w=>w[0]).slice(0,2).join('')}</span><span className="tt">{r[0]}</span></span></td><td>{r[6].includes('VIP')&&<span className="bdg amber">VIP</span>}</td><td className="mono" style={{textAlign:'right',fontWeight:600}}>{r[7]}</td></tr>))}</tbody></table>
        </div>
      </div>
      <div className="row between" style={{margin:'16px 0 8px'}}>
        <span className="vseg">{segs.map(s=><span key={s[0]} className={"vs"+(seg===s[0]?' on':'')} onClick={()=>setSeg(s[0])}>{s[1]} <span className="mono" style={{opacity:.6,fontSize:10}}>{s[2]}</span></span>)}</span>
      </div>
      <div className="panel" style={{padding:'12px 6px'}}>
        <table className="tbl">
          <thead><tr><th>Guest</th><th>Home unit</th><th style={{textAlign:'right'}}>Stays</th><th>Last stay</th><th style={{textAlign:'right'}}>Rating</th><th>Channel</th><th>Tags</th><th style={{textAlign:'right'}}>Lifetime</th></tr></thead>
          <tbody>{shown.map((r,i)=>(
            <tr key={i} className="tdrow" onClick={()=>window.FADTASK&&window.FADTASK.openGuest({name:r[0],prop:r[1],stays:r[2],last:r[3],rating:r[4],channel:ch[r[5]][0],tags:r[6],ltv:r[7]})}>
              <td><span className="row" style={{gap:7}}><span className="av1" style={{width:24,height:24,fontSize:8}}>{r[0].split(' ').map(w=>w[0]).slice(0,2).join('')}</span><span className="tt">{r[0]}</span></span></td>
              <td><span className="pcodeD">{r[1]}</span></td>
              <td className="mono" style={{textAlign:'right'}}>{r[2]}</td>
              <td className="faint" style={{fontSize:11.5}}>{r[3]}</td>
              <td className="mono" style={{textAlign:'right',color:'var(--amber)'}}>★ {r[4]}</td>
              <td><span className="row" style={{gap:6,fontSize:11.5}}><span className="mdot" style={{background:ch[r[5]][1],width:8,height:8,borderRadius:3}}/>{ch[r[5]][0]}</span></td>
              <td><span className="row" style={{gap:5}}>{r[6].map((t,k)=><span key={k} className={"bdg "+(t==='VIP'?'amber':'gray')}>{t}</span>)}</span></td>
              <td className="mono" style={{textAlign:'right',fontWeight:600}}>{r[7]}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Shell>
  );
}

/* ---------- 13 · Settings ---------- */
function SetSec({t,children}){return (<><div className="dml">{t}<span className="rule"/></div><div className="panel">{children}</div></>);}
function Tgl({on}){const [v,setV]=React.useState(on);return <span className={"tgl"+(v?' on':'')} onClick={()=>{setV(!v);window.fadToast&&window.fadToast(v?'Turned off':'Turned on');}}><span className="knob"/></span>;}
function SetLn({l,d,r,last}){return (<div className="between" style={{padding:'12px 2px',borderBottom:last?'none':'1px solid var(--line-2)'}}><div><div style={{fontSize:13,fontWeight:600}}>{l}</div>{d&&<div className="faint" style={{fontSize:11.5,marginTop:2}}>{d}</div>}</div>{r}</div>);}
function IntegrationsPlane(){
  const SyncChip = window.FADSTATE && window.FADSTATE.SyncChip;
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const conns=[
    {nm:'Guesty',dom:'Reservations · properties · guests · financials',dir:'two-way',owner:'Ishant A.',health:'healthy'},
    {nm:'Breezeway',dom:'Tasks · supplies · access codes · evidence',dir:'two-way',owner:'Franny H.',health:'healthy'},
    {nm:'Airbnb',dom:'Listings · rates · availability · reviews',dir:'two-way',owner:'Mary O.',health:'healthy'},
    {nm:'Booking.com',dom:'Listings · rates · availability',dir:'two-way',owner:'Mary O.',health:'healthy'},
    {nm:'WhatsApp Business',dom:'Guest messaging into Inbox',dir:'two-way',owner:'Franny H.',health:'failed'},
    {nm:'Xodo Sign',dom:'E-signature · contracts',dir:'one-way',owner:'Ishant A.',health:'healthy'},
    {nm:'lExpress Property',dom:'Agency listings · leads',dir:'one-way',owner:'Mary O.',health:'failed'},
    {nm:'Property Cloud',dom:'Agency listings',dir:'one-way',owner:'Mary O.',health:'stale'},
  ];
  return (<>
    <div className="dml">Connectors <span className="ct">{conns.length} · {conns.filter(c=>c.health!=='healthy').length} need attention</span><span className="rule"/></div>
    <div className="panel" style={{padding:'10px 6px'}}>
      <table className="tbl"><thead><tr><th>Connector</th><th>Data domains</th><th>Direction</th><th>Owner</th><th>Sync</th><th></th></tr></thead>
        <tbody>{conns.map((c,i)=>(<tr key={i} className="tdrow" onClick={()=>T('Opened '+c.nm+' connector')}>
          <td><span className="tt">{c.nm}</span></td>
          <td className="faint" style={{fontSize:11.5}}>{c.dom}</td>
          <td><span className="bdg gray">{c.dir}</span></td>
          <td className="faint">{c.owner}</td>
          <td>{SyncChip ? <SyncChip source={c.nm.split(' ')[0]} health={c.health}/> : <span className={"bdg "+(c.health==='failed'?'red':c.health==='stale'?'amber':'green')+" dot"}>{c.health}</span>}</td>
          <td style={{textAlign:'right'}}>{c.health==='failed' ? <button className="dbtn ghost sm" onClick={(e)=>{e.stopPropagation();T('Reconnecting '+c.nm+'\u2026');}}>Reconnect</button> : <button className="dbtn ghost sm" onClick={(e)=>{e.stopPropagation();T('Synced '+c.nm,'green');}}>Sync</button>}</td>
        </tr>))}</tbody>
      </table>
    </div>
    <div className="gate" style={{borderStyle:'solid',marginTop:12}}><DI n="alert" s={1.7} style={{color:'var(--amber)',flex:'0 0 auto'}}/><span><b>2 connectors failed</b> (WhatsApp, lExpress Property) and Property Cloud is stale. Each field across FAD shows where it came from — fix a connector here and dependent modules recover automatically.</span></div>
  </>);
}
function AccountPane(){
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  return (<>
    <div className="panel" style={{display:'flex',alignItems:'center',gap:16,marginTop:6}}>
      <span className="av1" style={{width:58,height:58,fontSize:20,flex:'0 0 58px'}}>FH</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:'var(--serif)',fontSize:21,fontWeight:400,color:'#f3f6fb',lineHeight:1.1}}>Franny Henri</div>
        <div className="faint" style={{fontSize:12.5,marginTop:3}}>GM / Ops Manager · North zone · Friday Retreats</div>
        <div className="row" style={{gap:7,marginTop:8}}><span className="bdg indigo">GM / Ops</span><span className="bdg green dot">Active</span><span className="faint mono" style={{fontSize:10.5,alignSelf:'center'}}>member since Jan 2025</span></div>
      </div>
      <button className="dbtn ghost" onClick={()=>T('Edit profile')}><DI n="gear" s={1.8}/> Edit profile</button>
    </div>
    <SetSec t="Contact">
      <SetLn l="Email" d="Used for sign-in & notifications" r={<span className="mono" style={{fontSize:12.5}}>franny@fridayretreats.mu</span>}/>
      <SetLn l="Mobile" d="For push & 2FA codes" r={<span className="mono" style={{fontSize:12.5}}>+230 5xxx xxxx</span>} last/>
    </SetSec>
    <SetSec t="Security">
      <SetLn l="Password" d="Last changed 2 months ago" r={<button className="dbtn sm ghost" onClick={()=>T('Change password')}>Change</button>}/>
      <SetLn l="Two-factor authentication" d="Authenticator app + SMS fallback" r={<Tgl on={true}/>}/>
      <SetLn l="Recovery codes" d="8 unused codes remaining" r={<button className="dbtn sm ghost" onClick={()=>T('Recovery codes')}>View</button>} last/>
    </SetSec>
    <div className="dml">Active sessions <span className="rule"/></div>
    <div className="panel" style={{padding:'4px 4px'}}>
      {[['MacBook Pro · Grand Baie','Chrome · this device','now','curr'],['iPhone 15 · FridayOS PWA','Mobile · Mauritius','2h ago',''],['iPad · Office','Safari · Port Louis','Yesterday','']].map((s,i)=>(
        <div key={i} className="row between" style={{padding:'12px',borderBottom:i<2?'1px solid var(--line-2)':'none'}}>
          <div className="row" style={{gap:11}}><span className="statc" style={{padding:7,border:'none',background:'var(--card-2)',color:'var(--tx-2)'}}><DI n={i===1?'phone':'home'} s={1.7}/></span><div><div style={{fontSize:13,fontWeight:600}}>{s[0]}</div><div className="faint mono" style={{fontSize:10.5,marginTop:2}}>{s[1]} · {s[2]}</div></div></div>
          {s[3]==='curr'? <span className="bdg green dot">this device</span> : <button className="dbtn sm ghost danger" onClick={()=>T('Signed out session')}>Sign out</button>}
        </div>
      ))}
    </div>
    <SetSec t="Preferences">
      <SetLn l="Theme" d="Dark is the FridayOS default" r={<span className="vseg"><span className="vs on">Dark</span><span className="vs" onClick={()=>T('Light theme is a preview')}>Light</span></span>}/>
      <SetLn l="Language" r={<span className="mono" style={{fontSize:12.5}}>English (UK)</span>}/>
      <SetLn l="Quiet hours" d="Mute non-urgent push overnight" r={<span className="row" style={{gap:8}}><span className="mono faint" style={{fontSize:11.5}}>21:00 – 06:30</span><Tgl on={true}/></span>} last/>
    </SetSec>
    <div className="gate" style={{borderStyle:'solid',marginTop:4}}><span style={{color:'var(--indigo-bright)'}}><DI n="spark" s={1.6}/></span><span><b>Friday respects your hours.</b> During quiet hours I hold everything except safety and guest-blocked jobs — those always reach you.</span></div>
  </>);
}
function ScreenSettings(){
  const [tab,setTab]=React.useState('roles');
  const tabs=[['account','My account'],['roles','Roles & access'],['integ','Integrations'],['notif','Notifications'],['brand','Branding'],['billing','Billing']];
  const matrix=[
    ['Safety & guest-blocked jobs',true,true,true],
    ['Task assigned to me',true,true,false],
    ['Report needs approval',true,false,true],
    ['Supplies below par',false,true,true],
    ['Owner statement ready',true,false,false],
    ['Channel sync errors',false,true,false],
  ];
  return (
    <Shell active="" eyebrow="SETTINGS" title="Settings" sub="Organisation · roles · integrations"
      actions={<button className="dbtn primary" onClick={()=>window.fadToast&&window.fadToast('Settings saved','green')}><DI n="check" s={2}/> Save changes</button>}>
      <div className="dtabs" style={{marginTop:4}}>
        {tabs.map(t=><span key={t[0]} className={"dtab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}</span>)}
      </div>

      {tab==='account' && <AccountPane/>}

      {tab==='roles' && <>
        <SetSec t="Roles & permissions">
          <SetLn l="Director" d="Full access · all modules, finance, settings" r={<span className="bdg indigo">3 people</span>}/>
          <SetLn l="GM / Ops manager" d="Operations, inbox, calendar, approvals, roster" r={<span className="bdg indigo">5 people</span>}/>
          <SetLn l="Field staff" d="My tasks, chat, history, account — mobile PWA" r={<span className="bdg gray">18 people</span>}/>
          <SetLn l="Owner" d="Read-only: their property statements, reviews, occupancy" r={<span className="bdg gray">27 people</span>} last/>
        </SetSec>
        <SetSec t="“View as” role preview">
          <SetLn l="Let admins preview the app as another role" d="Powers the View-as switcher in the top bar" r={<Tgl on={true}/>} last/>
        </SetSec>
      </>}

      {tab==='integ' && <IntegrationsPlane/>}

      {tab==='notif' && <>
        <div className="dml">Notification policy <span className="rule"/></div>
        <div className="panel" style={{padding:'4px 14px'}}>
          <div className="row" style={{padding:'8px 0 10px',borderBottom:'1px solid var(--line-2)'}}>
            <span style={{flex:1}}/>
            {['In-app','Email','Push'].map(h=><span key={h} className="faint mono" style={{fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',width:54,textAlign:'center',flex:'0 0 54px'}}>{h}</span>)}
          </div>
          {matrix.map((m,i)=>(
            <div key={i} className="row" style={{padding:'11px 0',borderBottom:i<matrix.length-1?'1px solid var(--line-2)':'none'}}>
              <span style={{flex:1,fontSize:12.5,fontWeight:i===0?600:400}}>{m[0]}{i===0&&<span className="bdg gray" style={{marginLeft:8}}>always on</span>}</span>
              {[1,2,3].map(j=><span key={j} style={{width:54,flex:'0 0 54px',display:'flex',justifyContent:'center'}}><Tgl on={m[j]}/></span>)}
            </div>
          ))}
        </div>
        <div className="gate" style={{borderStyle:'solid',marginTop:12}}><span style={{color:'var(--indigo-bright)'}}><DI n="spark" s={1.6}/></span><span>Friday already mutes <b>~3,800 low-signal alerts a week</b>. These controls only affect what survives that filter.</span></div>
      </>}

      {tab==='brand' && <SetSec t="Branding">
        <SetLn l="Organisation name" d="Shown across the app & owner portal" r={<span className="mono" style={{fontSize:12.5}}>Friday Retreats</span>}/>
        <SetLn l="Guest-message sign-off" d="Appended to outbound guest replies" r={<span className="mono" style={{fontSize:12.5}}>— The Friday Retreats team</span>}/>
        <SetLn l="Accent colour" d="Used for highlights & the Friday mark" r={<span className="row" style={{gap:6}}><span style={{width:18,height:18,borderRadius:5,background:'var(--indigo)',border:'1px solid var(--line-3)'}}/><span className="mono faint" style={{fontSize:11}}>#3E74D9</span></span>}/>
        <SetLn l="Logo" d="SVG or PNG · shown in the rail & exports" r={<button className="dbtn sm ghost" onClick={()=>window.fadToast&&window.fadToast('Upload a logo')}>Upload</button>} last/>
      </SetSec>}

      {tab==='billing' && <>
        <div className="grid3" style={{margin:'6px 0 14px'}}>
          <div className="statc"><div className="n">Growth</div><div className="l">Current plan</div></div>
          <div className="statc"><div className="n">27 / 30</div><div className="l">Units · €9 each</div></div>
          <div className="statc green"><div className="n">€243</div><div className="l">Next invoice · Jun 1</div></div>
        </div>
        <SetSec t="Invoices">
          <SetLn l="May 2026" d="27 units · paid 1 May" r={<button className="dbtn sm ghost" onClick={()=>window.fadToast&&window.fadToast('Downloading invoice…')}>PDF</button>}/>
          <SetLn l="April 2026" d="26 units · paid 1 Apr" r={<button className="dbtn sm ghost" onClick={()=>window.fadToast&&window.fadToast('Downloading invoice…')}>PDF</button>} last/>
        </SetSec>
      </>}
    </Shell>
  );
}

/* ---------- 14 · Help & knowledge base ---------- */
function ScreenHelp(){
  const cats=[['book','Getting started','8 articles'],['ops','Tasks & operations','14'],['cal','Calendar & reservations','11'],['coin','Finance & payouts','9'],['users','Guests & reviews','7'],['gear','Settings & roles','6']];
  const arts=['How report approvals become tasks','Drafting a roster with Friday','Blocking dates & syncing to channels','Receipt scanning & expense reports','Setting supplies par levels','Onboarding a new property'];
  return (
    <Shell active="" eyebrow="HELP" title="Help & knowledge base" sub="Guides, STR best-practice & Ask Friday">
      <div className="fai">
        <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Ask Friday</span></div>
        <p>Ask anything about FridayOS or short-term rental ops — “how do I split an owner payout?”, “what's our cancellation policy?”</p>
        <div className="dsearch" style={{maxWidth:'none',margin:'12px 0 0',background:'var(--bg-2)'}}><DI n="search" s={2}/> <span>Search help or ask Friday…</span></div>
      </div>
      <div className="dml">Browse by topic <span className="rule"/></div>
      <div className="grid3">
        {cats.map((c,i)=>(<div key={i} className="panel" style={{cursor:'pointer'}}><div className="row" style={{gap:10}}><span className="statc" style={{padding:8,border:'none',background:'var(--card-2)',color:'var(--indigo-bright)'}}><DI n={c[0]} s={1.8}/></span><div><div style={{fontWeight:600,fontSize:13.5}}>{c[1]}</div><div className="faint" style={{fontSize:11,marginTop:2}}>{c[2]} articles</div></div></div></div>))}
      </div>
      <div className="dml">Popular articles <span className="rule"/></div>
      <div className="panel">{arts.map((a,i)=>(<div key={i} className="between" style={{padding:'11px 2px',borderBottom:i<arts.length-1?'1px solid var(--line-2)':'none',cursor:'pointer'}}><span className="row" style={{gap:9,fontSize:13}}><DI n="doc" s={1.7} style={{color:'var(--tx-3)'}}/>{a}</span><DI n="chevR" s={2} style={{color:'var(--tx-3)'}}/></div>))}</div>
    </Shell>
  );
}

/* ---------- 15 · Ask Friday (full page) ---------- */
function ScreenAskFull(){
  const H = useHealth();
  const FS = window.FADSTATE;
  const [voice,setVoice] = React.useState(false);
  const groups=[['Operations',["What's blocked by guests today?","Rebalance the SD-10 follow-up","Who's overloaded this week?"]],['Reservations',["Show arrivals needing turnovers","Any double-bookings this month?"]],['Finance',["Draft this month's owner statements","Which properties are below target?"]]];
  return (
    <Shell active="" eyebrow={<><img className="askmk" src="friday-f.png" alt="" style={{width:14,height:14}}/> ASK FRIDAY</>} title="What can I help with?" sub="Aware of every module · acts with your approval"
      actions={<><span className="aichip ai"><DI n="pin" s={1.6}/> All of FridayOS</span><button className="dbtn primary" onClick={()=>setVoice(true)}><DI n="mic" s={1.7}/> Voice</button><button className="dbtn ghost">History</button></>}>
      {voice && window.FADVOICE && <window.FADVOICE.VoiceOverlay onClose={()=>setVoice(false)}/>}
      {FS && <FS.StateBanner surface="Ask Friday" health={H}/>}
      <div className="fai">
        <div className="fh"><span className="bdg indigo"><img className="askmk" src="friday-f.png" alt="" style={{width:13,height:13,marginRight:2}}/> Friday</span><span className="grow"/>{FS? <FS.ConfBar pct={92} health={H}/> : <span className="faint mono" style={{fontSize:10}}>conf. 92%</span>}</div>
        {H==='failed'
          ? <p style={{color:'var(--tx-2)'}}>I can't reach the operations data right now, so I won't guess. The morning brief will refresh as soon as the connection recovers.</p>
          : H==='fallback'
          ? <p>I couldn't load today's live figures, so here's the <b className="hl">general shape</b> of a morning: review overnight messages, confirm turnovers for arrivals, and clear any approvals. <span className="faint">(Not from your data — verify.)</span></p>
          : <p>This morning: <span className="hl">32 tasks</span>, 3 reports to approve, 2 arrivals needing turnovers, and the West store is low on 4 items. Want me to <span className="hl">draft the day's plan</span> and a restock order?{H==='partial' && <span className="faint"> (Roster data was unavailable — overload check skipped.)</span>}</p>}
        {FS && H!=='healthy' && <div style={{marginTop:10}}><FS.Provenance items={[['ops','operations · 32 tasks'],['doc','reservations · 2 arrivals'],['box','supplies · West store']]} health={H}/></div>}
        {H!=='failed' && <div className="acts"><button className="dbtn primary sm" onClick={()=>window.fadToast&&window.fadToast(H==='fallback'?'Drafted — flagged ungrounded':'Plan + order drafted','green')}><DI n="check" s={2}/> Draft plan + order</button><button className="dbtn ghost sm">Just the plan</button></div>}
        {H==='failed' && <div className="acts"><button className="dbtn ghost sm" onClick={()=>window.fadToast&&window.fadToast('Retrying connection\u2026')}><DI n="undo" s={1.7}/> Retry connection</button></div>}
      </div>
      {H!=="failed" && <div className="askfull-conv">{window.FADASKUI && <window.FADASKUI.AskConversation/>}</div>}
    </Shell>
  );
}

/* ---------- 16 · Notifications (manager) ---------- */
const NOTES_DATA=[
  {id:'n1',group:'needs',ic:'flag',tone:'red',time:'12m ago · GBH-C5',html:"<b>Recurring fault</b> — pool pump flagged a 3rd time; Friday suggests a preventive service.",act:'Open task',go:()=>window.FADTASK&&window.FADTASK.open({code:'GBH-C5',title:'Replace shower head',dept:'maintenance',due:'Done 13:00',status:'Done',statusTone:'green',pri:'med',occ:'Vacant',occTone:'green',who:'BR',addr:'Grand Baie',cost:'Rs 240'})},
  {id:'n2',group:'needs',ic:'shield',tone:'amber',time:'28m ago · approvals',html:"3 field reports waiting on approval (1 urgent).",act:'Review',go:()=>window.FADGO('approvals')},
  {id:'n3',group:'needs',ic:'users',tone:'indigo',time:'1h ago · roster',html:"Bryan is at 88% load Tuesday — rebalance suggested.",act:'Rebalance',go:()=>window.FADGO('roster')},
  {id:'n4',group:'needs',ic:'coin',tone:'green',time:'2h ago · owners',html:"Owner statement for GBH-B4 is ready to send.",act:'Send',go:()=>window.FADGO('ownerstmt')},
  {id:'n5',group:'today',ic:'cal',tone:'indigo',time:'06:30',html:"Friday published the day's schedule · 18 jobs.",act:'View',go:()=>window.FADGO('schedule')},
  {id:'n6',group:'today',ic:'box',tone:'amber',time:'Yesterday · West store',html:"West store dropped below par on 4 items · restock drafted.",act:'Restock',go:()=>window.FADGO('supplies')},
];
const NOTES_MUTED=[
  ['Guesty sync completed','channel · 3m ago'],['Airbnb payout posted · Rs 42,000','finance · 41m ago'],
  ['Task GBH-B4 turnover auto-assigned to Ishant','ops · 1h ago'],['Calendar imported 2 bookings','channel · 2h ago'],
  ['Review reply posted automatically','reviews · 3h ago'],
];
function ScreenNotifsMgr(){
  const [seg,setSeg]=React.useState('all');
  const [read,setRead]=React.useState({});
  const markAll=()=>{ const r={}; NOTES_DATA.forEach(n=>r[n.id]=true); setRead(r); window.fadToast&&window.fadToast('All notifications marked read'); };
  const open=n=>{ setRead(p=>({...p,[n.id]:true})); n.go&&n.go(); };
  const needs=NOTES_DATA.filter(n=>n.group==='needs');
  const unreadNeeds=needs.filter(n=>!read[n.id]).length;
  const showNeeds=seg==='all'||seg==='needs';
  const showToday=seg==='all'||seg==='today';
  const showMuted=seg==='muted';
  const Row=({n})=>(
    <div className="between tdrow" style={{padding:'12px 10px',borderBottom:'1px solid var(--line-2)',alignItems:'flex-start',gap:12,cursor:'pointer',opacity:read[n.id]?.62:1}} onClick={()=>open(n)}>
      <span className="row" style={{gap:11,alignItems:'flex-start'}}>
        <span className="statc" style={{padding:7,border:'none',background:'var(--'+n.tone+'-ghost)',color:'var(--'+n.tone+')'}}><DI n={n.ic} s={1.7}/></span>
        <span style={{fontSize:13,lineHeight:1.45,maxWidth:520}}><span dangerouslySetInnerHTML={{__html:n.html}}/><div className="faint mono" style={{fontSize:10,marginTop:4}}>{n.time}</div></span>
      </span>
      <span className="row" style={{gap:9,flex:'0 0 auto'}}>
        <button className="dbtn sm" onClick={e=>{e.stopPropagation();open(n);}}>{n.act}</button>
        {!read[n.id] && <span className="mdot" style={{background:'var(--indigo)',width:8,height:8,marginTop:8}}/>}
      </span>
    </div>
  );
  return (
    <Shell active="" eyebrow="INBOX" title="Notifications" sub="Friday muted 3,847 low-signal alerts this week"
      actions={<><button className="dbtn ghost" onClick={markAll}>Mark all read</button><button className="dbtn ghost" onClick={()=>window.FADGO('settings')}>Settings</button></>}>
      <div className="fbar"><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft"><b>Friday filtered your alerts</b> — surfaced the {NOTES_DATA.length} that actually need a manager; muted status pings, auto-syncs &amp; resolved items.</span></div>
      <div className="row" style={{gap:8,margin:'14px 0 6px'}}>
        <span className="vseg">
          <span className={"vs"+(seg==='all'?' on':'')} onClick={()=>setSeg('all')}>All</span>
          <span className={"vs"+(seg==='needs'?' on':'')} onClick={()=>setSeg('needs')}>Needs you{unreadNeeds>0&&<span className="bdg red" style={{height:16,padding:'0 5px',fontSize:9}}>{unreadNeeds}</span>}</span>
          <span className={"vs"+(seg==='today'?' on':'')} onClick={()=>setSeg('today')}>Today</span>
          <span className={"vs"+(seg==='muted'?' on':'')} onClick={()=>setSeg('muted')}>Muted</span>
        </span>
      </div>
      {showNeeds && <>
        <div className="dml">Needs you <span className="ct">{unreadNeeds}</span><span className="rule"/></div>
        <div className="panel" style={{padding:'2px 4px'}}>{needs.map(n=><Row key={n.id} n={n}/>)}</div>
      </>}
      {showToday && <>
        <div className="dml">Earlier today <span className="rule"/></div>
        <div className="panel" style={{padding:'2px 4px'}}>{NOTES_DATA.filter(n=>n.group==='today').map(n=><Row key={n.id} n={n}/>)}</div>
      </>}
      {showMuted
        ? <>
            <div className="dml">Muted by Friday <span className="ct">3,847 this week</span><span className="rule"/></div>
            <div className="panel" style={{padding:'2px 14px'}}>
              {NOTES_MUTED.map((m,i)=>(<div key={i} className="drow" style={{opacity:.7}}><span className="row" style={{gap:9}}><span className="mdot" style={{background:'var(--tx-4)',width:7,height:7}}/>{m[0]}</span><span className="faint mono" style={{fontSize:10}}>{m[1]}</span></div>))}
              <div className="faint mono" style={{fontSize:10,padding:'10px 0 4px'}}>+ 3,842 more · status pings, syncs &amp; auto-resolved items</div>
            </div>
          </>
        : <div className="row tdrow" style={{gap:9,marginTop:14,padding:'11px 13px',border:'1px dashed var(--line)',borderRadius:'var(--r)',color:'var(--tx-2)',fontSize:12.5,cursor:'pointer'}} onClick={()=>setSeg('muted')}><DI n="bell" s={1.7} style={{color:'var(--tx-3)'}}/> <b style={{color:'var(--tx-2)'}}>3,847 muted</b> this week — tap to review what Friday filtered.</div>}
    </Shell>
  );
}

/* ---------- 10 · Reservations ---------- */
function ScreenReservations(){
  const [seg,setSeg]=React.useState('all');
  const rows=[
    ['Marie L.','GBH-B4','air','1 Jun','4 Jun','3','Arriving today','amber','Turnover due','Rs 42,000'],
    ['Tom W.','KS-5','book','1 Jun','6 Jun','5','Arriving today','amber','Turnover due','Rs 71,500'],
    ['Dieter K.','BW-C4','book','28 May','2 Jun','5','In-house','green','—','Rs 58,000'],
    ['The Roys','VA-3','dir','30 May','3 Jun','4','In-house','green','—','Rs 36,000'],
    ['James O.','SD-10','book','29 May','1 Jun','3','Checkout 11:00','red','Clean booked','Rs 33,000'],
    ['Priya & Sam','RC-7','air','25 May','1 Jun','7','Checkout 10:00','red','Clean booked','Rs 49,000'],
    ['The Lees','GBH-B4','air','4 Jun','8 Jun','4','Upcoming','gray','—','Rs 56,000'],
    ['B. Adeyemi','KS-5','book','10 Jun','14 Jun','4','Upcoming','gray','—','Rs 60,000'],
  ];
  const ch={air:['Airbnb','#e08e89'],book:['Booking','#9fb4ee'],dir:['Direct','#6cc79c']};
  const panel=(
    <div className="daside">
      <div className="afp-h"><div className="r1"><span className="tt"><DI n="doc" s={1.6} style={{color:'var(--indigo-bright)'}}/> Reservation</span><span className="srcgy srcbz" style={{color:'#5fd09a'}}>guesty</span></div>
        <div className="afp-aware">Marie L. · GBH-B4 · arriving today</div></div>
      <div className="afp-body" style={{gap:0}}>
        <div className="ibctx"><span className="cl">Guest</span><span className="cv">Marie L. · 2 guests <span className="bdg gray">★ 4.9 · returning</span></span></div>
        <div className="ibctx"><span className="cl">Stay</span><span className="cv">1 – 4 Jun · 3 nights · check-in 15:00</span></div>
        <div className="ibctx"><span className="cl">Channel</span><span className="cv"><span className="mdot" style={{background:'#e08e89',width:8,height:8,borderRadius:3}}/> Airbnb</span></div>
        <div className="ibctx"><span className="cl">Payout</span><span className="cv mono">Rs 42,000 <span className="faint" style={{fontSize:10}}>· paid</span></span></div>
        <div className="ibctx"><span className="cl">Ops</span><span className="cv"><span className="bdg violet">Turnover 15:00 · IA</span></span></div>
        <div className="row" style={{gap:7,flexWrap:'wrap',marginTop:12}}>
          <button className="dbtn sm" style={{flex:'1 0 46%'}}><DI n="msg" s={1.7}/> Message</button>
          <button className="dbtn sm" style={{flex:'1 0 46%'}}><DI n="ops" s={1.7}/> Create task</button>
          <button className="dbtn ghost sm" style={{flex:'1 0 46%'}}><DI n="home" s={1.7}/> Property</button>
          <button className="dbtn ghost sm" style={{flex:'1 0 46%'}}>Modify</button>
        </div>
        <div className="dml" style={{margin:'16px 0 8px'}}>New booking <span className="rule"/></div>
        <div style={{display:'flex',flexDirection:'column',gap:7}}>
          <div className="aichip" style={{justifyContent:'space-between',width:'100%'}}>Property · GBH-B4 <DI n="chevD" s={2} style={{width:12,height:12}}/></div>
          <div className="aichip" style={{justifyContent:'space-between',width:'100%'}}>4 – 8 Jun · 4 nights <DI n="cal" s={1.6} style={{width:12,height:12}}/></div>
          <div className="afdone"><DI n="check" s={2}/> Available · no conflicts</div>
          <button className="dbtn primary sm" style={{width:'100%'}}><DI n="plus" s={2}/> Create booking</button>
        </div>
        <div className="gate" style={{borderStyle:'solid',marginTop:12}}><span style={{color:'var(--indigo-bright)'}}><DI n="spark" s={1.6}/></span><span>3 open <b>inquiries</b> — Friday drafted replies &amp; can convert to bookings on approval.</span></div>
      </div>
    </div>
  );
  return (
    <Shell active="res" eyebrow="RESERVATIONS" title="Reservations" sub="Guesty bookings · 25 May – 14 Jun"
      tabs={[{l:'All',ct:31,on:true},{l:'Arrivals',ct:2},{l:'In-house',ct:2},{l:'Departures',ct:2},{l:'Inquiries',ct:3}]} panel={panel}
      actions={<><button className="dbtn ghost"><DI n="filter" s={2}/> Filter</button><button className="dbtn primary"><DI n="plus" s={2}/> New booking</button></>}>
      <div className="grid4">
        <div className="statc"><div className="n">2</div><div className="l">Arrivals today</div></div>
        <div className="statc"><div className="n">2</div><div className="l">Departures</div></div>
        <div className="statc amber"><div className="n">3</div><div className="l">Turnovers due</div></div>
        <div className="statc"><div className="n">83%</div><div className="l">Occupancy · 30d</div></div>
      </div>
      <div className="fbar" style={{marginTop:12}}>
        <span className="fi"><DI n="spark" s={1.6}/></span>
        <span className="ft"><b>Friday.</b> 2 arrivals today both need turnovers done by 15:00 — both scheduled. James O. checks out at 11:00, clean is booked with Ishant.</span>
        <span className="fb"><button className="dbtn ghost sm">Open Calendar</button></span>
      </div>
      <div className="row between" style={{margin:'16px 0 0'}}>
        <span className="vseg">{[['all','All',8],['arr','Arrivals',2],['inh','In-house',2],['dep','Departures',2],['up','Upcoming',2],['inq','Inquiries',3]].map(s=><span key={s[0]} className={"vs"+(seg===s[0]?' on':'')} onClick={()=>setSeg(s[0])}>{s[1]} <span className="mono" style={{opacity:.6,fontSize:10}}>{s[2]}</span></span>)}</span>
        <span className="faint mono" style={{fontSize:10}}>{(()=>{const f={all:rows.length,arr:rows.filter(r=>/Arriving/.test(r[6])).length,inh:rows.filter(r=>r[6]==='In-house').length,dep:rows.filter(r=>/Checkout/.test(r[6])).length,up:rows.filter(r=>r[6]==='Upcoming').length};return f[seg];})()} shown</span>
      </div>
      {seg==='inq' && <ResInquiries/>}
      {seg!=='inq' && <div className="panel" style={{padding:'12px 6px',marginTop:10}}>
        <table className="tbl">
          <thead><tr><th>Guest</th><th>Property</th><th>Channel</th><th>Check-in</th><th>Check-out</th><th style={{textAlign:'right'}}>Nights</th><th>Status</th><th>Ops</th><th style={{textAlign:'right'}}>Payout</th></tr></thead>
          <tbody>
            {rows.filter(r=> seg==='all' || (seg==='arr'&&/Arriving/.test(r[6])) || (seg==='inh'&&r[6]==='In-house') || (seg==='dep'&&/Checkout/.test(r[6])) || (seg==='up'&&r[6]==='Upcoming') ).map((r,i)=>(
              <tr key={i} className="tdrow" onClick={()=>window.FADGO('reservation')}>
                <td><span className="row" style={{gap:7}}><span className="av1" style={{width:24,height:24,fontSize:8}}>{r[0].split(' ').map(w=>w[0]).slice(0,2).join('')}</span><span className="tt">{r[0]}</span></span></td>
                <td><span className="pcodeD">{r[1]}</span></td>
                <td><span className="row" style={{gap:6,fontSize:11.5}}><span className="mdot" style={{background:ch[r[2]][1],width:8,height:8,borderRadius:3}}/>{ch[r[2]][0]}</span></td>
                <td className="mono faint">{r[3]}</td><td className="mono faint">{r[4]}</td>
                <td className="mono" style={{textAlign:'right'}}>{r[5]}</td>
                <td><span className={"bdg "+r[7]+(r[7]!=='gray'&&r[7]!=='green'?' dot':'')}>{r[6]}</span></td>
                <td className="faint" style={{fontSize:11}}>{r[8]}</td>
                <td className="mono" style={{textAlign:'right',fontWeight:600}}>{r[9]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </Shell>
  );
}

/* Reservations — inquiries pipeline (pre-booking) */
function ResInquiries(){
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const INQ=[
    {av:'AM',nm:'Anita Marivaux',ch:'air',prop:'GBH-B4',dates:'12–19 Jul · 7n',guests:'2 adults',state:'new',val:'Rs 84k',ask:'Is late check-in possible? Travelling with an infant.'},
    {av:'NL',nm:'Nadia Lim',ch:'book',prop:'SD-10',dates:'2–6 Aug · 4n',guests:'4 adults',state:'replied',val:'Rs 46k',ask:'Flexible on dates in early August — best rate?'},
    {av:'JV',nm:'Johan Visser',ch:'dir',prop:'KS-5',dates:'20–27 Jun · 7n',guests:'2 adults',state:'awaiting',val:'Rs 132k',ask:'Holding the dates — will confirm once flights are booked.'},
  ];
  const ch={air:['Airbnb','#e08e89'],book:['Booking','#9fb4ee'],dir:['Direct','#6cc79c']};
  const SST={new:['indigo','new · needs reply'],replied:['amber','replied · awaiting guest'],awaiting:['green','hold · will confirm']};
  return (<>
    <div className="fbar" style={{marginTop:10}}><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft"><b>Friday.</b> 3 open inquiries · 1 needs a first reply (drafted), 1 awaiting the guest, 1 soft-hold. None conflict with the calendar — safe to convert.</span><span className="fb"><button className="dbtn sm" onClick={()=>T('Drafted replies for all inquiries')}>Draft all</button></span></div>
    <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:14}}>
      {INQ.map((q,i)=>(
        <div key={i} className="panel" style={{padding:'13px 15px'}}>
          <div className="between" style={{alignItems:'flex-start',gap:14}}>
            <div className="row" style={{gap:11,minWidth:0}}>
              <span className="av1">{q.av}</span>
              <div style={{minWidth:0}}>
                <div className="row" style={{gap:8,flexWrap:'wrap'}}><span className="tt" style={{fontSize:14}}>{q.nm}</span><span className="pcodeD">{q.prop}</span><span className="row" style={{gap:5,fontSize:11.5}}><span className="mdot" style={{background:ch[q.ch][1],width:8,height:8,borderRadius:3}}/>{ch[q.ch][0]}</span><span className={"bdg "+SST[q.state][0]+(q.state==='replied'||q.state==='awaiting'?' dot':'')}>{SST[q.state][1]}</span></div>
                <div className="qmeta" style={{marginTop:6}}><span>{q.dates}</span><span className="d">·</span><span>{q.guests}</span><span className="d">·</span><span className="mono">{q.val}</span></div>
                <div className="gate" style={{borderStyle:'solid',marginTop:9}}><span style={{color:'var(--indigo-bright)',marginTop:1}}><DI n="msg" s={1.6}/></span><span>“{q.ask}”</span></div>
              </div>
            </div>
            <div className="row" style={{gap:7,flex:'0 0 auto'}}>
              <button className="dbtn primary sm" onClick={()=>T('Friday reply opened for '+q.nm)}><DI n="spark" s={1.7}/> {q.state==='new'?'Send draft':'Reply'}</button>
              <button className="dbtn green sm" onClick={()=>T('Inquiry converted to booking','green')}><DI n="check" s={2}/> Convert</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  </>);
}
function ScreenProperties(){
  const props=[
    ['GBH-B4','Apt with Pool & Gym','Grand Baie','red','In-house · out 4 Jun','2 open','low'],
    ['SD-10','Sunset Drive Villa','Tamarin','green','Vacant · in 7 Sep','1 urgent','ok'],
    ['BW-C4','Beachfront Apartment','Flic en Flac','red','In-house · out 2 Jun','1 open','ok'],
    ['RC-7','Royal Court','Pereybère','amber','Check-in 15:00','0 open','ok'],
    ['VA-3','Géranium Road','Grand Baie','green','In-house','0 open','ok'],
    ['KS-5','Rooftop Pool Apt','Grand Baie','green','Arriving today','1 open','low'],
    ['GBH-C3','Modern Apt w/ Pool','Grand Baie','amber','Reunion 6 Jun','0 open','ok'],
    ['LB-2','Les Bougainvilliers','Tamarin','green','Vacant','0 open','ok'],
    ['TM-3','Tamarin Bay Villa','Tamarin','red','In-house','0 open','ok'],
  ];
  const oc={red:['var(--red)','Occupied'],amber:['var(--amber)','Soon'],green:['var(--green)','Vacant']};
  const steps=[
    ['Property details','done','Name, type, address, zone'],
    ['Access & lockbox','done','Codes stored audit-only'],
    ['Photos & layout','prog','3 of 8 uploaded'],
    ['Amenities & house rules','todo','Pool, gym, Wi-Fi, check-in window'],
    ['Supplies par levels','todo','Linen, amenities, breakables'],
    ['Owner & contract','done','Mgmt split, payout details'],
    ['Publish to channels','lock','Airbnb · Booking · Direct'],
  ];
  const sc={done:['var(--green)','Done'],prog:['var(--amber)','In progress'],todo:['var(--tx-3)','To do'],lock:['var(--tx-4)','Locked']};
  const panel=(
    <div className="daside">
      <div className="afp-h"><div className="r1"><span className="tt"><DI n="home" s={1.6} style={{color:'var(--indigo-bright)'}}/> Onboard a property</span><span className="bdg amber">Draft</span></div>
        <div className="afp-aware">GBH-C9 · Apt with Pool &amp; Gym · 4 of 7 steps</div>
        <div style={{height:5,borderRadius:3,background:'var(--card-2)',marginTop:9,overflow:'hidden'}}><div style={{height:'100%',width:'57%',background:'var(--green)',borderRadius:3}}/></div>
      </div>
      <div className="afp-body" style={{gap:0}}>
        {steps.map((s,i)=>(
          <div key={i} className="row" style={{gap:11,padding:'11px 0',borderBottom:i<steps.length-1?'1px solid var(--line-2)':'none'}}>
            <span style={{width:24,height:24,flex:'0 0 24px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:s[1]==='done'?'var(--green-ghost)':'var(--card-2)',color:sc[s[1]][0]}}>{s[1]==='done'?<DI n="check" s={2.4}/>:s[1]==='lock'?<DI n="lock" s={1.9}/>:<span style={{width:7,height:7,borderRadius:'50%',background:sc[s[1]][0]}}/>}</span>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:12.5,fontWeight:600}}>{s[0]}</div><div className="faint" style={{fontSize:10.5}}>{s[2]}</div></div>
            <span className="faint mono" style={{fontSize:9,color:sc[s[1]][0]}}>{sc[s[1]][1]}</span>
          </div>
        ))}
        <button className="dbtn primary sm" style={{marginTop:12,width:'100%'}}><DI n="chevR" s={2}/> Continue setup</button>
        <div className="gate" style={{borderStyle:'solid',marginTop:10}}><span style={{color:'var(--indigo-bright)'}}><DI n="spark" s={1.6}/></span><span>Friday can import details, photos &amp; access from <b>Guesty</b> and seed supplies par from a similar unit.</span></div>
      </div>
    </div>
  );
  const [ptab,setPtab]=React.useState('all');
  const PLOC={gb:'Grand Baie',tm:'Tamarin',ff:'Flic en Flac'};
  const shownP=(ptab==='all'||ptab==='onb')?props:props.filter(p=>p[2]===PLOC[ptab]);
  return (
    <Shell active="prop" eyebrow="PORTFOLIO" title="Properties" sub="27 active units · North + West"
      tabs={[{l:'All',ct:27,on:ptab==='all',fn:()=>setPtab('all')},{l:'Grand Baie',ct:14,on:ptab==='gb',fn:()=>setPtab('gb')},{l:'Tamarin',ct:7,on:ptab==='tm',fn:()=>setPtab('tm')},{l:'Flic en Flac',ct:6,on:ptab==='ff',fn:()=>setPtab('ff')},{l:'Onboarding',ct:1,on:ptab==='onb',fn:()=>setPtab('onb')}]}
      panel={panel}
      actions={<><button className="dbtn ghost"><DI n="filter" s={2}/> Filter</button><button className="dbtn primary"><DI n="plus" s={2}/> Add property</button></>}>
      <div className="grid4">
        <div className="statc"><div className="n">27</div><div className="l">Active units</div></div>
        <div className="statc red"><div className="n">11</div><div className="l">Occupied now</div></div>
        <div className="statc amber"><div className="n">5</div><div className="l">Open tasks</div></div>
        <div className="statc"><div className="n">4.8</div><div className="l">Avg rating</div></div>
      </div>
      {ptab==='onb' ? (
        <div className="panel" style={{maxWidth:620}}>
          <div className="dml" style={{margin:'0 0 8px'}}>Onboarding · GBH-C9 — Apt with Pool &amp; Gym <span className="bdg amber">4 of 7</span><span className="rule"/></div>
          {steps.map((s2,si)=>(<div key={si} className="row" style={{gap:11,padding:'11px 0',borderBottom:si<steps.length-1?'1px solid var(--line-2)':'none'}}><span style={{width:24,height:24,flex:'0 0 24px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:s2[1]==='done'?'var(--green-ghost)':'var(--card-2)',color:sc[s2[1]][0]}}>{s2[1]==='done'?<DI n="check" s={2.4}/>:s2[1]==='lock'?<DI n="lock" s={1.9}/>:<span style={{width:7,height:7,borderRadius:'50%',background:sc[s2[1]][0]}}/>}</span><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600}}>{s2[0]}</div><div className="faint" style={{fontSize:11}}>{s2[2]}</div></div><span className="faint mono" style={{fontSize:9,color:sc[s2[1]][0]}}>{sc[s2[1]][1]}</span></div>))}
          <button className="dbtn primary sm" style={{marginTop:12}} onClick={()=>window.fadToast&&window.fadToast('Continuing onboarding…')}><DI n="chevR" s={2}/> Continue setup</button>
        </div>
      ) : <React.Fragment>
      <div className="dml">{ptab==='all'?'All properties':PLOC[ptab]} <span className="ct">{shownP.length} shown</span><span className="rule"/></div>
      <div className="grid3">
        {shownP.map((p,i)=>(
          <div key={i} className="panel" style={{padding:0,overflow:'hidden',cursor:'pointer'}} onClick={()=>window.FADGO('property')}>
            <div style={{height:74,background:'linear-gradient(150deg,#222b3c,#141b27)',position:'relative'}}>
              <span style={{position:'absolute',top:9,left:10}} className="pcodeD">{p[0]}</span>
              <span style={{position:'absolute',top:9,right:10,display:'flex',alignItems:'center',gap:5,fontSize:10,color:oc[p[3]][0],background:'rgba(10,13,18,.6)',padding:'2px 7px',borderRadius:6}}><span className="mdot" style={{background:oc[p[3]][0],width:6,height:6}}/>{oc[p[3]][1]}</span>
            </div>
            <div style={{padding:'11px 13px'}}>
              <div style={{fontWeight:600,fontSize:13.5}}>{p[1]}</div>
              <div className="faint" style={{fontSize:11,marginTop:2}}>{p[2]}</div>
              <div className="row between" style={{marginTop:10,paddingTop:9,borderTop:'1px solid var(--line-2)'}}>
                <span className="faint mono" style={{fontSize:10}}>{p[4]}</span>
                <span className="row" style={{gap:6}}>{p[5]!=='0 open'&&<span className="bdg amber">{p[5]}</span>}{p[6]==='low'&&<span className="bdg gray"><DI n="box" s={1.5}/> low</span>}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      </React.Fragment>}
    </Shell>
  );
}

/* ---------- 9 · Supplies / inventory ---------- */
function ScreenInventory(){
  const rows=[
    ['Bath towels','linen','West store','4','12','low','Rs 180','used · GBH-B4 turnover · 2h ago'],
    ['Pipe sealant','consumable','West store','1','6','low','Rs 120','used · SD-10 Water Issue · 3h ago'],
    ['Coffee pods','amenity','North store','42','40','ok','Rs 18','restocked · 1d ago'],
    ['Toilet rolls','amenity','West store','0','24','out','Rs 22','used · BS-1 clean · 5h ago'],
    ['Wine glasses','breakable','North store','22','24','low','Rs 95','broken · RC-7 · flagged 1d ago'],
    ['All-purpose cleaner','consumable','North store','18','15','ok','Rs 90','restocked · 2d ago'],
    ['Bed linen set','linen','West store','9','9','ok','Rs 640','—'],
    ['LED bulbs','part','Van · Bryan','6','8','low','Rs 70','used · GBH-C5 · 2h ago'],
  ];
  const sm={ok:'green',low:'amber',out:'red'},sl={ok:'OK',low:'Low',out:'Out'};
  const order=[['Bath towels','×8','Rs 1,440'],['Toilet rolls','×24','Rs 528'],['Pipe sealant','×5','Rs 600'],['LED bulbs','×2','Rs 140']];
  const [below,setBelow]=React.useState(false);
  const T=t=>window.fadToast&&window.fadToast(t);
  const shown=below?rows.filter(r=>r[5]!=='ok'):rows;
  const panel=(
    <div className="daside">
      <div className="afp-h"><div className="r1"><span className="tt"><DI n="box" s={1.6} style={{color:'var(--indigo-bright)'}}/> Restock order</span><span className="bdg amber">Draft</span></div>
        <div className="afp-aware">Friday drafted from 5 below-par items · West + North stores</div></div>
      <div className="afp-body" style={{gap:0}}>
        {order.map((o,i)=>(
          <div key={i} className="row between" style={{padding:'10px 0',borderBottom:'1px solid var(--line-2)'}}>
            <div><div style={{fontSize:12.5,fontWeight:600}}>{o[0]}</div><div className="faint mono" style={{fontSize:10}}>to par</div></div>
            <div className="row" style={{gap:10}}><div className="stepper" style={{transform:'scale(.85)'}}><button>−</button><span className="val">{o[1].replace('×','')}</span><button>+</button></div><span className="mono" style={{fontSize:11.5,width:64,textAlign:'right'}}>{o[2]}</span></div>
          </div>
        ))}
        <div className="row between" style={{padding:'11px 0'}}><span className="faint mono" style={{fontSize:10,letterSpacing:'.08em',textTransform:'uppercase'}}>Total</span><span className="mono" style={{fontWeight:700,fontSize:15}}>Rs 2,708</span></div>
        <div className="selrow" style={{marginBottom:10}}><span className="aichip ai">Supplier · Cleanline</span><span className="aichip">Split by store</span></div>
        <button className="dbtn primary sm" style={{width:'100%'}} onClick={()=>T('Order placed · Rs 2,708','green')}><DI n="check" s={2}/> Place order</button>
        <div className="row" style={{gap:7,marginTop:10}}><button className="dbtn ghost sm" style={{flex:1}}><DI n="box" s={1.6}/> Receive</button><button className="dbtn ghost sm" style={{flex:1}}>Adjust par</button><button className="dbtn ghost sm" style={{flex:1}}>History</button></div>
        <div className="gate" style={{borderStyle:'solid',marginTop:12}}><span style={{color:'var(--indigo-bright)'}}><DI n="spark" s={1.6}/></span><span>Auto-order when an item drops below par — <b>on</b> for consumables, off for breakables.</span></div>
      </div>
    </div>
  );
  return (
    <Shell active="ops" eyebrow="OPERATIONS · SUPPLIES" title="Supplies" sub="Inventory across stores, vans & properties"
      tabs={opsTabs('su')} panel={panel}
      actions={<><button className="dbtn ghost"><DI n="filter" s={2}/> Filter</button><button className="dbtn ghost" onClick={()=>T('Add item — draft started')}><DI n="plus" s={2}/> Add item</button><button className="dbtn primary" onClick={()=>T('Opened restock draft')}><DI n="check" s={2}/> Restock order</button></>}>
      <div className="grid4">
        <div className="statc"><div className="n">214</div><div className="l">SKUs tracked</div></div>
        <div className="statc amber"><div className="n">5</div><div className="l">Below par</div></div>
        <div className="statc red"><div className="n">1</div><div className="l">Out of stock</div></div>
        <div className="statc"><div className="n">Rs 84k</div><div className="l">Stock value</div></div>
      </div>
      <div className="fbar" style={{marginTop:12}}>
        <span className="fi"><DI n="spark" s={1.6}/></span>
        <span className="ft"><b>Friday.</b> 5 items below par across West &amp; North stores — towels, sealant, toilet rolls &amp; bulbs. I drafted a restock order (Rs 2,140).</span>
        <span className="fb"><button className="dbtn sm" onClick={()=>T('Restock order placed · Rs 2,140')}>Apply order</button><button className="dbtn ghost sm" onClick={()=>T('Reviewing draft order')}>Review <DI n="chevR" s={2}/></button></span>
      </div>
      <div className="row" style={{gap:7,flexWrap:'wrap',margin:'16px 0 6px'}}>
        <span className="vseg"><span className="vs on">All items</span><span className="vs">By store</span><span className="vs">By property</span></span>
        <span className="aichip">Category: all <DI n="chevD" s={2} style={{width:11,height:11}}/></span>
        <span className={"aichip"+(below?' ai':'')} onClick={()=>setBelow(b=>!b)} style={{cursor:'pointer'}}>Below par only</span>
        <span className="grow" style={{flex:1}}/><span className="faint mono" style={{fontSize:10.5}}>8 of 214</span>
      </div>
      <div className="panel" style={{padding:'12px 6px'}}>
        <table className="tbl">
          <thead><tr><th>Item</th><th>Category</th><th>Location</th><th style={{textAlign:'right'}}>On hand</th><th style={{textAlign:'right'}}>Par</th><th>Status</th><th style={{textAlign:'right'}}>Unit</th><th>Last movement</th></tr></thead>
          <tbody>
            {shown.map((r,i)=>(
              <tr key={i} className="tdrow" onClick={()=>T('Opened item · '+r[0])}>
                <td className="tt">{r[0]}</td>
                <td className="faint">{r[1]}</td>
                <td><span className="row" style={{gap:6}}><DI n="box" s={1.7} style={{color:'var(--tx-3)'}}/> <span style={{fontSize:11.5}}>{r[2]}</span></span></td>
                <td className="mono" style={{textAlign:'right',color:r[5]==='out'?'var(--red)':r[5]==='low'?'var(--amber)':'var(--tx)',fontWeight:600}}>{r[3]}</td>
                <td className="mono faint" style={{textAlign:'right'}}>{r[4]}</td>
                <td><span className={"bdg "+sm[r[5]]+(r[5]!=='ok'?' dot':'')}>{sl[r[5]]}</span></td>
                <td className="mono faint" style={{textAlign:'right'}}>{r[6]}</td>
                <td className="sub" style={{fontFamily:'var(--mono)',fontSize:10}}>{r[7]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="faint mono" style={{fontSize:10,marginTop:10}}>Movements link to the task that consumed or flagged each item · synced from Breezeway</div>
    </Shell>
  );
}

/* ---------- 8 · Calendar (multi-property reservation timeline) ---------- */
function ScreenCalendar(){
  const [ch,setCh]=React.useState('all');
  const N=14, pct=(c)=>c/N*100;
  const days=Array.from({length:N},(_,i)=>{const d=25+i; const mo=d>31?'Jun':'May'; const n=d>31?d-31:d; const wd=['Su','Mo','Tu','We','Th','Fr','Sa'][(i+0)%7]; return [wd,n,mo,((i+0)%7===0||(i+0)%7===6)]; });
  const props=[
    {c:'GBH-B4',n:'Pool & Gym',occ:'red',bars:[['air',0,3,'Marie L.'],['book',4,3,'D. Kraus'],['air',8,4,'The Lees']],tasks:[3,7]},
    {c:'SD-10',n:'Sunset Dr',occ:'green',bars:[['dir',1,2,'J. Owusu'],['block',4,3,'Maintenance'],['air',9,5,'Berg']],tasks:[1,9]},
    {c:'RC-7',n:'Royal Court',occ:'amber',bars:[['air',0,2,'Priya & Sam'],['air',5,3,'New'],['book',11,3,'Cho']],tasks:[0]},
    {c:'BW-C4',n:'Beachfront',occ:'red',bars:[['book',0,7,'Long stay · in-house']],tasks:[2,5]},
    {c:'VA-3',n:'Géranium',occ:'green',bars:[['dir',2,3,'Family'],['air',8,4,'Mensah']],tasks:[]},
    {c:'KS-5',n:'Rooftop',occ:'green',bars:[['air',3,4,'Honeymoon'],['block',8,2,'Owner stay'],['book',10,4,'Adeyemi']],tasks:[4]},
    {c:'GBH-C3',n:'Pool & Gym',occ:'amber',bars:[['book',0,4,'Okafor'],['dir',6,5,'Reunion']],tasks:[6]},
    {c:'LB-2',n:'Bougainvilliers',occ:'green',bars:[['air',1,5,'Dubois'],['air',9,3,'Smit']],tasks:[]},
    {c:'TM-3',n:'Tamarin Bay',occ:'red',bars:[['dir',0,6,'In-house']],tasks:[8],block:1},
    {c:'FF-7',n:'Flic Studio',occ:'green',bars:[['book',2,3,'Patel'],['air',7,4,'Nkosi']],tasks:[7]},
  ];
  const panel=(
    <div className="daside">
      <div className="afp-h"><div className="r1"><span className="tt"><DI n="cal" s={1.6} style={{color:'var(--indigo-bright)'}}/> Calendar actions</span></div></div>
      <div className="afp-body" style={{gap:14}}>
        <div>
          <div className="dml" style={{margin:'0 0 8px'}}>Check availability <span className="rule"/></div>
          <div className="row" style={{gap:6}}><div className="ibctx" style={{flex:1,borderBottom:'none',padding:0}}><span className="cl">Dates</span><span className="cv" style={{fontSize:11}}>4 – 8 Jun</span></div><div className="ibctx" style={{flex:1,borderBottom:'none',padding:0}}><span className="cl">Guests</span><span className="cv" style={{fontSize:11}}>2</span></div></div>
          <div className="afdone" style={{marginTop:9}}><DI n="check" s={2}/> 6 units free · North 3 · West 3</div>
          <button className="dbtn ghost sm" style={{marginTop:8,width:'100%'}}>See available units</button>
        </div>
        <div>
          <div className="dml" style={{margin:'0 0 8px'}}>New reservation <span className="rule"/></div>
          <div style={{display:'flex',flexDirection:'column',gap:7}}>
            <div className="aichip" style={{justifyContent:'space-between',width:'100%'}}>Property · GBH-B4 <DI n="chevD" s={2} style={{width:12,height:12}}/></div>
            <div className="aichip" style={{justifyContent:'space-between',width:'100%'}}>4 – 8 Jun · 4 nights <DI n="cal" s={1.6} style={{width:12,height:12}}/></div>
            <div className="aichip" style={{justifyContent:'space-between',width:'100%'}}>Channel · Direct <DI n="chevD" s={2} style={{width:12,height:12}}/></div>
            <button className="dbtn primary sm" style={{width:'100%'}}><DI n="plus" s={2}/> Create reservation</button>
          </div>
        </div>
        <div>
          <div className="dml" style={{margin:'0 0 8px'}}>Block dates <span className="rule"/></div>
          <div style={{display:'flex',flexDirection:'column',gap:7}}>
            <div className="aichip" style={{justifyContent:'space-between',width:'100%'}}>Property · SD-10 <DI n="chevD" s={2} style={{width:12,height:12}}/></div>
            <div className="selrow"><span className="aichip">Maintenance</span><span className="aichip">Owner stay</span><span className="aichip">Off-market</span></div>
            <button className="dbtn sm" style={{width:'100%',background:'var(--card-2)'}}><DI n="lock" s={1.7}/> Block on calendar</button>
            <span className="faint" style={{fontSize:10}}>Blocks sync to Guesty &amp; close availability across channels.</span>
          </div>
        </div>
      </div>
    </div>
  );
  return (
    <Shell active="cal" eyebrow="CALENDAR" title="Calendar" sub="27 properties · 25 May – 7 Jun"
      tabs={[{l:'Timeline',on:true},{l:'List'},{l:'Availability'},{l:'Blocks'}]}
      panel={panel}
      actions={<><button className="dbtn ghost"><DI n="search" s={2}/> Availability</button><button className="dbtn ghost"><DI n="lock" s={1.8}/> Block</button><button className="dbtn primary"><DI n="plus" s={2}/> New reservation</button></>}>
      <div className="row between" style={{marginBottom:9}}>
        <span className="row" style={{gap:8}}><button className="dbtn sm ghost"><DI n="chevL" s={2}/></button><span style={{fontWeight:600,fontSize:13}}>25 May – 7 Jun</span><button className="dbtn sm ghost"><DI n="chevR" s={2}/></button><button className="dbtn sm ghost">Today</button>
        <span className="vseg" style={{marginLeft:6}}>{[['all','All'],['air','Airbnb'],['book','Booking'],['dir','Direct']].map(c=><span key={c[0]} className={"vs"+(ch===c[0]?' on':'')} onClick={()=>setCh(c[0])}>{c[1]}</span>)}</span></span>
        <span className="row" style={{gap:12,fontSize:10.5,color:'var(--tx-2)'}}>
          <span className="row" style={{gap:5}}><span className="mdot" style={{background:'#e08e89',width:8,height:8,borderRadius:3}}/>Airbnb</span>
          <span className="row" style={{gap:5}}><span className="mdot" style={{background:'#9fb4ee',width:8,height:8,borderRadius:3}}/>Booking</span>
          <span className="row" style={{gap:5}}><span className="mdot" style={{background:'#6cc79c',width:8,height:8,borderRadius:3}}/>Direct</span>
          <span className="row" style={{gap:5}}><span className="mdot" style={{background:'var(--indigo)',width:13,height:5,borderRadius:3}}/>Task</span>
        </span>
      </div>
      <div className="fbar" style={{marginBottom:10}}><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft"><b>Friday spotted 2 orphan nights</b> — RC-7 (2 Jun) &amp; KS-5 (9 Jun) sit between bookings, plus a 1-night gap at GBH-B4. Auto-discount them or drop the min-stay to fill.</span><span className="fb"><button className="dbtn sm" onClick={()=>window.fadToast&&window.fadToast('Applied −15% orphan-night rule to 3 gaps','green')}>Fill gaps</button></span></div>
      <div className="panel" style={{padding:0,overflowX:'auto'}}>
        <div style={{minWidth:1180}}>
          <div className="mcalbar-h">
            <div style={{flex:'0 0 170px',position:'sticky',left:0,background:'var(--bg-2)',zIndex:3,borderRight:'1px solid var(--line-2)'}}/>
            <div style={{flex:1,display:'grid',gridTemplateColumns:'repeat(14,1fr)'}}>
              {days.map((d,i)=><div key={i} className={"mcal-dh"+(d[3]?' wknd':'')}>{d[0]}<b>{d[1]}</b></div>)}
            </div>
          </div>
          {props.map((p,i)=>(
            <div key={i} className="mcalrow">
              <div style={{flex:'0 0 170px',position:'sticky',left:0,background:'var(--card)',zIndex:2,borderRight:'1px solid var(--line-2)',display:'flex',alignItems:'center',gap:8,padding:'0 11px',cursor:'pointer'}} onClick={()=>{window.__FADBACK='cal';window.FADGO('property');}}>
                <span className="mdot" style={{background:p.occ==='red'?'var(--red)':p.occ==='amber'?'var(--amber)':'var(--green)',width:7,height:7}}/>
                <div style={{minWidth:0}}><div style={{fontFamily:'var(--mono)',fontSize:10,fontWeight:600}}>{p.c}</div><div className="faint" style={{fontSize:9.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.n}</div></div>
              </div>
              <div className="mcaltrack" style={{minWidth:1010,height:48}}>
                {Array.from({length:13},(_,g)=><span key={g} className="gl" style={{left:pct(g+1)+'%'}}/>)}
                {p.bars.map((b,j)=><div key={j} className={"mcalbar "+b[0]} style={{top:10,left:'calc('+pct(b[1])+'% + 2px)',width:'calc('+pct(b[2])+'% - 4px)',cursor:'pointer',opacity:(ch==='all'||ch===b[0])?1:0.16,transition:'opacity .2s'}} onClick={()=>{window.__FADBACK='cal';window.FADGO('reservation');}}>{b[3]}</div>)}
                {p.tasks.map((t,j)=><span key={j} className="mcaltask" style={{left:'calc('+pct(t)+'% + 3px)',width:'calc('+pct(1)+'% - 6px)'}}/>)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="faint mono" style={{fontSize:10,marginTop:10}}>14 days · 27 properties · 31 reservations in window · scroll for more</div>
    </Shell>
  );
}

/* ---------- 7 · All tasks (dense, filterable) ---------- */
function ScreenAllTasks(){
  const rows=[
    ['BW-C4','Investigate worsening leak','maintenance','Bryan','Today 08:00','In progress','indigo','urgent','Guest in','red','Rs 0'],
    ['SD-10','Water Issue','maintenance','Ishant','Today 09:00','Open','gray','urgent','Vacant','green','Rs 705'],
    ['GBH-B4','Deep clean — guest turnover','housekeeping','Ishant','by 15:00','Scheduled','violet','high','Check-in','amber','Rs 545'],
    ['RC-7','Lower the dining table','maintenance','Catherine','Today 11:00','Open','gray','med','Check-in','amber','Rs 90'],
    ['GBH-C5','Replace shower head','maintenance','Bryan','Done 13:00','Done','green','med','Vacant','green','Rs 240'],
    ['VA-3','Internet top up','admin','Ishant','Overdue 5d','Blocked','red','high','Vacant','green','Rs 0'],
    ['RCN-4','Place anti-odor valve','maintenance','Matthieu','Tomorrow','Open','gray','low','Vacant','green','Rs 120'],
    ['GBH-C8','Quarterly inspection','inspection','Catherine','Thu 4 Jun','Scheduled','violet','med','Vacant','green','Rs 0'],
    ['LB-2','Readjust syndic fee','admin','—','Overdue','Open','gray','med','Vacant','green','Rs 0'],
    ['KS-5','AC service','maintenance','Matthieu','Fri 5 Jun','Open','gray','low','Vacant','green','Rs 380'],
  ];
  const primap={urgent:'urgent',high:'high',med:'med',low:'low'};
  const INIT={Bryan:'BR',Ishant:'IA',Catherine:'CA',Matthieu:'MD'};
  const AREA={'BW-C4':'Flic en Flac','SD-10':'Tamarin','GBH-B4':'Grand Baie','RC-7':'Pereybère','GBH-C5':'Grand Baie','VA-3':'Vacoas','RCN-4':'Rivière Noire','GBH-C8':'Grand Baie','LB-2':'Bel Ombre','KS-5':'Flic en Flac'};
  const openRow=r=>window.FADTASK&&window.FADTASK.open({code:r[0],title:r[1],dept:r[2],due:r[4],status:r[5],statusTone:r[6],pri:primap[r[7]],occ:r[8],occTone:r[9],who:INIT[r[3]]||(r[3]==='—'?'':r[3]),addr:AREA[r[0]]||'',cost:r[10]});
  return (
    <Shell active="ops" eyebrow="OPERATIONS" title="All tasks" sub="Every task across properties · 187 this week"
      tabs={opsTabs('ta')}
      actions={<><button className="dbtn ghost"><DI n="filter" s={2}/> Filter</button><button className="dbtn ghost">Export</button><button className="dbtn primary"><DI n="plus" s={2}/> New task</button></>}>
      <div className="row" style={{gap:7,flexWrap:'wrap',marginBottom:6}}>
        <span className="vseg"><span className="vs on">All</span><span className="vs">Open</span><span className="vs">Overdue</span><span className="vs">Done</span></span>
        <span className="aichip">Dept: all <DI n="chevD" s={2} style={{width:11,height:11}}/></span>
        <span className="aichip">Property: all <DI n="chevD" s={2} style={{width:11,height:11}}/></span>
        <span className="aichip">Assignee: all <DI n="chevD" s={2} style={{width:11,height:11}}/></span>
        <span className="aichip">Priority: all <DI n="chevD" s={2} style={{width:11,height:11}}/></span>
        <span className="grow" style={{flex:1}}/>
        <span className="faint mono" style={{fontSize:10.5}}>10 of 187</span>
      </div>
      <div className="panel" style={{padding:'12px 6px'}}>
        <table className="tbl">
          <thead><tr><th>Property</th><th>Task</th><th>Dept</th><th>Assignee</th><th>Due</th><th>Occupancy</th><th>Pri</th><th>Status</th><th style={{textAlign:'right'}}>Cost</th></tr></thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={i} className="tdrow" onClick={()=>openRow(r)}>
                <td><span className="pcodeD">{r[0]}</span></td>
                <td className="tt">{r[1]}</td>
                <td className="faint">{r[2]}</td>
                <td>{r[3]==='—'?<span className="bdg amber">unassigned</span>:<span className="row" style={{gap:6}}><span className="av1" style={{width:22,height:22,fontSize:8}}>{r[3].split(' ').map(w=>w[0]).join('')}</span><span style={{fontSize:11.5}}>{r[3]}</span></span>}</td>
                <td className="mono faint" style={{whiteSpace:'nowrap'}}>{r[4]}</td>
                <td><span className={"bdg "+r[9]+" dot"}>{r[8]}</span></td>
                <td><PriD level={primap[r[7]]}/></td>
                <td><span className={"bdg "+r[6]}>{r[5]}</span></td>
                <td className="mono" style={{textAlign:'right',color:r[10]==='Rs 0'?'var(--tx-3)':'var(--tx)'}}>{r[10]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/* ---------- 6 · Inbox (editable draft, AI in side panel) ---------- */
function ScreenInbox(){
  const H = useHealth();
  const FS = window.FADSTATE;
  const [itab,setItab] = React.useState('all');
  const [typeF,setTypeF] = React.useState('all');
  const [iq,setIq] = React.useState('');
  const [showOrig,setShowOrig] = React.useState(false);
  const threads=[
    {av:'ML',nm:'Marie L.',prop:'GBH-B4',pv:"Hi! What time can we check in? Flight lands 1pm",t:'4m',ch:'Airbnb',type:'guest',status:'unread',draft:true,on:true},
    {av:'DK',nm:'Dieter K.',prop:'BW-C4',pv:'Is early check-out possible on Sunday?',t:'22m',ch:'Airbnb',type:'guest',status:'unread',draft:true},
    {av:'NH',nm:'Nitzana Holdings',prop:'SD-10',pv:'When will the April payout land?',t:'40m',ch:'Owner',type:'owner',status:'pending'},
    {av:'CL',nm:'Cleanline Supplies',prop:'—',pv:'Invoice #2208 attached — Rs 2,708',t:'1h',ch:'Vendor',type:'vendor',status:'pending'},
    {av:'AB',nm:'Anaïs B.',prop:'GBH-C8',pv:'The AC in the bedroom is quite loud at night',t:'2h',ch:'Airbnb',type:'guest',status:'unread',draft:true},
    {av:'GB',nm:'GBH Co-ownership',prop:'GBH',pv:'Can we move the AGM to the 14th?',t:'2h',ch:'Syndic',type:'syndic',status:'unread'},
    {av:'NH',nm:'N. Holdings · Design',prop:'SD-10',pv:'Approving the living-room moodboard?',t:'4h',ch:'Design',type:'design',status:'pending'},
    {av:'JO',nm:'James O.',prop:'SD-10',pv:"You: water's sorted, sorry for the trouble!",t:'1h',ch:'Booking',type:'guest',status:'done'},
    {av:'TR',nm:'Tomás R.',prop:'VA-3',pv:'Can you recommend a driver for the airport?',t:'5h',ch:'Direct',type:'guest',status:'pending'},
    {av:'MR',nm:'MRA · Tourism Tax',prop:'—',pv:'Q2 remittance reminder',t:'1d',ch:'Other',type:'other',status:'done'},
    {av:'PS',nm:'Priya & Sam',prop:'RC-7',pv:'Thanks, the table is perfect now 🙏',t:'3h',ch:'Direct',type:'guest',status:'done'},
  ];
  const TYPES={guest:['Guest','green'],owner:['Owner','violet'],vendor:['Vendor','amber'],syndic:['Syndic','indigo'],design:['Design','indigo'],other:['Other','gray']};
  const typeFilters=[['all','All types'],['guest','Guests'],['owner','Owners'],['vendor','Vendors'],['syndic','Syndic'],['design','Design'],['other','Other']];
  const needsCount=threads.filter(t=>t.status!=='done').length;
  const shownThreads=threads.filter(t=> (itab==='needs'?t.status!=='done':true) && (typeF==='all'||t.type===typeF) && (!iq || (t.nm+' '+t.pv+' '+t.prop+' '+t.ch).toLowerCase().includes(iq.toLowerCase())));
  const panel=(
    <div className="daside">
      <div className="afp-h"><div className="r1"><span className="tt"><DI n="doc" s={1.6} style={{color:'var(--indigo-bright)'}}/> Reservation</span>{FS? <FS.SyncChip source="Guesty" health={H}/> : <span className="srcgy srcbz" style={{color:'#5fd09a'}}>guesty</span>}</div></div>
      <div className="afp-body" style={{gap:0}}>
        {FS && H==='failed' && <div className="prov failed" style={{marginBottom:10}}><DI n="alert" s={1.6}/><span>Reservation data unavailable — Guesty didn't respond. Showing nothing rather than guessing.</span></div>}
        <div className="ibctx"><span className="cl">Property</span><span className="cv"><span className="pcodeD" style={{fontSize:10}}>GBH-B4</span> Apt with Pool &amp; Gym</span></div>
        <div className="ibctx"><span className="cl">Guest</span><span className="cv">Marie L. · 2 guests <span className="bdg gray" style={{marginLeft:4}}>★ 4.9 · returning</span></span></div>
        <div className="ibctx"><span className="cl">Stay</span><span className="cv">1 – 4 Jun · 3 nights</span></div>
        <div className="ibctx"><span className="cl">Check-in</span><span className="cv">Today 15:00</span></div>
        <div className="ibctx"><span className="cl">Channel</span><span className="cv">Airbnb · #HMABF community</span></div>
        <div className="ibctx"><span className="cl">Payout</span><span className="cv mono">Rs 42,000</span></div>
        <div className="dml" style={{margin:'14px 0 8px'}}>Linked tasks <span className="rule"/></div>
        <div className="panel" style={{padding:'9px 11px'}}><div className="between"><div className="row" style={{gap:8}}><span className="pcodeD" style={{fontSize:10}}>GBH-B4</span><span style={{fontSize:12}}>Turnover clean</span></div><span className="bdg violet">15:00 · IA</span></div></div>
        <button className="dbtn ghost sm" style={{marginTop:10}}><DI n="spark" s={1.6}/> Ask Friday about this stay</button>
      </div>
    </div>
  );
  return (
    <Shell active="inbox" eyebrow="INBOX" title="Inbox" sub="Guest conversations · 3 open"
      tabs={[{l:'All',ct:threads.length,on:itab==='all',fn:()=>setItab('all')},{l:'Needs reply',ct:needsCount,on:itab==='needs',fn:()=>setItab('needs')},{l:'Team',ct:2,on:itab==='team',fn:()=>setItab('team')}]} panel={panel} panelLabel={['Reservation','doc']}
      actions={<><button className="dbtn ghost"><DI n="filter" s={2}/> Filter</button><button className="dbtn primary"><DI n="plus" s={2}/> Compose</button></>}>
      <div className="inboxlay">
        {itab==='team' ? <window.FADTEAM.ScreenTeamChat inline/> : <React.Fragment>
        <div className="ibthreads">
          <div className="ibsearch"><DI n="search" s={2} style={{color:'var(--tx-3)',flex:'0 0 auto'}}/><input className="finput" value={iq} onChange={e=>setIq(e.target.value)} placeholder="Search conversations…"/>{iq&&<span className="ibsearch-x" onClick={()=>setIq('')}><DI n="x" s={2}/></span>}</div>
          <div className="ibfilters">{typeFilters.map(f=><span key={f[0]} className={"ibfilter"+(typeF===f[0]?' on':'')} onClick={()=>setTypeF(f[0])}>{f[1]}</span>)}</div>
          {shownThreads.length===0 && <div className="faint" style={{padding:'24px 14px',fontSize:12.5,textAlign:'center'}}>Nothing here — all caught up.</div>}
          {shownThreads.map((th,i)=>(
            <div key={i} className={"ibth"+(th.on?' on':'')} onClick={()=>window.__FADPANELOPEN&&window.__FADPANELOPEN(true)} style={{cursor:'pointer'}}>
              <span className="av1" style={{flex:'0 0 30px',width:30,height:30}}>{th.av}</span>
              <div className="ibm">
                <div className="nm" style={{fontWeight:th.status==='unread'?700:500}}>{th.nm}{th.status==='unread'&&<span className="mdot" style={{background:'var(--indigo)',width:7,height:7}}/>}{th.status==='pending'&&<span className="ib-pending" title="Read but not yet addressed">awaiting</span>}<span className="t">{th.t}</span></div>
                <div className="pv">{th.pv}</div>
                <div className="mt2"><span className={"bdg "+TYPES[th.type][1]} style={{height:15,fontSize:8.5}}>{TYPES[th.type][0]}</span>{th.prop!=='—'&&<span className="pcodeD" style={{padding:'1px 5px',fontSize:9}}>{th.prop}</span>}<span>{th.ch}</span>{th.draft&&<span className="bdg indigo" style={{height:16}}>AI draft</span>}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="ibconv">
          <div className="ibconv-h">
            <span className="av1" style={{width:30,height:30}}>ML</span>
            <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13.5}}>Marie L.</div><div className="faint" style={{fontSize:11}}>GBH-B4 · check-in today 15:00 · Airbnb</div></div>
            <span className="wa-timer" title="WhatsApp 24-hour customer-service window — free-form replies allowed until it closes"><DI n="clock" s={1.7}/> WhatsApp · 19h 42m</span>
            <span className={"lang-tog"+(showOrig?' on':'')} onClick={()=>setShowOrig(o=>!o)} title="Marie writes in French — Friday shows an English translation"><DI n="msg" s={1.6}/> {showOrig?'FR · original':'FR → EN'}</span>
            <button className="dbtn sm ghost"><DI n="ops" s={1.8}/> Task</button>
            <button className="dbtn sm ghost"><DI n="doc" s={1.8}/> Reservation</button>
            <span className="ibconv-actions">
              <span className="ib-act" title="Assign to teammate" onClick={()=>window.fadToast&&window.fadToast('Assigned to Mary')}><DI n="users" s={1.7}/></span>
              <span className="ib-act" title="Snooze until tomorrow" onClick={()=>window.fadToast&&window.fadToast('Snoozed until 9am tomorrow')}><DI n="clock" s={1.7}/></span>
              <span className="ib-act" title="Mark unread" onClick={()=>window.fadToast&&window.fadToast('Marked unread')}><DI n="unread" s={1.7}/></span>
              <span className="ib-act resolve" title="Resolve conversation" onClick={()=>window.fadToast&&window.fadToast('Conversation resolved','green')}><DI n="check" s={2}/></span>
            </span>
          </div>
          <div className="ibmsgs">
            {FS && <FS.StateBanner surface="this inbox" health={H}/>}
            <div className="ibmsg">
              <div className="who">Marie L. · 09:02 {!showOrig&&<span className="tr-tag"><DI n="spark" s={1.5}/> translated · FR</span>}</div>
              <div className="b">{showOrig?'Bonjour ! Nous sommes ravis de notre séjour 😊 À quelle heure pouvons-nous arriver ? Notre vol atterrit vers 13h.':"Hi! We're so excited for our stay 😊 What time can we check in? Our flight lands around 1pm."}</div>
              <div className="mt">09:02</div>
            </div>
            <div className="ibmsg me"><div className="b">Bonjour Marie ! Bienvenue — nous avons hâte de vous accueillir. Je vérifie l'horaire de préparation de votre appartement.</div><div className="mt">09:05 · you</div></div>
            <div className="ibmsg">
              <div className="who">Marie L. · 09:06 {!showOrig&&<span className="tr-tag"><DI n="spark" s={1.5}/> translated · FR</span>}</div>
              <div className="b">{showOrig?'Parfait, merci ! Une arrivée anticipée est-elle possible ?':'Amazing, thank you! Is early check-in possible?'}</div>
              <div className="mt">09:06</div>
            </div>
          </div>
          <div className="ibcomp">
            <div className="ibdraft-tag"><span className="bdg indigo"><DI n="spark" s={1.5}/> Friday draft</span><span className="faint">replies in Marie's language · Français</span><span className="grow" style={{flex:1}}/>{FS? <FS.ConfBar pct={88} health={H}/> : <span className="faint mono" style={{fontSize:9}}>conf 88%</span>}</div>
            <div className="ibdraft">Bonjour Marie ! L'arrivée se fait à partir de <b>15h00</b> aujourd'hui. Votre appartement a une rotation le jour même, nous ne pouvons donc pas ouvrir plus tôt — mais vous pouvez <b>déposer vos bagages à la réception dès 13h</b> et profiter de Grand Baie en attendant. À très bientôt ! 🌴<span className="cur"/></div>
            {FS && <div style={{marginTop:9}}><FS.Provenance health={H}/></div>}
            <div className="ibcomp-actions">
              <span className="aichip ai"><DI n="spark" s={1.6}/> Ask Friday</span>
              <span className="grow" style={{flex:1}}/>
              {H==='failed'
                ? <button className="dbtn sm" disabled style={{opacity:.5,cursor:'not-allowed'}}><DI n="alert" s={1.8}/> Send unavailable</button>
                : <button className="dbtn primary" onClick={()=>window.fadToast&&window.fadToast(H==='fallback'?'Sent — flagged for review (ungrounded)':'Reply sent to Marie','green')}><DI n="msg" s={1.8}/> Send</button>}
            </div>
          </div>
        </div>
        </React.Fragment>}
      </div>
    </Shell>
  );
}

/* ---------- 5 · Live map ---------- */
function ScreenMap(){
  const pins=[
    {x:34,y:30,av:'BR',st:'on',tag:'GBH-C5 · shower'},
    {x:52,y:24,av:'CA',st:'enr',tag:'en route · GBH-C8'},
    {x:64,y:62,av:'IA',st:'urgent',tag:'SD-10 · leak'},
    {x:44,y:50,av:'MD',st:'idle',tag:'stand-by'},
  ];
  const props=[[28,42],[40,26],[58,34],[50,58],[70,55],[36,64],[62,46],[24,52],[46,38]];
  const stcol={on:'var(--green)',enr:'var(--amber)',urgent:'var(--red)',idle:'var(--tx-3)'};
  const list=[
    {av:'BR',nm:'Bryan Ramluckun',task:'Replace shower head · GBH-C5',st:'on',stl:'On task · 18m',dot:'var(--green)'},
    {av:'CA',nm:'Catherine Appadoo',task:'Inspection · GBH-C8',st:'enr',stl:'En route · ETA 9m',dot:'var(--amber)'},
    {av:'IA',nm:'Ishant Ayadassen',task:'Water Issue · SD-10',st:'urgent',stl:'Urgent · on site',dot:'var(--red)'},
    {av:'MD',nm:'Matthieu Duval',task:'Stand-by · West',st:'idle',stl:'Available',dot:'var(--tx-3)'},
  ];
  return (
    <Shell active="ops" eyebrow="OPERATIONS" title="Live map" sub="Field staff with active tasks · updated 2m ago"
      tabs={opsTabs('mp')}
      actions={<><div className="vseg"><span className="vs on">All</span><span className="vs">North</span><span className="vs">West</span></div><button className="dbtn ghost"><DI n="clock" s={1.9}/> Refresh</button></>}>
      <div className="fbar">
        <span className="fi"><DI n="spark" s={1.6}/></span>
        <span className="ft"><b>Friday.</b> Bryan &amp; Catherine are both in Grand Baie and free after 11:00 — the SD-10 follow-up in Tamarin is uncovered this afternoon.</span>
        <span className="fb"><button className="dbtn sm">Rebalance</button><button className="dbtn ghost sm">Review <DI n="chevR" s={2}/></button></span>
      </div>
      <div className="maplayout" style={{marginTop:14}}>
        <div className="mapcanvas">
          <div className="grid"/>
          <div className="coast" style={{left:'8%',top:'12%',width:'56%',height:'52%'}}/>
          <div className="coast" style={{left:'40%',top:'42%',width:'50%',height:'46%'}}/>
          <span className="zonelbl" style={{left:'16%',top:'15%'}}>North · Grand Baie</span>
          <span className="zonelbl" style={{left:'58%',top:'78%'}}>West · Flic en Flac · Tamarin</span>
          {props.map((p,i)=><span key={i} className="mprop" style={{left:p[0]+'%',top:p[1]+'%'}}/>)}
          {pins.map((p,i)=>(
            <div key={i} className="mpin" style={{left:p.x+'%',top:p.y+'%'}}>
              <span className={"av "+p.st}>{p.st!=='idle'&&<span className="ring" style={{borderColor:stcol[p.st]}}/>}{p.av}</span>
              <span className="tag">{p.tag}</span>
            </div>
          ))}
          <div className="mlegend">
            <span className="li"><span className="mdot" style={{background:'var(--green)'}}/> On task</span>
            <span className="li"><span className="mdot" style={{background:'var(--amber)'}}/> En route</span>
            <span className="li"><span className="mdot" style={{background:'var(--red)'}}/> Urgent</span>
            <span className="li"><span className="mdot" style={{background:'var(--tx-3)'}}/> Stand-by</span>
          </div>
        </div>
        <div className="maplist">
          <div className="dml" style={{margin:'10px 0 4px'}}>On shift <span className="ct">4</span><span className="rule"/></div>
          {list.map((s,i)=>(
            <div key={i} className="mstaff">
              <span className="mdot" style={{background:s.dot}}/>
              <span className="av1">{s.av}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12.5,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.nm}</div>
                <div className="faint" style={{fontSize:10.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.task}</div>
              </div>
              <span className={"bdg "+(s.st==='on'?'green':s.st==='enr'?'amber':s.st==='urgent'?'red':'gray')} style={{flex:'0 0 auto'}}>{s.stl.split(' · ')[0]}</span>
            </div>
          ))}
          <div className="gate" style={{borderStyle:'solid',marginTop:12}}><DI n="pin" s={1.7} style={{color:'var(--indigo-bright)'}}/><span>Locations shown only while a task is active — staff control sharing in their app.</span></div>
        </div>
      </div>
    </Shell>
  );
}
