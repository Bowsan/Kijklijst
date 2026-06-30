interface Props {
  /** De live zoek/filtertekst (gedeeld met het zoekscherm erboven). */
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}

/** Vaste invoerbalk onderaan voor zoeken, filteren en toevoegen in de lijst. */
export default function ListSearchBar({ value, onChange, onClose }: Props) {
  return (
    <div className="fab-search-bar">
      <input
        autoFocus
        placeholder="Zoek in je lijst of voeg toe…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button className="close" aria-label="Sluiten" onClick={onClose}>✕</button>
    </div>
  );
}
