'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconChevron, IconFilter } from './icons';

export function FilterBar({
  children,
  count,
  onClear,
}: {
  children: ReactNode;
  count?: string;
  onClear?: () => void;
}) {
  return (
    <div className="fad-filter-bar">
      <div className="fad-filter-bar-items">{children}</div>
      {onClear && (
        <button className="fad-filter-clear" onClick={onClear}>
          Clear
        </button>
      )}
      {count && <span className="fad-filter-count mono">{count}</span>}
    </div>
  );
}

interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  count?: number;
  dot?: string;
}

export function FilterChip({ active, onClick, children, count, dot }: ChipProps) {
  return (
    <button
      type="button"
      className={'fad-filter-chip' + (active ? ' active' : '')}
      onClick={onClick}
    >
      {dot && <span className={'dot ' + dot} style={{ marginRight: 4 }} />}
      <span>{children}</span>
      {count !== undefined && <span className="fad-filter-chip-count mono">{count}</span>}
    </button>
  );
}

interface PillProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (v: T) => void;
  allLabel?: string;
}

export function FilterPill<T extends string>({
  label,
  value,
  options,
  onChange,
  allLabel,
}: PillProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = options.find((o) => o.value === value);
  const isDefault = !active || active.value === options[0]?.value;
  const display = active ? active.label : allLabel || label;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="fad-filter-pill-wrap" ref={ref}>
      <button
        type="button"
        className={'fad-filter-chip fad-filter-pill' + (!isDefault ? ' active' : '')}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="fad-filter-pill-label">{label}</span>
        <span className="fad-filter-pill-value">{display}</span>
        <span className="fad-filter-pill-caret">
          <IconChevron size={10} />
        </span>
      </button>
      {open && (
        <div className="fad-filter-pill-menu" role="menu">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={
                'fad-filter-pill-item' + (o.value === value ? ' selected' : '')
              }
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span>{o.label}</span>
              {o.count !== undefined && (
                <span className="fad-filter-pill-count mono">{o.count}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
