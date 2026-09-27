import { api } from '@/lib/api/client';
import { useStore } from '../state/store';

/** Shown when the API answers but is missing this desktop's endpoints, which means it runs from another copy. */
export function ApiTooOld() {
  const s = useStore();
  if (!s.apiTooOld) return null;
  return (
    <p className="err" role="alert">
      The API at <code>{api.baseUrl}</code> is from a copy without the Coach, Matches and Progress endpoints (PR #22), so
      this window cannot load. Start the API from this branch&apos;s <code>apps/api</code> and point <code>RR_API_URL</code>{' '}
      in <code>.env.local</code> at it (see RUN-ON-PC.md), then{' '}
      <button type="button" className="link" onClick={() => void s.refreshMatches()}>
        try again
      </button>
      .
    </p>
  );
}
