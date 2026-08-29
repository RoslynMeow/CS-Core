import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * 内存可视化 · HEX 编辑器
 * ==========
 * 规定好的 JSON 格式 (经 Base64(JSON) 通过 ?data=… 传入或手动提交)：
 *
 * {
 *   "base": "0x1000" | 4096,           // 可选，堆基址，默认 0x1000
 *   "total": 128,                      // 可选，总字节数，默认 128，范围 1..4096
 *   "endian": "little" | "big",        // 可选，仅影响多字节字段的数值预览，默认 little
 *   "allocations": [
 *     {
 *       "key": "student",              // 必填，内部唯一标识
 *       "addr": "0x1000" | 4096,       // 必填，起始地址（支持 0x 前缀或十进制）
 *       "size": 16,                    // 必填，字节数
 *       "label": "Student",            // 可选，展示名
 *       "color": "#4f46e5",            // 可选，HEX 块颜色
 *       "hex": "2A000000...",          // 可选，十六进制串（0-9a-f，空格/换行自动忽略），优先于 data
 *       "data": "hello",               // 可选，UTF-8 字符串按字节写入，循环填充至 size
 *       // —— 结构化展示（新增，不影响字节，仅做标注）——
 *       "fields": [                    // 可选，结构体的字段标注，按 offset 划分 alloc 内部
 *         { "name": "id",    "offset": 0, "size": 4, "type": "u32",      "color": "#06b6d4" },
 *         { "name": "score", "offset": 4, "size": 4, "type": "i32" },
 *         { "name": "name",  "offset": 8, "size": 8, "type": "char[8]" }
 *       ]
 *     }
 *   ]
 * }
 *
 * 解析规则：
 * - hex 优先；若无 hex 但有 data，则按 UTF-8 编码循环填充；否则填 0x00。
 * - fields 仅用于“结构叠加”高亮与表格展示，不改变字节来源；offset/size 需落在 [0,size) 内。
 * - 未被 allocations 覆盖的区间视为空闲（HEX 灰显，ASCII 为淡点）。
 */

type DumpField = {
  name: string;
  offset: number;
  size: number;
  type?: string;
  color?: string;
  /** 预留：未来可根据 value 自动合成 hex；当前仅作展示 */
  value?: string | number;
};
type DumpAlloc = {
  key: string;
  addr: number | string;
  size: number;
  hex?: string;
  data?: string;
  label?: string;
  color?: string;
  fields?: DumpField[];
};
type MemoryDump = {
  base?: number | string;
  total?: number;
  endian?: 'little' | 'big';
  allocations?: DumpAlloc[];
};

const DEFAULT_BASE = 0x1000;
const DEFAULT_TOTAL = 128;

/** 预期内可忽略的浏览器限制错误（剪贴板/滚动/URL history 等） */
function swallow() { /* 无需处理 */ }

// ── helpers ──────────────────────────────────────────────────
function parseAddr(v: number | string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  if (typeof v === 'number') return v >>> 0;
  const s = String(v).trim();
  if (/^0x/i.test(s)) return parseInt(s, 16) >>> 0;
  const n = Number(s);
  return Number.isFinite(n) ? n >>> 0 : fallback;
}
function toHexByte(n: number) {
  return n.toString(16).padStart(2, '0').toUpperCase();
}
// UTF-8 safe base64
function tryAtob(b64: string): string {
  const pad = b64.length % 4 === 0 ? b64 : b64 + '='.repeat(4 - (b64.length % 4));
  const safe = pad.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(safe);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function tryBtoa(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function getHashQueryParam(name: string): string | null {
  const h = location.hash;
  const q = h.indexOf('?');
  if (q === -1) return new URLSearchParams(location.search).get(name);
  const qs = new URLSearchParams(h.slice(q + 1));
  return qs.get(name) ?? new URLSearchParams(location.search).get(name);
}
function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    const byte = clean.slice(i, i + 2);
    if (byte.length === 1) out.push(parseInt(byte + '0', 16));
    else out.push(parseInt(byte, 16));
  }
  return out;
}

function buildDump(
  input: string,
  isBase64: boolean,
): { dump: MemoryDump | null; bytes: Uint8Array | null; error: string | null; base: number; total: number; endian: 'little' | 'big' } {
  let jsonStr = input.trim();
  if (!jsonStr) return { dump: null, bytes: null, error: null, base: DEFAULT_BASE, total: DEFAULT_TOTAL, endian: 'little' as const };
  try {
    if (isBase64) jsonStr = tryAtob(jsonStr);
  } catch (e) {
    return { dump: null, bytes: null, error: `Base64 解码失败: ${String(e)}`, base: DEFAULT_BASE, total: DEFAULT_TOTAL, endian: 'little' as const };
  }
  let dump: MemoryDump;
  try {
    dump = JSON.parse(jsonStr);
  } catch (e) {
    return { dump: null, bytes: null, error: `JSON 解析失败: ${String(e)}`, base: DEFAULT_BASE, total: DEFAULT_TOTAL, endian: 'little' as const };
  }
  const base = parseAddr(dump.base as any, DEFAULT_BASE);
  const total =
    typeof dump.total === 'number' && dump.total > 0 && dump.total <= 4096 ? Math.floor(dump.total) : DEFAULT_TOTAL;
  const endian: 'little' | 'big' = dump.endian === 'big' ? 'big' : 'little';
  const bytes = new Uint8Array(total);
  const allocs = Array.isArray(dump.allocations) ? dump.allocations : [];
  for (const a of allocs) {
    if (!a || typeof a.key !== 'string' || typeof a.size !== 'number') continue;
    const addr = parseAddr(a.addr as any, base);
    const off = addr - base;
    if (off < 0 || off >= total) continue;
    const size = Math.max(0, Math.min(a.size, total - off));
    let src: number[] = [];
    if (typeof a.hex === 'string' && a.hex.trim()) src = hexToBytes(a.hex);
    else if (typeof a.data === 'string') {
      const enc = new TextEncoder().encode(a.data);
      src = Array.from(enc);
    }
    for (let i = 0; i < size; i++) bytes[off + i] = src.length ? src[i % src.length] & 0xff : 0x00;
  }
  return { dump, bytes, error: null, base, total, endian };
}

// ── 按字段类型解码（结构视图右侧数值） ──────────────────────
function readInt(u8: Uint8Array, start: number, size: number, endian: 'little' | 'big', signed: boolean): string {
  if (size <= 0 || size > 8 || start < 0 || start + size > u8.length) return '—';
  const b = new Uint8Array(size);
  for (let i = 0; i < size; i++) b[i] = u8[start + i];
  let v = 0n;
  for (let i = 0; i < size; i++) {
    // little：低位在前 b[0] 为最低字节 → 从最高字节 b[size-1-i] 开始合并
    const byte = BigInt(b[endian === 'little' ? size - 1 - i : i]);
    v = (v << 8n) | byte;
  }
  if (signed) {
    const sign = 1n << BigInt(size * 8 - 1);
    if ((v & sign) !== 0n) v -= 1n << BigInt(size * 8);
  }
  // 超过 JS 安全整数时补十六进制
  const dec = v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER) ? v.toString() : `${v} (0x${v.toString(16)})`;
  return dec;
}
function readFloat(u8: Uint8Array, start: number, size: number, endian: 'little' | 'big'): string {
  if ((size !== 4 && size !== 8) || start < 0 || start + size > u8.length) return '—';
  const dv = new DataView(u8.buffer, u8.byteOffset + start, size);
  const v = size === 4 ? dv.getFloat32(0, endian === 'little') : dv.getFloat64(0, endian === 'little');
  return String(v);
}
function readPtr(u8: Uint8Array, start: number, size: number, endian: 'little' | 'big'): string {
  if (size <= 0 || size > 8 || start < 0 || start + size > u8.length) return '—';
  const v = BigInt(readInt(u8, start, size, endian, false).split(' ')[0]);
  return '0x' + v.toString(16).toUpperCase().padStart(size * 2, '0');
}
function readText(u8: Uint8Array, start: number, size: number): string {
  let s = '';
  for (let i = start; i < Math.min(start + size, u8.length); i++) {
    const c = u8[i];
    if (c === 0) break;
    s += c >= 32 && c <= 126 ? String.fromCharCode(c) : (c >= 0xc0 ? '·' : '.');
  }
  // 尾部空白压缩展示
  return `"${s}"`;
}
/** UTF-8 解码（截到首个 NUL；非法序列用 � 兜底）；前后加引号 */
function readUtf8(u8: Uint8Array, start: number, size: number): string {
  if (size <= 0 || start < 0 || start >= u8.length) return '—';
  const end = Math.min(start + size, u8.length);
  let n = start;
  while (n < end && u8[n] !== 0) n++;
  let s = '';
  try {
    s = new TextDecoder('utf-8', { fatal: false }).decode(u8.subarray(start, n));
  } catch {
    s = '';
  }
  return `"${s}"`;
}

// —— 字段值解码模式：默认 AUTO（跟随字段声明 type），点击循环切换 ——
type DecodeMode = 'auto' | 'hex' | 'dec' | 'sdec' | 'ascii' | 'utf8' | 'ptr' | 'float';
const DECODE_MODES: DecodeMode[] = ['auto', 'hex', 'dec', 'sdec', 'ascii', 'utf8', 'ptr', 'float'];
const MODE_LABEL: Record<DecodeMode, string> = {
  auto: 'AUTO',
  hex: 'HEX',
  dec: 'DEC',
  sdec: 'SDEC',
  ascii: 'ASCII',
  utf8: 'UTF-8',
  ptr: 'PTR',
  float: 'FLOAT',
};

/** 保险启发式：无符号值落在 dump 地址区间且 4 字节对齐 → 疑似指针（仅提示、不改值） */
function looksLikePtr(vText: string, heapBase: number, heapTotal: number): boolean {
  if (heapBase <= 0 || heapTotal <= 0) return false;
  const m = vText.match(/^\d+/);
  if (!m) return false;
  let v: bigint;
  try { v = BigInt(m[0]); } catch { return false; }
  if (v < BigInt(heapBase) || v >= BigInt(heapBase + heapTotal)) return false;
  return (v & 3n) === 0n;
}
/** 把疑似指针值格式化为提示文本：(→PTR? 0x…) 按字段宽度补零，与 readPtr 格式一致 */
function ptrHintText(vText: string, size: number): string {
  const m = vText.match(/^\d+/);
  if (!m) return '';
  let v: bigint;
  try { v = BigInt(m[0]); } catch { return ''; }
  return ` (→PTR? 0x${v.toString(16).toUpperCase().padStart(size * 2, '0')})`;
}

/** AUTO：依据字段 type 解码；返回 {值, 实际解析出的标签} */
function autoDecode(u8: Uint8Array, start: number, size: number, type: string | undefined, endian: 'little' | 'big', heapBase = 0, heapTotal = 0): { text: string; label: string } {
  const t = (type ?? '').toLowerCase();
  if (!size || start < 0 || start + size > u8.length) return { text: '—', label: MODE_LABEL.auto };
  if (t.includes('bool')) return { text: u8[start] ? 'true' : 'false', label: 'BOOL' };
  if (t.startsWith('ptr') || t.includes('pointer') || t.includes('地址')) return { text: readPtr(u8, start, size, endian), label: 'PTR' };
  if (t.startsWith('char') || t.startsWith('string') || t.startsWith('str') || t.includes('char[')) return { text: readText(u8, start, size), label: 'ASCII' };
  const m = t.match(/^([iu])(\d+)$/);
  if (m) {
    const bits = parseInt(m[2], 10);
    const nBytes = Math.min(Math.ceil(bits / 8), 8);
    if (nBytes === size) {
      const s = readInt(u8, start, size, endian, m[1] === 'i');
      const hint = looksLikePtr(s, heapBase, heapTotal) ? ptrHintText(s, size) : '';
      return { text: s + hint, label: t.toUpperCase() };
    }
  }
  if (t.startsWith('f') || t.includes('float') || t.includes('double')) {
    const bits = t.match(/(\d+)/);
    const nBytes = bits ? Math.min(parseInt(bits[1], 10) / 8, 8) : size;
    if (nBytes === size) return { text: readFloat(u8, start, size, endian), label: size === 4 ? 'F32' : size === 8 ? 'F64' : 'FLOAT' };
  }
  // 常见 C 写法 int/uint/unsigned/long 等
  if (/^(u?int\d*|unsigned|signed|long|short|iint)/.test(t)) {
    const signed = !t.startsWith('u');
    const s = readInt(u8, start, size, endian, signed);
    const hint = looksLikePtr(s, heapBase, heapTotal) ? ptrHintText(s, size) : '';
    return { text: s + hint, label: signed ? 'INT' : 'UINT' };
  }
  return { text: readText(u8, start, size), label: 'ASCII' };
}

/** 按全局模式解码字段值；无效（字节数不够/越界）时返回 —:LABEL 作为保险 */
function decodeByMode(u8: Uint8Array, start: number, size: number, type: string | undefined, endian: 'little' | 'big', mode: DecodeMode, heapBase = 0, heapTotal = 0): { text: string; label: string } {
  if (size <= 0 || start < 0 || start + size > u8.length) return { text: '—', label: MODE_LABEL[mode] };
  switch (mode) {
    case 'auto':
      return autoDecode(u8, start, size, type, endian, heapBase, heapTotal);
    case 'hex': {
      const parts: string[] = [];
      for (let i = 0; i < size; i++) parts.push(toHexByte(u8[start + i]));
      return { text: parts.join(' '), label: 'HEX' };
    }
    case 'dec':
      return { text: readInt(u8, start, size, endian, false), label: 'DEC' };
    case 'sdec':
      return { text: readInt(u8, start, size, endian, true), label: 'SDEC' };
    case 'ascii':
      return { text: readText(u8, start, size), label: 'ASCII' };
    case 'utf8':
      return { text: readUtf8(u8, start, size), label: 'UTF-8' };
    case 'ptr':
      return { text: readPtr(u8, start, size, endian), label: 'PTR' };
    case 'float': {
      const v = readFloat(u8, start, size, endian);
      return { text: v, label: size === 4 ? 'F32' : size === 8 ? 'F64' : 'FLOAT' };
    }
  }
}

// —— 数据类型颜色（AUTO 模式字段值 chip 按解析出的类型着色；右键 chip 可自定义，localStorage 持久化）——
const TYPE_COLORS_DEFAULT: Record<string, string> = {
  U32: '#4f46e5', // 靛蓝
  UINT: '#4f46e5',
  DEC: '#4f46e5',
  I32: '#0891b2', // 青
  INT: '#0891b2',
  SDEC: '#0891b2',
  PTR: '#7c3aed', // 紫
  F32: '#db2777', // 玫红
  F64: '#db2777',
  FLOAT: '#db2777',
  ASCII: '#ea580c', // 橙
  'UTF-8': '#16a34a', // 绿
  BOOL: '#ca8a04', // 黄
  HEX: '#475569', // 石板灰
  AUTO: '#94a3b8', // 兜底灰
};
const TYPE_COLORS_KEY = 'memory.typeColors.v1';
const PRESET_TYPE_COLORS = ['#4f46e5', '#7c3aed', '#0891b2', '#0ea5e9', '#16a34a', '#ca8a04', '#ea580c', '#db2777', '#dc2626', '#475569', '#64748b', '#0f172a'];
function loadTypeColors(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TYPE_COLORS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && typeof saved === 'object') return { ...TYPE_COLORS_DEFAULT, ...saved };
    }
    return { ...TYPE_COLORS_DEFAULT };
  } catch {
    return { ...TYPE_COLORS_DEFAULT };
  }
}

const EMPTY_DUMP: MemoryDump = {
  base: '0x1000',
  total: 64,
  allocations: [],
};

// ── examples ─────────────────────────────────────────────────
const EXAMPLE_BASIC: MemoryDump = {
  base: '0x1000',
  total: 64,
  allocations: [
    { key: 'array', addr: '0x1000', size: 12, hex: '0102030405060708090A0B0C', label: '顺序表 A', color: '#4f46e5' },
    { key: 'node0', addr: '0x1010', size: 8, hex: '2A00000010100000', label: '链表节点 L[0]', color: '#0ea5e9' },
    { key: 'node1', addr: '0x1018', size: 8, hex: '2B00000000000000', label: '链表节点 L[1]', color: '#f59e0b' },
  ],
};

const EXAMPLE_STRUCT: MemoryDump = {
  base: '0x1000',
  total: 80,
  endian: 'little',
  allocations: [
    {
      key: 'student',
      addr: '0x1000',
      size: 24,
      label: 'struct Student',
      color: '#4f46e5',
      hex: '2A000000640000004A6F686E20202020010000000000000000000000',
      fields: [
        { name: 'id', offset: 0, size: 4, type: 'u32', color: '#06b6d4' },
        { name: 'score', offset: 4, size: 4, type: 'i32', color: '#10b981' },
        { name: 'name', offset: 8, size: 12, type: 'char[12]', color: '#f59e0b' },
        { name: 'next', offset: 20, size: 4, type: 'ptr', color: '#8b5cf6' },
      ],
    },
    {
      key: 'heap-int',
      addr: '0x1020',
      size: 16,
      label: 'int buffer[4]',
      color: '#ec4899',
      hex: '01000000020000000300000004000000',
      fields: [
        { name: '[0]', offset: 0, size: 4, type: 'i32' },
        { name: '[1]', offset: 4, size: 4, type: 'i32' },
        { name: '[2]', offset: 8, size: 4, type: 'i32' },
        { name: '[3]', offset: 12, size: 4, type: 'i32' },
      ],
    },
  ],
};

export function MemoryVisualizer() {
  const [b64, setB64] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [mode, setMode] = useState<'b64' | 'json'>('b64');
  const [error, setError] = useState<string | null>(null);
  const [activeHex, setActiveHex] = useState<string>('');
  const [urlB64, setUrlB64] = useState<string | null>(null);
  const [selectedAddr, setSelectedAddr] = useState<number | null>(null);
  const [showAscii, setShowAscii] = useState(true);
  const [inputCollapsed, setInputCollapsed] = useState(true);
  // 结构视图字段解码端序：默认跟随 dump.endian，可手动切换对比
  const [viewEndian, setViewEndian] = useState<'little' | 'big'>('little');
  const manualEndianRef = useRef(false);
  const toggleEndian = () => { manualEndianRef.current = true; setViewEndian(v => (v === 'little' ? 'big' : 'little')); };
  // 字段值全局解码模式：默认 AUTO（跟随字段 type），点击任一字段值 chip 循环切换
  const [decodeMode, setDecodeMode] = useState<DecodeMode>('auto');
  const cycleDecodeMode = () =>
    setDecodeMode(m => DECODE_MODES[(DECODE_MODES.indexOf(m) + 1) % DECODE_MODES.length]);
  // 数据类型 -> 颜色（AUTO 模式生效；右键字段值 chip 可单独修改，localStorage 持久化）
  const [typeColors, setTypeColors] = useState<Record<string, string>>(loadTypeColors);
  const [colorMenu, setColorMenu] = useState<{ label: string; x: number; y: number } | null>(null);
  const setTypeColor = (label: string, color: string) => {
    setTypeColors(prev => {
      const next = { ...prev, [label]: color };
      try { localStorage.setItem(TYPE_COLORS_KEY, JSON.stringify(next)); } catch { swallow(); }
      return next;
    });
  };
  const resetTypeColor = (label: string) => {
    setTypeColors(prev => {
      const next = { ...prev, [label]: TYPE_COLORS_DEFAULT[label] ?? prev[label] ?? '#94a3b8' };
      try { localStorage.setItem(TYPE_COLORS_KEY, JSON.stringify(next)); } catch { swallow(); }
      return next;
    });
  };

  // URL 读取：hash ?data= 优先，否则 ?data= 在 search
  useEffect(() => {
    const pick = () =>
      getHashQueryParam('data') ??
      getHashQueryParam('d') ??
      getHashQueryParam('dump') ??
      getHashQueryParam('mem') ??
      getHashQueryParam('payload');
    const v = pick();
    if (v) {
      setUrlB64(v);
      setB64(v);
      setMode('b64');
      setActiveHex(v.trim());
    }
    const onHash = () => {
      const vv = pick();
      if (vv) {
        setUrlB64(vv);
        setB64(vv);
        setActiveHex(vv.trim());
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 锁定整页：只允许模块内部滚动，页面本身（含导航条）不滚动
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const parsed = useMemo(() => {
    if (mode === 'b64') {
      const src = activeHex || b64;
      if (!src.trim()) return { dump: EMPTY_DUMP, bytes: new Uint8Array(EMPTY_DUMP.total!), error: null, base: DEFAULT_BASE, total: EMPTY_DUMP.total!, endian: 'little' as const };
      return buildDump(src, true);
    }
    if (!jsonText.trim()) return { dump: EMPTY_DUMP, bytes: new Uint8Array(EMPTY_DUMP.total!), error: null, base: DEFAULT_BASE, total: EMPTY_DUMP.total!, endian: 'little' as const };
    return buildDump(jsonText, false);
  }, [mode, b64, activeHex, jsonText]);

  // 端序自动跟随数据声明的 endian（除非用户手动切换过）
  useEffect(() => {
    if (!manualEndianRef.current) setViewEndian(parsed.endian ?? 'little');
  }, [parsed.endian]);

  useEffect(() => {
    setError(parsed.error);
  }, [parsed.error]);

  const dump = parsed.dump ?? EMPTY_DUMP;
  const base = parsed.base;
  const allocs = (dump.allocations ?? []) as DumpAlloc[];

  // 可视空间：按实际分配末端向上取 2 的幂补齐，未使用区显示为空闲
  const pow2 = (n: number) => { let p = 1; while (p < n) p <<= 1; return p; };
  const need = allocs.reduce((mx, a) => { const ad = parseAddr(a.addr as any, base); return Math.max(mx, ad + a.size - base); }, parsed.total);
  const viewTotal = Math.min(pow2(Math.max(need, 1)), 1 << 16);
  const srcBytes = parsed.bytes ?? new Uint8Array(EMPTY_DUMP.total!);
  const bytes = new Uint8Array(viewTotal);
  bytes.set(srcBytes.subarray(0, Math.min(srcBytes.length, viewTotal)));
  const total = viewTotal;

  // address -> alloc / field
  const { addrToAlloc, addrToField, fieldRanges } = useMemo(() => {
    const aMap = new Map<number, DumpAlloc>();
    const fMap = new Map<number, { alloc: DumpAlloc; field: DumpField }>();
    const ranges: { alloc: DumpAlloc; field: DumpField; start: number; end: number }[] = [];
    for (const a of allocs) {
      const aAddr = parseAddr(a.addr as any, base);
      for (let i = 0; i < a.size; i++) aMap.set(aAddr + i, a);
      if (Array.isArray(a.fields)) {
        for (const f of a.fields) {
          if (typeof f.offset !== 'number' || typeof f.size !== 'number') continue;
          if (f.offset < 0 || f.size <= 0 || f.offset + f.size > a.size) continue;
          const s = aAddr + f.offset;
          const e = s + f.size;
          ranges.push({ alloc: a, field: f, start: s, end: e });
          for (let p = s; p < e; p++) fMap.set(p, { alloc: a, field: f });
        }
      }
    }
    return { addrToAlloc: aMap, addrToField: fMap, fieldRanges: ranges };
  }, [allocs, base]);

  const shareLink = useMemo(() => {
    let payload = '';
    try {
      payload = mode === 'b64' ? (activeHex || b64).trim() : tryBtoa(jsonText);
    } catch {
      payload = '';
    }
    if (!payload) return '';
    const b64Safe = payload.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const baseUrl = location.href.split('#')[0];
    // 统一使用 #/memory?data=…，同时兼容旧 #/memory-visualizer
    return `${baseUrl}#/memory?data=${encodeURIComponent(b64Safe)}`;
  }, [mode, b64, activeHex, jsonText]);

  const GAP_THRESHOLD_ROWS = 2;
  const [expandedGaps, setExpandedGaps] = useState<Set<string>>(() => new Set());
  // rows + wavy gaps: collapse consecutive all-free rows >= threshold into one wavy row
  const displayItems: Array<{ type: 'row'; off: number } | { type: 'gap'; startAddr: number; endAddr: number; size: number; startOff: number; endOff: number; key: string }> = useMemo(() => {
    const rows: number[] = [];
    for (let off = 0; off < total; off += 16) rows.push(off);
    const isRowEmpty = (off: number) => {
      for (let i = 0; i < 16; i++) {
        const addr = base + off + i;
        if (addr >= base + total) break;
        if (addrToAlloc.has(addr)) return false;
      }
      return true;
    };
    const items: typeof displayItems = [];
    let runStart: number | null = null;
    let runRows: number[] = [];
    const flushRun = () => {
      if (runRows.length === 0) return;
      if (runRows.length >= GAP_THRESHOLD_ROWS) {
        const startOff = runRows[0];
        const lastOff = runRows[runRows.length - 1];
        const startAddr = base + startOff;
        const endAddr = Math.min(base + lastOff + 16 - 1, base + total - 1);
        const size = endAddr - startAddr + 1;
        const key = `${startOff}-${lastOff}`;
        items.push({ type: 'gap', startAddr, endAddr, size, startOff, endOff: lastOff, key });
      } else {
        for (const o of runRows) items.push({ type: 'row', off: o });
      }
      runRows = [];
      runStart = null;
    };
    for (const off of rows) {
      if (isRowEmpty(off)) {
        if (runStart === null) runStart = off;
        runRows.push(off);
      } else {
        flushRun();
        items.push({ type: 'row', off });
      }
    }
    flushRun();
    return items;
  }, [total, 16, base, addrToAlloc]);

  // ASCII 列宽：16 字节/行固定，确保不截断
  // ASCII 紧贴 HEX：hex 列固定宽（16 字节），不撑满，避免中间空白
  const HEX_W = 410;
  const asciiW = showAscii ? 176 : 0; // 16 字符 × ~10px + 内边距，保证不截断
  const rowTpl = `100px ${HEX_W}px ${asciiW}px`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      swallow();
    }
  };

  // 最小结构：命中字段 → 只高亮该字段区间；否则整块；空闲 → 单字节
  const selScope = useMemo(() => {
    if (selectedAddr === null) return null;
    const fh = addrToField.get(selectedAddr);
    if (fh) {
      const s = parseAddr(fh.alloc.addr as any, base) + fh.field.offset;
      return { key: fh.alloc.key, start: s, end: s + fh.field.size, label: fh.field.name, alloc: fh.alloc, field: fh.field };
    }
    const a = addrToAlloc.get(selectedAddr);
    if (a) {
      const s = parseAddr(a.addr as any, base);
      return { key: a.key, start: s, end: s + a.size, label: a.label ?? a.key, alloc: a, field: null };
    }
    return { key: null, start: selectedAddr, end: selectedAddr + 1, label: null, alloc: null, field: null };
  }, [selectedAddr, addrToField, addrToAlloc, base]);
  // 点击字节/色块：同步选中并让右侧结构视图定位到所属块
  const selectAddr = (a: number | null) => {
    setSelectedAddr(a);
    if (a === null) return;
    const key = addrToAlloc.get(a)?.key;
    const fh = addrToField.get(a);
    const targetId = fh && key ? `alloc-${key}-f-${fh.field.name}` : key ? `alloc-${key}` : null;
    if (targetId) requestAnimationFrame(() => {
      // center：聚焦到结构视图可视区中央；顶部/底部空间不足时浏览器自动停边
      try {
        document.getElementById(targetId)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {
        swallow();
      }
    });
  };

  return (
    <div style={{ position: 'fixed', top: 52, left: 0, right: 0, bottom: 0, zIndex: 10, background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px 58px', overflow: 'hidden' }}>
      {/* 标题条 */}
      <div className="stage" style={{ padding: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 auto', minWidth: 220 }}>
            <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '-0.01em' }}>内存可视化 · HEX 编辑器</h2>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              从 URL 的 <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 4 }}> ?data=BASE64(JSON)</code> 自动加载，或展开底部输入手动粘贴 Base64 / 编辑 JSON。
            </div>
          </div>
          <span
            style={{
              fontSize: 11,
              color: '#334155',
              padding: '6px 10px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 999,
              fontFamily: 'monospace',
            }}
          >
            Base 0x{base.toString(16)} · {total}B（2 的幂补齐）· {allocs.length} 块 · {fieldRanges.length} 字段 · {dump.endian ?? 'little'} endian（解码 {viewEndian}）
          </span>
        </div>

        {/* 迷你内存条 */}
        <div
          style={{
            marginTop: 12,
            height: 28,
            borderRadius: 999,
            border: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            overflow: 'hidden',
            position: 'relative',
          }}
          title="内存总览：点击色块可选中首字节"
        >
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {allocs.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#94a3b8' }}>
                空闲 · {total}B
              </div>
            ) : (
              (() => {
                // 总线细分到字段：已分配块内按 fields 再拆，字段间空隙归块；空闲斜纹
                type Seg = { start: number; size: number; alloc: DumpAlloc | null; field?: DumpField };
                const sorted = [...allocs]
                  .map(a => ({ a, addr: parseAddr(a.addr as any, base) }))
                  .sort((x, y) => x.addr - y.addr);
                const segs: Seg[] = [];
                let cur = base;
                const push = (s: Seg) => { if (s.size > 0) segs.push(s); };
                for (const { a, addr } of sorted) {
                  if (addr > cur) push({ start: cur, size: addr - cur, alloc: null });
                  const aEnd = Math.min(addr + a.size, base + total);
                  const fs = (Array.isArray(a.fields) ? a.fields : []).slice().sort((x, y) => x.offset - y.offset);
                  let aCur = addr;
                  if (fs.length > 0) {
                    for (const f of fs) {
                      const fStart = addr + f.offset;
                      const fEnd = Math.min(fStart + f.size, aEnd);
                      if (fStart > aCur) push({ start: aCur, size: fStart - aCur, alloc: a });
                      push({ start: fStart, size: fEnd - fStart, alloc: a, field: f });
                      aCur = Math.max(aCur, fEnd);
                    }
                    if (aCur < aEnd) push({ start: aCur, size: aEnd - aCur, alloc: a });
                  } else {
                    push({ start: addr, size: aEnd - addr, alloc: a });
                  }
                  cur = aEnd;
                }
                if (cur < base + total) push({ start: cur, size: base + total - cur, alloc: null });
                return segs.map((s, i) => {
                  const fgColor = s.field ? (s.field.color ?? s.alloc?.color ?? '#4f46e5') : (s.alloc?.color ?? '#4f46e5');
                  const isField = s.field != null;
                  const label = isField ? s.field!.name : '';
                  return (
                    <div
                      key={i}
                      onClick={() => s.alloc && selectAddr(s.start)}
                      title={
                        s.alloc
                          ? `${s.alloc.label ?? s.alloc.key}${isField ? ` · ${s.field!.name}(${s.field!.type ?? `${s.field!.size}B`})` : ''} 0x${s.start.toString(16)} — 0x${(s.start + s.size - 1).toString(16)} · ${s.size}B`
                          : `空闲 0x${s.start.toString(16)} — 0x${(s.start + s.size - 1).toString(16)} · ${s.size}B`
                      }
                      style={{
                        flex: `${s.size} 1 0`,
                        // 下半：所属块颜色；字段色只盖上半
                        background: s.alloc ? (s.alloc.color ?? '#4f46e5') : 'repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 6px,#e2e8f0 6px,#e2e8f0 7px)',
                        borderLeft: i === 0 ? undefined : '1px solid rgba(255,255,255,.7)',
                        cursor: s.alloc ? 'pointer' : 'default',
                        position: 'relative',
                        minWidth: 0,
                      }}
                    >
                      {isField && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '55%',
                            background: fgColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 9,
                            fontWeight: 700,
                            color: '#fff',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            padding: '0 3px',
                          }}
                        >
                          {s.size >= 8 ? label : ''}
                        </div>
                      )}
                    </div>
                  );
                });
              })()
            )}
          </div>
        </div>
      </div>

      {/* HEX + 结构：占满视口剩余高度，模块内各自滚动 */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gridTemplateRows: 'minmax(0,1fr)', gap: 12 }}>
        {/* HEX 表 */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              padding: '8px 10px',
              background: '#0f172a',
              color: '#e2e8f0',
              alignItems: 'center',
              flexWrap: 'wrap',
              flexShrink: 0,
            }}
          >
            <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: 0.4 }}>HEX 编辑器</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              点击字节查看详情 · 字段按色块叠加
            </span>
            <span style={{ flex: 1 }} />
            <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, color: '#cbd5e1', cursor: 'pointer' }}>
              <input type="checkbox" checked={showAscii} onChange={e => setShowAscii(e.target.checked)} /> ASCII
            </label>
          </div>

          {/* 列头 */}
          <div style={{ display: 'grid', gridTemplateColumns: rowTpl, gap: 0, background: '#0f172a', color: '#94a3b8', padding: '6px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', flexShrink: 0 }}>
            <span>Address</span>
            <span>Hex（16 字节/行）</span>
            {showAscii && <span>ASCII</span>}
          </div>

          {/* HEX 行（16 字节/行，模块内滚动） */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {displayItems.map(item => {
              if (item.type === 'gap') {
                const expanded = expandedGaps.has(item.key);
                if (expanded) {
                  return (
                    <div key={`gap-${item.key}`} style={{ display: 'grid', gap: 0 }}>
                      {Array.from({ length: (item.endOff - item.startOff) / 16 + 1 }, (_, k) => {
                        const off = item.startOff + k * 16;
                        const rowBase = base + off;
                        return (
                          <div key={off} style={{ display: 'grid', gridTemplateColumns: rowTpl, gap: 0, padding: '4px 10px', borderTop: '1px solid #f1f5f9', alignItems: 'center', background: '#fff7ed', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 }}>
                            <span style={{ color: '#9a3412', fontWeight: 700, letterSpacing: 0.3 }}>0x{rowBase.toString(16).padStart(4, '0')}</span>
                            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                              {Array.from({ length: 16 }, (_, i) => {
                                const idx = off + i;
                                if (idx >= total) return <span key={i} style={{ width: 22 }} />;
                                const addr = base + idx;
                                const v = bytes[idx];
                                return <span key={i} title={`0x${addr.toString(16)} 空闲 — 0x${toHexByte(v)}`} style={{ minWidth: 22, textAlign: 'center', padding: '2px 1px', borderRadius: 4, background: 'transparent', color: '#9a3412', border: '1px solid #fed7aa', opacity: 0.55 }}>{toHexByte(v)}</span>;
                              })}
                            </div>
                            {showAscii && <span style={{ color: '#fed7aa', fontSize: 11 }}>········</span>}
                          </div>
                        );
                      })}
                      <div style={{ textAlign: 'center', padding: '4px', background: '#fff7ed', borderTop: '1px dashed #fdba74' }}>
                        <button className="ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => { const n = new Set(expandedGaps); n.delete(item.key); setExpandedGaps(n); }}>收起折叠</button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={`gap-${item.key}`} style={{ display: 'grid', gridTemplateColumns: rowTpl, gap: 0, padding: '6px 10px', borderTop: '1px solid #fdba74', alignItems: 'center', background: 'repeating-linear-gradient(135deg,#fffbeb,#fffbeb 8px,#fef3c7 8px,#fef3c7 16px)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 }}>
                    <span style={{ color: '#92400e', fontWeight: 800 }}>0x{item.startAddr.toString(16)} ~ 0x{item.endAddr.toString(16)}</span>
                    <div style={{ textAlign: 'center', color: '#92400e', fontWeight: 700, letterSpacing: 2 }}>〰〰〰 省略 {item.size}B 空闲 · {(item.endOff - item.startOff) / 16 + 1} 行 〰〰〰</div>
                    {showAscii ? <button className="pill" style={{ padding: '2px 8px', fontSize: 11, justifySelf: 'end' }} onClick={() => { const n = new Set(expandedGaps); n.add(item.key); setExpandedGaps(n); }}>展开</button> : <span />}
                  </div>
                );
              }
              const off = item.off;
              const rowBase = base + off;
              return (
                <div
                  key={off}
                  style={{ display: 'grid', gridTemplateColumns: rowTpl, gap: 0, padding: '4px 10px', borderTop: '1px solid #f1f5f9', alignItems: 'center', background: off % 32 === 0 ? '#fff' : '#fbfdff', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 }}
                >
                  <span style={{ color: '#4f46e5', fontWeight: 700, letterSpacing: 0.3 }}>0x{rowBase.toString(16).padStart(4, '0')}</span>
                  <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    {Array.from({ length: 16 }, (_, i) => {
                      const idx = off + i;
                      if (idx >= total) return <span key={i} style={{ width: 22 }} />;
                      const addr = base + idx;
                      const a = addrToAlloc.get(addr) ?? null;
                      const f = addrToField.get(addr) ?? null;
                      const v = bytes[idx];
                      const isSelected = selectedAddr === addr;
                      const inSelAlloc = selScope !== null && selScope.key !== null && a !== null && a.key === selScope.key && addr >= selScope.start && addr < selScope.end;
                      const fieldColor = f?.field.color ?? f?.alloc.color ?? a?.color ?? '#4f46e5';
                      const bg = a ? (isSelected ? '#0f172a' : fieldColor) : isSelected ? '#0f172a' : 'transparent';
                      const fg = a || isSelected ? '#fff' : '#0f172a';
                      return (
                        <span
                          key={i}
                          onClick={() => selectAddr(addr)}
                          title={a ? `${a.label ?? a.key}${f ? ` · ${f.field.name} (${f.field.type ?? `${f.field.size}B`})` : ''} @0x${addr.toString(16)} = 0x${toHexByte(v)} (${v})` : `0x${addr.toString(16)} 空闲 — 0x${toHexByte(v)}`}
                          style={{ minWidth: 22, textAlign: 'center', padding: '2px 1px', borderRadius: 4, background: bg, color: fg, border: a ? `1px solid ${isSelected ? '#0f172a' : fieldColor}` : isSelected ? '1px solid #0f172a' : '1px solid #e2e8f0', outline: inSelAlloc ? (isSelected ? '2px solid #0ea5e9' : '1px solid #38bdf8') : 'none', outlineOffset: -1, animation: inSelAlloc ? 'memBlink 1.1s infinite' : undefined, fontWeight: a ? 700 : 400, cursor: 'pointer', boxShadow: isSelected ? '0 0 0 2px rgba(15,23,42,.15)' : undefined, opacity: a ? 1 : 0.55, position: 'relative' }}
                        >
                          {toHexByte(v)}
                          {f && <span style={{ position: 'absolute', left: 1, right: 1, bottom: -1, height: 2, borderRadius: 999, background: a ? '#fff' : fieldColor, opacity: 0.9 }} />}
                        </span>
                      );
                    })}
                  </div>
                  {showAscii && (
                    <span style={{ color: '#64748b', letterSpacing: 0.5, overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 11 }}>
                      {Array.from({ length: 16 }, (_, i) => {
                        const idx = off + i;
                        if (idx >= total) return <span key={i}> </span>;
                        const v = bytes[idx];
                        const ch = v >= 32 && v <= 126 ? String.fromCharCode(v) : '.';
                        const addr = base + idx;
                        const a = addrToAlloc.get(addr);
                        const f = addrToField.get(addr);
                        const isSel = selectedAddr === addr;
                        const a2 = a != null ? a : undefined;
                        const inSelAlloc = selScope !== null && selScope.key !== null && a2 !== undefined && addr >= selScope.start && addr < selScope.end && a2.key === selScope.key;
                        return (
                          <span key={i} onClick={() => selectAddr(addr)} title={`0x${addr.toString(16)} = 0x${toHexByte(v)} '${ch}'`} style={{ color: isSel ? '#0f172a' : a ? (f?.field.color ?? a.color ?? '#0f172a') : '#94a3b8', fontWeight: a ? 700 : 400, background: isSel ? '#e2e8f0' : inSelAlloc ? 'rgba(56,189,248,.35)' : 'transparent', borderRadius: 2, cursor: 'pointer', padding: '0 1px', animation: inSelAlloc ? 'memBlink 1.1s infinite' : undefined }}>{ch}</span>
                        );
                      })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 结构侧栏 */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 }}>
            <div style={{ padding: '10px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 12 }}>结构视图</span>
              <span style={{ fontSize: 11, color: '#64748b' }}>{allocs.length} 块 · 按地址升序</span>
              <span style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, color: '#64748b' }}>
                <span>字段解码</span>
                {(['little', 'big'] as const).map(e => (
                  <button
                    key={e}
                    onClick={toggleEndian}
                    style={{ padding: '2px 8px', borderRadius: 999, border: '1px solid #c7d2fe', background: viewEndian === e ? '#4f46e5' : '#fff', color: viewEndian === e ? '#fff' : '#4338ca', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                  >
                    {e}
                  </button>
                ))}
                <button
                  onClick={cycleDecodeMode}
                  title={`全局解码模式（点击循环）：${DECODE_MODES.map(l => MODE_LABEL[l]).join(' → ')}`}
                  style={{ padding: '2px 8px', borderRadius: 999, border: '1px solid #c7d2fe', background: decodeMode !== 'auto' ? '#4f46e5' : '#fff', color: decodeMode !== 'auto' ? '#fff' : '#4338ca', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                >
                  模式:{MODE_LABEL[decodeMode]}
                </button>
              </span>
              <span style={{ flex: 1 }} />
              <button
                className="ghost"
                style={{ padding: '4px 8px', fontSize: 11 }}
                onClick={() => {
                  try {
                    const raw = mode === 'b64' ? tryAtob((activeHex || b64).trim()) : jsonText;
                    copy(raw);
                  } catch {
                    copy(jsonText);
                  }
                }}
              >
                复制 JSON
              </button>
            </div>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {allocs.length === 0 ? (
                <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 16 }}>无分配 — 展开底部输入粘贴 Base64 或编辑 JSON 后解析</div>
              ) : (
                [...allocs]
                  .map(a => ({ a, addr: parseAddr(a.addr as any, base) }))
                  .sort((x, y) => x.addr - y.addr)
                  .map(({ a, addr }) => {
                    const fields = Array.isArray(a.fields) ? a.fields : [];
                    return (
                      <div
                        key={a.key}
                        id={`alloc-${a.key}`}
                        onClick={() => setSelectedAddr(addr)}
                        style={{
                          border: `1.5px solid ${selectedAddr !== null && selectedAddr >= addr && selectedAddr < addr + a.size ? '#0ea5e9' : '#e2e8f0'}`,
                          borderRadius: 10,
                          overflow: 'hidden',
                          background: '#fff',
                          cursor: 'pointer',
                          flexShrink: 0,
                          animation: selectedAddr !== null && selectedAddr >= addr && selectedAddr < addr + a.size ? 'cardBlink 1.1s infinite' : undefined,
                          boxShadow: selectedAddr !== null && selectedAddr >= addr && selectedAddr < addr + a.size ? '0 0 0 3px rgba(56,189,248,.5)' : undefined,
                        }}
                      >
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', background: `${a.color ?? '#4f46e5'}0d`, borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: a.color ?? '#4f46e5', flexShrink: 0 }} />
                          <span style={{ fontWeight: 800, fontSize: 12 }}>{a.label ?? a.key}</span>
                          <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                            {a.key} · 0x{addr.toString(16)} · {a.size}B
                          </span>
                          <span style={{ flex: 1 }} />
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: 'monospace',
                              background: '#0f172a',
                              color: '#e2e8f0',
                              padding: '2px 6px',
                              borderRadius: 999,
                            }}
                          >
                            0x{addr.toString(16)}–0x{(addr + a.size - 1).toString(16)}
                          </span>
                        </div>
                        {fields.length > 0 ? (
                          <div style={{ padding: 8 }}>
                            <div style={{ display: 'flex', gap: 2, height: 14, borderRadius: 6, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                              {fields
                                .slice()
                                .sort((x, y) => x.offset - y.offset)
                                .map(f => (
                                  <div
                                    key={f.name}
                                    title={`${f.name} @+${f.offset} · ${f.size}B · ${f.type ?? ''}`}
                                    style={{
                                      flex: `${f.size} 1 0`,
                                      background: f.color ?? a.color ?? '#4f46e5',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 9,
                                      color: '#fff',
                                      fontWeight: 800,
                                      minWidth: 0,
                                      overflow: 'hidden',
                                      whiteSpace: 'nowrap',
                                      padding: '0 2px',
                                    }}
                                  >
                                    {f.size >= 3 ? f.name : ''}
                                  </div>
                                ))}
                            </div>
                            <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                              {fields
                                .slice()
                                .sort((x, y) => x.offset - y.offset)
                                .map(f => {
                                  const fAddr = addr + f.offset;
                                  const slice = bytes.slice(fAddr - base, fAddr - base + f.size);
                                  const hexSlice = Array.from(slice, b => toHexByte(b)).join(' ');
                                  const { text: decText, label: decLabel } = decodeByMode(bytes, fAddr - base, f.size, f.type, viewEndian, decodeMode, base, total);
                                  const typeColor = decodeMode === 'auto' ? (typeColors[decLabel] ?? null) : null;
                                  const selFieldHit = selScope !== null && selScope.field !== null && selScope.key === (a.key) && selScope.field.name === f.name;
                                  return (
                                    <div
                                      key={f.name}
                                      id={`alloc-${a.key}-f-${f.name}`}
                                      onClick={e => {
                                        e.stopPropagation();
                                        selectAddr(fAddr);
                                      }}
                                      style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 4,
                                        padding: '6px 8px',
                                        borderRadius: 8,
                                        background: selFieldHit ? '#e0f2fe' : '#f8fafc',
                                        border: selFieldHit ? '1px solid #38bdf8' : '1px solid #f1f5f9',
                                        animation: selFieldHit ? 'cardBlink 1.1s infinite' : undefined,
                                      }}
                                    >
                                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: 2, background: f.color ?? a.color ?? '#4f46e5', flexShrink: 0 }} />
                                        <span style={{ fontWeight: 700, fontSize: 12 }}>{f.name}</span>
                                        {f.type && (
                                          <span style={{ fontSize: 10, color: '#64748b', background: '#fff', border: '1px solid #e2e8f0', padding: '1px 4px', borderRadius: 4 }}>
                                            {f.type}
                                          </span>
                                        )}
                                        <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                                          +{f.offset} · {f.size}B · 0x{fAddr.toString(16)}
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                                        <code style={{ fontFamily: 'monospace', fontSize: 11, color: '#0f172a', wordBreak: 'break-all' }}>{hexSlice}</code>
                                        <button
                                          type="button"
                                          onClick={e => {
                                            e.stopPropagation();
                                            cycleDecodeMode();
                                          }}
                                          onContextMenu={e => {
                                            if (decodeMode !== 'auto') return;
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setColorMenu({
                                              label: decLabel,
                                              x: Math.min(e.clientX, window.innerWidth - 220),
                                              y: Math.min(e.clientY, window.innerHeight - 250),
                                            });
                                          }}
                                          title={`解码：${decLabel} · 点击循环切换（${DECODE_MODES.map(l => MODE_LABEL[l]).join(' → ')}）\n${hexSlice}${decodeMode === 'auto' ? '\nAUTO 模式：右键自定义该类型颜色' : ''}`}
                                          style={{
                                            fontFamily: 'monospace',
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: typeColor ? '#fff' : (f.type ? '#4338ca' : '#475569'),
                                            background: typeColor ?? (f.type ? '#eef2ff' : '#fff'),
                                            border: `1px solid ${typeColor ?? (f.type ? '#c7d2fe' : '#e2e8f0')}`,
                                            padding: '2px 6px',
                                            borderRadius: 6,
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-all',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                          }}
                                        >
                                          {decText}
                                          <span style={{ color: typeColor ? 'rgba(255,255,255,.85)' : '#64748b', fontWeight: 600, marginLeft: 3 }}>:{decLabel}</span>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        ) : (
                          <div style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: '#334155', wordBreak: 'break-all', background: '#f8fafc' }}>
                            {(() => {
                              const off = addr - base;
                              const slice = bytes.slice(off, off + Math.min(a.size, 32));
                              const preview = Array.from(slice, b => toHexByte(b)).join(' ');
                              return preview + (a.size > 32 ? ' …' : '');
                            })()}
                            {a.hex ? null : a.data ? `  // data="${a.data}"` : '  // 0x00 填充'}
                            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#64748b', marginTop: 4 }}>
                              ascii: "{(() => { const o = addr - base; const s2 = bytes.slice(o, o + Math.min(a.size, 32)); return Array.from(s2, b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join(''); })()}" · 类型 {a.fields ? `${a.fields.length} 字段` : '未标注，无法按类型解码'}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
        </div>

      </div>

      {/* 输入区 — 浮动折叠于底部，编辑器始终可见且可增长 */}
      <div
        className="stage"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          maxHeight: inputCollapsed ? 52 : 380,
          overflow: 'hidden',
          borderRadius: '12px 12px 0 0',
          boxShadow: '0 -8px 30px rgba(15,23,42,.12)',
          border: '1px solid #e2e8f0',
          borderBottom: 'none',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '10px 12px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button className="ghost" onClick={() => setInputCollapsed(v => !v)} style={{ padding: '4px 8px', fontSize: 11 }}>
            {inputCollapsed ? '展开 ▲' : '折叠 ▼'}
          </button>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#475569', letterSpacing: 0.4 }}>输入</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{inputCollapsed ? '· 已折叠 — 编辑器全高可见' : '· 浮动 — 编辑器始终可见'}</span>
          <button className={`pill ${mode === 'b64' ? 'active' : ''}`} onClick={() => setMode('b64')}>
            Base64
          </button>
          <button className={`pill ${mode === 'json' ? 'active' : ''}`} onClick={() => setMode('json')}>
            JSON
          </button>
          <span style={{ flex: 1 }} />
          <button
            className="ghost"
            onClick={() => {
              setJsonText(JSON.stringify(EXAMPLE_BASIC, null, 2));
              const b = tryBtoa(JSON.stringify(EXAMPLE_BASIC));
              setB64(b);
              setActiveHex(b);
              setMode('b64');
            }}
          >
            示例：基础
          </button>
          <button
            className="ghost"
            onClick={() => {
              setJsonText(JSON.stringify(EXAMPLE_STRUCT, null, 2));
              const b = tryBtoa(JSON.stringify(EXAMPLE_STRUCT));
              setB64(b);
              setActiveHex(b);
              setMode('b64');
            }}
          >
            示例：结构体
          </button>
          <button
            className="ghost"
            onClick={() => {
              if (shareLink) copy(shareLink);
            }}
          >
            复制分享链接
          </button>
        </div>

        {!inputCollapsed && (
          <div style={{ overflow: 'auto', flex: 1 }}>
            {mode === 'b64' ? (
              <div style={{ padding: 12, display: 'grid', gap: 8 }}>
                {urlB64 && (
                  <div style={{ fontSize: 11, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '6px 8px' }}>
                    已从 URL 读取 <code>?data=…</code>（{urlB64.length} 字符，已自动解码）
                  </div>
                )}
                <textarea
                  className="txt"
                  value={b64}
                  onChange={e => setB64(e.target.value)}
                  placeholder="粘贴 Base64(JSON)… 例：eyJiYXNlIjoiMHgxMDAwIiwidG90YWwiOjY0LCJhbGxvY2F0aW9ucyI6W119"
                  rows={4}
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    className="pill active"
                    onClick={() => {
                      const v = b64.trim();
                      setActiveHex(v);
                      if (v) setError(null);
                    }}
                  >
                    解析 Base64
                  </button>
                  <button
                    className="ghost"
                    onClick={() => {
                      setB64('');
                      setActiveHex('');
                      setUrlB64(null);
                      setError(null);
                      try {
                        const h = location.hash;
                        const q = h.indexOf('?');
                        if (q !== -1) history.replaceState(null, '', location.pathname + location.search + h.slice(0, q));
                      } catch {
                        swallow();
                      }
                    }}
                  >
                    清空
                  </button>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>修改后需点“解析”；切到 JSON 标签页可实时预览。</span>
                </div>
                <div
                  style={{ fontSize: 11, color: '#475569', background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 8, padding: '8px 10px', lineHeight: 1.6 }}
                >
                  规定格式：{' '}
                  <code style={{ fontFamily: 'monospace', background: '#fff', border: '1px solid #e2e8f0', padding: '1px 4px', borderRadius: 4 }}>
                    {'{ base, total, endian, allocations:[{key,addr,size,hex|data,label,color,fields:[{name,offset,size,type}]}] }'}
                  </code>
                  <br />
                  <span style={{ color: '#64748b' }}>
                    · <code>addr</code> 支持 <code>0x</code> 十六进制或十进制数字；<code>hex</code> 为连续十六进制，无需 <code>0x</code>，自动忽略空格换行；
                  </span>
                  <br />
                  <span style={{ color: '#64748b' }}>
                    · <code>fields</code> 仅做可视化标注（不改字节），用于把一块内存按结构体字段着色。
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ padding: 12, display: 'grid', gap: 8 }}>
                <textarea
                  className="txt"
                  value={jsonText}
                  onChange={e => setJsonText(e.target.value)}
                  placeholder='空 — 粘贴 JSON 或点上方「示例：基础 / 结构体」载入模板，例如：{"base":"0x1000","total":64,"allocations":[]}'
                  rows={10}
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="pill active"
                    onClick={() => {
                      try {
                        JSON.parse(jsonText);
                        setError(null);
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  >
                    校验 JSON
                  </button>
                  <button
                    className="ghost"
                    onClick={() => {
                      try {
                        const b = tryBtoa(jsonText);
                        setB64(b);
                        setActiveHex(b);
                        setMode('b64');
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  >
                    转为 Base64
                  </button>
                  <button
                    className="ghost"
                    onClick={() => {
                      try {
                        copy(tryBtoa(jsonText));
                      } catch {
                        swallow();
                      }
                    }}
                  >
                    复制 Base64
                  </button>
                  <button
                    className="ghost"
                    onClick={() => {
                      setJsonText(JSON.stringify(EXAMPLE_STRUCT, null, 2));
                    }}
                  >
                    还原示例
                  </button>
                </div>
              </div>
            )}
            {error && (
              <div style={{ margin: '0 12px 12px', color: '#dc2626', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>
                {error}
              </div>
            )}
            {shareLink && (
              <div style={{ margin: '0 12px 12px', fontSize: 11, color: '#64748b', wordBreak: 'break-all', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
                分享链接（URL-safe Base64，去 padding）：{' '}
                <span style={{ fontFamily: 'monospace', color: '#0f172a' }}>{shareLink}</span>{' '}
                <button className="pill" style={{ marginLeft: 6, padding: '2px 8px', fontSize: 11 }} onClick={() => copy(shareLink)}>
                  复制
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {colorMenu && decodeMode === 'auto' && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 120 }} onClick={() => setColorMenu(null)} />
          <div
            style={{
              position: 'fixed',
              left: colorMenu.x,
              top: colorMenu.y,
              zIndex: 121,
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              boxShadow: '0 12px 40px rgba(15,23,42,.18)',
              padding: 10,
              minWidth: 190,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: typeColors[colorMenu.label] ?? '#94a3b8', display: 'inline-block' }} />
              {colorMenu.label} 颜色
              <span style={{ flex: 1 }} />
              <button className="ghost" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setColorMenu(null)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              {PRESET_TYPE_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setTypeColor(colorMenu.label, c)}
                  title={c}
                  style={{ width: 20, height: 20, borderRadius: 5, background: c, border: '1px solid #e2e8f0', cursor: 'pointer' }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={typeColors[colorMenu.label] ?? '#4f46e5'}
                onChange={e => setTypeColor(colorMenu.label, e.target.value)}
                style={{ width: 44, height: 26, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', padding: 0 }}
              />
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', flex: 1 }}>{typeColors[colorMenu.label] ?? '—'}</span>
              <button className="ghost" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => resetTypeColor(colorMenu.label)}>恢复默认</button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @media(max-width: 900px){
          div[style*="minmax(0,1.5fr)"]{grid-template-columns:1fr !important; grid-template-rows:minmax(0,45%) minmax(0,55%) !important;}
        }
        @keyframes memBlink{0%,100%{outline-color:#38bdf8;opacity:1}50%{outline-color:rgba(56,189,248,.25);opacity:.4}}
        @keyframes cardBlink{0%,100%{box-shadow:0 0 0 3px rgba(56,189,248,.55)}50%{box-shadow:0 0 0 3px rgba(56,189,248,.15)}}
      `}</style>
    </div>
  );
}
