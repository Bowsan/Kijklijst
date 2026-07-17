interface Props {
  /** De live zoek/filtertekst (gedeeld met het zoekscherm erboven). */
  value: string;
  onChange: (v: string) => void;
  /** Open het "hele lijst importeren"-scherm. */
  onImport: () => void;
  onClose: () => void;
}

/** Vaste invoerbalk onderaan voor zoeken, filteren en toevoegen in de lijst. */
export default function ListSearchBar({ value, onChange, onImport, onClose }: Props) {
  return (
    <div className="fab-search-bar">
      <div className="fsb-row">
        <input
          autoFocus
          enterKeyHint="done"
          placeholder="Zoek in je lijst of voeg toe…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // Enter klapt het toetsenbord in, zodat de hele resultatenlijst zichtbaar is.
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <button className="close" aria-label="Sluiten" onClick={onClose}>✕</button>
      </div>
      <button className="fsb-import" onClick={onImport}>
        <img src="/icons/top-import.png" alt="" /> Hele lijst importeren
      </button>
    </div>
  );
}
