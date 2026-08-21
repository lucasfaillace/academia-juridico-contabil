#!/usr/bin/env node

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appBuild = join(root, ".next", "server", "app");

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.isFile() && entry.name.endsWith(".html") ? [path] : [];
  }));
  return nested.flat();
}

const [nextConfig, articleSecurity, files] = await Promise.all([
  readFile(join(root, "next.config.ts"), "utf8"),
  readFile(join(root, "lib", "article-content-security.ts"), "utf8"),
  htmlFiles(appBuild),
]);

assert.ok(files.length, "O build não contém páginas HTML para auditar.");
assert.match(nextConfig, /key: "Content-Security-Policy"/);
assert.doesNotMatch(nextConfig, /unsafe-eval/);
assert.doesNotMatch(nextConfig, /img-src https:/);
assert.match(nextConfig, /script-src-attr 'none'/);
assert.match(nextConfig, /script-src-elem 'self' 'unsafe-inline' https:\/\/www\.googletagmanager\.com/);
assert.match(nextConfig, /style-src-attr 'unsafe-inline'/);
assert.match(articleSecurity, /allowProtocolRelative: false/);
assert.doesNotMatch(articleSecurity, /allowedSchemesByTag:\s*\{\s*img:\s*\[[^\]]*"https"/);

let inlineScripts = 0;
let inlineStyles = 0;
const externalArticleImages = [];
for (const file of files) {
  const html = await readFile(file, "utf8");
  inlineScripts += [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi)].length;
  inlineStyles += [...html.matchAll(/\sstyle=(?:"[^"]*"|'[^']*')/gi)].length;
  externalArticleImages.push(...Array.from(
    html.matchAll(/<(?:img|source)\b[^>]*\b(?:src|srcset)=(?:"(https?:\/\/|\/\/)[^"]*"|'(https?:\/\/|\/\/)[^']*')/gi),
    () => relative(root, file),
  ));
}

assert.ok(inlineScripts > 0, "O Next deixou de emitir scripts inline; reavalie a remoção de unsafe-inline.");
assert.ok(inlineStyles > 0, "O Next deixou de emitir estilos inline; reavalie a remoção de unsafe-inline de style-src.");
assert.deepEqual(externalArticleImages, [], "O HTML público contém imagens externas não previstas pela política.");

console.log(`CSP auditada em ${files.length} páginas: ${inlineScripts} scripts inline e ${inlineStyles} estilos inline do runtime identificados.`);
