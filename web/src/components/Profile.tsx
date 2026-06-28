import { useRef, useState } from 'react';
import type { Snapshot } from '../lib/types';
import { saveProfile } from '../lib/api';
import { setBlind } from '../lib/identity';
import { NL_SERVICES } from '../lib/services';
import { profileById } from '../lib/compute';
import Avatar from './Avatar';

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
    </div>
  );
}
