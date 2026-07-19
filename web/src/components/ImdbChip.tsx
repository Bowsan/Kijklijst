import { fmt1 } from '../lib/format';

/** Compacte, volledig gele IMDb-chip (variant B). De hele chip is de externe
 *  link naar de IMDb-pagina; het pijltje duidt de externe link aan. */
export default function ImdbChip({ rating, url }: { rating: number; url: string }) {
  return (
    <a
      className="imdb-chip"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Bekijk op IMDb, beoordeling ${fmt1(rating)} uit 10`}
    >
      <span className="imdb-chip-merk">IMDb</span>
      <span className="imdb-chip-ster" aria-hidden="true">★</span>
      <span className="imdb-chip-cijfer">{fmt1(rating)}</span>
      <span className="imdb-chip-pijl" aria-hidden="true">↗</span>
    </a>
  );
}
