/* FAD V2 — prototype screens C: Supplies · Expense · Ask-Friday(task) · Comments+Log · Report · My reports */

function SubHead({task, title}){
  return (
    <>
      <StatusBar/>
      <div className="detailtop">
        <div className="between">
          <BackBtn label={task ? task.title : 'Back'}/>
          <div className="row gap6">
            {task && <span className="srcchip bz"><Icon n="lock" s={2.2} style={{fontSize:9}}/> {task.refId}</span>}
            {task && <span className="badge gray">{task.code}</span>}
          </div>
        </div>
      </div>
      <div className="apphead" style={{paddingTop:12}}>
        <div className="eyebrow">{task ? task.code+' · '+task.title.toUpperCase() : ''}</div>
        <h1>{title}</h1>
      </div>
    </>
  );
}

/* ---------- Supplies ---------- */
function SupRow({name, meta, qty=1, sug, tool}){
  const [n,setN] = React.useState(qty);
  const [used,setUsed] = React.useState(true);
  return (
    <div className={"suprow"+(sug?" sug":"")}>
      <span className="ch-ic" style={{width:34,height:34,flex:'0 0 34px',borderRadius:10,fontSize:14}}><Icon n={tool?"gear":"box"} s={1.8}/></span>
      <div className="sm">
        <div className="sname">{name} {sug && <span className="ai-tag"><Icon n="sparkle" s={1.6}/> Friday</span>}</div>
        <div className="smeta">{meta}</div>
      </div>
      {tool ? <span className={"toggle tap"+(used?"":" off")} onClick={()=>setUsed(u=>!u)}/> :
        <div className="stepper">
          <button onClick={()=>setN(v=>Math.max(0,v-1))}>−</button><span className="val">{n}</span><button onClick={()=>setN(v=>v+1)}>+</button>
        </div>}
    </div>
  );
}
function ScreenSupplies({task}){
  task = task || TASKS.water;
  const nav = useNav();
  const sup = task.supplies||[];
  return (
    <div className="fad">
      <SubHead task={task} title="Supplies used"/>
      <div className="fad-body"><div className="fad-scroll">
        <div className="aigate">
          <span className="ic" style={{fontSize:15}}><Icon n="sparkle" s={1.8}/></span>
          <span className="tx"><b>Friday suggested {sup.length} items</b> from the {task.dept} loadout for this task type. Confirm what you actually used, or add more.</span>
        </div>
        <MLabel rule={false}>Suggested by Friday</MLabel>
        <div className="stack-sm">
          {sup.map((s,i)=><SupRow key={i} sug name={s.name} meta={s.meta} qty={s.qty}/>)}
        </div>
        <MLabel rule={false}>From your receipt</MLabel>
        <div className="stack-sm">
          <SupRow name="Replacement valve" meta="part · Rs 540 · scanned receipt" qty={1}/>
        </div>
        <div className="faint" style={{fontSize:10.5,margin:'7px 0 0',padding:'0 2px'}}>Friday pulled this from the receipt you scanned in the expense report.</div>
        <MLabel rule={false}>Added by you</MLabel>
        <div className="stack-sm">
          {task.id==='water'
            ? <SupRow name="Pipe clamp" meta="part · Rs 90 / unit" qty={1}/>
            : <SupRow name="Extra linen set" meta="part · Rs 380 / unit" qty={1}/>}
          <SupRow tool name="Tool kit" meta="tool · returned to van"/>
        </div>
        <button className="btn ghost full mt12 tap" style={{height:42,borderStyle:'dashed'}}><Icon n="plus" s={2}/> Add supply</button>
        <div className="between mt16" style={{padding:'0 2px'}}>
          <span className="faint" style={{fontFamily:'var(--mono)',fontSize:10.5,letterSpacing:'0.08em',textTransform:'uppercase'}}>Parts cost</span>
          <span style={{fontWeight:700,fontSize:16,fontFamily:'var(--mono)'}}>{task.id==='water'?'Rs 705':'Rs 545'}</span>
        </div>
      </div></div>
      <div className="composer">
        <button className="btn primary full tap" style={{height:46,fontSize:14.5}} onClick={()=>nav.back()}><Icon n="check" s={2}/> Save supplies used</button>
      </div>
    </div>
  );
}

/* ---------- Expense (with receipt-scan animation) ---------- */
function ScreenExpense({task}){
  task = task || TASKS.water;
  const nav = useNav();
  const [phase,setPhase] = React.useState('capture'); // capture | scanning | done
  React.useEffect(()=>{
    if(phase==='scanning'){ const t=setTimeout(()=>setPhase('done'),2300); return ()=>clearTimeout(t); }
  },[phase]);
  const cat = task.dept==='housekeeping'?'Cleaning supplies':'Plumbing parts';
  const fields = [['Merchant','Quincaillerie Tamarin'],['Date','1 Jun 2026'],['Category',cat],['Amount','Rs 845.00','big'],['VAT 15%','Rs 110.22']];

  return (
    <div className="fad">
      <SubHead task={task} title="Expense report"/>
      <div className="fad-body"><div className="fad-scroll">

        {phase==='capture' && (
          <div className="scanstage" style={{marginTop:10}}>
            <div className="scandoc captured" onClick={()=>setPhase('scanning')} style={{cursor:'pointer'}}>
              <span className="ln" style={{top:18,width:'40%'}}/><span className="ln" style={{top:34}}/>
              <span className="ln" style={{top:50}}/><span className="ln" style={{top:66,width:'70%'}}/>
              <span className="ln" style={{top:120}}/><span className="ln s" style={{top:150,width:'55%'}}/>
              <span style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--tx-3)',fontSize:26}}><Icon n="cam" s={1.6}/></span>
            </div>
            <button className="btn primary tap" style={{height:46,padding:'0 22px',fontSize:14.5}} onClick={()=>setPhase('scanning')}>
              <Icon n="cam" s={1.9}/> Scan a receipt
            </button>
            <div className="faint" style={{fontSize:11.5,textAlign:'center',maxWidth:240,lineHeight:1.5}}>
              Friday reads the merchant, amount, VAT &amp; category — you just check and accept.
            </div>
          </div>
        )}

        {phase==='scanning' && (<>
          <div className="scanstage" style={{marginTop:10}}>
            <div className="scandoc">
              <span className="scanbeam"/>
              <span className="ln" style={{top:18,width:'40%'}}/><span className="ln" style={{top:34}}/>
              <span className="ln" style={{top:50}}/><span className="ln" style={{top:66,width:'70%'}}/>
              <span className="ln" style={{top:120}}/><span className="ln s" style={{top:150,width:'55%'}}/>
            </div>
            <div className="row gap6" style={{color:'var(--indigo-bright)',fontSize:13,fontWeight:500}}>
              <Icon n="sparkle" s={1.7}/> Friday is reading your receipt…
            </div>
          </div>
          <MLabel rule={false}>Extracted details</MLabel>
          <div className="extracted tcard" style={{padding:'2px 14px'}}>
            {fields.map((f,i)=>(
              <div key={i} className="efield"><span className="el">{f[0]}</span><span className="ev shimmer">··········</span></div>
            ))}
          </div>
        </>)}

        {phase==='done' && (<>
          <div className="receipt">
            <div className="rimg"/>
            <div style={{flex:1}}>
              <div className="row gap6"><Badge tone="green" dot>Scanned</Badge><span className="ai-tag"><Icon n="sparkle" s={1.6}/> Friday read it</span></div>
              <div className="dim" style={{fontSize:12,marginTop:8,fontFamily:'var(--mono)'}}>quincaillerie-tamarin.jpg</div>
              <div className="faint" style={{fontSize:11,marginTop:3}}>just now · 1 page</div>
            </div>
          </div>
          <div className="aigate mt12">
            <span className="ic" style={{fontSize:15}}><Icon n="sparkle" s={1.8}/></span>
            <span className="tx"><b>Friday filled the report</b> from your receipt. Check it and accept — or tap any field to edit.</span>
          </div>
          <MLabel rule={false}>Extracted details</MLabel>
          <div className="extracted tcard" style={{padding:'2px 14px'}}>
            {fields.map((f,i)=>(
              <div key={i} className="efield pop" style={{animationDelay:(i*70)+'ms'}}>
                <span className="el">{f[0]}</span><span className={"ev"+(f[2]==='big'?' big':'')}>{f[1]}</span>
              </div>
            ))}
            <div className="efield pop" style={{animationDelay:'350ms'}}><span className="el">Linked task</span><span className="ev" style={{display:'flex',alignItems:'center',padding:'6px 10px'}}><span className="badge gray">{task.code} · {task.title}</span></span></div>
          </div>
          <div className="row gap6 mt12"><Badge tone="indigo"><Icon n="user" s={1.7}/> Reimbursable to you</Badge></div>
          <div className="aigate mt12" style={{borderStyle:'solid'}}>
            <span className="ic" style={{fontSize:15}}><Icon n="box" s={1.8}/></span>
            <span className="tx"><b>2 line items</b> from this receipt were added to <b>Supplies used</b> for this task.</span>
          </div>
          <button className="btn ghost full sm tap mt8" onClick={()=>nav.go('supplies',{task})}><Icon n="box" s={1.8}/> View supplies</button>
        </>)}

      </div></div>
      {phase==='done' && (
        <div className="composer" style={{display:'flex',flexDirection:'column',gap:8}}>
          <button className="btn primary full tap" style={{height:46,fontSize:14.5}} onClick={()=>nav.back()}><Icon n="check" s={2}/> Accept &amp; submit</button>
          <button className="btn ghost full sm tap" onClick={()=>setPhase('capture')}>Re-scan</button>
        </div>
      )}
    </div>
  );
}

/* ---------- Ask Friday (task-scoped) ---------- */
function ScreenAIHelp({task}){
  task = task || TASKS.water;
  return (
    <div className="fad">
      <SubHead task={task} title="Ask Friday"/>
      <div className="fad-body"><div className="fad-scroll">
        <div className="aigate" style={{borderStyle:'solid'}}>
          <span className="ic" style={{fontSize:15}}><Icon n="sparkle" s={1.8}/></span>
          <span className="tx"><b>Scoped to this task.</b> Friday already has {task.code}'s property, reservation, access policy and recent history.</span>
        </div>
        <div className="cmt me mt16" style={{justifyContent:'flex-end'}}>
          <div className="cbody">
            <div className="photogrid" style={{gridTemplateColumns:'repeat(3,52px)',justifyContent:'flex-end',marginBottom:8}}>
              <div className="photo" style={{background:'linear-gradient(150deg,#2b3346,#1a2130)'}}/>
              <div className="photo" style={{background:'linear-gradient(150deg,#2e2738,#1a2130)'}}/>
            </div>
            <div className="cbubble">Shut the main valve and bled the line — still no water. Pump indicator light is <b>red</b>. What next?</div>
          </div>
        </div>
        <div className="cmt">
          <span className="ca" style={{background:'var(--indigo-ghost)',borderColor:'transparent',color:'var(--indigo-bright)'}}><Icon n="sparkle" s={1.7}/></span>
          <div className="cbody">
            <div className="chead"><span className="cname" style={{color:'var(--indigo-bright)'}}>Friday</span><span className="ctime">now</span></div>
            <div className="cbubble">
              A red light usually means the borehole pump hit its <b>dry-run cutoff</b>. Try this order:<br/>
              1 · Check the pump breaker in the utility cupboard<br/>
              2 · Reset, then prime the line<br/>
              3 · If it trips again, it's a <b>pump fault</b> — stop resetting, it'll burn out.
              <div className="faint" style={{fontSize:10.5,marginTop:8,fontFamily:'var(--mono)'}}>based on 3 past leaks here</div>
            </div>
            <div className="aigate mt12" style={{borderStyle:'solid'}}>
              <span className="ic" style={{fontSize:14}}><Icon n="flag" s={1.8}/></span>
              <span className="tx">Want me to log this as a <b>pump fault</b> and flag the GM? Needs your OK.</span>
            </div>
            <div className="row gap6 mt8">
              <button className="btn primary sm tap"><Icon n="check" s={2}/> Log &amp; flag GM</button>
              <button className="btn ghost sm tap">Not yet</button>
            </div>
          </div>
        </div>
      </div></div>
      <div className="composer">
        <div className="cin">
          <span style={{color:'var(--tx-3)',fontSize:16}}><Icon n="cam" s={1.8}/></span>
          <span className="cph">Describe the issue…</span>
          <span style={{color:'var(--tx-3)',fontSize:16}}><Icon n="mic" s={1.9}/></span>
          <button className="csend"><Icon n="send" s={2}/></button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Comments + Activity log ---------- */
function LogRow({cls, children, meta}){
  return (<div className={"logrow"+(cls?" "+cls:"")}><span className="ldot"/><div className="lt">{children}</div><div className="lm">{meta}</div></div>);
}
function ScreenComments({task}){
  task = task || TASKS.water;
  const nav = useNav();
  const tm = nav.timerFor(task.id);
  const closed = tm.status==='done' || task.completed;
  const summary = task.id==='turnover'
    ? 'Full turnover done — linens replaced, bathrooms & kitchen sanitised, amenities restocked to par. AC set to 22°C, welcome pack placed. Ready for check-in.'
    : 'Replaced the faulty pump valve and bled the line. Flow restored at all outlets, no leaks at the repair point. Work area cleaned.';
  const [tab,setTab] = React.useState('comments');
  return (
    <div className="fad">
      <SubHead task={task} title="Comments &amp; log"/>
      <div style={{padding:'0 16px'}}>
        <div className="tabbar-seg">
          <span className={"tabseg tap"+(tab==='comments'?' on':'')} onClick={()=>setTab('comments')}>Comments</span>
          <span className={"tabseg tap"+(tab==='activity'?' on':'')} onClick={()=>setTab('activity')}>Activity</span>
        </div>
      </div>
      <div className="fad-body"><div className="fad-scroll">
        {tab==='comments' ? (<>
          {closed && (
            <div className="summary-cmt">
              <div className="between" style={{marginBottom:7}}>
                <span className="row gap6" style={{color:'var(--green)',fontWeight:600,fontSize:12.5}}><Icon n="check" s={2.2}/> Closing summary</span>
                <span className="ai-tag"><Icon n="sparkle" s={1.6}/> auto-posted</span>
              </div>
              <p style={{margin:0,fontSize:13,lineHeight:1.5}}>{summary}</p>
              <div className="faint" style={{fontFamily:'var(--mono)',fontSize:9.5,marginTop:8}}>by you · on completion · logged {fmtDur(tm.elapsed)}</div>
            </div>
          )}
          <div style={{marginTop:16}}>
            <div className="cmt">
              <span className="ca">FG</span>
              <div className="cbody">
                <div className="chead"><span className="cname">Franny (GM)</span><span className="ctime">08:12</span></div>
                <div className="cbubble">Knock first — guest is sensitive. <span className="tagchip">@ishant</span> please tag <span className="tagchip hash">#guest-sensitive</span> when you're done.</div>
              </div>
            </div>
            <div className="cmt me">
              <span className="ca" style={{borderColor:'var(--indigo-line)',color:'var(--indigo-bright)'}}>IA</span>
              <div className="cbody">
                <div className="chead"><span className="cname">You</span><span className="ctime">08:26</span></div>
                <div className="cbubble">On it. Pump light is red — logging as <span className="tagchip hash">#pump-fault</span> and bleeding the line now.</div>
              </div>
            </div>
          </div>
        </>) : (
          <div className="log" style={{marginTop:18}}>
            {closed && <LogRow cls="done" meta={'now · you'}>Task <b>completed</b> · closing summary posted · logged {fmtDur(tm.elapsed)}</LogRow>}
            <LogRow cls="ai" meta="06:30 · Friday">Assigned to <b>you</b> — balanced from the West queue</LogRow>
            <LogRow meta="08:02 · you">Started task · timer running</LogRow>
            <LogRow meta="08:10 · you">Added <b>2 photos</b> as evidence</LogRow>
            <LogRow meta="08:12 · Franny">Commented &amp; tagged <span className="tagchip">@ishant</span></LogRow>
            <LogRow cls="ai" meta="08:25 · Friday">Flagged a likely <b>pump fault</b></LogRow>
            <LogRow meta="08:31 · you">Supplies updated · <b>+1 replacement valve</b></LogRow>
          </div>
        )}
      </div></div>
      <div className="composer">
        <div className="cin">
          <span className="cph">{tab==='comments'?'Add a comment…':'Activity is read-only'}</span>
          <span style={{color:'var(--teal)',fontWeight:700,fontFamily:'var(--mono)'}}>#</span>
          <span style={{color:'var(--indigo-bright)',fontWeight:700,fontFamily:'var(--mono)'}}>@</span>
          <button className="csend"><Icon n="send" s={2}/></button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Report an issue (the ＋) ---------- */
function ScreenReport(){
  const nav = useNav();
  const [done,setDone] = React.useState(false);
  const [prop,setProp] = React.useState('SD-10');
  if(done){
    return (
      <div className="fad">
        <StatusBar/>
        <div className="fad-body"><div className="fad-scroll">
          <div className="successwrap" style={{marginTop:48}}>
            <div className="successring"><Icon n="check" s={2.4}/></div>
            <h1 style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:28,margin:0}}>Report sent</h1>
            <p className="dim" style={{margin:0,fontSize:13.5,lineHeight:1.5}}>Friday sent it to your <b style={{color:'var(--tx)'}}>ops manager</b> for approval. Once vetted it becomes a task — track it under <b style={{color:'var(--tx)'}}>My reports</b>.</p>
          </div>
        </div></div>
        <div className="composer" style={{display:'flex',flexDirection:'column',gap:8}}>
          <button className="btn primary full tap" style={{height:46}} onClick={()=>nav.go('reports')}>View my reports</button>
          <button className="btn ghost full sm tap" onClick={()=>nav.tab('tasks')}>Done</button>
        </div>
      </div>
    );
  }
  return (
    <div className="fad">
      <StatusBar/>
      <div className="detailtop">
        <div className="between">
          <div className="backbtn tap" onClick={()=>nav.back()}><Icon n="x" s={2.1}/> Cancel</div>
          <Badge tone="indigo">New report</Badge>
        </div>
      </div>
      <div className="apphead" style={{paddingTop:12}}>
        <div className="eyebrow"><Icon n="flag" s={1.7} style={{color:'var(--amber)'}}/> REPORT AN ISSUE</div>
        <h1>What's wrong?</h1>
      </div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="aigate" style={{borderStyle:'solid'}}>
          <span className="ic" style={{fontSize:15}}><Icon n="sparkle" s={1.8}/></span>
          <span className="tx"><b>Snap it, say it.</b> Add photos and a quick note — Friday drafts it and sends it to your <b>ops manager to approve</b> before it becomes a task.</span>
        </div>
        <div className="photogrid mt16">
          <div className="photo" style={{background:'linear-gradient(150deg,#2b3346,#1a2130)'}}/>
          <div className="photo" style={{background:'linear-gradient(150deg,#2e2738,#1a2130)'}}/>
          <div className="photo add tap"><Icon n="cam" s={1.7}/></div>
        </div>
        <div className="field mt16">
          <span className="flbl">Describe it</span>
          <div className="fin area ph">AC in the master bedroom isn't cooling, water pooling under the unit…</div>
        </div>
        <div className="field mt12">
          <span className="flbl">Property</span>
          <PropPicker value={prop} onChange={setProp}/>
          <span className="faint" style={{fontSize:10.5}}>Search all {(window.PROPERTIES||[]).length} properties</span>
        </div>
        <MLabel rule={false}>Friday's draft</MLabel>
        <div className="brief">
          <div className="bh"><Badge tone="indigo"><Icon n="sparkle" s={1.6}/> Drafted from your note</Badge></div>
          <div className="extracted" style={{marginTop:4}}>
            <div className="efield"><span className="el">Title</span><span className="ev">AC not cooling — master bedroom</span></div>
            <div className="efield"><span className="el">Dept</span><span className="ev" style={{padding:'6px 10px'}}><span className="badge gray">maintenance</span></span></div>
            <div className="efield"><span className="el">Priority</span><span className="ev" style={{padding:'6px 10px'}}><span className="badge red" style={{background:'var(--red-ghost)'}}>High</span></span></div>
          </div>
        </div>
      </div></div>
      <div className="composer">
        <button className="btn primary full tap" style={{height:46,fontSize:14.5}} onClick={()=>setDone(true)}><Icon n="flag" s={1.9}/> Send for approval</button>
        <div className="faint" style={{textAlign:'center',fontSize:10.5,marginTop:8}}>Your ops manager vets every report before it becomes a task</div>
      </div>
    </div>
  );
}

/* ---------- My reports + issues on my properties ---------- */
function RepRow({title, code, dept, by, when, status, accent}){
  return (
    <div className={"tcard accent "+accent} style={{gap:8}}>
      <div className="title" style={{fontSize:14,lineHeight:1.3}}>{title}</div>
      <div className="meta">
        <span className="pcode" style={{padding:'1px 6px',fontSize:10}}>{code}</span>
        <span>{dept}</span><span className="d">·</span><span>{by}</span><span className="d">·</span><span>{when}</span>
      </div>
      <div className="t-foot" style={{marginTop:2}}>{status}</div>
    </div>
  );
}
function ScreenReports(){
  const [tab,setTab] = React.useState('mine');
  return (
    <div className="fad">
      <StatusBar/>
      <div className="detailtop"><div className="between"><BackBtn label="Back"/><span className="badge gray">5</span></div></div>
      <div className="apphead" style={{paddingTop:12}}><div className="eyebrow">REPORTS</div><h1>Reported</h1></div>
      <div style={{padding:'4px 16px 0'}}>
        <div className="tabbar-seg">
          <span className={"tabseg tap"+(tab==='mine'?' on':'')} onClick={()=>setTab('mine')}>Mine</span>
          <span className={"tabseg tap"+(tab==='props'?' on':'')} onClick={()=>setTab('props')}>On my properties</span>
        </div>
      </div>
      <div className="fad-body"><div className="fad-scroll">
        {tab==='mine' ? (<>
          <MLabel count="3" rule={false}>Reported by you</MLabel>
          <div className="stack-sm">
            <RepRow accent="indigo" title="Wifi keeps dropping in living room" code="VA-4" dept="admin" by="you" when="today" status={<Badge tone="indigo" dot>Open</Badge>}/>
            <RepRow accent="amber" title="AC not cooling — master bedroom" code="SD-10" dept="maintenance" by="you" when="2d ago" status={<><Badge tone="amber" dot>In review</Badge><span className="grow"/><span className="faint" style={{fontSize:10.5,fontFamily:'var(--mono)'}}>Friday-drafted</span></>}/>
            <RepRow accent="green" title="Cracked tile by the pool" code="GBH-C5" dept="housekeeping" by="you" when="1 wk ago" status={<Badge tone="green" dot>Resolved</Badge>}/>
          </div>
        </>) : (<>
          <MLabel count="2" rule={false}>On properties you're working</MLabel>
          <div className="stack-sm">
            <RepRow accent="red" title="Pool pump making loud noise" code="GBH-C5" dept="maintenance" by="Bryan" when="3h ago" status={<><Badge tone="red" dot>Open</Badge><span className="grow"/><span className="avatar">BR</span></>}/>
            <RepRow accent="amber" title="Missing TV remote" code="RC-7" dept="housekeeping" by="Catherine" when="yesterday" status={<><Badge tone="amber" dot>Scheduled</Badge><span className="grow"/><span className="avatar">CA</span></>}/>
          </div>
        </>)}
      </div></div>
      <TabBar active="account"/>
    </div>
  );
}

Object.assign(window, { SubHead, SupRow, ScreenSupplies, ScreenExpense, ScreenAIHelp, LogRow, ScreenComments, ScreenReport, RepRow, ScreenReports });
