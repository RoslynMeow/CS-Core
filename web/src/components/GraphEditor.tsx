import { useEffect, useMemo, useRef, useState } from "react";
import { Graph, alphaLabels } from "../lib/graph";
import type { ImportedGraph } from "../modules/tree/source";
import {
  getUndirectedBadgeColor,
  graphHasWeight,
  weightArrow,
} from "../lib/graphTheme";

type Layout = "circle" | "tree" | "force" | "free";
type Tool = "move" | "addEdge" | "addVertex" | "delete";
const SVG_W = 760;
const SVG_H = 440;
const V_R = 17;

export type GraphEditorProps = {
  initialGraph?: ImportedGraph | null;
  onConfirm: (g: ImportedGraph) => void;
  onCancel?: () => void;
  constraints?: {
    mustBeDirected?: boolean;
    mustBeTree?: boolean;
    hint?: string;
  };
  title?: string;
  highlight?: {
    current?: number | null;
    visited?: number[];
    frontier?: number[];
    edge?: [number, number] | null;
    tone?: Record<number, number>;
  };
  /** 嵌入模式：隐藏顶部工具栏与底部确认按钮，右键菜单即全部操作，即改即同步 */
  embedded?: boolean;
  onPickVertex?: (id: number) => void;
};

type GenType = "tree" | "binary" | "complete" | "skew" | "graph" | "dcyclic" | "dag" | "ucyclic" | "uacyclic";
type WeightMode = "none" | "random";
type GenCfg = { type: GenType; n: number; p: number; directed: boolean; alpha: boolean; weighted: WeightMode; skewRandom: boolean; connected: boolean; k: number; };
const GEN_TYPES: Array<{ k: GenType; label: string; desc: string }> = [
  { k: "tree", label: "树（通用）", desc: "连通无向树 · n−1 条边" },
  { k: "binary", label: "二叉树", desc: "每个节点至多 2 个子" },
  { k: "complete", label: "完全二叉树", desc: "严格层序填补（堆结构）" },
  { k: "skew", label: "偏二叉树", desc: "退化链：每个节点至多 1 个子" },
  { k: "graph", label: "图（通用）", desc: "随机边 · 概率 p" },
  { k: "dcyclic", label: "有向有环图", desc: "先构造环保证有环" },
  { k: "dag", label: "有向无环图", desc: "随机拓扑序 + 前向边（保证无环）" },
  { k: "ucyclic", label: "无向有环图", desc: "先构造环保证有环" },
  { k: "uacyclic", label: "无向无环图", desc: "森林（可勾选连通成树）" },
];
const GEN_TYPE_LABEL: Record<GenType, string> = { tree: "树", binary: "二叉树", complete: "完全二叉树", skew: "偏二叉树", graph: "图", dcyclic: "有向有环图", dag: "有向无环图", ucyclic: "无向有环图", uacyclic: "无向无环图" };
type GraphSnap = {
  n: number;
  directed: boolean;
  edgeSpec: string;
  labels: string[];
  manual: Record<number, { x: number; y: number }>;
};

export function GraphEditor({ initialGraph, onConfirm, onCancel, constraints, title, highlight, embedded, onPickVertex }: GraphEditorProps) {
  const init = initialGraph;
  const [n, setN] = useState(init ? init.n : 4);
  const [directed, setDirected] = useState(init ? init.directed : false);
  const [edgeSpec, setEdgeSpec] = useState(init ? init.spec : "0-1,1-2,2-3");
  const [labels, setLabels] = useState<string[]>(init ? init.labels : ["A", "B", "C", "D"]);
  const [layout, setLayout] = useState<Layout>(init?.layout ?? "tree");
  const [root, setRoot] = useState(init ? init.root : 0);
  const [tool, setTool] = useState<Tool>("move");
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [manual, setManual] = useState<Record<number, { x: number; y: number }>>(init?.manual ?? {});
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (s: string) => { setToast(s); setTimeout(() => setToast(null), 2000); };
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [hoverV, setHoverV] = useState<number | null>(null);
  const [view, setView] = useState({ tx: 0, ty: 0, s: 1 });
  const [pan, setPan] = useState<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragPointer, setDragPointer] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [hist, setHist] = useState<GraphSnap[]>([]);
  const [redoStack, setRedoStack] = useState<GraphSnap[]>([]);
  const histRef = useRef({ hist: [] as GraphSnap[], redo: [] as GraphSnap[] });
  histRef.current = { hist, redo: redoStack };
  const svgRef = useRef<SVGSVGElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; sx: number; sy: number; target: number | null; edge: { u: number; v: number } | null; edgeList: { u: number; v: number }[] } | null>(null);
  const [edgeChoice, setEdgeChoice] = useState(0);
  const [genOpen, setGenOpen] = useState(false);

  // 约束：强制有向/树时锁定
  useEffect(() => {
    if (constraints?.mustBeDirected && !directed) setDirected(true);
    if (constraints?.mustBeTree) {
      if (directed) setDirected(false);
      if (layout !== "tree") setLayout("tree");
    }
  }, [constraints?.mustBeDirected, constraints?.mustBeTree, directed, layout]);

  const pushHistory = () => {
    const snap: GraphSnap = { n, directed, edgeSpec, labels: [...labels], manual: { ...manual } };
    setHist((h) => (h.length > 80 ? h.slice(-80) : h).concat(snap));
    setRedoStack([]);
  };
  const applySnapshot = (snap: GraphSnap) => {
    setN(snap.n);
    setDirected(snap.directed);
    setEdgeSpec(snap.edgeSpec);
    setLabels([...snap.labels]);
    setManual({ ...snap.manual });
  };
  const undo = () => {
    const h = histRef.current.hist;
    if (h.length === 0) return;
    const prev = h[h.length - 1];
    setRedoStack((r) => [...r, { n, directed, edgeSpec, labels: [...labels], manual: { ...manual } }]);
    applySnapshot(prev);
    setHist((hh) => hh.slice(0, -1));
    setSelected(null);
    setPending(null);
    showToast("撤销");
  };
  const redo = () => {
    const rs = histRef.current.redo;
    if (rs.length === 0) return;
    const next = rs[rs.length - 1];
    pushHistory();
    applySnapshot(next);
    setRedoStack((r) => r.slice(0, -1));
    setSelected(null);
    setPending(null);
    showToast("重做");
  };

  const g = useMemo(() => {
    const graph = new Graph(n, { directed: constraints?.mustBeDirected ? true : directed, labels });
    graph.fromSpec(edgeSpec);
    return graph;
  }, [n, directed, edgeSpec, labels, constraints?.mustBeDirected]);

  // 嵌入模式：即改即同步，无需确认按钮
  const firstSync = useRef(true);
  useEffect(() => {
    if (!embedded) return;
    if (firstSync.current) { firstSync.current = false; return; }
    const spec = g.edges.map((e) => `${e.u}-${e.v}${e.weight !== undefined ? ":" + e.weight : ""}`).join(",");
    const out: ImportedGraph = { n: g.n, spec, labels: [...g.labels], directed: g.directed, root, layout, manual: { ...manual } };
    onConfirm(out);
  }, [g.n, g.edges, g.labels, g.directed, root, layout, manual, embedded]);

  const autoPos = useMemo(() => {
    if (layout === "tree") return g.layoutTree(root, { x0: 20, y0: 10, w: SVG_W - 40, h: SVG_H - 20 }).pos;
    if (layout === "force") return g.layoutForce(SVG_W / 2, SVG_H / 2, SVG_W, SVG_H, 160);
    return g.layoutCircle(SVG_W / 2, SVG_H / 2, Math.min(SVG_W, SVG_H) / 2 - 46);
  }, [g, layout, root]);

  const pos = useMemo(() => {
    const m: Record<number, { x: number; y: number }> = {};
    for (let i = 0; i < g.n; i++) m[i] = manual[i] ?? autoPos[i] ?? { x: 100 + i * 30, y: 200 };
    return m;
  }, [g, autoPos, manual]);

  const worldToSvg = (p: { x: number; y: number }) => ({ x: p.x * view.s + view.tx, y: p.y * view.s + view.ty });
  const svgToWorld = (p: { x: number; y: number }) => ({ x: (p.x - view.tx) / view.s, y: (p.y - view.ty) / view.s });
  // 滚轮缩放（展示画布同款：非 passive 监听 + 指针中心缩放），编辑器之前缺这个，滚轮直接滚页面
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    e.preventDefault();
    const p = svgPoint(e as unknown as React.MouseEvent);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setView((v) => {
      const s = Math.min(4, Math.max(0.3, v.s * factor));
      const tx = p.x - (p.x - v.tx) * (s / v.s);
      const ty = p.y - (p.y - v.ty) * (s / v.s);
      return { tx, ty, s };
    });
  };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);
  const svgPoint = (e: React.PointerEvent | React.MouseEvent): { x: number; y: number } => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const contentW = rect.width;
    const contentH = contentW * (SVG_H / SVG_W);
    const padY = Math.max(0, (rect.height - contentH) / 2);
    return { x: ((e.clientX - rect.left) / contentW) * SVG_W, y: ((e.clientY - rect.top - padY) / contentH) * SVG_H };
  };
  const hitVertex = (p: { x: number; y: number }): number | null => {
    for (let i = g.n - 1; i >= 0; i--) {
      const v = pos[i];
      if (v && Math.hypot(p.x - v.x, p.y - v.y) <= V_R + 6) return i;
    }
    return null;
  };
  const specFromEdges = (es: { u: number; v: number; weight?: number }[]): string =>
    es.map((e) => `${e.u}-${e.v}${e.weight !== undefined ? ":" + e.weight : ""}`).join(",");
  const distToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
    const dx = bx - ax, dy = by - ay; const L2 = dx*dx+dy*dy; if (L2===0) return Math.hypot(px-ax, py-ay);
    let t = ((px-ax)*dx + (py-ay)*dy)/L2; t = Math.max(0, Math.min(1,t)); return Math.hypot(px-(ax+t*dx), py-(ay+t*dy));
  };
  const hitEdges = (p: { x:number; y:number }): { u:number; v:number }[] => {
    const out: { u:number; v:number }[] = [];
    for (const e of g.edges) { const a = pos[e.u], b = pos[e.v]; if (!a||!b) continue; if (distToSeg(p.x,p.y,a.x,a.y,b.x,b.y) <= 8) { if (!out.some((o)=>o.u===e.u&&o.v===e.v)) out.push({ u:e.u, v:e.v }); } }
    return out;
  };
  const hitEdge = (p: { x:number; y:number }): { u:number; v:number } | null => hitEdges(p)[0] ?? null;
  const findEdge = (u:number,v:number) => g.edges.find((e)=>(e.u===u&&e.v===v)||(!g.directed&&e.u===v&&e.v===u));
  const removeEdge = (u:number,v:number) => { pushHistory(); const kept = g.edges.filter((e)=>{ const a=e.u===u&&e.v===v; const b=!g.directed&&e.u===v&&e.v===u; return !(a||b); }); setEdgeSpec(specFromEdges(kept)); showToast(`取消边 ${g.labels[u]??u}—${g.labels[v]??v}`); };
  const setEdgeWeight = (u:number,v:number,w:number) => { pushHistory(); const gg = new Graph(n, { directed: g.directed, labels: [...labels] }); gg.fromSpec(edgeSpec); gg.setWeight(u,v,w); setEdgeSpec(specFromEdges(gg.edges)); showToast(`权重 ${w}`); };
  const menuReset = () => { setManual({}); setView({ tx:0, ty:0, s:1 }); showToast("重置布局"); };

  const removeVertex = (v: number) => {
    pushHistory();
    const keep = g.edges.filter((e) => e.u !== v && e.v !== v).map((e) => `${e.u > v ? e.u - 1 : e.u}-${e.v > v ? e.v - 1 : e.v}${e.weight !== undefined ? ":" + e.weight : ""}`);
    setN((nn) => Math.max(1, nn - 1));
    setEdgeSpec(keep.join(","));
    setLabels((ls) => ls.filter((_, i) => i !== v));
    setManual((m) => {
      const nm: Record<number, { x: number; y: number }> = {};
      for (const [k, pv] of Object.entries(m)) {
        const kk = +k;
        if (kk === v) continue;
        nm[kk > v ? kk - 1 : kk] = pv;
      }
      return nm;
    });
    setSelected(null);
    showToast(`删除顶点 ${g.labels[v] ?? v}`);
  };
  const addVertexAt = (p: { x: number; y: number }) => {
    pushHistory();
    setN(g.n + 1);
    setManual((m) => ({ ...m, [g.n]: p }));
    setLabels((ls) => [...ls, String.fromCharCode(65 + (ls.length % 26))]);
    setSelected(g.n);
    showToast(`新建顶点 ${g.labels[g.n] ?? g.n}`);
  };
  const link = (a: number, b: number) => {
    pushHistory();
    const exists = g.edges.some((x) => (x.u === a && x.v === b) || (!g.directed && x.u === b && x.v === a));
    if (!exists) setEdgeSpec((s) => (s ? s + "," : "") + `${a}-${b}`);
    setPending(null);
    setSelected(null);
    setTool("move");
    showToast(exists ? "边已存在" : `连线 ${g.labels[a] ?? a}—${g.labels[b] ?? b}`);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    setMenu(null);
    svgRef.current?.setPointerCapture?.(e.pointerId);
    const svgP = svgPoint(e);
    const p = svgToWorld(svgP);
    const v = hitVertex(p);
    if (tool === "addVertex") {
      if (v === null) addVertexAt(p);
      else setSelected(v);
      return;
    }
    if (tool === "delete") {
      if (v !== null) removeVertex(v);
      return;
    }
    if (tool === "addEdge") {
      if (v !== null) {
        if (pending === null) {
          setPending(v);
          setSelected(v);
          showToast(`起点 ${g.labels[v] ?? v}，再点第二个顶点`);
        } else if (pending === v) {
          setPending(null);
          showToast("");
        } else link(pending, v);
      }
      return;
    }
    if (v !== null) {
      if (e.shiftKey) {
        if (pending === null) {
          setPending(v);
          setSelected(v);
          setTool("addEdge");
          showToast(`起点 ${g.labels[v] ?? v}，再点第二个顶点`);
        } else link(pending, v);
        return;
      }
      setSelected(v);
      if (tool === "move") {
        setDrag(v);
        const vpos = pos[v];
        if (vpos) setDragStart({ x: vpos.x, y: vpos.y });
      }
    } else if (tool === "move") {
      setSelected(null);
      setPan({ startX: svgP.x, startY: svgP.y, tx: view.tx, ty: view.ty });
    } else setSelected(null);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const svgP = svgPoint(e);
    if (pan) {
      setView((v) => ({ ...v, tx: pan.tx + (svgP.x - pan.startX), ty: pan.ty + (svgP.y - pan.startY) }));
      return;
    }
    if (drag !== null && dragStart) {
      const p = svgToWorld(svgP);
      if (!dragPointer) {
        setDragPointer(p);
        return;
      }
      const dx = p.x - dragPointer.x, dy = p.y - dragPointer.y;
      const np = { x: dragStart.x + dx, y: dragStart.y + dy };
      setManual((m) => ({ ...m, [drag]: np }));
    }
    if (tool === "addEdge" && pending !== null) setHover(svgP);
    if (drag === null) {
      const p = svgToWorld(svgP);
      setHoverV(hitVertex(p));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    svgRef.current?.releasePointerCapture?.(e.pointerId);
    setDrag(null);
    setDragStart(null);
    setDragPointer(null);
    setHover(null);
    setPan(null);
  };

  const commitRename = () => {
    if (editing !== null) {
      const val = editVal.trim() || String(editing);
      setLabels((ls) => ls.map((x, i) => (i === editing ? val : x)));
    }
    setEditing(null);
  };

  const genGraph = (cfg: GenCfg) => {
    const minN = cfg.type === "dcyclic" || cfg.type === "ucyclic" ? 3 : 2;
    const nn = Math.max(minN, Math.min(80, Math.floor(cfg.n) || minN));
    const labs = cfg.alpha ? alphaLabels(nn) : Array.from({ length: nn }, (_, i) => String(i));
    const lopts = { labels: labs };
    const weighted = cfg.weighted === "random";
    let gg: Graph; let ly: Layout = "tree";
    switch (cfg.type) {
      case "tree": gg = Graph.randomTree(nn, { ...lopts, weighted }); break;
      case "binary": gg = Graph.randomBinaryTree(nn, { ...lopts, weighted }); break;
      case "complete": gg = Graph.randomCompleteBinaryTree(nn, { ...lopts, weighted }); break;
      case "skew": gg = Graph.randomSkewTree(nn, { ...lopts, weighted, random: cfg.skewRandom }); break;
      case "graph": gg = Graph.randomGraph(nn, cfg.p, { directed: cfg.directed, ...lopts, weighted }); ly = "force"; break;
      case "dcyclic": gg = Graph.randomGraphWithCycle(nn, cfg.p, { directed: true, ...lopts, weighted }); ly = "force"; break;
      case "dag": gg = Graph.randomDAG(nn, cfg.p, { ...lopts, weighted }); ly = "force"; break;
      case "ucyclic": gg = Graph.randomGraphWithCycle(nn, cfg.p, { directed: false, ...lopts, weighted }); ly = "force"; break;
      case "uacyclic": gg = cfg.connected ? Graph.randomTree(nn, { ...lopts, weighted }) : Graph.randomForest(nn, Math.max(1, Math.min(cfg.k, nn)), { ...lopts, weighted }); break;
      default: gg = Graph.randomGraph(nn, cfg.p, { ...lopts, weighted }); ly = "force";
    }
    pushHistory();
    setN(gg.n); setLabels([...gg.labels]); setEdgeSpec(specFromEdges(gg.edges)); setManual({}); setDirected(gg.directed); setLayout(ly); setRoot(0); setSelected(null); setPending(null);
    showToast(`已随机生成：${GEN_TYPE_LABEL[cfg.type]}（${gg.n} 顶点 · ${gg.edges.length} 边）`);
  };
  const genRandom = (type: GenType) => genGraph({ type, n, p: 0.25, directed, alpha: true, weighted: "none", skewRandom: true, connected: true, k: 3 });

  const handleConfirm = () => {
    const out: ImportedGraph = {
      n: g.n,
      spec: specFromEdges(g.edges),
      labels: [...g.labels],
      directed: g.directed,
      root,
      layout,
      manual: { ...manual },
    };
    // 校验
    if (constraints?.mustBeTree && !g.isTree()) {
      showToast("当前图不是树（需 n-1 条边且无环）");
      return;
    }
    if (g.n === 0) {
      showToast("图不能为空");
      return;
    }
    onConfirm(out);
  };

  const edgePos = (u: number, v: number) => {
    const wa = pos[u], wb = pos[v];
    if (!wa || !wb) return { ax: 0, ay: 0, bx: 0, by: 0, mx: 0, my: 0 };
    const a = worldToSvg(wa), b = worldToSvg(wb);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const off = 4;
    return { ax: a.x + ux * (V_R + off), ay: a.y + uy * (V_R + off), bx: b.x - ux * (V_R + off), by: b.y - uy * (V_R + off), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", minHeight: 0 }}>
      {title && !embedded && <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>}
      {constraints?.hint && !embedded && <div style={{ fontSize: 11, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", padding: "6px 10px", borderRadius: 8 }}>{constraints.hint}</div>}
      {!embedded && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "6px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#4338ca" }}>工具</span>
            {(["move", "addVertex", "addEdge", "delete"] as Tool[]).map((t) => (
              <button key={t} className={`pill ${tool === t ? "active" : ""}`} style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => { setTool(t); setPending(null); }}>
                {t === "move" ? "移动" : t === "addVertex" ? "加顶点" : t === "addEdge" ? "连线" : "删除"}
              </button>
            ))}
            <span style={{ width: 1, height: 18, background: "#c7d2fe" }} />
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={directed} disabled={!!constraints?.mustBeDirected} onChange={(e) => setDirected(e.target.checked)} /> 有向
            </label>
            <select className="txt" value={layout} onChange={(e) => setLayout(e.target.value as Layout)} style={{ fontSize: 12 }}>
              <option value="tree">树形</option>
              <option value="circle">环形</option>
              <option value="force">力导向</option>
              <option value="free">自由</option>
            </select>
            <button className="ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => { pushHistory(); setEdgeSpec(""); showToast("已清空边"); }}>清空边</button>
            <button className="ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={menuReset}>重置布局</button>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#475569" }}>{g.n} 顶点 · {g.edges.length} 边 {g.isTree() ? "· 树" : g.isForest() ? "· 森林" : g.hasCycle() ? "· 含环" : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button className="ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={undo} disabled={hist.length === 0}>撤销</button>
            <button className="ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={redo} disabled={redoStack.length === 0}>重做</button>
            <span style={{ fontSize: 11, color: "#64748b" }}>拖拽顶点 · Shift+点连线 · 空白新建(加顶点模式) · 右键重命名/删点</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => genRandom("tree")}>随机树</button>
              <button className="ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => genRandom("graph")}>随机图</button>
              <button className="ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => genRandom("dag")}>随机DAG</button>
            </div>

          </div>
        </>
      )}

      <div style={{ flex: 1, minHeight: 320, border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#fff", position: "relative" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ display: "block", width: "100%", height: "100%", cursor: tool === "delete" ? "not-allowed" : tool === "addVertex" ? "copy" : tool === "addEdge" ? "crosshair" : "default", touchAction: "none", userSelect: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onContextMenu={(e) => {
            e.preventDefault();
            const p = svgToWorld(svgPoint(e));
            const v = hitVertex(p);
            const eds = v === null ? hitEdges(p) : [];
            const ed = eds[0] ?? null;
            if (v !== null) setSelected(v);
            if (embedded) {
              setEdgeChoice(0);
              setMenu({ x: e.clientX, y: e.clientY, sx: p.x, sy: p.y, target: v, edge: ed, edgeList: eds });
            } else {
              if (v !== null) { setEditing(v); setEditVal(g.labels[v] ?? String(v)); }
            }
          }}
        >
          {g.edges.map((e, i) => {
            const p = edgePos(e.u, e.v);
            const isSel = selected !== null && (e.u === selected || e.v === selected);
            const isHlEdge = highlight?.edge && ((highlight.edge[0] === e.u && highlight.edge[1] === e.v) || (!g.directed && highlight.edge[0] === e.v && highlight.edge[1] === e.u));
            const stroke = isHlEdge ? "#f59e0b" : isSel ? "#4f46e5" : "#64748b";
            const showW = e.weight !== undefined || graphHasWeight(g.edges);
            const wVal = e.weight ?? 1;
            // 边方向（edgePos 已内嵌 V_R，直接用）
            const dx = p.bx - p.ax, dy = p.by - p.ay;
            const dl = Math.hypot(dx, dy) || 1;
            const ux = dx / dl, uy = dy / dl;
            const wa = weightArrow(wVal);
            // 有权箭头：数字写进放大的三角形里；无权箭头保持可见尺寸
            const AL = showW && g.directed ? wa.len : 15;
            const AH = showW && g.directed ? wa.half : 7;
            // 箭尖贴到节点圆（从线端再往前 3px，正好内嵌 1px 相接）
            const tx2 = p.bx + ux * 3, ty2 = p.by + uy * 3;
            const bx2 = tx2 - ux * AL, by2 = ty2 - uy * AL;
            const px = -uy, py = ux;
            // 线止于三角底边中心：三角里不穿线，数字独占干净底色
            const ex2 = g.directed ? bx2 : p.bx, ey2 = g.directed ? by2 : p.by;
            // 数字放在三角形视觉中心（约 0.55 倍箭长处）
            const nx = tx2 - ux * AL * 0.55, ny = ty2 - uy * AL * 0.55;
            // 点箭头/牌子直接打开这条边的菜单（嵌入模式）：按命中复用下拉多选
            const openHere = (ev: React.MouseEvent) => {
              if (!embedded) return;
              ev.stopPropagation();
              const worldP = svgToWorld(svgPoint(ev));
              const eds = hitEdges(worldP);
              if (eds.length === 0) return;
              const idx = eds.findIndex((o) => o.u === e.u && o.v === e.v);
              setEdgeChoice(idx >= 0 ? idx : 0);
              const cur = eds[idx >= 0 ? idx : 0];
              setMenu({ x: ev.clientX, y: ev.clientY, sx: worldP.x, sy: worldP.y, target: null, edge: cur, edgeList: eds });
            };
            const badgeColor = getUndirectedBadgeColor();
            return (
              <g key={i}>
                <line x1={p.ax} y1={p.ay} x2={ex2} y2={ey2} stroke={stroke} strokeWidth={isHlEdge ? 3 : isSel ? 2.4 : 1.6} />
                {g.directed ? (
                  <g
                    onClick={embedded ? openHere : undefined}
                    onPointerDown={embedded ? (ev) => ev.stopPropagation() : undefined}
                    style={embedded ? { cursor: "pointer" } : undefined}
                  >
                    <polygon points={`${tx2},${ty2} ${bx2 + px * AH},${by2 + py * AH} ${bx2 - px * AH},${by2 - py * AH}`} fill={stroke} />
                    {showW && (
                      <text x={nx} y={ny} textAnchor="middle" dominantBaseline="central" fontSize={wa.font} fontWeight={800} fill="#fff" stroke="rgba(15,23,42,.8)" strokeWidth={2.5} paintOrder="stroke">{wVal}</text>
                    )}
                  </g>
                ) : (
                  showW && (
                    <g
                      onClick={embedded ? openHere : undefined}
                      onPointerDown={embedded ? (ev) => ev.stopPropagation() : undefined}
                      style={embedded ? { cursor: "pointer" } : undefined}
                    >
                      <circle cx={p.mx} cy={p.my} r={14} fill="transparent" />
                      <circle cx={p.mx} cy={p.my} r={9} fill={badgeColor} />
                      <text x={p.mx} y={p.my + 3} textAnchor="middle" fontSize={10} fontWeight={800} fill="#fff">{wVal}</text>
                    </g>
                  )
                )}
              </g>
            );
          })}
          {tool === "addEdge" && pending !== null && pos[pending] && hover && <line x1={worldToSvg(pos[pending]).x} y1={worldToSvg(pos[pending]).y} x2={hover.x} y2={hover.y} stroke="#6366f1" strokeWidth={1.6} strokeDasharray="6 4" />}
          {Array.from({ length: g.n }, (_, i) => i).map((i) => {
            const p = worldToSvg(pos[i]);
            const isSel = selected === i;
            const isPending = pending === i;
            const isHover = hoverV === i;
            const isRoot = i === root;
            const isCurrent = highlight?.current === i;
            const isVisited = highlight?.visited?.includes(i);
            const isFrontier = highlight?.frontier?.includes(i);
            const hasTone = highlight?.tone?.[i] !== undefined;
            let fill = "#eef2ff";
            let stroke = "#6366f1";
            if (isCurrent) { fill = "#a78bfa"; stroke = "#6d28d9"; }
            else if (isVisited) { fill = "#bbf7d0"; stroke = "#059669"; }
            else if (isFrontier) { fill = "#bae6fd"; stroke = "#0284c7"; }
            else if (hasTone) { const t = highlight!.tone![i] % 6; const cols = ["#fecaca","#bfdbfe","#bbf7d0","#fef08a","#ddd6fe","#fed7aa"]; fill = cols[t]; stroke = "#475569"; }
            else if (isHover) { fill = "#ddd6fe"; stroke = "#7c3aed"; }
            else if (isSel) { fill = "#4f46e5"; stroke = "#312e81"; }
            else if (isRoot && !embedded) { fill = "#fee2e2"; stroke = "#b91c1c"; }
            return (
              <g key={i} onDoubleClick={() => { setEditing(i); setEditVal(g.labels[i]); }}>
                <circle cx={p.x} cy={p.y} r={V_R} fill={fill} stroke={stroke} strokeWidth={isCurrent || (isRoot && !embedded) || isSel ? 2.6 : isPending ? 2.2 : 1.4} />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={isVisited || isFrontier || isCurrent ? "#0f172a" : isSel ? "#fff" : "#1e293b"}>{g.labels[i]}</text>
                {isRoot && !embedded && <text x={p.x} y={p.y - V_R - 3} textAnchor="middle" fontSize={9} fontWeight={800} fill="#dc2626">根</text>}
              </g>
            );
          })}
        </svg>
        {toast && (
          <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", background: "#059669", color: "#fff", padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,.15)", pointerEvents: "none" }}>
            {toast}
          </div>
        )}
        {editing !== null && pos[editing] && (() => {
          const sp = worldToSvg(pos[editing]);
          return (
            <div style={{ position: "absolute", left: `calc(${(sp.x / SVG_W) * 100}% - 44px)`, top: `calc(${(sp.y / SVG_H) * 100}% - 38px)`, zIndex: 40 }}>
              <input className="txt" autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { if (e.key === "Enter") commitRename(); else if (e.key === "Escape") setEditing(null); }} style={{ width: 80, fontSize: 13, textAlign: "center" }} />
            </div>
          );
        })()}
        {!embedded && selected !== null && (
          <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
            <button className="ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => { setEditing(selected); setEditVal(g.labels[selected]); }}>重命名</button>
            <button className="ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => setRoot(selected)}>设为根</button>
            <button className="ghost" style={{ padding: "4px 8px", fontSize: 11, color: "#dc2626" }} onClick={() => removeVertex(selected)}>删除顶点</button>
          </div>
        )}

        {menu && (
          <div style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 50, minWidth: 180, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 12px 32px rgba(15,23,42,.18)", padding: 6 }} onPointerDown={(e) => e.stopPropagation()}>
            {menu.target !== null ? (
              <>
                <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 800, color: "#64748b" }}>顶点 {g.labels[menu.target]}</div>
                {embedded && onPickVertex && <div style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "#4f46e5", fontWeight: 700 }} onClick={() => { onPickVertex(menu.target!); showToast(`已选 ${g.labels[menu.target!]}`); setMenu(null); }}>★ 选择此点</div>}
                <div style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer" }} onClick={() => { setEditing(menu.target!); setEditVal(g.labels[menu.target!] ?? String(menu.target)); setMenu(null); }}>重命名</div>
                {!embedded && <div style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer" }} onClick={() => { setRoot(menu.target!); showToast(`根设为 ${g.labels[menu.target!]}`); setMenu(null); }}>设为根</div>}
                <div style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer" }} onClick={() => { setPending(menu.target!); setSelected(menu.target!); setTool("addEdge"); showToast(`起点 ${g.labels[menu.target!]}`); setMenu(null); }}>从此连线</div>
                <div style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "#dc2626" }} onClick={() => { removeVertex(menu.target!); setMenu(null); }}>删除顶点</div>
              </>
            ) : menu.edge ? (
              (() => {
                const choices = menu.edgeList.length > 0 ? menu.edgeList : [menu.edge];
                const cur = choices[Math.min(edgeChoice, choices.length - 1)];
                return (
                  <>
                    <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 800, color: "#64748b" }}>边 {g.labels[cur.u]} {g.directed ? "→" : "—"} {g.labels[cur.v]}（权 {findEdge(cur.u, cur.v)?.weight ?? 1}）</div>
                    {choices.length > 1 && (
                      <div style={{ padding: "4px 12px 7px" }}>
                        <select className="txt" value={Math.min(edgeChoice, choices.length - 1)} onChange={(e) => setEdgeChoice(Number(e.target.value))} style={{ width: "100%", fontSize: 13 }}>
                          {choices.map((c, i) => (
                            <option key={`${c.u}-${c.v}-${i}`} value={i}>{g.labels[c.u]} {g.directed ? "→" : "—"} {g.labels[c.v]}（权 {findEdge(c.u, c.v)?.weight ?? 1}）</option>
                          ))}
                        </select>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>此处有多条重合边，请先选一条</div>
                      </div>
                    )}
                    <div style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer" }} onClick={() => { const w = prompt("权重:", String(findEdge(cur.u, cur.v)?.weight ?? 1)); if (w !== null) { const nw = Math.trunc(Number(w)); if (Number.isFinite(nw) && nw > 0) setEdgeWeight(cur.u, cur.v, nw); } setMenu(null); }}>修改权重</div>
                    <div style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", color: "#dc2626" }} onClick={() => { removeEdge(cur.u, cur.v); setMenu(null); }}>删除边</div>
                  </>
                );
              })()
            ) : (
              <>
                <div style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer" }} onClick={() => { const p = { x: menu.sx, y: menu.sy }; const nn = g.n + 1; pushHistory(); setN(nn); setManual((m) => ({ ...m, [g.n]: p })); setLabels((ls) => [...ls, String.fromCharCode(65 + (ls.length % 26))]); setMenu(null); }}>新建顶点</div>
                <div style={{ height: 1, background: "#eef2f7", margin: "5px 6px" }} />
                <div style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer" }} onClick={() => { setGenOpen(true); setMenu(null); }}>随机生成…</div>
                <div style={{ height: 1, background: "#eef2f7", margin: "5px 6px" }} />
                <div style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer" }} onClick={() => { pushHistory(); setEdgeSpec(""); setMenu(null); }}>清空边</div>
                <div style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer" }} onClick={() => { menuReset(); setMenu(null); }}>重置布局</div>
                <div style={{ height: 1, background: "#eef2f7", margin: "5px 6px" }} />
                {!constraints?.mustBeTree && <label style={{ display: "flex", gap: 6, alignItems: "center", padding: "7px 12px", fontSize: 13 }}><input type="checkbox" checked={directed} disabled={!!constraints?.mustBeDirected} onChange={(e) => setDirected(e.target.checked)} /> 有向</label>}
                <div style={{ display: "flex", gap: 6, padding: "7px 12px" }}>{((constraints?.mustBeTree ? ["tree"] : ["tree","circle","force","free"]) as Layout[]).map((l) => <button key={l} className={`pill ${layout===l?"active":""}`} style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => { setLayout(l); setMenu(null); }}>{l==="tree"?"树形":l==="circle"?"环形":l==="force"?"力导向":"自由"}</button>)}</div>
              </>
            )}
          </div>
        )}
        {genOpen && <GenModal constraints={constraints} onCancel={() => setGenOpen(false)} onGenerate={(cfg) => { genGraph(cfg); setGenOpen(false); }} />}
      </div>
      {!embedded && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {onCancel && <button className="ghost" style={{ padding: "8px 16px", fontSize: 13 }} onClick={onCancel}>取消</button>}
          <button className="pill active" style={{ padding: "8px 16px", fontSize: 13 }} onClick={handleConfirm}>确认使用此图</button>
        </div>
      )}
    </div>
  );
}

function ModalRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 13 }}><span style={{ width: 76, flexShrink: 0, color: "#475569" }}>{label}</span><div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>{children}</div></div>;
}
function GenModal({ onCancel, onGenerate, constraints }: { onCancel: () => void; onGenerate: (cfg: GenCfg) => void; constraints?: { mustBeTree?: boolean; mustBeDirected?: boolean } }) {
  const allowed = constraints?.mustBeTree ? GEN_TYPES.filter((t) => ["tree","binary","complete","skew","uacyclic"].includes(t.k)) : GEN_TYPES;
  const [cfg, setCfg] = useState<GenCfg>(() => {
    const initType = allowed[0]?.k ?? "tree";
    return { type: initType, n: 10, p: 0.25, directed: !!constraints?.mustBeDirected, alpha: true, weighted: "none", skewRandom: true, connected: true, k: 3 };
  });
  const info = allowed.find((t) => t.k === cfg.type) ?? allowed[0];
  const isCyclic = cfg.type === "dcyclic" || cfg.type === "ucyclic";
  const hasDensity = cfg.type === "graph" || cfg.type === "dcyclic" || cfg.type === "dag" || cfg.type === "ucyclic";
  const minN = isCyclic ? 3 : 2;
  const set = (p: Partial<GenCfg>) => setCfg((c) => ({ ...c, ...p }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onCancel(); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(15,23,42,.3)", padding: 16, width: 360, maxWidth: "100%", maxHeight: "90vh", overflow: "auto" }} onPointerDown={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>随机生成</div>
        <div style={{ marginBottom: 8 }}>
          <select className="txt" value={cfg.type} onChange={(e) => set({ type: e.target.value as GenType })} style={{ width: "100%", fontSize: 13 }}>
            {allowed.map((t) => <option key={t.k} value={t.k}>{t.label}</option>)}
          </select>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{info.desc}</div>
        </div>
        <ModalRow label="顶点数"><input type="number" min={minN} max={80} value={cfg.n} onChange={(e) => set({ n: Math.floor(Number(e.target.value)) || minN })} className="txt" style={{ width: 72, fontSize: 13 }} /><span style={{ fontSize: 11, color: "#94a3b8" }}>{minN}–80{isCyclic ? "（有环需 ≥3）" : ""}</span></ModalRow>
        {hasDensity && <ModalRow label="边密度 p"><input type="range" min={0.05} max={1} step={0.05} value={cfg.p} onChange={(e) => set({ p: Number(e.target.value) })} style={{ flex: 1 }} /><span style={{ fontSize: 12, color: "#475569", width: 38, textAlign: "right" }}>{cfg.p.toFixed(2)}</span></ModalRow>}
        {cfg.type === "graph" && <ModalRow label="方向"><label style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={cfg.directed} onChange={(e) => set({ directed: e.target.checked })} /> 有向</label></ModalRow>}
        <ModalRow label="标签"><button className={`pill ${cfg.alpha ? "" : "active"}`} style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => set({ alpha: false })}>数字 0,1…</button><button className={`pill ${cfg.alpha ? "active" : ""}`} style={{ padding: "3px 10px", fontSize: 12 }} onClick={() => set({ alpha: true })}>字母 A,B…</button></ModalRow>
        <ModalRow label="权重"><select className="txt" value={cfg.weighted} onChange={(e) => set({ weighted: e.target.value as WeightMode })} style={{ width: 170, fontSize: 13 }}><option value="none">全 1（无权重）</option><option value="random">随机 1–10</option></select></ModalRow>
        {cfg.type === "skew" && <ModalRow label="偏斜序"><label style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={cfg.skewRandom} onChange={(e) => set({ skewRandom: e.target.checked })} /> 随机排列</label></ModalRow>}
        {cfg.type === "uacyclic" && <><ModalRow label="连通"><label style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={cfg.connected} onChange={(e) => set({ connected: e.target.checked })} /> 保证连通</label></ModalRow>{!cfg.connected && <ModalRow label="树数 k"><input type="number" min={1} max={Math.max(1, cfg.n)} value={cfg.k} onChange={(e) => set({ k: Math.max(1, Math.floor(Number(e.target.value)) || 1)})} className="txt" style={{ width: 72 }} /></ModalRow>}</>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}><button className="ghost" style={{ padding: "6px 14px", fontSize: 13 }} onClick={onCancel}>取消</button><button className="pill active" style={{ padding: "6px 14px", fontSize: 13 }} onClick={() => onGenerate(cfg)}>生成</button></div>
      </div>
    </div>
  );
}
