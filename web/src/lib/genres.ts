// Passende emoji per genre. Werkt op zowel de Nederlandse (nl-NL) als Engelse
// TMDb-genrenamen via losse trefwoorden (eerste match wint).
const GENRE_EMOJI: [RegExp, string][] = [
  [/sci-?fi|science|fantas/i, '🚀'],
  [/action|actie|avontuur|adventure/i, '💥'],
  [/animat/i, '🎨'],
  [/comedy|komedie/i, '😄'],
  [/crime|misdaad/i, '🕵️'],
  [/document/i, '🎬'],
  [/myster/i, '🔍'],
  [/war|oorlog|politic|politiek/i, '⚔️'],
  [/reality/i, '📺'],
  [/famil/i, '👨‍👩‍👧'],
  [/kid|kinder|jeugd/i, '🧸'],
  [/west/i, '🤠'],
  [/soap/i, '💧'],
  [/talk/i, '🎙️'],
  [/news|nieuws/i, '📰'],
  [/drama/i, '🎭'],
];

export function genreEmoji(name: string): string {
  for (const [re, emoji] of GENRE_EMOJI) if (re.test(name)) return emoji;
  return '🎞️';
}
