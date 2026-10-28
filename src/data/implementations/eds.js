/** Sample Edge Delivery Services implementation: authoring table, block JS, block CSS. */

import { context } from './helpers.js';
import { cssFor } from './css-template.js';

export function edsFiles(name) {
  const { K, file } = context(name);

  return [
    file('Authoring table (Word, Google Docs or Document Authoring)', 'table', `| {{T}} (center)                          |
| --------------------------------------- |
| [background image]                      |
| # Build once, publish anywhere          |
| Reuse one component across every site.  |
| [Explore the platform](/platform)       |`),

    file('blocks/{{K}}/{{K}}.js', 'js', `/**
 * Decorates the {{T}} block.
 * Row 1: picture. Row 2: heading, text and link.
 * Variant: add "center" in the block name to center the text.
 */
export default function decorate(block) {
  const [pictureRow, contentRow] = [...block.children];

  const picture = pictureRow?.querySelector('picture');
  const img = picture?.querySelector('img');
  if (img) {
    img.loading = 'eager';
    img.setAttribute('fetchpriority', 'high');
    picture.classList.add('{{K}}__image');
  }

  contentRow?.classList.add('{{K}}__content');
  contentRow?.querySelector('h1, h2')?.classList.add('{{K}}__title');

  const cta = contentRow?.querySelector('a');
  if (cta) {
    cta.classList.add('{{K}}__cta');
    cta.closest('p')?.classList.remove('button-container');
  }

  if (picture) block.prepend(picture);
  pictureRow?.remove();
}`),

    file('blocks/{{K}}/{{K}}.css', 'css', cssFor(K, '.' + K + '.center'))
  ];
}
