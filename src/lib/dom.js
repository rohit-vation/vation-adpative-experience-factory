/** Small DOM and async helpers. */

/** Escape text so it is safe to put inside an HTML string. */
export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

/** querySelector shortcut. */
export const $ = (selector, root = document) => root.querySelector(selector);

/** querySelectorAll that returns a real array. */
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Promise that resolves after `ms` milliseconds. */
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
