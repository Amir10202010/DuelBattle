import { useMeta } from '../../hooks/useMeta.js';
import { tr, useUiPreferences } from '../../i18n/index.js';

/** Keep failed loads and claims visible on every page that can initiate them. */
export function MetaNotice() {
  useUiPreferences();
  const { error, loading, busy, refresh } = useMeta();
  if (!error) return null;
  return (
    <div className="meta-notice plate" role="alert">
      <p>{tr(error)}</p>
      <button className="btn" disabled={loading || Boolean(busy)} onClick={refresh}>
        {tr(loading ? 'Loading…' : 'Try again')}
      </button>
    </div>
  );
}
