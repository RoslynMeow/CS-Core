// memoryDump helpers: build MemoryDump JSON and encode for #/memory
export type DumpField = { name: string; offset: number; size: number; type?: string; color?: string };
export type DumpAlloc = { key: string; addr: number | string; size: number; hex?: string; data?: string; label?: string; color?: string; fields?: DumpField[] };
export type MemoryDump = { base?: number | string; total?: number; endian?: 'little' | 'big'; allocations?: DumpAlloc[] };

export function toHexByte(n: number) { return n.toString(16).padStart(2, '0').toUpperCase(); }
export function hexFromBytes(bytes: number[]): string { return bytes.map(toHexByte).join(''); }
export function bytesFromHex(hex: string): number[] {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    const b = clean.slice(i, i + 2);
    out.push(b.length === 1 ? parseInt(b + '0', 16) : parseInt(b, 16));
  }
  return out;
}
export function tryBtoa(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
export function toUrlSafe(b64: string) { return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
export function buildMemoryUrl(dump: MemoryDump): string {
  const b64 = tryBtoa(JSON.stringify(dump));
  const safe = toUrlSafe(b64);
  const baseUrl = location.href.split('#')[0];
  return `${baseUrl}#/memory?data=${encodeURIComponent(safe)}`;
}
export function viewMemory(dump: MemoryDump) {
  location.hash = `#/memory?data=${encodeURIComponent(toUrlSafe(tryBtoa(JSON.stringify(dump))))}`;
}

// little-endian encode helpers
export function encodeIntLE(value: number, size: number): number[] {
  const out: number[] = [];
  let v = value >>> 0;
  // support negative via two's complement for size
  if (value < 0) {
    const mod = Math.pow(2, size * 8);
    v = (mod + value) % mod;
  }
  for (let i = 0; i < size; i++) {
    out.push(v & 0xff);
    v >>>= 8;
  }
  return out;
}
export function encodeIntBE(value: number, size: number): number[] {
  return encodeIntLE(value, size).reverse();
}

export function decodePreview(bytes: Uint8Array, off: number, size: number, endian: 'little' | 'big'): string {
  if (size <= 0 || off + size > bytes.length) return '—';
  let hex = '';
  for (let i = 0; i < size; i++) hex += toHexByte(bytes[off + i]) + ' ';
  return hex.trim();
}
