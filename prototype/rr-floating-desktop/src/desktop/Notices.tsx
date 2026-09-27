import { useStore } from '../state/store';
import { AppIcon } from '../ui/icons';

export function Notices() {
  const { notices, dismiss } = useStore();
  return (
    <div className="notices" aria-live="polite">
      {notices.map((n) => (
        <div className="notice" key={n.id} role="status">
          <span className="notice-icon" aria-hidden>
            <AppIcon id="coach" size={20} />
          </span>
          <b>{n.title}</b>
          <button type="button" className="notice-x" aria-label="Dismiss" onClick={() => dismiss(n.id)}>
            ×
          </button>
          <p>{n.body}</p>
          {n.action ? (
            <button
              type="button"
              className="btn notice-act"
              onClick={() => {
                dismiss(n.id);
                n.action!.run();
              }}
            >
              {n.action.label}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
