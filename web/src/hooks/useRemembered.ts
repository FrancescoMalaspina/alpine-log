import { useState } from 'react';

/**
 * A yes/no choice remembered on this device, such as whether a section is
 * open. Where storage is blocked it lasts as long as the page.
 */
export function useRemembered(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const storageKey = `alpine-log.${key}`;
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved == null ? initial : saved === '1';
    } catch {
      return initial;
    }
  });
  const remember = (next: boolean) => {
    setValue(next);
    try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* lasts as long as the page */ }
  };
  return [value, remember];
}
