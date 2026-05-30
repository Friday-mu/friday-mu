/* FAD V2 — Legal & Admin module. Contracts, e-signature (Xodo Sign), compliance,
   entity admin. Dark FAD skin, Shell chrome. Tabs: Signatures · Compliance · Documents · Entities. */
const { DI: GDI, Shell: GShell } = window.FADD;
const GST = window.FADSTATE || {};

const SIGS = [
  {doc:'Owner mandate · GBH-B4',parties:'Friday Retreats · M. Aubert',status:'completed',sent:'12 May',signed:'13 May',tone:'green'},
  {doc:'Syndic mandate · Grand Baie Heights',parties:'Friday Syndic · Co-ownership',status:'partially-signed',sent:'2 Jun',signed:'3 of 5',tone:'amber'},
  {doc:'Design agreement · SD-10',parties:'Friday Design · N. Holdings',status:'sent',sent:'today',signed:'—',tone:'indigo'},
  {doc:'Cleaning contractor · West zone',parties:'Friday Retreats · CleanCo',status:'declined',sent:'28 May',signed:'declined',tone:'red'},
  {doc:'Listing agreement · RC-7',parties:'Friday Agency · D. Harrington',status:'expired',sent:'1 Apr',signed:'expired',tone:'gray'},
  {doc:'Staff contract · I. Ayadassen',parties:'Friday Retreats · Employee',status:'draft',sent:'—',signed:'—',tone:'gray'},
];
const SIG_LABEL={completed:'completed',['partially-signed']:'partially signed',sent:'sent',declined:'declined',expired:'expired',draft:'draft'};
const COMPLIANCE = [
  {ent:'Friday Retreats Ltd',item:'VAT return Q2',due:'15 Jul',state:'due-soon',tone:'amber'},
  {ent:'Friday Retreats Ltd',item:'Tourism operating licence',due:'30 Sep',state:'ok',tone:'green'},
  {ent:'Friday Syndic Ltd',item:'Co-ownership insurance renewal',due:'3 Jun',state:'overdue',tone:'red'},
  {ent:'Friday Design Ltd',item:'Annual return (ROC)',due:'12 Aug',state:'ok',tone:'green'},
  {ent:'Friday Retreats Ltd',item:'Public liability insurance',due:'21 Jun',state:'due-soon',tone:'amber'},
];
const LDOCS = [
  ['Owner mandates','doc',14],['Syndic mandates','building',2],['Employment contracts','users',9],
  ['Vendor agreements','box',11],['Insurance policies','shield',6],['Licences & permits','doc',4],
];
const ENTITIES = [
  {nm:'Friday Retreats Ltd',type:'STR management',reg:'C20193847',dir:'Ishant A.',units:14},
  {nm:'Friday Syndic Ltd',type:'Co-ownership syndic',reg:'C20211192',dir:'Ishant A.',units:2},
  {nm:'Friday Design Ltd',type:'Interior design',reg:'C20224410',dir:'Franny H.',units:5},
];

function ScreenLegal(){
  const [tab,setTab]=React.useState('signatures');
  const [send,setSend]=React.useState(false);
  const T=(t,tone)=>window.fadToast&&window.fadToast(t,tone);
  const tabs=[['signatures','Signatures'],['compliance','Compliance'],['documents','Documents'],['entities','Entities']];
  return (
    <GShell active="legal" eyebrow={<><GDI n="shield" s={1.6} style={{color:'var(--indigo-bright)'}}/> LEGAL &amp; ADMIN</>}
      title="Legal & Admin" sub="Contracts · e-signature · compliance · entities"
      actions={<><button className="dbtn ghost" onClick={()=>T('Synced from Xodo Sign')}><GDI n="clock" s={1.8}/> Sync Xodo</button><button className="dbtn primary" onClick={()=>setSend(true)}><GDI n="plus" s={2}/> Send contract</button></>}>
      {GST.StateBanner && <GST.StateBanner surface="Legal"/>}
      <div className="dtabs" style={{marginTop:2}}>{tabs.map(t=><span key={t[0]} className={"dtab"+(tab===t[0]?' on':'')} onClick={()=>setTab(t[0])}>{t[1]}</span>)}</div>
      {tab==='signatures' && <LgSignatures T={T} onSend={()=>setSend(true)}/>}
      {tab==='compliance' && <LgCompliance T={T}/>}
      {tab==='documents' && <LgDocuments T={T}/>}
      {tab==='entities' && <LgEntities T={T}/>}
      {send && <LegalSendModal onClose={()=>setSend(false)} T={T}/>}
    </GShell>
  );
}
function LegalSendModal({onClose,T}){
  const templates=['Owner mandate','Syndic mandate','Listing agreement (Agency)','Design agreement','Vendor agreement','Employment contract','NDA'];
  const [tpl,setTpl]=React.useState(templates[0]);
  const [name,setName]=React.useState('');
  const [email,setEmail]=React.useState('');
  const [sent,setSent]=React.useState(false);
  React.useEffect(()=>{const k=e=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',k);return ()=>window.removeEventListener('keydown',k);},[onClose]);
  const doSend=()=>{ setSent(true); T('Contract sent for signature via Xodo Sign','green'); setTimeout(onClose,1400); };
  return (
    <>
      <div className="tdscrim" onClick={onClose}/>
      <div className="lgmodal" role="dialog" aria-label="Send contract">
        <div className="between" style={{marginBottom:14}}>
          <div className="row" style={{gap:9}}><img className="askmk" src="friday-f.png" alt=""/><span style={{fontWeight:700,fontSize:15}}>Send a contract</span></div>
          <span className="icbtn" style={{cursor:'pointer'}} onClick={onClose}><GDI n="x" s={2}/></span>
        </div>
        {sent ? (
          <div style={{textAlign:'center',padding:'26px 0'}}>
            <div className="afdone" style={{display:'inline-flex'}}><GDI n="check" s={2}/> Sent via Xodo Sign — tracking in Signatures</div>
          </div>
        ) : (<>
          <div className="lgfield"><span className="lglbl">Template</span>
            <span className="vseg" style={{flexWrap:'wrap'}}>{templates.map(t=><span key={t} className={"vs"+(tpl===t?' on':'')} onClick={()=>setTpl(t)}>{t}</span>)}</span>
          </div>
          <div className="lgrow2">
            <div className="lgfield"><span className="lglbl">Recipient name</span><input className="finput" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. D. Harrington"/></div>
            <div className="lgfield"><span className="lglbl">Email</span><input className="finput" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@email.com"/></div>
          </div>
          <div className="lgrow2">
            <div className="lgfield"><span className="lglbl">Link to</span><div className="aichip" style={{justifyContent:'space-between',width:'100%'}}>Property / Owner / Entity <GDI n="chevD" s={2} style={{width:12,height:12}}/></div></div>
            <div className="lgfield"><span className="lglbl">Signing entity</span><div className="aichip" style={{justifyContent:'space-between',width:'100%'}}>Friday Retreats Ltd <GDI n="chevD" s={2} style={{width:12,height:12}}/></div></div>
          </div>
          <div className="lgfield"><span className="lglbl">Message</span><div className="finput" style={{height:'auto',minHeight:54,padding:'10px 13px',lineHeight:1.5,color:'var(--tx-2)'}}>Hi — please review and sign the attached {tpl.toLowerCase()}. Reach out with any questions. — The Friday Retreats team</div></div>
          <div className="gate" style={{borderStyle:'solid',marginTop:4}}><img className="askmk" src="friday-f.png" alt="" style={{width:16,height:16}}/><span><b>Friday</b> pre-filled the {tpl.toLowerCase()} from your template and entity defaults. Review before sending; it routes through <b>Xodo Sign</b> and files the signed copy automatically.</span></div>
          <div className="row" style={{gap:8,marginTop:16,justifyContent:'flex-end'}}>
            <button className="dbtn ghost" onClick={onClose}>Cancel</button>
            <button className="dbtn ghost" onClick={()=>T('Saved as draft')}>Save draft</button>
            <button className="dbtn primary" onClick={doSend}><GDI n="msg" s={1.8}/> Send for signature</button>
          </div>
        </>)}
      </div>
    </>
  );
}
function LgSignatures({T}){
  const SyncChip = GST.SyncChip;
  const pending = SIGS.filter(s=>s.status==='sent'||s.status==='partially-signed').length;
  return (<>
    <div className="row between" style={{margin:'2px 0 10px'}}>
      <div className="grid4" style={{flex:1,gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="statc amber"><div className="n">{pending}</div><div className="l">Awaiting signature</div></div>
        <div className="statc green"><div className="n">{SIGS.filter(s=>s.status==='completed').length}</div><div className="l">Completed</div></div>
        <div className="statc red"><div className="n">{SIGS.filter(s=>s.status==='declined').length}</div><div className="l">Declined</div></div>
        <div className="statc"><div className="n">{SIGS.filter(s=>s.status==='expired').length}</div><div className="l">Expired</div></div>
      </div>
    </div>
    <div className="row between" style={{margin:'14px 0 8px'}}><span className="dml" style={{margin:0}}>Signature requests <span className="ct">{SIGS.length}</span></span>{SyncChip && <SyncChip source="Xodo Sign"/>}</div>
    <div className="panel" style={{padding:'10px 6px'}}>
      <table className="tbl"><thead><tr><th>Document</th><th>Parties</th><th>Status</th><th>Sent</th><th>Signed</th><th></th></tr></thead>
        <tbody>{SIGS.map((s,i)=>(<tr key={i} className="tdrow" onClick={()=>T('Opened '+s.doc)}>
          <td><span className="tt">{s.doc}</span></td>
          <td className="faint" style={{fontSize:11.5}}>{s.parties}</td>
          <td><span className={"bdg "+s.tone+(s.status==='draft'||s.status==='expired'?'':' dot')}>{SIG_LABEL[s.status]}</span></td>
          <td className="mono faint">{s.sent}</td>
          <td className="mono faint">{s.signed}</td>
          <td style={{textAlign:'right'}}>{(s.status==='sent'||s.status==='partially-signed') ? <button className="dbtn ghost sm" onClick={(e)=>{e.stopPropagation();T('Reminder sent','green');}}>Remind</button> : <span className="faint"><GDI n="chevR" s={2}/></span>}</td>
        </tr>))}</tbody>
      </table>
    </div>
    <div className="gate" style={{borderStyle:'solid',marginTop:12}}><span style={{color:'var(--indigo-bright)'}}><GDI n="spark" s={1.7}/></span><span>Signatures run through <b>Xodo Sign</b>. Friday tracks the signer timeline, auto-sends reminders, and files completed docs into the right entity vault.</span></div>
  </>);
}
function LgCompliance({T}){
  const overdue=COMPLIANCE.filter(c=>c.state==='overdue').length;
  return (<>
    {overdue>0 && <div className="fai" style={{marginTop:6}}>
      <div className="fh"><span className="bdg red"><GDI n="alert" s={1.6}/> Friday compliance</span></div>
      <p><b>{overdue} obligation overdue:</b> Friday Syndic's co-ownership insurance lapsed on 3 Jun. 2 more are due within 30 days. I can draft the renewal requests.</p>
      <div className="acts"><button className="dbtn primary sm" onClick={()=>T('Renewal drafts prepared')}><GDI n="spark" s={1.7}/> Draft renewals</button></div>
    </div>}
    <div className="dml" style={{marginTop:16}}>Obligations <span className="ct">{COMPLIANCE.length}</span><span className="rule"/></div>
    <div className="panel" style={{padding:'10px 6px'}}>
      <table className="tbl"><thead><tr><th>Obligation</th><th>Entity</th><th>Due</th><th>Status</th><th></th></tr></thead>
        <tbody>{COMPLIANCE.map((c,i)=>(<tr key={i} className="tdrow" onClick={()=>T('Opened '+c.item)}>
          <td><span className="tt">{c.item}</span></td>
          <td className="faint">{c.ent}</td>
          <td className="mono faint">{c.due}</td>
          <td><span className={"bdg "+c.tone+(c.state==='ok'?'':' dot')}>{c.state==='ok'?'on track':c.state==='due-soon'?'due soon':'overdue'}</span></td>
          <td style={{textAlign:'right'}}>{c.state!=='ok' ? <button className="dbtn ghost sm" onClick={(e)=>{e.stopPropagation();T('Renewal started');}}>Renew</button> : <span className="faint"><GDI n="chevR" s={2}/></span>}</td>
        </tr>))}</tbody>
      </table>
    </div>
  </>);
}
function LgDocuments({T}){
  return (<>
    <div className="dml" style={{marginTop:6}}>Document vault <span className="rule"/></div>
    <div className="grid3">
      {LDOCS.map((d,i)=>(
        <div key={i} className="panel tap modcard" onClick={()=>T('Opened '+d[0])}>
          <span className="modic"><GDI n={d[1]} s={1.7}/></span>
          <div style={{minWidth:0}}><div style={{fontWeight:600,fontSize:13.5}}>{d[0]}</div><div className="faint" style={{fontSize:11.5,marginTop:2}}>{d[2]} documents</div></div>
          <span className="modgo"><GDI n="chevR" s={2}/></span>
        </div>
      ))}
    </div>
    <div className="gate" style={{borderStyle:'solid',marginTop:14}}><GDI n="lock" s={1.7} style={{color:'var(--amber)',flex:'0 0 auto'}}/><span><b>Restricted.</b> The legal vault is visible to Director-role users only. Signed contracts file here automatically once Xodo marks them complete.</span></div>
  </>);
}
function LgEntities({T}){
  return (<>
    <div className="dml" style={{marginTop:6}}>Entities <span className="ct">{ENTITIES.length}</span><span className="rule"/></div>
    <div className="panel" style={{padding:'10px 6px'}}>
      <table className="tbl"><thead><tr><th>Entity</th><th>Type</th><th>Reg. no.</th><th>Director</th><th style={{textAlign:'right'}}>Units</th></tr></thead>
        <tbody>{ENTITIES.map((e,i)=>(<tr key={i} className="tdrow" onClick={()=>T('Opened '+e.nm)}>
          <td><span className="tt">{e.nm}</span></td>
          <td className="faint">{e.type}</td>
          <td className="mono faint">{e.reg}</td>
          <td className="faint">{e.dir}</td>
          <td className="mono" style={{textAlign:'right',fontWeight:600}}>{e.units}</td>
        </tr>))}</tbody>
      </table>
    </div>
  </>);
}

window.FADLEGAL = { ScreenLegal };
