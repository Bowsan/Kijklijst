import { useEffect, useState } from 'react';

/** Het scroll-element van de app (zie styles.css): #root, niet het document. */
export const scroller = () => document.getElementById('root');

/** Volgt hoe ver de app gescrold is, voor twee losse UI-signalen:
 *  - `showScrollTop`: de "terug naar boven"-knop verschijnt na een eind scrollen.
 *  - `headerScrolled`: zodra de topbar weg is, staat de tabbalk los en krijgt
 *    die een subtiele schaduw. */
export function useScrollState() {
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  useEffect(() => {
    const el = scroller();
    if (!el) return;
    const onScroll = () => {
      setShowScrollTop(el.scrollTop > 500);
      setHeaderScrolled(el.scrollTop > 40);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  return { showScrollTop, headerScrolled };
}
