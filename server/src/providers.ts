// Streamingdiensten van TMDb komen in veel varianten binnen
// ("Apple TV", "Apple TV Amazon Channel", "Crunchyroll Amazon Channel",
// "MGM Amazon Channel", "NPO Start", …). We voegen die samen tot één naam,
// zodat dezelfde dienst niet dubbel in filters en gokken belandt.

export function canonicalProvider(name: string): string {
  let n = (name || '').trim();
  if (!n) return n;

  // "X Amazon Channel" / "X Apple TV Channel" / "X Channel" → "X"
  n = n.replace(/\s+Amazon\s+Channel$/i, '');
  n = n.replace(/\s+Apple\s*TV\s+Channel$/i, '');
  n = n.replace(/\s+Channel$/i, '');
  n = n.trim();

  // Apple TV-varianten (Apple TV, Apple TV+, Apple TV Plus) samenvoegen.
  if (/^apple\s*tv(\s*\+|\s+plus)?$/i.test(n)) n = 'Apple TV';

  // NPO Plus en NPO Start samenvoegen.
  if (/^npo\s+(plus|start)$/i.test(n)) n = 'NPO Plus';

  return n.trim();
}

/** Normaliseer een lijst providers en haal dubbelen eruit (volgorde behouden). */
export function canonicalProviders(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const c = canonicalProvider(raw);
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}
