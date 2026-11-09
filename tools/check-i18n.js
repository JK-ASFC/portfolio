#!/usr/bin/env node
/*
 * Vérifie les fichiers de langue js/lang/*.js par rapport à l'anglais :
 * - toutes les clés publiques sont présentes, aucune clé inconnue ;
 * - les variables {n}, {x}, {y}, {m}, {host} sont identiques ;
 * - aucun texte vide.
 * Usage : node tools/check-i18n.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "js/i18n.js"), "utf8"), ctx);
const en = ctx.window.I18N.en;
const PUBLIC = ctx.window.I18N_PUBLIC_KEYS || [];
const vars = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(",");

let errors = 0;
const dir = path.join(root, "js/lang");
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort()) {
  const c = { window: { I18N: {} } };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(dir, file), "utf8"), c);
  const code = Object.keys(c.window.I18N)[0];
  const dict = c.window.I18N[code];
  const missing = PUBLIC.filter((k) => !(k in dict));
  const unknown = Object.keys(dict).filter((k) => !PUBLIC.includes(k));
  const badVars = Object.keys(dict).filter((k) => k in en && vars(dict[k]) !== vars(en[k]));
  const empty = Object.keys(dict).filter((k) => !String(dict[k]).trim());
  const ok = !missing.length && !unknown.length && !badVars.length && !empty.length;
  if (!ok) errors++;
  console.log(`${ok ? "✓" : "✗"} ${code.padEnd(7)} ${Object.keys(dict).length}/${PUBLIC.length}` +
    (missing.length ? `  manquantes: ${missing.join(", ")}` : "") +
    (unknown.length ? `  inconnues: ${unknown.join(", ")}` : "") +
    (badVars.length ? `  variables: ${badVars.join(", ")}` : "") +
    (empty.length ? `  vides: ${empty.join(", ")}` : ""));
}
if (!PUBLIC.length) { console.log("✗ I18N_PUBLIC_KEYS absent de js/i18n.js"); errors++; }
process.exit(errors ? 1 : 0);
