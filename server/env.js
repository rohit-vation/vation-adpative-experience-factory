/**
 * Loads KEY=value lines from the project's .env file into process.env.
 * Tiny stand-in for the "dotenv" package so nothing needs installing.
 * Variables already set in the shell win over the file.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function loadEnv() {
  const path = fileURLToPath(new URL('../.env', import.meta.url));
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    return; // no .env file, that is fine
  }

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!match || line.trim().startsWith('#')) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}
