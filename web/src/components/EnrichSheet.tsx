import { useRef, useState } from 'react';
import type { Title } from '../lib/types';
import { posterUrl } from '../lib/types';
import { enrichTitle, setTitleMeta } from '../lib/api';
import Sheet from './Sheet';

interface Props {
  title: Title;
  onClose: () => void;
  onChange: () => void;
  toast: (m: string) => void;
}

// Cover terugschalen tot een handzame breedte, zodat hij vlot laadt en klein blijft.
function resizeCover(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 342;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function EnrichSheet({ title, onClose, onChange, toast }: Props) {
  const [imdb, setImdb] = useState(title.imdb_id ? `https://www.imdb.com/title/${title.imdb_id}/` : '');
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(false);
  const [year, setYear] = useState(title.year ? String(title.year) : '');
  const [genres, setGenres] = useState(title.genres.join(', '));
  const [cover, setCover] = useState<string | null>(title.poster_path || null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchImdb = async () => {
    if (!imdb.trim()) { toast('Plak eerst een IMDb-link'); return; }
    setLoading(true);
    try {
      const { found, source } = await enrichTitle(title.tmdb_id, imdb.trim());
      if (found) {
        toast(`Serie-info aangevuld via ${source}`);
        onChange();
        onClose();
      } else {
        setManual(true);
        toast('Niets gevonden — vul de gegevens hieronder zelf aan');
      }
    } catch (e: any) {
      toast(e.message || 'Ophalen mislukt');
      setManual(true);
    } finally {
      setLoading(false);
    }
  };

  const pickCover = async (file: File) => {
    try { setCover(await resizeCover(file)); }
    catch { toast('Kon afbeelding niet laden'); }
  };

  const saveManual = async () => {
    try {
      await setTitleMeta(title.tmdb_id, {
        year: year ? Number(year) : null,
        genres,
        ...(cover ? { poster: cover } : {}),
      });
      toast('Serie-info opgeslagen');
      onChange();
      onClose();
    } catch (e: any) { toast(e.message || 'Opslaan mislukt'); }
  };

  return (
    <Sheet title="Serie-info aanvullen" onClose={onClose}>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Plak de IMDb-link van <b>{title.name}</b>. We proberen jaar, genres, poster en seizoenen
        automatisch op te halen (via TMDb en TVmaze).
      </p>

      <label className="muted" style={{ fontSize: 13, display: 'block', margin: '8px 0 4px' }}>IMDb-link of -id</label>
      <input
        value={imdb}
        onChange={(e) => setImdb(e.target.value)}
        placeholder="https://www.imdb.com/title/tt1234567/"
        autoFocus
      />
      <button className="btn primary full" style={{ marginTop: 10 }} disabled={loading} onClick={fetchImdb}>
        {loading ? 'Bezig met ophalen…' : '🔎 Ophalen via IMDb'}
      </button>

      <button
        className="btn ghost full"
        style={{ marginTop: 8, color: 'var(--muted)', fontSize: 13 }}
        onClick={() => setManual((v) => !v)}
      >
        {manual ? 'Handmatig invullen verbergen' : 'Of vul de gegevens zelf in'}
      </button>

      {manual && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div onClick={() => fileRef.current?.click()} style={{ cursor: 'pointer', flexShrink: 0 }}>
              {cover
                ? <img src={posterUrl(cover)} alt="" style={{ width: 72, height: 108, borderRadius: 8, objectFit: 'cover' }} />
                : <div className="poster" style={{ width: 72, height: 108, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📷</div>}
            </div>
            <div style={{ flex: 1 }}>
              <label className="muted" style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Coverafbeelding</label>
              <button className="btn ghost" onClick={() => fileRef.current?.click()}>📷 Kies foto</button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && pickCover(e.target.files[0])} />
            </div>
          </div>

          <div>
            <label className="muted" style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Jaar</label>
            <input type="number" min={1900} max={2100} value={year} onChange={(e) => setYear(e.target.value)} placeholder="Bijv. 2021" />
          </div>

          <div>
            <label className="muted" style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Genres (met komma's)</label>
            <input value={genres} onChange={(e) => setGenres(e.target.value)} placeholder="Drama, Misdaad" />
          </div>

          <button className="btn primary full" onClick={saveManual}>Opslaan</button>
        </div>
      )}
    </Sheet>
  );
}
