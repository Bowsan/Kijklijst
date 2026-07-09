import { chromium } from '/tmp/node_modules/playwright-core/index.mjs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await (await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2})).newPage();
await p.addInitScript(()=>{localStorage.setItem('opdebank.userId','user-me');});
await p.goto('http://localhost:8898/',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(2400); // reveals + countup klaar
console.log('zichtbare kaarten met .in:', await p.evaluate(()=>document.querySelectorAll('.dash .in').length));
console.log('shimmer aanwezig op balk:', await p.evaluate(()=>{const f=document.querySelector('.dash .card.in .bar-fill'); return f? getComputedStyle(f,'::after').animationName : 'geen'; }));
// countup eindwaarden correct?
console.log('stat-waarden:', await p.evaluate(()=>[...document.querySelectorAll('.stat-box .v')].map(v=>v.textContent)));
// scroll: stat-grid in beeld
await p.evaluate(()=>document.querySelector('.stat-grid')?.scrollIntoView({block:'center'}));
await p.waitForTimeout(900);
await p.screenshot({path:process.env.OUT1,fullPage:false});
// scroll verder voor afmakers + poster-strip reveal
await p.evaluate(()=>{[...document.querySelectorAll('.card-title')].find(t=>t.textContent.includes('Afmakers'))?.scrollIntoView({block:'center'});});
await p.waitForTimeout(900);
console.log('afmakers-kaart onthuld:', await p.evaluate(()=>{const t=[...document.querySelectorAll('.card-title')].find(t=>t.textContent.includes('Afmakers')); return t?.closest('.card')?.classList.contains('in');}));
await p.screenshot({path:process.env.OUT2,fullPage:false});
await b.close();
