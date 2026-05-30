/* FAD V2 — Field desktop screens · part 2: Reports, Team chat, Reviews, Notifications, Account */
const { DI: DI2, PriD: PriD2 } = window.FADD;
const { FieldShell: FShell, FIELD_ME: ME, fieldToast: toast2 } = window.FADFIELD;

function Stars({n, size=13}){
  return <span style={{display:'inline-flex',gap:1,color:'var(--amber)'}}>{[1,2,3,4,5].map(i=>(
    <svg key={i} viewBox="0 0 24 24" width={size} height={size} fill={i<=n?'currentColor':'none'} stroke="currentColor" strokeWidth="1.6">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z"/></svg>
  ))}</span>;
}

/* ============================ MY REPORTS ============================ */
function RepRowD({title, code, dept, by, when, status, tone, ai}){
  return (
    <tr className="tdrow">
      <td><div className="tt">{title}</div><div className="sub">{dept} · {by} · {when}</div></td>
      <td><span className="pcodeD">{code}</span></td>
      <td>{ai && <span className="bdg indigo"><DI2 n="spark" s={1.5}/> Friday-drafted</span>}</td>
      <td><span className={"bdg "+tone+" dot"}>{status}</span></td>
      <td style={{textAlign:'right'}}><span className="faint"><DI2 n="chevR" s={2}/></span></td>
    </tr>
  );
}
function FieldReports(){
  const [tab,setTab] = React.useState('mine');
  return (
    <FShell active="reports"
      eyebrow={<><DI2 n="flag" s={1.6} style={{color:'var(--amber)'}}/> REPORTS</>}
      title="My reports" sub="Issues you've flagged — vetted by your manager into tasks"
      tabs={[{l:'Reported by me',ct:3,on:tab==='mine'},{l:'On my properties',ct:2,on:tab==='props'}].map((x,i)=>({...x, k:undefined, _i:i}))}
      actions={<button className="dbtn primary" onClick={()=>toast2('New report — snap a photo & describe it')}><DI2 n="plus" s={2}/> Report an issue</button>}>

      {/* local tab control (FieldShell tabs aren't wired to local state) */}
      <div className="dtabs" style={{margin:'-16px 0 0',padding:'0 0 14px',borderBottom:'1px solid var(--line-2)'}}>
        <span className={"dtab"+(tab==='mine'?' on':'')} onClick={()=>setTab('mine')}>Reported by me <span className="ct">3</span></span>
        <span className={"dtab"+(tab==='props'?' on':'')} onClick={()=>setTab('props')}>On my properties <span className="ct">2</span></span>
      </div>

      <div className="gate" style={{borderStyle:'solid',margin:'16px 0'}}>
        <span style={{color:'var(--indigo-bright)',marginTop:1}}><DI2 n="spark" s={1.8}/></span>
        <span><b>Snap it, say it.</b> Add a photo and a quick note — Friday drafts the report and routes it to your ops manager. Once vetted, it becomes a task.</span>
      </div>

      {tab==='mine' ? (
        <div className="panel" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr><th>Issue</th><th>Property</th><th></th><th>Status</th><th></th></tr></thead>
            <tbody>
              <RepRowD title="Wifi keeps dropping in living room" code="VA-4" dept="admin" by="you" when="today" status="Open" tone="indigo"/>
              <RepRowD title="AC not cooling — master bedroom" code="SD-10" dept="maintenance" by="you" when="2d ago" status="In review" tone="amber" ai/>
              <RepRowD title="Cracked tile by the pool" code="GBH-C5" dept="housekeeping" by="you" when="1 wk ago" status="Resolved" tone="green"/>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr><th>Issue</th><th>Property</th><th>Reported by</th><th>Status</th><th></th></tr></thead>
            <tbody>
              <RepRowD title="Pool pump making loud noise" code="GBH-C5" dept="maintenance" by="Bryan" when="3h ago" status="Open" tone="red"/>
              <RepRowD title="Missing TV remote" code="RC-7" dept="housekeeping" by="Catherine" when="yesterday" status="Scheduled" tone="amber"/>
            </tbody>
          </table>
        </div>
      )}
    </FShell>
  );
}

/* ============================ TEAM CHAT ============================ */
function FieldChat(){
  const list = window.CHAT_LIST;
  const chats = window.CHATS;
  const [openId,setOpenId] = React.useState('west');
  const [draft,setDraft] = React.useState('');
  const chat = chats[openId] || chats.west;

  const send=()=>{ if(!draft.trim()) return; toast2('Message sent'); setDraft(''); };

  return (
    <FShell active="chat" bare>
      <div style={{padding:'18px 0 12px'}}>
        <div className="eyebrow" style={{fontFamily:'var(--mono)',fontSize:9.5,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--tx-3)',marginBottom:6}}>TEAM</div>
        <h1 style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:25,margin:0,color:'#f3f6fb'}}>Team chat</h1>
        <div className="sub" style={{color:'var(--tx-2)',fontSize:12.5,marginTop:4}}>Channels & direct messages · West zone</div>
      </div>

      <div className="inboxlay">
        <div className="ibthreads">
          {list.map((g,gi)=>(
            <div key={gi}>
              <div className="nsec" style={{padding:'10px 13px 4px'}}>{g.grp}</div>
              {g.items.map((it,ii)=>{
                const id = it.id;
                return (
                  <div key={ii} className={"ibth"+(openId===id?' on':'')} onClick={()=>setOpenId(id)}>
                    <span className="av1" style={{flex:'0 0 30px',width:30,height:30}}>{it.badge || <DI2 n={it.ic==='mega'?'bell':it.ic} s={1.7}/>}</span>
                    <div className="ibm">
                      <div className="nm">{it.name}{it.ment && <span className="tr-tag"><DI2 n="spark" s={1.5}/> @you</span>}<span className="t">{it.time}</span></div>
                      <div className="pv">{it.prev}</div>
                    </div>
                    {it.unread && <span className="bdg indigo" style={{height:18,padding:'0 6px'}}>{it.unread}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="ibconv">
          <div className="ibconv-h">
            <span className="av1">{chat.badge || <DI2 n="users" s={1.7}/>}</span>
            <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:13.5}}>{chat.name}</div><div className="faint" style={{fontSize:11}}>{chat.sub}</div></div>
            <span className="grow" style={{flex:1}}/>
            <span className="icbtn" onClick={()=>toast2('Calling…')}><DI2 n="bell" s={2}/></span>
          </div>
          <div className="ibmsgs">
            {chat.msgs.map((m,i)=>{
              if(m.day) return <div key={i} className="faint mono" style={{textAlign:'center',fontSize:9.5,letterSpacing:'.1em',textTransform:'uppercase',margin:'4px 0'}}>{m.day}</div>;
              const txt = (m.tx||'').replace('{hash}', m.hash?('#'+m.hash):'');
              return (
                <div key={i} className={"ibmsg"+(m.me?' me':'')}>
                  {!m.me && <div className="who">{m.from}</div>}
                  <div className="b">{m.mention && <span style={{color:'var(--indigo-bright)',fontWeight:600}}>@{m.mention} </span>}{txt}</div>
                  <div className="mt">{m.t}{m.read && ' · Read'}{m.readby && ' · Read by '+m.readby.length}</div>
                </div>
              );
            })}
          </div>
          <div className="ibcomp">
            <div className="row" style={{gap:9}}>
              <input className="finput" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send();}} placeholder={"Message "+chat.name+"…"} />
              <button className="dbtn primary" onClick={send}><DI2 n="chevR" s={2}/> Send</button>
            </div>
          </div>
        </div>
      </div>
    </FShell>
  );
}

/* ============================ MY REVIEWS ============================ */
function FieldReviews(){
  const R = window.MY_REVIEWS;
  const dist=[[5,19],[4,3],[3,1],[2,0],[1,0]];
  const max=Math.max(...dist.map(d=>d[1]));
  return (
    <FShell active="reviews"
      eyebrow="TEAM" title="My reviews" sub="Guest reviews on stays you turned over or maintained">

      <div className="grid3" style={{alignItems:'start'}}>
        <div className="panel" style={{textAlign:'center',padding:'20px 13px'}}>
          <div style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:46,lineHeight:1,color:'#f3f6fb'}}>{R.avg}</div>
          <div style={{margin:'8px 0 4px',display:'flex',justifyContent:'center'}}><Stars n={5} size={16}/></div>
          <div className="faint" style={{fontSize:11.5}}>across {R.count} guest reviews</div>
        </div>
        <div className="panel" style={{gridColumn:'span 2'}}>
          <div className="dml" style={{margin:'0 0 10px'}}>Rating breakdown <span className="rule"/></div>
          {dist.map((d,i)=>(
            <div key={i} className="row" style={{gap:10,marginBottom:7}}>
              <span className="mono faint" style={{width:26,fontSize:11}}>{d[0]}★</span>
              <span style={{flex:1,height:7,borderRadius:4,background:'var(--card-2)',overflow:'hidden'}}><i style={{display:'block',height:'100%',width:(d[1]/max*100)+'%',background: d[0]>=4?'var(--green)':d[0]===3?'var(--tx-3)':'var(--red)',borderRadius:4}}/></span>
              <span className="mono faint" style={{width:22,textAlign:'right',fontSize:11}}>{d[1]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="dml">Recent reviews <span className="ct">{R.items.length}</span><span className="rule"/></div>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {R.items.map((r,i)=>(
          <div key={i} className="panel">
            <div className="between" style={{marginBottom:8}}>
              <div className="row" style={{gap:10}}>
                <Stars n={r.stars}/>
                <span className="pcodeD">{r.prop}</span>
                <span className="bdg gray">{r.role}</span>
              </div>
              <span className="faint mono" style={{fontSize:10.5}}>{r.channel} · {r.when}</span>
            </div>
            <div style={{fontSize:13.5,lineHeight:1.6,color:'var(--tx)'}}>"{r.txt}"</div>
            <div className="faint" style={{fontSize:11.5,marginTop:8}}>— {r.guest}</div>
          </div>
        ))}
      </div>
    </FShell>
  );
}

/* ============================ NOTIFICATIONS ============================ */
const F_NOTIFS = [
  {ic:'spark', tone:'indigo', t:'Friday flagged SD-10 as urgent', d:'Recurring pump fault — check the breaker before resetting.', when:'6m ago', unread:true, go:()=>window.FIELDGO('task', window.TASK_LIST.today[1])},
  {ic:'msg', tone:'indigo', t:'Franny mentioned you in West Zone', d:'"can you cover the SD-10 follow-up after lunch?"', when:'18m ago', unread:true, go:()=>window.FIELDGO('chat')},
  {ic:'check', tone:'green', t:'Your GBH-C5 report was resolved', d:'Cracked tile by the pool — closed by maintenance.', when:'2h ago', unread:true, go:()=>window.FIELDGO('reports')},
  {ic:'flag', tone:'amber', t:'AC report moved to "In review"', d:'Your manager is vetting it into a task.', when:'yesterday', go:()=>window.FIELDGO('reports')},
  {ic:'star', tone:'amber', t:'New 5★ review on GBH-B4', d:'"Spotless on arrival…" — Marie L.', when:'2d ago', go:()=>window.FIELDGO('reviews')},
  {ic:'cal', tone:'gray', t:'Roster published — week of 25 May', d:'West zone · 08:00–17:00, weekend off.', when:'3d ago', go:()=>window.FIELDGO('schedule')},
];
function FieldNotifs(){
  const [read,setRead] = React.useState({});
  const unread = F_NOTIFS.filter((n,i)=>n.unread && !read[i]).length;
  return (
    <FShell active="notif"
      eyebrow={<><DI2 n="spark" s={1.6} style={{color:'var(--indigo-bright)'}}/> FRIDAY-FILTERED</>}
      title="Notifications" sub={unread+" unread · only what matters to your day"}
      actions={<button className="dbtn ghost" onClick={()=>setRead(F_NOTIFS.reduce((a,_,i)=>(a[i]=true,a),{}))}><DI2 n="check" s={2}/> Mark all read</button>}>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {F_NOTIFS.map((n,i)=>{
          const isUnread = n.unread && !read[i];
          return (
            <div key={i} className="qrow" style={{gridTemplateColumns:'auto 1fr auto',cursor:'pointer',background: isUnread?'var(--card)':'transparent'}}
              onClick={()=>{ setRead(r=>({...r,[i]:true})); n.go&&n.go(); }}>
              <span className={"n-ico bdg "+n.tone} style={{width:34,height:34,borderRadius:9,padding:0,justifyContent:'center'}}><DI2 n={n.ic} s={1.8}/></span>
              <div style={{minWidth:0}}>
                <div className="row" style={{gap:8}}><span className="tt" style={{fontSize:13.5}}>{n.t}</span>{isUnread && <span className="bdg indigo" style={{height:16,padding:'0 5px'}}>new</span>}</div>
                <div className="faint" style={{fontSize:12,marginTop:3,lineHeight:1.45}}>{n.d}</div>
              </div>
              <span className="faint mono" style={{fontSize:10.5,whiteSpace:'nowrap'}}>{n.when}</span>
            </div>
          );
        })}
      </div>
    </FShell>
  );
}

/* ============================ ACCOUNT ============================ */
function SetRow({ic, label, val, lock, onClick}){
  return (
    <div className="setrow" style={{padding:'12px 0',alignItems:'center',cursor:onClick?'pointer':'default'}} onClick={onClick}>
      <span className="bdg gray" style={{width:30,height:30,borderRadius:8,padding:0,justifyContent:'center'}}><DI2 n={ic} s={1.7}/></span>
      <div style={{flex:1,minWidth:0}}><div style={{fontSize:13}}>{label}</div></div>
      <span className="faint" style={{fontSize:12}}>{val}</span>
      {lock ? <span className="faint" style={{marginLeft:8}}><DI2 n="lock" s={1.8}/></span> : onClick && <span className="faint" style={{marginLeft:8}}><DI2 n="chevR" s={2}/></span>}
    </div>
  );
}
function FieldAccount(){
  return (
    <FShell active="account" eyebrow="ACCOUNT" title="Your account" sub="Profile, preferences & sign-out">
      <div className="ftask-lay">
        <div style={{minWidth:0}}>
          <div className="panel" style={{marginBottom:14}}>
            <div className="row" style={{gap:14}}>
              <span className="av1" style={{width:58,height:58,fontSize:18,background:'var(--indigo-dim)',borderColor:'var(--indigo-line)',color:'var(--indigo-bright)'}}>{ME.initials}</span>
              <div style={{minWidth:0}}>
                <div style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:22,color:'#f3f6fb'}}>{ME.name}</div>
                <div className="row" style={{gap:8,marginTop:6}}><span className="bdg indigo">{ME.role}</span><span className="bdg gray">{ME.zone}</span></div>
              </div>
            </div>
          </div>

          <div className="dml">Profile <span className="rule"/></div>
          <div className="panel">
            <SetRow ic="users" label="Full name" val={ME.name}/>
            <SetRow ic="msg" label="Email" val="ishant@fridayretreats.mu"/>
            <SetRow ic="bell" label="Phone" val="+230 5 xxx xxxx"/>
            <SetRow ic="pin" label="Zone" val={ME.zone} lock/>
            <SetRow ic="shield" label="Role & permissions" val="Field staff" lock/>
          </div>

          <div className="dml">Preferences <span className="rule"/></div>
          <div className="panel">
            <SetRow ic="bell" label="Notifications" val="Friday-filtered" onClick={()=>window.FIELDGO('notif')}/>
            <SetRow ic="sun" label="Appearance" val="Dark"/>
            <SetRow ic="doc" label="Language" val="English"/>
            <SetRow ic="spark" label="Help & tutorial" val="" onClick={()=>toast2('Opening the Friday walkthrough')}/>
          </div>

          <div style={{marginTop:16}}>
            <button className="dbtn danger" onClick={()=>toast2('Signed out')}><DI2 n="lock" s={2}/> Sign out</button>
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div className="panel">
            <div className="dml" style={{margin:'0 0 10px'}}>This month <span className="rule"/></div>
            <div className="kvlist">
              <div className="kv"><span className="k">Jobs completed</span><span className="v">61</span></div>
              <div className="kv"><span className="k">Hours logged</span><span className="v">142h</span></div>
              <div className="kv"><span className="k">Avg review</span><span className="v">4.8 ★</span></div>
              <div className="kv"><span className="k">Reports filed</span><span className="v">7</span></div>
            </div>
          </div>
          <div className="gate" style={{borderStyle:'solid'}}>
            <span style={{color:'var(--indigo-bright)',marginTop:1}}><DI2 n="spark" s={1.8}/></span>
            <span><b>Friday tip.</b> You're at <b>4.8★</b> this month — your fastest turnovers are at GBH. Keep the photo proof coming; it speeds up manager review.</span>
          </div>
        </div>
      </div>
    </FShell>
  );
}

window.FADFIELDSCREENS2 = { FieldReports, FieldChat, FieldReviews, FieldNotifs, FieldAccount };
