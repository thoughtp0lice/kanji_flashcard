// Which of the calligraphic faces this device can actually render.
//
// The app ships as one self-contained file and loads nothing external, so the
// styles below are whatever the OS already has. That is a real limitation:
// 楷書 ships with Windows (UD デジタル教科書体) and macOS (YuKyokasho/Klee),
// but 草書 is a specialist font almost nobody has installed. Rather than
// label a cell 草書 and quietly show Mincho, we measure first and say so.
//
// Detection is the standard canvas trick: render a probe string in
// `"Candidate", sentinel` and in `sentinel` alone. If the widths differ, the
// candidate resolved.

const SENTINELS = ["monospace", "serif", "sans-serif"];
const PROBE = "あアかカさシ";

let ctx;
function context() {
  if (ctx !== undefined) return ctx;
  try {
    ctx = document.createElement("canvas").getContext("2d") ?? null;
  } catch {
    ctx = null;
  }
  return ctx;
}

const cache = new Map();

export function isFontAvailable(name) {
  if (cache.has(name)) return cache.get(name);
  const c = context();
  // no canvas (jsdom, or a locked-down browser) — we cannot tell, so do not
  // claim the font is missing; the stack will fall back on its own
  if (!c) return true;
  const width = (family) => {
    c.font = `48px ${family}`;
    return c.measureText(PROBE).width;
  };
  const found = SENTINELS.some((s) => width(`"${name}", ${s}`) !== width(s));
  cache.set(name, found);
  return found;
}

// The three styles, each a list of real font names in preference order.
// `generic` is the CSS family the stack ends in when nothing matches.
export const FACES = [
  {
    key: "kaisho",
    label: "楷書",
    hint: "block script — how kana are taught and handwritten",
    candidates: [
      "UD Digi Kyokasho N-R",
      "UD デジタル教科書体 N-R",
      "YuKyokasho",
      "Yu Kyokasho",
      "HGP教科書体",
      "Klee One",
      "Klee",
    ],
    generic: "serif",
  },
  {
    key: "sosho",
    label: "草書",
    hint: "cursive brush script — flowing, heavily abbreviated",
    candidates: [
      "Hakushu Sosho",
      "AoyagiSosekiFont",
      "HGP行書体",
      "HG行書体",
      "Hakushu Gyosho",
    ],
    generic: "cursive",
  },
  {
    key: "tegaki",
    label: "手書き",
    hint: "everyday handwriting",
    candidates: ["Klee One", "Klee", "Yuruka", "Hannari", "Kosugi Maru"],
    generic: "sans-serif",
  },
];

// → [{ ...face, stack, available }]
export function resolveFaces() {
  return FACES.map((face) => {
    const hit = face.candidates.find(isFontAvailable);
    return {
      ...face,
      available: Boolean(hit),
      stack: [...face.candidates.map((n) => `"${n}"`), face.generic].join(", "),
    };
  });
}
