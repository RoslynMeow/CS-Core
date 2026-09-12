/**
 * 电路通用库 · 数值工程记数格式化（µ/m/k/M…）
 */

const PREFIXES: { e: number; p: string }[] = [
  { e: -9, p: 'n' },
  { e: -6, p: 'µ' },
  { e: -3, p: 'm' },
  { e: 0, p: '' },
  { e: 3, p: 'k' },
  { e: 6, p: 'M' },
  { e: 9, p: 'G' },
];

/** 将数值按工程前缀格式化为 `1.5kΩ` 这类字符串 */
export function formatValue(v: number, unit: string, sig = 3): string {
  if (!Number.isFinite(v)) return `—${unit}`;
  if (v === 0) return `0${unit}`;
  const abs = Math.abs(v);
  let chosen = PREFIXES[0];
  for (const pr of PREFIXES) {
    if (abs >= 10 ** pr.e) chosen = pr;
  }
  const scaled = v / 10 ** chosen.e;
  const s = Number(scaled.toPrecision(sig)).toString();
  return `${s}${chosen.p}${unit}`;
}
