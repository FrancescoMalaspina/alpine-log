import { useAuth } from '../auth/useAuth';
import { LANGS, useI18n } from '../i18n';

/** EN | IT toggle. Signed in, the choice is saved on the account. */
export function LanguageSwitch({ className = '' }: { className?: string }) {
  const { t, lang } = useI18n();
  const { setLanguage } = useAuth();
  return (
    <div className={`segmented small lang-switch ${className}`} role="radiogroup" aria-label={t.common.language}>
      {LANGS.map(l => (
        <button key={l} type="button" role="radio" aria-checked={lang === l} lang={l}
                className={lang === l ? 'active' : ''} title={t.common.languages[l]} onClick={() => setLanguage(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
