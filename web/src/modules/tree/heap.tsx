import { useEffect, useMemo, useState } from 'react';
import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { MathText } from '../../lib/tex';

/**
 * 堆 · 优先队列
 * tex: TreeAndBinaryTree「堆体系 (Heap)」
 * - 完全二叉树 + 堆序性质（大顶/小顶）
 * - 数组存储：左子 2i+1、右子 2i+2、父 ⌊(i-1)/2⌋
 * - 建堆（自底向上 SiftDown）、插入（SiftUp）、删除最大（SiftDown）动画
 * - O(1) 取最值、O(log n) 插入/删除
 */
type MaxMin = 'max' | 'min';
type Op = 'idle' | 'build' | 'insert' | 'delete';   // 操作模式
type Step = { line: number; arr: number[]; focus: number | null; bars: { idx: number; hot: boolean }[]; msg: { zh: string; en: string } };
type Cfg = { heapType: MaxMin; data: string; op: Op; val: number; execTick: number };

const FAKE_ADDR = 0x555555559800;

function parse(s: string): number[] { return s.split(/[,，\s]+/).map(x => x.trim()).filter(Boolean).map(Number).filter(Number.isFinite).map(Math.trunc); }

function isMaxHeap(a: number[], heapType: MaxMin): boolean {
  const cmp = (x: number, y: number) => (heapType === 'max' ? x >= y : x <= y);
  for (let i = 0; i < a.length; i++) {
    const l = 2 * i + 1, r = 2 * i + 2;
    if (l < a.length && !cmp(a[i], a[l])) return false;
    if (r < a.length && !cmp(a[i], a[r])) return false;
  }
  return true;
}

// SiftDown（下滤）步骤：返回 [arr, msgs]
function siftDownSteps(a: number[], i: number, n: number, heapType: MaxMin): Array<{ arr: number[]; msg: { zh: string; en: string }; touch: number[] }> {
  const arr = [...a];
  const frames: Array<{ arr: number[]; msg: { zh: string; en: string }; touch: number[] }> = [];
  let cur = i;
  for (;;) {
    const l = 2 * cur + 1, r = 2 * cur + 2;
    let largest = cur;
    frames.push({ arr: [...arr], msg: { zh: `SiftDown(${cur})：比较 $A[${cur}]=${arr[cur]}$ 与孩子`, en: `sift ${cur}` }, touch: [cur] });
    if (l < n && (heapType === 'max' ? arr[l] > arr[largest] : arr[l] < arr[largest])) largest = l;
    if (r < n && (heapType === 'max' ? arr[r] > arr[largest] : arr[r] < arr[largest])) largest = r;
    frames.push({ arr: [...arr], msg: { zh: largest === cur ? `SiftDown(${cur})：孩子无更大，堆序满足` : '', en: `stable` }, touch: [cur, largest, l, r].filter(x => x < n) });
    if (largest === cur) break;
    frames.push({ arr: [...arr], msg: { zh: `交换 $A[${cur}]\leftrightarrow A[${largest}]$（${arr[cur]} ⇄ ${arr[largest]}）`, en: `swap ${cur}↔${largest}` }, touch: [cur, largest] });
    [arr[cur], arr[largest]] = [arr[largest], arr[cur]];
    frames.push({ arr: [...arr], msg: { zh: `交换后：$[${arr.join(',')}]$`, en: `after swap` }, touch: [cur, largest] });
    cur = largest;
  }
  return frames;
}

// 建堆：自底向上从 ⌊(n-2)/2⌋ 到 0 SiftDown
function buildSteps(a: number[], heapType: MaxMin): Step[] {
  const steps: Step[] = [];
  let arr = [...a];
  const n = arr.length;
  const helper = (raw: number[]) => raw.map((v, idx) => ({ idx, hot: false }));
  steps.push({ line: 0, arr: [...arr], focus: null, bars: helper(arr), msg: { zh: `输入 $A[0..${n - 1}]=[${arr.join(',')}]$，检查堆序`, en: `input [${arr.join(',')}]` } });
  for (let i = Math.floor((n - 2) / 2); i >= 0; i--) {
    const frames = siftDownSteps(arr, i, n, heapType);
    for (let k = 0; k < frames.length; k++) {
      const f = frames[k]; arr = [...f.arr];
      steps.push({ line: 1, arr: [...arr], focus: i, bars: helper(arr).map((b, bi) => ({ ...b, hot: f.touch.includes(bi) })), msg: f.msg });
    }
    steps.push({ line: 2, arr: [...arr], focus: i, bars: helper(arr), msg: { zh: `SiftDown(${i}) 完成 → $[${arr.join(',')}]$`, en: `done ${i}` } });
  }
  steps.push({ line: 3, arr: [...arr], focus: null, bars: helper(arr), msg: { zh: `建堆完成：${heapType === 'max' ? '大顶' : '小顶'} $[${arr.join(',')}]$（$O(n)$）`, en: `heap built` } });
  return steps;
}

// 插入：末尾添加 → SiftUp
function insertSteps(a: number[], val: number, heapType: MaxMin): Step[] {
  const steps: Step[] = [];
  const arr = [...a, val];
  const helper = (raw: number[]) => raw.map((v, idx) => ({ idx, hot: false }));
  steps.push({ line: 0, arr: [...arr], focus: arr.length - 1, bars: helper(arr).map((b, i) => ({ ...b, hot: i === arr.length - 1 })), msg: { zh: `插入 $x=${val}$：追加到末尾 $A[${arr.length - 1}]$`, en: `insert ${val} at end` } });
  let cur = arr.length - 1;
  for (;;) {
    if (cur === 0) { steps.push({ line: 2, arr: [...arr], focus: cur, bars: helper(arr), msg: { zh: `已是根：SiftUp 终止`, en: `root reached` } }); break; }
    const p = Math.floor((cur - 1) / 2);
    const good = heapType === 'max' ? arr[cur] <= arr[p] : arr[cur] >= arr[p];
    steps.push({ line: 1, arr: [...arr], focus: cur, bars: helper(arr).map((b, i) => ({ ...b, hot: i === cur || i === p })), msg: { zh: `SiftUp(${cur})：父 $A[${p}]=${arr[p]}$ vs 自己 ${arr[cur]}`, en: `up ${cur} vs ${p}` } });
    if (good) { steps.push({ line: 2, arr: [...arr], focus: cur, bars: helper(arr), msg: { zh: `堆序满足，插入完成`, en: `done` } }); break; }
    steps.push({ line: 1, arr: [...arr], focus: cur, bars: helper(arr).map((b, i) => ({ ...b, hot: i === cur || i === p })), msg: { zh: `交换 $A[${cur}]\\leftrightarrow A[${p}]$`, en: `swap ${cur}↔${p}` } });
    [arr[cur], arr[p]] = [arr[p], arr[cur]];
    cur = p;
  }
  steps.push({ line: 3, arr: [...arr], focus: null, bars: helper(arr), msg: { zh: `插入完成 $[${arr.join(',')}]$（$O(\\log n)$）`, en: `done` } });
  return steps;
}

// 删除堆顶：首末交换 → SiftDown(0)
function deleteSteps(a: number[], heapType: MaxMin): Step[] {
  const steps: Step[] = [];
  const arr = [...a];
  const helper = (raw: number[]) => raw.map((v, idx) => ({ idx, hot: false }));
  const n0 = arr.length;
  if (n0 === 0) return [{ line: 0, arr: [], focus: null, bars: [], msg: { zh: '空堆', en: 'empty' } }];
  const top = arr[0];
  steps.push({ line: 0, arr: [...arr], focus: 0, bars: helper(arr).map((b, i) => ({ ...b, hot: i === 0 })), msg: { zh: `取堆顶 $x=${top}$（$O(1)$），删除`, en: `take top ${top}` } });
  const last = arr[n0 - 1];
  [arr[0], arr[n0 - 1]] = [arr[n0 - 1], arr[0]];
  arr.pop();
  steps.push({ line: 1, arr: [...arr], focus: 0, bars: helper([...arr]).map((b, i) => ({ ...b, hot: i === 0 })), msg: { zh: `末元素 ${last} 移到堆顶`, en: `move ${last} to root` } });
  // SiftDown(0)
  const frames = siftDownSteps(arr, 0, arr.length, heapType);
  for (const f of frames) {
    arr.length = 0; arr.push(...f.arr);
    steps.push({ line: 2, arr: [...arr], focus: f.touch[1] ?? 0, bars: helper(arr).map((b, x) => ({ ...b, hot: f.touch.includes(x) })), msg: f.msg });
  }
  steps.push({ line: 3, arr: [...arr], focus: null, bars: helper(arr), msg: { zh: `删除完成 $[${arr.join(',')}]$（$O(\log n)$）`, en: `done` } });
  return steps;
}

function gen(cfg: Cfg): Frame<Step>[] {
  const heapType = cfg.heapType;
  const a = parse(cfg.data);
  const raw: Step[] =
    cfg.op === 'build' || cfg.op === 'idle' ? buildSteps(a, heapType) :
    cfg.op === 'insert' ? insertSteps(a, cfg.val, heapType) :
    deleteSteps(a, heapType);
  return raw.map(s => ({ line: s.line, caption: s.msg, scene: s }));
}

const CODE: Record<Op, { zh: string[]; en: string[] }> = {
  idle: {
    zh: ['完全二叉树：$A[i]$ 存于连续数组', '左子 $2i{+}1$ · 右子 $2i{+}2$ · 父 $\\lfloor(i{-}1)/2\\rfloor$', '等待选择操作…'],
    en: ['complete tree in array', 'children 2i+1/2i+2', 'pending'],
  },
  build: {
    zh: ['BuildHeap: for $i=\\lfloor(n{-}2)/2\\rfloor$..0', '  SiftDown($i$)', '堆序成立：每节点 ≥/≤ 孩子', // 大顶示例
    ],
    en: ['BuildHeap: for i=(n-2)//2 .. 0', '  SiftDown(i)', 'heap property'],
  },
  insert: {
    zh: ['append 到末尾', 'while 不是根 且 父 <(>)自己: 交换', '完成（SiftUp）'],
    en: ['append', 'sift up', 'done'],
  },
  delete: {
    zh: ['取 $A[0]$（最值）', '$A[0]\\gets A[n{-}1]$; $n{--}$', 'SiftDown($0$)'],
    en: ['take A[0]', 'move last to root', 'sift down'],
  },
};

export const heapModule: ModuleDef<Step, Cfg> = {
  id: 'heap',
  title: T('堆 · 优先队列', 'Heap · Priority Queue'),
  desc: T('完全二叉树存数组：$l{=}2i{+}1$，$r{=}2i{+}2$，父 $\\lfloor(i{-}1)/2\\rfloor$。堆序性质 + 建堆/插入/删除动画。', 'Complete-tree in array; heapify/insert/delete.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: { heapType: 'max' as MaxMin, data: '3,1,6,5,2,4', op: 'build' as Op, val: 7, execTick: 0 },
  randomize(c) {
    const arr = [...Array(6)].map(() => Math.floor(Math.random() * 20) + 1);
    // 打乱后直接成为堆（先构建成堆再随机化？简单：返回随机数组，用户看建堆）
    return { ...c, data: arr.join(','), op: 'build', execTick: 0 } as Cfg;
  },
  Controls({ config, onChange, t }: any) {
    const isZh = t(T('中文', 'en')) !== 'en';
    const [draft, setDraft] = useState<Cfg>(config);
    const set = (p: Partial<Cfg>) => setDraft(s => ({ ...s, ...p }));
    const isHeap = useMemo(() => isMaxHeap(parse(draft.data), draft.heapType), [draft.data, draft.heapType]);
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca' }}>{isZh ? '模式' : 'MODE'}</span>
          <span style={{ fontSize: 13 }}>{t(T('堆型', 'Type'))}</span>
          {([['max', '大顶堆'], ['min', '小顶堆']] as Array<[MaxMin, string]>).map(([v, lb]) => (
            <button key={v} className={`pill ${draft.heapType === v ? 'active' : ''}`} onClick={() => set({ heapType: v })}>{lb}</button>
          ))}
          <span style={{ fontSize: 13, marginLeft: 8 }}>{t(T('操作', 'Op'))}</span>
          {([['build', '建堆'], ['insert', '插入'], ['delete', '删除']] as Array<[Op, string]>).map(([v, lb]) => (
            <button key={v} className={`pill ${draft.op === v ? 'active' : ''}`} onClick={() => set({ op: v })}>{lb}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{isZh ? '参数' : 'PARAMS'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span><MathText text="$A$" /></span>
            <input className="txt" value={draft.data} onChange={e => { const s = e.target.value.replace(/[^\d,\s，]/g, ''); set({ data: s }); }} style={{ width: 160, fontFamily: 'monospace' }} /></label>
          {draft.op === 'insert' && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('值', 'Val'))}</span>
            <input className="txt" type="number" value={draft.val} onChange={e => set({ val: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 64 }} /></label>}
          <button className="ghost" onClick={() => onChange(heapModule.randomize!(draft))}>↻ {t(T('重新生成', 'Regenerate'))}</button>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: isHeap ? '#059669' : '#f59e0b', fontWeight: 700 }}>{isHeap ? `✓ 已是${draft.heapType === 'max' ? '大顶' : '小顶'}堆` : '非堆序（点建堆）'}</span>
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) { const c = CODE[cfg.op] ?? CODE.idle; return c.zh.map((x, i) => ({ zh: x, en: c.en[i] })) as never; },
  generate: gen,
  Render({ scene }) {
    const arr = scene.arr;
    const maxV = Math.max(...arr, 1);
    const hot = new Set(scene.bars.filter(b => b.hot).map(b => b.idx));
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ border: '1px solid #c7d2fe', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 800, color: '#4338ca', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>数组存储 · 完全二叉</span>
            <MathText text={`$A=[${arr.join(',')}]$ · $n=${arr.length}$ · $l{=}2i{+}1$ $r{=}2i{+}2$ 父 $\\lfloor(i{-}1)/2\\rfloor$`} />
          </div>
          <div style={{ padding: 10, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-end' }}>
            {arr.map((v, i) => {
              const parents = new Set<number>([i === 0 ? 0 : Math.floor((i - 1) / 2)]);
              const isRoot = i === 0;
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ fontSize: 9, color: hot.has(i) ? '#4f46e5' : '#94a3b8', fontWeight: 700, fontFamily: 'monospace' }}>{isRoot ? '根' : `父 ${Math.floor((i - 1) / 2)}`}</div>
                  <div style={{ minWidth: 48, textAlign: 'center', padding: '8px 4px', borderRadius: 10, background: hot.has(i) ? '#4f46e5' : isRoot ? '#dc2626' : '#eef2ff', color: hot.has(i) || isRoot ? '#fff' : '#0f172a', border: `1.5px solid ${hot.has(i) ? '#4f46e5' : isRoot ? '#dc2626' : '#c7d2fe'}`, fontWeight: 800, fontSize: 16 }}>{v}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#94a3b8' }}>{i} · 0x{((FAKE_ADDR + i * 4).toString(16)).slice(-4)}</div>
                  <div style={{ fontSize: 8, color: '#cbd5e1' }}>{2 * i + 1 < arr.length ? `L${2 * i + 1}${2 * i + 2 < arr.length ? ` R${2 * i + 2}` : ''}` : '叶'}</div>
                </div>
              );
            })}
            {arr.length === 0 && <span style={{ color: '#94a3b8' }}>空堆</span>}
          </div>
        </div>
      </div>
    ) as unknown as never;
  },
};