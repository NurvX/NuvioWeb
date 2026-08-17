// Materializes local.properties from Vercel/host environment variables before build.
// The app's build (scripts/build.mjs -> scripts/envProperties.mjs) only reads a
// local.properties FILE, not process.env directly, so on hosts like Vercel we
// need to bridge platform env vars into that file before `npm run build` runs.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV_PROPERTY_KEYS } from "./envProperties.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const targetPath = path.join(rootDir, "local.properties");

function escapePropertyValue(value = "") {
return String(value)
.replace(/\\/g, "\\\\")
.replace(/:/g, "\\:")
.replace(/=/g, "\\=")
.replace(/#/g, "\\#")
.replace(/!/g, "\\!");
}

const lines = [];
let foundAny = false;

for (const key of ENV_PROPERTY_KEYS) {
const value = process.env[key];
if (typeof value === "string" && value.trim()) {
foundAny = true;
lines.push(`${key}=${escapePropertyValue(value)}`);
}
}

if (!foundAny) {
console.log(
"write-vercel-local-properties: no matching env vars found in the host environment, skipping local.properties generation."
);
process.exit(0);
}

await writeFile(targetPath, `${lines.join("\n")}\n`, "utf8");
console.log(
`write-vercel-local-properties: wrote local.properties with ${lines.length} value(s) from host environment.`
);
