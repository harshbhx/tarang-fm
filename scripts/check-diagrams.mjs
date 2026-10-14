#!/usr/bin/env node
/**
 * Renders every ```mermaid block in the README and docs/, so a broken diagram fails CI instead of
 * showing up as an error box on GitHub. Needs @mermaid-js/mermaid-cli (CI installs it on the fly).
 *
 *   node scripts/check-diagrams.mjs [mmdc-binary] [puppeteer-config.json]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [mmdc = 'mmdc', puppeteerConfig] = process.argv.slice(2);
const files = ['README.md', ...readdirSync('docs').filter((f) => f.endsWith('.md')).map((f) => join('docs', f))];
const dir = mkdtempSync(join(tmpdir(), 'diagrams-'));

let total = 0;
const failures = [];
for (const file of files) {
  const blocks = [...readFileSync(file, 'utf8').matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
  blocks.forEach((block, i) => {
    total += 1;
    const input = join(dir, `${file.replace(/[/.]/g, '_')}_${i}.mmd`);
    writeFileSync(input, block);
    try {
      const args = ['-i', input, '-o', input.replace(/\.mmd$/, '.svg'), '--quiet'];
      if (puppeteerConfig) args.push('-p', puppeteerConfig);
      execFileSync(mmdc, args, { stdio: 'pipe' });
    } catch (err) {
      const firstLine = String(err.stderr || err.message).split('\n').find((l) => l.trim()) ?? 'render failed';
      failures.push(`${file} diagram ${i + 1}: ${firstLine}`);
    }
  });
}

for (const f of failures) console.log(`  ✗ ${f}`);
console.log(`${total - failures.length} of ${total} diagrams render`);
process.exit(failures.length ? 1 : 0);
