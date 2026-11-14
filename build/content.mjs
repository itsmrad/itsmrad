// Every fact drawn into the SVGs lives here. The words in README.md are edited
// in README.md itself; when a figure changes, change it in both places, then
// run `node build/build.mjs` and commit README.md and assets/ together.
//
// Sources: github.com/itsmrad/codenaya and github.com/itsmrad/xflow (counts
// checked 2026-11-13), xflow's docs/benchmarks/scoreboard-macos.json (measured
// 2026-10-29), and anupamdas.me. No figure here is estimated.

export const sheet = {
  name: "Anupam Das",
  role: "software & ai engineer",
  place: "new delhi, india",
  claim: ["I build AI products and fast", "native tools, end to end."],
  // Words of the claim that get the red-pen underline: [line, word].
  underline: [
    [0, "AI products"],
    [1, "native tools"],
  ],
  note: ["it presses on my site.", "here it's just ink."],
  drawingNo: "AD-001",
  rev: "C",
  date: "2026-11-14",
};

export const codenaya = {
  index: "a",
  category: "ai browser ide",
  status: "live · since feb 2026",
  name: "Codenaya",
  byline: "777 of 801 commits are mine",
  // The agent's loop, as the repository's finish gate runs it.
  pipeline: [
    { label: "prompt", sub: "plain english" },
    { label: "agent", sub: "15 tools" },
    { label: "build check", sub: "tsc + vite build" },
    { label: "live preview", sub: "cloud sandbox" },
    { label: "export", sub: "github or zip" },
  ],
  loop: "unchecked changes? back once",
  figures: [
    { value: "218", label: "merged pull requests", note: "206 of them mine", accent: true },
    { value: "100+", label: "projects built", accent: true },
    { value: "170 + 69", label: "unit files + e2e specs" },
    { value: "10", label: "decision records" },
  ],
};

export const xflow = {
  index: "b",
  category: "native dictation daemon",
  status: "beta · v0.2.1 · rust",
  name: "xflow",
  byline: "sole author · 494 of 494 commits",
  latency: { p50: "255", p95: "378", unit: "ms", label: "stop to text, p50" },
  memory: { idle: "3.0", peak: "20.8", unit: "MiB", max: 25, step: 5 },
  conditions: "apple m2 · 8 gb · macos 26.7.1 · 2026-10-29",
  figures: [
    { value: "138", label: "merged pull requests", note: "all mine" },
    { value: "~98,000", label: "lines of rust", note: "tests included" },
    { value: "~1,000", label: "tests" },
    { value: "10", label: "speech providers", note: "+ local whisper.cpp" },
  ],
};

// Glyph names refer to GLYPHS in build.mjs.
export const stack = [
  ["rust", "rust"],
  ["typescript", "ts"],
  ["python", "python"],
  ["react", "react"],
  ["next.js", "next"],
  ["node.js", "node"],
  ["fastapi", "fastapi"],
  ["langgraph", "graph"],
  ["rag + tools", "ai"],
  ["postgres", "db"],
  ["docker", "docker"],
  ["git", "git"],
];

export const titleBlock = [
  ["drawn by", "anupam"],
  ["checked by", "the borrow checker"],
  ["date", "2026-11-14"],
  ["rev", "C"],
  ["sheet", "1 / 1"],
  ["scale", "1:1"],
];
