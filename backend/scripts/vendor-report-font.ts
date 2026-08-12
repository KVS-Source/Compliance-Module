/**
 * Regenerates `src/modules/reports/fonts/noto-sans-regular.ts` from a TrueType
 * file. The report PDF writer embeds its font as compiled-in gzipped base64
 * because `tsc` emits only JavaScript into `dist/`, and both container images
 * copy `dist/` alone — a loose `.ttf` would never reach production.
 *
 * Usage:
 *   npx tsx scripts/vendor-report-font.ts /path/to/NotoSans-Regular.ttf
 *
 * The upstream file is the hinted static instance from
 * https://github.com/googlefonts/noto-fonts (hinted/ttf/NotoSans), licensed
 * under the SIL Open Font License 1.1 (see the licence beside the output).
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const source = process.argv[2];
if (!source) {
  console.error("usage: npx tsx scripts/vendor-report-font.ts <font.ttf>");
  process.exit(1);
}

// Run from the backend package root, like every other script here.
const target = resolve(
  process.cwd(),
  "src/modules/reports/fonts/noto-sans-regular.ts",
);

const ttf = readFileSync(source);
const sha = createHash("sha256").update(ttf).digest("hex");
const gzipped = gzipSync(ttf, { level: 9 });
const base64 = gzipped.toString("base64");

const chunks: string[] = [];
for (let index = 0; index < base64.length; index += 76) {
  chunks.push(`  "${base64.slice(index, index + 76)}",`);
}

writeFileSync(
  target,
  `/**
 * Vendored report font: Noto Sans Regular (hinted static instance).
 *
 * Licence: SIL Open Font License 1.1 — see \`NotoSans-OFL.txt\` beside this file.
 * Source:  https://github.com/googlefonts/noto-fonts
 *          hinted/ttf/NotoSans/NotoSans-Regular.ttf
 * SHA-256: ${sha}
 * Size:    ${ttf.length} bytes raw, ${gzipped.length} bytes gzipped
 *
 * The font is embedded as gzipped base64 rather than shipped as a loose \`.ttf\`
 * because \`tsc\` only emits JavaScript into \`dist/\`, and both container images
 * copy \`dist/\` alone. A compiled-in module is therefore the only form that
 * reliably reaches production, tests and \`tsx\` alike.
 *
 * GENERATED FILE — do not hand-edit. Regenerate with:
 *   npx tsx scripts/vendor-report-font.ts <path-to-NotoSans-Regular.ttf>
 */

import { gunzipSync } from "node:zlib";

const NOTO_SANS_REGULAR_GZIP_BASE64 = [
${chunks.join("\n")}
].join("");

/** Raw SHA-256 of the vendored TrueType file, asserted by the unit tests. */
export const NOTO_SANS_REGULAR_SHA256 =
  "${sha}";

let cached: Buffer | undefined;

/** Decompresses the vendored TrueType font once and caches the result. */
export const notoSansRegular = (): Buffer => {
  cached ??= gunzipSync(Buffer.from(NOTO_SANS_REGULAR_GZIP_BASE64, "base64"));
  return cached;
};
`,
);

console.log(`wrote ${target}`);
console.log(`sha256 ${sha}`);
