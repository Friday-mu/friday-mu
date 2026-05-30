/* FAD V2 — Marketing module (OUTBOUND). Social campaigns, content calendar, creative,
   audiences & strategy to win more guests AND more property owners.
   Dark FAD skin, Shell chrome. Tabs: Overview · Campaigns · Content calendar · Creative · Audiences. */
const { DI: MDI, Shell: MShell } = window.FADD;
const MST = window.FADSTATE || {};
const MKM = n => n>=1e6 ? (n/1e6).toFixed(1)+'M' : n>=1e3 ? (n/1e3).toFixed(1)+'k' : ''+n;

const CHAN = {ig:['#d6336c','Instagram'],fb:['#4c6ef5','Facebook'],google:['#2f9e44','Google Ads'],email:['#9b7cf0','Email'],linkedin:['#1c7ed6','LinkedIn'],tiktok:['#e8590c','TikTok']};
const MK_GOAL = {guest:['green','Guest acquisition'],owner:['violet','Owner acquisition'],rebook:['indigo','Rebooking'],brand:['gray','Brand']};
const CAMPAIGNS = [
  {nm:'Winter in Mauritius',goal:'guest',chans:['ig','fb','google'],status:'live',budget:60000,reach:412000,leads:138,cpl:435},
  {nm:'List with Friday — owner drive',goal:'owner',chans:['fb','linkedin','google'],status:'live',budget:45000,reach:96000,leads:21,cpl:2143},
  {nm:'Last-minute long weekend',goal:'guest',chans:['ig','email'],status:'live',budget:18000,reach:88000,leads:64,cpl:281},
  {nm:'Come back to the West Coast',goal:'rebook',chans:['email','ig'],status:'scheduled',budget:9000,reach:0,leads:0,cpl:0},
  {nm:'Behind the villas — brand series',goal:'brand',chans:['ig','tiktok'],status:'live',budget:12000,reach:204000,leads:0,cpl:0},
  {nm:'Grand Baie summer push',goal:'guest',chans:['ig','fb'],status:'draft',budget:0,reach:0,leads:0,cpl:0},
  {nm:'Refer an owner, earn rewards',goal:'owner',chans:['email','fb'],status:'ended',budget:22000,reach:54000,leads:17,cpl:1294},
];
const MKSTAT = {live:['green','live'],scheduled:['amber','scheduled'],draft:['gray','draft'],ended:['gray','ended']};
/* content calendar — posts keyed by weekday index 0..6 */
const CAL_POSTS = [
  [{ch:'ig',t:'Reel · Sunset at SD-10',time:'09:00',state:'scheduled'}],
  [{ch:'fb',t:'Owner testimonial — Beaumont',time:'12:00',state:'scheduled'},{ch:'email',t:'Last-minute deals blast',time:'17:00',state:'draft'}],
  [{ch:'ig',t:'Carousel · 5 villas under Rs10k',time:'10:30',state:'scheduled'}],
  [{ch:'tiktok',t:'Turnover time-lapse',time:'15:00',state:'idea'}],
  [{ch:'ig',t:'Guest UGC repost · Marie L.',time:'09:30',state:'scheduled'},{ch:'google',t:'Search ad refresh',time:'—',state:'live'}],
  [{ch:'fb',t:'Weekend availability spotlight',time:'11:00',state:'idea'}],
  [],
];
const AUDIENCES = [
  {seg:'Returning guests',kind:'guest',size:'1,840',note:'Stayed 12–24 mo ago, no rebooking',cta:'Win-back email'},
  {seg:'EU winter travellers',kind:'guest',size:'~310k',note:'IG/FB lookalike of past bookers',cta:'Boost reel'},
  {seg:'High-yield owners (off-platform)',kind:'owner',size:'420',note:'Own 1–3 STR units, not with Friday',cta:'Owner drive'},
  {seg:'Long-hold low-yield owners',kind:'owner',size:'88',note:'Likely to switch managers',cta:'Pitch + valuation'},
];

function ScreenMarketing(){
  const [tab,setTab]=React.useState('overview');
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const tabs=[['overview','Overview'],['campaigns','Campaigns'],['calendar','Content calendar'],['creative','Creative'],['audiences','Audiences']];
  return (
    <MShell active="marketing" eyebrow={<><MDI n="star" s={1.6} style={{color:'var(--indigo-bright)'}}/> MARKETING</>}
      title="Marketing" sub="Outbound campaigns · content · creative · grow guests & owners"
      actions={<><button className="dbtn ghost" onClick={()=>setTab('calendar')}><MDI n="cal" s={1.8}/> Calendar</button><button className="dbtn primary" onClick={()=>T('New campaign — pick a goal & channels')}><MDI n="plus" s={2}/> New campaign</button></>}>
      {MST.StateBanner && <MST.StateBanner surface="Marketing"/>}
      <div className="dtabs" style={{marginTop:2}}>{tabs.map(t=><span key={t[0]} className={"dtab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}</span>)}</div>
      {tab==='overview' && <MkOverview T={T} go={setTab}/>}
      {tab==='campaigns' && <MkCampaigns T={T}/>}
      {tab==='calendar' && <MkCalendar T={T}/>}
      {tab==='creative' && <MkCreative T={T}/>}
      {tab==='audiences' && <MkAudiences T={T}/>}
    </MShell>
  );
}
function ChanDots({chans}){
  return <span className="row" style={{gap:4}}>{chans.map((c,i)=><span key={i} title={CHAN[c][1]} style={{width:9,height:9,borderRadius:3,background:CHAN[c][0],flex:'0 0 auto'}}/>)}</span>;
}
function MkOverview({T,go}){
  const live=CAMPAIGNS.filter(c=>c.status==='live').length;
  const reach=CAMPAIGNS.reduce((a,c)=>a+c.reach,0);
  const gLeads=CAMPAIGNS.filter(c=>c.goal==='guest').reduce((a,c)=>a+c.leads,0);
  const oLeads=CAMPAIGNS.filter(c=>c.goal==='owner').reduce((a,c)=>a+c.leads,0);
  return (<>
    <div className="grid4">
      <div className="statc"><div className="n">{live}</div><div className="l">Live campaigns</div></div>
      <div className="statc"><div className="n">{MKM(reach)}</div><div className="l">Reach · 30d</div></div>
      <div className="statc green"><div className="n">{gLeads}</div><div className="l">Guest leads</div><div className="d">→ Reservations</div></div>
      <div className="statc violet"><div className="n">{oLeads}</div><div className="l">Owner leads</div><div className="d">→ Leads / CRM</div></div>
    </div>
    <div className="fai" style={{marginTop:14}}>
      <div className="fh"><span className="bdg indigo"><MDI n="spark" s={1.6}/> Friday</span></div>
      <p>Your <b>owner-acquisition</b> campaign is converting (21 leads) — I drafted 3 more posts targeting off-platform owners. The <b>Winter</b> guest push is your best ROI. Want me to shift Rs 10k from Brand into Winter and schedule this week's content?</p>
      <div className="acts"><button className="dbtn primary sm" onClick={()=>go('calendar')}><MDI n="cal" s={1.7}/> Review calendar</button><button className="dbtn ghost sm" onClick={()=>T('Drafted budget shift + 3 owner posts')}>Draft actions</button></div>
    </div>
    <div className="dtwocol" style={{marginTop:16,display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:14,alignItems:'start'}}>
      <div className="panel" style={{padding:'10px 6px'}}>
        <div className="dml" style={{margin:'2px 12px 6px'}}>Top campaigns <span className="rule"/></div>
        <table className="tbl"><thead><tr><th>Campaign</th><th>Goal</th><th>Channels</th><th style={{textAlign:'right'}}>Reach</th><th style={{textAlign:'right'}}>Leads</th></tr></thead>
          <tbody>{CAMPAIGNS.filter(c=>c.status==='live').map((c,i)=>(<tr key={i} className="tdrow" onClick={()=>T('Opened '+c.nm)}>
            <td><span className="tt">{c.nm}</span></td>
            <td><span className={"bdg "+MK_GOAL[c.goal][0]}>{MK_GOAL[c.goal][1].split(' ')[0]}</span></td>
            <td><ChanDots chans={c.chans}/></td>
            <td className="mono faint" style={{textAlign:'right'}}>{MKM(c.reach)}</td>
            <td className="mono" style={{textAlign:'right',fontWeight:600}}>{c.leads||'—'}</td>
          </tr>))}</tbody>
        </table>
      </div>
      <div className="panel">
        <div className="dml" style={{margin:'0 0 10px'}}>Audience growth<span className="rule"/></div>
        {[['Instagram','18.2k','+6.1%','#d6336c'],['Facebook','9.4k','+2.3%','#4c6ef5'],['Email list','12.1k','+4.8%','#9b7cf0'],['TikTok','3.7k','+22%','#e8590c']].map((r,i)=>(
          <div key={i} className="drow" style={i===3?{borderBottom:'none'}:null}><span className="row" style={{gap:8}}><span style={{width:8,height:8,borderRadius:3,background:r[3]}}/>{r[0]}</span><span className="row" style={{gap:10}}><span className="mono" style={{fontWeight:600}}>{r[1]}</span><span className="mono" style={{fontSize:11,color:'var(--green)'}}>{r[2]}</span></span></div>
        ))}
      </div>
    </div>
  </>);
}
function MkCampaigns({T}){
  const [seg,setSeg]=React.useState('all');
  const segs=[['all','All'],['guest','Guest acq.'],['owner','Owner acq.'],['rebook','Rebooking'],['brand','Brand']];
  const shown=CAMPAIGNS.filter(c=>seg==='all'||c.goal===seg);
  return (<>
    <div className="row between" style={{margin:'2px 0 10px'}}>
      <span className="vseg">{segs.map(s=><span key={s[0]} className={"vs"+(seg===s[0]?' on':'')} onClick={()=>setSeg(s[0])}>{s[1]}</span>)}</span>
      <span className="faint mono" style={{fontSize:10}}>{shown.length} campaigns</span>
    </div>
    <div className="panel" style={{padding:'10px 6px'}}>
      <table className="tbl"><thead><tr><th>Campaign</th><th>Goal</th><th>Channels</th><th>Status</th><th style={{textAlign:'right'}}>Budget</th><th style={{textAlign:'right'}}>Reach</th><th style={{textAlign:'right'}}>Leads</th><th style={{textAlign:'right'}}>Cost / lead</th></tr></thead>
        <tbody>{shown.map((c,i)=>(<tr key={i} className="tdrow" onClick={()=>T('Opened '+c.nm)}>
          <td><span className="tt">{c.nm}</span></td>
          <td><span className={"bdg "+MK_GOAL[c.goal][0]}>{MK_GOAL[c.goal][1]}</span></td>
          <td><ChanDots chans={c.chans}/></td>
          <td><span className={"bdg "+MKSTAT[c.status][0]+(c.status==='draft'||c.status==='ended'?'':' dot')}>{MKSTAT[c.status][1]}</span></td>
          <td className="mono faint" style={{textAlign:'right'}}>{c.budget?'Rs '+MKM(c.budget):'—'}</td>
          <td className="mono faint" style={{textAlign:'right'}}>{c.reach?MKM(c.reach):'—'}</td>
          <td className="mono" style={{textAlign:'right',fontWeight:600}}>{c.leads||'—'}</td>
          <td className="mono" style={{textAlign:'right',color:c.cpl&&c.cpl<500?'var(--green)':c.cpl>1500?'var(--amber)':'var(--tx-2)'}}>{c.cpl?'Rs '+c.cpl:'—'}</td>
        </tr>))}</tbody>
      </table>
    </div>
    <div className="gate" style={{borderStyle:'solid',marginTop:12}}><span style={{color:'var(--indigo-bright)'}}><MDI n="spark" s={1.7}/></span><span>Guest leads flow into <b>Reservations</b> as enquiries; owner leads flow into <b>Leads / CRM</b>. Friday tags each lead with its source campaign so you can see true cost-per-booking and cost-per-mandate.</span></div>
  </>);
}
function MkCalendar({T}){
  const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const SST={scheduled:'green',draft:'amber',idea:'gray',live:'indigo'};
  return (<>
    <div className="fai" style={{marginTop:6}}>
      <div className="fh"><span className="bdg indigo"><MDI n="spark" s={1.6}/> Friday content</span></div>
      <p>This week's plan is <b>8 posts</b> across 5 channels. I drafted captions + hashtags for the scheduled ones and flagged 2 ideas that still need creative. Best post windows: <b>9–10am</b> & <b>5–6pm</b>.</p>
      <div className="acts"><button className="dbtn primary sm" onClick={()=>T('Generated captions for 6 posts')}><MDI n="spark" s={1.7}/> Draft captions</button><button className="dbtn ghost sm" onClick={()=>T('New post scheduled')}><MDI n="plus" s={2}/> Schedule post</button></div>
    </div>
    <div className="dml" style={{marginTop:16}}>This week <span className="ct">8 posts</span><span className="rule"/></div>
    <div className="mkcal">
      {days.map((d,i)=>(
        <div key={i} className={"mkcol"+(i>=5?' wknd':'')}>
          <div className="mkcol-h">{d}</div>
          {CAL_POSTS[i].map((p,k)=>(
            <div key={k} className="mkpost" onClick={()=>T('Opened '+p.t)} style={{borderLeft:'3px solid '+CHAN[p.ch][0]}}>
              <div className="row between"><span style={{width:8,height:8,borderRadius:3,background:CHAN[p.ch][0]}}/><span className="faint mono" style={{fontSize:8.5}}>{p.time}</span></div>
              <div style={{fontSize:11,fontWeight:600,marginTop:5,lineHeight:1.3}}>{p.t}</div>
              <span className={"bdg "+SST[p.state]} style={{marginTop:6,height:16,padding:'0 5px',fontSize:8.5}}>{p.state}</span>
            </div>
          ))}
          {CAL_POSTS[i].length===0 && <div className="mkadd" onClick={()=>T('Schedule a post for '+d)}><MDI n="plus" s={2}/></div>}
        </div>
      ))}
    </div>
  </>);
}
function MkCreative({T}){
  const assets=[['Winter reel cover','ig','video'],['5 villas carousel','ig','set'],['Owner drive — flyer','fb','image'],['Email header · last-minute','email','image'],['Testimonial card','fb','image'],['Story template','ig','template'],['Search ad copy','google','copy'],['Brand series intro','tiktok','video']];
  return (<>
    <div className="row between" style={{margin:'2px 0 12px'}}>
      <span className="faint" style={{fontSize:12}}><MDI n="cam" s={1.6}/> Brand-consistent templates & assets · Friday generates on-brand drafts</span>
      <button className="dbtn primary sm" onClick={()=>T('Friday generating creative…')}><MDI n="spark" s={1.7}/> Generate asset</button>
    </div>
    <div className="grid4">
      {assets.map((a,i)=>(
        <div key={i} className="panel tap" style={{padding:0,overflow:'hidden',cursor:'pointer'}} onClick={()=>T('Opened '+a[0])}>
          <div className="mkasset" style={{borderBottom:'2px solid '+CHAN[a[1]][0]}}><span className="mono" style={{fontSize:9,color:'var(--tx-3)'}}>{a[2]}</span></div>
          <div style={{padding:'9px 11px'}}><div style={{fontSize:12,fontWeight:600,lineHeight:1.3}}>{a[0]}</div><div className="row" style={{gap:5,marginTop:5}}><span style={{width:8,height:8,borderRadius:3,background:CHAN[a[1]][0]}}/><span className="faint mono" style={{fontSize:9.5}}>{CHAN[a[1]][1]}</span></div></div>
        </div>
      ))}
    </div>
  </>);
}
function MkAudiences({T}){
  return (<>
    <div className="dml" style={{marginTop:6}}>Audiences & targeting <span className="ct">{AUDIENCES.length}</span><span className="rule"/></div>
    <div className="grid2">
      {AUDIENCES.map((a,i)=>(
        <div key={i} className="panel" style={{padding:'13px 15px'}}>
          <div className="between"><div className="row" style={{gap:8}}><span className="tt" style={{fontSize:14}}>{a.seg}</span><span className={"bdg "+(a.kind==='owner'?'violet':'green')}>{a.kind==='owner'?'owner':'guest'}</span></div><span className="mono faint" style={{fontSize:12}}>{a.size}</span></div>
          <div className="faint" style={{fontSize:12,marginTop:7,lineHeight:1.5}}>{a.note}</div>
          <button className="dbtn primary sm" style={{marginTop:11}} onClick={()=>T(a.cta+' — campaign drafted','green')}><MDI n="spark" s={1.7}/> {a.cta}</button>
        </div>
      ))}
    </div>
    <div className="gate" style={{borderStyle:'solid',marginTop:14}}><MDI n="alert" s={1.7} style={{color:'var(--violet)',flex:'0 0 auto'}}/><span><b>Owner acquisition</b> is the high-value play: 420 off-platform owners in your areas. Friday builds lookalike audiences from your best current owners and drafts the outreach — each new mandate is worth far more than a single booking.</span></div>
  </>);
}

window.FADMKTG = { ScreenMarketing };
