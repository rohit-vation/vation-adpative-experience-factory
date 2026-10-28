/**
 * Tests the AI path end to end against a MOCK Gemini (no key, no network):
 * browser request -> server -> Gemini call -> parse -> validate -> response.
 *
 *   npm run test:ai
 *
 * This proves our code. It does not prove Google's real API accepts the request,
 * so run the app once with a real key as the final check.
 */

import { startMock } from './mock-gemini.js';
import { ORDER } from '../src/workflows/index.js';
import { defaultInput } from './sample-inputs.js';
import { validate } from '../src/ai/validate.js';

const mock = await startMock(4011);
process.env.GEMINI_API_KEY = 'test-key';
process.env.GEMINI_BASE_URL = 'http://localhost:4011/v1beta';
process.env.RATE_LIMIT_MAX = '1000';

const { createServer, parseModelJson } = await import('../server/server.js');
const app = createServer();
await new Promise((r) => app.listen(4012, r));
const URL_BASE = 'http://localhost:4012';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : '  ' + detail}`);
  if (!ok) failures++;
};

const post = async (workflow, input) => {
  const r = await fetch(`${URL_BASE}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflow, input }) });
  return { status: r.status, body: await r.json() };
};
const reset = (mode) => { mock.control.mode = mode; mock.control.calls = 0; mock.control.styles.length = 0; mock.control.prompts.length = 0; };

// 1. Status route
{
  const s = await (await fetch(`${URL_BASE}/api/status`)).json();
  check('status: reports AI on when a key is set', s.ai === true && s.provider === 'Gemini');
}

// 2. Every workflow works and the user's inputs reach the prompt
for (const id of ORDER) {
  reset('ok');
  const input = defaultInput(id);
  const { status, body } = await post(id, input);
  check(`${id}: 200 with data`, status === 200 && body.data, JSON.stringify(body).slice(0, 120));
  const prompt = mock.control.prompts[0] || '';
  const sample = Object.values(input).find((v) => typeof v === 'string' && v.length > 3 && v.length < 40) || '';
  check(`${id}: form input appears in the prompt`, prompt.includes(sample), `looked for "${sample}"`);
}
check('request carried the key in a header, not the URL', mock.control.lastHeaders['x-goog-api-key'] === 'test-key');

// 3. Output goes through the validator (a valid answer is unchanged in shape)
for (const id of ORDER) {
  reset('ok');
  const { body } = await post(id, defaultInput(id));
  let ok = true;
  try { validate(id, body.data, defaultInput(id)); } catch (e) { ok = false; }
  check(`${id}: validated output is stable`, ok);
}

// 4. Notices on estimated workflows
for (const id of ['map', 'audit', 'migrate']) {
  reset('ok');
  const { body } = await post(id, defaultInput(id));
  check(`${id}: carries an "estimate" notice`, typeof body.data._notice === 'string');
}
reset('ok');
check('create: has no notice', !(await post('create', defaultInput('create'))).body.data._notice);

// 5. Messy model output
reset('fenced');
check('fenced JSON is accepted', (await post('create', defaultInput('create'))).status === 200);
reset('badjson-once');
{
  const r = await post('personalize', defaultInput('personalize'));
  check('broken JSON is retried once and succeeds', r.status === 200 && mock.control.calls === 2, `calls=${mock.control.calls}`);
}
reset('garbage');
{
  const r = await post('create', defaultInput('create'));
  check('invalid answer is rejected after one retry', r.status === 502 && mock.control.calls === 2 && /incomplete/.test(r.body.error));
}

// 6. API problems become readable messages
reset('quota');
check('429 becomes a rate limit message', (await post('create', defaultInput('create'))).status === 429);
reset('badkey');
{
  const r = await post('create', defaultInput('create'));
  check('bad key gives a helpful message', /GEMINI_API_KEY/.test(r.body.error) && !/test-key/.test(JSON.stringify(r.body)));
}
reset('no-generate');
{
  const r = await post('create', defaultInput('create'));
  check('404 on generateContent falls back to interactions', r.status === 200 && mock.control.styles.join() === 'generateContent,interactions', mock.control.styles.join());
}

// 7. Bad requests
reset('ok');
check('unknown workflow is rejected', (await post('nope', {})).status === 400);
check('non-string input is rejected', (await post('create', { name: { a: 1 }, cms: 'aem', description: 'x' })).status === 400);
check('unknown CMS is rejected', (await post('create', { name: 'x', cms: 'zzz', description: 'x' })).status === 400);
check('oversized input is rejected', (await post('create', { name: 'x', cms: 'aem', description: 'x'.repeat(7000) })).status === 400);
check('no Gemini call was made for rejected requests', mock.control.calls === 0, `calls=${mock.control.calls}`);

// 8. Static files: app is public, secrets are not
{
  const home = await fetch(`${URL_BASE}/`);
  check('app page is served', home.status === 200);
  for (const path of ['/.env', '/server/server.js', '/package.json', '/scripts/ai-test.js', '/../etc/passwd']) {
    const r = await fetch(`${URL_BASE}${path}`);
    check(`not public: ${path}`, r.status === 404, `status ${r.status}`);
  }
}

// 9. Validator unit checks
{
  const input = { ...defaultInput('audit'), checks: ['seo'] };
  const out = validate('audit', { categories: [{ id: 'seo', score: 250, passed: 'x' }, { id: 'perf', score: 10 }], findings: [{ category: 'perf', title: 'x' }, { category: 'seo', severity: 'WEIRD', title: 'y' }], metrics: [{ label: 'LCP' }] }, input);
  check('validator: score clamped to 100', out.categories[0].score === 100);
  check('validator: unrequested checks dropped', out.categories.length === 1 && out.findings.length === 1);
  check('validator: unknown severity becomes moderate', out.findings[0].severity === 'moderate');
  check('validator: metrics removed when perf not selected', out.metrics.length === 0);
  let threw = false;
  try { validate('create', { design: {} }, defaultInput('create')); } catch (e) { threw = true; }
  check('validator: rejects an answer missing required parts', threw);
  check('parseModelJson: finds JSON inside extra text', parseModelJson('Sure! {"a":1} done').a === 1);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll AI checks passed');
app.close(); mock.server.close();
process.exit(failures ? 1 : 0);
