import { colorFor } from '../lib/identity';
import type { Profile } from '../lib/types';

interface Props {
  profile?: Profile;
  id?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export default function Avatar({ profile, id, name, size = 'md' }: Props) {
  const cls = `avatar${size === 'md' ? '' : ' ' + size}`;
  const displayName = profile?.name || name || '?';
  const userId = profile?.id || id || displayName;
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';
  const color = profile?.color || colorFor(userId);

  if (profile?.avatar) {
    return <img className={cls} src={profile.avatar} alt={displayName} />;
  }
  return (
    <div className={cls} style={{ background: color }} title={displayName}>
      {initial}
    </div>
  );
}
