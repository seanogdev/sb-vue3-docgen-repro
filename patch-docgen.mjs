/**
 * Switches the installed @storybook/vue3-vite docgen guard between three states, so the effect of
 * each can be measured against the same fixtures without waiting on a release.
 *
 *   node patch-docgen.mjs stock      # 10.5.4 as published
 *   node patch-docgen.mjs pr35557    # + storybookjs/storybook#35557, the source pattern version
 *   node patch-docgen.mjs thispr     # + storybookjs/storybook#35611, the AST version
 *
 * Keeps a `.stock` copy of each file it touches and always rebuilds from that, so the states are
 * independent rather than cumulative. Writes a fresh file rather than editing in place, in case the
 * install is hard linked into a package manager's content-addressable store.
 */
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const PRESET = 'node_modules/@storybook/vue3-vite/dist/preset.js';
const OXC = 'node_modules/storybook/dist/oxc-parser/index.js';

const STATE = process.argv[2];
if (!['stock', 'pr35557', 'thispr'].includes(STATE)) {
  console.error('usage: node patch-docgen.mjs <stock|pr35557|thispr>');
  process.exit(1);
}

/** The guard as published in 10.5.4: only a name declared in this module qualifies. */
const STOCK_GATE = 'localBindings.has(name) && (';

/** #35557 widens it by looking for the shim import in the module source. */
const PR35557_GATE =
  '(localBindings.has(name) || isDefaultExport && id.endsWith(".vue") && ' +
  `/^import\\s+_sfc_main\\s+from\\s+['"][^'"]+\\?vue&type=script(?:&[^'"]*)?['"];?$/m.test(src)) && (`;

/** #35611 widens it by asking the AST which specifier the name was imported from. */
const THISPR_GATE =
  '(localBindings.has(name) || isDefaultExport && id.endsWith(".vue") && ' +
  '/\\?vue&type=script/.test(importedBindings.get(name) ?? "")) && (';

const OXC_IMPORT = 'import { parseLocalBindings } from "storybook/internal/oxc-parser";';
const OXC_ASSIGN = 'MagicString(src), localBindings = await parseLocalBindings(id, src);';

/** Mirrors parseModuleBindings from the PR, in the bundle's own style. */
const PARSE_MODULE_BINDINGS = `async function parseModuleBindings(filePath, source) {
  let declared = /* @__PURE__ */ new Set(), imported = /* @__PURE__ */ new Map();
  let parseResult;
  try {
    parseResult = oxcRawParseSync(filePath, source);
  } catch {
    return { declared, imported };
  }
  let body = parseResult.program?.body;
  if (!Array.isArray(body))
    return { declared, imported };
  for (let statement of body) {
    let node = statement;
    if (node.type === "VariableDeclaration" || node.type === "FunctionDeclaration" || node.type === "ClassDeclaration")
      collectDeclaredNames(node, declared);
    else if (node.type === "ExportNamedDeclaration" && node.declaration && !node.source)
      collectDeclaredNames(node.declaration, declared);
    else if (node.type === "ImportDeclaration" && node.importKind !== "type")
      for (let specifier of node.specifiers ?? []) {
        if (specifier.type === "ImportSpecifier" && specifier.importKind === "type")
          continue;
        specifier.local?.name && imported.set(specifier.local.name, node.source.value);
      }
  }
  return { declared, imported };
}
`;

function readStock(file) {
  const stock = `${file}.stock`;
  if (!existsSync(stock)) {
    copyFileSync(file, stock);
  }
  return readFileSync(stock, 'utf8');
}

function write(file, contents) {
  unlinkSync(file);
  writeFileSync(file, contents);
}

function replace(src, from, to, label) {
  if (!src.includes(from)) {
    throw new Error(`anchor not found: ${label}`);
  }
  return src.replace(from, to);
}

let preset = readStock(PRESET);
let oxc = readStock(OXC);

if (STATE === 'pr35557') {
  preset = replace(preset, STOCK_GATE, PR35557_GATE, 'guard');
}

if (STATE === 'thispr') {
  oxc = replace(
    oxc,
    'async function parseReExports(',
    `${PARSE_MODULE_BINDINGS}async function parseReExports(`,
    'parseModuleBindings insertion point'
  );
  oxc = replace(oxc, '  parseLocalBindings,', '  parseLocalBindings,\n  parseModuleBindings,', 'export list');

  preset = replace(
    preset,
    OXC_IMPORT,
    'import { parseLocalBindings, parseModuleBindings } from "storybook/internal/oxc-parser";',
    'oxc-parser import'
  );
  preset = replace(
    preset,
    OXC_ASSIGN,
    'MagicString(src), { declared: localBindings, imported: importedBindings } = await parseModuleBindings(id, src);',
    'bindings assignment'
  );
  preset = replace(preset, STOCK_GATE, THISPR_GATE, 'guard');
}

write(PRESET, preset);
write(OXC, oxc);

console.log(`docgen guard set to: ${STATE}`);
