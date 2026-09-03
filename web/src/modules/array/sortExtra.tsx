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
function snap(s: St, hl: number[], aux?: number[] | null, note?: string): ArrayScene {
  return { arr: [...s.a], hl: [...hl], done: [...s.done], cmp: s.cmp, mov: s.mov, aux: aux ? [...aux] : null, note };
}

// ── 堆排 ──
const HEAP_CODE = [
  T('建堆：for $i\\gets\\lfloor n/2\\rfloor-1$ down to $0$: $\\text{siftDown}(i)$', 'Build heap bottom-up'),
  T('  $\\text{siftDown}(i)$：与较大孩子比，大则交换下沉', '  sift down larger child'),
  T('for $end\\gets n-1$ down to $1$: $swap(A[0],A[end])$ 就位；$\\text{siftDown}(0)$', 'Extract max to end; sift down'),
  T('完成：堆结构详见“树”章节', 'Done (see Tree chapter for heap)'),
];

function heapGen(cfg: ArrayCfg): Frame<ArrayScene>[] {
  const arr = parseArr(cfg.valuesStr);
  if (!arr) return badInput();
  const s = base(arr);
  const n = s.a.length;
  const frames: Frame<ArrayScene>[] = [];
  const swap = (x: number, y: number) => {
    const t = s.a[x]; s.a[x] = s.a[y]; s.a[y] = t; s.mov += 3;
  };
  const sift = (root: number, end: number) => {
    let i = root;
    for (;;) {
      const l = 2 * i + 1, r = 2 * i + 2;
      let big = i;
      if (l <= end) {
        s.cmp++;
        frames.push({ line: 1, caption: T(`$A[${i}]=${s.a[i]}$ vs 左孩子 $A[${l}]=${s.a[l]}$`, `$A[${i}]$ vs left`), scene: snap(s, [i, l]) });
        if (s.a[l] > s.a[big]) big = l;
      }
      if (r <= end) {
        s.cmp++;
        frames.push({ line: 1, caption: T(`$A[${big}]=${s.a[big]}$ vs 右孩子 $A[${r}]=${s.a[r]}$`, `$A[${big}]$ vs right`), scene: snap(s, [big, r]) });
        if (s.a[r] > s.a[big]) big = r;
      }
      if (big === i) {
        frames.push({ line: 1, caption: T(`$A[${i}]$ 已大于孩子，下沉结束`, `sift done`), scene: snap(s, [i]) });
        return;
      }
      swap(i, big);
      frames.push({ line: 1, caption: T(`交换下沉 $A[${i}]\\leftrightarrow A[${big}]$`, `swap down`), scene: snap(s, [i, big]) });
      i = big;
    }
  };
  frames.push({ line: 0, caption: T(`开始建堆：$n=${n}$`, `Build heap $n=${n}$`), scene: snap(s, []) });
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    frames.push({ line: 0, caption: T(`对 $i=${i}$ 下沉`, `sift $i=${i}$`), scene: snap(s, [i]) });
    sift(i, n - 1);
  }
  frames.push({ line: 0, caption: T('大顶堆建成：$A[0]$ 最大', 'Max-heap ready'), scene: snap(s, [0]) });
  for (let end = n - 1; end >= 1; end--) {
    swap(0, end);
    s.done[end] = true;
    frames.push({ line: 2, caption: T(`$swap(A[0],A[${end}])$，$A[${end}]=${s.a[end]}$ 就位`, `max to ${end}$`), scene: snap(s, [0, end]) });
    sift(0, end - 1);
  }
  s.done[0] = true;
  frames.push({ line: 3, caption: T(`完成：$A=[${s.a.join(',')}]$，比较 ${s.cmp} 次`, `Sorted, ${s.cmp} cmps`), scene: snap(s, []) });
  return frames;
}

export const heapModule: ModuleDef<ArrayScene, ArrayCfg> = {
  id: 'heap-sort',
  title: T('堆排序', 'Heap Sort'),
  desc: T('建大顶堆后反复取顶到底，堆结构详见“树”章节。', 'Extract max from heap (see Tree).'),
  tags: ['algorithms'],
  defaultConfig: { n: 8, valuesStr: '38,27,43,3,9,82,10,15' },
  Controls(p) { return ArrayControls(p as any) as never; },
  code: HEAP_CODE,
  generate: heapGen,
  Render(p: any) { return ArrayRender(p) as never; },
};

// ── 计数 ──
const COUNT_CODE = [
  T('统计：for $x$ in $A$: $cnt[x]{+}{+}$', 'Count occurrences'),
  T('前缀和：$cnt[i]\\mathrel{+}=cnt[i-1]$（起始下标）', 'Prefix sums = positions'),
  T('稳定输出：倒序取 $x$ → $out[{--}cnt[x]]=x$', 'Stable output backwards'),
];

function countGen(cfg: ArrayCfg): Frame<ArrayScene>[] {
  const arr = parseArr(cfg.valuesStr);
  if (!arr) return badInput();
  const s = base(arr);
  const n = s.a.length;
  const k = Math.max(...s.a);
  if (k > 99) {
    return [{ line: 0, caption: T(`! 计数排序要求值域小：当前 $max=${k}>99$，请换小数组`, `Range too big ($max=${k}>99$)`), scene: blankScene() }];
  }
  const frames: Frame<ArrayScene>[] = [];
  const cnt = new Array(k + 1).fill(0);
  frames.push({ line: 0, caption: T(`开始：$n=${n}$，值域 $0..${k}$`, `Range $0..${k}$`), scene: snap(s, [], cnt) });
  for (let i = 0; i < n; i++) {
    cnt[s.a[i]]++;
    frames.push({ line: 0, caption: T(`读 $A[${i}]=${s.a[i]}$，$cnt[${s.a[i]}]\\to${cnt[s.a[i]]}$`, `count $A[${i}]$`), scene: snap(s, [i], cnt) });
  }
  for (let i = 1; i <= k; i++) {
    cnt[i] += cnt[i - 1];
    frames.push({ line: 1, caption: T(`$cnt[${i}]\\mathrel{+}=cnt[${i - 1}]\\to${cnt[i]}$`, `prefix ${i}$`), scene: snap(s, [], cnt) });
  }
  const out = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    const x = s.a[i];
    cnt[x]--;
    out[cnt[x]] = x; s.mov++;
    frames.push({ line: 2, caption: T(`倒序 $A[${i}]=${x}$ → $out[${cnt[x]}]$`, `place ${x}$ at ${cnt[x]}$`), scene: snap(s, [i], cnt) });
  }
  s.a = out;
  s.done = s.a.map(() => true);
  frames.push({ line: 2, caption: T(`完成：$A=[${s.a.join(',')}]$，写回 ${s.mov} 次`, `Sorted, ${s.mov} writes`), scene: snap(s, [], cnt) });
  return frames;
}

export const countingModule: ModuleDef<ArrayScene, ArrayCfg> = {
  id: 'counting-sort',
  title: T('计数排序', 'Counting Sort'),
  desc: T('值域小时：计数 → 前缀和 → 稳定输出。', 'Count + prefix + stable output.'),
  tags: ['algorithms'],
  defaultConfig: { n: 8, valuesStr: '4,2,2,8,3,3,1,0' },
  Controls(p) { return ArrayControls(p as any) as never; },
  code: COUNT_CODE,
  generate: countGen,
  Render(p: any) { return ArrayRender(p) as never; },
};

// ── 基数 LSD ──
const RADIX_CODE = [
  T('for $d \\gets$ 个位 $\\to$ 最高位：', 'for each digit LSD→MSD:'),
  T('  按第 $d$ 位稳定分入 $0..9$ 号桶', '  distribute by digit to buckets'),
  T('  按桶号 $0\\to9$ 依次收回', '  collect buckets in order'),
];

function radixGen(cfg: ArrayCfg): Frame<ArrayScene>[] {
  const arr = parseArr(cfg.valuesStr);
  if (!arr) return badInput();
  const s = base(arr);
  const n = s.a.length;
  const maxD = Math.max(...s.a).toString().length;
  const frames: Frame<ArrayScene>[] = [];
  const digit = (v: number, d: number) => Math.floor(v / 10 ** d) % 10;
  const names = ['个位', '十位', '百位'];
  frames.push({ line: 0, caption: T(`开始：最高 ${maxD} 位`, `Up to ${maxD} digits`), scene: snap(s, []) });
  for (let d = 0; d < maxD; d++) {
    const nm = names[d] ?? `10^${d}位`;
    frames.push({ line: 0, caption: T(`第 ${d + 1} 轮：看${nm}`, `Round ${d + 1}: ${nm}`), scene: snap(s, []) });
    const buckets: number[][] = Array.from({ length: 10 }, () => []);
    for (let i = 0; i < n; i++) {
      const b = digit(s.a[i], d);
      buckets[b].push(s.a[i]);
      frames.push({ line: 1, caption: T(`$A[${i}]=${s.a[i]}$ ${nm}是 ${b}$ → ${b} 号桶`, `${s.a[i]} → bucket ${b}$`), scene: snap(s, [i], undefined, `桶${b}:[${buckets[b].join(',')}]`) });
    }
    let k = 0;
    for (let b = 0; b < 10; b++) {
      for (const v of buckets[b]) {
        s.a[k] = v; s.mov++;
        frames.push({ line: 2, caption: T(`收回 ${b} 号桶 $v=${v}$ → $A[${k}]$`, `collect ${v}$ to ${k}$`), scene: snap(s, [k]) });
        k++;
      }
    }
  }
  s.done = s.a.map(() => true);
  frames.push({ line: 0, caption: T(`完成：$A=[${s.a.join(',')}]$，写回 ${s.mov} 次`, `Sorted, ${s.mov} writes`), scene: snap(s, []) });
  return frames;
}

export const radixModule: ModuleDef<ArrayScene, ArrayCfg> = {
  id: 'radix-sort',
  title: T('基数排序', 'Radix Sort'),
  desc: T('按个/十/百位多轮稳定分桶收回。', 'LSD stable bucket passes.'),
  tags: ['algorithms'],
  defaultConfig: { n: 8, valuesStr: '38,27,43,3,9,82,10,15' },
  Controls(p) { return ArrayControls(p as any) as never; },
  code: RADIX_CODE,
  generate: radixGen,
  Render(p: any) { return ArrayRender(p) as never; },
};

// ── 桶 ──
const BUCKET_CODE = [
  T('按值域分入 $B$ 个桶：$b=\\lfloor x\\cdot B/(max+1)\\rfloor$', 'Distribute into $B$ buckets'),
  T('桶内插入排序', 'Insertion sort each bucket'),
  T('按桶号依次拼接', 'Concatenate buckets'),
];

function bucketGen(cfg: ArrayCfg): Frame<ArrayScene>[] {
  const arr = parseArr(cfg.valuesStr);
  if (!arr) return badInput();
  const s = base(arr);
  const n = s.a.length;
  const frames: Frame<ArrayScene>[] = [];
  const B = Math.min(5, n);
  const mx = Math.max(...s.a);
  const buckets: number[][] = Array.from({ length: B }, () => []);
  frames.push({ line: 0, caption: T(`开始：$B=${B}$ 个桶，$max=${mx}$`, `$B=${B}$ buckets`), scene: snap(s, []) });
  for (let i = 0; i < n; i++) {
    const b = Math.min(B - 1, Math.floor((s.a[i] * B) / (mx + 1)));
    buckets[b].push(s.a[i]);
    frames.push({ line: 0, caption: T(`$A[${i}]=${s.a[i]}$ → ${b} 号桶`, `${s.a[i]} → bucket ${b}$`), scene: snap(s, [i], undefined, `桶${b}:[${buckets[b].join(',')}]`) });
  }
  for (let b = 0; b < B; b++) {
    buckets[b].sort((x, y) => x - y);
    frames.push({ line: 1, caption: T(`${b} 号桶内排好：$[${buckets[b].join(',')}]$`, `bucket ${b}$ sorted`), scene: snap(s, [], undefined, `桶${b}:[${buckets[b].join(',')}]`) });
  }
  let k = 0;
  for (let b = 0; b < B; b++) {
    for (const v of buckets[b]) {
      s.a[k] = v; s.mov++;
      frames.push({ line: 2, caption: T(`拼接 $v=${v}$ → $A[${k}]$`, `concat ${v}$`), scene: snap(s, [k]) });
      k++;
    }
  }
  s.done = s.a.map(() => true);
  frames.push({ line: 0, caption: T(`完成：$A=[${s.a.join(',')}]$`, `Sorted`), scene: snap(s, []) });
  return frames;
}

export const bucketModule: ModuleDef<ArrayScene, ArrayCfg> = {
  id: 'bucket-sort',
  title: T('桶排序', 'Bucket Sort'),
  desc: T('按值域分桶，桶内排好再拼接。', 'Distribute, sort buckets, concat.'),
  tags: ['algorithms'],
  defaultConfig: { n: 8, valuesStr: '38,27,43,3,9,82,10,15' },
  Controls(p) { return ArrayControls(p as any) as never; },
  code: BUCKET_CODE,
  generate: bucketGen,
  Render(p: any) { return ArrayRender(p) as never; },
};
