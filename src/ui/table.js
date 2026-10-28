/**
 * tableHTML(headings, rows, numericColumns)
 *
 *   headings        plain text, escaped here
 *   rows            array of arrays of HTML strings. Escape user text before passing it in.
 *   numericColumns  indexes of columns to right-align (optional)
 */

import { esc } from '../lib/dom.js';

export function tableHTML(headings, rows, numericColumns = []) {
  const cls = (i) => (numericColumns.includes(i) ? ' class="num"' : '');

  const head = headings.map((h, i) => `<th${cls(i)}>${esc(h)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${row.map((cell, i) => `<td${cls(i)}>${cell}</td>`).join('')}</tr>`)
    .join('');

  return `<div class="tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
