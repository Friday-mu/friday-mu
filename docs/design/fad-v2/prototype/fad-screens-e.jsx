/* FAD V2 — prototype screens E: Notification preferences · Help & tutorial */

function Chans({push, email, app, locked, preset}){
  const cls = (on)=> "chbox"+(locked?" lock":(on?" on":""));
  return (
    <div className="chans">
      <span className={cls(push)}><Icon n={locked?"lock":"bell"} s={1.9} style={{width:14,height:14}}/></span>
      <span className={cls(email)}><Icon n="mail" s={1.8} style={{width:14,height:14}}/></span>
      <span className={cls(app)}><Icon n="msg" s={1.8} style={{width:14,height:14}}/></span>
    </div>
  );
}

function PrefRow({name, desc, push, email, app, locked, preset}){
  return (
    <div className={"prefrow"+(preset?" preset":"")}>
      <div className="pn">
        <div className="pname">{name}{locked && <span className="lk"><Icon n="lock" s={2.2}/></span>}</div>
        {desc && <div className="pdesc">{desc}</div>}
      </div>
      <Chans push={push} email={email} app={app} locked={locked} preset={preset}/>
    </div>
  );
}

function ScreenNotifPrefs(){
  return (
    <div className="fad">
      <StatusBar/>
      <div className="detailtop"><div className="between"><BackBtn label="Account"/><span className="badge gray">Preset</span></div></div>
      <div className="apphead" style={{paddingTop:12}}><div className="eyebrow">PREFERENCES</div><h1>Notifications</h1></div>
      <div className="fad-body"><div className="fad-scroll">

        <div className="aigate" style={{borderStyle:'solid'}}>
          <span className="ic" style={{fontSize:15}}><Icon n="sparkle" s={1.8}/></span>
          <span className="tx"><b>Friday set the recommended alerts.</b> Safety &amp; assignment alerts are always on. Your team manages the rest for now — you'll be able to tune these in a later release.</span>
        </div>

        <div className="preflegend mt16">
          <span className="spacer"/>
          <span className="pl"><Icon n="bell" s={2}/> Push</span>
          <span className="pl"><Icon n="mail" s={2}/> Email</span>
          <span className="pl"><Icon n="msg" s={2}/> In-app</span>
        </div>

        <MLabel rule={false}>Always on</MLabel>
        <div className="prefgroup">
          <PrefRow locked name="Task assigned to me" desc="A new job lands in your queue" push email app/>
          <PrefRow locked name="Urgent &amp; safety" desc="Guest-blocked, hazards, escalations" push email app/>
          <PrefRow locked name="Schedule published" desc="Your week or roster goes live" push app/>
        </div>

        <MLabel rule={false}>Recommended · preset for you</MLabel>
        <div className="prefgroup">
          <PrefRow preset name="Comments &amp; @mentions" desc="Someone replies or tags you on a task" push app/>
          <PrefRow preset name="Task due soon" desc="A job is approaching its window" push app/>
          <PrefRow preset name="Task reassigned" desc="A job moves to or from you" push app/>
          <PrefRow preset name="Supplies low" desc="Stock below par at your store" app/>
          <PrefRow preset name="Expense approved" desc="A reimbursement is cleared" email app/>
        </div>

        <MLabel rule={false}>Quiet hours</MLabel>
        <div className="setgroup">
          <SetRow ic="clock" label="Mute outside shift" value="20:00–06:00" />
          <SetRow ic="shield" label="Always allow urgent" toggle={true} last/>
        </div>

        <div className="faint" style={{textAlign:'center',fontSize:10.5,marginTop:18,lineHeight:1.6,padding:'0 10px'}}>
          These defaults are managed by Friday Retreats. Per-channel control unlocks for your role in a later version.
        </div>
      </div></div>
      <TabBar active="account"/>
    </div>
  );
}

/* ---------- Help & tutorial ---------- */
function TStep({n, done, title, desc, go, onGo}){
  return (
    <div className={"tstep"+(done?" done":"")}>
      <span className="tnum">{done?<Icon n="check" s={3}/>:n}</span>
      <div className="tmain">
        <div className="tt">{title}</div>
        <div className="td">{desc}</div>
        {go && <button className="btn sm ghost tap tgo" onClick={onGo}><Icon n="play" s={1.9}/> {go}</button>}
      </div>
    </div>
  );
}

function ScreenTutorial(){
  const nav = useNav();
  return (
    <div className="fad">
      <StatusBar/>
      <div className="detailtop"><div className="between"><BackBtn label="Account"/><Badge tone="indigo"><Icon n="sparkle" s={1.6}/> Friday</Badge></div></div>
      <div className="apphead" style={{paddingTop:12}}><div className="eyebrow">GET STARTED</div><h1>Help &amp; tutorial</h1></div>
      <div className="fad-body"><div className="fad-scroll">

        <div className="brief">
          <div className="bh"><Badge tone="indigo"><Icon n="sparkle" s={1.6}/> Friday</Badge></div>
          <p>Hi Ishant 👋 I'll walk you through the app using <span className="hl">your real tasks</span> for today. Tap “Show me” on any step and I'll take you there.</p>
        </div>

        <MLabel rule={false} count="2 / 5">Your walkthrough</MLabel>
        <div className="stack-sm">
          <TStep done n="1" title="Find your day" desc="Your tasks are sorted by what to do next. Overdue sits up top."/>
          <TStep done n="2" title="Open a task" desc="Tap a card to see context, access, supplies and the timer."/>
          <TStep n="3" title="Start & time the Water Issue" desc="Open SD-10, hit Start — the timer runs, pause for breaks."
            go="Show me on SD-10" onGo={()=>nav.go('detail', {task:TASKS.water})}/>
          <TStep n="4" title="Work the turnover requirements" desc="GBH-B4 has a cleaning checklist, an amenity count and a final inspection."
            go="Show me on GBH-B4" onGo={()=>nav.go('requirements', {task:TASKS.turnover})}/>
          <TStep n="5" title="Finish with proof" desc="Add photos, log supplies or scan a receipt, then mark complete."
            go="Try a receipt scan" onGo={()=>nav.go('expense', {task:TASKS.turnover})}/>
        </div>

        <MLabel rule={true}>Ask Friday anything</MLabel>
        <div className="brief" style={{marginTop:0}}>
          <div className="cmt me" style={{justifyContent:'flex-end',paddingTop:0}}>
            <div className="cbody"><div className="cbubble">What happens if a guest is home when I arrive?</div></div>
          </div>
          <div className="cmt" style={{paddingBottom:2}}>
            <span className="ca" style={{background:'var(--indigo-ghost)',borderColor:'transparent',color:'var(--indigo-bright)'}}><Icon n="sparkle" s={1.7}/></span>
            <div className="cbody"><div className="cbubble">If the task is marked <b>urgent</b> it's cleared for entry — knock first and log a photo. If it's not urgent, mark it <b>blocked</b> and I'll reschedule around the guest automatically.</div></div>
          </div>
        </div>
        <div className="stack-sm mt12">
          <div className="qchip tap"><span className="qi"><Icon n="sparkle" s={1.6}/></span> How do I pause a task?</div>
          <div className="qchip tap"><span className="qi"><Icon n="sparkle" s={1.6}/></span> When do I get paid back for expenses?</div>
          <div className="qchip tap"><span className="qi"><Icon n="sparkle" s={1.6}/></span> What if I'm missing a supply?</div>
        </div>

        <MLabel rule={true}>Quick how-tos</MLabel>
        <div className="setgroup">
          {[['play','Start, pause & complete a task'],['check','Work a requirements checklist'],['cam','Add photos & evidence'],['dollar','Scan a receipt for expenses'],['flag','Report an issue to your manager'],['phone','Call or message the team'],['lock','Reveal an access code']].map((h,i)=>(
            <div key={i} className="setrow tap">
              <span className="si"><Icon n={h[0]} s={1.9}/></span>
              <span className="sl">{h[1]}</span>
              <span className="chev"><Icon n="chevR" s={2}/></span>
            </div>
          ))}
        </div>
        <div className="qchip tap mt12" style={{borderColor:'var(--indigo-line)',background:'var(--indigo-ghost)'}}>
          <span className="qi"><Icon n="video" s={1.7}/></span>
          <div style={{flex:1}}><div style={{fontWeight:600}}>Watch the 60-second tour</div><div className="faint" style={{fontSize:11,marginTop:1}}>A quick video of the whole flow</div></div>
          <span className="faint" style={{display:'flex'}}><Icon n="chevR" s={2}/></span>
        </div>
      </div></div>
      <div className="composer">
        <div className="cin">
          <span style={{color:'var(--tx-3)',fontSize:16}}><Icon n="mic" s={1.9}/></span>
          <span className="cph">Ask about the app…</span>
          <button className="csend"><Icon n="send" s={2}/></button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Create a task ---------- */
function OptRow({opts, val, set}){
  return (
    <div className="optionrow">
      {opts.map(o=><span key={o} className={"opt tap"+(val===o?' on':'')} onClick={()=>set(o)}>{o}</span>)}
    </div>
  );
}
function ScreenCreate(){
  const nav = useNav();
  const [done,setDone] = React.useState(false);
  const [prop,setProp] = React.useState('SD-10');
  const [dept,setDept] = React.useState('Maintenance');
  const [pri,setPri] = React.useState('Medium');
  const [due,setDue] = React.useState('Today');
  const [tmpl,setTmpl] = React.useState('None');
  const [photoItems,setPhotoItems] = React.useState({Sanitise:true,'Welcome pack':true});
  const TEMPLATES = {
    Cleaning:['Strip & remake beds','Sanitise bathrooms','Clean kitchen','Vacuum & mop floors','Empty bins'],
    Inspection:['AC cooling','Wi-Fi tested','Welcome pack placed','No odours'],
  };

  if(done){
    return (
      <div className="fad">
        <StatusBar/>
        <div className="fad-body"><div className="fad-scroll">
          <div className="successwrap" style={{marginTop:48}}>
            <div className="successring"><Icon n="check" s={2.4}/></div>
            <h1 style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:28,margin:0}}>Task created</h1>
            <p className="dim" style={{margin:0,fontSize:13.5,lineHeight:1.5}}>Added to <b style={{color:'var(--tx)'}}>{prop}</b> · {dept.toLowerCase()} · due {due.toLowerCase()}. Friday queued a suggested supplies loadout.</p>
          </div>
        </div></div>
        <div className="composer" style={{display:'flex',flexDirection:'column',gap:8}}>
          <button className="btn primary full tap" style={{height:46}} onClick={()=>nav.tab('tasks')}>Go to my tasks</button>
        </div>
      </div>
    );
  }
  return (
    <div className="fad">
      <StatusBar/>
      <div className="detailtop"><div className="between">
        <div className="backbtn tap" onClick={()=>nav.back()}><Icon n="x" s={2.1}/> Cancel</div>
        <Badge tone="indigo">New task</Badge>
      </div></div>
      <div className="apphead" style={{paddingTop:12}}><div className="eyebrow"><Icon n="plus" s={1.9} style={{color:'var(--indigo-bright)'}}/> CREATE</div><h1>New task</h1></div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="field"><span className="flbl">Title</span><div className="fin ph">e.g. Replace bathroom extractor fan</div></div>

        <div className="field mt12"><span className="flbl">Property</span>
          <PropPicker value={prop} onChange={setProp}/>
          <span className="faint" style={{fontSize:10.5}}>Search all {(window.PROPERTIES||[]).length} properties</span>
        </div>

        <div className="field mt12"><span className="flbl">Department</span><OptRow opts={['Maintenance','Housekeeping','Admin']} val={dept} set={setDept}/></div>
        <div className="field mt12"><span className="flbl">Priority</span><OptRow opts={['Urgent','High','Medium','Low']} val={pri} set={setPri}/></div>
        <div className="field mt12"><span className="flbl">Due</span><OptRow opts={['Today','Tomorrow','Pick date']} val={due} set={setDue}/></div>

        <div className="field mt12"><span className="flbl">Requirements template</span>
          <OptRow opts={['None','Cleaning','Inspection']} val={tmpl} set={setTmpl}/>
          {tmpl!=='None' && (
            <div className="reqsection mt8">
              <div className="reqhead"><span className="rtitle" style={{fontSize:12.5}}>{tmpl} checklist</span><span className="rprog">tap <Icon n="cam" s={2} style={{width:11,height:11}}/> to require a photo</span></div>
              {TEMPLATES[tmpl].map((label,i)=>{
                const k=label.split(' ')[0]; const on=!!photoItems[k];
                return (
                  <div key={i} className="checkitem" style={{cursor:'default'}}>
                    <span className="cbx" style={{borderRadius:'50%'}}/>
                    <span className="clabel">{label}</span>
                    <span className={"addphoto tap"+(on?"":" need")} style={on?{borderStyle:'solid',background:'var(--indigo)',color:'#fff',borderColor:'var(--indigo)'}:{border:'1px solid var(--line)',background:'var(--bg-2)',color:'var(--tx-3)'}}
                      onClick={()=>setPhotoItems(p=>({...p,[k]:!p[k]}))}><Icon n="cam" s={1.9}/></span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="field mt12"><span className="flbl">Assignee</span>
          <div className="row gap6"><span className="avatar">IA</span><span style={{fontSize:13.5}}>Ishant Ayadassen</span><span className="badge gray" style={{marginLeft:'auto'}}>you</span></div>
        </div>

        <div className="aigate mt16" style={{borderStyle:'solid'}}>
          <span className="ic" style={{fontSize:15}}><Icon n="sparkle" s={1.8}/></span>
          <span className="tx">Friday will suggest a <b>supplies loadout</b> for a {dept.toLowerCase()} task and set the access policy from {prop}.</span>
        </div>
      </div></div>
      <div className="composer">
        <button className="btn primary full tap" style={{height:46,fontSize:14.5}} onClick={()=>setDone(true)}><Icon n="check" s={2}/> Create task</button>
      </div>
    </div>
  );
}

Object.assign(window, { Chans, PrefRow, ScreenNotifPrefs, TStep, ScreenTutorial, OptRow, ScreenCreate });

/* ---------- Calling: full screen + minimized pill ---------- */
function CC({icon, label, off, end, onClick}){
  return (
    <div className="cc-wrap">
      <button className={"cc"+(off?" off":"")+(end?" end":"")} onClick={onClick}><Icon n={icon} s={1.9}/></button>
      <span className="cc-label">{label}</span>
    </div>
  );
}
function CallScreen(){
  const nav = useNav();
  const call = nav.call;
  const [muted,setMuted] = React.useState(false);
  const [vidOff,setVidOff] = React.useState(false);
  if(!call) return null;
  const video = call.type==='video';
  const initials = (call.with||'').split(/[\s(]/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase();
  return (
    <div className={"callscreen"+(video?' video':'')}>
      {video && <div className="call-remote">{vidOff ? <div className="call-av">{initials}</div> : <span style={{color:'rgba(255,255,255,.4)',fontSize:12,fontFamily:'var(--mono)'}}>{call.with} · live video</span>}</div>}
      <div className="call-top">
        <span className="call-min tap" onClick={nav.minimizeCall}><Icon n="minimize" s={1.9}/></span>
        {video && <span className="call-status"><span className="live"/> {fmtTimer(call.elapsed)}</span>}
        <span style={{width:38}}/>
      </div>
      {video && <div className="call-vidself">{vidOff?'camera off':'You'}</div>}
      {!video && (
        <div className="call-body">
          <div className="call-av">{initials}</div>
          <div className="call-name">{call.with}</div>
          <div className="call-status"><span className="live"/> {fmtTimer(call.elapsed)} · audio call</div>
        </div>
      )}
      <div className="call-controls">
        <CC icon={muted?'micOff':'mic'} label={muted?'Unmute':'Mute'} off={muted} onClick={()=>setMuted(m=>!m)}/>
        {video && <CC icon={vidOff?'videoOff':'video'} label={vidOff?'Start':'Stop'} off={vidOff} onClick={()=>setVidOff(v=>!v)}/>}
        <CC icon="volume" label="Speaker"/>
        <CC icon="phoneOff" label="End" end onClick={nav.endCall}/>
      </div>
    </div>
  );
}
function CallPill(){
  const nav = useNav();
  const call = nav.call;
  if(!call) return null;
  return (
    <div className="callpill tap" onClick={nav.expandCall}>
      <span className="cdot"/>
      <span className="ctime">{fmtTimer(call.elapsed)}</span>
      <span className="cwith">· {call.with}{call.type==='video'?' (video)':''}</span>
      <span className="cexp" onClick={(e)=>{e.stopPropagation();nav.expandCall();}}><Icon n="expand" s={2.2}/></span>
      <span className="cend" onClick={(e)=>{e.stopPropagation();nav.endCall();}}><Icon n="phoneOff" s={2}/></span>
    </div>
  );
}

Object.assign(window, { CC, CallScreen, CallPill });
