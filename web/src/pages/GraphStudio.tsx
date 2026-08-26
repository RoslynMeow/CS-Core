import { useEffect, useMemo, useRef, useState } from 'react';
import { Graph, bfsSteps, dfsSteps, topoSteps, buildGraphDump, type AlgoStep } from '../lib/graph';
import { buildMemoryUrl } from '../lib/memoryDump';
import { usePlayback, type Playback } from '../engine/usePlayback';
import { PlaybackBar } from '../components/PlaybackBar';
import { Pseudocode } from '../components/Pseudocode';
import { MathText } from '../lib/tex';
import type { Text } from '../i18n/lang';

/**
 * 通用图 · 交互画布（开发期测试页）
 * ==========
 * 交互：
 *  - 移动：拖拽顶点；点击顶点选中并查看 入度/出度/邻接
 *  - 连线：点第一个顶点（高亮）→ 点第二个顶点连边；Shift+点击也可
 *  - 新建：点画布空白处新增顶点
 *  - 删除：点击顶点删除（含其所有边；顶点重编号，保持标签稳定）
 * 布局：环形 / 树形 / 力导向 / 自由拖拽（手动位置覆盖）
 * 算法展示（下一步）：顶部「BFS/DFS/拓扑」→ generate 帧 → 复用 PlaybackBar
 */

type Layout = 'circle' | 'tree' | 'force' | 'free';
type Tool = 'move' | 'addEdge' | 'addVertex' | 'delete';
type AlgoKind = 'none' | 'bfs' | 'dfs' | 'topo';
type AlgoFrame = {
  line: number;
  scene: {
    current: number | null;
    exploring: number | null;
    visited: number[];
    frontier: number[];
    order: number[];
    edge: [number, number] | null;
  };
  caption: { zh: string; en: string };
};
// 伪代码（中英）；由 Pseudocode 组件渲染 MathText
const ALGO_CODE: Record<Exclude<AlgoKind, 'none'>, Text[]> = {
  bfs: [
    { zh: 'for 每个顶点: $visited[i] \\gets false$', en: 'for each v: visited[i] = false' },
    { zh: '$Q \\gets \\{s\\}$; $visited[s] \\gets true$', en: 'Q ← {s}; visited[s] = true' },
    { zh: 'while $Q \\neq \\emptyset$:', en: 'while Q ≠ ∅:' },
    { zh: '  $u \\gets Q$ 出队; 访问 $u$', en: '  u ← Q.pop(); visit u' },
    { zh: '  for 每个邻接 $v$: if $!visited[v]$:', en: '  for each v ∈ adj[u]: if !visited[v]:' },
    { zh: '    $visited[v] \\gets true$; $Q \\gets Q \\cup \\{v\\}$', en: '    visited[v] = true; Q.push(v)' },
  ],
  dfs: [
    { zh: 'for 每个顶点: $visited[i] \\gets false$', en: 'for each v: visited[i] = false' },
    { zh: '$S \\gets \\{s\\}$', en: 'S ← {s}' },
    { zh: 'while $S \\neq \\emptyset$:', en: 'while S ≠ ∅:' },
    { zh: '  $u \\gets S$ 弹出', en: '  u ← S.pop()' },
    { zh: '  if $!visited[u]$: 访问 $u$; $visited[u] \\gets true$', en: '  if !visited[u]: visit u; visited[u] = true' },
    { zh: '  for 每个邻接 $v$: if $!visited[v]$: $S \\gets S \\cup \\{v\\}$', en: '  for each v ∈ adj[u]: if !visited[v]: S.push(v)' },
  ],
  topo: [
    { zh: '// Kahn：计算入度 $in[v]$', en: '// Kahn: compute indegree' },
    { zh: '$Q \\gets$ 所有 $in[v]=0$ 的顶点', en: 'Q ← all v with indeg[v]=0' },
    { zh: 'while $Q \\neq \\emptyset$:', en: 'while Q ≠ ∅:' },
    { zh: '  $u \\gets Q$ 出队 → 加入拓扑序', en: '  u ← Q.pop → append to order' },
    { zh: '  for 每个邻接 $v$: $in[v] \\gets in[v]-1$', en: '  for each v ∈ adj[u]: indeg[v]−−' },
    { zh: '    if $in[v]=0$: $Q.push(v)$', en: '    if indeg[v]=0: Q.push(v)' },
    { zh: '// 输出长度 < n ⇒ 存在环', en: '// order.length < n ⇒ cycle' },
  ],
};
const SVG_W = 760, SVG_H = 440;
const V_R = 17;

export function GraphStudio() {
  const [n, setN] = useState(7);
  const [directed, setDirected] = useState(false);
  const [edgeSpec, setEdgeSpec] = useState('0-1,1-2,2-3,3-4,2-5,5-6');
  const [labels, setLabels] = useState<string[]>(['0', '1', '2', '3', '4', '5', '6']);
  const [layout, setLayout] = useState<Layout>('tree');
  const [repr, setRepr] = useState<'adjlist' | 'adjmat' | 'array' | 'edges'>('adjlist'); // 内存表示
  const [root, setRoot] = useState(0);
  const [tool, setTool] = useState<Tool>('move');
  const [algo, setAlgo] = useState<AlgoKind>('none');
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null); // addEdge 第一个端点
  const [drag, setDrag] = useState<number | null>(null);       // 正在拖的顶点
  const [manual, setManual] = useState<Record<number, { x: number; y: number }>>({}); // 手动位置
  const [msg, setMsg] = useState('');
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null); // 连线预览终点
  const [hoverV, setHoverV] = useState<number | null>(null);   // 悬停顶点
  const [hoverE, setHoverE] = useState<{ u: number; v: number } | null>(null); // 悬停边
  const [editing, setEditing] = useState<number | null>(null); // 正在重命名的顶点
  const [editVal, setEditVal] = useState('');
  const [view, setView] = useState({ tx: 0, ty: 0, s: 1 });   // 视口：平移 + 缩放
  const [pan, setPan] = useState<{ startX: number; startY: number; tx: number; ty: number } | null>(null); // 正在平移
  // 撤销/重做历史：双栈（操作前快照栈 + redo 栈；视口/选中不入栈）
  type GraphSnap = { n: number; directed: boolean; edgeSpec: string; labels: string[]; manual: Record<number, { x: number; y: number }> };
  const [hist, setHist] = useState<GraphSnap[]>([]);
  const [redoStack, setRedoStack] = useState<GraphSnap[]>([]);
  const histRef = useRef({ hist: [] as GraphSnap[], redo: [] as GraphSnap[] }); // 供快捷键读最新
  histRef.current = { hist, redo: redoStack };
  const pushHistory = () => {
    const snap: GraphSnap = { n, directed, edgeSpec, labels: [...labels], manual: { ...manual } }; // 操作前状态
    setHist(h => (h.length > 80 ? h.slice(-80) : h).concat(snap));
    setRedoStack([]); // 新操作清掉 redo
  };
  const applySnapshot = (snap: GraphSnap) => {
    setN(snap.n); setDirected(snap.directed); setEdgeSpec(snap.edgeSpec); setLabels([...snap.labels]); setManual({ ...snap.manual });
  };
  const undo = () => {
    const { hist: h, redo: rs } = histRef.current;
    if (h.length === 0) return;
    const prev = h[h.length - 1]; // 最近一次操作的「操作前」态
    setRedoStack(r => [...r, { n, directed, edgeSpec, labels: [...labels], manual: { ...manual } }]); // 当前态入 redo
    applySnapshot(prev);
    setHist(hh => hh.slice(0, -1));
    setSelected(null); setPending(null); setMsg('撤销');
  };
  const redo = () => {
    const { redo: rs } = histRef.current;
    if (rs.length === 0) return;
    const next = rs[rs.length - 1];
    pushHistory(); // 当前（撤销后）态回推为操作前
    applySnapshot(next);
    setRedoStack(r => r.slice(0, -1));
    setSelected(null); setPending(null); setMsg('重做');
  };
  // 所有修改操作统一先 pushHistory（由各 handler 开头调用）
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<Graph | null>(null);

  // 图模型：从 n + directed + edgeSpec 重建
  const g = useMemo(() => {
    const graph = new Graph(n, { directed, labels });
    const r = graph.fromSpec(edgeSpec);
    if (!r.ok) setMsg(r.error ?? '');
    gRef.current = graph;
    return graph;
  }, [n, directed, edgeSpec, labels]);

  // 自动布局（free 时用当前 manual，缺省先铺环形）
  const autoPos = useMemo(() => {
    if (layout === 'tree') return g.layoutTree(root, { x0: 20, y0: 10, w: SVG_W - 40, h: SVG_H - 20 }).pos;
    if (layout === 'force') return g.layoutForce(SVG_W / 2, SVG_H / 2, SVG_W, SVG_H, 160);
    return g.layoutCircle(SVG_W / 2, SVG_H / 2, Math.min(SVG_W, SVG_H) / 2 - 46);
  }, [g, layout, root, n, directed]);

  // 最终位置：手动覆盖优先，否则自动布局
  const pos = useMemo(() => {
    const m: Record<number, { x: number; y: number }> = {};
    for (let i = 0; i < g.n; i++) m[i] = manual[i] ?? autoPos[i] ?? { x: 100 + i * 30, y: 200 };
    return m;
  }, [g, layout, manual, autoPos]);

  // ---- 视口变换：world（顶点坐标）⇄ SVG 坐标 ----
  const worldToSvg = (p: { x: number; y: number }) => ({ x: p.x * view.s + view.tx, y: p.y * view.s + view.ty });
  const svgToWorld = (p: { x: number; y: number }) => ({ x: (p.x - view.tx) / view.s, y: (p.y - view.ty) / view.s });

  // 算法帧：从 bfsSteps/dfsSteps/topoSteps 生成 Frame[]（复用 usePlayback）
  const activeVertices = useMemo(() => Array.from({ length: g.n }, (_, i) => i), [g.n]);
  const algoFrames = useMemo<AlgoFrame[]>(() => {
    if (algo === 'none') return [];
    const start = Math.min(root, g.n - 1);
    const raw: AlgoStep[] =
      algo === 'bfs' ? bfsSteps(g, start) :
      algo === 'dfs' ? dfsSteps(g, start) :
      topoSteps(g);
    return raw.map(s => ({ line: s.line, scene: { current: s.current, exploring: s.exploring, visited: s.visited, frontier: s.frontier, order: s.order, edge: s.edge }, caption: s.msg }));
  }, [algo, g, root]);
  // 引用稳定：播放期间 framesOr 不变 → usePlayback 不会因重渲染 reset 到首帧
  const algoFramesRef = useRef(algoFrames);
  if (algo !== 'none' && algoFramesRef.current !== algoFrames) algoFramesRef.current = algoFrames;
  const playbackFrames = algo === 'none' ? [] : algoFramesRef.current;
  const pb = usePlayback(playbackFrames, { autoPlay: false, autoPlayOnMount: false, interval: 750 });
  const frame = pb.frame as (AlgoFrame & { caption: { zh: string; en: string } }) | undefined;
  // 画布高亮快照：无算法时为空，有算法时取当前帧
  const hl = frame?.scene ?? null;
  const isAlgoActive = algo !== 'none';

  const analysis = useMemo(() => {
    if (!gRef.current) return null;
    const gg = gRef.current;
    const comps = gg.connectedComponents();
    return {
      n: gg.n, m: gg.edgeCount(),
      deg: gg.degree(), indeg: gg.indegree(), outdeg: gg.outdegree(),
      cycle: gg.hasCycle(), comps, isTree: gg.isTree(), isForest: gg.isForest(),
      topo: gg.topologicalOrder(),
      adj: gg.adj(),
    };
  }, [g]);

  // 顶点世界坐标 → SVG 坐标（考虑 viewBox 等比缩放）
  const svgPoint = (e: React.PointerEvent | React.MouseEvent): { x: number; y: number } => {
    const svg = svgRef.current!;
    // 容器像素 → viewBox 用户坐标：SVG 保持纵横比（内容不变形），换算时补偿纵向留白
    const rect = svg.getBoundingClientRect();
    const contentW = rect.width;
    const contentH = contentW * (SVG_H / SVG_W);      // 内容实际显示高度（等比）
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
  const distToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    if (L2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  const hitEdge = (p: { x: number; y: number }): { u: number; v: number } | null => {
    for (const e of g.edges) {
      const a = pos[e.u], b = pos[e.v];
      if (!a || !b) continue;
      if (distToSeg(p.x, p.y, a.x, a.y, b.x, b.y) <= 8) return { u: e.u, v: e.v };
    }
    return null;
  };

  // 边 spec 序列化（带权重）
  const specFromEdges = (es: { u: number; v: number; weight?: number }[]): string =>
    es.map(e => `${e.u}-${e.v}${e.weight !== undefined && e.weight !== 1 ? ':' + e.weight : ''}`).join(',');
  // 删除顶点（重编号 + 位置重排）
  const removeVertex = (v: number) => {
    pushHistory();
    const gg = gRef.current!;
    const keep = gg.edges.filter(e => e.u !== v && e.v !== v).map(e => `${(e.u > v ? e.u - 1 : e.u)}-${(e.v > v ? e.v - 1 : e.v)}${e.weight !== undefined && e.weight !== 1 ? ':' + e.weight : ''}`);
    setN(nn => Math.max(1, nn - 1));
    setEdgeSpec(keep.join(','));
    setLabels(ls => {
      const nl = ls.filter((_, i) => i !== v);
      return nl.length ? nl : ['0'];
    });
    setManual(m => {
      const nm: Record<number, { x: number; y: number }> = {};
      for (const [k, pv] of Object.entries(m)) { const kk = +k; if (kk === v) continue; nm[kk > v ? kk - 1 : kk] = pv; }
      return nm;
    });
    setSelected(null); setMsg(`删除顶点 ${g.labels[v] ?? v}（含其边，编号重排）`);
  };
  // 删除边（从 spec 移除）
  const removeEdge = (u: number, v: number) => {
    pushHistory();
    const gg = gRef.current!;
    setEdgeSpec(specFromEdges(gg.edges.filter(e => !((e.u === u && e.v === v) || (!gg.directed && e.u === v && e.v === u)))));
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
    setManual(m => ({ ...m, [g.n]: p }));
    setLabels(ls => [...ls, String(ls.length)]);
    setSelected(g.n);
    setMsg(`新建顶点 ${g.n}`);
  };
  // 连线
  const link = (a: number, b: number) => {
    pushHistory();
    const gg = gRef.current!;
    const exists = gg.edges.some(x => (x.u === a && x.v === b) || (!gg.directed && x.u === b && x.v === a));
    if (!exists) setEdgeSpec(s => (s ? s + ',' : '') + `${a}-${b}`);
    setPending(null); setSelected(null); setTool('move');
    setMsg(exists ? '边已存在' : `连线 ${g.labels[a] ?? a}—${g.labels[b] ?? b}`);
  };

  // ---- 右键菜单 ----
  const [menu, setMenu] = useState<{ x: number; y: number; sx: number; sy: number; target: number | null; edge: { u: number; v: number; weight?: number } | null } | null>(null);

  // ---- 画布指针事件 ----
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return; // 右键走 onContextMenu
    setMenu(null);
    svgRef.current?.setPointerCapture?.(e.pointerId); // capture 定在 svg 根：重渲染子元素不丢拖拽
    const svgP = svgPoint(e);
    const p = svgToWorld(svgP); // 命中/顶点逻辑用 world 坐标
    const v = hitVertex(p);
    if (tool === 'addVertex') {
      if (v === null) addVertexAt(p); else setSelected(v);
      return;
    }
    if (tool === 'delete') {
      if (v !== null) removeVertex(v);
      return;
    }
    if (tool === 'addEdge') {
      if (v !== null) {
        if (pending === null) { setPending(v); setSelected(v); setMsg(`起点 ${g.labels[v] ?? v}，再点第二个顶点`); }
        else if (pending === v) { setPending(null); setMsg(''); }
        else link(pending, v);
      }
      return;
    }
    // move 模式：点顶点=选中/拖动；空白=平移画布
    if (v !== null) {
      // Shift+点击 = 临时连线（不用切工具）
      if (e.shiftKey) {
        if (pending === null) {
          setPending(v); setSelected(v); setTool('addEdge'); setMsg(`起点 ${g.labels[v] ?? v}，再点第二个顶点`);
        } else link(pending, v);
        return;
      }
      setSelected(v);
      if (tool === 'move') {
        setDrag(v);
        const vpos = pos[v];
        if (vpos) setDragStart({ x: vpos.x, y: vpos.y }); // world 坐标
      }
    } else if (tool === 'move') {
      // 空白按下：开始平移画布（记录视口起点与指针）
      setPan({ startX: svgP.x, startY: svgP.y, tx: view.tx, ty: view.ty });
    } else setSelected(null);
  };
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragPointer, setDragPointer] = useState<{ x: number; y: number } | null>(null);

  // 改名统一走右键菜单（双击易与连选误触发，不绑定）
  const commitRename = () => {
    if (editing !== null) {
      const val = editVal.trim() || String(editing);
      setLabels(ls => ls.map((x, i) => (i === editing ? val : x)));
      setMsg(`顶点重命名为 ${val}`);
    }
    setEditing(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const svgP = svgPoint(e);
    if (pan) {
      // 平移画布：视口位移 = 指针位移（svg 坐标差）
      setView(v => ({ ...v, tx: pan.tx + (svgP.x - pan.startX), ty: pan.ty + (svgP.y - pan.startY) }));
      return;
    }
    if (drag !== null && dragStart) {
      const p = svgToWorld(svgP);
      if (!dragPointer) { setDragPointer(p); return; }
      const dx = p.x - dragPointer.x, dy = p.y - dragPointer.y;
      const np = { x: dragStart.x + dx, y: dragStart.y + dy };
      setManual(m => ({ ...m, [drag]: np }));
    }
    if (tool === 'addEdge' && pending !== null) setHover(svgP);
    // 悬停高亮（非拖拽时）
    if (drag === null && !isAlgoActive) {
      const p = svgToWorld(svgP);
      setHoverV(hitVertex(p));
      setHoverE(hitEdge(p));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    svgRef.current?.releasePointerCapture?.(e.pointerId);
    setDrag(null); setDragStart(null); setDragPointer(null); setHover(null); setPan(null);
  };
  // 滚轮：以指针为中心缩放
  // 滚轮：以指针为中心缩放（原生监听，避免 React passive wheel 无法 preventDefault）
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    e.preventDefault();
    const svgP = svgPoint(e as unknown as React.WheelEvent);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setView(v => {
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
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []); // 只绑一次，handler 经 ref 取最新
  // 挂载时恢复上次保存的图与表示（若存在；此后由自动保存维护）
  useEffect(() => {
    try {
      const raw = localStorage.getItem('graph-studio:last');
      if (raw) {
        const snap = JSON.parse(raw);
        if (typeof snap.n === 'number' && typeof snap.edgeSpec === 'string') {
          setN(snap.n); setDirected(!!snap.directed); setEdgeSpec(snap.edgeSpec);
          setLabels(Array.isArray(snap.labels) ? snap.labels : Array.from({ length: snap.n }, (_, i) => String(i)));
          setManual(snap.manual ?? {});
          if (['adjlist', 'adjmat', 'array', 'edges'].includes(snap.repr)) setRepr(snap.repr);
          if (['tree', 'circle', 'force', 'free'].includes(snap.layout)) setLayout(snap.layout);
          if (typeof snap.root === 'number') setRoot(Math.max(0, Math.min(snap.n - 1, snap.root)));
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 自动保存：图构造或表示变化即写 localStorage（首次挂载跳过，避免覆盖恢复值）
  const autoSaveReady = useRef(false);
  useEffect(() => {
    if (!autoSaveReady.current) { autoSaveReady.current = true; return; }
    try {
      localStorage.setItem('graph-studio:last', JSON.stringify({ n, directed, edgeSpec, labels, manual, repr, layout, root }));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, directed, edgeSpec, labels, manual, repr, layout, root]);

  // 快捷键：Delete/Esc / Ctrl+Z 撤销 / Ctrl+Shift+Z·Ctrl+Y 重做
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected !== null && isAlgoActive === false) { removeVertex(selected); e.preventDefault(); }
      } else if (e.key === 'Escape') {
        setPending(null); setMenu(null); setEditing(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, isAlgoActive]);

  // ---- 右键菜单动作 ----
  const menuLoad = (kind: 'tree' | 'forest' | 'graph' | 'cycle' | 'default') => {
    pushHistory();
    const num = Math.max(2, n);
    let spec = ''; setDirected(kind === 'graph' ? directed : false);
    if (kind === 'tree') { const gg = Graph.randomTree(num); spec = gg.edges.map(e => `${e.u}-${e.v}`).join(','); setLayout('tree'); }
    else if (kind === 'forest') { const gg = Graph.randomForest(num, Math.max(2, Math.min(3, Math.floor(num / 2)))); spec = gg.edges.map(e => `${e.u}-${e.v}`).join(','); setLayout('tree'); }
    else if (kind === 'graph') { const gg = Graph.randomGraph(num, 0.35, { directed }); spec = gg.edges.map(e => `${e.u}-${e.v}`).join(','); setLayout('force'); }
    else if (kind === 'cycle') { spec = Array.from({ length: num }, (_, i) => `${i}-${(i + 1) % num}`).join(','); setLayout('circle'); }
    else { spec = '0-1,1-2,2-3,3-4,2-5,5-6'; setLayout('tree'); }
    setEdgeSpec(spec); setManual({}); setRoot(0); setSelected(null); setPending(null);
    setLabels(Array.from({ length: num }, (_, i) => String(i)));
    setMsg(kind === 'default' ? '已载入默认示例' : `已载入${kind === 'tree' ? '树' : kind === 'forest' ? '森林' : kind === 'cycle' ? '环' : '随机图'}`);
  };
  const menuReset = () => { setManual({}); setView({ tx: 0, ty: 0, s: 1 }); setMsg('已回到自动布局并复位视口'); };

  // ---- 导出工具（复制边 spec；保存已自动） ----
  const exportSpec = () => {
    try { navigator.clipboard.writeText(edgeSpec); setMsg('边 spec 已复制到剪贴板'); }
    catch { setMsg('复制失败'); }
  };


  const edgePos = (u: number, v: number) => {
    const wa = pos && pos[u], wb = pos && pos[v];
    if (!wa || !wb) return { ax: 0, ay: 0, bx: 0, by: 0, mx: 0, my: 0 };
    const a = worldToSvg(wa), b = worldToSvg(wb);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const off = 4;
    return { ax: a.x + ux * (V_R + off), ay: a.y + uy * (V_R + off), bx: b.x - ux * (V_R + off), by: b.y - uy * (V_R + off), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };


  const selInfo = selected !== null && analysis ? (
    <div style={{ border: '1px solid #c7d2fe', borderRadius: 10, padding: 8, background: '#eef2ff', fontSize: 13, lineHeight: 1.6 }}>
      <b>顶点 {g.labels[selected]}</b>{directed ? ` · 入度 ${analysis.indeg[selected]} 出度 ${analysis.outdeg[selected]}（总 ${analysis.indeg[selected] + analysis.outdeg[selected]}）` : ` · 度 ${analysis.deg[selected]}`}
      <div style={{ fontSize: 12, color: '#475569' }}>
        邻接：{analysis.adj[selected].map(([v]) => g.labels[v]).join(', ') || '∅'}
      </div>
    </div>
  ) : null;

  // ---- 内存表示视图（模式参数「表示」切换）----
  const reprContent = (() => {
    if (!analysis) return null;
    // 伪地址：链式节点/数组元素按序分配
    const base = 0x555555559800;
    const addr = (i: number) => `0x${(base + i * 0x10).toString(16)}`;
    const cell = (v: string, color = '#6366f1', note = '', addrS?: string) => (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 1, margin: 2 }}>
        <div style={{ minWidth: 46, textAlign: 'center', padding: '4px 6px', borderRadius: 8, background: '#fff', border: `1.5px solid ${color}`, fontSize: 12, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{v}</div>
        {addrS && <div style={{ fontFamily: 'monospace', fontSize: 8, color: '#94a3b8' }}>{addrS}</div>}
        {note && <div style={{ fontSize: 9, color: '#64748b' }}>{note}</div>}
      </div>
    );
    if (repr === 'adjmat') {
      // 邻接矩阵（权重 / 布尔）
      const mat = g.mat();
      return (
        <div style={{ overflowX: 'auto', padding: 4 }}>
          <div style={{ display: 'inline-block', borderCollapse: 'collapse' }}>
            <div style={{ display: 'flex' }}>
              <div style={{ width: 26 }} />
              {g.labels.map((l, i) => <div key={i} style={{ width: 34, textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#64748b' }}>{l}</div>)}
            </div>
            {mat.map((row, r) => (
              <div key={r} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 26, textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#64748b' }}>{g.labels[r]}</div>
                {row.map((w, c) => (
                  <div key={c} style={{ width: 34, height: 30, margin: 1, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: 'monospace', background: w !== null ? (selected === r || selected === c ? '#eef2ff' : '#4f46e5') : '#f8fafc', color: w !== null ? (selected === r || selected === c ? '#4f46e5' : '#fff') : '#cbd5e1', border: `1px solid ${w !== null ? '#c7d2fe' : '#e2e8f0'}` }}>
                    {w !== null ? w : '·'}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}><MathText text={'邻接矩阵 · $M[i][j]=1/权重$（无向对称；行高亮选中顶点）'} /></div>
        </div>
      );
    }
    if (repr === 'edges') {
      // 边集数组
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', padding: 4 }}>
          {g.edges.map((e, i) => (
            <div key={i} style={{ display: 'inline-flex', alignItems: 'center', margin: 2 }}>
              {cell(g.labels[e.u], '#6366f1', '', addr(i * 2))}
              <span style={{ fontSize: 12, color: '#94a3b8', margin: '0 2px' }}>—</span>
              {cell(g.labels[e.v], '#0ea5e9', '', addr(i * 2 + 1))}
              {e.weight !== undefined && e.weight !== 1 && <span style={{ fontSize: 10, color: '#f59e0b', marginLeft: 3 }}>w:{e.weight}</span>}
            </div>
          ))}
        </div>
      );
    }
    if (repr === 'array') {
      // parent 数组（树）：每元素存父下标；根 -1
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', padding: 4 }}>
          {g.labels.map((l, i) => (
            <div key={i} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', margin: 2 }}>
              {cell(i === root ? '−1' : String(g.bfs(root).parent[i]), i === root ? '#dc2626' : '#10b981', l, addr(i))}
            </div>
          ))}
          <div style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>parent[i] · 根 = −1 · 压缩表示（n 个槽）</div>
        </div>
      );
    }
    // 邻接表（链式）
    const adj = g.adj();
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', padding: 4 }}>
        {adj.map((neighbors, u) => (
          <div key={u} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', marginBottom: 2 }}>{g.labels[u]}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {cell(g.labels[u], selected === u ? '#4f46e5' : '#6366f1', 'head', addr(u))}
              {neighbors.map(([v], j) => (
                <span key={j} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>→</span>
                  {cell(g.labels[v], selected === v ? '#4f46e5' : '#0ea5e9', '', addr(u * 10 + j + 1))}
                </span>
              ))}
              {neighbors.length === 0 && <span style={{ fontSize: 12, color: '#cbd5e1' }}>→ ∅</span>}
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
    if (selected === i) return '#4f46e5';
    if (i === root) return '#dc2626'; // 根 = 红色（不限布局）
    const deg = analysis?.deg[i] ?? 0;
    if (deg >= 3) return '#f59e0b';
    if (deg === 2) return '#10b981';
    return '#eef2ff';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: 'calc(100dvh - 118px)', maxWidth: 1440, margin: '0 auto', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>通用图 · 交互画布</h2>
          <span style={{ color: '#64748b', fontSize: 12 }}>拖拽/连线/右键构造 · 切换「表示」看内存布局（后期并入知识点页）</span>
        </div>

        {/* 行 1：算法（工具操作全部走右键/快捷键，无独立工具条） */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '4px 10px', borderRadius: 999, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#15803d' }}>算法</span>
            {(['bfs', 'dfs', 'topo'] as const).map(k => (
              <button key={k} className={`pill ${algo === k ? 'active' : ''}`} onClick={() => { setAlgo(algo === k ? 'none' : k); setSelected(null); setPending(null); }}>
                {k === 'bfs' ? 'BFS' : k === 'dfs' ? 'DFS' : '拓扑'}
              </button>
            ))}
            {isAlgoActive && <button className="ghost" onClick={() => setAlgo('none')}>退出</button>}
          </div>
        </div>
        {isAlgoActive && pb && (
          <div style={{ marginTop: 6 }}>
            <PlaybackBar pb={pb as Playback} />
          </div>
        )}

        {/* 行 2：模式参数 + 知识点参数（合并一行，紧凑） */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, padding: '6px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#4338ca' }}>模式</span>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={directed} onChange={e => setDirected(e.target.checked)} /> 有向
          </label>
          <span style={{ fontSize: 12 }}>布局</span>
          {([['tree', '树形'], ['circle', '环形'], ['force', '力导向'], ['free', '自由']] as Array<[Layout, string]>).map(([v, lb]) => (
            <button key={v} className={`pill ${layout === v ? 'active' : ''}`} style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => { setLayout(v); setMsg(''); }}>{lb}</button>
          ))}
          <button className="ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => { pushHistory(); setEdgeSpec(''); setMsg('已清空全部边'); }}>清空</button>
          <button className="ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={menuReset}>重置布局</button>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#475569' }}>
            {analysis?.n} 顶点 · {analysis?.m} 边 ·{' '}
            <b style={{ color: analysis?.isTree ? '#059669' : analysis?.isForest ? '#0ea5e9' : '#dc2626' }}>{analysis?.isTree ? '树' : analysis?.isForest ? '森林' : '含环'}</b>
          </span>
          {msg && <span style={{ fontSize: 11, color: '#059669' }}>{msg}</span>}
        </div>
      </div>

      {/* 主轴：画布 | 内存表示（一行，占满剩余高度） */}
      <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, border: '1px solid #c7d2fe', borderRadius: 12, overflow: 'hidden', background: '#fff', position: 'relative' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width={SVG_W} height={SVG_H}
            style={{ display: 'block', width: '100%', height: '100%', cursor: tool === 'delete' ? 'not-allowed' : tool === 'addVertex' ? 'copy' : tool === 'addEdge' ? 'crosshair' : 'default', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onDoubleClick={(e) => { e.preventDefault(); /* 改名走右键菜单 */ }}
            onContextMenu={(e) => {
              e.preventDefault();
              const p = svgPoint(e);
              const wp = svgToWorld(p);
              // 命中优先级：顶点 > 边 > 空白；命中顶点即选中
              const v = hitVertex(wp);
              const ed = v === null ? hitEdge(wp) : null;
              if (v !== null) setSelected(v);
              setMenu({ x: e.clientX, y: e.clientY, sx: wp.x, sy: wp.y, target: v, edge: ed });
            }}
          >
            {/* 边 */}
            {g.edges.map((e, i) => {
              const p = edgePos(e.u, e.v);
              const mid = { x: p.mx, y: p.my };
              const isHoverE = hoverE !== null && ((hoverE.u === e.u && hoverE.v === e.v) || (!directed && hoverE.u === e.v && hoverE.v === e.u));
              const isAlgoEdge = hl?.edge && ((hl.edge[0] === e.u && hl.edge[1] === e.v) || (!directed && hl.edge[0] === e.v && hl.edge[1] === e.u));
              const stroke = isAlgoEdge ? '#f59e0b' : isHoverE ? '#7c3aed' : selected !== null && (e.u === selected || e.v === selected) ? '#4f46e5' : '#94a3b8';
              const sw = isAlgoEdge ? 3 : isHoverE ? 2.8 : selected !== null && (e.u === selected || e.v === selected) ? 2.4 : 1.6;
              const w = e.weight !== undefined && e.weight !== 1 ? e.weight : null;
              return (
                <g key={i} opacity={pending !== null && (e.u === pending || e.v === pending) ? 0.4 : 1}>
                  <line x1={p.ax} y1={p.ay} x2={p.bx} y2={p.by} stroke={stroke} strokeWidth={sw} />
                  {directed && (
                    <polygon
                      points={`${p.bx},${p.by} ${p.bx - 9},${p.by - 3.5} ${p.bx - 9},${p.by + 3.5}`}
                      fill={stroke}
                      transform={`rotate(${Math.atan2(p.by - p.ay, p.bx - p.ax) * 180 / Math.PI} ${p.bx} ${p.by})`}
                    />
                  )}
                  {w !== null && (
                    <g>
                      <circle cx={mid.x} cy={mid.y} r={9} fill="#0f172a" />
                      <text x={mid.x} y={mid.y + 3} textAnchor="middle" fontSize={10} fontWeight={800} fill="#fff">{w}</text>
                    </g>
                  )}
                </g>
              );
            })}
            {/* pending 连线预览（跟随鼠标） */}
            {tool === 'addEdge' && pending !== null && pos[pending] && hover && (
              <line x1={worldToSvg(pos[pending]).x} y1={worldToSvg(pos[pending]).y} x2={hover.x} y2={hover.y} stroke="#6366f1" strokeWidth={1.6} strokeDasharray="6 4" />
            )}
            {/* 顶点 */}
            {activeVertices.map(i => {
              const p = worldToSvg(pos[i]);
              if (!p) return null;
              const isSel = selected === i;
              const isPending = pending === i;
              const isHoverV = hoverV === i;
              const isVisited = hl ? hl.visited.includes(i) : false;
              const isCurrent = hl ? hl.current === i : false;
              const isFrontier = hl ? hl.frontier.includes(i) : false;
              const isExploring = hl ? hl.exploring === i : false;
              // 算法高亮优先级：current > exploring > visited > frontier > 普通 > 选中
              const isRoot = i === root;
              const fill = isAlgoActive
                ? isCurrent ? '#4f46e5' : isExploring ? '#f59e0b' : isVisited ? '#10b981' : isFrontier ? '#38bdf8' : '#eef2ff'
                : isHoverV ? '#ddd6fe' : vertexColor(i);
              const stroke = isAlgoActive
                ? isCurrent ? '#312e81' : isExploring ? '#b45309' : isVisited ? '#059669' : isFrontier ? '#0284c7' : '#6366f1'
                : isSel ? '#312e81' : isRoot ? '#b91c1c' : isHoverV ? '#7c3aed' : '#6366f1';
              const sw = isAlgoActive ? (isCurrent || isExploring ? 3 : 1.6) : (isSel ? 2.6 : isRoot ? 2.4 : isPending ? 2.2 : isHoverV ? 2.4 : 1.4);
              const labelColor = isAlgoActive ? (isCurrent || isVisited || isFrontier || isExploring ? '#fff' : '#1e293b') : (isSel || isRoot ? '#fff' : '#1e293b');
              const orderIdx = hl ? hl.order.indexOf(i) : -1;
              return (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={V_R} fill={fill} stroke={stroke} strokeWidth={sw} />
                  <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={labelColor}>{g.labels[i]}</text>
                  {/* 根标注 */}
                  {!isAlgoActive && isRoot && (
                    <text x={p.x} y={p.y - V_R - 3} textAnchor="middle" fontSize={9} fontWeight={800} fill="#dc2626">根</text>
                  )}
                  {/* 访问序角标 */}
                  {isAlgoActive && orderIdx >= 0 && (
                    <text x={p.x + V_R - 2} y={p.y - V_R + 2} fontSize={9} fontWeight={800} fill={isCurrent ? '#e0e7ff' : '#475569'}>{orderIdx + 1}</text>
                  )}
                  {/* 度标记（小字） */}
                  {!isAlgoActive && analysis && directed && analysis.deg[i] > 0 && (
                    <text x={p.x + V_R + 4} y={p.y - V_R + 2} fontSize={9} fill="#64748b">{analysis.deg[i]}</text>
                  )}
                </g>
              );
            })}
          </svg>
          {/* 选中信息浮层（算法时用 caption 替代） */}
          {!isAlgoActive && selInfo && <div style={{ position: 'absolute', top: 10, right: 10, maxWidth: 220 }}>{selInfo}</div>}
          {/* 重命名输入框（双击顶点） */}
          {editing !== null && pos[editing] && (() => {
            const sp = worldToSvg(pos[editing]);
            return (
              <div style={{ position: 'absolute', left: `calc(${(sp.x / SVG_W) * 100}% - 44px)`, top: `calc(${(sp.y / SVG_H) * 100}% - 38px)`, zIndex: 40 }}>
                <input
                  className="txt"
                  autoFocus
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                    else if (e.key === 'Escape') setEditing(null);
                  }}
                  style={{ width: 80, fontSize: 13, textAlign: 'center' }}
                />
              </div>
            );
          })()}
          {/* 右键菜单：按命中上下文（顶点 / 边 / 空白）显示不同项 */}
          {menu && (
            <div
              style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 50, minWidth: 180, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,.18)', padding: 6 }}
              onPointerDown={e => e.stopPropagation()}
            >
              {menuVtx !== null ? (
                <>
                  <MenuHead label={`顶点 ${g.labels[menuVtx]}`} />
                  <MenuItem label="✏️ 重命名" onClick={() => { setEditing(menuVtx); setEditVal(g.labels[menuVtx] ?? String(menuVtx)); setMenu(null); }} />
                  <MenuItem label="⭐ 设为根（树形布局/遍历起点）" onClick={() => { setRoot(menuVtx!); setLayout(l => (l === 'tree' || l === 'free' ? 'tree' : l)); setMsg(`根设为 ${g.labels[menuVtx]}`); setMenu(null); }} />
                  <MenuItem label="🔗 从此连线" onClick={() => { setPending(menuVtx); setSelected(menuVtx); setTool('addEdge'); setMsg(`起点 ${g.labels[menuVtx]}，再点第二个顶点`); setMenu(null); }} />
                  <MenuItem label="删除顶点（含其边）" danger onClick={() => { removeVertex(menuVtx!); setMenu(null); }} />
                </>
              ) : menuEdge ? (
                <>
                  <MenuHead label={`边 ${g.labels[menuEdge.u] ?? menuEdge.u} — ${g.labels[menuEdge.v] ?? menuEdge.v}`} />
                  <MenuItem
                    label={menuEdge.weight !== undefined && menuEdge.weight !== 1 ? `权重：${menuEdge.weight}（点击修改）` : '权重：1（点击修改）'}
                    onClick={() => {
                      const w = prompt('输入边权重（正整数）：', String(menuEdge!.weight ?? 1));
                      if (w !== null) { const nw = Number(w.trim()); if (Number.isFinite(nw) && nw > 0) setEdgeWeight(menuEdge!.u, menuEdge!.v, Math.trunc(nw)); else setMsg('权重需为正整数'); }
                      setMenu(null);
                    }}
                  />
                  <MenuItem label="取消此边" danger onClick={() => { removeEdge(menuEdge!.u, menuEdge!.v); setMenu(null); }} />
                </>
              ) : (
                <>
                  <MenuItem label="➕ 新建顶点" onClick={() => { addVertexAt({ x: menu.sx, y: menu.sy }); setMenu(null); }} />
                  <MenuDivider />
                  <MenuItem label="载入默认示例" onClick={() => { menuLoad('default'); setMenu(null); }} />
                  <MenuItem label="随机树" onClick={() => { menuLoad('tree'); setMenu(null); }} />
                  <MenuItem label="随机森林" onClick={() => { menuLoad('forest'); setMenu(null); }} />
                  <MenuItem label="随机环" onClick={() => { menuLoad('cycle'); setMenu(null); }} />
                  <MenuItem label="随机图" onClick={() => { menuLoad('graph'); setMenu(null); }} />
                  <MenuDivider />
                  <MenuItem label="复制边 spec" onClick={() => { exportSpec(); setMenu(null); }} />
                  <MenuDivider />
                  <MenuItem label="重置布局" onClick={() => { menuReset(); setMenu(null); }} />
                </>
              )}
            </div>
          )}
          {/* 算法当前步骤 caption */}
          {isAlgoActive && frame && (
            <div style={{ position: 'absolute', bottom: 8, left: 12, right: 12, background: 'rgba(15,23,42,.85)', color: '#e2e8f0', borderRadius: 10, padding: '8px 12px', fontSize: 13 }}>
              <MathText text={frame.caption.zh} />
            </div>
          )}
        </div>
        {/* 右栏：算法时伪代码面板 / 编辑时内存表示 */}
        <div style={{ minWidth: 240, width: isAlgoActive ? 'fit-content' : 340, maxWidth: 'calc(50% - 5px)', flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {isAlgoActive ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <Pseudocode code={ALGO_CODE[algo as Exclude<AlgoKind, 'none'>]} active={frame?.line} />
            </div>
          ) : (
            <>
              <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 800, color: '#4338ca', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #c7d2fe' }}>
                <span>内存表示</span>
                {([['adjlist', '邻接表'], ['adjmat', '矩阵'], ['array', 'parent'], ['edges', '边集']] as Array<[typeof repr, string]>).map(([v, lb]) => (
                  <button key={v} className={`pill ${repr === v ? 'active' : ''}`} style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setRepr(v)}>{lb}</button>
                ))}
                <button
                  className="pill"
                  style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11 }}
                  onClick={() => { location.href = buildMemoryUrl(buildGraphDump(g, repr, { root }) as any); }}
                >
                  查看内存 ↗
                </button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 8, background: '#fff' }}>{reprContent}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuHead({ label }: { label: string }) {
  return <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>;
}
function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{ padding: '7px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: danger ? '#dc2626' : '#1e293b', fontWeight: 600 }}
      onMouseEnter={(e) => ((e.target as HTMLDivElement).style.background = '#f8fafc')}
      onMouseLeave={(e) => ((e.target as HTMLDivElement).style.background = 'transparent')}
    >
      {label}
    </div>
  );
}
function MenuDivider() {
  return <div style={{ height: 1, background: '#eef2f7', margin: '5px 6px' }} />;
}
