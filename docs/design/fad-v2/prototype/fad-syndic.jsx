/* FAD V2 — Syndic module (co-ownership / copropriété management).
   Peer module under "Business units". Dark FAD skin. Grounded in Friday's
   live GBH mandate (32-lot building, syndic since 1 Apr 2026).
   Phase 1: Buildings portfolio (A), Building overview (B), Owners & lots (C). */
const { DI, Shell } = window.FADD;

/* ---------------- GBH building + lot register ---------------- */
const GBH = {
  id:'gbh', name:'Grand Baie Heights', code:'GBH', addr:'Grand Baie · Rivière du Rempart',
  lots:32, apts:24, millieme:10000, since:'1 Apr 2026', rate:12, quarter:'Q2 2026',
  cash:158367.39, due:476631, collectedPct:36.8, outstanding:301264,
  mandate:'Rs 20,000 / mo ex-VAT + 1% major works', mandateState:'draft (verbal)',
  insurance:'lapsed', handover:'partial · Nasani', nextAgm:'12 Jun', compliance:2,
};
const CAMELIA = {
  id:'camelia', name:'Résidence Camelia', code:'RC', addr:'Flic en Flac · Rivière Noire',
  lots:18, apts:16, millieme:10000, since:'1 May 2026', rate:10, quarter:'Q2 2026',
  cash:402150, due:540000, collectedPct:74.0, outstanding:140400,
  mandate:'Rs 14,000 / mo ex-VAT + 1% major works', mandateState:'signed',
  insurance:'current', handover:'complete', nextAgm:'4 Sep', compliance:0,
};
/* status: settled (green) / partial (amber) / unpaid (red).
   flags: tentative, ext (former-owner receivable elsewhere), credit, bundle */
const LOTS = [
  {lot:'A1',owner:'Ramphul, V.',mil:512,type:'apt',status:'partial',paid:18432,bal:24168,tentative:true,lang:'EN'},
  {lot:'A6',owner:'Dts Investments',mil:498,type:'apt',status:'settled',paid:35856,bal:-5976,credit:true,lang:'EN'},
  {lot:'A7',owner:'Baraka, S.',mil:486,type:'apt',status:'settled',paid:17496,bal:0,tentative:true,ext:'Noordally',lang:'FR'},
  {lot:'B1',owner:'Noordally, R.',mil:455,type:'apt',status:'unpaid',paid:0,bal:49140,bundle:'Noordally',lang:'EN'},
  {lot:'B2',owner:'Noordally, R.',mil:330,type:'apt',status:'unpaid',paid:0,bal:35640,bundle:'Noordally',lang:'EN'},
  {lot:'B3',owner:'Mayeven Ltd',mil:520,type:'apt',status:'settled',paid:18720,bal:0,bundle:'Mayeven',cs:true,lang:'EN'},
  {lot:'B6',owner:'Kasseeah, D.',mil:410,type:'apt',status:'partial',paid:8000,bal:6760,bundle:'Kasseeah',lang:'FR'},
  {lot:'B7',owner:'Noordally, R.',mil:298,type:'apt',status:'unpaid',paid:0,bal:32184,bundle:'Noordally',lang:'EN'},
  {lot:'C1',owner:'Kasseeah, D.',mil:505,type:'apt',status:'partial',paid:10000,bal:8180,bundle:'Kasseeah',lang:'FR'},
  {lot:'C3',owner:'Lim, A.',mil:472,type:'apt',status:'settled',paid:21000,bal:-3008,credit:true,lang:'EN'},
  {lot:'C5',owner:'Mayeven Ltd',mil:540,type:'apt',status:'settled',paid:19440,bal:0,bundle:'Mayeven',cs:true,lang:'EN'},
  {lot:'C9',owner:'Devi, S. (pending)',mil:430,type:'apt',status:'unpaid',paid:0,bal:46440,tentative:true,lang:'FR'},
  {lot:'D2',owner:'Okeke, P.',mil:388,type:'apt',status:'partial',paid:6000,bal:7968,lang:'EN'},
  {lot:'D4',owner:'Henriette, M.',mil:401,type:'apt',status:'settled',paid:14436,bal:0,cs:true,lang:'FR'},
  {lot:'D8',owner:'Sookun, K.',mil:366,type:'apt',status:'settled',paid:13176,bal:-14950,credit:true,lang:'EN'},
  {lot:'P-12',owner:'Mayeven Ltd',mil:60,type:'parking',status:'settled',paid:2160,bal:0,bundle:'Mayeven',lang:'EN'},
];
const CAMELIA_LOTS = [
  {lot:'1A',owner:'Beaulieu, F.',mil:680,type:'apt',status:'settled',paid:20400,bal:0,lang:'FR'},
  {lot:'1B',owner:'Tan, W.',mil:655,type:'apt',status:'settled',paid:19650,bal:0,lang:'EN'},
  {lot:'2A',owner:'Goolab, R.',mil:710,type:'apt',status:'partial',paid:10000,bal:11300,lang:'EN'},
  {lot:'2B',owner:'Pillay, S.',mil:690,type:'apt',status:'settled',paid:20700,bal:0,cs:true,lang:'EN'},
  {lot:'3A',owner:'Dubois & Cie',mil:720,type:'apt',status:'unpaid',paid:0,bal:21600,lang:'FR'},
  {lot:'3B',owner:'Nair, K.',mil:705,type:'apt',status:'settled',paid:21150,bal:0,lang:'EN'},
  {lot:'4A',owner:'Lim Fat, J.',mil:640,type:'apt',status:'settled',paid:19200,bal:-1920,credit:true,lang:'EN'},
  {lot:'4B',owner:'Ah-Kong, M.',mil:665,type:'apt',status:'partial',paid:12000,bal:7950,lang:'FR'},
  {lot:'P-3',owner:'Pillay, S.',mil:80,type:'parking',status:'settled',paid:2400,bal:0,cs:true,lang:'EN'},
];
const BUILDINGS = { gbh:GBH, camelia:CAMELIA };
const LOTS_BY = { gbh:LOTS, camelia:CAMELIA_LOTS };
let SYN_CUR = 'gbh';
const setCurB = id => { SYN_CUR = id; };
const curB = () => BUILDINGS[SYN_CUR] || GBH;
const curLots = () => LOTS_BY[SYN_CUR] || LOTS;
const FMT = n => 'Rs '+Math.abs(n).toLocaleString('en-US');
const ST = { settled:['green','Settled'], partial:['amber','Partial'], unpaid:['red','Unpaid'] };

/* ---------------- shared building workspace shell ---------------- */
const SYN_TABS = [
  ['synb-overview','Overview'],['synb-owners','Owners & lots'],['synb-charges','Charges'],
  ['synb-payments','Payments'],['synb-arrears','Arrears'],['synb-agm','Meetings'],
  ['synb-docs','Documents'],['synb-compliance','Compliance'],
];
function BuildingHead({ active, actions, children }){
  const B = curB();
  return (
    <Shell active="syndic"
      eyebrow={<><span style={{cursor:'pointer'}} onClick={()=>window.FADGO('syndic')}>SYNDIC</span> <span style={{opacity:.5}}>›</span> {B.code}</>}
      title={B.name}
      sub={<>{B.lots} lots · {B.apts} apartments · {B.millieme.toLocaleString()} millièmes · syndic since {B.since}</>}
      tabs={SYN_TABS.map(t=>({l:t[1],k:t[0],on:t[0]===active}))}
      actions={actions}>
      {children}
    </Shell>
  );
}

/* ---------------- A · Buildings portfolio ---------------- */
function ScreenSyndicBuildings(){
  const T=t=>window.fadToast&&window.fadToast(t);
  const open=id=>{ setCurB(id); window.FADGO('synb-overview'); };
  const totals={lots:GBH.lots+CAMELIA.lots, out:GBH.outstanding+CAMELIA.outstanding};
  return (
    <Shell active="syndic" eyebrow={<><DI n="building" s={1.6} style={{color:'var(--indigo-bright)'}}/> SYNDIC · BUSINESS UNIT</>}
      title="Buildings" sub="Co-ownership mandates under management"
      actions={<><button className="dbtn ghost" onClick={()=>window.FADGO('synb-onboard')}><DI n="plus" s={2}/> Onboard a building</button></>}>
      <div className="grid4">
        <div className="statc"><div className="n">2</div><div className="l">Buildings</div></div>
        <div className="statc"><div className="n">{totals.lots}</div><div className="l">Lots managed</div></div>
        <div className="statc amber"><div className="n">52%</div><div className="l">Blended collection</div></div>
        <div className="statc red"><div className="n">{FMT(totals.out)}</div><div className="l">Outstanding</div></div>
      </div>
      <div className="dml" style={{marginTop:18}}>Mandates <span className="ct">2 active</span><span className="rule"/></div>
      {[GBH,CAMELIA].map(B=>(
        <div key={B.id} className="synb-card" onClick={()=>open(B.id)}>
          <div className="synb-thumb"><DI n="building" s={1.5}/></div>
          <div style={{flex:1,minWidth:0}}>
            <div className="row" style={{gap:9,alignItems:'center'}}><span style={{fontWeight:600,fontSize:15}}>{B.name}</span><span className="pcodeD">{B.code}</span><span className={"bdg "+(B.mandateState==='signed'?'green':'amber')}>{B.mandateState==='signed'?'mandate signed':'mandate draft'}</span></div>
            <div className="faint" style={{fontSize:12,marginTop:3}}>{B.addr} · syndic since {B.since}</div>
            <div className="row" style={{gap:18,marginTop:11,flexWrap:'wrap'}}>
              <Mini l="Collection" v={B.collectedPct+'%'} tone={B.collectedPct<50?'red':B.collectedPct<70?'amber':'green'}/>
              <Mini l="Cash position" v={FMT(B.cash)}/>
              <Mini l="Outstanding" v={FMT(B.outstanding)} tone={B.outstanding>200000?'red':'amber'}/>
              <Mini l="Next AGM" v={B.nextAgm}/>
              <Mini l="Compliance" v={B.compliance?B.compliance+' flags':'clear'} tone={B.compliance?'red':'green'}/>
            </div>
          </div>
          <DI n="chevR" s={2} style={{color:'var(--tx-3)',flex:'0 0 auto'}}/>
        </div>
      ))}
      <div className="gate" style={{borderStyle:'solid',marginTop:14}}><span style={{color:'var(--indigo-bright)'}}><DI n="spark" s={1.6}/></span><span><b>Friday.</b> GBH needs attention — collection at 36.8% and insurance lapsed. Camelia is healthy at 74% with a signed mandate. Onboard the next copropriété when its mandate is ready.</span></div>
    </Shell>
  );
}
function Mini({l,v,tone}){return <div><div className="faint mono" style={{fontSize:9,letterSpacing:'.08em',textTransform:'uppercase'}}>{l}</div><div className="mono" style={{fontSize:13,fontWeight:600,marginTop:2,color:tone?'var(--'+tone+')':'var(--tx)'}}>{v}</div></div>;}

/* ---------------- B · Building overview ---------------- */
function ScreenSyndicOverview(){
  const B=curB(), L=curLots();
  const T=t=>window.fadToast&&window.fadToast(t);
  const byStatus={settled:0,partial:0,unpaid:0};
  L.forEach(l=>byStatus[l.status]++);
  const gbh = B.id==='gbh';
  const alerts = gbh ? [
    ['red','Insurance lapsed','Fire/allied cover lapsed · PI + Art 664-45 guarantee unbound. Friday flagged to the CS.','Compliance'],
    ['amber','AGM in 13 days','12 Jun · convocation must go out by 28 May to meet the 15-day notice (Art 664-26).','Open AGM'],
    ['amber','Mandate unsigned','Operating on verbal CS resolution · fees accrued, not yet invoiced.','Friday receivable'],
  ] : [
    ['amber','AGM on 4 Sep','Annual general meeting scheduled · convocation not yet due.','Open AGM'],
    ['green','All compliant','Insurance current · mandate signed · handover complete.','Compliance'],
  ];
  return (
    <BuildingHead active="synb-overview"
      actions={<><button className="dbtn ghost" onClick={()=>T('Exporting snapshot')}>Export snapshot</button><button className="dbtn primary" onClick={()=>window.FADGO('synb-charges')}><DI n="coin" s={1.8}/> Run Q3 charges</button></>}>
      <div className="fai">
        <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday brief</span><span className="grow"/><span className="faint mono" style={{fontSize:10}}>refreshed just now</span></div>
        <p><b>Q2 collection is at {B.collectedPct}%</b> — {FMT(B.outstanding)} outstanding across {byStatus.unpaid+byStatus.partial} lots. {gbh?<>The Noordally bundle (B1·B2·B7) is the single biggest exposure at Rs 116,964. Insurance is lapsed and the AGM convocation is due in 3 days.</>:<>The building is healthy — a signed mandate, current insurance, and only one lot in arrears.</>}</p>
        <div className="acts"><button className="dbtn primary sm" onClick={()=>window.FADGO('synb-arrears')}><DI n="flag" s={1.8}/> Open collections</button><button className="dbtn ghost sm" onClick={()=>window.FADGO('synb-agm')}>Prep AGM</button></div>
      </div>
      <div className="grid4" style={{marginTop:14}}>
        <div className="statc"><div className="n">{FMT(B.cash)}</div><div className="l">Cash position</div><div className="d">dedicated syndicate a/c</div></div>
        <div className="statc"><div className="n">{FMT(B.due)}</div><div className="l">Called · Q2</div></div>
        <div className="statc amber"><div className="n">{B.collectedPct}%</div><div className="l">Collected</div><div className="d">{FMT(B.due-B.outstanding)} in</div></div>
        <div className="statc red"><div className="n">{FMT(B.outstanding)}</div><div className="l">Outstanding</div></div>
      </div>
      <div className="dtwocol" style={{marginTop:14,display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:14,alignItems:'start'}}>
        <div className="panel">
          <div className="dml" style={{margin:'0 0 12px'}}>Lots by status <span className="rule"/></div>
          <div className="synbar">
            <span className="seg green" style={{flex:byStatus.settled}}>{byStatus.settled} settled</span>
            <span className="seg amber" style={{flex:byStatus.partial}}>{byStatus.partial} partial</span>
            <span className="seg red" style={{flex:byStatus.unpaid}}>{byStatus.unpaid} unpaid</span>
          </div>
          <div className="row" style={{gap:18,marginTop:16,flexWrap:'wrap'}}>
            <Mini l="Tentative owners" v={L.filter(l=>l.tentative).length+' flagged'} tone="amber"/>
            <Mini l="On credit" v={L.filter(l=>l.credit).length+' lots'}/>
            <Mini l="External receivable" v={gbh?'1 · former owner':'none'} tone={gbh?'red':'green'}/>
            <Mini l="Q2 rate" v={'Rs '+B.rate+' / millième'}/>
          </div>
          <div className="fbar" style={{marginTop:14}}><span className="fi" style={{color:'var(--amber)'}}><DI n="shield" s={1.7}/></span><span className="ft" style={{fontSize:11.5}}>Prior-syndic arrears and pre-mandate Q1 charges are tracked separately from Q2 — not merged into one number.</span></div>
        </div>
        <div className="panel">
          <div className="dml" style={{margin:'0 0 6px'}}>Alerts <span className="ct">{alerts.length}</span><span className="rule"/></div>
          {alerts.map((a,i)=>(
            <div key={i} className="synalert" onClick={()=>T(a[3])}>
              <span className="adot" style={{background:'var(--'+a[0]+')'}}/>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:12.5,fontWeight:600}}>{a[1]}</div><div className="faint" style={{fontSize:11,marginTop:2,lineHeight:1.45}}>{a[2]}</div></div>
              <span className="faint" style={{fontSize:10,flex:'0 0 auto'}}>{a[3]} ↗</span>
            </div>
          ))}
          <div className="drow" style={{borderTop:'1px solid var(--line-2)',marginTop:6,paddingTop:11}}><span className="faint">Friday receivable</span><span className="mono" style={{color:gbh?'var(--amber)':'var(--green)'}}>{gbh?'accrued · not invoiced':'invoiced monthly'}</span></div>
        </div>
      </div>
    </BuildingHead>
  );
}

/* ---------------- C · Owners & lots register ---------------- */
function ScreenSyndicOwners(){
  const B=curB(), L=curLots();
  const [seg,setSeg]=React.useState('all');
  const segs=[['all','All',L.length],['unpaid','Unpaid',L.filter(l=>l.status==='unpaid').length],['partial','Partial',L.filter(l=>l.status==='partial').length],['tentative','Tentative',L.filter(l=>l.tentative).length],['credit','On credit',L.filter(l=>l.credit).length]];
  const shown=L.filter(l=> seg==='all' || (seg==='tentative'&&l.tentative) || (seg==='credit'&&l.credit) || l.status===seg);
  const openOwner=l=>window.FADSYNDIC&&window.FADSYNDIC.openLot(l);
  const gbh=B.id==='gbh';
  return (
    <BuildingHead active="synb-owners"
      actions={<><button className="dbtn ghost"><DI n="filter" s={2}/> Filter</button><button className="dbtn primary"><DI n="plus" s={2}/> Add lot</button></>}>
      <div className="row between" style={{margin:'2px 0 10px'}}>
        <span className="vseg">{segs.map(s=><span key={s[0]} className={"vs"+(seg===s[0]?' on':'')} onClick={()=>setSeg(s[0])}>{s[1]} <span className="mono" style={{opacity:.6,fontSize:10}}>{s[2]}</span></span>)}</span>
        <span className="faint mono" style={{fontSize:10}}>{shown.length} of {L.length} lots · {B.millieme.toLocaleString()} millièmes</span>
      </div>
      <div className="panel" style={{padding:'10px 6px'}}>
        <table className="tbl">
          <thead><tr><th>Lot</th><th>Owner</th><th style={{textAlign:'right'}}>Millième</th><th>Type</th><th>Status</th><th style={{textAlign:'right'}}>Paid · Q2</th><th style={{textAlign:'right'}}>Balance</th><th>Flags</th></tr></thead>
          <tbody>{shown.map((l,i)=>(
            <tr key={i} className="tdrow" onClick={()=>openOwner(l)}>
              <td><span className="pcodeD">{l.lot}</span></td>
              <td className="tt">{l.owner}</td>
              <td className="mono faint" style={{textAlign:'right'}}>{l.mil}</td>
              <td className="faint" style={{fontSize:11.5,textTransform:'capitalize'}}>{l.type}</td>
              <td><span className={"bdg "+ST[l.status][0]+" dot"}>{ST[l.status][1]}</span></td>
              <td className="mono" style={{textAlign:'right'}}>{FMT(l.paid)}</td>
              <td className="mono" style={{textAlign:'right',fontWeight:600,color:l.bal<0?'var(--green)':l.bal>0?'var(--red)':'var(--tx-3)'}}>{l.bal<0?'+'+FMT(l.bal)+' cr':l.bal>0?FMT(l.bal):'—'}</td>
              <td><span className="row" style={{gap:4}}>
                {l.tentative && <span className="synflag amber" title="Sale unconfirmed — excluded from enforcement">tentative</span>}
                {l.bundle && <span className="synflag" title="Multi-lot owner — bundle payment">{l.bundle.slice(0,4)}…</span>}
                {l.ext && <span className="synflag red" title="Former-owner arrears tracked separately (Art 664-78)">ext: {l.ext}</span>}
                {l.credit && <span className="synflag green" title="Carries a credit">credit</span>}
                {l.cs && <span className="synflag violet" title="Conseil Syndical — handled manually">CS</span>}
              </span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {gbh && <div className="gate" style={{borderStyle:'solid',marginTop:12}}><span style={{color:'var(--indigo-bright)'}}><DI n="shield" s={1.7}/></span><span><b>Art 664-78.</b> A7 Baraka shows a clean balance — the prior owner Noordally's arrears are an <b>external receivable</b>, never the new owner's debt, and never named on public lists.</span></div>}
    </BuildingHead>
  );
}

/* ---------------- C-detail · Lot / owner drawer ---------------- */
function LotDrawer({ lot, onClose }){
  React.useEffect(()=>{ const k=e=>{if(e.key==='Escape')onClose();}; window.addEventListener('keydown',k); return ()=>window.removeEventListener('keydown',k); },[onClose]);
  if(!lot) return null;
  const l=lot, T=t=>window.fadToast&&window.fadToast(t);
  const bundle = l.bundle ? LOTS.filter(x=>x.bundle===l.bundle) : null;
  const ledger=[
    ['Q2 charge · '+l.mil+' mil × Rs '+GBH.rate+' × 3', '+'+FMT(l.mil*GBH.rate*3), 'charge'],
    ...(l.paid>0?[['Payment · JUICE '+l.lot+' '+l.owner.split(',')[0]+' Q2', '−'+FMT(l.paid), 'pay']]:[]),
    ...(l.bal<0?[['Carried credit', FMT(l.bal)+' cr', 'credit']]:[]),
  ];
  return (<>
    <div className="tdscrim" onClick={onClose}/>
    <aside className="tddrawer" style={{width:560}} role="dialog" aria-label="Lot detail">
      <div className="tdh">
        <div className="between"><span className="row" style={{gap:9}}><span className="pcodeD">{l.lot}</span><span className={"bdg "+ST[l.status][0]+" dot"}>{ST[l.status][1]}</span>{l.tentative&&<span className="bdg amber">tentative owner</span>}</span>
          <span className="icbtn" style={{cursor:'pointer'}} onClick={onClose}><DI n="x" s={2}/></span></div>
        <h2 className="tdtitle">{l.owner}</h2>
        <div className="tdmeta" style={{gridTemplateColumns:'1fr 1fr'}}>
          <span className="tdm-item"><span className="k">Millième</span><span className="mono">{l.mil} / {GBH.millieme.toLocaleString()}</span></span>
          <span className="tdm-item"><span className="k">Type</span><span style={{textTransform:'capitalize'}}>{l.type}</span></span>
          <span className="tdm-item"><span className="k">Balance</span><span className="mono" style={{color:l.bal<0?'var(--green)':l.bal>0?'var(--red)':'var(--tx-3)',fontWeight:700}}>{l.bal<0?'+'+FMT(l.bal)+' credit':l.bal>0?FMT(l.bal)+' due':'settled'}</span></span>
          <span className="tdm-item"><span className="k">Language</span><span>{l.lang==='FR'?'Français':'English'}</span></span>
        </div>
      </div>
      <div className="tdbody">
        {l.tentative && <div className="gate" style={{borderStyle:'solid',marginBottom:14}}><DI n="shield" s={1.8} style={{color:'var(--amber)',flex:'0 0 auto'}}/><span><b>Tentative owner.</b> Sale date unconfirmed — excluded from arrears enforcement and public lists until confirmed.</span></div>}
        {l.ext && <div className="gate" style={{borderStyle:'solid',marginBottom:14,borderColor:'rgba(207,102,96,.35)'}}><DI n="flag" s={1.8} style={{color:'var(--red)',flex:'0 0 auto'}}/><span><b>Art 664-78.</b> Prior owner <b>{l.ext}</b>'s arrears are an <b>external receivable</b> against the former owner — never this owner's balance. <span className="prov-retry" onClick={()=>window.FADGO('synb-arrears')}>View receivable</span></span></div>}
        {bundle && bundle.length>1 && <>
          <div className="dml" style={{marginTop:0}}>Bundle · {l.bundle} <span className="ct">{bundle.length} lots</span><span className="rule"/></div>
          <div className="panel" style={{padding:'4px 13px',marginBottom:16}}>
            {bundle.map((b,i)=>(<div key={i} className="drow"><span className="row" style={{gap:8}}><span className="pcodeD">{b.lot}</span><span className="faint mono" style={{fontSize:10.5}}>{b.mil} mil</span></span><span className="mono" style={{color:b.bal>0?'var(--red)':'var(--tx-3)'}}>{b.bal>0?FMT(b.bal):'settled'}</span></div>))}
            <div className="drow" style={{borderTop:'1px solid var(--line-2)'}}><span className="faint">One transfer, split across lots</span><span className="mono" style={{fontWeight:700}}>{FMT(bundle.reduce((a,b)=>a+Math.max(0,b.bal),0))} due</span></div>
          </div>
        </>}
        <div className="dml" style={{marginTop:0}}>Q2 statement <span className="rule"/></div>
        <div className="panel" style={{padding:'4px 13px'}}>
          {ledger.map((e,i)=>(<div key={i} className="drow"><span style={{fontSize:12.5}}>{e[0]}</span><span className="mono" style={{color:e[2]==='pay'?'var(--green)':e[2]==='credit'?'var(--green)':'var(--tx)'}}>{e[1]}</span></div>))}
          <div className="drow" style={{borderTop:'1px solid var(--line-2)'}}><span style={{fontWeight:600}}>Balance carried forward</span><span className="mono" style={{fontWeight:700,color:l.bal>0?'var(--red)':'var(--green)'}}>{l.bal<0?'+'+FMT(l.bal)+' cr':FMT(l.bal)}</span></div>
        </div>
        <div className="dml" style={{marginTop:18}}>Contact <span className="rule"/></div>
        <div className="panel" style={{padding:'4px 13px'}}>
          <div className="drow"><span className="faint">Data confirmation</span><span className={"bdg "+(l.tentative?'amber':'green')}>{l.tentative?'pending':'confirmed'}</span></div>
          <div className="drow" style={{borderBottom:'none'}}><span className="faint">Conseil Syndical</span><span>{l.cs?<span className="bdg violet">CS member · manual</span>:'—'}</span></div>
        </div>
      </div>
      <div className="tdfoot">
        <button className="dbtn ghost" onClick={()=>T('Statement PDF generated · '+(l.lang==='FR'?'FR':'EN'))}><DI n="doc" s={1.8}/> Statement</button>
        <button className="dbtn ghost" onClick={()=>T('Attestation requested')}>Attestation</button>
        <span className="grow"/>
        {l.bal>0 && !l.tentative && <button className="dbtn" onClick={()=>T('Reminder sent to '+l.owner.split(',')[0])}><DI n="msg" s={1.8}/> Send reminder</button>}
        <button className="dbtn primary" onClick={()=>T('Logged a payment')}><DI n="plus" s={2}/> Log payment</button>
      </div>
    </aside>
  </>);
}
function LotDrawerHost(){
  const [lot,setLot]=React.useState(null);
  React.useEffect(()=>{ window.__SYNLOT=setLot; return ()=>{window.__SYNLOT=null;}; },[]);
  return <LotDrawer lot={lot} onClose={()=>setLot(null)}/>;
}

/* ---------------- D · Charges & statements ---------------- */
function ScreenSyndicCharges(){
  const [rate,setRate]=React.useState(GBH.rate);
  const [run,setRun]=React.useState(false);
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const perLot=l=>l.mil*rate*3;
  const total=LOTS.reduce((a,l)=>a+perLot(l),0);
  const arrearsCF=LOTS.reduce((a,l)=>a+Math.max(0,l.bal),0);
  return (
    <BuildingHead active="synb-charges"
      actions={<><button className="dbtn ghost" onClick={()=>T('Previewing statement')}>Preview statement</button><button className="dbtn primary" onClick={()=>{setRun(true);T('Q3 statements generated · 16 lots','green');}}><DI n="coin" s={1.8}/> Generate Q3 run</button></>}>
      <div className="fai">
        <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday</span></div>
        <p>Q3 charge = <b>millième × rate × 3 months + carried arrears</b>. Rate is a forward-only parameter — changing it bills the next quarter; it never re-rates a locked quarter. An AGM may revise it, crediting the difference forward.</p>
      </div>
      <div className="grid4" style={{marginTop:14}}>
        <div className="panel" style={{padding:'14px 16px'}}>
          <div className="faint mono" style={{fontSize:9,letterSpacing:'.1em',textTransform:'uppercase'}}>Rate · Q3 2026</div>
          <div className="row" style={{gap:10,alignItems:'center',marginTop:8}}>
            <button className="dbtn sm ghost" onClick={()=>setRate(r=>Math.max(1,r-1))}>−</button>
            <span className="mono" style={{fontSize:22,fontWeight:700}}>Rs {rate}</span>
            <button className="dbtn sm ghost" onClick={()=>setRate(r=>r+1)}>+</button>
            <span className="faint" style={{fontSize:11}}>/ millième</span>
          </div>
          {rate!==GBH.rate && <div className="bdg amber" style={{marginTop:8}}>revised from Rs {GBH.rate} · forward only</div>}
        </div>
        <div className="statc"><div className="n">{FMT(total)}</div><div className="l">Q3 call · {LOTS.length} lots</div></div>
        <div className="statc amber"><div className="n">{FMT(arrearsCF)}</div><div className="l">Arrears carried forward</div></div>
        <div className="statc"><div className="n">{FMT(total+arrearsCF)}</div><div className="l">Total to bill</div></div>
      </div>
      <div className="between" style={{margin:'18px 0 8px'}}><div className="dml" style={{margin:0}}>Per-lot statement preview <span className="rule"/></div><span className={"bdg "+(run?'green':'gray')}>{run?'generated':'draft'}</span></div>
      <div className="panel" style={{padding:'10px 6px'}}>
        <table className="tbl"><thead><tr><th>Lot</th><th>Owner</th><th style={{textAlign:'right'}}>Millième</th><th style={{textAlign:'right'}}>Q3 charge</th><th style={{textAlign:'right'}}>+ Arrears</th><th style={{textAlign:'right'}}>Statement total</th><th>Status</th></tr></thead>
          <tbody>{LOTS.map((l,i)=>(<tr key={i}>
            <td><span className="pcodeD">{l.lot}</span></td><td className="tt">{l.owner}</td>
            <td className="mono faint" style={{textAlign:'right'}}>{l.mil}</td>
            <td className="mono" style={{textAlign:'right'}}>{FMT(perLot(l))}</td>
            <td className="mono faint" style={{textAlign:'right',color:l.bal>0?'var(--amber)':'var(--tx-3)'}}>{l.bal>0?FMT(l.bal):l.bal<0?'−'+FMT(l.bal):'—'}</td>
            <td className="mono" style={{textAlign:'right',fontWeight:600}}>{FMT(perLot(l)+l.bal)}</td>
            <td>{run?<span className="bdg green dot">sent</span>:<span className="bdg gray">draft</span>}{l.lang==='FR'&&<span className="synflag" style={{marginLeft:5}}>FR</span>}</td>
          </tr>))}</tbody>
        </table>
      </div>
      <div className="gate" style={{borderStyle:'solid',marginTop:12}}><span style={{color:'var(--indigo-bright)'}}><DI n="shield" s={1.7}/></span><span>Statements go out <b>individually</b> once contacts are on file (privacy) — the shared WhatsApp link is a first-cycle fallback only. FR owners get the French statement.</span></div>
    </BuildingHead>
  );
}

/* ---------------- E · Payments & bank reconciliation ---------------- */
const BANK_TXNS=[
  {ref:'A6 DTS Q2 2026',amt:35856,date:'14 May',lot:'A6',match:'auto'},
  {ref:'JUICE B3 MAYEVEN',amt:38160,date:'12 May',lot:'B3+C5',match:'bundle'},
  {ref:'TRANSFER 664 GBH',amt:18000,date:'9 May',lot:null,match:'unmatched'},
  {ref:'C3 LIM Q2',amt:21000,date:'7 May',lot:'C3',match:'auto'},
  {ref:'IB KASSEEAH',amt:18000,date:'5 May',lot:'C1+B6',match:'bundle'},
  {ref:'CASH DEPOSIT',amt:6000,date:'3 May',lot:null,match:'unmatched'},
];
function ScreenSyndicPayments(){
  const [txns,setTxns]=React.useState(BANK_TXNS);
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const unmatched=txns.filter(t=>t.match==='unmatched');
  const assign=(i)=>{ setTxns(p=>p.map((t,k)=>k===i?{...t,match:'manual',lot:'D2'}:t)); T('Matched to D2 · Okeke','green'); };
  const mt={auto:['green','auto-matched'],bundle:['violet','bundle split'],manual:['green','manually assigned'],unmatched:['red','unmatched']};
  const collected=GBH.due-GBH.outstanding;
  return (
    <BuildingHead active="synb-payments"
      actions={<><button className="dbtn ghost" onClick={()=>T('MCB CSV imported · 6 transactions')}><DI n="plus" s={2}/> Import MCB statement</button></>}>
      <div className="grid4">
        <div className="statc"><div className="n">{FMT(GBH.cash)}</div><div className="l">Running balance</div></div>
        <div className="statc green"><div className="n">{FMT(collected)}</div><div className="l">Collected · Q2</div></div>
        <div className="statc amber"><div className="n">{unmatched.length}</div><div className="l">Unmatched</div></div>
        <div className="statc"><div className="n">36.8%</div><div className="l">of {FMT(GBH.due)} called</div></div>
      </div>
      <div className="fai" style={{marginTop:14}}>
        <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday</span></div>
        <p>Auto-matched on the <b className="hl">[Lot][Surname][Quarter][Year]</b> reference pattern. {unmatched.length} transfers had no usable reference — assign them by hand. Bundle transfers (one owner, several lots) are split across lots automatically.</p>
      </div>
      {unmatched.length>0 && <>
        <div className="dml" style={{marginTop:16}}>Unmatched queue <span className="ct">{unmatched.length}</span><span className="rule"/></div>
        <div className="panel" style={{padding:'2px 14px'}}>
          {txns.map((t,i)=>t.match==='unmatched'&&(
            <div key={i} className="drow"><span className="row" style={{gap:10}}><span className="adot rev"/><span className="mono" style={{fontSize:12}}>{t.ref}</span><span className="faint mono" style={{fontSize:10}}>{t.date}</span></span>
              <span className="row" style={{gap:10}}><span className="mono" style={{fontWeight:600}}>{FMT(t.amt)}</span><button className="dbtn sm primary" onClick={()=>assign(i)}>Assign lot</button></span></div>
          ))}
        </div>
      </>}
      <div className="dml" style={{marginTop:16}}>Bank ledger · MCB <span className="ct">1 Apr – 29 May</span><span className="rule"/></div>
      <div className="panel" style={{padding:'10px 6px'}}>
        <table className="tbl"><thead><tr><th>Date</th><th>Reference</th><th>Lot(s)</th><th style={{textAlign:'right'}}>Amount</th><th>Match</th></tr></thead>
          <tbody>{txns.map((t,i)=>(<tr key={i}>
            <td className="mono faint">{t.date}</td><td className="mono" style={{fontSize:11.5}}>{t.ref}</td>
            <td>{t.lot?<span className="pcodeD">{t.lot}</span>:<span className="faint">—</span>}</td>
            <td className="mono" style={{textAlign:'right',fontWeight:600,color:'var(--green)'}}>+{FMT(t.amt)}</td>
            <td><span className={"bdg "+mt[t.match][0]+(t.match==='unmatched'?'':' dot')}>{mt[t.match][1]}</span></td>
          </tr>))}</tbody>
        </table>
      </div>
    </BuildingHead>
  );
}

/* ---------------- F · Arrears & collections ---------------- */
function ScreenSyndicArrears(){
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const arr=LOTS.filter(l=>l.bal>0&&!l.tentative).sort((a,b)=>b.bal-a.bal);
  const STAGE={B1:'mise en demeure',B2:'mise en demeure',B7:'mise en demeure',C1:'reminder',B6:'reminder',D2:'reminder',A1:'reminder'};
  const NEXT={reminder:['Day 30 · formal letter','amber'],'mise en demeure':['Day 60 · legal escalation','red']};
  const bucket=b=>b>40000?'90+':b>20000?'61-90':b>8000?'31-60':'0-30';
  return (
    <BuildingHead active="synb-arrears"
      actions={<><button className="dbtn ghost" onClick={()=>T('Arrears book exported')}>Export book</button><button className="dbtn primary" onClick={()=>T('Reminders queued · Day-14 auto-send','green')}><DI n="msg" s={1.8}/> Run reminders</button></>}>
      <div className="grid4">
        <div className="statc red"><div className="n">{FMT(GBH.outstanding)}</div><div className="l">Total arrears</div></div>
        <div className="statc"><div className="n">{arr.length}</div><div className="l">Lots in arrears</div></div>
        <div className="statc amber"><div className="n">Rs 116,964</div><div className="l">Noordally bundle · biggest</div></div>
        <div className="statc"><div className="n">1</div><div className="l">External receivable</div></div>
      </div>
      <div className="fai" style={{marginTop:14}}>
        <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday · priority list</span></div>
        <p>Chase highest balance first. The <b className="hl">Noordally bundle (B1·B2·B7)</b> is one owner across 3 lots — leverage: opposition at sale (Art 664-78) on any of the three. CS-sensitive owners are never auto-escalated or named publicly.</p>
      </div>
      <div className="dml" style={{marginTop:16}}>Priority list <span className="ct">highest balance first</span><span className="rule"/></div>
      <div className="panel" style={{padding:'10px 6px'}}>
        <table className="tbl"><thead><tr><th>Lot</th><th>Owner</th><th style={{textAlign:'right'}}>Balance</th><th>Age</th><th>Stage</th><th>Next step</th><th></th></tr></thead>
          <tbody>{arr.map((l,i)=>{const st=STAGE[l.lot]||'reminder';const nx=NEXT[st];return(<tr key={i} className="tdrow" onClick={()=>window.FADSYNDIC.openLot(l)}>
            <td><span className="pcodeD">{l.lot}</span>{l.bundle&&<span className="synflag" style={{marginLeft:5}}>{l.bundle.slice(0,4)}…</span>}</td>
            <td className="tt">{l.owner}{l.cs&&<span className="synflag violet" style={{marginLeft:6}}>CS · manual</span>}</td>
            <td className="mono" style={{textAlign:'right',fontWeight:700,color:'var(--red)'}}>{FMT(l.bal)}</td>
            <td><span className="faint mono" style={{fontSize:10.5}}>{bucket(l.bal)} d</span></td>
            <td><span className={"bdg "+(st==='mise en demeure'?'red':'amber')}>{st}</span></td>
            <td className="faint" style={{fontSize:11,color:'var(--'+nx[1]+')'}}>{nx[0]}</td>
            <td style={{textAlign:'right'}}><button className="dbtn sm ghost" onClick={e=>{e.stopPropagation();T(st==='mise en demeure'?'Mise en demeure drafted · awaiting Ishant':'Reminder sent');}}>{st==='mise en demeure'?'Draft MED':'Remind'}</button></td>
          </tr>);})}</tbody>
        </table>
      </div>
      <div className="dml" style={{marginTop:16}}>External receivables <span className="ct">former owners · separate track</span><span className="rule"/></div>
      <div className="panel" style={{padding:'12px 14px'}}>
        <div className="between"><div><div style={{fontWeight:600,fontSize:13}}>Noordally (former) · A7 sold to Baraka</div><div className="faint" style={{fontSize:11,marginTop:2}}>Pre-sale arrears · recovery against the former owner, never the new owner (Art 664-78). Leverage: remaining Noordally lots B1·B2·B7.</div></div>
          <div style={{textAlign:'right'}}><div className="mono" style={{fontWeight:700,color:'var(--red)'}}>Rs 27,500</div><span className="bdg amber" style={{marginTop:3}}>mise en demeure</span></div></div>
      </div>
    </BuildingHead>
  );
}

/* ---------------- G · AGM / meeting lifecycle ---------------- */
const AGM_RES = [
  {n:1,t:'Approve the 2026 operating budget',maj:'ordinary',basis:'Art 664-33 · routine'},
  {n:2,t:'Confirm Friday Retreats as syndic + mandate terms',maj:'abs',basis:'Art 664-35 · absolute majority'},
  {n:3,t:'Lift refurbishment — Rs 480,000 major works',maj:'two3',basis:'Art 664-37 · two-thirds'},
  {n:4,t:'Special call · Rs 8/millième over 2 instalments',maj:'abs',basis:'Art 664-35 · absolute majority'},
  {n:5,t:'Amend règlement — short-let clause',maj:'unan',basis:'Unanimity required'},
];
const MAJ = { ordinary:'Ordinary', abs:'664-35 absolute', two3:'664-37 two-thirds', unan:'Unanimity' };
function ScreenSyndicAGM(){
  const L=curLots(), TOTAL=L.reduce((a,l)=>a+l.mil,0);
  const [tab,setTab]=React.useState('voting');
  const [resN,setResN]=React.useState(2);
  const res=AGM_RES.find(r=>r.n===resN);
  // per-resolution vote map, default present lots 'for' with a couple dissenting
  const defaultVotes=()=>{ const v={}; L.forEach((l,i)=>{ v[l.lot]= l.tentative?'absent' : (i%7===3?'against':i%5===2?'abstain':'for'); }); return v; };
  const [votes,setVotes]=React.useState(defaultVotes);
  React.useEffect(()=>{ setVotes(defaultVotes()); },[resN]);
  const cycle={for:'against',against:'abstain',abstain:'absent',absent:'for'};
  const click=lot=>setVotes(v=>({...v,[lot]:cycle[v[lot]||'for']}));
  const tally={for:0,against:0,abstain:0,absent:0};
  L.forEach(l=>{tally[votes[l.lot]||'absent']+=l.mil;});
  const present=tally.for+tally.against+tally.abstain;
  // majority engine
  let result,rule,second=false;
  if(res.maj==='ordinary'){ result=tally.for>tally.against; rule='For > Against among voting voices'; }
  else if(res.maj==='abs'){ result=tally.for>TOTAL/2; rule='For > 50% of all '+TOTAL.toLocaleString()+' voices ('+(TOTAL/2).toLocaleString()+')'; if(!result&&tally.for>=TOTAL/3){second=true;} }
  else if(res.maj==='two3'){ result=tally.for>=TOTAL*2/3; rule='For ≥ ⅔ of all voices ('+Math.ceil(TOTAL*2/3).toLocaleString()+')'; }
  else { result=tally.for===TOTAL; rule='All '+TOTAL.toLocaleString()+' voices vote For'; }
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const vc={for:'green',against:'red',abstain:'amber',absent:'tx-3'};
  const att={present:L.filter(l=>['for','against','abstain'].includes(votes[l.lot])).length, proxy:3, absent:L.filter(l=>votes[l.lot]==='absent').length};
  const quorum=present>=TOTAL/2;

  return (
    <BuildingHead active="synb-agm"
      actions={<><span className="bdg amber">AGM · 12 Jun 2026</span><button className="dbtn ghost" onClick={()=>T('Voting CSV + draft PV exported')}>Export pack</button></>}>
      <div className="dtabs" style={{marginTop:2}}>
        {[['convoc','Convocation'],['attend','Attendance & proxy'],['voting','Voting'],['minutes','Minutes / PV']].map(t=>(
          <span key={t[0]} className={"dtab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}</span>
        ))}
      </div>

      {tab==='convoc' && <SynConvoc T={T}/>}

      {tab==='attend' && <>
        <div className="grid4" style={{marginTop:6}}>
          <div className={"statc "+(quorum?'green':'red')}><div className="n">{Math.round(present/TOTAL*100)}%</div><div className="l">Quorum · need 50%</div></div>
          <div className="statc"><div className="n">{att.present}</div><div className="l">Present</div></div>
          <div className="statc"><div className="n">{att.proxy}</div><div className="l">By proxy</div></div>
          <div className="statc amber"><div className="n">{att.absent}</div><div className="l">Absent</div></div>
        </div>
        <div className="fbar" style={{marginTop:12}}><span className="fi" style={{color:quorum?'var(--green)':'var(--red)'}}><DI n="shield" s={1.7}/></span><span className="ft" style={{fontSize:11.5}}>{quorum?<>Quorum met — {present.toLocaleString()} of {TOTAL.toLocaleString()} voices present or represented.</>:<>Quorum not yet met. A proxy holder may carry up to 3 delegations (unless that exceeds 20% of voices). Syndic, spouse & family cannot hold mandates.</>}</span></div>
        <div className="dml" style={{marginTop:14}}>Register <span className="rule"/></div>
        <div className="panel" style={{padding:'10px 6px'}}>
          <table className="tbl"><thead><tr><th>Lot</th><th>Owner</th><th style={{textAlign:'right'}}>Millième</th><th>Status</th><th>Proxy holder</th></tr></thead>
            <tbody>{L.map((l,i)=>{const s=votes[l.lot]==='absent'?(i%4===1?'proxy':'absent'):'present';return(<tr key={i}>
              <td><span className="pcodeD">{l.lot}</span></td><td className="tt">{l.owner}</td><td className="mono faint" style={{textAlign:'right'}}>{l.mil}</td>
              <td><span className={"bdg "+(s==='present'?'green':s==='proxy'?'violet':'gray')+(s==='absent'?'':' dot')}>{s}</span></td>
              <td className="faint" style={{fontSize:11.5}}>{s==='proxy'?'CS Chair · Pillay':'—'}</td>
            </tr>);})}</tbody>
          </table>
        </div>
      </>}

      {tab==='voting' && <div className="agmlay">
        <div className="agm-reslist">
          <div className="dml" style={{margin:'4px 0 8px'}}>Resolutions <span className="ct">{AGM_RES.length}</span><span className="rule"/></div>
          {AGM_RES.map(r=>(
            <div key={r.n} className={"agm-res"+(r.n===resN?' on':'')} onClick={()=>setResN(r.n)}>
              <span className="agm-resn">R{r.n}</span>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:r.n===resN?600:500,lineHeight:1.35}}>{r.t}</div><div className="faint mono" style={{fontSize:9,marginTop:3}}>{MAJ[r.maj]}</div></div>
            </div>
          ))}
        </div>
        <div className="agm-calc">
          <div className="between"><div><div className="faint mono" style={{fontSize:9,letterSpacing:'.1em'}}>RESOLUTION {res.n} · {res.basis}</div><div style={{fontSize:15,fontWeight:600,marginTop:4,maxWidth:520}}>{res.t}</div></div>
            <span className={"agm-result "+(result?'pass':second?'second':'fail')}>{result?'ADOPTED':second?'SECOND VOTE':'NOT ADOPTED'}</span></div>
          <div className="agm-bars">
            {[['for','For'],['against','Against'],['abstain','Abstain'],['absent','Absent']].map(k=>(
              <div key={k[0]} className="agm-barrow"><span className="agm-barl" style={{color:'var(--'+vc[k[0]]+')'}}>{k[1]}</span>
                <span className="agm-bartrack"><i style={{width:(tally[k[0]]/TOTAL*100)+'%',background:'var(--'+vc[k[0]]+')'}}/></span>
                <span className="mono" style={{fontSize:11,width:80,textAlign:'right'}}>{tally[k[0]].toLocaleString()} <span className="faint">mil</span></span></div>
            ))}
          </div>
          <div className="gate" style={{borderStyle:'solid',margin:'12px 0'}}><DI n="shield" s={1.7} style={{color:result?'var(--green)':second?'var(--amber)':'var(--red)',flex:'0 0 auto'}}/><span><b>{MAJ[res.maj]}.</b> {rule}. {second&&'For reached ≥⅓ — eligible for an immediate second vote at ordinary majority. '}<b>{result?'Passed.':second?'Failed absolute — second vote allowed.':'Failed.'}</b></span></div>
          <div className="dml" style={{margin:'4px 0 8px'}}>Vote per lot <span className="ct">tap a lot to cycle for → against → abstain → absent</span><span className="rule"/></div>
          <div className="agm-grid">
            {L.map(l=>(<span key={l.lot} className={"agm-chip "+(votes[l.lot]||'absent')} onClick={()=>click(l.lot)} title={l.owner+' · '+l.mil+' mil'}>{l.lot}</span>))}
          </div>
          <div className="row" style={{gap:8,marginTop:14}}>
            <button className="dbtn primary sm" onClick={()=>T('Resolution '+res.n+' recorded · '+(result?'adopted':second?'second vote':'not adopted'),result?'green':'red')}><DI n="check" s={2}/> Record result</button>
            {second && <button className="dbtn sm" onClick={()=>T('Second vote opened · ordinary majority')}>Open second vote</button>}
          </div>
        </div>
      </div>}

      {tab==='minutes' && <SynMinutes res={AGM_RES} T={T}/>}
    </BuildingHead>
  );
}
function SynConvoc({T}){
  const [sent,setSent]=React.useState(false);
  const noticeDays=18;
  return (<>
    <div className="fai" style={{marginTop:6}}>
      <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday</span></div>
      <p>Convocation pack = <b>notice + agenda + draft resolutions + proxy form</b>. The 15-day notice rule (Art 664-26) is reception-based — Friday blocks sending if the meeting is too close.</p>
    </div>
    <div className="grid4" style={{marginTop:14}}>
      <div className={"statc "+(noticeDays>=15?'green':'red')}><div className="n">{noticeDays} d</div><div className="l">Notice · need ≥15</div></div>
      <div className="statc"><div className="n">5</div><div className="l">Draft resolutions</div></div>
      <div className="statc"><div className="n">16</div><div className="l">Owners to notify</div></div>
      <div className="statc"><div className="n">EN · FR</div><div className="l">Per language pref</div></div>
    </div>
    <div className="dml" style={{marginTop:16}}>Convocation builder <span className="rule"/></div>
    <div className="panel" style={{padding:'4px 14px'}}>
      {[['Notice of meeting','12 Jun 2026 · 17:30 · on-site + Google Meet'],['Agenda','16 items · imported from last AGM template'],['Draft resolutions','5 · with required majority per item'],['Proxy form','bilingual · max 3 delegations rule embedded'],['Magic links','unique per owner · attendance + proxy']].map((r,i)=>(
        <div key={i} className="drow"><span className="row" style={{gap:9}}><span className="adot ok"/>{r[0]}</span><span className="faint" style={{fontSize:11.5}}>{r[1]}</span></div>
      ))}
    </div>
    <div className="row" style={{gap:8,marginTop:14}}>
      <button className="dbtn ghost" onClick={()=>T('Convocation pack previewed (A4)')}><DI n="doc" s={1.8}/> Preview pack</button>
      <span className="grow"/>
      {sent? <span className="afdone"><DI n="check" s={2}/> Sent to 16 owners · magic links live</span>
        : <button className="dbtn primary" onClick={()=>{setSent(true);T('Convocation sent · 15-day notice met','green');}}><DI n="msg" s={1.8}/> Send convocation</button>}
    </div>
  </>);
}
function SynMinutes({res,T}){
  const [txt,setTxt]=React.useState('');
  const [gen,setGen]=React.useState(false);
  return (<>
    <div className="fai" style={{marginTop:6}}>
      <div className="fh"><span className="bdg indigo"><DI n="spark" s={1.6}/> Friday</span></div>
      <p>Record the meeting on Google Meet or a recorder, then <b>paste the transcript</b> — Friday drafts the procès-verbal from the resolution tally, attendance and your notes. The CS Chair + Secretary approve before it's distributed (dissenters flagged, Art 664-34).</p>
    </div>
    <div className="grid2" style={{marginTop:14,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,alignItems:'start'}}>
      <div>
        <div className="dml" style={{margin:'0 0 8px'}}>Transcript <span className="ct">paste-in</span><span className="rule"/></div>
        <textarea className="tdcomp-in" style={{width:'100%',minHeight:150,lineHeight:1.5,resize:'vertical'}} placeholder="Paste the meeting transcript (Fathom / Google Meet / Otter)…" value={txt} onChange={e=>setTxt(e.target.value)}/>
        <div className="row" style={{gap:8,marginTop:9}}>
          <button className="dbtn ghost sm" onClick={()=>{setTxt('[00:02] Chair opens the meeting, quorum confirmed at 68%.\n[00:14] R1 budget — adopted unanimously.\n[00:31] R2 syndic mandate — adopted, absolute majority.\n[00:52] R3 lift works — failed two-thirds, deferred.\n[01:10] AOB: insurance renewal actioned to Friday.');T('Sample transcript loaded');}}>Load sample</button>
          <button className="dbtn primary sm" disabled={!txt.trim()} style={{opacity:txt.trim()?1:.5}} onClick={()=>{setGen(true);T('Draft PV generated','green');}}><DI n="spark" s={1.7}/> Generate draft PV</button>
        </div>
      </div>
      <div>
        <div className="dml" style={{margin:'0 0 8px'}}>Draft procès-verbal <span className="rule"/></div>
        {gen? <div className="doc-a4">
          <div className="doc-h"><b>Friday Retreats</b><span>Procès-verbal · AGM</span></div>
          <div className="doc-b">
            <div className="doc-title">Procès-verbal de l'Assemblée Générale</div>
            <div className="doc-sub">Grand Baie Heights · 12 juin 2026</div>
            <p><b>Présents / représentés :</b> quorum 68% atteint.</p>
            <table className="doc-tbl"><tbody>
              {res.map(r=>(<tr key={r.n}><td>R{r.n} · {r.t}</td><td>{r.n===3?'Non adoptée':'Adoptée'}</td></tr>))}
            </tbody></table>
            <p className="faint" style={{fontSize:10}}>Les copropriétaires absents ou dissidents seront notifiés (Art 664-34).</p>
          </div>
        </div> : <div className="tdempty" style={{padding:'40px 0'}}><span className="tdempty-ic"><DI n="doc" s={1.6}/></span><div style={{fontWeight:600,fontSize:13}}>No draft yet</div><div className="faint" style={{fontSize:11.5}}>Paste a transcript and generate.</div></div>}
        {gen && <div className="row" style={{gap:8,marginTop:10}}><button className="dbtn green sm" onClick={()=>T('PV approved · distributing to owners','green')}><DI n="check" s={2}/> Approve & distribute</button><button className="dbtn ghost sm" onClick={()=>T('Opened to edit')}>Edit</button></div>}
      </div>
    </div>
  </>);
}

/* ---------------- I · Documents + A4 previews + attestation ---------------- */
const DOC_TYPES=[
  ['statement','Statements','doc',16,'Per-lot quarterly · EN/FR'],
  ['convoc','Convocation packs','cal',1,'Notice + agenda + resolutions'],
  ['pv','Minutes / PV','doc',2,'Procès-verbaux'],
  ['attest','Attestations','shield',3,'État daté · for sales'],
  ['notice','Notices & letters','msg',5,'Reminders, announcements'],
  ['med','Mises en demeure','flag',2,'Registered-letter drafts'],
];
const ATTEST=[
  {lot:'C3',owner:'Lim, A.',stage:4,fee:'free'},
  {lot:'B6',owner:'Kasseeah, D.',stage:2,fee:'Rs 1,500 + VAT'},
  {lot:'A6',owner:'Dts Investments',stage:1,fee:'free'},
];
const ATTEST_STAGES=['Requested','Décompte issued','Payment received','Attestation issued','Delivered to notary'];
function ScreenSyndicDocs(){
  const [doc,setDoc]=React.useState(null);
  const T=t=>window.fadToast&&window.fadToast(t);
  return (
    <BuildingHead active="synb-docs"
      actions={<><button className="dbtn ghost" onClick={()=>T('Document ingested from prior syndic')}><DI n="plus" s={2}/> Ingest document</button><button className="dbtn primary" onClick={()=>setDoc('statement')}><DI n="doc" s={1.8}/> New document</button></>}>
      <div className="dml" style={{marginTop:4}}>Library <span className="rule"/></div>
      <div className="grid3">
        {DOC_TYPES.map(d=>(
          <div key={d[0]} className="panel tap modcard" onClick={()=>setDoc(d[0])}>
            <span className="modic"><DI n={d[2]} s={1.7}/></span>
            <div style={{minWidth:0}}><div className="row" style={{gap:7}}><span style={{fontWeight:600,fontSize:13.5}}>{d[1]}</span><span className="faint mono" style={{fontSize:10}}>{d[3]}</span></div><div className="faint" style={{fontSize:11.5,marginTop:2}}>{d[4]}</div></div>
            <span className="modgo"><DI n="chevR" s={2}/></span>
          </div>
        ))}
      </div>
      <div className="between" style={{margin:'18px 0 8px'}}><div className="dml" style={{margin:0}}>État daté · attestation requests <span className="ct">{ATTEST.length}</span><span className="rule"/></div><span className="faint mono" style={{fontSize:10}}>first request free · repeat Rs 1,500 + VAT</span></div>
      <div className="panel" style={{padding:'2px 14px'}}>
        {ATTEST.map((a,i)=>(
          <div key={i} className="attest-row">
            <span className="row" style={{gap:9,flex:'0 0 200px'}}><span className="pcodeD">{a.lot}</span><span style={{fontSize:12.5}}>{a.owner}</span></span>
            <div className="attest-pipe">
              {ATTEST_STAGES.map((s,k)=>(
                <span key={k} className={"attest-step"+(k<a.stage?' done':k===a.stage?' now':'')} title={s}>
                  <span className="as-dot">{k<a.stage?<DI n="check" s={3}/>:k+1}</span>
                  {k<ATTEST_STAGES.length-1&&<span className="as-line"/>}
                </span>
              ))}
            </div>
            <span className="faint mono" style={{fontSize:10,flex:'0 0 90px',textAlign:'right'}}>{a.fee}</span>
            <button className="dbtn sm ghost" onClick={()=>setDoc('attest')}>{a.stage>=3?'View':'Advance'}</button>
          </div>
        ))}
      </div>
      <div className="gate" style={{borderStyle:'solid',marginTop:12}}><span style={{color:'var(--indigo-bright)'}}><DI n="spark" s={1.7}/></span><span>On payment match, Friday auto-generates the attestation with the <b>non-opposition clause (Art 664-78)</b> and any voted/pending special-call disclosures, then sends it to the owner + notary.</span></div>
      {doc && <DocPreview type={doc} onClose={()=>setDoc(null)}/>}
    </BuildingHead>
  );
}
function DocPreview({type,onClose}){
  const T=t=>window.fadToast&&window.fadToast(t);
  React.useEffect(()=>{const k=e=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[onClose]);
  const B=GBH;
  const BODIES={
    statement:{title:'Relevé de charges · Statement',sub:'Lot A1 · Ramphul V. · '+B.name+' · Q2 2026',rows:[['Charges Q2 (512 mil × Rs 12 × 3)','Rs 18,432'],['Arriérés reportés / arrears b/f','Rs 5,736'],['Règlements / payments reçus','− Rs 18,432'],['Solde dû / balance due','Rs 5,736']],note:'Paiement par virement JUICE · réf [Lot][Nom][Trimestre][Année].'},
    convoc:{title:'Convocation · Assemblée Générale',sub:B.name+' · 12 juin 2026 · 17h30',rows:[['Ordre du jour','16 points'],['Résolutions','5 · majorité requise indiquée'],['Préavis / notice','18 jours (≥15 requis · Art 664-26)'],['Procuration / proxy','formulaire joint']],note:'Magic-link individuel par copropriétaire pour présence & procuration.'},
    pv:{title:'Procès-verbal · AG',sub:B.name+' · 12 juin 2026',rows:[['R1 · Budget 2026','Adoptée'],['R2 · Mandat syndic','Adoptée · majorité absolue'],['R3 · Travaux ascenseur','Non adoptée · ⅔ requis'],['Quorum','68% présents/représentés']],note:'Absents & dissidents notifiés (Art 664-34).'},
    attest:{title:'Attestation · État daté',sub:'Lot C3 · Lim A. · '+B.name,rows:[['Millième','472 / 10,000'],['Solde à la date / balance','Rs 0 — à jour'],['Appels spéciaux votés','Néant'],['Non-opposition (Art 664-78)','valable jusqu\u2019au 31 déc 2026']],note:'Délivrée au notaire pour la vente du lot.'},
    notice:{title:'Avis aux copropriétaires',sub:B.name,rows:[['Objet','Coupure d\u2019eau · Tamarin 14h–16h'],['Date','jeudi 5 juin'],['Action','prévoir une réserve d\u2019eau']],note:'Envoyé par WhatsApp groupe + email individuel.'},
    med:{title:'Mise en demeure',sub:'Lot B1 · Noordally R. · '+B.name,rows:[['Montant dû','Rs 49,140'],['Délai / deadline','15 jours'],['Références légales','Art 664-78 · 664-111'],['Étape suivante','escalade légale']],note:'Brouillon — approbation d\u2019Ishant requise avant envoi recommandé.'},
  };
  const d=BODIES[type]||BODIES.statement;
  return (<>
    <div className="tdscrim" onClick={onClose}/>
    <div className="docmodal">
      <div className="between" style={{marginBottom:12}}><span className="faint mono" style={{fontSize:10,letterSpacing:'.1em'}}>A4 PREVIEW · EN/FR</span><span className="icbtn" style={{cursor:'pointer'}} onClick={onClose}><DI n="x" s={2}/></span></div>
      <div className="doc-a4">
        <div className="doc-h"><b>Friday Retreats</b><span>{B.name} · Syndic</span></div>
        <div className="doc-b">
          <div className="doc-title">{d.title}</div>
          <div className="doc-sub">{d.sub}</div>
          <table className="doc-tbl"><tbody>{d.rows.map((r,i)=><tr key={i}><td>{r[0]}</td><td>{r[1]}</td></tr>)}</tbody></table>
          <p className="faint" style={{fontSize:10}}>{d.note}</p>
          <div style={{marginTop:18,fontSize:10,color:'#5a6678'}}>Friday Retreats · syndic@friday.mu · friday.mu</div>
        </div>
      </div>
      <div className="row" style={{gap:8,marginTop:14,justifyContent:'flex-end'}}>
        <button className="dbtn ghost sm" onClick={()=>T('PDF downloaded')}><DI n="doc" s={1.7}/> PDF</button>
        <button className="dbtn primary sm" onClick={()=>{T('Sent to owners','green');onClose();}}><DI n="msg" s={1.7}/> Send to owners</button>
      </div>
    </div>
  </>);
}

/* ---------------- H · Onboarding wizard ---------------- */
function ScreenSyndicOnboard(){
  const STEPS=[
    {t:'Ingest prior-syndic documents',d:'Upload the règlement de copropriété, prior accounts, owner register and EGM minutes. Friday extracts lots, millièmes and owners.',body:[['Règlement de copropriété','received','ok'],['Prior accounts (12 mo)','received','ok'],['Owner register','partial · Nasani','warn'],['EGM minutes','outstanding','warn']]},
    {t:'Build the lot & millième register',d:'Confirm each lot, type and millième split. Total must reconcile to the règlement.',body:[['Lots detected','32','ok'],['Apartments / parking','24 / 8','ok'],['Millièmes total','10,000','ok'],['Unmatched lots','0','ok']]},
    {t:'Reconcile historical arrears',d:'Derive each lot\u2019s opening arrears from the prior payment history. Pre-handover arrears are kept separate from pre-mandate Q1.',body:[['Opening arrears derived','28 / 32 lots','warn'],['Pre-handover vs Q1 split','kept separate','ok'],['Disputed / unclear','4 lots','warn']]},
    {t:'Set budget & rate',d:'Enter the annual budget, the per-millième quarterly rate, and the reserve provision.',body:[['Annual budget','Rs 1.92M','ok'],['Q2 rate','Rs 12 / millième','ok'],['Reserve provision','Rs 8/mil · separate line','ok']]},
    {t:'Mandate draft',d:'Friday operates on the CS resolution while the signed mandate is routed for signature.',body:[['CS resolution','on file','ok'],['Signed mandate','draft · Xodo Sign','warn'],['Fee accrual','accrued, not invoiced','warn']]},
    {t:'First statement run',d:'Generate and distribute the first quarterly statements to all confirmed owners.',body:[['Statements ready','32','ok'],['Contacts on file','27 / 32','warn'],['Send method','individual · group fallback','ok']]},
  ];
  const [i,setI]=React.useState(0);
  const s=STEPS[i],last=i===STEPS.length-1;
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  return (
    <Shell active="syndic" eyebrow={<><span style={{cursor:'pointer'}} onClick={()=>window.FADGO('syndic')}>SYNDIC</span> <span style={{opacity:.5}}>›</span> ONBOARD</>}
      title="Onboard a building" sub="Guided takeover from a prior syndic">
      <div className="wiz" style={{position:'static',transform:'none',width:'auto',height:'auto',maxHeight:'none',margin:'8px 0'}}>
        <div className="wiz-side">
          <div className="wiz-eyebrow"><DI n="building" s={1.6}/> TAKEOVER</div>
          <div className="wiz-title">New building</div>
          <div className="wiz-steps">
            {STEPS.map((st,k)=>(<div key={k} className={"wiz-step"+(k===i?' on':'')+(k<i?' done':'')} onClick={()=>k<=i&&setI(k)}><span className="ws-dot">{k<i?<DI n="check" s={3}/>:k+1}</span><span>{st.t}</span></div>))}
          </div>
        </div>
        <div className="wiz-main">
          <div className="faint mono" style={{fontSize:10}}>STEP {i+1} OF {STEPS.length}</div>
          <h2 className="wiz-h">{s.t}</h2>
          <p className="wiz-d">{s.d}</p>
          <div className="wiz-prog"><i style={{width:((i+1)/STEPS.length*100)+'%'}}/></div>
          <div className="panel" style={{padding:'4px 14px',marginTop:16}}>
            {s.body.map((b,k)=>(<div key={k} className="drow"><span className="faint">{b[0]}</span><span className="row" style={{gap:8}}><span className="mono" style={{color:b[2]==='warn'?'var(--amber)':'var(--tx)'}}>{b[1]}</span><span className={"adot "+(b[2]==='warn'?'rev':'ok')}/></span></div>))}
          </div>
          <div className="wiz-foot">
            {i>0&&<button className="dbtn ghost" onClick={()=>setI(i-1)}><DI n="chevL" s={2}/> Back</button>}
            <span className="grow"/>
            {last?<button className="dbtn green" onClick={()=>{T('Building onboarded · first statements queued','green');window.FADGO('syndic');}}><DI n="check" s={2}/> Finish onboarding</button>
              :<button className="dbtn primary" onClick={()=>setI(i+1)}><DI n="check" s={2}/> Continue</button>}
          </div>
        </div>
      </div>
    </Shell>
  );
}

/* ---------------- K · Owner magic-link portal ---------------- */
function SyndicPortal(){
  const [tab,setTab]=React.useState('balance');
  const [att,setAtt]=React.useState(null);
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  return (
    <div className="portal-wrap">
      <div className="portal">
        <div className="portal-h">
          <div className="row" style={{gap:9}}><span className="portal-mk">✦</span><div><div style={{fontWeight:600,fontSize:14}}>Friday Retreats · Owner portal</div><div className="faint mono" style={{fontSize:10}}>magic link · no login · Lot A1 · Grand Baie Heights</div></div></div>
          <span className="bdg gray">EN · FR</span>
        </div>
        <div className="portal-tabs">{[['balance','Balance'],['statement','Statement'],['agm','AGM'],['attest','Attestation'],['data','My details']].map(t=><span key={t[0]} className={"portal-tab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}</span>)}</div>
        <div className="portal-body">
          {tab==='balance' && <>
            <div className="portal-bal"><div className="faint mono" style={{fontSize:10,letterSpacing:'.1em'}}>CURRENT BALANCE</div><div className="pb-amt">Rs 5,736 <span className="faint" style={{fontSize:13}}>due</span></div><div className="faint" style={{fontSize:11.5,marginTop:4}}>Q2 2026 · includes Rs 5,736 carried forward</div></div>
            <button className="dbtn primary" style={{width:'100%',marginTop:12}}><DI n="coin" s={1.8}/> Pay by JUICE / transfer</button>
            <div className="faint" style={{fontSize:10.5,textAlign:'center',marginTop:8}}>Reference: A1 Ramphul Q2 2026</div>
          </>}
          {tab==='statement' && <div className="panel" style={{padding:'4px 13px'}}>{[['Q2 charge','Rs 18,432'],['Arrears b/f','Rs 5,736'],['Payments','− Rs 18,432'],['Balance due','Rs 5,736']].map((r,i)=><div key={i} className="drow"><span className={i===3?'':'faint'} style={i===3?{fontWeight:600}:{}}>{r[0]}</span><span className="mono" style={i===3?{fontWeight:700}:{}}>{r[1]}</span></div>)}<button className="dbtn ghost sm" style={{width:'100%',marginTop:10}}><DI n="doc" s={1.7}/> Download PDF (EN/FR)</button></div>}
          {tab==='agm' && <>
            <div className="gate" style={{borderStyle:'solid'}}><DI n="cal" s={1.7} style={{color:'var(--indigo-bright)',flex:'0 0 auto'}}/><span><b>AGM · 12 June, 17:30.</b> Confirm your attendance or assign a proxy.</span></div>
            <div className="row" style={{gap:7,marginTop:11}}><button className="dbtn primary sm" style={{flex:1}} onClick={()=>T('Attendance confirmed','green')}>I'll attend</button><button className="dbtn sm" style={{flex:1}} onClick={()=>T('Proxy form opened')}>Assign proxy</button><button className="dbtn ghost sm" style={{flex:1}} onClick={()=>T('Marked absent')}>Can't attend</button></div>
          </>}
          {tab==='attest' && <>
            {att?<div className="afdone"><DI n="check" s={2}/> Request received — we'll issue your décompte and email you the balance to clear.</div>
            :<><p style={{fontSize:12.5,lineHeight:1.5,color:'var(--tx-2)'}}>Selling your lot? Request an <b>état daté</b> (attestation) for your notary. First request is free.</p>
            <button className="dbtn primary" style={{width:'100%',marginTop:8}} onClick={()=>{setAtt(true);T('Attestation requested','green');}}><DI n="shield" s={1.8}/> Request attestation</button></>}
          </>}
          {tab==='data' && <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {[['Legal name','Ramphul, Vikash'],['NIC','R●●●●●●●●●●●'],['Email','v.ramphul@example.com'],['Phone / WhatsApp','+230 5●●● ●●●●'],['Language','English']].map((r,i)=>(<div key={i} className="portal-field"><span className="faint mono" style={{fontSize:9,letterSpacing:'.08em',textTransform:'uppercase'}}>{r[0]}</span><span style={{fontSize:13}}>{r[1]}</span></div>))}
            <button className="dbtn primary sm" style={{marginTop:6}} onClick={()=>T('Details confirmed — thank you','green')}><DI n="check" s={2}/> Confirm my details</button>
          </div>}
        </div>
      </div>
      <div className="faint mono" style={{fontSize:10,textAlign:'center',marginTop:14}}>This is the owner-facing view (magic-link). <span className="prov-retry" onClick={()=>window.FADGO('synb-docs')}>Back to operator</span></div>
    </div>
  );
}

/* ---------------- J · Compliance & vendors ---------------- */
function ScreenSyndicCompliance(){
  const B=curB(); const gbh=B.id==='gbh';
  const T=t=>window.fadToast&&window.fadToast(t);
  const ins = gbh ? [
    ['Fire & allied perils','Swan','lapsed','expired 31 Mar','red'],
    ['Professional indemnity (PI)','—','unbound','required','red'],
    ['Art 664-45 financial guarantee','—','unbound','required','red'],
  ] : [
    ['Fire & allied perils','Mauritius Union','current','renews 30 Nov','green'],
    ['Professional indemnity (PI)','Swan','current','renews 12 Jan','green'],
    ['Art 664-45 financial guarantee','Swan','current','bound','green'],
  ];
  const vendors=[
    ['Clean Co Ltd','Common-area cleaning','Rs 18,000 / mo','renews Aug'],
    ['LiftServ','Elevator maintenance','Rs 9,500 / mo','renews Oct'],
    ['GardenPro','Landscaping','Rs 6,000 / mo','auto-renew'],
  ];
  return (
    <BuildingHead active="synb-compliance"
      actions={<><button className="dbtn ghost" onClick={()=>T('Renewal reminders set')}>Set reminders</button>{gbh&&<button className="dbtn primary" onClick={()=>T('Insurance quote requested · Swan')}><DI n="shield" s={1.8}/> Bind insurance</button>}</>}>
      {gbh && <div className="statebanner red" style={{marginTop:4}}><DI n="alert" s={1.7}/><span><b>Insurance lapsed.</b> Fire/allied cover expired and PI + Art 664-45 guarantee are unbound — the building is exposed. Friday flagged this to the Conseil Syndical and drafted a quote request.</span></div>}
      <div className="dml" style={{marginTop:gbh?2:6}}>Insurance <span className="rule"/></div>
      <div className="panel" style={{padding:'10px 6px'}}>
        <table className="tbl"><thead><tr><th>Policy</th><th>Insurer</th><th>State</th><th style={{textAlign:'right'}}>Renewal</th></tr></thead>
          <tbody>{ins.map((p,i)=>(<tr key={i}><td className="tt">{p[0]}</td><td className="faint">{p[1]}</td><td><span className={"bdg "+p[4]+(p[2]==='current'?' dot':'')}>{p[2]}</span></td><td className="mono faint" style={{textAlign:'right'}}>{p[3]}</td></tr>))}</tbody>
        </table>
      </div>
      <div className="dml" style={{marginTop:16}}>Vendor contracts <span className="ct">{vendors.length}</span><span className="rule"/></div>
      <div className="panel" style={{padding:'10px 6px'}}>
        <table className="tbl"><thead><tr><th>Vendor</th><th>Service</th><th style={{textAlign:'right'}}>Monthly</th><th style={{textAlign:'right'}}>Term</th></tr></thead>
          <tbody>{vendors.map((v,i)=>(<tr key={i}><td className="tt">{v[0]}</td><td className="faint">{v[1]}</td><td className="mono" style={{textAlign:'right'}}>{v[2]}</td><td className="mono faint" style={{textAlign:'right'}}>{v[3]}</td></tr>))}</tbody>
        </table>
      </div>
      <div className="dtwocol" style={{marginTop:16,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,alignItems:'start'}}>
        <div className="panel">
          <div className="dml" style={{margin:'0 0 8px'}}>Mandate <span className="rule"/></div>
          <div className="drow"><span className="faint">State</span><span className={"bdg "+(gbh?'amber':'green')}>{B.mandateState}</span></div>
          <div className="drow"><span className="faint">Fee</span><span className="mono" style={{fontSize:11.5}}>{B.mandate}</span></div>
          <div className="drow" style={{borderBottom:'none'}}><span className="faint">Handover</span><span>{B.handover}</span></div>
        </div>
        <div className="panel">
          <div className="dml" style={{margin:'0 0 8px'}}>Friday receivable <span className="rule"/></div>
          {gbh ? <>
            <div className="drow"><span className="faint">Mgmt fees accrued</span><span className="mono" style={{color:'var(--amber)'}}>Rs 40,000 · not invoiced</span></div>
            <div className="drow"><span className="faint">Costs absorbed</span><span className="mono" style={{color:'var(--amber)'}}>Rs 28,400 · recoverable</span></div>
            <div className="drow" style={{borderBottom:'none'}}><span className="faint">Attestation fees</span><span className="mono">Rs 1,500 billed</span></div>
          </> : <>
            <div className="drow"><span className="faint">Mgmt fees</span><span className="mono" style={{color:'var(--green)'}}>invoiced monthly</span></div>
            <div className="drow" style={{borderBottom:'none'}}><span className="faint">Costs absorbed</span><span className="mono">none</span></div>
          </>}
        </div>
      </div>
    </BuildingHead>
  );
}

window.FADSYNDIC = { ScreenSyndicBuildings, ScreenSyndicOverview, ScreenSyndicOwners, ScreenSyndicCharges, ScreenSyndicPayments, ScreenSyndicArrears, ScreenSyndicAGM, ScreenSyndicDocs, ScreenSyndicOnboard, ScreenSyndicCompliance, SyndicPortal, LotDrawerHost, openLot:(l)=>window.__SYNLOT&&window.__SYNLOT(l), GBH, LOTS, FMT, ST, BuildingHead, Mini };
