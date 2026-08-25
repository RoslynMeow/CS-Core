// 轻量堆模拟器：first-fit，无持久化，专供知识点用
// 用于拿到“程序可拿到的真实地址”——即 allocate() 返回值，而非手算 base+i*size
export type HeapAlloc = { key: string; addr: number; size: number };
export class Heap {
  base: number;
  total: number;
  buffer: ArrayBuffer;
  view: DataView;
  freeList: { addr: number; size: number }[];
  allocs: Map<string, HeapAlloc>;
  // base 应为用户态堆地址（如 0x5555…/0x7f…），不再用 0x1000；aslrOffset 仍可叠加
  constructor(total = 128, base = 0x555555559000, aslrOffset = 0) {
    this.total = total;
    this.base = (base + aslrOffset);
    this.buffer = new ArrayBuffer(total);
    this.view = new DataView(this.buffer);
    this.freeList = [{ addr: this.base, size: total }];
    this.allocs = new Map();
  }
  getAll(): HeapAlloc[] { return [...this.allocs.values()].sort((a, b) => a.addr - b.addr); }
  getFree() { return [...this.freeList]; }
  allocate(key: string, size: number): number | null {
    if (this.allocs.has(key)) return this.allocs.get(key)!.addr;
    for (let i = 0; i < this.freeList.length; i++) {
      if (this.freeList[i].size >= size) {
        const addr = this.freeList[i].addr;
        this.allocs.set(key, { key, addr, size });
        this.freeList[i].addr += size;
        this.freeList[i].size -= size;
        if (this.freeList[i].size === 0) this.freeList.splice(i, 1);
        return addr;
      }
    }
    return null;
  }
  // 写入 bytes 到 addr
  writeBytes(addr: number, bytes: number[]) {
    const off = addr - this.base;
    for (let i = 0; i < bytes.length; i++) this.view.setUint8(off + i, bytes[i] & 0xff);
  }
  readBytes(addr: number, size: number): Uint8Array {
    const off = addr - this.base;
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i++) out[i] = this.view.getUint8(off + i);
    return out;
  }
  // 释放
  free(key: string) {
    const a = this.allocs.get(key);
    if (!a) return;
    for (let i = 0; i < a.size; i++) this.view.setUint8(a.addr - this.base + i, 0);
    this.allocs.delete(key);
    this.freeList.push({ addr: a.addr, size: a.size });
    this.freeList.sort((x, y) => x.addr - y.addr);
    const merged: typeof this.freeList = [];
    for (const f of this.freeList) {
      const last = merged[merged.length - 1];
      if (last && last.addr + last.size === f.addr) last.size += f.size;
      else merged.push({ ...f });
    }
    this.freeList = merged;
  }
  // 预占 OS 保留块，用于让首个程序分配不再是 0x1000，模拟真实堆
  reserveOs(bytes = 16, key = '__os__') { this.allocate(key, bytes); }
}
// 真实用户堆基址：模拟 Linux x86-64 ASLR 后的 mmap/brk 区域（0x5555… 主堆 / 0x7f… mmap），4K 对齐
const REAL_USER_BASES = [
  0x555555559000, // 主堆常见起点（PIE 可执行文件后）
  0x7f8a2b400000, // mmap 区域
  0x7f6c1e000000,
  0x55555576a000,
];
export function randomBase(base = 0x555555559000): number {
  // 若传入的是旧的 0x1000 小地址，自动映射到真实用户区，避免 0x1000 这种内核/零页既视感
  const isLow = base < 0x10000;
  if (isLow) base = REAL_USER_BASES[Math.floor(Math.random() * REAL_USER_BASES.length)];
  const off = Math.floor(Math.random() * 8) * 16; // 16B 对齐的 ASLR 微抖
  return base + off;
}
export function realisticUserBase(tick: number): number {
  const base = REAL_USER_BASES[tick % REAL_USER_BASES.length];
  const aslr = (tick * 0x9e3779b1) & 0xfff0; // 确定性抖动，4K 对齐，展示每次 malloc 基址可能不同
  return base + (aslr % 0x8000);
}
