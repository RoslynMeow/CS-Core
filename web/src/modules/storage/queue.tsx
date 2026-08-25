import { useEffect, useState } from 'react';
import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { buildMemoryUrl, encodeIntBE, encodeIntLE, hexFromBytes } from '../../lib/memoryDump';
import { Heap } from '../../lib/heap';
import { ChainSession, ChainWriter, processBaseOnce } from '../../lib/sessionHeap';


type ElemType = 'i32' | 'i16' | 'u8';
type Impl = 'array' | 'linked';
type Op = 'idle' | 'enqueue' | 'dequeue' | 'peek';
type Cfg = { impl: Impl; elemType: ElemType; endian: 'little' | 'big'; capacity: number; inited: boolean; front: number; dataStr: string; prevDataStr?: string; op: Op; val: number; execTick: number; };

type NodeInfo = { idx: number; addr: number; data: number; next: number | null; size: number; hex: string; bytes: number[] };
type Scene = { impl: Impl; base: number; heapBase: number; total: number; elemSize: number; elemType: ElemType; endian: 'little' | 'big'; capacity: number; vals: number[]; len: number; front: number; rear: number; cells: (number | null)[]; nodes: NodeInfo[]; frontAddr: number | null; rearAddr: number | null; head: number | null; tail: number | null; bytes: Uint8Array; hex: string; phase: 'idle' | 'enqueue' | 'dequeue' | 'peek'; inited: boolean; op: Op; val: number };

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
const HEAP_TOTAL = 384;
// 方案 B：进程内固定基址 + 真实增量分配/释放（空洞可被 first-fit 复用）
let arrS: { heap: Heap; base: number; cap: number } | null = null;
let chainS: ChainSession | null = null;
const mkWriter = (elemSize: number, endian: 'little' | 'big'): ChainWriter => (h, addr, data, nextAddr) => {
  const d = endian === 'little' ? encodeIntLE(data, elemSize) : encodeIntBE(data, elemSize);
  const nx = (() => { const n = nextAddr ?? 0; const le = encodeIntLE(n, 4); return endian === 'little' ? le : le.reverse(); })();
  const bytes = [...d, ...nx];
  h.writeBytes(addr, bytes);
  return bytes;
};


function elemSizeOf(t: ElemType): number { return t === 'i32' ? 4 : t === 'i16' ? 2 : 1; }
function parseVals(s: string, max: number): number[] { return s.split(/[,，\s]+/).map(x => x.trim()).filter(Boolean).map(v => Number(v)).filter(Number.isFinite).map(v => Math.trunc(v)).slice(0, max); }

function buildScene(cfg: Cfg, phase: Scene['phase'], valsOverride?: number[]): Scene {
  const elemSize = elemSizeOf(cfg.elemType);
  const cap = Math.max(1, Math.min(16, cfg.capacity | 0));
  const vals = valsOverride ?? parseVals(cfg.dataStr, cap);
  const len = vals.length;
  if (cfg.impl === 'array' && !cfg.inited) {
    return { impl: 'array', base: 0, heapBase: 0, total: 0, elemSize, elemType: cfg.elemType, endian: cfg.endian, capacity: cap, vals: [], len: 0, front: 0, rear: 0, cells: new Array<number | null>(cap).fill(null), nodes: [], frontAddr: null, rearAddr: null, head: null, tail: null, bytes: new Uint8Array(0), hex: '', phase, inited: false, op: cfg.op, val: cfg.val };
  }
  if (cfg.impl === 'array') {
    if (!arrS || arrS.cap !== cap) {
      if (!arrS) arrS = { heap: new Heap(HEAP_TOTAL, processBaseOnce()), base: 0, cap: 0 };
      arrS.heap.resetAll();
      const osSize = 16; // 固定 OS 预占，进程内 realloc 后地址仍稳定
      arrS.heap.allocate('__os__', osSize);
      arrS.base = arrS.heap.allocate('queue', cap * elemSize) ?? arrS.heap.base + osSize;
      arrS.cap = cap;
    }
    const total = cap * elemSize;
    // 循环队列：物理槽 = (front + k) % cap 存 vals[k]（牺牲一槽判满，量化 (r+1)%m=f）
    const front = ((cfg.front | 0) % cap + cap) % cap;
    const rear = (front + len) % cap;
    const cells = new Array<number | null>(cap).fill(null);
    for (let k = 0; k < len; k++) cells[(front + k) % cap] = vals[k];
    const bytes = new Uint8Array(total);
    for (let i = 0; i < cap; i++) {
      if (cells[i] === null) continue;
      const enc = cfg.endian === 'little' ? encodeIntLE(cells[i]!, elemSize) : encodeIntBE(cells[i]!, elemSize);
      for (let b = 0; b < elemSize; b++) bytes[i * elemSize + b] = enc[b] & 0xff;
    }
    arrS.heap.writeBytes(arrS.base, Array.from(bytes));
    return { impl: 'array', base: arrS.base, heapBase: arrS.heap.base, total, elemSize, elemType: cfg.elemType, endian: cfg.endian, capacity: cap, vals, len, front, rear, cells, nodes: [], frontAddr: len > 0 ? arrS.base + front * elemSize : null, rearAddr: arrS.base + rear * elemSize, head: null, tail: null, bytes, hex: hexFromBytes(Array.from(bytes)), phase, inited: true, op: cfg.op, val: cfg.val };
  }
  // 链式队列：ChainSession 增量
  const nodeSize = elemSize + 4;
  const layoutKey = `${nodeSize}|${cfg.endian}`;
  if (!chainS || chainS.nodeSize !== nodeSize || chainS.layoutKey !== layoutKey) chainS = new ChainSession(nodeSize, mkWriter(elemSize, cfg.endian), layoutKey);
  const tag = cfg.dataStr;
  const prev = cfg.prevDataStr ?? null;
  const prevVals = prev !== null && prev !== tag && cfg.execTick > 0 && (cfg.op === 'enqueue' || cfg.op === 'dequeue') ? parseVals(prev, cap) : null;
  const key = `${prev}>${tag}`;
  if (prevVals !== null) {
    if (!chainS.delta(prevVals, vals, key)) chainS.boot(vals);
  } else if (chainS.nodes.length !== len || chainS.nodes.some((n, i) => n.data !== vals[i])) {
    chainS.boot(vals);
  }
  const nodes = chainS.nodes;
  const head = len > 0 ? nodes[0].addr : null;   // 队首
  const tail = len > 0 ? nodes[len - 1].addr : null; // 队尾
  return { impl: 'linked', base: head ?? chainS.getHeapBase(), heapBase: chainS.getHeapBase(), total: len * nodeSize, elemSize, elemType: cfg.elemType, endian: cfg.endian, capacity: cap, vals, len, front: 0, rear: len, cells: [], nodes, frontAddr: head, rearAddr: tail, head, tail, bytes: new Uint8Array(0), hex: '', phase, inited: true, op: cfg.op, val: cfg.val };
}
function buildDump(cfg: Cfg) {
  const s = buildScene(cfg, 'idle');
  const elemSize = s.elemSize;
  if (cfg.impl === 'array') {
    const fields = Array.from({ length: s.capacity }, (_, i) => {
      const k = ((i - s.front) % s.capacity + s.capacity) % s.capacity; // 逻辑序号
      return { name: `slot[${i}]${i === s.front ? ' ←f' : i === s.rear ? ' ←r' : ''}`, offset: i * elemSize, size: elemSize, type: cfg.elemType, color: k < s.len ? COLORS[k % COLORS.length] : '#cbd5e1' };
    });
    return { base: `0x${s.base.toString(16)}`, total: Math.max(s.total, 32), endian: s.endian, allocations: [{ key: 'queue', addr: `0x${s.base.toString(16)}`, size: s.total, hex: s.hex, label: `循环队列 · f=${s.front} r=${s.rear}（${(s.rear + 1) % s.capacity === s.front ? '满' : s.rear === s.front ? '空' : `用 ${s.len}/${s.capacity - 1}`}） · heap@0x${s.heapBase.toString(16)}`, color: '#4f46e5', fields }] } as const;
  }
  const allocs = s.nodes.map(n => ({
    key: `node${n.idx}`, addr: `0x${n.addr.toString(16)}`, size: n.size, hex: n.hex, label: n.idx === 0 ? `队首[${n.idx}]` : n.idx === s.len - 1 ? `队尾[${n.idx}]` : `节点[${n.idx}]`,
    color: COLORS[n.idx % COLORS.length],
    fields: [
      { name: 'data', offset: 0, size: elemSize, type: cfg.elemType, color: COLORS[n.idx % COLORS.length] },
      { name: 'next', offset: elemSize, size: 4, type: `ptr32`, color: '#64748b' },
    ],
  }));
  return { base: `0x${s.heapBase.toString(16)}`, total: HEAP_TOTAL, endian: s.endian, allocations: allocs } as const;
}
function gen(cfg: Cfg): Frame<Scene>[] {
  const cap = Math.max(1, Math.min(16, cfg.capacity | 0));
  const hasPrev = typeof cfg.prevDataStr === 'string' && cfg.execTick > 0 && (cfg.op === 'enqueue' || cfg.op === 'dequeue');
  const orig = hasPrev ? parseVals(cfg.prevDataStr!, cap) : parseVals(cfg.dataStr, cap);
  const cur = parseVals(cfg.dataStr, cap);
  if (cfg.execTick === 0 || cfg.op === 'idle') {
    const idle = buildScene({ ...cfg, op: 'idle' }, 'idle', orig);
    if (cfg.impl === 'array' && !cfg.inited) return [{ line: 0, caption: T(`未初始化：设置容量 ${cap} 并点「初始化」`, 'Not initialized'), scene: idle }];
    return [{ line: 0, caption: T(orig.length === 0 ? `空队列 · ${cfg.impl === 'array' ? '循环数组 cap=' + cap : '链式队列'}，点“示例”或 Enqueue` : `队首→队尾 $[${orig.join(',')}]$ · front=${idle.frontAddr ? `0x${idle.frontAddr.toString(16)}` : 'null'} rear=${idle.rearAddr ? `0x${idle.rearAddr.toString(16)}` : 'null'}`, 'ready'), scene: idle }];
  }
  if (cfg.impl === 'array' && !cfg.inited) {
    const idle = buildScene({ ...cfg, op: 'idle' }, 'idle', orig);
    return [{ line: 0, caption: T('未初始化：请先点「初始化」', 'Not initialized'), scene: idle }];
  }
  const v = cfg.val | 0;
  if (cfg.op === 'enqueue') {
    const ok = orig.length < cap - 1; // 牺牲一槽：留一个空位让 (r+1)%m != f
    const after = hasPrev ? cur : ok ? [...orig, v] : orig;
    if (!ok) { const s0 = buildScene(cfg, 'idle', orig); return [{ line: 0, caption: T(`队列满：$((r+1)\bmod ${cap}) = f$，只剩一空槽，拒绝 Enqueue`, 'queue full (one spare slot)'), scene: s0 }]; }
    const afterScene = buildScene({ ...cfg, dataStr: after.join(',') }, 'enqueue', after);
    return [
      { line: 0, caption: T(`Enqueue $x=${v}$：写入 $Q[r]\gets x$（$r=${afterScene.rear}$ 指向空位）`, `enqueue ${v}`), scene: buildScene(cfg, 'enqueue', orig) },
      { line: 1, caption: T(`游标：$r\gets (r+1)\bmod ${cap} = ${afterScene.rear}$；写入 0x${(afterScene.rearAddr ?? 0).toString(16)}`, `r→${afterScene.rear}`), scene: afterScene },
      { line: 2, caption: T(`完成：$[${after.join(',')}]$，$f=${afterScene.front}$ 不变，$r=${afterScene.rear}$`, `done`), scene: { ...afterScene, phase: 'enqueue', val: v } },
    ];
  }
  if (cfg.op === 'dequeue') {
    const ok = orig.length > 0;
    const after = hasPrev ? cur : ok ? orig.slice(1) : orig;
    if (!ok) { const s0 = buildScene(cfg, 'idle', orig); return [{ line: 0, caption: T('空队列：$r=f$，Dequeue 失败', 'empty dequeue (r=f)'), scene: s0 }]; }
    const nextFront = (cfg.front + 1) % cap;
    const afterScene = buildScene({ ...cfg, front: nextFront, dataStr: after.join(',') }, 'dequeue', after);
    return [
      { line: 0, caption: T(`Dequeue：队首 $x=${orig[0]}$ 出列（$Q[f]\gets x$）`, `dequeue ${orig[0]}`), scene: buildScene(cfg, 'dequeue', orig) },
      { line: 1, caption: T(`游标：$f\gets (f+1)\bmod ${cap} = ${afterScene.front}$ → 0x${(afterScene.frontAddr ?? 0).toString(16) || 'null'}`, `f→${afterScene.front}`), scene: afterScene },
      { line: 2, caption: T(`完成：$[${after.join(',')||'∅'}]$`, `done`), scene: { ...afterScene, phase: 'dequeue', val: v } },
    ];
  }
  const s0 = buildScene(cfg, 'peek', orig);
  return [
    { line: 0, caption: T(`Peek：查看队首`, `peek`), scene: s0 },
    { line: 1, caption: orig.length > 0 ? T(`队首值 $x=${orig[0]}$ @0x${(s0.frontAddr ?? 0).toString(16)}`, `front=${orig[0]}`) : T('空队列', 'empty'), scene: s0 },
    { line: 2, caption: T('完成（不删除）', 'done (keep)'), scene: s0 },
  ];
}

const CODE: Record<Op, any> = {
  idle: [T('$f\\gets 0,\\; r\\gets 0$ // 游标', '$f=0,\\;r=0$'), T('$r=f$（空）', 'empty: r=f'), T('等待执行…', 'pending')] as never,
  enqueue: [T('if $(r+1)\\bmod cap = f$ 队满（牺牲一槽）', 'if full: (r+1)%cap=f'), T('$Q[r]\\gets x$; 写入', 'Q[r] = x'), T('$r\\gets (r+1)\\bmod cap$', 'r = (r+1)%cap')] as never,
  dequeue: [T('if $r=f$ 空队', 'if empty: r=f'), T('$x\\gets Q[f]$; 释放', 'x = Q[f]'), T('$f\\gets (f+1)\\bmod cap$', 'f = (f+1)%cap')] as never,
  peek: [T('if $r=f$ 空队', 'if empty'), T('return $Q[f]$', 'return Q[f]'), T('// 不删除', '// keep')] as never,
};

export const queueModule: ModuleDef<Scene, Cfg> = {
  id: 'queue', title: T('队列 · 先进先出', 'Queue (FIFO)'),
  desc: T('Enqueue 入队尾 rear，Dequeue 出队首 front；循环数组用 front/rear 游标，链式队列用 head/tail。$O(1)$。', 'FIFO; circular array or linked head/tail.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: { impl: 'array' as Impl, elemType: 'i32', endian: 'little', capacity: 6, inited: false, front: 0, dataStr: '', op: 'idle', val: 5, execTick: 0 },
  randomize(c) { return { ...c, front: 0, dataStr: '', op: 'idle', execTick: 0 } as Cfg; },
  Controls({ config, onChange, t, onPlay }: any) {
    const isZh = t(T('中文', 'en')) !== 'en';
    const [draft, setDraft] = useState<Cfg>(config);
    const set = (p: Partial<Cfg>) => setDraft(s => ({ ...s, ...p }));
    // 外部 config 变化（随机/示例/清空/语言切换）时同步本地 draft
    useEffect(() => { if (draft.dataStr !== config.dataStr || draft.execTick !== config.execTick) setDraft(config); }, [config]);
    const loadExample = () => { const ns: Cfg = { ...draft, front: 0, dataStr: '1,2,3', prevDataStr: undefined, op: 'idle', execTick: 0 }; setDraft(ns); onChange(ns); };
    const clearAll = () => { const ns: Cfg = { ...draft, inited: false, front: 0, dataStr: '', prevDataStr: undefined, op: 'idle', execTick: 0 }; setDraft(ns); onChange(ns); };
    const init = () => { const ns: Cfg = { ...draft, inited: true, front: 0, op: 'idle', execTick: 0 }; setDraft(ns); onChange(ns); };
    const needInit = draft.impl === 'array' && !draft.inited;
    const exec = () => {
      const op = (['enqueue', 'dequeue', 'peek'] as Op[]).includes(draft.op) ? draft.op : 'enqueue';
      const cap = Math.max(1, Math.min(16, draft.capacity | 0));
      const cur = parseVals(draft.dataStr, cap);
      let nextStr = draft.dataStr; let prev: string | undefined;
      let front = draft.front | 0;
      if (op === 'enqueue' && cur.length < cap - 1) { nextStr = [...cur, Math.trunc(draft.val)].join(','); prev = draft.dataStr; }
      else if (op === 'dequeue' && cur.length > 0) { nextStr = cur.slice(1).join(','); prev = draft.dataStr; front = (front + 1) % cap; }
      const next: Cfg = { ...draft, front, dataStr: nextStr, prevDataStr: prev, op, execTick: config.execTick + 1 };
      onChange(next); setDraft(next); setTimeout(() => onPlay?.(), 60);
    };
    const dump = buildDump({ ...draft, execTick: config.execTick } as Cfg);
    const onView = () => { location.href = buildMemoryUrl(dump as any); };
    const needVal = draft.op === 'enqueue';
    const cap = Math.max(1, Math.min(16, draft.capacity | 0));
    const cur = parseVals(draft.dataStr, cap);
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca' }}>{isZh ? '模式' : 'MODE'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('实现', 'Impl'))}</span><select className="txt" value={draft.impl} onChange={e => set({ impl: e.target.value as Impl })}>
            <option value="array">{t(T('循环队列', 'Array'))}</option><option value="linked">{t(T('链式队列', 'Linked'))}</option>
          </select></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('元素', 'Elem'))}</span><select className="txt" value={draft.elemType} disabled={needInit === false && draft.impl === 'array' && draft.inited} onChange={e => set({ elemType: e.target.value as ElemType })}><option value="i32">i32</option><option value="i16">i16</option><option value="u8">u8</option></select></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>Endian</span><select className="txt" value={draft.endian} disabled={draft.impl === 'array' && draft.inited} onChange={e => set({ endian: e.target.value as any })}><option value="little">little</option><option value="big">big</option></select></label>
          {draft.impl === 'array' && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('容量', 'Cap'))}</span><input className="txt" type="number" min={2} max={16} value={draft.capacity} disabled={draft.inited} onChange={e => set({ capacity: Math.max(2, Math.min(16, Number(e.target.value) || 6)) })} style={{ width: 52 }} /></label>}
          {needInit && <button className="pill active" onClick={init}>{t(T('初始化', 'Init'))}</button>}
          <button className="ghost" onClick={clearAll}>{t(T('清空', 'Clear'))}</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap', opacity: needInit ? 0.5 : 1, pointerEvents: needInit ? 'none' : 'auto' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{isZh ? '参数' : 'PARAMS'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('操作', 'Op'))}</span><select className="txt" value={draft.op} onChange={e => set({ op: e.target.value as Op })}>
            <option value="idle">{t(T('— 选择操作 —', '— pick —'))}</option><option value="enqueue">{t(T('入队 Enqueue', 'Enqueue'))}</option><option value="dequeue">{t(T('出队 Dequeue', 'Dequeue'))}</option><option value="peek">{t(T('读队首 Peek', 'Peek'))}</option>
          </select></label>
          {needVal && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('值', 'Val'))}</span><input className="txt" type="number" value={draft.val} onChange={e => set({ val: Number(e.target.value) || 0 })} style={{ width: 64 }} /></label>}
                    <button className="pill active" onClick={exec} disabled={draft.op === 'idle' || needInit}>执行</button>
          <button className="ghost" onClick={() => onChange(queueModule.randomize!(draft))}>↻ {t(T('重新生成', 'Regenerate'))}</button>
          <button className="ghost" onClick={loadExample} disabled={needInit}>示例</button>
          <button className="pill" onClick={onView} disabled={needInit}>查看内存 ↗</button>
          {needInit && <span style={{ fontSize: 11, fontFamily: 'monospace', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 999, padding: '3px 8px' }}>{isZh ? '未初始化' : 'not inited'}</span>}
          <span style={{ fontSize: 11, fontFamily: 'monospace', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 999, padding: '3px 8px' }}>
            {isZh ? `${cur.length}/${cap}` : `${cur.length}/${cap}`}{draft.op === 'dequeue' && cur.length === 0 ? ' · 空队' : ''}
          </span>
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) { return CODE[cfg.op] as never; },
  generate: gen,
  Render({ scene }) {
    const arrayMode = scene.impl === 'array';
    if (arrayMode && !scene.inited) {
      return <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#b91c1c', textAlign: 'center' }}>未初始化 — 设置容量后点「初始化」；只有清空后才能重新初始化大小。</div> as unknown as never;
    }
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ border: '1px solid #c7d2fe', borderRadius: 12, overflow: 'hidden', background: '#eef2ff' }}>
          <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 800, color: '#4338ca', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>逻辑视图 · {arrayMode ? '循环队列' : '链式队列'}（FIFO）</span>
            <span style={{ fontWeight: 400, color: '#64748b' }}>{arrayMode ? `front=${scene.front} rear=${scene.rear}` : 'head=队首 tail=队尾'} · front {scene.frontAddr ? `0x${scene.frontAddr.toString(16)}` : 'null'} · rear {scene.rearAddr ? `0x${scene.rearAddr.toString(16)}` : 'null'}</span>
          </div>
          <div style={{ padding: 12 }}>
            {arrayMode ? (
              <div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {Array.from({ length: scene.capacity }, (_, i) => {
                    const k = ((i - scene.front) % scene.capacity + scene.capacity) % scene.capacity; // 逻辑序号
                    const has = scene.cells[i] !== null;
                    const isFront = i === scene.front;
                    const isRear = i === scene.rear;
                    const addr = scene.base + i * scene.elemSize;
                    return (
                      <div key={i} style={{ minWidth: 72, textAlign: 'center', padding: '6px 6px', borderRadius: 10, background: isFront || isRear ? '#4f46e5' : has ? '#fff' : '#f8fafc', color: isFront || isRear ? '#fff' : has ? '#0f172a' : '#94a3b8', border: `1.5px solid ${isFront || isRear ? '#4f46e5' : has ? '#c7d2fe' : '#e2e8f0'}` }}>
                        <div style={{ fontSize: 9, opacity: 0.7 }}>{isFront ? 'f⬅' : isRear ? 'r➡' : i}</div>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{has ? String(scene.cells[i]) : '∅'}</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 9, marginTop: 2, color: isFront || isRear ? '#e0e7ff' : '#64748b' }}>0x{addr.toString(16)}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8', marginTop: 6 }}>游标 f/r 按模 cap 循环移动；队满 (r+1) mod cap = f 时留一空槽；队空 r=f</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ padding: '6px 10px', borderRadius: 8, background: '#0f172a', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 11, textAlign: 'center' }}><div style={{ fontWeight: 800 }}>head = front</div><div style={{ color: '#94a3b8', fontSize: 10 }}>{scene.head ? `0x${scene.head.toString(16)}` : 'null'}</div></div>
                  <div style={{ padding: '6px 10px', borderRadius: 8, background: '#0f172a', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 11, textAlign: 'center' }}><div style={{ fontWeight: 800 }}>tail = rear</div><div style={{ color: '#94a3b8', fontSize: 10 }}>{scene.tail ? `0x${scene.tail.toString(16)}` : 'null'}</div></div>
                </div>
                {scene.nodes.length === 0 ? <span style={{ color: '#94a3b8', fontSize: 12 }}>空队列</span> : scene.nodes.map((n, i) => (
                  <div key={n.idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>{i === 0 ? '↓ 队首' : '↓'}</span>
                    <div style={{ display: 'flex', border: '1.5px solid #c7d2fe', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                      <div style={{ padding: '6px 10px', textAlign: 'center', borderRight: '1px dashed #e2e8f0' }}><div style={{ fontSize: 9, color: '#64748b' }}>data</div><div style={{ fontWeight: 800, fontSize: 14 }}>{n.data}</div></div>
                      <div style={{ padding: '6px 10px', textAlign: 'center', background: '#f8fafc' }}><div style={{ fontSize: 9, color: '#64748b' }}>next</div><div style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: '#0f172a' }}>{n.next ? `0x${n.next.toString(16)}` : 'null'}</div></div>
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#94a3b8' }}>0x{n.addr.toString(16)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    ) as unknown as never;
  },
};