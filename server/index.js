import express from "express";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
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

// serve the production build when it exists (single-port deployment)
if (existsSync(DIST)) {
  app.use(express.static(DIST));
}

app.listen(PORT, () => {
  console.log(`kanji backend on http://localhost:${PORT}`);
});
