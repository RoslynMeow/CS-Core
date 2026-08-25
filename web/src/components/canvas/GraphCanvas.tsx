export interface GraphScene { nodes: { id: number; label: string; x: number; y: number }[]; edges: [number, number][]; hl?: Set<number> }
export function GraphCanvas({ scene }: { scene: GraphScene }) {
  return (
    <svg viewBox="0 0 400 260" className="graph">
      {scene.edges.map(([a, b], i) => {
        const na = scene.nodes.find(n => n.id === a)!; const nb = scene.nodes.find(n => n.id === b)!;
        return <line key={i} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} stroke="#94a3b8" strokeWidth={2} />;
      })}
      {scene.nodes.map(n => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={18} fill={scene.hl?.has(n.id) ? '#3b82f6' : '#fff'} stroke="#334155" strokeWidth={2} />
          <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize="12" fontWeight={700}>{n.label}</text>
        </g>
      ))}
    </svg>
  );
}
