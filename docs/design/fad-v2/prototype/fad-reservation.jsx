/* ============================================================================
   FAD · Reservation detail — full tabbed workspace (Guesty-structure parity)
   Reuses Shell, DI from fad-desktop.jsx. Interactive tabs via useState.
   ========================================================================== */
const RTABS = ['Overview','Booking details','Guests','Operations','Guest folio & invoice','Accounting','Payments','Activity log'];
const RICON = {'Overview':'home','Booking details':'doc','Guests':'users','Operations':'ops','Guest folio & invoice':'coin','Accounting':'list','Payments':'shield','Activity log':'clock'};

function RField({l,children,last}){
  return <div className="drow" style={last?{borderBottom:'none'}:null}><span className="faint">{l}</span><span style={{textAlign:'right'}}>{children}</span></div>;
}
function Ledger({title,total,rows,grp}){
  return (
    <div className="panel" style={{marginBottom:14}}>
      <div className="rledger-h"><span>{title}</span><span className="tot">{total}</span></div>
      <table className="tbl"><thead><tr><th>Recognition</th><th>Subledger</th><th>Transaction type</th><th>Journal entry</th><th>{grp||'Payout status'}</th><th style={{textAlign:'right'}}>Total</th></tr></thead>
      <tbody>{rows.map((r,i)=>(<tr key={i}><td className="mono faint" style={{fontSize:10.5}}>{r[0]}</td><td>{r[1]}</td><td className="faint">{r[2]}</td><td className="faint">{r[3]}</td><td><span className="bdg gray">{r[4]}</span></td><td className="mono" style={{textAlign:'right',color:r[5][0]==='-'?'var(--red)':'var(--tx)'}}>{r[5]}</td></tr>))}</tbody></table>
    </div>
  );
}

function ScreenReservation(){
  const [tab,setTab] = React.useState('Overview');
  return (
    <Shell active="res" bare>
      <div className="faint mono" style={{fontSize:11,marginBottom:14}}>Reservations <span style={{color:'var(--tx-4)'}}>›</span> GY-FmncsBH5</div>
      <div className="rdgrid">
        {/* ---- left: context + tab nav ---- */}
        <div className="rdctx">
          <div className="row between"><span className="mono" style={{fontWeight:700,fontSize:13}}>GY-FmncsBH5</span><DI n="chevR" s={1.7} style={{color:'var(--tx-3)'}}/></div>
          <div className="row" style={{gap:6,margin:'8px 0'}}><span className="bdg green dot">Confirmed</span><span className="bdg amber dot">Partially paid</span></div>
          <div className="rdthumb"/>
          <div style={{fontWeight:600,fontSize:13}}>Cyril</div>
          <div className="faint" style={{fontSize:11}}>11 Adults · 1 Infant · Airbnb</div>
          <div className="row between" style={{marginTop:11,paddingTop:10,borderTop:'1px solid var(--line-2)'}}>
            <div><div className="faint mono" style={{fontSize:9}}>CHECK-IN</div><div style={{fontSize:12.5,fontWeight:600}}>May 1, 2026</div><div className="faint mono" style={{fontSize:9.5}}>12:00 PM</div></div>
            <DI n="chevR" s={2} style={{color:'var(--tx-3)'}}/>
            <div style={{textAlign:'right'}}><div className="faint mono" style={{fontSize:9}}>CHECK-OUT · 9n</div><div style={{fontSize:12.5,fontWeight:600}}>May 10, 2026</div><div className="faint mono" style={{fontSize:9.5}}>10:00 AM</div></div>
          </div>
          <button className="dbtn ghost sm" style={{width:'100%',marginTop:12}}><DI n="chevR" s={1.7}/> Open in inbox</button>
          <div className="rdnav">
            {RTABS.map(t=>(<div key={t} className={"it"+(t===tab?' on':'')} onClick={()=>setTab(t)}><DI n={RICON[t]} s={1.7}/> {t}</div>))}
          </div>
        </div>
        {/* ---- right: active tab ---- */}
        <div>
          <div className="dhead" style={{marginBottom:14}}><div><div className="eyebrow">RESERVATION</div><h1>{tab}</h1></div>
            <div className="row">{tab==='Overview' && <><button className="dbtn"><DI n="spark" s={1.6}/> Ask Friday</button><button className="dbtn ghost">Modify</button></>}{tab==='Payments' && <button className="dbtn primary"><DI n="plus" s={2}/> Record payment</button>}{tab==='Guest folio & invoice' && <><button className="dbtn ghost">Adjust line item</button><button className="dbtn ghost"><DI n="plus" s={2}/> Add line item</button></>}{tab==='Accounting' && <button className="dbtn primary"><DI n="plus" s={2}/> Add a transaction</button>}</div>
          </div>
          {tab==='Overview' && <ROverview/>}
          {tab==='Booking details' && <RBooking/>}
          {tab==='Guests' && <RGuests/>}
          {tab==='Operations' && <ROps/>}
          {tab==='Guest folio & invoice' && <RFolio/>}
          {tab==='Accounting' && <RAccounting/>}
          {tab==='Payments' && <RPayments/>}
          {tab==='Activity log' && <RActivity/>}
        </div>
      </div>
    </Shell>
  );
}

function ROverview(){
  return (<>
    <div className="grid4">
      <div className="statc"><div className="n">€2,498</div><div className="l">Payout</div></div>
      <div className="statc"><div className="n">€1,188</div><div className="l">Owner's revenue</div></div>
      <div className="statc"><div className="n">€437</div><div className="l">Your commission</div></div>
      <div className="statc amber"><div className="n">€1,518</div><div className="l">Balance due</div></div>
    </div>
    <div className="fbar" style={{marginTop:13}}><span className="fi"><DI n="spark" s={1.6}/></span><span className="ft"><b>Friday.</b> Balance €1,518 still due — guest paid €980 deposit. Turnover for LB-C is scheduled with Ishant for May 1. Access code not yet sent.</span><span className="fb"><button className="dbtn ghost sm">Send balance request</button></span></div>
    <div className="dtwocol" style={{display:'grid',gridTemplateColumns:'1.1fr 1fr',gap:14,marginTop:14}}>
      <div className="panel">
        <div className="dml" style={{margin:'0 0 6px'}}>Stay<span className="rule"/></div>
        <RField l="Property"><span className="pcodeD">LB-C</span> 3 Villas Complex</RField>
        <RField l="Dates">May 1 → May 10 · 9 nights</RField>
        <RField l="Guests">11 adults · 1 infant</RField>
        <RField l="Channel"><span className="row" style={{gap:6,justifyContent:'flex-end'}}><span className="mdot" style={{background:'#e08e89',width:8,height:8,borderRadius:3}}/>Airbnb</span></RField>
        <RField l="Rate plan">Standard</RField>
        <RField l="Cancellation" last>Firm</RField>
      </div>
      <div className="panel">
        <div className="dml" style={{margin:'0 0 6px'}}>Status &amp; flags<span className="rule"/></div>
        <div className="rdflag"><span className="row" style={{gap:8}}><DI n="check" s={1.8} style={{color:'var(--green)'}}/> Payment</span><span className="bdg amber">Deposit only</span></div>
        <div className="rdflag"><span className="row" style={{gap:8}}><DI n="check" s={1.8} style={{color:'var(--green)'}}/> Booking confirmed</span><span className="faint mono" style={{fontSize:10}}>Feb 17</span></div>
        <div className="rdflag"><span className="row" style={{gap:8}}><DI n="flag" s={1.8} style={{color:'var(--amber)'}}/> Access info</span><span className="bdg amber">Not sent</span></div>
        <div className="rdflag" style={{borderBottom:'none'}}><span className="row" style={{gap:8}}><DI n="ops" s={1.8} style={{color:'var(--indigo-bright)'}}/> Turnover task</span><span className="bdg violet">Scheduled · IA</span></div>
        <div className="row" style={{gap:7,flexWrap:'wrap',marginTop:12}}>
          <button className="dbtn sm" style={{flex:'1 0 46%'}}><DI n="msg" s={1.7}/> Message guest</button>
          <button className="dbtn sm" style={{flex:'1 0 46%'}}><DI n="ops" s={1.7}/> Create task</button>
          <button className="dbtn ghost sm" style={{flex:'1 0 46%'}}>＋ Note</button>
          <button className="dbtn ghost sm" style={{flex:'1 0 46%',color:'var(--red)'}}>Cancel reservation</button>
        </div>
      </div>
    </div>
  </>);
}

function RBooking(){
  return (<div className="panel">
    <RField l="Confirmation code"><span className="mono">GY-FmncsBH5</span></RField>
    <RField l="Channel">Airbnb · <span className="faint mono" style={{fontSize:10}}>HMRB9SQB84</span></RField>
    <RField l="Check-in">May 1, 2026 · 12:00 PM</RField>
    <RField l="Check-out">May 10, 2026 · 10:00 AM</RField>
    <RField l="Nights">9</RField>
    <RField l="Guests">11 adults · 0 children · 1 infant</RField>
    <RField l="Rate plan">Standard</RField>
    <RField l="Cancellation policy">Firm</RField>
    <RField l="Booked on">Feb 16, 2026</RField>
    <RField l="Source" last>Airbnb (channel)</RField>
  </div>);
}

function RGuests(){
  return (<>
    <div className="panel" style={{marginBottom:14}}>
      <div className="row between"><div className="row" style={{gap:11}}><span className="av1" style={{width:38,height:38,fontSize:12}}>CY</span><div><div style={{fontWeight:600,fontSize:14}}>Cyril <span className="bdg amber">VIP</span></div><div className="faint" style={{fontSize:11.5,marginTop:2}}>Lead guest · 2 prior stays · ★ 4.9</div></div></div><button className="dbtn ghost sm"><DI n="msg" s={1.7}/> Message</button></div>
      <div style={{marginTop:12,paddingTop:11,borderTop:'1px solid var(--line-2)'}}>
        <RField l="Email">cyril@example.com</RField>
        <RField l="Phone">+230 5xxx xxxx</RField>
        <RField l="Party">11 adults · 1 infant</RField>
        <RField l="Preferences" last>Late check-out requested · ground floor</RField>
      </div>
    </div>
    <div className="panel"><div className="dml" style={{margin:'0 0 6px'}}>Stay history<span className="rule"/></div>
      <table className="tbl"><tbody>
        <tr><td className="tt">LB-C</td><td className="faint">Dec 2025 · 5n</td><td className="mono" style={{textAlign:'right',color:'var(--amber)'}}>★ 5.0</td></tr>
        <tr><td className="tt">VA-3</td><td className="faint">Aug 2025 · 3n</td><td className="mono" style={{textAlign:'right',color:'var(--amber)'}}>★ 4.8</td></tr>
      </tbody></table>
    </div>
  </>);
}

function ROps(){
  const tasks=[['Turnover clean','LB-C','Ishant A.','May 1 · 10:00','violet','Scheduled'],['Pre-arrival inspection','LB-C','Catherine H.','May 1 · 13:00','gray','Open'],['Welcome amenities setup','LB-C','Ishant A.','May 1 · 13:30','gray','Open']];
  return (<div className="panel" style={{padding:'12px 6px'}}>
    <div className="dml" style={{margin:'2px 12px 6px'}}>Linked tasks <span className="ct">3</span><span className="rule"/></div>
    <table className="tbl"><thead><tr><th>Task</th><th>Property</th><th>Assignee</th><th>Due</th><th>Status</th></tr></thead>
    <tbody>{tasks.map((t,i)=>(<tr key={i}><td className="tt">{t[0]}</td><td><span className="pcodeD">{t[1]}</span></td><td className="faint">{t[2]}</td><td className="mono faint">{t[3]}</td><td><span className={"bdg "+t[4]}>{t[5]}</span></td></tr>))}</tbody></table>
  </div>);
}

function RFolio(){
  const items=[['Accommodation fare','€2,313.00','—','€2,313.00'],['Cleaning fee','€185.00','—','€185.00']];
  return (<>
    <div className="grid4" style={{marginBottom:14}}>
      <div className="statc"><div className="n">€2,498</div><div className="l">Payout</div></div>
      <div className="statc"><div className="n">€1,188</div><div className="l">Owner's revenue</div></div>
      <div className="statc"><div className="n">€437</div><div className="l">Your commission</div></div>
      <div className="statc"><div className="n">€0.00</div><div className="l">Channel commission tax</div></div>
    </div>
    <div className="panel" style={{padding:'12px 6px'}}>
      <div className="row between" style={{padding:'0 12px'}}><div className="dml" style={{margin:0}}>Guest folio breakdown <span className="bdg gray">Standard</span><span className="rule"/></div><span className="vseg"><span className="vs on">By line item</span><span className="vs">By night</span></span></div>
      <table className="tbl" style={{marginTop:6}}><thead><tr><th>Item</th><th style={{textAlign:'right'}}>Amount</th><th style={{textAlign:'right'}}>Tax</th><th style={{textAlign:'right'}}>Total</th></tr></thead>
      <tbody>{items.map((r,i)=>(<tr key={i}><td className="tt">{r[0]}</td><td className="mono" style={{textAlign:'right'}}>{r[1]}</td><td className="mono faint" style={{textAlign:'right'}}>{r[2]}</td><td className="mono" style={{textAlign:'right'}}>{r[3]}</td></tr>))}
        <tr><td style={{fontWeight:700}}>Total</td><td></td><td className="faint mono" style={{textAlign:'right'}}>€0.00</td><td className="mono" style={{textAlign:'right',fontWeight:700}}>€2,498.00</td></tr>
      </tbody></table>
      <div className="row between" style={{padding:'12px 12px 2px',borderTop:'1px solid var(--line-2)',marginTop:6}}><span className="faint" style={{fontSize:12}}>Guest invoice · <span className="bdg amber">Not sent</span></span><span className="row" style={{gap:7}}><button className="dbtn primary sm"><DI n="msg" s={1.7}/> Send</button><button className="dbtn ghost sm">Copy</button></span></div>
    </div>
  </>);
}

function RAccounting(){
  return (<>
    <div className="row" style={{gap:14,marginBottom:14}}>
      <div className="statc" style={{flex:1}}><div className="n">€1,188.23</div><div className="l">Owner's revenue</div></div>
      <div className="statc" style={{flex:1}}><div className="n">€437.42</div><div className="l">Your commission</div></div>
    </div>
    <div className="fbar" style={{marginBottom:14}}><span className="fi"><DI n="list" s={1.6}/></span><span className="ft">Business model <b>Prestige Plan v.13</b> · processed 04/13/2026 · status <span style={{color:'var(--green)'}}>In progress</span></span></div>
    <Ledger title="Owners" total="€0.00" rows={[['May 10','Building Block Ltd','Tourism Tax','Tourist Tax','Unpaid','€297.00'],['May 10','Building Block Ltd','Rental Income','Net Rental Income','Unpaid','-€1,988.26'],['May 10','Building Block Ltd','Management Fee','Commission','Unpaid','€437.42'],['May 10','Building Block Ltd','VAT','VAT','Unpaid','€65.61']]}/>
    <Ledger title="Accounts Payable (PMC, Vendors, Tax)" total="€0.00" rows={[['May 10','Manual','Host Channel Fee','Deducted commission','Unpaid','-€324.74'],['May 10','PMC','Tourism Tax','Tourist Tax','Unpaid','-€297.00'],['May 10','PMC','Cleaning Fee','Cleaning fee','Unpaid','-€185.00'],['May 10','PMC','Management Fee','Commission','Unpaid','-€437.42'],['May 10','Owners VAT','VAT','VAT','Unpaid','-€65.61']]}/>
    <Ledger title="Cash" total="€980.00" grp="Group status" rows={[['Feb 16','Cyril','Payment Recording','Payment - BANK_TRANSFER','Ungrouped','€980.00']]}/>
    <Ledger title="Advanced deposit (Guest)" total="-€980.00" grp=" " rows={[['Feb 16','Cyril','Payment Recording','Payment - BANK_TRANSFER','—','-€980.00'],['May 10','Cyril','Host Channel Fee','Deducted commission','—','€324.74'],['May 10','Cyril','Cleaning Fee','Cleaning fee','—','€185.00'],['May 10','Cyril','Rental Income','Net Rental Income','—','€1,988.26']]}/>
  </>);
}

function RPayments(){
  return (<>
    <div className="row" style={{gap:14,marginBottom:14}}>
      <div className="statc" style={{flex:1}}><div className="n" style={{fontSize:18}}>Pending</div><div className="l">Status · payment collection</div></div>
      <div className="statc amber" style={{flex:1}}><div className="n">€1,518</div><div className="l">Balance due</div></div>
      <div className="statc" style={{flex:1}}><div className="n" style={{fontSize:18}}>Unscheduled</div><div className="l">Next payment</div></div>
    </div>
    <div className="gate" style={{borderStyle:'solid',marginBottom:14}}><span style={{color:'var(--red)'}}><DI n="flag" s={1.7}/></span><span>No payment processor connected — payments are recorded manually. <a className="dlink">Connect account</a></span></div>
    <div className="panel" style={{padding:'12px 6px'}}>
      <div className="dml" style={{margin:'2px 12px 6px'}}>Transactions <span className="ct">1</span><span className="rule"/></div>
      <table className="tbl"><thead><tr><th>Date</th><th>Status</th><th>Type</th><th>Method</th><th style={{textAlign:'right'}}>Amount</th><th></th></tr></thead>
      <tbody><tr><td className="mono faint">Feb 16, 2026</td><td><span className="bdg green dot">Approved</span></td><td className="faint">Recorded payment</td><td><span className="row" style={{gap:6}}><DI n="coin" s={1.6} style={{color:'var(--tx-3)'}}/>Bank transfer</span></td><td className="mono" style={{textAlign:'right',fontWeight:600}}>€980.00</td><td style={{textAlign:'right'}}><a className="dlink" style={{fontSize:11.5}}>Mark refunded</a></td></tr></tbody></table>
    </div>
  </>);
}

function RActivity(){
  const log=[['Apr 13, 2:22 PM','Planned arrival update','From 14:00 → 12:00','mathias+1@friday.mu','indigo'],['Apr 13, 2:22 PM','Reservation update','Reservation was updated','mathias+1@friday.mu','gray'],['Feb 17, 11:16 PM','Status updated','Status changed “reserved” → “confirmed”','mary@friday.mu','green'],['Feb 17, 11:16 PM','Reservation update','Reservation was updated','mary@friday.mu','gray'],['Feb 16, 4:10 PM','Reservation update','Light money update','ishant@friday.mu','gray']];
  return (<div className="panel" style={{padding:'12px 6px'}}>
    <div className="row between" style={{padding:'0 12px 8px'}}><div className="dml" style={{margin:0}}>Activity log<span className="rule"/></div><span className="aichip">Activity type <DI n="chevD" s={2} style={{width:11,height:11}}/></span></div>
    <table className="tbl"><thead><tr><th>Date</th><th>Activity type</th><th>Details</th><th>Team member</th></tr></thead>
    <tbody>{log.map((r,i)=>(<tr key={i}><td className="mono faint" style={{fontSize:10.5}}>{r[0]}</td><td><span className={"bdg "+r[4]}>{r[1]}</span></td><td className="faint">{r[2]}</td><td className="mono faint" style={{fontSize:10.5}}>{r[3]}</td></tr>))}</tbody></table>
  </div>);
}

window.FADRES = { ScreenReservation };
