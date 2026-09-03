import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { ArrayControls, ArrayRender, parseArr, blankScene, type ArrayCfg, type ArrayScene } from './shared';

function badInput(): Frame<ArrayScene>[] {
  return [{ line: 0, caption: T('! 数组不合法：1~16 个 0~999 的整数，逗号/空格分隔', '! Invalid: 1-16 ints 0-999'), scene: blankScene() }];
}

type St = { a: number[]; done: boolean[]; cmp: number; mov: number };
function base(arr: number[]): St {
  return { a: [...arr], done: arr.map(() => false), cmp: 0, mov: 0 };
}
function snap(s: St, hl: number[], aux?: number[] | null): ArrayScene {
  return { arr: [...s.a], hl: [...hl], done: [...s.done], cmp: s.cmp, mov: s.mov, aux: aux ? [...aux] : null };
}

// ── 希尔 ──
const SHELL_CODE = [
  T('for $gap \\gets \\lfloor n/2\\rfloor,\\lfloor gap/2\\rfloor,\\dots,1$:', 'for $gap=n/2..1$:'),
  T('  for $i \\gets gap$ to $n-1$:', '  for $i \\gets gap$ to $n-1$:'),
  T('    $x\\gets A[i];\\; j\\gets i-gap$', '    $x\\gets A[i];\\; j\\gets i-gap$'),
  T('    while $j\\ge0$ and $A[j]>x$: $A[j+gap]\\gets A[j];\\; j{-}{=}gap$', '    while $A[j]>x$: shift by $gap$'),
  T('    $A[j+gap]\\gets x$', '    $A[j+gap]\\gets x$'),
];

function shellGen(cfg: ArrayCfg): Frame<ArrayScene>[] {
  const arr = parseArr(cfg.valuesStr);
  if (!arr) return badInput();
  const s = base(arr);
  const n = s.a.length;
  const frames: Frame<ArrayScene>[] = [];
  frames.push({ line: 0, caption: T(`开始：$n=${n}$，分组插入`, `Start, grouped insertion`), scene: snap(s, []) });
  for (let gap = Math.floor(n / 2); gap >= 1; gap = Math.floor(gap / 2)) {
    frames.push({ line: 0, caption: T(`$gap=${gap}$：隔 ${gap} 位分组`, `$gap=${gap}$`), scene: snap(s, []) });
    for (let i = gap; i < n; i++) {
      const x = s.a[i];
      let j = i - gap;
      frames.push({ line: 1, caption: T(`$i=${i}$`, `$i=${i}$`), scene: snap(s, [i]) });
      frames.push({ line: 2, caption: T(`$x\\gets A[${i}]=${x}$，$j\\gets${j}$`, `$x=${x}$, $j=${j}$`), scene: snap(s, [i, j]) });
      while (j >= 0) {
        s.cmp++;
        if (s.a[j] <= x) {
          frames.push({ line: 3, caption: T(`$A[${j}]\\le x$，停`, `stop`), scene: snap(s, [j]) });
          break;
        }
        s.a[j + gap] = s.a[j]; s.mov++;
        frames.push({ line: 3, caption: T(`$A[${j}]>x$，后移 $gap$ 格`, `shift by $gap$`), scene: snap(s, [j, j + gap]) });
        j -= gap;
      }
      s.a[j + gap] = x; s.mov++;
      frames.push({ line: 4, caption: T(`$A[${j + gap}]\\gets${x}$`, `place ${x}$`), scene: snap(s, [j + gap]) });
    }
  }
  s.done = s.a.map(() => true);
  frames.push({ line: 0, caption: T(`完成：$A=[${s.a.join(',')}]$，比较 ${s.cmp} 次`, `Sorted, ${s.cmp} cmps`), scene: snap(s, []) });
  return frames;
}

export const shellModule: ModuleDef<ArrayScene, ArrayCfg> = {
  id: 'shell-sort',
  title: T('希尔排序', 'Shell Sort'),
  desc: T('gap 由大到小分组插入，最后一轮 gap=1 即插入排序。', 'Grouped insertion with shrinking gap.'),
  tags: ['algorithms'],
  defaultConfig: { n: 8, valuesStr: '38,27,43,3,9,82,10,15' },
  Controls(p) { return ArrayControls(p as any) as never; },
  code: SHELL_CODE,
  generate: shellGen,
  Render(p: any) { return ArrayRender(p) as never; },
};

// ── 归并 ──
const MERGE_CODE = [
  T('$\\text{MergeSort}(A,l,r)$:', '$\\text{MergeSort}(A,l,r)$:'),
  T('  if $l\\ge r$: return // 单个元素有序', '  if $l\\ge r$: return'),
  T('  $m\\gets\\lfloor(l+r)/2\\rfloor$；递归排两半', '  $m$; sort halves'),
  T('  $i\\gets l,\\;j\\gets m+1$；取小者 $\\to tmp$；拷回', '  merge halves via $tmp$'),
];

function mergeGen(cfg: ArrayCfg): Frame<ArrayScene>[] {
  const arr = parseArr(cfg.valuesStr);
  if (!arr) return badInput();
  const s = base(arr);
  const n = s.a.length;
  const frames: Frame<ArrayScene>[] = [];
  const tmp: number[] = new Array(n).fill(0);
  const showTmp = () => tmp.slice();
  frames.push({ line: 0, caption: T(`开始：分治 $n=${n}$`, `Start divide-and-conquer`), scene: snap(s, [], showTmp()) });
  const sort = (l: number, r: number): void => {
    if (l >= r) {
      frames.push({ line: 1, caption: T(`$[${l},${r}]$ 单个元素，直接有序`, `single done`), scene: snap(s, [l], showTmp()) });
      s.done[l] = true;
      return;
    }
    const m = Math.floor((l + r) / 2);
    frames.push({ line: 2, caption: T(`分：$[${l},${r}]\\to[${l},${m}]+[${m + 1},${r}]$`, `split $[${l},${r}]$`), scene: snap(s, [l, m, r], showTmp()) });
    sort(l, m);
    sort(m + 1, r);
    // 合并
    let i = l, j = m + 1, k = l;
    frames.push({ line: 3, caption: T(`合：$i\\gets${l},\\;j\\gets${m + 1}$`, `merge from ${l},${m + 1}$`), scene: snap(s, [i, j], showTmp()) });
    while (i <= m && j <= r) {
      s.cmp++;
      frames.push({ line: 3, caption: T(`$A[${i}]=${s.a[i]}$ vs $A[${j}]=${s.a[j]}$`, `$A[${i}]$ vs $A[${j}]$`), scene: snap(s, [i, j], showTmp()) });
      if (s.a[i] <= s.a[j]) { tmp[k] = s.a[i]; i++; } else { tmp[k] = s.a[j]; j++; }
      frames.push({ line: 3, caption: T(`$tmp[${k}]=${tmp[k]}$`, `$tmp[${k}]=${tmp[k]}$`), scene: snap(s, [i, j], showTmp()) });
      k++;
    }
    while (i <= m) { tmp[k] = s.a[i]; i++; k++; }
    while (j <= r) { tmp[k] = s.a[j]; j++; k++; }
    for (let t = l; t <= r; t++) { s.a[t] = tmp[t]; s.mov++; }
    for (let t = l; t <= r; t++) s.done[t] = true;
    frames.push({ line: 3, caption: T(`拷回：$[${l},${r}]$ 有序`, `copied back $[${l},${r}]$`), scene: snap(s, [], showTmp()) });
  };
  sort(0, n - 1);
  frames.push({ line: 0, caption: T(`完成：$A=[${s.a.join(',')}]$，比较 ${s.cmp} 次，写回 ${s.mov} 次`, `Sorted, ${s.cmp} cmps`), scene: snap(s, [], showTmp()) });
  return frames;
}

export const mergeModule: ModuleDef<ArrayScene, ArrayCfg> = {
  id: 'merge-sort',
  title: T('归并排序', 'Merge Sort'),
  desc: T('分而治之：递归分半，tmp 辅助合并拷回，稳定。', 'Divide and conquer with aux merge.'),
  tags: ['algorithms'],
  defaultConfig: { n: 8, valuesStr: '38,27,43,3,9,82,10,15' },
  Controls(p) { return ArrayControls(p as any) as never; },
  code: MERGE_CODE,
  generate: mergeGen,
  Render(p: any) { return ArrayRender(p) as never; },
};

// ── 快排（Lomuto） ──
const QUICK_CODE = [
  T('$\\text{QuickSort}(A,l,r)$，取 $pivot=A[r]$:', '$\\text{QuickSort}$, $pivot=A[r]$:'),
  T('  if $l\\ge r$: return', '  if $l\\ge r$: return'),
  T('  $i\\gets l-1$；for $j=l..r-1$：$A[j]<pivot\\implies i{+}{+},swap(A[i],A[j])$', '  partition: $A[j]<pivot \\implies$ swap'),
  T('  $swap(A[i+1],A[r])$；递归两边', '  place pivot; recurse'),
];

function quickGen(cfg: ArrayCfg): Frame<ArrayScene>[] {
  const arr = parseArr(cfg.valuesStr);
  if (!arr) return badInput();
  const s = base(arr);
  const frames: Frame<ArrayScene>[] = [];
  frames.push({ line: 0, caption: T(`开始：$A=[${s.a.join(',')}]$`, `Start`), scene: snap(s, []) });
  const sort = (l: number, r: number): void => {
    if (l >= r) {
      if (l === r) {
        s.done[l] = true;
        frames.push({ line: 1, caption: T(`$[${l},${r}]$ 单个元素就位`, `single done`), scene: snap(s, [l]) });
      }
      return;
    }
    const pivot = s.a[r];
    frames.push({ line: 0, caption: T(`区间 $[${l},${r}]$，$pivot=A[${r}]=${pivot}$`, `pivot=${pivot}$ on $[${l},${r}]$`), scene: snap(s, [r]) });
    let i = l - 1;
    for (let j = l; j <= r - 1; j++) {
      s.cmp++;
      frames.push({ line: 2, caption: T(`$A[${j}]=${s.a[j]}$ vs $pivot=${pivot}$`, `$A[${j}]$ vs $pivot$`), scene: snap(s, [j, r]) });
      if (s.a[j] < pivot) {
        i++;
        if (i !== j) {
          const t = s.a[i]; s.a[i] = s.a[j]; s.a[j] = t; s.mov += 3;
          frames.push({ line: 2, caption: T(`小！$i\\gets${i}$，交换 $A[${i}]\\leftrightarrow A[${j}]$`, `swap $A[${i}],A[${j}]$`), scene: snap(s, [i, j]) });
        } else {
          frames.push({ line: 2, caption: T(`小！$i\\gets${i}$（自交换，跳过）`, `$i=${i}$ skip`), scene: snap(s, [i]) });
        }
      }
    }
    const p = i + 1;
    if (p !== r) {
      const t = s.a[p]; s.a[p] = s.a[r]; s.a[r] = t; s.mov += 3;
    }
    s.done[p] = true;
    frames.push({ line: 3, caption: T(`主元就位 $A[${p}]=${pivot}$，左小右大`, `pivot placed at ${p}$`), scene: snap(s, [p]) });
    sort(l, p - 1);
    sort(p + 1, r);
  };
  sort(0, s.a.length - 1);
  frames.push({ line: 0, caption: T(`完成：$A=[${s.a.join(',')}]$，比较 ${s.cmp} 次`, `Sorted, ${s.cmp} cmps`), scene: snap(s, []) });
  return frames;
}

export const quickModule: ModuleDef<ArrayScene, ArrayCfg> = {
  id: 'quick-sort',
  title: T('快速排序', 'Quick Sort'),
  desc: T('选主元分区，左小右大后递归两边。', 'Partition by pivot, recurse halves.'),
  tags: ['algorithms'],
  defaultConfig: { n: 8, valuesStr: '38,27,43,3,9,82,10,15' },
  Controls(p) { return ArrayControls(p as any) as never; },
  code: QUICK_CODE,
  generate: quickGen,
  Render(p: any) { return ArrayRender(p) as never; },
};
