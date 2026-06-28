import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Sheet from './Sheet';

export default function ShareSheet({ onClose, onToast }: { onClose: () => void; onToast: (m: string) => void }) {
  const [qr, setQr] = useState('');
  const url = window.location.origin;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 400, margin: 1 }).then(setQr).catch(() => {});
  }, [url]);

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'Op de Bank', text: 'Doe mee met onze kijklijst!', url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      onToast('Link gekopieerd');
    }
  };

  return (
    <Sheet title="Vrienden erbij" onClose={onClose}>
      <p className="muted" style={{ fontSize: 13 }}>
        Iedereen die deze link opent komt op dezelfde gedeelde lijst. Geen account nodig — alleen je naam invullen.
      </p>
      {qr && <div className="qr"><img src={qr} alt="QR-code" /></div>}
      <p className="center" style={{ wordBreak: 'break-all', fontSize: 13 }}>{url}</p>
      <button className="btn primary full" onClick={share}>Deel de link</button>
    </Sheet>
  );
}
