import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { ArrayControls, ArrayRender, normScene, parseArr, blankScene, type ArrayCfg, type ArrayScene } from './shared';

function badInput(): Frame<ArrayScene>[] {
  return [{ line: 0, caption: T('! 数组不合法：2~30 个 0~999 的整数，逗号/空格分隔', '! Invalid: 2-30 ints 0-999'), scene: blankScene() }];
}

type St = { a: number[]; done: boolean[]; cmp: number; mov: number };
function base(arr: number[]): St {
  return { a: [...arr], done: arr.map(() => false), cmp: 0, mov: 0 };
}
function snap(s: St, hl: number[], aux?: (number | null)[] | null, note?: string, extra?: Partial<ArrayScene>): ArrayScene {
  return { arr: [...s.a], hl: [...hl], done: [...s.done], cmp: s.cmp, mov: s.mov, aux: aux ? [...aux] : null, note, ...extra };
}

// ── 堆排 ──
const HEAP_CODE = [
  T('建堆：for $i\\gets\\lfloor n/2\\rfloor-1$ down to $0$: $\\text{siftDown}(i)$', 'Build heap bottom-up'),
  T('  $\\text{siftDown}(i)$：与较大孩子比，大则交换下沉', '  sift down larger child'),
  T('for $end\\gets n-1$ down to $1$: $swap(A[0],A[end])$ 就位；$\\text{siftDown}(0)$', 'Extract max to end; sift down'),
  T('$\\text{done}$ // 堆结构见“树”章节', '$\\text{done}$ // heap: see Tree chapter'),
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
      frames.push({ line: 1, caption: T(`$A[${i}]\\leftrightarrow A[${big}]$ 互换下沉`, `swap down`), scene: snap(s, [i, big]) });
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
    frames.push({ line: 2, caption: T(`$A[0]\\leftrightarrow A[${end}]$ 互换，$A[${end}]=${s.a[end]}$ 就位`, `max to ${end}$`), scene: snap(s, [0, end]) });
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
  Render(p: any) { return HeapRender(p) as never; },
};

/** 堆数组同步画小树：完全二叉树按层布局，hl 走下沉路径，done 为已就位 */
function HeapRender({ scene: _scene }: any) {
  const scene = normScene(_scene);
  const n = scene.arr.length;
  const maxLevel = n > 0 ? Math.floor(Math.log2(n)) : 0;
  const W = Math.max(300, 2 ** maxLevel * 56);
  const H = (maxLevel + 1) * 52 + 16;
  const xy = (i: number) => {
    const lv = Math.floor(Math.log2(i + 1));
    const p = i - (2 ** lv - 1);
    return { x: ((p + 0.5) / 2 ** lv) * W, y: 24 + lv * 52 };
  };
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {ArrayRender({ scene }) as unknown as never}
      {n > 0 && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', padding: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textAlign: 'center', marginBottom: 2 }}>堆视图（父 $i$ ↔ 孩子 $2i+1,2i+2$）</div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
            {scene.arr.map((_, i) => {
              const l = 2 * i + 1, r = 2 * i + 2;
              const a = xy(i);
              return (
                <g key={`e${i}`}>
                  {l < n && <line x1={a.x} y1={a.y} x2={xy(l).x} y2={xy(l).y} stroke="#cbd5e1" strokeWidth={1.5} />}
                  {r < n && <line x1={a.x} y1={a.y} x2={xy(r).x} y2={xy(r).y} stroke="#cbd5e1" strokeWidth={1.5} />}
                </g>
              );
            })}
            {scene.arr.map((v, i) => {
              const a = xy(i);
              const active = scene.hl.includes(i);
              const settled = scene.done[i];
              const fill = active ? '#4f46e5' : settled ? '#10b981' : '#fff';
              const stroke = active ? '#312e81' : settled ? '#059669' : '#6366f1';
              return (
                <g key={i}>
                  <circle cx={a.x} cy={a.y} r={15} fill={fill} stroke={stroke} strokeWidth={2} style={{ transition: 'fill .35s' }} />
                  <text x={a.x} y={a.y + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill={active || settled ? '#fff' : '#0f172a'}>{v}</text>
                  <text x={a.x} y={a.y + 27} textAnchor="middle" fontSize={9} fill="#94a3b8">{i}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  ) as unknown as never;
}

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
  T('$d\\gets0,1,\\dots$ // 从个位到最高位', '$d\\gets0,1,\\dots$ // LSD to MSD'),
  T('  $distribute(A,d)\\to B[0..9]$ // 按第$d$位稳定分桶', '  $distribute(A,d)\\to B[0..9]$'),
  T('  $A\\gets concat(B[0..9])$ // 按桶号收回', '  $A\\gets concat(B[0..9])$'),
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
    const snapBuckets = () => buckets.map((x) => [...x]);
    for (let i = 0; i < n; i++) {
      const b = digit(s.a[i], d);
      buckets[b].push(s.a[i]);
      frames.push({ line: 1, caption: T(`$A[${i}]=${s.a[i]}$ ${nm}是 ${b}$ → ${b} 号桶`, `${s.a[i]} → bucket ${b}$`), scene: snap(s, [i], undefined, undefined, { buckets: snapBuckets() }) });
    }
    let k = 0;
    for (let b = 0; b < 10; b++) {
      while (buckets[b].length > 0) {
        const v = buckets[b].shift() as number;
        s.a[k] = v; s.mov++;
        frames.push({ line: 2, caption: T(`收回 ${b} 号桶 $v=${v}$ → $A[${k}]$`, `collect ${v}$ to ${k}$`), scene: snap(s, [k], undefined, undefined, { buckets: snapBuckets() }) });
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
  T('$b(x)\\gets\\lfloor x\\cdot B/(max+1)\\rfloor$ // 按值域分桶', '$b(x)\\gets\\lfloor x\\cdot B/(max+1)\\rfloor$'),
  T('  $\\text{InsertionSort}(B[b])$ // 桶内排序', '  $\\text{InsertionSort}(B[b])$'),
  T('$A\\gets concat(B)$ // 按桶拼接', '$A\\gets concat(B)$'),
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
  const snapBuckets = () => buckets.map((x) => [...x]);
  frames.push({ line: 0, caption: T(`开始：$B=${B}$ 个桶，$max=${mx}$`, `$B=${B}$ buckets`), scene: snap(s, []) });
  for (let i = 0; i < n; i++) {
    const b = Math.min(B - 1, Math.floor((s.a[i] * B) / (mx + 1)));
    buckets[b].push(s.a[i]);
    frames.push({ line: 0, caption: T(`$A[${i}]=${s.a[i]}$ → ${b} 号桶`, `${s.a[i]} → bucket ${b}$`), scene: snap(s, [i], undefined, undefined, { buckets: snapBuckets() }) });
  }
  for (let b = 0; b < B; b++) {
    buckets[b].sort((x, y) => x - y);
    frames.push({ line: 1, caption: T(`${b} 号桶内排好：$[${buckets[b].join(',')}]$`, `bucket ${b}$ sorted`), scene: snap(s, [], undefined, undefined, { buckets: snapBuckets() }) });
  }
  let k = 0;
  for (let b = 0; b < B; b++) {
    while (buckets[b].length > 0) {
      const v = buckets[b].shift() as number;
      s.a[k] = v; s.mov++;
      frames.push({ line: 2, caption: T(`拼接 $v=${v}$ → $A[${k}]$`, `concat ${v}$`), scene: snap(s, [k], undefined, undefined, { buckets: snapBuckets() }) });
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
