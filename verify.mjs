/**
 * Reports whether each fixture ends up with `__docgenInfo`, in dev and in build.
 *
 * Dev is checked by asking the dev server for the transformed module over HTTP; build is checked by
 * searching the static output. Neither needs a browser, so the result is a plain table rather than
 * a screenshot of a prop table.
 *
 *   node verify.mjs          # both modes
 *   node verify.mjs dev
 *   node verify.mjs build
 */
import { spawn } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const FIXTURES = ['CleanButton', 'TypeExportButton', 'ConstExportButton'];
const PORT = 6017;
const OUT = 'storybook-static-verify';

function run(args, onLine) {
  const child = spawn('./node_modules/.bin/storybook', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code));
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => onLine?.(chunk));
  }
  return { child, done };
}

async function checkDev() {
  let ready;
  const readyPromise = new Promise((resolve) => {
    ready = resolve;
  });
  const { child, done } = run(['dev', '-p', String(PORT), '--no-open', '--quiet'], (chunk) => {
    if (/Storybook.*started|Local:|:\s*http/i.test(chunk)) ready();
  });
  const timeout = setTimeout(ready, 90_000);

  await Promise.race([readyPromise, done]);
  clearTimeout(timeout);

  const results = {};
  for (const name of FIXTURES) {
    // Vite serves the post-transform module source, so the docgen assignment is visible here.
    const url = `http://localhost:${PORT}/src/${name}.vue`;
    try {
      const res = await fetch(url);
      const text = await res.text();
      results[name] = text.includes('__docgenInfo');
    } catch (e) {
      results[name] = `error: ${e.message}`;
    }
  }

  child.kill('SIGTERM');
  await Promise.race([done, new Promise((r) => setTimeout(r, 5000))]);
  return results;
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

async function checkBuild() {
  await rm(OUT, { recursive: true, force: true });
  const { done } = run(['build', '-o', OUT, '--quiet']);
  const code = await done;
  if (code !== 0) throw new Error(`storybook build exited ${code}`);

  const files = await collectFiles(OUT);

  const results = {};
  for (const name of FIXTURES) {
    // Each fixture gets its own story chunk, which is emitted whether or not docgen was attached —
    // so the presence of `__docgenInfo` inside it is the discriminator. Matching on the raw
    // identifier keeps this robust to minification (which rewrites quotes and drops key quoting).
    const chunks = files.filter((f) => f.includes(name));
    if (chunks.length === 0) {
      results[name] = 'no chunk emitted';
      continue;
    }
    const sources = await Promise.all(chunks.map((f) => readFile(f, 'utf8')));
    results[name] = sources.some((src) => src.includes('__docgenInfo'));
  }
  return results;
}

function table(title, results) {
  console.log(`\n${title}`);
  for (const name of FIXTURES) {
    const value = results[name];
    const mark = value === true ? 'docgen present' : value === false ? 'DOCGEN MISSING' : value;
    console.log(`  ${name.padEnd(20)} ${mark}`);
  }
}

const mode = process.argv[2] ?? 'both';

if (mode === 'dev' || mode === 'both') {
  table('storybook dev:', await checkDev());
}
if (mode === 'build' || mode === 'both') {
  table('storybook build:', await checkBuild());
}
console.log();
