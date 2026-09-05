export interface TreeNode { val: number | string; left?: TreeNode; right?: TreeNode }
function layout(root: TreeNode | null, x = 200, y = 30, dx = 80, lvl = 0): { nodes: { x: number; y: number; val: string }[]; edges: [number, number][] } {
  const nodes: { x: number; y: number; val: string }[] = [];
  const edges: [number, number][] = [];
  function dfs(n: TreeNode | null, cx: number, cy: number, d: number): number | null {
    if (!n) return null;
    const idx = nodes.length; nodes.push({ x: cx, y: cy, val: String(n.val) });
    if (n.left) { const c = dfs(n.left, cx - d, cy + 56, d * 0.55); if (c !== null) edges.push([idx, c]); }
    if (n.right) { const c = dfs(n.right, cx + d, cy + 56, d * 0.55); if (c !== null) edges.push([idx, c]); }
    return idx;
  }
  dfs(root, x, y, dx);
  return { nodes, edges };
}
export function TreeCanvas({ root, hl }: { root: TreeNode | null; hl?: Set<string> }) {
  const { nodes, edges } = layout(root);
  if (!root) return <div className="empty">空树 · Empty</div>;
  return (
    <svg viewBox="0 0 400 260" className="tree">
      {edges.map(([a, b], i) => <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke="#94a3b8" strokeWidth={1.5} />)}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={16} fill={hl?.has(n.val) ? '#22c55e' : '#fff'} stroke="#334155" strokeWidth={1.5} />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="11" fontWeight={700}>{n.val}</text>
        </g>
      ))}
    </svg>
  );
}
