/**
 * Test-only Gemini protocol mock.
 *
 * Imported by scripts/ai-test.js to exercise server-side request parsing,
 * validation, retries and upstream error handling without paid API calls.
 * There is intentionally no standalone server entry point or application fallback.
 *
 * Tests select behavior on the returned control object:
 *   ok, fenced, badjson-once, garbage, no-generate, quota, badkey
 */

import http from 'node:http';
import { responseFixture } from './response-fixtures.js';

const FIRST_LINES = {
  'Create a reusable component.': 'create',
  'Map components from one CMS to another.': 'map',
  'Audit a': 'audit',
  'Plan a content migration.': 'migrate',
};

function workflowOf(prompt) {
  const first = prompt.split('\n')[0];
  const key = Object.keys(FIRST_LINES).find((k) => first.startsWith(k));
  return FIRST_LINES[key];
}

export function startMock(port = 4010) {
  const control = { mode: 'ok', calls: 0, styles: [], prompts: [] };

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    control.calls++;

    const isInteractions = req.url.includes('/interactions');
    control.styles.push(isInteractions ? 'interactions' : 'generateContent');
    control.lastHeaders = req.headers;
    const prompt = isInteractions ? body.input : body.contents?.[0]?.parts?.[0]?.text;
    control.prompts.push(prompt);

    const send = (status, json) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(json)); };

    if (control.mode === 'quota') return send(429, { error: { message: 'Quota exceeded' } });
    if (control.mode === 'badkey') return send(400, { error: { message: 'API key not valid. Please pass a valid API key.' } });
    if (control.mode === 'no-generate' && !isInteractions) return send(404, { error: { message: 'model not found' } });

    const id = workflowOf(prompt || '');
    if (!id) return send(400, { error: { message: 'mock: unknown prompt' } });

    let text = JSON.stringify(responseFixture(id));
    if (control.mode === 'fenced') text = '```json\n' + text + '\n```';
    if (control.mode === 'garbage') text = JSON.stringify({ hello: 'world' });
    if (control.mode === 'badjson-once' && control.calls % 2 === 1) text = '{"oops": ';

    if (isInteractions) return send(200, { steps: [{ content: [{ type: 'text', text }] }] });
    return send(200, { candidates: [{ content: { parts: [{ text }] } }] });
  });

  return new Promise((resolve) => server.listen(port, () => resolve({ server, control, port })));
}

