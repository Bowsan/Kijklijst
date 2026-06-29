import { useState } from 'react';
import { saveProfile, identify } from '../lib/api';
import { setUserId } from '../lib/identity';

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      // Bestaat er al iemand met deze naam? Dan dat account overnemen
      // (bijv. dezelfde persoon op een tweede apparaat), anders een nieuw aanmaken.
      const { id } = await identify(name.trim());
      if (id) {
        setUserId(id);
      } else {
        await saveProfile({ name: name.trim() });
      }
      onDone();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="onboard">
      <div className="hero">
        <div className="big">🛋️</div>
        <h1>Op de Bank</h1>
        <p className="muted">Een gedeelde kijklijst voor series, samen met je vrienden.</p>
      </div>
      <div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && start()}
          placeholder="Hoe heet je?"
          autoFocus
        />
        <button className="btn primary full" style={{ marginTop: 12 }} disabled={busy || !name.trim()} onClick={start}>
          Beginnen
        </button>
        <p className="muted center" style={{ fontSize: 12, marginTop: 16 }}>
          Geen account nodig. Je naam laat de groep zien wie wat vindt. Een foto kun je later toevoegen.
        </p>
      </div>
    </div>
  );
}
