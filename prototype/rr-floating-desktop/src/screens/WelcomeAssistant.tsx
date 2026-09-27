import { useState } from 'react';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/format';
import { COACH_LANGUAGES } from '../data/languages';
import { useAuth } from '../state/auth';
import { useStore } from '../state/store';
import { Avatar } from '../ui/kit';

type Step = 'hello' | 'steam' | 'consent' | 'done';

/**
 * The first run after an account is made (A05), as a Setup Assistant over the desktop: coach
 * language, Steam, and the study consent when study mode is on. The consent step cannot be
 * skipped, because the API refuses a participant's data until it is given.
 */
export function WelcomeAssistant() {
  const s = useStore();
  const { state, user, refresh, setWelcome } = useAuth();
  const needsConsent = !!state?.needsConsent;
  const steps: Step[] = ['hello', 'steam', ...(needsConsent ? (['consent'] as Step[]) : []), 'done'];
  const [step, setStep] = useState<Step>('hello');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const i = steps.indexOf(step);

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      if (needsConsent) await api.consent();
      await refresh();
      setWelcome(false);
      s.open('matches');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const LABEL: Record<Step, string> = { hello: 'Coach language', steam: 'Steam', consent: 'The study', done: 'Ready' };

  return (
    <div className="assistant-scrim">
      <div className="win focused entered assistant-win" role="dialog" aria-modal="true" aria-label="Welcome">
        <div className="titlebar">
          <div className="lights" aria-hidden>
            <span className="light close" />
            <span className="light min" />
            <span className="light zoom" />
          </div>
          <div className="win-title">
            <b>Welcome</b>
          </div>
        </div>
        <div className="win-body flush">
          <div className="inst">
            <aside className="inst-side" aria-label="Steps">
              <ol>
                {steps.map((x, n) => (
                  <li key={x} data-s={n < i ? 'done' : n === i ? 'now' : 'todo'} aria-current={n === i ? 'step' : undefined}>
                    <span className="inst-dot" aria-hidden />
                    {LABEL[x]}
                  </li>
                ))}
              </ol>
              <span className="assistant-avatar">
                <Avatar name={user.displayName} url={user.avatarUrl} size={88} />
              </span>
            </aside>
            <section className="inst-main">
              <h2 className="inst-h">
                {step === 'hello'
                  ? `Welcome, ${user.displayName}`
                  : step === 'steam'
                    ? 'Link your Steam account'
                    : step === 'consent'
                      ? 'Taking part in the study'
                      : 'You are ready'}
              </h2>
              <div className="inst-box">
                {step === 'hello' ? (
                  <>
                    <p>A few things before your first review. You can change them later in Settings.</p>
                    <p className="meta">Which language should the coach write in? The app itself stays in English.</p>
                    <div className="lang-cards" role="radiogroup" aria-label="Coach language">
                      {COACH_LANGUAGES.map((l) => (
                        <button key={l.id} type="button" role="radio" aria-checked={s.language === l.id} className="lang-card" onClick={() => s.setLanguage(l.id)}>
                          <b>{l.label}</b>
                        </button>
                      ))}
                    </div>
                  </>
                ) : step === 'steam' ? (
                  user.steamId ? (
                    <p>
                      Linked as <span className="mono">{user.steamId}</span>. When you are in a demo, the coach reviews you without asking who you played as.
                    </p>
                  ) : (
                    <>
                      <p>Link Steam and the coach picks you in every demo you upload. Without it, you choose the player each time.</p>
                      {state?.steam ? (
                        <a className="btn btn-large" href={api.steamStartUrl({ link: true, next: '/welcome' })}>
                          Link Steam…
                        </a>
                      ) : (
                        <p className="meta">Steam sign-in is not set up on this computer.</p>
                      )}
                    </>
                  )
                ) : step === 'consent' ? (
                  <>
                    <p>
                      This app is part of a school project. Your feedback, questions and how you use the coach are exported for the report under a code, never with your
                      name or SteamID. You can delete your account and data at any time in Settings.
                    </p>
                    <label className="check-row">
                      <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree to take part
                    </label>
                  </>
                ) : (
                  <>
                    <p>Add a demo and pick your player; the coach picks the moments that mattered and records a clip of each.</p>
                    <ul className="inst-list">
                      <li>Matches lists your games. Add Match reads a new demo.</li>
                      <li>The Studio plays each moment with the coach&rsquo;s explanation beside it.</li>
                      <li>Coach answers questions across all your matches.</li>
                    </ul>
                  </>
                )}
                {error ? (
                  <p className="err inst-err" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
              <footer className="inst-foot">
                <span />
                {i > 0 ? (
                  <button type="button" className="btn" onClick={() => setStep(steps[i - 1])} disabled={busy}>
                    Go Back
                  </button>
                ) : (
                  <span />
                )}
                {step === 'done' ? (
                  <button type="button" className="btn btn-default" onClick={() => void finish()} disabled={busy}>
                    {busy ? 'Starting…' : 'Start'}
                  </button>
                ) : (
                  <button type="button" className="btn btn-default" disabled={step === 'consent' && !agree} onClick={() => setStep(steps[i + 1])}>
                    Continue
                  </button>
                )}
              </footer>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
