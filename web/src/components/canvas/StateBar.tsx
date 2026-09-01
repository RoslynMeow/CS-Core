/** 算法状态数组面板 —— 画布下方实时展示存储数组（邻接表 / dist / prev / key / parent / uf 等）
 *  每一帧由模块把快照填进 scene.arrays，此处渲染为紧凑表格。
 */

export type AlgoCellState = 0 | 1 | 2 | 3; // 0 默认 1 已确定/绿 2 候选/天蓝 3 当前/琥珀
export type AlgoStateRow =
  | {
      name: string;
      /** 顶点对齐的数值数组（dist / key / parent……）：每个 cell 对应一个顶点 */
      cells: (string | number)[];
      /** 每列高亮态（-1/none 不标）；长度可与 cells 不同（缺省默认） */
      hl?: (AlgoCellState | null)[];
    }
  | {
      name: string;
      /** 整行文本（如邻接表：v 的邻居串）；不按顶点分列 */
      text: string;
    };

export type AlgoTable = {
  title: string;
  /** 顶点标签列头（数值数组表专用） */
  header?: string[];
  rows: AlgoStateRow[];
};

const CELL_FILL: Record<AlgoCellState, string> = {
  0: "transparent",
  1: "rgba(16,185,129,0.15)",
  2: "rgba(56,189,248,0.15)",
  3: "rgba(245,158,11,0.2)",
};
const CELL_TEXT: Record<AlgoCellState, string> = {
  0: "#cbd5e1",
  1: "#34d399",
  2: "#7dd3fc",
  3: "#fbbf24",
};

/** 渲染一张状态表（标题 + 可选顶点列头 + 若干行） */
export function StateTable({ table }: { table: AlgoTable }) {
  return (
    <div
      style={{
        border: "1px solid #26324d",
        borderRadius: 10,
        background: "#101a30",
        padding: "8px 10px",
        minWidth: 150,
      }}
    >
      <div
        style={{
          fontWeight: 800,
          fontSize: 11,
          color: "#a5b4fc",
          letterSpacing: ".03em",
          marginBottom: 4,
        }}
      >
        {table.title}
      </div>
      {table.rows.map((r, ri) => {
        const pad = () => (
          <span
            key={-ri}
            style={{
              display: "inline-block",
              minWidth: 30,
              color: "#64748b",
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            {r.name}
          </span>
        );
        if ("text" in r) {
          return (
            <div
              key={ri}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                color: "#cbd5e1",
                padding: "2px 0",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {pad()}
              <span style={{ color: "#94a3b8", fontWeight: 600 }}>
                {r.text}
              </span>
            </div>
          );
        }
        return (
          <div
            key={ri}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              padding: "2px 0",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {pad()}
            {r.cells.map((c, ci) => {
              const st: AlgoCellState = r.hl?.[ci] ?? 0;
              return (
                <span
                  key={ci}
                  title={table.header?.[ci]}
                  style={{
                    display: "inline-block",
                    minWidth: 28,
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: CELL_TEXT[st],
                    background: CELL_FILL[st],
                    borderRadius: 4,
                    padding: "1px 3px",
                    margin: "0 1px",
                  }}
                >
                  {c}
                </span>
              );
            })}
          </div>
        );
      })}
      {table.header && (
        <div
          style={{
            display: "flex",
            gap: 0,
            alignItems: "center",
            borderTop: "1px dashed #1e293b",
            marginTop: 4,
            paddingTop: 3,
          }}
        >
          <span style={{ minWidth: 30 }} />
          {table.header.map((h, i) => (
            <span
              key={i}
              style={{
                display: "inline-block",
                minWidth: 28,
                textAlign: "center",
                fontSize: 10,
                fontWeight: 800,
                color: "#64748b",
              }}
            >
              {h}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** 状态数组面板：横向排布多张表 */
export function StateBar({ tables }: { tables?: AlgoTable[] }) {
  if (!tables || tables.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "flex-start",
        padding: "10px 2px 2px",
        width: "100%",
      }}
    >
      {tables.map((t, i) => (
        <StateTable key={i} table={t} />
      ))}
    </div>
  );
}