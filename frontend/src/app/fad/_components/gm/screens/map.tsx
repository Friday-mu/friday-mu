'use client';

import { GmShell, FridayBar, type GmTab } from '../kit';
import { DI } from '../icons';

/*
 * @demo:ui — field-staff live location has no backend (opt-in telemetry is future).
 * The pins, on-shift list, and "Friday" rebalance bar are all static demo copy.
 * Tag: PROD-GM-MAP-1.
 */

type PinStatus = 'on' | 'enr' | 'urgent' | 'idle';

interface MapPin { x: number; y: number; av: string; st: PinStatus; tag: string; }
interface ShiftStaff { av: string; nm: string; task: string; st: PinStatus; stl: string; dot: string; }

const PINS: MapPin[] = [
  { x: 34, y: 30, av: 'BR', st: 'on', tag: 'GBH-C5 · shower' },
  { x: 52, y: 24, av: 'CA', st: 'enr', tag: 'en route · GBH-C8' },
  { x: 64, y: 62, av: 'IA', st: 'urgent', tag: 'SD-10 · leak' },
  { x: 44, y: 50, av: 'MD', st: 'idle', tag: 'stand-by' },
];

const PROPS: Array<[number, number]> = [
  [28, 42], [40, 26], [58, 34], [50, 58], [70, 55], [36, 64], [62, 46], [24, 52], [46, 38],
];

const STCOL: Record<PinStatus, string> = {
  on: 'var(--green)',
  enr: 'var(--amber)',
  urgent: 'var(--red)',
  idle: 'var(--tx-3)',
};

const LIST: ShiftStaff[] = [
  { av: 'BR', nm: 'Bryan Ramluckun', task: 'Replace shower head · GBH-C5', st: 'on', stl: 'On task · 18m', dot: 'var(--green)' },
  { av: 'CA', nm: 'Catherine Appadoo', task: 'Inspection · GBH-C8', st: 'enr', stl: 'En route · ETA 9m', dot: 'var(--amber)' },
  { av: 'IA', nm: 'Ishant Ayadassen', task: 'Water Issue · SD-10', st: 'urgent', stl: 'Urgent · on site', dot: 'var(--red)' },
  { av: 'MD', nm: 'Matthieu Duval', task: 'Stand-by · West', st: 'idle', stl: 'Available', dot: 'var(--tx-3)' },
];

const BDG_TONE: Record<PinStatus, string> = { on: 'green', enr: 'amber', urgent: 'red', idle: 'gray' };

export function ScreenMap({ subPage, onChangeSubPage }: { subPage?: string; onChangeSubPage?: (s: string) => void }) {
  void subPage; // Live map is not itself a tab — kept for a uniform screen signature.
  const go = (id: string) => () => onChangeSubPage?.(id);
  const tabs: GmTab[] = [
    { l: 'Overview', onClick: go('overview') },
    { l: 'Schedule', onClick: go('schedule') },
    { l: 'All tasks', onClick: go('all') },
    { l: 'Approvals', ct: 3, onClick: go('reported') },
    { l: 'Roster', onClick: go('roster') },
    { l: 'Insights', onClick: go('insights') },
  ];

  return (
    <GmShell
      eyebrow="OPERATIONS"
      title="Live map"
      sub="Field staff with active tasks · updated 2m ago"
      tabs={tabs}
      actions={<>
        <div className="vseg"><span className="vs on">All</span><span className="vs">North</span><span className="vs">West</span></div>
        <button className="dbtn ghost"><DI n="clock" s={1.9} /> Refresh</button>
      </>}
    >
      <FridayBar actions={<><button className="dbtn sm">Rebalance</button><button className="dbtn ghost sm">Review <DI n="chevR" s={2} /></button></>}>
        <b>Friday.</b> Bryan &amp; Catherine are both in Grand Baie and free after 11:00 — the SD-10 follow-up in Tamarin is uncovered this afternoon.
      </FridayBar>
      <div className="maplayout" style={{ marginTop: 14 }}>
        <div className="mapcanvas">
          <div className="grid" />
          <div className="coast" style={{ left: '8%', top: '12%', width: '56%', height: '52%' }} />
          <div className="coast" style={{ left: '40%', top: '42%', width: '50%', height: '46%' }} />
          <span className="zonelbl" style={{ left: '16%', top: '15%' }}>North · Grand Baie</span>
          <span className="zonelbl" style={{ left: '58%', top: '78%' }}>West · Flic en Flac · Tamarin</span>
          {PROPS.map((p, i) => <span key={i} className="mprop" style={{ left: p[0] + '%', top: p[1] + '%' }} />)}
          {PINS.map((p, i) => (
            <div key={i} className="mpin" style={{ left: p.x + '%', top: p.y + '%' }}>
              <span className={'av ' + p.st}>{p.st !== 'idle' && <span className="ring" style={{ borderColor: STCOL[p.st] }} />}{p.av}</span>
              <span className="tag">{p.tag}</span>
            </div>
          ))}
          <div className="mlegend">
            <span className="li"><span className="mdot" style={{ background: 'var(--green)' }} /> On task</span>
            <span className="li"><span className="mdot" style={{ background: 'var(--amber)' }} /> En route</span>
            <span className="li"><span className="mdot" style={{ background: 'var(--red)' }} /> Urgent</span>
            <span className="li"><span className="mdot" style={{ background: 'var(--tx-3)' }} /> Stand-by</span>
          </div>
        </div>
        <div className="maplist">
          <div className="dml" style={{ margin: '10px 0 4px' }}>On shift <span className="ct">4</span><span className="rule" /></div>
          {LIST.map((s, i) => (
            <div key={i} className="mstaff">
              <span className="mdot" style={{ background: s.dot }} />
              <span className="av1">{s.av}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nm}</div>
                <div className="faint" style={{ fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.task}</div>
              </div>
              <span className={'bdg ' + BDG_TONE[s.st]} style={{ flex: '0 0 auto' }}>{s.stl.split(' · ')[0]}</span>
            </div>
          ))}
          <div className="gate" style={{ borderStyle: 'solid', marginTop: 12 }}><DI n="pin" s={1.7} style={{ color: 'var(--indigo-bright)' }} /><span>Locations shown only while a task is active — staff control sharing in their app.</span></div>
        </div>
      </div>
    </GmShell>
  );
}
