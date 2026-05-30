/* ============================================================================
   FAD · Property record — full tabbed workspace (Guesty + Breezeway parity)
   Reuses Shell, DI from fad-desktop.jsx + .rd* layout classes from fad-desktop.css
   ========================================================================== */
const PTABS = ['Overview','Identity & layout','Owner','Operational','Maintenance','Financial','Calendar','Reviews','Listings'];
const PICON = {'Overview':'home','Identity & layout':'doc','Owner':'owner','Operational':'ops','Maintenance':'gear','Financial':'coin','Calendar':'cal','Reviews':'star','Listings':'list'};

function PField({l,children,last,src,note}){
  const ST = window.FADSTATE && window.FADSTATE.SourceTag;
  return <div className="drow" style={last?{borderBottom:'none'}:null}><span className="faint">{l}</span><span style={{textAlign:'right',display:'flex',alignItems:'center',gap:8,justifyContent:'flex-end'}}>{children}{src&&ST&&<ST kind={src} note={note}/>}</span></div>;
}

function ScreenProperty(){
  const [tab,setTab]=React.useState('Overview');
  const backRef = React.useRef((window.__FADBACK)||'prop');
  React.useEffect(()=>{ window.__FADBACK=null; },[]);
  return (
    <Shell active="prop" bare>
      <div className="row" style={{gap:11,marginBottom:14}}>
        <button className="dbtn ghost sm" onClick={()=>window.FADGO(backRef.current)}><DI n="chevL" s={2}/> Back</button>
        <span className="faint mono" style={{fontSize:11}}>Properties <span style={{color:'var(--tx-4)'}}>›</span> BS-1</span>
      </div>
      <div className="rdgrid">
        <div className="rdctx">
          <div className="rdthumb" style={{height:96,marginTop:0}}/>
          <div className="row between"><span className="pcodeD">BS-1</span><span className="bdg green dot">Active</span></div>
          <div style={{fontWeight:600,fontSize:13.5,marginTop:8}}>Modern Apt in Secure Gated Residence</div>
          <div className="faint" style={{fontSize:11,marginTop:2}}>Les Jardins d'Anna 2 · Flic en Flac</div>
          <div className="row" style={{gap:7,marginTop:10,fontSize:11}}>
            <span className="row" style={{gap:4}}><DI n="home" s={1.6} style={{color:'var(--tx-3)'}}/>2 BR</span>
            <span className="row" style={{gap:4}}>· 2 bath</span>
            <span className="row" style={{gap:4}}>· sleeps 5</span>
          </div>
          <div className="row" style={{gap:6,marginTop:10}}><span className="mdot" style={{background:'#e08e89',width:9,height:9,borderRadius:3}}/><span className="mdot" style={{background:'#9fb4ee',width:9,height:9,borderRadius:3}}/><span className="mdot" style={{background:'#6cc79c',width:9,height:9,borderRadius:3}}/><span className="faint" style={{fontSize:10.5}}>Airbnb · Booking · Direct</span></div>
          <div style={{marginTop:12,paddingTop:10,borderTop:'1px solid var(--line-2)',display:'flex',flexDirection:'column',gap:7}}>
            <div className="faint mono" style={{fontSize:8.5,letterSpacing:'.12em',textTransform:'uppercase'}}>Source systems</div>
            {window.FADSTATE && <><window.FADSTATE.SyncChip source="Guesty"/><window.FADSTATE.SyncChip source="Breezeway"/></>}
          </div>
          <div className="rdnav">{PTABS.map(t=>(<div key={t} className={"it"+(t===tab?' on':'')} onClick={()=>setTab(t)}><DI n={PICON[t]} s={1.7}/> {t}</div>))}</div>
        </div>
        <div>
          <div className="dhead" style={{marginBottom:14}}><div><div className="eyebrow">PROPERTY</div><h1>{tab}</h1></div>
            <div className="row">{tab==='Overview' && <><button className="dbtn"><DI n="spark" s={1.6}/> Ask Friday</button><button className="dbtn ghost">Edit</button></>}{tab==='Listings' && <button className="dbtn ghost">Preview on channels ↗</button>}{tab==='Owner' && <button className="dbtn ghost">Open owner statements</button>}</div>
          </div>
          {tab==='Overview' && <POverview/>}
          {tab==='Identity & layout' && <PIdentity/>}
          {tab==='Owner' && <POwner/>}
          {tab==='Operational' && <POperational/>}
          {tab==='Maintenance' && <PMaintenance/>}
          {tab==='Financial' && <PFinancial/>}
          {tab==='Calendar' && <PCalendar/>}
          {tab==='Reviews' && <PReviews/>}
          {tab==='Listings' && <PListings/>}
        </div>
      </div>
    </Shell>
  );
}

function POverview(){
  const recs=[['amber','Add 4 more photos','5 of 9 recommended — listings with 9+ photos convert ~20% better.'],['amber','Base description missing on Booking.com','Primary description is set; Booking.com channel description is empty.'],['indigo','9 of 17 popular amenities selected','Add A/C, pool, parking to improve search ranking.'],['red','Listed on 1 of 3 connected channels','Live on Airbnb; Booking.com & Direct are connected but unlisted.']];
  const tone={red:'var(--red)',amber:'var(--amber)',indigo:'var(--indigo)'};
  return (<>
    <div className="grid4">
      <div className="statc"><div className="n">83%</div><div className="l">Occupancy · YTD</div></div>
      <div className="statc"><div className="n">€71</div><div className="l">ADR</div></div>
      <div className="statc"><div className="n">4.8</div><div className="l">Rating · 23 reviews</div></div>
      <div className="statc"><div className="n">€55</div><div className="l">Base rate / night</div></div>
    </div>
    <div className="fai" style={{marginTop:13}}>
      <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Listing quality</span><span className="grow"/><span className="faint mono" style={{fontSize:10}}>4 recommendations</span></div>
      <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:10}}>
        {recs.map((r,i)=>(<div key={i} className="panel tap" style={{padding:'10px 12px',borderLeft:'3px solid '+tone[r[0]],cursor:'pointer'}}><div className="row between"><span style={{fontSize:12.5,fontWeight:600}}>{r[1]}</span><span className="faint" style={{fontSize:9.5}}>Fix ↗</span></div><div className="faint" style={{fontSize:11,marginTop:3}}>{r[2]}</div></div>))}
      </div>
    </div>
    <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginTop:14}}>
      <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>Layout<span className="rule"/></div>
        <PField l="Type">Entire home / apt · Apartment</PField><PField l="Bedrooms">2 · King + Double</PField><PField l="Bathrooms">2 full</PField><PField l="Sleeps">5</PField><PField l="Size" last>269 sq ft</PField>
      </div>
      <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>Next stays<span className="rule"/></div>
        <table className="tbl"><tbody><tr><td className="tt">Marie L.</td><td className="faint">Jun 1 · 3n</td><td><span className="bdg amber">Turnover</span></td></tr><tr><td className="tt">The Lees</td><td className="faint">Jun 8 · 4n</td><td><span className="bdg gray">Upcoming</span></td></tr></tbody></table>
      </div>
    </div>
  </>);
}

function PIdentity(){
  return (<>
    <div className="panel" style={{marginBottom:14}}><div className="dml" style={{margin:'0 0 6px'}}>Location &amp; details<span className="rule"/></div>
      <PField l="Address" src="guesty">Les Jardins d'Anna 2, Villa 467, Flic en Flac 90502</PField>
      <PField l="Building">Les Jardins d'Anna 2</PField>
      <PField l="Coordinates"><span className="mono">57.380210, -20.265579</span></PField>
      <PField l="Listing type">Entire home / apt</PField>
      <PField l="Property type">Apartment</PField>
      <PField l="Occupancy">5</PField>
      <PField l="Size" last>269.098 sq ft</PField>
    </div>
    <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
      <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>Rooms &amp; beds<span className="rule"/></div>
        <PField l="Bedroom">King bed</PField><PField l="Bedroom">Double bed</PField><PField l="Living room">Sofa bed</PField><PField l="Full bathroom ×2" last>—</PField>
      </div>
      <div className="panel"><div className="dml" style={{margin:'0 0 8px'}}>Amenities <span className="ct">9 / 17</span><span className="rule"/></div>
        <div className="row" style={{gap:6,flexWrap:'wrap'}}>{['A/C','Bed linens','Hair dryer','Hangers','Iron','Kitchen','TV','Washer','Wi-Fi'].map((a,i)=><span key={i} className="aichip">{a}</span>)}<span className="aichip" style={{color:'var(--tx-3)'}}>+8 more</span></div>
      </div>
    </div>
  </>);
}

function POwner(){
  return (<>
    <div className="panel" style={{marginBottom:14}}><div className="dml" style={{margin:'0 0 6px'}}>Property owner<span className="rule"/></div>
      <div className="row between" style={{padding:'4px 2px'}}><div className="row" style={{gap:11}}><span className="av1" style={{width:34,height:34,fontSize:11}}>MM</span><div><div style={{fontWeight:600,fontSize:13.5}}>Mootealoo Moorghen</div><div className="faint" style={{fontSize:11}}>Owner · 1 property</div></div></div><span className="bdg indigo">100% share</span></div>
    </div>
    <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
      <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>License &amp; regulations<span className="rule"/></div><PField l="Licence number">Not defined</PField><PField l="Jurisdiction" last>Rivière Noire District</PField></div>
      <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>Owner reporting<span className="rule"/></div>
        <div className="rdflag"><span>Email property reports</span><span className="bdg green dot">On</span></div>
        <div className="rdflag"><span>Tasks &amp; scheduling</span><span className="faint">All tasks</span></div>
        <div className="rdflag" style={{borderBottom:'none'}}><span>Next statement</span><span className="faint mono" style={{fontSize:11}}>May 3</span></div>
        <button className="dbtn ghost sm" style={{width:'100%',marginTop:10}}>Send report now</button>
      </div>
    </div>
  </>);
}

function POperational(){
  return (<>
    <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
      <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>Access <span className="bdg gray">audit-logged</span><span className="rule"/></div>
        <PField l="Guest code" src="breezeway">Show on day of check-in · <span className="mono">1031</span></PField>
        <PField l="Wi-Fi">HUAWEI_B612_BAB6</PField>
        <PField l="Wi-Fi password" src="breezeway"><span className="mono">Y7HDNRD15ED</span></PField>
        <PField l="Team internal code" last><span className="mono">1031</span></PField>
      </div>
      <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>Supplies<span className="rule"/></div>
        <PField l="Inventory location">Inventory Location</PField>
        <PField l="Below par"><span className="bdg amber">Bath towels · 4/12</span></PField>
        <PField l="Guide link" last><a className="dlink">guide.breezeway.io/dHdZH</a></PField>
      </div>
    </div>
    <div className="panel" style={{marginBottom:14}}><div className="dml" style={{margin:'0 0 6px'}}>On-site guide<span className="rule"/></div>
      <PField l="Parking">Street + courtyard (1 car) · not inside property</PField>
      <PField l="Waste">Kitchen bin · large waste front-of-door right</PField>
      <PField l="Utilities">Hot water via solar system</PField>
      <PField l="Entry" last>Main gate → security post (Villa 467) → BS Villa gate → first door right · lockbox beside</PField>
    </div>
    <div className="panel"><div className="dml" style={{margin:'0 0 8px'}}>Department defaults<span className="rule"/></div>
      <div className="rdflag"><span className="row" style={{gap:8}}><DI n="ops" s={1.6}/> Cleaning</span><span className="faint">Oracle Cleaning Ltd</span></div>
      <div className="rdflag"><span className="row" style={{gap:8}}><DI n="check" s={1.6}/> Inspection</span><span className="faint">Alex Legentil</span></div>
      <div className="rdflag" style={{borderBottom:'none'}}><span className="row" style={{gap:8}}><DI n="gear" s={1.6}/> Maintenance</span><span className="faint">Bryan Henri</span></div>
    </div>
  </>);
}

function PFinancial(){
  return (<>
    <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
      <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>Base price &amp; fees<span className="rule"/></div>
        <PField l="Weekday base" src="guesty">€55</PField><PField l="Weekend base">Not defined</PField><PField l="Cleaning fee" src="guesty">€55 / stay</PField><PField l="Extra person">€7 / night (from 1st)</PField><PField l="Rate strategy" last>MPS · 1-night min gap</PField>
      </div>
      <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>Discounts &amp; commission<span className="rule"/></div>
        <PField l="Weekly discount">15%</PField><PField l="Monthly discount">30%</PField><PField l="Commission">net_income / 1.15</PField><PField l="Owner's revenue">net_income − PM commission</PField><PField l="Commission tax" last>15%</PField>
      </div>
    </div>
    <div className="panel" style={{marginTop:14}}><div className="dml" style={{margin:'0 0 6px'}}>Markup / markdown per channel<span className="rule"/></div>
      <div className="rdflag"><span className="row" style={{gap:8}}><span className="mdot" style={{background:'#e08e89',width:8,height:8,borderRadius:3}}/>Airbnb</span><span>+5% accommodation fare</span></div>
      <div className="rdflag"><span className="row" style={{gap:8}}><span className="mdot" style={{background:'#9fb4ee',width:8,height:8,borderRadius:3}}/>Booking.com</span><span>+15%</span></div>
      <div className="rdflag" style={{borderBottom:'none'}}><span className="row" style={{gap:8}}><span className="mdot" style={{background:'#6cc79c',width:8,height:8,borderRadius:3}}/>Direct</span><span>+0%</span></div>
      <div className="faint mono" style={{fontSize:10,marginTop:8}}>Tourist Tax €1.00 / stay · Currency EUR</div>
    </div>
  </>);
}

function PCalendar(){
  const N=14, pct=c=>c/N*100;
  const days=Array.from({length:N},(_,i)=>{const d=1+i;return ['MTWTFSS'[(i+3)%7],d];});
  const bars=[['air',0,3,'Marie L.'],['book',4,4,'Berg'],['dir',9,4,'The Lees']];
  return (<div className="panel" style={{overflowX:'auto'}}>
    <div className="row between" style={{marginBottom:10}}><div className="dml" style={{margin:0}}>June 2026<span className="rule"/></div><span className="row" style={{gap:12,fontSize:10.5}}><span className="row" style={{gap:5}}><span className="mdot" style={{background:'#e08e89',width:8,height:8,borderRadius:3}}/>Airbnb</span><span className="row" style={{gap:5}}><span className="mdot" style={{background:'#9fb4ee',width:8,height:8,borderRadius:3}}/>Booking</span><span className="row" style={{gap:5}}><span className="mdot" style={{background:'#6cc79c',width:8,height:8,borderRadius:3}}/>Direct</span></span></div>
    <div style={{minWidth:760}}>
      <div className="mcalbar-h"><div style={{flex:1,display:'grid',gridTemplateColumns:'repeat(14,1fr)'}}>{days.map((d,i)=><div key={i} className={"mcal-dh"+((i+3)%7>4?' wknd':'')}>{d[0]}<b>{d[1]}</b></div>)}</div></div>
      <div className="mcaltrack" style={{height:54,minWidth:760}}>
        {Array.from({length:13},(_,g)=><span key={g} className="gl" style={{left:pct(g+1)+'%'}}/>)}
        {bars.map((b,j)=><div key={j} className={"mcalbar "+b[0]} style={{top:12,left:'calc('+pct(b[1])+'% + 2px)',width:'calc('+pct(b[2])+'% - 4px)'}}>{b[3]}</div>)}
      </div>
    </div>
    <div className="faint mono" style={{fontSize:10,marginTop:8}}>Reservation bands synced from Guesty · turnovers scheduled between stays</div>
  </div>);
}

function PListings(){
  return (<>
    <div className="panel" style={{marginBottom:14}}><div className="dml" style={{margin:'0 0 6px'}}>Channel status<span className="rule"/></div>
      <div className="rdflag"><span className="row" style={{gap:8}}><span className="mdot" style={{background:'#e08e89',width:9,height:9,borderRadius:3}}/>Airbnb</span><span className="bdg green dot">Listed</span></div>
      <div className="rdflag"><span className="row" style={{gap:8}}><span className="mdot" style={{background:'#9fb4ee',width:9,height:9,borderRadius:3}}/>Booking.com</span><span className="bdg amber dot">Connected · unlisted</span></div>
      <div className="rdflag" style={{borderBottom:'none'}}><span className="row" style={{gap:8}}><span className="mdot" style={{background:'#6cc79c',width:9,height:9,borderRadius:3}}/>Direct · friday.guestybookings.com</span><span className="bdg green dot">Live</span></div>
    </div>
    <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
      <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>Languages &amp; descriptions<span className="rule"/></div><PField l="Active languages">English · French</PField><PField l="Primary description">Set</PField><PField l="Booking.com desc" last><span className="bdg amber">Missing</span></PField></div>
      <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>Integration IDs<span className="rule"/></div><PField l="Airbnb"><span className="mono" style={{fontSize:10}}>1095557191807894198</span></PField><PField l="Guesty"><span className="mono" style={{fontSize:10}}>674d64e6eadd0400…</span></PField><PField l="Unlisting schedule" last>None</PField></div>
    </div>
  </>);
}

function PMaintenance(){
  const open=[['Pool pump — recurring fault','urgent','Bryan H.','Recurring · 3rd in 60d','red'],['A/C not cooling — master','high','Matthieu D.','Reported 2d ago','amber']];
  const log=[['Deep clean — turnover','Ishant A.','30 May','done','Rs 0'],['Pump breaker reset','Bryan H.','24 May','done','Rs 0'],['Replaced 2 LED bulbs','Bryan H.','18 May','done','Rs 140'],['Anti-odor valve install','Matthieu D.','12 May','done','Rs 600'],['Quarterly inspection','Catherine A.','2 May','done','Rs 0']];
  return (<>
    <div className="grid4">
      <div className="statc red"><div className="n">2</div><div className="l">Open issues</div></div>
      <div className="statc amber"><div className="n">3</div><div className="l">Recurring · 60d</div><div className="d">pump fault</div></div>
      <div className="statc"><div className="n">38</div><div className="l">Jobs · YTD</div></div>
      <div className="statc"><div className="n">Rs 14.2k</div><div className="l">Maint. spend · YTD</div></div>
    </div>
    <div className="gate" style={{borderStyle:'solid',margin:'13px 0'}}><span style={{color:'var(--indigo-bright)',marginTop:1}}><DI n="spark" s={1.8}/></span><span><b>Friday.</b> The pool pump has faulted <b>3× in 60 days</b> — a reactive fix each time. A preventive service (~Rs 3,500) would likely cost less than the next two call-outs. Want me to draft a task &amp; owner approval?</span></div>
    <div className="dml">Open issues <span className="ct">2</span><span className="rule"/></div>
    <div style={{display:'flex',flexDirection:'column',gap:9,marginBottom:14}}>
      {open.map((o,i)=>(<div key={i} className="panel tap" style={{padding:'11px 13px',borderLeft:'3px solid var(--'+o[4]+')',cursor:'pointer'}} onClick={()=>window.FADGO('approvals')}>
        <div className="row between"><span className="row" style={{gap:8}}><PriD level={o[1]}/><span className="tt" style={{fontSize:13.5}}>{o[0]}</span></span><span className="faint mono" style={{fontSize:10}}>{o[3]}</span></div>
        <div className="faint" style={{fontSize:11.5,marginTop:5}}>Assigned to {o[2]}</div>
      </div>))}
    </div>
    <div className="panel" style={{padding:'12px 6px'}}>
      <div className="dml" style={{margin:'2px 12px 6px'}}>Maintenance &amp; task history <span className="ct">{log.length}</span><span className="rule"/></div>
      <table className="tbl"><thead><tr><th>Job</th><th>By</th><th>Date</th><th>Status</th><th style={{textAlign:'right'}}>Cost</th></tr></thead>
        <tbody>{log.map((r,i)=>(<tr key={i} className="tdrow"><td className="tt">{r[0]}</td><td className="faint">{r[1]}</td><td className="mono faint">{r[2]}</td><td><span className="bdg green dot">{r[3]}</span></td><td className="mono" style={{textAlign:'right'}}>{r[4]}</td></tr>))}</tbody>
      </table>
    </div>
  </>);
}

function PReviews(){
  const dist=[[5,18],[4,4],[3,1],[2,0],[1,0]],max=18;
  const items=[['Marie L.','air','#e08e89',5,'Spotless on arrival — best-cleaned villa we’ve stayed in.','Ishant A.','2d ago'],['Tomás R.','dir','#6cc79c',4,'Lovely and clean, smooth check-in. Wifi dropped a couple of times.','Catherine A.','1wk ago'],['James O.','book','#9fb4ee',5,'Water issue fixed within the hour — super responsive team.','Bryan H.','3wk ago']];
  return (<>
    <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:14,alignItems:'start'}}>
      <div className="panel" style={{textAlign:'center',padding:'18px 13px'}}>
        <div style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:42,lineHeight:1,color:'#f3f6fb'}}>4.8</div>
        <div className="mono" style={{color:'var(--amber)',fontSize:15,margin:'7px 0 3px'}}>★★★★★</div>
        <div className="faint" style={{fontSize:11}}>23 reviews · this unit</div>
      </div>
      <div className="panel">
        <div className="dml" style={{margin:'0 0 10px'}}>Rating breakdown<span className="rule"/></div>
        {dist.map((d,i)=>(<div key={i} className="row" style={{gap:10,marginBottom:7}}><span className="mono faint" style={{width:24,fontSize:11}}>{d[0]}★</span><span style={{flex:1,height:7,borderRadius:4,background:'var(--card-2)',overflow:'hidden'}}><i style={{display:'block',height:'100%',width:(d[1]/max*100)+'%',background:d[0]>=4?'var(--green)':d[0]===3?'var(--tx-3)':'var(--red)',borderRadius:4}}/></span><span className="mono faint" style={{width:22,textAlign:'right',fontSize:11}}>{d[1]}</span></div>))}
      </div>
    </div>
    <div className="dml" style={{marginTop:14}}>Recent reviews <span className="ct">{items.length}</span><span className="rule"/></div>
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {items.map((r,i)=>(<div key={i} className="panel" style={{padding:'13px 15px'}}>
        <div className="between"><span className="row" style={{gap:9}}><span className="av1" style={{width:30,height:30,fontSize:10}}>{r[0].split(' ').map(x=>x[0]).join('')}</span><span><span className="tt" style={{fontSize:13.5}}>{r[0]}</span><span className="row" style={{gap:5,marginTop:2,fontSize:10.5}}><span className="mdot" style={{background:r[2],width:7,height:7,borderRadius:2}}/>{r[1]==='air'?'Airbnb':r[1]==='book'?'Booking':'Direct'}</span></span></span><span className="mono" style={{color:'var(--amber)'}}>{'★'.repeat(r[3])}<span style={{color:'var(--tx-4)'}}>{'★'.repeat(5-r[3])}</span></span></div>
        <div style={{fontSize:13,lineHeight:1.55,marginTop:9}}>“{r[4]}”</div>
        <div className="row between" style={{marginTop:9,paddingTop:9,borderTop:'1px solid var(--line-2)'}}><span className="faint" style={{fontSize:11}}>Turnover by <b style={{color:'var(--tx-2)'}}>{r[5]}</b> · {r[6]}</span><a className="dlink" style={{fontSize:11.5}}>View reply</a></div>
      </div>))}
    </div>
  </>);
}

window.FADPROP = { ScreenProperty };