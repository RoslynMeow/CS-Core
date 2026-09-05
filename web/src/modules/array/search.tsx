import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { ArrayControls, barSize, parseArr, blankScene, type ArrayScene } from './shared';

type SearchScene = ArrayScene & { target: number; found: number | null };
type SearchCfg = { n: number; valuesStr: string; target: string };

function badInput(): Frame<SearchScene>[] {
  return [{ line: 0, caption: T('! 数组不合法：2~30 个 0~999 的整数', '! Invalid array'), scene: { ...blankScene(), target: 0, found: null } }];
}

function normSearch(s: any): SearchScene {
  const arr = Array.isArray(s?.arr) ? (s.arr as any[]).filter((v) => typeof v === 'number' && Number.isFinite(v)) : [];
  const n = arr.length;
  const hl = Array.isArray(s?.hl) ? (s.hl as any[]).filter((v) => Number.isInteger(v) && v >= 0 && v < n) : [];
  const done = Array.isArray(s?.done) ? arr.map((_, i) => !!(s.done as any[])[i]) : arr.map(() => false);
  const found = Number.isInteger(s?.found) && (s.found as number) >= 0 && (s.found as number) < n ? (s.found as number) : null;
  return {
    arr, hl, done,
    cmp: Number.isFinite(s?.cmp) ? s.cmp : 0,
    mov: 0, aux: null,
    target: Number.isFinite(s?.target) ? s.target : 0,
    found,
  };
}

function SearchControls({ config, onChange, t }: any) {
  const isZh = t(T('中文', 'en')) !== 'en';
  return ArrayControls({
    config, onChange, t,
    extra: (
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
        <span>{isZh ? '找' : 'find'}</span>
        <input
          className="txt"
          value={config.target}
          onChange={(e) => onChange({ ...config, target: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })}
          style={{ width: 64, fontFamily: 'ui-monospace, monospace' }}
          placeholder="27"
        />
      </label>
    ),
  }) as unknown as never;
}

function SearchRender({ scene: _scene }: any) {
  const scene = normSearch(_scene);
  const mx = Math.max(...scene.arr, 1);
  const bs = barSize(scene.arr.length);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="bars" style={{ overflowX: 'auto', gap: bs.gap }}>
        {scene.arr.length === 0 ? (
          <span style={{ color: '#94a3b8', fontSize: 12 }}>空数组</span>
        ) : (
          scene.arr.map((v, i) => {
            const isFound = scene.found === i;
            const active = scene.hl.includes(i);
            const out = scene.done[i];
            return (
              <div
                key={i}
                className={`bar ${active && !isFound ? 'hl' : ''}`}
                style={{
                  width: bs.w,
                  minWidth: bs.w,
                  height: `${(v / mx) * 140 + 14}px`,
                  fontSize: bs.font,
                  overflow: 'hidden',
                  transition: 'height .3s, background-color .35s, opacity .35s',
                  ...(isFound ? { background: '#10b981', borderColor: '#059669' } : out && !active ? { opacity: 0.35 } : {}),
                }}
                title={`A[${i}]=${v}`}
              >
                <span>{v}</span>
              </div>
            );
          })
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', fontSize: 12, color: '#64748b' }}>
        <span>找 {scene.target}</span>
        <span>比较 {scene.cmp}</span>
        {scene.found !== null && <span style={{ color: '#059669', fontWeight: 800 }}>命中 A[{scene.found}]</span>}
      </div>
    </div>
  ) as unknown as never;
}

function mkScene(a: number[], hl: number[], done: boolean[], cmp: number, target: number, found: number | null = null): SearchScene {
  return { arr: [...a], hl: [...hl], done: [...done], cmp, mov: 0, aux: null, target, found };
}

// ── 顺序 ──
const SEQ_CODE = [
  T('for $i \\gets 0$ to $n-1$:', 'for $i \\gets 0$ to $n-1$:'),
  T('  if $A[i]=target$: return $i$', '  if $A[i]=target$: return $i$'),
  T('return $-1$ // 不存在', 'return $-1$'),
];

function seqGen(cfg: SearchCfg): Frame<SearchScene>[] {
  const arr = parseArr(cfg.valuesStr);
  const target = Number(cfg.target);
  if (!arr || !Number.isFinite(target)) return badInput();
  const done = arr.map(() => false);
  let cmp = 0;
  const frames: Frame<SearchScene>[] = [];
  frames.push({ line: 0, caption: T(`找 $target=${target}$，$n=${arr.length}$`, `Find ${target}$`), scene: mkScene(arr, [], done, cmp, target) });
  for (let i = 0; i < arr.length; i++) {
    cmp++;
    frames.push({ line: 0, caption: T(`看 $A[${i}]=${arr[i]}$`, `check $A[${i}]$`), scene: mkScene(arr, [i], done, cmp, target) });
    if (arr[i] === target) {
      frames.push({ line: 1, caption: T(`$A[${i}]=target$，返回 ${i}`, `found at ${i}$`), scene: mkScene(arr, [i], done, cmp, target, i) });
      return frames;
    }
    frames.push({ line: 1, caption: T(`$A[${i}]\\ne target$，继续`, `not equal`), scene: mkScene(arr, [i], done, cmp, target) });
    done[i] = true;
  }
  frames.push({ line: 2, caption: T(`查完无命中，返回 $-1$`, `not found, $-1$`), scene: mkScene(arr, [], done, cmp, target) });
  return frames;
}

export const seqSearchModule: ModuleDef<SearchScene, SearchCfg> = {
  id: 'sequential-search',
  title: T('顺序查找', 'Sequential Search'),
  desc: T('从头逐个比对，命中即返回', 'Scan and compare one by one.'),
  tags: ['algorithms'],
  defaultConfig: { n: 8, valuesStr: '38,27,43,3,9,82,10,15', target: '27' },
  Controls: SearchControls as never,
  code: SEQ_CODE,
  generate: seqGen,
  Render(p: any) { return SearchRender(p) as never; },
};

// ── 二分 ──
const BIN_CODE = [
  T('$lo\\gets0$; $hi\\gets n-1$ // 前提有序', '$lo\\gets0$; $hi\\gets n-1$'),
  T('while $lo\\le hi$:', 'while $lo\\le hi$:'),
  T('  $mid\\gets\\lfloor(lo+hi)/2\\rfloor$ // 取中点', '  $mid\\gets\\lfloor(lo+hi)/2\\rfloor$'),
  T('  if $A[mid]=target$:', '  if $A[mid]=target$:'),
  T('    return $mid$ // 命中', '    return $mid$'),
  T('  if $A[mid]<target$:', '  if $A[mid]<target$:'),
  T('    $lo\\gets mid+1$ // 弃左半', '    $lo\\gets mid+1$'),
  T('  else:', '  else:'),
  T('    $hi\\gets mid-1$ // 弃右半', '    $hi\\gets mid-1$'),
];

function binGen(cfg: SearchCfg): Frame<SearchScene>[] {
  const arr0 = parseArr(cfg.valuesStr);
  const target = Number(cfg.target);
  if (!arr0 || !Number.isFinite(target)) return badInput();
  const arr = [...arr0].sort((x, y) => x - y);
  const done = arr.map(() => false);
  let cmp = 0;
  const frames: Frame<SearchScene>[] = [];
  frames.push({ line: 0, caption: T(`前提有序：[${arr.join(',')}]$，找 $${target}$`, `Sorted, find ${target}$`), scene: mkScene(arr, [], done, cmp, target) });
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    cmp++;
    frames.push({ line: 1, caption: T(`$lo=${lo},\\;hi=${hi}$`, `$lo=${lo},hi=${hi}$`), scene: mkScene(arr, [], done, cmp, target) });
    frames.push({ line: 2, caption: T(`$mid=${mid}$，$A[mid]=${arr[mid]}$`, `$mid=${mid}$`), scene: mkScene(arr, [mid], done, cmp, target) });
    frames.push({ line: 3, caption: T(`比 $A[${mid}]=${arr[mid]}$ 与 $${target}$`, `compare`), scene: mkScene(arr, [mid], done, cmp, target) });
    if (arr[mid] === target) {
      frames.push({ line: 4, caption: T(`相等！返回 ${mid}`, `found at ${mid}$`), scene: mkScene(arr, [mid], done, cmp, target, mid) });
      return frames;
    }
    if (arr[mid] < target) {
      for (let k = lo; k <= mid; k++) done[k] = true;
      lo = mid + 1;
      frames.push({ line: 6, caption: T(`$A[mid]<target$，$lo\\gets${lo}$（左半排除）`, `go right`), scene: mkScene(arr, [], done, cmp, target) });
    } else {
      for (let k = mid; k <= hi; k++) done[k] = true;
      hi = mid - 1;
      frames.push({ line: 8, caption: T(`$A[mid]>target$，$hi\\gets${hi}$（右半排除）`, `go left`), scene: mkScene(arr, [], done, cmp, target) });
    }
  }
  frames.push({ line: 1, caption: T(`$lo>hi$，不存在，返回 $-1$`, `not found`), scene: mkScene(arr, [], done, cmp, target) });
  return frames;
}

export const binSearchModule: ModuleDef<SearchScene, SearchCfg> = {
  id: 'binary-search',
  title: T('二分查找', 'Binary Search'),
  desc: T('有序数组每次对半排除，$O(\\log n)$。', 'Halve the range each time.'),
  tags: ['algorithms'],
  defaultConfig: { n: 8, valuesStr: '3,9,10,15,27,38,43,82', target: '27' },
  Controls: SearchControls as never,
  code: BIN_CODE,
  generate: binGen,
  Render(p: any) { return SearchRender(p) as never; },
};

// ── 插值 ──
const INTERP_CODE = [
  T('$lo\\gets0$; $hi\\gets n-1$ // 前提有序均匀', '$lo\\gets0$; $hi\\gets n-1$'),
  T('while $lo\\le hi \\land target\\in[A[lo],A[hi]]$:', 'while $lo\\le hi \\land target$ in range:'),
  T('  $pos\\gets lo+\\lfloor(target-A[lo])(hi-lo)/(A[hi]-A[lo])\\rfloor$ // 按比例估位', '  $pos\\gets$ proportional probe'),
  T('  if $A[pos]=target$:', '  if $A[pos]=target$:'),
  T('    return $pos$ // 命中', '    return $pos$'),
  T('  if $A[pos]<target$:', '  if $A[pos]<target$:'),
  T('    $lo\\gets pos+1$ // 偏小弃左', '    $lo\\gets pos+1$'),
  T('  else:', '  else:'),
  T('    $hi\\gets pos-1$ // 偏大弃右', '    $hi\\gets pos-1$'),
];

function interpGen(cfg: SearchCfg): Frame<SearchScene>[] {
  const arr0 = parseArr(cfg.valuesStr);
  const target = Number(cfg.target);
  if (!arr0 || !Number.isFinite(target)) return badInput();
  const arr = [...arr0].sort((x, y) => x - y);
  const done = arr.map(() => false);
  let cmp = 0;
  const frames: Frame<SearchScene>[] = [];
  frames.push({ line: 0, caption: T(`前提有序均匀：[${arr.join(',')}]$，找 $${target}$`, `Sorted, find ${target}$`), scene: mkScene(arr, [], done, cmp, target) });
  let lo = 0, hi = arr.length - 1;
  let guard = 0;
  while (lo <= hi && target >= arr[lo] && target <= arr[hi] && guard++ < 32) {
    let pos: number;
    if (arr[hi] === arr[lo]) pos = lo;
    else pos = lo + Math.floor(((target - arr[lo]) * (hi - lo)) / (arr[hi] - arr[lo]));
    pos = Math.max(lo, Math.min(hi, pos));
    cmp++;
    frames.push({ line: 1, caption: T(`$lo=${lo},hi=${hi}$，范围内`, `in range`), scene: mkScene(arr, [], done, cmp, target) });
    frames.push({ line: 2, caption: T(`按比例估 $pos=${pos}$`, `probe ${pos}$`), scene: mkScene(arr, [pos], done, cmp, target) });
    if (arr[pos] === target) {
      frames.push({ line: 4, caption: T(`$A[${pos}]=target$，返回 ${pos}`, `found at ${pos}$`), scene: mkScene(arr, [pos], done, cmp, target, pos) });
      return frames;
    }
    if (arr[pos] < target) {
      for (let k = lo; k <= pos; k++) done[k] = true;
      lo = pos + 1;
      frames.push({ line: 6, caption: T(`偏小，$lo\\gets${lo}$`, `go right`), scene: mkScene(arr, [], done, cmp, target) });
    } else {
      for (let k = pos; k <= hi; k++) done[k] = true;
      hi = pos - 1;
      frames.push({ line: 8, caption: T(`偏大，$hi\\gets${hi}$`, `go left`), scene: mkScene(arr, [], done, cmp, target) });
    }
  }
  frames.push({ line: 1, caption: T('超出范围或无区间，不存在', 'not found'), scene: mkScene(arr, [], done, cmp, target) });
  return frames;
}

export const interpSearchModule: ModuleDef<SearchScene, SearchCfg> = {
  id: 'interpolation-search',
  title: T('插值查找', 'Interpolation Search'),
  desc: T('按数值比例估位置，均匀数据更快。', 'Probe by value proportion.'),
  tags: ['algorithms'],
  defaultConfig: { n: 8, valuesStr: '3,9,10,15,27,38,43,82', target: '27' },
  Controls: SearchControls as never,
  code: INTERP_CODE,
  generate: interpGen,
  Render(p: any) { return SearchRender(p) as never; },
};

// ── 分块 ──
const BLOCK_CODE = [
  T('$s\\gets\\lceil n/3\\rceil$ // 块大小；块内块间有序', '$s\\gets\\lceil n/3\\rceil$ // block size'),
  T('$b\\gets\\min\\{b:B_{max}[b]\\ge target\\}$ // 先定块', '$b\\gets\\min\\{b:B_{max}[b]\\ge target\\}$'),
  T('$\\text{SequentialSearch}(B[b])$ // 块内顺序找，见“顺序查找”', '$\\text{SequentialSearch}(B[b])$ // see Sequential Search'),
];

function blockGen(cfg: SearchCfg): Frame<SearchScene>[] {
  const arr0 = parseArr(cfg.valuesStr);
  const target = Number(cfg.target);
  if (!arr0 || !Number.isFinite(target)) return badInput();
  // 构造块内有序、块间有序：整体排序后按块大小切分
  const sorted = [...arr0].sort((x, y) => x - y);
  const s = Math.max(2, Math.ceil(sorted.length / 3));
  const blocks: number[][] = [];
  for (let i = 0; i < sorted.length; i += s) blocks.push(sorted.slice(i, i + s));
  const arr = blocks.flat();
  const done = arr.map(() => true); // 先全灰，定块后再点亮候选块
  let cmp = 0;
  const frames: Frame<SearchScene>[] = [];
  const maxes = blocks.map((b) => b[b.length - 1]);
  frames.push({ line: 0, caption: T(`分 ${blocks.length} 块（$s=${s}$），块最大 $=[${maxes.join(',')}]$`, `${blocks.length} blocks`), scene: mkScene(arr, [], done, cmp, target) });
  let bi = -1;
  for (let b = 0; b < blocks.length; b++) {
    cmp++;
    const start = blocks.slice(0, b).reduce((x, b2) => x + b2.length, 0);
    const idxs = blocks[b].map((_, k) => start + k);
    frames.push({ line: 1, caption: T(`$target$ vs ${b} 号块最大 $${maxes[b]}$`, `vs block ${b}$ max`), scene: mkScene(arr, idxs, done.map(() => true), cmp, target) });
    if (target <= maxes[b]) {
      bi = b;
      const lit = done.map(() => true);
      idxs.forEach((i) => (lit[i] = false));
      frames.push({ line: 1, caption: T(`落入 ${b} 号块`, `in block ${b}$`), scene: mkScene(arr, idxs, lit, cmp, target) });
      // 块内顺序
      for (let k = 0; k < blocks[b].length; k++) {
        const gi = idxs[k];
        cmp++;
        frames.push({ line: 2, caption: T(`块内 $A[${gi}]=${blocks[b][k]}$`, `scan $A[${gi}]$`), scene: mkScene(arr, [gi], lit, cmp, target) });
        if (blocks[b][k] === target) {
          frames.push({ line: 2, caption: T(`命中 ${gi}！`, `found at ${gi}$`), scene: mkScene(arr, [gi], lit, cmp, target, gi) });
          return frames;
        }
      }
      frames.push({ line: 2, caption: T('块内无命中，不存在', 'not in block'), scene: mkScene(arr, [], lit, cmp, target) });
      return frames;
    }
  }
  frames.push({ line: 1, caption: T('比所有块最大都大，不存在', 'beyond all blocks'), scene: mkScene(arr, [], done, cmp, target) });
  return frames;
}

export const blockSearchModule: ModuleDef<SearchScene, SearchCfg> = {
  id: 'block-search',
  title: T('分块查找', 'Block Search'),
  desc: T('先按块最大定块，再块内顺序找。', 'Locate block, then scan inside.'),
  tags: ['algorithms'],
  defaultConfig: { n: 9, valuesStr: '3,9,10,15,27,38,43,55,82', target: '27' },
  Controls: SearchControls as never,
  code: BLOCK_CODE,
  generate: blockGen,
  Render(p: any) { return SearchRender(p) as never; },
};
