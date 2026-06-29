import { useRef, useState } from 'react';
import type { Snapshot } from '../lib/types';
import { saveProfile, saveRating } from '../lib/api';
import { setBlind, logout } from '../lib/identity';
import { NL_SERVICES } from '../lib/services';
import { profileById } from '../lib/compute';
import Avatar from './Avatar';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportMyList(snap: Snapshot, userId: string, myName: string) {
  const data = snap.ratings
    .filter((r) => r.user_id === userId)
    .map((r) => {
      const title = snap.titles.find((t) => t.tmdb_id === r.title_id);
      return {
        tmdb_id: r.title_id,
        name: title?.name ?? null,
        year: title?.year ?? null,
        score: r.score,
        status: r.status,
        seasons: r.seasons,
        service: r.service,
        note: r.note,
      };
    });
  downloadJson(data, `kijklijst-${(myName || 'mijn').replace(/\s+/g, '-').toLowerCase()}-${today()}.json`);
}

function exportGroupList(snap: Snapshot) {
  const data = {
    exported_at: new Date().toISOString(),
    titles: snap.titles.map((t) => ({
      tmdb_id: t.tmdb_id,
      name: t.name,
      year: t.year,
      genres: t.genres,
      season_count: t.seasons.length,
    })),
    ratings: snap.ratings.map((r) => {
      const title = snap.titles.find((t) => t.tmdb_id === r.title_id);
      const profile = snap.profiles.find((p) => p.id === r.user_id);
      return {
        tmdb_id: r.title_id,
        name: title?.name ?? null,
        user: profile?.name ?? r.user_id,
        score: r.score,
        status: r.status,
        seasons: r.seasons,
        service: r.service,
        note: r.note,
      };
    }),
  };
  downloadJson(data, `kijklijst-groep-${today()}.json`);
}

interface Props {
  snap: Snapshot;
  userId: string;
  blind: boolean;
  setBlindState: (v: boolean) => void;
  onChange: () => void;
  onShare: () => void;
  toast: (m: string) => void;
}

// Schaal een gekozen afbeelding terug naar een klein vierkant, zodat hij vlot laadt.
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const min = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Profile({ snap, userId, blind, setBlindState, onChange, onShare, toast }: Props) {
  const me = profileById(snap, userId);
  const [name, setName] = useState(me?.name || '');
  const [avatar, setAvatar] = useState<string | null>(me?.avatar || null);
  const [services, setServices] = useState<string[]>(me?.services || []);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const items: any[] = Array.isArray(data) ? data : [];
      if (!items.length) { toast('Geen geldige items gevonden'); return; }
      let ok = 0, fail = 0;
      for (const item of items) {
        if (!item.tmdb_id) { fail++; continue; }
        try {
          await saveRating({
            tmdb_id: item.tmdb_id,
            ...(item.score != null ? { score: item.score } : {}),
            ...(item.status ? { status: item.status } : {}),
            ...(Array.isArray(item.seasons) ? { seasons: item.seasons } : {}),
            ...(item.service ? { service: item.service } : {}),
            ...(item.note ? { note: item.note } : {}),
          });
          ok++;
        } catch { fail++; }
      }
      onChange();
      toast(`${ok} serie${ok !== 1 ? 's' : ''} geïmporteerd${fail ? `, ${fail} mislukt` : ''}`);
    } catch {
      toast('Ongeldig JSON-bestand');
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  const save = async (patch?: { services?: string[]; avatar?: string | null; name?: string }) => {
    const next = {
      name: patch?.name ?? name,
      avatar: patch?.avatar !== undefined ? patch.avatar : avatar,
      services: patch?.services ?? services,
    };
    if (!next.name.trim()) return;
    try {
      await saveProfile(next);
      onChange();
      toast('Profiel opgeslagen');
    } catch (e: any) {
      toast(e.message || 'Opslaan mislukt');
    }
  };

  const toggleService = (s: string) => {
    const next = services.includes(s) ? services.filter((x) => x !== s) : [...services, s];
    setServices(next);
    save({ services: next });
  };

  const pickAvatar = async (file: File) => {
    try {
      const data = await resizeImage(file);
      setAvatar(data);
      save({ avatar: data });
    } catch {
      toast('Kon foto niet laden');
    }
  };

  return (
    <div className="page">
      <h2>Jouw profiel</h2>
      <div className="card">
        <div className="row" style={{ gap: 14 }}>
          <div onClick={() => fileRef.current?.click()} style={{ cursor: 'pointer' }}>
            {avatar ? <Avatar profile={{ ...(me as any), avatar, name }} size="lg" /> : <Avatar id={userId} name={name || '?'} size="lg" />}
          </div>
          <div style={{ flex: 1 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => save()} placeholder="Je naam" />
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()}>📷 Foto kiezen</button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && pickAvatar(e.target.files[0])} />
      </div>

      <h2>Mijn streamingdiensten</h2>
      <p className="muted" style={{ fontSize: 13, margin: '0 4px 8px' }}>Optioneel — helpt de app raden waar je een serie keek.</p>
      <div className="service-grid">
        {NL_SERVICES.map((s) => (
          <button key={s} className={services.includes(s) ? 'sel' : ''} onClick={() => toggleService(s)}>{s}</button>
        ))}
      </div>

      <h2>Instellingen</h2>
      <div className="card">
        <div className="toggle">
          <div>
            <div>Blind cijferen</div>
            <div className="muted" style={{ fontSize: 12 }}>Zie de cijfers van de groep pas nadat je zelf een cijfer gaf.</div>
          </div>
          <button
            className={`switch ${blind ? 'on' : ''}`}
            onClick={() => { const v = !blind; setBlind(v); setBlindState(v); }}
          >
            <span className="knob" />
          </button>
        </div>
      </div>

      <button className="btn full" style={{ marginTop: 12 }} onClick={onShare}>🔗 Vrienden erbij halen</button>

      <h2>Gegevens</h2>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Exporteren</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Download een JSON-bestand als back-up of om handmatig te bewerken.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn ghost" onClick={() => exportMyList(snap, userId, me?.name || '')}>⬇ Mijn lijst</button>
            <button className="btn ghost" onClick={() => exportGroupList(snap)}>⬇ Volledige lijst</button>
          </div>
        </div>
        <hr style={{ border: 'none', borderTop: '1px solid var(--surface-2)', margin: 0 }} />
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Importeren</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Upload een eerder geëxporteerde "Mijn lijst" JSON om je beoordelingen terug te zetten of samen te voegen.</div>
          <button className="btn ghost" disabled={importing} onClick={() => importRef.current?.click()}>
            {importing ? 'Bezig…' : '⬆ Bestand kiezen'}
          </button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
        </div>
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--surface-2)' }}>
        {confirmLogout ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Weet je het zeker? Je wordt uitgelogd en moet opnieuw inloggen met je naam.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ color: '#e55', flex: 1 }} onClick={() => { logout(); window.location.reload(); }}>Uitloggen</button>
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => setConfirmLogout(false)}>Annuleer</button>
            </div>
          </div>
        ) : (
          <button className="btn ghost full" style={{ color: 'var(--muted)' }} onClick={() => setConfirmLogout(true)}>Uitloggen</button>
        )}
      </div>
    </div>
  );
}
