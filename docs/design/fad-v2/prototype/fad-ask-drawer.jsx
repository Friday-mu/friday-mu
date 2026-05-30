/* FAD V2 — Ask Friday: rich conversation engine (tool calls · drafts · task
   creation · actions · loading), header slide-over drawer, and ⌘K search palette.
   Mounted once via <window.FADASKUI.AskHost/> in Shell.
   Exports window.FADASKUI.{ AskHost, AskConversation, openAsk, openSearch } */
const AUI = (window.FADD && window.FADD.DI) || (()=>null);
const aiGo = (k)=>window.FADGO&&window.FADGO(k);
const aiToast = (t,tone)=>window.fadToast&&window.fadToast(t,tone);

const SEARCH_INDEX = [
  {g:'Properties',ic:'home',kind:'Property',items:[['GBH-B4 · Apt with Pool & Gym','prop'],['SD-10 · Sunset Drive Villa','prop'],['RC-7 · Royal Court','prop'],['BS-1 · Modern Apt','property']]},
  {g:'Reservations',ic:'doc',kind:'Reservation',items:[['Cyril · LB-C · May 1–10','reservation'],['Marie L. · GBH-B4 · Jun 1','res'],['Inquiry · Anita Marivaux','res']]},
  {g:'Guests',ic:'users',kind:'Guest',items:[['Marie L. · VIP · Rs 318k','ppl'],['B. Adeyemi · VIP','ppl'],['James O. · new','ppl']]},
  {g:'Owners',ic:'owner',kind:'Owner',items:[['Nitzana Holdings SA','own'],['Beaumont Family Trust','ownerstmt']]},
  {g:'Tasks',ic:'ops',kind:'Task',items:[['SD-10 water fault · urgent','tasks'],['GBH-B4 turnover · by 15:00','tasks'],['Approve 3 field reports','approvals']]},
  {g:'Vendors & docs',ic:'shield',kind:'Doc',items:[['Cleanline · invoice #2208','legal'],['Owner mandate · GBH-B4','legal'],['Tourism-tax remittance · Q2','fin']]},
  {g:'Quick actions',ic:'spark',kind:'Action',items:[['Draft today’s plan','ops'],['Review approvals','approvals'],['Send an owner statement','ownerstmt'],['Restock supplies','supplies'],['Open team chat','team']]},
];
const SEARCH_RECENT = [['SD-10 · Sunset Drive Villa','prop','home'],['Marie L. · GBH-B4 · Jun 1','res','doc'],['Nitzana Holdings SA','own','owner']];

/* ---------- scripted flows: each user turn runs tools then a result ---------- */
function pickFlow(q){
  const s=(q||'').toLowerCase();
  if(/draft|reply|message|respond/.test(s)) return 'draft';
  if(/task|create|fix|schedule a/.test(s)) return 'task';
  if(/statement|owner|payout/.test(s)) return 'owner';
  if(/restock|supply|supplies|order/.test(s)) return 'restock';
  return 'plan';
}
const FLOWS = {
  plan:{
    tools:[['search_tasks','Reading today’s operations','32 tasks · 4 staff · 2 guest-blocked'],['check_roster','Checking staff load','Bryan 88% · others ok']],
    say:'Here’s the shape of your day. <b>SD-10</b>’s water fault is the one to clear first — urgent and recurring. I balanced the rest and protected lunch.',
    action:{t:'Apply day plan',d:'18 jobs across 4 staff · lunch 12:30–13:30 · 0 guest conflicts',btn:'Apply plan',done:'Plan applied · everyone notified'},
  },
  draft:{
    tools:[['read_thread','Reading Marie’s thread','GBH-B4 · check-in question'],['draft_message','Drafting reply','warm · English']],
    say:'Marie asked about early check-in. Here’s a warm reply offering bag drop — she also mentioned the AC was loud last stay.',
    draft:{to:'Marie L. · GBH-B4',body:'Hi Marie! Check-in is from 3pm today — your apartment has a same-day turnover. You’re welcome to drop bags at reception from 1pm. See you soon! 🌴'},
    task:{t:'Create maintenance task',meta:'AC service · GBH-B4 · linked to this thread'},
  },
  task:{
    tools:[['read_property','Reading SD-10 history','pump tripped 3× in 60 days'],['create_task','Creating task','maintenance · urgent']],
    say:'I created an urgent maintenance task for the SD-10 pump and flagged the recurring pattern. Assigning to Bryan unless you’d prefer someone else.',
    task:{t:'Task created · SD-10 pump',meta:'urgent · maintenance · assign Bryan'},
    action:{t:'Notify Bryan now',d:'sends the job + access codes to his phone',btn:'Notify',done:'Bryan notified'},
  },
  owner:{
    tools:[['compile_statement','Compiling April statement','Beaumont Trust · 2 units'],['reconcile','Reconciling','4 reservations · 3 expenses']],
    say:'April statement for <b>Beaumont Trust</b> is reconciled — net payout €5,127. One expense is on hold pending your check before I send.',
    action:{t:'Send statement to owner',d:'Beaumont Trust · April · €5,127 net',btn:'Review & send',done:'Statement sent'},
  },
  restock:{
    tools:[['scan_inventory','Scanning stores','5 items below par'],['draft_order','Drafting order','Cleanline · Rs 2,708']],
    say:'5 items are below par across West &amp; North. I drafted a restock order — towels, sealant, toilet rolls and bulbs.',
    action:{t:'Place restock order',d:'Cleanline · Rs 2,708 · split by store',btn:'Place order',done:'Order placed · Rs 2,708'},
  },
};

/* seed conversation shows the range of capabilities up front */
function seedMsgs(){
  return [
    {id:1,fr:true,html:'Morning Franny 👋 Today: <b>32 tasks</b>, 3 reports to approve, 2 arrivals needing turnovers, and the West store is low on 4 items.'},
    {id:2,tool:{name:'search_tasks',label:'Read your operations',detail:'32 tasks · 4 staff',state:'done'}},
    {id:3,action:{t:'Apply day plan',d:'18 jobs · lunch protected · 0 guest conflicts',btn:'Apply plan',done:'Plan applied'}},
  ];
}

/* ======================= the conversation ======================= */
let __askId = 100;
function AskConversation({compact}){
  const [msgs,setMsgs] = React.useState(seedMsgs);
  const [busy,setBusy] = React.useState(false);
  const bodyRef = React.useRef(null);
  const timers = React.useRef([]);
  const after=(ms,fn)=>timers.current.push(setTimeout(fn,ms));
  React.useEffect(()=>()=>timers.current.forEach(clearTimeout),[]);
  React.useEffect(()=>{ if(bodyRef.current) bodyRef.current.scrollTop=bodyRef.current.scrollHeight; },[msgs]);

  const add = (m)=>{ m.id=++__askId; setMsgs(x=>[...x,m]); return m.id; };
  const patch = (id,upd)=> setMsgs(x=>x.map(m=>m.id===id?{...m,...upd}:m));

  const run = (q)=>{
    add({me:true,html:q});
    setBusy(true);
    const flow = FLOWS[pickFlow(q)];
    add({thinking:true});
    after(700,()=>{
      setMsgs(x=>x.filter(m=>!m.thinking));
      let t=0;
      flow.tools.forEach((tl,i)=>{
        after(t, ()=>{ const id=add({tool:{name:tl[0],label:tl[1],detail:tl[2],state:'run'}}); after(750,()=>patch(id,{tool:{name:tl[0],label:tl[1],detail:tl[2],state:'done'}})); });
        t += 950;
      });
      after(t, ()=>{
        add({fr:true,html:flow.say});
        if(flow.draft) add({draft:flow.draft});
        if(flow.task) add({task:flow.task});
        if(flow.action) add({action:flow.action});
        setBusy(false);
      });
    });
  };

  return (<>
    <div className={"askconv"+(compact?' compact':'')} ref={bodyRef}>
      {msgs.map(m=> <AskMsg key={m.id} m={m} patch={patch}/> )}
    </div>
    <AskComposer busy={busy} onSend={run} suggestions={msgs.length<=3}/>
  </>);
}

function AskMsg({m,patch}){
  if(m.me) return <div className="afm me"><div className="bub" dangerouslySetInnerHTML={{__html:m.html}}/><span className="ava me">FG</span></div>;
  if(m.thinking) return <div className="afm"><FrAva/><div className="ask-think"><span className="fthinking"><i/><i/><i/></span> Friday is thinking…</div></div>;
  if(m.tool) return <div className="afm"><FrAva/><ToolCard t={m.tool}/></div>;
  if(m.draft) return <div className="afm"><FrAva/><DraftCard d={m.draft}/></div>;
  if(m.task) return <div className="afm"><FrAva/><TaskCard t={m.task}/></div>;
  if(m.action) return <div className="afm"><FrAva/><ActionCard a={m.action}/></div>;
  return <div className="afm"><FrAva/><div className="bub" dangerouslySetInnerHTML={{__html:m.html}}/></div>;
}
function FrAva(){ return <span className="ava fr"><img className="askmk" src="friday-f.png" alt="" style={{width:'100%',height:'100%',borderRadius:'inherit'}}/></span>; }

function ToolCard({t}){
  return (
    <div className={"ask-tool "+t.state}>
      <span className="ask-tool-ic">{t.state==='run' ? <span className="ask-spin"/> : <AUI n="check" s={2.4}/>}</span>
      <div style={{minWidth:0,flex:1}}>
        <div className="ask-tool-name"><span className="mono">{t.name}</span> · {t.label}</div>
        <div className="ask-tool-detail">{t.state==='run'?'running…':t.detail}</div>
      </div>
    </div>
  );
}
function DraftCard({d}){
  const [sent,setSent]=React.useState(false);
  const [text,setText]=React.useState(d.body);
  const [edit,setEdit]=React.useState(false);
  return (
    <div className="ask-card">
      <div className="ask-card-h"><span className="bdg indigo"><AUI n="msg" s={1.5}/> Draft reply</span><span className="faint" style={{fontSize:10.5}}>to {d.to}</span></div>
      {edit ? <textarea className="ask-edit" value={text} onChange={e=>setText(e.target.value)} data-no-dictate/> : <div className="ask-card-body">{text}</div>}
      {sent ? <div className="afdone" style={{marginTop:9}}><AUI n="check" s={2}/> Sent to {d.to.split(' · ')[0]}</div> :
      <div className="row" style={{gap:7,marginTop:10}}>
        <button className="dbtn primary sm" onClick={()=>{setSent(true);aiToast('Reply sent','green');}}><AUI n="check" s={2}/> Approve &amp; send</button>
        <button className="dbtn ghost sm" onClick={()=>setEdit(e=>!e)}>{edit?'Done':'Edit'}</button>
        <button className="dbtn ghost sm" onClick={()=>aiToast('Regenerating…')}><AUI n="spark" s={1.6}/> Redo</button>
      </div>}
    </div>
  );
}
function TaskCard({t}){
  const [made,setMade]=React.useState(false);
  return (
    <div className="ask-card">
      <div className="ask-card-h"><span className="bdg violet"><AUI n="ops" s={1.5}/> {made?'Task created':'Create task'}</span></div>
      <div className="ask-card-title">{t.t}</div>
      <div className="ask-card-meta">{t.meta}</div>
      {made ? <div className="afdone" style={{marginTop:9}}><AUI n="check" s={2}/> Created &amp; assigned</div> :
      <div className="row" style={{gap:7,marginTop:10}}>
        <button className="dbtn primary sm" onClick={()=>{setMade(true);aiToast('Task created','green');}}><AUI n="plus" s={2}/> Create &amp; assign</button>
        <button className="dbtn ghost sm" onClick={()=>aiGo('approvals')}>Open</button>
      </div>}
    </div>
  );
}
function ActionCard({a}){
  const [done,setDone]=React.useState(false);
  return (
    <div className="ask-card action">
      <div className="ask-card-h"><span className="ask-shield"><AUI n="shield" s={1.7}/></span><span className="ask-card-title" style={{margin:0}}>{a.t}</span></div>
      <div className="ask-card-meta">{a.d}</div>
      {done ? <div className="afdone" style={{marginTop:9}}><AUI n="check" s={2}/> {a.done}</div> :
      <div className="row" style={{gap:7,marginTop:10}}>
        <button className="dbtn primary sm" onClick={()=>{setDone(true);aiToast(a.done,'green');}}><AUI n="check" s={2}/> {a.btn}</button>
        <button className="dbtn ghost sm">Tweak</button>
      </div>}
    </div>
  );
}

function AskComposer({onSend,busy,suggestions}){
  const ref=React.useRef(null);
  const [v,setV]=React.useState('');
  const [live,setLive]=React.useState(false);
  React.useEffect(()=>{ const iv=setInterval(()=>setLive(window.FADDICTATE?window.FADDICTATE.isListening():false),200); return ()=>clearInterval(iv); },[]);
  const send=()=>{ const q=v.trim(); if(!q||busy) return; onSend(q); setV(''); };
  const chips=['Draft today’s plan','Reply to Marie','Create a task for SD-10','Send the April owner statement'];
  return (
    <div className="askcomp-wrap">
      {suggestions && <div className="askcomp-chips">{chips.map((c,i)=><span key={i} className="aichip" style={{cursor:'pointer'}} onClick={()=>onSend(c)}>{c}</span>)}</div>}
      <div className="askcomposer" data-no-dictate>
        <input ref={ref} className="finput" value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send();}} placeholder={busy?'Friday is working…':'Ask or tell Friday to act…'} disabled={busy}/>
        <button className={"askc-mic"+(live?' live':'')} title="Dictate" onClick={()=>window.FADDICTATE&&window.FADDICTATE.toggleFor(ref.current)}><AUI n={live?'micOff':'mic'} s={1.8}/></button>
        <button className="askc-send" onClick={send} disabled={busy||!v.trim()}><AUI n="chevR" s={2.2}/></button>
      </div>
    </div>
  );
}

/* ======================= header drawer ======================= */
function AskHost(){
  const [ask,setAsk]=React.useState(false);
  const [search,setSearch]=React.useState(false);
  const [voice,setVoice]=React.useState(false);
  React.useEffect(()=>{
    const oa=()=>setAsk(true), os=()=>setSearch(true);
    window.addEventListener('fad-open-ask',oa);
    window.addEventListener('fad-open-search',os);
    const k=e=>{ if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){ e.preventDefault(); setSearch(s=>!s); } };
    window.addEventListener('keydown',k);
    return ()=>{ window.removeEventListener('fad-open-ask',oa); window.removeEventListener('fad-open-search',os); window.removeEventListener('keydown',k); };
  },[]);
  const portal = (el)=> ReactDOM.createPortal ? ReactDOM.createPortal(el, document.body) : el;
  return (<>
    {ask && portal(<AskDrawer onClose={()=>setAsk(false)} onVoice={()=>{setAsk(false);setVoice(true);}}/>)}
    {search && portal(<SearchPalette onClose={()=>setSearch(false)}/>)}
    {voice && window.FADVOICE && portal(<window.FADVOICE.VoiceOverlay onClose={()=>setVoice(false)}/>)}
  </>);
}

function AskDrawer({onClose,onVoice}){
  const [top,setTop]=React.useState(56);
  React.useEffect(()=>{ const tb=document.querySelector('.dtop'); if(tb) setTop(Math.round(tb.getBoundingClientRect().bottom)); const k=e=>{ if(e.key==='Escape') onClose(); }; window.addEventListener('keydown',k); return ()=>window.removeEventListener('keydown',k); },[]);
  return (<>
    <div className="askdrawer-scrim" style={{top}} onClick={onClose}/>
    <div className="askdrawer" style={{top,height:'calc(100vh - '+top+'px)'}}>
      <div className="afp-h">
        <div className="r1"><span className="tt"><img className="askmk" src="friday-f.png" alt=""/> Ask Friday</span>
          <span className="row" style={{gap:6}}><button className="dbtn ghost sm" onClick={onVoice}><AUI n="mic" s={1.7}/> Voice</button><span className="icbtn" style={{cursor:'pointer'}} onClick={onClose}><AUI n="x" s={2}/></span></span>
        </div>
        <div className="afp-scope"><span className="afp-chip" style={{color:'var(--indigo-bright)',borderColor:'var(--indigo-line)'}}><AUI n="pin" s={2} style={{width:9,height:9}}/> All of FridayOS</span><span className="afp-chip">acts with approval</span></div>
      </div>
      <AskConversation compact/>
    </div>
  </>);
}

function SearchPalette({onClose}){
  const [q,setQ]=React.useState('');
  const [sel,setSel]=React.useState(0);
  const inputRef=React.useRef(null);
  React.useEffect(()=>{ inputRef.current&&inputRef.current.focus(); const k=e=>{ if(e.key==='Escape') onClose(); }; window.addEventListener('keydown',k); return ()=>window.removeEventListener('keydown',k); },[]);
  const groups = SEARCH_INDEX.map(g=>({...g, items:g.items.filter(it=> !q || it[0].toLowerCase().includes(q.toLowerCase()))})).filter(g=>g.items.length);
  const flat = []; groups.forEach(g=>g.items.forEach(it=>flat.push(it)));
  const open=(route)=>{ aiGo(route); onClose(); };
  const onKey=e=>{ if(e.key==='ArrowDown'){e.preventDefault();setSel(s=>Math.min(s+1,flat.length-1));} else if(e.key==='ArrowUp'){e.preventDefault();setSel(s=>Math.max(s-1,0));} else if(e.key==='Enter'&&flat[sel]){ open(flat[sel][1]); } };
  let idx=-1;
  return (<>
    <div className="search-scrim" onClick={onClose}/>
    <div className="search-pal">
      <div className="search-head">
        <AUI n="search" s={2} style={{color:'var(--indigo-bright)'}}/>
        <input ref={inputRef} className="finput" value={q} onChange={e=>{setQ(e.target.value);setSel(0);}} onKeyDown={onKey} placeholder="Search anything — properties, reservations, guests, owners, tasks…" data-no-dictate/>
        {q ? <span className="faint mono" style={{fontSize:10}}>{flat.length} result{flat.length===1?'':'s'}</span> : <span className="kbd">esc</span>}
      </div>
      <div className="search-body">
        {!q && <div className="search-grp">
          <div className="search-glbl"><AUI n="clock" s={1.6}/> Recent</div>
          {SEARCH_RECENT.map((r,i)=>(<div key={i} className="search-row" onClick={()=>open(r[1])}><span className="search-ic"><AUI n={r[2]} s={1.7}/></span><span className="search-label">{r[0]}</span><AUI n="chevR" s={2} style={{color:'var(--tx-4)'}}/></div>))}
        </div>}
        {flat.length===0 && q && <div className="search-empty"><img className="askmk" src="friday-f.png" alt="" style={{width:20,height:20}}/> No matches — <span className="dlink" onClick={()=>{window.dispatchEvent(new Event('fad-open-ask'));onClose();}}>ask Friday “{q}”</span></div>}
        {groups.map((g,gi)=>(
          <div key={gi} className="search-grp">
            <div className="search-glbl"><AUI n={g.ic} s={1.6}/> {g.g} <span className="faint mono" style={{fontSize:9}}>{g.items.length}</span></div>
            {g.items.map((it,ii)=>{ idx++; const on=idx===sel; return (
              <div key={ii} className={"search-row"+(on?' on':'')} onMouseEnter={()=>setSel(flat.indexOf(it))} onClick={()=>open(it[1])}>
                <span className="search-ic"><AUI n={g.ic} s={1.7}/></span>
                <span className="search-label">{it[0]}</span>
                <span className="search-kind">{g.kind}</span>
                <AUI n="chevR" s={2} style={{color:'var(--tx-4)',flex:'0 0 auto'}}/>
              </div>
            ); })}
          </div>
        ))}
      </div>
      <div className="search-foot"><span><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span><span><span className="kbd">↵</span> open</span><span className="grow" style={{flex:1}}/><span className="row" style={{gap:5,cursor:'pointer'}} onClick={()=>{window.dispatchEvent(new Event('fad-open-ask'));onClose();}}><img className="askmk" src="friday-f.png" alt="" style={{width:13,height:13}}/> ask Friday anything</span></div>
    </div>
  </>);
}

window.FADASKUI = { AskHost, AskConversation, openAsk:()=>window.dispatchEvent(new Event('fad-open-ask')), openSearch:()=>window.dispatchEvent(new Event('fad-open-search')) };
