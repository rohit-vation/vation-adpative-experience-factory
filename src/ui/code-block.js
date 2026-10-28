/**
 * Code blocks with a file name header and a Copy button.
 *
 *   codeHTML({ name, lang, code })  ->  one code block
 *   fileTabs([{ name, lang, code }]) ->  one tab per file, each holding a code block
 *   handleCopyClick(target)         ->  true if the click was on a Copy button
 */

import { esc } from '../lib/dom.js';
import { tabsHTML } from './tabs.js';

export function codeHTML(file) {
  return (
    `<figure class="code">` +
    `<figcaption>` +
    `<span class="fname" title="${esc(file.name)}">${esc(file.name)}</span>` +
    `<span class="fmeta"><span>${esc(file.lang)}</span>` +
    `<button type="button" class="copy" data-copy>Copy</button></span>` +
    `</figcaption>` +
    `<pre tabindex="0"><code>${esc(file.code)}</code></pre>` +
    `</figure>`
  );
}

/** Tab labels use the file's base name, the full path stays in the code header. */
export function fileTabs(files) {
  return tabsHTML(files.map((f) => ({ label: f.name.split('/').pop(), html: codeHTML(f) })));
}

function flash(button, text) {
  button.textContent = text;
  setTimeout(() => { button.textContent = 'Copy'; }, 1400);
}

export async function handleCopyClick(target) {
  const button = target.closest('[data-copy]');
  if (!button) return false;

  const code = button.closest('.code').querySelector('code');
  try {
    await navigator.clipboard.writeText(code.textContent);
    flash(button, 'Copied');
  } catch (err) {
    // Clipboard blocked: select the text so the person can press Ctrl+C.
    const range = document.createRange();
    range.selectNodeContents(code);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    flash(button, 'Press Ctrl+C');
  }
  return true;
}
