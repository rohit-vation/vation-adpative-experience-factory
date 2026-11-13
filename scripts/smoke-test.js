/**
 * Smoke test for the API-only workflow shell. No hardcoded output fixture is
 * exposed through a workflow definition; API response validation lives in ai-test.js.
 */
import { WORKFLOWS, ORDER } from '../src/workflows/index.js';
import { defaultInput } from './sample-inputs.js';

let failures = 0;
function check(label, ok, detail = '') {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok || !detail ? '' : '  ' + detail));
  if (!ok) failures++;
}

for (const id of ORDER) {
  const workflow = WORKFLOWS[id];
  const input = defaultInput(id);
  const validation = workflow.check(input);
  check(id + ': default input passes validation', validation === '', validation);
  let form = '';
  try { form = workflow.form(); } catch (error) {
    check(id + ': form renders', false, error.message);
    continue;
  }
  check(id + ': form renders', form.length > 100, 'only ' + form.length + ' characters');
  check(id + ': has an output renderer', typeof workflow.render === 'function');
  check(id + ': has no demo/fallback generator', !Object.hasOwn(workflow, 'demo'));
  const bad = [];
  if (/\bundefined\b/.test(form)) bad.push('undefined');
  if (/\[object /.test(form)) bad.push('[object ...]');
  if (/\{\{[A-Z]\}\}/.test(form)) bad.push('unfilled token');
  check(id + ': form has no broken output', bad.length === 0, bad.join(', '));
}

console.log(failures ? '\n' + failures + ' check(s) failed' : '\nAll checks passed');
process.exit(failures ? 1 : 0);
