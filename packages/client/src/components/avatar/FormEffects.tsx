import { heroSkin, type Loadout } from '@battle/shared';

/** Low-cost, layered signature VFX. Only visible previews and battle actors animate. */
export function FormEffects({ kit, front = false }: { kit: Loadout; front?: boolean }) {
  const skin = heroSkin(kit.skin);
  if (!skin) return null;
  const { form, secondary } = skin;
  if (front) return <g className={`hero-form-front hero-form-front--${form}`} fill="none" strokeLinecap="round">
    {form === 'hollow-purple' && <g className="form-orb"><circle cx="212" cy="174" r="28" fill="#9267df" opacity=".15" /><circle cx="212" cy="174" r="19" fill="#bb8bed" opacity=".35" /><circle cx="212" cy="174" r="12" fill="#d1a9fa" stroke="#efe5ff" strokeWidth="2" /><path d="m209 164 7 7-10 5 7 7" stroke="#fff3ff" strokeWidth="3" /><g className="form-orbit"><circle cx="177" cy="168" r="6" fill="#ed839a" /><circle cx="242" cy="177" r="6" fill="#82d9f3" /><ellipse cx="212" cy="173" rx="37" ry="13" stroke="#b79ce3" strokeWidth="1.5" /></g></g>}
    {form === 'overcharge' && <g className="form-electric" stroke="#fff6af" strokeWidth="2.5"><path d="m76 142-17 8 10 13-13 12M182 139l18 9-9 14 19 9M106 231l-13 12 11 9" /></g>}
    {form === 'nanotech' && <g className="form-reactor" stroke="#a4eff8" strokeWidth="2"><circle cx="199" cy="199" r="9" /><circle cx="130" cy="201" r="18" opacity=".5" /><path d="M112 220v12h-12m48-12v12h12" /></g>}
    {form === 'sith-lord' && <g className="form-embers" fill="#ef7183" stroke="none"><circle cx="62" cy="151" r="2" /><circle cx="205" cy="102" r="2.5" /><path d="m52 239 3-8 3 8-3 4m145-45 3-7 2 7-3 4Z" /></g>}
    {form === 'super-saiyan' && <g className="form-electric" stroke="#fff3b3" strokeWidth="2"><path d="m65 79-10 20 7 11-13 19m142-73 14 28-7 12 12 31" /></g>}
    {form === 'shadow' && <g className="form-shadow-streak" stroke="#e78296" strokeWidth="2"><path d="M49 246h35m93-154 30-12M180 253h36" /></g>}
  </g>;
  const flame = 'M66 269C27 225 53 208 45 170c17 8 18 17 22 27-9-63 27-75 22-124 16 8 19 22 20 32C115 52 140 49 143 10c37 42 12 84 32 106 0-26 6-39 17-50-5 49 27 63 22 125 7-7 11-15 16-27 5 33-3 70-26 105Z';
  return <g className={`hero-form hero-form--${form}`} fill="none" strokeLinecap="round" strokeLinejoin="round">
    {(form === 'super-saiyan' || form === 'kcm') && <>
      <path className="form-flame form-flame--outer" d={flame} fill={form === 'kcm' ? '#efa637' : '#f2ca43'} opacity=".24" />
      <path className="form-flame form-flame--inner" d={flame} fill="#ffe4a0" opacity=".48" transform="translate(20 27) scale(.85)" />
      <path className="form-flame-edge" d="M49 244q-13-30 7-69m16-57q-3-35 18-64m83-17q17 25 8 46m31 94q22 41 2 66" stroke="#ffe6a0" strokeWidth="3" />
      {form === 'kcm' && <g className="form-tails" fill="#ffcb6a" stroke="#c57d32" strokeWidth="2"><path d="M88 176Q44 136 20 89q-1 79 68 136M81 203q-36-2-64-41 11 78 81 76M174 176q40-39 65-85 3 77-69 139M180 206q37-5 64-39-10 69-70 75" /></g>}
    </>}
    {form === 'symbiote' && <g stroke="#30313e" strokeWidth="10"><path className="form-tendril form-tendril--a" d="M92 204C8 200 58 110 25 75 7 55 6 91 16 89" /><path className="form-tendril form-tendril--b" d="M165 189c70-26 30-86 59-121 19-21 27 2 18 15" /><path className="form-tendril form-tendril--c" d="M88 223c-37 23-67 8-53-26 8-24-18-30-22-17" /><path className="form-tendril form-tendril--d" d="M169 231c55 26 40-33 68-24" /></g>}
    {form === 'gear-five' && <g className="form-clouds" stroke="#d1c8dd" strokeWidth="2" fill="#fff6e9"><path d="M79 175c-59 12-67-37-46-51-22-22-7-45 11-43 16-31 43-14 30 3-12 13-29-3-17-8m117 99c61 10 64-38 45-49 18-21 13-44-6-46-19-29-44-15-32 3 11 16 31 0 18-7" /><path d="M67 185c-49 22-47-18-29-18m144 16c55 26 47-19 31-17" /></g>}
    {form === 'overcharge' && <g className="form-electric" stroke="#c0e2ef" strokeWidth="3"><path d="m50 72-26 48 27-4-18 48m172-86 28 41-22 6 25 44M42 214l-14 20 20 0-12 22m159-39 34 10-11 18 20 9" /><ellipse cx="130" cy="252" rx="104" ry="22" stroke="#e6cc6d" opacity=".55" /></g>}
    {(form === 'armored-knight' || form === 'sith-lord' || form === 'shadow') && <>
      <path className="form-dark-wave" d="M37 253c-9-36 10-51 16-72 1 24 9 26 16 29-5-55 7-105 22-126-5 60 30 67 32 17 22 18 27 33 30 49 18-56 37-72 58-90-16 57-16 90-3 121 4-12 7-22 18-31-3 37 13 58 5 101Z" fill={form === 'shadow' ? '#272137' : '#352a3e'} opacity=".25" />
      <ellipse className="form-ground-ring" cx="130" cy="268" rx="96" ry="14" stroke={secondary} strokeWidth="3" opacity=".7" />
      <g className="form-debris" fill={secondary} opacity=".6"><path d="m32 189 8-8 4 11-9 3Zm183-67 8 4-3 9-8-2ZM58 89l6-8 6 10-8 4Z" /></g>
    </>}
    {form === 'weapon-xi' && <g className="form-cross-blades" stroke="#a6bbbf" strokeWidth="5"><path d="m46 250 19-87m149 90-21-89" /><path d="m45 247 18-82m152 84-23-83" stroke="#f6eadd" strokeWidth="1.5" /></g>}
    {form === 'nanotech' && <g stroke="#91d8e6"><g className="form-orbit"><ellipse cx="130" cy="150" rx="103" ry="70" strokeWidth="2" strokeDasharray="44 22 12 30" transform="rotate(-24 130 150)" /><path d="m37 135 6-20 13-5m150 85 8-19 15-4" strokeWidth="4" /></g><g className="form-thrusters" fill="#b9f2f3" stroke="none"><path d="m88 256 13 34 14-34m34 0 13 34 14-34" /></g></g>}
    {form === 'hollow-purple' && <g className="form-orbit" stroke="#ad8ed8" strokeWidth="2"><ellipse cx="132" cy="159" rx="108" ry="78" transform="rotate(-35 132 159)" strokeDasharray="170 42 46 21" /><ellipse cx="132" cy="160" rx="100" ry="44" transform="rotate(32 132 160)" opacity=".5" /><g fill="#a985d2" stroke="none"><path d="m42 108 6-7 5 9-8 4m153 117 7-5 5 8-8 5m-26-176 4-8 7 5-3 9Z" /></g></g>}
  </g>;
}
