// Text to SVG outlines, with no dependencies: reads TrueType (glyf) fonts and
// WOFF2 files (Brotli from node:zlib, the glyf transform decoded here), maps
// characters through cmap, applies GPOS pair kerning, and returns one path.
// Outlines are used because an SVG shown through <img> cannot load web fonts.
import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";

const tag = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

export function loadFont(file) {
  const bytes = readFileSync(file);
  const tables = tag(bytes, 0) === "wOF2" ? woff2Tables(bytes) : sfntTables(bytes);
  return parse(tables);
}

function sfntTables(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = {};
  for (let i = 0, n = v.getUint16(4); i < n; i++) {
    const r = 12 + 16 * i;
    out[tag(b, r)] = b.subarray(v.getUint32(r + 8), v.getUint32(r + 8) + v.getUint32(r + 12));
  }
  return out;
}

const KNOWN = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill"];

function woff2Tables(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const numTables = v.getUint16(12);
  let p = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = b[p++];
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error("bad UIntBase128");
  };
  const dir = [];
  for (let i = 0; i < numTables; i++) {
    const flags = b[p++];
    let name;
    if ((flags & 0x3f) === 63) (name = tag(b, p)), (p += 4);
    else name = KNOWN[flags & 0x3f];
    const version = flags >> 6;
    const origLength = base128();
    const transformed = name === "glyf" || name === "loca" ? version !== 3 : version !== 0;
    const length = transformed ? base128() : origLength;
    dir.push({ name, transformed, length });
  }
  const data = brotliDecompressSync(b.subarray(p, p + v.getUint32(20)));
  const out = {};
  let at = 0;
  for (const t of dir) {
    out[t.name] = data.subarray(at, at + t.length);
    if (t.transformed && t.name !== "glyf" && t.name !== "loca") throw new Error(`transformed ${t.name} not supported`);
    at += t.length;
  }
  out.glyf = { woff2: out.glyf };
  return out;
}

function parse(t) {
  const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
  const head = dv(t.head);
  const unitsPerEm = head.getUint16(18);
  const numGlyphs = dv(t.maxp).getUint16(4);
  const numH = dv(t.hhea).getUint16(34);
  const hmtx = dv(t.hmtx);
  const advance = (g) => hmtx.getUint16(4 * Math.min(g, numH - 1));
  const cmap = readCmap(t.cmap);
  const contours = t.glyf.woff2 ? woff2Glyphs(t.glyf.woff2, numGlyphs) : ttfGlyphs(t.glyf, t.loca, head.getInt16(50), numGlyphs);
  const kern = t.GPOS ? readKerning(t.GPOS) : () => 0;
  return { unitsPerEm, advance, cmap, contours, kern };
}

function readCmap(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const map = new Map();
  let best = null;
  for (let i = 0, n = v.getUint16(2); i < n; i++) {
    const r = 4 + 8 * i, platform = v.getUint16(r), enc = v.getUint16(r + 2), off = v.getUint32(r + 4);
    const format = v.getUint16(off);
    if ((platform === 3 && (enc === 1 || enc === 10)) || platform === 0) if (!best || format === 12) best = off;
  }
  const format = v.getUint16(best);
  if (format === 4) {
    const segX2 = v.getUint16(best + 6);
    const ends = best + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = v.getUint16(ends + 2 * s), start = v.getUint16(starts + 2 * s);
      const delta = v.getInt16(deltas + 2 * s), range = v.getUint16(ranges + 2 * s);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g;
        if (!range) g = (c + delta) & 0xffff;
        else {
          g = v.getUint16(ranges + 2 * s + range + 2 * (c - start));
          if (g) g = (g + delta) & 0xffff;
        }
        if (g) map.set(c, g);
      }
    }
  } else if (format === 12) {
    for (let i = 0, n = v.getUint32(best + 12); i < n; i++) {
      const r = best + 16 + 12 * i;
      for (let c = v.getUint32(r); c <= v.getUint32(r + 4); c++) map.set(c, v.getUint32(r + 8) + c - v.getUint32(r));
    }
  }
  return map;
}

// Composite records are identical in glyf and in the WOFF2 composite stream.
function readComposite(v, p) {
  const parts = [];
  let flags, instructions = false;
  do {
    flags = v.getUint16(p);
    const glyph = v.getUint16(p + 2);
    p += 4;
    let dx, dy;
    if (flags & 1) (dx = v.getInt16(p)), (dy = v.getInt16(p + 2)), (p += 4);
    else (dx = v.getInt8(p)), (dy = v.getInt8(p + 1)), (p += 2);
    let m = [1, 0, 0, 1];
    const f2 = (o) => v.getInt16(o) / 16384;
    if (flags & 8) (m = [f2(p), 0, 0, f2(p)]), (p += 2);
    else if (flags & 0x40) (m = [f2(p), 0, 0, f2(p + 2)]), (p += 4);
    else if (flags & 0x80) (m = [f2(p), f2(p + 2), f2(p + 4), f2(p + 6)]), (p += 8);
    if (flags & 0x100) instructions = true;
    parts.push({ glyph, m, dx, dy });
  } while (flags & 0x20);
  return { parts, end: p, instructions };
}

function resolve(raw) {
  const cache = new Map();
  const get = (g) => {
    if (cache.has(g)) return cache.get(g);
    const r = raw[g];
    let out = [];
    if (r && r.parts)
      for (const { glyph, m, dx, dy } of r.parts)
        for (const c of get(glyph)) out.push(c.map(([x, y, on]) => [m[0] * x + m[2] * y + dx, m[1] * x + m[3] * y + dy, on]));
    else if (r) out = r;
    cache.set(g, out);
    return out;
  };
  return get;
}

function ttfGlyphs(glyf, loca, longLoca, numGlyphs) {
  const v = new DataView(glyf.buffer, glyf.byteOffset, glyf.byteLength);
  const l = new DataView(loca.buffer, loca.byteOffset, loca.byteLength);
  const off = (g) => (longLoca ? l.getUint32(4 * g) : 2 * l.getUint16(2 * g));
  const raw = [];
  for (let g = 0; g < numGlyphs; g++) {
    const start = off(g);
    if (off(g + 1) === start) continue;
    const n = v.getInt16(start);
    if (n < 0) {
      raw[g] = { parts: readComposite(v, start + 10).parts };
      continue;
    }
    const ends = [];
    for (let i = 0; i < n; i++) ends.push(v.getUint16(start + 10 + 2 * i));
    const count = ends.at(-1) + 1;
    let p = start + 10 + 2 * n;
    p += 2 + v.getUint16(p);
    const flags = [];
    while (flags.length < count) {
      const f = glyf[p++];
      flags.push(f);
      if (f & 8) for (let r = glyf[p++]; r > 0; r--) flags.push(f);
    }
    const coord = (short, same) => {
      const out = [];
      let value = 0;
      for (const f of flags) {
        if (f & short) value += f & same ? glyf[p++] : -glyf[p++];
        else if (!(f & same)) (value += v.getInt16(p)), (p += 2);
        out.push(value);
      }
      return out;
    };
    const xs = coord(2, 16), ys = coord(4, 32);
    raw[g] = split(ends, xs, ys, flags.map((f) => f & 1));
  }
  return resolve(raw);
}

function split(ends, xs, ys, on) {
  const out = [];
  let s = 0;
  for (const e of ends) {
    const c = [];
    for (let i = s; i <= e; i++) c.push([xs[i], ys[i], on[i]]);
    out.push(c);
    s = e + 1;
  }
  return out;
}

function woff2Glyphs(b, numGlyphs) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const sizes = [];
  for (let i = 0; i < 7; i++) sizes.push(v.getUint32(8 + 4 * i));
  let o = 36;
  const streams = sizes.map((s) => ((o += s), o - s));
  let [nc, np, fl, gl, co] = streams;
  const u255 = (stream) => {
    const code = b[stream.p++];
    if (code === 253) return (stream.p += 2), v.getUint16(stream.p - 2);
    if (code === 255) return b[stream.p++] + 253;
    if (code === 254) return b[stream.p++] + 506;
    return code;
  };
  const points = { p: np }, glyph = { p: gl };
  const raw = [];
  for (let g = 0; g < numGlyphs; g++) {
    const n = v.getInt16(nc);
    nc += 2;
    if (n === 0) continue;
    if (n < 0) {
      const r = readComposite(v, co);
      co = r.end;
      raw[g] = { parts: r.parts };
      if (r.instructions) u255(glyph);
      continue;
    }
    const ends = [];
    let total = 0;
    for (let i = 0; i < n; i++) ends.push((total += u255(points)) - 1);
    const xs = [], ys = [], on = [];
    let x = 0, y = 0;
    for (let i = 0; i < total; i++) {
      const raw8 = b[fl++];
      const f = raw8 & 0x7f;
      const d = glyph.p;
      const sign = (flag, value) => (flag & 1 ? value : -value);
      let dx, dy, size;
      if (f < 10) (dx = 0), (dy = sign(f, ((f & 14) << 7) + b[d])), (size = 1);
      else if (f < 20) (dx = sign(f, (((f - 10) & 14) << 7) + b[d])), (dy = 0), (size = 1);
      else if (f < 84) {
        const b0 = f - 20, b1 = b[d];
        dx = sign(f, 1 + (b0 & 0x30) + (b1 >> 4));
        dy = sign(f >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f));
        size = 1;
      } else if (f < 120) {
        const b0 = f - 84;
        dx = sign(f, 1 + (Math.floor(b0 / 12) << 8) + b[d]);
        dy = sign(f >> 1, 1 + (((b0 % 12) >> 2) << 8) + b[d + 1]);
        size = 2;
      } else if (f < 124) {
        const b2 = b[d + 1];
        dx = sign(f, (b[d] << 4) + (b2 >> 4));
        dy = sign(f >> 1, ((b2 & 0x0f) << 8) + b[d + 2]);
        size = 3;
      } else (dx = sign(f, (b[d] << 8) + b[d + 1])), (dy = sign(f >> 1, (b[d + 2] << 8) + b[d + 3])), (size = 4);
      glyph.p += size;
      xs.push((x += dx));
      ys.push((y += dy));
      on.push(raw8 & 0x80 ? 0 : 1);
    }
    u255(glyph); // instruction length; the instructions themselves are not needed
    raw[g] = split(ends, xs, ys, on);
  }
  return resolve(raw);
}

// GPOS lookup type 2 (pair adjustment, formats 1 and 2), also behind type 9 extensions.
function readKerning(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const lookups = v.getUint16(8);
  const features = v.getUint16(6);
  const kernLookups = new Set();
  for (let i = 0, n = v.getUint16(features); i < n; i++) {
    const r = features + 2 + 6 * i;
    if (tag(b, r) !== "kern") continue;
    const f = features + v.getUint16(r + 4);
    for (let k = 0, m = v.getUint16(f + 2); k < m; k++) kernLookups.add(v.getUint16(f + 4 + 2 * k));
  }
  const coverage = (o) => {
    const map = new Map();
    if (v.getUint16(o) === 1) for (let i = 0, n = v.getUint16(o + 2); i < n; i++) map.set(v.getUint16(o + 4 + 2 * i), i);
    else
      for (let i = 0, n = v.getUint16(o + 2); i < n; i++) {
        const r = o + 4 + 6 * i;
        for (let g = v.getUint16(r); g <= v.getUint16(r + 2); g++) map.set(g, v.getUint16(r + 4) + g - v.getUint16(r));
      }
    return map;
  };
  const classDef = (o) => {
    const map = new Map();
    if (v.getUint16(o) === 1) {
      const first = v.getUint16(o + 2);
      for (let i = 0, n = v.getUint16(o + 4); i < n; i++) map.set(first + i, v.getUint16(o + 6 + 2 * i));
    } else
      for (let i = 0, n = v.getUint16(o + 2); i < n; i++) {
        const r = o + 4 + 6 * i;
        for (let g = v.getUint16(r); g <= v.getUint16(r + 2); g++) map.set(g, v.getUint16(r + 4));
      }
    return map;
  };
  const bits = (f) => [...Array(8)].reduce((s, _, i) => s + ((f >> i) & 1), 0);
  const xAdvance = (o, f) => {
    // XPlacement 1, YPlacement 2, XAdvance 4: read the XAdvance word if present.
    if (!(f & 4)) return 0;
    return v.getInt16(o + 2 * bits(f & 3));
  };
  const subtables = [];
  for (const index of [...kernLookups].sort((a, c) => a - c)) {
    const l = lookups + v.getUint16(lookups + 2 + 2 * index);
    let type = v.getUint16(l);
    for (let s = 0, n = v.getUint16(l + 4); s < n; s++) {
      let st = l + v.getUint16(l + 6 + 2 * s);
      let t = type;
      if (t === 9) (t = v.getUint16(st + 2)), (st += v.getUint32(st + 4));
      if (t !== 2) continue;
      const format = v.getUint16(st), cov = coverage(st + v.getUint16(st + 2));
      const f1 = v.getUint16(st + 4), f2 = v.getUint16(st + 6);
      const rec1 = 2 * bits(f1), rec2 = 2 * bits(f2);
      if (format === 1)
        subtables.push((a, c) => {
          if (!cov.has(a)) return null;
          const set = st + v.getUint16(st + 10 + 2 * cov.get(a));
          for (let i = 0, n = v.getUint16(set); i < n; i++) {
            const r = set + 2 + i * (2 + rec1 + rec2);
            if (v.getUint16(r) === c) return xAdvance(r + 2, f1);
          }
          return null;
        });
      else {
        const c1 = classDef(st + v.getUint16(st + 8)), c2 = classDef(st + v.getUint16(st + 10));
        const n2 = v.getUint16(st + 14);
        subtables.push((a, c) => {
          if (!cov.has(a)) return null;
          const r = st + 16 + ((c1.get(a) ?? 0) * n2 + (c2.get(c) ?? 0)) * (rec1 + rec2);
          const value = xAdvance(r, f1);
          return value || null;
        });
      }
    }
  }
  return (a, c) => {
    for (const s of subtables) {
      const value = s(a, c);
      if (value !== null) return value;
    }
    return 0;
  };
}

const r = (n, d) => {
  const s = (Math.round(n * 10 ** d) / 10 ** d).toString();
  return s.replace(/^(-?)0\./, "$1.");
};

/**
 * One path for a line of text. `x`, `y` place the baseline start (or centre /
 * end with `anchor`); `spacing` adds em-relative tracking; `skew` slants it.
 */
export function text(font, string, { size, x = 0, y = 0, anchor = "start", spacing = 0, digits = 1, kern = true } = {}) {
  const scale = size / font.unitsPerEm;
  const glyphs = [...string].map((ch) => font.cmap.get(ch.codePointAt(0)) ?? 0);
  const pens = [];
  let pen = 0;
  glyphs.forEach((g, i) => {
    pens.push(pen);
    pen += font.advance(g) + (kern && i < glyphs.length - 1 ? font.kern(g, glyphs[i + 1]) : 0) + spacing * font.unitsPerEm;
  });
  const width = (pen - spacing * font.unitsPerEm) * scale;
  const start = x - (anchor === "middle" ? width / 2 : anchor === "end" ? width : 0);
  let d = "";
  glyphs.forEach((g, i) => {
    for (const contour of font.contours(g)) d += outline(contour, (px) => start + (pens[i] + px) * scale, (py) => y - py * scale, digits);
  });
  return { d, width };
}

function outline(c, X, Y, digits) {
  const n = c.length;
  if (!n) return "";
  const pt = (i) => c[(i + n) % n];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 1];
  // Start on an on-curve point (or the midpoint of two off-curve points).
  let first = c.findIndex((p) => p[2]);
  let start;
  if (first < 0) (start = mid(c[0], c[1])), (first = 0);
  else start = pt(first);
  const f = (p) => `${r(X(p[0]), digits)} ${r(Y(p[1]), digits)}`;
  let d = `M${f(start)}`;
  let control = null;
  for (let k = 1; k <= n; k++) {
    const p = pt(first + k);
    if (p[2]) {
      d += control ? `Q${f(control)} ${f(p)}` : `L${f(p)}`;
      control = null;
    } else if (control) {
      const m = mid(control, p);
      d += `Q${f(control)} ${f(m)}`;
      control = p;
    } else control = p;
  }
  if (control) d += `Q${f(control)} ${f(start)}`;
  return d + "Z";
}

/** Glyph positions for a line of text at `size`: [{ gid, x }], and the width. */
export function layout(font, string, { size, spacing = 0, kern = true } = {}) {
  const scale = size / font.unitsPerEm;
  const glyphs = [...string].map((ch) => font.cmap.get(ch.codePointAt(0)) ?? 0);
  const out = [];
  let pen = 0;
  glyphs.forEach((gid, i) => {
    out.push({ gid, x: pen * scale });
    pen += font.advance(gid) + (kern && i < glyphs.length - 1 ? font.kern(gid, glyphs[i + 1]) : 0) + spacing * font.unitsPerEm;
  });
  return { glyphs: out, width: (pen - spacing * font.unitsPerEm) * scale };
}

/** One glyph's outline at `size`, baseline at y = 0; empty for blank glyphs. */
export function glyph(font, gid, size, digits = 1) {
  const scale = size / font.unitsPerEm;
  const abs = font.contours(gid).map((c) => outline(c, (px) => px * scale, (py) => -py * scale, 3)).join("");
  return relative(abs, digits);
}

// Rewrites an absolute M/L/Q/Z path as relative commands, rounding each step
// against the rounded pen so errors never accumulate.
function relative(d, digits) {
  const tokens = d.match(/[MLQZ]|-?[\d.]+/g);
  if (!tokens) return "";
  const f = 10 ** digits;
  const q = (v) => Math.round(v * f) / f;
  const num = (v) => {
    const s = String(q(v));
    return s.replace(/^(-?)0\./, "$1.");
  };
  let out = "", i = 0, px = 0, py = 0, sx = 0, sy = 0, last = "";
  const pair = () => {
    const x = q(+tokens[i++]), y = q(+tokens[i++]);
    const s = `${num(x - px)}${y - py < 0 ? "" : " "}${num(y - py)}`;
    return [x, y, s];
  };
  while (i < tokens.length) {
    const c = tokens[i++];
    if (c === "Z") {
      out += "z";
      (px = sx), (py = sy), (last = "z");
    } else if (c === "M") {
      const x = q(+tokens[i++]), y = q(+tokens[i++]);
      out += `m${num(x - px)}${y - py < 0 ? "" : " "}${num(y - py)}`;
      (px = sx = x), (py = sy = y), (last = "m");
    } else if (c === "L") {
      const [x, y, s] = pair();
      out += (last === "l" ? (s[0] === "-" ? "" : " ") : "l") + s;
      (px = x), (py = y), (last = "l");
    } else if (c === "Q") {
      const x1 = q(+tokens[i++]), y1 = q(+tokens[i++]);
      const c1 = `${num(x1 - px)}${y1 - py < 0 ? "" : " "}${num(y1 - py)}`;
      const [x, y, s] = pair();
      const c2 = `${num(x - px)}${y - py < 0 ? "" : " "}${num(y - py)}`;
      out += (last === "q" ? (c1[0] === "-" ? "" : " ") : "q") + c1 + (c2[0] === "-" ? "" : " ") + c2;
      (px = x), (py = y), (last = "q");
    }
  }
  return out;
}
