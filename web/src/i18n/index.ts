/*
 * Interface language (issue #7). English is the source text; Italian must
 * have the same keys (checked by TypeScript, see Widen in ./types).
 *
 * Components:   const { t } = useI18n();   t.common.save, t.account.visits(3)
 * Plain code:   tr().common.errors.linkScheme   (lib/, outside React)
 *
 * The language comes from, in order: the signed-in user's profile, the last
 * choice on this device, the browser. The root component reads useI18n(), so
 * a switch re-renders the whole tree and tr() is always current.
 */
import { useSyncExternalStore } from 'react';
import en from './en';
import it from './it';
import { LANGS, type Lang, type Widen } from './types';

export { LANGS, type Lang };
export type Dict = Widen<typeof en>;

const DICTS: Record<Lang, Dict> = { en, it };
const STORAGE_KEY = 'alpine-log.lang';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'it') return saved;
  } catch { /* storage blocked: fall back to the browser */ }
  return typeof navigator !== 'undefined' && navigator.languages?.some(l => l.toLowerCase().startsWith('it')) ? 'it' : 'en';
}

let current: Lang = detect();
if (typeof document !== 'undefined') document.documentElement.lang = current;
const listeners = new Set<() => void>();

export const getLang = () => current;
/** The current dictionary, for code outside components. */
export const tr = (): Dict => DICTS[current];
/** BCP 47 locale for dates and numbers. */
export const locale = () => (current === 'it' ? 'it-IT' : 'en-GB');

export function setLang(lang: Lang) {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* not remembered on this device */ }
  if (lang === current) return;
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  listeners.forEach(l => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function useI18n() {
  const lang = useSyncExternalStore(subscribe, getLang);
  return { t: DICTS[lang], lang };
}
