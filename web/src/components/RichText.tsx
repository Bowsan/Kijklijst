import type { ReactNode } from 'react';
import type { Snapshot } from '../lib/types';
import { findTitleMentions } from '../lib/titleMentions';
import { findMentions } from '../lib/mentions';
import TitleLink from './TitleLink';

interface Stuk {
  start: number;
  end: number;
  soort: 'titel' | 'persoon';
  id: number | string;
}

/** Vrije tekst (prikbordbericht, chat) waarin genoemde serietitels en met "@"
 *  genoemde vrienden aanklikbaar worden. */
export default function RichText({ text, snap, onOpenTitle, onOpenProfile }: {
  text: string;
  snap: Snapshot;
  onOpenTitle?: (tmdbId: number) => void;
  onOpenProfile?: (userId: string) => void;
}) {
  const stukken: Stuk[] = [];

  // Vermeldingen eerst: die zijn expliciet getypt en gaan bij overlap voor.
  if (onOpenProfile) {
    for (const m of findMentions(text, snap.profiles)) {
      stukken.push({ start: m.start, end: m.end, soort: 'persoon', id: m.userId });
    }
  }
  if (onOpenTitle) {
    for (const m of findTitleMentions(text, snap.titles)) {
      const overlapt = stukken.some((s) => m.start < s.end && s.start < m.end);
      if (!overlapt) stukken.push({ start: m.start, end: m.end, soort: 'titel', id: m.tmdbId });
    }
  }

  if (stukken.length === 0) return <>{text}</>;
  stukken.sort((a, b) => a.start - b.start);

  const delen: ReactNode[] = [];
  let pos = 0;
  stukken.forEach((s, i) => {
    if (s.start > pos) delen.push(text.slice(pos, s.start));
    const label = text.slice(s.start, s.end);
    delen.push(
      s.soort === 'titel' ? (
        <TitleLink key={`t-${i}`} onOpen={() => onOpenTitle!(Number(s.id))}>{label}</TitleLink>
      ) : (
        <TitleLink key={`p-${i}`} onOpen={() => onOpenProfile!(String(s.id))}>{label}</TitleLink>
      ),
    );
    pos = s.end;
  });
  if (pos < text.length) delen.push(text.slice(pos));

  return <>{delen}</>;
}
