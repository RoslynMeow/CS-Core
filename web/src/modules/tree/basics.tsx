import { useEffect, useMemo, useRef, useState } from 'react';
import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { Graph, buildGraphDump, treeTraverseSteps, bfsSteps, type AlgoStep } from '../../lib/graph';
import { MathText } from '../../lib/tex';
import { buildMemoryUrl } from '../../lib/memoryDump';
import { usePlayback } from '../../engine/usePlayback';

/**
 * 树 · 可交互创建 + 遍历算法
 * tex: TreeAndBinaryTree「通用树的基础属性 / 树的遍历」
 * - 画布自由创建（右键新建/删除/连线/设根/改名），形态自动判定（树/森林/二叉）
 * - 模式：编辑 / 前序 / 中序 / 后序 / 层序 BFS 遍历动画
 */
type Mode = 'edit' | 'pre' | 'in' | 'post' | 'bfs';
type Cfg = { mode: Mode; n: number; edgeSpec: string; labels: string[]; root: number; execTick: number };

type NodeInfo = { idx: number; x: number; y: number; kind: 'root' | 'leaf' | 'internal'; depth: number };
type Scene = {
  mode: Mode;
  nodes: NodeInfo[];
  edges: { u: number; v: number }[];
  labels: string[];
  root: number;
  nLeaf: number; nInternal: number; height: number; width: number;
  isForest: boolean; isBinary: boolean;
  // 算法帧高亮
  hl: { current: number | null; exploring: number | null; visited: number[]; order: number[]; edge: [number, number] | null } | null;
};

const SVG_W = 720, SVG_H = 400;
const V_R = 16;
const COLORS = { root: '#dc2626', leaf: '#10b981', internal: '#0ea5e9' };

const ALGO_CODE: Record<Exclude<Mode, 'edit'>, Array<{ zh: string; en: string }>> = {
  pre: [
    { zh: 'Preorder($u$):', en: 'Preorder(u):' },
    { zh: '  if $u=\\emptyset$: return', en: '  if u=∅: return' },
    { zh: '  Visit($u$)', en: '  Visit(u)' },
    { zh: '  Preorder($u.left$); Preorder($u.right$)', en: '  Preorder(left); Preorder(right)' },
  ],
  in: [
    { zh: 'Inorder($u$):', en: 'Inorder(u):' },
    { zh: '  if $u=\\emptyset$: return', en: '  if u=∅: return' },
    { zh: '  Inorder($u.left$)', en: '  Inorder(left)' },
    { zh: '  Visit($u$); Inorder($u.right$)', en: '  Visit(u); Inorder(right)' },
  ],
  post: [
    { zh: 'Postorder($u$):', en: 'Postorder(u):' },
    { zh: '  if $u=\\emptyset$: return', en: '  if u=∅: return' },
    { zh: '  Postorder($u.left$); Postorder($u.right$)', en: '  Postorder(left); Postorder(right)' },
    { zh: '  Visit($u$)', en: '  Visit(u)' },
  ],
  bfs: [
    { zh: '$Q\\gets\\{r\\}$; visited[r]=true', en: 'Q←{r}; visited[r]=true' },
    { zh: 'while $Q\\neq\\emptyset$:', en: 'while Q≠∅:' },
    { zh: '  $u\\gets Q$ 出队; Visit($u$)', en: '  u←Q; Visit(u)' },
    { zh: '  每个孩子 $v$: if !visited: 入队', en: '  for child v: enqueue' },
  ],
};

// 二叉判定（以 root 为根：每节点 ≤2 子）
function isBinary(g: Graph, root: number): boolean {
  const { parent } = g.bfs(root);
  const cnt = new Map<number, number>();
  for (let v = 0; v < g.n; v++) if (v !== root && parent[v] !== -1) cnt.set(parent[v], (cnt.get(parent[v]) ?? 0) + 1);
  return [...cnt.values()].every(c => c <= 2);
}

function buildSceneFrom(g: Graph, cfg: Cfg, hl: Scene['hl'] | null = null): Scene {
  const root = Math.min(cfg.root, g.n - 1);
  const { parent } = g.bfs(root);
  const children = Array.from({ length: g.n }, () => [] as number[]);
  for (let v = 0; v < g.n; v++) if (v !== root && parent[v] !== -1) children[parent[v]].push(v);
  const depthArr = Array(g.n).fill(0);
  for (let v = 0; v < g.n; v++) if (v !== root && parent[v] !== -1) depthArr[v] = depthArr[parent[v]] + 1;
  const layout = g.layoutTree(root, { x0: 20, y0: 25, w: SVG_W - 40, h: SVG_H - 50 });
  const degreeOf = (v: number) => (v === root ? children[v].length : children[v].length + 1);
  const nodes: NodeInfo[] = Array.from({ length: g.n }, (_, i) => ({
    idx: i, x: layout.pos[i].x, y: layout.pos[i].y,
    kind: i === root ? 'root' : children[i].length === 0 ? 'leaf' : 'internal',
    depth: depthArr[i],
  }));
  return {
    mode: cfg.mode, nodes,
    edges: g.edges.filter(e => parent[e.v] === e.u || parent[e.u] === e.v).map(e => ({ u: e.u, v: e.v })),
    labels: [...cfg.labels], root,
    nLeaf: nodes.filter(n => n.kind === 'leaf').length,
    nInternal: nodes.filter(n => n.kind === 'internal').length,
    height: Math.max(0, ...depthArr),
    width: Math.max(0, ...nodes.map((_, v) => degreeOf(v))),
    isForest: g.connectedComponents().length > 1,
    isBinary: isBinary(g, root),
    hl,
  };
}

function gen(cfg: Cfg): Frame<Scene>[] {
  const g = new Graph(cfg.n, { labels: [...cfg.labels] });
  g.fromSpec(cfg.edgeSpec);
  const root = Math.min(cfg.root, g.n - 1);
  if (cfg.mode === 'edit') {
    const s = buildSceneFrom(g, cfg);
    const comps = g.connectedComponents();
    return [{
      line: 0,
      caption: T(
        `自由创建：${g.n} 顶点 · ${g.edgeCount()} 边 · ${g.isTree() ? '是树' : g.isForest() ? '森林（' + comps.length + ' 棵）' : '带环非树'}${isBinary(g, root) ? ' · 二叉' : ''} · 右键画布构造`,
        `free build: ${g.n}V/${g.edgeCount()}E`
      ),
      scene: s,
    }];
  }
  // 算法模式：生成遍历帧
  const allow = g.isTree() || g.isForest();
  const raw: AlgoStep[] =
    cfg.mode === 'bfs' ? bfsSteps(g, root) : treeTraverseSteps(g, cfg.mode as 'pre' | 'in' | 'post', root);
  const frames: Frame<Scene>[] = raw.map(st => ({
    line: st.line,
    caption: st.msg,
    scene: buildSceneFrom(g, cfg, { current: st.current, exploring: st.exploring, visited: st.visited, order: st.order, edge: st.edge }),
  }));
  if (!allow) {
    return [{ line: 0, caption: T('图含环：遍历要求无环树/森林', 'cycle: need acyc'), scene: buildSceneFrom(g, cfg) }];
  }
  return frames;
}

export const treeModule: ModuleDef<Scene, Cfg> = {
  id: 'tree',
  title: T('树 · 创建与遍历', 'Tree · Build & Traverse'),
  desc: T('画布自由创建树/森林，自动判定形态；前序/中序/后序/层序遍历动画。$|E|=|V|-1$ 连通。', 'Build trees; pre/in/post/level traversals.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: { mode: 'edit' as Mode, n: 7, edgeSpec: '0-1,1-2,2-3,3-4,2-5,5-6', labels: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], root: 0, execTick: 0 },
  randomize(c) {
    const n = Math.max(3, Math.min(12, Math.floor(3 + Math.random() * 10)));
    const g = Graph.randomTree(n);
    return { ...c, n, edgeSpec: g.edges.map(e => `${e.u}-${e.v}`).join(','), labels: Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i)), root: 0, execTick: 0 } as Cfg;
  },
  Controls({ config, onChange, t }: any) {
    const isZh = t(T('中文', 'en')) !== 'en';
    const [draft, setDraft] = useState<Cfg>(config);
    const set = (p: Partial<Cfg>) => setDraft(s => ({ ...s, ...p }));
    useEffect(() => { if (draft.mode !== config.mode || draft.edgeSpec !== config.edgeSpec) setDraft(config); }, [config]);
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca' }}>{isZh ? '模式' : 'MODE'}</span>
          <span style={{ fontSize: 13 }}>{t(T('算法', 'Algo'))}</span>
          {([['edit', '编辑'], ['pre', '前序'], ['in', '中序'], ['post', '后序'], ['bfs', '层序 BFS']] as Array<[Mode, string]>).map(([v, lb]) => (
            <button key={v} className={`pill ${draft.mode === v ? 'active' : ''}`} onClick={() => { set({ mode: v }); onChange({ ...draft, mode: v }); }}>{lb}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{isZh ? '参数' : 'PARAMS'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('根/起点', 'Root'))}</span>
            <input className="txt" type="number" value={draft.root} disabled title={t(T('在画布上右键顶点 →「设为根」修改', 'Right-click a vertex → set as root'))} style={{ width: 52, background: '#f1f5f9', color: '#64748b' }} /></label>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{isZh ? '画布右键顶点设根' : 'set via canvas'}</span>
          <button className="ghost" onClick={() => onChange(treeModule.randomize!(draft))}>↻ {t(T('重新生成', 'Regenerate'))}</button>
          <button className="ghost" onClick={() => onChange({ ...treeModule.defaultConfig } as Cfg)}>{t(T('示例', 'Example'))}</button>
          <button className="pill" onClick={() => { const gg = new Graph(draft.n, { labels: [...draft.labels] }); gg.fromSpec(draft.edgeSpec); location.href = buildMemoryUrl(buildGraphDump(gg, 'adjlist') as any); }}>查看内存 ↗</button>
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) {
    if (cfg.mode === 'edit') {
      // 编辑模式也提供定义伪代码（面板常驻）
      return [
        { zh: 'T=(V,E): $|E|=|V|-1$ 且连通（若多分量 → 森林）', en: 'Tree: |E|=n-1, connected' },
        { zh: '根 $r$：右键顶点「设为根」（红）', en: 'root: right-click vertex' },
        { zh: '右键空白新建 / 顶点删除边 / Shift+点连线', en: 'build via canvas' },
      ] as never;
    }
    return (ALGO_CODE[cfg.mode as Exclude<Mode, 'edit'>] ?? []).map(x => ({ zh: x.zh, en: x.en })) as never;
  },
  generate: gen,
  Render({ scene, config, onChange }) {
    const cfg = config as unknown as Cfg;
    // 编辑态交互本地状态
    const [manual, setManual] = useState<Record<number, { x: number; y: number }>>({});
    const [selected, setSelected] = useState<number | null>(null);
    const [menu, setMenu] = useState<{ x: number; y: number; sx: number; sy: number; target: number | null } | null>(null);
    const [editing, setEditing] = useState<number | null>(null);
    const [editVal, setEditVal] = useState('');
    // 视口：平移 + 缩放（与图创建页一致）
    const [view, setView] = useState({ tx: 0, ty: 0, s: 1 });
    const [pan, setPan] = useState<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const isEdit = scene.mode === 'edit';
    // 视口变换
    const worldToSvg = (p: { x: number; y: number }) => ({ x: p.x * view.s + view.tx, y: p.y * view.s + view.ty });
    const svgToWorld = (p: { x: number; y: number }) => ({ x: (p.x - view.tx) / view.s, y: (p.y - view.ty) / view.s });
    const g = useMemo(() => {
      const gg = new Graph(cfg.n, { labels: [...cfg.labels] });
      gg.fromSpec(cfg.edgeSpec);
      return gg;
    }, [cfg.n, cfg.edgeSpec, cfg.labels]);

    const pos = useMemo(() => {
      const m: Record<number, { x: number; y: number }> = {};
      for (let i = 0; i < scene.nodes.length; i++) {
        const s = scene.nodes[i];
        m[i] = manual[i] ?? { x: s.x, y: s.y };
      }
      return m;
    }, [scene.nodes, manual]);

    const svgPoint = (e: React.PointerEvent | React.MouseEvent) => {
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      // 返回 SVG 坐标（viewBox 内）
      return { x: ((e.clientX - rect.left) / rect.width) * SVG_W, y: ((e.clientY - rect.top) / rect.height) * SVG_H };
    };
    const hitVertex = (p: { x: number; y: number }) => {
      const w = svgToWorld(p);
      for (let i = scene.nodes.length - 1; i >= 0; i--) if (Math.hypot(w.x - pos[i].x, w.y - pos[i].y) <= V_R + 6) return i;
      return null;
    };
    // 滚轮缩放（原生监听，避免 passive）
    const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
    wheelRef.current = (e: WheelEvent) => {
      const svg = svgRef.current; if (!svg) return;
      e.preventDefault(); // 始终阻止页面滚动
      if (!isEdit) return; // 仅编辑模式允许缩放
      const rect = svg.getBoundingClientRect();
      const svgP = { x: ((e.clientX - rect.left) / rect.width) * SVG_W, y: ((e.clientY - rect.top) / rect.height) * SVG_H };
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setView(v => {
        const s = Math.min(4, Math.max(0.25, v.s * factor));
        return { tx: svgP.x - (svgP.x - v.tx) * (s / v.s), ty: svgP.y - (svgP.y - v.ty) * (s / v.s), s };
      });
    };
    useEffect(() => {
      const el = svgRef.current; if (!el) return;
      const h = (e: WheelEvent) => wheelRef.current(e);
      el.addEventListener('wheel', h, { passive: false });
      return () => el.removeEventListener('wheel', h);
    }, []);
    const setCfg = (patch: Partial<Cfg>) => onChange?.({ ...cfg, ...patch } as Cfg);

    // 拖拽
    const [drag, setDrag] = useState<number | null>(null);
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const [dragPtr, setDragPtr] = useState<{ x: number; y: number } | null>(null);

    const addVertex = (p: { x: number; y: number }) => {
      const nn = g.n + 1;
      setManual(m => ({ ...m, [g.n]: p }));
      setCfg({ n: nn, edgeSpec: g.edges.map(e => `${e.u}-${e.v}`).join(','), labels: [...g.labels, String(g.labels.length)] });
    };
    const removeVertex = (v: number) => {
      const keep = g.edges.filter(e => e.u !== v && e.v !== v).map(e => `${e.u > v ? e.u - 1 : e.u}-${e.v > v ? e.v - 1 : e.v}`);
      setCfg({ n: g.n - 1, edgeSpec: keep.join(','), labels: g.labels.filter((_, i) => i !== v) });
    };
    const link = (a: number, b: number) => {
      const exists = g.edges.some(e => (e.u === a && e.v === b) || (e.u === b && e.v === a));
      if (!exists) { const cur = g.edges.map(e => `${e.u}-${e.v}`).join(','); setCfg({ edgeSpec: cur ? cur + ',' + a + '-' + b : `${a}-${b}` }); }
    };

    // 若为算法模式：用 scene.hl 高亮
    const hl = scene.hl;

    return (
      <div style={{ display: 'grid', gap: 6 }}>
        {/* 度量条（自动判定，非输入） */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: '#475569', padding: '6px 10px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <MathText text={`$|V|=${scene.nodes.length}$ · $|E|=${scene.edges.length}$`} />
          <span style={{ fontWeight: 700, color: scene.isForest ? '#0ea5e9' : '#059669' }}>{scene.isForest ? '森林' : '树'}</span>
          {scene.isBinary && <span style={{ fontWeight: 700, color: '#4f46e5' }}>二叉</span>}
          <MathText text={`高 $H=${scene.height}$ · 度 $D=${scene.width}$`} />
          <span style={{ color: COLORS.root }}>●根</span><span style={{ color: COLORS.leaf }}>●叶×{scene.nLeaf}</span><span style={{ color: COLORS.internal }}>●分支×{scene.nInternal}</span>
        </div>
        <div style={{ border: '1px solid #c7d2fe', borderRadius: 12, overflow: 'hidden', background: '#fff', position: 'relative' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            style={{ display: 'block', width: '100%', height: 'auto', cursor: isEdit ? 'default' : 'default', touchAction: 'none', userSelect: 'none' }}
            onPointerDown={e => {
              if (!isEdit) return;
              const p = svgPoint(e);
              const v = hitVertex(p);
              if (v !== null) {
                setSelected(v);
                if (e.shiftKey) { link(v, selected ?? v); return; }
                setDrag(v); setDragStart({ x: pos[v].x, y: pos[v].y });
                setDragPtr(p);
              } else {
                setSelected(null);
                // 空白按下 = 开始平移画布
                setPan({ startX: p.x, startY: p.y, tx: view.tx, ty: view.ty });
              }
            }}
            onPointerMove={e => {
              if (!isEdit) return;
              const p = svgPoint(e);
              if (pan) {
                setView(v => ({ ...v, tx: pan.tx + (p.x - pan.startX), ty: pan.ty + (p.y - pan.startY) }));
                return;
              }
              if (drag !== null && dragStart) {
                if (!dragPtr) { setDragPtr(p); return; }
                const w = svgToWorld(p);
                const d0 = svgToWorld(dragPtr);
                setManual(m => ({ ...m, [drag]: { x: dragStart.x + (w.x - d0.x), y: dragStart.y + (w.y - d0.y) } }));
              }
            }}
            onPointerUp={() => { setDrag(null); setDragStart(null); setDragPtr(null); setPan(null); }}
            onDoubleClick={e => {
              if (!isEdit) return;
              const v = hitVertex(svgPoint(e));
              if (v !== null) { setEditing(v); setEditVal(g.labels[v] ?? String(v)); }
            }}
            onContextMenu={e => {
              if (!isEdit) return;
              e.preventDefault();
              const p = svgPoint(e);
              const wp = svgToWorld(p);
              const v = hitVertex(p);
              if (v !== null) setSelected(v);
              setMenu({ x: e.clientX, y: e.clientY, sx: wp.x, sy: wp.y, target: v });
            }}
          >
            {scene.edges.map((e, i) => {
              const a = worldToSvg(pos[e.u]), b = worldToSvg(pos[e.v]);
              const isHl = hl?.edge && ((hl.edge[0] === e.u && hl.edge[1] === e.v) || (hl.edge[0] === e.v && hl.edge[1] === e.u));
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={isHl ? '#f59e0b' : '#94a3b8'} strokeWidth={isHl ? 3 : 1.5} />;
            })}
            {scene.nodes.map(n => {
              const pw = pos[n.idx];
              const p = worldToSvg(pw);
              const isSel = selected === n.idx;
              const isVisited = hl?.visited.includes(n.idx);
              const isCurrent = hl?.current === n.idx;
              const orderIdx = hl?.order.indexOf(n.idx);
              const fill = isCurrent ? '#4f46e5' : isVisited ? '#a7f3d0' : isSel ? '#ddd6fe' : COLORS[n.kind];
              const stroke = isCurrent ? '#312e81' : isSel ? '#312e81' : COLORS[n.kind];
              return (
                <g key={n.idx}>
                  <circle cx={p.x} cy={p.y} r={V_R} fill={fill} stroke={stroke} strokeWidth={isSel || isCurrent ? 2.4 : 1.5} />
                  <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={isCurrent || n.kind === 'root' ? '#fff' : '#0f172a'}>{g.labels[n.idx]}</text>
                  {isEdit && n.idx === scene.root && <text x={p.x} y={p.y - V_R - 3} textAnchor="middle" fontSize={9} fontWeight={800} fill="#dc2626">根</text>}
                  {hl && orderIdx !== undefined && orderIdx >= 0 && <text x={p.x + V_R - 2} y={p.y - V_R + 2} fontSize={9} fontWeight={800} fill="#64748b">{orderIdx + 1}</text>}
                </g>
              );
            })}
          </svg>
          {/* 右键菜单（编辑态） */}
          {isEdit && menu && (
            <div style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,.18)', padding: 6, minWidth: 160 }} onPointerDown={e => e.stopPropagation()}>
              {menu.target !== null ? (
                <>
                  <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 800, color: '#64748b' }}>顶点 {g.labels[menu.target]}</div>
                  <MenuItem label="✏️ 重命名" onClick={() => { setEditing(menu.target!); setEditVal(g.labels[menu.target!] ?? String(menu.target)); setMenu(null); }} />
                  <MenuItem label="⭐ 设为根" onClick={() => { setCfg({ root: menu.target! }); setMenu(null); }} />
                  <MenuItem label="🔗 连线（Shift+点也可）" onClick={() => { link(menu.target!, selected ?? menu.target!); setMenu(null); }} />
                  <MenuItem label="删除顶点（含其边）" danger onClick={() => { removeVertex(menu.target!); setMenu(null); }} />
                </>
              ) : (
                <>
                  <MenuItem label="➕ 新建顶点" onClick={() => { addVertex({ x: menu.sx, y: menu.sy }); setMenu(null); }} />
                  <MenuItem label="↻ 随机树" onClick={() => { const gg = Graph.randomTree(Math.max(3, g.n)); setCfg({ n: gg.n, edgeSpec: gg.edges.map(e => `${e.u}-${e.v}`).join(','), labels: Array.from({ length: gg.n }, (_, i) => String.fromCharCode(65 + i)), root: 0 }); setMenu(null); }} />
                  <MenuItem label="清空全部边" onClick={() => { setCfg({ edgeSpec: '' }); setMenu(null); }} />
                </>
              )}
            </div>
          )}
          {/* 重命名输入 */}
          {editing !== null && pos[editing] && (() => {
            const ep = worldToSvg(pos[editing]);
            return (
            <div style={{ position: 'absolute', left: ep.x - 40, top: ep.y - 38 }}>
              <input className="txt" autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={() => { if (editing !== null) setCfg({ labels: g.labels.map((x, i) => (i === editing ? editVal || x : x)) }); setEditing(null); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={{ width: 80, fontSize: 13, textAlign: 'center' }} />
            </div>
            );
          })()}
        </div>
        {!isEdit && hl && (
          <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b' }}>
            访问序：{hl.order.map(i => g.labels[i]).join(' → ')}
          </div>
        )}
      </div>
    ) as unknown as never;
  },
};

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <div onClick={onClick} style={{ padding: '7px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: danger ? '#dc2626' : '#1e293b', fontWeight: 600 }}
      onMouseEnter={e => ((e.target as HTMLDivElement).style.background = '#f8fafc')} onMouseLeave={e => ((e.target as HTMLDivElement).style.background = 'transparent')}>
      {label}
    </div>
  );
}