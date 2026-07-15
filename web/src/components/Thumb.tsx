import { posterUrl } from '../lib/types';
import PosterFallback from './PosterFallback';

/** Kleine posterminiatuur met nette terugval op een initiaal-placeholder.
    Eén component voor alle rijtjes (dashboard, profielen, tips, onboarding). */
export default function Thumb({ path, name, w = 44, h = 66, radius = 6 }: {
  path: string | null | undefined;
  name: string;
  w?: number;
  h?: number;
  radius?: number;
}) {
  return path
    ? <img src={posterUrl(path, 'small')} alt="" loading="lazy" style={{ width: w, height: h, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }} />
    : <PosterFallback name={name} width={w} height={h} />;
}
