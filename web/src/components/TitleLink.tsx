import type { ReactNode } from 'react';

/** Een serietitel die je aantikt om naar die serie te gaan. Krijgt overal
 *  dezelfde subtiele accentkleur, zodat je aan de opmaak ziet dat het ergens
 *  heen leidt (in plaats van alleen vet). */
export default function TitleLink({ children, onOpen }: {
  children: ReactNode;
  onOpen: () => void;
}) {
  return (
    <span
      className="tlink"
      role="link"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onOpen(); }
      }}
    >
      {children}
    </span>
  );
}
