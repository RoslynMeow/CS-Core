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

  constructor(
    n: number,
    opts: { directed?: boolean; labels?: string[]; weighted?: boolean } = {},
  ) {
    this.n = Math.max(0, Math.floor(n)); // 允许 0 = 空图
    this.directed = opts.directed ?? false;
    this.weighted = opts.weighted ?? false;
    this.labels =
      opts.labels ?? Array.from({ length: this.n }, (_, i) => String(i));
    if (this.labels.length < this.n)
      while (this.labels.length < this.n)
        this.labels.push(String(this.labels.length));
    this.edges = [];
  }

  // ---------- 构建 ----------

  addEdge(u: number, v: number, weight = 1): boolean {
    if (!this.valid(u) || !this.valid(v)) return false;
    if (weight !== 1) this.weighted = true; // 任一权重≠1 → 图进入加权模式
    this.edges.push({ u, v, weight: weight === 1 ? undefined : weight }); // 默认 1 不显式存（避免误当权重展示）
    this.invalidate();
    return true;
  }
  /** 更新已存在边的权重；无则新增 */
  setWeight(u: number, v: number, w: number): boolean {
    if (!this.valid(u) || !this.valid(v) || !Number.isFinite(w) || w <= 0)
      return false;
    const e = this.edges.find(
      (x) =>
        (x.u === u && x.v === v) || (!this.directed && x.u === v && x.v === u),
    );
    if (e) e.weight = w;
    else this.addEdge(u, v, w);
    if (w !== 1) this.weighted = true;
    this.invalidate();
    return true;
  }
  /** 批量构建；uv 支持 "0-1,1-2" 或 "0 1,1 2"，带权重 "0-1:5,1-2:3" */
  fromSpec(spec: string): GraphBuildResult {
    const part = spec
      .split(/[,;\n]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const added: Array<[number, number, number]> = [];
    for (const p of part) {
      const m = p.match(/^(\d+)(?:-|→|->|~)(\d+)(?::(\d+))?$/);
      if (!m)
        return { ok: false, error: `无法解析边 "${p}"（期望如 0-1 或 0-1:5）` };
      const u = +m[1],
        v = +m[2],
        w = m[3] === undefined ? 1 : +m[3];
      if (!this.valid(u) || !this.valid(v))
        return {
          ok: false,
          error: `顶点越界：${u}-${v}（需 0..${this.n - 1}）`,
        };
      if (!Number.isFinite(w) || w <= 0)
        return { ok: false, error: `权重非法："${p}" 的权重需为正数` };
      added.push([u, v, w]);
    }
    for (const [u, v, w] of added) this.addEdge(u, v, w);
    return { ok: true };
  }
  /** 从邻接表式文本构建（多行 "idx: a,b,c"） */
  fromAdjacencyText(text: string): GraphBuildResult {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      const m = line.match(/^(\d+)\s*[:=]\s*(.*)$/);
      if (!m) continue;
      const u = +m[1];
      if (!this.valid(u)) continue;
      const rest = m[2];
      for (const t of rest.split(/[, ]+/).filter(Boolean)) {
        const v = +t.replace(/[^\d-]/g, "");
        if (Number.isFinite(v) && this.valid(v)) this.addEdge(u, v);
      }
    }
    return { ok: true };
  }

  clear() {
    this.edges = [];
    this.invalidate();
  }
  removeEdge(u: number, v: number) {
    this.edges = this.edges.filter(
      (e) =>
        !(
          (e.u === u && e.v === v) ||
          (!this.directed && e.u === v && e.v === u)
        ),
    );
    this.invalidate();
  }
  private valid(x: number) {
    return x >= 0 && x < this.n;
  }
  private invalidate() {
    this._adj = this._mat = this._deg = this._indeg = null;
  }

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
    const m: (number | null)[][] = Array.from({ length: this.n }, () =>
      Array(this.n).fill(null),
    );
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
    this._deg = this.adj().map((a) => a.length);
    return this._deg;
  }
  /** 出度（有向图 = 出边数；无向等价度） */
  outdegree(): number[] {
    return this.adj().map((a) => a.length);
  }
  /** 入度（有向才有意义；无向 = 度） */
  indegree(): number[] {
    if (this._indeg) return this._indeg;
    this._indeg = Array(this.n).fill(0);
    if (this.directed) for (const e of this.edges) this._indeg[e.v]++;
    else this._indeg = this.degree();
    return this._indeg;
  }

  edgeCount(): number {
    return this.directed ? this.edges.length : this.edges.length;
  }
  isIsolated(u: number) {
    return this.degree()[u] === 0;
  }

  // ---------- 遍历 ----------

  /** BFS 从 start 出发的访问序；返回 {order, parent, dist} */
  bfs(start = 0): { order: number[]; parent: number[]; dist: number[] } {
    const parent = Array(this.n).fill(-1),
      dist = Array(this.n).fill(-1);
    const order: number[] = [];
    const adj = this.adj();
    const q: number[] = [];
    const push = (s: number) => {
      parent[s] = s;
      dist[s] = 0;
      q.push(s);
    };
    push(start);
    let head = 0;
    while (head < q.length) {
      const u = q[head++];
      order.push(u);
      for (const [v] of adj[u])
        if (parent[v] === -1) {
          parent[v] = u;
          dist[v] = dist[u] + 1;
          q.push(v);
        }
    }
    return { order, parent, dist };
  }

  /** DFS 从 start 出发（栈实现，不递归防爆栈）；返回 {order, parent, enter, exit} */
  dfs(start = 0): {
    order: number[];
    parent: number[];
    enter: number[];
    exit: number[];
  } {
    const parent = Array(this.n).fill(-1);
    const enter = Array(this.n).fill(-1),
      exit = Array(this.n).fill(-1);
    const order: number[] = [];
    const adj = this.adj();
    // 迭代：栈存 [u, childIndex, phase]；phase 0=入 1=出
    const done = (u: number) => {
      exit[u] = order.length;
    };
    const stack: number[][] = [];
    const startEnter = () => {
      parent[start] = start;
      enter[start] = order.length;
      order.push(start);
    };
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
      const q = [s];
      seen[s] = true;
      let head = 0;
      while (head < q.length) {
        const u = q[head++];
        out.push(u);
        for (const [v] of adj[u])
          if (!seen[v]) {
            seen[v] = true;
            q.push(v);
          }
      }
      return out;
    };
    for (let i = 0; i < this.n; i++) if (!seen[i]) comps.push(sink(i));
    return comps;
  }

  /** 连通分量（无向 = 标准；有向 = 弱连通分量） */
  connectedComponents(): number[][] {
    return this.allComponents();
  }

  // ---------- 判定 ----------

  /** 无向环检测：DFS 回边（邻接已访问且非父 → 环） */
  hasUndirectedCycle(): boolean {
    const adj = this.adj();
    const visited = Array(this.n).fill(false);
    const parent = Array(this.n).fill(-1);
    // 迭代 DFS：栈存 [u, childIdx]，维护 visited/parent
    for (let s = 0; s < this.n; s++) {
      if (visited[s]) continue;
      visited[s] = true;
      parent[s] = -2; // 根的特殊标记
      const stack: Array<[number, number]> = [[s, 0]];
      while (stack.length) {
        const top = stack[stack.length - 1];
        const u = top[0];
        const a = adj[u];
        if (top[1] >= a.length) {
          stack.pop();
          continue;
        }
        const v = a[top[1]][0];
        top[1]++;
        if (v === parent[u]) continue; // 无向：父边不是环
        if (visited[v]) return true; // 回边 → 环
        visited[v] = true;
        parent[v] = u;
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
        if (top[1] >= adj[u].length) {
          color[u] = 2;
          stack.pop();
          continue;
        }
        const v = adj[u][top[1]][0];
        top[1]++;
        if (color[v] === 1) return true;
        if (color[v] === 0) {
          color[v] = 1;
          stack.push([v, 0]);
        }
      }
      return false;
    };
    for (let i = 0; i < this.n; i++)
      if (color[i] === 0 && dfsVisit(i)) return true;
    return false;
  }

  hasCycle(): boolean {
    return this.directed ? this.hasDirectedCycle() : this.hasUndirectedCycle();
  }

  /** 树 = 无环 + 连通（n 个顶点恰 n-1 条边且可达）（有向：弱连通且无环） */
  isTree(): boolean {
    if (this.n === 0) return false;
    if (this.edges.length !== this.n - 1) return false;
    if (this.hasCycle()) return false;
    const comps = this.allComponents();
    return comps.length === 1;
  }
  /** 森林 = 无环（一个或多个连通分量均为树） */
  isForest(): boolean {
    return !this.hasCycle();
  }

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
  static randomTree(
    n: number,
    opts: { labels?: string[]; weighted?: boolean } = {},
  ): Graph {
    const g = new Graph(n, opts);
    const w = opts.weighted ? randW : () => 1;
    for (let i = 1; i < n; i++) {
      const p = Math.floor(Math.random() * i);
      g.addEdge(p, i, w());
    }
    return g;
  }
  /** 随机森林（k 棵树） */
  static randomForest(
    n: number,
    k: number,
    opts: { labels?: string[]; weighted?: boolean } = {},
  ): Graph {
    const g = new Graph(n, opts);
    const w = opts.weighted ? randW : () => 1;
    const kk = Math.max(1, Math.min(k, n));
    // 每棵树的大小尽量均匀；根依次是 0, s1, s2, …
    const roots: number[] = [];
    let acc = 0;
    for (let t = 0; t < kk; t++) {
      const size =
        t === kk - 1 ? n - acc : Math.max(1, Math.floor((n - acc) / (kk - t)));
      roots.push(acc);
      for (let i = acc + 1; i < acc + size; i++) {
        const p = acc + Math.floor(Math.random() * (i - acc));
        g.addEdge(p, i, w());
      }
      acc += size;
    }
    return g;
  }
  /** 随机图（边概率 p；directed 控制有向/无向） */
  static randomGraph(
    n: number,
    p: number,
    opts: { directed?: boolean; labels?: string[]; weighted?: boolean } = {},
  ): Graph {
    const g = new Graph(n, opts);
    const w = opts.weighted ? randW : () => 1;
    for (let i = 0; i < n; i++)
      for (let j = opts.directed ? 0 : i + 1; j < n; j++)
        if (i !== j && Math.random() < p) g.addEdge(i, j, w());
    return g;
  }
  /** 随机二叉树（每个节点至多 2 子）：新节点随机挂到有空位的节点下 */
  static randomBinaryTree(
    n: number,
    opts: { labels?: string[]; weighted?: boolean } = {},
  ): Graph {
    const g = new Graph(n, opts);
    const w = opts.weighted ? randW : () => 1;
    const childCount = Array(n).fill(0);
    const slots: number[] = [0]; // 还有空位（子 < 2）的节点
    for (let i = 1; i < n; i++) {
      const idx = Math.floor(Math.random() * slots.length);
      const p = slots[idx];
      g.addEdge(p, i, w());
      if (++childCount[p] === 2) slots.splice(idx, 1);
      slots.push(i);
    }
    return g;
  }
  /** 随机完全二叉树（严格层序填补：节点 i 挂在 floor((i-1)/2) 下） */
  static randomCompleteBinaryTree(
    n: number,
    opts: { labels?: string[]; weighted?: boolean } = {},
  ): Graph {
    const g = new Graph(n, opts);
    const w = opts.weighted ? randW : () => 1;
    for (let i = 1; i < n; i++) g.addEdge(Math.floor((i - 1) / 2), i, w());
    return g;
  }
  /** 随机偏斜树（退化链：每个节点至多 1 子）；random=false 时按自然序 0-1-2-… */
  static randomSkewTree(
    n: number,
    opts: { labels?: string[]; weighted?: boolean; random?: boolean } = {},
  ): Graph {
    const g = new Graph(n, opts);
    const w = opts.weighted ? randW : () => 1;
    const perm =
      opts.random === false
        ? Array.from({ length: n }, (_, i) => i)
        : shuffle(Array.from({ length: n }, (_, i) => i));
    for (let i = 1; i < n; i++) g.addEdge(perm[i - 1], perm[i], w());
    return g;
  }
  /** 随机 DAG：随机排列作拓扑序，只加前向边（并保证脊链连通） */
  static randomDAG(
    n: number,
    p: number,
    opts: { labels?: string[]; weighted?: boolean } = {},
  ): Graph {
    const g = new Graph(n, { ...opts, directed: true });
    const w = opts.weighted ? randW : () => 1;
    const perm = shuffle(Array.from({ length: n }, (_, i) => i));
    const seen = new Set<string>();
    // 脊链：perm[0]→perm[1]→… 保证弱连通（也是 DAG 的骨架）
    for (let i = 0; i + 1 < n; i++) {
      const a = perm[i],
        b = perm[i + 1];
      g.addEdge(a, b, w());
      seen.add(`${a},${b}`);
    }
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        if (Math.random() >= p) continue;
        const a = perm[i],
          b = perm[j];
        if (!seen.has(`${a},${b}`)) {
          g.addEdge(a, b, w());
          seen.add(`${a},${b}`);
        }
      }
    return g;
  }
  /** 随机有环图（有向/无向）：先构造环保证有环，再按概率加随机边 */
  static randomGraphWithCycle(
    n: number,
    p: number,
    opts: { directed?: boolean; labels?: string[]; weighted?: boolean } = {},
  ): Graph {
    const directed = opts.directed ?? false;
    const g = new Graph(n, { ...opts, directed });
    const w = opts.weighted ? randW : () => 1;
    const perm = shuffle(Array.from({ length: n }, (_, i) => i));
    const key = (a: number, b: number) =>
      directed ? `${a},${b}` : a < b ? `${a},${b}` : `${b},${a}`;
    const seen = new Set<string>();
    // 哈密顿环（n≥3 才可能成环）
    if (n >= 3)
      for (let i = 0; i < n; i++) {
        const a = perm[i],
          b = perm[(i + 1) % n];
        g.addEdge(a, b, w());
        seen.add(key(a, b));
      }
    for (let i = 0; i < n; i++)
      for (let j = directed ? 0 : i + 1; j < n; j++) {
        if (i === j || Math.random() >= p) continue;
        if (!seen.has(key(i, j))) {
          g.addEdge(i, j, w());
          seen.add(key(i, j));
        }
      }
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
  layoutTree(
    root: number,
    box: { x0: number; y0: number; w: number; h: number },
  ): { pos: Vec2[]; layer: number[]; children: number[][] } {
    const children: number[][] = Array.from({ length: this.n }, () => []);
    const parent = Array(this.n).fill(-1);
    const treeAdj = this.adj();
    // BFS 建森林父子关系（每棵树的根 = 首个未访问顶点）
    const visited = Array(this.n).fill(false);
    const roots: number[] = [];
    const build = (s: number) => {
      visited[s] = true;
      parent[s] = -1;
      roots.push(s);
      const q = [s];
      let head = 0;
      while (head < q.length) {
        const u = q[head++];
        for (const [v] of treeAdj[u])
          if (!visited[v]) {
            visited[v] = true;
            parent[v] = u;
            children[u].push(v);
            q.push(v);
          }
      }
    };
    // 优先以 root 为根（设为根的节点位于最上层）；其余顶点照旧各自成树（森林/孤立点）
    if (this.valid(root) && !visited[root]) build(root);
    for (let i = 0; i < this.n; i++) if (!visited[i]) build(i);

    // 深度
    const layer = Array(this.n).fill(0);
    const depth = (u: number, d: number) => {
      layer[u] = d;
      for (const c of children[u]) depth(c, d + 1);
    };
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
      pos[u] = {
        x: my,
        y: box.y0 + 20 + (layer[u] * (box.h - 60)) / Math.max(1, box.h - 60),
      };
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
      pos[i].y =
        box.y0 + 24 + (maxD === 0 ? 0 : (layer[i] / maxD) * (box.h - 48));
    }
    // 若多棵树根在同一序号区间，稍微左右错开避免完全重叠（森林）
    return { pos, layer, children };
  }

  /** 弹簧力导向（图默认）：库仑斥力 + 胡克弹簧，迭代稳定 */
  layoutForce(
    cx: number,
    cy: number,
    w: number,
    h: number,
    iters = 120,
  ): Vec2[] {
    const pos = this.layoutCircle(cx, cy, Math.min(w, h) * 0.35);
    const adj = this.adj();
    const k = Math.sqrt((w * h) / Math.max(1, this.n));
    const alpha = 0.08;
    for (let iter = 0; iter < iters; iter++) {
      const f = Array.from({ length: this.n }, () => ({ x: 0, y: 0 }));
      // 斥力 O(n²)
      for (let i = 0; i < this.n; i++)
        for (let j = i + 1; j < this.n; j++) {
          const dx = pos[j].x - pos[i].x,
            dy = pos[j].y - pos[i].y;
          const d = Math.hypot(dx, dy) || 0.1;
          const rep = (k * k) / d;
          const ux = dx / d,
            uy = dy / d;
          f[i].x -= rep * ux;
          f[i].y -= rep * uy;
          f[j].x += rep * ux;
          f[j].y += rep * uy;
        }
      // 引力（沿边）
      for (let u = 0; u < this.n; u++)
        for (const [v] of adj[u]) {
          const dx = pos[v].x - pos[u].x,
            dy = pos[v].y - pos[u].y;
          const d = Math.hypot(dx, dy) || 0.1;
          const att = (d * d) / k;
          const ux = dx / d,
            uy = dy / d;
          f[u].x += att * ux;
          f[u].y += att * uy;
          if (!this.directed) {
            f[v].x -= att * ux;
            f[v].y -= att * uy;
          }
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

/** Fisher–Yates 洗牌（返回新数组，不改原数组） */
function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
/** 随机权重 1–10 */
const randW = () => 1 + Math.floor(Math.random() * 10);

/** 顶点标签美化（树常用字母序，图常用数字） */
export function alphaLabels(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let s = "";
    let x = i;
    do {
      s = String.fromCharCode(65 + (x % 26)) + s;
      x = Math.floor(x / 26) - 1;
    } while (x >= 0);
    out.push(s);
  }
  return out;
}
// ============================================================
// 算法步进（供知识点页 generate 逐帧播放）
// 每步：伪代码行 + 当前顶点 + 已访问 + 边界(队列/栈) + 顺序 + 探线
// ============================================================

export type AlgoStep = {
  line: number; // 伪代码当前行（0-based）
  current: number | null; // 正在处理/访问的顶点
  exploring: number | null; // 正在遍历其邻接表的顶点（BFS line3/DFS line4）
  visited: number[]; // 已完成处理的顶点集
  frontier: number[]; // 队列（BFS）/ 栈（DFS）/ 当前入度为0集（拓扑）
  order: number[]; // 访问/输出顺序
  edge: [number, number] | null; // 正在检查的边
  msg: { zh: string; en: string };
};

/** BFS 步骤（start 为根） */
export function bfsSteps(
  g: Graph,
  start = 0,
  labels: string[] = g.labels,
): AlgoStep[] {
  const n = g.n,
    adj = g.adj();
  const visited = Array(n).fill(false);
  const steps: AlgoStep[] = [];
  const q: number[] = [];
  const order: number[] = [];
  const S = (i: number) => labels[i];
  const visitedList = () => visited.map((_, i) => i).filter((i) => visited[i]);

  steps.push({
    line: 0,
    current: null,
    exploring: null,
    visited: [],
    frontier: [],
    order: [],
    edge: null,
    msg: {
      zh: `初始化：$visited$ 全 false，队列 $Q \\gets \\{${S(start)}\\}$`,
      en: `init: Q←{${S(start)}}`,
    },
  });
  visited[start] = true;
  q.push(start);
  steps.push({
    line: 1,
    current: null,
    exploring: null,
    visited: visitedList(),
    frontier: [...q],
    order: [],
    edge: null,
    msg: {
      zh: `入队：$Q \\gets {${q.map(S).join(",")}}$，$visited[${S(start)}]\\gets true$`,
      en: `enqueue ${S(start)}`,
    },
  });

  let head = 0;
  while (head < q.length) {
    steps.push({
      line: 2,
      current: null,
      exploring: null,
      visited: visitedList(),
      frontier: [...q],
      order: [...order],
      edge: null,
      msg: {
        zh: `while 条件成立：$Q \\neq \\emptyset$（队列 ${q.map(S).join(",")}）`,
        en: `while Q≠∅ (${q.map(S).join(",")})`,
      },
    });
    const u = q[head++];
    order.push(u);
    steps.push({
      line: 3,
      current: u,
      exploring: null,
      visited: visitedList(),
      frontier: [...q],
      order: [...order],
      edge: null,
      msg: {
        zh: `出队：$u \\gets ${S(u)}$ → 访问顺序 ${order.length}`,
        en: `dequeue ${S(u)}`,
      },
    });
    for (const [v] of adj[u]) {
      steps.push({
        line: 4,
        current: u,
        exploring: u,
        visited: visitedList(),
        frontier: [...q],
        order: [...order],
        edge: [u, v],
        msg: {
          zh: `看邻边 $(${S(u)},${S(v)})$：$visited[${S(v)}]=${visited[v] ? "true" : "false"}$（${visited[v] ? "已访问，跳过" : "未访问"}）`,
          en: `check (${S(u)},${S(v)})`,
        },
      });
      if (!visited[v]) {
        visited[v] = true;
        q.push(v);
        steps.push({
          line: 5,
          current: u,
          exploring: u,
          visited: visitedList(),
          frontier: [...q],
          order: [...order],
          edge: [u, v],
          msg: {
            zh: `发现 $v=${S(v)}$：入队 $Q$，$visited\\gets true$`,
            en: `found ${S(v)}`,
          },
        });
      }
    }
  }
  steps.push({
    line: 6,
    current: null,
    exploring: null,
    visited: visitedList(),
    frontier: [],
    order: [...order],
    edge: null,
    msg: {
      zh: `完成：BFS 访问全部可达顶点，共 ${order.length} 个`,
      en: `BFS done (${order.length})`,
    },
  });
  return steps;
}

/** DFS 步骤（迭代栈；start 为根） */
export function dfsSteps(
  g: Graph,
  start = 0,
  labels: string[] = g.labels,
): AlgoStep[] {
  const n = g.n,
    adj = g.adj();
  const visited = Array(n).fill(false);
  const steps: AlgoStep[] = [];
  const stack: number[] = [];
  const order: number[] = [];
  const S = (i: number) => labels[i];
  const visitedList = () => visited.map((_, i) => i).filter((i) => visited[i]);

  steps.push({
    line: 0,
    current: null,
    exploring: null,
    visited: [],
    frontier: [],
    order: [],
    edge: null,
    msg: {
      zh: `初始化：$S \\gets \\{${S(start)}\\}$`,
      en: `init: S←{${S(start)}}`,
    },
  });
  stack.push(start);
  steps.push({
    line: 1,
    current: null,
    exploring: null,
    visited: visitedList(),
    frontier: [...stack],
    order: [],
    edge: null,
    msg: {
      zh: `栈 $S \\gets {${stack.map(S).join(",")}}$`,
      en: `push ${S(start)}`,
    },
  });

  while (stack.length) {
    steps.push({
      line: 2,
      current: null,
      exploring: null,
      visited: visitedList(),
      frontier: [...stack],
      order: [...order],
      edge: null,
      msg: {
        zh: `while 条件成立：$S \\neq \\emptyset$（栈 ${stack.map(S).join(",")}）`,
        en: `while S≠∅ (${stack.map(S).join(",")})`,
      },
    });
    const u = stack.pop()!;
    steps.push({
      line: 3,
      current: u,
      exploring: null,
      visited: visitedList(),
      frontier: [...stack],
      order: [...order],
      edge: null,
      msg: { zh: `弹出：$u \\gets ${S(u)}$`, en: `pop ${S(u)}` },
    });
    if (visited[u]) continue;
    visited[u] = true;
    order.push(u);
    steps.push({
      line: 4,
      current: u,
      exploring: null,
      visited: visitedList(),
      frontier: [...stack],
      order: [...order],
      edge: null,
      msg: {
        zh: `访问 $v=${S(u)}$：访问顺序第 ${order.length} 位`,
        en: `visit ${S(u)}`,
      },
    });
    // 压入所有未访问邻接（倒序压栈保持自然序）
    const neighbors = adj[u]
      .map(([v]) => v)
      .filter((v) => !visited[v])
      .reverse();
    if (neighbors.length === 0) continue;
    for (const v of neighbors) {
      steps.push({
        line: 5,
        current: u,
        exploring: u,
        visited: visitedList(),
        frontier: [...stack],
        order: [...order],
        edge: [u, v],
        msg: {
          zh: `压栈：$v=${S(v)}$（$!visited$）$\\to S$`,
          en: `push ${S(v)}`,
        },
      });
      stack.push(v);
    }
  }
  steps.push({
    line: 6,
    current: null,
    exploring: null,
    visited: visitedList(),
    frontier: [],
    order: [...order],
    edge: null,
    msg: {
      zh: `完成：DFS 访问全部可达顶点，共 ${order.length} 个`,
      en: `DFS done (${order.length})`,
    },
  });
  return steps;
}

/** Kahn 拓扑排序步骤（仅 DAG） */
export function topoSteps(g: Graph, labels: string[] = g.labels): AlgoStep[] {
  const n = g.n,
    adj = g.adj();
  const indeg = g.indegree();
  const steps: AlgoStep[] = [];
  const q: number[] = [];
  const order: number[] = [];
  const S = (i: number) => labels[i];
  const fr = () => [...q];

  steps.push({
    line: 0,
    current: null,
    exploring: null,
    visited: [],
    frontier: [],
    order: [],
    edge: null,
    msg: {
      zh: `计算入度：$in=${indeg.map((v, i) => `${S(i)}:${v}`).join(", ")}$`,
      en: `indeg: ${indeg.join(",")}`,
    },
  });
  for (let i = 0; i < n; i++) if (indeg[i] === 0) q.push(i);
  steps.push({
    line: 1,
    current: null,
    exploring: null,
    visited: [],
    frontier: fr(),
    order: [],
    edge: null,
    msg: {
      zh: `入度为 0 入队：$\\{${q.map(S).join(",")}\\}$`,
      en: `enqueue indeg=0`,
    },
  });

  let head = 0;
  while (head < q.length) {
    steps.push({
      line: 2,
      current: null,
      exploring: null,
      visited: [...order],
      frontier: fr(),
      order: [...order],
      edge: null,
      msg: { zh: "while 条件成立：$Q \\neq \\emptyset$", en: "while Q≠∅" },
    });
    const u = q[head++];
    steps.push({
      line: 3,
      current: u,
      exploring: null,
      visited: [...order],
      frontier: fr(),
      order: [...order],
      edge: null,
      msg: { zh: `弹出 $u=${S(u)}$ → 拓扑序`, en: `pop ${S(u)}` },
    });
    order.push(u);
    steps.push({
      line: 4,
      current: u,
      exploring: u,
      visited: [...order],
      frontier: fr(),
      order: [...order],
      edge: null,
      msg: { zh: `邻接 $in\\gets in{-}1$`, en: `decrement indeg` },
    });
    for (const [v] of adj[u]) {
      indeg[v]--;
      steps.push({
        line: 5,
        current: u,
        exploring: u,
        visited: [...order],
        frontier: fr(),
        order: [...order],
        edge: [u, v],
        msg: {
          zh: `$in[${S(v)}]=${indeg[v]}$，为 0 入队`,
          en: `indeg[${S(v)}]=${indeg[v]}`,
        },
      });
      if (indeg[v] === 0) q.push(v);
    }
  }
  steps.push({
    line: 6,
    current: null,
    exploring: null,
    visited: [...order],
    frontier: [],
    order: [...order],
    edge: null,
    msg: {
      zh:
        order.length === n
          ? `完成：拓扑序 $[${order.map(S).join(", ")}]$（${order.length} 顶点，无环）`
          : `检测到环：仅输出 ${order.length}/${n} 个顶点`,
      en: order.length === n ? `topo done (${order.length})` : "cycle!",
    },
  });
  return steps;
}

// ============================================================

// ============================================================
// 内存布局 dump（供 #/memory 可视化；与 hashTable 等链式风格一致）
// ============================================================

import type { MemoryDump, DumpAlloc, DumpField } from "./memoryDump";
import { hexFromBytes } from "./memoryDump";

export type GraphRepr = "adjlist" | "adjmat" | "array" | "edges";

/** 将图的某种内存表示生成为 MemoryDump，可在 #/memory 页查看 */
export function buildGraphDump(
  g: Graph,
  repr: GraphRepr,
  opts: {
    ptrSize?: number;
    elemSize?: number;
    base?: number;
    root?: number;
  } = {},
): MemoryDump {
  const ptrSize = opts.ptrSize ?? 4;
  const elemSize = opts.elemSize ?? 4;
  const base = opts.base ?? 0x555555559800;
  const lb = g.labels;
  const cursor = base;
  // little-endian：低字节在前，负值按补码
  const bytesOf = (v: number, size: number): number[] => {
    const neg = v < 0 ? 2 ** (size * 8) + v : v;
    const out: number[] = [];
    let x = neg >>> 0;
    for (let i = 0; i < size; i++) {
      out.push(x & 0xff);
      x >>>= 8;
    }
    return out;
  };

  const allocs: DumpAlloc[] = [];
  let usedBytes = 0; // adjlist 分支的节点池总字节数（head 表 + 全部节点）

  if (repr === "adjmat") {
    const mat = g.mat();
    const bytes: number[] = [];
    for (const row of mat)
      for (const w of row) bytes.push(...bytesOf(w ?? 0, elemSize));
    const fields = mat.flatMap((row, r) =>
      row.map((w, c) => ({
        name: `${lb[r]}→${lb[c]}${w === null ? " —" : ""}`,
        offset: (r * g.n + c) * elemSize,
        size: elemSize,
        type: w === null ? "u8" : "u32",
        color: w === null ? "#e2e8f0" : "#4f46e5",
      })),
    );
    allocs.push({
      key: "mat",
      addr: `0x${cursor.toString(16)}`,
      size: g.n * g.n * elemSize,
      hex: hexFromBytes(bytes),
      label: `邻接矩阵 M[${g.n}][${g.n}] · ${g.n * g.n} 格 × ${elemSize}B`,
      color: "#4f46e5",
      fields,
    });
  } else if (repr === "array") {
    const bfs = g.bfs(opts.root ?? 0);
    const rootIdx = opts.root ?? 0;
    const parent = bfs.parent.map((p, i) => (i === rootIdx ? -1 : p));
    const bytes: number[] = [];
    for (const p of parent) bytes.push(...bytesOf(p === -1 ? -1 : p, elemSize));
    const fields = parent.map((p, i) => ({
      name: `${lb[i]}${p === -1 ? "(根)" : ""}`,
      offset: i * elemSize,
      size: elemSize,
      type: "i32",
      color: p === -1 ? "#dc2626" : "#10b981",
    }));
    allocs.push({
      key: "parent",
      addr: `0x${cursor.toString(16)}`,
      size: g.n * elemSize,
      hex: hexFromBytes(bytes),
      label: `parent[] 压缩表示 · 根=−1 · ${g.n} 槽 × ${elemSize}B`,
      color: "#10b981",
      fields,
    });
  } else if (repr === "edges") {
    const bytes: number[] = [];
    const fields: DumpField[] = [];
    g.edges.forEach((e, k) => {
      bytes.push(...bytesOf(e.u, elemSize));
      bytes.push(...bytesOf(e.v, elemSize));
      fields.push({
        name: `${lb[e.u]}`,
        offset: k * 2 * elemSize,
        size: elemSize,
        type: "u32",
        color: "#6366f1",
      });
      fields.push({
        name: `${lb[e.v]}`,
        offset: k * 2 * elemSize + elemSize,
        size: elemSize,
        type: "u32",
        color: "#0ea5e9",
      });
    });
    allocs.push({
      key: "edges",
      addr: `0x${cursor.toString(16)}`,
      size: g.edges.length * 2 * elemSize,
      hex: hexFromBytes(bytes),
      label: `边集数组 · ${g.edges.length} 边 × (u,v)`,
      color: "#6366f1",
      fields,
    });
  } else {
    const adj = g.adj();
    const headTableSize = g.n * ptrSize;
    const headTableAddr = cursor;
    const nodeBase = cursor + headTableSize;
    const nodeAddrs: number[][][] = [];
    let off = 0; // 共享游标：所有顶点共用一个 8B 节点池,按列表顺序连续分配
    for (const nbrs of adj) {
      nodeAddrs.push(
        nbrs.map(() => {
          const a = nodeBase + off;
          off += elemSize + ptrSize;
          return [a];
        }),
      );
    }
    usedBytes = headTableSize + off; // head 表 + 全部节点 的池字节数
    const headDumpBytes: number[] = [];
    for (let u = 0; u < g.n; u++) {
      const first = nodeAddrs[u][0]?.[0] ?? 0;
      headDumpBytes.push(...bytesOf(first, ptrSize));
    }
    allocs.push({
      key: "heads",
      addr: `0x${headTableAddr.toString(16)}`,
      size: headTableSize,
      hex: hexFromBytes(headDumpBytes),
      label: `顶点表 head[0..${g.n - 1}]（首邻居指针）`,
      color: "#6366f1",
      fields: g.labels.map((l, u) => ({
        name: l,
        offset: u * ptrSize,
        size: ptrSize,
        type: `ptr${ptrSize * 8}`,
        color: "#6366f1",
      })),
    });
    adj.forEach((nbrs, u) => {
      nbrs.forEach(([v], k) => {
        const a = nodeAddrs[u][k][0];
        const nxt = k + 1 < nbrs.length ? nodeAddrs[u][k + 1][0] : 0;
        const bytes = [...bytesOf(v, elemSize), ...bytesOf(nxt, ptrSize)];
        allocs.push({
          key: `n${u}_${k}`,
          addr: `0x${a.toString(16)}`,
          size: elemSize + ptrSize,
          hex: hexFromBytes(bytes),
          label: `${lb[u]}: ${lb[v]} → ${nxt ? `0x${nxt.toString(16)}` : "null"}`,
          color: "#0ea5e9",
          fields: [
            {
              name: "v",
              offset: 0,
              size: elemSize,
              type: "u32",
              color: "#0ea5e9",
            },
            {
              name: "next",
              offset: elemSize,
              size: ptrSize,
              type: `ptr${ptrSize * 8}`,
              color: "#64748b",
            },
          ],
        });
      });
    });
  }
  return {
    base: `0x${base.toString(16)}`,
    total:
      repr === "adjlist" ? Math.max(0x100, usedBytes) : cursor - base + 0x100,
    endian: "little",
    allocations: allocs,
  };
}

// ============================================================
// 树遍历步骤（前序/中序/后序；以 root 为根）
// ============================================================

/** 树的前序/中序/后序遍历步骤 */
export function treeTraverseSteps(
  g: Graph,
  mode: "pre" | "in" | "post",
  root = 0,
  labels: string[] = g.labels,
  nodes?: BinNode[], // 二叉树的真实左右指针；提供时单子节点也能正确区分左右
): AlgoStep[] {
  const n = g.n;
  // 后备：无 nodes 时按 BFS 发现序收集子节点（binToGraph 先插左子边，双子女时即左→右；
  // 不能用顶点 id 升序 —— 随机 BST 按插入序编号，右子 id 可能小于左子 id）
  const { parent, order } = g.bfs(root);
  const children: number[][] = Array.from({ length: n }, () => []);
  for (const v of order)
    if (v !== root && parent[v] !== -1) children[parent[v]].push(v);
  const extraRoots = Array.from({ length: n }, (_, i) => i).filter(
    (v) => v !== root && parent[v] === -1,
  );
  const roots = [root, ...extraRoots];

  const steps: AlgoStep[] = [];
  const visited: number[] = [];
  const S = (i: number) => labels[i];
  const push = (
    line: number,
    current: number | null,
    exploring: number | null,
    conn: [number, number] | null,
    zh: string,
    en: string,
  ) =>
    steps.push({
      line,
      current,
      exploring,
      visited: [...visited],
      frontier: [],
      order: [...visited],
      edge: conn,
      msg: { zh, en },
    });

  // 递归：优先用真实左右指针（nodes[u].left/right），否则退化到 children[0]=左、children[1]=右
  // 行号按模式独立(0..2)：前序 VLR visit0→左1→右2；中序 LVR 左0→visit1→右2；后序 LRV 左0→右1→visit2
  const visit = (u: number, line: number, zh: string, en: string) => {
    visited.push(u);
    push(line, u, null, null, zh, en);
  };
  const rec = (u: number) => {
    const L = nodes ? (nodes[u].left ?? undefined) : children[u][0];
    const R = nodes ? (nodes[u].right ?? undefined) : children[u][1];
    const go = (k: number | undefined, line: number, note: string) => {
      if (k === undefined) return;
      push(line, u, k, [u, k], `${note}：${S(u)}→${S(k)}`, `into ${S(k)}`);
      rec(k);
    };
    if (mode === "pre") {
      visit(u, 0, `前序访问 ${S(u)}`, `pre visit ${S(u)}`);
      go(L, 1, "左子");
      go(R, 2, "右子");
    } else if (mode === "in") {
      go(L, 0, "左子");
      visit(u, 1, `中序访问 ${S(u)}`, `in visit ${S(u)}`);
      go(R, 2, "右子");
    } else {
      go(L, 0, "左子");
      go(R, 1, "右子");
      visit(u, 2, `后序访问 ${S(u)}`, `post visit ${S(u)}`);
    }
  };
  for (const rt of roots) rec(rt);
  return steps;
}

// ============================================================
// 树形态/统计（二叉树判定、子树大小、高度、平衡因子等）
// ============================================================

export type TreeStats = {
  isTree: boolean;
  isForest: boolean;
  isBinary: boolean;
  skew: boolean;
  full: boolean;
  complete: boolean;
  bst: boolean;
  avl: boolean; // 仅二叉且有数字标签时有意义
  height: number;
  width: number;
  size: number[]; // size[i] = 以 i 为根的子树节点数
  nodeHeight: number[]; // nodeHeight[i] = 以 i 为根的子树高度
  depth: number[]; // depth[i] = 根到 i 的深度
  parent: number[];
  children: number[][];
  n0: number;
  n2: number; // 叶数 / 双子女节点数（二叉）
  bf: number[]; // 平衡因子 H(L)-H(R)（二叉）
};

/** 以 root 为根统计树（含森林多根的完整统计：parent/children 覆盖全部顶点） */
export function treeStats(g: Graph, root = 0): TreeStats {
  const n = g.n;
  const comps = g.connectedComponents();
  const isTree = g.isTree();
  const isForest = !g.hasCycle();
  // 逐连通分量独立 BFS → 每棵树的 parent/children（无向图内无环，天然森林）
  const seen = new Set<number>();
  const parent = Array(n).fill(-1);
  const children: number[][] = Array.from({ length: n }, () => []);
  const roots: number[] = [];
  for (const c of comps) {
    if (c.length === 0) continue;
    const r = c[0];
    roots.push(r);
    const { parent: pp } = g.bfs(r);
    for (const v of c) {
      if (v === r) continue;
      parent[v] = pp[v];
      if (pp[v] !== -1 && pp[v] !== v) children[pp[v]].push(v);
    }
    for (const c2 of c) seen.add(c2);
  }
  // depth/post 序（每树根深 0）
  const depth = Array(n).fill(0);
  const post: number[] = [];
  const dfs = (u: number, d: number, par: number) => {
    depth[u] = d;
    for (const c of children[u]) if (c !== par) dfs(c, d + 1, u);
    post.push(u);
  };
  for (const r of roots) dfs(r, 0, -1);
  // size/nodeHeight（后序，子先父后）
  const size = Array(n).fill(0);
  const nodeHeight = Array(n).fill(0);
  for (const u of post) {
    size[u] = 1 + children[u].reduce((s2, c) => s2 + size[c], 0);
    nodeHeight[u] = children[u].length
      ? 1 + Math.max(...children[u].map((c) => nodeHeight[c]))
      : 0;
  }
  const height = Math.max(0, ...depth);
  const width = Math.max(
    0,
    ...Array.from({ length: n }, (_, v) =>
      roots.includes(v) ? children[v].length : children[v].length + 1,
    ),
  );
  // 二叉/形态（仅当单一连通分量，即真树）
  const isBinary = comps.length === 1 && children.every((c) => c.length <= 2);
  const skew = isBinary && n > 1 && children.every((c) => c.length <= 1);
  const full =
    (isBinary &&
      n > 1 &&
      children.every((c) => c.length === 0 || c.length === 2) &&
      (() => {
        const ds: number[] = [];
        const walk = (u: number, d: number) => {
          if (children[u].length === 0) ds.push(d);
          for (const c of children[u]) walk(c, d + 1);
        };
        walk(root, 0);
        return new Set(ds).size === 1;
      })()) ||
    (n === 1 ? true : false);
  const bfs = g.bfs(root).order;
  const bfsPos = new Map(bfs.map((v, i) => [v, i]));
  const complete =
    isBinary &&
    (() => {
      for (let i = 0; i < bfs.length; i++) {
        const u = bfs[i],
          cs = children[u];
        if (cs[0] !== undefined && bfsPos.get(cs[0]) !== 2 * i + 1)
          return false;
        if (cs[1] !== undefined && cs[0] === undefined) return false;
        if (cs[1] !== undefined && bfsPos.get(cs[1]) !== 2 * i + 2)
          return false;
      }
      return true;
    })();
  // BST（数字标签中序递增）/ AVL（平衡因子）
  const numeric = g.labels.every((l) => /^-?\d+$/.test(l));
  const labelsNum = g.labels.map(Number);
  let bst = isBinary && numeric;
  if (isBinary && numeric) {
    const inorder: number[] = [];
    const recIn = (u: number) => {
      if (children[u][0] !== undefined) recIn(children[u][0]);
      inorder.push(u);
      if (children[u][1] !== undefined) recIn(children[u][1]);
    };
    recIn(root);
    for (let i = 1; i < inorder.length; i++)
      if (labelsNum[inorder[i - 1]] > labelsNum[inorder[i]]) bst = false;
  }
  const bf = Array(n).fill(0);
  for (let u = 0; u < n; u++) {
    const cs = children[u];
    const lh = cs[0] === undefined ? 0 : nodeHeight[cs[0]] + 1;
    const rh = cs[1] === undefined ? 0 : nodeHeight[cs[1]] + 1;
    bf[u] = lh - rh;
  }
  const avl = isBinary && bf.every((x) => Math.abs(x) <= 1);
  const n0 = isBinary
    ? Array.from({ length: n }, (_, i) => i).filter(
        (i) => children[i].length === 0,
      ).length
    : 0;
  const n2 = isBinary
    ? Array.from({ length: n }, (_, i) => i).filter(
        (i) => children[i].length === 2,
      ).length
    : 0;
  return {
    isTree,
    isForest,
    isBinary,
    skew,
    full,
    complete,
    bst,
    avl,
    height,
    width,
    size,
    nodeHeight,
    depth,
    parent,
    children,
    n0,
    n2,
    bf,
  };
}

// ============================================================
// 伪代码（中英;与各 steps 的 line 一一对应;模块 codeFor 直接复用）
// 约定：正文只含 $...$ 数学，说明放 // 后
// ============================================================

import type { Text } from "../i18n/lang";

export const BFS_CODE: Text[] = [
  {
    zh: "$visited[v] \\gets false$  // 初始化",
    en: "$visited[v] \\gets false$  // init",
  },
  {
    zh: "$Q \\gets \\{s\\}$; $visited[s] \\gets true$",
    en: "$Q \\gets \\{s\\}$; $visited[s] \\gets true$",
  },
  { zh: "while $Q \\neq \\emptyset$:", en: "while $Q \\neq \\emptyset$:" },
  {
    zh: "  $u \\gets Q.pop()$  // 出队",
    en: "  $u \\gets Q.pop()$  // dequeue",
  },
  {
    zh: "  for $v \\in adj(u)$: if $!visited[v]$:",
    en: "  for $v \\in adj(u)$: if $!visited[v]$:",
  },
  {
    zh: "    $visited[v] \\gets true$; $Q.push(v)$  // 入队",
    en: "    $visited[v] \\gets true$; $Q.push(v)$  // enqueue",
  },
  { zh: "  // BFS 完成", en: "  // BFS done" },
];

export const DFS_CODE: Text[] = [
  {
    zh: "$visited[v] \\gets false$  // 初始化",
    en: "$visited[v] \\gets false$  // init",
  },
  { zh: "$S \\gets \\{s\\}$", en: "$S \\gets \\{s\\}$" },
  { zh: "while $S \\neq \\emptyset$:", en: "while $S \\neq \\emptyset$:" },
  { zh: "  $u \\gets S.pop()$  // 出栈", en: "  $u \\gets S.pop()$  // pop" },
  {
    zh: "  if $!visited[u]$: $visited[u] \\gets true$  // 访问 $u$",
    en: "  if $!visited[u]$: $visited[u] \\gets true$  // visit $u$",
  },
  {
    zh: "  for $v \\in adj(u)$: if $!visited[v]$: $S.push(v)$",
    en: "  for $v \\in adj(u)$: if $!visited[v]$: $S.push(v)$",
  },
  { zh: "  // DFS 完成", en: "  // DFS done" },
];

export const TOPO_CODE: Text[] = [
  { zh: "# Kahn: 计算入度", en: "# Kahn: indegree" },
  {
    zh: "$Q \\gets \\{v \\mid in[v]=0\\}$",
    en: "$Q \\gets \\{v \\mid in[v]=0\\}$",
  },
  { zh: "while $Q \\neq \\emptyset$:", en: "while $Q \\neq \\emptyset$:" },
  {
    zh: "  $u \\gets Q.pop()$; $order \\gets order \\cup \\{u\\}$",
    en: "  $u \\gets Q.pop()$; $order \\gets order \\cup \\{u\\}$",
  },
  {
    zh: "  for $v \\in adj(u)$: $in[v] \\gets in[v]-1$",
    en: "  for $v \\in adj(u)$: $in[v] \\gets in[v]-1$",
  },
  { zh: "    if $in[v]=0$: $Q.push(v)$", en: "    if $in[v]=0$: $Q.push(v)$" },
  { zh: "# $|order| < n$ → 存在环", en: "# $|order| < n$ → cycle" },
];

export const LEVEL_CODE: Text[] = [
  {
    zh: "$Q \\gets \\{r\\}$; $visited[r] \\gets true$",
    en: "$Q \\gets \\{r\\}$; $visited[r] \\gets true$",
  },
  {
    zh: "while $Q \\neq \\emptyset$:",
    en: "while $Q \\neq \\emptyset$:",
  },
  {
    zh: "  $k \\gets |Q|$  // 本层节点数",
    en: "  $k \\gets |Q|$  // nodes in this level",
  },
  {
    zh: "  for $i \\gets 1$ to $k$:",
    en: "  for $i \\gets 1$ to $k$:",
  },
  {
    zh: "    $u \\gets Q.pop()$  // 出队",
    en: "    $u \\gets Q.pop()$  // dequeue",
  },
  {
    zh: "    for $v \\in adj(u)$: if $!visited[v]$:",
    en: "    for $v \\in adj(u)$: if $!visited[v]$:",
  },
  {
    zh: "      $visited[v] \\gets true$; $Q \\gets Q \\cup \\{v\\}$  // 入队",
    en: "      $visited[v] \\gets true$; $Q \\gets Q \\cup \\{v\\}$  // enqueue",
  },
  {
    zh: "  // 层序遍历完成",
    en: "  // level-order done",
  },
];

export const ALL_BFS_CODE: Text[] = [
  {
    zh: "for $v$: $visited[v] \\gets false$",
    en: "for $v$: $visited[v] \\gets false$",
  },
  {
    zh: "for $s$: if $!visited[s]$:",
    en: "for $s$: if $!visited[s]$:",
  },
  {
    zh: "  $Q \\gets \\{s\\}$; $visited[s] \\gets true$  // BFS($s$)",
    en: "  $Q \\gets \\{s\\}$; $visited[s] \\gets true$  // BFS($s$)",
  },
  {
    zh: "  while $Q \\neq \\emptyset$:",
    en: "  while $Q \\neq \\emptyset$:",
  },
  {
    zh: "    $u \\gets Q.pop()$  // 出队",
    en: "    $u \\gets Q.pop()$  // dequeue",
  },
  {
    zh: "    for $v \\in adj(u)$: if $!visited[v]$:",
    en: "    for $v \\in adj(u)$: if $!visited[v]$:",
  },
  {
    zh: "      $visited[v] \\gets true$; $Q \\gets Q \\cup \\{v\\}$  // 入队",
    en: "      $visited[v] \\gets true$; $Q \\gets Q \\cup \\{v\\}$  // enqueue",
  },
  {
    zh: "  // 全部连通分量完成",
    en: "  // all components done",
  },
];

export const ALL_DFS_CODE: Text[] = [
  {
    zh: "for $v$: $visited[v] \\gets false$",
    en: "for $v$: $visited[v] \\gets false$",
  },
  {
    zh: "for $s$: if $!visited[s]$:",
    en: "for $s$: if $!visited[s]$:",
  },
  {
    zh: "  $S \\gets \\{s\\}$  // DFS($s$)",
    en: "  $S \\gets \\{s\\}$  // DFS($s$)",
  },
  {
    zh: "  while $S \\neq \\emptyset$:",
    en: "  while $S \\neq \\emptyset$:",
  },
  {
    zh: "    $u \\gets S.pop()$  // 出栈",
    en: "    $u \\gets S.pop()$  // pop",
  },
  {
    zh: "    if $!visited[u]$: $visited[u] \\gets true$  // 访问 $u$",
    en: "    if $!visited[u]$: $visited[u] \\gets true$  // visit $u$",
  },
  {
    zh: "    for $v \\in adj(u)$: if $!visited[v]$: $S \\gets S \\cup \\{v\\}$",
    en: "    for $v \\in adj(u)$: if $!visited[v]$: $S \\gets S \\cup \\{v\\}$",
  },
  {
    zh: "  // 全部连通分量完成",
    en: "  // all components done",
  },
];

export const CYCLE_CODE: Text[] = [
  {
    zh: "for $v$: $c[v] \\gets 0$  // 白",
    en: "for $v$: $c[v] \\gets 0$  // white",
  },
  {
    zh: "for $v$: if $c[v]=0$: DFS($v$)",
    en: "for $v$: if $c[v]=0$: DFS($v$)",
  },
  {
    zh: "  $c[v] \\gets 1$  // 灰：入栈",
    en: "  $c[v] \\gets 1$  // gray: on stack",
  },
  {
    zh: "  for $w \\in adj(v)$:",
    en: "  for $w \\in adj(v)$:",
  },
  {
    zh: "    if $c[w]=1$: return true  // 回边 $v \\to w$",
    en: "    if $c[w]=1$: return true  // back edge $v \\to w$",
  },
  {
    zh: "    if $c[w]=0$: DFS($w$)",
    en: "    if $c[w]=0$: DFS($w$)",
  },
  {
    zh: "  $c[v] \\gets 2$  // 黑：出栈完成",
    en: "  $c[v] \\gets 2$  // black: done",
  },
  {
    zh: "  // 结果：有/无环",
    en: "  // result",
  },
];

export const DIJKSTRA_CODE: Text[] = [
  {
    zh: "$dist[s] \\gets 0$; $\\forall v\\neq s$: $dist[v] \\gets \\infty$; $prev[v] \\gets -1$",
    en: "$dist[s] \\gets 0$; $\\forall v\\neq s$: $dist[v] \\gets \\infty$; $prev[v] \\gets -1$",
  },
  {
    zh: "$S \\gets \\emptyset$  // 已确定集",
    en: "$S \\gets \\emptyset$  // settled",
  },
  {
    zh: "while $|S| < n$:",
    en: "while $|S| < n$:",
  },
  {
    zh: "  $u \\gets \\arg\\min\\{dist[v] \\mid v \\notin S\\}$",
    en: "  $u \\gets \\arg\\min\\{dist[v] \\mid v \\notin S\\}$",
  },
  {
    zh: "  if $dist[u] = \\infty$: return  // 剩余不可达",
    en: "  if $dist[u] = \\infty$: return  // unreachable",
  },
  {
    zh: "  $S \\gets S \\cup \\{u\\}$  // 确定 $u$",
    en: "  $S \\gets S \\cup \\{u\\}$  // settle $u$",
  },
  {
    zh: "  for $(u,v,w) \\in E$: if $dist[u]+w < dist[v]$:",
    en: "  for $(u,v,w) \\in E$: if $dist[u]+w < dist[v]$:",
  },
  {
    zh: "    $dist[v] \\gets dist[u]+w$; $prev[v] \\gets u$",
    en: "    $dist[v] \\gets dist[u]+w$; $prev[v] \\gets u$",
  },
  {
    zh: "  // 完成",
    en: "  // done",
  },
];

export const PRIM_CODE: Text[] = [
  {
    zh: "$key[s] \\gets 0$; $\\forall v\\neq s$: $key[v] \\gets \\infty$; $parent[v] \\gets -1$",
    en: "$key[s] \\gets 0$; $\\forall v\\neq s$: $key[v] \\gets \\infty$; $parent[v] \\gets -1$",
  },
  {
    zh: "$T \\gets \\emptyset$  // 已选入 MST",
    en: "$T \\gets \\emptyset$  // in MST",
  },
  {
    zh: "while $|T| < n$:",
    en: "while $|T| < n$:",
  },
  {
    zh: "  $u \\gets \\arg\\min\\{key[v] \\mid v \\notin T\\}$",
    en: "  $u \\gets \\arg\\min\\{key[v] \\mid v \\notin T\\}$",
  },
  {
    zh: "  if $key[u] = \\infty$: return  // 图不连通",
    en: "  if $key[u] = \\infty$: return  // disconnected",
  },
  {
    zh: "  $T \\gets T \\cup \\{u\\}$",
    en: "  $T \\gets T \\cup \\{u\\}$",
  },
  {
    zh: "  for $(u,v,w) \\in E$: if $v \\notin T$ , $w < key[v]$:",
    en: "  for $(u,v,w) \\in E$: if $v \\notin T$ , $w < key[v]$:",
  },
  {
    zh: "    $key[v] \\gets w$; $parent[v] \\gets u$",
    en: "    $key[v] \\gets w$; $parent[v] \\gets u$",
  },
  {
    zh: "  // 完成",
    en: "  // done",
  },
];

export const KRUSKAL_CODE: Text[] = [
  {
    zh: "$E' \\gets \\mathrm{sort}(E)$  // 按 $w$ 升序",
    en: "$E' \\gets \\mathrm{sort}(E)$  // sort by $w$",
  },
  {
    zh: "for $(u,v,w) \\in E'$:",
    en: "for $(u,v,w) \\in E'$:",
  },
  {
    zh: "  if $find(u) \\neq find(v)$:",
    en: "  if $find(u) \\neq find(v)$:",
  },
  {
    zh: "    $MST \\gets MST \\cup \\{(u,v)\\}$; $union(u,v)$",
    en: "    $MST \\gets MST \\cup \\{(u,v)\\}$; $union(u,v)$",
  },
  {
    zh: "  else continue  // 会成环",
    en: "  else continue  // would cycle",
  },
  {
    zh: "  // 完成",
    en: "  // done",
  },
];

export const BELLMAN_CODE: Text[] = [
  {
    zh: "$dist[s] \\gets 0$; $\\forall v\\neq s$: $dist[v] \\gets \\infty$; $prev[v] \\gets -1$",
    en: "$dist[s] \\gets 0$; $\\forall v\\neq s$: $dist[v] \\gets \\infty$; $prev[v] \\gets -1$",
  },
  {
    zh: "for $i \\gets 1$ to $n-1$:",
    en: "for $i \\gets 1$ to $n-1$:",
  },
  {
    zh: "  for $(u,v,w) \\in E$:",
    en: "  for $(u,v,w) \\in E$:",
  },
  {
    zh: "    if $dist[u]+w < dist[v]$: $dist[v] \\gets dist[u]+w$; $prev[v] \\gets u$",
    en: "    if $dist[u]+w < dist[v]$: $dist[v] \\gets dist[u]+w$; $prev[v] \\gets u$",
  },
  {
    zh: "for $(u,v,w) \\in E$:  // 负环检测",
    en: "for $(u,v,w) \\in E$:  // neg-cycle check",
  },
  {
    zh: "  if $dist[u]+w < dist[v]$: return false  // 存在负环",
    en: "  if $dist[u]+w < dist[v]$: return false  // negative cycle",
  },
  {
    zh: "  // 完成",
    en: "  // done",
  },
];

// ============================================================
// P0：遍历补齐（固定图高亮，沿用 AlgoStep）
// ============================================================

/** 层序遍历（按层出队；frontier=当前队列，order=访问序） */
export function levelOrderSteps(
  g: Graph,
  root = 0,
  labels: string[] = g.labels,
  extraRoots: number[] = [], // 森林：root 之外各自成树（每棵树的根也入队）
): AlgoStep[] {
  const n = g.n,
    adj = g.adj();
  const visited = Array(n).fill(false);
  const steps: AlgoStep[] = [];
  const q: number[] = [];
  const order: number[] = [];
  const S = (i: number) => labels[i];
  const visitedList = () => visited.map((_, i) => i).filter((i) => visited[i]);
  const seeds = [root, ...extraRoots].filter((r) => r >= 0 && r < n);
  const seedLabel = seeds.map(S).join(", ");

  steps.push({
    line: 0,
    current: null,
    exploring: null,
    visited: [],
    frontier: [...seeds],
    order: [],
    edge: null,
    msg: {
      zh: `初始化：$Q \\gets \\{${seedLabel}\\}$，$visited[${seedLabel}] \\gets true$`,
      en: `init: Q←{${seedLabel}}`,
    },
  });
  for (const r of seeds) {
    visited[r] = true;
    q.push(r);
  }

  while (q.length) {
    steps.push({
      line: 1,
      current: null,
      exploring: null,
      visited: visitedList(),
      frontier: [...q],
      order: [...order],
      edge: null,
      msg: {
        zh: `while：$Q \\neq \\emptyset$（队列 ${q.map(S).join(", ")}）`,
        en: `while Q≠∅ (${q.map(S).join(", ")})`,
      },
    });
    const k = q.length;
    steps.push({
      line: 2,
      current: null,
      exploring: null,
      visited: visitedList(),
      frontier: [...q],
      order: [...order],
      edge: null,
      msg: {
        zh: `$k \\gets |Q| = ${k}$  // 本层 ${k} 个节点`,
        en: `k ← |Q| = ${k}`,
      },
    });
    for (let i = 0; i < k; i++) {
      steps.push({
        line: 3,
        current: null,
        exploring: null,
        visited: visitedList(),
        frontier: [...q],
        order: [...order],
        edge: null,
        msg: {
          zh: `for $i \\gets ${i + 1}$ to $k=${k}$`,
          en: `for i ← ${i + 1} to ${k}`,
        },
      });
      const u = q.shift()!;
      order.push(u);
      steps.push({
        line: 4,
        current: u,
        exploring: null,
        visited: visitedList(),
        frontier: [...q],
        order: [...order],
        edge: null,
        msg: {
          zh: `出队：$u \\gets ${S(u)}$ → 第 ${order.length} 个访问`,
          en: `dequeue ${S(u)}`,
        },
      });
      for (const [v] of adj[u]) {
        steps.push({
          line: 5,
          current: u,
          exploring: u,
          visited: visitedList(),
          frontier: [...q],
          order: [...order],
          edge: [u, v],
          msg: {
            zh: `看邻边 $(${S(u)},${S(v)})$：$visited[${S(v)}]=${visited[v] ? "true" : "false"}$`,
            en: `check (${S(u)},${S(v)})`,
          },
        });
        if (!visited[v]) {
          visited[v] = true;
          q.push(v);
          steps.push({
            line: 6,
            current: u,
            exploring: u,
            visited: visitedList(),
            frontier: [...q],
            order: [...order],
            edge: [u, v],
            msg: {
              zh: `发现 $v=${S(v)}$：入队（下一层）`,
              en: `enqueue ${S(v)}`,
            },
          });
        }
      }
    }
  }
  steps.push({
    line: 7,
    current: null,
    exploring: null,
    visited: visitedList(),
    frontier: [],
    order: [...order],
    edge: null,
    msg: {
      zh: `完成：层序 $[${order.map(S).join(", ")}]$`,
      en: `level-order done`,
    },
  });
  return steps;
}

/** 全图 BFS（森林/非连通图：每个连通分量各做一次 BFS） */
export function bfsAllSteps(g: Graph, labels: string[] = g.labels): AlgoStep[] {
  const n = g.n,
    adj = g.adj();
  const visited = Array(n).fill(false);
  const steps: AlgoStep[] = [];
  const order: number[] = [];
  const S = (i: number) => labels[i];
  const visitedList = () => visited.map((_, i) => i).filter((i) => visited[i]);

  steps.push({
    line: 0,
    current: null,
    exploring: null,
    visited: [],
    frontier: [],
    order: [],
    edge: null,
    msg: { zh: "初始化：$visited$ 全 false", en: "init visited" },
  });
  for (let s = 0; s < n; s++) {
    if (visited[s]) continue;
    steps.push({
      line: 1,
      current: s,
      exploring: null,
      visited: visitedList(),
      frontier: [],
      order: [...order],
      edge: null,
      msg: {
        zh: `for：$visited[${S(s)}]=false$ → 新连通分量，BFS(${S(s)})$`,
        en: `new component BFS(${S(s)})`,
      },
    });
    steps.push({
      line: 2,
      current: s,
      exploring: null,
      visited: visitedList(),
      frontier: [s],
      order: [...order],
      edge: null,
      msg: { zh: `$Q \\gets \\{${S(s)}\\}$`, en: `Q←{${S(s)}}` },
    });
    const q: number[] = [s];
    visited[s] = true;
    let head = 0;
    while (head < q.length) {
      steps.push({
        line: 3,
        current: null,
        exploring: null,
        visited: visitedList(),
        frontier: [...q],
        order: [...order],
        edge: null,
        msg: {
          zh: `while：$Q \\neq \\emptyset$（队列 ${q.map(S).join(", ")}）`,
          en: `while Q≠∅`,
        },
      });
      const u = q[head++];
      order.push(u);
      steps.push({
        line: 4,
        current: u,
        exploring: null,
        visited: visitedList(),
        frontier: [...q],
        order: [...order],
        edge: null,
        msg: {
          zh: `出队：$u \\gets ${S(u)}$ → 第 ${order.length} 个访问`,
          en: `dequeue ${S(u)}`,
        },
      });
      for (const [v] of adj[u]) {
        steps.push({
          line: 5,
          current: u,
          exploring: u,
          visited: visitedList(),
          frontier: [...q],
          order: [...order],
          edge: [u, v],
          msg: {
            zh: `看邻边 $(${S(u)},${S(v)})$：$visited[${S(v)}]=${visited[v] ? "true" : "false"}$`,
            en: `check (${S(u)},${S(v)})`,
          },
        });
        if (!visited[v]) {
          visited[v] = true;
          q.push(v);
          steps.push({
            line: 6,
            current: u,
            exploring: u,
            visited: visitedList(),
            frontier: [...q],
            order: [...order],
            edge: [u, v],
            msg: { zh: `发现 $v=${S(v)}$：入队`, en: `enqueue ${S(v)}` },
          });
        }
      }
    }
  }
  steps.push({
    line: 7,
    current: null,
    exploring: null,
    visited: visitedList(),
    frontier: [],
    order: [...order],
    edge: null,
    msg: {
      zh: `完成：全部 ${order.length} 个顶点已访问`,
      en: `all ${order.length} visited`,
    },
  });
  return steps;
}

/** 全图 DFS（森林/非连通图：每个连通分量各做一次 DFS） */
export function dfsAllSteps(g: Graph, labels: string[] = g.labels): AlgoStep[] {
  const n = g.n,
    adj = g.adj();
  const visited = Array(n).fill(false);
  const steps: AlgoStep[] = [];
  const order: number[] = [];
  const S = (i: number) => labels[i];
  const visitedList = () => visited.map((_, i) => i).filter((i) => visited[i]);

  steps.push({
    line: 0,
    current: null,
    exploring: null,
    visited: [],
    frontier: [],
    order: [],
    edge: null,
    msg: { zh: "初始化：$visited$ 全 false", en: "init visited" },
  });
  for (let s = 0; s < n; s++) {
    if (visited[s]) continue;
    steps.push({
      line: 1,
      current: s,
      exploring: null,
      visited: visitedList(),
      frontier: [],
      order: [...order],
      edge: null,
      msg: {
        zh: `for：$visited[${S(s)}]=false$ → 新连通分量，DFS(${S(s)})$`,
        en: `new component DFS(${S(s)})`,
      },
    });
    steps.push({
      line: 2,
      current: s,
      exploring: null,
      visited: visitedList(),
      frontier: [s],
      order: [...order],
      edge: null,
      msg: { zh: `$S \\gets \\{${S(s)}\\}$`, en: `S←{${S(s)}}` },
    });
    const stack: number[] = [s];
    while (stack.length) {
      steps.push({
        line: 3,
        current: null,
        exploring: null,
        visited: visitedList(),
        frontier: [...stack],
        order: [...order],
        edge: null,
        msg: {
          zh: `while：$S \\neq \\emptyset$（栈 ${stack.map(S).join(", ")}）`,
          en: `while S≠∅`,
        },
      });
      const u = stack.pop()!;
      steps.push({
        line: 4,
        current: u,
        exploring: null,
        visited: visitedList(),
        frontier: [...stack],
        order: [...order],
        edge: null,
        msg: { zh: `弹出：$u \\gets ${S(u)}$`, en: `pop ${S(u)}` },
      });
      if (visited[u]) continue;
      visited[u] = true;
      order.push(u);
      steps.push({
        line: 5,
        current: u,
        exploring: null,
        visited: visitedList(),
        frontier: [...stack],
        order: [...order],
        edge: null,
        msg: {
          zh: `访问 $u=${S(u)}$ → 第 ${order.length} 个`,
          en: `visit ${S(u)}`,
        },
      });
      const neighbors = adj[u]
        .map(([v]) => v)
        .filter((v) => !visited[v])
        .reverse();
      for (const v of neighbors) {
        steps.push({
          line: 6,
          current: u,
          exploring: u,
          visited: visitedList(),
          frontier: [...stack],
          order: [...order],
          edge: [u, v],
          msg: { zh: `压栈：$v=${S(v)}$`, en: `push ${S(v)}` },
        });
        stack.push(v);
      }
    }
  }
  steps.push({
    line: 7,
    current: null,
    exploring: null,
    visited: visitedList(),
    frontier: [],
    order: [...order],
    edge: null,
    msg: {
      zh: `完成：全部 ${order.length} 个顶点已访问`,
      en: `all ${order.length} visited`,
    },
  });
  return steps;
}

/** 环检测（三色：白=未访问,灰=在递归栈,黑=完成;灰中再遇 → 环） */
export function cycleSteps(g: Graph, labels: string[] = g.labels): AlgoStep[] {
  const n = g.n,
    adj = g.adj();
  const color = Array(n).fill(0); // 0 白 1 灰 2 黑
  const parent = Array(n).fill(-1);
  const order: number[] = [];
  const steps: AlgoStep[] = [];
  const S = (i: number) => labels[i];
  const C = (c: number) => (c === 0 ? "白" : c === 1 ? "灰" : "黑");
  const gray = () =>
    color.map((c, i) => (c === 1 ? i : -1)).filter((i) => i >= 0);
  const black = () =>
    color.map((c, i) => (c === 2 ? i : -1)).filter((i) => i >= 0);
  let cycleEdge: [number, number] | null = null;
  const push = (
    line: number,
    current: number | null,
    exploring: number | null,
    edge: [number, number] | null,
    zh: string,
    en: string,
  ) =>
    steps.push({
      line,
      current,
      exploring,
      visited: black(),
      frontier: gray(),
      order: [...order],
      edge,
      msg: { zh, en },
    });

  push(0, null, null, null, "初始化：全部染白（未访问）", "init: all white");
  const visit = (u: number, par: number): boolean => {
    color[u] = 1;
    parent[u] = par;
    order.push(u);
    push(
      2,
      u,
      u,
      null,
      `$color[${S(u)}] \\gets 灰$ — 进入递归栈（发现序 #${order.length}）`,
      `${S(u)} → gray`,
    );
    for (const [w] of adj[u]) {
      push(
        3,
        u,
        u,
        [u, w],
        `看邻边 $(${S(u)},${S(w)})$：$color[${S(w)}]=${C(color[w])}$`,
        `check (${S(u)},${S(w)})`,
      );
      if (color[w] === 1) {
        if (!g.directed && w === par) continue; // 无向：父边是树边，不算环
        cycleEdge = [u, w];
        push(
          4,
          u,
          u,
          [u, w],
          `$color[${S(w)}]=灰$ → 回边！发现环 $(${S(u)} \\to ${S(w)})$`,
          `back edge → cycle`,
        );
        return false;
      }
      if (color[w] === 0) {
        push(
          5,
          u,
          u,
          [u, w],
          `$color[${S(w)}]=白$ → 递归 DFS(${S(w)})$`,
          `DFS(${S(w)})`,
        );
        if (!visit(w, u)) return false;
      }
    }
    color[u] = 2;
    push(
      6,
      u,
      null,
      null,
      `$color[${S(u)}] \\gets 黑$ — 出栈完成`,
      `${S(u)} → black`,
    );
    return true;
  };
  for (let v = 0; v < n; v++) {
    if (color[v] !== 0) continue;
    push(
      1,
      v,
      v,
      null,
      `for：$color[${S(v)}]=白$ → DFS(${S(v)})$（新连通分量）`,
      `DFS(${S(v)})`,
    );
    if (!visit(v, -1)) break;
  }
  push(
    7,
    null,
    null,
    cycleEdge,
    cycleEdge
      ? `结果：检测到环 $(${S(cycleEdge[0])},${S(cycleEdge[1])})$`
      : `结果：无环（$V=${n}$）`,
    cycleEdge ? "cycle found" : "acyclic",
  );
  return steps;
}

// ============================================================
// P1：加权图算法（AlgoStep & 额外数组，由模块自行组装 scene）
// ============================================================

export type DijkstraStep = AlgoStep & {
  dist: number[];
  prev: number[];
  settled: boolean[];
};

export function dijkstraSteps(
  g: Graph,
  start = 0,
  labels: string[] = g.labels,
): DijkstraStep[] {
  const n = g.n,
    adj = g.adj();
  const INF = Number.POSITIVE_INFINITY;
  const dist = Array(n).fill(INF);
  dist[start] = 0;
  const prev = Array(n).fill(-1);
  const settled = Array(n).fill(false);
  const order: number[] = [];
  const steps: DijkstraStep[] = [];
  const S = (i: number) => labels[i];
  const D = (v: number) => (Number.isFinite(dist[v]) ? String(dist[v]) : "∞");
  const settledList = () =>
    settled.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  const cand = () =>
    settled
      .map((s, i) => (s || !Number.isFinite(dist[i]) ? -1 : i))
      .filter((i) => i >= 0);
  const snap = (
    line: number,
    current: number | null,
    exploring: number | null,
    frontier: number[],
    edge: [number, number] | null,
    zh: string,
    en: string,
  ): DijkstraStep => ({
    line,
    current,
    exploring,
    visited: settledList(),
    frontier,
    order: [...order],
    edge,
    dist: [...dist],
    prev: [...prev],
    settled: [...settled],
    msg: { zh, en },
  });

  steps.push(
    snap(
      0,
      start,
      null,
      [start],
      null,
      `初始化：$dist[${S(start)}] \\gets 0$，其余 $\\infty$，$prev \\gets -1$`,
      `init dist[${S(start)}]=0`,
    ),
  );
  while (settledList().length < n) {
    steps.push(
      snap(
        2,
        null,
        null,
        cand(),
        null,
        `while：$|S|=${settledList().length} < ${n}$`,
        `while |S|<n`,
      ),
    );
    let u = -1,
      best = INF;
    for (let v = 0; v < n; v++)
      if (!settled[v] && dist[v] < best) {
        best = dist[v];
        u = v;
      }
    if (u === -1 || !Number.isFinite(dist[u])) {
      steps.push(
        snap(
          4,
          null,
          null,
          [],
          null,
          `最小 $dist = \\infty$：剩余顶点不可达，结束`,
          `unreachable → stop`,
        ),
      );
      break;
    }
    steps.push(
      snap(
        3,
        u,
        null,
        cand(),
        null,
        `选 $u=${S(u)}$：$dist=${D(u)}$ 最小（未确定中）`,
        `pick ${S(u)} (dist=${D(u)})`,
      ),
    );
    settled[u] = true;
    order.push(u);
    steps.push(
      snap(
        5,
        u,
        u,
        cand(),
        null,
        `$S \\gets S \\cup \\{${S(u)}\\}$ — 确定 $u$ 的最短路（第 ${order.length} 个）`,
        `settle ${S(u)}`,
      ),
    );
    for (const [v, w] of adj[u]) {
      const cmp = `${D(u)} + ${w} = ${Number.isFinite(dist[u]) ? dist[u] + w : "∞"}`;
      steps.push(
        snap(
          6,
          u,
          u,
          cand(),
          [u, v],
          `松弛 $(${S(u)},${S(v)},w=${w})$：$dist[u]+w=${cmp}$ vs $dist[${S(v)}]=${D(v)}$`,
          `relax (${S(u)},${S(v)})`,
        ),
      );
      if (Number.isFinite(dist[u]) && dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        prev[v] = u;
        steps.push(
          snap(
            7,
            u,
            u,
            cand(),
            [u, v],
            `更新：$dist[${S(v)}] \\gets ${D(v)}$，前驱 $prev \\gets ${S(u)}$`,
            `dist[${S(v)}]=${D(v)}`,
          ),
        );
      }
    }
  }
  steps.push(
    snap(
      8,
      null,
      null,
      [],
      null,
      `完成：$dist=${Array.from({ length: n }, (_, i) => i)
        .map((i) => `${S(i)}:${D(i)}`)
        .join(", ")}$`,
      `dijkstra done`,
    ),
  );
  return steps;
}

export type PrimStep = AlgoStep & {
  key: number[];
  parent: number[];
  inTree: boolean[];
};

export function primSteps(
  g: Graph,
  start = 0,
  labels: string[] = g.labels,
): PrimStep[] {
  const n = g.n,
    adj = g.adj();
  const INF = Number.POSITIVE_INFINITY;
  const key = Array(n).fill(INF);
  key[start] = 0;
  const parent = Array(n).fill(-1);
  const inTree = Array(n).fill(false);
  const order: number[] = [];
  const steps: PrimStep[] = [];
  const S = (i: number) => labels[i];
  const K = (v: number) => (Number.isFinite(key[v]) ? String(key[v]) : "∞");
  const inT = () => inTree.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  const cand = () =>
    inTree
      .map((s, i) => (s || !Number.isFinite(key[i]) ? -1 : i))
      .filter((i) => i >= 0);
  const snap = (
    line: number,
    current: number | null,
    exploring: number | null,
    frontier: number[],
    edge: [number, number] | null,
    zh: string,
    en: string,
  ): PrimStep => ({
    line,
    current,
    exploring,
    visited: inT(),
    frontier,
    order: [...order],
    edge,
    key: [...key],
    parent: [...parent],
    inTree: [...inTree],
    msg: { zh, en },
  });

  steps.push(
    snap(
      0,
      start,
      null,
      [start],
      null,
      `初始化：$key[${S(start)}] \\gets 0$，其余 $\\infty$，$parent \\gets -1$`,
      `init key[${S(start)}]=0`,
    ),
  );
  while (inT().length < n) {
    steps.push(
      snap(
        2,
        null,
        null,
        cand(),
        null,
        `while：$|T|=${inT().length} < ${n}$`,
        `while |T|<n`,
      ),
    );
    let u = -1,
      best = INF;
    for (let v = 0; v < n; v++)
      if (!inTree[v] && key[v] < best) {
        best = key[v];
        u = v;
      }
    if (u === -1 || !Number.isFinite(key[u])) {
      steps.push(
        snap(
          4,
          null,
          null,
          [],
          null,
          `最小 $key = \\infty$：图不连通（$T$ 外无相邻顶点），结束`,
          `disconnected → stop`,
        ),
      );
      break;
    }
    steps.push(
      snap(
        3,
        u,
        null,
        cand(),
        null,
        `选 $u=${S(u)}$：$key=${K(u)}$ 最小（$T$ 外）`,
        `pick ${S(u)} (key=${K(u)})`,
      ),
    );
    inTree[u] = true;
    order.push(u);
    steps.push(
      snap(
        5,
        u,
        u,
        cand(),
        null,
        `$T \\gets T \\cup \\{${S(u)}\\}$ — 第 ${order.length} 个入树`,
        `add ${S(u)} to T`,
      ),
    );
    for (const [v, w] of adj[u]) {
      steps.push(
        snap(
          6,
          u,
          u,
          cand(),
          [u, v],
          `看边 $(${S(u)},${S(v)},w=${w})$：$v \\in T$? ${inTree[v] ? "是" : "否"}`,
          `check (${S(u)},${S(v)})`,
        ),
      );
      if (!inTree[v] && w < key[v]) {
        key[v] = w;
        parent[v] = u;
        steps.push(
          snap(
            7,
            u,
            u,
            cand(),
            [u, v],
            `更新：$key[${S(v)}] \\gets ${w}$，$parent \\gets ${S(u)}$`,
            `key[${S(v)}]=${w}`,
          ),
        );
      }
    }
  }
  steps.push(
    snap(
      8,
      null,
      null,
      [],
      null,
      `完成：MST 边 $[${order
        .map((_, i) => i)
        .filter((i) => parent[order[i]] !== -1)
        .map((i) => `(${S(parent[order[i]])},${S(order[i])})`)
        .join(", ")}]$`,
      `prim done`,
    ),
  );
  return steps;
}

export type KruskalStep = AlgoStep & {
  uf: number[];
  picked: number[][];
  skip: boolean;
};

export function kruskalSteps(
  g: Graph,
  labels: string[] = g.labels,
): KruskalStep[] {
  const n = g.n;
  const sorted = [...g.edges].sort((a, b) => (a.weight ?? 1) - (b.weight ?? 1));
  const uf = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (uf[x] !== x) {
      uf[x] = uf[uf[x]];
      x = uf[x];
    }
    return x;
  };
  const picked: number[][] = [];
  const steps: KruskalStep[] = [];
  const S = (i: number) => labels[i];
  const inMST = () =>
    Array.from({ length: n }, (_, i) => i).filter((i) =>
      picked.some(([a, b]) => a === i || b === i),
    );
  steps.push({
    line: 0,
    current: null,
    exploring: null,
    visited: [],
    frontier: [],
    order: [],
    edge: null,
    uf: [...uf],
    picked: [],
    skip: false,
    msg: {
      zh: `按 $w$ 升序：$[${sorted.map((e) => `(${S(e.u)},${S(e.v)}):${e.weight ?? 1}`).join(", ")}]$`,
      en: `sort: ${sorted.map((e) => `(${S(e.u)},${S(e.v)})`).join(", ")}`,
    },
  });
  for (const e of sorted) {
    steps.push({
      line: 1,
      current: e.u,
      exploring: e.v,
      visited: inMST(),
      frontier: [],
      order: [],
      edge: [e.u, e.v],
      uf: [...uf],
      picked: [...picked],
      skip: false,
      msg: {
        zh: `取边 $(${S(e.u)},${S(e.v)},w=${e.weight ?? 1})$`,
        en: `edge (${S(e.u)},${S(e.v)})`,
      },
    });
    const ru = find(e.u),
      rv = find(e.v);
    steps.push({
      line: 2,
      current: e.u,
      exploring: e.v,
      visited: inMST(),
      frontier: [],
      order: [],
      edge: [e.u, e.v],
      uf: [...uf],
      picked: [...picked],
      skip: false,
      msg: {
        zh: `$find(${S(e.u)})=${S(ru)}$ vs $find(${S(e.v)})=${S(rv)}$ → ${ru === rv ? "同集合" : "不同集合"}`,
        en: `find ${S(e.u)}=${S(ru)} vs ${S(e.v)}=${S(rv)}`,
      },
    });
    if (ru === rv) {
      steps.push({
        line: 4,
        current: e.u,
        exploring: e.v,
        visited: inMST(),
        frontier: [],
        order: [],
        edge: [e.u, e.v],
        uf: [...uf],
        picked: [...picked],
        skip: true,
        msg: { zh: `同集合 → 跳过（加入会成环）`, en: `skip (cycle)` },
      });
    } else {
      uf[rv] = ru;
      picked.push([e.u, e.v]);
      steps.push({
        line: 3,
        current: e.u,
        exploring: e.v,
        visited: inMST(),
        frontier: [],
        order: [],
        edge: [e.u, e.v],
        uf: [...uf],
        picked: [...picked],
        skip: false,
        msg: {
          zh: `不同集合 → $union$ 并入 MST（第 ${picked.length} 条）`,
          en: `union → pick #${picked.length}`,
        },
      });
    }
  }
  steps.push({
    line: 5,
    current: null,
    exploring: null,
    visited: inMST(),
    frontier: [],
    order: [],
    edge: null,
    uf: [...uf],
    picked: [...picked],
    skip: false,
    msg: {
      zh: `完成：MST $[${picked.map(([a, b]) => `(${S(a)},${S(b)})`).join(", ")}]$ 共 ${picked.length} 条边`,
      en: `MST done (${picked.length})`,
    },
  });
  return steps;
}

export type BellmanStep = AlgoStep & { dist: number[]; prev: number[] };

/** Bellman-Ford（支持负权：图须用 addEdge 直接构造，fromSpec 会拒绝负权重） */
export function bellmanFordSteps(
  g: Graph,
  start = 0,
  labels: string[] = g.labels,
): BellmanStep[] {
  const n = g.n;
  const INF = Number.POSITIVE_INFINITY;
  const dist = Array(n).fill(INF);
  dist[start] = 0;
  const prev = Array(n).fill(-1);
  const steps: BellmanStep[] = [];
  const S = (i: number) => labels[i];
  const D = (v: number) => (Number.isFinite(dist[v]) ? String(dist[v]) : "∞");
  const finite = () =>
    Array.from({ length: n }, (_, i) => i).filter((i) =>
      Number.isFinite(dist[i]),
    );
  const snap = (
    line: number,
    current: number | null,
    exploring: number | null,
    frontier: number[],
    edge: [number, number] | null,
    zh: string,
    en: string,
  ): BellmanStep => ({
    line,
    current,
    exploring,
    visited: finite(),
    frontier,
    order: [],
    edge,
    dist: [...dist],
    prev: [...prev],
    msg: { zh, en },
  });

  steps.push(
    snap(
      0,
      start,
      null,
      [start],
      null,
      `初始化：$dist[${S(start)}] \\gets 0$，其余 $\\infty$`,
      `init dist[${S(start)}]=0`,
    ),
  );
  for (let i = 1; i < n; i++) {
    steps.push(
      snap(
        1,
        null,
        null,
        [],
        null,
        `第 $i=${i}$ 轮（共 $n-1=${n - 1}$ 轮）`,
        `round ${i}/${n - 1}`,
      ),
    );
    for (const e of g.edges) {
      const w = e.weight ?? 1;
      steps.push(
        snap(
          2,
          e.u,
          e.v,
          [],
          [e.u, e.v],
          `松弛边 $(${S(e.u)},${S(e.v)},w=${w})$：$dist[u]+w=${Number.isFinite(dist[e.u]) ? dist[e.u] + w : "∞"}$ vs $dist[${S(e.v)}]=${D(e.v)}$`,
          `relax (${S(e.u)},${S(e.v)})`,
        ),
      );
      if (Number.isFinite(dist[e.u]) && dist[e.u] + w < dist[e.v]) {
        dist[e.v] = dist[e.u] + w;
        prev[e.v] = e.u;
        steps.push(
          snap(
            3,
            e.u,
            e.v,
            [],
            [e.u, e.v],
            `更新：$dist[${S(e.v)}] \\gets ${D(e.v)}$，前驱 $prev \\gets ${S(e.u)}$`,
            `dist[${S(e.v)}]=${D(e.v)}`,
          ),
        );
      }
    }
  }
  steps.push(
    snap(
      4,
      null,
      null,
      [],
      null,
      "负环检测：再扫一轮所有边",
      "neg-cycle check",
    ),
  );
  let neg = false;
  for (const e of g.edges) {
    const w = e.weight ?? 1;
    steps.push(
      snap(
        5,
        e.u,
        e.v,
        [],
        [e.u, e.v],
        `检查 $(${S(e.u)},${S(e.v)},w=${w})$：仍可松弛? $dist[u]+w=${Number.isFinite(dist[e.u]) ? dist[e.u] + w : "∞"}$ < $dist[${S(e.v)}]=${D(e.v)}$`,
        `check (${S(e.u)},${S(e.v)})`,
      ),
    );
    if (Number.isFinite(dist[e.u]) && dist[e.u] + w < dist[e.v]) {
      neg = true;
      break;
    }
  }
  steps.push(
    snap(
      6,
      null,
      null,
      [],
      null,
      neg
        ? "结果：存在负环（最短路径无定义）"
        : `结果：无负环，$dist=${Array.from({ length: n }, (_, i) => i)
            .map((i) => `${S(i)}:${D(i)}`)
            .join(", ")}$`,
      neg ? "negative cycle" : "done",
    ),
  );
  return steps;
}

// ============================================================
// 场景快照（供模块 Render 组装；GraphCanvas 消费同一形状）
// ============================================================

export type GraphAlgoScene = {
  current: number | null;
  exploring: number | null;
  visited: number[];
  frontier: number[];
  order: number[];
  edge: [number, number] | null;
};

/** 从任意 AlgoStep 抽取渲染所需的场景快照（模块自行扩展 dist/annotate 等） */
export function algoScene(s: AlgoStep): GraphAlgoScene {
  return {
    current: s.current,
    exploring: s.exploring,
    visited: [...s.visited],
    frontier: [...s.frontier],
    order: [...s.order],
    edge: s.edge,
  };
}

// ============================================================
// P2：变结构/变数值算法（BST / AVL / 二叉堆）
// 设计：AlgoStep 针対"固定图高亮"；BST/AVL/堆是图在变/值在变，
// 因此另立轻量步进类型：每步自带当前树/数组快照 + 关键下标，
// 模块组帧时零重算（Render 用 binToGraph + layoutTree + GraphCanvas）。
// ============================================================

export type BinNode = {
  id: number;
  val: number;
  left: number | null;
  right: number | null;
  /** 原始标签（非数字导入场景用；未设置则显示 String(val)） */
  label?: string;
};

/** BinNode 数组 → 无向 Graph（左先右后入邻接表 → children[0]=左, children[1]=右） */
export function binToGraph(nodes: BinNode[]): Graph {
  const g = new Graph(nodes.length, {
    labels: nodes.map((n) => n.label ?? String(n.val)),
  });
  for (const n of nodes) {
    if (n.left !== null) g.addEdge(n.id, n.left);
    if (n.right !== null) g.addEdge(n.id, n.right);
  }
  return g;
}

/** 完全二叉树（堆的下标结构：父 i → 子 2i+1 / 2i+2） */
export function completeTree(values: number[]): BinNode[] {
  const nodes: BinNode[] = values.map((val, i) => ({
    id: i,
    val,
    left: null,
    right: null,
  }));
  for (let i = 0; i < nodes.length; i++) {
    const l = 2 * i + 1,
      r = 2 * i + 2;
    if (l < nodes.length) nodes[i].left = l;
    if (r < nodes.length) nodes[i].right = r;
  }
  return nodes;
}

/** 按插入序列建 BST 形状（重复值走右） */
export function bstFromValues(values: number[]): BinNode[] {
  const nodes: BinNode[] = values.map((val, i) => ({
    id: i,
    val,
    left: null,
    right: null,
  }));
  for (let i = 1; i < values.length; i++) {
    let cur = 0;
    while (true) {
      const n = nodes[cur];
      if (values[i] < n.val) {
        if (n.left === null) {
          n.left = i;
          break;
        }
        cur = n.left;
      } else {
        if (n.right === null) {
          n.right = i;
          break;
        }
        cur = n.right;
      }
    }
  }
  return nodes;
}

/** 中序遍历值序列（BST 判定/完成帧用） */
export function inorderOf(nodes: BinNode[]): number[] {
  const out: number[] = [];
  const rec = (u: number | null) => {
    if (u === null) return;
    rec(nodes[u].left);
    out.push(nodes[u].val);
    rec(nodes[u].right);
  };
  if (nodes.length) rec(0);
  return out;
}

export type BstStep = {
  line: number; // 伪代码行（0-based）
  nodes: BinNode[]; // 当前树快照（紧凑 id，父 id < 子 id）
  visible: number; // 已插入节点数（= nodes.length）
  root: number; // 当前根 id（旋转/删除后可能 ≠ 0）
  focus: number | null; // 正在比较/访问的节点 id
  newNode: number | null; // 本次插入的新节点 id
  edge: [number, number] | null;
  side: "l" | "r" | null;
  msg: { zh: string; en: string };
};

export const BST_SEARCH_CODE: Text[] = [
  {
    zh: "$p \\gets root$",
    en: "$p \\gets root$",
  },
  {
    zh: "while $p \\neq null$:",
    en: "while $p \\neq null$:",
  },
  {
    zh: "  if $x = p.val$: return $p$  // 命中",
    en: "  if $x = p.val$: return $p$  // hit",
  },
  {
    zh: "  if $x < p.val$: $p \\gets p.left$  // 走左",
    en: "  if $x < p.val$: $p \\gets p.left$  // left",
  },
  {
    zh: "  else: $p \\gets p.right$  // 走右",
    en: "  else: $p \\gets p.right$  // right",
  },
  {
    zh: "return $null$  // 未找到",
    en: "return $null$  // not found",
  },
];

export function bstSearchSteps(values: number[], target: number): BstStep[] {
  const nodes = bstFromValues(values);
  const steps: BstStep[] = [];
  const snap = (
    line: number,
    focus: number | null,
    zh: string,
    en: string,
  ): BstStep => ({
    line,
    nodes: nodes.map((n) => ({ ...n })),
    visible: nodes.length,
    root: 0,
    focus,
    newNode: null,
    edge: null,
    side: null,
    msg: { zh, en },
  });
  if (values.length === 0) return [snap(0, null, "空树", "empty")];
  steps.push(
    snap(
      0,
      null,
      `$p \\gets root=${nodes[0].val}$，找 $x=${target}$`,
      `p←root=${nodes[0].val}`,
    ),
  );
  let p: number | null = 0;
  while (p !== null) {
    steps.push(snap(1, p, `while：$p=${nodes[p].val}$`, `p=${nodes[p].val}`));
    if (nodes[p].val === target) {
      steps.push(
        snap(
          2,
          p,
          `$x=${target}=p.val=${nodes[p].val}$ → 命中`,
          `hit ${target}`,
        ),
      );
      return steps;
    }
    if (target < nodes[p].val) {
      steps.push(snap(3, p, `$x=${target}<${nodes[p].val}$ → 走左`, `go left`));
      p = nodes[p].left;
    } else {
      steps.push(
        snap(4, p, `$x=${target}>${nodes[p].val}$ → 走右`, `go right`),
      );
      p = nodes[p].right;
    }
  }
  steps.push(snap(5, null, `$x=${target}$ 未找到（走到空位）`, `not found`));
  return steps;
}

export const BST_INSERT_CODE: Text[] = [
  {
    zh: "$x$  // 输入",
    en: "$x$  // input",
  },
  {
    zh: "if $T = \\emptyset$: $root \\gets x$",
    en: "if $T = \\emptyset$: $root \\gets x$",
  },
  {
    zh: "$p \\gets root$",
    en: "$p \\gets root$",
  },
  {
    zh: "while $p \\neq null$:",
    en: "while $p \\neq null$:",
  },
  {
    zh: "  if $x < p.val$: $p \\gets p.left$",
    en: "  if $x < p.val$: $p \\gets p.left$",
  },
  {
    zh: "  else: $p \\gets p.right$",
    en: "  else: $p \\gets p.right$",
  },
  {
    zh: "$p.child \\gets x$  // 挂入空位",
    en: "$p.child \\gets x$  // attach",
  },
  {
    zh: "// 完成",
    en: "// done",
  },
];

export function bstInsertSteps(values: number[]): BstStep[] {
  const nodes: BinNode[] = [];
  const steps: BstStep[] = [];
  const snap = (
    line: number,
    focus: number | null,
    newNode: number | null,
    edge: [number, number] | null,
    side: "l" | "r" | null,
    zh: string,
    en: string,
  ): BstStep => ({
    line,
    nodes: nodes.map((n) => ({ ...n })),
    visible: nodes.length,
    root: 0,
    focus,
    newNode,
    edge,
    side,
    msg: { zh, en },
  });
  for (const x of values) {
    steps.push(snap(0, null, null, null, null, `插入 $x=${x}$`, `insert ${x}`));
    if (nodes.length === 0) {
      nodes.push({ id: 0, val: x, left: null, right: null });
      steps.push(
        snap(1, 0, 0, null, null, `树空 → $root \\gets ${x}$`, `root←${x}`),
      );
      continue;
    }
    steps.push(
      snap(
        2,
        0,
        null,
        null,
        null,
        `$p \\gets root=${nodes[0].val}$`,
        `p←root=${nodes[0].val}`,
      ),
    );
    let p: number | null = 0;
    while (p !== null) {
      steps.push(
        snap(
          3,
          p,
          null,
          null,
          null,
          `while：$p=${nodes[p].val}$`,
          `p=${nodes[p].val}`,
        ),
      );
      const cur: BinNode = nodes[p];
      if (x < cur.val) {
        if (cur.left === null) {
          steps.push(
            snap(
              4,
              p,
              null,
              null,
              "l",
              `$x=${x}<${cur.val}$ → 左空位`,
              `left empty`,
            ),
          );
          const id = nodes.length;
          nodes[p].left = id;
          nodes.push({ id, val: x, left: null, right: null });
          steps.push(
            snap(
              6,
              p,
              id,
              [p, id],
              "l",
              `挂载: $p.left \\gets ${x}$`,
              `attach left ${x}`,
            ),
          );
          p = null;
        } else {
          steps.push(
            snap(
              4,
              p,
              null,
              null,
              "l",
              `$x=${x}<${cur.val}$ → 走左到 ${nodes[cur.left].val}`,
              `go left`,
            ),
          );
          p = cur.left;
        }
      } else if (cur.right === null) {
        steps.push(
          snap(
            5,
            p,
            null,
            null,
            "r",
            `$x=${x}\\ge${cur.val}$ → 右空位`,
            `right empty`,
          ),
        );
        const id = nodes.length;
        nodes[p].right = id;
        nodes.push({ id, val: x, left: null, right: null });
        steps.push(
          snap(
            6,
            p,
            id,
            [p, id],
            "r",
            `挂载: $p.right \\gets ${x}$`,
            `attach right ${x}`,
          ),
        );
        p = null;
      } else {
        steps.push(
          snap(
            5,
            p,
            null,
            null,
            "r",
            `$x=${x}\\ge${cur.val}$ → 走右到 ${nodes[cur.right].val}`,
            `go right`,
          ),
        );
        p = cur.right;
      }
    }
  }
  const seq = inorderOf(nodes);
  steps.push(
    snap(
      7,
      null,
      null,
      null,
      null,
      `完成：中序 $[${seq.join(", ")}]$（升序验证 BST）`,
      `done`,
    ),
  );
  return steps;
}

export const BST_DELETE_CODE: Text[] = [
  {
    zh: "$p \\gets find(x)$  // 定位",
    en: "$p \\gets find(x)$  // locate",
  },
  {
    zh: "if $\\deg(p)=0$: $remove(p)$  // 叶",
    en: "if $\\deg(p)=0$: $remove(p)$  // leaf",
  },
  {
    zh: "if $\\deg(p)=1$: $splice(p)$  // 单子顶替",
    en: "if $\\deg(p)=1$: $splice(p)$  // one child",
  },
  {
    zh: "else: $s \\gets \\min R(p)$  // 右子树最小",
    en: "else: $s \\gets \\min R(p)$  // successor",
  },
  {
    zh: "  $p.val \\gets s.val$; $remove(s)$",
    en: "  $p.val \\gets s.val$; $remove(s)$",
  },
  {
    zh: "// 完成",
    en: "// done",
  },
];

/** 移除节点 d 并重编号（保持 父id<子id 不变式）；仅改 left/right 指针，不改值 */
function withoutNode(nodes: BinNode[], d: number): BinNode[] {
  const map = new Map<number, number>();
  let k = 0;
  for (let i = 0; i < nodes.length; i++)
    if (i !== d) {
      map.set(i, k++);
    }
  return nodes
    .filter((_, i) => i !== d)
    .map((n) => ({
      id: map.get(n.id)!,
      val: n.val,
      left: n.left !== null && n.left !== d ? map.get(n.left)! : null,
      right: n.right !== null && n.right !== d ? map.get(n.right)! : null,
    }));
}

export function bstDeleteSteps(values: number[], target: number): BstStep[] {
  let nodes = bstFromValues(values);
  const before = [...nodes];
  let root = 0;
  const steps: BstStep[] = [];
  const S = (id: number | null) => (id === null ? "∅" : String(before[id].val));
  const snap = (
    line: number,
    focus: number | null,
    zh: string,
    en: string,
  ): BstStep => ({
    line,
    nodes: nodes.map((n) => ({ ...n })),
    visible: nodes.length,
    root,
    focus,
    newNode: null,
    edge: null,
    side: null,
    msg: { zh, en },
  });
  if (nodes.length === 0) return [snap(0, null, "空树", "empty")];

  // 定位（始终在删除前树上走，S 用删除前标签）
  let cur: number | null = 0,
    par: number | null = null;
  const findPath: number[] = [];
  const locate = (): boolean => {
    while (cur !== null) {
      findPath.push(cur);
      steps.push(
        snap(
          0,
          cur,
          `定位：$p=${S(cur)}$（$x=${target}$）`,
          `locate p=${S(cur)}`,
        ),
      );
      if (before[cur].val === target) return true;
      if (target < before[cur].val) {
        par = cur;
        cur = before[cur].left;
      } else {
        par = cur;
        cur = before[cur].right;
      }
    }
    return false;
  };
  if (!locate()) {
    steps.push(snap(5, null, `$x=${target}$ 不存在（走到空位）`, `not found`));
    return steps;
  }
  const d = cur as number;
  const dl = nodes[d].left,
    dr = nodes[d].right;
  const isLeft = par !== null && nodes[par].left === d;
  if (dl === null && dr === null) {
    steps.push(snap(1, d, `$p=${S(d)}$ 无子女 → 直接删除`, `leaf`));
    if (par === null) {
      nodes = [];
      root = 0;
    } else {
      if (isLeft) nodes[par].left = null;
      else nodes[par].right = null;
      nodes = withoutNode(nodes, d);
    }
  } else if (dl === null || dr === null) {
    steps.push(snap(2, d, `$p=${S(d)}$ 仅一子 → $child$ 顶替`, `one child`));
    const ch = (dl === null ? dr : dl) as number;
    if (par === null) {
      root = ch;
      nodes = withoutNode(nodes, d);
    } else {
      if (isLeft) nodes[par].left = ch;
      else nodes[par].right = ch;
      nodes = withoutNode(nodes, d);
    }
  } else {
    // 双子：找右子树最小 s，复制值后删 s（s 至多一子）
    let s = dr as number,
      sPar = d;
    steps.push(snap(3, d, `$p=${S(d)}$ 双子 → 右子树最小`, `two children`));
    while (nodes[s].left !== null) {
      steps.push(
        snap(3, s, `找后继：$s=${S(s)}$（左走）`, `successor ${S(s)}`),
      );
      sPar = s;
      s = nodes[s].left as number;
    }
    steps.push(snap(3, s, `后继 $s=${S(s)}$`, `successor ${S(s)}`));
    nodes[d].val = nodes[s].val;
    steps.push(
      snap(
        4,
        d,
        `$p.val \\gets s.val=${nodes[d].val}$`,
        `copy ${nodes[d].val}`,
      ),
    );
    if (sPar === d) nodes[d].right = nodes[s].right;
    else nodes[sPar].left = nodes[s].right;
    nodes = withoutNode(nodes, s);
    steps.push(
      snap(
        4,
        d,
        `删 $s$：剩余 $[${inorderOf(nodes).join(", ")}]$`,
        `remove successor`,
      ),
    );
  }
  steps.push(
    snap(5, null, `完成：$[${inorderOf(nodes).join(", ") || "∅"}]$`, `done`),
  );
  return steps;
}

export const AVL_CODE: Text[] = [
  {
    zh: "$insert_{BST}(u, x)$  // 按 BST 插入",
    en: "$insert_{BST}(u, x)$  // BST insert",
  },
  {
    zh: "update $bf(u)$  // 回溯平衡因子",
    en: "update $bf(u)$  // balance factor",
  },
  {
    zh: "if $|bf|\\leq 1$: continue  // 平衡",
    en: "if $|bf|\\leq 1$: continue  // balanced",
  },
  {
    zh: "else if $bf>1 \\land bf(L)\\geq 0$: $rotateR$  // LL",
    en: "else if $bf>1 \\land bf(L)\\geq 0$: $rotateR$  // LL",
  },
  {
    zh: "else if $bf>1 \\land bf(L)<0$: $rotateL;\\; rotateR$  // LR",
    en: "else if $bf>1 \\land bf(L)<0$: $rotateL;\\; rotateR$  // LR",
  },
  {
    zh: "else if $bf<-1 \\land bf(R)\\leq 0$: $rotateL$  // RR",
    en: "else if $bf<-1 \\land bf(R)\\leq 0$: $rotateL$  // RR",
  },
  {
    zh: "else: $rotateR;\\; rotateL$  // RL",
    en: "else: $rotateR;\\; rotateL$  // RL",
  },
  {
    zh: "// 完成",
    en: "// done",
  },
];

function binParents(nodes: BinNode[]): number[] {
  const par = Array(nodes.length).fill(-1);
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].left !== null) par[nodes[i].left!] = i;
    if (nodes[i].right !== null) par[nodes[i].right!] = i;
  }
  return par;
}
function binHeight(nodes: BinNode[]): number[] {
  const h = Array(nodes.length).fill(0);
  const post: number[] = [];
  let root = 0;
  const par = binParents(nodes);
  for (let i = 0; i < nodes.length; i++)
    if (par[i] === -1) {
      root = i;
      break;
    }
  const visit = (u: number) => {
    if (nodes[u].left !== null) visit(nodes[u].left!);
    if (nodes[u].right !== null) visit(nodes[u].right!);
    post.push(u);
  };
  if (nodes.length) visit(root);
  for (const u of post) {
    const lh = nodes[u].left === null ? 0 : h[nodes[u].left!];
    const rh = nodes[u].right === null ? 0 : h[nodes[u].right!];
    h[u] = 1 + Math.max(lh, rh);
  }
  return h;
}

/** 每个节点的平衡因子 bf = h(left) - h(right)，下标与 nodes 对齐（AVL 标注用） */
export function binBf(nodes: BinNode[]): number[] {
  const h = binHeight(nodes);
  return nodes.map((n) => {
    const lh = n.left === null ? 0 : h[n.left];
    const rh = n.right === null ? 0 : h[n.right];
    return lh - rh;
  });
}

/** 插入序列建 AVL（逐帧含旋转） */
export function avlInsertSteps(values: number[]): BstStep[] {
  const nodes: BinNode[] = [];
  let root = 0;
  const steps: BstStep[] = [];
  const snap = (
    line: number,
    focus: number | null,
    zh: string,
    en: string,
  ): BstStep => ({
    line,
    nodes: nodes.map((n) => ({ ...n })),
    visible: nodes.length,
    root,
    focus,
    newNode: null,
    edge: null,
    side: null,
    msg: { zh, en },
  });

  for (const x of values) {
    steps.push(snap(0, null, `插入 $x=${x}$（BST 步骤同插入）`, `insert ${x}`));
    if (nodes.length === 0) {
      nodes.push({ id: 0, val: x, left: null, right: null });
      steps.push(snap(1, 0, `$bf=${0}$ 平衡`, `root ${x}`));
      continue;
    }
    // BST 插入（AVL 旋转后根可能 ≠ 0：必须从当前 root 出发，否则会插到孤立子树上）
    let p = root;
    while (true) {
      const cur = nodes[p];
      if (x < cur.val) {
        if (cur.left === null) {
          cur.left = nodes.length;
          nodes.push({ id: nodes.length, val: x, left: null, right: null });
          p = nodes.length - 1;
          break;
        }
        p = cur.left;
      } else {
        if (cur.right === null) {
          cur.right = nodes.length;
          nodes.push({ id: nodes.length, val: x, left: null, right: null });
          p = nodes.length - 1;
          break;
        }
        p = cur.right;
      }
    }
    const inserted = p;
    // 回溯更新 bf，找首个失衡祖先
    const h = binHeight(nodes);
    const par = binParents(nodes);
    const findBf = (u: number) => {
      const lh = nodes[u].left === null ? 0 : h[nodes[u].left!];
      const rh = nodes[u].right === null ? 0 : h[nodes[u].right!];
      return lh - rh;
    };
    let y = inserted;
    while (par[y] !== -1) y = par[y]; // 走到根（备份）
    // 自插入点向上找失衡
    let z = inserted,
      pivot: number | null = null,
      pivotBf = 0,
      childBf = 0;
    while (z !== -1) {
      const b = findBf(z);
      steps.push(
        snap(1, z, `$bf[${nodes[z].val}] = ${b}$`, `bf[${nodes[z].val}]=${b}`),
      );
      if (Math.abs(b) > 1) {
        pivot = z;
        pivotBf = b;
        break;
      }
      z = par[z];
    }
    if (pivot === null) {
      steps.push(snap(2, inserted, `全部 |bf|≤1 → 平衡，无需旋转`, `balanced`));
      continue;
    }
    // 判定旋转类型
    const pb = pivotBf;
    const lc = nodes[pivot].left,
      rc = nodes[pivot].right;
    const lb = lc === null ? 0 : findBf(lc);
    const rb = rc === null ? 0 : findBf(rc);
    childBf = pb > 1 ? lb : rb;
    const kind = pb > 1 ? (lb >= 0 ? "LL" : "LR") : rb <= 0 ? "RR" : "RL";
    steps.push(
      snap(
        3 + (kind === "LL" ? 0 : kind === "LR" ? 1 : kind === "RR" ? 2 : 3),
        pivot,
        `${kind}：$bf=${pb}$，子$bf=${childBf}$ → 旋转`,
        kind,
      ),
    );
    // 旋转实现（BST 结构，指针换合法值）
    const rv = (y0: number): number => {
      const x0 = nodes[y0].left!;
      nodes[y0].left = nodes[x0].right;
      nodes[x0].right = y0;
      return x0;
    };
    const lv = (y0: number): number => {
      const x0 = nodes[y0].right!;
      nodes[y0].right = nodes[x0].left;
      nodes[x0].left = y0;
      return x0;
    };
    let t = pivot;
    const pPar = par[t];
    if (kind === "LL") t = rv(t);
    else if (kind === "RR") t = lv(t);
    else if (kind === "LR") {
      nodes[t].left = lv(nodes[t].left!);
      t = rv(t);
    } else {
      nodes[t].right = rv(nodes[t].right!);
      t = lv(t);
    }
    if (pPar === -1) {
      root = t;
    } else if (nodes[pPar].left === pivot) nodes[pPar].left = t;
    else nodes[pPar].right = t;
    steps.push(
      snap(
        2,
        t,
        `旋转完成：子树根 → ${nodes[t].val}，$|bf|\\leq 1$`,
        `rotated: root ${nodes[t].val}`,
      ),
    );
  }
  steps.push(
    snap(7, null, `完成：AVL 中序 $[${inorderOf(nodes).join(", ")}]$`, `done`),
  );
  return steps;
}

export function bstSearchOnTree(
  nodes0: BinNode[],
  root: number,
  target: number,
): BstStep[] {
  const nodes = nodes0.map((n) => ({ ...n }));
  const steps: BstStep[] = [];
  const snap = (
    line: number,
    focus: number | null,
    zh: string,
    en: string,
  ): BstStep => ({
    line,
    nodes: nodes.map((n) => ({ ...n })),
    visible: nodes.length,
    root,
    focus,
    newNode: null,
    edge: null,
    side: null,
    msg: { zh, en },
  });
  if (nodes.length === 0) return [snap(0, null, "空树", "empty")];
  steps.push(
    snap(
      0,
      null,
      `$p gets root=${nodes[root].val}$，找 $x=${target}$`,
      `p←root`,
    ),
  );
  let p: number | null = root;
  while (p !== null) {
    steps.push(snap(1, p, `while：$p=${nodes[p].val}$`, `p=${nodes[p].val}`));
    if (nodes[p].val === target) {
      steps.push(snap(2, p, `$x=${target}=p.val$ → 命中`, `hit`));
      return steps;
    }
    if (target < nodes[p].val) {
      steps.push(snap(3, p, `$x< p.val$ → 走左`, `left`));
      p = nodes[p].left;
    } else {
      steps.push(snap(4, p, `$x> p.val$ → 走右`, `right`));
      p = nodes[p].right;
    }
  }
  steps.push(snap(5, null, `$x=${target}$ 未找到（空位）`, `not found`));
  return steps;
}

/** BST 真·插入：向现有树插入一个 x，返回动画 + 结果树（可提交为新版本） */
export function bstInsertOne(
  nodes0: BinNode[],
  root0: number,
  x: number,
): { steps: BstStep[]; result: TreeSnap } {
  const nodes = nodes0.map((n) => ({ ...n }));
  const root = root0;
  const steps: BstStep[] = [];
  const snap = (
    line: number,
    focus: number | null,
    newNode: number | null,
    edge: [number, number] | null,
    side: "l" | "r" | null,
    zh: string,
    en: string,
  ): BstStep => ({
    line,
    nodes: nodes.map((n) => ({ ...n })),
    visible: nodes.length,
    root,
    focus,
    newNode,
    edge,
    side,
    msg: { zh, en },
  });
  if (nodes.length === 0) {
    nodes.push({ id: 0, val: x, left: null, right: null });
    steps.push(snap(1, 0, 0, null, null, `空树 → 根 = ${x}`, `root ${x}`));
    steps.push(snap(7, null, null, null, null, `完成`, `done`));
    return { steps, result: { nodes, root: 0 } };
  }
  steps.push(
    snap(
      2,
      root,
      null,
      null,
      null,
      `$p gets root=${nodes[root].val}$（插 $x=${x}$）`,
      `p←root`,
    ),
  );
  let p: number | null = root;
  while (p !== null) {
    steps.push(
      snap(
        3,
        p,
        null,
        null,
        null,
        `while：$p=${nodes[p].val}$`,
        `p=${nodes[p].val}`,
      ),
    );
    if (x < nodes[p].val) {
      if (nodes[p].left === null) {
        const id = nodes.length;
        nodes[p].left = id;
        nodes.push({ id, val: x, left: null, right: null });
        steps.push(
          snap(
            6,
            p,
            id,
            [p, id],
            "l",
            `${nodes[p].val}.left 空 → 挂入 ${x}`,
            `attach ${x}`,
          ),
        );
        break;
      }
      p = nodes[p].left;
    } else {
      if (nodes[p].right === null) {
        const id = nodes.length;
        nodes[p].right = id;
        nodes.push({ id, val: x, left: null, right: null });
        steps.push(
          snap(
            6,
            p,
            id,
            [p, id],
            "r",
            `${nodes[p].val}.right 空 → 挂入 ${x}`,
            `attach ${x}`,
          ),
        );
        break;
      }
      p = nodes[p].right;
    }
  }
  steps.push(
    snap(
      7,
      null,
      null,
      null,
      null,
      `完成：中序 $[${inorderOf(nodes).join(", ")}]$`,
      `done`,
    ),
  );
  return { steps, result: { nodes, root } };
}

/** 结构性删除核心（BST/AVL 共用）→ { nodes, root, found, startId }；startId=用于向上重平衡的起点 */
function deleteCore(
  nodes0: BinNode[],
  root0: number,
  target: number,
  snap: (line: number, focus: number | null, zh: string, en: string) => void,
): { nodes: BinNode[]; root: number; found: boolean; startId: number } {
  let nodes = nodes0.map((n) => ({ ...n }));
  let root = root0;
  const before = nodes.map((n) => ({ ...n }));
  const S = (id: number | null) => (id === null ? "∅" : String(before[id].val));
  if (nodes.length === 0) return { nodes, root, found: false, startId: -1 };
  let cur: number | null = root;
  let par: number | null = null;
  const locate = (): boolean => {
    while (cur !== null) {
      snap(0, cur, `定位 $p=${S(cur)}$（$x=${target}$）`, `locate p=${S(cur)}`);
      if (before[cur].val === target) return true;
      if (target < before[cur].val) {
        par = cur;
        cur = before[cur].left;
      } else {
        par = cur;
        cur = before[cur].right;
      }
    }
    return false;
  };
  if (!locate()) return { nodes, root, found: false, startId: -1 };
  const d = cur as number;
  const dl = nodes[d].left,
    dr = nodes[d].right;
  const isLeft = par !== null && nodes[par].left === d;
  if (dl === null && dr === null) {
    snap(1, d, `$p=${S(d)}$ 无子女 → 直接删除`, `leaf`);
    if (par === null) {
      nodes = [];
      root = 0;
    } else {
      if (isLeft) nodes[par].left = null;
      else nodes[par].right = null;
      nodes = withoutNode(nodes, d);
    }
    return { nodes, root, found: true, startId: par ?? -1 };
  }
  if (dl === null || dr === null) {
    snap(2, d, `$p=${S(d)}$ 仅一子 → 子顶替`, `one child`);
    const ch = (dl === null ? dr : dl) as number;
    if (par === null) {
      root = ch > d ? ch - 1 : ch;
      nodes = withoutNode(nodes, d);
      return { nodes, root, found: true, startId: -1 };
    }
    if (isLeft) nodes[par].left = ch;
    else nodes[par].right = ch;
    nodes = withoutNode(nodes, d);
    return { nodes, root, found: true, startId: par };
  }
  // 双子：找右子树最小后继 s，复制值后删 s（s 至多一子）
  let s = dr as number,
    sPar = d;
  snap(3, d, `$p=${S(d)}$ 双子 → 右子树最小`, `two children`);
  while (nodes[s].left !== null) {
    snap(3, s, `找后继：$s=${S(s)}$（左走）`, `successor ${S(s)}`);
    sPar = s;
    s = nodes[s].left as number;
  }
  snap(3, s, `后继 $s=${S(s)}$`, `successor ${S(s)}`);
  nodes[d].val = nodes[s].val;
  snap(4, d, `$p.val gets ${nodes[d].val}$`, `copy ${nodes[d].val}`);
  if (sPar === d) nodes[d].right = nodes[s].right;
  else nodes[sPar].left = nodes[s].right;
  const startId = sPar === d ? d : sPar;
  nodes = withoutNode(nodes, s);
  snap(
    4,
    startId > s ? startId - 1 : startId,
    `删 $s$：剩余 $[${inorderOf(nodes).join(", ")}]$`,
    `remove succ`,
  );
  return {
    nodes,
    root,
    found: true,
    startId: startId > s ? startId - 1 : startId,
  };
}

/** BST 真·删除：从现有树删 target，返回动画 + 结果树 */
export function bstDeleteOnTree(
  nodes0: BinNode[],
  root: number,
  target: number,
): { steps: BstStep[]; result: TreeSnap } {
  const nodes = nodes0.map((n) => ({ ...n }));
  let rootNow = root;
  const steps: BstStep[] = [];
  const snap = (
    line: number,
    focus: number | null,
    zh: string,
    en: string,
  ): BstStep => ({
    line,
    nodes: nodes.map((n) => ({ ...n })),
    visible: nodes.length,
    root: rootNow,
    focus,
    newNode: null,
    edge: null,
    side: null,
    msg: { zh, en },
  });
  const out = deleteCore(nodes, rootNow, target, (l, f, z, e) =>
    steps.push(snap(l, f, z, e)),
  );
  if (!out.found) {
    steps.push(snap(5, null, `$x=${target}$ 不存在（空位）`, `not found`));
    return { steps, result: out };
  }
  nodes.splice(0, nodes.length, ...out.nodes);
  rootNow = out.root;
  steps.push(
    snap(5, null, `完成：$[${inorderOf(nodes).join(", ") || "∅"}]$`, `done`),
  );
  return { steps, result: { nodes, root: rootNow } };
}

/** AVL 真·插入：向现有树插一个 x 并沿路径重平衡，返回动画 + 结果树 */
export function avlInsertOne(
  nodes0: BinNode[],
  root0: number,
  x: number,
): { steps: BstStep[]; result: TreeSnap } {
  const nodes = nodes0.map((n) => ({ ...n }));
  let root = root0;
  const steps: BstStep[] = [];
  const snap = (
    line: number,
    focus: number | null,
    zh: string,
    en: string,
  ): BstStep => ({
    line,
    nodes: nodes.map((n) => ({ ...n })),
    visible: nodes.length,
    root,
    focus,
    newNode: null,
    edge: null,
    side: null,
    msg: { zh, en },
  });
  if (nodes.length === 0) {
    nodes.push({ id: 0, val: x, left: null, right: null });
    steps.push(snap(0, null, `插入 $x=${x}$ → 根`, `root ${x}`));
    steps.push(snap(7, null, `完成`, `done`));
    return { steps, result: { nodes, root: 0 } };
  }
  steps.push(snap(0, null, `插入 $x=${x}$（BST 步骤同插入）`, `insert ${x}`));
  let p: number | null = root;
  while (p !== null) {
    if (x < nodes[p].val) {
      if (nodes[p].left === null) {
        const id = nodes.length;
        nodes[p].left = id;
        nodes.push({ id, val: x, left: null, right: null });
        p = id;
      } else p = nodes[p].left;
    } else if (nodes[p].right === null) {
      const id = nodes.length;
      nodes[p].right = id;
      nodes.push({ id, val: x, left: null, right: null });
      p = id;
    } else p = nodes[p].right;
    if (p !== null && nodes[p].left === null && nodes[p].right === null) break;
  }
  const inserted = (p ?? 0) as number;
  root = avlRebalance(
    nodes,
    root,
    inserted,
    (l, f, z, e) => steps.push(snap(l, f, z, e)),
    {
      bf: 2,
      rot: 3,
      kindOff: true,
    },
  );
  steps.push(
    snap(7, null, `完成：AVL 中序 $[${inorderOf(nodes).join(", ")}]$`, `done`),
  );
  return { steps, result: { nodes, root } };
}

/** AVL 真·删除：删除现有树中的 target 并沿父链重平衡（可能多次旋转） */
export function avlDeleteOnTree(
  nodes0: BinNode[],
  root: number,
  target: number,
): { steps: BstStep[]; result: TreeSnap } {
  const nodes = nodes0.map((n) => ({ ...n }));
  let rootNow = root;
  const steps: BstStep[] = [];
  const snap = (
    line: number,
    focus: number | null,
    zh: string,
    en: string,
  ): BstStep => ({
    line,
    nodes: nodes.map((n) => ({ ...n })),
    visible: nodes.length,
    root: rootNow,
    focus,
    newNode: null,
    edge: null,
    side: null,
    msg: { zh, en },
  });
  const out = deleteCore(nodes, rootNow, target, (l, f, z, e) =>
    steps.push(snap(l, f, z, e)),
  );
  if (!out.found) {
    steps.push(snap(5, null, `$x=${target}$ 不存在（空位）`, `not found`));
    return { steps, result: { nodes: out.nodes, root: out.root } };
  }
  nodes.splice(0, nodes.length, ...out.nodes);
  rootNow = out.root;
  if (out.startId >= 0 && out.startId < nodes.length) {
    rootNow = avlRebalance(
      nodes,
      rootNow,
      out.startId,
      (l, f, z, e) => steps.push(snap(l, f, z, e)),
      {
        bf: 5,
        rot: 6,
        kindOff: false,
      },
    );
  }
  steps.push(
    snap(7, null, `完成：$[${inorderOf(nodes).join(", ") || "∅"}]$`, `done`),
  );
  return { steps, result: { nodes, root: rootNow } };
}

/** 沿 startId 向上重平衡（插入：一般一次；删除：可能多处）。bf/rot=伪代码行号 */
function avlRebalance(
  nodes: BinNode[],
  root: number,
  startId: number,
  snap: (line: number, focus: number | null, zh: string, en: string) => void,
  ln: { bf: number; rot: number; kindOff: boolean },
): number {
  let r = root;
  let u = startId;
  let guard = 0;
  while (u !== -1 && u < nodes.length && guard++ < 3 * nodes.length + 4) {
    const h = binHeight(nodes);
    const par = binParents(nodes);
    const findBf = (v: number) => {
      const lh = nodes[v].left === null ? 0 : h[nodes[v].left!];
      const rh = nodes[v].right === null ? 0 : h[nodes[v].right!];
      return lh - rh;
    };
    const b = findBf(u);
    if (Math.abs(b) <= 1) {
      snap(ln.bf, u, `$bf[${nodes[u].val}] = ${b}$ 平衡`, `bf=${b}`);
      u = par[u];
      continue;
    }
    const lc = nodes[u].left,
      rc = nodes[u].right;
    const lb = lc === null ? 0 : findBf(lc);
    const rb = rc === null ? 0 : findBf(rc);
    const kind = b > 1 ? (lb >= 0 ? "LL" : "LR") : rb <= 0 ? "RR" : "RL";
    snap(
      ln.rot +
        (ln.kindOff
          ? kind === "LL"
            ? 0
            : kind === "LR"
              ? 1
              : kind === "RR"
                ? 2
                : 3
          : 0),
      u,
      `${kind}：$bf=${b}$，子$bf=${b > 1 ? lb : rb}$ → 旋转`,
      kind,
    );
    const rv = (y0: number): number => {
      const x0 = nodes[y0].left!;
      nodes[y0].left = nodes[x0].right;
      nodes[x0].right = y0;
      return x0;
    };
    const lv = (y0: number): number => {
      const x0 = nodes[y0].right!;
      nodes[y0].right = nodes[x0].left;
      nodes[x0].left = y0;
      return x0;
    };
    const pPar = par[u];
    let t = u;
    if (kind === "LL") t = rv(t);
    else if (kind === "RR") t = lv(t);
    else if (kind === "LR") {
      nodes[t].left = lv(nodes[t].left!);
      t = rv(t);
    } else {
      nodes[t].right = rv(nodes[t].right!);
      t = lv(t);
    }
    if (pPar === -1) r = t;
    else if (nodes[pPar].left === u) nodes[pPar].left = t;
    else nodes[pPar].right = t;
    snap(
      ln.bf,
      t,
      `旋转完成：子树根 → ${nodes[t].val}，$|bf|leq 1$`,
      `rotated`,
    );
    u = pPar;
  }
  return r;
}

export type TreeSnap = { nodes: BinNode[]; root: number };

export const AVL_DELETE_CODE: Text[] = [
  { zh: "$p \\gets locate(x)$", en: "$p \\gets locate(x)$" },
  { zh: "if $p$ 无子女: remove // 叶", en: "if leaf: remove" },
  { zh: "else if $p$ 仅一子: 子顶替", en: "one child: promote" },
  { zh: "else 双子: $s \\gets$ 右子树最小", en: "two children: successor s" },
  { zh: "$p.val \\gets s.val$; $remove(s)$", en: "copy s.val; remove(s)" },
  {
    zh: "while $|bf(u)| \\leq 1$: $u \\gets parent$",
    en: "while balanced: up",
  },
  { zh: "rotate(LL/LR/RR/RL)  // 失衡修复", en: "rotate(LL/LR/RR/RL)" },
  { zh: "// 完成", en: "// done" },
];

// ============================================================
// 二叉堆（大顶堆）：数组快照 + 比较/交换下标
// ============================================================

export type HeapStep = {
  line: number;
  values: number[]; // 当前数组快照（未排序前缀 + 已排序后缀，sort 场景）
  a: number | null; // 参与比较/交换的下标
  b: number | null;
  kind: "cmp" | "swap" | "done";
  msg: { zh: string; en: string };
  /** 删除堆顶的“末元素上移”飞行标记：幽灵节点从 src 位飞向 dst 位（t=0..1 进度） */
  fly?: { val: number; src: number; dst: number; t: number } | null;
};

export const HEAP_INSERT_CODE: Text[] = [
  {
    zh: "$A[n] \\gets x$; $i \\gets n$",
    en: "$A[n] \\gets x$; $i \\gets n$",
  },
  {
    zh: "while $i>0 \\land A[p_i] < A[i]$:  // $p_i=\\lfloor (i-1)/2 \\rfloor$",
    en: "while $i>0 \\land A[p_i] < A[i]$:  // $p_i=\\lfloor (i-1)/2 \\rfloor$",
  },
  {
    zh: "  $swap(A_i, A_{p_i})$",
    en: "  $swap(A_i, A_{p_i})$",
  },
  {
    zh: "  $i \\gets p_i$  // $p_i=\\lfloor (i-1)/2 \\rfloor$",
    en: "  $i \\gets p_i$  // parent",
  },
  {
    zh: "// 上滤完成",
    en: "// sift-up done",
  },
];

export function heapInsertSteps(heap: number[], x: number): HeapStep[] {
  const v = [...heap];
  const steps: HeapStep[] = [];
  const snap = (
    line: number,
    a: number | null,
    b: number | null,
    kind: HeapStep["kind"],
    zh: string,
    en: string,
  ): HeapStep => ({ line, values: [...v], a, b, kind, msg: { zh, en } });
  // 首帧 = 插入前的完整堆（`A[n] ← x`：点播放后才追加）
  steps.push(
    snap(
      0,
      null,
      null,
      "cmp",
      `当前堆 $[${v.join(", ") || "—"}]$：$A[${v.length}] \\gets x=${x}$`,
      `current heap; A[${v.length}]←x=${x}`,
    ),
  );
  // 追加 x 到末尾：A[n] ← x; i ← n
  v.push(x);
  let i = v.length - 1;
  steps.push(
    snap(
      0,
      i,
      null,
      "cmp",
      `$A[${v.length - 1}] \\gets ${x}$，$i \\gets ${i}$`,
      `A[n]←${x}, i←${i}`,
    ),
  );
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (v[p] < v[i]) {
      steps.push(
        snap(
          1,
          i,
          p,
          "cmp",
          `$A[${p}]=${v[p]} < A[${i}]=${v[i]}$ → 需上滤`,
          `A[${p}]<A[${i}]`,
        ),
      );
      [v[p], v[i]] = [v[i], v[p]];
      steps.push(
        snap(
          2,
          p,
          i,
          "swap",
          `$swap(A_{${i}}, A_{${p}})$：${v[i]} ⇄ ${v[p]}`,
          `swap`,
        ),
      );
      i = p;
      steps.push(snap(3, i, null, "cmp", `$i \\gets ${i}$`, `i←${i}`));
    } else {
      steps.push(
        snap(
          1,
          i,
          p,
          "cmp",
          `$A[${p}]=${v[p]} \\ge A[${i}]=${v[i]}$ → 停`,
          `stop`,
        ),
      );
      break;
    }
  }
  steps.push(
    snap(4, null, null, "done", `上滤完成：$[${v.join(", ")}]$`, `done`),
  );
  return steps;
}

export const HEAP_DELETE_CODE: Text[] = [
  {
    zh: "$root \\gets A_0$  // 记堆顶",
    en: "$root \\gets A_0$  // save top",
  },
  {
    zh: "$A_0 \\gets A_{n-1}$;  $n \\gets n-1$  // 末元素上移、长度减一",
    en: "$A_0 \\gets A_{n-1}$; $n \\gets n-1$",
  },
  {
    zh: "$i \\gets 0$",
    en: "$i \\gets 0$",
  },
  {
    zh: "while $A_i < \\max(A_{2i+1}, A_{2i+2})$:",
    en: "while $A_i < \\max(A_{2i+1}, A_{2i+2})$:",
  },
  {
    zh: "  $j \\gets \\arg\\max(A_{2i+1}, A_{2i+2})$",
    en: "  $j \\gets \\arg\\max(A_{2i+1}, A_{2i+2})$",
  },
  {
    zh: "  $swap(A_i, A_j)$; $i \\gets j$",
    en: "  $swap(A_i, A_j)$; $i \\gets j$",
  },
  {
    zh: "// 下滤完成",
    en: "// sift-down done",
  },
];

export function heapDeleteTopSteps(heap: number[]): HeapStep[] {
  const v = [...heap];
  const steps: HeapStep[] = [];
  const snap = (
    line: number,
    a: number | null,
    b: number | null,
    kind: HeapStep["kind"],
    zh: string,
    en: string,
  ): HeapStep => ({ line, values: [...v], a, b, kind, msg: { zh, en } });
  if (v.length === 0) return [snap(6, null, null, "done", "空堆", "empty")];
  const rootV = v[0];
  // 首帧 = 删除前的完整堆，高亮根（`root ← A_0`：点播放后才执行后续删除）
  steps.push(
    snap(
      0,
      0,
      null,
      "cmp",
      `当前堆 $[${v.join(", ")}]$：$root \\gets A_0=${rootV}$`,
      `current heap; root=${rootV}`,
    ),
  );
  // 末元素上移动画：幽灵节点从最后位置（src）逐帧飞到根位置（dst），替换根
  const lastIdx = v.length - 1;
  const lastV = v[lastIdx];
  if (lastIdx > 0) {
    const FLY_FRAMES = 6;
    for (let k = 1; k <= FLY_FRAMES; k++) {
      const t = k / FLY_FRAMES;
      steps.push({
        line: 1,
        values: [...v],
        a: null,
        b: null,
        kind: "cmp",
        msg: {
          zh: `末元素 ${lastV} 上移 $A_{${lastIdx}} \\to A_0$（${Math.round(t * 100)}%）`,
          en: `last ${lastV} moving to root (${Math.round(t * 100)}%)`,
        },
        fly: { val: lastV, src: lastIdx, dst: 0, t },
      });
    }
  }
  // 执行 A_0 ← A_{n-1}; n ← n-1（此时数组 = 删除后的堆）
  v[0] = lastV;
  v.pop();
  steps.push(
    snap(
      1,
      0,
      null,
      "cmp",
      `$A[0] \\gets A[n-1]=${lastV}$；$n \\gets n-1$ → 存储 $[${v.join(", ")}]$`,
      `A[0]←${lastV}; n←n-1`,
    ),
  );
  let i = 0;
  steps.push(snap(2, i, null, "cmp", `$i \\gets ${i}$`, `i←${i}`));
  while (2 * i + 1 < v.length) {
    const l = 2 * i + 1,
      r = 2 * i + 2;
    const j = r < v.length && v[r] > v[l] ? r : l;
    if (v[i] < v[j]) {
      steps.push(
        snap(
          3,
          i,
          j,
          "cmp",
          `$A[${i}]=${v[i]} < 大子 A[${j}]=${v[j]}$ → 下滤`,
          `A[${i}]<A[${j}]`,
        ),
      );
      steps.push(snap(4, i, j, "cmp", `$j \\gets ${j}$`, `j←${j}`));
      [v[i], v[j]] = [v[j], v[i]];
      steps.push(
        snap(
          5,
          j,
          i,
          "swap",
          `$swap(A_{${i}}, A_{${j}})$；$i \\gets ${j}$`,
          `swap; i←${j}`,
        ),
      );
      i = j;
    } else {
      steps.push(
        snap(
          3,
          i,
          j,
          "cmp",
          `$A[${i}]=${v[i]} \\ge A[${j}]=${v[j]}$ → 停`,
          `stop`,
        ),
      );
      break;
    }
  }
  steps.push(
    snap(
      6,
      null,
      null,
      "done",
      `下滤完成（出堆 ${rootV}）：$[${v.join(", ")}]$`,
      `done`,
    ),
  );
  return steps;
}

export const HEAP_BUILD_CODE: Text[] = [
  {
    zh: "for $i \\gets \\lfloor n/2 \\rfloor - 1$ downto $0$:",
    en: "for $i \\gets \\lfloor n/2 \\rfloor - 1$ downto $0$:",
  },
  {
    zh: "  $siftDown(A, i)$  // 对 $A[i]$ 下滤",
    en: "  $siftDown(A, i)$  // sift-down",
  },
  {
    zh: "// 建堆完成",
    en: "// built",
  },
];

export function heapBuildSteps(values: number[]): HeapStep[] {
  const v = [...values];
  const steps: HeapStep[] = [];
  const snap = (
    line: number,
    a: number | null,
    b: number | null,
    kind: HeapStep["kind"],
    zh: string,
    en: string,
  ): HeapStep => ({ line, values: [...v], a, b, kind, msg: { zh, en } });
  steps.push(snap(0, null, null, "cmp", `初始 $[${v.join(", ")}]$`, `init`));
  for (let i = Math.floor(v.length / 2) - 1; i >= 0; i--) {
    steps.push(
      snap(0, i, null, "cmp", `for：$i \\gets ${i}$（最后一个非叶）`, `i←${i}`),
    );
    let c = i;
    while (2 * c + 1 < v.length) {
      const l = 2 * c + 1,
        r = 2 * c + 2;
      const j = r < v.length && v[r] > v[l] ? r : l;
      if (v[c] < v[j]) {
        steps.push(
          snap(
            1,
            c,
            j,
            "cmp",
            `下滤 $A[${c}]=${v[c]}$（大子 $A[${j}]=${v[j]}$）`,
            `sift A[${c}]`,
          ),
        );
        [v[c], v[j]] = [v[j], v[c]];
        steps.push(snap(1, j, c, "swap", `$swap$：${v[c]} ⇄ ${v[j]}`, `swap`));
        c = j;
      } else break;
    }
  }
  steps.push(
    snap(2, null, null, "done", `建堆完成：$[${v.join(", ")}]$`, `done`),
  );
  return steps;
}

export const HEAP_SORT_CODE: Text[] = [
  {
    zh: "$buildHeap(A)$  // 建大顶堆",
    en: "$buildHeap(A)$  // build",
  },
  {
    zh: "for $i \\gets n-1$ downto $1$:",
    en: "for $i \\gets n-1$ downto $1$:",
  },
  {
    zh: "  $swap(A_0, A_i)$; $n \\gets n-1$",
    en: "  $swap(A_0, A_i)$; $n \\gets n-1$",
  },
  {
    zh: "  $siftDown(A, 0, i-1)$  // 下滤",
    en: "  $siftDown(A, 0, i-1)$  // sift-down",
  },
  {
    zh: "// 完成（升序）",
    en: "// sorted asc",
  },
];

export function heapSortSteps(values: number[]): HeapStep[] {
  const v = [...values];
  const steps: HeapStep[] = [];
  const snap = (
    line: number,
    a: number | null,
    b: number | null,
    kind: HeapStep["kind"],
    zh: string,
    en: string,
  ): HeapStep => ({ line, values: [...v], a, b, kind, msg: { zh, en } });
  // 阶段 0：建堆（复用下滤，行 0）
  steps.push(snap(0, null, null, "cmp", `建堆：$[${v.join(", ")}]$`, `build`));
  for (let i = Math.floor(v.length / 2) - 1; i >= 0; i--) {
    let c = i;
    while (2 * c + 1 < v.length) {
      const l = 2 * c + 1,
        r = 2 * c + 2;
      const j = r < v.length && v[r] > v[l] ? r : l;
      if (v[c] < v[j]) {
        steps.push(snap(0, c, j, "cmp", `建堆下滤 $A[${c}]$`, `build`));
        [v[c], v[j]] = [v[j], v[c]];
        steps.push(snap(0, j, c, "swap", `$swap$`, `swap`));
        c = j;
      } else break;
    }
  }
  for (let i = v.length - 1; i >= 1; i--) {
    steps.push(snap(1, 0, i, "cmp", `for：$i \\gets ${i}$`, `i←${i}`));
    [v[0], v[i]] = [v[i], v[0]];
    steps.push(
      snap(
        2,
        0,
        i,
        "swap",
        `$swap(A_0,A_{${i}})$ → 最大值入已排序段`,
        `swap max out`,
      ),
    );
    let c = 0;
    while (2 * c + 1 < i) {
      const l = 2 * c + 1,
        r = 2 * c + 2;
      const j = r < i && v[r] > v[l] ? r : l;
      if (v[c] < v[j]) {
        steps.push(
          snap(
            3,
            c,
            j,
            "cmp",
            `下滤 $A[0..${i - 1}]$：$A[${c}]=${v[c]}$`,
            `sift`,
          ),
        );
        [v[c], v[j]] = [v[j], v[c]];
        steps.push(snap(3, j, c, "swap", `$swap$`, `swap`));
        c = j;
      } else break;
    }
  }
  steps.push(
    snap(
      4,
      null,
      null,
      "done",
      `排序完成（升序）：$[${v.join(", ")}]$`,
      `sorted`,
    ),
  );
  return steps;
}
