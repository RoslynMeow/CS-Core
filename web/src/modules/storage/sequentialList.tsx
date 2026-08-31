import { useEffect, useState } from 'react';
import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { MathText } from '../../lib/tex';
import { buildMemoryUrl, encodeIntBE, encodeIntLE, hexFromBytes } from '../../lib/memoryDump';
import { Heap } from '../../lib/heap';
import { processBaseOnce } from '../../lib/sessionHeap';


type ElemType = 'i32' | 'i16' | 'u8';
type Op = 'idle' | 'get' | 'insert' | 'delete';
type Cfg = {
  elemType: ElemType;
  endian: 'little' | 'big';
  capacity: number;
  inited: boolean; // 固定容量：初始化后锁定，仅清空后重新初始化
  valuesStr: string; // 逗号分段，空段 = 空槽 ∅，用于持久化
  prevValuesStr?: string; // 上一次执行前的快照
  op: Op;
  pos: number;
  insVal: number;
  execTick: number;
};

type Scene = {
  base: number;
  heapBase: number;
  total: number;
  elemSize: number;
  elemType: ElemType;
  endian: 'little' | 'big';
  capacity: number;
  cells: (number | null)[]; // 定长 capacity，null = 空槽
  used: number; // 已占用（非空）个数
  origCells: (number | null)[];
  bytes: Uint8Array;
  hex: string;
  focus: number | null;
  phase: 'idle' | 'alloc' | 'shift' | 'write' | 'access' | 'delete';
  inited: boolean;
  op: Op;
  pos: number;
};

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
const HEAP_TOTAL = 256;
// 方案 B：进程内固定基址，仅容量/元素宽变化时 realloc（reset 后同基址重新分配），操作只写字节
let arrS: { heap: Heap; base: number; cap: number; elemSize: number } | null = null;


function elemSizeOf(t: ElemType): number { return t === 'i32' ? 4 : t === 'i16' ? 2 : 1; }

// 定长槽位解析：空段 -> null
function parseTable(s: string, capacity: number): { cells: (number | null)[]; used: number } {
  const parts = s.split(',');
  const cells = new Array<number | null>(capacity).fill(null);
  let used = 0;
  for (let i = 0; i < Math.min(parts.length, capacity); i++) {
    const t = parts[i].trim();
    if (t === '') continue;
    const n = Number(t);
    if (!Number.isFinite(n)) continue;
    cells[i] = Math.trunc(n);
    used++;
  }
  return { cells, used };
}
function serialize(cells: (number | null)[]): string {
  return cells.map(c => (c === null ? '' : String(c))).join(',');
}
// 标准顺序表插入：pos<=used 时后移；pos>used 时落于空槽（制造洞），used 增至 pos+1
function insertCells(cells: (number | null)[], used: number, pos: number, val: number, capacity: number) {
  const copy = [...cells];
  let nu = used;
  if (pos < used) {
    for (let i = used; i > pos; i--) copy[i] = copy[i - 1];
    copy[pos] = val;
    nu = used + 1;
  } else {
    copy[pos] = val;
    nu = Math.max(used, pos + 1);
  }
  return { cells: copy, used: nu };
}
// 标准顺序表删除：前移覆盖
function deleteCells(cells: (number | null)[], used: number, pos: number) {
  const copy = [...cells];
  for (let i = pos; i < used - 1; i++) copy[i] = copy[i + 1];
  copy[used - 1] = null;
  return { cells: copy, used: Math.max(0, used - 1) };
}
function encodeValue(v: number, size: number, endian: 'little' | 'big'): number[] {
  return endian === 'little' ? encodeIntLE(v, size) : encodeIntBE(v, size);
}
function buildHeapScene(cfg: Cfg, focus: number | null, phase: Scene['phase'], cellsOverride?: (number | null)[]): Scene {
  const elemSize = elemSizeOf(cfg.elemType);
  const capacity = Math.max(1, Math.min(16, cfg.capacity | 0));
  const cur = parseTable(cfg.valuesStr, capacity);
  const cells = cellsOverride ?? cur.cells;
  const used = cells.reduce<number>((n, c) => n + (c === null ? 0 : 1), 0);
  const total = capacity * elemSize;
  if (arrS === null || arrS.cap !== capacity || arrS.elemSize !== elemSize) {
    if (arrS === null) arrS = { heap: new Heap(HEAP_TOTAL, processBaseOnce()), base: 0, cap: 0, elemSize: 0 };
    arrS.heap.resetAll();
    const osSize = 16; // 固定 OS 预占，进程内 realloc 后地址仍稳定
    arrS.heap.allocate('__os__', osSize);
    arrS.base = arrS.heap.allocate('seq', total) ?? arrS.heap.base + osSize;
    arrS.cap = capacity; arrS.elemSize = elemSize;
  }
  const heap = arrS.heap;
  const base = arrS.base;
  const bytes = new Uint8Array(total);
  for (let i = 0; i < capacity; i++) {
    if (cells[i] === null) continue;
    const enc = encodeValue(cells[i]!, elemSize, cfg.endian);
    for (let b = 0; b < elemSize; b++) bytes[i * elemSize + b] = enc[b] & 0xff;
  }
  heap.writeBytes(base, Array.from(bytes));
  const hex = hexFromBytes(Array.from(bytes));
  return { base, heapBase: heap.base, total, elemSize, elemType: cfg.elemType, endian: cfg.endian, capacity, cells, used, origCells: cells, bytes, hex, focus, phase, inited: cfg.inited, op: cfg.op, pos: cfg.pos };
}
function buildDump(cfg: Cfg) {
  const s = buildHeapScene(cfg, null, 'idle');
  const fields = Array.from({ length: s.capacity }, (_, i) => ({ name: `[${i}]`, offset: i * s.elemSize, size: s.elemSize, type: cfg.elemType, color: COLORS[i % COLORS.length] }));
  return {
    base: `0x${s.base.toString(16)}`,
    total: Math.max(s.total, 32),
    endian: s.endian,
    allocations: [{ key: 'seq', addr: `0x${s.base.toString(16)}`, size: s.total, hex: s.hex, label: `顺序表 L[0..${s.capacity - 1}] · heap@0x${s.heapBase.toString(16)}`, color: '#4f46e5', fields }],
  } as const;
}
function fmtList(cells: (number | null)[]): string {
  const a: (number | string)[] = [];
  for (const c of cells) a.push(c === null ? '∅' : c);
  return a.join(',');
}
function gen(cfg: Cfg): Frame<Scene>[] {
  const elemSize = elemSizeOf(cfg.elemType);
  const capacity = Math.max(1, Math.min(16, cfg.capacity | 0));
  const hasPrev = typeof cfg.prevValuesStr === 'string' && cfg.execTick > 0 && (cfg.op === 'insert' || cfg.op === 'delete');
  const orig = hasPrev ? parseTable(cfg.prevValuesStr!, capacity) : parseTable(cfg.valuesStr, capacity);
  const cur = parseTable(cfg.valuesStr, capacity);
  if (cfg.execTick === 0 || cfg.op === 'idle') {
    const idle = buildHeapScene({ ...cfg, op: 'idle' }, null, 'idle');
    if (!cfg.inited) return [{ line: 0, caption: T(`未初始化：请先设置容量（${capacity}）并点「初始化」分配连续空间`, 'Not initialized — press Init'), scene: idle }];
    const hint = orig.used === 0 ? '空表' : `L=[${fmtList(orig.cells)}]`;
    return [
      { line: 0, caption: T(`待执行：${hint} · capacity=${capacity}, elemSize=${elemSize}B，位置可用 $0..${capacity - 1}$`, `Pending ${hint}`), scene: idle },
    ];
  }
  if (!cfg.inited) {
    const idle = buildHeapScene({ ...cfg, op: 'idle' }, null, 'idle');
    return [{ line: 0, caption: T('未初始化：请先点「初始化」再执行操作', 'Not initialized'), scene: idle }];
  }
  const pos = cfg.pos | 0;
  if (cfg.op === 'get') {
    const f = buildHeapScene(cfg, pos, 'access');
    const has = pos >= 0 && pos < capacity && f.cells[pos] !== null;
    const val = has ? String(f.cells[pos]!) : '∅';
    return [
      { line: 0, caption: T(`寻址：$addr(L[${pos}])=base+${pos}\\times${elemSize}=0x${(f.base + pos * elemSize).toString(16)}$`, `addr=0x${(f.base + pos * elemSize).toString(16)}`), scene: { ...f, focus: pos } },
      { line: 1, caption: has ? T(`该槽有值：$L[${pos}]=${val}$`, `has value`) : T(`该槽为空（未初始化读数未定义）`, `empty slot`), scene: { ...f, focus: pos } },
      { line: 2, caption: has ? T(`取值：$L[${pos}]=${val}$ $O(1)$`, `Get ${val}`) : T(`空槽取值无意义`, `empty`), scene: { ...f, focus: pos } },
    ];
  }
  if (cfg.op === 'insert') {
    const can = pos >= 0 && pos < capacity && orig.used < capacity;
    const after = hasPrev ? cur : can ? insertCells(orig.cells, orig.used, pos, Math.trunc(cfg.insVal), capacity) : orig;
    const s0 = buildHeapScene(cfg, null, 'alloc', orig.cells);
    if (!can) return [
      { line: 0, caption: T(`判界：$pos=${pos}$, capacity=${capacity}$ → ${orig.used >= capacity ? '满表' : '位置越界'}`, `fail`), scene: s0 },
      { line: 0, caption: T(orig.used >= capacity ? '顺序表已满，无法插入' : `位置需在 $0..${capacity - 1}$`, 'fail'), scene: s0 },
    ];
    const shifting = pos <= orig.used;
    const s1 = buildHeapScene(cfg, null, 'shift', orig.cells);
    const s2 = buildHeapScene(cfg, pos, 'write', after.cells);
    return [
      { line: 0, caption: T(`判界：$pos=${pos}<capacity=${capacity}$ 且未满，可插入`, `can insert`), scene: s0 },
      { line: 1, caption: shifting ? T(`搬移：$[${pos}..${orig.used - 1}]$ 后移 ${elemSize}B 腾位 $O(n)$`, `shift`) : T(`空槽直接写入（$pos>length$），无需搬移`, `write into empty slot`), scene: { ...s1, phase: 'shift' } },
      { line: 2, caption: T(`写入：$L[${pos}]\\gets ${Math.trunc(cfg.insVal)}$ @0x${(s2.base + pos * elemSize).toString(16)}$`, `write L[${pos}]=${Math.trunc(cfg.insVal)}`), scene: { ...s2, focus: pos, phase: 'write' } },
      { line: 3, caption: T(`完成：$L=[${fmtList(after.cells)}]$，位置可用 $0..${capacity - 1}$`, `done [${fmtList(after.cells)}]`), scene: { ...s2, focus: pos } },
    ];
  }
  if (cfg.op === 'delete') {
    const can = pos >= 0 && pos < capacity && orig.cells[pos] !== null;
    const after = hasPrev ? cur : can ? deleteCells(orig.cells, orig.used, pos) : orig;
    const s0 = buildHeapScene(cfg, null, 'alloc', orig.cells);
    if (!can) return [
      { line: 0, caption: T(`判界：$pos=${pos}$ → ${pos < 0 || pos >= capacity ? '位置越界' : '该槽为空'}`, `fail`), scene: s0 },
      { line: 0, caption: T('无可删除（越界或该槽为空）', 'fail'), scene: s0 },
    ];
    const s1 = buildHeapScene(cfg, null, 'delete', orig.cells);
    const s2 = buildHeapScene(cfg, null, 'delete', after.cells);
    return [
      { line: 0, caption: T(`判界：$L[${pos}]=${orig.cells[pos]}$ 存在，可删除`, `can delete`), scene: s0 },
      { line: 1, caption: T(`前移：$[${pos + 1}..]$ 前移 ${elemSize}B 覆盖 $L[${pos}]$ $O(n)$`, `shift forward`), scene: { ...s1, phase: 'delete' } },
      { line: 2, caption: T(`完成：$L=[${fmtList(after.cells)}]$`, `done [${fmtList(after.cells)}]`), scene: { ...s2 } },
    ];
  }
  return gen({ ...cfg, op: 'idle', execTick: 0 });
}
const CODE: Record<Op, any> = {
  idle: [T('$heapBase \\gets ASLR$', '$heapBase$'), T('$base \\gets malloc(total)$ // 真实地址', '$base\\gets malloc$'), T('等待执行…', 'pending')] as never,
  get: [T('$addr \\gets base + i\\times elemSize$', '$addr$'), T('if $L[i]$ 未初始化 空槽', 'if empty'), T('return $mem[addr]$ // $O(1)$', 'return')] as never,
  insert: [T('if $i<0 \\lor i\\ge capacity$ 越界', 'if oob'), T('if $length\\ge capacity$ 失败 // 满', 'if full fail'), T('for $k=length;k>i;k--$ $L[k]\\gets L[k-1]$', 'shift'), T('$L[i]\\gets x;\\; length++$', '$L[i]\\gets x$')] as never,
  delete: [T('if $i<0 \\lor i\\ge capacity \\lor L[i]=\\varnothing$ 失败', 'oob/empty fail'), T('for $k=i;k<length-1;k++$ $L[k]\\gets L[k+1]$', 'shift'), T('$length--$', '$length--$')] as never,
};

export const sequentialListModule: ModuleDef<Scene, Cfg> = {
  id: 'sequential-list',
  title: T('顺序表', 'Sequential List'),
  desc: T('预分配 $capacity$ 槽，$L[i]$ 映到 $malloc$ 返回的真实连续地址 $base+i\\cdot elemSize$；位置可用 $0..capacity-1$。', 'Fixed capacity via real malloc.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: { elemType: 'i32', endian: 'little', capacity: 8, inited: false, valuesStr: '', op: 'idle', pos: 0, insVal: 99, execTick: 0 },
  randomize(c) { return { ...c, valuesStr: '', op: 'idle', execTick: 0 } as Cfg; },
  Controls({ config, onChange, t, onPlay }: any) {
    const isZh = t(T('中文', 'en')) !== 'en';
    const [draft, setDraft] = useState<Cfg>(config);
    // 外部 config 变化（随机/示例/清空/语言切换）时同步本地 draft
    useEffect(() => { if (draft.execTick !== config.execTick || draft.valuesStr !== config.valuesStr) setDraft(config); }, [config]);
    const set = (p: Partial<Cfg>) => setDraft(s => ({ ...s, ...p }));
    const loadExample = () => { const ns: Cfg = { ...draft, valuesStr: '10,20,30,40', prevValuesStr: undefined, op: 'idle', execTick: 0 }; setDraft(ns); onChange(ns); };
    const clearAll = () => { const ns: Cfg = { ...draft, inited: false, valuesStr: '', prevValuesStr: undefined, op: 'idle', execTick: 0 }; setDraft(ns); onChange(ns); };
    const init = () => { const ns: Cfg = { ...draft, inited: true, valuesStr: '', prevValuesStr: undefined, op: 'idle', execTick: 0 }; setDraft(ns); onChange(ns); };
    const exec = () => {
      const validOps: Op[] = ['get', 'insert', 'delete'];
      const op = validOps.includes(draft.op as any) ? draft.op : 'get';
      const cap = Math.max(1, Math.min(16, draft.capacity | 0));
      const cur = parseTable(draft.valuesStr, cap);
      let nextValuesStr = draft.valuesStr;
      let prev: string | undefined;
      if (op === 'insert') {
        const p = draft.pos | 0;
        // 位置可用 0..capacity-1，未满即可插入；越界/满则拒绝并交 gen 报错
        if (p >= 0 && p < cap && cur.used < cap) {
          nextValuesStr = serialize(insertCells(cur.cells, cur.used, p, Math.trunc(draft.insVal), cap).cells);
          prev = draft.valuesStr;
        }
      } else if (op === 'delete') {
        const p = draft.pos | 0;
        if (p >= 0 && p < cap && cur.cells[p] !== null) {
          nextValuesStr = serialize(deleteCells(cur.cells, cur.used, p).cells);
          prev = draft.valuesStr;
        }
      }
      const next: Cfg = { ...draft, valuesStr: nextValuesStr, prevValuesStr: prev, op, execTick: config.execTick + 1 };
      onChange(next);
      setDraft(next);
      setTimeout(() => onPlay?.(), 60);
    };
    const dump = buildDump({ ...draft, execTick: config.execTick } as Cfg);
    const onView = () => { location.href = buildMemoryUrl(dump as any); };
    const needVal = draft.op === 'insert';
    const needPos = draft.op !== 'idle';
    const cap = Math.max(1, Math.min(16, draft.capacity | 0));
    const cur = parseTable(draft.valuesStr, cap);
    const pos = draft.pos | 0;
    const invalid =
      draft.op === 'insert'
        ? !(pos >= 0 && pos < cap && cur.used < cap)
        : draft.op === 'delete'
        ? !(pos >= 0 && pos < cap && cur.cells[pos] !== null)
        : false;
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca' }}>{isZh ? '模式' : 'MODE'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('元素', 'Elem'))}</span>
            <select className="txt" value={draft.elemType} disabled={draft.inited} onChange={e => set({ elemType: e.target.value as ElemType })}><option value="i32">i32 (4B)</option><option value="i16">i16 (2B)</option><option value="u8">u8 (1B)</option></select></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>Endian</span>
            <select className="txt" value={draft.endian} disabled={draft.inited} onChange={e => set({ endian: e.target.value as any })}><option value="little">little</option><option value="big">big</option></select></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('容量', 'Capacity'))}</span>
            <input className="txt" type="number" min={1} max={16} value={draft.capacity} disabled={draft.inited} onChange={e => set({ capacity: Math.max(1, Math.min(16, Number(e.target.value) || 8)) })} style={{ width: 64 }} /></label>
          {!draft.inited && <button className="pill active" onClick={init}>{t(T('初始化', 'Init'))}</button>}
          <button className="ghost" onClick={clearAll}>{t(T('清空', 'Clear'))}</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap', opacity: draft.inited ? 1 : 0.5, pointerEvents: draft.inited ? 'auto' : 'none' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{isZh ? '参数' : 'PARAMS'}</span>
          <button className="ghost" onClick={() => onChange(sequentialListModule.randomize!(draft))}>↻ {t(T('重新生成', 'Regenerate'))}</button>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('操作', 'Op'))}</span>
            <select className="txt" value={draft.op} onChange={e => set({ op: e.target.value as Op })}>
              <option value="idle">{t(T('— 选择操作 —', '— pick —'))}</option>
              <option value="get">{t(T('查看', 'Get'))}</option>
              <option value="insert">{t(T('插入', 'Insert'))}</option>
              <option value="delete">{t(T('删除', 'Delete'))}</option>
            </select></label>
          {needPos && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('位置', 'Pos'))}</span><input className="txt" type="number" min={0} max={Math.max(0, cap - 1)} value={draft.pos} onChange={e => set({ pos: Number(e.target.value) || 0 })} style={{ width: 56 }} /></label>}
          {needVal && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('值', 'Val'))}</span><input className="txt" type="number" value={draft.insVal} onChange={e => set({ insVal: Number(e.target.value) || 0 })} style={{ width: 64 }} /></label>}
          <button className="pill active" onClick={exec} disabled={draft.op === 'idle' || !draft.inited} style={invalid ? { opacity: 0.6 } : undefined}>执行</button>
          <button className="ghost" onClick={loadExample} disabled={!draft.inited}>示例</button>
          <button className="pill" onClick={onView} disabled={!draft.inited}>查看内存 ↗</button>
          {!draft.inited && <span style={{ fontSize: 11, fontFamily: 'monospace', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 999, padding: '3px 8px' }}>{isZh ? '未初始化' : 'not inited'}</span>}
          {draft.op !== 'idle' && (
            <span style={{ fontSize: 11, fontFamily: 'monospace', background: invalid ? '#fef2f2' : '#f1f5f9', color: invalid ? '#dc2626' : '#64748b', border: `1px solid ${invalid ? '#fecaca' : '#e2e8f0'}`, borderRadius: 999, padding: '3px 8px' }}>
              {isZh ? `用 ${cur.used}/${cap}` : `${cur.used}/${cap}`}{invalid && ` · ${pos}${isZh ? ' 不可' : ' invalid'}`}
            </span>
          )}
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) { return CODE[cfg.op] as never; },
  generate: gen,
  Render({ scene }) {
    if (!scene.inited) {
      return (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#b91c1c', textAlign: 'center' }}>
            未初始化 — 请先设置容量并点「初始化」分配连续空间；只有清空后才能重新初始化大小。
          </div>
        </div>
      ) as unknown as never;
    }
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ border: '1px solid #c7d2fe', borderRadius: 12, overflow: 'hidden', background: '#eef2ff' }}>
          <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 800, color: '#4338ca', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>逻辑视图 · 顺序表</span><span style={{ fontWeight: 400, color: '#64748b' }}>{scene.used === 0 ? `空表 · 容量 ${scene.capacity}` : `已用 ${scene.used} / 容量 ${scene.capacity}`} · ∅=空槽</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 10, background: '#fff', border: '1px solid #c7d2fe', padding: '2px 6px', borderRadius: 999 }}>base 0x{scene.base.toString(16)} · {scene.total}B</span>
          </div>
          <div style={{ display: 'flex', gap: 6, padding: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {Array.from({ length: scene.capacity }, (_, i) => {
              const has = scene.cells[i] !== null;
              const val = scene.cells[i];
              const addr = scene.base + i * scene.elemSize;
              const isFocus = scene.focus === i;
              return <div key={i} style={{ minWidth: 72, textAlign: 'center', padding: '6px 6px', borderRadius: 10, background: isFocus ? '#4f46e5' : has ? '#fff' : '#f8fafc', color: isFocus ? '#fff' : has ? '#0f172a' : '#94a3b8', border: `1.5px solid ${isFocus ? '#4f46e5' : has ? '#c7d2fe' : '#e2e8f0'}` }}><div style={{ fontSize: 10, opacity: 0.7 }}>L[{i}]</div><div style={{ fontWeight: 800, fontSize: 14 }}>{has ? String(val) : '∅'}</div><div style={{ fontFamily: 'monospace', fontSize: 10, marginTop: 2, color: isFocus ? '#e0e7ff' : '#64748b' }}>0x{addr.toString(16)}</div><div style={{ fontSize: 9, color: isFocus ? '#c7d2fe' : '#94a3b8' }}>{scene.elemType}·{scene.elemSize}B</div></div>;
            })}
          </div>
        </div>
      </div>
    ) as unknown as never;
  },
};
