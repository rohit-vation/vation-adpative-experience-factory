/** Text helpers for naming things and reading user input. */

/** Split on anything that is not a letter or digit. */
const words = (s) => String(s).trim().split(/[^A-Za-z0-9]+/).filter(Boolean);

/** "hero banner" -> "HeroBanner" */
export const pascal = (s) =>
  words(s).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Component';

/** "Hero Banner" -> "hero-banner" */
export const kebab = (s) =>
  words(s).map((w) => w.toLowerCase()).join('-') || 'component';

/** "Hero Banner" -> "heroBanner" */
export const camel = (s) => {
  const p = pascal(s);
  return p[0].toLowerCase() + p.slice(1);
};

/** Turn a comma or line separated text area into a clean list. */
export const items = (s) =>
  String(s).split(/\n|,/).map((x) => x.trim()).filter(Boolean);

/** "https://www.example.com/a" -> "example.com". Falls back to "example.com". */
export const hostOf = (url) => {
  try {
    const withProtocol = /^https?:\/\//i.test(url) ? url : 'https://' + url;
    return new URL(withProtocol).hostname.replace(/^www\./, '');
  } catch (e) {
    return 'example.com';
  }
};
