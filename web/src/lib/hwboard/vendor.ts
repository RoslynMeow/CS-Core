import d3Url from 'd3/dist/d3.min.js?url';
import elkUrl from 'elkjs/lib/elk.bundled.js?url';
import hwUrl from 'd3-hwschematic/dist/d3-hwschematic.js?url';

// d3-hwschematic(含老 elkjs GWT 代码, 依赖草率模式隐式全局)不能走打包器,
// 改经典 <script> 按序加载(d3 → elk → hwschematic), 与其官方示例页同构。
// vite ?url 使文件随构建发布(离线可用), 版本随 npm 自动同步。
let readyP: Promise<void> | null = null;

function loadOne(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-hwboard="${src}"]`)) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.async = false;
    el.dataset.hwboard = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`看板引擎加载失败: ${src}`));
    document.head.appendChild(el);
  });
}

export function ensureHwVendor(): Promise<void> {
  if (!readyP) {
    readyP = (async () => {
      await loadOne(d3Url);
      await loadOne(elkUrl);
      await loadOne(hwUrl);
      const w = window as unknown as { d3?: { HwSchematic?: unknown } };
      if (!w.d3?.HwSchematic) throw new Error('看板引擎未正确挂载(window.d3.HwSchematic 缺失)');
    })();
  }
  return readyP;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hwGlobal(): any {
  return (window as unknown as { d3?: unknown }).d3;
}
