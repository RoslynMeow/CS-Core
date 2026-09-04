import { useEffect, useState } from 'react';
import { T } from '../../i18n/lang';
import { MathText } from '../../lib/tex';
import type { Frame, ModuleDef } from '../../engine/types';
import { buildMemoryUrl, encodeIntBE, encodeIntLE, hexFromBytes } from '../../lib/memoryDump';
import { Heap } from '../../lib/heap';
import { processBaseOnce } from '../../lib/sessionHeap';


type ElemType = 'i32' | 'i16' | 'u8';
type Order = 'row' | 'col';
type Op = 'idle' | 'get' | 'set';
type Cfg = { elemType: ElemType; endian: 'little' | 'big'; rows: number; cols: number; order: Order; inited: boolean; dataStr: string; prevDataStr?: string; op: Op; i: number; j: number; val: number; execTick: number; };

type Scene = { base: number; heapBase: number; total: number; elemSize: number; elemType: ElemType; endian: 'little' | 'big'; rows: number; cols: number; order: Order; inited: boolean; cells: (number | null)[]; used: number; bytes: Uint8Array; hex: string; focus: { i: number; j: number } | null; phase: 'idle' | 'addr' | 'write' | 'access'; op: Op; i: number; j: number; val: number };

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316'];
const HEAP_TOTAL = 384;
let arrS: { heap: Heap; base: number; total: number; rows: number; cols: number; elemSize: number } | null = null;


function elemSizeOf(t: ElemType): number { return t === 'i32' ? 4 : t === 'i16' ? 2 : 1; }
function parseCells(s: string, n: number): (number | null)[] {
  const parts = s.split(',');
  const cells = new Array<number | null>(n).fill(null);
  for (let i = 0; i < Math.min(parts.length, n); i++) {
    const t = parts[i].trim();
    if (t === '') continue;
    const v = Number(t);
    if (!Number.isFinite(v)) continue;
    cells[i] = Math.trunc(v);
  }
  return cells;
}
function serialize(cells: (number | null)[]): string { return cells.map(c => (c === null ? '' : String(c))).join(','); }
// 二维逻辑 (i,j) → 一维物理 idx（行优先 i*C+j / 列优先 j*R+i）
function idxOf(i: number, j: number, R: number, C: number, order: Order): number { return order === 'row' ? i * C + j : j * R + i; }

function buildHeapScene(cfg: Cfg, focus: { i: number; j: number } | null, phase: Scene['phase'], cellsOverride?: (number | null)[]): Scene {
  const elemSize = elemSizeOf(cfg.elemType);
  const R = Math.max(1, Math.min(8, cfg.rows | 0));
  const C = Math.max(1, Math.min(8, cfg.cols | 0));
  const n = R * C;
  const cells = cellsOverride ?? parseCells(cfg.dataStr, n);
  const total = n * elemSize;
  if (!cfg.inited) {
    return { base: 0, heapBase: 0, total: 0, elemSize, elemType: cfg.elemType, endian: cfg.endian, rows: R, cols: C, order: cfg.order, inited: false, cells: new Array<number | null>(n).fill(null), used: 0, bytes: new Uint8Array(0), hex: '', focus, phase, op: cfg.op, i: cfg.i, j: cfg.j, val: cfg.val };
  }
  if (arrS === null || arrS.total !== total || arrS.rows !== R || arrS.cols !== C || arrS.elemSize !== elemSize) {
    if (arrS === null) arrS = { heap: new Heap(HEAP_TOTAL, processBaseOnce()), base: 0, total: 0, rows: 0, cols: 0, elemSize: 0 };
    arrS.heap.resetAll();
    const osSize = 16; // 固定 OS 预占，进程内 realloc 后地址仍稳定
    arrS.heap.allocate('__os__', osSize);
    arrS.base = arrS.heap.allocate('mat', total) ?? arrS.heap.base + osSize;
    arrS.total = total; arrS.rows = R; arrS.cols = C; arrS.elemSize = elemSize;
  }
  const heap = arrS.heap;
  const base = arrS.base;
  const bytes = new Uint8Array(total);
  for (let i = 0; i < n; i++) {
    if (cells[i] === null) continue;
    const enc = cfg.endian === 'little' ? encodeIntLE(cells[i]!, elemSize) : encodeIntBE(cells[i]!, elemSize);
    for (let b = 0; b < elemSize; b++) bytes[i * elemSize + b] = enc[b] & 0xff;
  }
  heap.writeBytes(base, Array.from(bytes));
  const hex = hexFromBytes(Array.from(bytes));
  return { base, heapBase: heap.base, total, elemSize, elemType: cfg.elemType, endian: cfg.endian, rows: R, cols: C, order: cfg.order, inited: true, cells, used: cells.reduce<number>((k, c) => k + (c === null ? 0 : 1), 0), bytes, hex, focus, phase, op: cfg.op, i: cfg.i, j: cfg.j, val: cfg.val };
}
function buildDump(cfg: Cfg) {
  const s = buildHeapScene(cfg, null, 'idle');
  const R = s.rows; const C = s.cols; const elemSize = s.elemSize;
  const fields = Array.from({ length: s.total / elemSize }, (_, idx) => {
    const c = s.order === 'row' ? idx % C : Math.floor(idx / C);
    const r = s.order === 'row' ? Math.floor(idx / C) : idx % C;
    return { name: `M[${r}][${c}]`, offset: idx * elemSize, size: elemSize, type: cfg.elemType, color: COLORS[(r * C + c) % COLORS.length] };
  });
  return {
    base: `0x${s.base.toString(16)}`,
    total: Math.max(s.total, 32),
    endian: s.endian,
    allocations: [{ key: 'mat', addr: `0x${s.base.toString(16)}`, size: s.total, hex: s.hex, label: `Matrix M[${R}][${C}] · ${s.order === 'row' ? '行优先' : '列优先'} · heap@0x${s.heapBase.toString(16)}`, color: '#4f46e5', fields }],
  } as const;
}
function gen(cfg: Cfg): Frame<Scene>[] {
  const elemSize = elemSizeOf(cfg.elemType);
  const R = Math.max(1, Math.min(8, cfg.rows | 0));
  const C = Math.max(1, Math.min(8, cfg.cols | 0));
  const hasPrev = typeof cfg.prevDataStr === 'string' && cfg.execTick > 0 && cfg.op === 'set';
  const orig = hasPrev ? parseCells(cfg.prevDataStr!, R * C) : parseCells(cfg.dataStr, R * C);
  const cur = parseCells(cfg.dataStr, R * C);
  if (cfg.execTick === 0 || cfg.op === 'idle') {
    const idle = buildHeapScene({ ...cfg, op: 'idle' }, null, 'idle');
    if (!cfg.inited) return [{ line: 0, caption: T(`未初始化：设置 $M[${R}\\times${C}]$ 并点「初始化」分配连续空间`, 'Not initialized'), scene: idle }];
    const used = idle.used;
    const empty = used === 0;
    return [
      { line: 0, caption: T(empty ? `就绪：$M[${R}\\times${C}]$ 空，点“示例”构造` : `就绪：$M[${R}\\times${C}]$，×${used} 元素，${cfg.order === 'row' ? '行优先' : '列优先'} $idx=i\\cdot C+j$`, empty ? 'empty ready' : 'ready'), scene: idle },
    ];
  }
  if (!cfg.inited) {
    const idle = buildHeapScene({ ...cfg, op: 'idle' }, null, 'idle');
    return [{ line: 0, caption: T('未初始化：请先点「初始化」再执行操作', 'Not initialized'), scene: idle }];
  }
  const i = cfg.i | 0; const j = cfg.j | 0;
  const okIdx = i >= 0 && i < R && j >= 0 && j < C;
  const idx = okIdx ? idxOf(i, j, R, C, cfg.order) : -1;
  if (cfg.op === 'get') {
    const f = buildHeapScene(cfg, okIdx ? { i, j } : null, 'access');
    const has = okIdx && f.cells[idx] !== null;
    return [
      { line: 0, caption: T(`$idx = ${cfg.order === 'row' ? `i\\cdot C+j = ${i}\\times${C}+${j}` : `j\\cdot R+i = ${j}\\times${R}+${i}`} = ${idx}$（${cfg.order === 'row' ? '行优先' : '列优先'}）`, `idx=${idx}`), scene: { ...f, focus: okIdx ? { i, j } : null } },
      { line: 1, caption: T(`$addr = base + idx\\cdot elemSize = 0x${f.base.toString(16)} + ${idx}\\times${elemSize} = 0x${okIdx ? (f.base + idx * elemSize).toString(16) : f.base.toString(16)}$`, `addr=0x${okIdx ? (f.base + idx * elemSize).toString(16) : f.base.toString(16)}`), scene: { ...f, focus: okIdx ? { i, j } : null } },
      { line: 2, caption: okIdx && has ? T(`取值：$M[${i}][${j}]=${f.cells[idx]}$`, `M[${i}][${j}]=${f.cells[idx]}`) : okIdx && !has ? T(`该格为空（未初始化）`, `empty cell`) : T(`越界：需 $0\\le i<${R},\\;0\\le j<${C}$`, `oob`), scene: { ...f, focus: okIdx ? { i, j } : null } },
    ];
  }
  if (cfg.op === 'set') {
    if (!okIdx) {
      const s0 = buildHeapScene(cfg, null, 'idle', orig);
      return [{ line: 0, caption: T(`越界：需 $0\\le i<${R},\\;0\\le j<${C}$`, `oob`), scene: s0 }];
    }
    const after = hasPrev ? cur : [...orig]; after[idx] = Math.trunc(cfg.val);
    const s0 = buildHeapScene(cfg, { i, j }, 'addr', orig);
    const s2 = buildHeapScene(cfg, { i, j }, 'write', after);
    return [
      { line: 0, caption: T(`$idx = ${cfg.order === 'row' ? `i\\cdot C+j = ${i}\\times${C}+${j}` : `j\\cdot R+i = ${j}\\times${R}+${i}`} = ${idx}$，$addr=0x${(s2.base + idx * elemSize).toString(16)}$`, `idx=${idx}`), scene: s0 },
      { line: 1, caption: T(`写入 $M[${i}][${j}]\\gets ${cfg.val}$ @0x${(s2.base + idx * elemSize).toString(16)}$`, `write M[${i}][${j}]=${cfg.val}`), scene: { ...s2, phase: 'write' } },
      { line: 2, caption: T(`完成：连续 $${s2.total}B$ 内存，${cfg.order === 'row' ? '行优先' : '列优先'} 布局`, `done`), scene: { ...s2, phase: 'access' } },
    ];
  }
  return gen({ ...cfg, op: 'idle', execTick: 0 });
}
const CODE: Record<Op, any> = {
  idle: [T('$base \\gets malloc(R\\cdot C\\cdot elemSize)$', '$base\\gets malloc$'), T('$M[i][j]$ // 线性化存连续内存', '$M[i][j]$ linearized'), T('$pending$ // 等待执行', '$pending$')] as never,
  get: [T('$idx\\gets lin(i,j)$ // 行优先 $i\\cdot C+j$，列优先 $j\\cdot R+i$', '$idx\\gets lin(i,j)$'), T('$addr \\gets base + idx\\cdot elemSize$', '$addr$'), T('return $mem[addr]$ // $O(1)$', 'return')] as never,
  set: [T('$idx\\gets lin(i,j)$; $addr\\gets base+idx\\cdot elemSize$ // 行/列优先', '$idx,addr\\gets lin$'), T('$mem[addr] \\gets val$ // 写入', 'mem[addr] = val'), T('return $M[i][j]$ // 写入完成', 'return $M[i][j]$')] as never,
};
function toHex(b: number) { return b.toString(16).padStart(2, '0').toUpperCase(); }

export const matrixModule: ModuleDef<Scene, Cfg> = {
  id: 'matrix', title: T('矩阵', 'Matrix (2D Addressing)'),
  desc: T('$M[i][j]$ 按行优先 $idx=i\\cdot C+j$ 或列优先 $idx=j\\cdot R+i$ 线性化到连续内存，$addr=base+idx\\cdot elemSize$。', 'Row/column-major linearization to contiguous memory.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: { elemType: 'i32', endian: 'little', rows: 3, cols: 4, order: 'row' as Order, inited: false, dataStr: '', op: 'idle', i: 0, j: 0, val: 0, execTick: 0 },
  randomize(c) { return { ...c, dataStr: '', op: 'idle', execTick: 0 } as Cfg; },
  Controls({ config, onChange, t, onPlay }: any) {
    const isZh = t(T('中文', 'en')) !== 'en';
    const [draft, setDraft] = useState<Cfg>(config);
    const set = (p: Partial<Cfg>) => setDraft(s => ({ ...s, ...p }));
    // 外部 config 变化（随机/示例/清空/语言切换）时同步本地 draft
    useEffect(() => { if (draft.dataStr !== config.dataStr || draft.execTick !== config.execTick) setDraft(config); }, [config]);
    const loadExample = () => { const ns: Cfg = { ...draft, dataStr: '1,2,3,4,5,6,7,8,9,10,11,12', prevDataStr: undefined, op: 'idle', execTick: 0 }; setDraft(ns); onChange(ns); };
    const clearAll = () => { const ns: Cfg = { ...draft, inited: false, dataStr: '', prevDataStr: undefined, op: 'idle', execTick: 0 }; setDraft(ns); onChange(ns); };
    const init = () => { const ns: Cfg = { ...draft, inited: true, dataStr: '', prevDataStr: undefined, op: 'idle', execTick: 0 }; setDraft(ns); onChange(ns); };
    const exec = () => {
      const op = (['get', 'set'] as Op[]).includes(draft.op) ? draft.op : 'get';
      const R = Math.max(1, Math.min(8, draft.rows | 0)); const C = Math.max(1, Math.min(8, draft.cols | 0));
      const cur = parseCells(draft.dataStr, R * C);
      let nextStr = draft.dataStr;
      let prev: string | undefined;
      if (op === 'set') {
        const i = draft.i | 0; const j = draft.j | 0;
        if (i >= 0 && i < R && j >= 0 && j < C) {
          const after = [...cur];
          after[idxOf(i, j, R, C, draft.order)] = Math.trunc(draft.val);
          nextStr = serialize(after); prev = draft.dataStr;
        }
      }
      const next: Cfg = { ...draft, dataStr: nextStr, prevDataStr: prev, op, execTick: config.execTick + 1 };
      onChange(next); setDraft(next); setTimeout(() => onPlay?.(), 60);
    };
    const dump = buildDump({ ...draft, execTick: config.execTick } as Cfg);
    const onView = () => { location.href = buildMemoryUrl(dump as any); };
    const needIJ = draft.op !== 'idle';
    const needVal = draft.op === 'set';
    const R = Math.max(1, Math.min(8, draft.rows | 0)); const C = Math.max(1, Math.min(8, draft.cols | 0));
    const cur = parseCells(draft.dataStr, R * C);
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca' }}>{isZh ? '模式' : 'MODE'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('元素', 'Elem'))}</span><select className="txt" value={draft.elemType} disabled={draft.inited} onChange={e => set({ elemType: e.target.value as ElemType })}><option value="i32">i32 (4B)</option><option value="i16">i16 (2B)</option><option value="u8">u8 (1B)</option></select></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>Endian</span><select className="txt" value={draft.endian} onChange={e => set({ endian: e.target.value as any })}><option value="little">little</option><option value="big">big</option></select></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>行 R</span><input className="txt" type="number" min={1} max={8} value={draft.rows} disabled={draft.inited} onChange={e => { const v = Math.max(1, Math.min(8, Number(e.target.value) || 3)); set({ rows: v }); onChange({ ...draft, rows: v, op: 'idle' as Op, execTick: 0 }); }} style={{ width: 52 }} /></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>列 C</span><input className="txt" type="number" min={1} max={8} value={draft.cols} disabled={draft.inited} onChange={e => { const v = Math.max(1, Math.min(8, Number(e.target.value) || 4)); set({ cols: v }); onChange({ ...draft, cols: v, op: 'idle' as Op, execTick: 0 }); }} style={{ width: 52 }} /></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('存储', 'Order'))}</span><select className="txt" value={draft.order} disabled={draft.inited} onChange={e => { const v = e.target.value as Order; set({ order: v }); onChange({ ...draft, order: v, op: 'idle' as Op, execTick: 0 }); }}>
            <option value="row">{t(T('行优先 i·C+j', 'Row-major'))}</option>
            <option value="col">{t(T('列优先 j·R+i', 'Column-major'))}</option>
          </select></label>
          {!draft.inited && <button className="pill active" onClick={init}>{t(T('初始化', 'Init'))}</button>}
          <button className="ghost" onClick={clearAll}>{t(T('清空', 'Clear'))}</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap', opacity: draft.inited ? 1 : 0.5, pointerEvents: draft.inited ? 'auto' : 'none' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{isZh ? '参数' : 'PARAMS'}</span>
          <button className="ghost" onClick={() => onChange(matrixModule.randomize!(draft))}>↻ {t(T('重新生成', 'Regenerate'))}</button>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('操作', 'Op'))}</span><select className="txt" value={draft.op} onChange={e => set({ op: e.target.value as Op })}>
            <option value="idle">{t(T('— 选择操作 —', '— pick —'))}</option><option value="get">{t(T('访问', 'Get'))}</option><option value="set">{t(T('写入', 'Set'))}</option>
          </select></label>
          {needIJ && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>i</span><input className="txt" type="number" min={0} max={Math.max(0, R - 1)} value={draft.i} onChange={e => set({ i: Number(e.target.value) || 0 })} style={{ width: 48 }} /></label>}
          {needIJ && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>j</span><input className="txt" type="number" min={0} max={Math.max(0, C - 1)} value={draft.j} onChange={e => set({ j: Number(e.target.value) || 0 })} style={{ width: 48 }} /></label>}
          {needVal && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('值', 'Val'))}</span><input className="txt" type="number" value={draft.val} onChange={e => set({ val: Number(e.target.value) || 0 })} style={{ width: 64 }} /></label>}
                    <button className="pill active" onClick={exec} disabled={draft.op === 'idle' || !draft.inited}>执行</button>
          <button className="ghost" onClick={loadExample} disabled={!draft.inited}>示例</button>
          <button className="pill" onClick={onView} disabled={!draft.inited}>查看内存 ↗</button>
          {!draft.inited && <span style={{ fontSize: 11, fontFamily: 'monospace', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 999, padding: '3px 8px' }}>{isZh ? '未初始化' : 'not inited'}</span>}
          <span style={{ fontSize: 11, fontFamily: 'monospace', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 999, padding: '3px 8px' }}>
            {isZh ? `已用 ${cur.filter(x => x !== null).length}/${R * C}` : `${cur.filter(x => x !== null).length}/${R * C}`}
          </span>
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) { return CODE[cfg.op] as never; },
  generate: gen,
  Render({ scene: _scene }) {
    // 防错位：切 subMode 后首帧可能仍是旧模块的 scene，先兜底再渲染
    const scene = ((_scene as any) ?? {}) as Scene;
    scene.inited = !!scene.inited;
    scene.rows = Number.isFinite(scene.rows) ? scene.rows : 0;
    scene.cols = Number.isFinite(scene.cols) ? scene.cols : 0;
    scene.order = (scene.order === 'row' || scene.order === 'col' ? scene.order : 'row') as Scene['order'];
    scene.cells = Array.isArray(scene.cells) ? scene.cells : [];
    scene.base = Number.isFinite(scene.base) ? scene.base : 0;
    scene.total = Number.isFinite(scene.total) ? scene.total : 0;
    scene.elemSize = Number.isFinite(scene.elemSize) ? scene.elemSize : 4;
    scene.used = Number.isFinite(scene.used) ? scene.used : 0;
    scene.focus = scene.focus && Number.isFinite(scene.focus.i) && Number.isFinite(scene.focus.j) ? scene.focus : null;
    const { rows: R, cols: C, order } = scene;
    if (!scene.inited) {
      return (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#b91c1c', textAlign: 'center' }}>
            未初始化 — 设置行列与存储顺序后点「初始化」；只有清空后才能重新初始化大小。
          </div>
        </div>
      ) as unknown as never;
    }
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ border: '1px solid #c7d2fe', borderRadius: 12, overflow: 'hidden', background: '#eef2ff' }}>
          <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 800, color: '#4338ca', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>逻辑视图 · 矩阵 M[{R}×{C}]</span>
            <span style={{ fontWeight: 400, color: '#64748b' }}>{order === 'row' ? <MathText text={'行优先 $idx=i\\cdot C+j$'} /> : <MathText text={'列优先 $idx=j\\cdot R+i$'} />} · 连续 {scene.total}B @0x{scene.base.toString(16)}</span>
          </div>
          <div style={{ padding: 12, overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${C}, 108px)`, gap: 6, width: 'max-content', margin: '0 auto' }}>
              {Array.from({ length: R * C }, (_, idx) => {
                const r = order === 'row' ? Math.floor(idx / C) : idx % C;
                const c = order === 'row' ? idx % C : Math.floor(idx / C);
                const addr = scene.base + idx * scene.elemSize;
                const val = scene.cells[idx];
                const isFocus = scene.focus !== null && scene.focus.i === r && scene.focus.j === c;
                return (
                  <div
                    key={idx}
                    title={`M[${r}][${c}] @0x${addr.toString(16)} · 线性 idx ${idx}`}
                    style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 10, background: isFocus ? '#4f46e5' : val !== null ? '#fff' : '#f8fafc', color: isFocus ? '#fff' : val !== null ? '#0f172a' : '#94a3b8', border: `1.5px solid ${isFocus ? '#4f46e5' : val !== null ? '#c7d2fe' : '#e2e8f0'}`, minWidth: 0, overflow: 'hidden' }}
                  >
                    <div style={{ fontSize: 9, opacity: 0.7 }}>M[{r}][{c}]</div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{val !== null ? String(val) : '∅'}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 8, marginTop: 2, color: isFocus ? '#e0e7ff' : '#64748b', wordBreak: 'break-all', lineHeight: 1.15 }}>0x{addr.toString(16)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    ) as unknown as never;
  },
};