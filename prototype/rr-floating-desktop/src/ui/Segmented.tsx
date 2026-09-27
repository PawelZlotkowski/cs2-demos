import type { CSSProperties } from 'react';

type Option<T extends string> = { id: T; label: string; disabled?: boolean; title?: string };

type Props<T extends string> = {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
};

export function Segmented<T extends string>({ value, options, onChange, label, className }: Props<T>) {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className={`seg${className ? ` ${className}` : ''}`} role="group" aria-label={label} style={{ '--n': options.length, '--i': i } as CSSProperties}>
      <span className="seg-pill" aria-hidden />
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === value} disabled={o.disabled} title={o.title} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
