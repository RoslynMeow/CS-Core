import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
});
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('module-cfg:hwtest', JSON.stringify({ mode: 'fa', a: 1, b: 0, cin: 1 }));
  });
  await page.goto('http://localhost:5203/#/module/hwtest', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  const info = await page.evaluate(() => {
    const out = {};
    out.cssRules = [...document.styleSheets].reduce((n, s) => { try { return n + s.cssRules.length; } catch { return n; } }, 0);
    out.hasHwflow = [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.cssText.includes('hwflow')); } catch { return false; } });
    out.hasNodeOp = [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.cssText.includes('node-operator')); } catch { return false; } });
    const svg = document.querySelector('.canvas svg');
    out.svgKids = svg ? svg.children.length : -1;
    const gs = svg ? [...svg.querySelectorAll('g')] : [];
    out.gTotal = gs.length;
    // 检查是否有 generic rect 与自定义形状叠加
    const rects = svg ? [...svg.querySelectorAll('rect')] : [];
    out.rectCount = rects.length;
    out.rectSample = rects.slice(0, 4).map((r) => ({ w: r.getAttribute('width'), h: r.getAttribute('height'), cls: r.parentNode?.getAttribute?.('class'), fill: r.getAttribute('fill') }));
    // use 元素
    const uses = svg ? [...svg.querySelectorAll('use')] : [];
    out.useCount = uses.length;
    out.useSample = uses.slice(0, 2).map((u) => ({ href: u.getAttribute('href'), parentCls: u.parentNode?.getAttribute?.('class') }));
    // 节点 g 的 class 分布
    const cls = {};
    gs.forEach((g) => { const c = g.getAttribute('class') || '(none)'; cls[c] = (cls[c] || 0) + 1; });
    out.gClasses = cls;
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
} finally { await browser.close(); }
