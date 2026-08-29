import type { GraphAlgoScene } from "../../lib/graph";

/** 图/树共用的渲染场景：库的算法步进 + 位置/边信息，喂给 GraphCanvas */
export type GraphCanvasScene = GraphAlgoScene & {
    nodes: { id: number; label: string; x: number; y: number }[];
    edges: { u: number; v: number; weight?: number }[];
    directed?: boolean;
    root?: number | null;
    annotate?: Record<number, string>; // 节点下方小字（如 dist / key / bf）
    edgeLabels?: Record<string, string>; // `${u}-${v}` → 'L' | 'R' 等边标注
};

const W = 760,
    H = 440,
    R = 17;

export function GraphCanvas({
    scene,
    width = W,
    height = H,
}: {
    scene: GraphCanvasScene;
    width?: number;
    height?: number;
}) {
    const { nodes, edges, directed = false } = scene;
    if (nodes.length === 0) return <div className="empty">空 · Empty</div>;
    const pos = new Map(nodes.map((n) => [n.id, n]));
    const edgePos = (u: number, v: number) => {
        const a = pos.get(u),
            b = pos.get(v);
        if (!a || !b) return null;
        const dx = b.x - a.x,
            dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len,
            uy = dy / len;
        return {
            ax: a.x + ux * (R + 4),
            ay: a.y + uy * (R + 4),
            bx: b.x - ux * (R + 4),
            by: b.y - uy * (R + 4),
            mx: (a.x + b.x) / 2,
            my: (a.y + b.y) / 2,
        };
    };
    const isAlgoEdge = (u: number, v: number) =>
        !!scene.edge &&
        ((scene.edge![0] === u && scene.edge![1] === v) ||
            (!directed && scene.edge![0] === v && scene.edge![1] === u));
    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            width={width}
            height={height}
            style={{ width: "100%", height: "auto", display: "block" }}
        >
            {edges.map((e, i) => {
                const p = edgePos(e.u, e.v);
                if (!p) return null;
                const active = isAlgoEdge(e.u, e.v);
                const stroke = active ? "#f59e0b" : "#94a3b8";
                const sw = active ? 3 : 1.6;
                const ang =
                    (Math.atan2(p.by - p.ay, p.bx - p.ax) * 180) / Math.PI;
                const elb = scene.edgeLabels?.[`${e.u}-${e.v}`];
                return (
                    <g key={i}>
                        <line
                            x1={p.ax}
                            y1={p.ay}
                            x2={p.bx}
                            y2={p.by}
                            stroke={stroke}
                            strokeWidth={sw}
                        />
                        {directed && (
                            <polygon
                                points={`${p.bx},${p.by} ${p.bx - 9},${p.by - 3.5} ${p.bx - 9},${p.by + 3.5}`}
                                fill={stroke}
                                transform={`rotate(${ang} ${p.bx} ${p.by})`}
                            />
                        )}
                        {e.weight !== undefined && e.weight !== 1 && (
                            <g>
                                <circle
                                    cx={p.mx}
                                    cy={p.my}
                                    r={9}
                                    fill="#0f172a"
                                />
                                <text
                                    x={p.mx}
                                    y={p.my + 3}
                                    textAnchor="middle"
                                    fontSize={10}
                                    fontWeight={800}
                                    fill="#fff"
                                >
                                    {e.weight}
                                </text>
                            </g>
                        )}
                        {elb && (
                            <text
                                x={p.mx}
                                y={p.my - 6}
                                textAnchor="middle"
                                fontSize={10}
                                fontWeight={800}
                                fill="#64748b"
                            >
                                {elb}
                            </text>
                        )}
                    </g>
                );
            })}
            {nodes.map((n) => {
                const isCurrent = scene.current === n.id;
                const isExp = scene.exploring === n.id;
                const isVis = scene.visited.includes(n.id);
                const isFr = scene.frontier.includes(n.id);
                const isRoot = scene.root === n.id;
                const isAlgo = isCurrent || isExp || isVis || isFr;
                const fill = isCurrent
                    ? "#4f46e5"
                    : isExp
                      ? "#f59e0b"
                      : isVis
                        ? "#10b981"
                        : isFr
                          ? "#38bdf8"
                          : "#fff";
                const stroke = isCurrent
                    ? "#312e81"
                    : isExp
                      ? "#b45309"
                      : isVis
                        ? "#059669"
                        : isFr
                          ? "#0284c7"
                          : isRoot
                            ? "#dc2626"
                            : "#6366f1";
                const sw = isCurrent || isExp ? 3 : isRoot ? 2.4 : 1.4;
                const labelColor = isAlgo ? "#fff" : "#1e293b";
                const orderIdx = scene.order.indexOf(n.id);
                const ann = scene.annotate?.[n.id];
                return (
                    <g key={n.id}>
                        <circle
                            cx={n.x}
                            cy={n.y}
                            r={R}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={sw}
                        />
                        <text
                            x={n.x}
                            y={n.y + 4}
                            textAnchor="middle"
                            fontSize={11}
                            fontWeight={700}
                            fill={labelColor}
                        >
                            {n.label}
                        </text>
                        {isRoot && (
                            <text
                                x={n.x}
                                y={n.y - R - 3}
                                textAnchor="middle"
                                fontSize={9}
                                fontWeight={800}
                                fill="#dc2626"
                            >
                                根
                            </text>
                        )}
                        {orderIdx >= 0 && (
                            <text
                                x={n.x + R - 2}
                                y={n.y - R + 2}
                                fontSize={9}
                                fontWeight={800}
                                fill={isCurrent ? "#e0e7ff" : "#475569"}
                            >
                                {orderIdx + 1}
                            </text>
                        )}
                        {ann !== undefined && (
                            <text
                                x={n.x}
                                y={n.y + R + 12}
                                textAnchor="middle"
                                fontSize={9}
                                fontWeight={700}
                                fill="#64748b"
                            >
                                {ann}
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
export default GraphCanvas;
