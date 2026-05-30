/* FAD V2 — Team chat (Slack-style), lives INSIDE the Inbox.
   Channels + DMs · threads · read receipts · reactions · pin · save-for-later ·
   mark unread · add/remove members · voice+video calls with a minimizable window. */
const { DI: TDI, Shell: TShell } = window.FADD;
const TT = (t,tone)=>window.fadToast&&window.fadToast(t,tone);
const fmtCall = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

const TEAM = {
  me:'franny',
  members:{
    franny:{nm:'Franny Henri',av:'FG',role:'GM',pres:'online'},
    bryan:{nm:'Bryan Ramluckun',av:'BR',role:'Field · North',pres:'online'},
    cath:{nm:'Catherine Appadoo',av:'CA',role:'Field · North',pres:'away'},
    matt:{nm:'Matthieu Duval',av:'MD',role:'Maintenance',pres:'online'},
    ishant:{nm:'Ishant Ayadassen',av:'IA',role:'Field · West',pres:'offline'},
    mary:{nm:'Mary Okafor',av:'MO',role:'Commercial',pres:'away'},
  },
};
const PRES={online:'var(--green)',away:'var(--amber)',offline:'var(--tx-4)'};

const CONVOS = {
  west:{type:'channel',name:'west-zone',members:['franny','bryan','cath','matt','ishant'],
    msgs:[
      {id:'m1',from:'franny',t:'08:38',tx:'Morning team — heavy day. SD-10 leak is urgent, GBH-B4 needs a turnover before 3.',rx:[['👍',3],['🙏',1]],read:['bryan','matt','ishant']},
      {id:'m2',from:'franny',t:'08:41',ment:'ishant',tx:'can you cover the SD-10 follow-up after lunch?',read:['ishant']},
      {id:'m3',from:'ishant',t:'08:43',tx:'On it. Doing the GBH-B4 turnover first, then SD-10.',read:['franny','bryan']},
      {id:'m4',from:'matt',t:'08:50',tx:'parts for the valve are in the van if it’s a #pump-fault',
        thread:[{from:'ishant',t:'08:54',tx:'great, grabbing them now'},{from:'matt',t:'08:55',tx:'cool — the 3/4" one'}]},
      {id:'m5',from:'friday',t:'08:52',tx:'Heads-up: SD-10 has tripped its pump 3× in 60 days. If the indicator light is red, check the breaker before resetting.',rx:[['⚡',2]],pinned:true},
      {id:'m6',from:'bryan',t:'09:04',tx:'North’s clear till 11. Shout if you need a hand on the West run.',rx:[['🙌',1]]},
    ]},
  north:{type:'channel',name:'north-zone',members:['franny','bryan','cath'],
    msgs:[{id:'n1',from:'bryan',t:'07:58',tx:'GBH-C5 pump serviced ✓ — quieter now.',rx:[['✅',2]],read:['franny','cath']}]},
  maint:{type:'channel',name:'maintenance',members:['franny','matt','ishant','bryan'],
    msgs:[{id:'x1',from:'matt',t:'Yesterday',tx:'Ordered 2 anti-odor valves — ETA Friday.',read:['franny']}]},
  ann:{type:'channel',name:'announcements',members:['franny','bryan','cath','matt','ishant','mary'],muted:true,
    msgs:[{id:'a1',from:'franny',t:'Mon',tx:'Water shut-off in Tamarin 2–4pm today. Plan turnovers around it.',rx:[['👍',5]],read:['bryan','cath','matt']}]},
  bryan:{type:'dm',name:'Bryan Ramluckun',members:['franny','bryan'],
    msgs:[{id:'b1',from:'franny',t:'08:30',tx:'All yours — North looks heavy today.',read:['bryan']},{id:'b2',from:'bryan',t:'08:31',tx:'👍 got it'}]},
  franny_ish:{type:'dm',name:'Ishant Ayadassen',members:['franny','ishant'],
    msgs:[{id:'i1',from:'ishant',t:'08:43',tx:'on it. doing GBH-B4 first'}]},
};

const SIDEBAR = [
  {grp:'Channels',ids:['ann','west','north','maint']},
  {grp:'Direct messages',ids:['bryan','franny_ish']},
];
const UNREAD={west:5,maint:2,franny_ish:1};
const MENTION={west:true};

function Avatar({id,size=34,ring}){
  const m=TEAM.members[id];
  if(!m) return null;
  return <span className="av1" style={{width:size,height:size,fontSize:size*0.32,flex:`0 0 ${size}px`,position:'relative',border:ring?'2px solid var(--rail)':undefined,marginLeft:ring}}>{m.av}<span className="pres" style={{background:PRES[m.pres]}}/></span>;
}

function ScreenTeamChat(props){ var inline=props&&props.inline;
  const [active,setActive]=React.useState('west');
  const [convos,setConvos]=React.useState(CONVOS);
  const [thread,setThread]=React.useState(null);      // message id whose thread is open
  const [members,setMembers]=React.useState(false);   // members panel open
  const [call,setCall]=React.useState(null);          // {kind, ids, elapsed, minimized}
  const [draft,setDraft]=React.useState('');
  const c=convos[active];

  React.useEffect(()=>{ if(!call||call.minimized&&false) {} if(!call) return; const iv=setInterval(()=>setCall(p=>p?{...p,elapsed:p.elapsed+1}:p),1000); return ()=>clearInterval(iv); },[call]);

  const send=()=>{ if(!draft.trim()) return; TT('Message sent to '+(c.type==='channel'?'#':'')+c.name); setDraft(''); };
  const startCall=(kind)=>setCall({kind,ids:c.members.filter(id=>id!==TEAM.me).slice(0,kind==='video'?3:1).concat(TEAM.me),elapsed:0,minimized:false});
  const pinned=(c.msgs||[]).filter(m=>m.pinned);

  const body = (<React.Fragment>
      {!inline && <React.Fragment><div className="row" style={{gap:11,padding:'16px 0 4px'}}>
        <button className="dbtn ghost sm" onClick={()=>window.FADGO('inbox')}><TDI n="chevL" s={2}/> Inbox</button>
        <span className="faint mono" style={{fontSize:11}}>Inbox <span style={{color:'var(--tx-4)'}}>›</span> Team chat</span>
      </div>
      <div style={{padding:'4px 0 12px'}}>
        <div className="eyebrow" style={{fontFamily:'var(--mono)',fontSize:9.5,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--tx-3)',marginBottom:6}}>INBOX · TEAM CHAT</div>
        <h1 style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:25,margin:0,color:'#f3f6fb'}}>Team chat</h1>
        <div className="sub" style={{color:'var(--tx-2)',fontSize:12.5,marginTop:4}}>Your team’s workspace — channels, DMs &amp; Friday in the loop · {Object.keys(TEAM.members).length} members</div>
      </div></React.Fragment>}

      <div className={"inboxlay tc-lay"+(thread?' withthread':'')}>
        {/* sidebar */}
        <div className="ibthreads">
          <div style={{padding:'10px 13px'}}><div className="aichip" style={{width:'100%',justifyContent:'flex-start'}}><TDI n="search" s={2}/> Search messages…</div></div>
          {SIDEBAR.map((g,gi)=>(
            <div key={gi}>
              <div className="row between" style={{padding:'6px 13px 3px'}}><span className="nsec" style={{padding:0}}>{g.grp}</span><span className="tc-add" onClick={()=>TT('New '+(g.grp==='Channels'?'channel':'message'))}><TDI n="plus" s={2}/></span></div>
              {g.ids.map(id=>{
                const cv=convos[id]; const on=active===id;
                return (
                  <div key={id} className={"ibth slackth"+(on?' on':'')} onClick={()=>{setActive(id);setThread(null);}}>
                    {cv.type==='dm' ? <Avatar id={cv.members.find(x=>x!==TEAM.me)} size={26}/> : <span className="chh">#</span>}
                    <div className="ibm">
                      <div className="nm" style={{fontWeight:UNREAD[id]?700:500}}>{cv.name}{MENTION[id]&&<span className="tr-tag"><TDI n="spark" s={1.5}/> @you</span>}{cv.muted&&<TDI n="bell" s={1.6} style={{width:11,height:11,opacity:.4,marginLeft:4}}/>}</div>
                      <div className="pv">{lastPrev(cv)}</div>
                    </div>
                    {UNREAD[id]>0 && <span className="bdg indigo" style={{height:18,padding:'0 6px'}}>{UNREAD[id]}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* conversation */}
        <div className="ibconv">
          <div className="ibconv-h">
            {c.type==='dm' ? <Avatar id={c.members.find(x=>x!==TEAM.me)} size={28}/> : <span className="chh" style={{width:26,height:26,fontSize:15}}>#</span>}
            <div style={{minWidth:0}}>
              <div style={{fontWeight:600,fontSize:13.5}}>{c.name}</div>
              <div className="faint" style={{fontSize:11}}>{c.members.length} members · {c.members.map(id=>TEAM.members[id].nm.split(' ')[0]).join(', ')}</div>
            </div>
            <span className="grow" style={{flex:1}}/>
            <span className="row" style={{marginRight:4}}>{c.members.slice(0,4).map((id,i)=><Avatar key={id} id={id} size={24} ring={i?-7:0}/>)}</span>
            <span className="tc-hbtn" title="Voice call" onClick={()=>startCall('audio')}><TDI n="phone" s={1.9}/></span>
            <span className="tc-hbtn" title="Video call" onClick={()=>startCall('video')}><TDI n="video" s={1.9}/></span>
            <span className={"tc-hbtn"+(members?' on':'')} title="Members" onClick={()=>setMembers(m=>!m)}><TDI n="users" s={1.9}/></span>
          </div>

          {pinned.length>0 && <div className="tc-pinbar"><TDI n="pin" s={1.7}/><span className="faint" style={{fontSize:11}}><b style={{color:'var(--tx)'}}>{pinned.length} pinned</b> · {pinned[0].from==='friday'?'Friday':TEAM.members[pinned[0].from].nm.split(' ')[0]}: {pinned[0].tx.slice(0,52)}…</span><span className="grow" style={{flex:1}}/><span className="dlink" style={{fontSize:11}} onClick={()=>TT('Showing pinned messages')}>View all</span></div>}

          <div className="ibmsgs">
            {(c.msgs||[]).map(m=> <Msg key={m.id} m={m} convoId={active} setConvos={setConvos}
              onThread={()=>setThread(m.id)} />)}
          </div>

          <div className="ibcomp">
            {active==='west' && <div className="slacktyping"><Avatar id="matt" size={18}/> Matthieu is typing<span className="fthinking" style={{marginLeft:4}}><i/><i/><i/></span></div>}
            <div className="slackcomp">
              <div className="slacktools"><span title="Bold"><b>B</b></span><span title="Italic" style={{fontStyle:'italic'}}>i</span><span title="Link"><TDI n="dlink" s={1.7}/></span><span title="Mention">@</span><span title="Emoji">☺</span><span title="Attach"><TDI n="plus" s={2}/></span></div>
              <div className="row" style={{gap:9}}>
                <input className="finput" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send();}} placeholder={"Message "+(c.type==='channel'?'#':'')+c.name} />
                <button className="dbtn primary" onClick={send}><TDI n="chevR" s={2}/> Send</button>
              </div>
            </div>
          </div>
        </div>

        {/* thread panel */}
        {thread && <ThreadPanel convo={c} mid={thread} onClose={()=>setThread(null)}/>}
      </div>

      {/* members panel */}
      {members && <MembersPanel convo={c} convoId={active} setConvos={setConvos} onClose={()=>setMembers(false)} onCall={()=>startCall('audio')}/>}

      {/* call */}
      {call && !call.minimized && <CallWindow call={call} setCall={setCall} convo={c}/>}
      {call && call.minimized && <CallPill call={call} setCall={setCall}/>}
  </React.Fragment>);
  return inline ? body : <TShell active="inbox" bare>{body}</TShell>;
}
function lastPrev(cv){ const m=(cv.msgs||[])[cv.msgs.length-1]; if(!m) return ''; const who=m.from==='friday'?'Friday':m.from===TEAM.me?'You':TEAM.members[m.from].nm.split(' ')[0]; return who+': '+m.tx.slice(0,40); }

/* a single message with hover toolbar + reactions + read receipts + thread link */
function Msg({m,convoId,setConvos,onThread}){
  const me=m.from===TEAM.me, friday=m.from==='friday';
  const mem=TEAM.members[m.from];
  const react=()=>{ setConvos(cs=>bump(cs,convoId,m.id,msg=>({...msg,rx:addRx(msg.rx,'👍')}))); TT('Reacted 👍'); };
  const pin=()=>{ setConvos(cs=>bump(cs,convoId,m.id,msg=>({...msg,pinned:!msg.pinned}))); TT(m.pinned?'Unpinned':'Pinned to conversation'); };
  return (
    <div className="slackmsg">
      {friday ? <img className="askmk" src="friday-f.png" alt="" style={{width:34,height:34,borderRadius:9,flex:'0 0 34px'}}/> : <Avatar id={m.from} size={34}/>}
      <div style={{minWidth:0,flex:1}}>
        <div className="slackh"><b>{friday?'Friday':me?'You':mem.nm}</b>{friday&&<span className="bdg indigo" style={{height:15,padding:'0 5px'}}>assistant</span>}<span className="faint mono" style={{fontSize:9.5}}>{m.t}</span>{m.pinned&&<span className="tc-pintag"><TDI n="pin" s={1.6}/> pinned</span>}</div>
        <div className="slacktx">{m.ment&&<span className="ment">@{m.ment}</span>} {(m.tx||'').split(/(#[\w-]+)/).map((p,k)=>p.startsWith('#')?<span key={k} className="hasht">{p}</span>:p)}</div>
        <Reactions m={m} onReact={react}/>
        {m.thread&&<div className="threadlink" onClick={onThread}><span className="row" style={{marginRight:2}}>{m.thread.slice(0,3).map((r,i)=><Avatar key={i} id={r.from} size={18} ring={i?-6:0}/>)}</span> {m.thread.length} repl{m.thread.length>1?'ies':'y'} · last {m.thread[m.thread.length-1].t}</div>}
        <ReadReceipt m={m} me={me}/>
      </div>
      <div className="msg-tools">
        <span title="React 👍" onClick={react}>👍</span>
        <span title="Reply in thread" onClick={onThread}><TDI n="msg" s={1.7}/></span>
        <span title={m.pinned?'Unpin':'Pin'} onClick={pin} className={m.pinned?'on':''}><TDI n="pin" s={1.7}/></span>
        <span title="Save for later" onClick={()=>TT('Saved for later')}><TDI n="bookmark" s={1.7}/></span>
        <span title="Mark unread from here" onClick={()=>TT('Marked unread from here')}><TDI n="unread" s={1.7}/></span>
      </div>
    </div>
  );
}
function Reactions({m,onReact}){
  if(!m.rx||!m.rx.length) return null;
  return <div className="row" style={{gap:5,marginTop:6,flexWrap:'wrap'}}>{m.rx.map((r,i)=><span key={i} className="rxn" onClick={onReact}>{r[0]} {r[1]}</span>)}<span className="rxn add" onClick={onReact}><TDI n="plus" s={2} style={{width:11,height:11}}/></span></div>;
}
function ReadReceipt({m,me}){
  if(!me||!m.read||!m.read.length) return null;
  return <div className="tc-read" title={'Seen by '+m.read.map(id=>TEAM.members[id].nm).join(', ')}>{m.read.slice(0,3).map((id,i)=><Avatar key={id} id={id} size={15} ring={i?-5:0}/>)}<span className="faint mono" style={{fontSize:9,marginLeft:5}}>Seen by {m.read.length}</span></div>;
}

/* thread side panel */
function ThreadPanel({convo,mid,onClose}){
  const root=(convo.msgs||[]).find(m=>m.id===mid);
  const [draft,setDraft]=React.useState('');
  if(!root) return null;
  const replies=root.thread||[];
  const who=m=>m.from==='friday'?'Friday':m.from===TEAM.me?'You':TEAM.members[m.from].nm;
  return (
    <div className="tc-thread">
      <div className="ibconv-h"><span style={{fontWeight:600,fontSize:13}}>Thread</span><span className="faint" style={{fontSize:11}}>· {convo.type==='channel'?'#'+convo.name:convo.name}</span><span className="grow" style={{flex:1}}/><span className="icbtn" style={{cursor:'pointer'}} onClick={onClose}><TDI n="x" s={2}/></span></div>
      <div className="ibmsgs">
        <div className="slackmsg" style={{borderBottom:'1px solid var(--line-2)',paddingBottom:12,marginBottom:4}}>
          {root.from==='friday'?<img className="askmk" src="friday-f.png" alt="" style={{width:32,height:32,borderRadius:9,flex:'0 0 32px'}}/>:<Avatar id={root.from} size={32}/>}
          <div style={{minWidth:0,flex:1}}><div className="slackh"><b>{who(root)}</b><span className="faint mono" style={{fontSize:9.5}}>{root.t}</span></div><div className="slacktx">{root.tx}</div></div>
        </div>
        <div className="faint mono" style={{fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',margin:'4px 0 8px'}}>{replies.length} repl{replies.length>1?'ies':'y'}</div>
        {replies.map((r,i)=>(
          <div key={i} className="slackmsg"><Avatar id={r.from} size={30}/><div style={{minWidth:0,flex:1}}><div className="slackh"><b>{who(r)}</b><span className="faint mono" style={{fontSize:9.5}}>{r.t}</span></div><div className="slacktx">{r.tx}</div></div></div>
        ))}
      </div>
      <div className="ibcomp"><div className="slackcomp"><div className="row" style={{gap:9}}><input className="finput" value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Reply in thread…"/><button className="dbtn primary" onClick={()=>{TT('Replied in thread');setDraft('');}}><TDI n="chevR" s={2}/></button></div></div></div>
    </div>
  );
}

/* members panel — add / remove */
function MembersPanel({convo,convoId,setConvos,onClose,onCall}){
  const inIds=convo.members;
  const outIds=Object.keys(TEAM.members).filter(id=>!inIds.includes(id));
  const remove=id=>{ setConvos(cs=>({...cs,[convoId]:{...cs[convoId],members:cs[convoId].members.filter(x=>x!==id)}})); TT('Removed '+TEAM.members[id].nm.split(' ')[0]); };
  const add=id=>{ setConvos(cs=>({...cs,[convoId]:{...cs[convoId],members:[...cs[convoId].members,id]}})); TT('Added '+TEAM.members[id].nm.split(' ')[0]); };
  return (
    <>
      <div className="tdscrim" onClick={onClose}/>
      <div className="tc-members">
        <div className="between" style={{marginBottom:12}}><div style={{fontWeight:700,fontSize:14}}>Members · {convo.type==='channel'?'#'+convo.name:convo.name}</div><span className="icbtn" style={{cursor:'pointer'}} onClick={onClose}><TDI n="x" s={2}/></span></div>
        <div className="dml" style={{margin:'0 0 8px'}}>In this conversation <span className="ct">{inIds.length}</span><span className="rule"/></div>
        {inIds.map(id=>{const m=TEAM.members[id];return (
          <div key={id} className="tc-mrow"><Avatar id={id} size={30}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600}}>{m.nm}{id===TEAM.me&&' (you)'}</div><div className="faint" style={{fontSize:11}}>{m.role}</div></div><span className="tc-pres-l" style={{color:PRES[m.pres]}}>{m.pres}</span>{id!==TEAM.me&&<button className="dbtn ghost sm" onClick={()=>remove(id)}>Remove</button>}</div>
        );})}
        {outIds.length>0 && <><div className="dml" style={{margin:'14px 0 8px'}}>Add people<span className="rule"/></div>
        {outIds.map(id=>{const m=TEAM.members[id];return (
          <div key={id} className="tc-mrow"><Avatar id={id} size={30}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600}}>{m.nm}</div><div className="faint" style={{fontSize:11}}>{m.role}</div></div><button className="dbtn ghost sm" onClick={()=>add(id)}><TDI n="plus" s={2}/> Add</button></div>
        );})}</>}
        <button className="dbtn primary" style={{width:'100%',marginTop:14}} onClick={onCall}><TDI n="phone" s={1.8}/> Start a call with this group</button>
      </div>
    </>
  );
}

/* call window (expanded) + minimized pill — mirrors the field PWA */
function CallWindow({call,setCall,convo}){
  const [muted,setMuted]=React.useState(false);
  const [vidOff,setVidOff]=React.useState(false);
  const [adding,setAdding]=React.useState(false);
  const video=call.kind==='video';
  const outIds=Object.keys(TEAM.members).filter(id=>!call.ids.includes(id));
  const addPerson=id=>{ setCall(c=>({...c,ids:[...c.ids,id]})); TT(TEAM.members[id].nm.split(' ')[0]+' added to the call'); setAdding(false); };
  return (
    <div className={"tc-call"+(video?' video':'')}>
      <div className="tc-call-top">
        <span className="tc-call-min" onClick={()=>setCall(c=>({...c,minimized:true}))}><TDI n="minimize" s={1.9}/></span>
        <span className="call-status"><span className="livedot" style={{background:'#fff'}}/> {fmtCall(call.elapsed)} · {video?'video':'audio'} call</span>
        <span style={{width:34}}/>
      </div>
      <div className="tc-call-stage">
        {call.ids.map(id=>(
          <div key={id} className={"tc-tile"+(video?' v':'')}>
            <div className="call-av" style={{width:video?54:64,height:video?54:64,fontSize:video?20:24}}>{TEAM.members[id].av}</div>
            <div className="tc-tile-nm">{id===TEAM.me?'You':TEAM.members[id].nm.split(' ')[0]}{id===TEAM.me&&muted&&' · muted'}</div>
          </div>
        ))}
        {adding && <div className="tc-addpop">
          <div className="faint mono" style={{fontSize:9,letterSpacing:'.1em',marginBottom:6}}>ADD TO CALL</div>
          {outIds.length?outIds.map(id=><div key={id} className="tc-mrow" onClick={()=>addPerson(id)} style={{cursor:'pointer'}}><Avatar id={id} size={26}/><span style={{flex:1,fontSize:12.5}}>{TEAM.members[id].nm}</span><TDI n="plus" s={2}/></div>):<div className="faint" style={{fontSize:12}}>Everyone’s already here.</div>}
        </div>}
      </div>
      <div className="call-controls">
        <Cc icon={muted?'micOff':'mic'} label={muted?'Unmute':'Mute'} off={muted} onClick={()=>setMuted(m=>!m)}/>
        {video&&<Cc icon={vidOff?'videoOff':'video'} label={vidOff?'Start':'Stop'} off={vidOff} onClick={()=>setVidOff(v=>!v)}/>}
        <Cc icon="userplus" label="Add" on={adding} onClick={()=>setAdding(a=>!a)}/>
        <Cc icon="volume" label="Speaker"/>
        <Cc icon="phoneOff" label="End" end onClick={()=>{setCall(null);TT('Call ended');}}/>
      </div>
    </div>
  );
}
function Cc({icon,label,off,on,end,onClick}){
  return <div className="cc-wrap"><button className={"cc"+(off?' off':'')+(on?' onx':'')+(end?' end':'')} onClick={onClick}><TDI n={icon} s={1.9}/></button><span className="cc-label">{label}</span></div>;
}
function CallPill({call,setCall}){
  return (
    <div className="tc-callpill" onClick={()=>setCall(c=>({...c,minimized:false}))}>
      <span className="livedot"/>
      <span className="mono" style={{fontSize:12,fontWeight:600}}>{fmtCall(call.elapsed)}</span>
      <span className="faint" style={{fontSize:11.5}}>· {call.ids.length} on {call.kind} call</span>
      <span className="tc-pill-btn" onClick={(e)=>{e.stopPropagation();setCall(c=>({...c,minimized:false}));}}><TDI n="expand" s={2}/></span>
      <span className="tc-pill-btn end" onClick={(e)=>{e.stopPropagation();setCall(null);window.fadToast&&window.fadToast('Call ended');}}><TDI n="phoneOff" s={2}/></span>
    </div>
  );
}
function bump(cs,cid,mid,fn){ return {...cs,[cid]:{...cs[cid],msgs:cs[cid].msgs.map(m=>m.id===mid?fn(m):m)}}; }
function addRx(rx,e){ rx=rx?rx.slice():[]; const i=rx.findIndex(r=>r[0]===e); if(i>=0) rx[i]=[e,rx[i][1]+1]; else rx.push([e,1]); return rx; }

window.FADTEAM = { ScreenTeamChat };
