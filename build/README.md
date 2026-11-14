# How the profile sheet is built

Every picture in `assets/` is generated from `content.mjs` by `build.mjs`, in a light and a dark version (GitHub serves the right one through `<picture>`).

```sh
node build/build.mjs   # Node 22 or newer, no install step, no dependencies
```

- **Change a fact or figure:** edit `content.mjs`, run the build, and update the matching words in `../README.md` (the text there is written by hand). Commit `README.md` and `assets/` together.
- **Text is drawn as outlines** (`font.mjs` reads the fonts in `fonts/`), because an SVG shown through `<img>` cannot load web fonts. Instrument Serif, Geist, Geist Mono and Caveat are under the SIL Open Font License (`fonts/OFL-*.txt`).
- **Motion** is plain CSS inside each SVG, and stops for visitors who ask for reduced motion. Every animation's first frame is a finished drawing, so a paused image still looks complete.
- **Colours** are GitHub's own canvas and text colours plus one drafting accent (`#cf300c` light, `#fe773d` dark), set in `THEMES` at the top of `build.mjs`.
- `signature.txt` is the signature stroke from anupamdas.me's footer.

GitHub caches the raw images for about five minutes, so a change can take that long to show.
