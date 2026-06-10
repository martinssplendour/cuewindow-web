const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.join(__dirname, "..", "public");
const configPath = path.join(publicDir, "config.js");

const config = {
  supabaseUrl: process.env.CUEWINDOW_SUPABASE_URL || process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.CUEWINDOW_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
  siteUrl: process.env.CUEWINDOW_SITE_URL || "",
};

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(
  configPath,
  `window.CUEWINDOW_PUBLIC_CONFIG = ${JSON.stringify(config, null, 2)};\n`,
  "utf8",
);

console.log("Wrote public config for CueWindow web.");
