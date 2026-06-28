import type { Response } from 'express';

const clients = new Set<Response>();

export function addClient(res: Response): void {
  clients.add(res);
  res.on('close', () => clients.delete(res));
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
