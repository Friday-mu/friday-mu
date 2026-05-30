/* FAD V2 — Manager mobile-web: Inbox (list · thread · context sheet) */
const { DI } = window.FADD;

function MTabbar({on}){
  const items=[['inbox','inbox','Inbox'],['ops','ops','Ops'],['fab','spark',''],['cal','cal','Calendar'],['mmore','more','More']];
  const go=k=>window.FADGO&&window.FADGO(k);
  return (
    <div className="pwa-tab" style={{flex:'0 0 auto'}}>
      {items.map((it,i)=> it[0]==='fab'
        ? <div key={i} className="pwa-fab" onClick={()=>go('askm')} style={{cursor:'pointer'}}><DI n="spark" s={1.7}/></div>
        : <div key={i} className={"pwa-ti"+(on===it[0]||(it[0]==='mmore'&&on==='more')?' on':'')} onClick={()=>go(it[0])} style={{cursor:'pointer'}}><DI n={it[1]} s={2}/><span>{it[2]}</span></div>)}
    </div>
  );
}

function MobileInbox(){
  const threads=[
    {av:'ML',nm:'Marie L.',prop:'GBH-B4',pv:'What time can we check in? Flight lands 1pm',t:'4m',ch:'Airbnb',draft:true,unread:true,on:true},
    {av:'JO',nm:'James O.',prop:'SD-10',pv:"You: water's sorted, sorry for the trouble!",t:'1h',ch:'Booking'},
    {av:'PS',nm:'Priya & Sam',prop:'RC-7',pv:'Thanks, the table is perfect now 🙏',t:'3h',ch:'Direct'},
    {av:'GM',nm:'# Announcements',prop:'Team',pv:'Franny: water shut-off in Tamarin 2–4pm',t:'7h',team:true},
    {av:'DK',nm:'Dieter K.',prop:'BW-C4',pv:'Is early check-out possible on Sunday?',t:'1d',ch:'Airbnb'},
  ];
  return (
    <div className="mphone">
      <div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Inbox</span><span className="icbtn alert" style={{width:30,height:30}}><DI n="bell" s={2}/></span></div>
      <div className="body">
        <div className="mchips">
          <span className="mchip on">All <span className="c">8</span></span>
          <span className="mchip">Guest <span className="c">5</span></span>
          <span className="mchip">Needs reply <span className="c">3</span></span>
          <span className="mchip">Team <span className="c">2</span></span>
        </div>
        <div className="mlist">
          {threads.map((th,i)=>(
            <div key={i} className={"ibth"+(th.on?' on':'')} onClick={()=>window.FADGO&&window.FADGO('thread')} style={{cursor:'pointer'}}>
              <span className="av1" style={{width:34,height:34,flex:'0 0 34px',fontSize:11}}>{th.av}</span>
              <div className="ibm">
                <div className="nm">{th.nm}{th.unread&&<span className="mdot" style={{background:'var(--indigo)',width:7,height:7}}/>}<span className="t">{th.t}</span></div>
                <div className="pv">{th.pv}</div>
                <div className="mt2"><span className="pcodeD" style={{padding:'1px 5px',fontSize:9}}>{th.prop}</span><span>{th.team?'team':th.ch}</span>{th.draft&&<span className="bdg indigo" style={{height:16}}>AI draft</span>}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <MTabbar on="inbox"/>
    </div>
  );
}

function MobileThread(){
  return (
    <div className="mphone">
      <div className="top">
        <span className="icbtn" style={{width:30,height:30,border:'none',background:'transparent',cursor:'pointer'}} onClick={()=>window.FADGO&&window.FADGO('inbox')}><DI n="chevL" s={2.2}/></span>
        <span className="av1" style={{width:30,height:30}}>ML</span>
        <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:14}}>Marie L.</div><div className="faint" style={{fontSize:10.5,fontFamily:'var(--mono)'}}>GBH-B4 · Airbnb</div></div>
        <span className="icbtn" style={{width:30,height:30}}><DI n="ops" s={1.9}/></span>
      </div>
      <div className="mctx"><span style={{color:'var(--indigo-bright)'}}><DI n="doc" s={1.7}/></span><span style={{flex:1,fontSize:11.5}}>Check-in today 15:00 · 3 nights · turnover due 15:00</span><DI n="chevD" s={2} style={{color:'var(--tx-3)'}}/></div>
      <div className="mthread">
        <div className="ibmsg"><div className="who">Marie L. · 09:02</div><div className="b">Hi! We're so excited for our stay 😊 What time can we check in? Our flight lands around 1pm.</div><div className="mt">09:02</div></div>
        <div className="ibmsg me"><div className="b">Hi Marie! Welcome — let me check the turnover timing for your apartment.</div><div className="mt">09:05 · you</div></div>
        <div className="ibmsg"><div className="who">Marie L. · 09:06</div><div className="b">Amazing, thank you! Is early check-in possible?</div><div className="mt">09:06</div></div>
      </div>
      <div className="ibcomp" style={{flex:'0 0 auto'}}>
        <div className="ibdraft-tag"><span className="bdg indigo"><DI n="spark" s={1.5}/> Friday draft</span><span className="faint" style={{fontSize:10}}>editable</span></div>
        <div className="ibdraft" style={{minHeight:48,fontSize:12}}>Hi Marie! Check-in is from <b>3pm</b> today — your apartment has a same-day turnover. You're welcome to <b>drop bags at reception from 1pm</b>! 🌴</div>
        <div className="ibcomp-actions"><button className="dbtn primary sm"><DI n="msg" s={1.8}/> Send</button><span className="aichip">Polish</span><span className="grow" style={{flex:1}}/><span className="aichip ai"><DI n="spark" s={1.6}/> Ask Friday</span></div>
      </div>
    </div>
  );
}

function MobileAsk(){
  return (
    <div className="mphone" style={{position:'relative'}}>
      <div className="top"><span className="icbtn" style={{width:30,height:30,border:'none',background:'transparent',cursor:'pointer'}} onClick={()=>window.FADGO&&window.FADGO('inbox')}><DI n="chevL" s={2.2}/></span><span className="ttl" style={{flex:1,fontSize:19}}>Ask Friday</span><span className="bdg indigo"><DI n="spark" s={1.5}/> Marie · GBH-B4</span></div>
      <div className="mthread">
        <div className="afm"><span className="ava fr"><DI n="spark" s={1.5}/></span><div className="bub">Marie's check-in is <b>15:00</b> with a same-day turnover. Early entry isn't safe, but bag drop at reception is fine.</div></div>
        <div className="afm me"><span className="ava me">FG</span><div className="bub">Draft a warm reply offering bag drop + 3pm.</div></div>
        <div className="afm"><span className="ava fr"><DI n="spark" s={1.5}/></span><div style={{minWidth:0}}><div className="bub">Done — drafted your reply below. She also mentioned the AC was loud last stay; want a maintenance task?</div>
          <div className="afact" style={{marginTop:8}}><div className="at"><DI n="ops" s={1.6} style={{color:'var(--indigo-bright)'}}/> Create &amp; link task</div><div className="adesc">Maintenance · AC service · GBH-B4 · linked to this thread.</div><div className="arow"><button className="dbtn primary sm"><DI n="check" s={2}/> Create &amp; link</button><button className="dbtn ghost sm">Not now</button></div></div>
          </div></div>
        <div className="afm"><span className="ava fr"><DI n="spark" s={1.5}/></span><div style={{minWidth:0,width:'100%'}}>
          <div className="ibdraft-tag"><span className="bdg indigo"><DI n="spark" s={1.5}/> Reply draft</span><span className="faint" style={{fontSize:10}}>editable · send from here</span></div>
          <div className="ibdraft" style={{minHeight:48,fontSize:12}}>Hi Marie! Check-in is from <b>3pm</b> today — your apartment has a same-day turnover. You're welcome to <b>drop bags at reception from 1pm</b>! 🌴</div>
          <div className="ibcomp-actions"><button className="dbtn primary sm"><DI n="msg" s={1.8}/> Send reply</button><span className="aichip">Polish</span><span className="aichip">Shorter</span></div>
        </div></div>
      </div>
      <div className="afp-comp" style={{flex:'0 0 auto'}}><div className="afp-in"><DI n="spark" s={1.6} style={{color:'var(--tx-3)'}}/> <span>Ask or tell Friday to act…</span><span className="snd"><DI n="chevR" s={2.2}/></span></div></div>
    </div>
  );
}

window.FADMOBILE = { MobileInbox, MobileThread, MobileAsk, MTabbar };

function MiniDonut(){
  const segs=[{v:32,c:'var(--indigo)'},{v:3,c:'var(--red)'},{v:6,c:'var(--amber)'},{v:14,c:'var(--green)'}];
  const total=55, R=46, C=2*Math.PI*R; let acc=0;
  return (
    <div className="donut" style={{width:104,height:104,flex:'0 0 104px'}}>
      <svg viewBox="0 0 110 110" style={{transform:'rotate(-90deg)'}}>
        <circle cx="55" cy="55" r={R} fill="none" stroke="var(--line-2)" strokeWidth="12"/>
        {segs.map((s,i)=>{const len=C*(s.v/total),off=C*(acc/total);acc+=s.v;return <circle key={i} cx="55" cy="55" r={R} fill="none" stroke={s.c} strokeWidth="12" strokeDasharray={len+' '+(C-len)} strokeDashoffset={-off}/>;})}
      </svg>
      <div className="ctr"><span className="big" style={{fontSize:22}}>{total}</span><span className="cl">tasks</span></div>
    </div>
  );
}
function MobileOps(){
  const tasks=[
    ['BW-C4','Investigate leak','urgent','In progress','indigo','BR'],
    ['SD-10','Water Issue','urgent','Open','gray','IA'],
    ['GBH-B4','Turnover clean','high','Scheduled','violet','IA'],
    ['VA-3','Internet top up','high','Blocked','red','IA'],
  ];
  return (
    <div className="mphone">
      <div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Operations</span><span className="icbtn alert" style={{width:30,height:30}}><DI n="bell" s={2}/></span></div>
      <div className="body" style={{overflowY:'auto'}}>
        <div style={{padding:'14px 14px 0'}}>
          <div className="donutwrap" style={{padding:13,gap:14}}>
            <MiniDonut/>
            <div className="dleg" style={{gap:'8px 16px'}}>
              {[['32','Open','var(--indigo)'],['3','Overdue','var(--red)'],['6','Urgent','var(--amber)'],['14','Done','var(--green)']].map((s,i)=>(
                <div key={i} className="li"><span className="sw" style={{background:s[2]}}/><div className="col"><span className="lv" style={{fontSize:16}}>{s[0]}</span><span className="ll" style={{fontSize:10}}>{s[1]}</span></div></div>
              ))}
            </div>
          </div>
          <div className="fbar" style={{marginTop:10}}>
            <span className="fi"><DI n="spark" s={1.6}/></span>
            <span className="ft" style={{fontSize:11.5}}><b>Daily Brief.</b> 32 tasks · 2 guest-blocked · lunch protected.</span>
          </div>
          <div className="row" style={{gap:7,marginTop:10}}><button className="dbtn sm" style={{flex:1}}><DI n="check" s={2}/> Apply plan</button><button className="dbtn ghost sm" style={{flex:1}}>Review <DI n="chevR" s={2}/></button></div>
          <div className="dml" style={{margin:'16px 0 8px'}}>Fix today <span className="rule"/></div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <div className="panel" style={{padding:11}}><div className="between"><div className="row" style={{gap:9}}><span className="pri urgent"><DI n="flag" s={2} style={{width:11,height:11}}/></span><div><div style={{fontWeight:600,fontSize:12.5}}>3 reports to approve</div><div className="faint" style={{fontSize:10.5}}>pool pump · AC · internet</div></div></div><DI n="chevR" s={2} style={{color:'var(--tx-3)'}}/></div></div>
            <div className="panel" style={{padding:11}}><div className="between"><div className="row" style={{gap:9}}><span className="pri high"><DI n="clock" s={2} style={{width:11,height:11}}/></span><div><div style={{fontWeight:600,fontSize:12.5}}>3 tasks overdue</div><div className="faint" style={{fontSize:10.5}}>2 admin · 1 maintenance</div></div></div><DI n="chevR" s={2} style={{color:'var(--tx-3)'}}/></div></div>
          </div>
          <div className="dml" style={{margin:'16px 0 8px'}}>Today's tasks <span className="ct">6 of 32</span><span className="rule"/></div>
        </div>
        <div style={{padding:'0 14px 14px',display:'flex',flexDirection:'column',gap:8}}>
          {tasks.map((t,i)=>(
            <div key={i} className="panel" style={{padding:'10px 12px'}}>
              <div className="row" style={{gap:8}}><span className="pcodeD" style={{fontSize:10}}>{t[0]}</span><PriDm level={t[2]}/><span className="grow" style={{flex:1}}/><span className={"bdg "+t[4]}>{t[3]}</span></div>
              <div className="between" style={{marginTop:7}}><span style={{fontSize:13,fontWeight:600}}>{t[1]}</span><span className="av1" style={{width:22,height:22,fontSize:8}}>{t[5]}</span></div>
            </div>
          ))}
        </div>
      </div>
      <MTabbar on="ops"/>
    </div>
  );
}
function PriDm({level}){return window.FADD.PriD({level});}

Object.assign(window.FADMOBILE, { MiniDonut, MobileOps, PriDm });

function MobileCalendar(){
  const days=[['Mon','25'],['Tue','26'],['Wed','27'],['Thu','28','wk'],['Fri','29'],['Sat','30','wk'],['Sun','31','wk']];
  const N=7, pct=(c)=>c/N*100;
  const rows=[
    {code:'GBH-B4',nm:'Pool & Gym',occ:'red',bars:[{s:0,sp:3,ch:'air',l:'Marie L. · 3n'},{s:4,sp:3,ch:'book',l:'D. Kraus'}],tasks:[{c:3,urg:false}]},
    {code:'SD-10',nm:'Sunset Dr',occ:'green',bars:[{s:1,sp:2,ch:'dir',l:'J. Owusu'}],tasks:[{c:1,urg:true}]},
    {code:'RC-7',nm:'Royal Court',occ:'amber',bars:[{s:0,sp:2,ch:'air',l:'Priya & Sam'},{s:5,sp:2,ch:'air',l:'New'}],tasks:[{c:0,urg:false}]},
    {code:'BW-C4',nm:'Beachfront',occ:'red',bars:[{s:0,sp:7,ch:'book',l:'Long stay · in-house'}],tasks:[{c:2,urg:true}]},
    {code:'VA-3',nm:'Géranium',occ:'green',bars:[{s:2,sp:3,ch:'dir',l:'Family'}],tasks:[]},
    {code:'KS-5',nm:'Rooftop',occ:'green',bars:[{s:3,sp:4,ch:'air',l:'Honeymoon'}],tasks:[{c:4,urg:false}]},
  ];
  const occc={red:'var(--red)',green:'var(--green)',amber:'var(--amber)'};
  return (
    <div className="mphone">
      <div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Calendar</span><span className="icbtn" style={{width:30,height:30}}><DI n="filter" s={2}/></span></div>
      <div className="mchips">
        <span className="mchip on">All</span><span className="mchip">Reservations</span><span className="mchip">Tasks</span><span className="mchip">Mine</span>
      </div>
      <div className="row between" style={{padding:'10px 14px 6px'}}>
        <span className="row" style={{gap:8}}><span className="icbtn" style={{width:26,height:26,border:'none',background:'transparent'}}><DI n="chevL" s={2}/></span><span style={{fontWeight:600,fontSize:13}}>25 – 31 May</span><span className="icbtn" style={{width:26,height:26,border:'none',background:'transparent'}}><DI n="chevR" s={2}/></span></span>
        <span className="faint mono" style={{fontSize:9.5}}>27 properties</span>
      </div>
      <div className="body" style={{overflow:'auto'}}>
        <div style={{minWidth:488}}>
          <div className="mcalbar-h">
            <div className="mcal-nm" style={{flex:'0 0 96px'}}/>
            <div className="mcal-days" style={{gridTemplateColumns:'repeat(7,1fr)'}}>
              {days.map((d,i)=><div key={i} className={"mcal-dh"+(d[2]?' wknd':'')}>{d[0]}<b>{d[1]}</b></div>)}
            </div>
          </div>
          {rows.map((r,i)=>(
            <div key={i} className="mcalrow">
              <div className="mcal-nm" style={{flex:'0 0 96px'}}><span className="mdot" style={{background:occc[r.occ],width:7,height:7}}/><div style={{minWidth:0}}><div style={{fontFamily:'var(--mono)',fontSize:9.5,fontWeight:600}}>{r.code}</div><div className="faint" style={{fontSize:9,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.nm}</div></div></div>
              <div className="mcaltrack">
                {[1,2,3,4,5,6].map(g=><span key={g} className="gl" style={{left:pct(g)+'%'}}/>)}
                {r.bars.map((b,j)=><div key={j} className={"mcalbar "+b.ch} style={{left:'calc('+pct(b.s)+'% + 2px)',width:'calc('+pct(b.sp)+'% - 4px)'}}>{b.l}</div>)}
                {r.tasks.map((t,j)=><span key={j} className={"mcaltask"+(t.urg?' urg':'')} style={{left:'calc('+pct(t.c)+'% + 3px)',width:'calc('+pct(1)+'% - 6px)'}}/>)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="row" style={{gap:13,padding:'9px 14px',borderTop:'1px solid var(--line-2)',fontSize:9.5,color:'var(--tx-2)',flexWrap:'wrap'}}>
        <span className="row" style={{gap:5}}><span className="mdot" style={{background:'#e08e89',width:8,height:8,borderRadius:3}}/>Airbnb</span>
        <span className="row" style={{gap:5}}><span className="mdot" style={{background:'#9fb4ee',width:8,height:8,borderRadius:3}}/>Booking</span>
        <span className="row" style={{gap:5}}><span className="mdot" style={{background:'#6cc79c',width:8,height:8,borderRadius:3}}/>Direct</span>
        <span className="row" style={{gap:5}}><span className="mdot" style={{background:'var(--indigo)',width:14,height:5,borderRadius:3}}/>Task</span>
      </div>
      <MTabbar on="cal"/>
    </div>
  );
}
Object.assign(window.FADMOBILE, { MobileCalendar });

function MobileSchedule(){
  const days=[['Mon','1','on'],['Tue','2'],['Wed','3'],['Thu','4'],['Fri','5'],['Sat','6','off'],['Sun','7','off']];
  const pc={urgent:'var(--red)',high:'var(--amber)',med:'var(--green)',low:'var(--tx-3)'};
  const staff=[
    {av:'BR',nm:'Bryan',jobs:[['08:00','BW-C4 · leak','urgent'],['10:00','GBH-C5 · shower','med'],['13:30','RCN-4 · valve','low']]},
    {av:'IA',nm:'Ishant',jobs:[['09:00','SD-10 · water','urgent'],['11:00','RC-7 · table','med'],['13:30','GBH-B4 · turnover','high']]},
    {av:'CA',nm:'Catherine',jobs:[['08:00','BS-1 · clean','med'],['10:00','GBH-C8 · inspection','med']]},
    {av:'MD',nm:'Matthieu',jobs:[],sb:true},
  ];
  return (
    <div className="mphone">
      <div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Schedule</span><span className="bdg amber">Draft</span></div>
      <div className="body" style={{overflowY:'auto',padding:14}}>
        <div className="fbar"><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft" style={{fontSize:11.5}}><b>Friday drafted the day.</b> 18 jobs · lunch protected · 0 conflicts.</span></div>
        <div className="row" style={{gap:7,marginTop:10}}><button className="dbtn sm" style={{flex:1}}><DI n="check" s={2}/> Apply</button><button className="dbtn ghost sm" style={{flex:1}}>Review <DI n="chevR" s={2}/></button></div>
        <div className="row" style={{gap:6,margin:'14px 0 4px',overflowX:'auto'}}>
          {days.map((d,i)=><div key={i} style={{flex:'0 0 auto',textAlign:'center',padding:'7px 11px',borderRadius:9,border:'1px solid '+(d[2]==='on'?'var(--indigo-line)':'var(--line-2)'),background:d[2]==='on'?'var(--indigo-ghost)':'var(--card)',opacity:d[2]==='off'?.5:1}}><div style={{fontFamily:'var(--mono)',fontSize:8.5,color:'var(--tx-3)'}}>{d[0]}</div><div style={{fontSize:14,fontWeight:700,color:d[2]==='on'?'var(--indigo-bright)':'var(--tx)'}}>{d[1]}</div></div>)}
        </div>
        <div className="dml" style={{margin:'14px 0 8px'}}>Mon 1 Jun · by staff <span className="rule"/></div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {staff.map((s,i)=>(
            <div key={i} className="panel" style={{padding:11}}>
              <div className="row between" style={{marginBottom:s.jobs.length?9:0}}><span className="row" style={{gap:8}}><span className="av1" style={{width:24,height:24,fontSize:8.5}}>{s.av}</span><span style={{fontWeight:600,fontSize:13}}>{s.nm}</span></span>{s.sb?<span className="bdg gray">Stand-by</span>:<span className="faint mono" style={{fontSize:10}}>{s.jobs.length} jobs</span>}</div>
              {s.jobs.map((j,k)=>(
                <div key={k} className="row" style={{gap:9,padding:'5px 0',borderTop:k?'1px solid var(--line-2)':'none'}}>
                  <span className="mono faint" style={{fontSize:10.5,width:42,flex:'0 0 42px'}}>{j[0]}</span>
                  <span className="mdot" style={{background:pc[j[2]],width:7,height:7}}/>
                  <span style={{fontSize:12.5,flex:1}}>{j[1]}</span>
                </div>
              ))}
              {!s.jobs.length && <div className="faint" style={{fontSize:11.5}}>Available · West zone</div>}
            </div>
          ))}
        </div>
      </div>
      <MTabbar on="ops"/>
    </div>
  );
}

function MobileRoster(){
  const days=['M','T','W','T','F','S','S'];
  const lbl={north:'N',west:'W',on:'On',off:'Off',sb:'SB'};
  const staff=[
    {av:'BH',nm:'Bryan Henri',wk:['north','north','north','north','north','off','off']},
    {av:'CH',nm:'Catherine H.',wk:['north','north','north','north','north','off','off']},
    {av:'IA',nm:'Ishant A.',wk:['west','west','west','west','west','off','off']},
    {av:'MO',nm:'Mary O.',wk:['on','on','on','on','on','off','off']},
    {av:'MD',nm:'Mathias D.',wk:['north','north','sb','north','north','off','off']},
  ];
  return (
    <div className="mphone">
      <div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Roster</span><span className="bdg amber">Draft</span></div>
      <div className="body" style={{overflowY:'auto',padding:14}}>
        <div className="fbar"><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft" style={{fontSize:11.5}}><b>Coverage balanced.</b> 87 unassigned · Tue busiest — ask to rebalance.</span></div>
        <div className="row" style={{gap:7,marginTop:10}}><div className="statc" style={{flex:1,padding:'8px 10px'}}><div className="n" style={{fontSize:17}}>87</div><div className="l">Unassigned</div></div><div className="statc" style={{flex:1,padding:'8px 10px'}}><div className="n" style={{fontSize:17}}>17</div><div className="l">High pri</div></div><div className="statc" style={{flex:1,padding:'8px 10px'}}><div className="n" style={{fontSize:17}}>Tue</div><div className="l">Busiest</div></div></div>
        <div className="dml" style={{margin:'16px 0 8px'}}>25 – 31 May <span className="rule"/></div>
        <div style={{overflowX:'auto'}}>
          <div style={{minWidth:330}}>
            <div style={{display:'grid',gridTemplateColumns:'96px repeat(7,1fr)',gap:0,marginBottom:5}}>
              <span/>{days.map((d,i)=><span key={i} style={{textAlign:'center',fontFamily:'var(--mono)',fontSize:9,color:'var(--tx-3)'}}>{d}</span>)}
            </div>
            {staff.map((s,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'96px repeat(7,1fr)',gap:3,marginBottom:3,alignItems:'center'}}>
                <span className="row" style={{gap:6}}><span className="av1" style={{width:22,height:22,fontSize:8}}>{s.av}</span><span style={{fontSize:10.5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.nm}</span></span>
                {s.wk.map((c,j)=><span key={j} className={"rcell "+c} style={{height:26,fontSize:9,borderRadius:5}}>{lbl[c]}</span>)}
              </div>
            ))}
          </div>
        </div>
        <div className="faint" style={{fontSize:10,marginTop:10}}>Tap a cell to change zone or status. Green = zone · maroon = off.</div>
      </div>
      <MTabbar on="ops"/>
    </div>
  );
}
Object.assign(window.FADMOBILE, { MobileSchedule, MobileRoster });

function MobileReservations(){
  const groups=[
    {h:'Arriving today', items:[
      {av:'ML',g:'Marie L.',p:'GBH-B4',dt:'1–4 Jun · 3n',ch:'Airbnb',st:'Check-in 15:00',tone:'amber',pay:'Rs 42,000'},
      {av:'TW',g:'Tom W.',p:'KS-5',dt:'1–6 Jun · 5n',ch:'Booking',st:'Check-in 16:00',tone:'amber',pay:'Rs 71,500'},
    ]},
    {h:'In-house', items:[
      {av:'DK',g:'Dieter K.',p:'BW-C4',dt:'28 May–2 Jun',ch:'Booking',st:'Checkout tmrw',tone:'indigo',pay:'Rs 58,000'},
      {av:'FR',g:'The Roys',p:'VA-3',dt:'30 May–3 Jun',ch:'Direct',st:'In-house',tone:'green',pay:'Rs 36,000'},
    ]},
    {h:'Checking out today', items:[
      {av:'JO',g:'James O.',p:'SD-10',dt:'29 May–1 Jun',ch:'Booking',st:'Checkout 11:00',tone:'red',pay:'Rs 33,000'},
    ]},
  ];
  return (
    <div className="mphone">
      <div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Reservations</span><span className="icbtn" style={{width:30,height:30}}><DI n="search" s={2}/></span></div>
      <div className="mchips"><span className="mchip on">Today</span><span className="mchip">In-house</span><span className="mchip">Upcoming</span><span className="mchip">All</span></div>
      <div className="body" style={{overflowY:'auto'}}>
        <div style={{padding:'12px 14px 0'}}>
          <div className="row" style={{gap:6}}><div className="statc" style={{flex:1,padding:'9px 8px'}}><div className="n" style={{fontSize:17}}>2</div><div className="l">Arrivals</div></div><div className="statc" style={{flex:1,padding:'9px 8px'}}><div className="n" style={{fontSize:17}}>1</div><div className="l">Depart</div></div><div className="statc amber" style={{flex:1,padding:'9px 8px'}}><div className="n" style={{fontSize:17}}>3</div><div className="l">Turnovers</div></div><div className="statc" style={{flex:1,padding:'9px 8px'}}><div className="n" style={{fontSize:17}}>83%</div><div className="l">Occupied</div></div></div>
        </div>
        {groups.map((g,i)=>(
          <div key={i}>
            <div className="dml" style={{margin:'16px 14px 8px'}}>{g.h} <span className="ct">{g.items.length}</span><span className="rule"/></div>
            <div style={{padding:'0 14px',display:'flex',flexDirection:'column',gap:8}}>
              {g.items.map((r,j)=>(
                <div key={j} className="panel" style={{padding:11}}>
                  <div className="row" style={{gap:10}}>
                    <span className="av1" style={{width:32,height:32,fontSize:10}}>{r.av}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div className="row between"><span style={{fontWeight:600,fontSize:13}}>{r.g}</span><span className={"bdg "+r.tone+" dot"}>{r.st}</span></div>
                      <div className="faint" style={{fontFamily:'var(--mono)',fontSize:10,marginTop:3,display:'flex',gap:7,alignItems:'center',flexWrap:'wrap'}}><span className="pcodeD" style={{fontSize:9,padding:'1px 5px'}}>{r.p}</span><span>{r.dt}</span><span>·</span><span>{r.ch}</span></div>
                    </div>
                  </div>
                  <div className="row between" style={{marginTop:9,paddingTop:9,borderTop:'1px solid var(--line-2)'}}><span className="faint" style={{fontSize:11}}>Payout</span><span className="mono" style={{fontSize:12,fontWeight:600}}>{r.pay}</span></div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{height:14}}/>
      </div>
      <MTabbar on="more"/>
    </div>
  );
}
Object.assign(window.FADMOBILE, { MobileReservations });

function MobileApprovals(){
  const reps=[
    {t:'Pool pump making loud noise',c:'GBH-C5',by:'Bryan',urg:true,d:'Maintenance · Urgent · Matthieu'},
    {t:'AC not cooling — master bedroom',c:'SD-10',by:'Ishant',d:'Maintenance · High · Ishant'},
    {t:'Internet keeps dropping',c:'VA-4',by:'Ishant',d:'Admin · Low · office'},
  ];
  return (
    <div className="mphone">
      <div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Approvals</span><span className="bdg amber">3</span></div>
      <div className="body" style={{overflowY:'auto',padding:14}}>
        <div className="fbar"><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft" style={{fontSize:11.5}}><b>Friday triage.</b> 2 routine, 1 likely pump fault — pre-drafted.</span></div>
        <div className="dml" style={{margin:'14px 0 8px'}}>Waiting on you <span className="ct">3</span><span className="rule"/></div>
        <div style={{display:'flex',flexDirection:'column',gap:9}}>
          {reps.map((r,i)=>(
            <div key={i} className="panel" style={{padding:12,borderLeft:r.urg?'3px solid var(--red)':'1px solid var(--line-2)'}}>
              <div className="row" style={{gap:8}}><span style={{fontWeight:600,fontSize:13,flex:1}}>{r.t}</span>{r.urg&&<span className="bdg red dot">urgent</span>}</div>
              <div className="faint mono" style={{fontSize:10,margin:'5px 0 8px'}}><span className="pcodeD" style={{fontSize:9,padding:'1px 5px'}}>{r.c}</span> · by {r.by}</div>
              <div className="gate" style={{borderStyle:'solid',fontSize:11.5}}><span style={{color:'var(--indigo-bright)'}}><DI n="spark" s={1.6}/></span><span><b>Friday:</b> {r.d}</span></div>
              <div className="row" style={{gap:7,marginTop:9}}><button className="dbtn green sm" style={{flex:1}}><DI n="check" s={2}/> Approve</button><button className="dbtn ghost sm">Edit</button><button className="dbtn ghost sm" style={{color:'var(--tx-3)'}}>Decline</button></div>
            </div>
          ))}
        </div>
      </div>
      <MTabbar on="ops"/>
    </div>
  );
}

function MobileAllTasks(){
  const rows=[['BW-C4','Investigate leak','urgent','In progress','indigo','BR'],['SD-10','Water Issue','urgent','Open','gray','IA'],['GBH-B4','Turnover clean','high','Scheduled','violet','IA'],['RC-7','Lower table','med','Open','gray','CA'],['VA-3','Internet top up','high','Blocked','red','IA'],['GBH-C5','Shower head','med','Done','green','BR']];
  const pc={urgent:'var(--red)',high:'var(--amber)',med:'var(--green)',low:'var(--tx-3)'};
  return (
    <div className="mphone">
      <div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>All tasks</span><span className="icbtn" style={{width:30,height:30}}><DI n="filter" s={2}/></span></div>
      <div className="mchips"><span className="mchip on">All</span><span className="mchip">Open</span><span className="mchip">Overdue</span><span className="mchip">Done</span></div>
      <div className="body" style={{overflowY:'auto',padding:14}}>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {rows.map((r,i)=>(
            <div key={i} className="panel" style={{padding:'10px 12px'}}>
              <div className="row" style={{gap:8}}><span className="pcodeD" style={{fontSize:10}}>{r[0]}</span><span className="mdot" style={{background:pc[r[2]],width:7,height:7}}/><span className="grow" style={{flex:1}}/><span className={"bdg "+r[4]}>{r[3]}</span></div>
              <div className="between" style={{marginTop:7}}><span style={{fontSize:13,fontWeight:600}}>{r[1]}</span><span className="av1" style={{width:22,height:22,fontSize:8}}>{r[5]}</span></div>
            </div>
          ))}
        </div>
      </div>
      <MTabbar on="ops"/>
    </div>
  );
}

function MobileSupplies(){
  const low=[['Bath towels','4 / 12','West','low'],['Pipe sealant','1 / 6','West','low'],['Toilet rolls','0 / 24','West','out'],['LED bulbs','6 / 8','Van · BR','low'],['Wine glasses','22 / 24','North','low']];
  const sm={low:'amber',out:'red'};
  return (
    <div className="mphone">
      <div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Supplies</span><span className="icbtn" style={{width:30,height:30}}><DI n="search" s={2}/></span></div>
      <div className="body" style={{overflowY:'auto',padding:14}}>
        <div className="row" style={{gap:7}}><div className="statc" style={{flex:1,padding:'9px 10px'}}><div className="n" style={{fontSize:17}}>214</div><div className="l">SKUs</div></div><div className="statc amber" style={{flex:1,padding:'9px 10px'}}><div className="n" style={{fontSize:17}}>5</div><div className="l">Below par</div></div><div className="statc red" style={{flex:1,padding:'9px 10px'}}><div className="n" style={{fontSize:17}}>1</div><div className="l">Out</div></div></div>
        <div className="fbar" style={{marginTop:11}}><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft" style={{fontSize:11.5}}><b>5 below par.</b> Restock order drafted · Rs 2,708.</span></div>
        <button className="dbtn primary sm" style={{width:'100%',marginTop:10}}><DI n="check" s={2}/> Place restock order</button>
        <div className="dml" style={{margin:'16px 0 8px'}}>Below par <span className="ct">5</span><span className="rule"/></div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {low.map((l,i)=>(<div key={i} className="panel" style={{padding:'10px 12px'}}><div className="between"><div><div style={{fontSize:13,fontWeight:600}}>{l[0]}</div><div className="faint mono" style={{fontSize:10,marginTop:2}}>{l[2]} · {l[1]}</div></div><span className={"bdg "+sm[l[3]]+" dot"}>{l[3]==='out'?'Out':'Low'}</span></div></div>))}
        </div>
      </div>
      <MTabbar on="ops"/>
    </div>
  );
}

function MobileProperties(){
  const props=[['GBH-B4','Apt with Pool & Gym','Grand Baie','red','Occupied','2 open'],['SD-10','Sunset Drive Villa','Tamarin','green','Vacant','1 urgent'],['RC-7','Royal Court','Pereybère','amber','Check-in 15:00','0 open'],['KS-5','Rooftop Pool Apt','Grand Baie','green','Arriving today','1 open']];
  const oc={red:'var(--red)',amber:'var(--amber)',green:'var(--green)'};
  return (
    <div className="mphone">
      <div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Properties</span><span className="icbtn" style={{width:30,height:30}}><DI n="search" s={2}/></span></div>
      <div className="mchips"><span className="mchip on">All</span><span className="mchip">Grand Baie</span><span className="mchip">Tamarin</span><span className="mchip">Flic en Flac</span></div>
      <div className="body" style={{overflowY:'auto',padding:14}}>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {props.map((p,i)=>(
            <div key={i} className="panel" style={{padding:0,overflow:'hidden'}}>
              <div style={{height:64,background:'linear-gradient(150deg,#222b3c,#141b27)',position:'relative'}}><span className="pcodeD" style={{position:'absolute',top:9,left:10}}>{p[0]}</span><span style={{position:'absolute',top:9,right:10,fontSize:10,color:oc[p[3]],display:'flex',alignItems:'center',gap:5,background:'rgba(10,13,18,.6)',padding:'2px 7px',borderRadius:6}}><span className="mdot" style={{background:oc[p[3]],width:6,height:6}}/>{p[4]}</span></div>
              <div style={{padding:'10px 13px'}}><div className="between"><div><div style={{fontWeight:600,fontSize:13}}>{p[1]}</div><div className="faint" style={{fontSize:11,marginTop:1}}>{p[2]}</div></div>{p[5]!=='0 open'&&<span className={"bdg "+(p[5].indexOf('urgent')>=0?'red':'amber')}>{p[5]}</span>}</div></div>
            </div>
          ))}
        </div>
      </div>
      <MTabbar on="more"/>
    </div>
  );
}

function MobileMap(){
  const pins=[{x:34,y:32,av:'BR',st:'on'},{x:54,y:26,av:'CA',st:'enr'},{x:64,y:64,av:'IA',st:'urgent'},{x:44,y:52,av:'MD',st:'idle'}];
  const stcol={on:'var(--green)',enr:'var(--amber)',urgent:'var(--red)',idle:'var(--tx-3)'};
  const list=[['BR','Bryan','GBH-C5 · shower','green'],['CA','Catherine','En route · GBH-C8','amber'],['IA','Ishant','SD-10 · urgent','red'],['MD','Matthieu','Stand-by','gray']];
  return (
    <div className="mphone">
      <div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Live map</span><span className="icbtn" style={{width:30,height:30}}><DI n="filter" s={2}/></span></div>
      <div className="body" style={{overflowY:'auto'}}>
        <div className="mapcanvas" style={{margin:14,height:230,borderRadius:14}}>
          <div className="grid"/>
          <span className="zonelbl" style={{left:'12%',top:'12%'}}>North</span><span className="zonelbl" style={{left:'62%',top:'76%'}}>West</span>
          {pins.map((p,i)=><div key={i} className="mpin" style={{left:p.x+'%',top:p.y+'%'}}><span className={"av "+p.st}><span className="ring" style={{borderColor:stcol[p.st]}}/>{p.av}</span></div>)}
        </div>
        <div style={{padding:'0 14px 14px'}}>
          <div className="dml" style={{margin:'2px 0 8px'}}>On shift <span className="ct">4</span><span className="rule"/></div>
          {list.map((s,i)=>(<div key={i} className="row" style={{gap:10,padding:'9px 0',borderBottom:i<list.length-1?'1px solid var(--line-2)':'none'}}><span className="mdot" style={{background:'var(--'+(s[3]==='gray'?'tx-3':s[3])+')',width:8,height:8}}/><span className="av1" style={{width:26,height:26,fontSize:9}}>{s[0]}</span><div style={{flex:1,minWidth:0}}><div style={{fontSize:12.5,fontWeight:600}}>{s[1]}</div><div className="faint" style={{fontSize:10.5}}>{s[2]}</div></div></div>))}
        </div>
      </div>
      <MTabbar on="ops"/>
    </div>
  );
}
Object.assign(window.FADMOBILE, { MobileApprovals, MobileAllTasks, MobileSupplies, MobileProperties, MobileMap });

function MobileFinance(){
  const appr=[['Climate Tech Ltd','VV-47 · aircon','Rs 12,500'],['Aqua Plumbing','PT-3 · water heater','Rs 8,700'],['Pereybere Hardware','LC-9 · roof','Rs 225,000']];
  return (
    <div className="mphone"><div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Finance</span><span className="bdg amber">closing</span></div>
      <div className="body" style={{overflowY:'auto',padding:14}}>
        <div className="fbar"><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft" style={{fontSize:11.5}}><b>2 urgent.</b> Tourist-tax window opens in 8 days · 3 approvals expire &lt;24h.</span></div>
        <div className="row" style={{gap:6,marginTop:11}}><div className="statc" style={{flex:1,padding:'9px 8px'}}><div className="n" style={{fontSize:15}}>€166k</div><div className="l">Payouts</div></div><div className="statc amber" style={{flex:1,padding:'9px 8px'}}><div className="n" style={{fontSize:15}}>5</div><div className="l">Approvals</div></div><div className="statc red" style={{flex:1,padding:'9px 8px'}}><div className="n" style={{fontSize:15}}>€11.8k</div><div className="l">Tax owed</div></div></div>
        <div className="panel" style={{marginTop:12,padding:12}}><div className="between"><span style={{fontSize:13,fontWeight:600}}>Period close · April</span><span className="faint mono" style={{fontSize:10}}>5 / 8</span></div><div style={{height:5,borderRadius:3,background:'var(--card-2)',marginTop:9,overflow:'hidden'}}><div style={{height:'100%',width:'62%',background:'var(--green)'}}/></div><button className="dbtn sm" style={{width:'100%',marginTop:10}}>Resume close</button></div>
        <div className="dml" style={{margin:'16px 0 8px'}}>Pending approvals <span className="ct">3</span><span className="rule"/></div>
        {appr.map((a,i)=>(<div key={i} className="panel" style={{padding:'10px 12px',marginBottom:8}}><div className="between"><div><div style={{fontSize:12.5,fontWeight:600}}>{a[0]}</div><div className="faint mono" style={{fontSize:10,marginTop:2}}>{a[1]}</div></div><span className="mono" style={{fontSize:12,fontWeight:600}}>{a[2]}</span></div><div className="row" style={{gap:7,marginTop:9}}><button className="dbtn green sm" style={{flex:1}}><DI n="check" s={2}/> Approve</button><button className="dbtn ghost sm">Hold</button></div></div>))}
      </div><MTabbar on="more"/></div>
  );
}

function MobileOwners(){
  const rows=[['Nitzana Holdings SA','1','€142,500','current'],['Beaumont Family Trust','2','€88,200','current'],['Harrington, D.','1','€51,600','renewal'],['Chen, Y.','1','€34,100','current'],['Mauritius Coastal Ltd','2','€77,900','current']];
  return (
    <div className="mphone"><div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Owners</span><span className="icbtn" style={{width:30,height:30}}><DI n="search" s={2}/></span></div>
      <div className="mchips"><span className="mchip on">All</span><span className="mchip">Statements</span><span className="mchip">Payouts</span></div>
      <div className="body" style={{overflowY:'auto',padding:14}}>
        <div className="row" style={{gap:7}}><div className="statc" style={{flex:1,padding:'9px 10px'}}><div className="n" style={{fontSize:16}}>38</div><div className="l">Owners</div></div><div className="statc" style={{flex:1,padding:'9px 10px'}}><div className="n" style={{fontSize:16}}>€166k</div><div className="l">YTD payouts</div></div><div className="statc amber" style={{flex:1,padding:'9px 10px'}}><div className="n" style={{fontSize:16}}>38</div><div className="l">Due May 3</div></div></div>
        <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:14}}>{rows.map((r,i)=>(<div key={i} className="panel" style={{padding:'11px 12px'}}><div className="between"><div className="row" style={{gap:9}}><span className="av1" style={{width:28,height:28,fontSize:9}}>{r[0].split(/[ ,]/).filter(Boolean).map(w=>w[0]).slice(0,2).join('')}</span><div><div style={{fontSize:13,fontWeight:600}}>{r[0]}</div><div className="faint mono" style={{fontSize:10,marginTop:2}}>{r[1]} prop · YTD {r[2]}</div></div></div><span className={"bdg "+(r[3]==='renewal'?'amber':'gray')}>{r[3]}</span></div></div>))}</div>
      </div><MTabbar on="more"/></div>
  );
}

function MobileReviews(){
  const dist=[[5,7],[4,1],[3,0],[2,1],[1,0]];
  const latest=[['Guest 48fb87','RC-15','4.0'],['Guest d6143a','LB-C','2.0'],['Guest 8bad11','RC-14','5.0'],['Guest 6760ff','LF-7','5.0']];
  return (
    <div className="mphone"><div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Reviews</span></div>
      <div className="body" style={{overflowY:'auto',padding:14}}>
        <div className="panel" style={{padding:14,textAlign:'center'}}><div style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:38}}>4.56</div><div className="stars" style={{justifyContent:'center',margin:'4px 0'}}>{[1,2,3,4,5].map(s=><DI key={s} n="star" s={1.5} style={{color:s<=4?'var(--amber)':'var(--line-3)'}}/>)}</div><div className="faint" style={{fontSize:11}}>9 reviews · 30d · <span style={{color:'var(--red)'}}>−0.33</span></div></div>
        <div className="row" style={{gap:7,marginTop:11}}><div className="statc" style={{flex:1,padding:'9px 8px'}}><div className="n" style={{fontSize:15}}>4.76</div><div className="l">Airbnb</div></div><div className="statc" style={{flex:1,padding:'9px 8px'}}><div className="n" style={{fontSize:15}}>4.17</div><div className="l">Booking</div></div><div className="statc red" style={{flex:1,padding:'9px 8px'}}><div className="n" style={{fontSize:15}}>100</div><div className="l">Unreplied</div></div></div>
        <div className="fbar" style={{marginTop:11}}><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft" style={{fontSize:11.5}}><b>100 unreplied.</b> Friday drafted replies — bulk-approve.</span></div>
        <div className="dml" style={{margin:'16px 0 8px'}}>Latest<span className="rule"/></div>
        {latest.map((r,i)=>(<div key={i} className="panel" style={{padding:'10px 12px',marginBottom:7}}><div className="between"><span style={{fontSize:12.5}}>{r[0]} · <span className="pcodeD" style={{fontSize:9}}>{r[1]}</span></span><span className="mono" style={{fontSize:12,color:+r[2]<3?'var(--red)':'var(--amber)'}}>★ {r[2]}</span></div></div>))}
      </div><MTabbar on="more"/></div>
  );
}

function MobileAnalytics(){
  const trend=[28,62,70,88,60,54,66,72,68,58,62,76];
  const chan=[['Airbnb',57,'#e08e89'],['Manual',35,'#9fb4ee'],['Booking',6,'#6cc79c'],['Scraped',3,'var(--tx-3)']];
  return (
    <div className="mphone"><div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Analytics</span><span className="aichip">30d</span></div>
      <div className="body" style={{overflowY:'auto',padding:14}}>
        <div className="row" style={{gap:6}}><div className="statc" style={{flex:1,padding:'9px 8px'}}><div className="n" style={{fontSize:15}}>€40k</div><div className="l">Revenue</div></div><div className="statc" style={{flex:1,padding:'9px 8px'}}><div className="n" style={{fontSize:15}}>72</div><div className="l">Bookings</div></div><div className="statc" style={{flex:1,padding:'9px 8px'}}><div className="n" style={{fontSize:15}}>88%</div><div className="l">Occ</div></div><div className="statc" style={{flex:1,padding:'9px 8px'}}><div className="n" style={{fontSize:15}}>€71</div><div className="l">ADR</div></div></div>
        <div className="panel" style={{marginTop:12,padding:13}}><div className="dml" style={{margin:'0 0 10px'}}>Revenue trend<span className="rule"/></div><div className="row" style={{gap:4,alignItems:'flex-end',height:90}}>{trend.map((t,i)=><div key={i} style={{flex:1,height:t+'%',background:'linear-gradient(180deg,var(--indigo-bright),var(--indigo))',borderRadius:'2px 2px 0 0',opacity:.55+t/250}}/>)}</div></div>
        <div className="panel" style={{marginTop:12,padding:13}}><div className="dml" style={{margin:'0 0 8px'}}>Channel mix<span className="rule"/></div>{chan.map((c,i)=>(<div key={i} className="between" style={{padding:'7px 0',borderBottom:i<chan.length-1?'1px solid var(--line-2)':'none'}}><span className="row" style={{gap:8,fontSize:12.5}}><span className="mdot" style={{background:c[2],width:8,height:8,borderRadius:3}}/>{c[0]}</span><span className="mono" style={{fontSize:12,fontWeight:600}}>{c[1]}%</span></div>))}</div>
      </div><MTabbar on="more"/></div>
  );
}

function MobileHR(){
  const staff=[['BH','Bryan Henri','Field · north','0'],['CH','Catherine Henri','Field · north','1'],['FH','Franny Henri','Ops Manager','—'],['MD','Mathias Duval','Commercial','—']];
  return (
    <div className="mphone"><div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>HR</span><span className="icbtn" style={{width:30,height:30}}><DI n="plus" s={2}/></span></div>
      <div className="mchips"><span className="mchip on">Staff</span><span className="mchip">Time-off</span><span className="mchip">Stats</span></div>
      <div className="body" style={{overflowY:'auto',padding:14}}>
        <div className="row" style={{gap:7}}><div className="statc" style={{flex:1,padding:'9px 10px'}}><div className="n" style={{fontSize:16}}>18</div><div className="l">Team</div></div><div className="statc green" style={{flex:1,padding:'9px 10px'}}><div className="n" style={{fontSize:16}}>4</div><div className="l">On shift</div></div><div className="statc amber" style={{flex:1,padding:'9px 10px'}}><div className="n" style={{fontSize:16}}>1</div><div className="l">Time-off</div></div></div>
        <div className="panel" style={{marginTop:12,padding:12,borderLeft:'3px solid var(--amber)'}}><div style={{fontSize:12.5,fontWeight:600}}>Catherine Henri · Annual leave</div><div className="faint mono" style={{fontSize:10,margin:'3px 0 9px'}}>12–14 Jun · coverage: Mathias</div><div className="row" style={{gap:7}}><button className="dbtn green sm" style={{flex:1}}><DI n="check" s={2}/> Approve</button><button className="dbtn ghost sm">Decline</button></div></div>
        <div className="dml" style={{margin:'16px 0 8px'}}>Staff<span className="rule"/></div>
        {staff.map((s,i)=>(<div key={i} className="panel" style={{padding:'10px 12px',marginBottom:7}}><div className="between"><div className="row" style={{gap:9}}><span className="av1" style={{width:28,height:28,fontSize:9}}>{s[0]}</span><div><div style={{fontSize:12.5,fontWeight:600}}>{s[1]}</div><div className="faint" style={{fontSize:10.5}}>{s[2]}</div></div></div><span className="bdg green dot">Active</span></div></div>))}
      </div><MTabbar on="more"/></div>
  );
}

function MobileGuests(){
  const rows=[['TM','Thibault Marchand','3','€18,420','returning'],['PI','Priya Iyer','5','€31,200','vip'],['LO','Linde Okonkwo','2','€14,800','returning'],['IF','Isabella Fonseca','1','€3,680','new'],['AD','Amélie Dubois','4','€22,100','vip']];
  return (
    <div className="mphone"><div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Guests</span><span className="icbtn" style={{width:30,height:30}}><DI n="search" s={2}/></span></div>
      <div className="mchips"><span className="mchip on">All</span><span className="mchip">VIP</span><span className="mchip">Returning</span><span className="mchip">New</span></div>
      <div className="body" style={{overflowY:'auto',padding:14}}>
        <div className="row" style={{gap:7}}><div className="statc" style={{flex:1,padding:'9px 10px'}}><div className="n" style={{fontSize:16}}>184</div><div className="l">Guests</div></div><div className="statc green" style={{flex:1,padding:'9px 10px'}}><div className="n" style={{fontSize:16}}>33%</div><div className="l">Returning</div></div><div className="statc" style={{flex:1,padding:'9px 10px'}}><div className="n" style={{fontSize:16}}>21</div><div className="l">VIP</div></div></div>
        <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:14}}>{rows.map((r,i)=>(<div key={i} className="panel" style={{padding:'11px 12px'}}><div className="between"><div className="row" style={{gap:9}}><span className="av1" style={{width:28,height:28,fontSize:9}}>{r[0]}</span><div><div style={{fontSize:13,fontWeight:600}}>{r[1]}</div><div className="faint mono" style={{fontSize:10,marginTop:2}}>{r[2]} stays · {r[3]}</div></div></div><span className={"bdg "+(r[4]==='vip'?'amber':r[4]==='new'?'gray':'indigo')}>{r[4]}</span></div></div>))}</div>
      </div><MTabbar on="more"/></div>
  );
}

function MobileNotifs(){
  const need=[['flag','red','GBH-C5','Recurring pump fault — 3rd time. Friday suggests preventive service.'],['alert','amber','approvals','3 field reports waiting (1 urgent).'],['users','indigo','roster','Bryan at 88% load Tuesday — rebalance suggested.'],['coin','green','owners','GBH-B4 owner statement ready to send.']];
  return (
    <div className="mphone"><div className="top"><span className="wm">FAD</span><span className="ttl" style={{flex:1}}>Notifications</span><span className="icbtn" style={{width:30,height:30}}><DI n="spark" s={1.7}/></span></div>
      <div className="body" style={{overflowY:'auto',padding:14}}>
        <div className="fbar"><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft" style={{fontSize:11.5}}><b>Friday filtered</b> 3,847 low-signal alerts — here are the 4 that need you.</span></div>
        <div className="dml" style={{margin:'14px 0 8px'}}>Needs you <span className="ct">4</span><span className="rule"/></div>
        {need.map((n,i)=>(<div key={i} className="panel" style={{padding:'11px 12px',marginBottom:8}}><div className="row" style={{gap:11,alignItems:'flex-start'}}><span className="statc" style={{padding:6,border:'none',background:'var(--'+n[1]+'-ghost)',color:'var(--'+n[1]+')'}}><DI n={n[0]} s={1.6}/></span><div style={{flex:1,minWidth:0}}><div className="faint mono" style={{fontSize:9.5}}>{n[2]}</div><div style={{fontSize:12.5,lineHeight:1.45,marginTop:2}}>{n[3]}</div></div></div></div>))}
        <div className="row" style={{gap:9,marginTop:6,padding:'11px 12px',border:'1px dashed var(--line)',borderRadius:12,color:'var(--tx-2)',fontSize:12}}><DI n="bell" s={1.7} style={{color:'var(--tx-3)'}}/><span><b>3,847 muted</b> this week — tap to review.</span></div>
      </div><MTabbar on="more"/></div>
  );
}
Object.assign(window.FADMOBILE, { MobileFinance, MobileOwners, MobileReviews, MobileAnalytics, MobileHR, MobileGuests, MobileNotifs });
