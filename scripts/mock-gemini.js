/**
 * A fake Gemini server for testing. It answers in Gemini's response format using the
 * hardcoded demo results, so the whole AI path can be exercised without a key or network.
 *
 *   node scripts/mock-gemini.js            listens on :4010
 *   then:  GEMINI_API_KEY=test GEMINI_BASE_URL=http://localhost:4010/v1beta npm start
 *
 * Behaviour switches (set on the returned control object, or MOCK_MODE when run directly):
 *   ok            valid answers (default)
 *   fenced        answer wrapped in ```json fences
 *   badjson-once  first answer is broken, the retry is fine
 *   garbage       always an answer that fails validation
 *   no-generate   generateContent returns 404 (tests the fallback to "interactions")
 *   quota         HTTP 429
 *   badkey        HTTP 400 "API key not valid"
 */

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { WORKFLOWS } from '../src/workflows/index.js';
import { defaultInput } from './sample-inputs.js';

const FIRST_LINES = {
  'Create a reusable component.': 'create',
  'Map components from one CMS to another.': 'map',
  'Audit a': 'audit',
  'Plan a content migration.': 'migrate',
  'Prepare personalization blocks.': 'personalize'
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

    let text = JSON.stringify(WORKFLOWS[id].demo(defaultInput(id)));
    if (control.mode === 'fenced') text = '```json\n' + text + '\n```';
    if (control.mode === 'garbage') text = JSON.stringify({ hello: 'world' });
    if (control.mode === 'badjson-once' && control.calls % 2 === 1) text = '{"oops": ';

    if (isInteractions) return send(200, { steps: [{ content: [{ type: 'text', text }] }] });
    return send(200, { candidates: [{ content: { parts: [{ text }] } }] });
  });

  return new Promise((resolve) => server.listen(port, () => resolve({ server, control, port })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { control, port } = await startMock(4010);
  control.mode = process.env.MOCK_MODE || 'ok';
  console.log(`Mock Gemini on http://localhost:${port}/v1beta (mode: ${control.mode})`);
}
