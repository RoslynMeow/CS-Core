import { useEffect, useState } from 'react';
import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { buildMemoryUrl, encodeIntLE, hexFromBytes } from '../../lib/memoryDump';
import { Heap } from '../../lib/heap';
import { processBaseOnce } from '../../lib/sessionHeap';


type ElemType = 'i32' | 'i16' | 'u8';
type HashMethod = 'division' | 'multiplication' | 'midsquare';
// 重复键策略：reject=拒绝已存在；update=覆盖（不新增节点）；append=允许重复
const DUP_METHODS = ['reject', 'update', 'append'] as const;
type Dup = (typeof DUP_METHODS)[number];
type Op = 'idle' | 'search' | 'insert' | 'delete';
type Cfg = { elemType: ElemType; endian: 'little' | 'big'; ptrSize: 4 | 8; bucketM: number; method: HashMethod; dup: Dup; inited: boolean; keysStr: string; prevKeysStr?: string; op: Op; key: number; execTick: number; };

type NodeInfo = { idx: number; addr: number; key: number; next: number | null; size: number; hex: string; bytes: number[] };
type Scene = { method: HashMethod; heapBase: number; total: number; elemSize: number; ptrSize: number; nodeSize: number; bucketM: number; nodes: NodeInfo[]; buckets: number[][]; // 每个桶的节点 idx 顺序
  bucketHeads: number[]; tableAddr: number; tableBytes: Uint8Array; tableHex: string;
  focusH: number | null; focusKey: number | null; phase: 'idle' | 'alloc' | 'link' | 'traverse' | 'delete'; inited: boolean; op: Op; key: number };
type Build = { nodes: NodeInfo[]; buckets: number[][]; bucketHeads: number[]; tableAddr: number; tableBytes: Uint8Array; tableHex: string; heapBase: number };

const TOTAL = 256;
const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
// 会话级哈希堆：进程内固定基址；table/节点地址只随键集一次重建（ASLR 仅刷新时一次）
let htHeap: Heap | null = null;
let htKey = '';
function sessionHeap(cfg: Cfg): Heap {
  const key = `${cfg.inited}|${cfg.ptrSize}|${Math.max(2, Math.min(16, cfg.bucketM | 0))}|${elemSizeOf(cfg.elemType)}`;
  if (!htHeap || htKey !== key) {
    htHeap = new Heap(TOTAL, processBaseOnce());
    htKey = key;
  }
  return htHeap;
}

function elemSizeOf(t: ElemType): number { return t === 'i32' ? 4 : t === 'i16' ? 2 : 1; }
function parseKeys(s: string): number[] { return s.split(/[,，\s]+/).map(x => x.trim()).filter(Boolean).map(v => Number(v)).filter(Number.isFinite).map(v => Math.trunc(v)); }
const HASH_METHOD_LABEL: Record<HashMethod, { zh: string; formula: string }> = {
  division: { zh: '除法散列', formula: 'k \bmod m' },
  multiplication: { zh: '乘法散列', formula: '\u230am\cdot(kA\bmod 1)\u230b' },
  midsquare: { zh: '平方取中', formula: 'k^2 \ \u4e2d\u95f4\u4f4d' },
};
// 取非负散列值落入 [0,m)
function hashFn(k: number, m: number, method: HashMethod): number {
  const pos = (x: number) => ((x % m) + m) % m;
  if (method === 'division') return pos(k);
  if (method === 'multiplication') {
    const A = 0.6180339887498949; // 黄金比例
    const t = k * A;
    const frac = t - Math.floor(t);
    return pos(Math.floor(m * frac));
  }
  // 平方取中：取 k^2 中间若干位后再对 m 取模
  const sq = Math.abs(k) * Math.abs(k);
  const s = String(sq);
  const width = Math.max(1, String(m - 1).length);
  const mid = Math.floor((s.length - width) / 2);
  const midNum = parseInt(s.slice(Math.max(0, mid), Math.max(0, mid) + width) || '0', 10);
  return pos(midNum);
}
function hash(k: number, m: number, method?: HashMethod): number { return hashFn(k, m, method ?? 'division'); }

function buildWithHeap(cfg: Cfg, keys: number[]): Build {
  const elemSize = elemSizeOf(cfg.elemType);
  const ptrSize = cfg.ptrSize;
  const nodeSize = elemSize + ptrSize;
  const m = Math.max(2, Math.min(16, cfg.bucketM | 0));
  if (!cfg.inited) {
    return { nodes: [], buckets: Array.from({ length: m }, () => []), bucketHeads: Array(m).fill(0), tableAddr: 0, tableBytes: new Uint8Array(0), tableHex: '', heapBase: processBaseOnce() };
  }
  const heap = sessionHeap(cfg);
  heap.resetAll();
  heap.allocate('__os__', 16);
  const tableAddr = heap.allocate('table', m * ptrSize) ?? heap.base;
  // 分配每个 key 节点（真实地址）
  const nodes: NodeInfo[] = [];
  const addrs: number[] = [];
  const buckets: number[][] = Array.from({ length: m }, () => []);
  for (let i = 0; i < keys.length; i++) {
    const addr = heap.allocate(`node${i}`, nodeSize) ?? heap.base;
    addrs.push(addr);
  }
  // 计算桶归属并组链
  for (let i = 0; i < keys.length; i++) buckets[hashFn(keys[i], m, cfg.method)].push(i);
  const bucketHeads: number[] = Array(m).fill(0);
  for (let h = 0; h < m; h++) {
    for (let b = 0; b < buckets[h].length; b++) {
      const i = buckets[h][b];
      const next = b + 1 < buckets[h].length ? addrs[buckets[h][b + 1]] : null;
      const dataBytes = cfg.endian === 'little' ? encodeIntLE(keys[i], elemSize) : encodeIntLE(keys[i], elemSize).reverse();
      const nextBytes = (() => { const n = next ?? 0; const le = encodeIntLE(n, ptrSize); return cfg.endian === 'little' ? le : le.reverse(); })();
      const bytes = [...dataBytes, ...nextBytes];
      heap.writeBytes(addrs[i], bytes);
      nodes.push({ idx: i, addr: addrs[i], key: keys[i], next, size: nodeSize, hex: hexFromBytes(bytes), bytes });
      if (b === 0) bucketHeads[h] = addrs[i];
    }
  }
  nodes.sort((a, b) => a.idx - b.idx);
  // 桶头指针数组写入 table
  const tableBytes = new Uint8Array(m * ptrSize);
  for (let h = 0; h < m; h++) {
    const en = cfg.endian === 'little' ? encodeIntLE(bucketHeads[h], ptrSize) : encodeIntLE(bucketHeads[h], ptrSize).reverse();
    for (let b = 0; b < ptrSize; b++) tableBytes[h * ptrSize + b] = en[b];
  }
  heap.writeBytes(tableAddr, Array.from(tableBytes));
  return { nodes, buckets, bucketHeads, tableAddr, tableBytes, tableHex: hexFromBytes(Array.from(tableBytes)), heapBase: heap.base };
}
function buildScene(cfg: Cfg, focusH: number | null, focusKey: number | null, phase: Scene['phase'], keysOverride?: number[]): Scene {
  const keys = keysOverride ?? parseKeys(cfg.keysStr);
  const b = buildWithHeap(cfg, keys);
  return { ...b, method: cfg.method, total: TOTAL, elemSize: elemSizeOf(cfg.elemType), ptrSize: cfg.ptrSize, nodeSize: elemSizeOf(cfg.elemType) + cfg.ptrSize, bucketM: Math.max(2, Math.min(16, cfg.bucketM | 0)), focusH, focusKey, phase, inited: cfg.inited, op: cfg.op, key: cfg.key };
}
function buildDump(cfg: Cfg) {
  const keys = parseKeys(cfg.keysStr);
  const b = buildWithHeap(cfg, keys);
  const elemSize = elemSizeOf(cfg.elemType);
  const ptrSize = cfg.ptrSize;
  const allocs: any[] = [
    { key: 'table', addr: `0x${b.tableAddr.toString(16)}`, size: b.tableBytes.length, hex: b.tableHex, label: `table[0..${cfg.bucketM - 1}] 桶头指针`, color: '#4f46e5' },
    ...b.nodes.map((n, k) => ({
      key: `node${n.idx}`, addr: `0x${n.addr.toString(16)}`, size: n.size, hex: n.hex, label: `L[${n.idx}] key=${n.key} → h=${hashFn(n.key, cfg.bucketM, cfg.method)} (${HASH_METHOD_LABEL[cfg.method].zh})`,
      color: COLORS[k % COLORS.length],
      fields: [
        { name: 'key', offset: 0, size: elemSize, type: cfg.elemType, color: COLORS[k % COLORS.length] },
        { name: 'next', offset: elemSize, size: ptrSize, type: `ptr${ptrSize * 8}`, color: '#64748b' },
      ],
    })),
  ];
  return { base: `0x${b.heapBase.toString(16)}`, total: TOTAL, endian: cfg.endian, allocations: allocs };
}
function gen(cfg: Cfg): Frame<Scene>[] {
  const m = Math.max(2, Math.min(16, cfg.bucketM | 0));
  const hasPrev = typeof cfg.prevKeysStr === 'string' && cfg.execTick > 0 && (cfg.op === 'insert' || cfg.op === 'delete');
  const origKeys = hasPrev ? parseKeys(cfg.prevKeysStr!) : parseKeys(cfg.keysStr);
  const curKeys = parseKeys(cfg.keysStr);
  const keys = hasPrev ? origKeys : curKeys;
  if (cfg.execTick === 0 || cfg.op === 'idle') {
    const idle = buildScene({ ...cfg, op: 'idle' }, null, null, 'idle', keys);
    if (!cfg.inited) return [{ line: 0, caption: T(`未初始化：设置桶数 ${m} 并点「初始化」（节点仍自动增长）`, 'Not initialized'), scene: idle }];
    const empty = keys.length === 0;
    return [
      { line: 0, caption: T(empty ? `就绪：$table[0..${m - 1}]$ 空，点“示例”构造或执行插入` : `就绪：$table[0..${m - 1}]$，已有 ${keys.length} 个键，$load\\;factor=${(keys.length / m).toFixed(2)}$`, empty ? 'empty' : `ready`), scene: idle },
    ];
  }
  if (!cfg.inited) {
    const idle = buildScene({ ...cfg, op: 'idle' }, null, null, 'idle', keys);
    return [{ line: 0, caption: T('未初始化：请先点「初始化」', 'Not initialized'), scene: idle }];
  }
  const k = cfg.key | 0;
  const mt = cfg.method; const h = hashFn(k, m, mt);
  if (cfg.op === 'search') {
    const bucketIdx = origKeys.map((x, i) => ({ i, x })).filter(o => hashFn(o.x, m, mt) === h);
    const target = buildScene(cfg, h, null, 'traverse', origKeys);
    const frames: Frame<Scene>[] = [];
    frames.push({ line: 0, caption: T(`$h(${k})=${h}$（${HASH_METHOD_LABEL[cfg.method].zh}）$\\to$ 桶 $${h}$`, `h(${k})=${h}`), scene: { ...target, focusH: h } });
    let found = false;
    for (const o of bucketIdx) {
      frames.push({ line: 2, caption: T(`遍历桶 $${h}$：$key=${o.x}$ @0x${target.nodes.find(n => n.idx === o.i)?.addr.toString(16)}`, `bucket${h} key=${o.x}`), scene: { ...buildScene(cfg, h, o.i, 'traverse', origKeys), focusH: h, focusKey: o.x } });
      if (o.x === k) { found = true; break; }
    }
    frames.push({ line: found ? 2 : 3, caption: found ? T(`命中：$key=${k}$ 在桶 $${h}$`, `found`) : T(`未找到：$key=${k}$（桶 $${h}$ 无此键）`, `not found`), scene: { ...buildScene(cfg, h, null, 'traverse', origKeys), focusH: h } });
    return frames;
  }
  if (cfg.op === 'insert') {
    const exists = origKeys.includes(k);
    const policyText = cfg.dup === 'reject' ? T('拒绝', 'reject') : cfg.dup === 'update' ? T('覆盖', 'update') : T('允许重复', 'append');
    if (exists && cfg.dup !== 'append') {
      return [
        { line: 0, caption: T(`$h(${k})=${h}\to$ 桶 $${h}$，检测到 $key=${k}$ 已存在`, `h(${k})=${h}`), scene: buildScene(cfg, h, k, 'traverse', origKeys) },
        { line: 1, caption: T(`已存在 → 策略「${policyText.zh}」：不新增节点`, `exists → ${policyText.en}`), scene: buildScene(cfg, h, k, 'traverse', origKeys) },
        { line: 2, caption: T(`完成：$table$ 不变（${cfg.dup === 'reject' ? '拒绝插入' : '原地覆盖'}）`, `no change`), scene: buildScene(cfg, h, k, 'traverse', origKeys) },
      ];
    }
    const after = hasPrev ? curKeys : [...origKeys, k];
    const afterScene = buildScene({ ...cfg, keysStr: after.join(',') }, h, k, 'link', after);
    const newNode = [...afterScene.nodes].sort((a, b) => b.idx - a.idx)[0];
    return [
      { line: 0, caption: T(`$h(${k})=${h}$（${HASH_METHOD_LABEL[cfg.method].zh}）$\\to$ 桶 $${h}$`, `h(${k})=${h}`), scene: buildScene(cfg, h, null, 'alloc', origKeys) },
      { line: 1, caption: exists ? T(`$key=${k}$ 已存在，策略允许追加`, `exists, append`) : T('$key$ 未存在', `new key`), scene: buildScene(cfg, h, null, 'alloc', origKeys) },
      { line: 4, caption: T(`新节点 $malloc$ → $0x${newNode?.addr.toString(16)}$（$key=${k}$）`, `malloc→0x${newNode?.addr.toString(16)}`), scene: afterScene },
      { line: 4, caption: exists ? T(`允许重复：同 $key=${k}$ 再次入链，桶 $${h}$`, `append dup`) : T(`链入桶 $${h}$：插入链表$（冲突→链式）$`, `link into bucket${h}`), scene: { ...afterScene, focusH: h, focusKey: k } },
    ];
  }
  if (cfg.op === 'delete') {
    const bucketIdx = origKeys.map((x, i) => ({ i, x })).filter(o => hashFn(o.x, m, mt) === h);
    if (bucketIdx.length === 0) return [{ line: 0, caption: T(`$h(${k})=${h}$（${HASH_METHOD_LABEL[cfg.method].zh}）→ 桶 $${h}$ 为空，无此键`, `empty bucket`), scene: buildScene(cfg, h, null, 'idle', origKeys) }];
    const after = hasPrev ? curKeys : origKeys.filter(x => x !== k);
    const afterScene = buildScene({ ...cfg, keysStr: after.join(',') }, h, null, 'delete', after);
    return [
      { line: 0, caption: T(`$h(${k})=${h}$（${HASH_METHOD_LABEL[cfg.method].zh}）$\\to$ 桶 $${h}$`, `h(${k})=${h}`), scene: buildScene(cfg, h, null, 'traverse', origKeys) },
      { line: 1, caption: T(`桶 $${h}$ 找到/未找 $key=${k}$；若在则 $free$ 该节点并重链`, `unlink & free`), scene: afterScene },
      { line: 2, caption: T(`完成：$table[0..${m - 1}]$，剩余 ${after.length} 个键`, `done`), scene: { ...afterScene, focusH: h } },
    ];
  }
  return gen({ ...cfg, op: 'idle', execTick: 0 });
}
const CODE: Record<Op, any> = {
  idle: [T('$h \\gets hash(key,m)$', '$h\\gets hash(key,m)$'), T('$table[0..m-1]\\gets null$ // 空桶', '$table\\gets null$'), T('$pending$ // 等待执行', '$pending$')] as never,
  search: [T('$h \\gets hash(key,m)$', '$h\\gets hash(key,m)$'), T('for $q$ in $table[h]$: // 遍历桶链表', 'for $q$ in $table[h]$:'), T('  if $q.key=key$: return $q$ // 命中', '  if $q.key=key$: return $q$'), T('return $null$ // 未找到', 'return $null$')] as never,
  insert: [
    T('$h \\gets hash(key,m)$ // 定桶', '$h\\gets hash(key,m)$'),
    T('if $exists(key)$: // 判重', 'if $exists(key)$:'),
    T('  return // $reject$/$update$ 不新增节点', '  return // no new node'),
    T('else: // $append$ 或新键', 'else:'),
    T('  $q\\gets malloc(nodeSize)$; $link(q,table[h])$ // 链入桶', '  $q\\gets malloc$; $link(q,table[h])$'),
  ] as never,
  delete: [T('$h \\gets hash(key,m)$ // 定桶', '$h\\gets hash(key,m)$'), T('$unlink(table[h],key)$; $free(q)$ // 摘链释放', '$unlink$; $free(q)$'), T('return $table[0..m-1]$ // 完成', 'return $table$')] as never,
};
function toHex(b: number) { return b.toString(16).padStart(2, '0').toUpperCase(); }

export const hashTableModule: ModuleDef<Scene, Cfg> = {
  id: 'hash-table', title: T('哈希表', 'Hash Table'),
  desc: T('固定桶数组 $table[0..m-1]$（每个桶存链表头指针），子 $hash$ 定归属：除法 $k\\bmod m$ / 乘法 $\\lfloor m(kA\\bmod 1)\\rfloor$ / 平方取中；冲突用链地址法。', 'Bucket array + chained hash (division/multiplication/mid-square).'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: { elemType: 'i32', endian: 'little', ptrSize: 4, bucketM: 10, method: 'division' as HashMethod, dup: 'reject' as Dup, inited: false, keysStr: '', op: 'idle', key: 4, execTick: 0 },
  randomize(c) { return { ...c, keysStr: '', op: 'idle', execTick: 0 } as Cfg; },
  Controls({ config, onChange, t, onPlay }: any) {
    const isZh = t(T('中文', 'en')) !== 'en';
    const [draft, setDraft] = useState<Cfg>(config);
    const set = (p: Partial<Cfg>) => setDraft(s => ({ ...s, ...p }));
    // 外部 config 变化（随机/示例/清空/语言切换）时同步本地 draft
    useEffect(() => { if (draft.keysStr !== config.keysStr || draft.execTick !== config.execTick) setDraft(config); }, [config]);
    const loadExample = () => { const ns: Cfg = { ...draft, keysStr: '3,8,13,18,1', prevKeysStr: undefined, op: 'idle', execTick: 0 }; setDraft(ns); onChange(ns); };
    const clearAll = () => { const ns: Cfg = { ...draft, inited: false, keysStr: '', prevKeysStr: undefined, op: 'idle', execTick: 0 }; setDraft(ns); onChange(ns); };
    const init = () => { const ns: Cfg = { ...draft, inited: true, keysStr: '', prevKeysStr: undefined, op: 'idle', execTick: 0 }; setDraft(ns); onChange(ns); };
    const exec = () => {
      const op = (['search', 'insert', 'delete'] as Op[]).includes(draft.op) ? draft.op : 'search';
      const cur = parseKeys(draft.keysStr);
      let nextStr = draft.keysStr;
      let prev: string | undefined;
      const k = draft.key | 0;
      if (op === 'insert') {
        const exists = cur.includes(k);
        // 重复键策略：reject/update 不新增节点；append 或新键才追加
        if (!exists || draft.dup === 'append') { nextStr = [...cur, k].join(','); prev = draft.keysStr; }
      }
      else if (op === 'delete') { nextStr = cur.filter(x => x !== k).join(','); prev = draft.keysStr; }
      const next: Cfg = { ...draft, keysStr: nextStr, prevKeysStr: prev, op, execTick: config.execTick + 1 };
      onChange(next); setDraft(next); setTimeout(() => onPlay?.(), 60);
    };
    const dump = buildDump({ ...draft, execTick: config.execTick } as Cfg);
    const onView = () => { location.href = buildMemoryUrl(dump as any); };
    const m = Math.max(2, Math.min(16, draft.bucketM | 0));
    const cur = parseKeys(draft.keysStr);
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca' }}>{isZh ? '模式' : 'MODE'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('元素', 'Elem'))}</span><select className="txt" value={draft.elemType} disabled={draft.inited} onChange={e => set({ elemType: e.target.value as ElemType })}><option value="i32">i32 (4B)</option><option value="i16">i16 (2B)</option><option value="u8">u8 (1B)</option></select></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>Ptr</span><select className="txt" value={draft.ptrSize} disabled={draft.inited} onChange={e => set({ ptrSize: Number(e.target.value) as any })}><option value={4}>32-bit</option><option value={8}>64-bit</option></select></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>Endian</span><select className="txt" value={draft.endian} onChange={e => set({ endian: e.target.value as any })}><option value="little">little</option><option value="big">big</option></select></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('桶数', 'Buckets'))}</span><input className="txt" type="number" min={2} max={16} value={draft.bucketM} disabled={draft.inited} onChange={e => set({ bucketM: Math.max(2, Math.min(16, Number(e.target.value) || 10)) })} style={{ width: 56 }} /></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('散列', 'Hash'))}</span><select className="txt" value={draft.method} onChange={e => set({ method: e.target.value as HashMethod })}>
            <option value="division">{t(T('除法 k mod m', 'Division k mod m'))}</option>
            <option value="multiplication">{t(T('乘法 ⌊m(kA mod 1)⌋', 'Multiplication'))}</option>
            <option value="midsquare">{t(T('平方取中', 'Mid-square'))}</option>
          </select></label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('重复键', 'Dup key'))}</span><select className="txt" value={draft.dup} onChange={e => set({ dup: e.target.value as Dup })}>
            <option value="reject">{t(T('拒绝', 'Reject'))}</option>
            <option value="update">{t(T('覆盖', 'Update'))}</option>
            <option value="append">{t(T('允许重复', 'Append'))}</option>
          </select></label>
          {!draft.inited && <button className="pill active" onClick={init}>{t(T('初始化', 'Init'))}</button>}
          <button className="ghost" onClick={clearAll}>{t(T('清空', 'Clear'))}</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap', opacity: draft.inited ? 1 : 0.5, pointerEvents: draft.inited ? 'auto' : 'none' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{isZh ? '参数' : 'PARAMS'}</span>
          <button className="ghost" onClick={() => onChange(hashTableModule.randomize!(draft))}>↻ {t(T('重新生成', 'Regenerate'))}</button>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('操作', 'Op'))}</span><select className="txt" value={draft.op} onChange={e => set({ op: e.target.value as Op })}>
            <option value="idle">{t(T('— 选择操作 —', '— pick —'))}</option><option value="search">{t(T('查找', 'Search'))}</option><option value="insert">{t(T('插入', 'Insert'))}</option><option value="delete">{t(T('删除', 'Delete'))}</option>
          </select></label>
          {draft.op !== 'idle' && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('键', 'Key'))}</span><input className="txt" type="number" value={draft.key} onChange={e => set({ key: Number(e.target.value) || 0 })} style={{ width: 64 }} /></label>}
                    <button className="pill active" onClick={exec} disabled={draft.op === 'idle' || !draft.inited}>执行</button>
          <button className="ghost" onClick={loadExample} disabled={!draft.inited}>示例</button>
          <button className="pill" onClick={onView} disabled={!draft.inited}>查看内存 ↗</button>
          {!draft.inited && <span style={{ fontSize: 11, fontFamily: 'monospace', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 999, padding: '3px 8px' }}>{isZh ? '未初始化' : 'not inited'}</span>}
          <span style={{ fontSize: 11, fontFamily: 'monospace', background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 999, padding: '3px 8px' }}>
            {isZh ? `${cur.length} 键 / ${m} 桶` : `${cur.length} keys / ${m} buckets`}{draft.op !== 'idle' && ` · h(${draft.key}) = ${hashFn(draft.key | 0, m, draft.method)} (${HASH_METHOD_LABEL[draft.method].zh})`}
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
    scene.method = (scene.method === 'division' || scene.method === 'multiplication' || scene.method === 'midsquare')
      ? scene.method
      : ('division' as Scene['method']);
    scene.bucketM = Number.isFinite(scene.bucketM) ? scene.bucketM : 10;
    scene.nodes = Array.isArray(scene.nodes) ? scene.nodes : [];
    scene.buckets = Array.isArray(scene.buckets) ? scene.buckets : [];
    scene.bucketHeads = Array.isArray(scene.bucketHeads) ? scene.bucketHeads : [];
    scene.tableAddr = Number.isFinite(scene.tableAddr) ? scene.tableAddr : 0;
    scene.focusH = scene.focusH ?? null;
    scene.focusKey = scene.focusKey ?? null;
    if (!scene.inited) {
      return <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#b91c1c', textAlign: 'center' }}>未初始化 — 设置桶数与散列方法后点「初始化」；节点随后自动增长，只有清空后才能改桶数。</div> as unknown as never;
    }
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ border: '1px solid #c7d2fe', borderRadius: 12, overflow: 'hidden', background: '#eef2ff' }}>
          <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 800, color: '#4338ca', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>逻辑视图 · 哈希表（链地址法）</span>
            <span style={{ fontWeight: 400, color: '#64748b' }}>table[0..{scene.bucketM - 1}] · {scene.nodes.length} 键 · $h={HASH_METHOD_LABEL[scene.method].formula}$, $m={scene.bucketM}$（{HASH_METHOD_LABEL[scene.method].zh}）</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 10, background: '#fff', border: '1px solid #c7d2fe', padding: '2px 6px', borderRadius: 999 }}>table @0x{scene.tableAddr.toString(16)}</span>
          </div>
          <div style={{ padding: 12, display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {scene.nodes.length === 0 ? (
              <span style={{ color: '#94a3b8', fontSize: 13, padding: 12 }}>空 — 点“示例”构造或执行插入</span>
            ) : Array.from({ length: scene.bucketM }, (_, h) => {
              const idxs = scene.buckets[h] ?? [];
              const isFocusH = scene.focusH === h;
              return (
                <div key={h} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, border: `1.5px solid ${isFocusH ? '#4f46e5' : '#c7d2fe'}`, borderRadius: 12, padding: 8, background: isFocusH ? '#eef2ff' : '#fff' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: '#4338ca', background: '#e0e7ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '3px 10px' }}>table[{h}] {isFocusH && scene.focusKey !== null ? `= ${scene.focusKey}` : ''}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#64748b' }}>head {(scene.bucketHeads[h] ?? 0) ? `0x${scene.bucketHeads[h].toString(16)}` : 'null'}</div>
                  {idxs.length === 0 ? <span style={{ color: '#cbd5e1', fontSize: 12 }}>∅</span> : idxs.map((i, b) => {
                    const n = scene.nodes.find(x => x.idx === i)!;
                    const isKey = scene.focusKey === n.key;
                    // 重复键计数（append 允许重复时可见 ×N）
                    const dupCount = scene.nodes.filter(x => x.key === n.key).length;
                    return (
                      <div key={n.idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        {b === 0 ? <span style={{ color: '#64748b' }}>↓</span> : <span style={{ color: '#cbd5e1', fontSize: 10 }}>↓</span>}
                        <div style={{ display: 'flex', border: `1.5px solid ${isKey ? '#0f172a' : COLORS[h % COLORS.length]}`, borderRadius: 8, overflow: 'hidden', background: isKey ? '#0f172a' : '#fff' }}>
                          <div style={{ padding: '4px 6px', textAlign: 'center', borderRight: '1px dashed #e2e8f0' }}><div style={{ fontSize: 8, color: isKey ? '#94a3b8' : '#64748b' }}>key</div><div style={{ fontWeight: 800, color: isKey ? '#fff' : '#0f172a' }}>{n.key}{dupCount > 1 && <span style={{ marginLeft: 3, fontSize: 9, background: '#f59e0b', color: '#fff', borderRadius: 4, padding: '0 3px' }}>×{dupCount}</span>}</div></div>
                          <div style={{ padding: '4px 8px', textAlign: 'center', background: isKey ? '#1e293b' : '#f8fafc' }}><div style={{ fontSize: 8, color: isKey ? '#94a3b8' : '#64748b' }}>next</div><div style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: isKey ? '#38bdf8' : '#64748b' }}>{n.next ? `0x${n.next.toString(16)}` : 'null'}</div></div>
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#94a3b8' }}>0x{n.addr.toString(16)}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    ) as unknown as never;
  },
};
