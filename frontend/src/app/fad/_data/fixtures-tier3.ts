// @demo:data — HR staff + time-off — GET /api/hr/*
// Tag: PROD-DATA-5 — see frontend/DEMO_CRUFT.md

export interface Review {
  id: string;
  guest: string;
  initials: string;
  rating: number;
  channel: string;
  property: string;
  date: string;
  stay: string;
  status: 'replied' | 'needs-reply' | 'responded';
  sentiment: 'positive' | 'mixed' | 'negative';
  urgent?: boolean;
  title: string;
  body: string;
  reply: string | null;
}

export const REVIEWS: Review[] = [
  { id: 'r1', guest: 'Thibault Marchand', initials: 'TM', rating: 5.0, channel: 'Airbnb', property: 'Villa Azur', date: 'Apr 14', stay: '7 nights', status: 'replied', sentiment: 'positive',
    title: 'Exceptional stay, family loved it',
    body: "Our third time with Friday and they just keep getting better. Villa Azur was spotless, Priya's welcome note was such a nice touch, and the driver at the airport made traveling with two toddlers actually relaxing. Will be back in December.",
    reply: "Thibault — so lovely to host you again. December is noted. Priya sends her regards." },
  { id: 'r2', guest: 'Isabella Fonseca', initials: 'IF', rating: 3.0, channel: 'Booking', property: 'Sable Noir', date: 'Apr 13', stay: '4 nights', status: 'needs-reply', sentiment: 'mixed', urgent: true,
    title: 'Beautiful house, hot water issue',
    body: "The location and design are stunning but the hot water went out on our second morning and wasn't fully fixed until the last day. Maintenance was responsive but it soured what would otherwise have been perfect.",
    reply: null },
  { id: 'r3', guest: 'Linde Okonkwo', initials: 'LO', rating: 5.0, channel: 'Direct', property: 'Blue Bay House', date: 'Apr 12', stay: '10 nights', status: 'replied', sentiment: 'positive',
    title: 'Worth every franc',
    body: "The chef evening was the highlight of our trip. Private dining on the terrace, the kids were fed early and happy, and the pool setup for them the next day was perfect. Ten out of ten.",
    reply: "Linde — thank you. Chef Aarav was thrilled you enjoyed the tasting menu. See you next year." },
  { id: 'r4', guest: 'Henrik Solheim', initials: 'HS', rating: 4.0, channel: 'Airbnb', property: 'Coral Reef', date: 'Apr 11', stay: '5 nights', status: 'needs-reply', sentiment: 'mixed',
    title: 'Good experience overall',
    body: "Great property, friendly staff. A few small things: the wifi dropped a couple times and the coffee machine needed descaling. Nothing deal-breaking but noticeable at this price point.",
    reply: null },
  { id: 'r5', guest: 'Amélie Dubois', initials: 'AD', rating: 5.0, channel: 'Airbnb', property: 'Nitzana · Orchidée', date: 'Apr 10', stay: '3 nights', status: 'replied', sentiment: 'positive',
    title: 'Magical long weekend',
    body: "Came for a quick escape and didn't want to leave. Every detail was considered — the welcome basket with local rum, the beach chairs already set up, the handwritten dinner recs. Bravo.",
    reply: "Amélie — happy you found us. The rum is from our friends at Chamarel. Come back soon." },
  { id: 'r6', guest: 'Julien Bernard', initials: 'JB', rating: 2.0, channel: 'Booking', property: 'Sable Noir', date: 'Apr 08', stay: '2 nights', status: 'responded', sentiment: 'negative', urgent: true,
    title: 'Disappointing check-in experience',
    body: "Arrived at 14:30 as agreed, property wasn't ready until 16:10. No apology, no offer of compensation. For this price range I expect better coordination.",
    reply: "Julien — you're right, that's not our standard. We've refunded a night's stay and the cleaner's schedule has been reviewed. Hope you'll give us another chance." },
  { id: 'r7', guest: 'Priya Iyer', initials: 'PI', rating: 5.0, channel: 'Google', property: 'Villa Azur', date: 'Apr 07', stay: '6 nights', status: 'replied', sentiment: 'positive',
    title: 'Our new favorite',
    body: "Been coming to Mauritius for a decade — this is the first house I'd actively recommend to friends. The team anticipates everything before you think to ask.",
    reply: "Priya — we noticed. See you in November." },
  { id: 'r8', guest: 'Marco Ricci', initials: 'MR', rating: 5.0, channel: 'Airbnb', property: 'Ocean Terrace', date: 'Apr 05', stay: '8 nights', status: 'needs-reply', sentiment: 'positive',
    title: 'Stunning, period',
    body: "No notes. Will be back.",
    reply: null },
  { id: 'r9', guest: 'Sofia Mendes', initials: 'SM', rating: 4.0, channel: 'Direct', property: 'Nitzana · Jacaranda', date: 'Apr 03', stay: '5 nights', status: 'replied', sentiment: 'positive',
    title: 'Lovely property, minor nit',
    body: "The new Nitzana villas are gorgeous. One suggestion — the blackout curtains in the master bedroom don't fully seal.",
    reply: "Sofia — noted and already in the maintenance queue. Thank you for the signal." },
];

export const REVIEWS_KPI = [
  { label: 'Avg rating', value: '4.6', sub: '+0.1 vs Mar', warn: false },
  { label: 'Needs reply', value: '3', sub: '1 urgent', warn: true },
  { label: 'SLA median', value: '2h 14m', sub: 'target <6h', warn: false },
  { label: 'Response rate', value: '94%', sub: '30-day', warn: false },
];

export const REVIEWS_BY_PROPERTY = [
  { property: 'Villa Azur', score: 4.9, n: 42, trend: '+0.1' },
  { property: 'Blue Bay House', score: 4.8, n: 38, trend: '+0.0' },
  { property: 'Ocean Terrace', score: 4.9, n: 29, trend: '+0.2' },
  { property: 'Coral Reef', score: 4.3, n: 31, trend: '−0.1' },
  { property: 'Sable Noir', score: 4.2, n: 27, trend: '−0.2' },
  { property: 'Nitzana · Orchidée', score: 4.8, n: 8, trend: '—' },
];

export interface Guest {
  id: string;
  name: string;
  initials: string;
  country: string;
  stays: number;
  lifetime: string;
  last: string;
  lang: string;
  props: string[];
  tier: 'vip' | 'returning' | 'new';
  notes: string;
}

export const GUESTS: Guest[] = [
  { id: 'g1', name: 'Thibault Marchand', initials: 'TM', country: 'FR', stays: 3, lifetime: '€ 18,420', last: 'Apr 17', lang: 'FR', props: ['Villa Azur'], tier: 'returning', notes: 'Family of 4 · toddlers · prefers Villa Azur · requests early check-in' },
  { id: 'g2', name: 'Priya Iyer', initials: 'PI', country: 'IN', stays: 5, lifetime: '€ 31,200', last: 'Apr 07', lang: 'EN', props: ['Villa Azur','Ocean Terrace'], tier: 'vip', notes: 'Couple · annual November trip · gluten-free · champagne on arrival' },
  { id: 'g3', name: 'Linde Okonkwo', initials: 'LO', country: 'NL', stays: 2, lifetime: '€ 14,800', last: 'Apr 12', lang: 'EN', props: ['Blue Bay House'], tier: 'returning', notes: 'Family of 6 · chef evenings always · late dinner seating for kids' },
  { id: 'g4', name: 'Isabella Fonseca', initials: 'IF', country: 'PT', stays: 1, lifetime: '€ 3,680', last: 'Apr 13', lang: 'PT', props: ['Sable Noir'], tier: 'new', notes: 'Young couple · 4 nights · refund issued for hot water incident' },
  { id: 'g5', name: 'Henrik Solheim', initials: 'HS', country: 'NO', stays: 1, lifetime: '€ 5,950', last: 'Apr 11', lang: 'EN', props: ['Coral Reef'], tier: 'new', notes: 'Couple · 5 nights · wifi complaint noted' },
  { id: 'g6', name: 'Amélie Dubois', initials: 'AD', country: 'FR', stays: 4, lifetime: '€ 22,100', last: 'Apr 10', lang: 'FR', props: ['Nitzana · Orchidée','Sable Noir'], tier: 'vip', notes: 'Solo traveler · writer · long stays · always requests second-floor rooms' },
  { id: 'g7', name: 'Marco Ricci', initials: 'MR', country: 'IT', stays: 2, lifetime: '€ 16,340', last: 'Apr 05', lang: 'EN', props: ['Ocean Terrace'], tier: 'returning', notes: 'Two couples traveling together · boat charters · no restrictions' },
  { id: 'g8', name: 'Sofia Mendes', initials: 'SM', country: 'BR', stays: 1, lifetime: '€ 8,420', last: 'Apr 03', lang: 'EN', props: ['Nitzana · Jacaranda'], tier: 'new', notes: 'First stay at Nitzana · blackout curtain feedback · interested in longer future stay' },
  { id: 'g9', name: 'Julien Bernard', initials: 'JB', country: 'FR', stays: 1, lifetime: '€ 1,840', last: 'Apr 08', lang: 'FR', props: ['Sable Noir'], tier: 'new', notes: 'Check-in delay · refunded · watch for future booking' },
  { id: 'g10', name: 'Kristina Leary', initials: 'KL', country: 'US', stays: 3, lifetime: '€ 27,800', last: 'Mar 28', lang: 'EN', props: ['Blue Bay House','Villa Azur'], tier: 'vip', notes: 'Multi-generational family · accessibility requests · always books 10+ nights' },
];

export const GUESTS_KPI = [
  { label: 'Active guests', value: '184', sub: 'past 90 days' },
  { label: 'Returning rate', value: '38%', sub: '+4pp vs Mar' },
  { label: 'Avg LTV', value: '€ 11,420', sub: 'top 20% · €28k' },
  { label: 'VIP guests', value: '21', sub: '11% of active' },
];

export const CAMPAIGNS = [
  { id: 'c1', name: 'Winter escape · November', channel: 'Email + social', status: 'live', starts: 'Oct 15', ends: 'Dec 20', sent: 4200, opens: '38%', bookings: 14, revenue: '€ 58,400' },
  { id: 'c2', name: 'Direct-book 15% off', channel: 'Site + retarget', status: 'live', starts: 'Apr 01', ends: 'May 31', sent: 2180, opens: '41%', bookings: 7, revenue: '€ 21,800' },
  { id: 'c3', name: 'Nitzana launch', channel: 'Press + influencer', status: 'scheduled', starts: 'May 12', ends: 'Jun 30', sent: 0, opens: '—', bookings: 0, revenue: '—' },
  { id: 'c4', name: 'Repeat-guest package', channel: 'Email', status: 'draft', starts: '—', ends: '—', sent: 0, opens: '—', bookings: 0, revenue: '—' },
  { id: 'c5', name: 'Chef evening upsell', channel: 'In-stay SMS', status: 'live', starts: 'Feb 01', ends: 'ongoing', sent: 890, opens: '62%', bookings: 31, revenue: '€ 9,420' },
];

export const CHANNEL_MIX = [
  { channel: 'Airbnb', share: 0.44, revenue: 'YTD €184k', color: '#2B4A93' },
  { channel: 'Booking.com', share: 0.22, revenue: 'YTD €92k', color: '#4A6BB8' },
  { channel: 'Direct', share: 0.22, revenue: 'YTD €94k', color: '#6B8DDC' },
  { channel: 'Referral', share: 0.08, revenue: 'YTD €34k', color: '#8FAEE8' },
  { channel: 'Agent', share: 0.04, revenue: 'YTD €18k', color: '#B5CAF0' },
];

export const MKT_KPI = [
  { label: 'Direct share', value: '22%', sub: 'goal 25% · +2pp QoQ' },
  { label: 'Email opens', value: '41%', sub: 'industry avg 22%' },
  { label: 'Campaign ROI', value: '4.1×', sub: '30-day attributed' },
  { label: 'Cost per acq.', value: '€ 142', sub: '−€18 vs Mar' },
];

export const LIFECYCLE_EMAILS = [
  { trigger: 'Booking confirmed', days: 'Day 0', send: 'Auto', openRate: '74%', status: 'live' },
  { trigger: 'Pre-arrival (concierge menu)', days: 'T-7', send: 'Auto', openRate: '68%', status: 'live' },
  { trigger: 'Mid-stay check', days: 'Day 3', send: 'Auto', openRate: '52%', status: 'live' },
  { trigger: 'Review ask', days: 'T+1', send: 'Auto', openRate: '44%', status: 'live' },
  { trigger: 'Winback · 90-day', days: 'T+90', send: 'Manual approval', openRate: '—', status: 'draft' },
];

export type LeadPipeline = 'guest' | 'owner' | 'syndic' | 'interior' | 'agency';

export interface Lead {
  id: string;
  name: string;
  source: string;
  contact: string;
  type: string;
  value: string;
  stage: 'inquiry' | 'qualifying' | 'meeting' | 'proposal' | 'won' | 'lost';
  pipeline: LeadPipeline;
  nextStep: string;
  owner: string;
  age: string;
}

export const LEADS: Lead[] = [
  // Guest inquiry pipeline (booking enquiries that haven't converted yet)
  { id: 'g1', name: 'Aisha Patel', source: 'Airbnb inquiry', contact: 'ap@patel.family', type: 'Guest · 3-bedroom · June', value: 'est. € 4,800 stay', stage: 'qualifying', pipeline: 'guest', nextStep: 'Confirm dates before Thu', owner: 'Mathias', age: '1d' },
  { id: 'g2', name: 'Lars & Mia Bergström', source: 'Direct website', contact: 'lars.b@gmail.com', type: 'Guest · repeat · July', value: 'est. € 12,400 stay', stage: 'proposal', pipeline: 'guest', nextStep: 'Quote sent · awaiting deposit', owner: 'Mathias', age: '3d' },
  { id: 'g3', name: 'Pereira family', source: 'Booking inquiry', contact: 'via Booking.com', type: 'Guest · 8 people · August', value: 'est. € 9,600 stay', stage: 'inquiry', pipeline: 'guest', nextStep: 'Auto-qualifying · no property fit yet', owner: 'Friday auto', age: '6h' },
  { id: 'g4', name: 'Corporate retreat — Oliveira AG', source: 'Referral · ex-guest', contact: 'events@oliveira.ch', type: 'Guest · group · Oct (8 nights)', value: 'est. € 24,000 stay + add-ons', stage: 'meeting', pipeline: 'guest', nextStep: 'Chef + driver spec call', owner: 'Mathias', age: '4d' },
  // Owner pipeline
  { id: 'l1', name: 'Raj Chandiramani', source: 'Referral · Mathias', contact: 'raj@chandiramani.co', type: 'Owner · 1 villa · Tamarin', value: 'est. €280k/yr', stage: 'qualifying', pipeline: 'owner', nextStep: 'Property tour Fri', owner: 'Ishant', age: '2d' },
  { id: 'l2', name: 'Nitzana Group — Phase 2', source: 'Existing partner', contact: 'mathias@nitzana.com', type: 'Owner · 6 villas', value: 'est. €1.8M/yr', stage: 'proposal', pipeline: 'owner', nextStep: 'Contract redline', owner: 'Ishant', age: '5d' },
  { id: 'l4', name: 'Maxime & Claire Dubois', source: 'Past guest', contact: 'maxime.d@gmail.com', type: 'Owner · 1 villa', value: 'est. €120k/yr', stage: 'inquiry', pipeline: 'owner', nextStep: 'Send intro deck', owner: 'Mary', age: '1d' },
  { id: 'l5', name: 'Hoang Minh Capital', source: 'LinkedIn', contact: 'hm@hoangminh.vn', type: 'Co-invest · 2 villas', value: 'est. €300k/yr', stage: 'qualifying', pipeline: 'owner', nextStep: 'Waiting on NDA', owner: 'Ishant', age: '4d' },
  { id: 'l7', name: 'Kwame & Adjoa Mensah', source: 'Referral · Linde O.', contact: 'kmensah@gmail.com', type: 'Owner · 1 villa', value: 'est. €180k/yr', stage: 'meeting', pipeline: 'owner', nextStep: 'Legal review of land title', owner: 'Ishant', age: '11d' },
  { id: 'l8', name: 'Sunset Retreats Ltd', source: 'Event · SMP Dubai', contact: 'h.alzahrani@sunsetretreats.ae', type: 'Owner · B2B mgmt block', value: 'est. €600k/yr', stage: 'won', pipeline: 'owner', nextStep: 'Kickoff Apr 28', owner: 'Ishant', age: 'won 2d' },
  { id: 'l9', name: 'Heritage Isle Partners', source: 'Referral · lawyer', contact: 'partners@heritageisle.mu', type: 'Owner · 3 villas', value: 'est. €540k/yr', stage: 'lost', pipeline: 'owner', nextStep: 'Chose competitor', owner: 'Ishant', age: 'lost 14d' },
  // Syndic pipeline
  { id: 's1', name: 'Résidence Grande Baie (8 units)', source: 'Inbound · HOA contact', contact: 'president@rgb.mu', type: 'Syndic · 8 units · Grand Baie', value: 'est. €46k/yr + managed-unit funnel', stage: 'meeting', pipeline: 'syndic', nextStep: 'General assembly Apr 28', owner: 'Franny', age: '9d' },
  { id: 's2', name: 'Les Jardins de Flic en Flac', source: 'Cold inbound', contact: 'board@flicenflac.mu', type: 'Syndic · 14 units', value: 'est. €82k/yr', stage: 'qualifying', pipeline: 'syndic', nextStep: 'Discovery call Apr 26', owner: 'Franny', age: '3d' },
  { id: 's3', name: 'Coral Cove Condominium', source: 'Referral · agent', contact: 'hoa@coralcove.mu', type: 'Syndic · 6 units', value: 'est. €34k/yr', stage: 'inquiry', pipeline: 'syndic', nextStep: 'Qualify · send proposal format', owner: 'Franny', age: '1d' },
  // Interior pipeline
  { id: 'i1', name: 'Beaumont · Villa Azur refresh', source: 'Friday-managed owner', contact: 'owner@beaumont.fr', type: 'Interior · partial refresh · VAZ', value: '€ 85,000 one-off', stage: 'proposal', pipeline: 'interior', nextStep: 'Mood-board review Apr 23', owner: 'Ishant', age: '7d' },
  { id: 'i2', name: 'Nitzana · Villa 04 fit-out', source: 'Friday-managed owner', contact: 'david@nitzana.co', type: 'Interior · full fit-out · NIT-04', value: '€ 240,000 one-off', stage: 'meeting', pipeline: 'interior', nextStep: 'Vendor quotes gathering', owner: 'Ishant', age: '14d' },
  { id: 'i3', name: 'Harrington · BBH restyle', source: 'Friday-managed owner', contact: 'anouk.h@harrington.co.uk', type: 'Interior · partial refresh · BBH', value: 'est. € 40,000', stage: 'inquiry', pipeline: 'interior', nextStep: 'Scope call', owner: 'Ishant', age: '2d' },
  // Agency pipeline
  { id: 'a1', name: 'Ocean Terrace · listing', source: 'Owner-initiated', contact: 'ochen@gmail.com', type: 'Agency · exclusive sale mandate', value: 'est. € 2.4M asking', stage: 'qualifying', pipeline: 'agency', nextStep: 'Comparables + CMA', owner: 'Ishant', age: '8d' },
  { id: 'a2', name: 'Buyer — Philippe Lefèvre', source: 'Past guest', contact: 'philippe.l@email.fr', type: 'Agency · buyer · €1–1.8M range', value: 'commission 3% of sale', stage: 'meeting', pipeline: 'agency', nextStep: 'Second viewing scheduled', owner: 'Ishant', age: '6d' },
];

export const LEAD_STAGES = [
  { id: 'inquiry', label: 'Inquiry', description: 'Fresh, not yet qualified' },
  { id: 'qualifying', label: 'Qualifying', description: 'Research + intro call' },
  { id: 'meeting', label: 'Meeting', description: 'Discovery in progress' },
  { id: 'proposal', label: 'Proposal', description: 'Terms out, awaiting' },
  { id: 'won', label: 'Won', description: 'Closed this quarter' },
  { id: 'lost', label: 'Lost', description: 'Closed lost' },
];

export const LEAD_PIPELINES: { id: LeadPipeline; label: string; description: string }[] = [
  { id: 'guest', label: 'Guest', description: 'Booking inquiries pre-confirmation' },
  { id: 'owner', label: 'Owner', description: 'Property owners wanting Friday management' },
  { id: 'syndic', label: 'Syndic', description: 'Building HOAs wanting Friday as syndic' },
  { id: 'interior', label: 'Interior', description: 'Friday-managed owners wanting fit-out' },
  { id: 'agency', label: 'Agency', description: 'Real estate — sales + buyer mandates' },
];

export const LEAD_KPI = [
  { label: 'Active pipeline', value: '19', sub: '15 open · 3 closed · 1 lost' },
  { label: 'Weighted value', value: '€ 3.3M', sub: 'next 12 months incl. guest' },
  { label: 'Win rate · 90d', value: '41%', sub: '+6pp vs Q4' },
  { label: 'Avg time to close', value: '34d', sub: 'median · owners' },
];

export const INTEL_OCCUPANCY = [
  { month: 'Nov', occ: 0.62 }, { month: 'Dec', occ: 0.88 }, { month: 'Jan', occ: 0.81 },
  { month: 'Feb', occ: 0.74 }, { month: 'Mar', occ: 0.79 }, { month: 'Apr', occ: 0.83 },
];

export const INTEL_REVPAR = [
  { month: 'Nov', val: 168 }, { month: 'Dec', val: 241 }, { month: 'Jan', val: 212 },
  { month: 'Feb', val: 198 }, { month: 'Mar', val: 219 }, { month: 'Apr', val: 234 },
];

export const INTEL_KPI = [
  { label: 'Occupancy · 90d', value: '79%', sub: '+3pp vs LY' },
  { label: 'ADR', value: '€ 312', sub: '+€14 vs LY' },
  { label: 'RevPAR', value: '€ 246', sub: '+6% vs LY' },
  { label: 'Guest sat', value: '4.6 / 5', sub: '+0.1 vs Q1' },
];

export const INTEL_PROPS = [
  { property: 'Villa Azur', occ: 0.91, adr: 380, revpar: 346, sat: 4.9 },
  { property: 'Blue Bay House', occ: 0.88, adr: 395, revpar: 348, sat: 4.8 },
  { property: 'Ocean Terrace', occ: 0.85, adr: 340, revpar: 289, sat: 4.9 },
  { property: 'Sable Noir', occ: 0.76, adr: 310, revpar: 236, sat: 4.2 },
  { property: 'Coral Reef', occ: 0.72, adr: 280, revpar: 202, sat: 4.3 },
  { property: 'Nitzana · Orchidée', occ: 0.68, adr: 420, revpar: 286, sat: 4.8 },
  { property: 'Nitzana · Jacaranda', occ: 0.64, adr: 430, revpar: 275, sat: 4.6 },
  { property: 'Dauphin Lodge', occ: 0.58, adr: 240, revpar: 139, sat: 4.4 },
];

export const INTEL_DIGEST = [
  { tag: 'Revenue', text: "April pacing +9% vs April '25. Direct-book share holding at 22%; Airbnb share slipping 2pp on Sable Noir only." },
  { tag: 'Ops', text: "Coral Reef wifi complaints doubled in Apr (2 → 4). Router replacement scheduled this week — recommend keeping the ticket open until post-review signal confirms fix." },
  { tag: 'Pipeline', text: "Nitzana Phase 2 contract now in redlines. If closed by May 15, Q2 weighted pipeline rises to €2.7M and Ops should plan onboarding 6 villas before July peak." },
];

export type IntelInsightKind = 'anomaly' | 'pattern' | 'opportunity' | 'risk';
export interface IntelInsight {
  id: string;
  kind: IntelInsightKind;
  title: string;
  body: string;
  evidence: string;
  module: string;
  age: string;
  confidence: number;
  actions: string[];
}

export const INTEL_INSIGHTS: IntelInsight[] = [
  {
    id: 'i1',
    kind: 'anomaly',
    title: 'Sable Noir rating dropped 0.2 in 30 days',
    body: '4.4 → 4.2 average. Three reviews mention "hot water issue" — maintenance records show a heater replacement Apr 14 but signal hasn\'t recovered yet.',
    evidence: '3 reviews · Coral Reef vs Sable Noir divergence · sentiment dip confirmed',
    module: 'reviews',
    age: '2h ago',
    confidence: 0.91,
    actions: ['Open review thread', 'Draft owner note', 'Link to Ops ticket'],
  },
  {
    id: 'i2',
    kind: 'opportunity',
    title: 'Nitzana pacing ahead of soft-launch plan',
    body: '45% occupancy in April vs 25% projected for soft-launch. Direct-book channel at 40% (vs 22% portfolio avg). Suggest tightening rates 8–12% for May-June.',
    evidence: 'Reservation count +180% vs plan · direct-book overperforming · no negative signal yet',
    module: 'properties',
    age: '1d ago',
    confidence: 0.84,
    actions: ['Simulate rate change', 'Open Analytics · Occupancy', 'Draft owner update to Nitzana'],
  },
  {
    id: 'i3',
    kind: 'risk',
    title: 'First-draft acceptance dropped 4pp this week',
    body: 'Mathias and Franny both dipped. Pattern: 6 of 12 rejected drafts were early check-in requests — current Friday template may be missing driver-name specificity rule.',
    evidence: '12 rejected drafts · both managers affected · teaching t3 appears under-applied',
    module: 'training',
    age: '4h ago',
    confidence: 0.78,
    actions: ['Review teaching t3', 'Open sample rejections', 'Retrain pattern'],
  },
  {
    id: 'i4',
    kind: 'pattern',
    title: 'Weekend check-ins take 2.3× longer to reply to',
    body: 'Saturday/Sunday guest messages averaging 18m response time vs 8m on weekdays. Most of this is WhatsApp window-closed replies waiting for template pick.',
    evidence: '84 threads · response-time correlation to day-of-week confirmed',
    module: 'inbox',
    age: '2d ago',
    confidence: 0.88,
    actions: ['Set up weekend template suggestions', 'Open Automations'],
  },
  {
    id: 'i5',
    kind: 'anomaly',
    title: 'Mary\'s handover: 2 items at risk',
    body: 'Mary is off after May 15. Tourist tax filing (due May 7) is on track. Apr statement run hasn\'t been started yet (target May 3). At current pace, could slip.',
    evidence: 'Task progress · historical run time · no assignee backup scheduled',
    module: 'tasks',
    age: '6h ago',
    confidence: 0.86,
    actions: ['Assign backup', 'Message Mary', 'Block calendar'],
  },
];

export const INTEL_PROMPT_LIBRARY = [
  {
    category: 'This morning',
    prompts: [
      'What needs my attention today?',
      "Any urgent maintenance I haven't seen?",
      'What did Friday do overnight?',
    ],
  },
  {
    category: 'Revenue & pricing',
    prompts: [
      'Why is April pacing lower than March?',
      'Where is our biggest margin opportunity?',
      'Should we raise Nitzana rates?',
      'Which properties are priced below market?',
    ],
  },
  {
    category: 'Guests & reviews',
    prompts: [
      'What drove the April rating change?',
      'Any returning guests arriving this week?',
      'Which property has the most negative sentiment?',
      'Summarize the last 20 reviews',
    ],
  },
  {
    category: 'Operations',
    prompts: [
      'What\'s slowing us down this month?',
      'Where are we over-capacity?',
      'Which vendor has the most open tickets?',
      "Compare housekeeping SLA property by property",
    ],
  },
  {
    category: 'Team & performance',
    prompts: [
      'How is each teammate performing?',
      'Which teachings are underperforming?',
      'Where is Friday drafting being rejected most?',
    ],
  },
];

export const INTEL_WEEKLY_PULSE = {
  period: 'Apr 14 — Apr 20',
  summary:
    'Strong operational week despite two urgent incidents. Revenue pacing holds +9% vs last year; guest satisfaction ticked up 0.1 on warmer reviews from Villa Azur and Blue Bay. The single drag is Sable Noir — rating dipped 0.2 after a hot-water incident that\'s now been resolved, but sentiment hasn\'t recovered yet.',
  highlights: [
    'Nitzana soft-launch exceeded plan · 45% occupancy',
    '12 check-ins handled · 1 returning guest (Marchand)',
    'Tourist tax filing on track for May 7',
    '4 review replies drafted · 3 approved as-is',
  ],
  concerns: [
    'Sable Noir rating dip · sentiment lag after fix',
    'Mary handover · statement run not yet started',
    'WhatsApp window-closed backlog on weekends',
  ],
};
