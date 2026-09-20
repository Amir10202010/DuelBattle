import { ArrowUpRight } from 'lucide-react';
import { Customization } from '../components/avatar/Customization.js';
import { tr, useUiPreferences } from '../i18n/index.js';

export function Store() {
  useUiPreferences();
  return <main className="page page--store">
    <header className="hero-shop-heading"><div><span className="collection-eyebrow">{tr('THE HERO SHOP')}</span><h1>{tr('Find your next main.')}</h1><p>{tr('Small heroes. Big personality. A whole collection to make your own.')}</p></div><a href="/profile">{tr('My collection')}<ArrowUpRight size={17} /></a></header>
    <Customization shop />
  </main>;
}
