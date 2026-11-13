/** Small shared JSON decoder for model replies; it never executes or evaluates model text. */
export function parseModelJson(value) {
  if (typeof value !== 'string') throw new Error('Model response was not text.');
  const clean = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); }
  catch (firstError) {
    const starts = [...clean.matchAll(/[{\[]/g)].map((match) => match.index);
    for (const start of starts) {
      const opener = clean[start];
      const closer = opener === '{' ? '}' : ']';
      const end = clean.lastIndexOf(closer);
      if (end > start) {
        try { return JSON.parse(clean.slice(start, end + 1)); } catch { /* try next candidate */ }
      }
    }
    throw new Error(`Model response was not valid JSON: ${firstError.message}`);
  }
}
