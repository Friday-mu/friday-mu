/* FAD V2 — Reviews module (Reva-style depth): Dashboard · All reviews · Staff · Reports.
   Reuses Shell/DI + existing CSS. window.FADREVIEWS.ScreenReviews */
const { DI: RDI, Shell: RShell } = window.FADD;
const RST = window.FADSTATE || {};
const RT = (t,tone)=>window.fadToast&&window.fadToast(t,tone);
const Stars = ({n,sz=12})=> <span style={{display:'inline-flex',gap:1,color:'var(--amber)'}}>{[1,2,3,4,5].map(i=><svg key={i} viewBox="0 0 24 24" width={sz} height={sz} fill={i<=n?'currentColor':'none'} stroke="currentColor" strokeWidth="1.6"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z"/></svg>)}</span>;
const SUB=['Accuracy','Check-in','Cleanliness','Communication','Location','Value'];

const REVIEWS=[
  {av:'SD',unit:'SD-10',date:'Apr 24, 2026',stars:5,ch:['Airbnb','#e08e89'],tags:[['Great location','green'],['FF&E','amber']],txt:'Great spot but the AC stopped cooling on the second night — bathrooms also need reconditioning, inspect vents & seals.',sub:[5,5,4,5,5,4],priv:'Salut! In apartment era un miros foarte urat de care nu am putut scapa.',pub:true},
  {av:'RC',unit:'RC-15',date:'Apr 19, 2026',stars:5,ch:['Airbnb','#e08e89'],tags:[['Manager Communication','green'],['Great location','green'],['Hot Water','red']],txt:'The apartment was great, spotless and obviously new. Balcony larger than expected. Low water pressure on the hot feed was frustrating, but communication was great and proactive. Would recommend.',sub:[5,5,5,5,5,5],priv:'A few coathangers would be helpful! Fingers crossed the hot water is an easy fix.',pub:true},
  {av:'RC',unit:'RC-16',date:'Apr 13, 2026',stars:5,ch:['Airbnb','#e08e89'],tags:[['View','green'],['Manager Communication','green']],txt:'Loved my stay at the penthouse in Flic-en-Flac. Ocean view was perfect, host very responsive when we faced a drainage issue.',sub:[5,5,5,5,5,5],priv:'',pub:true},
  {av:'GB',unit:'GBH-C8',date:'Apr 8, 2026',stars:3,ch:['Booking','#9fb4ee'],tags:[['Cleanliness','red'],['Odor','red']],txt:'Rotten food left in microwave, smelly linens and a persistent cigarette smoke odor. Needs a deep clean and odor remediation.',sub:[4,4,2,3,5,3],priv:'Very disappointed with the cleaning standard on arrival.',pub:false},
  {av:'VA',unit:'VA-4',date:'Apr 2, 2026',stars:5,ch:['Direct','#6cc79c'],tags:[['Well Equipped','green']],txt:'Beautiful, well-equipped and easy check-in. Will be back!',sub:[5,5,5,5,5,5],priv:'',pub:true},
];
const COHORTS=[['Flic en Flac','4.53','5.00','4.89','5.00','4.78','4.68',1],['Grand Baie','4.50','4.75','4.25','—','4.50','4.56',1]];
const SUGGEST=[
  {t:'Investigate persistent odor · SD-10',d:'Guest reported a bad smell + bathrooms need reconditioning — inspect vents, drains & seals.',ch:'air',unit:'SD-10'},
  {t:'Deep-clean & remove cigarette odor · GBH-C8',d:'Rotten food, moldy bathroom, smoke odor — deep clean, launder linens, odor remediation.',ch:'book',unit:'GBH-C8'},
  {t:'Fix low hot-water pressure · RC-15',d:'Recurring in 2 reviews — book a plumber before next arrival.',ch:'air',unit:'RC-15'},
];

function ScreenReviews(){
  const [tab,setTab]=React.useState('dash');
  const tabs=[['dash','Dashboard'],['all','All reviews'],['staff','Staff performance'],['reports','Reports']];
  return (
    <RShell active="rev" eyebrow="REVIEWS" title="Reviews" sub="Ratings, replies & guest sentiment across every channel"
      actions={<><button className="dbtn ghost" onClick={()=>RT('Embed code copied — paste it on your website')}><RDI n="dlink" s={1.8}/> Embed</button><button className="dbtn ghost" onClick={()=>RT('Exported CSV')}><RDI n="doc" s={1.8}/> CSV</button><button className="dbtn primary" onClick={()=>RT('RevaBot drafting replies…')}><RDI n="spark" s={1.7}/> Friday replies</button></>}>
      <div className="dtabs" style={{marginTop:2}}>{tabs.map(t=><span key={t[0]} className={"dtab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}</span>)}</div>
      {tab==='dash' && <RevDash/>}
      {tab==='all' && <RevAll/>}
      {tab==='staff' && <RevStaff/>}
      {tab==='reports' && <RevReports/>}
    </RShell>
  );
}

function RevDash(){
  const [range,setRange]=React.useState('year');
  const dist=[[5,85],[4,8],[3,6],[2,2],[1,0]];
  return (<>
    <div className="grid3" style={{alignItems:'stretch'}}>
      {/* avg rating */}
      <div className="panel">
        <div className="row between"><span className="dml" style={{margin:0}}>Avg. rating · 2026<span className="rule"/></span><span className="vseg" style={{marginLeft:8}}><span className={"vs"+(range==='year'?' on':'')} onClick={()=>setRange('year')}>Year</span><span className={"vs"+(range==='month'?' on':'')} onClick={()=>setRange('month')}>Month</span></span></div>
        <div className="row" style={{gap:12,alignItems:'flex-end',margin:'10px 0 4px'}}><span style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:42,lineHeight:1,color:'#f3f6fb'}}>{range==='year'?'4.75':'4.82'}</span><span className="faint" style={{fontSize:12,marginBottom:6}}>out of 5</span><span className="grow" style={{flex:1}}/><Stars n={5} sz={16}/></div>
        <div className="row between" style={{fontSize:11.5}}><span style={{color:'var(--green)'}}>▲ 1.8% vs 2025</span><span className="faint">{range==='year'?'65':'12'} reviews</span></div>
        <div style={{marginTop:12}}>{dist.map((d,i)=>(<div key={i} className="row" style={{gap:9,marginBottom:6}}><span className="mono faint" style={{width:34,fontSize:11}}>{d[0]} ★</span><span style={{flex:1,height:8,borderRadius:4,background:'var(--card-2)',overflow:'hidden'}}><i style={{display:'block',height:'100%',width:d[1]+'%',background:d[0]>=4?'var(--indigo)':d[0]===3?'var(--amber)':'var(--red)',borderRadius:4}}/></span><span className="mono faint" style={{width:30,textAlign:'right',fontSize:11}}>{d[1]}%</span></div>))}</div>
      </div>
      {/* suggested actions */}
      <div className="panel">
        <div className="row between"><span className="dml" style={{margin:0}}>Suggested actions <span className="bdg indigo"><RDI n="spark" s={1.4}/> AI</span><span className="rule"/></span></div>
        <div style={{display:'flex',flexDirection:'column',gap:9,marginTop:10}}>
          {SUGGEST.map((s,i)=>(<div key={i} className="panel tap" style={{padding:'10px 11px',cursor:'pointer'}} onClick={()=>window.FADGO('approvals')}>
            <div className="row between"><span className="tt" style={{fontSize:12.5}}>{s.t}</span><RDI n="chevR" s={2} style={{color:'var(--tx-3)'}}/></div>
            <div className="faint" style={{fontSize:11,marginTop:4,lineHeight:1.45}}>{s.d}</div>
          </div>))}
        </div>
        <button className="dbtn primary sm" style={{width:'100%',marginTop:11}} onClick={()=>RT('Created 3 tasks from review issues','green')}><RDI n="spark" s={1.6}/> Power through all</button>
      </div>
      {/* latest reviews */}
      <div className="panel">
        <div className="dml" style={{margin:'0 0 8px'}}>Latest reviews<span className="rule"/></div>
        {REVIEWS.slice(0,3).map((r,i)=>(<div key={i} style={{padding:'9px 0',borderBottom:i<2?'1px solid var(--line-2)':'none'}}>
          <div className="row between"><span className="row" style={{gap:7}}><span className="av1" style={{width:24,height:24,fontSize:8}}>{r.av}</span><span className="pcodeD">{r.unit}</span></span><span className="row" style={{gap:6}}><Stars n={r.stars}/><span className="mdot" style={{background:r.ch[1],width:8,height:8,borderRadius:3}}/></span></div>
          <div className="faint" style={{fontSize:11.5,marginTop:6,lineHeight:1.5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{r.txt}</div>
        </div>))}
      </div>
    </div>
    {/* cohort table */}
    <div className="dml" style={{marginTop:16}}>Average rating by cohort <span className="rule"/></div>
    <div className="panel" style={{padding:'10px 6px'}}>
      <table className="tbl"><thead><tr><th>Cohort</th><th style={{textAlign:'right'}}>Jan</th><th style={{textAlign:'right'}}>Feb</th><th style={{textAlign:'right'}}>Mar</th><th style={{textAlign:'right'}}>Apr</th><th style={{textAlign:'right'}}>YTD</th><th style={{textAlign:'right'}}>YoY</th></tr></thead>
        <tbody>{COHORTS.map((c,i)=>(<tr key={i}><td className="tt">{c[0]}</td><td className="mono faint" style={{textAlign:'right'}}>{c[1]}</td><td className="mono faint" style={{textAlign:'right'}}>{c[2]}</td><td className="mono faint" style={{textAlign:'right'}}>{c[3]}</td><td style={{textAlign:'right'}}>{c[4]==='—'?<span className="faint">—</span>:<span className="bdg green">▲ {c[4]}</span>}</td><td className="mono" style={{textAlign:'right',fontWeight:600}}>{c[5]}</td><td style={{textAlign:'right'}}><span className="bdg red">▼ {c[6]}</span></td></tr>))}</tbody>
      </table>
    </div>
    {/* channel */}
    <div className="dml" style={{marginTop:16}}>Average rating by channel <span className="rule"/></div>
    <div className="grid3">
      {[['Airbnb','4.8','250','#e08e89'],['Booking.com','4.5','105','#9fb4ee'],['Direct','4.9','38','#6cc79c']].map((c,i)=>(
        <div key={i} className="panel" style={{textAlign:'center',padding:'18px 13px'}}><div style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:34,color:'#f3f6fb'}}>{c[1]}</div><div className="row" style={{gap:6,justifyContent:'center',marginTop:6}}><span className="mdot" style={{background:c[3],width:9,height:9,borderRadius:3}}/><span style={{fontSize:12.5,fontWeight:600}}>{c[0]}</span></div><div className="faint" style={{fontSize:11,marginTop:3}}>{c[2]} reviews</div></div>
      ))}
    </div>
    <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:14,marginTop:16,alignItems:'stretch'}}>
      <div className="panel" style={{display:'flex',flexDirection:'column'}}>
        <div className="dml" style={{margin:'0 0 12px'}}>Reviews by day <span className="rule"/></div>
        <div style={{display:'flex',alignItems:'flex-end',gap:4,flex:1,minHeight:110}}>
          {[[3,1,0],[2,0,0],[4,1,0],[1,0,0],[3,1,1],[5,0,0],[2,1,0],[4,0,0],[1,1,0],[3,0,0],[2,1,1],[4,1,0],[3,0,0],[5,1,0]].map((d,i)=>{const tot=d[0]+d[1]+d[2];const h=tot/6*100;return (<div key={i} style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'flex-end',height:'100%'}} title={tot+' reviews'}><div style={{height:h+'%',display:'flex',flexDirection:'column',borderRadius:'3px 3px 0 0',overflow:'hidden'}}>{d[2]>0&&<i style={{flex:d[2],background:'var(--red)'}}/>}{d[1]>0&&<i style={{flex:d[1],background:'var(--amber)'}}/>}{d[0]>0&&<i style={{flex:d[0],background:'var(--indigo)'}}/>}</div></div>);})}
        </div>
        <div className="row" style={{gap:14,marginTop:10,fontSize:10.5,color:'var(--tx-2)'}}><span className="row" style={{gap:5}}><span className="mdot" style={{background:'var(--indigo)',width:8,height:8,borderRadius:2}}/>5★</span><span className="row" style={{gap:5}}><span className="mdot" style={{background:'var(--amber)',width:8,height:8,borderRadius:2}}/>4★</span><span className="row" style={{gap:5}}><span className="mdot" style={{background:'var(--red)',width:8,height:8,borderRadius:2}}/>≤3★</span><span className="grow" style={{flex:1}}/><span className="faint mono">last 14 days</span></div>
      </div>
      <div className="panel">
        <div className="dml" style={{margin:'0 0 10px'}}>Trending themes <span className="bdg indigo"><RDI n="spark" s={1.4}/> auto-tagged</span><span className="rule"/></div>
        {[['Great location','green','▲',42],['Manager communication','green','▲',31],['View','green','▲',18],['Hot water','red','↑',7],['Odor / cleanliness','red','↑',4]].map((t,i)=>(<div key={i} className="row between" style={{padding:'7px 0',borderBottom:i<4?'1px solid var(--line-2)':'none'}}><span className="row" style={{gap:8}}><span className={"bdg "+t[1]}>{t[0]}</span></span><span className="row" style={{gap:10}}><span className="mono faint" style={{fontSize:11}}>{t[3]}</span><span style={{fontSize:11,color:t[1]==='red'?'var(--red)':'var(--green)'}}>{t[2]}</span></span></div>))}
        <div className="gate" style={{borderStyle:'solid',marginTop:10}}><RDI n="spark" s={1.6} style={{color:'var(--indigo-bright)',flex:'0 0 auto'}}/><span><b>Friday:</b> “hot water” is up across RC units — likely the same pressure fault. Want a grouped maintenance task?</span></div>
      </div>
    </div>
    <div className="dml" style={{marginTop:16}}>Website widget <span className="rule"/></div>
    <div className="panel" style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
      <div style={{flex:'0 0 auto',background:'#fff',borderRadius:12,padding:'14px 18px',color:'#1a2230',textAlign:'center',minWidth:180}}><div style={{fontFamily:'var(--serif)',fontWeight:300,fontSize:30,color:'#1a2230'}}>4.75</div><div style={{color:'var(--amber)',fontSize:15}}>★★★★★</div><div style={{fontSize:11,color:'#6b7688',marginTop:3}}>355 guest reviews</div><div style={{fontSize:8.5,color:'#aeb8c8,#9aa6bb',marginTop:6,letterSpacing:'.06em'}}>POWERED BY FRIDAYOS</div></div>
      <div style={{flex:1,minWidth:220}}><div style={{fontWeight:600,fontSize:13}}>Embed your reviews anywhere</div><div className="faint" style={{fontSize:11.5,marginTop:4,lineHeight:1.5}}>Drop a live, auto-updating reviews badge on your direct-booking site. Only published reviews show.</div><div className="row" style={{gap:7,marginTop:10}}><button className="dbtn primary sm" onClick={()=>RT('Embed code copied')}><RDI n="dlink" s={1.7}/> Copy embed code</button><button className="dbtn ghost sm" onClick={()=>RT('Opened widget styler')}>Customize</button></div></div>
    </div>
  </>);
}

function RevAll(){
  const [seg,setSeg]=React.useState('all');
  const [pub,setPub]=React.useState(()=>REVIEWS.map(r=>r.pub));
  const segs=[['all','All'],['low','Low (≤3)'],['unrep','Needs reply'],['air','Airbnb'],['book','Booking']];
  const shown=REVIEWS.filter(r=> seg==='all' || (seg==='low'?r.stars<=3 : seg==='unrep'?r.stars<=3 : seg==='air'?r.ch[0]==='Airbnb' : r.ch[0]==='Booking'));
  return (<>
    <div className="panel" style={{padding:'11px 14px',marginTop:6}}>
      <div className="row" style={{gap:9,flexWrap:'wrap'}}>
        {['Dates','Rating','Channel','Unit','Cohort'].map((f,i)=><span key={i} className="aichip" style={{cursor:'pointer'}}>{f} <RDI n="chevD" s={2} style={{width:11,height:11}}/></span>)}
        <span className="grow" style={{flex:1}}/><button className="dbtn primary sm" onClick={()=>RT('Filtered')}><RDI n="search" s={1.7}/> Search</button>
      </div>
    </div>
    <div className="grid3" style={{marginTop:13}}>
      <div className="statc"><div className="n">355</div><div className="l">Reviews</div></div>
      <div className="statc"><div className="n">4.72</div><div className="l">Average rating</div></div>
      <div className="statc amber"><div className="n">13.2%</div><div className="l">Reply rate</div><div className="d">below target — Friday can fix</div></div>
    </div>
    <div className="row between" style={{margin:'16px 0 8px'}}>
      <span className="vseg">{segs.map(s=><span key={s[0]} className={"vs"+(seg===s[0]?' on':'')} onClick={()=>setSeg(s[0])}>{s[1]}</span>)}</span>
      <span className="faint mono" style={{fontSize:10}}>{shown.length} shown</span>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {shown.map((r,i)=>{const gi=REVIEWS.indexOf(r);return (
        <div key={i} className="panel" style={{padding:'13px 15px'}}>
          <div className="between" style={{alignItems:'flex-start',gap:14}}>
            <div className="row" style={{gap:11,minWidth:0,flex:1}}>
              <span className="av1" style={{flex:'0 0 30px'}}>{r.av}</span>
              <div style={{minWidth:0,flex:1}}>
                <div className="row" style={{gap:8,flexWrap:'wrap'}}><span className="pcodeD">{r.unit}</span><Stars n={r.stars}/><span className="row" style={{gap:5,fontSize:11.5}}><span className="mdot" style={{background:r.ch[1],width:8,height:8,borderRadius:3}}/>{r.ch[0]}</span><span className="faint mono" style={{fontSize:10}}>{r.date}</span></div>
                <div className="row" style={{gap:5,marginTop:7,flexWrap:'wrap'}}>{r.tags.map((t,k)=><span key={k} className={"bdg "+t[1]}>{t[0]}</span>)}</div>
                <div style={{fontSize:13,lineHeight:1.55,marginTop:8}}>{r.txt}</div>
                <div className="row" style={{gap:7,flexWrap:'wrap',marginTop:9}}>{SUB.map((s,k)=><span key={k} className="aichip" style={{fontSize:10}}>{s}: <b style={{marginLeft:3,color:r.sub[k]>=4?'var(--green)':r.sub[k]===3?'var(--amber)':'var(--red)'}}>{r.sub[k]}</b></span>)}</div>
                {r.priv && <div className="gate" style={{borderStyle:'solid',marginTop:9}}><RDI n="msg" s={1.6} style={{color:'var(--indigo-bright)',flex:'0 0 auto'}}/><span><b>Private feedback:</b> {r.priv}</span></div>}
              </div>
            </div>
            <div style={{flex:'0 0 auto',display:'flex',flexDirection:'column',alignItems:'flex-end',gap:9}}>
              <span className="row" style={{gap:7,fontSize:10.5}}><span className="faint">Published</span><span className={"tgl"+(pub[gi]?' on':'')} onClick={()=>setPub(p=>p.map((x,k)=>k===gi?!x:x))} style={{cursor:'pointer'}}><span className="knob"/></span></span>
              <span className="row" style={{gap:5}}>
                <span className="ib-act" title="Reply" onClick={()=>RT('Friday drafted a reply')}><RDI n="undo" s={1.7}/></span>
                <span className="ib-act" title="Save" onClick={()=>RT('Saved')}><RDI n="bookmark" s={1.7}/></span>
                <span className="ib-act" title="Share" onClick={()=>RT('Share link copied')}><RDI n="dlink" s={1.7}/></span>
              </span>
            </div>
          </div>
        </div>
      );})}
    </div>
  </>);
}

function RevStaff(){
  const staff=[['IA','Ishant Ayadassen','Field · West',23,4.8,'+0.2','fast maintenance'],['BR','Bryan Ramluckun','Field · North',19,4.6,'+0.1','spotless turnovers'],['CA','Catherine Appadoo','Field · North',17,4.9,'+0.3','warm welcome'],['MD','Mathias Duval','Field · North',11,4.4,'−0.1','thorough']];
  return (<>
    <div className="fbar" style={{marginTop:6}}><span className="fi"><RDI n="spark" s={1.6}/></span><span className="ft"><b>Friday.</b> Reviews are attributed to whoever did the turnover or maintenance on that stay. Catherine leads at 4.9; Mathias dipped 0.1 — worth a check-in.</span></div>
    <div className="panel" style={{padding:'10px 6px',marginTop:14}}>
      <table className="tbl"><thead><tr><th>Staff</th><th>Role</th><th style={{textAlign:'right'}}>Reviews</th><th style={{textAlign:'right'}}>Avg</th><th style={{textAlign:'right'}}>Trend</th><th>Guests mention</th></tr></thead>
        <tbody>{staff.map((s,i)=>(<tr key={i} className="tdrow"><td><span className="row" style={{gap:8}}><span className="av1" style={{width:26,height:26,fontSize:9}}>{s[0]}</span><span className="tt">{s[1]}</span></span></td><td className="faint">{s[2]}</td><td className="mono faint" style={{textAlign:'right'}}>{s[3]}</td><td className="mono" style={{textAlign:'right',fontWeight:700,color:s[4]>=4.7?'var(--green)':'var(--amber)'}}>{s[4]} ★</td><td className="mono" style={{textAlign:'right',color:s[5].startsWith('−')?'var(--red)':'var(--green)'}}>{s[5]}</td><td className="faint" style={{fontSize:11.5}}>“{s[6]}”</td></tr>))}</tbody>
      </table>
    </div>
  </>);
}

function RevReports(){
  const [rep,setRep]=React.useState('unrep');
  const reports=[['unrep','Unreplied > 7 days','clock'],['drops','Rating drops by unit','chart'],['source','Reviews by source','star'],['sla','Response-time SLA','clock'],['dup','Doubled-up reviews','doc']];
  return (<>
    <div className="fbar" style={{marginTop:6}}><span className="fi"><RDI n="spark" s={1.6}/></span><span className="ft"><b>Friday.</b> Reply rate is 13% — below the 30% that lifts ranking. <b>11 reviews</b> are past the 7-day window; I drafted replies for all of them.</span><span className="fb"><button className="dbtn sm" onClick={()=>RT('Approved 11 drafted replies','green')}>Approve all</button></span></div>
    <div className="row between" style={{margin:'14px 0 10px',flexWrap:'wrap',gap:8}}>
      <span className="vseg" style={{flexWrap:'wrap'}}>{reports.map(r=><span key={r[0]} className={"vs"+(rep===r[0]?' on':'')} onClick={()=>setRep(r[0])}><RDI n={r[2]} s={1.6}/> {r[1]}</span>)}</span>
      <span className="row" style={{gap:7}}><span className="aichip" style={{cursor:'pointer'}}>Cohort: all <RDI n="chevD" s={2} style={{width:11,height:11}}/></span><button className="dbtn ghost sm" onClick={()=>RT('Exported report CSV')}><RDI n="doc" s={1.7}/> Export</button></span>
    </div>
    {rep==='unrep' && <ReportTable
      head={['Review of','Date','Rating','Channel','Age','']}
      rows={[
        ['SD-10','Apr 24',5,'Airbnb','11 days'],['GBH-C8','Apr 8',3,'Booking','27 days'],['VA-4','Apr 2',5,'Direct','33 days'],['RC-7','Mar 28','4','Airbnb','38 days'],['LB-2','Mar 20',5,'Airbnb','46 days'],
      ].map(r=>({cells:[<span className="pcodeD">{r[0]}</span>, <span className="faint">{r[1]}</span>, <Stars n={+r[2]||5}/>, r[3], <span className="bdg amber">{r[4]}</span>], action:'Draft reply'}))}
      onAction={()=>RT('Friday drafted a reply')}/>}
    {rep==='drops' && <ReportTable
      head={['Unit','Cohort','This period','Last period','Change','']}
      rows={[
        ['GBH-C8','Grand Baie','3.4','4.6','−1.2','red'],['RC-7','Pereybère','4.3','4.8','−0.5','amber'],['BW-C4','Flic en Flac','4.5','4.9','−0.4','amber'],
      ].map(r=>({cells:[<span className="pcodeD">{r[0]}</span>, <span className="faint">{r[1]}</span>, <span className="mono">{r[2]}★</span>, <span className="mono faint">{r[3]}★</span>, <span className="bdg red">▼ {r[4]}</span>], action:'Investigate'}))}
      onAction={()=>window.FADGO('approvals')}/>}
    {rep==='source' && <ReportTable
      head={['Channel','Reviews','Avg rating','Reply rate','5★ share']}
      rows={[
        ['Airbnb','250','4.8','16%','85%'],['Booking.com','105','4.5','9%','71%'],['Direct','38','4.9','34%','92%'],
      ].map(r=>({cells:[r[0], <span className="mono">{r[1]}</span>, <span className="mono" style={{fontWeight:600}}>{r[2]}★</span>, <span className="mono faint">{r[3]}</span>, <span className="mono faint">{r[4]}</span>]}))}/>}
    {rep==='sla' && <>
      <div className="grid3" style={{marginBottom:14}}><div className="statc"><div className="n">2.4 days</div><div className="l">Avg response time</div></div><div className="statc amber"><div className="n">41%</div><div className="l">Within 24h target</div></div><div className="statc red"><div className="n">11</div><div className="l">Breached SLA</div></div></div>
      <ReportTable head={['Unit','Avg response','Within target','']} rows={[['SD-10','3.1 days','no','red'],['RC-15','0.4 days','yes','green'],['GBH-C8','5.2 days','no','red']].map(r=>({cells:[<span className="pcodeD">{r[0]}</span>,<span className="mono faint">{r[1]}</span>,<span className={"bdg "+(r[3]==='green'?'green':'red')+" dot"}>{r[2]}</span>],action:r[3]==='red'?'Reply now':null}))} onAction={()=>RT('Friday drafted a reply')}/>
    </>}
    {rep==='dup' && <div className="panel" style={{textAlign:'center',padding:'42px 0',color:'var(--tx-3)'}}><RDI n="check" s={2.6} style={{color:'var(--green)'}}/><div style={{fontSize:13,marginTop:8}}>No reservations with doubled-up reviews</div><div className="faint" style={{fontSize:11.5,marginTop:3}}>Friday de-dupes Airbnb + Booking reviews for the same stay automatically.</div></div>}
  </>);
}
function ReportTable({head,rows,onAction}){
  return (
    <div className="panel" style={{padding:'12px 6px'}}>
      <table className="tbl"><thead><tr>{head.map((h,i)=><th key={i} style={i>0&&i<head.length-1?{textAlign:'left'}:null}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r,i)=>(<tr key={i} className="tdrow">{r.cells.map((c,k)=><td key={k}>{c}</td>)}{('action' in r)&&<td style={{textAlign:'right'}}>{r.action?<button className="dbtn ghost sm" onClick={onAction}>{r.action}</button>:<span className="faint">—</span>}</td>}</tr>))}</tbody>
      </table>
    </div>
  );
}

window.FADREVIEWS = { ScreenReviews };
