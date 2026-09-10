import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const shots = JSON.parse(readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, '')); // [{name, cfg}]
const port = process.argv[3] || '5203';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,900'],
});
try {
  for (const s of shots) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: s.dsf || 1 });
    await page.evaluateOnNewDocument((cfg, key) => {
      localStorage.setItem(key, JSON.stringify(cfg));
    }, s.cfg, s.key || 'module-cfg:digital-logic');
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
    await page.goto(`http://localhost:${port}/#/${s.route || 'module/digital-logic'}`, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1200));
    const canvas = await page.$('.canvas');
    if (canvas) await canvas.screenshot({ path: `C:\\Users\\DAVIDM~1\\AppData\\Local\\Temp\\opencode\\${s.name}.png` });
    else await page.screenshot({ path: `C:\\Users\\DAVIDM~1\\AppData\\Local\\Temp\\opencode\\${s.name}.png` });
    console.log(s.name, 'errors:', errors.length ? errors.join(' | ') : 'none');
    await page.close();
  }
} finally {
  await browser.close();
}
