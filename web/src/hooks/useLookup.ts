import { useEffect, useRef, useState } from 'react';
import { useDebounced } from './useDebounced';

/**
 * Asks `load` once `key` has stopped changing for a moment, and returns its
 * answer while it still belongs to the current key (null meanwhile, and for
 * a null key). `key` stands for everything `load` reads.
 */
export function useLookup<T>(key: string | null, load: () => Promise<T>, ms = 400): T | null {
  const settled = useDebounced(key, ms);
  const [found, setFound] = useState<{ key: string; value: T } | null>(null);
  // The latest load, so a re-render alone doesn't start another lookup.
  const latest = useRef(load);
  useEffect(() => { latest.current = load; }, [load]);

  useEffect(() => {
    if (settled == null) return;
    let current = true;
    latest.current()
      .then(value => { if (current) setFound({ key: settled, value }); })
      .catch(() => { /* a hint that doesn't load is no hint */ });
    return () => { current = false; };
  }, [settled]);

  return found && found.key === key ? found.value : null;
}
