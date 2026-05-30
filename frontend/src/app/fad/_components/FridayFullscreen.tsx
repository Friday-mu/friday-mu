'use client';

import { useEffect, useRef, useState } from 'react';
import { FRIDAY_PROMPTS_HOME } from '../_data/fridayPrompts';
import { useFridayChat, FridayMessage, FridayComposer } from './FridayDrawer';
import { IconArrow, IconChevron, IconSparkle } from './icons';

interface Props {
  onNavigate: (mod: string) => void;
  onExit: () => void;
}

export function FridayFullscreen({ onNavigate, onExit }: Props) {
  const { msgs, submit, executeAction, stop, isThinking, queuedPrompt } = useFridayChat('All of FAD');
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
        <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={onExit}>
          Collapse to panel <IconChevron size={10} />
        </button>
      </div>
      <div className="friday-fs-body">
        {msgs.length === 0 ? (
          <div className="friday-fs-home">
            <h1 className="friday-fs-title">What should Friday look into?</h1>
            <p className="friday-fs-sub">
              Live context across Inbox, Operations, HR, Reviews, Design, Reservations, and Properties.
              Safe internal actions require a click; guest and revenue changes stay approval-gated.
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
              <FridayMessage
                key={i}
                m={m}
                onNavigate={onNavigate}
                onFollowup={submit}
                onExecuteAction={executeAction}
                onRetry={() => {
                  const prev = msgs[i - 1];
                  if (prev && prev.role === 'user') submit(prev.body);
                }}
              />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <div className="friday-fs-input">
        <form onSubmit={onSubmit}>
          <FridayComposer
            input={input}
            setInput={setInput}
            onSubmit={() => onSubmit()}
            isThinking={isThinking}
            queuedPrompt={queuedPrompt}
            onStop={stop}
            scope="all of FAD"
            autoFocus
          />
        </form>
      </div>
    </div>
  );
}
