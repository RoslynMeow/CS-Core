/** 算法状态数组面板 —— 画布下方实时展示存储数组（邻接表 / dist / prev / key / parent / uf / 内存布局 等）
 *  每一帧由模块把快照填进 scene.stateTables，此处渲染。
 *  数值行用真 <table style="table-layout:fixed"> + <colgroup> 固定每列等宽，强制按顶点列对齐，
 *  值再长（如 “B(5)”）也只被限在该列，不会把后面列挤飘。
 */

export type AlgoCellState = 0 | 1 | 2 | 3; // 0 默认 1 已确定/绿 2 候选/天蓝 3 当前/琥珀
export type AlgoStateRow =
  | {
      name: string;
      /** 顶点对齐的数值数组（dist / key / parent……）：每个 cell 对应一列（一个顶点） */
      cells: (string | number)[];
      /** 每列高亮态（缺省默认） */
      hl?: (AlgoCellState | null)[];
    }
  | {
      name: string;
      /** 整行文本（如邻接表：每顶点占一行整串）；不参与顶点分列 */
      text: string;
    };

export type AlgoTable = {
  title: string;
  /** 顶点标签列头（数值数组表专用）；缺省 = 纯文本行罗列 */
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

/** 渲染一张状态表（真 <table> 固定列宽，强制按列对齐） */
export function StateTable({ table }: { table: AlgoTable }) {
  const ncol = table.header?.length ?? 0;
  const colW = ncol <= 8 ? 44 : Math.max(28, Math.floor(360 / ncol));
  const headCell = (h: string, i: number) => (
    <td
      key={i}
      style={{
        width: colW,
        minWidth: colW,
        maxWidth: colW,
        textAlign: "center",
        fontSize: 12,
        fontWeight: 800,
        color: "#64748b",
        padding: "2px 6px",
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}
    >
      {h}
    </td>
  );
  return (
    <div
      style={{
        border: "1px solid #26324d",
        borderRadius: 12,
        background: "#101a30",
        padding: "12px 14px",
        minWidth: 180,
        maxWidth: "100%",
        overflow: "auto",
        flex: "1 1 320px",
      }}
    >
      <div
        style={{
          fontWeight: 800,
          fontSize: 13,
          color: "#a5b4fc",
          letterSpacing: ".03em",
          marginBottom: 6,
        }}
      >
        {table.title}
      </div>
      <table
        style={{
          borderCollapse: "collapse",
          tableLayout: "fixed",
          width: ncol ? `${44 + ncol * colW}px` : "100%",
        }}
      >
        <colgroup>
          <col style={{ width: 44 }} />
          {Array.from({ length: ncol }, (_, i) => (
            <col key={i} style={{ width: colW }} />
          ))}
        </colgroup>
        {ncol > 0 && (
          <thead>
            <tr>
              <td style={{ width: 44 }} />
              {table.header!.map((h, i) => headCell(h, i))}
            </tr>
          </thead>
        )}
        <tbody>
          {table.rows.map((r, ri) => (
            <tr key={ri}>
              <td
                style={{
                  width: 44,
                  fontSize: 13,
                  fontWeight: 800,
                  color: "#64748b",
                  whiteSpace: "nowrap",
                  padding: "4px 6px 4px 0",
                }}
              >
                {r.name}
              </td>
              {"cells" in r ? (
                r.cells.map((c, ci) => {
                  const st: AlgoCellState = r.hl?.[ci] ?? 0;
                  return (
                    <td
                      key={ci}
                      title={table.header?.[ci]}
                      style={{
                        width: colW,
                        minWidth: colW,
                        maxWidth: colW,
                        textAlign: "center",
                        fontSize: 13,
                        fontWeight: 700,
                        color: CELL_TEXT[st],
                        background: CELL_FILL[st],
                        borderRadius: 6,
                        padding: "4px 0",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                      }}
                    >
                      {c}
                    </td>
                  );
                })
              ) : (
                <td
                  colSpan={Math.max(1, ncol)}
                  style={{
                    fontSize: 11,
                    color: "#94a3b8",
                    fontWeight: 600,
                    padding: "2px 4px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {r.text}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
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