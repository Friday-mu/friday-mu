/* ============================================================================
   FAD · Design business unit (Friday Design OS) — interior-design project pipeline
   Reuses Shell, DI, Rail from fad-desktop.jsx (global scope).
   ========================================================================== */

/* 17-stage pipeline definition */
const DSTAGES = [
  {g:'PRE-ENGAGEMENT', items:[['Lead','done'],['Docs','done'],['Site visit','done'],['Preferen…','done'],['Rough b…','done'],['Agreem…','done'],['Signature','done'],['Payment','done']]},
  {g:'DESIGN', items:[['Floor plan','done'],['Moodboard','done'],['Design pack…','now']]},
  {g:'PROCUREMENT & EXECUTION', items:[['Review','opt'],['Final bu…','todo'],['Funding','todo'],['Procure…','todo'],['Expenses','todo'],['Handover','todo']]},
];
function DStepper(){
  let n=0;
  return (
    <div className="dstepwrap">
      <div className="dstep-top">
        <span className="faint mono dstep-eyebrow" style={{marginBottom:0}}>STAGE ADMIN</span>
        <span className="mono dstep-stage">Stage 11 of 17 · Design Pack &amp; 3D <span style={{color:'var(--tx-3)'}}>· in progress</span></span>
      </div>
      <div className="dprog-bar dstep-bar"><div style={{width:'64%'}}/></div>
      <div className="dstep-row">
        {DSTAGES.map((grp,gi)=>(
          <div key={gi} className="dstep-grp">
            <div className={"dstep-glabel"+(grp.g==='DESIGN'?' on':'')}>{grp.g}</div>
            <div className="dstep-cells">
              {grp.items.map((s,si)=>{ n++; const st=s[1]; return (
                <div key={si} className={"dstep-cell "+st}>
                  <span className="dstep-num">{st==='done'?<DI n="check" s={2.6}/>:n}{st==='opt'&&<i> opt</i>}</span>
                  <span className="dstep-lab">{s[0]}</span>
                </div>
              );})}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DProjTabs({active}){
  const t=['Brief','Discovery','Design','Procurement','Execution','Closeout','Documents'];
  return <div className="dptabs">{t.map(x=><span key={x} className={"dptab"+(x===active?' on':'')+(x==='Design'?' dot':'')}>{x}</span>)}</div>;
}

function DProjHead(){
  return (
    <div className="dphead">
      <div className="row between" style={{alignItems:'flex-start'}}>
        <div>
          <button className="dbtn ghost sm" style={{marginBottom:8}}><DI n="chevL" s={2}/> All projects</button>
          <div className="row" style={{gap:9,alignItems:'baseline'}}><span className="dptitle">Albion - Tasleem</span><span className="bdg gray">Mixed</span><span className="bdg gray">Tier 3</span><span className="bdg indigo dot">In progress</span></div>
          <div className="faint" style={{fontSize:11.5,marginTop:5}}>Owner: <a className="dlink">Tasleem</a> · Property: <a className="dlink">Albion - Tasleem</a> <span className="mono" style={{color:'var(--tx-4)'}}>entity_id=FD</span></div>
        </div>
        <div className="row" style={{gap:7,flexWrap:'wrap',justifyContent:'flex-end',maxWidth:560}}>
          <button className="dbtn"><DI n="spark" s={1.6}/> Ask Friday</button>
          <button className="dbtn ghost">✎ Edit project</button>
          <button className="dbtn ghost">Open owner portal preview</button>
          <button className="dbtn ghost">Share with owner</button>
          <button className="dbtn ghost">Print previews ↗</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Design · Overview ---------- */
function ScreenDesignOverview(){
  const stageChips=['All stages','Lead · 1','Docs','Site visit','Preferences','Rough budget','Agreement','Signature','Payment','Floor plan','Moodboard','Design pack · 1','Review','Final budget · 1','Funding','Procurement','Expenses','Handover'];
  const rows=[['Albion - Tasleem','Tasleem','Albion - Tasleem','mixed','T3','design-pack'],['Ocean Terrace 5 (OT-5)','Ocean Terrace 5 owner','Ocean Terrace 5 (OT-5)','mixed','T3','lead'],['Ohana House (OH-2)','Ohana House owner','Ohana House (OH-2)','renovation','T1','final-budget']];
  return (
    <Shell active="more" eyebrow="BUSINESS UNIT · DESIGN" title="Design" sub="Friday Design OS — interior design projects (FD entity)"
      tabs={[{l:'Overview',on:true},{l:'Projects'},{l:'Leads'},{l:'Vendors'},{l:'Analytics'},{l:'Settings'}]}
      actions={<button className="dbtn primary"><DI n="plus" s={2}/> New project</button>}>
      <div className="grid4">
        <div className="statc"><div className="n">3</div><div className="l">Active projects</div></div>
        <div className="statc"><div className="n" style={{color:'var(--amber)'}}>0</div><div className="l">Pending owner approvals</div></div>
        <div className="statc"><div className="n">0</div><div className="l">Procurement open</div></div>
        <div className="statc"><div className="n" style={{color:'var(--indigo-bright)'}}>Rs 0</div><div className="l">Margin exposure</div></div>
      </div>
      <div className="faint" style={{fontSize:12,margin:'12px 0 14px'}}>3 active projects · Rs 6,292,856 EPC · 1 at Tier 1 · <span style={{color:'var(--red)'}}>1 blocked, owner action needed.</span></div>
      <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:14}}>
        <div className="panel">
          <div className="row between"><div className="dml" style={{margin:0}}>All projects<span className="rule"/></div><span className="dsearch" style={{maxWidth:200,margin:0,padding:'6px 10px'}}><DI n="search" s={2}/> <span style={{fontSize:11}}>Search projects…</span></span></div>
          <div className="row" style={{gap:6,flexWrap:'wrap',margin:'12px 0'}}>{stageChips.filter(c=>c==='All stages'||c.includes('·')).map((c,i)=><span key={i} className={"aichip"+(c==='All stages'?' ai':'')} style={{fontSize:10.5}}>{c}</span>)}<span className="aichip" style={{fontSize:10.5,color:'var(--tx-3)'}}>+{stageChips.filter(c=>c!=='All stages'&&!c.includes('·')).length} more</span></div>
          <div className="row" style={{gap:6,flexWrap:'wrap',marginBottom:6}}><span className="aichip ai">All tiers</span><span className="aichip">Tier 1</span><span className="aichip">Tier 2</span><span className="aichip">Tier 3</span><span style={{width:10}}/><span className="aichip ai">All classes</span><span className="aichip">Renovation</span><span className="aichip">Furnishing</span><span className="aichip">Mixed</span></div>
          <table className="tbl"><thead><tr><th>Project</th><th>Counterparty</th><th>Property</th><th>Class.</th><th>Tier</th><th>Stage</th></tr></thead>
          <tbody>{rows.map((r,i)=>(<tr key={i}><td className="tt">{r[0]}</td><td className="faint">{r[1]}</td><td className="faint">{r[2]}</td><td className="faint">{r[3]}</td><td className="mono">{r[4]}</td><td><span className="dlink">{r[5]}</span></td></tr>))}</tbody></table>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className="panel">
            <div className="dml" style={{margin:'0 0 4px'}}>Needs attention<span className="rule"/></div>
            <div className="faint" style={{fontSize:10.5,marginBottom:10}}>Filtered to your role. Click any row to open the project.</div>
            <div className="panel" style={{borderLeft:'3px solid var(--red)',background:'rgba(207,102,96,.06)',padding:'10px 12px',marginBottom:8}}><div style={{fontSize:12.5,fontWeight:600,color:'#d88'}}>Blocker — needs unblock</div><div style={{fontSize:12,fontWeight:600,margin:'3px 0 2px'}}>Albion - Tasleem</div><div className="faint" style={{fontSize:11}}>Need to start final budget and need to get kitchen designed by kitchen supplier</div></div>
          </div>
          <div className="panel">
            <div className="dml" style={{margin:'0 0 4px'}}>My Today<span className="rule"/></div>
            <div className="faint" style={{fontSize:10.5,marginBottom:14}}>Design-related tasks assigned to you.</div>
            <div className="faint" style={{textAlign:'center',fontSize:12,padding:'10px 0'}}>Nothing on your plate.</div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

/* ---------- Design · Project workspace (Brief tab) ---------- */
function ScreenDesignProject(){
  return (
    <Shell active="more" bare>
      <DProjHead/>
      <DStepper/>
      <DProjTabs active="Brief"/>
      <div className="dpbody">
        <div className="dbanner"><div><div className="row" style={{gap:7}}><span style={{color:'var(--red)'}}>⚠</span><span style={{fontWeight:600,color:'#e7a6a1'}}>CIA Mauritius compliance</span></div><div className="faint" style={{fontSize:11.5,margin:'5px 0 6px'}}>Mixed classification — confirm with CIA whether the renovation portion of scope is above the threshold.</div><div className="mono" style={{fontSize:11,color:'var(--red)'}}>Status: Not yet evaluated</div></div><button className="dbtn ghost sm">Update status</button></div>
        <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginTop:14}}>
          <div className="panel">
            <div className="dml" style={{margin:'0 0 10px'}}>📋 Blockers <span className="ct">2</span><span className="rule"/></div>
            <div className="dcheckrow"><span className="dcheckbox"/><span style={{flex:1,fontSize:12.5}}>Need to start final budget and need to get kitchen designed by kit…</span><span className="ddate">dd/mm/yyyy</span></div>
            <div className="dcheckrow"><span className="dcheckbox"/><span style={{flex:1,fontSize:12.5}}>QA test blocker 1</span><span className="ddate">dd/mm/yyyy</span></div>
            <div className="dadd">+ Add a blocker and press Enter</div>
          </div>
          <div className="panel">
            <div className="dml" style={{margin:'0 0 10px'}}>✅ Next actions <span className="ct">1</span><span className="rule"/></div>
            <div className="dcheckrow"><span className="dcheckbox"/><span style={{flex:1,fontSize:12.5}}>Need to start final budget and need to get kitchen designed by kit…</span><span className="ddate">dd/mm/yyyy</span></div>
            <div className="dadd">+ Add a next action and press Enter</div>
            <div className="faint mono" style={{fontSize:10,marginTop:8}}>· Resolved (1)</div>
          </div>
        </div>
        <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginTop:14}}>
          <div className="panel">
            <div className="dml" style={{margin:'0 0 8px'}}>Summary<span className="rule"/></div>
            {[['Counterparty','Tasleem'],['Property','Albion - Tasleem'],['Classification','mixed'],['Tier','Tier 3'],['EPC','Rs 450,000']].map((r,i)=>(<div key={i} className="drow"><span className="faint">{r[0]}</span><span>{r[1]}</span></div>))}
            <div className="drow"><span className="faint">Design fee</span><span style={{textAlign:'right'}}>Rs 25,000<br/><span className="faint mono" style={{fontSize:9}}>Rs 28,750 incl. VAT</span></span></div>
            <div className="drow"><span className="faint">Execution fee</span><span style={{textAlign:'right'}}>Rs 78,750<br/><span className="faint mono" style={{fontSize:9}}>Rs 90,563 incl. VAT</span></span></div>
            <div className="drow"><span className="faint">Total fee</span><span style={{textAlign:'right',fontWeight:700}}>Rs 103,750<br/><span className="faint mono" style={{fontSize:9}}>Rs 119,313 incl. VAT</span></span></div>
            <div className="faint" style={{fontSize:10,fontStyle:'italic',margin:'4px 0 8px'}}>Annex A is VAT-exclusive; 15% VAT added on top.</div>
            <div className="drow"><span className="faint">Start</span><span>2026-05-01 · <span className="faint">15d ago</span></span></div>
            <div className="drow"><span className="faint">Est. completion</span><span>2026-07-31 · <span className="faint">in 3 mo</span></span></div>
            <div className="drow"><span className="faint">Design lead</span><span className="faint">—</span></div>
          </div>
          <div className="panel">
            <div className="row between"><div className="dml" style={{margin:0}}>Activity<span className="rule"/></div><button className="dbtn ghost sm"><DI n="spark" s={1.5}/> Generate owner update <span className="bdg indigo" style={{marginLeft:4}}>v0.2</span></button></div>
            <div className="faint" style={{fontSize:12,marginTop:10}}>No activity yet.</div>
          </div>
        </div>
        <div className="panel" style={{marginTop:14}}>
          <div className="dml" style={{margin:'0 0 8px'}}>Documents<span className="rule"/></div>
          <div className="faint" style={{fontSize:12}}>No documents yet.</div>
        </div>
      </div>
    </Shell>
  );
}

window.FADDESIGN = { ScreenDesignOverview, ScreenDesignProject, DStepper, DProjTabs };
