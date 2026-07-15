import { useState } from 'react';
import { posterUrl } from '../lib/types';
import PosterFallback from './PosterFallback';

/** Kleine posterminiatuur met nette terugval op een initiaal-placeholder —
    ook als de afbeelding niet kan laden (traag netwerk, TMDb-hapering). */
export default function Thumb({ path, name, w = 44, h = 66, radius = 6 }: {
  path: string | null | undefined;
  name: string;
  w?: number;
  h?: number;
  radius?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (!path || failed) return <PosterFallback name={name} width={w} height={h} />;
  return (
    <img
      src={posterUrl(path, 'small')}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: w, height: h, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }}
    />
  );
}
