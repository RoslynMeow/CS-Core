import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClipboard,
  faCompass,
  faCopy,
  faDice,
  faLink,
  faPen,
  faPlus,
  faStar,
} from "@fortawesome/free-solid-svg-icons";
import { Graph, alphaLabels, buildGraphDump } from "../lib/graph";
import { buildMemoryUrl } from "../lib/memoryDump";
import { MathText } from "../lib/tex";

/**
 * 通用图 · 交互画布（开发期测试页）
 * ==========
 * 交互：
 *  - 移动：拖拽顶点；点击顶点选中并查看 入度/出度/邻接
 *  - 连线：点第一个顶点（高亮）→ 点第二个顶点连边；Shift+点击也可
 *  - 新建：点画布空白处新增顶点
 *  - 删除：点击顶点删除（含其所有边；顶点重编号，保持标签稳定）
 * 布局：环形 / 树形 / 力导向 / 自由拖拽（手动位置覆盖）
 */

type Layout = "circle" | "tree" | "force" | "free";
type Tool = "move" | "addEdge" | "addVertex" | "delete";
const SVG_W = 760,
  SVG_H = 440;
const V_R = 17;

// ---- 随机生成模态框类型 ----------------
type GenType =
  | "tree"
  | "binary"
  | "complete"
  | "skew"
  | "graph"
  | "dcyclic"
  | "dag"
  | "ucyclic"
  | "uacyclic";
type WeightMode = "none" | "random";
type CopyFormat = "spec" | "adjlist" | "json";
type GenCfg = {
  type: GenType;
  n: number;
  p: number; // 边密度
  directed: boolean; // 图（通用）的方向
  alpha: boolean; // 标签：字母 vs 数字
  weighted: WeightMode;
  skewRandom: boolean; // 偏斜树：随机排列 vs 自然序
  connected: boolean; // 无向无环图：保证连通（单棵树）
  k: number; // 无向无环图（不连通时）的树数
};
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
const GEN_TYPE_LABEL: Record<GenType, string> = {
  tree: "树",
  binary: "二叉树",
  complete: "完全二叉树",
  skew: "偏二叉树",
  graph: "图",
  dcyclic: "有向有环图",
  dag: "有向无环图",
  ucyclic: "无向有环图",
  uacyclic: "无向无环图",
};
const COPY_FMT_DESC: Record<CopyFormat, string> = {
  spec: "紧凑边集：0-1,1-2:5（含权重）",
  adjlist: "邻接表：每行 u: v1(权重), v2",
  json: "完整图数据：顶点数 / 有向 / 标签 / 边",
};

export function GraphStudio() {
  // 默认空图：无顶点、无边（有本地保存时挂载后恢复）
  const [n, setN] = useState(0);
  const [directed, setDirected] = useState(false);
  const [edgeSpec, setEdgeSpec] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [layout, setLayout] = useState<Layout>("tree");
  const [repr, setRepr] = useState<"adjlist" | "adjmat" | "array" | "edges">(
    "adjlist",
  ); // 内存表示
  const [root, setRoot] = useState(0);
  const [tool, setTool] = useState<Tool>("move");
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null); // addEdge 第一个端点
  const [drag, setDrag] = useState<number | null>(null); // 正在拖的顶点
  const [manual, setManual] = useState<
    Record<number, { x: number; y: number }>
  >({}); // 手动位置
  const [msg, setMsg] = useState("");
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null); // 连线预览终点
  const [hoverV, setHoverV] = useState<number | null>(null); // 悬停顶点
  const [hoverE, setHoverE] = useState<{ u: number; v: number } | null>(null); // 悬停边
  const [editing, setEditing] = useState<number | null>(null); // 正在重命名的顶点
  const [editVal, setEditVal] = useState("");
  const [view, setView] = useState({ tx: 0, ty: 0, s: 1 }); // 视口：平移 + 缩放
  const [pan, setPan] = useState<{
    startX: number;
    startY: number;
    tx: number;
    ty: number;
  } | null>(null); // 正在平移
  // 撤销/重做历史：双栈（操作前快照栈 + redo 栈；视口/选中不入栈）
  type GraphSnap = {
    n: number;
    directed: boolean;
    edgeSpec: string;
    labels: string[];
    manual: Record<number, { x: number; y: number }>;
  };
  const [hist, setHist] = useState<GraphSnap[]>([]);
  const [redoStack, setRedoStack] = useState<GraphSnap[]>([]);
  const histRef = useRef({ hist: [] as GraphSnap[], redo: [] as GraphSnap[] }); // 供快捷键读最新
  histRef.current = { hist, redo: redoStack };
  const pushHistory = () => {
    const snap: GraphSnap = {
      n,
      directed,
      edgeSpec,
      labels: [...labels],
      manual: { ...manual },
    }; // 操作前状态
    setHist((h) => (h.length > 80 ? h.slice(-80) : h).concat(snap));
    setRedoStack([]); // 新操作清掉 redo
  };
  const applySnapshot = (snap: GraphSnap) => {
    setN(snap.n);
    setDirected(snap.directed);
    setEdgeSpec(snap.edgeSpec);
    setLabels([...snap.labels]);
    setManual({ ...snap.manual });
  };
  const undo = () => {
    const { hist: h } = histRef.current;
    if (h.length === 0) return;
    const prev = h[h.length - 1]; // 最近一次操作的「操作前」态
    setRedoStack((r) => [
      ...r,
      { n, directed, edgeSpec, labels: [...labels], manual: { ...manual } },
    ]); // 当前态入 redo
    applySnapshot(prev);
    setHist((hh) => hh.slice(0, -1));
    setSelected(null);
    setPending(null);
    setMsg("撤销");
  };
  const redo = () => {
    const { redo: rs } = histRef.current;
    if (rs.length === 0) return;
    const next = rs[rs.length - 1];
    pushHistory(); // 当前（撤销后）态回推为操作前
    applySnapshot(next);
    setRedoStack((r) => r.slice(0, -1));
    setSelected(null);
    setPending(null);
    setMsg("重做");
  };
  // 所有修改操作统一先 pushHistory（由各 handler 开头调用）
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<Graph | null>(null);

  // 图模型：从 n + directed + edgeSpec 重建
  const g = useMemo(() => {
    const graph = new Graph(n, { directed, labels });
    const r = graph.fromSpec(edgeSpec);
    if (!r.ok) setMsg(r.error ?? "");
    gRef.current = graph;
    return graph;
  }, [n, directed, edgeSpec, labels]);

  // 自动布局（free 时用当前 manual，缺省先铺环形）
  const autoPos = useMemo(() => {
    if (layout === "tree")
      return g.layoutTree(root, {
        x0: 20,
        y0: 10,
        w: SVG_W - 40,
        h: SVG_H - 20,
      }).pos;
    if (layout === "force")
      return g.layoutForce(SVG_W / 2, SVG_H / 2, SVG_W, SVG_H, 160);
    return g.layoutCircle(
      SVG_W / 2,
      SVG_H / 2,
      Math.min(SVG_W, SVG_H) / 2 - 46,
    );
  }, [g, layout, root, n, directed]);

  // 最终位置：手动覆盖优先，否则自动布局
  const pos = useMemo(() => {
    const m: Record<number, { x: number; y: number }> = {};
    for (let i = 0; i < g.n; i++)
      m[i] = manual[i] ?? autoPos[i] ?? { x: 100 + i * 30, y: 200 };
    return m;
  }, [g, layout, manual, autoPos]);

  // ---- 视口变换：world（顶点坐标）⇄ SVG 坐标 ----
  const worldToSvg = (p: { x: number; y: number }) => ({
    x: p.x * view.s + view.tx,
    y: p.y * view.s + view.ty,
  });
  const svgToWorld = (p: { x: number; y: number }) => ({
    x: (p.x - view.tx) / view.s,
    y: (p.y - view.ty) / view.s,
  });

  // 顶点列表（渲染用）；g.n 变化时重建
  const activeVertices = useMemo(
    () => Array.from({ length: g.n }, (_, i) => i),
    [g.n],
  );

  const analysis = useMemo(() => {
    if (!gRef.current) return null;
    const gg = gRef.current;
    const comps = gg.connectedComponents();
    return {
      n: gg.n,
      m: gg.edgeCount(),
      deg: gg.degree(),
      indeg: gg.indegree(),
      outdeg: gg.outdegree(),
      cycle: gg.hasCycle(),
      comps,
      isTree: gg.isTree(),
      isForest: gg.isForest(),
      topo: gg.topologicalOrder(),
      adj: gg.adj(),
    };
  }, [g]);

  // 顶点世界坐标 → SVG 坐标（考虑 viewBox 等比缩放）
  const svgPoint = (
    e: React.PointerEvent | React.MouseEvent,
  ): { x: number; y: number } => {
    const svg = svgRef.current!;
    // 容器像素 → viewBox 用户坐标：SVG 保持纵横比（内容不变形），换算时补偿纵向留白
    const rect = svg.getBoundingClientRect();
    const contentW = rect.width;
    const contentH = contentW * (SVG_H / SVG_W); // 内容实际显示高度（等比）
    const padY = Math.max(0, (rect.height - contentH) / 2); // 纵向留白
    return {
      x: ((e.clientX - rect.left) / contentW) * SVG_W,
      y: ((e.clientY - rect.top - padY) / contentH) * SVG_H,
    };
  };

  const hitVertex = (p: { x: number; y: number }): number | null => {
    for (let i = g.n - 1; i >= 0; i--) {
      const v = pos[i];
      if (v && Math.hypot(p.x - v.x, p.y - v.y) <= V_R + 6) return i;
    }
    return null;
  };

  // 点到线段距离（边命中检测）
  const distToSeg = (
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): number => {
    const dx = bx - ax,
      dy = by - ay;
    const L2 = dx * dx + dy * dy;
    if (L2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  const hitEdge = (p: {
    x: number;
    y: number;
  }): { u: number; v: number } | null => {
    for (const e of g.edges) {
      const a = pos[e.u],
        b = pos[e.v];
      if (!a || !b) continue;
      if (distToSeg(p.x, p.y, a.x, a.y, b.x, b.y) <= 8)
        return { u: e.u, v: e.v };
    }
    return null;
  };

  // 边 spec 序列化（带权重）
  const specFromEdges = (
    es: { u: number; v: number; weight?: number }[],
  ): string =>
    es
      .map(
        (e) =>
          `${e.u}-${e.v}${e.weight !== undefined && e.weight !== 1 ? ":" + e.weight : ""}`,
      )
      .join(",");
  // 删除顶点（重编号 + 位置重排）
  const removeVertex = (v: number) => {
    pushHistory();
    const gg = gRef.current!;
    const keep = gg.edges
      .filter((e) => e.u !== v && e.v !== v)
      .map(
        (e) =>
          `${e.u > v ? e.u - 1 : e.u}-${e.v > v ? e.v - 1 : e.v}${e.weight !== undefined && e.weight !== 1 ? ":" + e.weight : ""}`,
      );
    setN((nn) => Math.max(1, nn - 1));
    setEdgeSpec(keep.join(","));
    setLabels((ls) => {
      const nl = ls.filter((_, i) => i !== v);
      return nl.length ? nl : ["0"];
    });
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
    setMsg(`删除顶点 ${g.labels[v] ?? v}（含其边，编号重排）`);
  };
  // 删除边（从 spec 移除）
  const removeEdge = (u: number, v: number) => {
    pushHistory();
    const gg = gRef.current!;
    setEdgeSpec(
      specFromEdges(
        gg.edges.filter(
          (e) =>
            !(
              (e.u === u && e.v === v) ||
              (!gg.directed && e.u === v && e.v === u)
            ),
        ),
      ),
    );
    setMsg(`取消边 ${g.labels[u] ?? u}—${g.labels[v] ?? v}`);
  };
  // 设边权重
  const setEdgeWeight = (u: number, v: number, w: number) => {
    pushHistory();
    const gg = gRef.current!;
    gg.setWeight(u, v, w);
    setEdgeSpec(specFromEdges(gg.edges));
    setMsg(`边 ${g.labels[u] ?? u}—${g.labels[v] ?? v} 权重 ${w}`);
  };
  // 新建顶点
  const addVertexAt = (p: { x: number; y: number }) => {
    pushHistory();
    const nn = g.n + 1;
    setN(nn);
    setManual((m) => ({ ...m, [g.n]: p }));
    setLabels((ls) => [...ls, String(ls.length)]);
    setSelected(g.n);
    setMsg(`新建顶点 ${g.n}`);
  };
  // 连线
  const link = (a: number, b: number) => {
    pushHistory();
    const gg = gRef.current!;
    const exists = gg.edges.some(
      (x) =>
        (x.u === a && x.v === b) || (!gg.directed && x.u === b && x.v === a),
    );
    if (!exists) setEdgeSpec((s) => (s ? s + "," : "") + `${a}-${b}`);
    setPending(null);
    setSelected(null);
    setTool("move");
    setMsg(
      exists ? "边已存在" : `连线 ${g.labels[a] ?? a}—${g.labels[b] ?? b}`,
    );
  };

  // ---- 右键菜单 ----
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    sx: number;
    sy: number;
    target: number | null;
    edge: { u: number; v: number; weight?: number } | null;
  } | null>(null);
  const [genModal, setGenModal] = useState(false); // 随机生成模态框
  const [copyModal, setCopyModal] = useState(false); // 复制边属性模态框

  // ---- 画布指针事件 ----
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return; // 右键走 onContextMenu
    setMenu(null);
    svgRef.current?.setPointerCapture?.(e.pointerId); // capture 定在 svg 根：重渲染子元素不丢拖拽
    const svgP = svgPoint(e);
    const p = svgToWorld(svgP); // 命中/顶点逻辑用 world 坐标
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
          setMsg(`起点 ${g.labels[v] ?? v}，再点第二个顶点`);
        } else if (pending === v) {
          setPending(null);
          setMsg("");
        } else link(pending, v);
      }
      return;
    }
    // move 模式：点顶点=选中/拖动；空白=平移画布
    if (v !== null) {
      // Shift+点击 = 临时连线（不用切工具）
      if (e.shiftKey) {
        if (pending === null) {
          setPending(v);
          setSelected(v);
          setTool("addEdge");
          setMsg(`起点 ${g.labels[v] ?? v}，再点第二个顶点`);
        } else link(pending, v);
        return;
      }
      setSelected(v);
      if (tool === "move") {
        setDrag(v);
        const vpos = pos[v];
        if (vpos) setDragStart({ x: vpos.x, y: vpos.y }); // world 坐标
      }
    } else if (tool === "move") {
      // 空白按下：取消选中并开始平移画布（记录视口起点与指针）
      setSelected(null);
      setPan({ startX: svgP.x, startY: svgP.y, tx: view.tx, ty: view.ty });
    } else setSelected(null);
  };
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragPointer, setDragPointer] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // 改名统一走右键菜单（双击易与连选误触发，不绑定）
  const commitRename = () => {
    if (editing !== null) {
      const val = editVal.trim() || String(editing);
      setLabels((ls) => ls.map((x, i) => (i === editing ? val : x)));
      setMsg(`顶点重命名为 ${val}`);
    }
    setEditing(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const svgP = svgPoint(e);
    if (pan) {
      // 平移画布：视口位移 = 指针位移（svg 坐标差）
      setView((v) => ({
        ...v,
        tx: pan.tx + (svgP.x - pan.startX),
        ty: pan.ty + (svgP.y - pan.startY),
      }));
      return;
    }
    if (drag !== null && dragStart) {
      const p = svgToWorld(svgP);
      if (!dragPointer) {
        setDragPointer(p);
        return;
      }
      const dx = p.x - dragPointer.x,
        dy = p.y - dragPointer.y;
      const np = { x: dragStart.x + dx, y: dragStart.y + dy };
      setManual((m) => ({ ...m, [drag]: np }));
    }
    if (tool === "addEdge" && pending !== null) setHover(svgP);
    // 悬停高亮（非拖拽时）
    if (drag === null) {
      const p = svgToWorld(svgP);
      setHoverV(hitVertex(p));
      setHoverE(hitEdge(p));
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
  // 滚轮：以指针为中心缩放
  // 滚轮：以指针为中心缩放（原生监听，避免 React passive wheel 无法 preventDefault）
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    e.preventDefault();
    const svgP = svgPoint(e as unknown as React.WheelEvent);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setView((v) => {
      const s = Math.min(4, Math.max(0.25, v.s * factor));
      // 保持指针下世界点不动：world = (svgP - tx)/s 恒定
      const tx = svgP.x - (svgP.x - v.tx) * (s / v.s);
      const ty = svgP.y - (svgP.y - v.ty) * (s / v.s);
      return { tx, ty, s };
    });
  };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []); // 只绑一次，handler 经 ref 取最新
  // 顶栏高度：随窗口/内容变化实时测量，主区恰好占满剩余视口（整屏响应式，无页面级滚动条）
  const [hdrH, setHdrH] = useState(60);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".hdr");
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setHdrH(el.getBoundingClientRect().height),
    );
    setHdrH(el.getBoundingClientRect().height);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 挂载时恢复上次保存的图与表示（若存在；此后由自动保存维护）
  useEffect(() => {
    try {
      const raw = localStorage.getItem("graph-studio:last");
      if (raw) {
        const snap = JSON.parse(raw);
        if (typeof snap.n === "number" && typeof snap.edgeSpec === "string") {
          setN(snap.n);
          setDirected(!!snap.directed);
          setEdgeSpec(snap.edgeSpec);
          setLabels(
            Array.isArray(snap.labels)
              ? snap.labels
              : Array.from({ length: snap.n }, (_, i) => String(i)),
          );
          setManual(snap.manual ?? {});
          if (["adjlist", "adjmat", "array", "edges"].includes(snap.repr))
            setRepr(snap.repr);
          if (["tree", "circle", "force", "free"].includes(snap.layout))
            setLayout(snap.layout);
          if (typeof snap.root === "number")
            setRoot(Math.max(0, Math.min(snap.n - 1, snap.root)));
        }
      }
    } catch {
      /* 忽略损坏的本地存档 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 自动保存：图构造或表示变化即写 localStorage（首次挂载跳过，避免覆盖恢复值）
  const autoSaveReady = useRef(false);
  useEffect(() => {
    if (!autoSaveReady.current) {
      autoSaveReady.current = true;
      return;
    }
    try {
      localStorage.setItem(
        "graph-studio:last",
        JSON.stringify({
          n,
          directed,
          edgeSpec,
          labels,
          manual,
          repr,
          layout,
          root,
        }),
      );
    } catch {
      /* 忽略写入失败（隐私模式/满容量） */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, directed, edgeSpec, labels, manual, repr, layout, root]);

  // 快捷键：Delete/Esc / Ctrl+Z 撤销 / Ctrl+Shift+Z·Ctrl+Y 重做
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selected !== null) {
          removeVertex(selected);
          e.preventDefault();
        }
      } else if (e.key === "Escape") {
        setPending(null);
        setSelected(null);
        setMenu(null);
        setEditing(null);
        setGenModal(false);
        setCopyModal(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // ---- 随机生成（覆盖当前图，可撤销） ----
  const genGraph = (cfg: GenCfg) => {
    const minN = cfg.type === "dcyclic" || cfg.type === "ucyclic" ? 3 : 2;
    const n = Math.max(minN, Math.min(80, Math.floor(cfg.n) || minN));
    const labels = cfg.alpha
      ? alphaLabels(n)
      : Array.from({ length: n }, (_, i) => String(i));
    const lopts = { labels };
    const weighted = cfg.weighted === "random";
    let gg: Graph;
    let ly: Layout = "tree";
    switch (cfg.type) {
      case "tree":
        gg = Graph.randomTree(n, { ...lopts, weighted });
        break;
      case "binary":
        gg = Graph.randomBinaryTree(n, { ...lopts, weighted });
        break;
      case "complete":
        gg = Graph.randomCompleteBinaryTree(n, { ...lopts, weighted });
        break;
      case "skew":
        gg = Graph.randomSkewTree(n, {
          ...lopts,
          weighted,
          random: cfg.skewRandom,
        });
        break;
      case "graph":
        gg = Graph.randomGraph(n, cfg.p, {
          directed: cfg.directed,
          ...lopts,
          weighted,
        });
        ly = "force";
        break;
      case "dcyclic":
        gg = Graph.randomGraphWithCycle(n, cfg.p, {
          directed: true,
          ...lopts,
          weighted,
        });
        ly = "force";
        break;
      case "dag":
        gg = Graph.randomDAG(n, cfg.p, { ...lopts, weighted });
        ly = "force";
        break;
      case "ucyclic":
        gg = Graph.randomGraphWithCycle(n, cfg.p, {
          directed: false,
          ...lopts,
          weighted,
        });
        ly = "force";
        break;
      case "uacyclic":
        gg = cfg.connected
          ? Graph.randomTree(n, { ...lopts, weighted })
          : Graph.randomForest(n, Math.max(1, Math.min(cfg.k, n)), {
              ...lopts,
              weighted,
            });
        break;
    }
    pushHistory(); // 操作前快照（可撤销）
    setN(gg.n);
    setDirected(gg.directed);
    setEdgeSpec(specFromEdges(gg.edges));
    setLabels([...gg.labels]);
    setManual({});
    setRoot(0);
    setLayout(ly);
    setSelected(null);
    setPending(null);
    setMsg(
      `已随机生成：${GEN_TYPE_LABEL[cfg.type]}（${gg.n} 顶点 · ${gg.edges.length} 边）`,
    );
  };
  const menuReset = () => {
    setManual({});
    setView({ tx: 0, ty: 0, s: 1 });
    setMsg("已回到自动布局并复位视口");
  };

  const edgePos = (u: number, v: number) => {
    const wa = pos && pos[u],
      wb = pos && pos[v];
    if (!wa || !wb) return { ax: 0, ay: 0, bx: 0, by: 0, mx: 0, my: 0 };
    const a = worldToSvg(wa),
      b = worldToSvg(wb);
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len,
      uy = dy / len;
    const off = 4;
    return {
      ax: a.x + ux * (V_R + off),
      ay: a.y + uy * (V_R + off),
      bx: b.x - ux * (V_R + off),
      by: b.y - uy * (V_R + off),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  };

  const selInfo =
    selected !== null && analysis ? (
      <div
        style={{
          border: "1px solid #c7d2fe",
          borderRadius: 10,
          padding: 8,
          background: "#eef2ff",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <b>顶点 {g.labels[selected]}</b>
        {directed
          ? ` · 入度 ${analysis.indeg[selected]} 出度 ${analysis.outdeg[selected]}（总 ${analysis.indeg[selected] + analysis.outdeg[selected]}）`
          : ` · 度 ${analysis.deg[selected]}`}
        <div style={{ fontSize: 12, color: "#475569" }}>
          邻接：
          {analysis.adj[selected].map(([v]) => g.labels[v]).join(", ") || "∅"}
        </div>
      </div>
    ) : null;

  // ---- 内存表示视图（模式参数「表示」切换）----
  const reprContent = (() => {
    if (!analysis) return null;
    // 伪地址：链式节点/数组元素按序分配
    const base = 0x555555559800;
    const addr = (i: number) => `0x${(base + i * 0x10).toString(16)}`;
    const cell = (v: string, color = "#6366f1", note = "", addrS?: string) => (
      <div
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
          margin: 2,
        }}
      >
        <div
          style={{
            minWidth: 46,
            textAlign: "center",
            padding: "4px 6px",
            borderRadius: 8,
            background: "#fff",
            border: `1.5px solid ${color}`,
            fontSize: 12,
            fontWeight: 700,
            color: "#0f172a",
            fontFamily: "monospace",
          }}
        >
          {v}
        </div>
        {addrS && (
          <div
            style={{ fontFamily: "monospace", fontSize: 8, color: "#94a3b8" }}
          >
            {addrS}
          </div>
        )}
        {note && <div style={{ fontSize: 9, color: "#64748b" }}>{note}</div>}
      </div>
    );
    if (repr === "adjmat") {
      // 邻接矩阵（权重 / 布尔）— 用真 <table>：列头与格子同格距，列数增多不错位
      const mat = g.mat();
      return (
        <div style={{ overflowX: "auto", padding: 4 }}>
          <table
            style={{
              borderCollapse: "separate",
              borderSpacing: "1px 2px",
              tableLayout: "fixed", // 列宽以表头行为准，列头/格子必然对齐
            }}
          >
            <thead>
              <tr>
                <th style={{ width: 26, padding: 0 }} />
                {g.labels.map((l, i) => (
                  <th
                    key={i}
                    style={{
                      width: 36,
                      padding: "0 0 3px",
                      textAlign: "center",
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#64748b",
                    }}
                  >
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mat.map((row, r) => (
                <tr key={r}>
                  <td
                    style={{
                      textAlign: "center",
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#64748b",
                      padding: 0,
                      verticalAlign: "middle",
                    }}
                  >
                    {g.labels[r]}
                  </td>
                  {row.map((w, c) => (
                    <td
                      key={c}
                      style={{
                        height: 30,
                        boxSizing: "border-box",
                        padding: 0,
                        textAlign: "center",
                        verticalAlign: "middle",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: "monospace",
                        background:
                          w === null
                            ? "#f8fafc"
                            : selected === r || selected === c
                              ? "#eef2ff"
                              : "#4f46e5",
                        color:
                          w === null
                            ? "#cbd5e1"
                            : selected === r || selected === c
                              ? "#4f46e5"
                              : "#fff",
                        border: `1px solid ${w === null ? "#e2e8f0" : "#c7d2fe"}`,
                      }}
                    >
                      {w === null ? "·" : w}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
            <MathText
              text={
                "邻接矩阵 · $M[i][j]=1/w_{ij}$（权重；无向对称；行高亮选中顶点）"
              }
            />
          </div>
        </div>
      );
    }
    if (repr === "edges") {
      // 边集数组
      return (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            padding: 4,
          }}
        >
          {g.edges.map((e, i) => (
            <div
              key={i}
              style={{
                display: "inline-flex",
                alignItems: "center",
                margin: 2,
              }}
            >
              {cell(g.labels[e.u], "#6366f1", "", addr(i * 2))}
              <span style={{ fontSize: 12, color: "#94a3b8", margin: "0 2px" }}>
                —
              </span>
              {cell(g.labels[e.v], "#0ea5e9", "", addr(i * 2 + 1))}
              {e.weight !== undefined && e.weight !== 1 && (
                <span style={{ fontSize: 10, color: "#f59e0b", marginLeft: 3 }}>
                  w:{e.weight}
                </span>
              )}
            </div>
          ))}
        </div>
      );
    }
    if (repr === "array") {
      // parent 数组（树）：每元素存父下标；根 -1
      return (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            padding: 4,
          }}
        >
          {g.labels.map((l, i) => (
            <div
              key={i}
              style={{
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                margin: 2,
              }}
            >
              {cell(
                i === root ? "−1" : String(g.bfs(root).parent[i]),
                i === root ? "#dc2626" : "#10b981",
                l,
                addr(i),
              )}
            </div>
          ))}
          <div style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>
            parent[i] · 根 = −1 · 压缩表示（n 个槽）
          </div>
        </div>
      );
    }
    // 邻接表（链式）
    const adj = g.adj();
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-start",
          padding: 4,
        }}
      >
        {adj.map((neighbors, u) => (
          <div
            key={u}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#475569",
                marginBottom: 2,
              }}
            >
              {g.labels[u]}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
              {cell(
                g.labels[u],
                selected === u ? "#4f46e5" : "#6366f1",
                "head",
                addr(u),
              )}
              {neighbors.map(([v], j) => (
                <span
                  key={j}
                  style={{ display: "inline-flex", alignItems: "center" }}
                >
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>→</span>
                  {cell(
                    g.labels[v],
                    selected === v ? "#4f46e5" : "#0ea5e9",
                    "",
                    addr(u * 10 + j + 1),
                  )}
                </span>
              ))}
              {neighbors.length === 0 && (
                <span style={{ fontSize: 12, color: "#cbd5e1" }}>→ ∅</span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  })();

  // 菜单上下文（窄化用局部变量，避免 TS 不缩窄嵌套属性）
  const menuVtx: number | null = menu?.target ?? null;
  const menuEdge = menu?.edge ?? null;

  // 统计顶点着色：树=分层、图=按度
  const vertexColor = (i: number): string => {
    if (selected === i) return "#4f46e5";
    if (i === root) return "#dc2626"; // 根 = 红色（不限布局）
    const deg = analysis?.deg[i] ?? 0;
    if (deg >= 3) return "#f59e0b";
    if (deg === 2) return "#10b981";
    return "#eef2ff";
  };

  return (
    <div
      className="graph-root"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        height: `calc(100dvh - ${hdrH}px - 16px)`,
        overflow: "hidden",
        // 底部留 16px 呼吸空间，不贴合视口（与 .graph-root 的 padding-bottom 对应）
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 17 }}>通用图 · 交互画布</h2>
          <span style={{ color: "#64748b", fontSize: 12 }}>
            拖拽/连线/右键构造 · 切换「表示」看内存布局（后期并入知识点页）
          </span>
        </div>

        {/* 行 1：模式参数 + 知识点参数（合并一行，紧凑） */}
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
            marginTop: 8,
            padding: "6px 10px",
            borderRadius: 12,
            background: "#eef2ff",
            border: "1px solid #c7d2fe",
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 800, color: "#4338ca" }}>
            模式
          </span>
          <label
            style={{
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <input
              type="checkbox"
              checked={directed}
              onChange={(e) => setDirected(e.target.checked)}
            />{" "}
            有向
          </label>
          <span style={{ fontSize: 12 }}>布局</span>
          {(
            [
              ["tree", "树形"],
              ["circle", "环形"],
              ["force", "力导向"],
              ["free", "自由"],
            ] as Array<[Layout, string]>
          ).map(([v, lb]) => (
            <button
              key={v}
              className={`pill ${layout === v ? "active" : ""}`}
              style={{ padding: "3px 10px", fontSize: 12 }}
              onClick={() => {
                setLayout(v);
                setMsg("");
              }}
            >
              {lb}
            </button>
          ))}
          <button
            className="ghost"
            style={{ padding: "4px 10px", fontSize: 12 }}
            onClick={() => {
              pushHistory();
              setEdgeSpec("");
              setMsg("已清空全部边");
            }}
          >
            清空
          </button>
          <button
            className="ghost"
            style={{ padding: "4px 10px", fontSize: 12 }}
            onClick={menuReset}
          >
            重置布局
          </button>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#475569" }}>
            {analysis?.n} 顶点 · {analysis?.m} 边 ·{" "}
            <b
              style={{
                color:
                  analysis?.n === 0
                    ? "#94a3b8"
                    : analysis?.isTree
                      ? "#059669"
                      : analysis?.isForest
                        ? "#0ea5e9"
                        : "#dc2626",
              }}
            >
              {analysis?.n === 0
                ? "空"
                : analysis?.isTree
                  ? "树"
                  : analysis?.isForest
                    ? "森林"
                    : "含环"}
            </b>
          </span>
          {msg && <span style={{ fontSize: 11, color: "#059669" }}>{msg}</span>}
        </div>
      </div>

      {/* 主轴：画布 | 内存表示（各占 50%） */}
      <div style={{ display: "flex", gap: 10, flex: 1, minHeight: 0 }}>
        <div
          style={{
            flex: "1 1 0",
            minWidth: 0,
            border: "1px solid #c7d2fe",
            borderRadius: 12,
            overflow: "hidden",
            background: "#fff",
            position: "relative",
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width={SVG_W}
            height={SVG_H}
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              cursor:
                tool === "delete"
                  ? "not-allowed"
                  : tool === "addVertex"
                    ? "copy"
                    : tool === "addEdge"
                      ? "crosshair"
                      : "default",
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onDoubleClick={(e) => {
              e.preventDefault(); /* 改名走右键菜单 */
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              const p = svgPoint(e);
              const wp = svgToWorld(p);
              // 命中优先级：顶点 > 边 > 空白；命中顶点即选中
              const v = hitVertex(wp);
              const ed = v === null ? hitEdge(wp) : null;
              if (v !== null) setSelected(v);
              setMenu({
                x: e.clientX,
                y: e.clientY,
                sx: wp.x,
                sy: wp.y,
                target: v,
                edge: ed,
              });
            }}
          >
            {/* 边 */}
            {g.edges.map((e, i) => {
              const p = edgePos(e.u, e.v);
              const mid = { x: p.mx, y: p.my };
              const isHoverE =
                hoverE !== null &&
                ((hoverE.u === e.u && hoverE.v === e.v) ||
                  (!directed && hoverE.u === e.v && hoverE.v === e.u));
              const stroke = isHoverE
                ? "#7c3aed"
                : selected !== null && (e.u === selected || e.v === selected)
                  ? "#4f46e5"
                  : "#94a3b8";
              const sw = isHoverE
                ? 2.8
                : selected !== null && (e.u === selected || e.v === selected)
                  ? 2.4
                  : 1.6;
              // 权重徽章底色与边同源联动：悬停/选中邻接边时跟随高亮色
              const wFill = isHoverE
                ? "#7c3aed"
                : selected !== null && (e.u === selected || e.v === selected)
                  ? "#4f46e5"
                  : "#0f172a";
              const w =
                e.weight !== undefined && e.weight !== 1 ? e.weight : null;
              return (
                <g
                  key={i}
                  opacity={
                    pending !== null && (e.u === pending || e.v === pending)
                      ? 0.4
                      : 1
                  }
                >
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
                      transform={`rotate(${(Math.atan2(p.by - p.ay, p.bx - p.ax) * 180) / Math.PI} ${p.bx} ${p.by})`}
                    />
                  )}
                  {w !== null && (
                    <g>
                      <circle cx={mid.x} cy={mid.y} r={9} fill={wFill} />
                      <text
                        x={mid.x}
                        y={mid.y + 3}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={800}
                        fill="#fff"
                      >
                        {w}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
            {/* pending 连线预览（跟随鼠标） */}
            {tool === "addEdge" &&
              pending !== null &&
              pos[pending] &&
              hover && (
                <line
                  x1={worldToSvg(pos[pending]).x}
                  y1={worldToSvg(pos[pending]).y}
                  x2={hover.x}
                  y2={hover.y}
                  stroke="#6366f1"
                  strokeWidth={1.6}
                  strokeDasharray="6 4"
                />
              )}
            {/* 顶点 */}
            {activeVertices.map((i) => {
              const p = worldToSvg(pos[i]);
              if (!p) return null;
              const isSel = selected === i;
              const isPending = pending === i;
              const isHoverV = hoverV === i;
              const isRoot = i === root;
              const fill = isHoverV ? "#ddd6fe" : vertexColor(i);
              const stroke = isSel
                ? "#312e81"
                : isRoot
                  ? "#b91c1c"
                  : isHoverV
                    ? "#7c3aed"
                    : "#6366f1";
              const sw = isSel
                ? 2.6
                : isRoot
                  ? 2.4
                  : isPending
                    ? 2.2
                    : isHoverV
                      ? 2.4
                      : 1.4;
              const labelColor = isSel || isRoot ? "#fff" : "#1e293b";
              return (
                <g key={i}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={V_R}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={sw}
                  />
                  <text
                    x={p.x}
                    y={p.y + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill={labelColor}
                  >
                    {g.labels[i]}
                  </text>
                  {/* 根标注 */}
                  {isRoot && (
                    <text
                      x={p.x}
                      y={p.y - V_R - 3}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight={800}
                      fill="#dc2626"
                    >
                      根
                    </text>
                  )}
                  {/* 度标记（小字） */}
                  {analysis && directed && analysis.deg[i] > 0 && (
                    <text
                      x={p.x + V_R + 4}
                      y={p.y - V_R + 2}
                      fontSize={9}
                      fill="#64748b"
                    >
                      {analysis.deg[i]}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {/* 选中信息浮层（算法时用 caption 替代） */}
          {selInfo && (
            <div
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                maxWidth: 220,
              }}
            >
              {selInfo}
            </div>
          )}
          {/* 重命名输入框（双击顶点） */}
          {editing !== null &&
            pos[editing] &&
            (() => {
              const sp = worldToSvg(pos[editing]);
              return (
                <div
                  style={{
                    position: "absolute",
                    left: `calc(${(sp.x / SVG_W) * 100}% - 44px)`,
                    top: `calc(${(sp.y / SVG_H) * 100}% - 38px)`,
                    zIndex: 40,
                  }}
                >
                  <input
                    className="txt"
                    autoFocus
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitRename();
                      } else if (e.key === "Escape") setEditing(null);
                    }}
                    style={{ width: 80, fontSize: 13, textAlign: "center" }}
                  />
                </div>
              );
            })()}
          {/* 右键菜单：按命中上下文（顶点 / 边 / 空白）显示不同项 */}
          {menu && (
            <div
              style={{
                position: "fixed",
                left: menu.x,
                top: menu.y,
                zIndex: 50,
                minWidth: 180,
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                boxShadow: "0 12px 32px rgba(15,23,42,.18)",
                padding: 6,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {menuVtx === null ? (
                menuEdge ? (
                  <>
                    <MenuHead
                      label={`边 ${g.labels[menuEdge.u] ?? menuEdge.u} — ${g.labels[menuEdge.v] ?? menuEdge.v}`}
                    />
                    <MenuItem
                      label={
                        menuEdge.weight !== undefined && menuEdge.weight !== 1
                          ? `权重：${menuEdge.weight}（点击修改）`
                          : "权重：1（点击修改）"
                      }
                      onClick={() => {
                        const w = prompt(
                          "输入边权重（正整数）：",
                          String(menuEdge!.weight ?? 1),
                        );
                        if (w !== null) {
                          const nw = Number(w.trim());
                          if (Number.isFinite(nw) && nw > 0)
                            setEdgeWeight(
                              menuEdge!.u,
                              menuEdge!.v,
                              Math.trunc(nw),
                            );
                          else setMsg("权重需为正整数");
                        }
                        setMenu(null);
                      }}
                    />
                    <MenuItem
                      label="取消此边"
                      danger
                      onClick={() => {
                        removeEdge(menuEdge!.u, menuEdge!.v);
                        setMenu(null);
                      }}
                    />
                  </>
                ) : (
                  <>
                    <MenuItem
                      label={
                        <>
                          <FontAwesomeIcon
                            icon={faPlus}
                            style={{ width: 13, marginRight: 6 }}
                          />
                          新建顶点
                        </>
                      }
                      onClick={() => {
                        addVertexAt({ x: menu.sx, y: menu.sy });
                        setMenu(null);
                      }}
                    />
                    <MenuDivider />
                    <MenuItem
                      label={
                        <>
                          <FontAwesomeIcon
                            icon={faDice}
                            style={{ width: 13, marginRight: 6 }}
                          />
                          随机生成…
                        </>
                      }
                      onClick={() => {
                        setMenu(null);
                        setGenModal(true);
                      }}
                    />
                    <MenuDivider />
                    <MenuItem
                      label={
                        <>
                          <FontAwesomeIcon
                            icon={faClipboard}
                            style={{ width: 13, marginRight: 6 }}
                          />
                          复制边属性…
                        </>
                      }
                      onClick={() => {
                        setMenu(null);
                        setCopyModal(true);
                      }}
                    />
                    <MenuDivider />
                    <MenuItem
                      label={
                        <>
                          <FontAwesomeIcon
                            icon={faCompass}
                            style={{ width: 13, marginRight: 6 }}
                          />
                          重置布局
                        </>
                      }
                      onClick={() => {
                        menuReset();
                        setMenu(null);
                      }}
                    />
                  </>
                )
              ) : (
                <>
                  <MenuHead label={`顶点 ${g.labels[menuVtx]}`} />
                  <MenuItem
                    label={
                      <>
                        <FontAwesomeIcon
                          icon={faPen}
                          style={{ width: 13, marginRight: 6 }}
                        />
                        重命名
                      </>
                    }
                    onClick={() => {
                      setEditing(menuVtx);
                      setEditVal(g.labels[menuVtx] ?? String(menuVtx));
                      setMenu(null);
                    }}
                  />
                  <MenuItem
                    label={
                      <>
                        <FontAwesomeIcon
                          icon={faStar}
                          style={{ width: 13, marginRight: 6 }}
                        />
                        设为根（树形布局/遍历起点）
                      </>
                    }
                    onClick={() => {
                      setRoot(menuVtx!);
                      setLayout((l) =>
                        l === "tree" || l === "free" ? "tree" : l,
                      );
                      setMsg(`根设为 ${g.labels[menuVtx]}`);
                      setMenu(null);
                    }}
                  />
                  <MenuItem
                    label={
                      <>
                        <FontAwesomeIcon
                          icon={faLink}
                          style={{ width: 13, marginRight: 6 }}
                        />
                        从此连线
                      </>
                    }
                    onClick={() => {
                      setPending(menuVtx);
                      setSelected(menuVtx);
                      setTool("addEdge");
                      setMsg(`起点 ${g.labels[menuVtx]}，再点第二个顶点`);
                      setMenu(null);
                    }}
                  />
                  <MenuItem
                    label="删除顶点（含其边）"
                    danger
                    onClick={() => {
                      removeVertex(menuVtx!);
                      setMenu(null);
                    }}
                  />
                </>
              )}
            </div>
          )}
          {/* 随机生成模态框（事件冒泡隔离：不触发画布/右键菜单；Esc/点遮罩关闭） */}
          {genModal && (
            <GenModal
              onCancel={() => setGenModal(false)}
              onGenerate={(cfg) => {
                genGraph(cfg);
                setGenModal(false);
              }}
            />
          )}
          {/* 复制边属性模态框 */}
          {copyModal && (
            <CopyModal
              g={g}
              edgeSpec={edgeSpec}
              onClose={() => setCopyModal(false)}
              onToast={(s) => setMsg(s)}
            />
          )}
          {/* 算法当前步骤 caption 已移除：图创建页只负责建图 */}
        </div>
        {/* 右栏：内存表示（画布与表示各占 50%） */}
        <div
          style={{
            flex: "1 1 0",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "8px 10px",
              fontSize: 11,
              fontWeight: 800,
              color: "#4338ca",
              display: "flex",
              gap: 6,
              alignItems: "center",
              flexWrap: "wrap",
              borderBottom: "1px solid #c7d2fe",
            }}
          >
            <span>内存表示</span>
            {(
              [
                ["adjlist", "邻接表"],
                ["adjmat", "矩阵"],
                ["array", "parent"],
                ["edges", "边集"],
              ] as Array<[typeof repr, string]>
            ).map(([v, lb]) => (
              <button
                key={v}
                className={`pill ${repr === v ? "active" : ""}`}
                style={{ padding: "2px 8px", fontSize: 11 }}
                onClick={() => setRepr(v)}
              >
                {lb}
              </button>
            ))}
            <button
              className="pill"
              style={{
                marginLeft: "auto",
                padding: "2px 8px",
                fontSize: 11,
              }}
              onClick={() => {
                location.href = buildMemoryUrl(
                  buildGraphDump(g, repr, { root }) as any,
                );
              }}
            >
              查看内存 ↗
            </button>
          </div>
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: 8,
              background: "#fff",
            }}
          >
            {reprContent}
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuHead({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "6px 12px",
        fontSize: 11,
        fontWeight: 800,
        color: "#64748b",
        textTransform: "uppercase",
        letterSpacing: ".04em",
      }}
    >
      {label}
    </div>
  );
}
function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "7px 12px",
        borderRadius: 8,
        fontSize: 13,
        cursor: "pointer",
        color: danger ? "#dc2626" : "#1e293b",
        fontWeight: 600,
      }}
      onMouseEnter={(e) =>
        ((e.target as HTMLDivElement).style.background = "#f8fafc")
      }
      onMouseLeave={(e) =>
        ((e.target as HTMLDivElement).style.background = "transparent")
      }
    >
      {label}
    </div>
  );
}
function MenuDivider() {
  return (
    <div style={{ height: 1, background: "#eef2f7", margin: "5px 6px" }} />
  );
}

// ---- 随机生成模态框 ----
// 事件冒泡隔离：遮罩 onPointerDown 全部 stopPropagation（不触发画布/右键菜单），
// 遮罩上 onContextMenu preventDefault+stopPropagation（右键不会重新弹菜单）；点击遮罩/Esc 关闭。
function ModalRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
        fontSize: 13,
      }}
    >
      <span style={{ width: 76, flexShrink: 0, color: "#475569" }}>
        {label}
      </span>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function GenModal({
  onCancel,
  onGenerate,
}: {
  onCancel: () => void;
  onGenerate: (cfg: GenCfg) => void;
}) {
  const [cfg, setCfg] = useState<GenCfg>({
    type: "tree",
    n: 10,
    p: 0.25,
    directed: false,
    alpha: false,
    weighted: "none",
    skewRandom: true,
    connected: true,
    k: 3,
  });
  const info = GEN_TYPES.find((t) => t.k === cfg.type)!;
  const isCyclic = cfg.type === "dcyclic" || cfg.type === "ucyclic";
  const hasDensity =
    cfg.type === "graph" ||
    cfg.type === "dcyclic" ||
    cfg.type === "dag" ||
    cfg.type === "ucyclic";
  const minN = isCyclic ? 3 : 2;
  const set = (patch: Partial<GenCfg>) => setCfg((c) => ({ ...c, ...patch }));
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.45)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onCancel();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(15,23,42,.3)",
          padding: 16,
          width: 350,
          maxWidth: "100%",
          maxHeight: "90vh",
          overflow: "auto",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>
          <FontAwesomeIcon
            icon={faDice}
            style={{ width: 15, marginRight: 8 }}
          />
          随机生成
        </div>
        <div style={{ marginBottom: 8 }}>
          <select
            className="txt"
            value={cfg.type}
            onChange={(e) => set({ type: e.target.value as GenType })}
            style={{ width: "100%", fontSize: 13 }}
          >
            {GEN_TYPES.map((t) => (
              <option key={t.k} value={t.k}>
                {t.label}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
            {info.desc}
          </div>
        </div>
        <ModalRow label="顶点数">
          <input
            type="number"
            min={minN}
            max={80}
            value={cfg.n}
            onChange={(e) =>
              set({ n: Math.floor(Number(e.target.value)) || minN })
            }
            className="txt"
            style={{ width: 72, fontSize: 13 }}
          />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            {minN}–80{isCyclic ? "（有环需 ≥3）" : ""}
          </span>
        </ModalRow>
        {hasDensity && (
          <ModalRow label="边密度 p">
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={cfg.p}
              onChange={(e) => set({ p: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span
              style={{
                fontSize: 12,
                color: "#475569",
                width: 38,
                textAlign: "right",
              }}
            >
              {cfg.p.toFixed(2)}
            </span>
          </ModalRow>
        )}
        {cfg.type === "graph" && (
          <ModalRow label="方向">
            <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={cfg.directed}
                onChange={(e) => set({ directed: e.target.checked })}
              />
              有向
            </label>
          </ModalRow>
        )}
        <ModalRow label="标签">
          <button
            className={`pill ${cfg.alpha ? "" : "active"}`}
            style={{ padding: "3px 10px", fontSize: 12 }}
            onClick={() => set({ alpha: false })}
          >
            数字 0,1,2…
          </button>
          <button
            className={`pill ${cfg.alpha ? "active" : ""}`}
            style={{ padding: "3px 10px", fontSize: 12 }}
            onClick={() => set({ alpha: true })}
          >
            字母 A,B,C…
          </button>
        </ModalRow>
        <ModalRow label="权重">
          <select
            className="txt"
            value={cfg.weighted}
            onChange={(e) => set({ weighted: e.target.value as WeightMode })}
            style={{ width: 170, fontSize: 13 }}
          >
            <option value="none">全 1（无权重）</option>
            <option value="random">随机 1–10</option>
          </select>
        </ModalRow>
        {cfg.type === "skew" && (
          <ModalRow label="偏斜序">
            <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={cfg.skewRandom}
                onChange={(e) => set({ skewRandom: e.target.checked })}
              />
              随机排列（否则自然序 0-1-2-…）
            </label>
          </ModalRow>
        )}
        {cfg.type === "uacyclic" && (
          <>
            <ModalRow label="连通">
              <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={cfg.connected}
                  onChange={(e) => set({ connected: e.target.checked })}
                />
                保证连通（生成一棵树）
              </label>
            </ModalRow>
            {!cfg.connected && (
              <ModalRow label="树数 k">
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, cfg.n)}
                  value={cfg.k}
                  onChange={(e) =>
                    set({
                      k: Math.max(1, Math.floor(Number(e.target.value)) || 1),
                    })
                  }
                  className="txt"
                  style={{ width: 72, fontSize: 13 }}
                />
              </ModalRow>
            )}
          </>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 14,
          }}
        >
          <button
            className="ghost"
            style={{ padding: "6px 14px", fontSize: 13 }}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="pill active"
            style={{ padding: "6px 14px", fontSize: 13 }}
            onClick={() => onGenerate(cfg)}
          >
            <FontAwesomeIcon
              icon={faDice}
              style={{ width: 13, marginRight: 6 }}
            />
            生成
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- 复制边属性模态框 ----
function CopyModal({
  g,
  edgeSpec,
  onClose,
  onToast,
}: {
  g: Graph;
  edgeSpec: string;
  onClose: () => void;
  onToast: (s: string) => void;
}) {
  const [fmt, setFmt] = useState<CopyFormat>("spec");
  const content = useMemo(() => {
    if (fmt === "spec") return edgeSpec;
    if (fmt === "adjlist") {
      const rows: string[] = [];
      for (let u = 0; u < g.n; u++) {
        const nbs = g
          .adj()
          [u].map(([v, w]) => (w === 1 ? String(v) : `${v}(${w})`));
        rows.push(nbs.length ? `${u}: ${nbs.join(", ")}` : `${u}: ∅`);
      }
      return rows.join("\n");
    }
    return JSON.stringify(
      {
        n: g.n,
        directed: g.directed,
        labels: g.labels,
        edges: g.edges.map((e) => ({
          u: e.u,
          v: e.v,
          ...(e.weight !== undefined && e.weight !== 1
            ? { weight: e.weight }
            : {}),
        })),
      },
      null,
      2,
    );
  }, [fmt, g, edgeSpec]);
  const doCopy = () => {
    try {
      navigator.clipboard.writeText(content);
      onToast("边属性已复制到剪贴板");
      onClose();
    } catch {
      onToast("复制失败");
    }
  };
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,.45)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(15,23,42,.3)",
          padding: 16,
          width: 380,
          maxWidth: "100%",
          maxHeight: "90vh",
          overflow: "auto",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>
          <FontAwesomeIcon
            icon={faClipboard}
            style={{ width: 15, marginRight: 8 }}
          />
          复制边属性
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
          选择导出格式，复制到剪贴板（当前 {g.n} 顶点 · {g.edges.length} 边）
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 6,
            flexWrap: "wrap",
          }}
        >
          {(["spec", "adjlist", "json"] as CopyFormat[]).map((v) => (
            <button
              key={v}
              className={`pill ${fmt === v ? "active" : ""}`}
              style={{ padding: "3px 10px", fontSize: 12 }}
              onClick={() => setFmt(v)}
            >
              {v === "spec" ? "边集 spec" : v === "adjlist" ? "邻接表" : "JSON"}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
          {COPY_FMT_DESC[fmt]}
        </div>
        <textarea
          readOnly
          value={content}
          rows={8}
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontFamily: "monospace",
            fontSize: 11,
            padding: 8,
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            background: "#f8fafc",
            color: "#1e293b",
            resize: "vertical",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 12,
          }}
        >
          <button
            className="ghost"
            style={{ padding: "6px 14px", fontSize: 13 }}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="pill active"
            style={{ padding: "6px 14px", fontSize: 13 }}
            onClick={doCopy}
          >
            <FontAwesomeIcon
              icon={faCopy}
              style={{ width: 13, marginRight: 6 }}
            />
            复制
          </button>
        </div>
      </div>
    </div>
  );
}
