import express from "express";
import { existsSync, mkdirSync } from "fs";
import { dirname, join, sep } from "path";
import { fileURLToPath } from "url";
import { createApp } from "./app.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const DIST = join(__dirname, "..", "dist");
const PORT = process.env.PORT || 8034;

mkdirSync(DATA_DIR, { recursive: true });
const app = createApp(join(DATA_DIR, "kanji.db"), {
  adminUsers: (process.env.KANJI_ADMINS || "").split(",").filter(Boolean),
});

// serve the production build when it exists (single-port deployment);
// unknown extension-less paths fall back to index.html so the client-routed
// views (/deck, /practice, /admin) deep-link
if (existsSync(DIST)) {
  // hashed assets cache forever; index.html must revalidate so a deploy
  // reaches the browser (see the note in prod.js) — `INV-BUILD-3`
  app.use(
    express.static(DIST, {
      setHeaders: (res, path) =>
        res.set(
          "Cache-Control",
          path.includes(`${sep}assets${sep}`)
            ? "public, max-age=31536000, immutable"
            : "no-cache"
        ),
    })
  );
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/") || req.path.includes(".")) {
      return next();
    }
    res.set("Cache-Control", "no-cache");
    res.sendFile(join(DIST, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`kanji backend on http://localhost:${PORT}`);
});
