'use client';

import { useEffect, useRef, useState } from 'react';
import { FRIDAY_PROMPTS_HOME } from '../_data/friday';
import { useFridayChat, FridayMessage } from './FridayDrawer';
import { IconArrow, IconChevron, IconSend, IconSparkle } from './icons';

interface Props {
  onNavigate: (mod: string) => void;
  onExit: () => void;
}

export function FridayFullscreen({ onNavigate, onExit }: Props) {
  const { msgs, submit } = useFridayChat('All of FAD');
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs]);

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim()) {
      submit(input.trim());
      setInput('');
    }
  };

  return (
    <div className="friday-fs">
      <div className="friday-fs-header">
        <IconSparkle />
        <div style={{ fontSize: 13, fontWeight: 500 }}>Ask Friday</div>
        <span className="chip" style={{ marginLeft: 8 }}>
          scope · all of FAD
        </span>
        <button
          className="btn ghost sm friday-fs-collapse"
          style={{ marginLeft: 'auto' }}
          onClick={onExit}
          title="Collapse to panel"
        >
          Collapse to panel <IconChevron size={10} />
        </button>
      </div>
      <div className="friday-fs-body">
        {msgs.length === 0 ? (
          <div className="friday-fs-home">
            <h1 className="friday-fs-title">What should Friday look into?</h1>
            <p className="friday-fs-sub">
              One call per morning. Depth on request. I pull across every module you have access to.
            </p>
            <div className="friday-fs-grid">
              {FRIDAY_PROMPTS_HOME.map((g, i) => (
                <div key={i}>
                  <div className="friday-fs-cat">{g.cat}</div>
                  {g.prompts.map((p, j) => (
                    <button
                      key={j}
                      className="friday-fs-prompt"
                      onClick={() => submit(p)}
                    >
                      <span>{p}</span>
                      <IconArrow size={12} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="friday-fs-chat">
            {msgs.map((m, i) => (
              <FridayMessage key={i} m={m} onNavigate={onNavigate} onFollowup={submit} />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <div className="friday-fs-input">
        <form onSubmit={onSubmit}>
          <input
            placeholder="Ask Friday…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn primary">
            <IconSend size={14} /> Send
          </button>
        </form>
      </div>
    </div>
  );
}
