import { useId, useState } from 'react';
import { foldName } from '../../lib/names';

export type ComboOption = { key: string | number; label: string; hint?: string };

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  /** Called with the option picked from the list (typing alone doesn't pick one). */
  onPick?: (option: ComboOption) => void;
};

const MAX_SHOWN = 8;

/**
 * A text field that lists the options matching what is typed, ignoring
 * accents and case. Free text stays allowed. Unlike <datalist>, the list
 * shows the same on phones.
 */
export function Combobox({ id, value, onChange, options, placeholder, onPick }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const typed = foldName(value);
  const shown = options
    .filter(o => foldName(o.label).includes(typed))
    // What starts with the typed text first.
    .sort((a, b) => Number(foldName(b.label).startsWith(typed)) - Number(foldName(a.label).startsWith(typed)))
    .slice(0, MAX_SHOWN);
  // Nothing to suggest once the field holds exactly one option.
  const expanded = open && shown.length > 0 && !(shown.length === 1 && foldName(shown[0].label) === typed);

  function pick(o: ComboOption) {
    onChange(o.label);
    onPick?.(o);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && shown.length) {
      e.preventDefault();
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(i => (i + step + shown.length) % shown.length);
    } else if (e.key === 'Enter' && expanded && active >= 0) {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === 'Escape' && expanded) {
      setOpen(false); // the list, not the dialog (see Modal)
    }
  }

  return (
    <div className="combobox">
      <input id={id} value={value} placeholder={placeholder} autoComplete="off"
             role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
             aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
             onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1); }}
             onFocus={() => setOpen(true)}
             onBlur={() => setOpen(false)}
             onKeyDown={onKeyDown} />
      {expanded && (
        <ul id={listId} role="listbox" className="combobox-list">
          {shown.map((o, i) => (
            <li key={o.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                className={i === active ? 'active' : undefined}
                // Before the input's blur, which would close the list first.
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(o)}>
              <span>{o.label}</span>
              {o.hint && <span className="hint">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
