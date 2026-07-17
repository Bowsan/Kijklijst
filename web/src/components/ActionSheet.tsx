import Sheet from './Sheet';

export interface ActionOption {
  label: string;
  /** Kleine toelichting onder het label (bijv. wat er gebeurt). */
  sub?: string;
  icon?: string;
  danger?: boolean;
  onSelect: () => void;
}

/** Bottom-sheet met een lijst keuzes + vaste "Annuleren". */
export default function ActionSheet({ title, options, onClose }: {
  title: string;
  options: ActionOption[];
  onClose: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="action-menu">
        {options.map((o, i) => (
          <button
            key={i}
            className={`action-item${o.danger ? ' danger' : ''}`}
            onClick={() => { o.onSelect(); onClose(); }}
          >
            {o.icon && <span className="action-ico">{o.icon}</span>}
            <span className="action-label">
              {o.label}
              {o.sub && <span className="action-sub">{o.sub}</span>}
            </span>
          </button>
        ))}
        <button className="action-item cancel" onClick={onClose}>Annuleren</button>
      </div>
    </Sheet>
  );
}
