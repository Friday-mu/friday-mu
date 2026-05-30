export interface FridayStep {
  type: 'tool';
  name: string;
  args: string;
  ms: number;
}

export type FridayCard =
  | { type: 'action'; urgency: 'red' | 'amber' | 'neutral' | 'accent'; module: string; title: string; body: string; cta: string }
  | {
      type: 'tourist-tax-breakdown';
      period: string;
      rows: { label: string; value: number; negative?: boolean }[];
      total: { label: string; value: number };
      footer: string;
    }
  | {
      type: 'owner-pl';
      owner: string;
      gross: number;
      fees: number;
      net: number;
      months: { m: string; v: number; partial?: boolean }[];
    }
  | {
      type: 'checkins';
      rows: { day: string; date: string; guest: string; prop: string; flag?: string }[];
    }
  | {
      type: 'draft-reply';
      channel: string;
      guest: string;
      body: string;
      honors: string[];
    }
  | { type: 'bars'; rows: { label: string; pct: number; count: number }[] };
