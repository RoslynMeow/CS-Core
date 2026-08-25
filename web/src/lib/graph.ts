/**
 * 通用图核心（树的特殊情况底座）
 * ==========
 * 设计目标：Tree/Graph 知识点页面共享的数据 + 算法 + 布局层。
 * - 图 = (V, E)，支持有向/无向、顶点标签
 * - 树 = 连通无环图；森林 = 无环图（本库提供判定）
 * - 布局：环形（小图缺省）、分层（树/森林默认）、弹簧力导向（图默认）
 *
 * 后期每个知识点页在各自 module 里用本库，测试页 GraphStudio 可删。
 */

export type GraphEdge = { u: number; v: number; weight?: number };
export type Vec2 = { x: number; y: number };

export type GraphBuildResult = { ok: boolean; error?: string };

export class Graph {
  n: number;
  directed: boolean;
  labels: string[];
  edges: GraphEdge[];
  weighted: boolean;

  // 缓存结构（构建时惰性重建）
  private _adj: number[][][] | null = null; // adj[u] = [[v, w], ...]
  private _mat: (number | null)[][] | null = null;
  private _deg: number[] | null = null;
  private _indeg: number[] | null = null;

  constructor(n: number, opts: { directed?: boolean; labels?: string[]; weighted?: boolean } = {}) {
    this.n = Math.max(1, Math.floor(n));
    this.directed = opts.directed ?? false;
    this.weighted = opts.weighted ?? false;
    this.labels = opts.labels ?? Array.from({ length: this.n }, (_, i) => String(i));
    if (this.labels.length < this.n) while (this.labels.length < this.n) this.labels.push(String(this.labels.length));
    this.edges = [];
  }

  // ---------- 构建 ----------

  addEdge(u: number, v: number, weight = 1): boolean {
    if (!this.valid(u) || !this.valid(v)) return false;
    if (weight !== 1) this.weighted = true; // 任一权重≠1 → 图进入加权模式
    this.edges.push({ u, v, weight: weight !== 1 ? weight : undefined }); // 默认 1 不显式存（避免误当权重展示）
    this.invalidate();
    return true;
  }
  /** 更新已存在边的权重；无则新增 */
  setWeight(u: number, v: number, w: number): boolean {
    if (!this.valid(u) || !this.valid(v) || !Number.isFinite(w) || w <= 0) return false;
    const e = this.edges.find(x => (x.u === u && x.v === v) || (!this.directed && x.u === v && x.v === u));
    if (e) e.weight = w; else this.addEdge(u, v, w);
    if (w !== 1) this.weighted = true;
    this.invalidate();
    return true;
  }
  /** 批量构建；uv 支持 "0-1,1-2" 或 "0 1,1 2"，带权重 "0-1:5,1-2:3" */
  fromSpec(spec: string): GraphBuildResult {
    const part = spec.split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);
    const added: Array<[number, number, number]> = [];
    for (const p of part) {
      const m = p.match(/^(\d+)(?:-|→|->|~)(\d+)(?::(\d+))?$/);
      if (!m) return { ok: false, error: `无法解析边 "${p}"（期望如 0-1 或 0-1:5）` };
      const u = +m[1], v = +m[2], w = m[3] !== undefined ? +m[3] : 1;
      if (!this.valid(u) || !this.valid(v)) return { ok: false, error: `顶点越界：${u}-${v}（需 0..${this.n - 1}）` };
      if (!Number.isFinite(w) || w <= 0) return { ok: false, error: `权重非法："${p}" 的权重需为正数` };
      added.push([u, v, w]);
    }
    for (const [u, v, w] of added) this.addEdge(u, v, w);
    return { ok: true };
  }
  /** 从邻接表式文本构建（多行 "idx: a,b,c"） */
  fromAdjacencyText(text: string): GraphBuildResult {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const m = line.match(/^(\d+)\s*[:=]\s*(.*)$/);
      if (!m) continue;
      const u = +m[1];
      if (!this.valid(u)) continue;
      const rest = m[2];
      for (const t of rest.split(/[, ]+/).filter(Boolean)) {
        const v = +(t.replace(/[^\d-]/g, ''));
        if (Number.isFinite(v) && this.valid(v)) this.addEdge(u, v);
      }
    }
    return { ok: true };
  }

  clear() { this.edges = []; this.invalidate(); }
  removeEdge(u: number, v: number) {
    this.edges = this.edges.filter(e => !((e.u === u && e.v === v) || (!this.directed && e.u === v && e.v === u)));
    this.invalidate();
  }
  private valid(x: number) { return x >= 0 && x < this.n; }
  private invalidate() { this._adj = this._mat = this._deg = this._indeg = null; }

  // ---------- 访问 ----------

  /** 邻接表：adj[u] = [v, weight][] */
  adj(): number[][][] {
    if (this._adj) return this._adj;
    const adj: number[][][] = Array.from({ length: this.n }, () => []);
    for (const e of this.edges) {
      adj[e.u].push([e.v, e.weight ?? 1]);
      if (!this.directed) adj[e.v].push([e.u, e.weight ?? 1]);
    }
    this._adj = adj;
    return adj;
  }
  /** 邻接矩阵：mat[u][v] = weight | null */
  mat(): (number | null)[][] {
    if (this._mat) return this._mat;
    const m: (number | null)[][] = Array.from({ length: this.n }, () => Array(this.n).fill(null));
    for (const e of this.edges) {
      const w = e.weight ?? 1;
      m[e.u][e.v] = w;
      if (!this.directed) m[e.v][e.u] = w;
    }
    this._mat = m;
    return m;
  }
  /** 度（无向 = 邻边数；有向 = 出边数） */
  degree(): number[] {
    if (this._deg) return this._deg;
    this._deg = this.adj().map(a => a.length);
    return this._deg;
  }
  /** 出度（有向图 = 出边数；无向等价度） */
  outdegree(): number[] {
    return this.adj().map(a => a.length);
  }
  /** 入度（有向才有意义；无向 = 度） */
  indegree(): number[] {
    if (this._indeg) return this._indeg;
    this._indeg = Array(this.n).fill(0);
    if (this.directed) for (const e of this.edges) this._indeg[e.v]++;
    else this._indeg = this.degree();
    return this._indeg;
  }

  edgeCount(): number { return this.directed ? this.edges.length : this.edges.length; }
  isIsolated(u: number) { return this.degree()[u] === 0; }

  // ---------- 遍历 ----------

  /** BFS 从 start 出发的访问序；返回 {order, parent, dist} */
  bfs(start = 0): { order: number[]; parent: number[]; dist: number[] } {
    const parent = Array(this.n).fill(-1), dist = Array(this.n).fill(-1);
    const order: number[] = [];
    const adj = this.adj();
    const q: number[] = [];
    const push = (s: number) => { parent[s] = s; dist[s] = 0; q.push(s); };
    push(start);
    let head = 0;
    while (head < q.length) {
      const u = q[head++];
      order.push(u);
      for (const [v] of adj[u]) if (parent[v] === -1) { parent[v] = u; dist[v] = dist[u] + 1; q.push(v); }
    }
    return { order, parent, dist };
  }

  /** DFS 从 start 出发（栈实现，不递归防爆栈）；返回 {order, parent, enter, exit} */
  dfs(start = 0): { order: number[]; parent: number[]; enter: number[]; exit: number[] } {
    const parent = Array(this.n).fill(-1);
    const enter = Array(this.n). fill(-1), exit = Array(this.n).fill(-1);
    const order: number[] = [];
    const adj = this.adj();
    // 迭代：栈存 [u, childIndex, phase]；phase 0=入 1=出
    const done = (u: number) => { exit[u] = order.length; };
    const stack: number[][] = [];
    const startEnter = () => { parent[start] = start; enter[start] = order.length; order.push(start); };
    startEnter();
    stack.push([start, 0]);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const u = top[0];
      const a = adj[u];
      if (top[1] < a.length) {
        const v = a[top[1]][0];
        top[1]++;
        if (parent[v] !== -1) continue; // 已访问（含回边）
        parent[v] = u;
        enter[v] = order.length;
        order.push(v);
        stack.push([v, 0]);
      } else {
        done(u);
        stack.pop();
      }
    }
    return { order, parent, enter, exit };
  }

  /** 全图遍历（处理多个连通分量）：返回各分量访问序 */
  allComponents(): number[][] {
    const seen = Array(this.n).fill(false);
    const comps: number[][] = [];
    const adj = this.adj();
    const sink = (s: number) => {
      const out: number[] = [];
      const q = [s]; seen[s] = true;
      let head = 0;
      while (head < q.length) {
        const u = q[head++]; out.push(u);
        for (const [v] of adj[u]) if (!seen[v]) { seen[v] = true; q.push(v); }
      }
      return out;
    };
    for (let i = 0; i < this.n; i++) if (!seen[i]) comps.push(sink(i));
    return comps;
  }

  /** 连通分量（无向 = 标准；有向 = 弱连通分量） */
  connectedComponents(): number[][] { return this.allComponents(); }

  // ---------- 判定 ----------

  /** 无向环检测：DFS 回边（邻接已访问且非父 → 环） */
  hasUndirectedCycle(): boolean {
    const adj = this.adj();
    const visited = Array(this.n).fill(false);
    const parent = Array(this.n).fill(-1);
    // 迭代 DFS：栈存 [u, childIdx]，维护 visited/parent
    for (let s = 0; s < this.n; s++) {
      if (visited[s]) continue;
      visited[s] = true; parent[s] = -2; // 根的特殊标记
      const stack: Array<[number, number]> = [[s, 0]];
      while (stack.length) {
        const top = stack[stack.length - 1];
        const u = top[0];
        const a = adj[u];
        if (top[1] >= a.length) { stack.pop(); continue; }
        const v = a[top[1]][0];
        top[1]++;
        if (v === parent[u]) continue;      // 无向：父边不是环
        if (visited[v]) return true;        // 回边 → 环
        visited[v] = true; parent[v] = u;
        stack.push([v, 0]);
      }
    }
    return false;
  }

  /** 有向环检测：DFS 三色（白/灰/黑；灰中再遇 → 环） */
  hasDirectedCycle(): boolean {
    const adj = this.adj();
    const color = Array(this.n).fill(0); // 0 白 1 灰 2 黑
    const dfsVisit = (s: number): boolean => {
      const stack: number[][] = [[s, 0]]; // [u, nextChild]
      color[s] = 1;
      while (stack.length) {
        const top = stack[stack.length - 1];
        const u = top[0];
        if (top[1] >= adj[u].length) { color[u] = 2; stack.pop(); continue; }
        const v = adj[u][top[1]][0];
        top[1]++;
        if (color[v] === 1) return true;
        if (color[v] === 0) { color[v] = 1; stack.push([v, 0]); }
      }
      return false;
    };
    for (let i = 0; i < this.n; i++) if (color[i] === 0 && dfsVisit(i)) return true;
    return false;
  }

  hasCycle(): boolean { return this.directed ? this.hasDirectedCycle() : this.hasUndirectedCycle(); }

  /** 树 = 无环 + 连通（n 个顶点恰 n-1 条边且可达）（有向：弱连通且无环） */
  isTree(): boolean {
    if (this.n === 0) return false;
    if (this.edges.length !== this.n - 1) return false;
    if (this.hasCycle()) return false;
    const comps = this.allComponents();
    return comps.length === 1;
  }
  /** 森林 = 无环（一个或多个连通分量均为树） */
  isForest(): boolean { return !this.hasCycle(); }

  /** Kahn 拓扑排序（仅 DAG 有解） */
  topologicalOrder(): number[] | null {
    if (!this.directed) return null;
    const indeg = this.indegree();
    const adj = this.adj();
    const q: number[] = [];
    for (let i = 0; i < this.n; i++) if (indeg[i] === 0) q.push(i);
    const order: number[] = [];
    let head = 0;
    while (head < q.length) {
      const u = q[head++];
      order.push(u);
      for (const [v] of adj[u]) if (--indeg[v] === 0) q.push(v);
    }
    return order.length === this.n ? order : null;
  }

  // ---------- 生成 ----------

  /** 随机树（无向连通 n-1 边）：每个 i 连到一个随机祖先 */
  static randomTree(n: number, opts: { labels?: string[] } = {}): Graph {
    const g = new Graph(n, opts);
    for (let i = 1; i < n; i++) {
      const p = Math.floor(Math.random() * i);
      g.addEdge(p, i);
    }
    return g;
  }
  /** 随机森林（k 棵树） */
  static randomForest(n: number, k: number, opts: { labels?: string[] } = {}): Graph {
    const g = new Graph(n, opts);
    const kk = Math.max(1, Math.min(k, n));
    // 每棵树的大小尽量均匀；根依次是 0, s1, s2, …
    const roots: number[] = [];
    let acc = 0;
    for (let t = 0; t < kk; t++) {
      const size = t === kk - 1 ? n - acc : Math.max(1, Math.floor((n - acc) / (kk - t)));
      roots.push(acc);
      for (let i = acc + 1; i < acc + size; i++) {
        const p = acc + Math.floor(Math.random() * (i - acc));
        g.addEdge(p, i);
      }
      acc += size;
    }
    return g;
  }
  /** 随机图（无向，边概率 p） */
  static randomGraph(n: number, p: number, opts: { directed?: boolean; labels?: string[] } = {}): Graph {
    const g = new Graph(n, opts);
    for (let i = 0; i < n; i++)
      for (let j = opts.directed ? 0 : i + 1; j < n; j++)
        if (i !== j && Math.random() < p) g.addEdge(i, j);
    return g;
  }

  // ---------- 布局 ----------

  /** 环形布局（小图/密集图缺省） */
  layoutCircle(cx: number, cy: number, r: number): Vec2[] {
    const out: Vec2[] = [];
    for (let i = 0; i < this.n; i++) {
      const a = (i / Math.max(1, this.n)) * Math.PI * 2 - Math.PI / 2;
      out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return out;
  }

  /** 按树形分层布局（森林：多棵根树横排）；返回 { pos, layer, children } */
  layoutTree(root: number, box: { x0: number; y0: number; w: number; h: number }): { pos: Vec2[]; layer: number[]; children: number[][] } {
    const children: number[][] = Array.from({ length: this.n }, () => []);
    const parent = Array(this.n).fill(-1);
    const treeAdj = this.adj();
    // BFS 建森林父子关系（每棵树的根 = 首个未访问顶点）
    const visited = Array(this.n).fill(false);
    const roots: number[] = [];
    const build = (s: number) => {
      visited[s] = true; parent[s] = -1; roots.push(s);
      const q = [s]; let head = 0;
      while (head < q.length) {
        const u = q[head++];
        for (const [v] of treeAdj[u]) if (!visited[v]) { visited[v] = true; parent[v] = u; children[u].push(v); q.push(v); }
      }
    };
    for (let i = 0; i < this.n; i++) if (!visited[i]) build(i);

    // 深度
    const layer = Array(this.n).fill(0);
    const depth = (u: number, d: number) => { layer[u] = d; for (const c of children[u]) depth(c, d + 1); };
    for (const r of roots) depth(r, 0);

    // 叶子数权重（决定子树占据的横向宽度）
    const weight = (u: number): number => {
      if (children[u].length === 0) return 1;
      return children[u].reduce((s, c) => s + weight(c), 0);
    };
    // 每棵树分别分配横向区间，再整体居中
    const pos: Vec2[] = Array.from({ length: this.n }, () => ({ x: 0, y: 0 }));
    // 树内：递归布局，子树中心 = 子权重中位数
    const layoutOne = (u: number, xLeft: number, xRight: number) => {
      const span = Math.max(1, xRight - xLeft);
      const total = weight(u);
      const my = (xLeft + xRight) / 2;
      pos[u] = { x: my, y: box.y0 + 20 + (layer[u] * (box.h - 60)) / Math.max(1, box.h - 60) };
      let cursor = xLeft;
      for (const c of children[u]) {
        const cw = weight(c);
        const cRight = cursor + (cw / total) * span;
        layoutOne(c, cursor, cRight);
        cursor = cRight;
      }
    };
    // 计算所有根的总宽度，分配每个根的横向区间
    const totalW = roots.reduce((s, r) => s + weight(r), 0);
    let rootCursor = box.x0 + 20;
    for (const r of roots) {
      const w = weight(r);
      const rRight = rootCursor + (w / totalW) * (box.w - 40);
      layoutOne(r, rootCursor, rRight);
      rootCursor = rRight;
    }
    // 纵坐标：按 layer 均匀
    const maxD = Math.max(0, ...layer);
    for (let i = 0; i < this.n; i++) {
      pos[i].y = box.y0 + 24 + (maxD === 0 ? 0 : (layer[i] / maxD) * (box.h - 48));
    }
    // 若多棵树根在同一序号区间，稍微左右错开避免完全重叠（森林）
    return { pos, layer, children };
  }

  /** 弹簧力导向（图默认）：库仑斥力 + 胡克弹簧，迭代稳定 */
  layoutForce(cx: number, cy: number, w: number, h: number, iters = 120): Vec2[] {
    const pos = this.layoutCircle(cx, cy, Math.min(w, h) * 0.35);
    const adj = this.adj();
    const k = Math.sqrt(w * h / Math.max(1, this.n));
    const alpha = 0.08;
    for (let iter = 0; iter < iters; iter++) {
      const f = Array.from({ length: this.n }, () => ({ x: 0, y: 0 }));
      // 斥力 O(n²)
      for (let i = 0; i < this.n; i++)
        for (let j = i + 1; j < this.n; j++) {
          let dx = pos[j].x - pos[i].x, dy = pos[j].y - pos[i].y;
          let d = Math.hypot(dx, dy) || 0.1;
          const rep = k * k / d;
          const ux = dx / d, uy = dy / d;
          f[i].x -= rep * ux; f[i].y -= rep * uy;
          f[j].x += rep * ux; f[j].y += rep * uy;
        }
      // 引力（沿边）
      for (let u = 0; u < this.n; u++)
        for (const [v] of adj[u]) {
          let dx = pos[v].x - pos[u].x, dy = pos[v].y - pos[u].y;
          let d = Math.hypot(dx, dy) || 0.1;
          const att = d * d / k;
          const ux = dx / d, uy = dy / d;
          f[u].x += att * ux; f[u].y += att * uy;
          if (!this.directed) { f[v].x -= att * ux; f[v].y -= att * uy; }
        }
      for (let i = 0; i < this.n; i++) {
        pos[i].x += f[i].x * alpha;
        pos[i].y += f[i].y * alpha;
        pos[i].x = Math.min(Math.max(pos[i].x, 24), w - 24);
        pos[i].y = Math.min(Math.max(pos[i].y, 24), h - 24);
      }
    }
    // 居中偏移
    return pos;
  }
}

/** 顶点标签美化（树常用字母序，图常用数字） */
export function alphaLabels(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let s = '';
    let x = i;
    do { s = String.fromCharCode(65 + (x % 26)) + s; x = Math.floor(x / 26) - 1; } while (x >= 0);
    out.push(s);
  }
  return out;
}
// ============================================================
// 算法步进（供知识点页 generate 逐帧播放）
// 每步：伪代码行 + 当前顶点 + 已访问 + 边界(队列/栈) + 顺序 + 探线
// ============================================================

export type AlgoStep = {
  line: number;           // 伪代码当前行（0-based）
  current: number | null; // 正在处理/访问的顶点
  exploring: number | null; // 正在遍历其邻接表的顶点（BFS line3/DFS line4）
  visited: number[];      // 已完成处理的顶点集
  frontier: number[];     // 队列（BFS）/ 栈（DFS）/ 当前入度为0集（拓扑）
  order: number[];        // 访问/输出顺序
  edge: [number, number] | null; // 正在检查的边
  msg: { zh: string; en: string };
};

/** BFS 步骤（start 为根） */
export function bfsSteps(g: Graph, start = 0, labels: string[] = g.labels): AlgoStep[] {
  const n = g.n, adj = g.adj();
  const visited = Array(n).fill(false);
  const steps: AlgoStep[] = [];
  const q: number[] = [];
  const order: number[] = [];
  const S = (i: number) => labels[i];
  const visitedList = () => visited.map((_, i) => i).filter(i => visited[i]);

  steps.push({ line: 0, current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, msg: { zh: `初始化：$visited$ 全 false，队列 $Q \\gets \\{${S(start)}\\}$`, en: `init: Q←{${S(start)}}` } });
  visited[start] = true; q.push(start);
  steps.push({ line: 1, current: null, exploring: null, visited: visitedList(), frontier: [...q], order: [], edge: null, msg: { zh: `入队：$Q \\gets {${q.map(S).join(',')}}$，$visited[${S(start)}]\\gets true$`, en: `enqueue ${S(start)}` } });

  let head = 0;
  while (head < q.length) {
    const u = q[head++];
    order.push(u);
    steps.push({ line: 2, current: u, exploring: null, visited: visitedList(), frontier: [...q], order: [...order], edge: null, msg: { zh: `出队：$u \\gets ${S(u)}$ → 访问顺序 ${order.length}`, en: `dequeue ${S(u)}` } });
    for (const [v] of adj[u]) {
      steps.push({ line: 3, current: u, exploring: u, visited: visitedList(), frontier: [...q], order: [...order], edge: [u, v], msg: { zh: `看邻边 $(${S(u)},${S(v)})$：$visited[${S(v)}]=${visited[v] ? 'true' : 'false'}$（${visited[v] ? '已访问，跳过' : '未访问'}）`, en: `check (${S(u)},${S(v)})` } });
      if (!visited[v]) {
        visited[v] = true; q.push(v);
        steps.push({ line: 4, current: u, exploring: u, visited: visitedList(), frontier: [...q], order: [...order], edge: [u, v], msg: { zh: `发现 $v=${S(v)}$：入队 $Q$，$visited\\gets true$`, en: `found ${S(v)}` } });
      }
    }
  }
  return steps;
}

/** DFS 步骤（迭代栈；start 为根） */
export function dfsSteps(g: Graph, start = 0, labels: string[] = g.labels): AlgoStep[] {
  const n = g.n, adj = g.adj();
  const visited = Array(n).fill(false);
  const steps: AlgoStep[] = [];
  const stack: number[] = [];
  const order: number[] = [];
  const S = (i: number) => labels[i];
  const visitedList = () => visited.map((_, i) => i).filter(i => visited[i]);

  steps.push({ line: 0, current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, msg: { zh: `初始化：$S \\gets \\{${S(start)}\\}$`, en: `init: S←{${S(start)}}` } });
  stack.push(start);
  steps.push({ line: 1, current: null, exploring: null, visited: visitedList(), frontier: [...stack], order: [], edge: null, msg: { zh: `栈 $S \\gets {${stack.map(S).join(',')}}$`, en: `push ${S(start)}` } });

  while (stack.length) {
    const u = stack.pop()!;
    steps.push({ line: 2, current: u, exploring: null, visited: visitedList(), frontier: [...stack], order: [...order], edge: null, msg: { zh: `弹出：$u \\gets ${S(u)}$`, en: `pop ${S(u)}` } });
    if (visited[u]) continue;
    visited[u] = true;
    order.push(u);
    steps.push({ line: 3, current: u, exploring: null, visited: visitedList(), frontier: [...stack], order: [...order], edge: null, msg: { zh: `访问 $v=${S(u)}$：访问顺序第 ${order.length} 位`, en: `visit ${S(u)}` } });
    // 压入所有未访问邻接（倒序压栈保持自然序）
    const neighbors = adj[u].map(([v]) => v).filter(v => !visited[v]).reverse();
    if (neighbors.length === 0) continue;
    for (const v of neighbors) {
      steps.push({ line: 4, current: u, exploring: u, visited: visitedList(), frontier: [...stack], order: [...order], edge: [u, v], msg: { zh: `压栈：$v=${S(v)}$（$!visited$）$\\to S$`, en: `push ${S(v)}` } });
      stack.push(v);
    }
  }
  return steps;
}

/** Kahn 拓扑排序步骤（仅 DAG） */
export function topoSteps(g: Graph, labels: string[] = g.labels): AlgoStep[] {
  const n = g.n, adj = g.adj();
  const indeg = g.indegree();
  const steps: AlgoStep[] = [];
  const q: number[] = [];
  const order: number[] = [];
  const S = (i: number) => labels[i];
  const fr = () => [...q];

  steps.push({ line: 0, current: null, exploring: null, visited: [], frontier: [], order: [], edge: null, msg: { zh: `计算入度：$in=${indeg.map((v, i) => `${S(i)}:${v}`).join(', ')}$`, en: `indeg: ${indeg.join(',')}` } });
  for (let i = 0; i < n; i++) if (indeg[i] === 0) q.push(i);
  steps.push({ line: 1, current: null, exploring: null, visited: [], frontier: fr(), order: [], edge: null, msg: { zh: `入度为 0 入队：$\\{${q.map(S).join(',')}\\}$`, en: `enqueue indeg=0` } });

  let head = 0;
  while (head < q.length) {
    const u = q[head++];
    steps.push({ line: 2, current: u, exploring: null, visited: [...order], frontier: fr(), order: [...order], edge: null, msg: { zh: `弹出 $u=${S(u)}$ → 拓扑序`, en: `pop ${S(u)}` } });
    order.push(u);
    steps.push({ line: 3, current: u, exploring: u, visited: [...order], frontier: fr(), order: [...order], edge: null, msg: { zh: `邻接 $in\\gets in{-}1$`, en: `decrement indeg` } });
    for (const [v] of adj[u]) {
      indeg[v]--;
      steps.push({ line: 4, current: u, exploring: u, visited: [...order], frontier: fr(), order: [...order], edge: [u, v], msg: { zh: `$in[${S(v)}]=${indeg[v]}$，为 0 入队`, en: `indeg[${S(v)}]=${indeg[v]}` } });
      if (indeg[v] === 0) q.push(v);
    }
  }
  steps.push({ line: 5, current: null, exploring: null, visited: [...order], frontier: [], order: [...order], edge: null, msg: { zh: order.length === n ? `拓扑序：$[${order.map(S).join(', ')}]$（无环）` : `检测到环：仅输出 ${order.length}/${n} 个顶点`, en: order.length === n ? 'topo done' : 'cycle!' } });
  return steps;
}

// ============================================================
// 内存布局 dump（供 #/memory 可视化；与 hashTable 等链式风格一致）
// ============================================================

import type { MemoryDump, DumpAlloc, DumpField } from './memoryDump';
import { hexFromBytes } from './memoryDump';

export type GraphRepr = 'adjlist' | 'adjmat' | 'array' | 'edges';

/** 将图的某种内存表示生成为 MemoryDump，可在 #/memory 页查看 */
export function buildGraphDump(g: Graph, repr: GraphRepr, opts: { ptrSize?: number; elemSize?: number; base?: number; root?: number } = {}): MemoryDump {
  const ptrSize = opts.ptrSize ?? 4;
  const elemSize = opts.elemSize ?? 4;
  const base = opts.base ?? 0x555555559800;
  const lb = g.labels;
  let cursor = base;
  // little-endian：低字节在前，负值按补码
  const bytesOf = (v: number, size: number): number[] => {
    const neg = v < 0 ? Math.pow(2, size * 8) + v : v;
    const out: number[] = [];
    let x = neg >>> 0;
    for (let i = 0; i < size; i++) { out.push(x & 0xff); x >>>= 8; }
    return out;
  };

  const allocs: DumpAlloc[] = [];

  if (repr === 'adjmat') {
    // 邻接矩阵：连续 n*n 块，fields 逐格
    const mat = g.mat();
    const bytes: number[] = [];
    for (const row of mat) for (const w of row) bytes.push(...bytesOf(w ?? 0, elemSize));
    const fields = mat.flatMap((row, r) => row.map((w, c) => ({
      name: `${lb[r]}→${lb[c]}${w !== null ? '' : ' —'}`, offset: (r * g.n + c) * elemSize, size: elemSize, type: w !== null ? 'u32' : 'u8', color: w !== null ? '#4f46e5' : '#e2e8f0',
    })));
    allocs.push({ key: 'mat', addr: `0x${cursor.toString(16)}`, size: g.n * g.n * elemSize, hex: hexFromBytes(bytes), label: `邻接矩阵 M[${g.n}][${g.n}] · ${g.n * g.n} 格 × ${elemSize}B`, color: '#4f46e5', fields });
  } else if (repr === 'array') {
    // parent 数组：连续 n 块，每槽存父下标（根 -1）
    const bfs = g.bfs(opts.root ?? 0);
    const rootIdx = opts.root ?? 0;
    // 根自身 parent=自身 → 显示 -1；其余正常
    const parent = bfs.parent.map((p, i) => (i === rootIdx ? -1 : p));
    const bytes: number[] = [];
    for (const p of parent) bytes.push(...bytesOf(p === -1 ? -1 : p, elemSize));
    const fields = parent.map((p, i) => ({ name: `${lb[i]}${p === -1 ? '(根)' : ''}`, offset: i * elemSize, size: elemSize, type: 'i32', color: p === -1 ? '#dc2626' : '#10b981' }));
    allocs.push({ key: 'parent', addr: `0x${cursor.toString(16)}`, size: g.n * elemSize, hex: hexFromBytes(bytes), label: `parent[] 压缩表示 · 根=−1 · ${g.n} 槽 × ${elemSize}B`, color: '#10b981', fields });
  } else if (repr === 'edges') {
    // 边集数组：每边 u,v 两个连续槽
    const bytes: number[] = [];
    const fields: DumpField[] = [];
    g.edges.forEach((e, k) => {
      bytes.push(...bytesOf(e.u, elemSize));
      bytes.push(...bytesOf(e.v, elemSize));
      fields.push({ name: `${lb[e.u]}`, offset: k * 2 * elemSize, size: elemSize, type: 'u32', color: '#6366f1' });
      fields.push({ name: `${lb[e.v]}`, offset: k * 2 * elemSize + elemSize, size: elemSize, type: 'u32', color: '#0ea5e9' });
    });
    allocs.push({ key: 'edges', addr: `0x${cursor.toString(16)}`, size: g.edges.length * 2 * elemSize, hex: hexFromBytes(bytes), label: `边集数组 · ${g.edges.length} 边 × (u,v)`, color: '#6366f1', fields });
  } else {
    // 邻接表（链式）：顶点表 head[] 连续存首邻居指针；每邻居一个节点 (v, next)
    const adj = g.adj();
    // 先规划地址：head 表占 n*ptrSize，节点紧随
    const headTableSize = g.n * ptrSize;
    const headTableAddr = cursor;
    const nodeBase = cursor + headTableSize;
    // 按序给每个邻居节点分配地址
    const nodeAddrs: number[][][] = adj.map(nbrs => { let off = 0; return nbrs.map(() => { const a = nodeBase + off; off += elemSize + ptrSize; return [a]; }); });
    // 顶点表字节：head[u] = 首邻居地址或 0
    const headDumpBytes: number[] = [];
    for (let u = 0; u < g.n; u++) {
      const first = nodeAddrs[u][0]?.[0] ?? 0;
      headDumpBytes.push(...bytesOf(first, ptrSize));
    }
    allocs.push({
      key: 'heads', addr: `0x${headTableAddr.toString(16)}`, size: headTableSize, hex: hexFromBytes(headDumpBytes),
      label: `顶点表 head[0..${g.n - 1}]（首邻居指针）`, color: '#6366f1',
      fields: g.labels.map((l, u) => ({ name: l, offset: u * ptrSize, size: ptrSize, type: 'u32', color: '#6366f1' })),
    });
    // 每个邻居节点：v + next 指针
    adj.forEach((nbrs, u) => {
      nbrs.forEach(([v], k) => {
        const a = nodeAddrs[u][k][0];
        const nxt = k + 1 < nbrs.length ? nodeAddrs[u][k + 1][0] : 0;
        const bytes = [...bytesOf(v, elemSize), ...bytesOf(nxt, ptrSize)];
        allocs.push({
          key: `n${u}_${k}`, addr: `0x${a.toString(16)}`, size: elemSize + ptrSize, hex: hexFromBytes(bytes),
          label: `${lb[u]}: ${lb[v]} → ${nxt ? `0x${nxt.toString(16)}` : 'null'}`, color: '#0ea5e9',
          fields: [
            { name: 'v', offset: 0, size: elemSize, type: 'u32', color: '#0ea5e9' },
            { name: 'next', offset: elemSize, size: ptrSize, type: 'u32', color: '#64748b' },
          ],
        });
      });
    });
  }
  return { base: `0x${base.toString(16)}`, total: cursor - base + 0x100, endian: 'little', allocations: allocs };
}
