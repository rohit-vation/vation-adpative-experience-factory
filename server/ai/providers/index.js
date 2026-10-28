/**
 * The list of providers. To add another one (Claude, Mistral, ...):
 *   1. copy openai.js or gemini.js to a new file in this folder
 *   2. change the request and the place the text is read from
 *   3. add it to PROVIDERS below
 * Nothing else in the project needs to change.
 */

import { gemini } from './gemini.js';
import { openai } from './openai.js';

export const PROVIDERS = { gemini, openai };
