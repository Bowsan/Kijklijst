import { useState } from 'react';
import Sheet from './Sheet';
import { NL_SERVICES } from '../lib/services';

interface Props {
  initialName: string;
  onClose: () => void;
  onConfirm: (name: string, service: string, seasons: number) => void;
}

export default function ManualAddSheet({ initialName, onClose, onConfirm }: Props) {
  const [name, setName] = useState(initialName);
  const [service, setService] = useState('');
  const [custom, setCustom] = useState('');
  const [seasons, setSeasons] = useState('1');

  const submit = () => {
    const finalName = name.trim();
    if (!finalName) return;
    const finalService = service === '__anders__' ? custom.trim() : service;
    const n = Math.max(0, Math.min(100, Math.floor(Number(seasons) || 0)));
    onConfirm(finalName, finalService, n);
  };

  return (
    <Sheet title="Serie handmatig toevoegen" onClose={onClose}>
      <p className="muted" style={{ fontSize: 13 }}>
        Staat een serie niet in de zoekresultaten? Voeg hem hier zelf toe. Je kunt hem daarna gewoon beoordelen en aanraden aan vrienden.
      </p>

      <label className="muted" style={{ fontSize: 13, display: 'block', margin: '8px 0 4px' }}>Naam van de serie</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bijv. Alone USA" autoFocus />

      <label className="muted" style={{ fontSize: 13, display: 'block', margin: '12px 0 4px' }}>Waar kijk je het? (optioneel)</label>
      <select value={service} onChange={(e) => setService(e.target.value)}>
        <option value="">Onbekend</option>
        {NL_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
        <option value="__anders__">Anders…</option>
      </select>
      {service === '__anders__' && (
        <input
          placeholder="Naam van de dienst"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          style={{ marginTop: 8 }}
        />
      )}

      <label className="muted" style={{ fontSize: 13, display: 'block', margin: '12px 0 4px' }}>Aantal seizoenen</label>
      <input
        type="number"
        min={0}
        max={100}
        value={seasons}
        onChange={(e) => setSeasons(e.target.value)}
        placeholder="Bijv. 10"
      />

      <button className="btn primary full" style={{ marginTop: 16 }} disabled={!name.trim()} onClick={submit}>
        Toevoegen aan mijn lijst
      </button>
    </Sheet>
  );
}
