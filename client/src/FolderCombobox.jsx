import { useEffect, useMemo, useRef, useState } from 'react';

// Typing combobox for picking a folder: shows a text input with a
// dropdown of existing folder names that filters as the user types.
// Selecting an existing value fills the input; typing a brand-new
// value and hitting Enter creates a new folder. Empty string = move
// the design to Unfiled.
//
// Controlled via `value` / `onChange`; renders inline (no portal,
// no modal) so the caller decides the surrounding layout.
export default function FolderCombobox({
  value = '',
  onChange,
  options = [],
  placeholder = 'Folder…',
  unfiledLabel = 'Unfiled',
  autoFocus = false,
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Suggestions = every unique existing folder + always-available
  // "Unfiled" (empty string). Filtered by substring match on input.
  const filtered = useMemo(() => {
    const q = (value ?? '').trim().toLowerCase();
    const unique = [...new Set(options.filter(Boolean))];
    const matches = q
      ? unique.filter((o) => o.toLowerCase().includes(q))
      : unique;
    return [
      { label: unfiledLabel, value: '' },
      ...matches.sort().map((o) => ({ label: o, value: o })),
    ];
  }, [value, options, unfiledLabel]);

  // Close when a click lands outside the wrapper.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const choose = (v) => {
    onChange?.(v);
    setOpen(false);
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && filtered[active]) {
        e.preventDefault();
        choose(filtered[active].value);
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
      {open && filtered.length > 0 && (
        <ul className="folder-combobox-menu" role="listbox">
          {filtered.map((opt, i) => (
            <li
              key={`${opt.value}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`folder-combobox-option${i === active ? ' active' : ''}${opt.value === '' ? ' unfiled' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(opt.value); }}
            >
              {opt.label}
            </li>
          ))}
          {value && !filtered.some((o) => o.value.toLowerCase() === value.toLowerCase()) && (
            <li
              className="folder-combobox-option create"
              onMouseDown={(e) => { e.preventDefault(); choose(value.trim()); }}
            >
              Create new folder: <strong>{value.trim()}</strong>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
