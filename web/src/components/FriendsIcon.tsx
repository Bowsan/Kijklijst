import type { CSSProperties } from 'react';

// Het blauwe vrienden-icoon uit de kopbalk (public/icons/top-friends.png),
// zodat "vrienden" er door de hele app consistent hetzelfde uitziet i.p.v. de
// oude 👥-emoji. `size` bepaalt breedte/hoogte in px.
export default function FriendsIcon({
  size = 18,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <img
      src="/icons/top-friends.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain', verticalAlign: 'middle', flexShrink: 0, ...style }}
    />
  );
}
