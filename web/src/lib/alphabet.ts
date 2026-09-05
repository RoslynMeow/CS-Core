export const DEFAULT_ALPHABETS: Record<number, string[]> = {
  2: '01'.split(''),
  8: '01234567'.split(''),
  10: '0123456789'.split(''),
  16: '0123456789ABCDEF'.split(''),
  36: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  64: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split(''),
};

export function defaultAlphabet(base: number): string[] {
  if (DEFAULT_ALPHABETS[base]) return DEFAULT_ALPHABETS[base];
  // fallback: 0-9A-Z slice
  const pool = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/'.split('');
  return pool.slice(0, base);
}

export const PRESET_BASES = [2, 8, 10, 16, 36, 64];
