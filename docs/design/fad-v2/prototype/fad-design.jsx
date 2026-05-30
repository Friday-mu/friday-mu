/* FAD V2 — Design (Interiors) module. Friday's paid interior-design service.
   Business unit, dark FAD skin. 17-stage project pipeline, workbench, budget,
   procurement, owner review, reconciliation, vendors, analytics, owner portal.
   Reuses Shell + fad-desktop.css + fad-states.jsx. Exports window.FADDESIGN. */
const { DI, Shell } = window.FADD;
const DFMT = n => 'Rs '+Math.round(n).toLocaleString('en-US');
const DM = n => n>=1e6 ? 'Rs '+(n/1e6).toFixed(1)+'M' : n>=1e3 ? 'Rs '+(n/1e3).toFixed(0)+'k' : 'Rs '+n;
const _dh = ()=> (window.FADSTATE&&window.FADSTATE.useHealth) ? window.FADSTATE.useHealth() : 'healthy';

/* 17-stage pipeline */
const STAGES = ['Lead','Brief','Site survey','Concept','Concept approval','Detailed design','Budget','Budget approval','Procurement','Deposit/funding','Ordering','Delivery','Install','Styling','Owner review','Reconciliation','Handover'];
const APPROVAL_STAGES = [4,7,14]; // 0-indexed: Concept approval, Budget approval, Owner review

const PROJECTS = [
  {id:'DZ-1', name:'GBH-B4 · Full refresh', prop:'GBH-B4', owner:'Harrington, D.', tier:'Signature', stageIdx:8, status:'active', budget:1240000, actual:760000, funding:'deposit', approval:'pending', blocker:null, next:'Chase 2 vendor quotes', updated:'2h', margin:22},
  {id:'DZ-2', name:'SD-10 · Master suite', prop:'SD-10', owner:'Nitzana Holdings', tier:'Bespoke', stageIdx:11, status:'blocked', budget:2850000, actual:2210000, funding:'funded', approval:'approved', blocker:'Sofa delivery delayed 3wk (vendor)', next:'Escalate vendor / source alt', updated:'1d', margin:19},
  {id:'DZ-3', name:'RC-7 · Living + kitchen', prop:'RC-7', owner:'Harrington, D.', tier:'Essential', stageIdx:4, status:'active', budget:540000, actual:0, funding:'unfunded', approval:'changes', blocker:null, next:'Revise concept (R2) per owner', updated:'4h', margin:24},
  {id:'DZ-4', name:'VA-3 · Studio styling', prop:'VA-3', owner:'Chen, Y.', tier:'Essential', stageIdx:14, status:'active', budget:180000, actual:171000, funding:'funded', approval:'pending', blocker:null, next:'Owner review of final styling', updated:'30m', margin:28},
  {id:'DZ-5', name:'KS-5 · Penthouse fit-out', prop:'KS-5', owner:'Okonkwo, L.', tier:'Bespoke', stageIdx:6, status:'active', budget:3400000, actual:90000, funding:'deposit', approval:'n/a', blocker:null, next:'Finalise budget for approval', updated:'3h', margin:21, overBudget:true},
  {id:'DZ-6', name:'LB-2 · Garden suite', prop:'LB-2', owner:'Beaumont Family', tier:'Signature', stageIdx:16, status:'active', budget:920000, actual:905000, funding:'funded', approval:'approved', blocker:null, next:'Handover checklist', updated:'2d', margin:23},
];
const TIER = {Essential:'gray', Signature:'indigo', Bespoke:'violet'};
const FUND = {unfunded:['red','unfunded'], deposit:['amber','deposit'], funded:['green','funded']};
const APPR = {'n/a':['gray','n/a'], pending:['amber','pending'], approved:['green','approved'], changes:['red','changes req']};
const stageStatus = (p, i) => i<p.stageIdx?'complete' : i===p.stageIdx?(p.status==='blocked'?'blocked':'active') : 'not_started';
const STDOT = {complete:'var(--green)', active:'var(--indigo-bright)', blocked:'var(--red)', on_hold:'var(--amber)', not_started:'var(--tx-4)'};

const VENDORS = [
  {nm:'Atelier Bois', cat:'Joinery · custom', rating:4.8, pos:3, ontime:92, contact:'Reza · 5712 0098'},
  {nm:'Lumière Lighting', cat:'Lighting', rating:4.6, pos:2, ontime:88, contact:'Aisha · 5933 1120'},
  {nm:'SofaWorks Ltd', cat:'Upholstery', rating:3.9, pos:1, ontime:61, contact:'Kris · 5440 7781', flag:'late'},
  {nm:'Tropic Stone', cat:'Surfaces · tiling', rating:4.7, pos:2, ontime:95, contact:'Devi · 5821 3340'},
  {nm:'GreenScape', cat:'Plants · styling', rating:4.9, pos:1, ontime:100, contact:'Marc · 5108 2245'},
];

/* ---------------- module shell ---------------- */
function ScreenDesign(){
  const [tab,setTab]=React.useState('overview');
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const tabs=[['overview','Overview'],['projects','Projects'],['vendors','Vendors'],['analytics','Analytics'],['settings','Settings']];
  return (
    <Shell active="design" eyebrow={<><DI n="home" s={1.6} style={{color:'var(--indigo-bright)'}}/> DESIGN · BUSINESS UNIT</>}
      title="Design studio" sub="Paid interior design · lead → handover · owner-approved"
      actions={<><button className="dbtn ghost" onClick={()=>T('Synced design ledger from Finance')}><DI n="clock" s={1.8}/> Sync ledger</button><button className="dbtn primary" onClick={()=>T('New project — pick a property & owner')}><DI n="plus" s={2}/> New project</button></>}>
      <div className="dtabs" style={{marginTop:2}}>{tabs.map(t=><span key={t[0]} className={"dtab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}</span>)}</div>
      {tab==='overview' && <DzOverview T={T} go={setTab}/>}
      {tab==='projects' && <DzProjects T={T}/>}
      {tab==='vendors' && <DzVendors T={T}/>}
      {tab==='analytics' && <DzAnalytics T={T}/>}
      {tab==='settings' && <DzSettings T={T}/>}
    </Shell>
  );
}

/* A · Overview — exception dashboard */
function DzOverview({T,go}){
  const H=_dh(), FS=window.FADSTATE;
  const active=PROJECTS.filter(p=>p.status!=='complete').length;
  const pending=PROJECTS.filter(p=>p.approval==='pending'||p.approval==='changes').length;
  const blocked=PROJECTS.filter(p=>p.status==='blocked'||p.overBudget).length;
  const attention=[
    ['red','blocked','SD-10 · Master suite','Sofa delivery delayed 3 weeks — install stage blocked. Source an alternative or escalate the vendor.','Open project'],
    ['amber','approval-needed','VA-3 · Studio styling','Final styling is ready for owner review — package shared 30m ago, awaiting approval.','Nudge owner'],
    ['red','vendor-delay','RC-7 · Living + kitchen','Owner requested concept changes (R2). Revise and re-share before the budget stage.','Revise concept'],
    ['amber','payment-needed','GBH-B4 · Full refresh','Procurement is ready but only a deposit is in — Rs 480k balance needed before ordering.','Request funding'],
  ];
  const buckets=[['Lead·Design',2],['Procurement',2],['Install',1],['Closeout',1]];
  return (<>
    {FS && <FS.StateBanner surface="Design studio" health={H}/>}
    <div className="grid4">
      <div className="statc"><div className="n">{active}</div><div className="l">Active projects</div></div>
      <div className="statc amber"><div className="n">{pending}</div><div className="l">Owner approval pending</div></div>
      <div className="statc red"><div className="n">{blocked}</div><div className="l">Blocked / at-risk</div></div>
      <div className="statc"><div className="n">23%</div><div className="l">Avg margin · MTD</div></div>
    </div>
    <div className="fai" style={{marginTop:14}}>
      <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday</span><span className="grow"/>{FS&&<FS.ConfBar pct={90} health={H}/>}</div>
      <p><b>4 projects need you</b> — 2 awaiting owner approval, 1 vendor delay on SD-10, and KS-5 is trending over budget. Want me to draft the owner nudges and an alternative-sofa shortlist?</p>
      <div className="acts"><button className="dbtn primary sm" onClick={()=>go('projects')}><DI n="ops" s={1.8}/> Review projects</button><button className="dbtn ghost sm" onClick={()=>T('Drafted owner nudges + vendor shortlist')}>Draft actions</button></div>
      {FS && H!=='healthy' && <div style={{marginTop:10}}><FS.Provenance items={[['coin','design ledger · Finance'],['home','6 properties'],['spark','comparable projects']]} health={H}/></div>}
    </div>
    <div className="dtwocol" style={{marginTop:14,display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:14,alignItems:'start'}}>
      <div className="panel">
        <div className="dml" style={{margin:'0 0 6px'}}>Needs attention <span className="ct">{attention.length}</span><span className="rule"/></div>
        {attention.map((a,i)=>(<div key={i} className="synalert" onClick={()=>window.FADDESIGN.openProject(PROJECTS.find(p=>a[2].startsWith(p.prop))||PROJECTS[0])}>
          <span className="adot" style={{background:'var(--'+a[0]+')'}}/>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:12.5,fontWeight:600}}>{a[2]}</div><div className="faint" style={{fontSize:11,marginTop:2,lineHeight:1.45}}>{a[3]}</div></div>
          <button className="dbtn sm ghost" onClick={e=>{e.stopPropagation();T(a[4]);}}>{a[4]}</button>
        </div>))}
      </div>
      <div className="panel">
        <div className="dml" style={{margin:'0 0 12px'}}>Pipeline <span className="rule"/></div>
        <div className="synbar">{buckets.map((b,i)=><span key={i} className={"seg "+['green','indigo','amber','red'][i]} style={{flex:b[1],background:['var(--green)','var(--indigo)','var(--amber)','var(--violet)'][i]}}>{b[1]}</span>)}</div>
        <div style={{display:'flex',flexDirection:'column',gap:7,marginTop:14}}>
          {buckets.map((b,i)=>(<div key={i} className="row between" style={{fontSize:12}}><span className="row" style={{gap:8}}><span className="mdot" style={{width:8,height:8,borderRadius:3,background:['var(--green)','var(--indigo)','var(--amber)','var(--violet)'][i]}}/>{b[0]}</span><span className="mono faint">{b[1]} projects</span></div>))}
        </div>
      </div>
    </div>
  </>);
}

/* B · Projects table */
function DzProjects({T}){
  const [seg,setSeg]=React.useState('all');
  const segs=[['all','All'],['active','Active'],['blocked','Blocked'],['await','Awaiting owner'],['over','Over budget']];
  const shown=PROJECTS.filter(p=> seg==='all' || (seg==='active'&&p.status==='active') || (seg==='blocked'&&p.status==='blocked') || (seg==='await'&&(p.approval==='pending'||p.approval==='changes')) || (seg==='over'&&p.overBudget));
  return (<>
    <div className="row between" style={{margin:'2px 0 10px'}}>
      <span className="vseg">{segs.map(s=><span key={s[0]} className={"vs"+(seg===s[0]?' on':'')} onClick={()=>setSeg(s[0])}>{s[1]}</span>)}</span>
      <span className="faint mono" style={{fontSize:10}}>{shown.length} of {PROJECTS.length} projects</span>
    </div>
    <div className="panel" style={{padding:'10px 6px'}}>
      <table className="tbl"><thead><tr><th>Project</th><th>Property</th><th>Owner</th><th>Tier</th><th>Stage</th><th style={{textAlign:'right'}}>Budget</th><th>Funding</th><th>Owner appr.</th><th>Next action</th></tr></thead>
        <tbody>{shown.map((p,i)=>(<tr key={i} className="tdrow" onClick={()=>window.FADDESIGN.openProject(p)}>
          <td className="tt" style={{maxWidth:190,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.name}</td>
          <td><span className="pcodeD">{p.prop}</span></td>
          <td className="faint" style={{fontSize:11.5}}>{p.owner}</td>
          <td><span className={"bdg "+TIER[p.tier]}>{p.tier}</span></td>
          <td><span className="row" style={{gap:6}}><span className="mdot" style={{width:7,height:7,borderRadius:2,background:STDOT[stageStatus(p,p.stageIdx)]}}/><span style={{fontSize:11.5}}>{STAGES[p.stageIdx]}</span></span></td>
          <td className="mono" style={{textAlign:'right',fontWeight:600,color:p.overBudget?'var(--red)':'var(--tx)'}}>{DM(p.budget)}</td>
          <td><span className={"bdg "+FUND[p.funding][0]+(p.funding==='funded'?' dot':'')}>{FUND[p.funding][1]}</span></td>
          <td><span className={"bdg "+APPR[p.approval][0]+(p.approval==='approved'?' dot':'')}>{APPR[p.approval][1]}</span></td>
          <td className="faint" style={{fontSize:11}}>{p.blocker?<span style={{color:'var(--red)'}}><DI n="flag" s={1.5} style={{width:11,height:11}}/> {p.blocker.slice(0,26)}…</span>:p.next}</td>
        </tr>))}</tbody>
      </table>
    </div>
  </>);
}

/* C+D · Project detail drawer with stage rail + tabs + workbench */
function ProjectDrawer({ proj, onClose }){
  const H=_dh(), FS=window.FADSTATE;
  const [tab,setTab]=React.useState('summary');
  const [stage,setStage]=React.useState(null); // stage workbench index
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  React.useEffect(()=>{ if(proj){setTab('summary');setStage(null);} },[proj]);
  React.useEffect(()=>{ const k=e=>{if(e.key==='Escape'){stage!=null?setStage(null):onClose();}}; window.addEventListener('keydown',k); return ()=>window.removeEventListener('keydown',k); },[onClose,stage]);
  if(!proj) return null;
  const p=proj;
  const tabs=[['summary','Summary'],['budget','Budget'],['procurement','Procurement'],['review','Owner review'],['recon','Reconciliation']];
  return (<>
    <div className="tdscrim" onClick={onClose}/>
    <aside className="tddrawer" style={{width:760}} role="dialog" aria-label="Design project">
      <div className="tdh">
        <div className="between">
          <div className="row" style={{gap:9,minWidth:0}}><span className="pcodeD">{p.id}</span><span className={"bdg "+TIER[p.tier]}>{p.tier}</span>{FS&&<FS.SyncChip source="Finance ledger" health={H}/>}</div>
          <span className="icbtn" style={{cursor:'pointer'}} onClick={onClose}><DI n="x" s={2}/></span>
        </div>
        <h2 className="tdtitle">{p.name}</h2>
        <div className="row" style={{gap:14,marginTop:8,flexWrap:'wrap'}}>
          <span className="dlink" onClick={()=>{onClose();window.FADGO('property');}}><DI n="home" s={1.6}/> {p.prop}</span>
          <span className="dlink" onClick={()=>{onClose();window.FADGO('own');}}><DI n="owner" s={1.6}/> {p.owner}</span>
          <span className="faint mono" style={{fontSize:10.5}}>updated {p.updated} ago</span>
        </div>
      </div>
      {/* horizontal stage rail */}
      <div className="dz-rail">
        {STAGES.map((s,i)=>{const st=stageStatus(p,i);return (
          <span key={i} className={"dz-stage "+st} onClick={()=>setStage(i)} title={s+(APPROVAL_STAGES.includes(i)?' · owner-approval gate':'')}>
            <span className="dz-dot" style={{background:STDOT[st],borderColor:STDOT[st]}}>{st==='complete'?<DI n="check" s={3}/>:i+1}</span>
            <span className="dz-lbl">{s}</span>
            {APPROVAL_STAGES.includes(i) && <span className="dz-gate" title="owner-approval gate">⚑</span>}
          </span>
        );})}
      </div>
      <div className="tdtabs">{tabs.map(t=><span key={t[0]} className={"tdtab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}</span>)}</div>
      <div className="tdbody">
        {tab==='summary' && <DzSummary p={p} T={T} setStage={setStage}/>}
        {tab==='budget' && <DzBudget p={p} T={T}/>}
        {tab==='procurement' && <DzProcurement p={p} T={T}/>}
        {tab==='review' && <DzReview p={p} T={T}/>}
        {tab==='recon' && <DzRecon p={p} T={T}/>}
      </div>
      {stage!=null && <StageWorkbench p={p} idx={stage} onClose={()=>setStage(null)} T={T}/>}
    </aside>
  </>);
}
function DzSummary({p,T,setStage}){
  const H=_dh(), FS=window.FADSTATE;
  const pctActual=Math.min(100,Math.round(p.actual/p.budget*100));
  return (<>
    <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:16,alignItems:'start'}}>
      <div>
        <div className="dml" style={{marginTop:0}}>Current stage <span className="rule"/></div>
        <div className="panel" style={{padding:'13px 15px'}}>
          <div className="between"><span className="row" style={{gap:8}}><span className="mdot" style={{width:9,height:9,borderRadius:3,background:STDOT[stageStatus(p,p.stageIdx)]}}/><b style={{fontSize:14}}>{STAGES[p.stageIdx]}</b></span><span className={"bdg "+APPR[p.approval][0]}>{APPR[p.approval][1]}</span></div>
          <p style={{fontSize:12.5,color:'var(--tx-2)',margin:'9px 0 0',lineHeight:1.5}}>{p.blocker?<span style={{color:'var(--red)'}}><DI n="flag" s={1.6}/> {p.blocker}</span>:'Next: '+p.next}</p>
          <div className="acts"><button className="dbtn primary sm" onClick={()=>setStage(p.stageIdx)}><DI n="ops" s={1.8}/> Open workbench</button>{p.blocker&&<button className="dbtn ghost sm" onClick={()=>T('Escalated to Inbox')}>Escalate</button>}</div>
        </div>
        <div className="dml">Activity <span className="rule"/></div>
        <div className="tdtimeline">
          {[['FR','Friday','flagged the SofaWorks delay and drafted an alternative shortlist','2h'],['FG','You','shared the concept package R1 with the owner','1d'],['OW',p.owner.split(',')[0],'requested warmer tones in the living room','1d'],['FR','Friday','reconciled 6 receipts against the budget','2d']].map((a,i)=>(
            <div key={i} className="tdact"><span className="av1" style={{width:24,height:24,fontSize:8.5,flex:'0 0 24px',...(a[0]==='FR'?{background:'var(--indigo-ghost)',color:'var(--indigo-bright)',borderColor:'var(--indigo-line)'}:{})}}>{a[0]==='FR'?<DI n="spark" s={1.5}/>:a[0]}</span><div style={{flex:1,minWidth:0}}><div style={{fontSize:12.5,lineHeight:1.45}}><b>{a[1]}</b> {a[2]}</div><div className="faint mono" style={{fontSize:9.5,marginTop:2}}>{a[3]}</div></div></div>
          ))}
        </div>
      </div>
      <div>
        <div className="dml" style={{marginTop:0}}>Financial snapshot <span className="rule"/></div>
        <div className="panel" style={{padding:'13px 15px'}}>
          <div className="between" style={{fontSize:11.5,marginBottom:5}}><span className="faint">Budget vs actual</span><span className="mono">{pctActual}%</span></div>
          <div className="cb-track" style={{height:8}}><i style={{width:pctActual+'%',background:p.overBudget?'var(--red)':'var(--indigo-bright)',display:'block',height:'100%',borderRadius:3}}/></div>
          <div className="row between" style={{marginTop:5}}><span className="mono faint" style={{fontSize:10}}>{DFMT(p.actual)}</span><span className="mono faint" style={{fontSize:10}}>of {DFMT(p.budget)}</span></div>
          <div className="drow" style={{marginTop:10}}><span className="faint">Funding</span><span className={"bdg "+FUND[p.funding][0]}>{FUND[p.funding][1]}</span></div>
          <div className="drow"><span className="faint">Owner balance</span><span className="mono">{DFMT(Math.max(0,p.budget-p.actual))} {p.funding==='funded'?'held':'due'}</span></div>
          <div className="drow" style={{borderBottom:'none'}}><span className="faint">Friday margin <span className="synflag violet" style={{marginLeft:4}}>internal</span></span><span className="mono" style={{color:'var(--green)'}}>{p.margin}%</span></div>
          {FS && <div style={{marginTop:10}}><FS.Provenance items={[['coin','ledger-true · '+DM(p.actual)],['spark','margin modeled']]} health={H}/></div>}
        </div>
      </div>
    </div>
  </>);
}
function DzBudget({p,T}){
  const [owner,setOwner]=React.useState(false);
  const fee=owner?1.18:1;
  const rooms=[['Living room',[['Custom joinery unit','Atelier Bois',180000,40000],['Sofa (3+2)','SofaWorks',145000,8000],['Lighting scheme','Lumière',62000,18000]]],['Kitchen',[['Stone worktops','Tropic Stone',98000,35000],['Cabinetry refit','Atelier Bois',210000,55000]]],['Styling',[['Plants + pots','GreenScape',38000,6000],['Soft furnishings','—',54000,0]]]];
  const total=rooms.reduce((a,r)=>a+r[1].reduce((s,l)=>s+l[2]+l[3],0),0);
  return (<>
    <div className="row between" style={{marginBottom:10}}>
      <span className="faint" style={{fontSize:11.5}}><DI n="shield" s={1.6}/> {owner?'Owner-facing — margin hidden, price shown':'Internal — supply + install + margin'}</span>
      <span className="lang-tog" onClick={()=>setOwner(o=>!o)}><DI n="users" s={1.5}/> {owner?'Owner view':'Internal view'}</span>
    </div>
    {rooms.map((r,i)=>(<div key={i} style={{marginBottom:12}}>
      <div className="dml" style={{margin:'0 0 6px'}}>{r[0]}<span className="rule"/></div>
      <div className="panel" style={{padding:'4px 13px'}}>
        {r[1].map((l,k)=>(<div key={k} className="drow"><span style={{fontSize:12.5}}>{l[0]} {l[1]!=='—'&&<span className="faint mono" style={{fontSize:10}}>· {l[1]}</span>}</span><span className="mono" style={{fontWeight:600}}>{DFMT((l[2]+l[3])*fee)}</span></div>))}
      </div>
    </div>))}
    <div className="panel" style={{padding:'12px 15px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div><div style={{fontWeight:600}}>{owner?'Owner total (incl. fee + VAT)':'Project cost'}</div>{!owner&&<div className="faint mono" style={{fontSize:10}}>fee 18% applied in owner view</div>}</div>
      <div className="mono" style={{fontSize:20,fontWeight:700}}>{DFMT(total*fee)}</div>
    </div>
    <div className="acts" style={{marginTop:14}}><button className="dbtn ghost sm" onClick={()=>T('Budget line added')}><DI n="plus" s={2}/> Add line</button><button className="dbtn primary sm" onClick={()=>T('Budget sent for owner approval','green')}><DI n="check" s={2}/> Request approval</button><button className="dbtn ghost sm" onClick={()=>T('Budget locked')}><DI n="lock" s={1.7}/> Lock budget</button></div>
    <div className="gate" style={{borderStyle:'solid',marginTop:12}}><span style={{color:'var(--indigo-bright)'}}><DI n="spark" s={1.7}/></span><span>Friday benchmarked these lines against <b>4 comparable Signature projects</b> — joinery is ~8% above median (custom spec), everything else within range. Margin holds at {p.margin}%.</span></div>
  </>);
}
function DzProcurement({p,T}){
  const pos=[['PO-118','Atelier Bois','Joinery · living + kitchen',390000,'confirmed','green'],['PO-119','Tropic Stone','Stone worktops',133000,'delivered','green'],['PO-120','SofaWorks','Sofa 3+2',153000,'delayed','red'],['PO-121','Lumière','Lighting scheme',80000,'sent','amber'],['PO-122','GreenScape','Plants + styling',44000,'draft','gray']];
  const POST={confirmed:'green',delivered:'green',received:'green',sent:'amber',draft:'gray',delayed:'red'};
  return (<>
    <div className="fai" style={{marginTop:0,marginBottom:12}}><div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday</span></div><p>5 POs · Rs 800k committed. <b style={{color:'var(--red)'}}>SofaWorks (PO-120) is 3 weeks late</b> — on-time history 61%. I drafted an alternative from a 4.7-rated vendor at +Rs 12k. Approve to re-route?</p><div className="acts"><button className="dbtn primary sm" onClick={()=>T('Re-routed to alternative vendor','green')}>Approve re-route</button><button className="dbtn ghost sm" onClick={()=>T('Vendor chased')}>Chase SofaWorks</button></div></div>
    <div className="panel" style={{padding:'10px 6px'}}>
      <table className="tbl"><thead><tr><th>PO</th><th>Vendor</th><th>Items</th><th style={{textAlign:'right'}}>Value</th><th>Status</th></tr></thead>
        <tbody>{pos.map((o,i)=>(<tr key={i} className="tdrow" onClick={()=>T('Opened '+o[0])}>
          <td><span className="pcodeD">{o[0]}</span></td><td className="tt">{o[1]}</td><td className="faint" style={{fontSize:11.5}}>{o[2]}</td>
          <td className="mono" style={{textAlign:'right',fontWeight:600}}>{DFMT(o[3])}</td>
          <td><span className={"bdg "+POST[o[4]]+(o[4]==='delayed'||o[4]==='draft'?'':' dot')}>{o[4]}</span></td>
        </tr>))}</tbody>
      </table>
    </div>
  </>);
}
function DzReview({p,T}){
  const rounds=[
    {r:'R2',state:'shared',when:'30m ago',note:'Final styling package — living + kitchen + suite. Awaiting owner sign-off.',comments:[]},
    {r:'R1',state:'changes',when:'1d ago',note:'Concept package.',comments:[[p.owner.split(',')[0],'Love the layout — can we go warmer in the living room? The grey feels cold.'],['You','Updated to warm oak + terracotta accents. Re-shared as R2.']]},
  ];
  const SST={draft:'gray',shared:'green',viewed:'indigo',approved:'green',changes:'amber',expired:'red'};
  return (<>
    {rounds.map((rd,i)=>(<div key={i} style={{marginBottom:14}}>
      <div className="row between" style={{margin:'2px 0 8px'}}><div className="dml" style={{margin:0}}>{rd.r} · package<span className="rule"/></div><span className={"bdg "+SST[rd.state]+(rd.state==='shared'||rd.state==='approved'?' dot':'')}>{rd.state}{rd.state==='shared'&&' · link live'}</span></div>
      <div className="panel" style={{padding:'12px 14px'}}>
        <div className="row between"><span className="faint" style={{fontSize:11.5}}>{rd.note}</span><span className="faint mono" style={{fontSize:10}}>{rd.when}</span></div>
        {rd.comments.length>0 && <div className="tdtimeline" style={{marginTop:11}}>{rd.comments.map((c,k)=>(<div key={k} className="tdact"><span className="av1" style={{width:22,height:22,fontSize:8,flex:'0 0 22px'}}>{c[0].slice(0,2)}</span><div style={{flex:1}}><div style={{fontSize:12,lineHeight:1.45}}><b>{c[0]}</b> {c[1]}</div></div></div>))}</div>}
        {rd.state==='shared' && <div className="acts"><button className="dbtn primary sm" onClick={()=>T('Reminder sent to owner')}><DI n="msg" s={1.7}/> Nudge owner</button><button className="dbtn ghost sm" onClick={()=>T('Link copied')}>Copy link</button></div>}
        {rd.state==='changes' && <div className="acts"><button className="dbtn primary sm" onClick={()=>T('Revision R3 started')}>Start R3</button><button className="dbtn ghost sm" onClick={()=>T('Marked resolved')}>Resolve</button></div>}
      </div>
    </div>))}
    <button className="dbtn sm" onClick={()=>T('New package shared with owner','green')}><DI n="plus" s={2}/> Share new package</button>
  </>);
}
function DzRecon({p,T}){
  const lines=[['Living room',420000,438000],['Kitchen',308000,296000],['Styling',92000,86000],['Fees + VAT',223200,223200]];
  const bTot=lines.reduce((a,l)=>a+l[1],0), aTot=lines.reduce((a,l)=>a+l[2],0);
  const checklist=[['All POs received & matched',true],['Receipts reconciled to ledger',true],['Owner walkthrough complete',false],['Snag list cleared',false],['Final invoice issued',false]];
  return (<>
    <div className="panel" style={{padding:'10px 6px'}}>
      <table className="tbl"><thead><tr><th>Area</th><th style={{textAlign:'right'}}>Budgeted</th><th style={{textAlign:'right'}}>Actual</th><th style={{textAlign:'right'}}>Variance</th></tr></thead>
        <tbody>{lines.map((l,i)=>{const v=l[2]-l[1];return(<tr key={i}><td className="tt">{l[0]}</td><td className="mono faint" style={{textAlign:'right'}}>{DFMT(l[1])}</td><td className="mono" style={{textAlign:'right'}}>{DFMT(l[2])}</td><td className="mono" style={{textAlign:'right',color:v>0?'var(--red)':'var(--green)'}}>{v>0?'+':''}{DFMT(v)}</td></tr>);})}
          <tr><td style={{fontWeight:700}}>Total</td><td className="mono" style={{textAlign:'right',fontWeight:700}}>{DFMT(bTot)}</td><td className="mono" style={{textAlign:'right',fontWeight:700}}>{DFMT(aTot)}</td><td className="mono" style={{textAlign:'right',fontWeight:700,color:aTot>bTot?'var(--red)':'var(--green)'}}>{aTot>bTot?'+':''}{DFMT(aTot-bTot)}</td></tr>
        </tbody>
      </table>
    </div>
    <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginTop:14,alignItems:'start'}}>
      <div className="panel"><div className="dml" style={{margin:'0 0 8px'}}>Owner balance<span className="rule"/></div>
        <div className="drow"><span className="faint">Funded / paid</span><span className="mono" style={{color:'var(--green)'}}>{DFMT(aTot)}</span></div>
        <div className="drow" style={{borderBottom:'none'}}><span className="faint">Outstanding</span><span className="mono">Rs 0 · settled</span></div>
      </div>
      <div className="panel"><div className="dml" style={{margin:'0 0 8px'}}>Friday margin <span className="synflag violet">internal</span><span className="rule"/></div>
        <div className="drow" style={{borderBottom:'none'}}><span className="faint">Net margin</span><span className="mono" style={{color:'var(--green)',fontWeight:700}}>{p.margin}% · {DFMT(aTot*p.margin/100)}</span></div>
      </div>
    </div>
    <div className="dml" style={{marginTop:16}}>Handover checklist<span className="rule"/></div>
    <div className="panel" style={{padding:'4px 13px'}}>
      {checklist.map((c,i)=>(<div key={i} className="tdcheck"><span className={"tdcbx"+(c[1]?' on':'')}>{c[1]&&<DI n="check" s={3}/>}</span><span style={{flex:1,fontSize:13,color:c[1]?'var(--tx-2)':'var(--tx)',textDecoration:c[1]?'line-through':'none'}}>{c[0]}</span></div>))}
    </div>
    <button className="dbtn green" style={{marginTop:14}} disabled={checklist.some(c=>!c[1])} onClick={()=>T('Project closed & handed over','green')} title={checklist.some(c=>!c[1])?'Complete the checklist first':''}><DI n="check" s={2}/> Close project</button>
  </>);
}
function StageWorkbench({p,idx,onClose,T}){
  const H=_dh(), FS=window.FADSTATE;
  const gated=APPROVAL_STAGES.includes(idx);
  const inputs=[['Brief & scope confirmed',true],['Site measurements on file',true],['Material selections finalised',idx<=5],['Vendor quotes received',idx<8?false:true]].slice(0,3);
  const [chk,setChk]=React.useState(inputs.map(i=>i[1]));
  const allDone=chk.every(Boolean);
  return (
    <div className="tdask" style={{zIndex:55}}>
      <div className="tdask-h"><span className="row" style={{gap:8,fontWeight:600,fontSize:13}}><span className="mdot" style={{width:9,height:9,borderRadius:3,background:STDOT[stageStatus(p,idx)]}}/> Stage {idx+1} · {STAGES[idx]} {gated&&<span className="synflag amber">owner-approval gate</span>}</span><span className="icbtn" style={{cursor:'pointer',width:28,height:28}} onClick={onClose}><DI n="x" s={2}/></span></div>
      <div className="tdask-body" style={{display:'block'}}>
        {FS && H!=='healthy' && <FS.StateBanner surface="upstream design data" health={H}/>}
        <div className="dml" style={{marginTop:0}}>Required inputs<span className="rule"/></div>
        <div className="panel" style={{padding:'4px 13px'}}>
          {inputs.map((it,i)=>(<div key={i} className="tdcheck" onClick={()=>setChk(c=>c.map((v,k)=>k===i?!v:v))} style={{cursor:'pointer'}}><span className={"tdcbx"+(chk[i]?' on':'')}>{chk[i]&&<DI n="check" s={3}/>}</span><span style={{flex:1,fontSize:13}}>{it[0]}</span></div>))}
        </div>
        <div className="dml">Evidence<span className="rule"/></div>
        <div className="tdphotos">{[0,1,2].map(i=><div key={i} className="tdphoto" style={{background:`linear-gradient(150deg,${['#2b3346','#26343a','#2e2738'][i]},#141b27)`}}><span className="tdphoto-tag">{['concept','moodboard','plan'][i]}</span></div>)}</div>
        {gated && <div className="gate" style={{borderStyle:'solid',marginTop:14}}><DI n="shield" s={1.7} style={{color:'var(--amber)',flex:'0 0 auto'}}/><span>This stage <b>can't advance</b> until the owner approves the shared package. Current: <b>{APPR[p.approval][1]}</b>.</span></div>}
      </div>
      <div className="tdask-comp" style={{gap:8}}>
        <button className="dbtn ghost sm" onClick={()=>{T('Stage put on hold');onClose();}}>Hold</button>
        <button className="dbtn ghost sm" onClick={()=>{T('Escalated to Inbox');onClose();}}>Escalate</button>
        <span className="grow" style={{flex:1}}/>
        <button className="dbtn primary sm" disabled={!allDone||(gated&&p.approval!=='approved')} onClick={()=>{T('Stage complete — advanced','green');onClose();}} title={!allDone?'Complete required inputs':gated&&p.approval!=='approved'?'Awaiting owner approval':''}><DI n="check" s={2}/> Complete &amp; advance</button>
      </div>
    </div>
  );
}

/* I · Vendors */
function DzVendors({T}){
  return (<div className="panel" style={{padding:'10px 6px',marginTop:6}}>
    <table className="tbl"><thead><tr><th>Vendor</th><th>Category</th><th style={{textAlign:'right'}}>Rating</th><th style={{textAlign:'right'}}>Active POs</th><th style={{textAlign:'right'}}>On-time</th><th>Contact</th></tr></thead>
      <tbody>{VENDORS.map((v,i)=>(<tr key={i} className="tdrow" onClick={()=>T('Opened '+v.nm)}>
        <td className="tt">{v.nm} {v.flag&&<span className="synflag red" style={{marginLeft:5}}>late</span>}</td>
        <td className="faint">{v.cat}</td>
        <td className="mono" style={{textAlign:'right'}}>★ {v.rating}</td>
        <td className="mono faint" style={{textAlign:'right'}}>{v.pos}</td>
        <td className="mono" style={{textAlign:'right',color:v.ontime>=85?'var(--green)':'var(--red)'}}>{v.ontime}%</td>
        <td className="faint" style={{fontSize:11.5}}>{v.contact}</td>
      </tr>))}</tbody>
    </table>
  </div>);
}

/* J · Analytics */
function DzAnalytics({T}){
  const tiers=[['Essential',26,'var(--green)'],['Signature',23,'var(--indigo-bright)'],['Bespoke',20,'var(--violet)']];
  return (<>
    <div className="grid4">
      <div className="statc"><div className="n">Rs 9.1M</div><div className="l">Revenue · YTD</div></div>
      <div className="statc"><div className="n">23%</div><div className="l">Avg margin</div></div>
      <div className="statc"><div className="n">38 days</div><div className="l">Avg cycle time</div></div>
      <div className="statc amber"><div className="n">84%</div><div className="l">On-time delivery</div></div>
    </div>
    <div className="dtwocol" style={{marginTop:14,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,alignItems:'start'}}>
      <div className="panel"><div className="dml" style={{margin:'0 0 12px'}}>Margin by tier<span className="rule"/></div>
        {tiers.map((t,i)=>(<div key={i} style={{marginBottom:11}}><div className="row between" style={{fontSize:12,marginBottom:4}}><span>{t[0]}</span><span className="mono">{t[1]}%</span></div><div className="cb-track" style={{height:7}}><i style={{display:'block',height:'100%',borderRadius:3,width:(t[1]*3)+'%',background:t[2]}}/></div></div>))}
      </div>
      <div className="panel"><div className="dml" style={{margin:'0 0 12px'}}>Budget accuracy<span className="rule"/></div>
        <div className="row" style={{gap:5,alignItems:'flex-end',height:120}}>{[88,92,79,95,86,91].map((v,i)=><div key={i} style={{flex:1,height:v+'%',background:'linear-gradient(180deg,var(--indigo-bright),var(--indigo))',borderRadius:'3px 3px 0 0',opacity:.5+v/250}}/>)}</div>
        <div className="faint mono" style={{fontSize:9,marginTop:6,textAlign:'center'}}>last 6 projects · actual vs budget</div>
      </div>
    </div>
  </>);
}

/* K · Settings */
function DzSettings({T}){
  const [tab,setTab]=React.useState('templates');
  const Tg=({on})=>{const[v,setV]=React.useState(on);return <span className={"tgl"+(v?' on':'')} onClick={()=>setV(!v)}><span className="knob"/></span>;};
  return (<>
    <div className="vseg" style={{margin:'4px 0 12px'}}>{[['templates','Stage templates'],['fees','Fees + VAT'],['docs','Documents'],['rules','Approval rules']].map(t=><span key={t[0]} className={"vs"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}</span>)}</div>
    {tab==='templates' && <div className="panel" style={{padding:'4px 13px'}}>{['Essential','Signature','Bespoke'].map((t,i)=>(<div key={i} className="drow"><span style={{fontWeight:600,fontSize:12.5}}>{t}</span><span className="faint mono" style={{fontSize:10.5}}>{[12,17,17][i]} stages · {[3,5,7][i]} required docs</span></div>))}</div>}
    {tab==='fees' && <div className="panel" style={{padding:'4px 13px'}}>{[['Design fee','18%'],['VAT','15%'],['Deposit required','40%'],['Margin floor','18%']].map((r,i)=>(<div key={i} className="drow"><span className="faint">{r[0]}</span><span className="mono">{r[1]}</span></div>))}</div>}
    {tab==='docs' && <div className="panel" style={{padding:'4px 13px'}}>{['Signed brief','Concept package','Budget approval','Final styling','Handover certificate'].map((r,i)=>(<div key={i} className="drow"><span style={{fontSize:12.5}}>{r}</span><span className="bdg green dot">required</span></div>))}</div>}
    {tab==='rules' && <div className="panel" style={{padding:'4px 13px'}}>{[['Concept approval gate',true],['Budget approval gate',true],['Owner review gate',true],['Auto-share packages',false]].map((r,i)=>(<div key={i} className="drow"><span style={{fontSize:12.5}}>{r[0]}</span><Tg on={r[1]}/></div>))}</div>}
  </>);
}

/* owner portal — design package approval */
function DesignPortal(){
  const [tab,setTab]=React.useState('package');
  const [appr,setAppr]=React.useState(false);
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  return (
    <div className="portal-wrap"><div className="portal">
      <div className="portal-h"><div className="row" style={{gap:9}}><span className="portal-mk">✦</span><div><div style={{fontWeight:600,fontSize:14}}>Friday Design · Owner portal</div><div className="faint mono" style={{fontSize:10}}>magic link · GBH-B4 · Full refresh</div></div></div><span className="bdg gray">EN · FR</span></div>
      <div className="portal-tabs">{[['package','Package'],['budget','Your price'],['progress','Progress']].map(t=><span key={t[0]} className={"portal-tab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}</span>)}</div>
      <div className="portal-body">
        {tab==='package' && <>
          <div className="tdphotos" style={{gridTemplateColumns:'1fr 1fr'}}>{[0,1,2,3].map(i=><div key={i} className="tdphoto" style={{aspectRatio:'4/3',background:`linear-gradient(150deg,${['#2b3346','#26343a','#2e2738','#332b2b'][i]},#141b27)`}}><span className="tdphoto-tag">{['living','kitchen','suite','styling'][i]}</span></div>)}</div>
          <p style={{fontSize:12.5,lineHeight:1.5,color:'var(--tx-2)',marginTop:12}}>Concept R2 — warm oak, terracotta accents and layered lighting, as you asked. Approve to move into detailed design, or leave a comment.</p>
          {appr ? <div className="afdone" style={{marginTop:10}}><DI n="check" s={2}/> Approved — thank you! We'll start detailed design.</div>
          : <div className="row" style={{gap:7,marginTop:10}}><button className="dbtn primary sm" style={{flex:1}} onClick={()=>{setAppr(true);T('Package approved','green');}}><DI n="check" s={2}/> Approve</button><button className="dbtn sm" style={{flex:1}} onClick={()=>T('Comment box opened')}>Comment</button></div>}
        </>}
        {tab==='budget' && <div className="panel" style={{padding:'4px 13px'}}>{[['Living room','Rs 519k'],['Kitchen','Rs 363k'],['Styling','Rs 109k'],['Fee + VAT','included'],['Your total','Rs 1.46M']].map((r,i)=>(<div key={i} className="drow" style={i===4?{borderBottom:'none'}:{}}><span className={i===4?'':'faint'} style={i===4?{fontWeight:700}:{}}>{r[0]}</span><span className="mono" style={i===4?{fontWeight:700}:{}}>{r[1]}</span></div>))}</div>}
        {tab==='progress' && <div className="tdtimeline">{[['Concept approved','done'],['Detailed design','active'],['Budget approval','next'],['Install','—'],['Handover','—']].map((s,i)=>(<div key={i} className="tdact"><span className="dz-dot" style={{position:'static',width:22,height:22,fontSize:9,background:s[1]==='done'?'var(--green)':s[1]==='active'?'var(--indigo)':'var(--card-2)',color:s[1]==='active'||s[1]==='done'?'#fff':'var(--tx-3)',border:'none',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%'}}>{s[1]==='done'?'✓':i+1}</span><div style={{flex:1,fontSize:12.5,fontWeight:s[1]==='active'?600:400}}>{s[0]}</div></div>))}</div>}
      </div>
    </div>
    <div className="faint mono" style={{fontSize:10,textAlign:'center',marginTop:14}}>Owner-facing view (magic-link). <span className="prov-retry" onClick={()=>window.FADGO('design')}>Back to operator</span></div>
    </div>
  );
}

/* host for the project drawer */
function DesignDrawerHost(){
  const [proj,setProj]=React.useState(null);
  React.useEffect(()=>{ window.__DZPROJ=setProj; return ()=>{window.__DZPROJ=null;}; },[]);
  return <ProjectDrawer proj={proj} onClose={()=>setProj(null)}/>;
}

window.FADDESIGN = { ScreenDesign, DesignPortal, DesignDrawerHost, openProject:(p)=>window.__DZPROJ&&window.__DZPROJ(p), PROJECTS, STAGES };
