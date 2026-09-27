import type { ReactNode } from 'react';
import { Jobs, Model, Overview, RuntimeSettings } from '../admin/Control';
import { Knowledge, Matches, Storage } from '../admin/Data';
import { Invites, Study, Users } from '../admin/People';
import { Audit, Security } from '../admin/Safety';
import { WindowFrame } from '../desktop/WindowFrame';
import { ROLE_LABEL, useAuth } from '../state/auth';
import { useStore, type AdminSection } from '../state/store';
import { Avatar } from '../ui/kit';
import { LabPane } from './LabPane';

type Section = { id: AdminSection; label: string; group: string; glyph: ReactNode };

const G = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

// Tinted squares with a white glyph, like the source list in System Settings
export const SECTIONS: Section[] = [
  { id: 'overview', label: 'Overview', group: 'Control', glyph: <path {...G} d="M3 13V8M7 13V4M11 13V6" /> },
  { id: 'jobs', label: 'Jobs', group: 'Control', glyph: <path {...G} d="M3 4.5h10M3 8h10M3 11.5h6" /> },
  { id: 'model', label: 'Model and services', group: 'Control', glyph: <g {...G}><rect x="4" y="4" width="8" height="8" rx="1.5" /><path d="M6.5 2v2M9.5 2v2M6.5 12v2M9.5 12v2M2 6.5h2M2 9.5h2M12 6.5h2M12 9.5h2" /></g> },
  { id: 'settings', label: 'Settings', group: 'Control', glyph: <g {...G}><path d="M3 5h10M3 11h10" /><circle cx="6" cy="5" r="1.6" fill="currentColor" /><circle cx="10" cy="11" r="1.6" fill="currentColor" /></g> },
  { id: 'users', label: 'Users', group: 'People', glyph: <g {...G}><circle cx="8" cy="6" r="2.4" /><path d="M3.5 13.2c.6-2.3 2.4-3.4 4.5-3.4s3.9 1.1 4.5 3.4" /></g> },
  { id: 'invites', label: 'Invites', group: 'People', glyph: <g {...G}><rect x="2.5" y="4" width="11" height="8" rx="1.5" /><path d="M3 4.8l5 3.7 5-3.7" /></g> },
  { id: 'study', label: 'Study', group: 'People', glyph: <g {...G}><rect x="4" y="2.8" width="8" height="10.4" rx="1.3" /><path d="M6 6.5h4M6 9h4" /></g> },
  { id: 'matches', label: 'Matches', group: 'Data', glyph: <g {...G}><rect x="2.5" y="3.5" width="11" height="9" rx="1.5" /><path d="M2.5 6.5h11" /></g> },
  { id: 'knowledge', label: 'Knowledge', group: 'Data', glyph: <g {...G}><path d="M8 4.2C6.8 3.3 5 3 3 3.2v9c2-.2 3.8.1 5 1 1.2-.9 3-1.2 5-1v-9c-2-.2-3.8.1-5 1zM8 4.2v9" /></g> },
  { id: 'lab', label: 'Lab', group: 'Data', glyph: <g {...G}><path d="M6.3 2.5h3.4M7 2.5v3.8L3.8 12a1 1 0 0 0 .9 1.5h6.6a1 1 0 0 0 .9-1.5L9 6.3V2.5" /></g> },
  { id: 'storage', label: 'Storage and backup', group: 'Data', glyph: <g {...G}><ellipse cx="8" cy="4.5" rx="4.5" ry="1.8" /><path d="M3.5 4.5v7c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8v-7M3.5 8c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8" /></g> },
  { id: 'security', label: 'Security', group: 'Safety', glyph: <g {...G}><rect x="3.5" y="7" width="9" height="6.5" rx="1.3" /><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" /></g> },
  { id: 'audit', label: 'Audit log', group: 'Safety', glyph: <g {...G}><circle cx="8" cy="8" r="5.3" /><path d="M8 5v3.2l2 1.3" /></g> },
];

const TINT: Record<string, string> = { Control: '#636366', People: '#007aff', Data: '#34a853', Safety: '#e8850c' };

const PANES: Record<AdminSection, () => JSX.Element> = {
  overview: Overview,
  jobs: Jobs,
  model: Model,
  settings: RuntimeSettings,
  users: Users,
  invites: Invites,
  study: Study,
  matches: Matches,
  knowledge: Knowledge,
  lab: LabPane,
  storage: Storage,
  security: Security,
  audit: Audit,
};

/**
 * The admin panel (doc 30 §5) as one window in the System Settings shape: a translucent source
 * list of 13 sections in four groups, the pane on the right. A labeller sees only the Lab. The
 * API checks the role on every /admin and /lab call; this only decides what to draw.
 */
export function AdminWindow() {
  const s = useStore();
  const { user, state } = useAuth();
  const labOnly = user?.role === 'labeller';
  const current: AdminSection = labOnly ? 'lab' : s.adminSection;
  const visible = labOnly ? SECTIONS.filter((x) => x.id === 'lab') : SECTIONS;
  const groups = [...new Set(visible.map((x) => x.group))];
  const Pane = PANES[current];
  const label = SECTIONS.find((x) => x.id === current)?.label;

  return (
    <WindowFrame id="admin" title={labOnly ? 'Lab' : 'Admin'} subtitle={label} minW={760} minH={420} flush>
      <div className="split">
        <nav className="source" aria-label="Admin sections">
          {user ? (
            <div className="source-me">
              <Avatar name={user.displayName} url={user.avatarUrl} size={34} />
              <span>
                <b>{state?.authEnabled ? user.displayName : 'This computer'}</b>
                <span className="meta">{state?.authEnabled ? ROLE_LABEL[user.role] : 'Accounts are off'}</span>
              </span>
            </div>
          ) : null}
          {groups.map((g) => (
            <div key={g} className="source-group">
              {visible
                .filter((x) => x.group === g)
                .map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className="source-item"
                    aria-current={x.id === current ? 'page' : undefined}
                    onClick={() => s.openAdmin(x.id)}
                  >
                    <span className="source-ico" style={{ background: TINT[g] }} aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 16 16">
                        {x.glyph}
                      </svg>
                    </span>
                    {x.label}
                  </button>
                ))}
            </div>
          ))}
          {state && !state.authEnabled ? (
            <p className="source-note">
              Accounts are off, so this computer is the admin. Set <code>RR_AUTH_ENABLED=true</code> to add sign-in.
            </p>
          ) : null}
        </nav>
        <div className="split-body" key={current}>
          <Pane />
        </div>
      </div>
    </WindowFrame>
  );
}
