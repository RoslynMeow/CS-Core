import { useEffect, useMemo, useRef, useState } from 'react';
import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { Graph, treeTraverseSteps, bfsSteps, type AlgoStep } from '../../lib/graph';
import { MathText } from '../../lib/tex';

/**
 * 二叉树 · 形态与存储
 * tex: TreeAndBinaryTree「二叉树及其形态特征 / 树的物理存储」
 * - 编辑画布（保证二叉：每节点 ≤2 子）
 * - 自动判定：偏斜 / 完全 / 满 / BST / AVL
 * - 顺序存储（数组下标 l=2i+1 r=2i+2 p=⌊(i-1)/2⌋）与链式存储视图
 * - 前/中/后序 + 层序遍历动画
 */
type Mode = 'edit' | 'pre' | 'in' | 'post' | 'bfs';
type Cfg = { mode: Mode; n: number; edgeSpec: string; labels: number[]; root: number; execTick: number };

type Scene = {
  mode: Mode;
  labels: number[];
  edges: { u: number; v: number }[];
  root: number;
  isBinary: boolean;
  skew: boolean;     // 偏斜：所有度 ≤1
  full: boolean;     // 满：度 ∈{0,2} 且叶同深
  complete: boolean; // 完全：层序编号 1..n 连续
  bst: boolean;      // 二叉搜索；用数字标签判定
  avl: boolean;      // 平衡：每节点左右高差 ≤1
  height: number;
  nNodes: number;
  hl: { current: number | null; exploring: number | null; visited: number[]; order: number[]; edge: [number, number] | null } | null;
};

const SVG_W = 720, SVG_H = 400;
const V_R = 15;

type FormInfo = { isBinary: boolean; skew: boolean; full: boolean; complete: boolean; bst: boolean; avl: boolean; height: number; nNodes: number };

function analyze(g: Graph, root: number, labels: number[]): FormInfo {
  const { parent } = g.bfs(root);
  const children = Array.from({ length: g.n }, () => [] as number[]);
  for (let v = 0; v < g.n; v++) if (v !== root && parent[v] !== -1) children[parent[v]].push(v);
  // 孩子数（有向语义，符合 tex）：skew=每节点≤1子；full=每节点0或2子且叶同深
  const isBinary = [...children].every(c => c.length <= 2) && g.connectedComponents().length === 1;
  const skew = isBinary && g.n > 1 && [...children].every(c => c.length <= 1);
  const full = isBinary && g.n > 1 && [...children].every(c => c.length === 0 || c.length === 2) && (() => {
    const depths: number[] = [];
    const walk = (u: number, d: number) => { if (children[u].length === 0) depths.push(d); for (const c of children[u]) walk(c, d + 1); };
    walk(root, 0);
    return new Set(depths).size === 1;
  })() || (g.n === 1 ? true : false);
  // 完全二叉：层序序号 0..n-1，节点 i 的左子若在应是 2i+1、右子 2i+2
  const bfs = g.bfs(root).order;
  const bfsPos = new Map(bfs.map((v, i) => [v, i]));
  const complete = isBinary && (() => {
    for (let i = 0; i < bfs.length; i++) {
      const u = bfs[i];
      // 左子应在 2i+1（若存在）
      if (children[u][0] !== undefined) {
        const l = children[u][0];
        if (bfsPos.get(l) !== 2 * i + 1) return false;
      }
      // 右子存在但左子缺失 → 不完全
      if (children[u][1] !== undefined && children[u][0] === undefined) return false;
      if (children[u][1] !== undefined) {
        const r = children[u][1];
        if (bfsPos.get(r) !== 2 * i + 2) return false;
      }
    }
    return true;
  })();
  // BST：中序遍历应递增（数字标签）
  const inorder: number[] = [];
  let bst = true;
  const recIn = (u: number) => {
    if (children[u][0] !== undefined) recIn(children[u][0]);
    inorder.push(u);
    if (children[u][1] !== undefined) recIn(children[u][1]);
  };
  recIn(root);
  for (let i = 1; i < inorder.length; i++) if (labels[inorder[i - 1]] > labels[inorder[i]]) bst = false;
  // AVL：每节点左右子树高度差 ≤1
  let avl = true;
  const H = (u: number): number => {
    if (children[u].length === 0) return 0;
    return 1 + Math.max(...children[u].map(c => H(c)));
  };
  const check = (u: number): void => {
    const hs = children[u].map(H);
    // 缺子视为空子树高度 0；左右高度差 ≤1
    const lh = hs[0] ?? 0, rh = hs[1] ?? 0;
    if (Math.abs(lh - rh) > 1) avl = false;
    for (const c of children[u]) check(c);
  };
  check(root);
  const depthArr = Array(g.n).fill(0);
  for (let v = 0; v < g.n; v++) if (v !== root && parent[v] !== -1) depthArr[v] = depthArr[parent[v]] + 1;
  return { isBinary, skew, full, complete, bst, avl, height: Math.max(0, ...depthArr), nNodes: g.n };
}

function buildScene(g: Graph, cfg: Cfg, hl: Scene['hl'] = null): Scene {
  const root = Math.min(cfg.root, g.n - 1);
  const layout = g.layoutTree(root, { x0: 20, y0: 25, w: SVG_W - 40, h: SVG_H - 50 });
  const { parent } = g.bfs(root);
  const edges = g.edges.filter(e => parent[e.v] === e.u || parent[e.u] === e.v).map(e => ({ u: e.u, v: e.v }));
  const a = analyze(g, root, cfg.labels);
  return { mode: cfg.mode, labels: [...cfg.labels], edges, root, isBinary: a.isBinary, skew: a.skew, full: a.full, complete: a.complete, bst: a.bst, avl: a.avl, height: a.height, nNodes: g.n, hl };
}

function gen(cfg: Cfg): Frame<Scene>[] {
  const g = new Graph(cfg.n, { labels: cfg.labels.map(String) });
  g.fromSpec(cfg.edgeSpec);
  const root = Math.min(cfg.root, g.n - 1);
  if (cfg.mode === 'edit') {
    return [{ line: 0, caption: T('绘制二叉树：每节点 ≤2 子（左/右）；自动判定形态。右键画布操作。', 'draw binary tree'), scene: buildScene(g, cfg) }];
  }
  const raw: AlgoStep[] = cfg.mode === 'bfs' ? bfsSteps(g, root) : treeTraverseSteps(g, cfg.mode as 'pre' | 'in' | 'post', root);
  return raw.map(st => ({ line: st.line, caption: st.msg, scene: buildScene(g, cfg, { current: st.current, exploring: st.exploring, visited: st.visited, order: st.order, edge: st.edge }) }));
}

const CODE: Record<Exclude<Mode, 'edit'>, Array<{ zh: string; en: string }>> = {
  pre: [
    { zh: 'Preorder($u$): Visit($u$)', en: 'Preorder(u): Visit(u)' },
    { zh: 'Preorder($u.left$)', en: 'Preorder(left)' },
    { zh: 'Preorder($u.right$)', en: 'Preorder(right)' },
  ],
  in: [
    { zh: 'Inorder($u$): Inorder($u.left$)', en: 'Inorder: left' },
    { zh: 'Visit($u$)', en: 'Visit(u)' },
    { zh: 'Inorder($u.right$)', en: 'Inorder(right)' },
  ],
  post: [
    { zh: 'Postorder($u$): Postorder($u.left$)', en: 'Postorder: left' },
    { zh: 'Postorder($u.right$)', en: 'Postorder(right)' },
    { zh: 'Visit($u$)', en: 'Visit(u)' },
  ],
  bfs: [
    { zh: '$Q\\gets\\{r\\}$', en: 'Q←{r}' },
    { zh: 'while $Q\\neq\\emptyset$: 出队 Visit', en: 'while Q≠∅: dequeue visit' },
    { zh: '入队 左/右孩子', en: 'enqueue left/right' },
  ],
};

export const binaryTreeModule: ModuleDef<Scene, Cfg> = {
  id: 'binary-tree',
  title: T('二叉树 · 形态与存储', 'Binary Tree · Forms'),
  desc: T('递归定义 $\\langle d,L,R\\rangle$；自动判定 偏斜/完全/满/BST/AVL；顺序存储 $l{=}2i{+}1,\\;r{=}2i{+}2,\\;p{=}\\lfloor(i{-}1)/2\\rfloor$。', 'Binary forms & storage.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: { mode: 'edit' as Mode, n: 7, edgeSpec: '0-1,0-2,1-3,1-4,2-5', labels: [5, 3, 8, 2, 4, 7], root: 0, execTick: 0 },
  randomize(c) {
    // 生成一棵二叉搜索树（数值标签）
    const vals = [...Array(7)].map((_, i) => i + 1);
    // 简单二叉：层序插入 [1,2,3,4,5,6,7] 并按层相连（满二叉）
    const n = 7;
    const edges: string[] = [];
    for (let i = 1; i < n; i++) edges.push(`${Math.floor((i - 1) / 2)}-${i}`);
    // 打乱标签制造非 BST
    const shuffled = [5, 3, 8, 2, 4, 7, 6];
    return { ...c, n, edgeSpec: edges.join(','), labels: shuffled.slice(0, n), root: 0, execTick: 0 } as Cfg;
  },
  Controls({ config, onChange, t }: any) {
    const isZh = t(T('中文', 'en')) !== 'en';
    const [draft, setDraft] = useState<Cfg>(config);
    const set = (p: Partial<Cfg>) => setDraft(s => ({ ...s, ...p }));
    useEffect(() => { if (draft.mode !== config.mode) setDraft(config); }, [config]);
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca' }}>{isZh ? '模式' : 'MODE'}</span>
          {([['edit', '编辑'], ['pre', '前序'], ['in', '中序'], ['post', '后序'], ['bfs', '层序 BFS']] as Array<[Mode, string]>).map(([v, lb]) => (
            <button key={v} className={`pill ${draft.mode === v ? 'active' : ''}`} onClick={() => { set({ mode: v }); onChange({ ...draft, mode: v }); }}>{lb}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{isZh ? '参数' : 'PARAMS'}</span>
          <button className="ghost" onClick={() => onChange(binaryTreeModule.randomize!(draft))}>↻ {t(T('重新生成', 'Regenerate'))}</button>
          <button className="ghost" onClick={() => onChange({ ...binaryTreeModule.defaultConfig } as Cfg)}>{t(T('示例', 'Example'))}</button>
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) { if (cfg.mode === 'edit') return [] as never; return (CODE[cfg.mode as Exclude<Mode, 'edit'>] ?? []).map(x => ({ zh: x.zh, en: x.en })) as never; },
  generate: gen,
  Render({ scene, config, onChange }) {
    const cfg = config as unknown as Cfg;
    const [manual, setManual] = useState<Record<number, { x: number; y: number }>>({});
    const [selected, setSelected] = useState<number | null>(null);
    const [menu, setMenu] = useState<{ x: number; y: number; sx: number; sy: number; target: number | null } | null>(null);
    const [view, setView] = useState({ tx: 0, ty: 0, s: 1 });
    const [pan, setPan] = useState<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const isEdit = scene.mode === 'edit';
    const worldToSvg = (p: any) => ({ x: p.x * view.s + view.tx, y: p.y * view.s + view.ty });
    const svgToWorld = (p: any) => ({ x: (p.x - view.tx) / view.s, y: (p.y - view.ty) / view.s });
    const g = useMemo(() => { const gg = new Graph(cfg.n, { labels: cfg.labels.map(String) }); gg.fromSpec(cfg.edgeSpec); return gg; }, [cfg.n, cfg.edgeSpec, cfg.labels]);
    const layout = useMemo(() => g.layoutTree(Math.min(cfg.root, g.n - 1), { x0: 20, y0: 25, w: SVG_W - 40, h: SVG_H - 50 }), [g, cfg.root]);
    const pos = useMemo(() => { const m: Record<number, { x: number; y: number }> = {}; for (let i = 0; i < g.n; i++) m[i] = manual[i] ?? { x: layout.pos[i].x, y: layout.pos[i].y }; return m; }, [g, layout, manual]);
    const svgPoint = (e: any) => { const r = svgRef.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * SVG_W, y: ((e.clientY - r.top) / r.height) * SVG_H }; };
    const hitVertex = (p: any) => { const w = svgToWorld(p); for (let i = g.n - 1; i >= 0; i--) if (Math.hypot(w.x - pos[i].x, w.y - pos[i].y) <= V_R + 6) return i; return null; };
    const setCfg = (patch: Partial<Cfg>) => onChange?.({ ...cfg, ...patch } as Cfg);
    const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
    wheelRef.current = (e: WheelEvent) => { const svg = svgRef.current; if (!svg) return; e.preventDefault(); if (!isEdit) return; const r = svg.getBoundingClientRect(); const p = { x: ((e.clientX - r.left) / r.width) * SVG_W, y: ((e.clientY - r.top) / r.height) * SVG_H }; const f = e.deltaY < 0 ? 1.12 : 1 / 1.12; setView(v => { const s = Math.min(4, Math.max(0.25, v.s * f)); return { tx: p.x - (p.x - v.tx) * (s / v.s), ty: p.y - (p.y - v.ty) * (s / v.s), s }; }); };
    useEffect(() => { const el = svgRef.current; if (!el) return; const h = (e: WheelEvent) => wheelRef.current(e); el.addEventListener('wheel', h, { passive: false }); return () => el.removeEventListener('wheel', h); }, []);
    const addVertex = (p: any) => { const nn = g.n + 1; setManual(m => ({ ...m, [g.n]: p })); setCfg({ n: nn, edgeSpec: g.edges.map(e => `${e.u}-${e.v}`).join(','), labels: [...cfg.labels, Math.floor(Math.random() * 20)] }); };
    const removeVertex = (v: number) => { const keep = g.edges.filter(e => e.u !== v && e.v !== v).map(e => `${e.u > v ? e.u - 1 : e.u}-${e.v > v ? e.v - 1 : e.v}`); setCfg({ n: g.n - 1, edgeSpec: keep.join(','), labels: cfg.labels.filter((_, i) => i !== v) }); };
    const link = (a: number, b: number) => { const exists = g.edges.some(e => (e.u === a && e.v === b) || (e.u === b && e.v === a)); if (!exists) { const cur = g.edges.map(e => `${e.u}-${e.v}`).join(','); setCfg({ edgeSpec: cur ? cur + ',' + a + '-' + b : `${a}-${b}` }); } };
    const [drag, setDrag] = useState<number | null>(null); const [dragS, setDragS] = useState<any>(null); const [dragP, setDragP] = useState<any>(null);
    const hl = scene.hl;
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: '#475569', padding: '6px 10px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <span style={{ color: scene.isBinary ? '#059669' : '#dc2626', fontWeight: 700 }}>{scene.isBinary ? '二叉 ✓' : '不是二叉'}</span>
          {scene.skew && <span style={{ fontWeight: 700, color: '#f59e0b' }}>偏斜</span>}
          {scene.full && <span style={{ fontWeight: 700, color: '#4f46e5' }}>满</span>}
          {scene.complete && <span style={{ fontWeight: 700, color: '#10b981' }}>完全</span>}
          {scene.bst && <span style={{ fontWeight: 700, color: '#0ea5e9' }}>BST</span>}
          {scene.avl && <span style={{ fontWeight: 700, color: '#8b5cf6' }}>AVL</span>}
          <MathText text={`高 $H=${scene.height}$ · 节点 ${scene.nNodes}`} />
        </div>
        <div style={{ border: '1px solid #c7d2fe', borderRadius: 12, overflow: 'hidden', background: '#fff', position: 'relative' }}>
          <svg ref={svgRef} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none', userSelect: 'none' }}
            onPointerDown={e => { if (!isEdit) return; const p = svgPoint(e); const v = hitVertex(p); if (v !== null) { setSelected(v); if (e.shiftKey) { link(v, selected ?? v); return; } setDrag(v); setDragS({ x: pos[v].x, y: pos[v].y }); setDragP(p); } else { setSelected(null); setPan({ startX: p.x, startY: p.y, tx: view.tx, ty: view.ty }); } }}
            onPointerMove={e => { if (!isEdit) return; const p = svgPoint(e); if (pan) { setView(v => ({ ...v, tx: pan.tx + (p.x - pan.startX), ty: pan.ty + (p.y - pan.startY) })); return; } if (drag !== null && dragS) { if (!dragP) { setDragP(p); return; } const w = svgToWorld(p), d0 = svgToWorld(dragP); setManual(m => ({ ...m, [drag]: { x: dragS.x + (w.x - d0.x), y: dragS.y + (w.y - d0.y) } })); } }}
            onPointerUp={() => { setDrag(null); setDragS(null); setDragP(null); setPan(null); }}
            onContextMenu={e => { if (!isEdit) return; e.preventDefault(); const p = svgPoint(e); const wp = svgToWorld(p); const v = hitVertex(p); if (v !== null) setSelected(v); setMenu({ x: e.clientX, y: e.clientY, sx: wp.x, sy: wp.y, target: v }); }}>
            {scene.edges.map((e, i) => { const a = worldToSvg(pos[e.u]), b = worldToSvg(pos[e.v]); const isHl = hl?.edge && ((hl.edge[0] === e.u && hl.edge[1] === e.v) || (hl.edge[0] === e.v && hl.edge[1] === e.u)); return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={isHl ? '#f59e0b' : '#94a3b8'} strokeWidth={isHl ? 3 : 1.5} />; })}
            {scene.labels.map((_, i) => { const pw = pos[i]; const p = worldToSvg(pw); const isSel = selected === i; const isCurrent = hl?.current === i; const isVisited = hl?.visited.includes(i); const isRoot = i === scene.root; const fill = isCurrent ? '#4f46e5' : isVisited ? '#a7f3d0' : isSel ? '#ddd6fe' : isRoot ? '#dc2626' : '#0ea5e9'; const orderIdx = hl?.order.indexOf(i); return (
              <g key={i}><circle cx={p.x} cy={p.y} r={V_R} fill={fill} stroke={isSel || isCurrent ? '#312e81' : isRoot ? '#b91c1c' : '#6366f1'} strokeWidth={isSel || isCurrent ? 2.4 : 1.5} /><text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{scene.labels[i]}</text>{orderIdx !== undefined && orderIdx >= 0 && <text x={p.x + V_R - 1} y={p.y - V_R + 1} fontSize={9} fontWeight={800} fill="#64748b">{orderIdx + 1}</text>}</g>
            ); })}
          </svg>
          {isEdit && menu && (
            <div style={{ position: 'fixed', left: menu.x, top: menu.y, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,.18)', padding: 6, minWidth: 160 }} onPointerDown={e => e.stopPropagation()}>
              {menu.target !== null ? (
                <>
                  <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 800, color: '#64748b' }}>顶点 {scene.labels[menu.target]}</div>
                  <MenuItem label="⭐ 设为根" onClick={() => { setCfg({ root: menu.target! }); setMenu(null); }} />
                  <MenuItem label="🔗 连线（Shift+点）" onClick={() => { link(menu.target!, selected ?? menu.target!); setMenu(null); }} />
                  <MenuItem label="删除顶点（含其边）" danger onClick={() => { removeVertex(menu.target!); setMenu(null); }} />
                </>
              ) : (
                <MenuItem label="➕ 新建顶点" onClick={() => { addVertex({ x: menu.sx, y: menu.sy }); setMenu(null); }} />
              )}
            </div>
          )}
        </div>
        {!isEdit && hl && <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b' }}>访问序：{hl.order.map(i => scene.labels[i]).join(' → ')}</div>}
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