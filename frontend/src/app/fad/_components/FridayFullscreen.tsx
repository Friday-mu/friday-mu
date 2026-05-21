'use client';

import { useEffect, useRef, useState } from 'react';
import { useFridayChat, FridayMessage, visibleFridayPromptGroupsForRole } from './FridayDrawer';
import { IconArrow, IconChevron, IconSend, IconSparkle } from './icons';
import { useCurrentRole } from './usePermissions';

interface Props {
  onNavigate: (mod: string) => void;
  onExit: () => void;
}

export function FridayFullscreen({ onNavigate, onExit }: Props) {
  const { msgs, submit } = useFridayChat('All of FAD');
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const role = useCurrentRole();
  const promptGroups = visibleFridayPromptGroupsForRole(role);

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
    <div className="friday-fs" data-qa="fad-friday-fullscreen">
      <div className="friday-fs-header" data-qa="fad-friday-fullscreen-header">
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
          data-qa="fad-friday-fullscreen-collapse"
        >
          Collapse to panel <IconChevron size={10} />
        </button>
      </div>
      <div className="friday-fs-body" data-qa="fad-friday-fullscreen-body">
        {msgs.length === 0 ? (
          <div className="friday-fs-home">
            <h1 className="friday-fs-title">What should Friday look into?</h1>
            <p className="friday-fs-sub">
              One call per morning. Depth on request. I pull across every module you have access to.
            </p>
            <div className="friday-fs-grid">
              {promptGroups.map((g, i) => (
                <div key={i}>
                  <div className="friday-fs-cat">{g.cat}</div>
                  {g.prompts.map((p, j) => (
                    <button
                      key={j}
                      className="friday-fs-prompt"
                      onClick={() => submit(p)}
                      data-qa="fad-friday-fullscreen-prompt"
                      data-qa-category={g.cat}
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
      <div className="friday-fs-input" data-qa="fad-friday-fullscreen-input-wrap">
        <form onSubmit={onSubmit} data-qa="fad-friday-fullscreen-input-form">
          <input
            placeholder="Ask Friday…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
            data-qa="fad-friday-fullscreen-input"
          />
          <button type="submit" className="btn primary" data-qa="fad-friday-fullscreen-send">
            <IconSend size={14} /> Send
          </button>
        </form>
      </div>
    </div>
  );
}
