// Small shared presentational building blocks used across views.

import { colorFor, initials } from '../lib/format.js';
import { Icon } from './Icon.jsx';

export function Avatar({ name, size = 'md' }) {
  return (
    <span className={`avatar avatar--${size}`} style={{ background: colorFor(name) }}>
      {initials(name)}
    </span>
  );
}

// A titled section with an optional count badge. Renders nothing when there are no children.
export function Section({ title, count, children, ariaLabel }) {
  const items = [].concat(children).filter(Boolean);
  if (!items.length) return null;
  return (
    <section className="section" aria-label={ariaLabel ?? title}>
      <h3 className="section__title">
        {title}
        {count != null && <span className="count">{String(count)}</span>}
      </h3>
      {children}
    </section>
  );
}

export function IconRow({ name, tone, children }) {
  return (
    <div className="row">
      <span className={`badge-icon badge-icon--${tone}`}>
        <Icon name={name} />
      </span>
      <span>{children}</span>
    </div>
  );
}

export function Chip({ children, tone, className }) {
  const cls = className ?? (tone ? `chip chip--${tone}` : 'chip');
  return <span className={cls}>{children}</span>;
}

export function Field({ label, htmlFor, children, hint, headAside }) {
  return (
    <div className="field">
      {headAside ? (
        <div className="field__head">
          <label htmlFor={htmlFor}>{label}</label>
          {headAside}
        </div>
      ) : (
        <label htmlFor={htmlFor}>{label}</label>
      )}
      {children}
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}

export function Select({ id, options, value, onChange }) {
  return (
    <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)}>
      {options.map(([optionValue, label]) => (
        <option key={String(optionValue)} value={String(optionValue)}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ id, label, checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
