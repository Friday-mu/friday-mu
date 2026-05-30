/* FAD V2 — Leads / CRM-lite module. Capture & qualify inbound (stay enquiries,
   syndic/design/agency leads) before they become deals. Dark FAD skin, Shell chrome.
   Tabs: Pipeline · Inbox/new · Qualified · Sources. */
const { DI: LDI, Shell: LShell } = window.FADD;
const LST = window.FADSTATE || {};
const LM = n => n>=1e6 ? 'Rs '+(n/1e6).toFixed(1)+'M' : n>=1e3 ? 'Rs '+(n/1e3).toFixed(0)+'k' : 'Rs '+n;

const LEAD_INTEREST = {
  stay:['green','Stay'], syndic:['violet','Syndic'], design:['amber','Design'], agency:['indigo','Agency'],
};
const LEADS = [
  {av:'AM',nm:'Anita Marivaux',int:'stay',src:'Airbnb enquiry',val:84000,stage:'new',next:'Draft reply',when:'12m ago',note:'7 nights, Grand Baie, 2 adults — asked about late check-in.'},
  {av:'RT',nm:'Raj Teelock',int:'syndic',src:'Website form',val:320000,stage:'new',next:'Qualify',when:'1h ago',note:'24-lot building in Pereybère looking for a new syndic.'},
  {av:'SB',nm:'Sophie Brun',int:'design',src:'Referral · Franny',val:480000,stage:'contacted',next:'Book call',when:'3h ago',note:'Full refresh of a 3-bed villa before listing.'},
  {av:'KP',nm:'Kevin Pillay',int:'agency',src:'lExpress Property',val:12200000,stage:'qualified',next:'Match listings',when:'yesterday',note:'Buyer, Rs 13M budget, North, 3-bed apartment, mortgage in progress.'},
  {av:'NL',nm:'Nadia Lim',int:'stay',src:'Booking.com',val:46000,stage:'contacted',next:'Send quote',when:'yesterday',note:'4 nights Tamarin, flexible dates in July.'},
  {av:'DC',nm:'David Chan',int:'design',src:'Instagram DM',val:0,stage:'lost',next:'—',when:'3d ago',note:'Budget too low for scope — referred to DIY guide.'},
  {av:'GO',nm:'Grace Okafor',int:'agency',src:'Website form',val:8500000,stage:'converted',next:'—',when:'1wk ago',note:'Converted to listing GBH-B4 mandate.'},
];
const LSTAGE = {new:['indigo','New'],contacted:['amber','Contacted'],qualified:['green','Qualified'],converted:['violet','Converted'],lost:['gray','Lost']};
const LSOURCES = [
  {nm:'Airbnb enquiries',kind:'guesty',leads:9,conv:'31%',health:'healthy'},
  {nm:'Booking.com',kind:'guesty',leads:6,conv:'24%',health:'healthy'},
  {nm:'Website form',kind:'friday',leads:11,conv:'42%',health:'healthy'},
  {nm:'lExpress Property',kind:'failed',leads:4,conv:'18%',health:'failed'},
  {nm:'Referrals',kind:'friday',leads:7,conv:'58%',health:'healthy'},
];

function ScreenLeads(){
  const [tab,setTab]=React.useState('pipeline');
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const tabs=[['pipeline','Pipeline'],['new','Inbox / new'],['qualified','Qualified'],['sources','Sources']];
  return (
    <LShell active="leads" eyebrow={<><LDI n="users" s={1.6} style={{color:'var(--indigo-bright)'}}/> LEADS · CRM</>}
      title="Leads" sub="Capture & qualify inbound before it becomes a deal"
      actions={<><button className="dbtn ghost" onClick={()=>T('Synced lead sources')}><LDI n="clock" s={1.8}/> Sync sources</button><button className="dbtn primary" onClick={()=>T('New lead form opened')}><LDI n="plus" s={2}/> Add lead</button></>}>
      {LST.StateBanner && <LST.StateBanner surface="Leads"/>}
      <div className="dtabs" style={{marginTop:2}}>{tabs.map(t=><span key={t[0]} className={"dtab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}</span>)}</div>
      {tab==='pipeline' && <LeadsPipeline T={T} go={setTab}/>}
      {tab==='new' && <LeadsList rows={LEADS.filter(l=>l.stage==='new'||l.stage==='contacted')} T={T} title="New & in-progress"/>}
      {tab==='qualified' && <LeadsList rows={LEADS.filter(l=>l.stage==='qualified')} T={T} title="Qualified — ready to convert"/>}
      {tab==='sources' && <LeadsSources T={T}/>}
    </LShell>
  );
}
function LeadsPipeline({T,go}){
  const open = LEADS.filter(l=>l.stage!=='lost'&&l.stage!=='converted');
  const value = open.reduce((a,l)=>a+l.val,0);
  const cols=[['new','New'],['contacted','Contacted'],['qualified','Qualified'],['converted','Converted'],['lost','Lost']];
  return (<>
    <div className="grid4">
      <div className="statc"><div className="n">{open.length}</div><div className="l">Open leads</div></div>
      <div className="statc green"><div className="n">{LEADS.filter(l=>l.stage==='qualified').length}</div><div className="l">Qualified</div></div>
      <div className="statc"><div className="n">{LM(value)}</div><div className="l">Pipeline value</div></div>
      <div className="statc amber"><div className="n">38%</div><div className="l">Conv. rate · 30d</div></div>
    </div>
    <div className="fai" style={{marginTop:14}}>
      <div className="fh"><span className="bdg indigo"><LDI n="spark" s={1.6}/> Friday</span></div>
      <p><b>2 new leads</b> just landed. I auto-qualified <b>Raj Teelock</b> (syndic, 24-lot building) and drafted a first reply for the <b>Airbnb stay enquiry</b>. Want me to route them to the right teams?</p>
      <div className="acts"><button className="dbtn primary sm" onClick={()=>go('new')}><LDI n="check" s={1.8}/> Review drafts</button><button className="dbtn ghost sm" onClick={()=>T('Friday explained its routing')}>How it routes</button></div>
    </div>
    <div className="dml" style={{marginTop:16}}>Pipeline <span className="rule"/></div>
    <div className="leadkan">
      {cols.map(c=>{
        const rows=LEADS.filter(l=>l.stage===c[0]);
        return (
          <div key={c[0]} className="leadcol">
            <div className="leadcol-h"><span className={"bdg "+LSTAGE[c[0]][0]+(c[0]==='new'||c[0]==='qualified'?' dot':'')}>{c[1]}</span><span className="faint mono" style={{fontSize:10}}>{rows.length}</span></div>
            {rows.map((l,i)=>(
              <div key={i} className="leadcard" onClick={()=>T('Opened '+l.nm)}>
                <div className="row" style={{gap:8}}><span className="av1" style={{width:22,height:22,fontSize:8}}>{l.av}</span><span className="tt" style={{fontSize:12.5}}>{l.nm}</span></div>
                <div className="row" style={{gap:6,marginTop:7,flexWrap:'wrap'}}><span className={"bdg "+LEAD_INTEREST[l.int][0]}>{LEAD_INTEREST[l.int][1]}</span>{l.val>0 && <span className="mono faint" style={{fontSize:10.5}}>{LM(l.val)}</span>}</div>
                <div className="faint" style={{fontSize:10.5,marginTop:7,fontFamily:'var(--mono)'}}>{l.src}</div>
                {l.next!=='—' && <div className="leadnext"><LDI n="chevR" s={2} style={{width:11,height:11}}/> {l.next}</div>}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  </>);
}
function LeadsList({rows,T,title}){
  if(rows.length===0) return <div className="tdempty" style={{padding:'50px 0',textAlign:'center'}}><div style={{fontWeight:600}}>Nothing here yet</div><div className="faint" style={{fontSize:12}}>New leads will appear as sources sync.</div></div>;
  return (<>
    <div className="dml" style={{marginTop:6}}>{title} <span className="ct">{rows.length}</span><span className="rule"/></div>
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {rows.map((l,i)=>(
        <div key={i} className="panel" style={{padding:'13px 15px'}}>
          <div className="between" style={{alignItems:'flex-start',gap:14}}>
            <div className="row" style={{gap:11,alignItems:'flex-start',minWidth:0}}>
              <span className="av1">{l.av}</span>
              <div style={{minWidth:0}}>
                <div className="row" style={{gap:8}}><span className="tt" style={{fontSize:14}}>{l.nm}</span><span className={"bdg "+LEAD_INTEREST[l.int][0]}>{LEAD_INTEREST[l.int][1]}</span><span className={"bdg "+LSTAGE[l.stage][0]+" dot"}>{LSTAGE[l.stage][1]}</span></div>
                <div className="faint" style={{fontSize:12,marginTop:5,lineHeight:1.5}}>{l.note}</div>
                <div className="qmeta" style={{marginTop:7}}><span>{l.src}</span><span className="d">·</span><span>{l.when}</span>{l.val>0 && <><span className="d">·</span><span className="mono">{LM(l.val)}</span></>}</div>
              </div>
            </div>
            <div className="row" style={{gap:7,flex:'0 0 auto'}}>
              <button className="dbtn primary sm" onClick={()=>T('Friday draft opened for '+l.nm)}><LDI n="spark" s={1.7}/> {l.next}</button>
              <button className="dbtn ghost sm" onClick={()=>T('Lead opened')}>Open</button>
            </div>
          </div>
          <div className="gate" style={{borderStyle:'solid',marginTop:11}}><span style={{color:'var(--indigo-bright)',marginTop:1}}><LDI n="spark" s={1.6}/></span><span><b>Friday:</b> looks like a <b>{LEAD_INTEREST[l.int][1].toLowerCase()}</b> lead — I'd route it to that team and {l.int==='stay'?'send a quote':'book a qualification call'}. Draft ready for your approval.</span></div>
        </div>
      ))}
    </div>
  </>);
}
function LeadsSources({T}){
  const SyncChip = LST.SyncChip;
  return (<>
    <div className="dml" style={{marginTop:6}}>Lead sources <span className="ct">{LSOURCES.length}</span><span className="rule"/></div>
    <div className="panel" style={{padding:'10px 6px'}}>
      <table className="tbl"><thead><tr><th>Source</th><th>Sync</th><th style={{textAlign:'right'}}>Leads · 30d</th><th style={{textAlign:'right'}}>Conversion</th><th></th></tr></thead>
        <tbody>{LSOURCES.map((s,i)=>(<tr key={i} className="tdrow" onClick={()=>T('Opened '+s.nm)}>
          <td><span className="tt">{s.nm}</span></td>
          <td>{SyncChip ? <SyncChip source={s.nm.split(' ')[0]} health={s.health}/> : <span className={"bdg "+(s.health==='failed'?'red':'green')+" dot"}>{s.health}</span>}</td>
          <td className="mono" style={{textAlign:'right',fontWeight:600}}>{s.leads}</td>
          <td className="mono faint" style={{textAlign:'right'}}>{s.conv}</td>
          <td style={{textAlign:'right'}}>{s.kind==='failed' ? <button className="dbtn ghost sm" onClick={(e)=>{e.stopPropagation();T('Reconnecting lExpress Property\u2026');}}>Reconnect</button> : <span className="faint"><LDI n="chevR" s={2}/></span>}</td>
        </tr>))}</tbody>
      </table>
    </div>
    <div className="gate" style={{borderStyle:'solid',marginTop:12}}><span style={{color:'var(--indigo-bright)'}}><LDI n="spark" s={1.7}/></span><span>Friday watches every source, de-dupes enquiries, and auto-tags interest so leads land in the right pipeline. <b>lExpress Property</b> sync failed — reconnect to resume buyer leads.</span></div>
  </>);
}

window.FADLEADS = { ScreenLeads };
