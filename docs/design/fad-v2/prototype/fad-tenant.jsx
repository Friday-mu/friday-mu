/* FAD V2 — Tenant admin trio (FridayOS platform surfaces, distinct from per-tenant Settings).
   Tenant Settings · Billing · Admin Analytics. Dark FAD skin, Shell chrome.
   Exports window.FADTENANT / FADBILL / FADADMIN. */
const { DI: TDI, Shell: TShell } = window.FADD;
const TST = window.FADSTATE || {};
function Tgl2({on,onChange}){const[v,setV]=React.useState(on);return <span className={"tgl"+(v?' on':'')} onClick={()=>{const n=!v;setV(n);onChange&&onChange(n);}}><span className="knob"/></span>;}

/* ============================ TENANT SETTINGS ============================ */
function ScreenTenant(){
  const [tab,setTab]=React.useState('org');
  const [dirty,setDirty]=React.useState(false);
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const tabs=[['org','Organisation'],['modules','Modules'],['branding','Branding'],['data','Data & language'],['roles','Roles']];
  const mods=[['STR management','Short-term rental ops · the core',true],['Syndic','Co-ownership management',true],['Design studio','Paid interior design',true],['Agency','Sales & lettings',true],['Legal & Admin','Contracts & compliance',true],['Marketing','Content & channels',false]];
  const roles=[['Director','Full access · billing · roles · all modules','3'],['Ops Manager','Operations · approvals · roster · no billing','2'],['Commercial','Agency · marketing · leads','2'],['Field staff','Their tasks · schedule · reports','11']];
  return (
    <TShell active="tenant" eyebrow={<><TDI n="gear" s={1.6} style={{color:'var(--indigo-bright)'}}/> PLATFORM · TENANT</>}
      title="Tenant settings" sub="Friday Retreats · org profile, modules, branding & roles"
      actions={<><span className="bdg gray"><TDI n="lock" s={1.5}/> Director only</span><button className={"dbtn "+(dirty?'primary':'')} disabled={!dirty} style={{opacity:dirty?1:.5}} onClick={()=>{setDirty(false);T('Tenant settings saved','green');}}><TDI n="check" s={2}/> Save changes</button></>}>
      <div className="dtabs" style={{marginTop:2}}>{tabs.map(t=><span key={t[0]} className={"dtab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}</span>)}</div>

      {tab==='org' && <div className="panel" style={{padding:'4px 14px',marginTop:6}}>
        {[['Organisation name','Friday Retreats'],['Legal entity','Friday Retreats Ltd · C20193847'],['Country','Mauritius'],['Primary contact','Ishant Ayadassen · ishant@fridayretreats.mu'],['Timezone','Indian/Mauritius (GMT+4)'],['Units under management','14']].map((r,i)=>(
          <div key={i} className="drow"><span className="faint">{r[0]}</span><span className="mono" style={{fontSize:12.5}}>{r[1]}</span></div>
        ))}
      </div>}

      {tab==='modules' && <>
        <div className="dml" style={{marginTop:6}}>Business units enabled <span className="rule"/></div>
        <div className="panel" style={{padding:'4px 14px'}}>
          {mods.map((m,i)=>(<div key={i} className="drow"><div><div style={{fontSize:13,fontWeight:600}}>{m[0]}</div><div className="faint" style={{fontSize:11,marginTop:1}}>{m[1]}</div></div><Tgl2 on={m[2]} onChange={()=>setDirty(true)}/></div>))}
        </div>
        <div className="gate" style={{borderStyle:'solid',marginTop:12}}><span style={{color:'var(--indigo-bright)'}}><TDI n="spark" s={1.7}/></span><span>Turning a module off hides its rail entry and routes for everyone. Data is retained and re-appears when re-enabled. <b>Marketing</b> is off — enable it to manage channel content.</span></div>
      </>}

      {tab==='branding' && <>
        <div className="dml" style={{marginTop:6}}>Brand <span className="rule"/></div>
        <div className="panel" style={{padding:'4px 14px'}}>
          <div className="drow"><span className="faint">Logo</span><span className="row" style={{gap:8}}><span className="wm" style={{fontFamily:'var(--serif)',fontStyle:'italic',fontSize:18,color:'#fff'}}>FridayOS</span><button className="dbtn ghost sm" onClick={()=>T('Upload logo')}>Replace</button></span></div>
          <div className="drow"><span className="faint">App accent</span><span className="row" style={{gap:8}}><span style={{width:18,height:18,borderRadius:5,background:'var(--indigo)',border:'1px solid var(--line-3)'}}/><span className="mono" style={{fontSize:12}}>#5681ff</span></span></div>
          <div className="drow"><span className="faint">Syndic owner-facing</span><span className="row" style={{gap:8}}><span style={{width:18,height:18,borderRadius:5,background:'#1F3864',border:'1px solid var(--line-3)'}}/><span className="mono" style={{fontSize:12}}>#1F3864 navy</span></span></div>
          <div className="drow" style={{borderBottom:'none'}}><span className="faint">Guest-message sign-off</span><span className="mono" style={{fontSize:12}}>— The Friday Retreats team</span></div>
        </div>
      </>}

      {tab==='data' && <div className="panel" style={{padding:'4px 14px',marginTop:6}}>
        {[['Data residency','EU (Frankfurt)'],['Default language','English'],['Secondary language','Français (FR)'],['Currency','EUR · MUR'],['Data retention','7 years (statutory)'],['Export','Request full data export']].map((r,i)=>(
          <div key={i} className="drow" style={i===5?{borderBottom:'none'}:null}><span className="faint">{r[0]}</span>{i===5?<button className="dbtn ghost sm" onClick={()=>T('Export requested')}>{r[1]}</button>:<span className="mono" style={{fontSize:12.5}}>{r[1]}</span>}</div>
        ))}
      </div>}

      {tab==='roles' && <>
        <div className="dml" style={{marginTop:6}}>Role definitions <span className="ct">{roles.length}</span><span className="rule"/></div>
        <div className="panel" style={{padding:'10px 6px'}}>
          <table className="tbl"><thead><tr><th>Role</th><th>Access</th><th style={{textAlign:'right'}}>People</th><th></th></tr></thead>
            <tbody>{roles.map((r,i)=>(<tr key={i} className="tdrow" onClick={()=>T('Edit '+r[0]+' role')}><td><span className="tt">{r[0]}</span></td><td className="faint" style={{fontSize:11.5}}>{r[1]}</td><td className="mono" style={{textAlign:'right',fontWeight:600}}>{r[2]}</td><td style={{textAlign:'right'}}><span className="faint"><TDI n="chevR" s={2}/></span></td></tr>))}</tbody>
          </table>
        </div>
      </>}
    </TShell>
  );
}

/* ============================ BILLING ============================ */
function ScreenBilling(){
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const invoices=[['INV-2026-05','May 2026','Rs 28,000','paid','green'],['INV-2026-04','Apr 2026','Rs 28,000','paid','green'],['INV-2026-03','Mar 2026','Rs 26,000','paid','green'],['INV-2026-06','Jun 2026','Rs 30,000','due','amber']];
  const usage=[['STR management','14 units','—'],['Syndic','2 buildings','+Rs 4,000'],['Design studio','6 projects','included'],['Agency','—','included'],['Legal & Admin','—','included']];
  return (
    <TShell active="billing" eyebrow={<><TDI n="coin" s={1.6} style={{color:'var(--indigo-bright)'}}/> PLATFORM · BILLING</>}
      title="Billing" sub="Your FridayOS subscription · plan, usage & invoices"
      actions={<button className="dbtn primary" onClick={()=>T('Manage plan')}><TDI n="chevsU" s={2}/> Manage plan</button>}>
      <div className="statebanner red"><TDI n="alert" s={1.7}/><span>Your card ending <b>4471</b> was declined on the Jun invoice. Update your payment method to avoid a service hold on <b>15 Jun</b>.</span><button className="dbtn ghost sm" style={{marginLeft:'auto'}} onClick={()=>T('Update payment method')}>Update card</button></div>
      <div className="grid4" style={{marginTop:14}}>
        <div className="statc"><div className="n">Scale</div><div className="l">Current plan</div><div className="d">Rs 2,000 / unit / mo</div></div>
        <div className="statc"><div className="n">14</div><div className="l">Units billed</div><div className="d">of 25 plan cap</div></div>
        <div className="statc amber"><div className="n">Rs 30,000</div><div className="l">Next invoice · 15 Jun</div><div className="d">payment failed</div></div>
        <div className="statc"><div className="n">Rs 332k</div><div className="l">Billed · YTD</div></div>
      </div>
      <div className="dtwocol" style={{marginTop:14,display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:14,alignItems:'start'}}>
        <div className="panel" style={{padding:'10px 6px'}}>
          <div className="dml" style={{margin:'2px 12px 6px'}}>Invoice history<span className="rule"/></div>
          <table className="tbl"><thead><tr><th>Invoice</th><th>Period</th><th style={{textAlign:'right'}}>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>{invoices.map((v,i)=>(<tr key={i} className="tdrow" onClick={()=>T('Opened '+v[0])}><td><span className="pcodeD">{v[0]}</span></td><td className="faint">{v[1]}</td><td className="mono" style={{textAlign:'right',fontWeight:600}}>{v[2]}</td><td><span className={"bdg "+v[4]+" dot"}>{v[3]}</span></td><td style={{textAlign:'right'}}><button className="dbtn ghost sm" onClick={(e)=>{e.stopPropagation();T('PDF downloaded');}}><TDI n="doc" s={1.6}/></button></td></tr>))}</tbody>
          </table>
        </div>
        <div className="panel">
          <div className="dml" style={{margin:'0 0 8px'}}>Usage by module<span className="rule"/></div>
          {usage.map((u,i)=>(<div key={i} className="drow" style={i===usage.length-1?{borderBottom:'none'}:null}><div><div style={{fontSize:12.5}}>{u[0]}</div><div className="faint mono" style={{fontSize:10,marginTop:1}}>{u[1]}</div></div><span className="mono" style={{fontSize:11.5,color:u[2].startsWith('+')?'var(--amber)':'var(--tx-3)'}}>{u[2]}</span></div>))}
        </div>
      </div>
      <div className="gate" style={{borderStyle:'solid',marginTop:14}}><TDI n="spark" s={1.7} style={{color:'var(--indigo-bright)',flex:'0 0 auto'}}/><span>You're at <b>14 of 25</b> units on the Scale plan. Adding Syndic buildings bills separately. Friday flags when usage nears the cap so there's no surprise overage.</span></div>
    </TShell>
  );
}

/* ============================ ADMIN ANALYTICS ============================ */
function ScreenAdmin(){
  const SyncChip = TST.SyncChip;
  const adoption=[['Operations',98,'var(--green)'],['Inbox',92,'var(--green)'],['Finance',81,'var(--green)'],['Design',64,'var(--amber)'],['Agency',47,'var(--amber)'],['Marketing',12,'var(--red)']];
  const ai=[['Inbox replies','86%'],['Approvals triage','91%'],['Owner statements','78%'],['Design budgets','69%']];
  const conns=[['Guesty','healthy'],['Breezeway','healthy'],['Channels','healthy'],['WhatsApp','failed'],['Xodo Sign','healthy'],['lExpress Property','failed'],['Property Cloud','stale']];
  return (
    <TShell active="admin" eyebrow={<><TDI n="chart" s={1.6} style={{color:'var(--indigo-bright)'}}/> PLATFORM · ADMIN</>}
      title="Admin analytics" sub="Platform health · adoption · AI acceptance · connector status">
      <div className="grid4">
        <div className="statc"><div className="n">1</div><div className="l">Active tenant</div><div className="d">Friday Retreats</div></div>
        <div className="statc green"><div className="n">82%</div><div className="l">Avg module adoption</div></div>
        <div className="statc"><div className="n">84%</div><div className="l">AI acceptance · 30d</div></div>
        <div className="statc red"><div className="n">2</div><div className="l">Connectors down</div></div>
      </div>
      <div className="dtwocol" style={{marginTop:14,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,alignItems:'start'}}>
        <div className="panel"><div className="dml" style={{margin:'0 0 12px'}}>Module adoption<span className="rule"/></div>
          {adoption.map((a,i)=>(<div key={i} style={{marginBottom:10}}><div className="row between" style={{fontSize:12,marginBottom:4}}><span>{a[0]}</span><span className="mono">{a[1]}%</span></div><div className="cb-track" style={{height:7}}><i style={{display:'block',height:'100%',borderRadius:3,width:a[1]+'%',background:a[2]}}/></div></div>))}
        </div>
        <div className="panel"><div className="dml" style={{margin:'0 0 10px'}}>AI acceptance by surface<span className="rule"/></div>
          {ai.map((a,i)=>(<div key={i} className="drow" style={i===ai.length-1?{borderBottom:'none'}:null}><span className="faint">{a[0]}</span><span className="mono" style={{fontWeight:600,color:parseInt(a[1])>=80?'var(--green)':'var(--amber)'}}>{a[1]}</span></div>))}
          <div className="dml" style={{margin:'14px 0 8px'}}>Connector health<span className="rule"/></div>
          <div className="row" style={{gap:6,flexWrap:'wrap'}}>{conns.map((c,i)=>(SyncChip ? <SyncChip key={i} source={c[0]} health={c[1]}/> : <span key={i} className={"bdg "+(c[1]==='failed'?'red':c[1]==='stale'?'amber':'green')+" dot"}>{c[0]}</span>))}</div>
        </div>
      </div>
      <div className="gate" style={{borderStyle:'solid',marginTop:14}}><TDI n="alert" s={1.7} style={{color:'var(--amber)',flex:'0 0 auto'}}/><span><b>Marketing adoption is low (12%)</b> and 2 connectors are down. Adoption + AI-acceptance feed Friday's own improvement loop — low-acceptance surfaces get prompted for teachings.</span></div>
    </TShell>
  );
}

window.FADTENANT = { ScreenTenant };
window.FADBILL = { ScreenBilling };
window.FADADMIN = { ScreenAdmin };
