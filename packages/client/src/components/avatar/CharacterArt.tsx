import { GearDrawing } from './GearArt.js';
import type { ReactNode } from 'react';
import { cosmetic, heroById, heroSkin, type Loadout } from '@battle/shared';

const INK = '#292c3b';
const SKIN = '#f5c9a6';
type ArtProps = { kit: Loadout };

function Eyes({ happy = false }: { happy?: boolean }) {
  return <g className="hero-avatar__eyes" stroke={INK} strokeWidth="3.5" strokeLinecap="round">
    {happy ? <path d="M94 123q7-10 14 0m40 0q7-10 14 0" fill="none" /> : <>
      <ellipse cx="102" cy="124" rx="7.5" ry="11" fill={INK} /><ellipse cx="156" cy="124" rx="7.5" ry="11" fill={INK} />
      <path d="M101 119v2m54-2v2" stroke="white" strokeWidth="4" />
    </>}
  </g>;
}

function Face({ children, color = SKIN, smile = true }: { children?: ReactNode; color?: string; smile?: boolean }) {
  return <g className="hero-avatar__head">
    <ellipse cx="65" cy="129" rx="10" ry="13" fill={color} /><ellipse cx="195" cy="129" rx="10" ry="13" fill={color} />
    <path d="M64 104C64 66 88 53 129 53s67 19 67 54v31c0 33-31 48-66 48s-66-15-66-48Z" fill={color} />
    <path d="M70 137c7 30 32 42 62 42 27 0 45-8 60-27-7 24-30 34-61 34-36 0-61-15-61-49" fill="#c78564" stroke="none" opacity=".18" />
    <g fill="#e59187" stroke="none" opacity=".6"><ellipse cx="85" cy="144" rx="10" ry="5" /><ellipse cx="174" cy="144" rx="10" ry="5" /></g>
    {smile && <path d="M120 149q9 8 19-1" fill="none" strokeWidth="3" />}
    {children}
  </g>;
}

function Body({ primary, secondary = INK, hands = SKIN, children, boots = secondary, legs = secondary }: { primary: string; secondary?: string; hands?: string; children?: ReactNode; boots?: string; legs?: string }) {
  return <>
    <g className="hero-avatar__legs">
      <path d="m98 230-6 25 28 2 5-25m14 0 3 25 28-2-7-23" fill={legs} />
      <path d="M95 248c-13 0-24 14-15 19 8 4 26 4 42 0v-19Z" fill={boots} />
      <path d="M145 248v19c15 4 35 4 42-2 5-8-9-18-20-17Z" fill={boots} />
      <path d="M82 263h35m32 0h34" stroke="#fff" strokeOpacity=".25" strokeWidth="3" />
    </g>
    <g className="hero-avatar__arm"><path d="M88 177c-17-3-26 15-30 26-2 10 7 17 16 11l25-19Z" fill={primary} /><path d="M63 199c-14-3-22 8-18 18 3 10 18 13 25 2l4-11Z" fill={hands} /></g>
    <path d="M100 168c-21 10-26 39-20 62 2 15 19 19 49 19s47-5 49-19c6-25 0-50-21-62Z" fill={primary} />
    <path d="M84 226q42 15 90 0l-1 10q-39 21-87 0Z" fill={INK} stroke="none" opacity=".13" />
    {children}
    <g className="hero-avatar__hand"><path d="M169 177c11-5 20 5 25 15l-14 15-20-16" fill={primary} /><path d="M188 189c12-10 25-4 23 7 8 14-9 27-20 17-9 0-14-13-3-24Z" fill={hands} /><path d="m199 191 2 8" strokeOpacity=".4" strokeWidth="2" /></g>
  </>;
}

function Cape({ color, bat = false }: { color: string; bat?: boolean }) {
  return <path className="hero-avatar__cape" d={bat ? 'M95 161Q62 170 43 244q21-7 34 10 14-8 30 8h46q14-17 30-8 16-18 36-10-26-83-61-83Z' : 'M99 161Q70 175 56 248q72 29 145 0-21-75-44-87Z'} fill={color} />;
}

function Spider({ kit }: ArtProps) {
  const p = heroSkin(kit.skin)?.color ?? '#e95756';
  const s = heroSkin(kit.skin)?.secondary ?? '#426991';
  return <>
    <Body primary={p} secondary={s} hands={p} boots={p}><path d="M83 194h17v39H81m78-39h18v39h-19" fill={s} stroke="none" /><g strokeWidth="2.5" fill="none"><ellipse cx="130" cy="204" rx="4" ry="8" fill={INK} /><path d="m125 201-7-6-3-7m10 15-9 1-5-5m14 8-9 6-4 7m13-11-4 13m14-21 7-6 3-7m-10 15 9 1 5-5m-14 8 9 6 4 7m-13-11 4 13" /></g></Body>
    <g className="hero-avatar__head">
      <path d="M64 107c0-42 24-58 65-58s68 20 68 62c0 48-23 74-67 74s-66-30-66-78Z" fill={p} />
      <path d="M71 85q21-24 43-25" stroke="#ffb0a1" strokeWidth="7" fill="none" />
      <g fill="none" stroke={INK} strokeWidth="1.6" opacity=".48"><path d="M130 51v130M80 65l102 90M181 65 79 154M66 110h130M72 78q58 37 117 0M66 140q64-40 127 1M94 58q-19 55 8 117M164 57q24 55-8 118" /></g>
      <g className="hero-avatar__eyes" fill="#fff9eb" strokeWidth="5"><path d="M77 102q25 4 40 22-14 24-29 13-9-9-11-35Z" /><path d="M182 102q-24 4-40 22 14 24 29 13 9-9 11-35Z" /></g>
    </g>
  </>;
}

function Goku({ kit }: ArtProps) {
  const p = heroSkin(kit.skin)?.color ?? '#f19a44';
  return <>
    <Body primary={p} secondary="#384e7a" boots="#384e7a"><path d="m106 174 24 22 22-22m-65 48h86" stroke="#384e7a" strokeWidth="10" fill="none" /><circle cx="153" cy="204" r="12" fill="#f9ebd2" /><path d="m150 198 8 12m-3-13-8 10m1-4h11" strokeWidth="2" /></Body>
    <Face><Eyes /><path d="m87 106 25 4m34 0 24-5" fill="none" />
      <path d="M66 116 48 90l17 0-22-35 32 8-8-37 33 21L110 9l22 31 24-28 9 35 30-18-2 34 28-5-25 39-15 15-9-32-26 20-10-29-34 33 1-23-21 39Z" fill="#313345" />
      <path d="m88 49 14 13-16 10m38-26 9 13-15 18m39-28-5 24" fill="none" stroke="#51556a" strokeWidth="5" />
    </Face>
  </>;
}

function Naruto({ kit }: ArtProps) {
  const p = heroSkin(kit.skin)?.color ?? '#ed974b';
  return <>
    <path className="hero-avatar__cape" d="M177 86q44-13 54 22-27-14-48 0m-4-17q45 12 36 48-12-26-33-30" fill="#3b445a" />
    <Body primary={p} secondary="#374151"><path d="M100 170h57l10 34H91Z" fill="#384556" /><path d="M130 185v58" fill="none" stroke="#eadac7" strokeWidth="4" /><path d="m145 232 24-3" fill="none" stroke="#ede6cd" strokeWidth="7" /></Body>
    <Face><Eyes /><g strokeWidth="2" opacity=".65"><path d="m77 132 13 4m-14 4 13 4m-11 4 12 3m80-18 12-4m-11 13 13-4m-12 12 11-4" /></g>
      <path d="m60 91-7-29 23 5-4-23 23 12 10-30 21 21 21-29 8 31 27-13 1 26 23-6-11 43Z" fill="#f6cb54" />
      <path d="M62 87q64-24 134 0v24q-66-19-134 0Z" fill="#364052" />
      <path d="M91 83q39-7 77 0v25q-40-5-77 0Z" fill="#acb6c6" /><path d="M137 88q-20-2-18 10 2 10 14 5 9-5 0-9-8-2-9 5m10-10 8-7m-26 16-5 4 8 1" fill="none" strokeWidth="2" />
    </Face>
  </>;
}

function Batman({ kit }: ArtProps) {
  const p = heroSkin(kit.skin)?.color ?? '#586375';
  const s = heroSkin(kit.skin)?.secondary ?? '#343b50';
  return <><Cape color={s} bat /><Body primary={p} secondary={s} hands={s}><path d="M81 228h96" stroke="#e7bc5e" strokeWidth="10" /><rect x="121" y="222" width="18" height="12" rx="3" fill="#e6bd61" /><ellipse cx="130" cy="200" rx="24" ry="13" fill="#e6bd61" stroke="none" /><path d="m108 193 10 5 8-8 4 6 4-6 8 8 10-5-6 13-10-2-6 7-6-7-10 2Z" fill={INK} stroke="none" /></Body>
    <g className="hero-avatar__head"><path d="M63 105 70 32l28 33q32-15 63 0l29-33 9 77-3 42q-8 34-67 34-57 0-64-34Z" fill={s} /><path d="m81 57 5 24m93-22-3 22" stroke="#728097" fill="none" strokeWidth="4" /><path d="M95 142h70v20q-34 33-70 0Z" fill={SKIN} /><path d="M120 158h20" fill="none" strokeWidth="3" /><g className="hero-avatar__eyes" fill="#f5f1db"><path d="m78 112 37 9-8 14-22-4Z" /><path d="m180 112-37 9 8 14 22-4Z" /></g><path d="m130 112-9 32 9 5 9-5Z" fill={p} /></g>
  </>;
}

function Deadpool({ kit }: ArtProps) {
  const p = heroSkin(kit.skin)?.color ?? '#c9545b';
  return <>
    <g stroke="#343443" strokeWidth="10"><path d="m68 169 114-88m-100 0 108 96" /><path d="m166 83 22 20m-114 0 22-20" strokeWidth="6" /></g>
    <Body primary={p} secondary="#353846" hands="#353846"><path d="m99 170 62 69" stroke="#5a3c43" strokeWidth="10" /><path d="M82 229h93" stroke="#37333b" strokeWidth="10" /><circle cx="129" cy="229" r="9" fill={p} /><path d="M129 222v14" /></Body>
    <g className="hero-avatar__head"><path d="M64 111c0-44 24-60 65-60 43 0 68 18 68 61v20c0 37-28 54-66 54s-67-19-67-54Z" fill={p} /><path d="M74 83q18-22 38-22" stroke="#ec8a88" strokeWidth="6" fill="none" /><path d="M85 96q-16 13-9 43 6 23 24 16l19-21-6-31Zm66 7-8 31 18 21q21 8 26-18 5-26-9-41Z" fill="#323744" /><g className="hero-avatar__eyes" fill="#fff3df" strokeWidth="2"><path d="m84 119 27 8-14 10-11-5Z" /><path d="m151 128 26-15-1 21-14 4Z" /></g></g>
  </>;
}

function Pikachu({ kit }: ArtProps) {
  const p = heroSkin(kit.skin)?.color ?? '#f3ce54';
  return <>
    <path className="hero-avatar__tail" d="m179 210 21-33-10-16 27-43 23 21-28 31 9 15-26 39Z" fill={p} />
    <ellipse cx="99" cy="258" rx="23" ry="12" fill={p} /><ellipse cx="165" cy="258" rx="23" ry="12" fill={p} />
    <path d="M94 168q-21 19-19 57 4 37 54 36 49 2 55-34 3-37-21-59Z" fill={p} />
    <path d="M87 238q44 22 88-3" stroke="#c59e3c" strokeOpacity=".4" strokeWidth="8" fill="none" />
    <path className="hero-avatar__arm" d="M85 180q-31 9-28 30 9 16 26-3" fill={p} /><path className="hero-avatar__hand" d="M179 180q30-22 35-5 1 21-29 33" fill={p} />
    <g className="hero-avatar__head">
      <g className="hero-avatar__ears"><path d="M86 88Q38 52 49 18q37 6 58 66Z" fill={p} /><path d="M52 20q20 7 28 20L65 55Q49 38 52 20" fill={INK} stroke="none" /><path d="M155 82q16-58 53-70 18 32-33 79Z" fill={p} /><path d="M208 14q9 21-8 39l-19-14q13-19 27-25" fill={INK} stroke="none" /></g>
      <path d="M73 104c12-40 105-40 116 0l15 35c6 25-22 47-73 47-50 0-80-18-73-42Z" fill={p} />
      <path d="M84 100q24-19 48-17" stroke="#fff0a2" strokeWidth="6" fill="none" />
      <Eyes /><g fill="#e96c5e" stroke="none"><ellipse cx="79" cy="145" rx="13" ry="11" /><ellipse cx="182" cy="145" rx="13" ry="11" /></g>
      <path d="m125 136 5 4 5-4" fill={INK} strokeWidth="2" /><path d="M114 148q8 11 16 0 9 11 17 0" fill="none" strokeWidth="2.8" />
    </g>
  </>;
}

function Luffy({ kit }: ArtProps) {
  const p = heroSkin(kit.skin)?.color ?? '#d96155';
  return <>
    <Body primary={SKIN} secondary="#6087ad" boots="#9a6b4e" legs={SKIN}><path d="M83 223h94l-6 24h-32l-8-9-8 9H89Z" fill="#6087ad" /><path d="M101 170 91 222l26 4 5-53m16 0 4 54 29-5-15-52" fill={p} /><path d="m88 244 34 0m17 0 33 0" stroke="#efe4c9" strokeWidth="6" /><path d="M111 202h-8m46 4h8" stroke="#e9b24e" strokeWidth="4" /></Body>
    <Face smile={false}><Eyes happy /><path d="M109 144h44q-1 24-22 24-20 0-22-24Z" fill="#fff6e8" /><path d="m168 143 10 0m-7-4v8" strokeWidth="2" /><path d="M66 107 70 82l31-9 68 5 22 17 2 20-15-15-9 13-12-18-21 17-11-17-19 15-13-17-13 20Z" fill="#333542" />
      <g className="hero-avatar__hat"><path d="M80 71c0-45 104-45 105 0l-11 16H89Z" fill="#e8c579" /><path d="M82 65q48 10 101 0v17H83Z" fill="#d76456" /><ellipse cx="132" cy="84" rx="87" ry="15" fill="#eed08b" /><path d="M61 84q61 15 143 0" fill="none" stroke="#c59a58" strokeWidth="2" /></g>
    </Face>
  </>;
}

function Vader({ kit }: ArtProps) {
  const p = heroSkin(kit.skin)?.color ?? '#424654';
  const s = heroSkin(kit.skin)?.secondary ?? '#2c303e';
  return <><Cape color={s} /><Body primary={p} secondary={s} hands={s}><path d="M95 179q35 15 68 0" stroke="#a4a4ae" strokeWidth="5" /><rect x="113" y="197" width="35" height="28" rx="4" fill={s} /><path d="M119 205h6m7 0h9" stroke="#e08881" strokeWidth="4" /><path d="M119 215h9m6 0h7" stroke="#aac7d5" strokeWidth="4" /><path d="M83 237h92" stroke="#93929f" strokeWidth="6" /></Body>
    <g className="hero-avatar__head"><path d="M69 101c0-69 121-69 121 0l19 66q-77 34-159 0Z" fill={s} /><path d="M124 55h12l6 115h-25Z" fill={p} /><path d="M76 92q50-40 108 0l3 34-19 25H93l-20-25Z" fill={p} /><g className="hero-avatar__eyes" fill="#1e2431"><path d="m80 101 37 9-3 24-31-9Z" /><path d="m179 101-37 9 3 24 31-9Z" /></g><path d="m130 122-23 42h47Z" fill={s} /><path d="M120 153v9m10-18v19m10-10v9" stroke="#adb4c1" strokeWidth="3" /><path d="M87 71q12-11 24-13" stroke="#8e96a8" strokeWidth="5" fill="none" /><circle cx="93" cy="159" r="6" fill="#a5a7b5" /><circle cx="168" cy="159" r="6" fill="#a5a7b5" /></g>
    <g className="hero-avatar__weapon"><path d="m210 205 17-78" stroke="#f49ba0" strokeWidth="9" /><path d="m210 205 17-78" stroke="#fff2e1" strokeWidth="3" /><path d="m208 215 4-20" stroke="#697083" strokeWidth="10" /></g>
  </>;
}

function IronMan({ kit }: ArtProps) {
  const p = heroSkin(kit.skin)?.color ?? '#be5550';
  const s = heroSkin(kit.skin)?.secondary ?? '#e2b85f';
  return <><Body primary={p} secondary={s} hands={p} boots={p}><path d="m96 178 17 7m31 0 17-7M91 223l20 7m39 0 20-7" stroke={s} strokeWidth="7" /><circle className="hero-avatar__reactor" cx="130" cy="201" r="12" fill="#c9eeef" stroke="#496e86" /><circle cx="130" cy="201" r="6" fill="#fcfff7" stroke="none" /></Body>
    <g className="hero-avatar__head"><path d="M65 103q0-51 65-51 65 0 65 51v33q-4 48-65 48-61 0-65-48Z" fill={p} /><path d="m80 81 30-18 4 19h32l5-19 29 18 1 59-17 23H98l-18-23Z" fill={s} /><path d="m90 83 12-8" stroke="#fff0be" strokeWidth="5" /><g className="hero-avatar__eyes" fill="#d7faff" strokeWidth="3"><path d="m88 111 29 7v10l-28-3Z" /><path d="m171 111-29 7v10l28-3Z" /></g><path d="M112 152h37m-54-14 10 7m51 0 10-7" fill="none" strokeWidth="3" /></g>
  </>;
}

function Sonic({ kit }: ArtProps) {
  const p = heroSkin(kit.skin)?.color ?? '#477cbf';
  return <>
    <path d="m106 161-40 47 26 1-24 33 53-14m44-68 41 41-24 1 21 32-53-9" fill={p} />
    <path d="m115 226-9 28m40-28 10 28" stroke={p} strokeWidth="15" />
    <path d="M101 249c-28 0-36 12-31 20 16 5 37 3 55-2l-3-18Zm49 0-1 18c18 5 39 6 54 1 5-9-8-20-33-20Z" fill="#dc675f" /><path d="m96 250 4 20m65-21-1 21" stroke="#fff5df" strokeWidth="10" />
    <path d="M108 167q-25 19-17 53 9 31 39 27 34 4 43-29 7-36-22-51Z" fill={p} /><ellipse cx="131" cy="208" rx="22" ry="28" fill="#ebcaa1" />
    <g className="hero-avatar__arm"><path d="m98 186-29 24" stroke="#ebcaa1" strokeWidth="13" /><path d="M60 202c-19-4-25 16-8 23 10 10 25-3 17-16Z" fill="#f7f2df" /></g>
    <g className="hero-avatar__hand"><path d="m163 186 27 15" stroke="#ebcaa1" strokeWidth="13" /><path d="M188 190c-4-21 6-27 13-13 14-4 21 7 15 18 4 22-32 27-28-5Z" fill="#f7f2df" /></g>
    <g className="hero-avatar__head"><path d="M69 80 52 39l34 14q45-19 81 0l34-14-9 42 24 24-21 6 19 29-28 2 8 25-40-9H99l-39 14 8-27-28-2 19-27-23-7Z" fill={p} /><path d="m65 54 14 13-15 13m124-26-13 13 14 13" fill="#e8c99f" strokeWidth="2" /><path d="M81 100q17-21 44 1 24-23 49-1l8 39H75Z" fill="#f8f3e3" /><g className="hero-avatar__eyes" fill="#659b72"><ellipse cx="111" cy="121" rx="8" ry="17" /><ellipse cx="151" cy="121" rx="8" ry="17" /><path d="M111 116v12m40-12v12" strokeWidth="6" /><path d="M109 113v3m40-3v3" stroke="white" strokeWidth="3" /></g><path d="M86 139q15-9 43-1 41-14 55 5-2 35-54 36-52-1-54-25Z" fill="#e8c99f" /><ellipse cx="129" cy="137" rx="9" ry="6" fill={INK} /><path d="M133 155q14 8 30-6" fill="none" strokeWidth="3" /></g>
  </>;
}

function Gojo({ kit }: ArtProps) {
  const p = heroSkin(kit.skin)?.color ?? '#393c55';
  return <><Body primary={p} secondary="#303347"><path d="m100 173 11 25h39l12-25Z" fill={p} /><path d="M132 198v42" stroke="#65617f" strokeWidth="2" /><circle cx="141" cy="200" r="2.5" fill="#c4becf" stroke="none" /></Body>
    <Face><path d="M67 91q63 23 126 0v43q-60 18-126 0Z" fill="#34364c" /><path d="M77 104q42 11 105 0" stroke="#565974" strokeWidth="4" fill="none" /><path d="m63 95-8-28 20 0-3-21 24 11 10-31 19 20 25-29 5 30 27-14-1 26 23-7-10 40-27-4-16 13-18-15-20 10-19-8-16 13Z" fill="#f0eee7" /><path d="m83 59 11 12m18-20 9 13m26-24-7 29m31-17-10 19" stroke="#c5c5db" strokeWidth="3" fill="none" /><path d="M118 151q15 12 28-2" fill="none" strokeWidth="3" /></Face>
  </>;
}

function Original({ kit }: ArtProps) {
  const body = '#b9ded9';
  const coat = cosmetic(kit.outfit)?.color ?? '#7484b1';
  const hair = cosmetic(kit.hair)?.color ?? '#495064';
  return <>
    {kit.outfit === 'midnight' && <Cape color="#454467" />}
    <Body primary={coat} secondary="#424b64" hands={body}><path d="M130 177v68m-45-24h86" stroke="#e2e5e5" strokeWidth="4" /><path d="m98 192-10 10 10 9" stroke="#ede1bd" strokeWidth="4" fill="none" /></Body>
    <Face color={body}><Eyes /><path d={kit.hair === 'snow' ? 'M65 110 52 73l23 1-7-26 27 10 15-30 18 21 27-27 8 29 32-11-6 31 21 8-19 33-14-26-27 12-22-17-22 21-14-11Z' : 'M65 109q-5-52 43-58l9-22 22 18q60-2 58 62l-24-19-17 14-18-19-18 11-14-12-17 24-10-7Z'} fill={hair} /><path d="M82 72q14-12 26-12" stroke="white" strokeOpacity=".16" strokeWidth="5" fill="none" /></Face>
  </>;
}

/** New art plugs in without changing cards, commerce or animation. */
export const CHARACTER_ART: Record<string, (props: ArtProps) => ReactNode> = {
  'spider-man': Spider, goku: Goku, naruto: Naruto, batman: Batman, deadpool: Deadpool,
  pikachu: Pikachu, luffy: Luffy, 'darth-vader': Vader, 'iron-man': IronMan, sonic: Sonic,
  gojo: Gojo, cloud: Original,
};

function IntenseEyes({ color = '#72bbbc' }: { color?: string }) {
  return <g className="hero-avatar__eyes"><path d="m85 116 28 7-3 15-20-3Zm59 7 29-7-5 19-21 3Z" fill="#fff6e6" strokeWidth="2" /><path d="M102 125v7m54-7v7" stroke={color} strokeWidth="6" /><path d="m85 109 28 11m32 0 28-11" fill="none" strokeWidth="4" /></g>;
}

/** Forms are alternate designs, not filters over the base costume. */
function AdvancedForm({ kit }: ArtProps) {
  const form = heroSkin(kit.skin)!.form;
  switch (form) {
    case 'symbiote': return <>
      <Body primary="#30313e" secondary="#232632" hands="#30313e"><path d="m129 182-8 9 3 15-20-14-15-2m38 11-26 7-11 13m42-14 20-17 17-1m-36 12 26 5 11 13" fill="none" stroke="#e8e5e0" strokeWidth="5" /><path d="m129 183 10 14-8 22-10-22Z" fill="#e8e5e0" stroke="none" /></Body>
      <g className="hero-avatar__head"><path d="M63 109c0-43 25-60 66-60s69 20 69 62c0 48-25 74-69 74s-66-30-66-76Z" fill="#30313e" /><path d="M72 90q14-27 38-28" stroke="#616476" strokeWidth="6" fill="none" /><g className="hero-avatar__eyes" fill="#f1eede"><path d="m75 94 15 14 34 16-24 14-18-3Z" /><path d="m185 93-18 14-32 17 23 14 18-5Z" /></g><path d="M89 143q40 10 81-5-7 40-41 37-30-1-40-32Z" fill="#181b25" /><path d="m94 148 8 10 6-7 9 10 8-8 9 8 8-9 9 5 10-11" fill="#f4efdf" stroke="none" /><path className="form-tongue" d="M135 167c13 1 22 31 42 27 10-1 17-11 12-21 12 12 4 30-11 31-27 4-35-23-49-27Z" fill="#dc7a94" stroke="#542f4e" strokeWidth="2" /></g>
    </>;
    case 'super-saiyan': return <><Body primary="#df9044" secondary="#38506e"><path d="m101 170-11 35 37 12 42-16-14-33-27 25Z" fill="#354859" /><path d="m87 222 86 0" stroke="#3c5472" strokeWidth="8" /><path d="m132 225 15 29 7-19" fill="#3c5472" /></Body><Face smile={false}><IntenseEyes /><path d="M123 155h17" fill="none" strokeWidth="3" /><path d="M63 113 42 78l24 5L54 38l32 17L89 10l30 37 24-43 12 42 42-28-7 43 34-7-29 47-18 16-3-28-25 19-8-42-27 40-10-18-17 28-3-27Z" fill="#f4d066" /><path d="m66 52 22 29m17-48 14 31m31-40-3 43m35-20-21 32" stroke="#ffeb9d" strokeWidth="5" fill="none" /></Face></>;
    case 'kcm': return <><Cape color="#ffdb86" /><Body primary="#ffe39b" secondary="#e5a84d" hands="#ffe4a0"><path d="M113 167v60l-17 17m48-77v60l17 17" stroke="#3d3238" strokeWidth="5" fill="none" /><circle cx="130" cy="219" r="14" fill="#443639" /><circle cx="130" cy="219" r="9" fill="none" stroke="#ffd67e" strokeWidth="2" /><path d="M96 187q6-8 11 0t-7 9m44-9q6-8 11 0t-7 9m-33-18q4-7 8 0t-5 7m12-7q4-7 8 0t-5 7" fill="#453438" strokeWidth="1" /></Body><Face color="#ffe8af" smile={false}><IntenseEyes color="#df9f42" /><path d="M122 155h16m-61-21 15 4m-15 3 15 4m-13 5 12 2m77-18 14-4m-14 11 14-4m-14 11 14-4" fill="none" strokeWidth="3" /><path d="m62 95-7-31 20 4-1-25 23 15 12-35 21 22 20-29 10 32 25-12v27l19-6-11 40-30-11-29 11-31-12Z" fill="#ffe8aa" /><path d="M67 88q61-20 128 0v21q-62-15-128 0Z" fill="#ebb653" /><path d="M112 86h40v20h-40Z" fill="#ffdb89" /><path d="M137 88q-22-3-18 9 3 9 13 3 7-6-1-6m7-7 6-5" fill="none" strokeWidth="2" /></Face></>;
    case 'armored-knight': return <><Cape color="#303a42" bat /><Body primary="#718183" secondary="#424d55" hands="#536169"><path d="m99 173 31 13 28-13 14 28-20 18h-45l-22-18Z" fill="#929d97" /><path d="m108 192 10 5 9-5 4 5 5-5 8 5 11-5-7 13-11-3-6 7-6-7-11 3Z" fill="#35424a" /><path d="M84 228h93" stroke="#475255" strokeWidth="9" /><path d="m89 235 15 10m52 0 15-10" stroke="#9ea6a0" strokeWidth="5" /></Body><g className="hero-avatar__head"><path d="m65 105 9-72 29 28h52l31-28 11 75-4 46-22 28H91l-24-28Z" fill="#637477" /><path d="m85 68 21 13h45l28-13 3 49-18 35H97l-18-34Z" fill="#889696" /><path d="M129 76v35l-12 32h25l-13-32" fill="#5a6b70" /><g className="hero-avatar__eyes" stroke="#b5fff1" strokeWidth="6"><path d="m89 119 25 4m29 0 25-4" /></g><path d="m102 149 4 22h49l6-22Z" fill="#58666c" /><path d="M117 159h27m-25 7h23" stroke="#b1b9ad" strokeWidth="2" /></g></>;
    case 'weapon-xi': return <><Body primary="#d6b4a2" secondary="#51434d" hands="#d6b4a2"><path d="M130 178v59m-24-48h48m-49 12h49m-46 14h42m-31 13h19" stroke="#6f5760" strokeWidth="2" /><g fill="#c4a091" stroke="#795e65" strokeWidth="1.5"><circle cx="105" cy="189" r="3" /><circle cx="154" cy="189" r="3" /><circle cx="107" cy="202" r="3" /><circle cx="153" cy="202" r="3" /></g><path d="M87 235h85" stroke="#473b45" strokeWidth="8" /></Body><Face color="#dec0af" smile={false}><path d="M81 111q19-12 35 5m30 0q16-17 31-5" stroke="#b37e80" strokeWidth="8" fill="none" /><IntenseEyes color="#bc6d72" /><path d="M111 154h39m-31-4v8m9-8v8m9-8v8m-62-51 9-17m89 61-8-13" fill="none" stroke="#8c6c72" strokeWidth="2" /><path d="M88 73q23-16 43-11" stroke="#efd7c2" strokeWidth="5" fill="none" /></Face></>;
    case 'overcharge': return <><Pikachu kit={kit} /><g className="hero-avatar__eyes"><path d="m90 111 21 6m38 0 22-7" stroke="#6c5732" strokeWidth="4" fill="none" /></g></>;
    case 'gear-five': return <><Body primary={SKIN} secondary="#f0ede4" boots="#c4a179" legs={SKIN}><path d="M84 224h92l-7 23h-28l-10-9-11 9H92Z" fill="#f8f3e8" /><path d="M102 170 91 222l27 6 5-57m14 0 6 57 28-5-14-53" fill="#faf4e7" /><path d="M84 226h90" stroke="#b4a0ca" strokeWidth="9" /><path d="m162 226 24 17-20 8Z" fill="#b4a0ca" /><path d="m84 244 37 2m19 0 34-2" stroke="#e8e4dc" strokeWidth="5" /></Body><Face smile={false}><Eyes /><path d="M103 144q28 8 55 0-2 25-27 24-25 0-28-24Z" fill="#fff8e9" /><path d="M109 153q23 4 43-1" strokeWidth="1.5" /><path d="M65 116q-19-18-6-37-20-22 6-35-3-30 29-22 23-27 43-8 34-24 45 4 32-7 32 21 24 12 11 35 14 20-9 36l-12-30-20 17-17-19-15 13-18-21-19 18-13-10Z" fill="#fff6e6" stroke="#ada5b4" /><path d="M85 67q-19-23 1-26 15-1 7 12m38-13q-7-24 11-22m28 39q-1-24 14-17 13 6 1 14M99 100q-17-12-19 5m72-7q12-18 24-4" fill="none" stroke="#c5bec9" strokeWidth="2.5" /></Face></>;
    case 'sith-lord': return <><Vader kit={kit} /><path d="m147 56-10 34 9 19-9 17m-39-40 11 22-7 19" fill="none" stroke="#e77983" strokeWidth="2" /><path d="M120 208h7m7 0h7" stroke="#f07f84" strokeWidth="4" /></>;
    case 'nanotech': return <><IronMan kit={kit} /><g fill="#536472" stroke="#c0edf1" strokeWidth="1.5"><path d="m72 176-20 20 18 9 19-14m85-12 20 9 10 17-19-4Z" /><path d="m107 225-9 13h22l10-10 9 10h24l-12-13Z" /></g></>;
    case 'shadow': return <><Sonic kit={kit} /><g fill="#d66471" stroke="none"><path d="M119 52q14-6 27 0l-5 24-12 17-9-17Z" /><path d="m62 79 21-15-3 17-13 9m110-7-5-19 16 11 5 15M91 253h12v12H91m65-12h12v12h-12Z" /></g><g className="hero-avatar__eyes" stroke="#cb6674" strokeWidth="5"><path d="M111 116v12m40-12v12" /></g></>;
    case 'hollow-purple': return <><Body primary="#37364e" secondary="#e8e5df" boots="#353649"><path d="m102 170 9 21h40l10-21" fill="#48445c" /><path d="M130 193v46" stroke="#77708d" strokeWidth="2" /></Body><Face><g className="hero-avatar__eyes"><path d="m84 116 30 4-6 14-19-2m57-12 29-4-5 16-20 2" fill="#fff9ed" strokeWidth="2" /><ellipse cx="103" cy="124" rx="5" ry="8" fill="#77d1e4" stroke="#538fae" strokeWidth="1.5" /><ellipse cx="156" cy="124" rx="5" ry="8" fill="#77d1e4" stroke="#538fae" strokeWidth="1.5" /><path d="m101 122 2 3m51-3 2 3" stroke="white" strokeWidth="2" /><path d="m85 108 29 5m32 0 26-6" stroke="#bab5cb" strokeWidth="3" fill="none" /></g><path d="m62 106-7-37 17 1-2-24 23 10 13-34 19 22 26-29 5 29 27-11-1 24 23-7-13 42-27 1-17 15-14-21-22 20-16-11-18 16Z" fill="#eeedf0" /><path d="m85 59 10 17m22-30 9 26m28-35-6 34m30-17-11 20" stroke="#c5bfd7" strokeWidth="3" fill="none" /></Face></>;
  }
}

export function Equipment({ kit }: ArtProps) {
  return <>
    {kit.weapon === 'mitten' && heroById(kit.body).category === 'originals' && <g className="hero-avatar__weapon"><path d="M189 210q-18-7-13-20 2-8 10-5-7-28 7-26 10-8 17 1 12 0 14 11 11 23-8 39Z" fill="#efbc73" /><path d="M189 208h25" stroke="#b98450" strokeWidth="6" /></g>}
    {kit.accessory === 'visor' && heroById(kit.body).category === 'originals' && <g className="hero-avatar__accessory"><path d="M78 113q52-12 103 0v20q-52 13-103 0Z" fill="#58617d" /><path d="m97 117-6 13m25-16-7 19" stroke="#aac5dc" strokeWidth="5" /></g>}
    {kit.weapon && kit.weapon !== 'mitten' && <g className="hero-avatar__weapon"><g transform="translate(177 122) scale(.52)"><GearDrawing id={kit.weapon} /></g></g>}
    {kit.finisher === 'supernova' && heroById(kit.body).category === 'originals' && <path d="m166 218 4 9 10 1-8 7 2 10-8-5-9 5 2-10-7-7 10-1Z" fill="#efb3cc" stroke="#79536d" strokeWidth="2" />}
  </>;
}

export function Rig({ kit }: ArtProps) {
  const Art = CHARACTER_ART[heroById(kit.body).visual.rig] ?? Original;
  return <g stroke={INK} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">{heroSkin(kit.skin) ? <AdvancedForm kit={kit} /> : <Art kit={kit} />}<Equipment kit={kit} /></g>;
}

