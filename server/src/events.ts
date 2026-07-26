import type { Response } from 'express';

const clients = new Set<Response>();

// Hoe vaak we een hartslag sturen. Reverse proxies kappen een verbinding waar
// niets overheen gaat standaard na ~60s af; de client merkt dat niet en blijft
// dan met een dode stream zitten. Met een regelmatig teken van leven blijft de
// verbinding open én kan de client zelf zien of de stream nog loopt.
export const HEARTBEAT_MS = 25_000;

export function addClient(res: Response): void {
  clients.add(res);
  // Bewust een echt event en geen SSE-commentaar: commentaar houdt de
  // verbinding wel warm, maar is onzichtbaar voor de client. Zo kan die zelf
  // merken dat de stream stil is gevallen en opnieuw verbinden.
  const beat = setInterval(() => {
    try {
      res.write('event: ping\ndata: {}\n\n');
    } catch {
      clearInterval(beat);
      clients.delete(res);
    }
  }, HEARTBEAT_MS);
  res.on('close', () => {
    clearInterval(beat);
    clients.delete(res);
  });
}

/** Stuur een event naar alle verbonden clients zodat wijzigingen vrijwel direct verschijnen. */
export function broadcast(type: string, payload: unknown): void {
  const data = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(data);
    } catch {
      clients.delete(res);
    }
  }
}
