// Each set is a background, two inks, and a highlight for a small geometric print.
const palettes = [
  ["#182944", "#87DBDA", "#447EC4", "#E5F6CB"],
  ["#37304F", "#F3B8DE", "#9A83D6", "#FFF1CD"],
  ["#192F2F", "#ADCF94", "#4B9383", "#F3E2A9"],
  ["#412E46", "#F5B29F", "#B96996", "#FEE0AF"],
  ["#1F3556", "#9DB7F6", "#6365C4", "#D9F1F5"],
  ["#3F3240", "#E7C38F", "#C08172", "#FFF0CE"],
  ["#2E2949", "#C6AFED", "#896AC6", "#F2BDCF"],
  ["#153642", "#86C7C2", "#4D91A4", "#E2F0C4"],
];

function seedFor(code) {
  let hash = 2166136261;
  for (const c of String(code ?? "")
    .trim()
    .toUpperCase()) {
    hash = Math.imul(hash ^ c.codePointAt(0), 16777619);
  }
  return hash >>> 0;
}

function randomFrom(seed) {
  let value = seed || 1;
  return (limit) => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return Math.floor(((value >>> 0) / 4294967296) * limit);
  };
}

function ribbons([background, ink, shade, light], choose) {
  const bend = 32 + choose(20);
  const sweep = `M-25 88 C24 87 15 ${bend} 50 ${bend} S83 3 119 -10`;
  return `<path d="${sweep}" fill="none" stroke="${shade}" stroke-width="46"/>
    <path d="${sweep}" fill="none" stroke="${ink}" stroke-width="30"/>
    <path d="${sweep}" fill="none" stroke="${background}" stroke-width="13"/>
    <path d="${sweep}" fill="none" stroke="${light}" stroke-width="4"/>`;
}

function shell([background, ink, shade, light], choose) {
  const cx = 16 + choose(17),
    cy = 94 - choose(12);
  const wedge = 55 + choose(13);
  return `<circle cx="${cx}" cy="${cy}" r="75" fill="${shade}"/>
    <circle cx="${cx}" cy="${cy}" r="56" fill="${ink}"/>
    <circle cx="${cx}" cy="${cy}" r="39" fill="${background}"/>
    <circle cx="${cx}" cy="${cy}" r="32" fill="${light}"/>
    <circle cx="${cx}" cy="${cy}" r="24" fill="${shade}"/>
    <path d="M${cx} ${cy} L${wedge} -18 L-16 -18 Z" fill="${background}"/>`;
}

function folds([background, ink, shade, light], choose) {
  const axis = 37 + choose(25);
  return `<path d="M-12 70 L${axis} 11 L112 43 L50 102Z" fill="${shade}"/>
    <path d="M-12 70 L${axis} 11 L67 53 L22 91Z" fill="${ink}"/>
    <path d="M${axis} 11 L112 43 L67 53Z" fill="${light}"/>
    <path d="M22 91 L67 53 L50 102Z" fill="${background}"/>
    <path d="M16 63 L${axis + 1} 29 M21 68 L${axis + 5} 34" stroke="${shade}" stroke-width="2" fill="none"/>`;
}

function petals([background, ink, shade, light], choose) {
  const tilt = 22 + choose(18);
  return `<g transform="rotate(-${tilt} 50 50)">
    <path d="M46 97 C-4 84 0 38 39 11 C56 39 67 70 46 97Z" fill="${shade}"/>
    <path d="M46 97 C24 66 37 25 76 9 C84 47 77 79 46 97Z" fill="${ink}"/>
    <path d="M46 97 C31 79 40 52 75 28 C66 56 51 77 46 97Z" fill="${light}"/>
    <path d="M46 97 C47 71 73 49 104 51 C91 79 72 92 46 97Z" fill="${shade}"/>
    <path d="M46 97 Q52 77 81 63" stroke="${background}" stroke-width="3" fill="none"/></g>`;
}

function steps([background, ink, shade, light], choose) {
  const rise = 15 + choose(7);
  const step = `M-20 79H11V${79 - rise}H32V${79 - 2 * rise}H53V${79 - 3 * rise}H74V${79 - 4 * rise}H120`;
  return `<g fill="none" stroke-linejoin="round" stroke-linecap="round">
    <path d="${step}" transform="translate(4 17)" stroke="${shade}" stroke-width="21"/>
    <path d="${step}" stroke="${ink}" stroke-width="17"/>
    <path d="${step}" transform="translate(-6 -11)" stroke="${light}" stroke-width="4"/></g>`;
}

const motifs = [ribbons, shell, folds, petals, steps];

/** Pure, local avatar artwork. Only generated numbers and fixed palette values reach the SVG. */
export function avatarSource(personCode) {
  const choose = randomFrom(seedFor(personCode));
  const colors = palettes[choose(palettes.length)];
  const motif = motifs[choose(motifs.length)];
  const rotation = choose(8) * 45 + choose(11) - 5;
  const mirror = choose(2) ? -1 : 1;
  const x = 47 + choose(7),
    y = 47 + choose(7);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="${colors[0]}"/>
    <g transform="translate(${x} ${y}) rotate(${rotation}) scale(${mirror} 1) translate(-50 -50)">${motif(colors, choose)}</g></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
