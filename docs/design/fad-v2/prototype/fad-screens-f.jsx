/* FAD V2 — field-staff screens F: My Roster · Time off · Reviews */

function Stars({n}){
  return <span className="stars">{[1,2,3,4,5].map(i=><span key={i} className={i<=n?'':'e'}><Icon n="star" s={0}/></span>)}</span>;
}

function ScreenMyRoster(){
  const nav = useNav();
  const r = window.MY_ROSTER;
  const on = r.days.filter(d=>d.state==='on').length;
  return (
    <div className="fad">
      <StatusBar/>
      <div className="detailtop"><div className="between"><BackBtn label="Account"/><span className="badge gray">{r.week}</span></div></div>
      <div className="apphead" style={{paddingTop:12}}><div className="eyebrow">MY WORK</div><h1>My Roster</h1></div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="row gap6" style={{margin:'2px 0 8px'}}>
          <span className="iconbtn tap" style={{width:32,height:32}}><Icon n="chevL" s={2}/></span>
          <span className="chip on" style={{flex:1,justifyContent:'center'}}>{r.week}</span>
          <span className="iconbtn tap" style={{width:32,height:32}}><Icon n="chevR" s={2}/></span>
        </div>
        <div className="statrow">
          <div className="stat indigo"><div className="n">{on}</div><div className="l">Shifts</div></div>
          <div className="stat"><div className="n">45h</div><div className="l">Scheduled</div></div>
          <div className="stat green"><div className="n">{window.TIMEOFF.balance}</div><div className="l">Leave days</div></div>
        </div>
        <MLabel rule={false}>This week</MLabel>
        <div className="stack-sm">
          {r.days.map((d,i)=>(
            <div key={i} className={"roday"+(d.state==='off'?' off':'')+(i===0?' today':'')}>
              <div className="dn">{d.d}<b>{d.n}</b></div>
              <div className="grow">
                <span className={"zpill "+(d.state==='off'?'off':'west')}>{d.shift}</span>
                {d.time && <div className="faint" style={{fontFamily:'var(--mono)',fontSize:10,marginTop:5}}>{d.time}</div>}
              </div>
              {d.state!=='off' && <span className="faint" style={{fontSize:11}}>West zone</span>}
            </div>
          ))}
        </div>
        <div className="aigate mt16" style={{borderStyle:'solid'}}>
          <span className="ic" style={{fontSize:15}}><Icon n="sparkle" s={1.8}/></span>
          <span className="tx">Your roster is set by your GM. Spotted a clash? <b>Request a change</b> and Friday routes it for approval.</span>
        </div>
      </div></div>
      <div className="composer">
        <button className="btn primary full tap" style={{height:46,fontSize:14.5}} onClick={()=>nav.go('timeoff')}><Icon n="cal" s={1.9}/> Request time off</button>
      </div>
    </div>
  );
}

function ScreenTimeOff(){
  const nav = useNav();
  const t = window.TIMEOFF;
  const [reqOpen,setReqOpen] = React.useState(false);
  return (
    <div className="fad">
      <StatusBar/>
      <div className="detailtop"><div className="between"><BackBtn label="Roster"/><span className="badge gray">{t.balance} days left</span></div></div>
      <div className="apphead" style={{paddingTop:12}}><div className="eyebrow">MY WORK</div><h1>Time off</h1></div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="statrow">
          <div className="stat green"><div className="n">{t.balance}</div><div className="l">Days available</div></div>
          <div className="stat amber"><div className="n">{t.pending}</div><div className="l">Pending</div></div>
          <div className="stat"><div className="n">4</div><div className="l">Taken · 2026</div></div>
        </div>

        {reqOpen && (
          <div className="tcard mt12" style={{gap:11,borderColor:'var(--indigo-line)'}}>
            <div className="row gap6" style={{fontWeight:600,fontSize:13.5}}><Icon n="cal" s={1.9} style={{color:'var(--indigo-bright)'}}/> New request</div>
            <div className="field"><span className="flbl">Type</span><div className="selrow"><span className="chip on">Annual</span><span className="chip">Sick</span><span className="chip">Unpaid</span></div></div>
            <div className="field"><span className="flbl">Dates</span><div className="fin ph">Tap to pick dates…</div></div>
            <div className="field"><span className="flbl">Note (optional)</span><div className="fin area ph">Anything your GM should know…</div></div>
            <div className="aigate" style={{borderStyle:'solid'}}><span className="ic"><Icon n="sparkle" s={1.7}/></span><span className="tx">Friday checks it won't clash with peak occupancy and routes it to your GM.</span></div>
          </div>
        )}

        <MLabel count={t.requests.length}>Requests</MLabel>
        <div className="stack-sm">
          {t.requests.map((q,i)=>(
            <div key={i} className="toreq">
              <span className="iconbtn" style={{width:34,height:34,flex:'0 0 34px',background:'var(--card-2)'}}><Icon n="cal" s={1.8}/></span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13}}>{q.dates}</div>
                <div className="faint" style={{fontFamily:'var(--mono)',fontSize:10,marginTop:2}}>{q.type} · {q.days} day{q.days>1?'s':''}</div>
              </div>
              <span className={"badge "+q.tone+" dot"}>{q.status}</span>
            </div>
          ))}
        </div>
      </div></div>
      <div className="composer">
        <button className="btn primary full tap" style={{height:46,fontSize:14.5}} onClick={()=>setReqOpen(o=>!o)}>
          <Icon n={reqOpen?"check":"plus"} s={2}/> {reqOpen?'Submit request':'New request'}
        </button>
      </div>
    </div>
  );
}

function ScreenReviews(){
  const r = window.MY_REVIEWS;
  return (
    <div className="fad">
      <StatusBar/>
      <div className="detailtop"><div className="between"><BackBtn label="Account"/><span className="badge gray">{r.count}</span></div></div>
      <div className="apphead" style={{paddingTop:12}}><div className="eyebrow">MY WORK</div><h1>Reviews</h1><div className="sub">Guests on stays you worked</div></div>
      <div className="fad-body"><div className="fad-scroll">
        <div className="tcard" style={{flexDirection:'row',alignItems:'center',gap:14}}>
          <div style={{textAlign:'center'}}><div style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:38,lineHeight:1,color:'#f3f6fb'}}>{r.avg}</div><Stars n={5}/></div>
          <div style={{flex:1}}>
            <div style={{fontWeight:600,fontSize:13.5}}>{r.count} reviews · stays you serviced</div>
            <div className="faint" style={{fontSize:11.5,marginTop:3,lineHeight:1.5}}>Pulled from Guesty across Airbnb, Booking.com & direct. Cleanliness &amp; responsiveness mentioned most.</div>
          </div>
        </div>
        <MLabel count={r.items.length}>Recent</MLabel>
        <div className="stack-sm">
          {r.items.map((rv,i)=>(
            <div key={i} className="review">
              <div className="between">
                <div className="row gap6"><Stars n={rv.stars}/><span className="srcchip gy" style={{borderColor:'var(--line)'}}>{rv.channel}</span></div>
                <span className="faint" style={{fontFamily:'var(--mono)',fontSize:10}}>{rv.when}</span>
              </div>
              <p style={{margin:0,fontSize:13,lineHeight:1.5}}>“{rv.txt}”</p>
              <div className="row gap6" style={{flexWrap:'wrap'}}>
                <span className="pcode">{rv.prop}</span>
                <span className="badge gray">{rv.role}</span>
                <span className="faint" style={{fontSize:11}}>— {rv.guest}</span>
              </div>
            </div>
          ))}
        </div>
      </div></div>
      <TabBar active="account"/>
    </div>
  );
}

Object.assign(window, { Stars, ScreenMyRoster, ScreenTimeOff, ScreenReviews });
