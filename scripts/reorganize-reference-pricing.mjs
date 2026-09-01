/**
 * One-off: reorganize browser-saved Google pricing page into docs/reference/google-maps-platform-pricing/
 * Run: node scripts/reorganize-reference-pricing.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const refDir = path.join(root, 'docs', 'reference');
const outDir = path.join(refDir, 'google-maps-platform-pricing');
const assetsDir = path.join(outDir, 'assets');

const entries = fs.readdirSync(refDir, { withFileTypes: true });
const htmlEntry = entries.find((e) => e.isFile() && e.name.endsWith('.html'));
const filesDirEntry = entries.find((e) => e.isDirectory() && e.name.endsWith('_files'));

if (!htmlEntry || !filesDirEntry) {
  console.error('Source HTML or _files folder not found under docs/reference');
  process.exit(1);
}

const htmlSrc = path.join(refDir, htmlEntry.name);
const filesSrc = path.join(refDir, filesDirEntry.name);
const assetsPrefixOld = `./${filesDirEntry.name}/`;

fs.mkdirSync(assetsDir, { recursive: true });

function copyRecursive(src, dest) {
  for (const name of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, name.name);
    const d = path.join(dest, name.name);
    if (name.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

copyRecursive(filesSrc, assetsDir);

let html = fs.readFileSync(htmlSrc, 'utf8');
const countBefore = (html.match(new RegExp(assetsPrefixOld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
html = html.split(assetsPrefixOld).join('./assets/');
fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');

console.log(`Wrote index.html (${countBefore} asset path rewrites)`);
console.log(`Copied assets to ${assetsDir}`);

// Remove old loose files at docs/reference root
fs.unlinkSync(htmlSrc);
fs.rmSync(filesSrc, { recursive: true, force: true });
console.log('Removed original browser-save files from docs/reference root');
