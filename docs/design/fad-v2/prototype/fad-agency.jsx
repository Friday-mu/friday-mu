/* FAD V2 — Agency module (real-estate brokerage / sales & lettings).
   Business unit, dark FAD skin. Push listings to portals (lExpress Property,
   Property Cloud), manage buyers/sellers, AI matching, AVM valuations,
   AI-surfaced opportunities. Module-level tabs, like Syndic. */
const { DI, Shell } = window.FADD;
const AFMT = n => 'Rs '+n.toLocaleString('en-US');
const AM = n => n>=1e6 ? 'Rs '+(n/1e6).toFixed(1)+'M' : n>=1e3 ? 'Rs '+(n/1e3).toFixed(0)+'k' : 'Rs '+n;

const LISTINGS=[
  {code:'GBH-B4',ttl:'Apartment · Pool & Gym',area:'Grand Baie',type:'Apartment',beds:2,ask:8500000,status:'live',lp:true,pc:true,views:412,enq:9,dom:24},
  {code:'SD-10',ttl:'Beachfront Villa · Sea View',area:'Tamarin',type:'Villa',beds:4,ask:28000000,status:'under-offer',lp:true,pc:true,views:980,enq:21,dom:51},
  {code:'RC-7',ttl:'Royal Court Apartment',area:'Pereybère',type:'Apartment',beds:3,ask:12200000,status:'live',lp:true,pc:false,views:188,enq:4,dom:12},
  {code:'VA-3',ttl:'Géranium Garden Suite',area:'Vacoas',type:'Apartment',beds:2,ask:6400000,status:'draft',lp:false,pc:false,views:0,enq:0,dom:0},
  {code:'KS-5',ttl:'Rooftop Penthouse',area:'Flic en Flac',type:'Penthouse',beds:3,ask:18900000,status:'live',lp:true,pc:true,views:603,enq:14,dom:33},
  {code:'LB-2',ttl:'Bougainvilliers Townhouse',area:'Bel Ombre',type:'Townhouse',beds:4,ask:21500000,status:'sold',lp:true,pc:true,views:744,enq:18,dom:62},
];
const BUYERS=[
  {av:'TM',nm:'Thomas Müller',budget:9000000,areas:'Grand Baie · Pereybère',type:'Apartment',beds:2,fin:'pre-approved',stage:'viewing'},
  {av:'PK',nm:'Priya Kapoor',budget:30000000,areas:'West coast',type:'Villa',beds:4,fin:'cash',stage:'offer'},
  {av:'JD',nm:'Jean Dupont',budget:13000000,areas:'North',type:'Apartment',beds:3,fin:'mortgage',stage:'qualified'},
  {av:'LO',nm:'Linda Okonkwo',budget:20000000,areas:'Flic en Flac',type:'Penthouse',beds:3,fin:'pre-approved',stage:'new'},
];
const SELLERS=[
  {av:'NH',nm:'Nitzana Holdings',prop:'SD-10',motiv:'relocating',ask:28000000,est:26500000,mandate:'exclusive',stage:'live'},
  {av:'BF',nm:'Beaumont Family',prop:'LB-2',motiv:'portfolio trim',ask:21500000,est:21900000,mandate:'exclusive',stage:'sold'},
  {av:'HD',nm:'Harrington, D.',prop:'RC-7',motiv:'upsizing',ask:12200000,est:11800000,mandate:'open',stage:'live'},
];
const MATCHES=[
  {buyer:'Priya Kapoor',listing:'SD-10',score:94,reasons:['Budget fit (Rs 30M ≥ Rs 28M)','Villa · 4-bed match','West coast','Cash buyer · fast close']},
  {buyer:'Thomas Müller',listing:'GBH-B4',score:88,reasons:['Budget fit','2-bed apartment','Grand Baie preferred','Pre-approved finance']},
  {buyer:'Jean Dupont',listing:'RC-7',score:82,reasons:['3-bed apartment','North区 area','Budget Rs 13M ≥ ask','Mortgage in progress']},
  {buyer:'Linda Okonkwo',listing:'KS-5',score:79,reasons:['Penthouse · 3-bed','Flic en Flac','Budget Rs 20M ≈ ask Rs 18.9M']},
];
const OPPS=[
  ['coin','Owner likely to sell · VA-3','Low yield (3.1%) + 4-yr hold. Owner asked about market last month — good listing candidate.','Draft pitch'],
  ['chart','Price reduction · RC-7','12 days, 188 views, 4 enquiries — below area conversion. Suggest −4% to Rs 11.7M.','Suggest to owner'],
  ['users','Re-activate buyer · Linda O.','Viewed 3 penthouses in Mar, went quiet. New KS-5 listing fits — re-engage.','Send KS-5'],
  ['spark','Cross-sell · SD-10 buyer','Priya buying SD-10 — offer Friday letting management + Design refresh.','Intro services'],
];
const ASTAT={draft:['gray','draft'],live:['green','live'],'under-offer':['amber','under offer'],sold:['indigo','sold']};

function ScreenAgency(){
  const [tab,setTab]=React.useState('overview');
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const tabs=[['overview','Overview'],['listings','Listings'],['buyers','Buyers'],['sellers','Sellers'],['matches','Matches'],['valuations','Valuations'],['opps','Opportunities']];
  return (
    <Shell active="agency" eyebrow={<><DI n="users" s={1.6} style={{color:'var(--indigo-bright)'}}/> AGENCY · BUSINESS UNIT</>}
      title="Agency" sub="Sales & lettings · portals · matching · valuations"
      actions={<><button className="dbtn ghost" onClick={()=>T('Synced from lExpress Property + Property Cloud')}><DI n="clock" s={1.8}/> Sync portals</button><button className="dbtn primary" onClick={()=>setTab('valuations')}><DI n="plus" s={2}/> New valuation</button></>}>
      <div className="dtabs" style={{marginTop:2}}>{tabs.map(t=><span key={t[0]} className={"dtab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}</span>)}</div>

      {tab==='overview' && <AgOverview T={T} go={setTab}/>}
      {tab==='listings' && <AgListings T={T}/>}
      {tab==='buyers' && <AgPeople rows={BUYERS} kind="buyer" T={T}/>}
      {tab==='sellers' && <AgSellers T={T}/>}
      {tab==='matches' && <AgMatches T={T}/>}
      {tab==='valuations' && <AgValuations T={T}/>}
      {tab==='opps' && <AgOpps T={T}/>}
    </Shell>
  );
}
function AgOverview({T,go}){
  const live=LISTINGS.filter(l=>l.status==='live').length;
  const pipeline=LISTINGS.filter(l=>l.status!=='sold'&&l.status!=='draft').reduce((a,l)=>a+l.ask,0);
  return (<>
    <div className="grid4">
      <div className="statc"><div className="n">{live}</div><div className="l">Live listings</div></div>
      <div className="statc"><div className="n">{MATCHES.filter(m=>m.score>=85).length}</div><div className="l">Hot matches</div></div>
      <div className="statc amber"><div className="n">1</div><div className="l">Offers in play</div></div>
      <div className="statc"><div className="n">{AM(pipeline)}</div><div className="l">Pipeline value</div></div>
    </div>
    <div className="fai" style={{marginTop:14}}>
      <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday</span></div>
      <p><b>{MATCHES.filter(m=>m.score>=85).length} strong buyer matches</b> ready to introduce. RC-7 is underperforming — I'd suggest a 4% price drop. And VA-3's owner looks ready to sell. Want me to action these?</p>
      <div className="acts"><button className="dbtn primary sm" onClick={()=>go('matches')}><DI n="users" s={1.8}/> Review matches</button><button className="dbtn ghost sm" onClick={()=>go('opps')}>Opportunities</button></div>
    </div>
    <div className="dml" style={{marginTop:16}}>Needs attention <span className="rule"/></div>
    <div className="panel" style={{padding:'2px 14px'}}>
      {OPPS.map((o,i)=>(<div key={i} className="synalert" onClick={()=>go('opps')}><span className="statc" style={{padding:6,border:'none',background:'var(--indigo-ghost)',color:'var(--indigo-bright)'}}><DI n={o[0]} s={1.6}/></span><div style={{flex:1,minWidth:0}}><div style={{fontSize:12.5,fontWeight:600}}>{o[1]}</div><div className="faint" style={{fontSize:11,marginTop:2,lineHeight:1.45}}>{o[2]}</div></div><button className="dbtn sm ghost" onClick={e=>{e.stopPropagation();T(o[3]);}}>{o[3]}</button></div>))}
    </div>
  </>);
}
function PortalDot({on,label,T}){
  const [v,setV]=React.useState(on);
  return <span className={"portal-pill"+(v?' on':'')} onClick={e=>{e.stopPropagation();setV(!v);T(v?'Removed from '+label:'Pushed to '+label,v?'':'green');}} title={label}>{label.split(' ')[0]} {v?'✓':'+'}</span>;
}
function AgListings({T}){
  const [seg,setSeg]=React.useState('all');
  const segs=[['all','All'],['live','Live'],['under-offer','Under offer'],['draft','Draft'],['sold','Sold']];
  const shown=LISTINGS.filter(l=>seg==='all'||l.status===seg);
  return (<>
    <div className="row between" style={{margin:'2px 0 10px'}}>
      <span className="vseg">{segs.map(s=><span key={s[0]} className={"vs"+(seg===s[0]?' on':'')} onClick={()=>setSeg(s[0])}>{s[1]}</span>)}</span>
      <span className="faint mono" style={{fontSize:10}}>{shown.length} listings</span>
    </div>
    <div className="panel" style={{padding:'10px 6px'}}>
      <table className="tbl"><thead><tr><th>Property</th><th>Area</th><th>Type</th><th style={{textAlign:'right'}}>Ask</th><th>Status</th><th>Portals</th><th style={{textAlign:'right'}}>Views</th><th style={{textAlign:'right'}}>Enq.</th><th style={{textAlign:'right'}}>Days</th></tr></thead>
        <tbody>{shown.map((l,i)=>(<tr key={i} className="tdrow" onClick={()=>T('Opened listing '+l.code)}>
          <td><span className="row" style={{gap:8}}><span className="pcodeD">{l.code}</span><span className="tt" style={{maxWidth:200,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{l.ttl}</span></span></td>
          <td className="faint">{l.area}</td><td className="faint">{l.type} · {l.beds}bd</td>
          <td className="mono" style={{textAlign:'right',fontWeight:600}}>{AM(l.ask)}</td>
          <td><span className={"bdg "+ASTAT[l.status][0]+(l.status==='draft'?'':' dot')}>{ASTAT[l.status][1]}</span></td>
          <td><span className="row" style={{gap:5}} onClick={e=>e.stopPropagation()}><PortalDot on={l.lp} label="lExpress Property" T={T}/><PortalDot on={l.pc} label="Property Cloud" T={T}/></span></td>
          <td className="mono faint" style={{textAlign:'right'}}>{l.views||'—'}</td><td className="mono faint" style={{textAlign:'right'}}>{l.enq||'—'}</td><td className="mono faint" style={{textAlign:'right'}}>{l.dom||'—'}</td>
        </tr>))}</tbody>
      </table>
    </div>
    <div className="gate" style={{borderStyle:'solid',marginTop:12}}><span style={{color:'var(--indigo-bright)'}}><DI n="spark" s={1.7}/></span><span>Listings push to <b>lExpress Property</b> &amp; <b>Property Cloud</b> with one tap; Friday keeps title, price and availability in parity across portals and flags conflicts.</span></div>
  </>);
}
function AgPeople({rows,T}){
  const [seg,setSeg]=React.useState('all');
  const fin={'pre-approved':'green','cash':'green','mortgage':'amber'};
  return (<>
    <div className="row between" style={{margin:'2px 0 10px'}}>
      <span className="vseg">{['all','new','qualified','viewing','offer'].map(s=><span key={s} className={"vs"+(seg===s?' on':'')} style={{textTransform:'capitalize'}} onClick={()=>setSeg(s)}>{s}</span>)}</span>
      <button className="dbtn sm ghost" onClick={()=>T('Add buyer')}><DI n="plus" s={2}/> Add buyer</button>
    </div>
    <div className="panel" style={{padding:'10px 6px'}}>
      <table className="tbl"><thead><tr><th>Buyer</th><th style={{textAlign:'right'}}>Budget</th><th>Looking for</th><th>Areas</th><th>Finance</th><th>Stage</th></tr></thead>
        <tbody>{rows.filter(r=>seg==='all'||r.stage===seg).map((r,i)=>(<tr key={i} className="tdrow" onClick={()=>T('Opened '+r.nm)}>
          <td><span className="row" style={{gap:8}}><span className="av1" style={{width:24,height:24,fontSize:8}}>{r.av}</span><span className="tt">{r.nm}</span></span></td>
          <td className="mono" style={{textAlign:'right',fontWeight:600}}>{AM(r.budget)}</td>
          <td className="faint">{r.type} · {r.beds}bd</td><td className="faint" style={{fontSize:11.5}}>{r.areas}</td>
          <td><span className={"bdg "+(fin[r.fin]||'gray')}>{r.fin}</span></td>
          <td><span className="bdg indigo" style={{textTransform:'capitalize'}}>{r.stage}</span></td>
        </tr>))}</tbody>
      </table>
    </div>
  </>);
}
function AgSellers({T}){
  return (<div className="panel" style={{padding:'10px 6px',marginTop:6}}>
    <table className="tbl"><thead><tr><th>Seller</th><th>Property</th><th>Motivation</th><th style={{textAlign:'right'}}>Ask</th><th style={{textAlign:'right'}}>Est.</th><th>Mandate</th><th>Stage</th></tr></thead>
      <tbody>{SELLERS.map((s,i)=>(<tr key={i} className="tdrow" onClick={()=>T('Opened '+s.nm)}>
        <td><span className="row" style={{gap:8}}><span className="av1" style={{width:24,height:24,fontSize:8}}>{s.av}</span><span className="tt">{s.nm}</span></span></td>
        <td><span className="pcodeD">{s.prop}</span></td><td className="faint">{s.motiv}</td>
        <td className="mono" style={{textAlign:'right'}}>{AM(s.ask)}</td>
        <td className="mono" style={{textAlign:'right',color:s.est<s.ask?'var(--amber)':'var(--green)'}}>{AM(s.est)}</td>
        <td><span className={"bdg "+(s.mandate==='exclusive'?'indigo':'gray')}>{s.mandate}</span></td>
        <td><span className={"bdg "+ASTAT[s.stage][0]+(s.stage==='sold'?'':' dot')}>{ASTAT[s.stage][1]}</span></td>
      </tr>))}</tbody>
    </table>
  </div>);
}
function AgMatches({T}){
  const [done,setDone]=React.useState({});
  return (<>
    <div className="fai" style={{marginTop:6}}><div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday matching</span></div><p>Buyers scored against live listings on budget, area, type, beds and finance readiness. High scores are warm intros — review the reasons before connecting.</p></div>
    <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:14}}>
      {MATCHES.map((m,i)=>(
        <div key={i} className="panel" style={{padding:'13px 15px',opacity:done[i]?.5:1}}>
          <div className="between" style={{alignItems:'flex-start',gap:14}}>
            <div style={{flex:1,minWidth:0}}>
              <div className="row" style={{gap:9,alignItems:'center'}}><span style={{fontWeight:600,fontSize:14}}>{m.buyer}</span><DI n="chevR" s={2} style={{color:'var(--tx-3)',width:14,height:14}}/><span className="pcodeD">{m.listing}</span></div>
              <div className="row" style={{gap:6,flexWrap:'wrap',marginTop:9}}>{m.reasons.map((r,k)=><span key={k} className="synflag green">{r}</span>)}</div>
            </div>
            <div style={{flex:'0 0 120px',textAlign:'right'}}><div className="faint mono" style={{fontSize:9,letterSpacing:'.08em'}}>MATCH</div><div className="mono" style={{fontSize:20,fontWeight:700,color:m.score>=85?'var(--green)':'var(--amber)'}}>{m.score}%</div><div className="lq-conf" style={{marginTop:4}}><i style={{width:m.score+'%',background:m.score>=85?'var(--green)':'var(--amber)'}}/></div></div>
          </div>
          <div className="row" style={{gap:7,marginTop:12}}>
            <button className="dbtn primary sm" onClick={()=>{setDone(d=>({...d,[i]:1}));T('Intro sent · '+m.buyer+' → '+m.listing,'green');}}><DI n="msg" s={1.8}/> Introduce</button>
            <button className="dbtn sm" onClick={()=>T('Viewing scheduled')}><DI n="cal" s={1.7}/> Schedule viewing</button>
            <span className="grow"/><button className="dbtn ghost sm" onClick={()=>setDone(d=>({...d,[i]:1}))}>Dismiss</button>
          </div>
        </div>
      ))}
    </div>
  </>);
}
function AgValuations({T}){
  const [type,setType]=React.useState('Apartment');
  const [area,setArea]=React.useState('Grand Baie');
  const [beds,setBeds]=React.useState(2);
  const base={Apartment:4200000,Villa:7000000,Penthouse:6000000,Townhouse:5200000}[type];
  const areaMult={'Grand Baie':1.35,'Tamarin':1.5,'Flic en Flac':1.4,'Pereybère':1.2,'Vacoas':0.85,'Bel Ombre':1.45}[area];
  const sale=Math.round(base*areaMult*(0.7+beds*0.32)/100000)*100000;
  const rent=Math.round(sale*0.0052/1000)*1000;
  const comps=[['GBH-B4','Grand Baie','2bd','Rs 8.5M','sold 3mo'],['RC-7','Pereybère','3bd','Rs 12.2M','live'],['KS-5','Flic en Flac','3bd','Rs 18.9M','live']];
  return (<>
    <div className="grid2" style={{display:'grid',gridTemplateColumns:'1fr 1.1fr',gap:14,marginTop:6,alignItems:'start'}}>
      <div className="panel">
        <div className="dml" style={{margin:'0 0 12px'}}>Estimate inputs <span className="rule"/></div>
        <div style={{display:'flex',flexDirection:'column',gap:11}}>
          <Seg label="Type" val={type} set={setType} opts={['Apartment','Villa','Penthouse','Townhouse']}/>
          <Seg label="Area" val={area} set={setArea} opts={['Grand Baie','Tamarin','Flic en Flac','Pereybère','Vacoas','Bel Ombre']}/>
          <div><div className="faint mono" style={{fontSize:9,letterSpacing:'.08em',textTransform:'uppercase',marginBottom:6}}>Bedrooms</div><span className="vseg">{[1,2,3,4,5].map(b=><span key={b} className={"vs"+(beds===b?' on':'')} onClick={()=>setBeds(b)}>{b}</span>)}</span></div>
        </div>
      </div>
      <div className="panel">
        <div className="dml" style={{margin:'0 0 12px'}}>Friday estimate <span className="ct">modeled · market comps</span><span className="rule"/></div>
        <div className="row" style={{gap:12}}>
          <div className="statc" style={{flex:1}}><div className="faint mono" style={{fontSize:9}}>SALE</div><div className="n" style={{fontSize:22}}>{AM(sale)}</div><div className="faint" style={{fontSize:10}}>{AM(Math.round(sale*0.93/1e5)*1e5)}–{AM(Math.round(sale*1.07/1e5)*1e5)}</div></div>
          <div className="statc" style={{flex:1}}><div className="faint mono" style={{fontSize:9}}>RENT / MO</div><div className="n" style={{fontSize:22}}>{AFMT(rent)}</div><div className="faint" style={{fontSize:10}}>yield ~{(rent*12/sale*100).toFixed(1)}%</div></div>
        </div>
        <div className="row" style={{gap:8,marginTop:12,alignItems:'center'}}><span className="faint" style={{fontSize:11}}>Confidence</span><span className="lq-conf" style={{flex:1}}><i style={{width:'72%',background:'var(--amber)'}}/></span><span className="mono" style={{fontSize:11}}>72%</span></div>
        <button className="dbtn primary sm" style={{marginTop:12,width:'100%'}} onClick={()=>T('Owner valuation report generated (A4)')}><DI n="doc" s={1.7}/> Generate owner report</button>
      </div>
    </div>
    <div className="dml" style={{marginTop:16}}>Comparables <span className="rule"/></div>
    <div className="panel" style={{padding:'10px 6px'}}>
      <table className="tbl"><thead><tr><th>Property</th><th>Area</th><th>Beds</th><th style={{textAlign:'right'}}>Price</th><th>Status</th></tr></thead>
        <tbody>{comps.map((c,i)=>(<tr key={i}><td><span className="pcodeD">{c[0]}</span></td><td className="faint">{c[1]}</td><td className="faint">{c[2]}</td><td className="mono" style={{textAlign:'right',fontWeight:600}}>{c[3]}</td><td className="faint">{c[4]}</td></tr>))}</tbody>
      </table>
    </div>
    <div className="gate" style={{borderStyle:'solid',marginTop:12}}><DI n="alert" s={1.7} style={{color:'var(--violet)',flex:'0 0 auto'}}/><span><b>Modeled estimate</b> — derived from market comparables, not an observed sale. Treat as a starting point; confirm against a full appraisal before advising the owner.</span></div>
  </>);
}
function Seg({label,val,set,opts}){
  return <div><div className="faint mono" style={{fontSize:9,letterSpacing:'.08em',textTransform:'uppercase',marginBottom:6}}>{label}</div><span className="vseg" style={{flexWrap:'wrap'}}>{opts.map(o=><span key={o} className={"vs"+(val===o?' on':'')} onClick={()=>set(o)}>{o}</span>)}</span></div>;
}
function AgOpps({T}){
  const [done,setDone]=React.useState({});
  return (<>
    <div className="fai" style={{marginTop:6}}><div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday opportunities</span></div><p>Surfaced from portfolio + market signals — owners likely to sell, listings to reprice, buyers to re-activate, and cross-sells into Syndic &amp; Design.</p></div>
    <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:14}}>
      {OPPS.map((o,i)=>(<div key={i} className="panel" style={{padding:'13px 15px',opacity:done[i]?.5:1}}>
        <div className="between" style={{alignItems:'flex-start',gap:12}}>
          <div className="row" style={{gap:11,alignItems:'flex-start',minWidth:0}}><span className="statc" style={{padding:7,border:'none',background:'var(--indigo-ghost)',color:'var(--indigo-bright)'}}><DI n={o[0]} s={1.7}/></span>
            <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:13.5}}>{o[1]}</div><div className="faint" style={{fontSize:11.5,marginTop:3,lineHeight:1.5}}>{o[2]}</div></div></div>
          <div className="row" style={{gap:7,flex:'0 0 auto'}}><button className="dbtn primary sm" onClick={()=>{setDone(d=>({...d,[i]:1}));T(o[3],'green');}}>{o[3]}</button><button className="dbtn ghost sm" onClick={()=>setDone(d=>({...d,[i]:1}))}>Dismiss</button></div>
        </div>
      </div>))}
    </div>
  </>);
}

window.FADAGENCY = { ScreenAgency };
