#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const site = path.join(root, 'site');
const pages = ['index.html', 'about.html', 'service.html', 'contact.html'];
const requiredAssets = ['styles.css', 'app.js'];
const checks = [];

function record(id, ok, detail) {
  checks.push({ id, ok, detail });
}

function read(rel) {
  return readFileSync(path.join(site, rel), 'utf8');
}

for (const rel of [...pages, ...requiredAssets]) {
  record(`exists:${rel}`, existsSync(path.join(site, rel)), `${rel} exists`);
}

const pageTexts = pages
  .filter((rel) => existsSync(path.join(site, rel)))
  .map((rel) => [rel, read(rel)]);
const allPages = pageTexts.map(([, text]) => text).join('\n');
const css = existsSync(path.join(site, 'styles.css')) ? read('styles.css') : '';
const js = existsSync(path.join(site, 'app.js')) ? read('app.js') : '';
const service = existsSync(path.join(site, 'service.html')) ? read('service.html') : '';
const about = existsSync(path.join(site, 'about.html')) ? read('about.html') : '';

for (const [rel, text] of pageTexts) {
  record(`nav:${rel}`, /<nav\b[^>]*aria-label="Primary navigation"/.test(text), `${rel} has named primary nav`);
  record(`asset-css:${rel}`, /href="\.\/styles\.css"/.test(text), `${rel} links styles.css`);
  record(`asset-js:${rel}`, /src="\.\/app\.js"/.test(text), `${rel} loads app.js`);
  record(`links:${rel}`, /href="\.\/about\.html"/.test(text) && /href="\.\/service\.html"/.test(text) && /href="\.\/contact\.html"/.test(text), `${rel} links the main pages`);
}

record('github-url', /https:\/\/github\.com\/Hosico02\/demo2project/.test(about + allPages), 'open source URL is present');
record('service-upload-input', /type="file"[\s\S]*data-demo-upload/.test(service), 'service page has upload input');
record('service-archive-accept', /\.zip/.test(service) && /\.7z/.test(service) && /\.rar/.test(service) && /\.tar/.test(service), 'service page accepts common archive formats');
record('service-return-zip', /data-return-format="zip"/.test(service) && /Output:\s*zip/.test(service), 'service returns normalized zip artifacts');
record('js-archive-validation', /allowedArchives\s*=\s*\[[\s\S]*'zip'[\s\S]*'7z'[\s\S]*'tgz'/.test(js), 'app.js validates archive extensions');
record('js-keyboard-flip', /keydown/.test(js) && /Enter/.test(js) && /Escape/.test(js), 'flip panels support keyboard interaction');
record('css-no-hidden-cursor', !/cursor\s*:\s*none/.test(css), 'site does not hide the system cursor globally');
record('css-focus-visible', /:focus-visible/.test(css), 'focus-visible styles exist');
record('css-responsive', /@media\s*\(max-width:\s*780px\)/.test(css), 'responsive breakpoint exists');
record('no-beta-placeholder', !/This is just a BETA|beta version of MatrixOmnix/i.test(allPages), 'old beta placeholder copy removed');

const failures = checks.filter((check) => !check.ok);
console.log(JSON.stringify({ ok: failures.length === 0, checks, failures }, null, 2));
if (failures.length > 0) process.exit(1);
