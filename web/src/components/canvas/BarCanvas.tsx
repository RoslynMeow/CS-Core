export function BarCanvas({ arr, hl }: { arr: number[]; hl?: Set<number> }) {
  const mx = Math.max(...arr, 1);
  return (
    <div className="bars">
      {arr.map((v, i) => (
        <div key={i} className={`bar ${hl?.has(i) ? 'hl' : ''}`} style={{ height: `${(v / mx) * 140 + 12}px` }} title={`${v}`}>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}
