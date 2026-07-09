// Nette placeholder voor series zonder poster: initiaal op een kleurverloop
// dat per titel vastligt (zelfde serie = zelfde kleur).

function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export default function PosterFallback({ name, width = 72, height = 108 }: { name: string; width?: number; height?: number }) {
  const hue = hueFor(name || '?');
  return (
    <div
      className="poster"
      aria-hidden
      style={{
        width, height, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(160deg, hsl(${hue} 45% 38%), hsl(${(hue + 40) % 360} 50% 24%))`,
        color: 'rgba(255,255,255,0.85)',
        fontWeight: 800,
        fontSize: Math.round(height / 3.2),
      }}
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </div>
  );
}
