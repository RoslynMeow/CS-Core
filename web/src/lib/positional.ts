export function toDigitsLSB(n: number, base: number): number[] {
  if (n === 0) return [0];
  const d: number[] = [];
  let x = Math.abs(n);
  while (x > 0) { d.push(x % base); x = Math.floor(x / base); }
  return d;
}
export function fromDigitsLSB(digits: number[], base: number): number {
  let v = 0, p = 1;
  for (const d of digits) { v += d * p; p *= base; }
  return v;
}
export function formatMSB(digitsLSB: number[]): string {
  return digitsLSB.slice().reverse().join('');
}
export function digitValid(d: number, base: number) { return Number.isInteger(d) && d >= 0 && d < base; }
