import type { ReactNode } from 'react';
import type { Snapshot } from '../lib/types';
import { findTitleMentions } from '../lib/titleMentions';
import TitleLink from './TitleLink';

/** Vrije tekst (prikbordbericht, chat) waarin genoemde serietitels aanklikbaar
 *  worden. Noemt iemand een serie die de app kent, dan spring je er zo heen. */
export default function RichText({ text, snap, onOpenTitle }: {
  text: string;
  snap: Snapshot;
  onOpenTitle?: (tmdbId: number) => void;
}) {
  if (!onOpenTitle) return <>{text}</>;

  const mentions = findTitleMentions(text, snap.titles);
  if (mentions.length === 0) return <>{text}</>;

  const delen: ReactNode[] = [];
  let pos = 0;
  mentions.forEach((m, i) => {
    if (m.start > pos) delen.push(text.slice(pos, m.start));
    delen.push(
      <TitleLink key={`${m.tmdbId}-${i}`} onOpen={() => onOpenTitle(m.tmdbId)}>
        {text.slice(m.start, m.end)}
      </TitleLink>,
    );
    pos = m.end;
  });
  if (pos < text.length) delen.push(text.slice(pos));

  return <>{delen}</>;
}
