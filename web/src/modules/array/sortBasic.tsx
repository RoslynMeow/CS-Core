import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { ArrayControls, ArrayRender, parseArr, blankScene, type ArrayCfg, type ArrayScene } from './shared';

function badInput(): Frame<ArrayScene>[] {
  return [{ line: 0, caption: T('! 数组不合法：2~30 个 0~999 的整数，逗号/空格分隔', '! Invalid: 2-30 ints 0-999'), scene: blankScene() }];
}

function base(arr: number[]): { a: number[]; done: boolean[]; cmp: number; mov: number } {
  return { a: [...arr], done: arr.map(() => false), cmp: 0, mov: 0 };
}

function snap(s: { a: number[]; done: boolean[]; cmp: number; mov: number }, hl: number[], extra?: Partial<ArrayScene>): ArrayScene {
  return { arr: [...s.a], hl: [...hl], done: [...s.done], cmp: s.cmp, mov: s.mov, ...extra };
}

// ── 冒泡 ──
const BUBBLE_CODE = [
  T('$\\text{Bubble}(A);\\; n\\gets|A|$', '$\\text{Bubble}(A);\\; n\\gets|A|$'),
  T('for $i \\gets 0$ to $n-2$:', 'for $i \\gets 0$ to $n-2$:'),
  T('  for $j \\gets 0$ to $n-i-2$:', '  for $j \\gets 0$ to $n-i-2$:'),
  T('    if $A[j] > A[j+1]$:', '    if $A[j] > A[j+1]$:'),
  T('      $\\text{swap}(A[j],A[j+1])$', '$\\text{swap}(A[j],A[j+1])$'),
];

function bubbleGen(cfg: ArrayCfg): Frame<ArrayScene>[] {
  const arr = parseArr(cfg.valuesStr);
  if (!arr) return badInput();
  const s = base(arr);
  const n = s.a.length;
  const frames: Frame<ArrayScene>[] = [];
  frames.push({ line: 0, caption: T(`开始：$n=${n}$，$A=[${arr.join(',')}]$`, `Start $n=${n}$`), scene: snap(s, []) });
  for (let i = 0; i < n - 1; i++) {
    frames.push({ line: 1, caption: T(`外层 $i=${i}$，尾部 ${i} 个已就位`, `outer $i=${i}$`), scene: snap(s, []) });
    for (let j = 0; j < n - i - 1; j++) {
      frames.push({ line: 2, caption: T(`内层 $j=${j}$，比较 $A[${j}]=${s.a[j]}$ 与 $A[${j + 1}]=${s.a[j + 1]}$`, `compare $A[${j}]=${s.a[j]}$, $A[${j + 1}]=${s.a[j + 1]}$`), scene: snap(s, [j, j + 1]) });
      s.cmp++;
      if (s.a[j] > s.a[j + 1]) {
        const t = s.a[j]; s.a[j] = s.a[j + 1]; s.a[j + 1] = t; s.mov += 3;
        frames.push({ line: 4, caption: T(`$A[${j}]\\leftrightarrow A[${j + 1}]$ 互换`, `swap`), scene: snap(s, [j, j + 1]) });
      } else {
        frames.push({ line: 3, caption: T(`$A[${j}]\\le A[${j + 1}]$，不动`, `no swap`), scene: snap(s, [j, j + 1]) });
      }
    }
    s.done[n - 1 - i] = true;
  }
  s.done[0] = true;
  frames.push({ line: 0, caption: T(`完成：$A=[${s.a.join(',')}]$，比较 ${s.cmp} 次，写回 ${s.mov} 次`, `Sorted, ${s.cmp} cmps, ${s.mov} writes`), scene: snap(s, []) });
  return frames;
}

export const bubbleModule: ModuleDef<ArrayScene, ArrayCfg> = {
  id: 'bubble-sort',
  title: T('冒泡排序', 'Bubble Sort'),
  desc: T('相邻两两比较，逆序则交换，大元素逐轮冒泡到尾部。', 'Adjacent compare-swap; max bubbles to tail.'),
  tags: ['algorithms'],
  defaultConfig: { n: 8, valuesStr: '38,27,43,3,9,82,10,15' },
  Controls(p) { return ArrayControls(p as any) as never; },
  code: BUBBLE_CODE,
  generate: bubbleGen,
  Render(p: any) { return ArrayRender(p) as never; },
};

// ── 选择 ──
const SELECT_CODE = [
  T('for $i \\gets 0$ to $n-2$:', 'for $i \\gets 0$ to $n-2$:'),
  T('  $m \\gets i$ // 假设最小', '  $m \\gets i$'),
  T('  for $j\\gets i+1$ to $n-1$:', '  for $j\\gets i+1$ to $n-1$:'),
  T('    if $A[j]<A[m]$:', '    if $A[j]<A[m]$:'),
  T('      $m\\gets j$ // 更小', '      $m\\gets j$'),
  T('  $\\text{swap}(A[i],A[m])$ // 首位就位', '  $\\text{swap}(A[i],A[m])$'),
];

function selectGen(cfg: ArrayCfg): Frame<ArrayScene>[] {
  const arr = parseArr(cfg.valuesStr);
  if (!arr) return badInput();
  const s = base(arr);
  const n = s.a.length;
  const frames: Frame<ArrayScene>[] = [];
  frames.push({ line: 0, caption: T(`开始：$n=${n}$`, `Start $n=${n}$`), scene: snap(s, []) });
  for (let i = 0; i < n - 1; i++) {
    let m = i;
    frames.push({ line: 0, caption: T(`$i=${i}$，前 ${i} 个已就位`, `$i=${i}$`), scene: snap(s, [i]) });
    frames.push({ line: 1, caption: T(`$m\\gets${i}$`, `$m\\gets${i}$`), scene: snap(s, [m]) });
    for (let j = i + 1; j < n; j++) {
      s.cmp++;
      frames.push({ line: 3, caption: T(`$A[${j}]=${s.a[j]}$ vs $A[${m}]=${s.a[m]}$`, `$A[${j}]=${s.a[j]}$ vs $A[${m}]=${s.a[m]}$`), scene: snap(s, [j, m]) });
      if (s.a[j] < s.a[m]) {
        m = j;
        frames.push({ line: 4, caption: T(`更小！$m\\gets${j}$`, `new min $m\\gets${j}$`), scene: snap(s, [m]) });
      }
    }
    if (m !== i) {
      const t = s.a[i]; s.a[i] = s.a[m]; s.a[m] = t; s.mov += 3;
      frames.push({ line: 5, caption: T(`最小在 ${m}，$A[${i}]\\leftrightarrow A[${m}]$ 互换`, `swap min into place`), scene: snap(s, [i, m]) });
    } else {
      frames.push({ line: 5, caption: T(`$m=i$，无需交换`, `no swap`), scene: snap(s, [i]) });
    }
    s.done[i] = true;
  }
  s.done[n - 1] = true;
  frames.push({ line: 0, caption: T(`完成：$A=[${s.a.join(',')}]$，比较 ${s.cmp} 次`, `Sorted, ${s.cmp} cmps`), scene: snap(s, []) });
  return frames;
}

export const selectionModule: ModuleDef<ArrayScene, ArrayCfg> = {
  id: 'selection-sort',
  title: T('选择排序', 'Selection Sort'),
  desc: T('每轮在未排序区选最小，与首位交换。', 'Pick min of unsorted part each round.'),
  tags: ['algorithms'],
  defaultConfig: { n: 8, valuesStr: '38,27,43,3,9,82,10,15' },
  Controls(p) { return ArrayControls(p as any) as never; },
  code: SELECT_CODE,
  generate: selectGen,
  Render(p: any) { return ArrayRender(p) as never; },
};

// ── 插入 ──
const INSERT_CODE = [
  T('for $i \\gets 1$ to $n-1$:', 'for $i \\gets 1$ to $n-1$:'),
  T('  $x\\gets A[i]$; $j\\gets i-1$', '  $x\\gets A[i]$; $j\\gets i-1$'),
  T('  while $j\\ge0 \\land A[j]>x$:', '  while $j\\ge0 \\land A[j]>x$:'),
  T('    $A[j+1]\\gets A[j]$; $j{-}{-}$', '    $A[j+1]\\gets A[j]$; $j{-}{-}$'),
  T('  $A[j+1]\\gets x$ // 落位', '  $A[j+1]\\gets x$'),
];

function insertGen(cfg: ArrayCfg): Frame<ArrayScene>[] {
  const arr = parseArr(cfg.valuesStr);
  if (!arr) return badInput();
  const s = base(arr);
  const n = s.a.length;
  const frames: Frame<ArrayScene>[] = [];
  s.done[0] = true;
  frames.push({ line: 0, caption: T(`开始：$A[0]$ 自成有序区`, `Start: $A[0]$ sorted`), scene: snap(s, [0]) });
  for (let i = 1; i < n; i++) {
    const x = s.a[i];
    let j = i - 1;
    frames.push({ line: 0, caption: T(`$i=${i}$，前 ${i} 个有序`, `$i=${i}$`), scene: snap(s, [i]) });
    frames.push({ line: 1, caption: T(`$x\\gets A[${i}]=${x}$，$j\\gets${j}$`, `$x=${x}$, $j=${j}$`), scene: snap(s, [i, j], { note: `x=${x}` }) });
    while (j >= 0) {
      s.cmp++;
      if (s.a[j] <= x) {
        frames.push({ line: 2, caption: T(`$A[${j}]=${s.a[j]}\\le x$，停止后移`, `stop shifting`), scene: snap(s, [j], { note: `x=${x}` }) });
        break;
      }
      const w = s.a[j];
      s.a[j + 1] = w; s.mov++;
      frames.push({ line: 3, caption: T(`$${w}>x$，右移一格`, `slide ${w} right`), scene: snap(s, [j + 1], { note: `x=${x}` }) });
      j--;
    }
    s.a[j + 1] = x; s.mov++;
    for (let k = 0; k <= i; k++) s.done[k] = true;
    frames.push({ line: 4, caption: T(`$A[${j + 1}]\\gets x=${x}$，前 ${i + 1} 个有序`, `place $x$ at ${j + 1}$`), scene: snap(s, [j + 1]) });
  }
  frames.push({ line: 0, caption: T(`完成：$A=[${s.a.join(',')}]$，比较 ${s.cmp} 次，写回 ${s.mov} 次`, `Sorted, ${s.cmp} cmps`), scene: snap(s, []) });
  return frames;
}

export const insertionModule: ModuleDef<ArrayScene, ArrayCfg> = {
  id: 'insertion-sort',
  title: T('插入排序', 'Insertion Sort'),
  desc: T('逐个取牌插入前方有序区，如理扑克。', 'Insert each card into sorted prefix.'),
  tags: ['algorithms'],
  defaultConfig: { n: 8, valuesStr: '38,27,43,3,9,82,10,15' },
  Controls(p) { return ArrayControls(p as any) as never; },
  code: INSERT_CODE,
  generate: insertGen,
  Render(p: any) { return ArrayRender(p) as never; },
};
