import type { Text } from "../i18n/lang";
import { Pseudocode } from "./Pseudocode";
import { StateBar, type AlgoTable } from "./canvas/StateBar";
import { Graph, buildGraphDump } from "../lib/graph";
import { buildMemoryUrl } from "../lib/memoryDump";
import { MathText } from "../lib/tex";

/**
 * 图章节通用模板（可复用）
 * 左列：上 画布（传入的编辑器/播放画布） + 下 内存表示（邻接表/矩阵/parent/边集）
 * 右列：上 伪代码 + 下 算法内存（Visit/dist 等）
 */
export function GraphChapterTemplate({
  leftTop,
  g,
  rightTopCode,
  rightTopActive,
  algoTables,
  isZh,
}: {
  leftTop: React.ReactNode;
  g: Graph | null;
  rightTopCode: Text[];
  rightTopActive?: number;
  algoTables?: AlgoTable[];
  isZh: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 10, flex: 1, minHeight: 0, width: "100%" }}>
      {/* 左列 */}
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 340, border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column" }}>
          {leftTop}
        </div>
        <div style={{ height: 220, flexShrink: 0, border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column" }}>
          <MemoryReprPanel g={g} isZh={isZh} />
        </div>
      </div>
      {/* 右列 */}
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 340, border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          <Pseudocode code={rightTopCode} active={rightTopActive} />
        </div>
        <div style={{ height: 220, flexShrink: 0, border: "1px solid #fde68a", borderRadius: 12, overflow: "hidden", background: "#fffbeb", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 800, color: "#92400e", borderBottom: "1px solid #fde68a", display: "flex", alignItems: "center", gap: 8 }}>
            <span>{isZh ? "算法内存" : "Algo Memory"}</span>
            <span style={{ fontSize: 10, color: "#b45309", fontWeight: 600 }}>{isZh ? "· 随伪代码联动" : "· synced with line"}</span>
            <a href="#/memory" style={{ marginLeft: "auto", fontSize: 11, color: "#92400e", textDecoration: "underline" }}>{isZh ? "跳转内存可视化 ↗" : "Memory ↗"}</a>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 6 }}>
            {algoTables && algoTables.length > 0 ? <StateBar tables={algoTables} /> : <div style={{ fontSize: 12, color: "#92400e", padding: 12 }}>{isZh ? "当前算法无额外内存（或首帧）" : "No extra memory for this step"}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function MemoryReprPanel({ g, isZh }: { g: Graph | null; isZh: boolean }) {
  const [repr, setRepr] = useState<"adjlist" | "adjmat" | "array" | "edges">("adjlist");
  const content = (() => {
    if (!g) return <div style={{ fontSize: 12, color: "#64748b", padding: 12 }}>{isZh ? "空图" : "empty"}</div>;
    const base = 0x555555559800;
    const addr = (i: number) => `0x${(base + i * 0x10).toString(16)}`;
    const cell = (v: string, color = "#6366f1", note = "", addrS?: string) => (
      <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 1, margin: 2 }}>
        <div style={{ minWidth: 46, textAlign: "center", padding: "4px 6px", borderRadius: 8, background: "#fff", border: `1.5px solid ${color}`, fontSize: 12, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" }}>{v}</div>
        {addrS && <div style={{ fontFamily: "monospace", fontSize: 8, color: "#94a3b8" }}>{addrS}</div>}
        {note && <div style={{ fontSize: 9, color: "#64748b" }}>{note}</div>}
      </div>
    );
    if (repr === "adjmat") {
      const mat = g.mat();
      return (
        <div style={{ overflow: "auto", padding: 4 }}>
          <table style={{ borderCollapse: "separate", borderSpacing: "1px 2px", tableLayout: "fixed" }}>
            <thead><tr><th style={{ width: 26 }} />{g.labels.map((l, i) => <th key={i} style={{ width: 36, fontSize: 10, color: "#64748b" }}>{l}</th>)}</tr></thead>
            <tbody>{mat.map((row, r) => <tr key={r}><td style={{ fontSize: 10, color: "#64748b", textAlign: "center" }}>{g.labels[r]}</td>{row.map((w, c) => <td key={c} style={{ height: 28, textAlign: "center", fontSize: 11, fontFamily: "monospace", background: w === null ? "#f8fafc" : "#4f46e5", color: w === null ? "#cbd5e1" : "#fff", borderRadius: 6 }}>{w === null ? "·" : w}</td>)}</tr>)}</tbody>
          </table>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}><MathText text={"邻接矩阵 · $M[i][j]=w$"} /></div>
        </div>
      );
    }
    if (repr === "edges") {
      return <div style={{ display: "flex", flexWrap: "wrap", padding: 4 }}>{g.edges.map((e, i) => <div key={i} style={{ display: "inline-flex", alignItems: "center", margin: 2 }}>{cell(g.labels[e.u], "#6366f1", "", addr(i * 2))}<span style={{ margin: "0 2px" }}>—</span>{cell(g.labels[e.v], "#0ea5e9", "", addr(i * 2 + 1))}{e.weight !== undefined && e.weight !== 1 && <span style={{ fontSize: 10, color: "#f59e0b", marginLeft: 3 }}>w:{e.weight}</span>}</div>)}</div>;
    }
    if (repr === "array") {
      const root = 0;
      const parent = g.bfs(root).parent;
      return <div style={{ display: "flex", flexWrap: "wrap", padding: 4 }}>{g.labels.map((l, i) => <div key={i} style={{ margin: 2 }}>{cell(i === root ? "−1" : String(parent[i]), i === root ? "#dc2626" : "#10b981", l, addr(i))}</div>)}<div style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>parent[i] · 根=−1</div></div>;
    }
    const adj = g.adj();
    return <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: 4 }}>{adj.map((neighbors, u) => <div key={u} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><div style={{ fontSize: 10, fontWeight: 800, color: "#475569" }}>{g.labels[u]}</div><div style={{ display: "flex", alignItems: "center", gap: 1 }}>{cell(g.labels[u], "#6366f1", "head", addr(u))}{neighbors.map(([v], j) => <span key={j} style={{ display: "inline-flex", alignItems: "center" }}><span style={{ color: "#94a3b8" }}>→</span>{cell(g.labels[v], "#0ea5e9", "", addr(u * 10 + j + 1))}</span>)}{neighbors.length === 0 && <span style={{ color: "#cbd5e1" }}>→ ∅</span>}</div></div>)}</div>;
  })();
  return (
    <>
      <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 800, color: "#4338ca", display: "flex", gap: 6, alignItems: "center", borderBottom: "1px solid #c7d2fe" }}>
        <span>{isZh ? "内存表示" : "Memory"}</span>
        {(["adjlist", "adjmat", "array", "edges"] as const).map((v) => <button key={v} className={`pill ${repr === v ? "active" : ""}`} style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setRepr(v)}>{v === "adjlist" ? (isZh ? "邻接表" : "List") : v === "adjmat" ? (isZh ? "矩阵" : "Matrix") : v === "array" ? "parent" : (isZh ? "边集" : "Edges")}</button>)}
        <button className="pill" style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11 }} onClick={() => { if (g) location.href = buildMemoryUrl(buildGraphDump(g, repr, { root: 0 }) as any); }}>{isZh ? "查看内存 ↗" : "Memory ↗"}</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 8, background: "#fff" }}>{content}</div>
    </>
  );
}

import { useState } from "react";
