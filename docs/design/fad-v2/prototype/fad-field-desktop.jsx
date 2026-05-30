/* FAD V2 — Field-staff DESKTOP: shell (rail + topbar) + router.
   Reuses the GM desktop chrome (window.FADD.DI, fad-desktop.css) but the rail
   is scoped to only what a field-staff member can see on mobile. */
const { DI, PriD } = window.FADD;

/* persona */
const FIELD_ME = { name:'Ishant Ayadassen', initials:'IA', role:'Field staff', zone:'West zone' };

/* ---- global nav primitive for the field desktop ----
   FIELDGO(key, param) swaps the in-app screen via the hash router registered
   by FieldDesktopApp. A param (e.g. a task id) is stashed for the next screen. */
window.__FIELD_PARAM = null;
window.FIELDGO = function(key, param){
  if(param!==undefined) window.__FIELD_PARAM = param;
  if(window.__FIELDROUTER){ window.__FIELDROUTER(key); }
};

/* ---- topbar (field skin) ---- */
function FieldTopbar(){
  return (
    <div className="dtop">
      <span className="collapse" onClick={()=>window.FIELDGO('tasks')} style={{cursor:'pointer'}}><DI n="ops" s={2}/></span>
      <span className="wm" onClick={()=>window.FIELDGO('tasks')} style={{cursor:'pointer'}}>FridayOS</span>
      <span className="tlbl"><span className="livedot" style={{marginRight:7}}/>Friday Retreats · Field</span>
      <div className="dsearch" onClick={()=>window.FIELDGO('tasks')} style={{cursor:'pointer'}}>
        <DI n="search" s={2}/> <span>Search your tasks or <b>Ask Friday</b>…</span><span className="k">⌘K</span>
      </div>
      <div className="dtop-right">
        <span className="icbtn alert" onClick={()=>window.FIELDGO('notif')} style={{cursor:'pointer'}}><DI n="bell" s={2}/></span>
        <span className="icbtn" onClick={()=>window.FIELDGO('chat')} style={{cursor:'pointer'}}><DI n="msg" s={2}/></span>
        <span className="viewas" onClick={()=>window.FIELDGO('account')} style={{cursor:'pointer'}}>
          <span className="av">{FIELD_ME.initials}</span> {FIELD_ME.role} <DI n="chevD" s={2.2} style={{width:13,height:13,opacity:.6}}/>
        </span>
      </div>
    </div>
  );
}

/* ---- left rail (scoped to field staff) ---- */
function FNItem({ic, label, ct, hot, on, k}){
  return (
    <div className={"nitem"+(on?" on":"")} onClick={()=>k&&window.FIELDGO(k)} style={{cursor:k?'pointer':'default'}}>
      <DI n={ic} s={1.9}/><span>{label}</span>{ct!=null&&<span className={"ct"+(hot?" hot":"")}>{ct}</span>}
    </div>
  );
}
function FieldRail({active}){
  return (
    <div className="drail">
      <div className="askfri" onClick={()=>window.FIELDGO('tasks')} style={{cursor:'pointer'}}>
        <span style={{color:'var(--indigo-bright)',fontSize:15}}><img className="askmk" src="friday-f.png" alt=""/></span>
        <span className="af-t">Ask Friday</span><span className="af-x"><DI n="chevR" s={2}/></span>
      </div>
      <div className="nsec">Today</div>
      <FNItem ic="ops" label="My day" ct="4" hot on={active==='tasks'||active==='task'} k="tasks"/>
      <FNItem ic="bell" label="Notifications" ct="3" on={active==='notif'} k="notif"/>
      <div className="nsec">My work</div>
      <FNItem ic="cal" label="Schedule" on={active==='schedule'} k="schedule"/>
      <FNItem ic="clock" label="Time off" on={active==='timeoff'} k="timeoff"/>
      <FNItem ic="flag" label="My reports" ct="3" on={active==='reports'} k="reports"/>
      <div className="nsec">Team</div>
      <FNItem ic="msg" label="Team chat" ct="6" on={active==='chat'} k="chat"/>
      <FNItem ic="star" label="My reviews" on={active==='reviews'} k="reviews"/>
      <div className="drail-foot">
        <span className="icbtn" onClick={()=>window.FIELDGO('account')} style={{cursor:'pointer'}}><DI n="gear" s={2}/></span>
        <span className="faint mono" style={{fontSize:10}}>FridayOS v2.0 · Field</span>
      </div>
    </div>
  );
}

/* ---- shell (mirrors window.FADD.Shell but with the field rail/topbar) ---- */
function FieldShell({active, eyebrow, title, sub, tabs, actions, panel, bare, children}){
  return (
    <div className="dwrap">
      <div className={"dapp"+(panel?" withpanel":"")}>
        <FieldTopbar/>
        <FieldRail active={active}/>
        <div className="dmain">
          {!bare && <div className="dhead">
            <div style={{minWidth:0,flex:'1 1 auto'}}>{eyebrow&&<div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{sub&&<div className="sub">{sub}</div>}</div>
            <div className="row" style={{flex:'0 0 auto'}}>{actions}</div>
          </div>}
          {!bare && tabs && <div className="dtabs">{tabs.map((t,i)=>(
            <span key={i} className={"dtab"+(t.on?" on":"")} onClick={()=>t.k&&window.FIELDGO(t.k)} style={{cursor:t.k?'pointer':'default'}}>{t.l}{t.ct!=null&&<span className="ct">{t.ct}</span>}</span>
          ))}</div>}
          <div className="dbody">{children}</div>
        </div>
        {panel}
      </div>
    </div>
  );
}

/* ---- reusable Ask-Friday panel (field scope) — same markup as GM AskPanel ---- */
function FieldAskPanel({scope, aware, msgs}){
  return (
    <div className="daside">
      <div className="afp-h">
        <div className="r1"><span className="tt"><img className="askmk" src="friday-f.png" alt=""/> Ask Friday</span><span className="icbtn" style={{width:26,height:26,border:'none',background:'transparent'}}><DI n="x" s={2}/></span></div>
        <div className="afp-scope"><span className="afp-chip" style={{color:'var(--indigo-bright)',borderColor:'var(--indigo-line)'}}><DI n="pin" s={2} style={{width:9,height:9}}/> {scope}</span><span className="afp-chip">My work</span></div>
        <div className="afp-aware">{aware}</div>
      </div>
      <div className="afp-body">
        {msgs.map((m,i)=> m.me ? (
          <div key={i} className="afm me"><span className="ava me">{FIELD_ME.initials}</span><div className="bub" dangerouslySetInnerHTML={{__html:m.t}}/></div>
        ) : (
          <div key={i} className="afm"><span className="ava fr"><img className="askmk" src="friday-f.png" alt="" style={{width:'100%',height:'100%',borderRadius:'inherit'}}/></span><div style={{minWidth:0}}>
            <div className="bub" dangerouslySetInnerHTML={{__html:m.t}}/>
            {m.action && <div className="afact"><div className="at"><DI n="shield" s={1.7} style={{color:'var(--indigo-bright)'}}/> {m.action.t}</div><div className="adesc">{m.action.d}</div><div className="arow"><button className="dbtn primary sm"><DI n="check" s={2}/> {m.action.btn}</button><button className="dbtn ghost sm">Tweak</button></div></div>}
            {m.done && <div className="afdone" style={{marginTop:8}}><DI n="check" s={2}/> {m.done}</div>}
          </div></div>
        ))}
      </div>
      <div className="afp-comp"><div className="afp-in real"><input className="finput" placeholder="Ask Friday about your day…"/><span className="snd"><DI n="chevR" s={2.2}/></span></div></div>
    </div>
  );
}

/* lightweight toast (mirrors window.fadToast if present, else local) */
function fieldToast(msg, tone){
  if(window.fadToast){ window.fadToast(msg, tone); return; }
  let host=document.getElementById('field-toast');
  if(!host){ host=document.createElement('div'); host.id='field-toast'; document.body.appendChild(host); }
  const el=document.createElement('div'); el.className='ftoast '+(tone||''); el.textContent=msg;
  host.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(8px)'; }, 2200);
  setTimeout(()=>el.remove(), 2600);
}

window.FADFIELD = { FIELD_ME, FieldShell, FieldRail, FieldTopbar, FieldAskPanel, fieldToast };
