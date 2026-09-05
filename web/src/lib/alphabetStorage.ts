export interface StoredAlphabet {
  glyphs: (string | null)[]; // length 64, index = value 0..63
  updatedAt: number;
}
const GLOBAL_KEY = 'custom-alphabet:global';
const SIZE = 64;

export function loadGlobal(): StoredAlphabet | null {
  try {
    const raw = localStorage.getItem(GLOBAL_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as StoredAlphabet;
    if (!Array.isArray(obj.glyphs) || obj.glyphs.length !== SIZE) return null;
    return obj;
  } catch { return null; }
}

export function saveGlobal(glyphs: (string | null)[]) {
  const arr = Array(SIZE).fill(null) as (string | null)[];
  for (let i = 0; i < SIZE && i < glyphs.length; i++) arr[i] = glyphs[i];
  localStorage.setItem(GLOBAL_KEY, JSON.stringify({ glyphs: arr, updatedAt: Date.now() } as StoredAlphabet));
}

export function clearGlobal() { localStorage.removeItem(GLOBAL_KEY); }

// 兼容旧 per-base 键，迁移一次
export function migrateIfNeeded() {
  if (loadGlobal()) return;
  const bases = [2, 8, 10, 16, 36, 64];
  const merged: (string | null)[] = Array(SIZE).fill(null);
  let found = false;
  for (const b of bases) {
    try {
      const raw = localStorage.getItem(`custom-alphabet:${b}`);
      if (!raw) continue;
      const obj = JSON.parse(raw) as { glyphs: (string | null)[] };
      if (!Array.isArray(obj.glyphs)) continue;
      for (let i = 0; i < b && i < obj.glyphs.length; i++) if (obj.glyphs[i] && !merged[i]) { merged[i] = obj.glyphs[i]; found = true; }
    } catch {}
  }
  if (found) saveGlobal(merged);
}

// helpers for teaching
export function glyphForValue(v: number): string | null {
  const g = loadGlobal();
  return g?.glyphs[v] ?? null;
}
export function hasAnyCustomForBase(base: number): boolean {
  const g = loadGlobal();
  if (!g) return false;
  for (let i = 0; i < base; i++) if (g.glyphs[i]) return true;
  return false;
}
