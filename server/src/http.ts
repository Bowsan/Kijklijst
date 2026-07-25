import type express from 'express';

/** Eenvoudige identiteit: de client stuurt zijn lokale code mee in een header. */
export function userId(req: express.Request): string | null {
  const id = req.header('x-user-id');
  return id && id.length > 0 ? id : null;
}
