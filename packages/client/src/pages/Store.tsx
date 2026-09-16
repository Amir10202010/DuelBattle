import { ShoppingBag } from 'lucide-react';
import { Customization } from '../components/avatar/Customization.jsx';
import { tr, useUiPreferences } from '../i18n/index.js';
export function Store() {
  useUiPreferences();
  return (
    <main className="page page--store">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{tr('Made for your hero')}</span>
          <h1>
            <ShoppingBag size={27} /> {tr('Store')}
          </h1>
          <p>{tr('Pick your look. Keep your edge.')}</p>
        </div>
        <span className="status-tag">{tr('Looks only. Same fair game.')}</span>
      </header>
      <Customization shop />
    </main>
  );
}
