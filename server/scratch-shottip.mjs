import { chromium } from '/tmp/node_modules/playwright-core/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext({viewport:{width:390,height:900},deviceScaleFactor:2})).newPage();
await p.addInitScript(()=>{localStorage.setItem('opdebank.userId','user-me');});
await p.goto('http://localhost:8896/',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(1500);
// Vrienden → tab "Jouw tips"
for(const t of await p.$$('.topbar button')){ if((await t.innerHTML()).includes('👥')){ await t.click(); break; } }
await p.waitForTimeout(600);
await p.evaluate(()=>{[...document.querySelectorAll('.subtabs button')].find(b=>b.textContent.includes('Jouw tips'))?.click();});
await p.waitForTimeout(500);
console.log('tip zichtbaar:', await p.evaluate(()=>!!document.querySelector('.tip-row')));
console.log('tip-titel:', await p.evaluate(()=>document.querySelector('.tip-title')?.textContent));
// klik op de titel
await p.evaluate(()=>{document.querySelector('.tip-title.tip-open')?.click();});
await p.waitForTimeout(1200);
console.log('na klik → lijst-tab actief:', await p.evaluate(()=>document.querySelector('.nav button.active')?.textContent.includes('Lijst')));
console.log('Severance-kaart aanwezig:', await p.evaluate(()=>[...document.querySelectorAll('.title-card h3')].some(h=>h.textContent==='Severance')));
console.log('kaart opengeklapt (Raad aan zichtbaar):', await p.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Raad aan'))));
await b.close();
