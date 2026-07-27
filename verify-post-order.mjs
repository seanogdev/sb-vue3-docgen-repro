/**
 * Shows that #35557's guard, which matches the shim import against the module source, is defeated by
 * anything that emits ahead of that import, and that the AST guard in #35611 is not.
 *
 *   node verify-post-order.mjs
 *
 * The docgen plugin runs in `post`, so it sees whatever earlier plugins produced. Two earlier
 * plugins are used here: a four line local one that only prepends a comment, and
 * unplugin-vue-components, which prepends its own marker at position 0 for real. The local one is
 * the point; the third party one shows it happens without anybody trying.
 *
 * Only `storybook build` is checked. In dev the SFC is compiled inline, so `_sfc_main` is a local
 * declaration and the guard passes either way; the shim import only exists in a production build.
 */
import { spawn } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const FIXTURES = ['CleanButton', 'ConstExportButton', 'TypeExportButton'];

const RUNS = [
  { label: '#35557, nothing ahead of it', state: 'pr35557', env: {} },
  { label: '#35557, + comment prepended', state: 'pr35557', env: { PREPEND: '1' } },
  { label: '#35557, + unplugin-vue-components', state: 'pr35557', env: { UNPLUGIN: '1' } },
  { label: '#35611, + comment prepended', state: 'thispr', env: { PREPEND: '1' } },
  { label: '#35611, + unplugin-vue-components', state: 'thispr', env: { UNPLUGIN: '1' } },
];

function run(command, args, env) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PREPEND: '', UNPLUGIN: '', ...env },
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => (output += chunk));
  }
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, output }));
  });
}

async function collectFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectFiles(full)));
    else if (/\.(js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

async function docgenPerFixture(out) {
  const files = await collectFiles(out);
  const results = {};
  for (const name of FIXTURES) {
    const chunks = files.filter((f) => f.includes(name));
    if (chunks.length === 0) {
      results[name] = 'no chunk';
      continue;
    }
    const sources = await Promise.all(chunks.map((f) => readFile(f, 'utf8')));
    results[name] = sources.some((src) => src.includes('__docgenInfo'));
  }
  return results;
}

const rows = [];

for (const [index, { label, state, env }] of RUNS.entries()) {
  const out = `storybook-static-run${index + 1}`;

  const patch = await run('node', ['patch-docgen.mjs', state]);
  if (patch.code !== 0) {
    throw new Error(`patch failed for ${state}:\n${patch.output}`);
  }

  await rm(out, { recursive: true, force: true });
  const build = await run('./node_modules/.bin/storybook', ['build', '-o', out, '--quiet'], env);
  if (build.code !== 0) {
    throw new Error(`build failed for "${label}":\n${build.output.slice(-3000)}`);
  }

  rows.push({ label, results: await docgenPerFixture(out), out });
  console.log(`built ${label} -> ${out}`);
}

const labelWidth = Math.max(...RUNS.map((r) => r.label.length));
const cell = (value) =>
  (value === true ? 'present' : value === false ? 'MISSING' : value).padEnd(19);

console.log(`\nstorybook build, __docgenInfo in the emitted chunk:\n`);
console.log(`  ${''.padEnd(labelWidth)}  ${FIXTURES.map((f) => f.padEnd(19)).join('')}`);
for (const { label, results } of rows) {
  console.log(`  ${label.padEnd(labelWidth)}  ${FIXTURES.map((f) => cell(results[f])).join('')}`);
}

console.log(`
TypeExportButton is missing everywhere for an unrelated reason, storybookjs/storybook#35593, which
is merged but not in 10.5.4. The pair that moves is CleanButton and ConstExportButton.

Nothing here is specific to unplugin-vue-components. Row 2 uses a plugin whose entire body is
\`return { code: '/* anything at all */' + code }\`.
`);

await run('node', ['patch-docgen.mjs', 'stock']);
console.log('guard restored to stock\n');
