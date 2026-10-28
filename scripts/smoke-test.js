/**
 * Smoke test: runs every workflow with its default inputs, renders the result,
 * and checks the HTML for broken output. No browser and no packages needed.
 *
 *   npm test
 */

import { WORKFLOWS, ORDER } from '../src/workflows/index.js';
import { CMS_IDS } from '../src/config.js';
import { defaultInput } from './sample-inputs.js';

let failures = 0;

function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : '  ' + detail}`);
  if (!ok) failures++;
}

/** Problems that mean a template or data bug. */
function problems(html) {
  const found = [];
  if (/\bundefined\b/.test(html)) found.push('"undefined"');
  if (/\bNaN\b/.test(html)) found.push('"NaN"');
  if (/\[object /.test(html)) found.push('"[object ...]"');
  if (/\{\{[A-Z]\}\}/.test(html)) found.push('unfilled {{token}}');
  if (/%\{/.test(html)) found.push('unfilled %{');
  return found;
}

for (const id of ORDER) {
  const w = WORKFLOWS[id];
  const input = defaultInput(id);

  check(`${id}: input passes its own validation`, w.check(input) === '', w.check(input));

  let html = '';
  try {
    html = w.render(w.demo(input), input);
    check(`${id}: renders`, html.length > 500, `only ${html.length} characters`);
  } catch (err) {
    check(`${id}: renders`, false, err.message);
    continue;
  }
  const bad = problems(html);
  check(`${id}: no broken output`, bad.length === 0, bad.join(', '));
}

// Migrate has a different example page for every target CMS
for (const target of CMS_IDS) {
  const w = WORKFLOWS.migrate;
  const html = w.render(w.demo({ url: 'northwind.example', target }), { target });
  check(`migrate to ${target}: no broken output`, problems(html).length === 0, problems(html).join(', '));
}

// Map works for every source and target pair
{
  let pairs = 0;
  const broken = [];
  for (const source of CMS_IDS) {
    for (const target of CMS_IDS) {
      if (source === target) continue;
      const w = WORKFLOWS.map;
      const input = { source, target, components: 'Hero Banner, Teaser Card', requirement: 'x' };
      pairs++;
      const bad = problems(w.render(w.demo(input), input));
      if (bad.length) broken.push(`${source}->${target}: ${bad.join(', ')}`);
    }
  }
  check(`map: all ${pairs} source/target pairs render cleanly`, broken.length === 0, broken.join('; '));
}

// Audit: unticking a check removes its findings
{
  const w = WORKFLOWS.audit;
  const data = w.demo({ mode: 'url', target: 'x.com', checks: ['seo'] });
  check('audit: only the selected check is reported', data.findings.every((f) => f.category === 'seo') && data.metrics.length === 0);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
