import { useEffect, useState } from 'react';
import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { MathText } from '../../lib/tex';
import { buildMemoryUrl, encodeIntLE, hexFromBytes } from '../../lib/memoryDump';
import { ChainSession, ChainWriter, processBaseOnce } from '../../lib/sessionHeap';


type ElemType = 'i32' | 'i16' | 'u8';
type Op = 'idle' | 'get' | 'insert' | 'delete';
type Cfg = { elemType: ElemType; endian: 'little' | 'big'; valuesStr: string; prevValuesStr?: string; ptrSize: 4 | 8; op: Op; pos: number; insVal: number; execTick: number; };

type NodeInfo = { idx: number; addr: number; data: number; next: number | null; size: number; hex: string; bytes: number[]; };
type Scene = { heapBase: number; total: number; elemSize: number; ptrSize: number; nodeSize: number; nodes: NodeInfo[]; head: number | null; focus: number | null; phase: 'idle' | 'alloc' | 'traverse' | 'insert' | 'delete'; op: Op; };

const TOTAL = 256;
const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

function elemSizeOf(t: ElemType): number { return t === 'i32' ? 4 : t === 'i16' ? 2 : 1; }
function parseVals(s: string): number[] { return s.split(/[,，\s]+/).map(x => x.trim()).filter(Boolean).map(v => Number(v)).filter(Number.isFinite).map(v => Math.trunc(v)); }

let chainS: ChainSession | null = null;
const mkWriter = (elemSize: number, endian: 'little' | 'big', ptrSize: number): ChainWriter => (h, addr, data, nextAddr) => {
  const d = endian === 'little' ? encodeIntLE(data, elemSize) : encodeIntLE(data, elemSize).reverse();
  const nx = (() => { const n = nextAddr ?? 0; const le = encodeIntLE(n, ptrSize); return endian === 'little' ? le : le.reverse(); })();
  const bytes = [...d, ...nx];
  h.writeBytes(addr, bytes);
  return bytes;
};
// 循环语义：同步后把尾节点 next 指回头节点（单节点指回自身）
function fixTail(cfg: Cfg) {
  if (!chainS || chainS.nodes.length === 0) return;
  const ns = chainS.nodes;
  const headAddr = ns[0].addr;
  const tail = ns[ns.length - 1];
  const w = mkWriter(elemSizeOf(cfg.elemType), cfg.endian, cfg.ptrSize);
  const bytes = w(chainS.heap, tail.addr, tail.data, headAddr);
  tail.bytes = bytes; tail.next = headAddr;
  tail.hex = hexFromBytes(bytes);
}
function buildScene(cfg: Cfg, focus: number | null, phase: Scene['phase'], valuesOverride?: number[]): Scene {
  const vals = valuesOverride ?? parseVals(cfg.valuesStr);
  const elemSize = elemSizeOf(cfg.elemType);
  const nodeSize = elemSize + cfg.ptrSize;
  const layoutKey = `${nodeSize}|${cfg.endian}`;
  if (!chainS || chainS.nodeSize !== nodeSize || chainS.layoutKey !== layoutKey) chainS = new ChainSession(nodeSize, mkWriter(elemSize, cfg.endian, cfg.ptrSize), layoutKey);
  const tag = cfg.valuesStr;
  const prev = cfg.prevValuesStr ?? null;
  const prevVals = prev !== null && prev !== tag && cfg.execTick > 0 && (cfg.op === 'insert' || cfg.op === 'delete') ? parseVals(prev) : null;
  const key = `${prev}>${tag}`;
  if (prevVals !== null) {
    if (!chainS.delta(prevVals, vals, key)) chainS.boot(vals);
  } else if (chainS.nodes.length !== vals.length || chainS.nodes.some((n, i) => n.data !== vals[i])) {
    chainS.boot(vals);
  }
  fixTail(cfg);
  const nodes = chainS.nodes;
  return { heapBase: chainS.getHeapBase(), total: 256, elemSize, ptrSize: cfg.ptrSize, nodeSize, nodes, head: nodes.length ? nodes[0].addr : null, focus, phase, op: cfg.op };
}
function buildDump(cfg: Cfg) {
  const s = buildScene(cfg, null, 'idle');
  const allocs = s.nodes.map(n => ({
    key: `node${n.idx}`, addr: `0x${n.addr.toString(16)}`, size: n.size, hex: n.hex, label: `L[${n.idx}]`,
    color: COLORS[n.idx % COLORS.length],
    fields: [{ name: 'data', offset: 0, size: s.elemSize, type: cfg.elemType, color: COLORS[n.idx % COLORS.length] }, { name: 'next', offset: s.elemSize, size: s.ptrSize, type: `ptr${s.ptrSize * 8}`, color: '#64748b' }],
  }));
  return { base: `0x${s.heapBase.toString(16)}`, total: 256, endian: cfg.endian, allocations: allocs };
}
function gen(cfg: Cfg): Frame<Scene>[] {
  const hasPrev = typeof cfg.prevValuesStr === 'string' && cfg.execTick > 0 && (cfg.op === 'insert' || cfg.op === 'delete');
  const origVals = hasPrev ? parseVals(cfg.prevValuesStr!) : parseVals(cfg.valuesStr);
  const curVals = parseVals(cfg.valuesStr);
  const vals = hasPrev ? origVals : curVals;
  if (cfg.execTick === 0 || cfg.op === 'idle') {
    const idle = buildScene({ ...cfg, op: 'idle' }, null, 'idle');
    const empty = vals.length === 0;
    return [
      { line: 0, caption: T(empty ? '空环：$head=null$，点“示例”构造' : `待执行：环形 $L=[${vals.join(',')}]$ ${vals.length} 节点，尾 $next$ 指回 $head$`, empty ? 'empty' : `Pending`), scene: idle },
    ];
  }
  const pos = cfg.pos | 0;
  if (cfg.op === 'get') {
    const target = buildScene(cfg, pos, 'traverse');
    const frames: Frame<Scene>[] = [];
    frames.push({ line: 0, caption: T(`$p\\gets head$ = 0x${target.head ? target.head.toString(16) : 'null'}`, `p=head`), scene: buildScene(cfg, null, 'traverse') });
    for (let i = 0; i <= Math.min(pos, target.nodes.length - 1); i++) frames.push({ line: 2, caption: T(`for 循环：遍历到 $L[${i}]$ @0x${target.nodes[i].addr.toString(16)}$（无 $null$ 终止）`, `traverse to L[${i}]`), scene: buildScene(cfg, i, 'traverse') });
    if (pos < target.nodes.length) frames.push({ line: 3, caption: T(`return $L[${pos}].data=${target.nodes[pos].data}$`, `return ${target.nodes[pos].data}`), scene: buildScene(cfg, pos, 'traverse') });
    else frames.push({ line: 1, caption: T(`越界：$pos=${pos}\\ge length=${target.nodes.length}$`, `oob`), scene: buildScene(cfg, null, 'traverse') });
    return frames;
  }
  if (cfg.op === 'insert') {
    const can = pos >= 0 && pos <= origVals.length;
    const after = hasPrev ? curVals : can ? [...origVals.slice(0, pos), Math.trunc(cfg.insVal), ...origVals.slice(pos)] : origVals;
    if (!can) { const s = buildScene(cfg, null, 'idle', origVals); return [{ line: 0, caption: T('插入失败：越界', 'fail'), scene: s }, { line: 0, caption: T('越界', 'oob'), scene: s }]; }
    const afterScene = buildScene({ ...cfg, valuesStr: after.join(',') }, pos, 'insert');
    const last = afterScene.nodes[afterScene.nodes.length - 1];
    return [
      { line: 0, caption: T(`新节点 $malloc$ → $0x${afterScene.nodes[pos].addr.toString(16)}$，$data=${cfg.insVal}$`, `malloc→0x${afterScene.nodes[pos].addr.toString(16)}`), scene: afterScene },
      { line: 1, caption: T(`链接：前驱 $next\\gets 0x${afterScene.nodes[pos].addr.toString(16)}$`, `link`), scene: afterScene },
      { line: 2, caption: T(`完成：尾节点 $next\\gets head=0x${last.next?.toString(16)}$（闭环）`, `tail.next→head`), scene: { ...afterScene, focus: last.idx } },
    ];
  }
  if (cfg.op === 'delete') {
    const can = pos >= 0 && pos < origVals.length;
    if (!can) { const s = buildScene(cfg, null, 'idle', origVals); return [{ line: 0, caption: T('删除失败：越界', 'fail'), scene: s }]; }
    const after = hasPrev ? curVals : [...origVals.slice(0, pos), ...origVals.slice(pos + 1)];
    const afterScene = buildScene({ ...cfg, valuesStr: after.join(',') }, pos > 0 ? pos - 1 : null, 'delete');
    return [
      { line: 0, caption: T(`定位 $L[${pos}]$ @0x${buildScene(cfg, pos, 'idle').nodes[pos].addr.toString(16)}$`, `locate`), scene: buildScene(cfg, pos, 'delete') },
      { line: 1, caption: T(`越过：前驱 $next$ 指向 $L[${pos}]$ 的后继，$free(q)$`, `unlink & free`), scene: afterScene },
      { line: 2, caption: T(`完成：$L=[${after.join(',')||'∅'}]$，尾 $next$ 仍指回头节点`, `done`), scene: afterScene },
    ];
  }
  return gen({ ...cfg, op: 'idle', execTick: 0 });
}
const CODE: Record<Op, any> = {
  idle: [T('$heapBase \\gets ASLR$', '$heapBase$'), T('$p\\gets malloc(nodeSize)$ // 真实地址', '$p\\gets malloc$'), T('$pending$ // 等待执行', '$pending$')] as never,
  get: [T('$p\\gets head$', '$p\\gets head$'), T('for $k\\gets0$ to $n-1$: // 环形无 $null$', 'for $k\\gets0$ to $n-1$:'), T('  $p\\gets p.next$', '  $p\\gets p.next$'), T('return $p.data$', 'return $p.data$')] as never,
  insert: [T('$q\\gets malloc(nodeSize)$', '$q\\gets malloc$'), T('$q.data\\gets x;\\; q.next\\gets p.next$', '$q.data\\gets x$; $q.next\\gets p.next$'), T('$p.next\\gets q$ // 尾指回头保环', '$p.next\\gets q$')] as never,
  delete: [T('$q\\gets p.next$', '$q\\gets p.next$'), T('$p.next\\gets q.next$ // 保环', '$p.next\\gets q.next$'), T('$free(q)$', '$free(q)$')] as never,
};
function toHex(b: number) { return b.toString(16).padStart(2, '0').toUpperCase(); }

export const circularLinkedListModule: ModuleDef<Scene, Cfg> = {
  id: 'circular-linked-list', title: T('循环链表', 'Circular Linked List'),
  desc: T('单链表的尾节点 $next$ 不指向 $null$，而是指回头节点 $head$，形成闭环；遍历无终止标记需计步。', 'Tail next points back to head.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: { elemType: 'i32', endian: 'little', valuesStr: '', ptrSize: 4, op: 'idle', pos: 0, insVal: 99, execTick: 0 },
  randomize(c) { return { ...c, valuesStr: '', op: 'idle', execTick: 0 } as Cfg; },
  Controls({ config, onChange, t, onPlay }: any) {
    const isZh = t(T('中文', 'en')) !== 'en';
    const [draft, setDraft] = useState<Cfg>(config);
    const set = (p: Partial<Cfg>) => setDraft(s => ({ ...s, ...p }));
    // 外部 config 变化（随机/示例/清空/语言切换）时同步本地 draft
    useEffect(() => { if (draft.valuesStr !== config.valuesStr || draft.execTick !== config.execTick) setDraft(config); }, [config]);
    const loadExample = () => { const ns: Cfg = { ...draft, valuesStr: '10,20,30,40', prevValuesStr: undefined, op: 'idle', execTick: 0 }; setDraft(ns); onChange(ns); };
    const clearAll = () => { const ns: Cfg = { ...draft, valuesStr: '', prevValuesStr: undefined, op: 'idle', execTick: 0 }; setDraft(ns); onChange(ns); };
    const exec = () => {
      const op = (['get', 'insert', 'delete'] as Op[]).includes(draft.op) ? draft.op : 'get';
      const capVals = parseVals(draft.valuesStr);
      let nextStr = draft.valuesStr;
      let prev: string | undefined;
      if (op === 'insert') { const p = draft.pos | 0; if (p >= 0 && p <= capVals.length) { nextStr = [...capVals.slice(0, p), Math.trunc(draft.insVal), ...capVals.slice(p)].join(','); prev = draft.valuesStr; } }
      else if (op === 'delete') { const p = draft.pos | 0; if (p >= 0 && p < capVals.length) { nextStr = [...capVals.slice(0, p), ...capVals.slice(p + 1)].join(','); prev = draft.valuesStr; } }
      const next: Cfg = { ...draft, valuesStr: nextStr, prevValuesStr: prev, op, execTick: config.execTick + 1 };
      onChange(next); setDraft(next); setTimeout(() => onPlay?.(), 60);
    };
    const dump = buildDump({ ...draft, execTick: config.execTick } as Cfg);
    const onView = () => { location.href = buildMemoryUrl(dump as any); };
    const needVal = draft.op === 'insert';
    const needPos = draft.op !== 'idle';
    const curLen = parseVals(draft.valuesStr).length;
    const pos = draft.pos | 0;
    const invalid = draft.op === 'insert' ? !(pos >= 0 && pos <= curLen) : draft.op === 'delete' ? !(pos >= 0 && pos < curLen) : false;
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca' }}>{isZh ? '模式' : 'MODE'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('元素', 'Elem'))}</span><select className="txt" value={draft.elemType} onChange={e => set({ elemType: e.target.value as ElemType })}><option value="i32">i32 (4B)</option><option value="i16">i16 (2B)</option><option value="u8">u8 (1B)</option></select></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>Ptr</span><select className="txt" value={draft.ptrSize} onChange={e => set({ ptrSize: Number(e.target.value) as any })}><option value={4}>32-bit</option><option value={8}>64-bit</option></select></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>Endian</span><select className="txt" value={draft.endian} onChange={e => set({ endian: e.target.value as any })}><option value="little">little</option><option value="big">big</option></select></label>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{isZh ? '参数' : 'PARAMS'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('操作', 'Op'))}</span><select className="txt" value={draft.op} onChange={e => set({ op: e.target.value as Op })}>
            <option value="idle">{t(T('— 选择操作 —', '— pick —'))}</option><option value="get">{t(T('查看', 'Get'))}</option><option value="insert">{t(T('插入', 'Insert'))}</option><option value="delete">{t(T('删除', 'Delete'))}</option>
          </select></label>
          {needPos && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('位置', 'Pos'))}</span><input className="txt" type="number" min={0} max={16} value={draft.pos} onChange={e => set({ pos: Number(e.target.value) || 0 })} style={{ width: 56 }} /></label>}
          {needVal && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('值', 'Val'))}</span><input className="txt" type="number" value={draft.insVal} onChange={e => set({ insVal: Number(e.target.value) || 0 })} style={{ width: 64 }} /></label>}
          <button className="pill active" onClick={exec} disabled={draft.op === 'idle'} style={invalid ? { opacity: 0.6 } : undefined}>执行</button>
          <button className="ghost" onClick={() => onChange(circularLinkedListModule.randomize!(draft))}>↻ {t(T('重新生成', 'Regenerate'))}</button>
          <button className="ghost" onClick={loadExample}>示例</button>
          <button className="ghost" onClick={clearAll}>{t(T('清空', 'Clear'))}</button>
          <button className="pill" onClick={onView}>查看内存 ↗</button>
          {draft.op !== 'idle' && (
            <span style={{ fontSize: 11, fontFamily: 'monospace', background: invalid ? '#fef2f2' : '#f1f5f9', color: invalid ? '#dc2626' : '#64748b', border: `1px solid ${invalid ? '#fecaca' : '#e2e8f0'}`, borderRadius: 999, padding: '3px 8px' }}>
              {isZh ? `共 ${curLen} 节点` : `${curLen}`}{invalid && ` · ${pos}${isZh ? ' 越界' : ' OOB'}`}
            </span>
          )}
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) { return CODE[cfg.op] as never; },
  generate: gen,
  Render({ scene: _scene }) {
    // 防错位：切 subMode 后首帧可能仍是旧模块的 scene，先兜底再渲染
    const scene = ((_scene as any) ?? {}) as Scene;
    scene.nodes = Array.isArray(scene.nodes)
      ? (scene.nodes as any[]).filter((n) => n && typeof n.addr === "number" && Array.isArray(n.bytes))
      : [];
    scene.head = scene.head ?? null;
    scene.focus = scene.focus ?? null;
    scene.heapBase = Number.isFinite(scene.heapBase) ? scene.heapBase : 0;
    scene.elemSize = Number.isFinite(scene.elemSize) ? scene.elemSize : 4;
    scene.ptrSize = Number.isFinite(scene.ptrSize) ? scene.ptrSize : 4;
    scene.nodeSize = Number.isFinite(scene.nodeSize) ? scene.nodeSize : scene.elemSize + scene.ptrSize;
    const empty = scene.nodes.length === 0;
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ border: '1px solid #c7d2fe', borderRadius: 12, overflow: 'hidden', background: '#eef2ff' }}>
          <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 800, color: '#4338ca', display: 'flex', gap: 8, alignItems: 'center' }}><span>逻辑视图 · 循环链表</span><span style={{ fontWeight: 400, color: '#64748b' }}>head = {scene.head ? `0x${scene.head.toString(16)}` : 'null'} · {scene.nodes.length} 节点 · 尾 next 指回 head</span></div>
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ padding: '6px 10px', borderRadius: 8, background: '#0f172a', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 11, textAlign: 'center' }}><div style={{ fontWeight: 800 }}>head</div><div style={{ color: '#94a3b8', fontSize: 10 }}>{scene.head ? `0x${scene.head.toString(16)}` : 'null'}</div></div>
              {empty ? (
                <span style={{ color: '#94a3b8', fontSize: 13, padding: 6 }}>空 — 点“示例”构造或执行插入</span>
              ) : (
                scene.nodes.map(n => {
                  const isFocus = scene.focus === n.idx;
                  const last = n.idx === scene.nodes.length - 1;
                  return (
                    <div key={n.idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <span style={{ color: '#64748b', fontSize: 16, lineHeight: 1 }}>↓</span>
                      <div style={{ display: 'flex', border: `1.5px solid ${isFocus ? '#0f172a' : COLORS[n.idx % COLORS.length]}`, borderRadius: 10, overflow: 'hidden', background: isFocus ? '#0f172a' : '#fff', boxShadow: isFocus ? '0 4px 16px rgba(15,23,42,.25)' : undefined }}>
                        <div style={{ padding: '6px 8px', textAlign: 'center', minWidth: 52, borderRight: '1px dashed #e2e8f0' }}><div style={{ fontSize: 9, color: isFocus ? '#94a3b8' : '#64748b' }}>data</div><div style={{ fontWeight: 800, color: isFocus ? '#fff' : '#0f172a' }}>{n.data}</div><div style={{ fontFamily: 'monospace', fontSize: 9, color: isFocus ? '#cbd5e1' : '#94a3b8' }}>{n.bytes.slice(0, scene.elemSize).map(toHex).join(' ')}</div></div>
                        <div style={{ padding: '6px 8px', textAlign: 'center', minWidth: 72, background: isFocus ? '#1e293b' : '#f8fafc' }}><div style={{ fontSize: 9, color: isFocus ? '#94a3b8' : '#64748b' }}>next</div><div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: isFocus ? '#38bdf8' : '#0f172a' }}>{n.next ? `0x${n.next.toString(16)}` : 'null'}</div><div style={{ fontFamily: 'monospace', fontSize: 9, color: '#94a3b8' }}>{n.bytes.slice(scene.elemSize).map(toHex).join(' ')}</div></div>
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#64748b', background: '#fff', border: '1px solid #e2e8f0', padding: '1px 6px', borderRadius: 4 }}>0x{n.addr.toString(16)}</div>
                      {last && scene.nodes.length > 1 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#4f46e5', background: '#eef2ff', border: '1px dashed #c7d2fe', padding: '2px 8px', borderRadius: 999 }}>↺ next 指回 head 0x{scene.head?.toString(16)}</span>
                      )}
                      {last && scene.nodes.length === 1 && (
                        <span style={{ fontSize: 10, color: '#4f46e5', background: '#eef2ff', border: '1px dashed #c7d2fe', padding: '2px 8px', borderRadius: 999 }}>↺ 单节点 next 指回自身</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    ) as unknown as never;
  },
};
