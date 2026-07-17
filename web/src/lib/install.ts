// Beginscherm-installatie (PWA). Chrome/Android geeft een `beforeinstallprompt`
// die we hier vroeg afvangen; iOS kent alleen de handmatige weg via Delen.

let deferredPrompt: any = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });
}

/** Draait de app al vanaf het beginscherm (geïnstalleerde PWA)? */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;
}

/** Kunnen we de native "installeer"-prompt tonen (Chrome/Android)? */
export function canPromptInstall(): boolean {
  return deferredPrompt != null;
}

/** Toon de native installatieprompt; true als de gebruiker accepteert. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

/** Lijkt dit een iOS-apparaat? (voor de juiste installatie-uitleg) */
export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// Na de onboarding op iOS weten we pas bij de eerstvolgende start vanaf het
// beginscherm of de app echt is geïnstalleerd — deze vlag onthoudt dat we dan
// nog éénmalig moeten voorstellen om meldingen aan te zetten.
const ASK_PUSH_KEY = 'opdebank.askPush';
export const setAskPushLater = () => localStorage.setItem(ASK_PUSH_KEY, '1');
export const shouldAskPush = () => localStorage.getItem(ASK_PUSH_KEY) === '1';
export const clearAskPush = () => localStorage.removeItem(ASK_PUSH_KEY);
