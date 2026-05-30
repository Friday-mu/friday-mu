'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MODULES } from '../_data/modules';
import { iconFor, IconSearch } from './icons';
import { canSeeModule, useCurrentRole } from './usePermissions';

interface ResultItem {
  type: 'module' | 'cmd';
  id: string;
  label: string;
  hint: string;
  icon: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (id: string) => void;
  onAskFriday: () => void;
  onToggleTheme: () => void;
}

export function CommandPalette({ open, onClose, onNavigate, onAskFriday, onToggleTheme }: Props) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const role = useCurrentRole();
  const results: ResultItem[] = useMemo(() => {
    const modItems: ResultItem[] = MODULES
      .filter((m) => canSeeModule(role, m.id))
      .map((m) => ({
        type: 'module',
        id: m.id,
        label: m.label,
        hint: m.group,
        icon: m.icon,
      }));
    const commands: ResultItem[] = [
      { type: 'cmd', id: 'ask', label: 'Ask Friday about this view', hint: '⌘/', icon: 'IconSparkle' },
      { type: 'cmd', id: 'new-task', label: 'New task', hint: 'action', icon: 'IconPlus' },
      { type: 'cmd', id: 'new-message', label: 'New message', hint: 'action', icon: 'IconMail' },
      { type: 'cmd', id: 'toggle-theme', label: 'Toggle light / dark', hint: 'prefs', icon: 'IconMoon' },
    ];
    const all = [...modItems, ...commands];
    if (!q) return all;
    const lc = q.toLowerCase();
    return all.filter(
      (x) => x.label.toLowerCase().includes(lc) || x.hint.toLowerCase().includes(lc)
    );
  }, [q, role]);

  useEffect(() => {
    if (idx >= results.length) setIdx(0);
  }, [results.length, idx]);

  const runItem = (item: ResultItem) => {
    if (item.type === 'module') {
      onNavigate(item.id);
      onClose();
    } else if (item.id === 'ask') {
      onClose();
      onAskFriday();
    } else if (item.id === 'toggle-theme') {
      onClose();
      onToggleTheme();
    } else {
      onClose();
    }
  };

  const keyHandler = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[idx];
      if (item) runItem(item);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className={'fad-palette-overlay' + (open ? ' open' : '')} onClick={onClose}>
      <div className="fad-palette" onClick={(e) => e.stopPropagation()}>
        <div className="fad-palette-input-wrap">
          <IconSearch />
          <input
            ref={inputRef}
            placeholder="Jump to module or ask Friday…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={keyHandler}
          />
          <span
            className="kbd"
            style={{ fontFamily: 'var(--font-mono-fad)', fontSize: 11, color: 'var(--color-text-tertiary)' }}
          >
            esc
          </span>
        </div>
        <div className="fad-palette-results">
          <div className="fad-palette-section-label">Results</div>
          {results.map((r, i) => {
            const I = iconFor(r.icon);
            return (
              <button
                key={r.type + r.id}
                className={'fad-palette-item' + (i === idx ? ' highlight' : '')}
                onClick={() => runItem(r)}
                onMouseEnter={() => setIdx(i)}
              >
                <I size={14} />
                <span>{r.label}</span>
                <span className="group-hint">{r.hint}</span>
              </button>
            );
          })}
          {results.length === 0 && (
            <div
              style={{
                padding: 20,
                fontSize: 13,
                color: 'var(--color-text-tertiary)',
                textAlign: 'center',
              }}
            >
              No results.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
