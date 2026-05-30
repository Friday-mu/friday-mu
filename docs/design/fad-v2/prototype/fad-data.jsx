/* FAD V2 — prototype data: tasks (with requirements), chat threads */

const TASKS = {
  'turnover': {
    id:'turnover', code:'GBH-B4', addr:'Apt with Pool & Gym · Grand Baie', area:'GRAND BAIE HEIGHTS',
    title:'Deep clean — guest turnover', dept:'housekeeping', priority:'high',
    occ:'Check-in 15:00', occState:'soon', source:{src:'bz',label:'breezeway'}, refId:'#112540021',
    due:'Today · before 15:00', window:'check-out 11:00 → check-in 15:00',
    desc:'Full turnover clean before the next guest. Complete the cleaning checklist, restock amenities and run the post-clean inspection. Photo proof required.',
    importedFrom:'breezeway 112540021', assignee:'IA', est:'2h 00m', last:'1h 50m',
    requirements:[
      {title:'Cleaning checklist', type:'check', items:[
        {key:'beds', label:'Strip & remake all beds with fresh linen', req:true},
        {key:'bath', label:'Sanitise bathrooms — toilet, shower, sink', req:true, photo:true},
        {key:'kitchen', label:'Clean kitchen, empty fridge, run dishwasher', photo:true},
        {key:'floors', label:'Vacuum & mop all floors'},
        {key:'trash', label:'Empty all bins, replace liners'},
        {key:'balcony', label:'Wipe balcony furniture & sweep'},
      ]},
      {title:'Amenity inventory', type:'inventory', sub:'Count what is left, restock to par', items:[
        {key:'water', name:'Bottled water', par:6, count:2},
        {key:'coffee', name:'Coffee pods', par:8, count:8},
        {key:'towels', name:'Bath towels', par:6, count:4},
        {key:'toilet', name:'Toilet rolls', par:4, count:1},
        {key:'soap', name:'Soap / shampoo sets', par:4, count:3},
      ]},
      {title:'Linen & breakables', type:'inventory', sub:'Count each set — flag anything damaged, broken or missing', items:[
        {key:'glasses', name:'Wine / drinking glasses', par:8, count:8, track:true},
        {key:'crockery', name:'Crockery (plates, bowls)', par:8, count:8, track:true},
        {key:'cutlery', name:'Cutlery set', par:8, count:8, track:true},
        {key:'btowels', name:'Bath towels', par:6, count:6, track:true},
        {key:'linenset', name:'Bed linen set', par:3, count:3, track:true},
      ]},
      {title:'Post-clean inspection', type:'check', sub:'Final walkthrough before handover', items:[
        {key:'ac', label:'AC cooling & set to 22°C', req:true},
        {key:'wifi', label:'Wi-Fi card placed & tested'},
        {key:'welcome', label:'Welcome pack & keys on counter', req:true, photo:true},
        {key:'smell', label:'No odours — air freshened'},
      ]},
    ],
    supplies:[
      {name:'All-purpose cleaner', meta:'consumable · Rs 90 / unit', qty:1, sug:true},
      {name:'Glass cleaner', meta:'consumable · Rs 75 / unit', qty:1, sug:true},
    ],
  },
  'water': {
    id:'water', code:'SD-10', addr:'Sunset Drive · Tamarin', area:'SUNSET DRIVE, TAMARIN',
    title:'Water Issue', dept:'maintenance', priority:'urgent',
    occ:'Vacant · check-in Sun 7 Sep', occState:'vacant', source:{src:'bz',label:'breezeway'}, refId:'#112331268',
    due:'Sun, 7 Sep · 09:00', window:'1h window', est:'1h 30m', last:'1h 25m', assignee:'IA',
    desc:'Guest reported no water running in the apartment. Please inspect and resolve the water supply issue.',
    importedFrom:'breezeway 112331268',
    learning:'Friday heads-up — this property has had 3 pump issues in 60 days. If the indicator light is red it usually means the borehole pump tripped on dry-run: check the breaker before resetting, and don’t keep resetting if it trips again.',
    requirements:[
      {title:'Repair checklist', type:'check', items:[
        {key:'iso', label:'Isolate main water supply', req:true},
        {key:'find', label:'Locate fault — pump / valve / line', req:true},
        {key:'fix', label:'Repair or replace faulty part', photo:true},
        {key:'test', label:'Test flow at all outlets', req:true},
      ]},
      {title:'Post-repair inspection', type:'check', items:[
        {key:'leak', label:'No leaks at repair point', req:true, photo:true},
        {key:'press', label:'Water pressure normal'},
        {key:'clean', label:'Work area cleaned up'},
      ]},
    ],
    supplies:[
      {name:'Pipe sealant', meta:'consumable · Rs 120 / unit', qty:1, sug:true},
      {name:'Teflon tape', meta:'consumable · Rs 45 / unit', qty:1, sug:true},
    ],
  },
};

// task list ordering for My Tasks
const TASK_LIST = {
  overdue:[
    {code:'VA-3', addr:'Géranium Road · Grand Baie', title:'Internet Top Up', priority:'high', meta:['admin','due Mon 25 May'], occ:'Vacant', occState:'vacant', due:{tone:'red',label:'Overdue 5d'}, source:{src:'bz',label:'breezeway'}},
    {code:'LB-2', addr:'Les Bougainvilliers', title:'To readjust price for syndic fee', priority:'med', meta:['admin','due Mon 13 Apr'], occ:'Vacant', occState:'vacant', due:{tone:'red',label:'Overdue'}, source:{src:'gy',label:'guesty'}},
  ],
  today:[
    {id:'turnover', code:'GBH-B4', addr:'Apt with Pool & Gym · Grand Baie', title:'Deep clean — guest turnover', priority:'high', accent:'amber', meta:['housekeeping','by 15:00'], occ:'Check-in 15:00', occState:'soon', source:{src:'bz',label:'breezeway'}},
    {id:'water', code:'SD-10', addr:'Sunset Drive · Tamarin', title:'Water Issue', priority:'urgent', accent:'indigo', meta:['maintenance','09:00'], occ:'Vacant', occState:'vacant', source:{src:'bz',label:'breezeway'}},
    {code:'RC-7', addr:'Royal Court · Pereybère', title:'Table too high — lower the table', priority:'med', meta:['maintenance','11:00'], occ:'Check-in 15:00', occState:'soon', source:{src:'bz',label:'breezeway'}},
    {code:'OSA', addr:'Sun Palm Residence · Flic en Flac', title:'Make deal with photographer', priority:'med', meta:['office / admin','14:00'], occ:'Vacant', occState:'vacant', source:{src:'gy',label:'guesty'}},
  ],
  tomorrow:[
    {code:'GBH-C5', addr:'Apt with Pool & Gym · Grand Baie', title:'Replace shower head', priority:'med', meta:['maintenance','08:30'], occ:'Vacant', occState:'vacant', source:{src:'bz',label:'breezeway'}},
    {code:'BS-1', addr:'Modern Apt · Secure Gardens', title:'Deep clean — guest turnover', priority:'high', accent:'amber', meta:['housekeeping','by 14:00'], occ:'Check-in 14:00', occState:'soon', source:{src:'bz',label:'breezeway'}},
    {code:'KS-5', addr:'Apt with Rooftop Pool', title:'Quarterly AC service', priority:'low', meta:['maintenance','13:00'], occ:'Vacant', occState:'vacant', source:{src:'bz',label:'breezeway'}},
  ],
  week:[
    {day:'Wed 3 Jun', items:[
      {code:'GBH-C6', addr:'Modern Apt with Pool', title:'Restock welcome loadout', priority:'med', meta:['housekeeping','10:00'], occ:'Vacant', occState:'vacant', source:{src:'bz',label:'breezeway'}},
    ]},
    {day:'Thu 4 Jun', items:[
      {code:'VA-4', addr:'Géranium Road · Grand Baie', title:'Internet Top Up', priority:'low', meta:['admin','09:00'], occ:'Vacant', occState:'vacant', source:{src:'bz',label:'breezeway'}},
      {code:'BW-C4', addr:'Beachfront Apt · Flic en Flac', title:'Investigate worsening leak', priority:'urgent', accent:'indigo', meta:['maintenance','11:00'], occ:'Guest in-house', occState:'in', source:{src:'bz',label:'breezeway'}},
    ]},
    {day:'Fri 5 Jun', items:[
      {code:'RCN-4', addr:'Royal Court North', title:'Place anti-odor valve', priority:'low', meta:['maintenance','14:00'], occ:'Vacant', occState:'vacant', source:{src:'bz',label:'breezeway'}},
    ]},
  ],
};

// all properties (searchable in pickers)
const PROPERTIES = [
  {code:'SD-10', name:'Sunset Drive · Tamarin'},
  {code:'BW-C4', name:'Beachfront Apt · Flic en Flac'},
  {code:'GBH-B4', name:'Apt with Pool & Gym · Grand Baie'},
  {code:'GBH-C3', name:'Apt with Pool & Gym · Grand Baie'},
  {code:'GBH-C5', name:'Apt with Pool & Gym · Grand Baie'},
  {code:'GBH-C6', name:'Modern Apt with Pool · Grand Baie'},
  {code:'GBH-C8', name:'Apt with Pool & Gym · Grand Baie'},
  {code:'RC-7', name:'Royal Court · Pereybère'},
  {code:'RCN-4', name:'Royal Court North · Pereybère'},
  {code:'VA-3', name:'Géranium Road · Grand Baie'},
  {code:'VA-4', name:'Géranium Road · Grand Baie'},
  {code:'LB-1', name:'Les Bougainvilliers · Tamarin'},
  {code:'LB-2', name:'Les Bougainvilliers · Tamarin'},
  {code:'BS-1', name:'Modern Apt · Secure Gardens'},
  {code:'KS-5', name:'Apt with Rooftop Pool · Grand Baie'},
  {code:'GB-2', name:'Grand Baie Heights · Grand Baie'},
  {code:'TM-3', name:'Tamarin Bay Villa · Tamarin'},
  {code:'FF-7', name:'Flic Beach Studio · Flic en Flac'},
  {code:'PB-1', name:'Pereybère Penthouse · Pereybère'},
  {code:'OSA-2', name:'Sun Palm Residence · Flic en Flac'},
  {code:'CW-4', name:'Cap West Apartments · Pointe aux Canonniers'},
  {code:'TT-9', name:'Trou aux Biches Villa · Triolet'},
];

// chat threads keyed by id
const CHATS = {
  ann:{id:'ann', name:'Announcements', ic:'mega', icCls:'pin', sub:'12 members · GM broadcast',
    msgs:[
      {day:'Today'},
      {from:'Franny (GM)', t:'07:12', tx:'Heads up — water shut-off in Tamarin 2–4pm today for SD-10 repairs. Plan around it 🙏'},
      {from:'Franny (GM)', t:'07:13', tx:'Bryan is covering North, Ishant West. Lunch protected 12:30–13:30 as always.'},
    ]},
  west:{id:'west', name:'West Zone', ic:'pin', icCls:'zone', sub:'Bryan, Catherine, Matthieu, you',
    msgs:[
      {day:'Today'},
      {from:'Franny (GM)', t:'08:38', tx:'Morning team — heavy day. SD-10 leak is urgent, GBH-B4 needs a turnover before 3.'},
      {from:'Franny (GM)', t:'08:41', mention:'ishant', tx:'can you cover the SD-10 follow-up after lunch?'},
      {me:true, t:'08:43', tx:"On it. Doing the GBH-B4 turnover first, then SD-10.", readby:['Bryan','Catherine','Matthieu']},
      {from:'Matthieu', t:'08:50', hash:'pump-fault', tx:"parts for the valve are in the van if it's a {hash}"},
    ]},
  franny:{id:'franny', name:'Franny (GM)', badge:'FG', sub:'General Manager · online',
    msgs:[
      {day:'Today'},
      {me:true, t:'08:12', tx:'Started the SD-10 leak — pump light is red, looks like a pump fault.', read:true},
      {from:'Franny (GM)', t:'08:55', tx:'Thanks for jumping on it so fast 🙏 log it and flag me if it needs a contractor.'},
      {me:true, t:'08:56', tx:'Will do 👍', read:true},
    ]},
};
const CHAT_LIST = [
  {grp:'Pinned', items:[{id:'ann', ic:'mega', icCls:'pin', name:'Announcements', prev:'Franny (GM): Heads up — water shut-off in Tamarin…', time:'07:12', unread:2}]},
  {grp:'Channels', items:[
    {id:'west', ic:'pin', icCls:'zone', name:'West Zone', prev:'can you cover the SD-10 follow-up after lunch?', time:'08:41', unread:5, ment:true},
    {id:'ann', ic:'box', name:'Maintenance Team', prev:'Matthieu: parts for BW-C4 are in the van', time:'Yesterday'},
    {id:'ann', ic:'users', name:'Housekeeping', prev:'You: loadout restocked for GBH-B4 ✓', time:'Yesterday'},
  ]},
  {grp:'Direct messages', items:[
    {id:'franny', badge:'FG', name:'Franny (GM)', prev:'Thanks for jumping on the leak so fast 🙏', time:'08:55', unread:1},
    {id:'franny', badge:'BR', name:'Bryan Ramluckun', prev:'You: all yours — North looks heavy today', time:'07:30'},
    {id:'franny', badge:'CA', name:'Catherine Appadoo', prev:'swapped the 2pm inspection, ta', time:'Mon'},
  ]},
];

// check-in instructions + active reported issues per property code
const CHECKIN = {
  'SD-10':'Lockbox on the right gate post. Park in bay 10. Alarm panel by the front door — code disarms both zones. Pool gate self-locks.',
  'GBH-B4':'Use service lift to floor 4, unit B4. Key card in the lockbox by the lobby intercom. Gym & pool wristbands in the welcome drawer.',
  'BW-C4':'Beachfront block C, unit 4. Lockbox under the wooden bench on the veranda. Outdoor shower tap is stiff — turn firmly.',
};
const PROP_ISSUES = {
  'SD-10':[{title:'Pool pump making intermittent noise', by:'Bryan', when:'3h ago', status:'Open', tone:'red'}],
  'GBH-B4':[
    {title:'Balcony light flickering', by:'Catherine', when:'yesterday', status:'Scheduled', tone:'amber'},
    {title:'Slow drain in 2nd bathroom', by:'you', when:'2d ago', status:'In review', tone:'amber'},
  ],
  'BW-C4':[{title:'Worsening leak under sink', by:'Franny', when:'today', status:'Open', tone:'red'}],
};
const ACCESS = {
  'SD-10':{lockbox:'4827', alarm:'19#', wifi:'SunsetDrive_5G', wifipass:'tamarin2024'},
  'GBH-B4':{lockbox:'5106', alarm:'—', wifi:'GBH_Guest', wifipass:'grandbaie44'},
  'BW-C4':{lockbox:'3390', alarm:'—', wifi:'Beachfront_C4', wifipass:'flicflac7'},
};
// on-site guide per property (useful for staff & third-party vendors)
const GUIDE = {
  'SD-10':{parking:'Bay 10, just inside the gate', bins:'Green bin by the side wall · collection Tue & Fri', mains:'Water stopcock in the garden meter box, left of the gate', utility:'Fuse box in the hallway cupboard', storage:'Linen & cleaning in the hallway closet, top shelf', notes:'Pool gate self-locks. Outdoor tap is by the BBQ.'},
  'GBH-B4':{parking:'Visitor bay V4, level −1', bins:'Rubbish chute at the end of the corridor · daily', mains:'Water valve under the kitchen sink', utility:'DB board behind the entry door', storage:'Housekeeping store room on 4F (key 5106)', notes:'Gym & pool wristbands are in the welcome drawer.'},
  'BW-C4':{parking:'Sandy lot in front of block C', bins:'Communal bins by the block entrance · Mon & Thu', mains:'Stopcock under the veranda steps', utility:'Fuse box in the bedroom wardrobe', storage:'Beach gear & linen in the under-stair cupboard', notes:'Outdoor shower tap is stiff — turn firmly.'},
};
const GUIDE_DEFAULT = {parking:'Ask your manager for the assigned bay', bins:'Bins by the main entrance', mains:'Water stopcock near the entry', utility:'Fuse box by the front door', storage:'Linen & cleaning in the main closet', notes:'—'};
// items most often lost / damaged / broken — quick condition tracking
const LOST_ITEMS = [
  {name:'Wine / drinking glasses', par:'×8', flagged:2, tag:'breakable'},
  {name:'Crockery set (plates, bowls)', par:'×8', tag:'breakable'},
  {name:'Cutlery set', par:'×8'},
  {name:'Bath towels', par:'×6', flagged:1, tag:'linen'},
  {name:'Bed linen set', par:'×3', tag:'linen'},
  {name:'TV / AC remote', par:'×1'},
  {name:'Pool / gate key', par:'×1'},
  {name:'Hair dryer', par:'×1'},
];

// field-staff: own roster, time-off, reviews
const MY_ROSTER = {
  week:'25 – 31 May',
  days:[
    {d:'Mon',n:'25',shift:'West',time:'08:00–17:00',state:'on'},
    {d:'Tue',n:'26',shift:'West',time:'08:00–17:00',state:'on'},
    {d:'Wed',n:'27',shift:'West',time:'08:00–17:00',state:'on'},
    {d:'Thu',n:'28',shift:'West',time:'08:00–17:00',state:'on'},
    {d:'Fri',n:'29',shift:'West',time:'08:00–17:00',state:'on'},
    {d:'Sat',n:'30',shift:'Off',state:'off'},
    {d:'Sun',n:'31',shift:'Off',state:'off'},
  ],
};
const TIMEOFF = {
  balance:12, pending:1,
  requests:[
    {dates:'Thu 12 – Fri 13 Jun', days:2, type:'Annual leave', status:'Pending', tone:'amber'},
    {dates:'Mon 5 May', days:1, type:'Sick leave', status:'Approved', tone:'green'},
    {dates:'24 – 26 Apr', days:3, type:'Annual leave', status:'Approved', tone:'green'},
  ],
};
const MY_REVIEWS = {
  avg:4.8, count:23,
  items:[
    {stars:5, prop:'GBH-B4', guest:'Marie L.', when:'2 days ago', role:'Turnover clean', txt:'Spotless on arrival — the apartment smelled fresh and everything was perfectly stocked. Best cleaned villa we’ve stayed in.', channel:'Airbnb'},
    {stars:5, prop:'SD-10', guest:'James O.', when:'1 week ago', role:'Maintenance', txt:'Had a water issue sorted within the hour of reporting. Super responsive team.', channel:'Booking.com'},
    {stars:4, prop:'RC-7', guest:'Priya & Sam', when:'2 weeks ago', role:'Turnover clean', txt:'Lovely and clean, only the dining table was a bit high for the kids — staff fixed it same day though.', channel:'Airbnb'},
  ],
};

Object.assign(window, { TASKS, TASK_LIST, CHATS, CHAT_LIST, PROPERTIES, CHECKIN, PROP_ISSUES, ACCESS, GUIDE, GUIDE_DEFAULT, LOST_ITEMS, MY_ROSTER, TIMEOFF, MY_REVIEWS });
