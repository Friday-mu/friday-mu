/* FAD V2 — Manager desktop · Task detail slide-over drawer + toast system.
   Shared across every screen that has a task table. Open with:
       window.FADTASK.open({ code, title, dept, due, occ, occTone, pri,
                             status, statusTone, who, addr, cost })
   Mounted once inside <Shell> (see fad-desktop.jsx). Lightly stateful:
   tabs work, status/priority/assignee mutate, comments post, actions toast. */

/* ---------------- tiny pub/sub store ---------------- */
const _tdStore = { cur:null, subs:new Set() };
function _emit(){ _tdStore.subs.forEach(f=>f(_tdStore.cur)); }
function _tdOpen(t){ _tdStore.cur = t?{kind:'task',data:t}:null; _emit(); }
function _openKind(kind,data){ _tdStore.cur = data?{kind,data}:null; _emit(); }
function _tdClose(){ _tdStore.cur=null; _emit(); }
function _tdSub(f){ _tdStore.subs.add(f); return ()=>_tdStore.subs.delete(f); }

/* ---------------- toast store ---------------- */
const _toastStore = { items:[], subs:new Set(), id:0 };
function fadToast(text, tone){
  const id = ++_toastStore.id;
  _toastStore.items = [..._toastStore.items, { id, text, tone:tone||'' }];
  _toastStore.subs.forEach(f=>f(_toastStore.items));
  setTimeout(()=>{
    _toastStore.items = _toastStore.items.filter(x=>x.id!==id);
    _toastStore.subs.forEach(f=>f(_toastStore.items));
  }, 3400);
}
window.fadToast = fadToast;

/* ---------------- staff + detail data ---------------- */
const TD_STAFF = {
  BR:'Bryan Ramluckun', IA:'Ishant Ayadassen', CA:'Catherine Appadoo',
  MD:'Matthieu Duval', FH:'Franny Henri',
};
const TD_ZONE = { BR:'North', IA:'West', CA:'North', MD:'stand-by', FH:'Ops' };
const TD_ASSIGNABLE = [
  ['BR','Bryan Ramluckun','North · 88% load'],
  ['IA','Ishant Ayadassen','West · 64% load'],
  ['CA','Catherine Appadoo','North · 52% load'],
  ['MD','Matthieu Duval','stand-by · 30% load'],
];

/* rich, hand-authored detail for the hero tasks; others fall back by dept */
const TD_DETAILS = {
  'BW-C4':{
    guest:'Sebastián M.', res:'GY-q7ubP9Ak', resDates:'31 May – 4 Jun · 4 nights',
    desc:"In-house guest reports the under-sink leak in the master bath is worsening — water now pooling on the floor overnight. Bryan dispatched as urgent; guest briefed and given the spare bath.",
    friday:{ sum:"Recurring signal — this is the <b>3rd plumbing call at BW-C4 in 90 days</b>. Same shut-off valve flagged on the GBH-C5 pump fault pattern. Likely a failed mixer cartridge, not the trap.",
      sug:"Bring a 35mm cartridge + PTFE tape. If the valve body is corroded, escalate to a plumber rather than patch — Friday drafted the quote request." },
    checklist:[
      ['Isolate water at the master-bath shut-off', true, 2],
      ['Photograph the leak source before any work', true, 3],
      ['Replace mixer cartridge / trap seal', false, 0],
      ['Run 5-min flow test, check for drips', false, 0],
      ['Dry floor + confirm with guest', false, 0],
    ],
    supplies:[['Mixer cartridge 35mm','1','Rs 0 · from van stock'],['PTFE tape','1','Rs 0']],
    expense:null,
    photos:3,
    activity:[
      ['IA','Ishant Ayadassen','reassigned to Bryan — closer to Flic en Flac','08:02'],
      ['FR','Friday','flagged as recurring (3rd call in 90d) and raised priority to urgent','08:01'],
      ['BR','Bryan Ramluckun','accepted · ETA 08:25','08:05'],
    ],
    note:"Guest is in-house — knock, don't use the master key.",
  },
  'SD-10':{
    guest:null, res:null, resDates:'Vacant · next check-in 6 Jun',
    desc:"Low water pressure across the whole villa reported on the last checkout report. Property vacant until 6 Jun — good window for a proper fix before the next guest.",
    friday:{ sum:"Pressure drop correlates with the booster pump cycling. Friday pulled the pump's service log — <b>last serviced 14 months ago</b>, past the 12-month interval.",
      sug:"Check the pressure switch first (cheap), then the pump. Vacant 5 more days — no guest pressure to rush a patch." },
    checklist:[
      ['Read mains pressure at the meter', true, 1],
      ['Inspect booster pump + pressure switch', false, 0],
      ['Test each bathroom + kitchen line', false, 0],
      ['Log pressure readings', false, 0],
    ],
    supplies:[['Pressure switch','1','Rs 705']],
    expense:{ vendor:'Tamarin Hardware', total:'Rs 705', items:'Pressure switch ×1', status:'pending' },
    photos:1,
    activity:[
      ['IA','Ishant Ayadassen','started · on site','09:04'],
      ['FR','Friday','attached pump service log + last 3 pressure readings','09:00'],
    ],
    note:null,
  },
  'GBH-B4':{
    guest:'Marie L.', res:'GBH-B4-0601', resDates:'Check-out 11:00 · next check-in 15:00',
    desc:"Standard turnover deep clean between guests. Tight window — departure 11:00, arrival 15:00. Linen pack staged at the West store.",
    friday:{ sum:"Turnover SLA is <b>4 hours</b>; last turnover here took 3h10. Linen + amenities confirmed in stock. No maintenance flags open on this unit.",
      sug:"Prioritise the master bath regrout spot from last report's photo — guest review mentioned it." },
    checklist:[
      ['Strip + remake all beds (linen pack ×1)', true, 2],
      ['Full bathroom sanitise + restock', false, 0],
      ['Kitchen, surfaces, floors', false, 0],
      ['Restock amenities to par', false, 0],
      ['Final photo set for owner', false, 0],
    ],
    supplies:[['Linen pack (queen)','1','Rs 0'],['Amenity kit','2','Rs 320'],['Cleaning consumables','1','Rs 225']],
    expense:null,
    photos:2,
    activity:[
      ['IA','Ishant Ayadassen','scheduled by Friday draft-plan for 11:15','—'],
      ['FR','Friday','protected a 45-min buffer before the 15:00 check-in','—'],
    ],
    note:"Owner wants a photo set every turnover.",
  },
};
function tdFallback(dept){
  const byDept = {
    maintenance:{ desc:"Maintenance task logged from a field report. Awaiting scheduling against staff availability and parts.",
      friday:"No recurring pattern on this asset. Estimated 45–60 min based on similar jobs.",
      checklist:[['Diagnose on site',false,0],['Carry out repair',false,0],['Test + photograph',false,0]] },
    housekeeping:{ desc:"Housekeeping task between stays. Linen and amenities to par.",
      friday:"Within standard turnover SLA. Supplies confirmed in stock.",
      checklist:[['Clean to standard',false,0],['Restock amenities',false,0],['Photo set',false,0]] },
    admin:{ desc:"Administrative task — no field visit required. Can be cleared from the office queue.",
      friday:"Low-effort office task. Friday can auto-clear once the action is confirmed.",
      checklist:[['Complete action',false,0],['Log reference',false,0]] },
    inspection:{ desc:"Scheduled inspection. Checklist mirrors the property condition template.",
      friday:"Quarterly inspection due. Last report had no major flags.",
      checklist:[['Exterior + access',false,0],['Interior + appliances',false,0],['Safety + compliance',false,0],['Report + photos',false,0]] },
  };
  return byDept[dept] || byDept.maintenance;
}

/* ---------------- small UI helpers ---------------- */
function TdMenu({items, onPick, onClose}){
  React.useEffect(()=>{
    const h=()=>onClose();
    window.addEventListener('click',h);
    return ()=>window.removeEventListener('click',h);
  },[]);
  return (
    <div className="tdmenu" onClick={e=>e.stopPropagation()}>
      {items.map((it,i)=>(
        <div key={i} className={"tdmenu-it"+(it.danger?' danger':'')} onClick={()=>{onPick(it);}}>
          {it.av && <span className="av1" style={{width:22,height:22,fontSize:8}}>{it.av}</span>}
          <div style={{minWidth:0}}><div style={{fontSize:12.5,fontWeight:600}}>{it.label}</div>{it.sub&&<div className="faint mono" style={{fontSize:9.5}}>{it.sub}</div>}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- the drawer ---------------- */
function TaskDrawer({ task, onClose }){
  const { DI, PriD } = window.FADD;
  const [tab,setTab] = React.useState('overview');
  const [status,setStatus] = React.useState(task ? task.status : '');
  const [statusTone,setStatusTone] = React.useState(task ? task.statusTone : 'gray');
  const [pri,setPri] = React.useState(task ? task.pri : 'med');
  const [who,setWho] = React.useState(task ? task.who : '');
  const [menu,setMenu] = React.useState(null);     // 'assign' | 'pri' | null
  const [comments,setComments] = React.useState([]);
  const [draft,setDraft] = React.useState('');
  const [costApproved,setCostApproved] = React.useState(false);
  const [askOpen,setAskOpen] = React.useState(false);

  React.useEffect(()=>{
    if(task){
      setTab('overview'); setStatus(task.status); setStatusTone(task.statusTone||'gray');
      setPri(task.pri||'med'); setWho(task.who||''); setComments([]); setDraft('');
      setCostApproved(false); setAskOpen(false); setMenu(null);
    }
  },[task]);

  React.useEffect(()=>{
    const onKey=e=>{ if(e.key==='Escape') onClose(); };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[onClose]);

  if(!task) return null;
  const d = TD_DETAILS[task.code] || tdFallback(task.dept);
  const isFallback = !TD_DETAILS[task.code];
  const fridaySum = isFallback ? d.friday : d.friday.sum;
  const fridaySug = isFallback ? null : d.friday.sug;
  const checklist = d.checklist;
  const doneN = checklist.filter(c=>c[1]).length;
  const cost = task.cost || (d.supplies ? 'Rs '+d.supplies.reduce((a,s)=>a+(parseInt((s[2].match(/Rs ([\d,]+)/)||[])[1]?.replace(/,/g,''))||0),0) : 'Rs 0');
  const photos = d.photos || 0;
  const supplies = d.supplies || [];
  const expense = d.expense;
  const baseActivity = d.activity || [];
  const allActivity = [...comments.map(c=>['FG','You (GM)',c.text,'now']), ...baseActivity];

  const setStatusTo = (s,tone)=>{ setStatus(s); setStatusTone(tone); fadToast('Status → '+s, tone==='red'?'red':(tone==='green'?'green':'')); };
  const reassign = it=>{ setWho(it.av); setMenu(null); fadToast('Reassigned to '+it.label.split(' ')[0]); };
  const changePri = it=>{ setPri(it.key); setMenu(null); fadToast('Priority → '+it.key); };
  const postComment = ()=>{ if(!draft.trim())return; setComments([{text:draft.trim()}, ...comments]); setDraft(''); fadToast('Comment posted'); };
  const closeTask = ()=>{ if(status==='Done'){ setStatusTo('Open','gray'); } else { setStatusTo('Done','green'); } };

  const tabs=[['overview','Overview'],['checklist','Requirements'],['photos','Photos'],['supplies','Supplies & cost'],['activity','Activity']];

  const Section = ({label,children,right}) => (
    <div style={{marginBottom:18}}>
      <div className="dml" style={{margin:'0 0 9px'}}>{label}{right}<span className="rule"/></div>
      {children}
    </div>
  );

  return (
    <>
      <div className="tdscrim" onClick={onClose}/>
      <aside className="tddrawer" role="dialog" aria-label="Task detail">
        {/* header */}
        <div className="tdh">
          <div className="between" style={{alignItems:'flex-start'}}>
            <div className="row" style={{gap:9,minWidth:0,alignItems:'center'}}>
              <span className="pcodeD">{task.code}</span>
              <span className="bdg gray">{task.dept}</span>
              <span className="faint mono" style={{fontSize:10.5}}>{task.addr||''}</span>
            </div>
            <div className="row" style={{gap:6,flex:'0 0 auto'}}>
              <button className={"aichip ai"} onClick={()=>setAskOpen(true)}><DI n="spark" s={1.7}/> Ask Friday</button>
              <span className="icbtn" style={{cursor:'pointer'}} onClick={onClose}><DI n="x" s={2}/></span>
            </div>
          </div>
          <h2 className="tdtitle">{task.title}</h2>
          <div className="tdmeta">
            <span className="tdm-item"><span className="k">Priority</span>
              <span className="tdm-set" onClick={e=>{e.stopPropagation(); setMenu(menu==='pri'?null:'pri');}}>
                <PriD level={pri}/><span style={{textTransform:'capitalize'}}>{pri}</span><DI n="chevD" s={2} style={{width:11,height:11,opacity:.6}}/>
                {menu==='pri' && <TdMenu onClose={()=>setMenu(null)} onPick={changePri}
                  items={[{key:'urgent',label:'Urgent'},{key:'high',label:'High'},{key:'med',label:'Medium'},{key:'low',label:'Low'}]}/>}
              </span>
            </span>
            <span className="tdm-item"><span className="k">Status</span><span className={"bdg "+statusTone}>{status}</span></span>
            <span className="tdm-item"><span className="k">Due</span><span className="mono">{task.due}</span></span>
            <span className="tdm-item"><span className="k">Occupancy</span><span className={"bdg "+(task.occTone||'gray')+" dot"}>{task.occ||'—'}</span></span>
            <span className="tdm-item"><span className="k">Assignee</span>
              <span className="tdm-set" onClick={e=>{e.stopPropagation(); setMenu(menu==='assign'?null:'assign');}}>
                {who ? <><span className="av1" style={{width:20,height:20,fontSize:8}}>{who}</span><span>{TD_STAFF[who]||who}</span></> : <span className="bdg amber">unassigned</span>}
                <DI n="chevD" s={2} style={{width:11,height:11,opacity:.6}}/>
                {menu==='assign' && <TdMenu onClose={()=>setMenu(null)} onPick={reassign}
                  items={[...TD_ASSIGNABLE.map(s=>({av:s[0],label:s[1],sub:s[2]})),{av:null,label:'Unassign',sub:'send back to queue',danger:true}]}/>}
              </span>
            </span>
            <span className="tdm-item"><span className="k">Cost</span><span className="mono" style={{color:cost==='Rs 0'?'var(--tx-3)':'var(--tx)'}}>{cost}</span></span>
          </div>
        </div>

        {/* tabs */}
        <div className="tdtabs">
          {tabs.map(t=>(
            <span key={t[0]} className={"tdtab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>
              {t[1]}
              {t[0]==='checklist' && <span className="ct">{doneN}/{checklist.length}</span>}
              {t[0]==='photos' && photos>0 && <span className="ct">{photos}</span>}
              {t[0]==='activity' && allActivity.length>0 && <span className="ct">{allActivity.length}</span>}
            </span>
          ))}
        </div>

        {/* body */}
        <div className="tdbody">
          {tab==='overview' && <>
            {d.note && <div className="gate" style={{marginBottom:16}}><DI n="shield" s={1.8} style={{color:'var(--amber)',flex:'0 0 auto'}}/><span>{d.note}</span></div>}
            <Section label="Description">
              <p style={{margin:0,fontSize:13.5,lineHeight:1.6,color:'var(--tx)'}}>{d.desc}</p>
            </Section>
            <Section label="Friday">
              <div className="fai">
                <div className="fh"><span style={{color:'var(--indigo-bright)'}}><DI n="spark" s={1.6}/></span><span className="ftt">Summary & suggested fix</span></div>
                <p dangerouslySetInnerHTML={{__html:fridaySum}}/>
                {fridaySug && <p style={{marginTop:9,color:'var(--tx-2)'}} dangerouslySetInnerHTML={{__html:'<b class="hl">Suggested:</b> '+fridaySug}}/>}
                <div className="acts"><button className="dbtn sm" onClick={()=>fadToast('Asked Friday to draft the parts list')}>Draft parts list</button><button className="dbtn ghost sm" onClick={()=>setAskOpen(true)}>Ask a question</button></div>
              </div>
            </Section>
            <Section label="Linked records">
              <div className="panel" style={{padding:'4px 13px'}}>
                <LinkRow ic="home" k="Property" v={task.code+' · '+(task.addr||'')} hint="Open property record"/>
                {d.guest && <LinkRow ic="users" k="Guest" v={d.guest} hint="Open guest profile"/>}
                <LinkRow ic="doc" k="Reservation" v={d.res || d.resDates} hint={d.res?'Open reservation':null}/>
              </div>
            </Section>
            <Section label="Requirements" right={<span className="ct">{doneN}/{checklist.length} done</span>}>
              <ChecklistMini checklist={checklist} onTab={()=>setTab('checklist')}/>
            </Section>
          </>}

          {tab==='checklist' && <>
            <div className="faint" style={{fontSize:11.5,marginBottom:11,display:'flex',alignItems:'center',gap:7}}>
              <DI n="shield" s={1.7}/> Read-only mirror of the field app — {doneN} of {checklist.length} complete
            </div>
            <div className="panel" style={{padding:'4px 13px'}}>
              {checklist.map((c,i)=>(
                <div key={i} className="tdcheck">
                  <span className={"tdcbx"+(c[1]?' on':'')}>{c[1] && <DI n="check" s={3}/>}</span>
                  <span style={{flex:1,fontSize:13,color:c[1]?'var(--tx-2)':'var(--tx)',textDecoration:c[1]?'line-through':'none'}}>{c[0]}</span>
                  {c[2]>0 && <span className="faint mono" style={{fontSize:10}}><DI n="cam" s={1.7}/> {c[2]}</span>}
                </div>
              ))}
            </div>
          </>}

          {tab==='photos' && <>
            {photos>0 ? <>
              <div className="faint" style={{fontSize:11.5,marginBottom:11}}>{photos} photo{photos>1?'s':''} uploaded by the field staff</div>
              <div className="tdphotos">
                {Array.from({length:photos}).map((_,i)=>(
                  <div key={i} className="tdphoto" style={{background:`linear-gradient(150deg,${['#26343a','#2b3346','#2e2738','#332b2b'][i%4]},#141b27)`}}>
                    <span className="tdphoto-tag">{i===0?'before':(i===photos-1?'latest':'in progress')}</span>
                  </div>
                ))}
              </div>
            </> : <Empty ic="cam" t="No photos yet" s="Field staff add before / after photos as the task progresses."/>}
          </>}

          {tab==='supplies' && <>
            <Section label="Supplies used">
              {supplies.length ? <div className="panel" style={{padding:'4px 13px'}}>
                {supplies.map((s,i)=>(<div key={i} className="drow"><span style={{fontWeight:500}}>{s[0]} <span className="faint mono" style={{fontSize:10.5}}>×{s[1]}</span></span><span className="faint mono" style={{fontSize:11.5}}>{s[2]}</span></div>))}
              </div> : <Empty ic="box" t="No supplies logged" s="Friday will suggest items once the field report comes in."/>}
            </Section>
            <Section label="Expense / receipt">
              {expense ? <div className="panel">
                <div className="between" style={{marginBottom:9}}><div className="row" style={{gap:9}}><span className="qthumb" style={{width:38,height:38,flex:'0 0 38px'}}/><div><div style={{fontWeight:600,fontSize:13}}>{expense.vendor}</div><div className="faint mono" style={{fontSize:10.5}}>{expense.items}</div></div></div><span className="mono" style={{fontWeight:700}}>{expense.total}</span></div>
                <div className="between">
                  <span className={"bdg "+(costApproved?'green':'amber')}>{costApproved?'approved':'pending approval'}</span>
                  {!costApproved && <button className="dbtn green sm" onClick={()=>{setCostApproved(true);fadToast('Expense approved · '+expense.total,'green');}}><DI n="check" s={2}/> Approve cost</button>}
                </div>
              </div> : <Empty ic="dollar" t="No expense filed" s="Receipts scanned in the field app appear here for approval."/>}
            </Section>
          </>}

          {tab==='activity' && <>
            <div className="tdcomp">
              <span className="av1" style={{width:26,height:26,fontSize:9}}>FG</span>
              <input className="tdcomp-in" placeholder="Add a comment for the field staff…" value={draft}
                onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')postComment();}}/>
              <button className="dbtn primary sm" onClick={postComment}>Post</button>
            </div>
            <div className="tdtimeline">
              {allActivity.map((a,i)=>(
                <div key={i} className="tdact">
                  <span className={"av1"+(a[0]==='FR'?' fr':'')} style={{width:24,height:24,fontSize:8.5,flex:'0 0 24px',...(a[0]==='FR'?{background:'var(--indigo-ghost)',color:'var(--indigo-bright)',borderColor:'var(--indigo-line)'}:{})}}>{a[0]==='FR'?<window.FADD.DI n="spark" s={1.5}/>:a[0]}</span>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:12.5,lineHeight:1.45}}><b>{a[1]}</b> {a[2]}</div><div className="faint mono" style={{fontSize:9.5,marginTop:2}}>{a[3]}</div></div>
                </div>
              ))}
            </div>
          </>}
        </div>

        {/* sticky manager action bar */}
        <div className="tdfoot">
          <button className="dbtn ghost" onClick={e=>{e.stopPropagation(); setMenu(menu==='assign'?null:'assign');}} style={{position:'relative'}}>
            <DI n="users" s={1.9}/> Reassign
            {menu==='assign' && <div style={{position:'absolute',bottom:'120%',left:0}}><TdMenu onClose={()=>setMenu(null)} onPick={reassign} items={[...TD_ASSIGNABLE.map(s=>({av:s[0],label:s[1],sub:s[2]})),{av:null,label:'Unassign',sub:'send back to queue',danger:true}]}/></div>}
          </button>
          <button className="dbtn ghost" onClick={()=>fadToast('Opened reschedule')}> <DI n="cal" s={1.9}/> Reschedule</button>
          <span className="grow"/>
          <button className={"dbtn"+(status==='Done'?'':' green')} onClick={closeTask}>
            {status==='Done' ? <><DI n="undo" s={1.9}/> Reopen</> : <><DI n="check" s={2}/> Mark complete</>}
          </button>
        </div>

        {/* Ask Friday scoped overlay */}
        {askOpen && <TaskAsk task={task} onClose={()=>setAskOpen(false)}/>}
      </aside>
    </>
  );

  function LinkRow({ic,k,v,hint}){
    return (
      <div className="drow" style={{cursor:hint?'pointer':'default'}} onClick={()=>hint&&fadToast(hint)}>
        <span className="row" style={{gap:9}}><span style={{color:'var(--tx-3)'}}><window.FADD.DI n={ic} s={1.8}/></span><span className="faint">{k}</span></span>
        <span className="row" style={{gap:7}}><span style={{fontWeight:500}}>{v}</span>{hint&&<window.FADD.DI n="chevR" s={2} style={{width:13,height:13,color:'var(--tx-3)'}}/>}</span>
      </div>
    );
  }
  function ChecklistMini({checklist,onTab}){
    return (
      <div className="panel" style={{padding:'4px 13px'}}>
        {checklist.slice(0,3).map((c,i)=>(
          <div key={i} className="tdcheck">
            <span className={"tdcbx sm"+(c[1]?' on':'')}>{c[1] && <window.FADD.DI n="check" s={3}/>}</span>
            <span style={{flex:1,fontSize:12.5,color:c[1]?'var(--tx-2)':'var(--tx)',textDecoration:c[1]?'line-through':'none'}}>{c[0]}</span>
          </div>
        ))}
        {checklist.length>3 && <div className="tdmore" onClick={onTab}>+{checklist.length-3} more · view all</div>}
      </div>
    );
  }
  function Empty({ic,t,s}){
    return (
      <div className="tdempty">
        <span className="tdempty-ic"><window.FADD.DI n={ic} s={1.6}/></span>
        <div style={{fontWeight:600,fontSize:13}}>{t}</div>
        <div className="faint" style={{fontSize:11.5,maxWidth:280,textAlign:'center',marginTop:3}}>{s}</div>
      </div>
    );
  }
}

function TaskAsk({ task, onClose }){
  const { DI } = window.FADD;
  const [msgs,setMsgs] = React.useState([
    {t:`This is the <b>${task.code}</b> task — ${task.title.toLowerCase()}. I flagged it as recurring and pre-filled the parts list. Ask me to reassign, reschedule, or draft a guest message.`},
  ]);
  const [v,setV] = React.useState('');
  const send=()=>{
    if(!v.trim())return;
    const q=v.trim(); setV('');
    setMsgs(m=>[...m,{me:true,t:q}]);
    setTimeout(()=>setMsgs(m=>[...m,{t:"On it — I drafted that and it's ready for your approval in the action above.",done:'Draft ready'}]),500);
  };
  return (
    <div className="tdask">
      <div className="tdask-h">
        <span className="row" style={{gap:7,fontWeight:600,fontSize:13}}><span style={{color:'var(--indigo-bright)'}}><DI n="spark" s={1.6}/></span> Ask Friday <span className="afp-chip" style={{color:'var(--indigo-bright)',borderColor:'var(--indigo-line)'}}><DI n="pin" s={2} style={{width:9,height:9}}/> {task.code}</span></span>
        <span className="icbtn" style={{cursor:'pointer',width:28,height:28}} onClick={onClose}><DI n="x" s={2}/></span>
      </div>
      <div className="tdask-body">
        {msgs.map((m,i)=>m.me?(
          <div key={i} className="afm me"><span className="ava me">FG</span><div className="bub" dangerouslySetInnerHTML={{__html:m.t}}/></div>
        ):(
          <div key={i} className="afm"><span className="ava fr"><DI n="spark" s={1.5}/></span><div style={{minWidth:0}}><div className="bub" dangerouslySetInnerHTML={{__html:m.t}}/>{m.done&&<div className="afdone" style={{marginTop:8}}><DI n="check" s={2}/> {m.done}</div>}</div></div>
        ))}
      </div>
      <div className="tdask-comp">
        <input value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send();}} placeholder="Ask or tell Friday to act…"/>
        <span className="snd" onClick={send}><DI n="chevR" s={2.2}/></span>
      </div>
    </div>
  );
}

/* ============ OWNER record drawer ============ */
function OwnerDrawer({ data, onClose }){
  const { DI } = window.FADD;
  const [tab,setTab] = React.useState('overview');
  React.useEffect(()=>{ if(data) setTab('overview'); },[data]);
  React.useEffect(()=>{ const k=e=>{if(e.key==='Escape')onClose();}; window.addEventListener('keydown',k); return ()=>window.removeEventListener('keydown',k); },[onClose]);
  if(!data) return null;
  const o = data;
  const props = o.props || [['GBH-B4','Apt with Pool & Gym','Grand Baie','92%'],['SD-10','Villa Sud','Tamarin','78%']];
  const stmts = o.stmts || [
    ['May 2026','€2,210','sent','3 Jun'],['Apr 2026','€1,980','paid','3 May'],['Mar 2026','€2,640','paid','3 Apr'],['Feb 2026','€1,510','paid','3 Mar'],
  ];
  const go = k => { onClose(); window.FADGO&&window.FADGO(k); };
  return (<>
    <div className="tdscrim" onClick={onClose}/>
    <aside className="tddrawer" style={{width:580}} role="dialog" aria-label="Owner record">
      <div className="tdh">
        <div className="between">
          <div className="row" style={{gap:11,minWidth:0}}>
            <span className="av1" style={{width:42,height:42,fontSize:13}}>{(o.name||'').split(/[ ,]/).filter(Boolean).map(w=>w[0]).slice(0,2).join('')}</span>
            <div style={{minWidth:0}}><span className="tdtitle" style={{fontSize:21,margin:0}}>{o.name}</span>
              <div className="row" style={{gap:6,marginTop:4}}><span className={"bdg "+(o.status==='renewal'?'amber':'gray')}>{o.status||'current'}</span><span className="faint mono" style={{fontSize:10.5}}>since {o.since||'2023'}</span></div></div>
          </div>
          <span className="icbtn" style={{cursor:'pointer'}} onClick={onClose}><DI n="x" s={2}/></span>
        </div>
        <div className="tdmeta" style={{gridTemplateColumns:'1fr 1fr 1fr'}}>
          <span className="tdm-item"><span className="k">Units</span><span className="mono">{props.length}</span></span>
          <span className="tdm-item"><span className="k">YTD payout</span><span className="mono">{o.ytd||'€51,600'}</span></span>
          <span className="tdm-item"><span className="k">Split</span><span className="mono">{o.split||'82 / 18'}</span></span>
        </div>
      </div>
      <div className="tdtabs">
        {[['overview','Overview'],['props','Properties'],['stmts','Statements'],['comms','Comms']].map(t=>(
          <span key={t[0]} className={"tdtab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}{t[0]==='props'&&<span className="ct">{props.length}</span>}{t[0]==='stmts'&&<span className="ct">{stmts.length}</span>}</span>
        ))}
      </div>
      <div className="tdbody">
        {tab==='overview' && <>
          <div className="fai" style={{marginBottom:16}}>
            <div className="fh"><span style={{color:'var(--indigo-bright)'}}><DI n="spark" s={1.6}/></span><span className="ftt">Friday on this owner</span></div>
            <p><b className="hl">{(o.name||'').split(/[ ,]/)[0]}</b> is up for <b>contract renewal</b> in 2 months. Portfolio occupancy is strong ({o.occ||'88%'}) and payouts are trending up — a good moment to propose adding their {o.next||'Tamarin villa'}.</p>
            {o.status==='renewal' && <div className="acts"><button className="dbtn sm" onClick={()=>fadToast('Renewal packet drafted')}>Draft renewal</button></div>}
          </div>
          <div className="dml" style={{marginTop:0}}>Contact <span className="rule"/></div>
          <div className="panel" style={{padding:'4px 13px'}}>
            <div className="drow"><span className="faint">Primary</span><span>{o.contact||'Daniel Harrington'}</span></div>
            <div className="drow"><span className="faint">Email</span><span className="mono" style={{fontSize:11.5}}>{o.email||'d.harrington@example.com'}</span></div>
            <div className="drow"><span className="faint">Agreement</span><span>{o.agreement||'Full management · 18%'}</span></div>
            <div className="drow" style={{borderBottom:'none'}}><span className="faint">Payout method</span><span>{o.payout||'SEPA · monthly'}</span></div>
          </div>
        </>}
        {tab==='props' && <div className="panel" style={{padding:'4px 13px'}}>
          {props.map((p,i)=>(<div key={i} className="drow tdrow" style={{cursor:'pointer'}} onClick={()=>go('property')}>
            <span className="row" style={{gap:10}}><span className="pcodeD">{p[0]}</span><span><div style={{fontWeight:500,fontSize:12.5}}>{p[1]}</div><div className="faint mono" style={{fontSize:10}}>{p[2]}</div></span></span>
            <span className="row" style={{gap:8}}><span className="mono" style={{color:'var(--green)',fontSize:11.5}}>{p[3]} occ</span><DI n="chevR" s={2} style={{width:13,height:13,color:'var(--tx-3)'}}/></span>
          </div>))}
        </div>}
        {tab==='stmts' && <div className="panel" style={{padding:'10px 6px'}}>
          <table className="tbl"><thead><tr><th>Period</th><th>Net payout</th><th>Status</th><th style={{textAlign:'right'}}>Date</th></tr></thead>
          <tbody>{stmts.map((s,i)=>(<tr key={i} className="tdrow" onClick={()=>go('ownerstmt')}>
            <td className="tt">{s[0]}</td><td className="mono" style={{color:'var(--green)'}}>{s[1]}</td><td><span className={"bdg "+(s[2]==='paid'?'green':'amber')}>{s[2]}</span></td><td className="mono faint" style={{textAlign:'right'}}>{s[3]}</td>
          </tr>))}</tbody></table>
        </div>}
        {tab==='comms' && <div className="tdtimeline">
          {[['FR','Friday','sent the May statement + occupancy summary','3 Jun'],['FG','You (GM)','replied re: adding the Tamarin villa','28 May'],['FR','Friday','flagged contract renewal due in 2 months','20 May']].map((a,i)=>(
            <div key={i} className="tdact"><span className={"av1"} style={{width:24,height:24,fontSize:8.5,flex:'0 0 24px',...(a[0]==='FR'?{background:'var(--indigo-ghost)',color:'var(--indigo-bright)',borderColor:'var(--indigo-line)'}:{})}}>{a[0]==='FR'?<DI n="spark" s={1.5}/>:a[0]}</span><div style={{flex:1,minWidth:0}}><div style={{fontSize:12.5,lineHeight:1.45}}><b>{a[1]}</b> {a[2]}</div><div className="faint mono" style={{fontSize:9.5,marginTop:2}}>{a[3]}</div></div></div>
          ))}
        </div>}
      </div>
      <div className="tdfoot">
        <button className="dbtn ghost" onClick={()=>fadToast('Message sent to '+(o.name||'').split(/[ ,]/)[0])}><DI n="msg" s={1.8}/> Message</button>
        <span className="grow"/>
        <button className="dbtn" onClick={()=>go('ownerstmt')}><DI n="doc" s={1.8}/> View statement</button>
        <button className="dbtn primary" onClick={()=>fadToast('Statement sent','green')}><DI n="check" s={2}/> Send statement</button>
      </div>
    </aside>
  </>);
}

/* ---------------- hosts (mounted once by Shell) ---------------- */
function DrawerHost(){
  const [cur,setCur] = React.useState(null);
  React.useEffect(()=>_tdSub(setCur),[]);
  const k = cur&&cur.kind, d = cur&&cur.data;
  return (<>
    <TaskDrawer task={k==='task'?d:null} onClose={_tdClose}/>
    <GuestDrawer data={k==='guest'?d:null} onClose={_tdClose}/>
    <ReviewDrawer data={k==='review'?d:null} onClose={_tdClose}/>
    <StaffDrawer data={k==='staff'?d:null} onClose={_tdClose}/>
    <OwnerDrawer data={k==='owner'?d:null} onClose={_tdClose}/>
  </>);
}
function ToastHost(){
  const [items,setItems] = React.useState([]);
  React.useEffect(()=>{ _toastStore.subs.add(setItems); return ()=>_toastStore.subs.delete(setItems); },[]);
  const { DI } = window.FADD;
  return (
    <div className="fadtoasts">
      {items.map(t=>(
        <div key={t.id} className={"fadtoast"+(t.tone?' '+t.tone:'')}>
          <DI n={t.tone==='red'?'flag':'check'} s={2}/> <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ============ GUEST PROFILE drawer ============ */
function TdToggle({on,onToggle}){
  const [v,setV]=React.useState(on);
  return <span className={"tgl"+(v?' on':'')} onClick={()=>{setV(!v);onToggle&&onToggle();}}><span className="knob"/></span>;
}
function GuestDrawer({ data, onClose }){
  const { DI } = window.FADD;
  const [tab,setTab] = React.useState('overview');
  React.useEffect(()=>{ if(data) setTab('overview'); },[data]);
  React.useEffect(()=>{ const k=e=>{if(e.key==='Escape')onClose();}; window.addEventListener('keydown',k); return ()=>window.removeEventListener('keydown',k); },[onClose]);
  if(!data) return null;
  const g = data;
  const stays = g.staysList || [
    ['GBH-B4','1–4 Jun 2026','Airbnb','★ 4.9','Rs 42,000'],
    ['GBH-B4','12–16 Feb 2026','Airbnb','★ 5.0','Rs 51,000'],
    ['SD-10','3–9 Aug 2025','Direct','★ 4.8','Rs 88,000'],
  ];
  return (<>
    <div className="tdscrim" onClick={onClose}/>
    <aside className="tddrawer" style={{width:560}} role="dialog" aria-label="Guest profile">
      <div className="tdh">
        <div className="between">
          <div className="row" style={{gap:11,minWidth:0}}>
            <span className="av1" style={{width:42,height:42,fontSize:13}}>{g.initials||(g.name||'').split(' ').map(w=>w[0]).slice(0,2).join('')}</span>
            <div style={{minWidth:0}}>
              <div className="row" style={{gap:7}}><span className="tdtitle" style={{fontSize:21,margin:0}}>{g.name}</span></div>
              <div className="row" style={{gap:6,marginTop:4,flexWrap:'wrap'}}>{(g.tags||[]).map((t,i)=><span key={i} className={"bdg "+(t==='VIP'?'amber':'gray')}>{t}</span>)}</div>
            </div>
          </div>
          <span className="icbtn" style={{cursor:'pointer'}} onClick={onClose}><DI n="x" s={2}/></span>
        </div>
        <div className="tdmeta" style={{gridTemplateColumns:'1fr 1fr 1fr'}}>
          <span className="tdm-item"><span className="k">Rating</span><span className="mono" style={{color:'var(--green)'}}>{g.rating||'4.9'}</span></span>
          <span className="tdm-item"><span className="k">Stays</span><span className="mono">{g.stays||stays.length}</span></span>
          <span className="tdm-item"><span className="k">Lifetime</span><span className="mono">{g.ltv||'Rs 318k'}</span></span>
        </div>
      </div>
      <div className="tdtabs">
        {[['overview','Overview'],['stays','Stays'],['msgs','Messages']].map(t=>(
          <span key={t[0]} className={"tdtab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}{t[0]==='stays'&&<span className="ct">{stays.length}</span>}</span>
        ))}
      </div>
      <div className="tdbody">
        {tab==='overview' && <>
          <div className="fai" style={{marginBottom:16}}>
            <div className="fh"><span style={{color:'var(--indigo-bright)'}}><DI n="spark" s={1.6}/></span><span className="ftt">Friday on this guest</span></div>
            <p>{g.name.split(' ')[0]} is a <b className="hl">returning, high-value guest</b> ({stays.length} stays, avg ★4.9). Books direct when offered. Prefers early check-in. No open issues.</p>
          </div>
          <div className="dml" style={{marginTop:0}}>Details <span className="rule"/></div>
          <div className="panel" style={{padding:'4px 13px'}}>
            <div className="drow"><span className="faint">Home property</span><span className="pcodeD">{g.prop||'GBH-B4'}</span></div>
            <div className="drow"><span className="faint">Channel</span><span>{g.channel||'Airbnb'}</span></div>
            <div className="drow"><span className="faint">First stay</span><span>Aug 2025</span></div>
            <div className="drow" style={{borderBottom:'none'}}><span className="faint">Last activity</span><span>{g.last||'2 days ago'}</span></div>
          </div>
        </>}
        {tab==='stays' && <div className="panel" style={{padding:'10px 6px'}}>
          <table className="tbl"><thead><tr><th>Property</th><th>Dates</th><th>Channel</th><th>Rating</th><th style={{textAlign:'right'}}>Payout</th></tr></thead>
          <tbody>{stays.map((s,i)=>(<tr key={i} className="tdrow" onClick={()=>{onClose();window.FADGO('reservation');}}>
            <td><span className="pcodeD">{s[0]}</span></td><td className="mono faint">{s[1]}</td><td>{s[2]}</td><td className="mono" style={{color:'var(--green)'}}>{s[3]}</td><td className="mono" style={{textAlign:'right'}}>{s[4]}</td>
          </tr>))}</tbody></table>
        </div>}
        {tab==='msgs' && <div className="panel" style={{padding:13}}>
          <div className="afm"><span className="ava me" style={{background:'var(--card-2)'}}>{(g.name||'').split(' ').map(w=>w[0])[0]}</span><div className="bub">Hi! What time can we check in? Flight lands 1pm.</div></div>
          <div className="afm me" style={{marginTop:10}}><span className="ava fr"><DI n="spark" s={1.5}/></span><div className="bub">Welcome back! Early check-in from 1pm works — we'll have it ready. 😊</div></div>
        </div>}
      </div>
      <div className="tdfoot">
        <button className="dbtn ghost" onClick={()=>{onClose();window.FADGO('inbox');}}><DI n="msg" s={1.8}/> Message</button>
        <span className="grow"/>
        <button className="dbtn" onClick={()=>fadToast('Marked as VIP')}><DI n="star" s={1.9}/> VIP</button>
        <button className="dbtn primary" onClick={()=>fadToast('New booking — draft started')}><DI n="plus" s={2}/> New booking</button>
      </div>
    </aside>
  </>);
}

/* ============ REVIEW detail drawer ============ */
function ReviewDrawer({ data, onClose }){
  const { DI } = window.FADD;
  const [reply,setReply] = React.useState('');
  const [posted,setPosted] = React.useState(false);
  React.useEffect(()=>{ if(data){ setReply(data.draft||''); setPosted(false);} },[data]);
  React.useEffect(()=>{ const k=e=>{if(e.key==='Escape')onClose();}; window.addEventListener('keydown',k); return ()=>window.removeEventListener('keydown',k); },[onClose]);
  if(!data) return null;
  const r = data;
  const stars = n => '★★★★★☆☆☆☆☆'.slice(5-n,10-n);
  return (<>
    <div className="tdscrim" onClick={onClose}/>
    <aside className="tddrawer" style={{width:560}} role="dialog" aria-label="Review">
      <div className="tdh">
        <div className="between">
          <div className="row" style={{gap:9,minWidth:0}}><span className="pcodeD">{r.prop}</span><span className="bdg gray">{r.channel}</span><span className="faint mono" style={{fontSize:10.5}}>{r.ago}</span></div>
          <span className="icbtn" style={{cursor:'pointer'}} onClick={onClose}><DI n="x" s={2}/></span>
        </div>
        <div className="row" style={{gap:10,marginTop:13,alignItems:'center'}}>
          <span className="av1" style={{width:34,height:34,fontSize:11}}>{(r.guest||'').split(' ').map(w=>w[0]).slice(0,2).join('')}</span>
          <div><div style={{fontWeight:600,fontSize:14}}>{r.guest}</div><div style={{color:r.rating>=4?'var(--amber)':'var(--red)',fontSize:15,letterSpacing:2,lineHeight:1}}>{stars(r.rating)}</div></div>
        </div>
      </div>
      <div className="tdbody">
        <div className="dml" style={{marginTop:0}}>Review <span className="rule"/></div>
        <p style={{margin:'0 0 16px',fontSize:14,lineHeight:1.6}}>{r.text}</p>
        <div className="dml">Friday-drafted reply <span className="rule"/></div>
        {posted
          ? <div className="afdone"><DI n="check" s={2}/> Reply posted to {r.channel}</div>
          : <>
            <div className="fai" style={{padding:0,background:'none',border:'none'}}>
              <textarea className="tdcomp-in" style={{width:'100%',minHeight:120,lineHeight:1.55,resize:'vertical'}} value={reply} onChange={e=>setReply(e.target.value)}/>
            </div>
            <div className="row" style={{gap:7,marginTop:6}}>
              <button className="dbtn sm" onClick={()=>fadToast('Friday redrafted the reply')}><DI n="spark" s={1.7}/> Redraft</button>
              <span className="faint" style={{fontSize:11}}>{r.rating<=3?'On-voice: stays neutral, owns the fix.':'On-voice: warm, concise.'}</span>
            </div>
          </>}
      </div>
      <div className="tdfoot">
        {r.rating<=3 && <button className="dbtn ghost" onClick={()=>fadToast('Task created from review','')}><DI n="ops" s={1.8}/> Create task</button>}
        <span className="grow"/>
        {!posted && <><button className="dbtn ghost" onClick={onClose}>Later</button>
          <button className="dbtn primary" onClick={()=>{setPosted(true);fadToast('Reply posted','green');}}><DI n="check" s={2}/> Approve & post</button></>}
      </div>
    </aside>
  </>);
}

/* ============ STAFF record drawer ============ */
function StaffDrawer({ data, onClose }){
  const { DI } = window.FADD;
  const [tab,setTab] = React.useState('overview');
  React.useEffect(()=>{ if(data) setTab('overview'); },[data]);
  React.useEffect(()=>{ const k=e=>{if(e.key==='Escape')onClose();}; window.addEventListener('keydown',k); return ()=>window.removeEventListener('keydown',k); },[onClose]);
  if(!data) return null;
  const s = data;
  const perms = s.perms || [['Tasks & operations',true],['Inbox & guest messaging',true],['Reservations',false],['Finance & payouts',false],['Owner statements',false]];
  return (<>
    <div className="tdscrim" onClick={onClose}/>
    <aside className="tddrawer" style={{width:540}} role="dialog" aria-label="Staff record">
      <div className="tdh">
        <div className="between">
          <div className="row" style={{gap:11,minWidth:0}}>
            <span className="av1" style={{width:42,height:42,fontSize:13}}>{s.av}</span>
            <div style={{minWidth:0}}><span className="tdtitle" style={{fontSize:21,margin:0}}>{s.name}</span>
              <div className="faint" style={{fontSize:12,marginTop:3}}>{s.role}</div></div>
          </div>
          <span className="icbtn" style={{cursor:'pointer'}} onClick={onClose}><DI n="x" s={2}/></span>
        </div>
        <div className="tdmeta" style={{gridTemplateColumns:'1fr 1fr'}}>
          <span className="tdm-item"><span className="k">Zone</span><span>{s.zone||'North'}</span></span>
          <span className="tdm-item"><span className="k">Status</span><span className={"bdg "+(s.status==='active'?'green':'gray')}>{s.status||'active'}</span></span>
          <span className="tdm-item"><span className="k">Open tasks</span><span className="mono">{s.tasks!=null?s.tasks:'—'}</span></span>
          <span className="tdm-item"><span className="k">Load</span><span className="mono">{s.load||'64%'}</span></span>
        </div>
      </div>
      <div className="tdtabs">
        {[['overview','Overview'],['perms','Permissions'],['timeoff','Time off']].map(t=>(
          <span key={t[0]} className={"tdtab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}</span>
        ))}
      </div>
      <div className="tdbody">
        {tab==='overview' && <>
          <div className="dml" style={{marginTop:0}}>This week <span className="rule"/></div>
          <div className="grid3" style={{marginBottom:16}}>
            <div className="statc"><div className="n">{s.done||18}</div><div className="l">Tasks done</div></div>
            <div className="statc green"><div className="n">{s.onvoice||'94%'}</div><div className="l">On-voice</div></div>
            <div className="statc"><div className="n">{s.hrs||'32h'}</div><div className="l">Logged</div></div>
          </div>
          <div className="dml">Recent activity <span className="rule"/></div>
          <div className="panel" style={{padding:'4px 13px'}}>
            <div className="drow"><span className="row" style={{gap:9}}><span className="adot ok"/>Completed GBH-C5 · shower head</span><span className="faint mono" style={{fontSize:10}}>13:00</span></div>
            <div className="drow" style={{borderBottom:'none'}}><span className="row" style={{gap:9}}><span className="adot ok"/>Closed turnover · GBH-B4</span><span className="faint mono" style={{fontSize:10}}>yesterday</span></div>
          </div>
        </>}
        {tab==='perms' && <div className="panel" style={{padding:'2px 14px'}}>
          {perms.map((p,i)=>(<div key={i} className="srcrow" style={{padding:'12px 0'}}><span style={{flex:1,fontSize:13}}>{p[0]}</span><TdToggle on={p[1]} onToggle={()=>fadToast((p[1]?'Revoked: ':'Granted: ')+p[0])}/></div>))}
        </div>}
        {tab==='timeoff' && <>
          <div className="panel" style={{padding:'4px 13px',marginBottom:12}}>
            <div className="drow"><span className="faint">Annual leave left</span><span className="mono">12 days</span></div>
            <div className="drow" style={{borderBottom:'none'}}><span className="faint">Next off</span><span>Sun 7 Jun</span></div>
          </div>
          <div className="gate" style={{borderStyle:'solid'}}><DI n="cal" s={1.8} style={{color:'var(--amber)',flex:'0 0 auto'}}/><span><b>Pending request:</b> {s.name.split(' ')[0]} asked for 10–11 Jun off.</span></div>
          <div className="row" style={{gap:7,marginTop:10}}>
            <button className="dbtn green sm" onClick={()=>fadToast('Time off approved','green')}><DI n="check" s={2}/> Approve</button>
            <button className="dbtn ghost sm" onClick={()=>fadToast('Time off declined','red')}>Decline</button>
          </div>
        </>}
      </div>
      <div className="tdfoot">
        <button className="dbtn ghost" onClick={()=>fadToast('Opened schedule')}><DI n="cal" s={1.8}/> Schedule</button>
        <span className="grow"/>
        <button className="dbtn" onClick={()=>fadToast('Message sent to '+s.name.split(' ')[0])}><DI n="msg" s={1.8}/> Message</button>
      </div>
    </aside>
  </>);
}

window.FADTASK = {
  open:_tdOpen,
  openGuest:(g)=>_openKind('guest',g),
  openReview:(r)=>_openKind('review',r),
  openStaff:(s)=>_openKind('staff',s),
  openOwner:(o)=>_openKind('owner',o),
  close:_tdClose,
  Host:function(){ return (<><DrawerHost/><ToastHost/></>); },
};
