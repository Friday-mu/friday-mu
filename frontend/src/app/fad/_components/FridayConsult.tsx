'use client';

import { useState } from 'react';
import { useFridayChat, FridayMessage } from './FridayDrawer';
import { IconClose, IconSend, IconSparkle } from './icons';

interface Props {
  threadScope: string;
  /** Accepted but ignored — see autoPrompt note below. */
  autoPrompt?: string;
  onClose: () => void;
}

// Friday Consult — the inbox-side Ask Friday panel. Mirrors the GMS-era
// "Ask Friday" but scoped to a single conversation.
//
// design-be-19 (2026-05-13): demo data inside the consult (sample
// suggested replies, fake teachable moments, sample draft polish
// examples) has been purged. The panel previously auto-fired
// `autoPrompt` on mount, which surfaced one of the scripted FRIDAY_SCRIPTS
// responses from _data/friday.ts and rendered fake tool steps. There is
// no real LLM behind this yet, so we now render an empty state instead;
// the user can still type a question, and `useFridayChat` will run the
// existing scripts only when they hit Send. Once the live wiring lands
// (Tier E bw-9 — Friday LLM), this stays as the UI shell with a real
// backend behind submit().
//
// `autoPrompt` is still accepted in the props so the inbox doesn't need
// to drop the prop in one move — it's a deliberate no-op while demo data
// is off.
export function FridayConsult({ threadScope, autoPrompt: _autoPrompt, onClose }: Props) {
  const { msgs, submit } = useFridayChat(`Thread · ${threadScope}`);
  const [input, setInput] = useState('');

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim()) {
      submit(input.trim());
      setInput('');
    }
  };

  return (
    <div className="friday-consult">
      <div className="friday-consult-header">
        <IconSparkle size={12} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>Friday Consult</span>
        <span className="chip" style={{ marginLeft: 6, fontSize: 10 }}>
          scope · this thread
        </span>
        <button
          className="fad-util-btn"
          onClick={onClose}
          style={{ marginLeft: 'auto', width: 24, height: 24 }}
          title="Close"
        >
          <IconClose size={12} />
        </button>
      </div>
      <div className="friday-consult-body">
        {msgs.length === 0 && (
          <div
            style={{
              padding: 16,
              fontSize: 12,
              color: 'var(--color-text-tertiary)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Ask Friday about this conversation — drafting tone, missing context,
            policy lookups. Live LLM wiring pending (Tier E bw-9).
          </div>
        )}
        {msgs.map((m, i) => (
          <FridayMessage key={i} m={m} onNavigate={() => {}} onFollowup={submit} />
        ))}
      </div>
      <form className="friday-consult-input" onSubmit={onSubmit}>
        <input
          placeholder="Ask Friday about this thread…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn primary sm">
          <IconSend size={12} />
        </button>
      </form>
    </div>
  );
}
