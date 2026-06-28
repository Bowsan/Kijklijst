import { useState } from 'react';
import { parseImport } from '../lib/importList';
import { searchTmdb, saveRating } from '../lib/api';
import type { SearchResult } from '../lib/types';
import { POSTER_SMALL } from '../lib/types';
import Sheet from './Sheet';

interface Row {
  parsedTitle: string;
  score: number | null;
  options: SearchResult[];
  chosen: number | null; // tmdb_id, of null = overslaan
}

export default function ImportSheet({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  const process = async () => {
    const parsed = parseImport(text);
    if (!parsed.length) return;
    setBusy(true);
    const result: Row[] = [];
    for (const p of parsed) {
      const options = await searchTmdb(p.title).catch(() => []);
      result.push({
        parsedTitle: p.title,
        score: p.score,
        options,
        chosen: options[0]?.tmdb_id ?? null,
      });
    }
    setRows(result);
    setBusy(false);
  };

  const save = async () => {
    if (!rows) return;
    setBusy(true);
    let count = 0;
    for (const row of rows) {
      if (row.chosen == null) continue;
      await saveRating({
        tmdb_id: row.chosen,
        score: row.score ?? undefined,
        status: row.score != null ? 'finished' : 'want',
      }).catch(() => {});
      count++;
    }
    setBusy(false);
    onDone(`${count} serie${count === 1 ? '' : 's'} geïmporteerd 🎉`);
    onClose();
  };

  return (
    <Sheet title="Lijst importeren" onClose={onClose}>
      {!rows ? (
        <>
          <p className="muted" style={{ fontSize: 13 }}>
            Plak je lijst, één serie per regel, met je cijfer erachter. Bijvoorbeeld:<br />
            <code>Breaking Bad 9</code><br /><code>The Wire 10</code><br />
            Een regel zonder cijfer komt op "wil ik kijken".
          </p>
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Breaking Bad 9\nThe Wire 10\n1899'} />
          <button className="btn primary full" style={{ marginTop: 12 }} disabled={busy || !text.trim()} onClick={process}>
            {busy ? 'Bezig met opzoeken…' : 'Zoek deze titels op'}
          </button>
        </>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 13 }}>Controleer de matches. Bij twijfel kies je de juiste, of zet je 'm op overslaan.</p>
          {rows.map((row, i) => (
            <div className="card" key={i} style={{ padding: 10 }}>
              <div className="row spread">
                <b>{row.parsedTitle}</b>
                {row.score != null && <span className="badge-score" style={{ color: 'var(--accent)' }}>{row.score}</span>}
              </div>
              {row.options.length === 0 ? (
                <p className="muted" style={{ fontSize: 12 }}>Niets gevonden — wordt overgeslagen.</p>
              ) : (
                <select
                  value={row.chosen ?? ''}
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : null;
                    setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, chosen: v } : r)));
                  }}
                  style={{ marginTop: 6 }}
                >
                  <option value="">Overslaan</option>
                  {row.options.slice(0, 5).map((o) => (
                    <option key={o.tmdb_id} value={o.tmdb_id}>{o.name}{o.year ? ` (${o.year})` : ''}</option>
                  ))}
                </select>
              )}
              {row.chosen != null && (() => {
                const opt = row.options.find((o) => o.tmdb_id === row.chosen);
                return opt?.poster_path ? <img src={POSTER_SMALL + opt.poster_path} alt="" style={{ width: 36, height: 54, borderRadius: 6, marginTop: 6 }} /> : null;
              })()}
            </div>
          ))}
          <button className="btn primary full" style={{ marginTop: 8 }} disabled={busy} onClick={save}>
            {busy ? 'Importeren…' : 'Importeer in mijn lijst'}
          </button>
        </>
      )}
    </Sheet>
  );
}
