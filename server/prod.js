// Production entry: bundled by `make build` into a single self-contained
// file (build/kanji-server.mjs) with the frontend embedded.
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createApp } from "./app.js";
import assets from "../build/assets.mjs";

// default port spells KANJI on a phone keypad (5-2-6-5-4); 52654 is in the
// IANA dynamic/private range (49152-65535), so it is not a reserved port
const PORT = process.env.PORT || 52654;
const DATA_DIR =
  process.env.KANJI_DATA || join(dirname(fileURLToPath(import.meta.url)), "data");

mkdirSync(DATA_DIR, { recursive: true });
const app = createApp(join(DATA_DIR, "kanji.db"), {
  adminUsers: (process.env.KANJI_ADMINS || "").split(",").filter(Boolean),
});

// serve the embedded frontend
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  const asset = assets[req.path === "/" ? "/index.html" : req.path];
  if (!asset) return next();
  res.type(asset.type).send(Buffer.from(asset.b64, "base64"));
});

app.listen(PORT, () => {
  console.log(`kanji server on http://localhost:${PORT} (data: ${DATA_DIR})`);
});
