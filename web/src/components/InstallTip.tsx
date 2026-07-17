import { useState } from 'react';
import Sheet from './Sheet';
import { isStandalone, canPromptInstall, promptInstall, isIos, setAskPushLater, browserKind } from '../lib/install';

/** Tip in het profiel: zet de app op je beginscherm — met uitleg per browser. */
export default function InstallTip({ toast }: { toast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (isStandalone()) return null;

  const openSheet = () => {
    // iOS installeert buiten de app om: onthoud dat we bij de eerste start
    // vanaf het beginscherm nog meldingen mogen voorstellen.
    if (isIos()) setAskPushLater();
    setOpen(true);
  };

  const doInstall = async () => {
    setBusy(true);
    try {
      const ok = await promptInstall();
      if (ok) { toast('App geïnstalleerd 🎉'); setOpen(false); }
    } finally {
      setBusy(false);
    }
  };

  const kind = browserKind();
  return (
    <>
      <button className="btn full" style={{ marginTop: 8 }} onClick={openSheet}>
        💡 Tip: zet Op de Bank op je beginscherm!
      </button>
      {open && (
        <Sheet title="📲 Op je beginscherm" onClose={() => setOpen(false)}>
          <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
            Dan opent Op de Bank als een echte app — op volledig scherm, sneller en met meldingen van je vrienden.
          </p>
          {canPromptInstall() && (
            <button className="btn primary full" disabled={busy} onClick={doInstall} style={{ marginBottom: 12 }}>
              📲 Direct installeren
            </button>
          )}
          <div className="card" style={{ fontSize: 14, lineHeight: 1.7 }}>
            {kind === 'ios-safari' && (
              <>
                <b>Zo doe je dat in Safari:</b>
                <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                  <li>Tik op de <b>Deel-knop</b> (vierkantje met pijl omhoog). Die staat <b>onderaan in het midden</b>, of <b>bovenaan naast de adresbalk</b> — afhankelijk van je instellingen.</li>
                  <li>Scroll iets naar beneden en kies <b>"Zet op beginscherm"</b></li>
                  <li>Tik op <b>Voeg toe</b></li>
                </ol>
              </>
            )}
            {kind === 'ios-other' && (
              <>
                <b>Zo doe je dat in deze browser:</b>
                <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                  <li>Tik op de <b>Deel-knop</b> (vierkantje met pijl omhoog), meestal <b>rechtsboven naast de adresbalk</b></li>
                  <li>Kies <b>"Zet op beginscherm"</b> en tik op <b>Voeg toe</b></li>
                </ol>
                <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
                  Zie je die optie niet? Open kijklijst.derwort.nl dan één keer in Safari en doe het daar.
                </p>
              </>
            )}
            {kind === 'android' && (
              <>
                <b>Zo doe je dat:</b>
                <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                  <li>Tik op het <b>menu (⋮)</b> rechtsboven</li>
                  <li>Kies <b>"App installeren"</b> of <b>"Toevoegen aan startscherm"</b></li>
                </ol>
              </>
            )}
            {kind === 'desktop' && (
              <>
                <b>Zo doe je dat:</b>
                <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                  <li>Kijk <b>rechts in de adresbalk</b> voor een installatie-icoontje</li>
                  <li>Of kies in het browsermenu <b>"App installeren"</b></li>
                </ol>
              </>
            )}
          </div>
          {isIos() && (
            <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
              Open de app daarna vanaf je beginscherm — dan vragen we je meteen of je meldingen aan wilt zetten. 🔔
            </p>
          )}
        </Sheet>
      )}
    </>
  );
}
