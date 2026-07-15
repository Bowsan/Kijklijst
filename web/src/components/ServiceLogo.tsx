import type { Snapshot } from '../lib/types';
import { serviceLogoUrl } from '../lib/types';

/** Klein dienstlogo (TMDb) vóór een dienstnaam. Rendert niets zolang het
    logo nog niet bekend is — dan blijft het gewoon nette tekst. */
export default function ServiceLogo({ snap, name, size = 15 }: { snap: Snapshot; name: string; size?: number }) {
  const path = snap.service_logos?.find((l) => l.name === name)?.logo_path;
  if (!path) return null;
  return (
    <img
      className="svc-inline"
      src={serviceLogoUrl(path)}
      alt=""
      style={{ width: size, height: size }}
      decoding="async"
    />
  );
}
