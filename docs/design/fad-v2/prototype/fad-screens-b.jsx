/* FAD V2 — prototype screens B: Chat list · Notifications · Account */

function ChRow({item, onClick}){
  return (
    <div className={"chrow tap"+(item.unread?" unread":"")} onClick={onClick}>
      {item.ic ? <span className={"ch-ic "+(item.icCls||"")}><Icon n={item.ic} s={1.9}/></span>
               : <span className="avatar" style={{width:42,height:42,flex:'0 0 42px',fontSize:13,borderRadius:'50%'}}>{item.badge}</span>}
      <div className="ch-main">
        <div className="ch-top"><span className="ch-name">{item.name}</span><span className="ch-time">{item.time}</span></div>
        <div className="ch-prev">{item.ment && <span className="ment">@you </span>}{item.prev}</div>
      </div>
      {item.unread && <span className="unreadpill">{item.unread}</span>}
    </div>
  );
}
function ScreenChat(){
  const nav = useNav();
  return (
    <div className="fad">
      <StatusBar/>
      <AppHeader eyebrow="TEAM" title="Chat"/>
      <div style={{padding:'0 16px 12px'}}>
        <div className="row gap10 tap" style={{background:'var(--card)',border:'1px solid var(--line)',borderRadius:11,padding:'9px 12px',color:'var(--tx-3)',fontSize:13}}>
          <Icon n="search" s={2}/><span style={{whiteSpace:'nowrap'}}>Search people &amp; channels</span>
        </div>
      </div>
      <div className="fad-body"><div className="fad-scroll">
        {CHAT_LIST.map((g,i)=>(
          <React.Fragment key={i}>
            <MLabel rule={true}>{g.grp}</MLabel>
            <div className="stack-sm">
              {g.items.map((it,j)=><ChRow key={j} item={it} onClick={()=>nav.go('chatthread', {chat: CHATS[it.id]})}/>)}
            </div>
          </React.Fragment>
        ))}
      </div></div>
      <TabBar active="chat"/>
    </div>
  );
}

function NRow({ic, icCls, children, time, dot}){
  return (
    <div className="nrow">
      <span className={"n-ic "+icCls}><Icon n={ic} s={1.9}/></span>
      <div className="n-main"><div className="n-tx">{children}</div><div className="n-time">{time}</div></div>
      {dot && <span className="n-dot"/>}
    </div>
  );
}
function ScreenNotifs(){
  const nav = useNav();
  return (
    <div className="fad">
      <StatusBar/>
      <div className="detailtop"><div className="between"><BackBtn label="Back"/><span className="badge gray">6 new</span></div></div>
      <div className="apphead" style={{paddingTop:12}}><div className="eyebrow">INBOX</div><h1>Notifications</h1></div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="brief" style={{marginTop:2}}>
          <div className="bh"><Badge tone="indigo"><Icon n="sparkle" s={1.6}/> Friday filtered your alerts</Badge></div>
          <p>I muted <span className="hl">3,847 low-signal</span> notifications this week and surfaced the <span className="hl">6</span> that actually need you.</p>
        </div>
        <MLabel count="3" rule={true}>Needs you</MLabel>
        <div>
          <NRow ic="alert" icCls="task" time="2m ago · BW-C4" dot><b>Urgent assigned to you</b> — Investigate Worsening Leak, due 08:00. Guest in-house, cleared for entry.</NRow>
          <NRow ic="at" icCls="ment" time="14m ago · West Zone" dot><b>Franny mentioned you</b> — “can you cover the SD-10 follow-up after lunch?”</NRow>
          <NRow ic="msg" icCls="ok" time="32m ago" dot><b>Franny (GM)</b> replied to your execution note on Water Issue.</NRow>
        </div>
        <MLabel count="3">Earlier today</MLabel>
        <div>
          <NRow ic="cal" icCls="cal" time="06:30"><b>Friday lightened your Tuesday</b> — 2 non-urgent jobs moved to Thursday.</NRow>
          <NRow ic="user" icCls="ok" time="Today 15:00">Guest <b>checked out</b> of RC-7 — turnover clean now unblocked.</NRow>
          <NRow ic="pkg" icCls="cal" time="Yesterday">Low stock flagged — <b>pipe sealant</b> below par at West store.</NRow>
        </div>
        <div className="muted-card mt16">
          <span style={{fontSize:16,color:'var(--tx-3)'}}><Icon n="bellOff" s={1.8}/></span>
          <span style={{flex:1}}><b style={{color:'var(--tx-2)'}}>1,204 muted</b> this week — status pings, auto-syncs &amp; resolved items.</span>
          <span className="faint" style={{fontSize:13}}><Icon n="chevR" s={2}/></span>
        </div>
      </div></div>
      <TabBar active="tasks"/>
    </div>
  );
}

function SetRow({ic, label, value, toggle, chev, danger, last, onClick}){
  return (
    <div className={"setrow"+(onClick?" tap":"")} style={last?{borderBottom:'none'}:null} onClick={onClick}>
      {ic && <span className="si" style={danger?{color:'var(--red)'}:null}><Icon n={ic} s={1.9}/></span>}
      <span className="sl" style={danger?{color:'var(--red)'}:null}>{label}</span>
      {value && <span className="sv">{value}</span>}
      {toggle!==undefined && <span className={"toggle"+(toggle?"":" off")}/>}
      {chev && <span className="chev"><Icon n="chevR" s={2}/></span>}
    </div>
  );
}
function ScreenAccount(){
  const nav = useNav();
  return (
    <div className="fad">
      <StatusBar/>
      <AppHeader eyebrow="ACCOUNT" title="You" alert={false} onSearch={false}/>
      <div className="fad-body"><div className="fad-scroll">
        <div className="profcard">
          <span className="pa">IA</span>
          <div style={{flex:1}}>
            <div className="pn">Ishant Ayadassen</div>
            <div className="pr">Maintenance · Housekeeping</div>
            <div className="row gap6 mt8"><Badge tone="indigo">North</Badge><Badge tone="indigo">West</Badge></div>
          </div>
        </div>
        <MLabel rule={false}>Availability</MLabel>
        <div className="setgroup">
          <SetRow ic="check" label="Available for assignments" toggle={true}/>
          <SetRow ic="clock" label="Lunch window" value="12:30–13:30"/>
          <SetRow ic="pin" label="Working zones" value="North · West" chev last/>
        </div>
        <MLabel rule={false}>My work</MLabel>
        <div className="setgroup">
          <SetRow ic="cal" label="My roster" value="this week" chev onClick={()=>nav.go('myroster')}/>
          <SetRow ic="clock" label="Time off" value="12 days" chev onClick={()=>nav.go('timeoff')}/>
          <SetRow ic="star" label="Reviews" value="4.8 ★" chev onClick={()=>nav.go('reviews')}/>
          <SetRow ic="flag" label="My reports" value="3" chev onClick={()=>nav.go('reports')}/>
          <SetRow ic="clock" label="Work history" chev onClick={()=>nav.tab('history')} last/>
        </div>
        <MLabel rule={false}>Preferences</MLabel>
        <div className="setgroup">
          <SetRow ic="bell" label="Notifications" value="Smart · Friday" chev onClick={()=>nav.go('notifprefs')}/>
          <SetRow ic="globe" label="Language" value="English" chev/>
          <SetRow ic="sparkle" label="Friday assist" toggle={true} last/>
        </div>
        <div className="setgroup mt16">
          <SetRow ic="book" label="Help & tutorial" chev onClick={()=>nav.go('tutorial')}/>
          <SetRow ic="out" label="Sign out" danger last/>
        </div>
        <div className="faint" style={{textAlign:'center',fontFamily:'var(--mono)',fontSize:10,marginTop:16,lineHeight:1.6}}>
          Friday Retreats Ltd · FridayOS<br/>FridayOS v2.0 · build 2026.06
        </div>
      </div></div>
      <TabBar active="account"/>
    </div>
  );
}

Object.assign(window, { ChRow, ScreenChat, NRow, ScreenNotifs, SetRow, ScreenAccount });
