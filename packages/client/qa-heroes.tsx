import React from 'react'; import { createRoot } from 'react-dom/client';
import { HEROES, HERO_SKINS, GEAR } from '@battle/shared';
import { HeroScene } from './src/components/avatar/HeroScene';
import { Hero } from './src/components/avatar/Hero';
import { GearArt } from './src/components/avatar/GearArt';
import './src/styles/system.css'; import './src/styles/heroes.css';
const style = document.createElement('style'); style.textContent='body{padding:20px}#review{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}figure{margin:0;background:#232837;border-radius:12px;overflow:hidden}figcaption{padding:10px;text-align:center;font:12px system-ui}.hero-scene{height:200px}.hero-scene>.hero-avatar{height:100%;width:auto}.gear-display{height:200px}.poses{display:flex;justify-content:center;height:200px;align-items:center}.brand-qa{display:flex;justify-content:center;align-items:center;height:200px;background:#10180f}.brand-qa img{width:160px;height:160px}';document.head.append(style);
createRoot(document.getElementById('review')!).render(<>
{HEROES.slice(0,11).map(h=><figure key={h.id}><HeroScene loadout={{body:h.id}}/><figcaption>{h.name} · Classic</figcaption></figure>)}
{HERO_SKINS.map(s=><figure key={s.id}><HeroScene animated loadout={{body:s.heroId,skin:s.id}}/><figcaption>{s.name}</figcaption></figure>)}
{GEAR.map(g=><figure key={g.id}><div className="gear-display"><GearArt id={g.id}/></div><figcaption>{g.name}</figcaption></figure>)}
<figure><div className="brand-qa"><img src="/brand.svg"/></div><figcaption>DB · final vector</figcaption></figure>
<figure><div className="poses"><Hero loadout={{body:'goku',skin:'goku-sunrise'}} pose="defeated" size={145}/></div><figcaption>Persistent defeat</figcaption></figure>
</>);
