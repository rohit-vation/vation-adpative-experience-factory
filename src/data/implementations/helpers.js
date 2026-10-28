/**
 * Placeholder filling for the sample code files.
 *
 * The code samples are written as plain template strings with these tokens:
 *
 *   {{P}}   PascalCase name   HeroBanner
 *   {{K}}   kebab-case name   hero-banner
 *   {{C}}   camelCase name    heroBanner
 *   {{T}}   the name as typed Hero Banner
 *   %{      becomes a dollar-brace, so HTL and similar syntax can be written
 *           inside a JavaScript template string without being interpolated
 *
 * Usage inside a CMS file:
 *
 *   const { file } = context(name);
 *   return [ file('path/{{K}}.html', 'htl', `...code with tokens...`) ];
 */

import { pascal, kebab, camel } from '../../lib/text.js';

export function context(name) {
  const tokens = { P: pascal(name), K: kebab(name), C: camel(name), T: name };

  const fill = (text) => {
    let out = text.replaceAll('%{', '${');
    for (const [key, value] of Object.entries(tokens)) {
      out = out.replaceAll(`{{${key}}}`, value);
    }
    return out;
  };

  /** One sample file: { name, lang, code } with tokens filled in. */
  const file = (path, lang, code) => ({ name: fill(path), lang, code: fill(code) });

  return { ...tokens, file };
}
