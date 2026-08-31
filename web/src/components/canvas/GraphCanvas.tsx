import type { GraphAlgoScene } from "../../lib/graph";
import type { Text } from "../../i18n/lang";

/** 图/树共用的渲染场景：库的算法步进 + 位置/边信息，喂给 GraphCanvas */
export type GraphCanvasScene = GraphAlgoScene & {
    nodes: {
        id: number;
        label: string;
        x: number;
        y: number;
        /** 已从“上一棵树（输入树）”拆走的节点：空心 + 虚线描边（AVL/BST 建树双面板） */
        hollow?: boolean;
        /** 飞入动画起点（输入树坐标）：新节点从输入树“飞”到正在建立的树 */
        fly?: { x: number; y: number };
        /** 货架节点（B树/B+树）：多键一行排列；设置了 keys 时 label 不渲染（由 keys 渲染） */
        keys?: (string | number)[];
    }[];
    edges: {
        u: number;
        v: number;
        weight?: number;
        beam?: boolean;
        /** 虚线边（B+树叶子兄弟链等结构示意） */
        dashed?: boolean;
    }[];
    directed?: boolean;
    root?: number | null;
    annotate?: Record<number, string>; // 节点下方小字（如 dist / key / bf）
    edgeLabels?: Record<string, string>; // `${u}-${v}` → 'L' | 'R' 等边标注
    blurred?: boolean; // 虚化预览：已选“从图创建导入”且未确认（点击画布导入）
    error?: string; // 图不符合当前要求的原因（Render 显示红色横幅 + 去图创建）
    warn?: Text; // 黄条警告（如退化链/偏斜树提示）
    tone?: Record<number, number>; // 彩色树：节点类别配色索引（0=红 1=蓝 2=黄 3=灰 4=黑），fill 固定用 TONE_FILL
    /** 双面板建树（AVL/BST）：左右面板标题（左=随机生成的输入树，右=正在建立的树）；GraphCanvas 需传 t 才渲染 */
    panel?: { left?: Text; right?: Text };
};

const W = 760,
    H = 440,
    R = 17;

/** 节点类别配色（彩色树 tone 的角色着色）：索引 → 填充色 / 标签色
 *  0=红（根/红黑树红节点） 1=蓝 2=黄 3=灰 4=黑（红黑树黑节点） */
export const TONE_FILL = [
    "#dc2626",
    "#4f46e5",
    "#eab308",
    "#64748b",
    "#1e293b",
];
export const TONE_LABEL = ["#fff", "#fff", "#1e293b", "#fff", "#fff"];
/** 彩色树（tone）下算法高亮的“圆环”颜色：fill 保持角色色，不再被算法色覆盖 */
export const HL_RING = {
    current: "#f59e0b",
    exploring: "#f97316",
    visited: "#059669",
    frontier: "#0284c7",
} as const;

/** 货架节点（B树/B+树）：一行多键；宽随键数增长（封顶防溢出画布），高固定 */
export const KEYS_BOX_W = (k: number) =>
    Math.min(170, Math.max(34, 16 + k * 30));
export const KEYS_BOX_H = 34;

export function GraphCanvas({
    scene,
    width = W,
    height = H,
    hint,
    onClick,
    notice,
    selected,
    onNodeClick,
    t,
}: {
    scene: GraphCanvasScene;
    width?: number;
    height?: number;
    hint?: string;
    onClick?: () => void;
    notice?: React.ReactNode;
    /** 当前被选中的节点 id（画虚线环） */
    selected?: number | null;
    /** 点击节点回调（虚化预览时被忽略，由整张画布负责“点击导入”） */
    onNodeClick?: (id: number) => void;
    /** i18n：渲染 scene.panel 双面板标题（AVL/BST 建树动画） */
    t?: (x: Text) => string;
}) {
    const { nodes, edges, directed = false } = scene;
    const pos = new Map(nodes.map((n) => [n.id, n]));
    // 端点偏移量：圆=R+4；货架(box)节点按射线与矩形求交（矩形半宽/半高）
    const nodeOffset = (
        n: { keys?: (string | number)[] },
        ux: number,
        uy: number,
    ) => {
        if (n.keys && n.keys.length > 0) {
            const w = KEYS_BOX_W(n.keys.length);
            const h = KEYS_BOX_H;
            const t = Math.min(
                (w / 2 + 2) / Math.max(Math.abs(ux), 1e-9),
                (h / 2 + 2) / Math.max(Math.abs(uy), 1e-9),
            );
            return { x: ux * t, y: uy * t };
        }
        return { x: ux * (R + 4), y: uy * (R + 4) };
    };
    const edgePos = (u: number, v: number) => {
        const a = pos.get(u),
            b = pos.get(v);
        if (!a || !b) return null;
        const dx = b.x - a.x,
            dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len,
            uy = dy / len;
        const oa = nodeOffset(a, ux, uy);
        const ob = nodeOffset(b, -ux, -uy);
        return {
            ax: a.x + oa.x,
            ay: a.y + oa.y,
            bx: b.x - ob.x,
            by: b.y - ob.y,
            mx: (a.x + b.x) / 2,
            my: (a.y + b.y) / 2,
        };
    };
    const isAlgoEdge = (u: number, v: number) =>
        !!scene.edge &&
        ((scene.edge![0] === u && scene.edge![1] === v) ||
            (!directed && scene.edge![0] === v && scene.edge![1] === u));
    const inner =
        nodes.length === 0 ? (
            <div className="empty">空 · Empty</div>
        ) : (
            <svg
                viewBox={`0 0 ${W} ${H}`}
                width={width}
                height={height}
                style={{ width: "100%", height: "auto", display: "block" }}
            >
                {/* 双面板建树（AVL/BST）：左=输入树，右=正在建立的树；中缝 + 面板标题 */}
                {scene.panel && t && (
                    <g>
                        <line
                            x1={380}
                            y1={40}
                            x2={380}
                            y2={424}
                            stroke="#e2e8f0"
                            strokeWidth={1.5}
                        />
                        {scene.panel.left && (
                            <text
                                x={192}
                                y={19}
                                textAnchor="middle"
                                fontSize={12}
                                fontWeight={800}
                                fill="#475569"
                            >
                                {t(scene.panel.left)}
                            </text>
                        )}
                        {scene.panel.right && (
                            <text
                                x={568}
                                y={19}
                                textAnchor="middle"
                                fontSize={12}
                                fontWeight={800}
                                fill="#475569"
                            >
                                {t(scene.panel.right)}
                            </text>
                        )}
                    </g>
                )}
                {edges.map((e, i) => {
                    const p = edgePos(e.u, e.v);
                    if (!p) return null;
                    if (e.beam) {
                        // 光束：被拆节点（左）→ 新节点（右），流动虚线“送”节点过去
                        return (
                            <g key={i}>
                                <line
                                    x1={p.ax}
                                    y1={p.ay}
                                    x2={p.bx}
                                    y2={p.by}
                                    stroke="#f59e0b"
                                    strokeWidth={2.5}
                                    strokeDasharray="6 6"
                                    className="tree-beam"
                                />
                            </g>
                        );
                    }
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
                                strokeDasharray={
                                    e.dashed && !active ? "4 4" : undefined
                                }
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
                    const hollow = !!n.hollow;
                    const isCurrent = scene.current === n.id;
                    const isExp = scene.exploring === n.id;
                    const isVis = scene.visited.includes(n.id);
                    const isFr = scene.frontier.includes(n.id);
                    const isRoot = scene.root === n.id;
                    const isAlgo = isCurrent || isExp || isVis || isFr;
                    const boxKeys =
                        n.keys !== undefined && n.keys.length > 0
                            ? n.keys
                            : null;
                    const boxW = boxKeys ? KEYS_BOX_W(boxKeys.length) : 0;
                    const cellW = boxKeys ? boxW / boxKeys.length : 0;
                    const tone = scene.tone?.[n.id];
                    const toneMode =
                        scene.tone !== undefined && tone !== undefined;
                    const fill = toneMode
                        ? (TONE_FILL[tone] ?? "#fff")
                        : hollow
                          ? "#f8fafc"
                          : isCurrent
                            ? "#4f46e5"
                            : isExp
                              ? "#f59e0b"
                              : isVis
                                ? "#10b981"
                                : isFr
                                  ? "#38bdf8"
                                  : "#fff";
                    const stroke = hollow
                        ? "#94a3b8"
                        : isCurrent
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
                    const sw =
                        isCurrent || isExp
                            ? 3
                            : isRoot
                              ? 2.4
                              : hollow
                                ? 1.2
                                : 1.4;
                    const labelColor = toneMode
                        ? (TONE_LABEL[tone] ?? "#fff")
                        : hollow
                          ? "#94a3b8"
                          : isAlgo
                            ? "#fff"
                            : "#1e293b";
                    const ringColor = isCurrent
                        ? HL_RING.current
                        : isExp
                          ? HL_RING.exploring
                          : isVis
                            ? HL_RING.visited
                            : isFr
                              ? HL_RING.frontier
                              : null;
                    const orderIdx = scene.order.indexOf(n.id);
                    const ann = scene.annotate?.[n.id];
                    // 飞入动画：起点 = 输入树中的位置（--fx/--fy 是平移偏移量，CSS 动画平移到原位）
                    const flyStyle = n.fly
                        ? ({
                              "--fx": `${n.fly.x - n.x}px`,
                              "--fy": `${n.fly.y - n.y}px`,
                          } as React.CSSProperties)
                        : undefined;
                    const topGap = boxKeys ? KEYS_BOX_H / 2 : R;
                    // 预计算三种状态的外圈（货架用矩形、圆用圆环），避免在 JSX 里内联 `{cond ? (` 三元
                    const shapeBody = boxKeys ? (
                        <g>
                            <rect
                                x={n.x - boxW / 2}
                                y={n.y - KEYS_BOX_H / 2}
                                width={boxW}
                                height={KEYS_BOX_H}
                                rx={8}
                                fill={fill}
                                stroke={stroke}
                                strokeWidth={sw}
                                strokeDasharray={
                                    hollow ? "4 3" : undefined
                                }
                            />
                            {boxKeys.map((k, i) => (
                                <g key={i}>
                                    {i > 0 && (
                                        <line
                                            x1={n.x - boxW / 2 + i * cellW}
                                            y1={n.y - KEYS_BOX_H / 2 + 6}
                                            x2={n.x - boxW / 2 + i * cellW}
                                            y2={n.y + KEYS_BOX_H / 2 - 6}
                                            stroke={
                                                hollow
                                                    ? "#cbd5e1"
                                                    : "#94a3b8"
                                            }
                                            strokeWidth={1}
                                        />
                                    )}
                                    <text
                                        x={
                                            n.x -
                                            boxW / 2 +
                                            i * cellW +
                                            cellW / 2
                                        }
                                        y={n.y + 4}
                                        textAnchor="middle"
                                        fontSize={11}
                                        fontWeight={700}
                                        fill={labelColor}
                                    >
                                        {String(k)}
                                    </text>
                                </g>
                            ))}
                        </g>
                    ) : (
                        <circle
                            cx={n.x}
                            cy={n.y}
                            r={R}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={sw}
                            strokeDasharray={hollow ? "4 3" : undefined}
                        />
                    );
                    const ringBody =
                        toneMode && ringColor ? (
                            boxKeys ? (
                                <rect
                                    x={n.x - boxW / 2 - 3}
                                    y={n.y - KEYS_BOX_H / 2 - 3}
                                    width={boxW + 6}
                                    height={KEYS_BOX_H + 6}
                                    rx={11}
                                    fill="none"
                                    stroke={ringColor}
                                    strokeWidth={
                                        isCurrent || isExp ? 3.5 : 2.5
                                    }
                                />
                            ) : (
                                <circle
                                    cx={n.x}
                                    cy={n.y}
                                    r={R + (isCurrent || isExp ? 5 : 4)}
                                    fill="none"
                                    stroke={ringColor}
                                    strokeWidth={
                                        isCurrent || isExp ? 3.5 : 2.5
                                    }
                                />
                            )
                        ) : null;
                    const selBody =
                        selected === n.id ? (
                            boxKeys ? (
                                <rect
                                    x={n.x - boxW / 2 - 4}
                                    y={n.y - KEYS_BOX_H / 2 - 4}
                                    width={boxW + 8}
                                    height={KEYS_BOX_H + 8}
                                    rx={13}
                                    fill="none"
                                    stroke="#7c3aed"
                                    strokeWidth={2.5}
                                    strokeDasharray="5 4"
                                />
                            ) : (
                                <circle
                                    cx={n.x}
                                    cy={n.y}
                                    r={R + 7}
                                    fill="none"
                                    stroke="#7c3aed"
                                    strokeWidth={2.5}
                                    strokeDasharray="5 4"
                                />
                            )
                        ) : null;
                    return (
                        <g
                            key={n.id}
                            onClick={(e) => {
                                if (scene.blurred) return; // 虚化预览：交给外层“点击画布导入”
                                e.stopPropagation();
                                onNodeClick?.(n.id);
                            }}
                            style={{
                                cursor:
                                    onNodeClick && !scene.blurred
                                        ? "pointer"
                                        : undefined,
                                opacity: hollow ? 0.72 : undefined,
                            }}
                        >
                            <g
                                className={n.fly ? "tree-fly" : undefined}
                                style={flyStyle}
                            >
                                {shapeBody}
                                {/* 彩色树（tone）下算法高亮用圆环表示，保持角色色与图例一致 */}
                                {ringBody}
                                {!boxKeys && (
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
                                )}
                                {isRoot && (
                                    <text
                                        x={n.x}
                                        y={n.y - topGap - 3}
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
                                        x={n.x + (boxKeys ? boxW / 2 : R) - 2}
                                        y={n.y - topGap + 2}
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
                                        y={n.y + topGap + 12}
                                        textAnchor="middle"
                                        fontSize={9}
                                        fontWeight={700}
                                        fill="#64748b"
                                    >
                                        {ann}
                                    </text>
                                )}
                                {/* 被点击选中：紫色虚线环 */}
                                {selBody}
                            </g>
                        </g>
                    );
                })}
            </svg>
        );
    if (!scene.blurred && !hint && !notice) return inner;
    return (
        <div
            style={{
                position: "relative",
                cursor: onClick ? "pointer" : undefined,
            }}
            onClick={onClick}
        >
            <div
                style={
                    scene.blurred
                        ? {
                              filter: "blur(6px) saturate(0.7)",
                              opacity: 0.55,
                              pointerEvents: "none",
                              userSelect: "none",
                          }
                        : undefined
                }
            >
                {inner}
            </div>
            {hint && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                    }}
                >
                    <span
                        style={{
                            background: "rgba(15, 23, 42, 0.82)",
                            color: "#fff",
                            border: "1px solid rgba(165, 180, 252, 0.55)",
                            padding: "10px 18px",
                            borderRadius: 999,
                            fontSize: 13,
                            fontWeight: 800,
                            letterSpacing: ".02em",
                            boxShadow: "0 6px 24px rgba(2, 6, 23, 0.4)",
                        }}
                    >
                        {hint}
                    </span>
                </div>
            )}
            {notice && (
                <div
                    style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 12,
                        display: "flex",
                        justifyContent: "center",
                        pointerEvents: "none",
                    }}
                >
                    <div
                        style={{
                            pointerEvents: "auto",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 10,
                            flexWrap: "wrap",
                            background: "#fef2f2",
                            border: "1px solid #fecaca",
                            color: "#b91c1c",
                            padding: "8px 14px",
                            borderRadius: 12,
                            fontSize: 13,
                            fontWeight: 700,
                            boxShadow: "0 6px 24px rgba(127, 29, 29, 0.18)",
                            maxWidth: "92%",
                        }}
                    >
                        {notice}
                    </div>
                </div>
            )}
        </div>
    );
}
export default GraphCanvas;