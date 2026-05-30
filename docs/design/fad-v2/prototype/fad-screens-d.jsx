/* FAD V2 — prototype screens D: Requirements · Complete flow · Chat thread */

function ReqSection({task, section}){
  const nav = useNav();
  const rf = nav.reqFor(task.id);
  if(section.type==='inventory'){
    return (
      <div className="reqsection">
        <div className="reqhead"><span className="rtitle">{section.title}</span></div>
        {section.sub && <div className="faint" style={{fontSize:11,padding:'0 13px 4px'}}>{section.sub}</div>}
        {section.items.map(it=>{
          const val = rf.counts[it.key]!==undefined ? rf.counts[it.key] : it.count;
          const short = val < it.par;
          return (
            <div key={it.key} className={"invrow"+(short?" short":"")}>
              <div className="sm" style={{flex:1}}>
                <div className="invn">{it.name}{short && <span className="ai-tag" style={{color:'var(--amber)',marginLeft:7}}>restock {it.par-val}</span>}</div>
                <div className="invpar">par {it.par} · have {val}</div>
              </div>
              {it.track && <span className="lflag tap" title="Flag damaged / broken / missing" style={{marginRight:8}} onClick={()=>nav.go('report',null,'up')}><Icon n="flag" s={1.9}/></span>}
              <div className="stepper">
                <button onClick={()=>nav.setCount(task.id,it.key,val-1)}>−</button>
                <span className="val">{val}</span>
                <button onClick={()=>nav.setCount(task.id,it.key,val+1)}>+</button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  const done = section.items.filter(i=>rf.checks[i.key]).length;
  return (
    <div className="reqsection">
      <div className="reqhead"><span className="rtitle">{section.title}</span><span className="rprog">{done}/{section.items.length}</span></div>
      <div className="reqbar"><i style={{width:(done/section.items.length*100)+'%'}}/></div>
      {section.sub && <div className="faint" style={{fontSize:11,padding:'8px 13px 0'}}>{section.sub}</div>}
      {section.items.map(it=>{
        const on = !!rf.checks[it.key];
        const pc = (rf.itemPhotos&&rf.itemPhotos[it.key])||0;
        return (
          <div key={it.key} className={"checkitem tap"+(on?" on":"")} onClick={()=>nav.toggleCheck(task.id,it.key)}>
            <span className="cbx"><Icon n="check" s={3}/></span>
            <div style={{flex:1,minWidth:0}}>
              <span className="clabel">{it.label}{it.photo && <span className="photoflag"><Icon n="cam" s={2}/> photo</span>}</span>
              {it.photo && (
                <div className="itemphotos" onClick={e=>e.stopPropagation()}>
                  {Array.from({length:pc}).map((_,i)=>(
                    <span key={i} className="iph" style={{background:`linear-gradient(150deg,${['#26343a','#2b3346','#2e2738'][i%3]},#1a2130)`}}/>
                  ))}
                  <span className={"addphoto tap"+(pc===0?" need":"")} onClick={()=>nav.addItemPhoto(task.id,it.key)}>
                    <Icon n="cam" s={1.9}/> {pc===0?'Add photo':'Add'}
                  </span>
                  {pc>0 && <span className="ai-tag" style={{color:'var(--green)'}}><Icon n="check" s={2.4}/> {pc}</span>}
                </div>
              )}
            </div>
            {it.req && !on && <span className="creq">required</span>}
          </div>
        );
      })}
    </div>
  );
}

function ScreenRequirements({task}){
  const nav = useNav();
  task = task || TASKS.turnover;
  const rf = nav.reqFor(task.id);
  const checkItems = (task.requirements||[]).filter(s=>s.type==='check').flatMap(s=>s.items);
  const done = checkItems.filter(i=>rf.checks[i.key]).length;
  return (
    <div className="fad">
      <StatusBar/>
      <div className="detailtop"><div className="between">
        <BackBtn label={task.title}/>
        <span className="badge gray">{task.code}</span>
      </div></div>
      <div className="apphead" style={{paddingTop:12}}>
        <div className="eyebrow">{task.code} · {task.dept.toUpperCase()}</div>
        <h1>Requirements</h1>
      </div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="aigate" style={{borderStyle:'solid'}}>
          <span className="ic" style={{fontSize:15}}><Icon n="shield" s={1.8}/></span>
          <span className="tx">Work through each list as you go. <b>{done}/{checkItems.length}</b> checks done — required items must be ticked before you can complete.</span>
        </div>
        {(task.requirements||[]).map((s,i)=>(
          <React.Fragment key={i}><MLabel rule={false}>{s.title}</MLabel><ReqSection task={task} section={s}/></React.Fragment>
        ))}
        <MLabel rule={false}>Photos</MLabel>
        <div className="photogrid">
          {Array.from({length:rf.photos}).map((_,i)=>(
            <div key={i} className="photo" style={{background:`linear-gradient(150deg,${['#2b3346','#2e2738','#26343a','#332b2b'][i%4]},#1a2130)`}}/>
          ))}
          <div className="photo add tap" onClick={()=>nav.addPhoto(task.id)}><Icon n="cam" s={1.7}/></div>
        </div>
        <div className="faint" style={{fontSize:11,marginTop:7}}>Tap to add before/after photos</div>
      </div></div>
      <div className="composer">
        <button className="btn primary full tap" style={{height:46,fontSize:14.5}} onClick={()=>nav.back()}>
          <Icon n="check" s={2}/> Save &amp; back to task
        </button>
      </div>
    </div>
  );
}

function ScreenComplete({task}){
  const nav = useNav();
  task = task || TASKS.water;
  const tm = nav.timerFor(task.id);
  const rf = nav.reqFor(task.id);
  const [submitted,setSubmitted] = React.useState(false);
  const reqItems = (task.requirements||[]).filter(s=>s.type==='check').flatMap(s=>s.items);
  const requiredLeft = reqItems.filter(i=>i.req && !rf.checks[i.key]).length;
  const photoOk = rf.photos>0;

  if(submitted){
    return (
      <div className="fad">
        <StatusBar/>
        <div className="fad-body"><div className="fad-scroll" style={{display:'flex',flexDirection:'column'}}>
          <div className="successwrap" style={{marginTop:40}}>
            <div className="successring"><Icon n="check" s={2.4}/></div>
            <h1 style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:28,margin:0}}>Task complete</h1>
            <p className="dim" style={{margin:0,fontSize:13.5,lineHeight:1.5}}>
              {task.title} · logged <b style={{color:'var(--tx)'}}>{fmtDur(tm.elapsed)}</b>.<br/>Your summary was auto-posted as the <b style={{color:'var(--tx)'}}>closing comment</b>, with photo proof attached.
            </p>
            <div className="aigate" style={{borderStyle:'solid',textAlign:'left',marginTop:8}}>
              <span className="ic" style={{fontSize:15}}><Icon n="sparkle" s={1.8}/></span>
              <span className="tx">Friday notified <b>Franny (GM)</b> and updated the property record. Nice work.</span>
            </div>
          </div>
        </div></div>
        <div className="composer" style={{display:'flex',flexDirection:'column',gap:8}}>
          <button className="btn primary full tap" style={{height:46}} onClick={()=>nav.tab('tasks')}>Back to my tasks</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fad">
      <StatusBar/>
      <div className="detailtop"><div className="between">
        <BackBtn label="Task"/>
        <span className="badge gray">{task.code}</span>
      </div></div>
      <div className="apphead" style={{paddingTop:12}}>
        <div className="eyebrow">{task.code} · {task.dept.toUpperCase()}</div>
        <h1>Complete task</h1>
      </div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="tcard" style={{alignItems:'center'}}>
          <div className="bl" style={{fontFamily:'var(--mono)',fontSize:10,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--tx-3)'}}>Time on task</div>
          <div style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:34,letterSpacing:'-0.02em'}}>{fmtTimer(tm.elapsed||0)}</div>
        </div>

        {requiredLeft>0 && (
          <div className="aigate tap" style={{borderColor:'var(--red-ghost)',background:'var(--red-ghost)',marginTop:14}} onClick={()=>nav.back()}>
            <span className="ic" style={{fontSize:15,color:'var(--red)'}}><Icon n="alert" s={1.9}/></span>
            <span className="tx"><b style={{color:'var(--red)'}}>{requiredLeft} required check{requiredLeft>1?'s':''} left.</b> Tap to finish the requirements first.</span>
          </div>
        )}

        <MLabel rule={false}>Execution summary</MLabel>
        <div className="textarea">What changed, what was found, what remains…</div>
        <button className="btn sm ghost tap mt8" style={{alignSelf:'flex-start'}}><Icon n="sparkle" s={1.7}/> Draft with Friday</button>

        <MLabel rule={false}>Photo proof {photoOk?'':<span className="creq" style={{marginLeft:6}}>required</span>}</MLabel>
        <div className="photogrid">
          {Array.from({length:Math.max(rf.photos,0)}).map((_,i)=>(
            <div key={i} className="photo" style={{background:`linear-gradient(150deg,${['#26343a','#2b3346','#2e2738'][i%3]},#1a2130)`}}/>
          ))}
          <div className="photo add tap" onClick={()=>nav.addPhoto(task.id)}><Icon n="cam" s={1.7}/></div>
        </div>

        <MLabel rule={false}>Supplies used</MLabel>
        <div className="row gap6" style={{flexWrap:'wrap'}}>
          {(task.supplies||[]).map((s,i)=><span key={i} className="badge gray">{s.name} ×{s.qty}</span>)}
          <span className="badge indigo tap" onClick={()=>nav.go('supplies',{task})}>edit</span>
        </div>
      </div></div>
      <div className="composer" style={{display:'flex',flexDirection:'column',gap:8}}>
        <button className={"btn full tap"+(requiredLeft>0||!photoOk?"":" primary")} disabled={requiredLeft>0||!photoOk}
          style={{height:48,fontSize:15,opacity:(requiredLeft>0||!photoOk)?0.5:1,background:(requiredLeft>0||!photoOk)?'var(--card-2)':null}}
          onClick={()=>{ if(requiredLeft===0&&photoOk){ nav.completeTimer(task.id); setSubmitted(true); } }}>
          <Icon n="check" s={2.2}/> Mark complete
        </button>
        {!photoOk && requiredLeft===0 && <div className="faint" style={{textAlign:'center',fontSize:11}}>Add at least one photo to complete</div>}
      </div>
    </div>
  );
}

/* ---------- Chat thread ---------- */
function msgBody(m){
  let parts = [];
  if(m.mention) parts.push(<span key="m" className="ment">@{m.mention} </span>);
  if(m.hash && m.tx.includes('{hash}')){
    const seg = m.tx.split('{hash}');
    parts.push(<React.Fragment key="t">{seg[0]}<span className="hash">#{m.hash}</span>{seg[1]||''}</React.Fragment>);
  } else {
    parts.push(<React.Fragment key="t">{m.tx}</React.Fragment>);
  }
  return parts;
}
function ScreenChatThread({chat}){
  const nav = useNav();
  chat = chat || CHATS.west;
  return (
    <div className="fad">
      <StatusBar/>
      <div className="threadhead">
        <BackBtn label=""/>
        {chat.ic ? <span className={"ch-ic "+(chat.icCls||"")}><Icon n={chat.ic} s={1.8}/></span>
                 : <span className="avatar" style={{width:38,height:38,flex:'0 0 38px',fontSize:12,borderRadius:'50%'}}>{chat.badge}</span>}
        <div style={{flex:1,minWidth:0}}>
          <div className="tn">{chat.name}</div>
          <div className="ts">{chat.sub}</div>
        </div>
        <div className="row gap6">
          <span className="iconbtn tap" style={{width:34,height:34}} onClick={()=>nav.startCall(chat.name,'audio')}><Icon n="phone" s={2}/></span>
          <span className="iconbtn tap" style={{width:34,height:34}} onClick={()=>nav.startCall(chat.name,'video')}><Icon n="video" s={1.9}/></span>
        </div>
      </div>
      <div className="thread">
        {chat.msgs.map((m,i)=> m.day ? (
          <div key={i} className="daysep">{m.day}</div>
        ) : (
          <div key={i} className={"msg"+(m.me?" me":"")}>
            {!m.me && <div className="mname">{m.from}</div>}
            <div className="mb">{msgBody(m)}</div>
            <div className="mt">{m.t}</div>
            {m.me && m.readby && (
              <div className="readby">
                {m.readby.slice(0,3).map((n,k)=><span key={k} className="rb-av">{n[0]}</span>)}
                <span className="rb-tx">Read by {m.readby.slice(0,2).join(', ')}{m.readby.length>2?' +'+(m.readby.length-2):''}</span>
              </div>
            )}
            {m.me && !m.readby && m.read && <div className="readby"><span className="rb-tx">Read</span></div>}
          </div>
        ))}
      </div>
      <div className="composer">
        <div className="cin">
          <span style={{color:'var(--tx-3)',fontSize:16}}><Icon n="plus" s={2}/></span>
          <span className="cph">Message…</span>
          <span style={{color:'var(--teal)',fontWeight:700,fontFamily:'var(--mono)'}}>#</span>
          <span style={{color:'var(--indigo-bright)',fontWeight:700,fontFamily:'var(--mono)'}}>@</span>
          <button className="csend"><Icon n="send" s={2}/></button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Property (per-task context) ---------- */
function ScreenProperty({task, completed}){
  task = task || TASKS.water;
  const nav = useNav();
  const [revealed,setRevealed] = React.useState(false);
  const acc = (window.ACCESS||{})[task.code];
  const g = (window.GUIDE||{})[task.code] || window.GUIDE_DEFAULT;
  const lost = window.LOST_ITEMS || [];
  const issues = (window.PROP_ISSUES||{})[task.code] || [];
  const checkin = (window.CHECKIN||{})[task.code];
  const mapsUrl = 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent((task.addr||task.code)+' Mauritius');
  const propName = (task.addr||'').split(' · ')[0] || task.code;
  return (
    <div className="fad">
      <StatusBar/>
      <div className="detailtop"><div className="between">
        <BackBtn label={task.title}/>
        <span className="badge gray">{task.code}</span>
      </div></div>
      <div className="apphead" style={{paddingTop:12}}>
        <div className="eyebrow">PROPERTY · {task.code}</div>
        <h1>{propName}</h1>
        <div className="row gap6 mt8" style={{flexWrap:'wrap'}}>
          <Occ state={task.occState}>{task.occ}</Occ>
        </div>
      </div>
      <div className="fad-body"><div className="fad-scroll">
        <a className="btn primary full tap" href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{height:46,fontSize:14,textDecoration:'none'}}>
          <Icon n="pin" s={1.9}/> Open in Google Maps
        </a>
        <div className="faint" style={{fontSize:11,marginTop:7,textAlign:'center'}}>{task.addr}</div>

        <MLabel rule={false}>Check-in instructions</MLabel>
        <div className="tcard"><p style={{margin:0,fontSize:13,lineHeight:1.55,color:'var(--tx)'}}>{checkin || 'No special instructions — standard lockbox entry.'}</p></div>

        <MLabel rule={false}>On-site guide</MLabel>
        <div className="setgroup">
          <div className="guiderow"><span className="gi"><Icon n="wifi" s={2}/></span><div className="gmain"><div className="gl">Wi-Fi</div><div className="gv">{acc?<><b>{acc.wifi}</b> · pass <b>{acc.wifipass}</b></>:'Ask your manager'}</div></div></div>
          <div className="guiderow"><span className="gi"><Icon n="car" s={1.9}/></span><div className="gmain"><div className="gl">Parking</div><div className="gv">{g.parking}</div></div></div>
          <div className="guiderow"><span className="gi"><Icon n="trash" s={1.9}/></span><div className="gmain"><div className="gl">Bins</div><div className="gv">{g.bins}</div></div></div>
          <div className="guiderow"><span className="gi"><Icon n="drop" s={1.9}/></span><div className="gmain"><div className="gl">Water mains</div><div className="gv">{g.mains}</div></div></div>
          <div className="guiderow"><span className="gi"><Icon n="zap" s={1.9}/></span><div className="gmain"><div className="gl">Fuse box</div><div className="gv">{g.utility}</div></div></div>
          <div className="guiderow"><span className="gi"><Icon n="box" s={1.8}/></span><div className="gmain"><div className="gl">Linen &amp; supplies</div><div className="gv">{g.storage}</div></div></div>
          {g.notes&&g.notes!=='—' && <div className="guiderow"><span className="gi"><Icon n="info" s={1.9}/></span><div className="gmain"><div className="gl">Good to know</div><div className="gv">{g.notes}</div></div></div>}
        </div>

        <MLabel rule={false}>Access</MLabel>
        {completed ? (
          <div className="tcard" style={{flexDirection:'row',alignItems:'center',gap:10}}>
            <span style={{color:'var(--tx-3)',fontSize:16}}><Icon n="lock" s={1.9}/></span>
            <span className="dim" style={{fontSize:12.5,flex:1}}>Access codes are closed for completed tasks. Reopen the task if you need re-entry.</span>
          </div>
        ) : !revealed ? (
          <div className="tcard">
            <div className="between">
              <span className="row gap6" style={{fontWeight:600,fontSize:13.5}}><Icon n="lock" s={2} style={{color:'var(--tx-2)'}}/> Access policy</span>
              <SrcChip src="bz">audit-only</SrcChip>
            </div>
            <p className="dim" style={{margin:0,fontSize:12.5,lineHeight:1.5}}>Codes stay in source. Revealing is logged to the property audit trail with your name &amp; time.</p>
            <button className="btn sm tap" style={{alignSelf:'flex-start',background:'var(--indigo)',borderColor:'var(--indigo)',color:'#fff'}} onClick={()=>setRevealed(true)}><Icon n="shield" s={1.8}/> Reveal code (logged)</button>
          </div>
        ) : (
          <div className="tcard" style={{gap:9}}>
            <div className="between">
              <span className="row gap6" style={{fontWeight:600,fontSize:13.5,color:'var(--green)'}}><Icon n="lock" s={2}/> Codes revealed</span>
              <span className="ai-tag" style={{color:'var(--amber)'}}><Icon n="shield" s={1.7}/> logged 09:14</span>
            </div>
            <div className="codebox"><span className="cl">Lockbox</span><span className="cv">{acc?acc.lockbox:'4827'}</span></div>
            {acc&&acc.alarm&&acc.alarm!=='—' && <div className="codebox"><span className="cl">Alarm</span><span className="cv">{acc.alarm}</span></div>}
            <div className="faint" style={{fontSize:10.5,fontFamily:'var(--mono)',display:'flex',alignItems:'center',gap:6}}>
              <Icon n="shield" s={2}/> Reveal logged to {task.code} audit trail · Ishant Ayadassen
            </div>
            <button className="btn sm ghost tap" style={{alignSelf:'flex-start'}} onClick={()=>setRevealed(false)}>Hide codes</button>
          </div>
        )}

        <MLabel rule={false} count={issues.length}>Active issues on this property</MLabel>
        <div className="stack-sm">
          {issues.length===0 && <div className="faint" style={{fontSize:12.5,padding:'4px 2px'}}>No open issues reported here.</div>}
          {issues.map((is,i)=>(
            <div key={i} className="pissue">
              <Badge tone={is.tone} dot>{is.status}</Badge>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:500}}>{is.title}</div>
                <div className="faint" style={{fontFamily:'var(--mono)',fontSize:9.5,marginTop:2}}>{is.by} · {is.when}</div>
              </div>
            </div>
          ))}
        </div>
        <button className="btn ghost full mt12 tap" style={{height:40,color:'var(--amber)'}} onClick={()=>nav.go('report',null,'up')}><Icon n="flag" s={1.8}/> Report an issue here</button>
      </div></div>
      <TabBar active="tasks"/>
    </div>
  );
}

Object.assign(window, { ReqSection, ScreenRequirements, ScreenComplete, ScreenChatThread, msgBody, ScreenProperty });
