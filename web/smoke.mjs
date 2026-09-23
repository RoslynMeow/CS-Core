import puppeteer from 'puppeteer-core';

const URL = process.env.SMOKE_URL || 'http://localhost:5204/';
const b = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1300,940'],
});
const p = await b.newPage();
await p.setViewport({ width: 1300, height: 940 });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

await p.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1200));
await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === '全部展开'); if (b) b.click(); });
await new Promise((r) => setTimeout(r, 500));

const count = await p.$$eval('.card', (els) => els.length);
const titles = await p.$$eval('.card', (els) => els.map((e) => e.textContent.split('\n')[0]));

for (let i = 0; i < count; i++) {
  await p.evaluate((idx) => { const c = document.querySelectorAll('.card')[idx]; if (c) c.click(); }, i);
  await new Promise((r) => setTimeout(r, 500));
  // cycle every <select> through all options (sub-module + per-card controls)
  await p.evaluate(async () => {
    const sels = [...document.querySelectorAll('select')];
    for (const s of sels) {
      const opts = [...s.options].map((o) => o.value);
      for (const v of opts) {
        s.value = v;
        s.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 140));
      }
    }
  });
  await new Promise((r) => setTimeout(r, 350));
  await p.evaluate(() => { location.hash = ''; });
  await new Promise((r) => setTimeout(r, 250));
}

console.log('CARDS=' + count);
console.log('TITLES=' + JSON.stringify(titles));
console.log('ERRORS=' + errs.length);
for (const e of errs) console.log('  ' + e);
await b.close();
