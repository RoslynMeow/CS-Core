// 真·堆沙盘：ArrayBuffer + DataView + first-fit，β=null 直到首次分配
// 供 physical-storage / memory-layout / 后续图等所有需要内存的模块复用
// 真实地址 = BASE(0x1000) + byteOffset，字节真写入 DataView，可从视图按位读回

const TOTAL = 128;
const BASE = 0x1000;
const LS_KEY = 'memory:allocs';
const LS_BUF = 'memory:buffer'; // 存 hex 串，便于 reload 后恢复 DataView

type Alloc = { key: string; addr: number; size: number };

let buffer = new ArrayBuffer(TOTAL);
let view = new DataView(buffer);
let freeList: { addr: number; size: number }[] = [{ addr: BASE, size: TOTAL }];
let allocs = new Map<string, Alloc>();

function loadAllocs(): Map<string, Alloc> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Map();
    const arr = JSON.parse(raw) as Alloc[];
    return new Map(arr.map(a => [a.key, a]));
  } catch { return new Map(); }
}
function saveAllocs() {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...allocs.values()])); } catch {}
}
function loadBuffer() {
  try {
    const hex = localStorage.getItem(LS_BUF);
    if (!hex) return;
    const bytes = hex.match(/.{2}/g) || [];
    bytes.forEach((h, i) => { if (i < TOTAL) view.setUint8(i, parseInt(h, 16)); });
  } catch {}
}
function saveBuffer() {
  try {
    let hex = '';
    for (let i = 0; i < TOTAL; i++) hex += view.getUint8(i).toString(16).padStart(2, '0');
    localStorage.setItem(LS_BUF, hex);
  } catch {}
}
allocs = loadAllocs();
loadBuffer();
// 重建 freeList
(function rebuild() {
  const sorted = [...allocs.values()].sort((a, b) => a.addr - b.addr);
  freeList = [];
  let cur = BASE;
  for (const a of sorted) {
    if (a.addr > cur) freeList.push({ addr: cur, size: a.addr - cur });
    cur = a.addr + a.size;
  }
  if (cur < BASE + TOTAL) freeList.push({ addr: cur, size: BASE + TOTAL - cur });
})();

export function getBeta(key: string): number | null { return allocs.get(key)?.addr ?? null; }
export function getAlloc(key: string): Alloc | null { return allocs.get(key) ?? null; }
export function getAllAllocs(): Alloc[] { return [...allocs.values()].sort((a, b) => a.addr - b.addr); }
export function getFreeList() { return [...freeList]; }
export function getTotal() { return TOTAL; }
export function getBase() { return BASE; }
export function getBuffer(): ArrayBuffer { return buffer; }
export function getView(): DataView { return view; }

function writeBytes(addr: number, data: string, size: number) {
  const off = addr - BASE;
  for (let i = 0; i < size; i++) view.setUint8(off + i, data.charCodeAt(i % data.length) & 0xff);
  saveBuffer();
}

export function allocate(key: string, size: number, data: string = ''): number | null {
  if (allocs.has(key)) return allocs.get(key)!.addr;
  for (let i = 0; i < freeList.length; i++) if (freeList[i].size >= size) {
    const addr = freeList[i].addr;
    allocs.set(key, { key, addr, size });
    writeBytes(addr, data, size);
    freeList[i].addr += size; freeList[i].size -= size;
    if (freeList[i].size === 0) freeList.splice(i, 1);
    saveAllocs(); saveBuffer();
    return addr;
  }
  return null;
}
export function reallocate(key: string, newSize: number, data: string = ''): number | null {
  const old = allocs.get(key);
  if (!old) return allocate(key, newSize, data);
  if (old.size === newSize) {
    writeBytes(old.addr, data, newSize);
    saveBuffer();
    return old.addr;
  }
  // 尝试原地扩展
  const idx = freeList.findIndex(f => f.addr === old.addr + old.size);
  if (idx !== -1 && freeList[idx].size + old.size >= newSize) {
    const extra = newSize - old.size;
    // 拷贝旧数据已在原地，只需扩展
    for (let i = old.size; i < newSize; i++) view.setUint8(old.addr - BASE + i, data.charCodeAt(i % data.length) & 0xff);
    freeList[idx].addr += extra; freeList[idx].size -= extra;
    if (freeList[idx].size === 0) freeList.splice(idx, 1);
    old.size = newSize;
    saveAllocs(); saveBuffer();
    return old.addr;
  }
  // 搬迁
  const oldData = (() => { let s = ''; for (let i = 0; i < old.size; i++) s += String.fromCharCode(view.getUint8(old.addr - BASE + i)); return s; })();
  free(key);
  const addr = allocate(key, newSize, data || oldData);
  if (addr === null) {
    // 恢复旧
    allocate(key, old.size, oldData);
    return null;
  }
  // 拷贝已在 allocate 中写入新 data，若是扩容且 data 为旧数据的拼接，需额外处理
  return addr;
}
export function free(key: string) {
  const a = allocs.get(key);
  if (!a) return;
  // 清零
  for (let i = 0; i < a.size; i++) view.setUint8(a.addr - BASE + i, 0);
  allocs.delete(key);
  freeList.push({ addr: a.addr, size: a.size });
  freeList.sort((a, b) => a.addr - b.addr);
  const merged: typeof freeList = [];
  for (const f of freeList) {
    if (merged.length && merged[merged.length - 1].addr + merged[merged.length - 1].size === f.addr) merged[merged.length - 1].size += f.size;
    else merged.push({ ...f });
  }
  freeList = merged;
  saveAllocs(); saveBuffer();
}
export function clearAll() {
  allocs.clear();
  freeList = [{ addr: BASE, size: TOTAL }];
  buffer = new ArrayBuffer(TOTAL);
  view = new DataView(buffer);
  saveAllocs(); saveBuffer();
  try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_BUF); } catch {}
}
export function clearKey(key: string) { free(key); }
