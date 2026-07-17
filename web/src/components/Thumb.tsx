import { useState } from 'react';
import { posterUrl } from '../lib/types';
import PosterFallback from './PosterFallback';

/** Kleine posterminiatuur met nette terugval op een initiaal-placeholder —
    ook als de afbeelding niet kan laden (traag netwerk, TMDb-hapering).
    Eén automatische nieuwe poging vangt tijdelijke hikjes op; bewust geen
    lazy-loading (haperend op iOS binnen een scroll-container) — dit zijn
    kleine bestandjes. */
export default function Thumb({ path, name, w = 44, h = 66, radius = 6 }: {
  path: string | null | undefined;
  name: string;
  w?: number;
  h?: number;
  radius?: number;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  if (!path || failed) return <PosterFallback name={name} width={w} height={h} />;
  return (
    <img
      key={attempt}
      src={posterUrl(path, 'small')}
      alt=""
      decoding="async"
      onError={() => {
        if (attempt === 0) setTimeout(() => setAttempt(1), 1200);
        else setFailed(true);
      }}
      style={{ width: w, height: h, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }}
    />
  );
}
