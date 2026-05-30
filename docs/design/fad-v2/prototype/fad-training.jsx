/* FAD V2 — Manager desktop · Training: Ask Friday's governance control room.
   Tabs: Teachings · Learning Queue · Sources · Performance · Knowledge base
         · Brand voice · Automations.  Renders inside <Shell>. */

const TR_TEACH = [
  {id:'t1',text:"When a guest confirms they will follow up with their schedule later, acknowledge briefly (e.g. “Sounds good”) instead of repeating requests for photos/videos or scheduling parameters.",scope:'Global',channel:'any',source:'Ishant',ago:'1d ago',apps:1,status:'active'},
  {id:'t2',text:"Do not use em dashes in guest messages. Use regular punctuation instead.",scope:'Global',channel:'any',source:'dashboard',ago:'8d ago',apps:0,status:'active'},
  {id:'t3',text:"The building/residence name is “Residence Camelia” (not Royal Coast). Use this when referencing the residence in guest communications.",scope:'3 properties',channel:'any',source:'dashboard',ago:'8d ago',apps:0,status:'active'},
  {id:'t4',text:"Building has an elevator providing easy access to the second-floor apartment.",scope:'Property · KS-5',channel:'any',source:'dashboard',ago:'9d ago',apps:0,status:'active'},
  {id:'t5',text:"Maria is currently staying at LV-10. She is messaging via an older reservation thread from a previous stay, so the active property context for her messages is LV-10, not the property tied to that old thread.",scope:'Property · LV-10',channel:'any',source:'dashboard',ago:'10d ago',apps:2,status:'active'},
  {id:'t6',text:"Stove requires manual ignition with no built-in spark. A long-neck lighter is provided on site for guests to light the burners safely.",scope:'Property · BW-C4',channel:'any',source:'dashboard',ago:'10d ago',apps:0,status:'active'},
  {id:'t7',text:"For shower hot water: use the same right knob that starts the water flow. Turning it further adjusts temperature from cold to hot.",scope:'Property · BW-C4',channel:'any',source:'dashboard',ago:'11d ago',apps:0,status:'active'},
  {id:'t8',text:"Do not thank guests for leaving the apartment in good order at checkout — we haven’t inspected the property yet at that point and can’t confirm its state. Keep checkout acknowledgments neutral about the apartment’s condition.",scope:'Global',channel:'any',source:'ask_judith',ago:'14d ago',apps:6,status:'active'},
  {id:'t9',text:"When explaining the cleaning fee, frame it as covering preparation before arrival (clean, restocking, welcome refreshments) rather than the post-departure clean. This makes it feel intended for their stay rather than admin overhead.",scope:'Global',channel:'any',source:'ask_judith',ago:'15d ago',apps:9,status:'active'},
  {id:'t10',text:"When acknowledging guest-submitted photos or evidence of issues, do not say the photos “confirm” the guest’s claims. Simply thank them and move to the action being taken. Confirming claims in writing can create liability.",scope:'Global',channel:'any',source:'ask_judith',ago:'18d ago',apps:4,status:'active'},
  {id:'t11',text:"Sharing Airbnb listing links within an Airbnb message thread is allowed and does not violate off-platform rules, since the links stay on the Airbnb platform.",scope:'Global',channel:'Airbnb',source:'ask_judith',ago:'22d ago',apps:3,status:'active'},
  {id:'t12',text:"Street parking is available anywhere near the building.",scope:'Property · BW-C4',channel:'any',source:'ask_judith',ago:'23d ago',apps:1,status:'active'},
  {id:'t13',text:"When referring guests to law enforcement, default to general police (999) rather than the Tourist Police. Tourist Police should only be mentioned if specifically relevant.",scope:'Global',channel:'any',source:'ask_judith',ago:'26d ago',apps:0,status:'active'},
  {id:'t14',text:"Always offer the airport-transfer add-on when a guest mentions their flight arrival time.",scope:'Global',channel:'any',source:'dashboard',ago:'2mo ago',apps:0,status:'retired'},
];
const TR_QUEUE = [
  {id:'q1',text:"Guests at GBH-B4 frequently ask about late checkout. Offer 1pm free when the next day is vacant.",origin:'Spotted in 4 Inbox replies you edited',via:'Inbox edits',conf:86,scope:'Property · GBH-B4'},
  {id:'q2',text:"Stop apologizing twice in the same message — one acknowledgment is enough before moving to the fix.",origin:'You corrected this 3 times via Ask Judith',via:'ask_judith',conf:78,scope:'Global'},
  {id:'q3',text:"When an AC repair is delayed past 24h, proactively offer a fan delivery while the part is sourced.",origin:'Pattern across 3 maintenance threads',via:'Approvals',conf:71,scope:'Global'},
  {id:'q4',text:"Refer to the pool at SD-10 as the “shared residence pool”, never “private pool”.",origin:'You edited this out of a draft 2d ago',via:'Inbox edits',conf:90,scope:'Property · SD-10'},
];
const TR_SOURCES = [
  {ic:'inbox',name:'Inbox draft edits',sub:'Friday learns from replies you change before sending',rules:62,act:'4m ago',on:true,auto:true},
  {ic:'spark',name:'Dashboard teachings',sub:'Rules you write by hand from the Training screen',rules:48,act:'8d ago',on:true,auto:false},
  {ic:'msg',name:'Ask Judith',sub:'Corrections captured in the manager Q&A assistant',rules:24,act:'14d ago',on:true,auto:true},
  {ic:'check',name:'Report approvals',sub:'Patterns from how you vet field reports into tasks',rules:4,act:'2d ago',on:true,auto:true},
  {ic:'star',name:'Reviews & replies',sub:'Tone learned from review responses you approve',rules:2,act:'9d ago',on:false,auto:true},
  {ic:'doc',name:'Field reports',sub:'Operational facts surfaced by staff in the field app',rules:0,act:'—',on:false,auto:true},
];
const TR_STAFF = [
  ['IA','Ishant Ayadassen',184,'12%','94%'],
  ['CA','Catherine Appadoo',96,'21%','88%'],
  ['FH','Franny Henri',142,'7%','97%'],
  ['BR','Bryan Ramluckun',38,'29%','82%'],
];
const TR_TOP = [
  ['Cleaning-fee framing',9,'ask_judith'],['Checkout neutrality',6,'ask_judith'],['No-liability photo wording',4,'ask_judith'],['Airbnb link sharing OK',3,'ask_judith'],
];
const TR_KB = {
  'Property quirks':[
    ['BW-C4','Stove needs manual ignition — long-neck lighter on site.'],
    ['BW-C4','Electric water heater switch is a wall button by the toilet; hot water needs it on.'],
    ['BW-C4','Street parking available anywhere near the building.'],
    ['KS-5','Elevator provides easy access to the 2nd-floor apartment.'],
    ['SD-10','Pool is the shared residence pool, not private.'],
  ],
  'Policies':[
    ['Global','Keep checkout acknowledgments neutral — property not yet inspected.'],
    ['Global','Frame the cleaning fee as pre-arrival preparation.'],
    ['Global','Refer guests to general police (999) by default.'],
  ],
  'Brand facts':[
    ['3 properties','Residence name is “Residence Camelia” (not Royal Coast).'],
    ['Global','Friday Retreats manages, never “owns”, owner properties.'],
  ],
};
const TR_VOICE = [
  ['Warm, not effusive','One genuine acknowledgment, then move to the action. Never apologize twice.'],
  ['Concise','Short sentences. Answer the question first, context second.'],
  ['Plain punctuation','No em dashes in guest messages. No exclamation pile-ups.'],
  ['Careful, not liable','Thank, don’t “confirm”. Stay neutral on un-inspected condition.'],
];
const TR_EXAMPLES = [
  {bad:"Thank you SO much!! — we really appreciate you leaving the apartment spotless, it means the world to us!!",
   good:"Thanks for letting us know you’ve checked out. We’ll take it from here — safe travels."},
  {bad:"Yes, your photos confirm the AC is broken and it’s our fault. So sorry, so sorry.",
   good:"Thanks for sending the photos. We’re arranging a technician now and will confirm the visit window shortly."},
];
const TR_AUTO = [
  {name:'Draft guest replies in Inbox',trig:'New guest message',act:'Generate a draft for review',scope:'Global',gate:'Needs approval',on:true,run:'4m ago'},
  {name:'Create task from issue keywords',trig:'“leak”, “broken”, “no power” in a message',act:'Open a maintenance task + notify on-zone staff',scope:'Global',gate:'Auto',on:true,run:'1h ago'},
  {name:'Auto-send saved check-in time',trig:'Guest asks check-in time',act:'Send the property’s saved check-in time',scope:'Global',gate:'Auto',on:false,run:'—'},
  {name:'Flag low review',trig:'Review rating ≤ 3★',act:'Notify GM + draft a reply',scope:'Global',gate:'Needs approval',on:true,run:'1d ago'},
];
const TR_AUDIT = [
  ['ok','Created task BW-C4 · “Investigate worsening leak” from an Inbox message','08:02'],
  ['ok','Drafted reply to Marie L. (GBH-B4) — awaiting your approval','11m ago'],
  ['rev','Auto check-in time send was paused by you','2d ago'],
  ['ok','Flagged 2★ review on SD-10 — notified GM, drafted reply','1d ago'],
];

function TrTabs({tab,setTab,counts}){
  const tabs=[['teach','Teachings'],['queue','Learning Queue'],['sources','Sources'],['perf','Performance'],['kb','Knowledge base'],['voice','Brand voice'],['auto','Automations']];
  return (
    <div className="dtabs" style={{marginTop:14}}>
      {tabs.map(t=>(
        <span key={t[0]} className={"dtab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>
          {t[1]}{counts[t[0]]!=null && <span className="ct">{counts[t[0]]}</span>}
        </span>
      ))}
    </div>
  );
}

function ScreenTraining(){
  const { DI } = window.FADD;
  const [tab,setTab] = React.useState('teach');
  const [status,setStatus] = React.useState('active');
  const [src,setSrc] = React.useState('all');
  const [srcOpen,setSrcOpen] = React.useState(false);
  const [open,setOpen] = React.useState(null);       // teaching drawer
  const [queue,setQueue] = React.useState(TR_QUEUE);
  const [auto,setAuto] = React.useState(TR_AUTO.map(a=>a.on));

  const sources = ['all',...Array.from(new Set(TR_TEACH.map(t=>t.source)))];
  const teachShown = TR_TEACH.filter(t=>(status==='all'||t.status===status)&&(src==='all'||t.source===src));
  const counts={ teach:TR_TEACH.filter(t=>t.status==='active').length, queue:queue.length, auto:TR_AUTO.length };

  const act=(t)=>(e)=>{ e&&e.stopPropagation&&e.stopPropagation(); window.fadToast&&window.fadToast(t); };
  const decide=(id,msg,tone)=>{ setQueue(q=>q.filter(x=>x.id!==id)); window.fadToast&&window.fadToast(msg,tone); };

  return (
    <>
    <Shell active="" eyebrow={<><DI n="spark" s={1.6} style={{color:'var(--indigo-bright)'}}/> SYSTEM · ASK FRIDAY GOVERNANCE</>}
      title="Training" sub="Teach Friday what to do — review what it proposes, approve rules, and control how it acts."
      actions={tab==='teach'
        ? <><button className="dbtn ghost" onClick={act('Exported teachings')}>Export</button><button className="dbtn primary" onClick={act('New rule — draft started')}><DI n="plus" s={2}/> New rule</button></>
        : tab==='kb' ? <button className="dbtn primary" onClick={act('Add knowledge — draft started')}><DI n="plus" s={2}/> Add knowledge</button>
        : tab==='auto' ? <button className="dbtn ghost danger" onClick={act('All automations paused')}><DI n="pause" s={1.9}/> Pause all</button>
        : null}>

      <TrTabs tab={tab} setTab={setTab} counts={counts}/>
      {window.FADSTATE && <window.FADSTATE.StateBanner surface="Training sources"/>}

      {/* ---------------- TEACHINGS ---------------- */}
      {tab==='teach' && <>
        <div className="row" style={{gap:8,flexWrap:'wrap',margin:'2px 0 12px'}}>
          <span className="vseg">
            {['active','all','retired'].map(s=><span key={s} className={"vs"+(status===s?' on':'')} style={{textTransform:'capitalize'}} onClick={()=>setStatus(s)}>{s}</span>)}
          </span>
          <span className="aichip" style={{position:'relative'}} onClick={()=>setSrcOpen(o=>!o)}>
            Source: {src==='all'?'all':src} <DI n="chevD" s={2} style={{width:11,height:11}}/>
            {srcOpen && <div className="tdmenu" style={{minWidth:160}} onClick={e=>e.stopPropagation()}>
              {sources.map(s=><div key={s} className="tdmenu-it" onClick={()=>{setSrc(s);setSrcOpen(false);}}><span style={{fontSize:12.5,textTransform:s==='all'?'none':'none'}}>{s==='all'?'All sources':s}</span></div>)}
            </div>}
          </span>
          <span className="grow" style={{flex:1}}/>
          <span className="faint mono" style={{fontSize:10.5}}>{teachShown.length} of 140</span>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {teachShown.map(t=>(
            <div key={t.id} className="teach" onClick={()=>setOpen(t)}>
              <div style={{flex:1,minWidth:0}}>
                <div className="teach-tx">{t.text}</div>
                <div className="teach-meta">
                  <span>{t.scope}</span><span className="d">·</span>
                  <span>Channel: {t.channel}</span><span className="d">·</span>
                  <span className="row" style={{gap:5}}><DI n="spark" s={1.7} style={{width:10,height:10,color:'var(--indigo-bright)'}}/> {t.source}</span><span className="d">·</span>
                  <span>{t.ago}</span><span className="d">·</span>
                  <span>{t.apps} application{t.apps===1?'':'s'}</span>
                </div>
              </div>
              <span className={"bdg "+(t.status==='active'?'green':'gray')}>{t.status}</span>
            </div>
          ))}
        </div>
      </>}

      {/* ---------------- LEARNING QUEUE ---------------- */}
      {tab==='queue' && <>
        <div className="fbar" style={{margin:'2px 0 14px'}}>
          <span className="fi"><DI n="spark" s={1.6}/></span>
          <span className="ft"><b>Friday proposes rules from patterns it sees.</b> Approve to make them active teachings, edit first, or dismiss. Nothing here is applied until you approve it.</span>
        </div>
        {queue.length===0
          ? <div className="tdempty" style={{padding:'48px 0'}}><span className="tdempty-ic"><DI n="check" s={1.6}/></span><div style={{fontWeight:600,fontSize:14}}>Queue clear</div><div className="faint" style={{fontSize:12}}>No candidate learnings waiting. Friday will surface new ones as patterns emerge.</div></div>
          : <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {queue.map(q=>(
              <div key={q.id} className="panel lq">
                <div className="between" style={{alignItems:'flex-start',gap:14}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13.5,lineHeight:1.5,fontWeight:500}}>{q.text}</div>
                    <div className="teach-meta" style={{marginTop:8}}>
                      <span className="row" style={{gap:5}}><DI n="spark" s={1.7} style={{width:10,height:10,color:'var(--indigo-bright)'}}/> {q.origin}</span>
                      <span className="d">·</span><span>{q.scope}</span>
                    </div>
                  </div>
                  <div style={{flex:'0 0 132px',textAlign:'right'}}>
                    <div className="faint mono" style={{fontSize:9.5,marginBottom:4}}>CONFIDENCE</div>
                    <div className="lq-conf"><i style={{width:q.conf+'%',background:q.conf>=85?'var(--green)':q.conf>=75?'var(--indigo)':'var(--amber)'}}/></div>
                    <div className="mono" style={{fontSize:11,marginTop:3,color:'var(--tx-2)'}}>{q.conf}%</div>
                  </div>
                </div>
                <div className="row" style={{gap:7,marginTop:12}}>
                  <button className="dbtn green sm" onClick={()=>decide(q.id,'Approved — now an active teaching','green')}><DI n="check" s={2}/> Approve</button>
                  <button className="dbtn sm" onClick={()=>decide(q.id,'Opened to edit before approving')}>Edit & approve</button>
                  <span className="grow"/>
                  <button className="dbtn ghost sm" onClick={()=>decide(q.id,'Dismissed — Friday won’t propose this again','red')}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>}
      </>}

      {/* ---------------- SOURCES ---------------- */}
      {tab==='sources' && <>
        <div className="faint" style={{fontSize:12,margin:'4px 0 12px'}}>Where Friday is allowed to learn from. Turn a source off to stop new rules forming from it — existing rules stay.</div>
        <div className="panel" style={{padding:'2px 14px'}}>
          {TR_SOURCES.map((s,i)=>(
            <div key={i} className="srcrow">
              <span className="src-ic"><DI n={s.ic} s={1.7}/></span>
              <div style={{flex:1,minWidth:0}}>
                <div className="row" style={{gap:8}}><span style={{fontWeight:600,fontSize:13}}>{s.name}</span>{s.auto&&<span className="bdg indigo">auto-pattern</span>}</div>
                <div className="faint" style={{fontSize:11.5,marginTop:2}}>{s.sub}</div>
              </div>
              <div style={{textAlign:'right',flex:'0 0 96px'}}><div className="mono" style={{fontWeight:700,fontSize:15}}>{s.rules}</div><div className="faint mono" style={{fontSize:9}}>RULES</div></div>
              <div className="faint mono" style={{fontSize:10,flex:'0 0 72px',textAlign:'right'}}>{s.act}</div>
              <Toggle on={s.on} onToggle={()=>window.fadToast&&window.fadToast(s.on?'Stopped learning from '+s.name:'Now learning from '+s.name)}/>
            </div>
          ))}
        </div>
      </>}

      {/* ---------------- PERFORMANCE ---------------- */}
      {tab==='perf' && <>
        <div className="grid4" style={{margin:'6px 0 14px'}}>
          <Stat n="140" l="Active rules" d="+8 this month"/>
          <Stat n="1,284" l="Applications · 30d" d="across Inbox & replies" tone="green"/>
          <Stat n="91%" l="Accepted as-drafted" d="sent without edits" tone="green"/>
          <Stat n="0.4" l="Avg edits / draft" d="down from 1.1" tone="violet"/>
        </div>
        <div className="grid2" style={{alignItems:'start'}}>
          <div>
            <div className="dml">Draft quality by staff <span className="rule"/></div>
            <div className="panel" style={{padding:'10px 6px'}}>
              <table className="tbl">
                <thead><tr><th>Reviewer</th><th style={{textAlign:'right'}}>Drafts</th><th style={{textAlign:'right'}}>Edit rate</th><th style={{textAlign:'right'}}>On-voice</th></tr></thead>
                <tbody>{TR_STAFF.map((s,i)=>(
                  <tr key={i}><td><span className="row" style={{gap:8}}><span className="av1" style={{width:22,height:22,fontSize:8}}>{s[0]}</span>{s[1]}</span></td>
                  <td className="mono" style={{textAlign:'right'}}>{s[2]}</td>
                  <td className="mono" style={{textAlign:'right'}}>{s[3]}</td>
                  <td className="mono" style={{textAlign:'right',color:parseInt(s[4])>=90?'var(--green)':'var(--tx)'}}>{s[4]}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <div>
            <div className="dml">Most-applied teachings <span className="rule"/></div>
            <div className="panel" style={{display:'flex',flexDirection:'column',gap:2}}>
              {TR_TOP.map((t,i)=>(
                <div key={i} className="drow" style={{borderBottom:i<TR_TOP.length-1?'1px solid var(--line-2)':'none'}}>
                  <span style={{fontWeight:500}}>{t[0]}<span className="faint mono" style={{fontSize:9.5,marginLeft:8}}>{t[2]}</span></span>
                  <span className="mono" style={{color:'var(--indigo-bright)'}}>{t[1]}×</span>
                </div>
              ))}
              <div className="fbar" style={{marginTop:8,borderLeftColor:'var(--green)'}}>
                <span className="fi" style={{color:'var(--green)'}}><DI n="check" s={1.7}/></span>
                <span className="ft" style={{fontSize:11.5}}>Teaching impact is positive: edit rate dropped <b>64%</b> since the cleaning-fee & checkout rules went live.</span>
              </div>
            </div>
          </div>
        </div>
      </>}

      {/* ---------------- KNOWLEDGE BASE ---------------- */}
      {tab==='kb' && <>
        <div className="faint" style={{fontSize:12,margin:'4px 0 12px'}}>Durable facts Friday can reference — property quirks, policies and brand facts. Distinct from behavioural teachings.</div>
        {Object.entries(TR_KB).map(([grp,items])=>(
          <div key={grp} style={{marginBottom:16}}>
            <div className="dml">{grp} <span className="ct">{items.length}</span><span className="rule"/></div>
            <div className="panel" style={{padding:'2px 14px'}}>
              {items.map((it,i)=>(
                <div key={i} className="kbrow">
                  <span className={"pcodeD"} style={{flex:'0 0 auto'}}>{it[0]}</span>
                  <span style={{flex:1,fontSize:12.5}}>{it[1]}</span>
                  <span className="kb-ed" onClick={act('Editing knowledge entry')}><DI n="gear" s={1.7}/></span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </>}

      {/* ---------------- BRAND VOICE ---------------- */}
      {tab==='voice' && <>
        <div className="grid2" style={{alignItems:'start',marginTop:6}}>
          <div>
            <div className="dml">Voice principles <span className="rule"/></div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {TR_VOICE.map((v,i)=>(
                <div key={i} className="panel" style={{padding:'11px 13px'}}>
                  <div style={{fontWeight:600,fontSize:13}}>{v[0]}</div>
                  <div className="faint" style={{fontSize:12,marginTop:3,lineHeight:1.5}}>{v[1]}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="dml">In practice <span className="rule"/></div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {TR_EXAMPLES.map((e,i)=>(
                <div key={i} className="panel" style={{padding:13}}>
                  <div className="ex bad"><span className="ex-l">Off-voice</span><p>{e.bad}</p></div>
                  <div className="ex good"><span className="ex-l">On-voice</span><p>{e.good}</p></div>
                </div>
              ))}
              <div className="fbar"><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft" style={{fontSize:11.5}}>Friday checks every draft against these before showing it to you.</span></div>
            </div>
          </div>
        </div>
      </>}

      {/* ---------------- AUTOMATIONS ---------------- */}
      {tab==='auto' && <>
        <div className="gate" style={{margin:'4px 0 14px',borderStyle:'solid'}}><DI n="shield" s={1.8} style={{color:'var(--indigo-bright)',flex:'0 0 auto'}}/><span>Automations are how Friday <b>acts</b> on its rules. Anything marked <b>Needs approval</b> always waits for you. Toggle one off to stop it instantly.</span></div>
        <div className="dml">Active automations <span className="rule"/></div>
        <div className="panel" style={{padding:'2px 14px',marginBottom:16}}>
          {TR_AUTO.map((a,i)=>(
            <div key={i} className="autorow">
              <div style={{flex:1,minWidth:0}}>
                <div className="row" style={{gap:8}}><span style={{fontWeight:600,fontSize:13}}>{a.name}</span><span className={"bdg "+(a.gate==='Auto'?'amber':'indigo')}>{a.gate}</span></div>
                <div className="faint" style={{fontSize:11.5,marginTop:3}}><span className="mono" style={{color:'var(--tx-2)'}}>WHEN</span> {a.trig} <span className="mono" style={{color:'var(--tx-2)',marginLeft:6}}>→ DO</span> {a.act}</div>
              </div>
              <div className="faint mono" style={{fontSize:10,flex:'0 0 70px',textAlign:'right'}}>{a.run}</div>
              <Toggle on={auto[i]} onToggle={()=>{setAuto(p=>p.map((x,j)=>j===i?!x:x)); window.fadToast&&window.fadToast(auto[i]?a.name+' paused':a.name+' resumed', auto[i]?'red':'green');}}/>
            </div>
          ))}
        </div>
        <div className="dml">Audit log <span className="rule"/></div>
        <div className="panel" style={{padding:'2px 14px'}}>
          {TR_AUDIT.map((l,i)=>(
            <div key={i} className="drow" style={{borderBottom:i<TR_AUDIT.length-1?'1px solid var(--line-2)':'none'}}>
              <span className="row" style={{gap:9}}><span className={"adot "+l[0]}/>{l[1]}</span>
              <span className="faint mono" style={{fontSize:10}}>{l[2]}</span>
            </div>
          ))}
        </div>
      </>}

    </Shell>
    {open && <TeachingDrawer t={open} onClose={()=>setOpen(null)}/>}
    </>
  );
}

function Stat({n,l,d,tone}){
  return <div className={"statc"+(tone?' '+tone:'')}><div className="n">{n}</div><div className="l">{l}</div>{d&&<div className="d">{d}</div>}</div>;
}
function Toggle({on,onToggle}){
  const [v,setV]=React.useState(on);
  return <span className={"tgl"+(v?' on':'')} onClick={()=>{setV(!v);onToggle&&onToggle();}}><span className="knob"/></span>;
}

function TeachingDrawer({t,onClose}){
  const { DI } = window.FADD;
  const [edit,setEdit]=React.useState(false);
  const [txt,setTxt]=React.useState(t.text);
  const [status,setStatus]=React.useState(t.status);
  React.useEffect(()=>{const k=e=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[onClose]);
  return (
    <>
      <div className="tdscrim" onClick={onClose}/>
      <aside className="tddrawer" style={{width:540}} role="dialog">
        <div className="tdh">
          <div className="between"><span className="row" style={{gap:8}}><span className="bdg indigo">teaching</span><span className={"bdg "+(status==='active'?'green':'gray')}>{status}</span></span>
            <span className="icbtn" style={{cursor:'pointer'}} onClick={onClose}><DI n="x" s={2}/></span></div>
          <div className="dml" style={{margin:'14px 0 7px'}}>Instruction <span className="rule"/></div>
          {edit
            ? <textarea className="tdcomp-in" style={{width:'100%',minHeight:96,lineHeight:1.55,resize:'vertical'}} value={txt} onChange={e=>setTxt(e.target.value)}/>
            : <p style={{margin:0,fontSize:14,lineHeight:1.6}}>{txt}</p>}
        </div>
        <div className="tdbody">
          <div className="panel" style={{padding:'4px 13px'}}>
            <div className="drow"><span className="faint">Scope</span><span className="row" style={{gap:6}}><DI n="pin" s={1.7} style={{color:'var(--tx-3)'}}/>{t.scope}</span></div>
            <div className="drow"><span className="faint">Channel</span><span>{t.channel}</span></div>
            <div className="drow"><span className="faint">Learned from</span><span className="row" style={{gap:6}}><DI n="spark" s={1.7} style={{color:'var(--indigo-bright)'}}/>{t.source}</span></div>
            <div className="drow"><span className="faint">Created</span><span>{t.ago}</span></div>
            <div className="drow" style={{borderBottom:'none'}}><span className="faint">Applications</span><span className="mono" style={{color:'var(--indigo-bright)'}}>{t.apps}</span></div>
          </div>
          <div className="dml" style={{marginTop:18}}>Where it applied <span className="rule"/></div>
          {t.apps>0
            ? <div className="panel" style={{padding:'4px 13px'}}>
                <div className="drow"><span className="row" style={{gap:9}}><span style={{color:'var(--tx-3)'}}><DI n="inbox" s={1.7}/></span>Inbox reply · Marie L. (GBH-B4)</span><span className="faint mono" style={{fontSize:10}}>2d ago</span></div>
                <div className="drow" style={{borderBottom:'none'}}><span className="row" style={{gap:9}}><span style={{color:'var(--tx-3)'}}><DI n="inbox" s={1.7}/></span>Inbox reply · Sebasti\u00e1n M. (BW-C4)</span><span className="faint mono" style={{fontSize:10}}>5d ago</span></div>
              </div>
            : <div className="faint" style={{fontSize:12,padding:'2px 2px'}}>Not applied yet — Friday will use it the next time the context matches.</div>}
        </div>
        <div className="tdfoot">
          {edit
            ? <><button className="dbtn primary" onClick={()=>{setEdit(false);window.fadToast&&window.fadToast('Instruction updated');}}><DI n="check" s={2}/> Save</button><button className="dbtn ghost" onClick={()=>{setTxt(t.text);setEdit(false);}}>Cancel</button></>
            : <button className="dbtn ghost" onClick={()=>setEdit(true)}><DI n="gear" s={1.8}/> Edit instruction</button>}
          <span className="grow"/>
          {status==='active'
            ? <button className="dbtn ghost danger" onClick={()=>{setStatus('retired');window.fadToast&&window.fadToast('Teaching retired','red');}}><DI n="undo" s={1.8}/> Retire</button>
            : <button className="dbtn green" onClick={()=>{setStatus('active');window.fadToast&&window.fadToast('Teaching reactivated','green');}}><DI n="check" s={2}/> Reactivate</button>}
        </div>
      </aside>
    </>
  );
}

window.FADTRAIN = { ScreenTraining };
