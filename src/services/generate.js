/**
 * generate(workflow, input, onStep) -> Promise<data>
 *
 * The single place that decides where results come from.
 *
 *   AI PATH    when the server has a GEMINI_API_KEY (see src/ai/ai-client.js)
 *   DEMO PATH  otherwise: the hardcoded result from workflow.demo()
 *
 * Both return the same data shape, so render() does not care which one ran.
 * The result is tagged with _source ("ai" or "demo") so the screen can label it.
 */

import { wait } from '../lib/dom.js';
import { DEMO_STEP_DELAY } from '../config.js';
import { aiState, generateWithAI, providerLabel } from '../ai/ai-client.js';

export async function generate(workflow, input, onStep) {
  // ---- AI PATH ----
  if (aiState.enabled) {
    onStep(`Asking ${providerLabel()} (${aiState.model}). This can take up to a minute`);
    const data = await generateWithAI(workflow.id, input);
    return { ...data, _source: 'ai' };
  }

  // ---- DEMO PATH: hardcoded values, no network call ----
  for (const step of workflow.steps) {
    onStep(step);
    await wait(DEMO_STEP_DELAY);
  }
  return { ...workflow.demo(input), _source: 'demo' };
}
