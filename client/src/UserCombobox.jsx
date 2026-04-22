import { useEffect, useRef, useState } from 'react';
import { usersApi } from './authApi.js';

// Typing combobox for picking a user to share with. As the user
// types, we query /api/users?q=... and show up to ~20 matches.
// Selecting a suggestion fires `onSelect(user)`; hitting Enter on a
// free-typed value (e.g. an email not yet in the directory) also
// fires `onSelect({ email: value })` so the caller can try POSTing
// anyway — the share endpoint is the authority on whether a user
// exists.
export default function UserCombobox({
  value = '',
  onChange,
  onSelect,
  placeholder = 'Type an email or name…',
  autoFocus = false,
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const reqRef = useRef(0);

  // Debounced search. Every keystroke bumps a request id; a stale
  // response (smaller id) is discarded.
  useEffect(() => {
    const id = ++reqRef.current;
    const q = (value ?? '').trim();
    const t = setTimeout(async () => {
      try {
        const rows = await usersApi.search(q);
        if (reqRef.current === id) {
          setResults(rows);
          setActive(0);
        }
      } catch {
        if (reqRef.current === id) setResults([]);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  const pick = (u) => {
    onChange?.(u.email);
    onSelect?.(u);
    setOpen(false);
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && results[active]) {
        e.preventDefault();
        pick(results[active]);
      } else if (value && value.includes('@')) {
        // Free-typed email — let the caller try it. The share
        // endpoint returns 404 if the user doesn't exist.
        e.preventDefault();
        onSelect?.({ email: value.trim() });
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="folder-combobox" ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        className="folder-combobox-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange?.(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      {open && (
        <ul className="folder-combobox-menu" role="listbox">
          {results.length === 0 && (
            <li className="folder-combobox-option unfiled">
              {value.trim() ? 'No matching users.' : 'Start typing…'}
            </li>
          )}
          {results.map((u, i) => (
            <li
              key={u.id}
              role="option"
              aria-selected={i === active}
              className={`folder-combobox-option${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(u); }}
            >
              {u.displayName
                ? <><strong>{u.displayName}</strong> <span style={{ color: 'var(--muted)' }}>· {u.email}</span></>
                : <strong>{u.email}</strong>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
