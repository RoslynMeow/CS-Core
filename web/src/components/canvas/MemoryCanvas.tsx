export interface MemCell { label: string; addr: string; value: string; hl?: boolean }
export function MemoryCanvas({ cells }: { cells: MemCell[] }) {
  return (
    <div className="mem">
      {cells.map((c, i) => (
        <div key={i} className={`cell ${c.hl ? 'hl' : ''}`}>
          <div className="cell-addr">{c.addr}</div>
          <div className="cell-val">{c.value}</div>
          <div className="cell-label">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
