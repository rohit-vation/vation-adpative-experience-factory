/**
 * DISCONNECTED. The whole file is commented out and nothing imports it.
 *
 * Browser side of the OpenAI integration. It posts the prompt to /api/generate,
 * which server/server.js answers. The API key never reaches the browser.
 * To enable: see README.md, "Turning on OpenAI".
 */

// import { SYSTEM_PROMPT } from './system-prompt.js';
// import { PROMPT_BUILDERS } from './prompts.js';
//
// const OPENAI_CONFIG = {
//   endpoint: '/api/generate', // route served by server/server.js
//   model: 'gpt-4.1',          // set to the model you use
//   temperature: 0.2,
//   timeoutMs: 120000
// };
//
// export async function generateWithOpenAI(workflowId, input) {
//   const controller = new AbortController();
//   const timer = setTimeout(() => controller.abort(), OPENAI_CONFIG.timeoutMs);
//
//   try {
//     const response = await fetch(OPENAI_CONFIG.endpoint, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       signal: controller.signal,
//       body: JSON.stringify({
//         model: OPENAI_CONFIG.model,
//         temperature: OPENAI_CONFIG.temperature,
//         messages: [
//           { role: 'system', content: SYSTEM_PROMPT },
//           { role: 'user', content: PROMPT_BUILDERS[workflowId](input) }
//         ]
//       })
//     });
//
//     if (!response.ok) throw new Error('Generation failed with status ' + response.status);
//
//     const data = await response.json();
//     if (!data || typeof data !== 'object') throw new Error('Unexpected response');
//     return data; // same shape as workflow.demo(input), so workflow.render(data) can draw it
//   } finally {
//     clearTimeout(timer);
//   }
// }
