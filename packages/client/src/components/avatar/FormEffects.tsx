import type { CSSProperties } from 'react';
import { heroSkin, type Loadout } from '@battle/shared';

/**
 * Light is two strokes, never a filter.
 *
 * A wide, translucent halo under a thin, near-white core reads as a glowing
 * thing at any size, costs nothing to rasterise, and — unlike `feGaussianBlur`
 * or a gradient — needs no `id`. That matters: a duel puts two of these rigs in
 * one document, and a duplicated filter id would leave the second actor wearing
 * the first one's light.
 */
function Bolt({ d, halo, width = 3, className = '', core = '#fffdf3' }: {
  d: string; halo: string; width?: number; className?: string; core?: string;
}) {
  return <g className={className}>
    <path className="form-halo" d={d} stroke={halo} strokeWidth={width * 3.4} opacity=".32" />
    <path className="form-core" d={d} stroke={core} strokeWidth={width} />
  </g>;
}

/** The same halo-and-core pair for a closed shape. */
function Ring({ cy, rx, ry, halo, core = '#fffdf3', width = 2.5, className = '' }: {
  cy: number; rx: number; ry: number; halo: string; core?: string; width?: number; className?: string;
}) {
  return <g className={className}>
    <ellipse className="form-halo" cx="130" cy={cy} rx={rx} ry={ry} stroke={halo} strokeWidth={width * 4.2} opacity=".26" />
    <ellipse className="form-core" cx="130" cy={cy} rx={rx} ry={ry} stroke={core} strokeWidth={width} opacity=".85" />
  </g>;
}

const TENDRILS = [
  { id: 'a', d: 'M92 204C8 200 58 110 25 75 7 55 6 91 16 89' },
  { id: 'b', d: 'M165 189c70-26 30-86 59-121 19-21 27 2 18 15' },
  { id: 'c', d: 'M88 223c-37 23-67 8-53-26 8-24-18-30-22-17' },
  { id: 'd', d: 'M169 231c55 26 40-33 68-24' },
];
const TAILS = [
  { id: 'a', d: 'M88 176Q44 136 20 89q-1 79 68 136' },
  { id: 'b', d: 'M81 203q-36-2-64-41 11 78 81 76' },
  { id: 'c', d: 'M174 176q40-39 65-85 3 77-69 139' },
  { id: 'd', d: 'M180 206q37-5 64-39-10 69-70 75' },
];
const BLADES = [
  { id: 'a', body: 'M77 182l-28 84', glint: 'M75 188l-24 72' },
  { id: 'b', body: 'M181 182l28 84', glint: 'M183 188l24 72' },
];
const MOTES = ['M32 189l8-8 4 11-9 3Z', 'M215 122l8 4-3 9-8-2Z', 'M58 89l6-8 6 10-8 4Z'];

/** Low-cost, layered signature VFX. Only visible previews and battle actors animate. */
export function FormEffects({ kit, front = false }: { kit: Loadout; front?: boolean }) {
  const skin = heroSkin(kit.skin);
  if (!skin) return null;
  const { form, secondary } = skin;
  // The glow is the skin's own palette, so restyling a form never touches the art.
  const palette = { '--form-glow': skin.color, '--form-spark': secondary, '--form-lit': skin.glow } as CSSProperties;
  if (front) return <g className={`hero-form-front hero-form-front--${form}`} style={palette} fill="none" strokeLinecap="round">
    {form === 'hollow-purple' && <g className="form-orb">
      <circle className="form-halo" cx="212" cy="174" r="34" fill="var(--form-spark)" opacity=".2" stroke="none" />
      <circle cx="212" cy="174" r="22" fill="#a374e6" opacity=".5" stroke="none" />
      <circle className="form-core" cx="212" cy="174" r="13" fill="#e8d8ff" stroke="#fff8ff" strokeWidth="2" />
      <path d="m209 164 7 7-10 5 7 7" stroke="#fff3ff" strokeWidth="3" />
      <g className="form-orbit"><circle cx="177" cy="168" r="6" fill="#ed839a" stroke="none" /><circle cx="242" cy="177" r="6" fill="#82d9f3" stroke="none" /><ellipse cx="212" cy="173" rx="37" ry="13" stroke="#cbb2f0" strokeWidth="1.8" /></g>
      {/* Energy crackling off the orb borrows the lightning burst, not a glimmer. */}
      <g className="form-crackle" stroke="var(--form-spark)" strokeWidth="2"><path className="form-bolt form-bolt--a" d="m176 140 9-9" /><path className="form-bolt form-bolt--b" d="m248 206-10-8" /><path className="form-bolt form-bolt--c" d="m180 212 8-10" /></g>
    </g>}
    {form === 'overcharge' && <g className="form-storm">
      <Bolt className="form-bolt form-bolt--a" d="M76 142l-17 8 10 13-13 12" halo="var(--form-spark)" width={2.4} />
      <Bolt className="form-bolt form-bolt--b" d="M182 139l18 9-9 14 19 9" halo="var(--form-spark)" width={2.4} />
      <Bolt className="form-bolt form-bolt--c" d="M106 231l-13 12 11 9" halo="var(--form-glow)" width={2.2} />
    </g>}
    {form === 'nanotech' && <g className="form-reactor">
      <circle className="form-halo" cx="130" cy="201" r="26" stroke="var(--form-spark)" strokeWidth="9" opacity=".26" />
      <circle className="form-core" cx="130" cy="201" r="18" stroke="#e6feff" strokeWidth="2.4" />
      <circle cx="199" cy="199" r="9" stroke="var(--form-spark)" strokeWidth="2" />
      <path d="M112 220v12h-12m48-12v12h12" stroke="var(--form-spark)" strokeWidth="2" />
    </g>}
    {form === 'sith-lord' && <g className="form-embers" fill="var(--form-spark)" stroke="none">
      <circle className="form-mote form-mote--a" cx="62" cy="151" r="2.6" />
      <circle className="form-mote form-mote--b" cx="205" cy="102" r="3" />
      <path className="form-mote form-mote--c" d="M52 239l3-8 3 8-3 4Z" />
      <path className="form-mote form-mote--d" d="M197 194l3-7 2 7-3 4Z" />
    </g>}
    {form === 'super-saiyan' && <g className="form-storm">
      <Bolt className="form-bolt form-bolt--a" d="M65 79l-10 20 7 11-13 19" halo="var(--form-spark)" width={2.2} />
      <Bolt className="form-bolt form-bolt--b" d="M191 56l14 28-7 12 12 31" halo="var(--form-spark)" width={2.2} />
    </g>}
    {form === 'weapon-xi' && <g className="form-blades">
      {/* In front of the rig, not behind it. Drawn behind, these pass under the
          fists and read as two loose bars propped beside him; in front they
          come out of his hands, which is the whole idea of the form.
          The halo is dark on purpose — steel is read by its edge against a
          shadow rather than by light of its own, and the bloom supplies the rest. */}
      {BLADES.map(({ id, body, glint }) => <g key={id} className={`form-blade form-blade--${id}`}>
        <path className="form-halo" d={body} stroke="#2b343c" strokeWidth="15" opacity=".5" />
        <path d={body} stroke="#8195a0" strokeWidth="7" />
        <path className="form-core form-glint" d={glint} stroke="#f4fcff" strokeWidth="2.6" strokeDasharray="24 94" />
      </g>)}
    </g>}
    {form === 'shadow' && <g className="form-streaks">
      {/* Speed is the whole character: the lines rush past rather than glimmer. */}
      <Bolt className="form-streak form-streak--a" d="M49 246h35" halo="var(--form-spark)" width={2.2} core="#ffe8ec" />
      <Bolt className="form-streak form-streak--b" d="M177 92l30-12" halo="var(--form-spark)" width={2.2} core="#ffe8ec" />
      <Bolt className="form-streak form-streak--c" d="M180 253h36" halo="var(--form-spark)" width={2.2} core="#ffe8ec" />
    </g>}
  </g>;
  const flame = 'M66 269C27 225 53 208 45 170c17 8 18 17 22 27-9-63 27-75 22-124 16 8 19 22 20 32C115 52 140 49 143 10c37 42 12 84 32 106 0-26 6-39 17-50-5 49 27 63 22 125 7-7 11-15 16-27 5 33-3 70-26 105Z';
  const edge = 'M49 244q-13-30 7-69m16-57q-3-35 18-64m83-17q17 25 8 46m31 94q22 41 2 66';
  return <g className={`hero-form hero-form--${form}`} style={palette} fill="none" strokeLinecap="round" strokeLinejoin="round">
    {(form === 'super-saiyan' || form === 'kcm') && <>
      {/*
        * Four nested copies of one flame, each on its own period, so the loop
        * never lands on itself and the fire does not visibly repeat.
        *
        * No translate on any of them, deliberately. `.hero-form *` sets
        * `transform-box:fill-box; transform-origin:center bottom`, and an SVG
        * `transform` attribute is that same CSS property — so these already
        * scale about the flame's own base and stay concentric for free. The
        * nudges that used to sit here were eyeballed on top of that and were
        * what pushed the aura off the figure.
        *
        * The group's shift is real, though: the flame is drawn centred on
        * x=137.6 while the figure's axis is x=133, so the stack moves 4.6 left
        * to stand on the character rather than beside him. It goes on the group
        * because the outer copy's breathing is a CSS transform, and an
        * attribute on that same path would lose to it.
        */}
      <g transform="translate(-4.6 0)">
        <path className="form-flame form-halo" d={flame} fill={form === 'kcm' ? 'var(--form-spark)' : 'var(--form-glow)'} opacity=".3" transform="scale(1.06)" />
        <path className="form-flame form-flame--outer" d={flame} fill={form === 'kcm' ? '#efa637' : '#f2ca43'} opacity=".5" />
        <path className="form-flame form-flame--inner" d={flame} fill={form === 'kcm' ? 'var(--form-glow)' : 'var(--form-spark)'} opacity=".72" transform="scale(.85)" />
        <path className="form-flame form-core" d={flame} fill={form === 'kcm' ? '#fffdf0' : '#fffae6'} opacity=".55" transform="scale(.68)" />
        <g className="form-flame-edge">
          <path className="form-halo" d={edge} stroke="var(--form-spark)" strokeWidth="9" opacity=".38" />
          <path className="form-core" d={edge} stroke={form === 'kcm' ? '#fff7d8' : '#fffdf2'} strokeWidth="2.5" />
        </g>
      </g>
      <g className="form-sparks" fill={form === 'kcm' ? '#fff3c4' : 'var(--form-spark)'} stroke="none">
        <circle className="form-spark form-spark--a" cx="58" cy="196" r="4" />
        <circle className="form-spark form-spark--b" cx="201" cy="171" r="3.4" />
        <circle className="form-spark form-spark--c" cx="86" cy="118" r="3" />
        <circle className="form-spark form-spark--d" cx="177" cy="96" r="3.6" />
      </g>
      {form === 'kcm' && <g className="form-tails">
        {/* Four tails on four clocks: in unison they read as one stiff object.
            Each is outlined in a dark halo, because gold chakra drawn over a
            gold flame is gold on gold and disappears into it. */}
        {TAILS.map(({ id, d }) => <g key={id} className={`form-tail form-tail--${id}`}>
          <path className="form-halo" d={d} fill="none" stroke="#6f3f14" strokeWidth="8" opacity=".5" />
          <path d={d} fill="#ffd98a" stroke="#b96f26" strokeWidth="2.4" />
        </g>)}
      </g>}
    </>}
    {form === 'symbiote' && <g className="form-tendrils">
      {/* The dark body carries a bright rim that travels along it, so the thing
          reads as alive rather than as four lines leaning in unison. */}
      {TENDRILS.map(({ id, d }) => <g key={id} className={`form-tendril form-tendril--${id}`}>
        <path className="form-halo" d={d} stroke="#30313e" strokeWidth="10" />
        <path className="form-core" d={d} stroke="var(--form-spark)" strokeWidth="3.2" strokeDasharray="30 110" />
      </g>)}
    </g>}
    {form === 'gear-five' && <>
      <g className="form-clouds">
        <path className="form-halo" d="M79 175c-59 12-67-37-46-51-22-22-7-45 11-43 16-31 43-14 30 3-12 13-29-3-17-8m117 99c61 10 64-38 45-49 18-21 13-44-6-46-19-29-44-15-32 3 11 16 31 0 18-7" stroke="var(--form-spark)" strokeWidth="9" opacity=".3" />
        <path className="form-core" d="M79 175c-59 12-67-37-46-51-22-22-7-45 11-43 16-31 43-14 30 3-12 13-29-3-17-8m117 99c61 10 64-38 45-49 18-21 13-44-6-46-19-29-44-15-32 3 11 16 31 0 18-7" stroke="#fffdf6" strokeWidth="2.2" fill="#fff6e9" />
        <path className="form-cloud-wisp" d="M67 185c-49 22-47-18-29-18m144 16c55 26 47-19 31-17" stroke="#e6ddee" strokeWidth="2" />
      </g>
      {/* The drum beat of the form, kept slower than a storm's. */}
      <Ring className="form-ring form-ring--slow" cy={258} rx={99} ry={19} halo="var(--form-spark)" core="#fffdf6" width={2.4} />
      <g className="form-sparks" fill="#fffdf6" stroke="none">
        <circle className="form-spark form-spark--a" cx="66" cy="120" r="3.4" />
        <circle className="form-spark form-spark--b" cx="196" cy="132" r="3" />
        <circle className="form-spark form-spark--c" cx="104" cy="88" r="2.6" />
      </g>
    </>}
    {form === 'overcharge' && <g className="form-storm">
      <Bolt className="form-bolt form-bolt--a" d="M50 72l-26 48 27-4-18 48" halo="var(--form-glow)" width={3} />
      <Bolt className="form-bolt form-bolt--b" d="M205 78l28 41-22 6 25 44" halo="var(--form-glow)" width={3} />
      <Bolt className="form-bolt form-bolt--c" d="M42 214l-14 20 20 0-12 22" halo="var(--form-spark)" width={2.6} />
      <Bolt className="form-bolt form-bolt--d" d="M195 217l34 10-11 18 20 9" halo="var(--form-spark)" width={2.6} />
      <Ring className="form-ring" cy={252} rx={104} ry={22} halo="var(--form-glow)" core="#ffeeae" />
    </g>}
    {(form === 'armored-knight' || form === 'sith-lord' || form === 'shadow') && <>
      <path className="form-dark-wave" d="M37 253c-9-36 10-51 16-72 1 24 9 26 16 29-5-55 7-105 22-126-5 60 30 67 32 17 22 18 27 33 30 49 18-56 37-72 58-90-16 57-16 90-3 121 4-12 7-22 18-31-3 37 13 58 5 101Z" fill={form === 'shadow' ? '#272137' : '#352a3e'} opacity=".28" />
      {/* A dark shape only reads as a shape when its edge catches something. */}
      <path className="form-wave-rim" d="M41 246q-5-28 13-60m19 44q-7-54 20-104m36 62q12 15 19 39m26-40q10-44 41-82m15 119q8-21 19-34" stroke="var(--form-spark)" strokeWidth="2.5" opacity=".65" />
      <Ring className="form-ring form-ring--slow" cy={268} rx={96} ry={14} halo="var(--form-spark)" core={secondary} width={2.6} />
      <g className="form-debris" fill={secondary} stroke="none">
        {MOTES.map((d, index) => <path key={d} className={`form-mote form-mote--${'abc'[index]}`} d={d} />)}
      </g>
    </>}
    {form === 'nanotech' && <>
      <g className="form-orbit">
        <ellipse className="form-halo" cx="130" cy="150" rx="103" ry="70" stroke="var(--form-spark)" strokeWidth="7" opacity=".24" strokeDasharray="44 22 12 30" transform="rotate(-24 130 150)" />
        <ellipse className="form-core" cx="130" cy="150" rx="103" ry="70" stroke="#dcfdff" strokeWidth="2" strokeDasharray="44 22 12 30" transform="rotate(-24 130 150)" />
        <path d="m37 135 6-20 13-5m150 85 8-19 15-4" stroke="var(--form-spark)" strokeWidth="4" />
      </g>
      {/* A second ring against the first: one plane is a hoop, two are a field. */}
      <g className="form-orbit form-orbit--counter">
        <ellipse cx="130" cy="152" rx="74" ry="99" stroke="var(--form-spark)" strokeWidth="1.8" opacity=".45" strokeDasharray="30 26" transform="rotate(38 130 152)" />
      </g>
      <g className="form-thrusters">
        <path className="form-halo" d="m88 256 13 34 14-34m34 0 13 34 14-34" stroke="var(--form-spark)" strokeWidth="12" opacity=".28" />
        <path className="form-core" d="m88 256 13 34 14-34m34 0 13 34 14-34" fill="#e6feff" stroke="none" />
      </g>
    </>}
    {form === 'hollow-purple' && <g className="form-orbit" stroke="var(--form-spark)" strokeWidth="2">
      <ellipse cx="132" cy="159" rx="108" ry="78" transform="rotate(-35 132 159)" strokeDasharray="170 42 46 21" />
      <ellipse cx="132" cy="160" rx="100" ry="44" transform="rotate(32 132 160)" opacity=".5" />
      <g fill="var(--form-spark)" stroke="none"><path d="m42 108 6-7 5 9-8 4m153 117 7-5 5 8-8 5m-26-176 4-8 7 5-3 9Z" /></g>
    </g>}
  </g>;
}
