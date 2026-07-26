// Live meekijken met wijzigingen van anderen (cijfers, prikbordberichten, tips).
//
// De verbinding via Server-Sent Events is de snelle weg, maar je kunt er niet
// blind op varen: een mobiel besturingssysteem bevriest de pagina zodra je de
// app wegzet, en een reverse proxy kan een stille verbinding afkappen. Daarom
// verversen we óók op de momenten waarop de gebruiker het verwacht — bij het
// openen of terugkeren naar de app — en houden we in de gaten of de stream nog
// leeft.

/** Zonder enig teken van leven beschouwen we de stream als dood. Ruim boven de
 *  hartslag van de server (25s), zodat één gemiste hartslag niet meteen telt. */
export const STILTE_MAX = 60_000;
/** Hoe vaak we controleren of er nog leven in de stream zit. */
export const WAAKINTERVAL = 15_000;
/** Verversingen die vlak na elkaar komen bundelen we tot één verzoek. */
export const BUNDEL_MS = 1_500;

interface Opties {
  /** Alleen voor tests: zo hoeven we niet op de echte klok te wachten. */
  now?: () => number;
}

/**
 * Houdt de gegevens actueel en roept `onChange` aan zodra er iets te halen valt.
 * Geeft een functie terug om alles weer op te ruimen.
 */
export function subscribe(onChange: () => void, opts: Opties = {}): () => void {
  const now = opts.now ?? (() => Date.now());
  let es: EventSource | null = null;
  let gestopt = false;
  let laatsteLevensteken = now();
  // Bewust -Infinity: de eerste verversing mag nooit in het bundelvenster vallen.
  let laatsteVerversing = Number.NEGATIVE_INFINITY;
  let pogingen = 0;
  let herverbindTimer: ReturnType<typeof setTimeout> | null = null;

  const zichtbaar = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

  /** Nieuwe gegevens ophalen; vlak op elkaar volgende aanroepen worden gebundeld. */
  const ververs = (meteen = false) => {
    const t = now();
    if (!meteen && t - laatsteVerversing < BUNDEL_MS) return;
    laatsteVerversing = t;
    onChange();
  };

  const sluit = () => {
    if (herverbindTimer) { clearTimeout(herverbindTimer); herverbindTimer = null; }
    es?.close();
    es = null;
  };

  const verbind = () => {
    if (gestopt || !zichtbaar() || typeof EventSource === 'undefined') return;
    if (es && es.readyState !== EventSource.CLOSED) return; // loopt al
    sluit();
    laatsteLevensteken = now();
    es = new EventSource('/api/stream');

    const levensteken = () => { laatsteLevensteken = now(); pogingen = 0; };
    // 'hello' bij het verbinden en 'ping' als hartslag: geen nieuwe gegevens,
    // wel het bewijs dat de verbinding staat.
    es.addEventListener('hello', levensteken);
    es.addEventListener('ping', levensteken);
    // Echte wijzigingen: bijwerken én meetellen als levensteken.
    es.addEventListener('state', () => { levensteken(); ververs(); });
    es.addEventListener('profile', () => { levensteken(); ververs(); });

    es.onerror = () => {
      sluit();
      if (gestopt || !zichtbaar()) return;
      // Oplopend wachten, met een plafond: bij een serverherstart of een korte
      // netwerkonderbreking niet in een strak ritme blijven kloppen.
      const wacht = Math.min(2000 * 2 ** pogingen, 15_000);
      pogingen += 1;
      herverbindTimer = setTimeout(verbind, wacht);
    };
  };

  /** De app komt (weer) in beeld: meteen verversen en de verbinding herstellen. */
  const hervat = () => {
    if (gestopt || !zichtbaar()) return;
    pogingen = 0;
    ververs(true);
    verbind();
  };

  const opVisibility = () => {
    if (zichtbaar()) hervat();
    else sluit(); // in de achtergrond geen verbinding openhouden
  };
  // Terug uit de "bfcache" (Safari/iOS herstelt de pagina zonder te herladen).
  const opPageshow = () => hervat();
  const opFocus = () => { if (zichtbaar()) { ververs(); verbind(); } };
  const opOnline = () => hervat();

  // Waakhond: als er te lang niets binnenkwam is de stream stilletjes gesneuveld.
  const waak = setInterval(() => {
    if (gestopt || !zichtbaar()) return;
    if (now() - laatsteLevensteken > STILTE_MAX) {
      sluit();
      ververs(true);
      verbind();
    }
  }, WAAKINTERVAL);

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', opVisibility);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pageshow', opPageshow);
    window.addEventListener('focus', opFocus);
    window.addEventListener('online', opOnline);
  }

  verbind();

  return () => {
    gestopt = true;
    clearInterval(waak);
    sluit();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', opVisibility);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pageshow', opPageshow);
      window.removeEventListener('focus', opFocus);
      window.removeEventListener('online', opOnline);
    }
  };
}
