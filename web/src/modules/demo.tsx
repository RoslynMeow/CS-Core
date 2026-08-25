import { T } from '../i18n/lang';
import type { ModuleDef } from '../engine/types';

// 最小演示模块：验证 三件套 伪代码|动画|控制 跑通
type Cfg = { n: number };
type Scene = { arr: number[]; hl: number[] };

export const demoModule: ModuleDef<Scene, Cfg> = {
  id: 'demo',
  title: T('演示 · 冒泡', 'Demo · Bubble'),
  desc: T('三件套最小闭环：`$Frame.line$` 高亮 + 柱状动画 + 播放控制', 'Minimal loop: PC highlight + bars + playback'),
  tags: ['data-structures'],
  defaultConfig: { n: 8 },
  Controls({ config, onChange }) {
    return (
      <label> n <input type="range" min={4} max={16} value={config.n} onChange={e => onChange({ n: Number(e.target.value) })} /> {config.n}</label> as unknown as never
    );
  },
  code: [
    T('$\\text{Bubble}(A):$', '$\\text{Bubble}(A):$'),
    T('  for $i \\gets 0$ to $n-2$:', '  for $i \\gets 0$ to $n-2$:'),
    T('    for $j \\gets 0$ to $n-i-2$:', '    for $j \\gets 0$ to $n-i-2$:'),
    T('      if $A[j] > A[j+1]$:', '      if $A[j] > A[j+1]$:'),
    T('        $\\text{swap}(A[j],A[j+1])$', '$\\text{swap}(A[j],A[j+1])$'),
  ],
  generate(cfg) {
    const arr = Array.from({ length: cfg.n }, () => Math.floor(Math.random() * 90) + 10);
    const a = [...arr];
    const frames: ReturnType<ModuleDef<Scene, Cfg>['generate']> = [];
    const push = (line: number, hl: number[], capZh: string, capEn: string) =>
      frames.push({ line, caption: T(capZh, capEn), scene: { arr: [...a], hl: [...hl] } });
    push(0, [], '开始冒泡排序', 'Start bubble sort');
    for (let i = 0; i < a.length - 1; i++) {
      push(1, [], `外层 $i=${i}$`, `outer $i=${i}$`);
      for (let j = 0; j < a.length - i - 1; j++) {
        push(2, [j, j + 1], `比较 $A[${j}]=${a[j]}$ 与 $A[${j + 1}]=${a[j + 1]}$`, `compare $A[${j}]=${a[j]}$, $A[${j + 1}]=${a[j + 1]}$`);
        push(3, [j, j + 1], `判断 $A[j] > A[j+1]$ ?`, `if $A[j] > A[j+1]$?`);
        if (a[j] > a[j + 1]) {
          const tmp = a[j]; a[j] = a[j + 1]; a[j + 1] = tmp;
          push(4, [j, j + 1], `交换 $A[${j}] \\leftrightarrow A[${j + 1}]$`, `swap $A[${j}] \\leftrightarrow A[${j + 1}]$`);
        }
      }
    }
    push(0, [], '排序完成 $A$ 有序', 'Sorted');
    return frames;
  },
  Render({ scene }) {
    const mx = Math.max(...scene.arr, 1);
    return (
      <div className="bars">
        {scene.arr.map((v, i) => (
          <div key={i} className={`bar ${scene.hl.includes(i) ? 'hl' : ''}`} style={{ height: `${(v / mx) * 140 + 14}px` }}><span>{v}</span></div>
        ))}
      </div>
    ) as unknown as never;
  },
};
