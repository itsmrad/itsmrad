// Builds every SVG in assets/ from build/content.mjs, in GitHub's light and
// dark palettes: `node build/build.mjs` (Node 22+, no dependencies).
//
// GitHub shows these through <img>, so they cannot load fonts or scripts:
// all text is converted to outlines (glyphs defined once, then reused), and
// motion is plain CSS inside each file, switched off for reduced motion.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { codenaya, sheet, stack, titleBlock, xflow } from "./content.mjs";
import { glyph, layout, loadFont } from "./font.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const font = (file) => loadFont(join(root, "build/fonts", file));
const FONTS = {
  serif: font("InstrumentSerif-Regular.ttf"),
  sans: font("Geist-Regular.ttf"),
  medium: font("Geist-Medium.ttf"),
  mono: font("GeistMono-Regular.ttf"),
  hand: font("caveat.woff2"),
};

// GitHub's own canvas and text colours, plus the site's one drafting accent.
const THEMES = {
  light: {
    bg: "#ffffff", ink: "#1f2328", muted: "#59636e", faint: "#818b98", rule: "#d1d9e0",
    soft: "#e8ecf0", hatch: "#d5dbe1", outline: "#8c959f", accent: "#cf300c", onAccent: "#ffffff",
  },
  dark: {
    bg: "#0d1117", ink: "#f0f6fc", muted: "#9198a1", faint: "#6e7681", rule: "#3d444d",
    soft: "#21262d", hatch: "#2d333b", outline: "#6e7681", accent: "#fe773d", onAccent: "#0d1117",
  },
};

const W = 880;
const n = (v, d = 2) => {
  const s = String(Math.round(v * 10 ** d) / 10 ** d);
  return s.replace(/^(-?)0\./, "$1.");
};

class Doc {
  constructor(theme, width, height) {
    Object.assign(this, { t: THEMES[theme], width, height, defs: new Map(), ids: new Map(), extra: [], body: [], css: [] });
  }
  add(...parts) {
    this.body.push(...parts);
    return this;
  }
  /** Text as reused glyph outlines. Returns the markup and its width. */
  text(str, { f = "mono", size = 12, x = 0, y = 0, anchor = "start", cls = "i", spacing = 0, upper = false, attrs = "" }) {
    const face = FONTS[f];
    const s = upper ? str.toUpperCase() : str;
    const { glyphs, width } = layout(face, s, { size, spacing });
    const left = x - (anchor === "middle" ? width / 2 : anchor === "end" ? width : 0);
    const uses = [];
    for (const g of glyphs) {
      const key = `${f}${size}-${g.gid}`;
      if (!this.ids.has(key)) this.ids.set(key, this.ids.size.toString(36));
      const id = `g${this.ids.get(key)}`;
      if (!this.defs.has(id)) this.defs.set(id, glyph(face, g.gid, size));
      if (this.defs.get(id)) uses.push(`<use href="#${id}"${g.x ? ` x="${n(g.x, 1)}"` : ""}/>`);
    }
    return { svg: `<g class="${cls}" transform="translate(${n(left)} ${n(y)})"${attrs}>${uses.join("")}</g>`, width, left };
  }
  put(str, opts) {
    const r = this.text(str, opts);
    this.body.push(r.svg);
    return r;
  }
  toString() {
    const t = this.t;
    const defs = [...this.defs].filter(([, d]) => d).map(([id, d]) => `<path id="${id}" d="${d}"/>`).join("");
    const css = `
.i{fill:${t.ink}}.m{fill:${t.muted}}.f{fill:${t.faint}}.a{fill:${t.accent}}.b{fill:${t.bg}}.oa{fill:${t.onAccent}}
.r{stroke:${t.rule};fill:none}.s{stroke:${t.soft};fill:none}.o{stroke:${t.outline}}.sa{stroke:${t.accent};fill:none}.si{stroke:${t.ink};fill:none}.sf{stroke:${t.faint};fill:none}
${this.css.join("\n")}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.motion{display:none}}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}" fill="none">` +
      `<style>${css.replace(/\n/g, "")}</style><defs>${defs}${this.extra.join("")}</defs>${this.body.join("")}</svg>`;
  }
}

// --- Shared drafting marks --------------------------------------------------

const cross = (x, y, r = 5) => `<path class="sf" d="M${n(x - r)} ${n(y)}h${2 * r}M${n(x)} ${n(y - r)}v${2 * r}"/>`;
const hline = (y, x1 = 0, x2 = W, cls = "r") => `<path class="${cls}" d="M${n(x1)} ${n(y)}H${n(x2)}"/>`;
const vline = (x, y1, y2, cls = "r") => `<path class="${cls}" d="M${n(x)} ${n(y1)}V${n(y2)}"/>`;
const arrow = (x, y, angle, cls = "f") => `<path class="${cls}" transform="translate(${n(x)} ${n(y)}) rotate(${angle})" d="M0 0-7-2.6v5.2Z"/>`;
const hatch = (id, colour, gap = 8, paper) =>
  `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse">${paper ? `<rect width="${gap}" height="${gap}" fill="${paper}"/>` : ""}<path d="M-1 1l2-2M0 ${gap}l${gap}-${gap}M${gap - 1} ${gap + 1}l2-2" stroke="${colour}" stroke-width="1"/></pattern>`;

/** A dimension line with end ticks, arrowheads and a centred label in a gap. */
function dimension(doc, x1, x2, y, label, { size = 11, cls = "f" } = {}) {
  const t = doc.text(label, { size, x: (x1 + x2) / 2, y: y + size * 0.36, anchor: "middle", cls });
  const gap = t.width / 2 + 8;
  const mid = (x1 + x2) / 2;
  doc.add(
    `<path class="sf" d="M${n(x1)} ${n(y)}H${n(mid - gap)}M${n(mid + gap)} ${n(y)}H${n(x2)}M${n(x1)} ${n(y - 6)}v12M${n(x2)} ${n(y - 6)}v12"/>`,
    arrow(x1, y, 180), arrow(x2, y, 0), t.svg,
  );
}

/** A loose pen stroke under a word: two slightly different passes, like ink. */
const underline = (x1, x2, y) => {
  const w = x2 - x1;
  return `<path class="sa" stroke-width="2" stroke-linecap="round" d="M${n(x1)} ${n(y + 1)}C${n(x1 + w * 0.3)} ${n(y - 1.6)} ${n(x1 + w * 0.65)} ${n(y + 2.2)} ${n(x2)} ${n(y - 0.4)}"/>`;
};

// Line glyphs on a 24-unit grid (the site's set, plus the stack's extras).
const GLYPHS = {
  rust: `<g class="spin"><circle cx="12" cy="12" r="7"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></g><path d="M10 15.5v-7h2.6a1.9 1.9 0 0 1 0 3.8H10m2.6 0 1.9 3.2"/>`,
  ts: `<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M6.5 10h5M9 10v7.5M18 10.8c-.4-.7-2.8-.9-2.8.6 0 1.7 3 1 3 3 0 1.5-2.6 1.6-3.3.5"/>`,
  js: `<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M10.5 10v5.6a1.6 1.6 0 0 1-3.1.5M18 10.8c-.4-.7-2.8-.9-2.8.6 0 1.7 3 1 3 3 0 1.5-2.6 1.6-3.3.5"/>`,
  term: `<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="M6.5 10l3 2.2-3 2.2M11.5 15.5h5"/>`,
  git: `<circle cx="7" cy="5.5" r="2"/><circle cx="7" cy="18.5" r="2"/><circle cx="17" cy="8" r="2"/><path d="M7 7.5v9M17 10c0 4.5-10 2.5-10 6.5"/>`,
  docker: `<path d="M2.5 13h17.3c.4-1 1.5-1.6 2.7-1.4-.5 4.4-4.4 7.9-10 7.9-5.3 0-8.6-2.8-10-6.5ZM5.5 13v-2.7h2.8V13M8.3 13v-2.7h2.8V13M11.1 13v-2.7h2.8V13M8.3 10.3V7.6h2.8v2.7"/>`,
  db: `<ellipse cx="12" cy="5.8" rx="7" ry="2.6"/><path d="M5 5.8v12.4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V5.8M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6"/>`,
  ai: `<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3M9 15l1.5-6 1.5 6M9.4 13.3h2.2M14.5 9v6"/>`,
  react: `<circle cx="12" cy="12" r="1.3"/><ellipse cx="12" cy="12" rx="10" ry="3.8"/><ellipse cx="12" cy="12" rx="10" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="3.8" transform="rotate(-60 12 12)"/>`,
  python: `<path d="M12 3c-4 0-4.5 1.6-4.5 3v2.5H12v1H6C4 9.5 3 11 3 13.5S4 17.5 6 17.5h1.5V15c0-1.6 1.2-3 3-3h3c1.4 0 2.5-1.1 2.5-2.5V6c0-1.6-1.3-3-4-3Z"/><path d="M12 21c4 0 4.5-1.6 4.5-3v-2.5H12v-1h6c2 0 3-1.5 3-4S20 6.5 18 6.5h-1.5"/><circle cx="9.8" cy="5.6" r=".5"/><circle cx="14.2" cy="18.4" r=".5"/>`,
  next: `<circle cx="12" cy="12" r="9"/><path d="M9 16V8l7.5 10.5M15 8v5"/>`,
  node: `<path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5Z"/><path d="M9.3 16v-6.4M9.3 11.6c.4-1.3 1.4-2 2.7-2 1.6 0 2.7 1 2.7 2.8V16"/>`,
  fastapi: `<circle cx="12" cy="12" r="9"/><path d="M13 5.5 8.5 13H12l-1 5.5L15.5 11H12Z"/>`,
  graph: `<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M8.2 6h7.6M7.1 7.9l3.8 8.2M16.9 7.9l-3.8 8.2"/><path d="M19.6 7.6c2 2.6 1.4 6-1 7.4" stroke-dasharray="1.6 1.8"/>`,
};

const glyphAt = (name, x, y, size, cls = "sf", width = 1.15) =>
  `<g class="${cls}" stroke-width="${n((width * 24) / size)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${n(x)} ${n(y)}) scale(${n(size / 24, 3)})">${GLYPHS[name]}</g>`;

// --- 1. Hero ---------------------------------------------------------------

// The site's monogram: pixel strokes on a 30° lattice, extruded.
const BLOCKS = [
  [[1, 0], [2, 0], [2, 1], [1, 1]],
  [[0, 1], [1, 1], [1, 2], [2, 2], [2, 1], [3, 1], [3, 5], [2, 5], [2, 3], [1, 3], [1, 5], [0, 5]],
  [[4, 0], [6, 0], [6, 1], [5, 1], [5, 4], [6, 4], [6, 5], [4, 5]],
  [[6, 1], [7, 1], [7, 4], [6, 4]],
];

function monogram(doc, ox, oy, s) {
  const DX = 55.4256 * s, DY = 32 * s, DEPTH = 32 * s;
  const X = ([i, j]) => ox + (i + j - 1) * DX;
  const Y = ([i, j]) => oy + (j - i + 6) * DY;
  const faces = BLOCKS.map((b) => `M${b.map((p) => `${n(X(p))} ${n(Y(p))}`).join("L")}Z`);
  const walls = BLOCKS.flatMap((b) => b.map((from, k) => [from, b[(k + 1) % b.length]]))
    .filter(([a, b]) => b[0] < a[0] || b[1] < a[1])
    .sort(([a, b], [c, d]) => a[1] + b[1] - a[0] - b[0] - (c[1] + d[1] - c[0] - d[0]))
    .map(([a, b]) => `M${n(X(a))} ${n(Y(a))}V${n(Y(a) + DEPTH)}L${n(X(b))} ${n(Y(b) + DEPTH)}V${n(Y(b))}`);
  const guide = (p, rise, drop = 0) =>
    `M${n(X(p) - 30 * DX)} ${n(Y(p) + drop - rise * 30 * DY)}L${n(X(p) + 30 * DX)} ${n(Y(p) + drop + rise * 30 * DY)}`;
  doc.extra.push(hatch("ad", doc.t.hatch, 7, doc.t.bg));
  doc.add(
    `<g clip-path="url(#sheet)"><path class="r" stroke-dasharray="4 3" d="${guide([0, 5], -1, DEPTH)}${guide([0, 1], 1)}${guide([7, 1], 1)}"/></g>`,
    `<g class="o" stroke-linejoin="round">`,
    ...walls.map((d) => `<path class="b" d="${d}"/>`),
    ...faces.map((d) => `<path fill="url(#ad)" d="${d}"/>`),
    `</g>`,
    // The plotter pass: a short red dash running the outline of each face.
    `<g class="motion sa trace" stroke-width="1.6" stroke-linecap="round">`,
    // Two pens only (the A and the D), half a lap apart.
    `<path pathLength="100" d="${faces[1]}"/>`,
    `<path pathLength="100" style="animation-delay:-7s" d="${faces[2]}"/>`,
    `</g>`,
  );
  doc.css.push(
    `.trace path{stroke-dasharray:5 95;animation:trace 14s linear infinite}@keyframes trace{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}`,
  );
  // 30° note on the D's top corner.
  const v = { x: X([7, 1]), y: Y([7, 1]) };
  const R = 64;
  const end = { x: v.x + R * Math.cos(Math.PI / 6), y: v.y + R * Math.sin(Math.PI / 6) };
  doc.add(
    `<path class="sf" d="M${n(v.x)} ${n(v.y)}H${n(v.x + R + 10)}M${n(v.x + R)} ${n(v.y)}A${R} ${R} 0 0 1 ${n(end.x)} ${n(end.y)}"/>`,
    arrow(v.x + R, v.y, 90), arrow(end.x, end.y, 120),
  );
  doc.put("30°", { size: 11, x: v.x + (R + 16) * Math.cos(Math.PI / 12), y: v.y + (R + 16) * Math.sin(Math.PI / 12) + 4, anchor: "middle", cls: "f" });
  // Glyphs lying on the same plane: u along the lattice's i axis, v along j.
  const onPlane = (name, i, j, cells) => {
    const k = cells / 24;
    return `<g class="drift"><g class="sf" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" transform="matrix(${n(DX * k, 3)} ${n(-DY * k, 3)} ${n(DX * k, 3)} ${n(DY * k, 3)} ${n(X([i, j]))} ${n(Y([i, j]))})">${GLYPHS[name].replace(/<(path|rect|circle|ellipse)/g, '<$1 vector-effect="non-scaling-stroke"')}</g></g>`;
  };
  return { X, Y, DX, DY, onPlane };
}

function hero(theme) {
  const H = 352;
  const doc = new Doc(theme, W, H + 12);
  const top = 34, bottom = 318, split = 452;
  doc.extra.push(`<clipPath id="sheet"><rect x="${split}" y="${top}" width="${W - split}" height="${bottom - top}"/></clipPath>`);
  doc.extra.push(hatch("band", doc.t.soft, 6));
  dimension(doc, 0.5, W - 0.5, 12, "880");
  doc.add(hline(top + 0.5), hline(bottom + 0.5), vline(split + 0.5, top, bottom, "s"));
  doc.add(`<rect x="0" y="${bottom + 1}" width="${W}" height="${H - bottom - 1}" fill="url(#band)"/>`, hline(H - 0.5));
  doc.add(cross(split + 0.5, top + 0.5), cross(split + 0.5, bottom + 0.5));

  const m = monogram(doc, 482, 46, 0.66);
  doc.add(
    m.onPlane("rust", 3.6, -1.7, 1.15),
    m.onPlane("ai", 2.3, -0.95, 0.95),
    m.onPlane("term", 2.65, 6.25, 1.05),
  );
  doc.css.push(`.drift{animation:drift 7s ease-in-out infinite alternate}@keyframes drift{to{transform:translateY(-3px)}}`);

  // Left: the title column.
  doc.put(`${sheet.role} · ${sheet.place}`, { size: 11.5, x: 0, y: 92, upper: true, spacing: 0.06, cls: "m" });
  doc.put(sheet.name, { f: "serif", size: 88, x: -3, y: 174, cls: "i" });
  sheet.claim.forEach((line, k) => {
    const y = 222 + k * 31;
    const r = doc.put(line, { f: "sans", size: 22, x: 0, y, cls: "i" });
    for (const [row, word] of sheet.underline) {
      if (row !== k) continue;
      const before = layout(FONTS.sans, line.slice(0, line.indexOf(word)), { size: 22 }).width;
      const w = layout(FONTS.sans, word, { size: 22 }).width;
      doc.add(underline(r.left + before - 1, r.left + before + w + 1, y + 6));
    }
  });

  // The margin note, with its sketch arrow to the monogram.
  const note = { x: 300, y: 286 };
  sheet.note.forEach((line, k) => doc.put(line, { f: "hand", size: 19, x: note.x, y: note.y + k * 19, cls: "m" }));
  doc.add(
    `<path class="sf" stroke-width="1.2" stroke-linecap="round" d="M${note.x + 140} ${note.y - 9}c22-6 38-20 46-40"/>`,
    `<path class="sf" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" d="M${note.x + 180} ${note.y - 41}l6-9 3 10"/>`,
  );
  return doc;
}

// --- 2. Project plates -------------------------------------------------------

function plateHead(doc, p) {
  doc.add(hline(0.5));
  doc.put(`detail ${p.index}  ·  ${p.category}`, { size: 11.5, x: 0, y: 26, upper: true, spacing: 0.06, cls: "m" });
  const st = doc.text(p.status, { size: 11.5, x: W, y: 26, anchor: "end", upper: true, spacing: 0.06, cls: "m" });
  doc.add(st.svg, `<rect class="i blink" x="${n(st.left - 16)}" y="17.5" width="7" height="7"/>`);
  doc.css.push(`.blink{animation:blink 2.4s steps(1) infinite}@keyframes blink{50%{opacity:.25}}`);
  doc.add(hline(40.5, 0, W, "s"));
  doc.put(p.name, { f: "serif", size: 60, x: -2, y: 104, cls: "i" });
  doc.put(p.byline, { size: 11.5, x: W, y: 102, anchor: "end", upper: true, spacing: 0.06, cls: "f" });
}

function figures(doc, list, y0) {
  const cw = W / list.length;
  doc.add(hline(y0 + 0.5), hline(y0 + 108.5));
  list.forEach((fig, k) => {
    const x = k * cw;
    if (k) doc.add(vline(x + 0.5, y0, y0 + 108, "r"));
    if (fig.accent) doc.add(`<rect class="a" x="${n(x + (k ? 1 : 0))}" y="${y0 - 0.5}" width="${n(cw - (k ? 1 : 0))}" height="2.5"/>`);
    const pad = k ? 16 : 0;
    doc.put(fig.value, { f: "serif", size: 44, x: x + pad, y: y0 + 56, cls: fig.accent ? "a" : "i" });
    doc.put(fig.label, { size: 11, x: x + pad, y: y0 + 80, upper: true, spacing: 0.05, cls: "m" });
    if (fig.note) doc.put(fig.note, { size: 11, x: x + pad, y: y0 + 97, cls: "f" });
  });
}

/** Keyframes that show an element only inside the given [start, end) steps of a cycle. */
function windows(name, steps, total) {
  const pct = (s) => n((s / total) * 100, 2);
  const frames = [`0%{opacity:0}`];
  for (const [a, b] of steps) frames.push(`${pct(a)}%{opacity:0}`, `${pct(a + 0.08)}%{opacity:1}`, `${pct(b - 0.08)}%{opacity:1}`, `${pct(b)}%{opacity:0}`);
  return `@keyframes ${name}{${frames.join("")}100%{opacity:0}}`;
}

function codenayaPlate(theme) {
  const H = 392;
  const doc = new Doc(theme, W, H);
  const p = codenaya;
  plateHead(doc, p);

  // The agent's loop: five stations, a gate, and the way back.
  const y = 176, h = 58, w = 148, gap = (W - 5 * w) / 4;
  const xs = p.pipeline.map((_, k) => k * (w + gap));
  const SEQ = [[[0, 1]], [[1, 2], [4, 5]], [[2, 3], [5, 6]], [[6, 7]], [[7, 8.6]]];
  const TOTAL = 10;
  p.pipeline.forEach((node, k) => {
    const x = xs[k] + 0.5;
    doc.add(`<rect class="r" x="${n(x)}" y="${y + 0.5}" width="${w - 1}" height="${h}" rx="3"/>`);
    if (k === 2) doc.add(`<rect class="r" x="${n(x + 4)}" y="${y + 4.5}" width="${w - 9}" height="${h - 8}" rx="1.5"/>`);
    doc.add(`<rect class="si motion step${k}" stroke-width="1.5" x="${n(x)}" y="${y + 0.5}" width="${w - 1}" height="${h}" rx="3"/>`);
    doc.css.push(`.step${k}{opacity:0;animation:step${k} ${TOTAL}s linear infinite}${windows(`step${k}`, SEQ[k], TOTAL)}`);
    doc.put(node.label, { size: 12, x: x + w / 2, y: y + 26, anchor: "middle", upper: true, spacing: 0.05, cls: "i" });
    doc.put(node.sub, { size: 11, x: x + w / 2, y: y + 44, anchor: "middle", cls: "f" });
    if (k < 4) {
      const ax = xs[k] + w + 4, bx = xs[k + 1] - 4;
      doc.add(`<path class="sf" d="M${n(ax)} ${y + h / 2 + 0.5}H${n(bx)}"/>`, arrow(bx, y + h / 2 + 0.5, 0));
    }
  });
  // The finish gate sends unchecked work back to the agent once.
  const c2 = xs[1] + w / 2, c3 = xs[2] + w / 2, ly = y - 26;
  const loop = `M${n(c3)} ${y - 4}V${ly + 8}Q${n(c3)} ${ly} ${n(c3 - 8)} ${ly}H${n(c2 + 8)}Q${n(c2)} ${ly} ${n(c2)} ${ly + 8}V${y - 5}`;
  doc.add(`<path class="sf" stroke-dasharray="3 3" d="${loop}"/>`, arrow(c2, y - 4, 90));
  doc.add(`<path class="si motion loop" stroke-width="1.5" d="${loop}"/>`);
  doc.css.push(`.loop{opacity:0;animation:loopw ${TOTAL}s linear infinite}${windows("loopw", [[3, 4]], TOTAL)}`);
  doc.put(p.loop, { f: "hand", size: 18, x: (c2 + c3) / 2, y: ly - 7, anchor: "middle", cls: "m" });

  figures(doc, p.figures, 276);
  return doc;
}

function xflowPlate(theme) {
  const H = 392;
  const doc = new Doc(theme, W, H);
  const p = xflow;
  plateHead(doc, p);

  // Fig. A: from releasing the key to text at the cursor, drawn to scale (1 ms = 0.62 px).
  const base = 206;
  const bars = [6, 11, 18, 9, 24, 30, 16, 26, 12, 20, 34, 22, 14, 27, 10, 19, 8, 15, 6, 4];
  const bw = 4, bstep = 9;
  bars.forEach((hgt, k) => {
    const x = k * bstep;
    doc.add(`<rect class="i wave" style="animation-delay:-${n((k * 0.37) % 1.6)}s" x="${x}" y="${n(base - hgt / 2)}" width="${bw}" height="${hgt}" rx="2"/>`);
  });
  doc.css.push(`.wave{transform-box:fill-box;transform-origin:center;animation:talk 1.6s ease-in-out infinite alternate}@keyframes talk{from{transform:scaleY(.35)}to{transform:scaleY(1)}}`);
  const stop = bars.length * bstep + 8;
  const px = 0.62;
  const t50 = stop + 255 * px, t95 = stop + 378 * px;
  doc.add(vline(stop + 0.5, base - 44, base + 30, "sf"));
  doc.put("key up", { size: 11, x: stop, y: base + 46, anchor: "middle", upper: true, spacing: 0.05, cls: "f" });
  doc.put("hold a key, talk", { size: 11, x: 0, y: base + 46, upper: true, spacing: 0.05, cls: "f" });
  // p50 dimension in the accent; p95 continues it, dashed and faint.
  const dy = base - 30;
  doc.add(
    `<path class="sa" stroke-width="1.3" d="M${n(stop + 1)} ${dy}H${n(t50)}"/>`,
    arrow(stop + 1, dy, 180, "a"), arrow(t50, dy, 0, "a"),
    `<path class="sf" stroke-dasharray="2 3" d="M${n(t50 + 2)} ${dy}H${n(t95)}"/>`,
    vline(t95 + 0.5, dy - 6, dy + 6, "sf"),
    vline(t50 + 0.5, dy - 8, base + 6, "sa"),
  );
  doc.put(`${p.latency.p50} ms`, { f: "serif", size: 34, x: (stop + t50) / 2, y: dy - 12, anchor: "middle", cls: "a" });
  doc.put(`p95 ${p.latency.p95}`, { size: 11, x: t95, y: dy - 12, anchor: "middle", cls: "f" });
  doc.put("p50, stop to text", { size: 11, x: (stop + t50) / 2, y: dy + 18, anchor: "middle", upper: true, spacing: 0.05, cls: "m" });
  // The text arriving at the cursor, on the waveform's line.
  const typed = doc.put("text at the cursor", { size: 13, x: t50 + 10, y: base + 4.5, cls: "i" });
  doc.add(`<rect class="a caret" x="${n(typed.left + typed.width + 3)}" y="${base - 8}" width="2" height="16"/>`);
  doc.add(`<path class="r" d="M${n(t50 + 6)} ${base + 12.5}H${n(typed.left + typed.width + 8)}"/>`);
  doc.put("pasted, clipboard restored", { size: 11, x: t50 + 10, y: base + 46, upper: true, spacing: 0.05, cls: "f" });
  doc.css.push(`.caret{animation:caret 1.1s steps(1) infinite}@keyframes caret{50%{opacity:0}}`);

  // Fig. B: memory, idle against peak, on a 0–25 MiB scale.
  const mx = 560, mw = W - mx - 56, scale = mw / p.memory.max;
  const rows = [
    { label: "idle", value: p.memory.idle, y: 168, accent: true },
    { label: "peak", value: p.memory.peak, y: 196 },
  ];
  doc.extra.push(hatch("bar", doc.t.outline, 5));
  for (const r of rows) {
    doc.put(r.label, { size: 11, x: mx - 12, y: r.y + 4, anchor: "end", upper: true, spacing: 0.05, cls: "m" });
    const len = Number(r.value) * scale;
    doc.add(r.accent
      ? `<rect class="a" x="${mx}" y="${r.y - 6}" width="${n(len)}" height="12"/>`
      : `<rect fill="url(#bar)" class="o" x="${mx + 0.5}" y="${r.y - 5.5}" width="${n(len - 1)}" height="11"/>`);
    doc.put(`${r.value} MiB`, { size: 12, x: mx + len + 8, y: r.y + 4.5, cls: r.accent ? "a" : "i" });
  }
  const axis = 222;
  doc.add(hline(axis + 0.5, mx, mx + mw, "sf"));
  for (let v = 0; v <= p.memory.max; v += p.memory.step) {
    const x = mx + v * scale;
    doc.add(vline(x + 0.5, axis, axis + 5, "sf"));
    doc.put(String(v), { size: 10, x: x + 0.5, y: axis + 17, anchor: "middle", cls: "f" });
  }
  doc.put("MEMORY · MiB", { size: 11, x: mx, y: 140, spacing: 0.05, cls: "m" });
  doc.put(p.conditions, { size: 10.5, x: W, y: 258, anchor: "end", cls: "f" });

  figures(doc, p.figures, 276);
  return doc;
}

// --- 3. Stack ----------------------------------------------------------------

function stackStrip(theme) {
  const cols = 6, cw = W / cols, ch = 84, top = 0;
  const H = top + ch * 2 + 1;
  const doc = new Doc(theme, W, H);
  doc.add(hline(top + 0.5), hline(top + ch + 0.5, 0, W, "s"), hline(H - 0.5));
  stack.forEach(([label, g], k) => {
    const col = k % cols, row = Math.floor(k / cols);
    const x = col * cw, y = top + row * ch;
    if (col) doc.add(vline(x + 0.5, y + (row ? 0 : 0), y + ch, "s"));
    doc.add(glyphAt(g, x + cw / 2 - 15, y + 14, 30, "si", 1.3));
    doc.put(label, { size: 11, x: x + cw / 2, y: y + 66, anchor: "middle", upper: true, spacing: 0.05, cls: "m" });
  });
  for (let c = 1; c < cols; c++) doc.add(cross(c * cw + 0.5, top + ch + 0.5, 4));
  doc.css.push(`.spin{transform-origin:12px 12px;animation:spin 24s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`);
  return doc;
}

// --- 4. Section heads, buttons, title block -----------------------------------

// Shown at natural size (never scaled to the column), so the title stays
// 26px on a phone too.
function sectionHead(theme, index, title) {
  const num = layout(FONTS.mono, index, { size: 11, spacing: 0.06 }).width;
  const w = Math.ceil(num + 10 + layout(FONTS.serif, title, { size: 26 }).width + 2);
  const doc = new Doc(theme, w, 46);
  doc.put(index, { size: 11, x: 0, y: 34, cls: "f", spacing: 0.06 });
  doc.put(title, { f: "serif", size: 26, x: num + 10, y: 34, cls: "i" });
  return doc;
}

const ICONS = {
  download: `<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/>`,
  calendar: `<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>`,
  mail: `<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>`,
  site: `<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c-3 3.2-3 13.8 0 17M12 3.5c3 3.2 3 13.8 0 17"/>`,
};

function button(theme, label, icon, primary) {
  const size = 15, h = 40, padX = 16, iconW = 18, gapI = 8;
  const w = Math.ceil(padX * 2 + iconW + gapI + layout(FONTS.medium, label, { size }).width);
  const doc = new Doc(theme, w, h);
  doc.add(primary
    ? `<rect class="a" width="${w}" height="${h}" rx="6"/>`
    : `<rect class="r" x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="5.5"/>`);
  doc.add(`<g class="${primary ? "" : "si"}" ${primary ? `stroke="${THEMES[theme].onAccent}"` : ""} stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" transform="translate(${padX} ${(h - iconW) / 2}) scale(.75)">${ICONS[icon]}</g>`);
  doc.put(label, { f: "medium", size, x: padX + iconW + gapI, y: h / 2 + 5.3, cls: primary ? "oa" : "i" });
  return doc;
}

function titleBlockStrip(theme) {
  const H = 112, signW = 230, rowH = 56;
  const doc = new Doc(theme, W, H);
  const cells = W - signW;
  const widths = [118, 210, 120, 64, 70, 68];
  doc.add(hline(0.5), hline(H - 0.5), hline(rowH + 0.5, 0, cells, "s"), vline(cells + 0.5, 0, H));
  let x = 0;
  titleBlock.forEach(([label, value], k) => {
    const w = widths[k];
    if (k) doc.add(vline(x + 0.5, 0, rowH, "s"));
    doc.put(label, { size: 10, x: x + (k ? 12 : 0), y: 20, upper: true, spacing: 0.06, cls: "f" });
    doc.put(value, { size: 13, x: x + (k ? 12 : 0), y: 42, cls: "i" });
    x += w;
  });
  // Second row: what the drawing is.
  doc.put("drawing no.", { size: 10, x: 0, y: rowH + 20, upper: true, spacing: 0.06, cls: "f" });
  doc.put(sheet.drawingNo, { size: 13, x: 0, y: rowH + 42, cls: "i" });
  doc.add(vline(widths[0] + 0.5, rowH, H, "s"));
  doc.put("title", { size: 10, x: widths[0] + 12, y: rowH + 20, upper: true, spacing: 0.06, cls: "f" });
  doc.put("github profile · general arrangement", { size: 13, x: widths[0] + 12, y: rowH + 42, cls: "i" });
  // Approved by: the signature from the site's footer, drawn on a loop.
  doc.put("approved by", { size: 10, x: cells + 14, y: 20, upper: true, spacing: 0.06, cls: "f" });
  const ink = readFileSync(join(root, "build/signature.txt"), "utf8").trim();
  doc.add(`<g transform="translate(${cells + 14} 26) scale(.56)"><path class="si sign" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" pathLength="1" transform="translate(-6 -14)" d="${ink}"/></g>`);
  doc.css.push(`.sign{stroke-dasharray:1;animation:sign 16s ease-in-out infinite}@keyframes sign{0%,72%{stroke-dashoffset:0}72.1%{stroke-dashoffset:1}90%,100%{stroke-dashoffset:0}}`);
  return doc;
}

// --- Write -------------------------------------------------------------------

const out = join(root, "assets");
mkdirSync(out, { recursive: true });
const sizes = [];
const emit = (name, make) => {
  for (const theme of ["light", "dark"]) {
    const svg = String(make(theme));
    const file = `${name}-${theme}.svg`;
    writeFileSync(join(out, file), svg);
    sizes.push([file, svg.length]);
  }
};
emit("hero", hero);
emit("codenaya", codenayaPlate);
emit("xflow", xflowPlate);
emit("stack", stackStrip);
emit("head-work", (t) => sectionHead(t, "01", "Selected work"));
emit("head-stack", (t) => sectionHead(t, "02", "Stack"));
emit("head-building", (t) => sectionHead(t, "03", "Currently building"));
emit("head-contact", (t) => sectionHead(t, "04", "Say hi"));
emit("button-resume", (t) => button(t, "Download resume", "download", true));
emit("button-call", (t) => button(t, "Book a call", "calendar", false));
emit("button-email", (t) => button(t, "Email", "mail", false));
emit("title-block", titleBlockStrip);
let total = 0;
for (const [file, size] of sizes) (total += size), console.log(`${(size / 1024).toFixed(1).padStart(6)} KB  assets/${file}`);
console.log(`${(total / 1024).toFixed(1).padStart(6)} KB  total`);
