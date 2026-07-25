import { useState } from 'react';
import { posterUrl } from '../lib/types';
import PosterFallback from './PosterFallback';

/** De grote poster op een kaart (lijst, ontdekken, tips). Valt netjes terug op
 *  de initiaal-placeholder als er geen poster is óf als het laden mislukt.
 *  Voor kleine miniatuurtjes met eigen afmetingen: zie `Thumb`. */
export default function Poster({ path, name }: { path: string | null | undefined; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!path || failed) return <PosterFallback name={name} />;
  return (
    <img
      className="poster"
      src={posterUrl(path)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
