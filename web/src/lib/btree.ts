import type { Text } from "../i18n/lang";

// ============================================================
// P3.8：B 树 / B+ 树（多路平衡搜索树）
// 节点 = 货架（keys 有序数组），孩子数 = 键数 + 1（叶子无孩子）。
// 阶 m：每个节点至多 m−1 个键、至少 ⌈m/2⌉−1 个键（根除外）。
//  - B 树：所有键分布在全部节点（并 → assert 性质：非叶键 = 子树分隔值）
//  - B+ 树：内部只放索引键，数据全部在叶子；叶子右链（虚线边）
// 教学降载：分裂/合并帧用「整树快照 + 琥珀环 current / 天蓝 exploring」渲染，
// 细颗粒的“中间键飞行”留给 caption 文字（图足够大时仍可看清两半各落其位）。
// ============================================================

export type BNode = {
  id: number;
  keys: number[];
  /** 孩子 id（升序）；叶子 = [] */
  children: number[];
  /** B+ 树：叶子右链（下一个叶子 id，null=无）；B 树恒 null */
  next?: number | null;
};

export type BTreeSnap = { nodes: BNode[]; root: number };
export type BStep = {
  line: number;
  nodes: BNode[];
  visible: number;
  root: number;
  focus: number | null;
  edge: [number, number] | null;
  msg: Text;
};

export const BTREE_SEARCH_CODE: Text[] = [
  {
    zh: "$p \\gets root$; $i \\gets slot(p,x)$  // 定位键位",
    en: "$p \\gets root$; $i \\gets slot(p,x)$  // locate key slot",
  },
  {
    zh: "while $internal(p)$: // 经 $child_i$ 下探",
    en: "while $internal(p)$: // descend via $child_i$",
  },
  {
    zh: "$hit\\gets(x\\in leaf)$  // 叶内命中，B+ 数据在叶",
    en: "$hit\\gets(x\\in leaf)$  // in-leaf hit",
  },
];

export const BTREE_INSERT_CODE: Text[] = [
  {
    zh: "$p \\gets targetLeaf(x)$  // 下探到目标叶子",
    en: "$p \\gets targetLeaf(x)$  // descend to target leaf",
  },
  {
    zh: "$leafInsert(x)$  // 叶内有序插入",
    en: "$leafInsert(x)$  // into leaf, in order",
  },
  {
    zh: "if $|keys| = m$: // 满则分裂",
    en: "if $|keys| = m$: // full, split",
  },
  {
    zh: "while $|keys| \\geq m$: // 父满逐层分裂上提",
    en: "while $|keys| \\geq m$: // split up",
  },
  {
    zh: "$newRoot(root)$ // 根满建新根，$h \\gets h+1$",
    en: "$newRoot(root)$ // new root, $h \\gets h+1$",
  },
];

export const BTREE_DELETE_CODE: Text[] = [
  {
    zh: "$p \\gets locate(x)$  // 定位删 $x$",
    en: "$p \\gets locate(x)$  // locate $x$",
  },
  {
    zh: "if $internal(p)$: // 非叶走后继，叶内真删",
    en: "if $internal(p)$: // successor or real delete",
  },
  {
    zh: "if $|keys| < \\lceil m/2 \\rceil - 1$:",
    en: "if $|keys| < \\lceil m/2 \\rceil - 1$:",
  },
  {
    zh: "$borrow(p,sib)$  // 兄弟可借，父键旋转",
    en: "$borrow(p,sib)$  // rotate via parent key",
  },
  {
    zh: "else: // 兄弟不可借",
    en: "else: // merge",
  },
  {
    zh: "$merge(p,sib)$ // 合并兄弟，父键下移；空根降根完成",
    en: "$merge(p,sib)$ // merge down",
  },
];

/** 节点最小键数（根除外） */
export function minKeys(m: number): number {
  return Math.ceil(m / 2) - 1;
}
/** 节点满键数 = 允许分裂的阈值（≥ m 即满） */
export function isFull(n: BNode, m: number): boolean {
  return n.keys.length >= m;
}
/** 键 x 在节点 keys 中的插入位置 */
export function lowerBound(keys: number[], x: number): number {
  let lo = 0,
    hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ---------- 布局：货架节点树 ----------

function leafCount(nodes: BNode[], u: number): number {
  if (nodes[u].children.length === 0) return 1;
  let c = 0;
  for (const v of nodes[u].children) c += leafCount(nodes, v);
  return c;
}
function depthOf(nodes: BNode[], u: number): number {
  let d = 0,
    v = u;
  const par = parentsOf(nodes);
  while (par[v] !== -1) {
    d++;
    v = par[v];
  }
  return d;
}
function parentsOf(nodes: BNode[]): number[] {
  const par = Array(nodes.length).fill(-1);
  nodes.forEach((n) => {
    for (const c of n.children) par[c] = n.id;
  });
  return par;
}

/** B 树布局：根左，孩子按叶子数水平扇出；返回 id → 坐标 */
export function bTreeLayout(
  nodes: BNode[],
  root: number,
  box: { x0: number; y0: number; w: number; h: number },
): { x: number; y: number }[] {
  const pos: { x: number; y: number }[] = nodes.map(() => ({ x: 0, y: 0 }));
  if (nodes.length === 0) return pos;
  const maxDepth = nodes.reduce((m, n) => Math.max(m, depthOf(nodes, n.id)), 0);
  const stepY = Math.min(72, Math.max(44, box.h / Math.max(2, maxDepth + 1)));
  const alloc = (u: number, x0: number, x1: number) => {
    const lc = leafCount(nodes, u);
    pos[u] = { x: (x0 + x1) / 2, y: box.y0 + depthOf(nodes, u) * stepY };
    if (lc <= 1) return;
    const kids = nodes[u].children;
    const tot = kids.reduce((s, c) => s + leafCount(nodes, c), 0);
    let cur = x0;
    for (const c of kids) {
      const w = (leafCount(nodes, c) / tot) * (x1 - x0);
      alloc(c, cur, cur + w);
      cur += w;
    }
  };
  if (nodes.length) alloc(root, box.x0, box.x0 + box.w);
  return pos;
}

// ---------- B 树：查找 / 插入（分裂）/ 删除（借 + 合并） ----------

/** 按值序列建 B 树（逐键插入，含分裂帧）；m = 阶 */
export function bTreeInsertSteps(values: number[], m: number): BStep[] {
  const nodes: BNode[] = [];
  let root = 0;
  const steps: BStep[] = [];
  const snap = (
    line: number,
    focus: number | null,
    zh: string,
    en: string,
  ): BStep => ({
    line,
    nodes: nodes.map((n) => ({
      ...n,
      keys: [...n.keys],
      children: [...n.children],
    })),
    visible: nodes.length,
    root,
    focus,
    edge: null,
    msg: { zh, en },
  });
  const S = (id: number | null) =>
    id === null ? "∅" : `[${nodes[id].keys.join(",")}]`;
  const insertInto = (node: BNode, x: number): void => {
    const i = lowerBound(node.keys, x);
    node.keys.splice(i, 0, x);
  };
  for (const x of values) {
    steps.push(
      snap(
        0,
        root < nodes.length ? root : null,
        `插入 $x=${x}$`,
        `insert ${x}`,
      ),
    );
    if (nodes.length === 0) {
      nodes.push({ id: 0, keys: [x], children: [] });
      steps.push(snap(4, 0, `新根 $[${x}]$`, `root [${x}]`));
      continue;
    }
    // 下探到叶子
    let p = root;
    while (nodes[p].children.length > 0) {
      const i = lowerBound(nodes[p].keys, x);
      steps.push(
        snap(0, p, `下探 ${S(p)} → 孩子 ${i}`, `descend ${S(p)} → child ${i}`),
      );
      p = nodes[p].children[i];
    }
    steps.push(
      snap(0, p, `叶 ${S(p)} 插入 $x=${x}$`, `leaf ${S(p)} insert ${x}`),
    );
    insertInto(nodes[p], x);
    // 沿父链修复：满则分裂
    let cur = p;
    while (isFull(nodes[cur], m)) {
      const mid = Math.floor(nodes[cur].keys.length / 2);
      const midKey = nodes[cur].keys[mid];
      const leftKeys = nodes[cur].keys.slice(0, mid);
      const rightKeys = nodes[cur].keys.slice(mid + 1);
      const leftCh = nodes[cur].children.slice(0, mid + 1);
      const rightCh = nodes[cur].children.slice(mid + 1);
      nodes[cur].keys = leftKeys;
      nodes[cur].children = leftCh;
      const rightId = nodes.length;
      nodes.push({ id: rightId, keys: rightKeys, children: rightCh });
      const par = parentsOf(nodes);
      const pcur = par[cur];
      steps.push(
        snap(
          2,
          cur,
          `${S(cur)} 满 → 分裂：中键 $[${midKey}]$ 上提，右半 → ${S(rightId)}`,
          `split ${S(cur)}: middle ${midKey} up`,
        ),
      );
      if (pcur === -1) {
        // 根分裂 → 新根
        const newRoot = nodes.length;
        nodes.push({ id: newRoot, keys: [midKey], children: [cur, rightId] });
        root = newRoot;
        steps.push(
          snap(
            4,
            newRoot,
            `根满 → 新建根 $[${midKey}]$（高度+1）`,
            `new root [${midKey}] (height+1)`,
          ),
        );
        break;
      }
      // 中间键并入父；父的孩子指针：把原 cur 替换为 [cur, rightId]
      insertInto(nodes[pcur], midKey);
      const ci = nodes[pcur].children.indexOf(cur);
      nodes[pcur].children.splice(ci, 1, cur, rightId);
      steps.push(
        snap(
          3,
          pcur,
          `父 ${S(pcur)} 收中键 $[${midKey}]$，孩子 → [${S(cur)}, ${S(rightId)}]`,
          `parent ${S(pcur)} takes ${midKey}`,
        ),
      );
      cur = pcur;
    }
    steps.push(snap(1, cur, `完成 $x=${x}$（当前 ${S(cur)}）`, `done ${x}`));
  }
  steps.push(
    snap(
      4,
      null,
      `完成：B${m} 树 · 键共 ${nodes.reduce((s, n) => s + n.keys.length, 0)}`,
      `done: B${m} tree`,
    ),
  );
  return steps;
}

/** 从现有 B 树删除键（借 + 合并），返回动画 + 结果 */
export function bTreeDeleteOnTree(
  nodes0: BNode[],
  root0: number,
  m: number,
  x: number,
): { steps: BStep[]; result: BTreeSnap } {
  let nodes = nodes0.map((n) => ({
    ...n,
    keys: [...n.keys],
    children: [...n.children],
  }));
  let root = root0;
  const steps: BStep[] = [];
  const snap = (
    line: number,
    focus: number | null,
    zh: string,
    en: string,
  ): BStep => ({
    line,
    nodes: nodes.map((n) => ({
      ...n,
      keys: [...n.keys],
      children: [...n.children],
    })),
    visible: nodes.length,
    root,
    focus,
    edge: null,
    msg: { zh, en },
  });
  const S = (id: number | null) =>
    id === null ? "∅" : `[${nodes[id].keys.join(",")}]`;
  if (nodes.length === 0) {
    steps.push(snap(0, null, "空树", "empty"));
    return { steps, result: { nodes, root } };
  }
  // 定位
  let p = root;
  let foundAt: number | null = null;
  while (true) {
    const i = lowerBound(nodes[p].keys, x);
    if (i < nodes[p].keys.length && nodes[p].keys[i] === x) {
      foundAt = p;
      break;
    }
    if (nodes[p].children.length === 0) break;
    steps.push(snap(0, p, `下探 ${S(p)}`, `descend ${S(p)}`));
    p = nodes[p].children[i];
  }
  if (foundAt === null) {
    steps.push(snap(0, null, `$x=${x}$ 不存在`, `not found`));
    return { steps, result: { nodes, root } };
  }
  steps.push(
    snap(
      0,
      foundAt,
      `定位 $x=${x}$ ∈ ${S(foundAt)}`,
      `locate ${x} in ${S(foundAt)}`,
    ),
  );
  // 非叶：用右子树最小键（后继）替换，真实删除发生在叶
  if (nodes[foundAt].children.length > 0) {
    let succ = nodes[foundAt].children[lowerBound(nodes[foundAt].keys, x) + 1];
    while (nodes[succ].children.length > 0) succ = nodes[succ].children[0];
    const succKey = nodes[succ].keys[0];
    const ki = nodes[foundAt].keys.indexOf(x);
    nodes[foundAt].keys[ki] = succKey;
    steps.push(
      snap(
        1,
        foundAt,
        `非叶：后继键 $[${succKey}]$ 顶替 $[${x}]$，真删在叶`,
        `successor ${succKey} replaces ${x}`,
      ),
    );
    x = succKey;
    foundAt = succ;
  }
  // 叶内真删
  const li = nodes[foundAt].keys.indexOf(x);
  nodes[foundAt].keys.splice(li, 1);
  steps.push(
    snap(
      2,
      foundAt,
      `叶 ${S(foundAt)} 删 $[${x}]$`,
      `leaf ${S(foundAt)} delete ${x}`,
    ),
  );
  // 借 / 合并：自底向上
  let cur = foundAt;
  const minK = minKeys(m);
  while (nodes[cur].keys.length < minK && nodes.length > 1) {
    const par = parentsOf(nodes);
    const pcur = par[cur];
    if (pcur === -1) break;
    const kids = nodes[pcur].children;
    const ci = kids.indexOf(cur);
    const leftSib = ci > 0 ? kids[ci - 1] : -1;
    const rightSib = ci < kids.length - 1 ? kids[ci + 1] : -1;
    // 借（左/右兄弟任一可借）
    if (leftSib !== -1 && nodes[leftSib].keys.length > minK) {
      const midIdx = ci - 1;
      const midKey = nodes[pcur].keys[midIdx];
      const lastKey = nodes[leftSib].keys.pop() as number;
      const lastChild = nodes[leftSib].children.pop();
      nodes[pcur].keys[midIdx] = lastKey;
      nodes[cur].keys.unshift(midKey);
      if (lastChild !== undefined) nodes[cur].children.unshift(lastChild);
      steps.push(
        snap(
          3,
          pcur,
          `借左兄弟 ${S(leftSib)}：$[${lastKey}]$ ↔ 父键 $[${midKey}]$`,
          `borrow left ${S(leftSib)}`,
        ),
      );
      break;
    }
    if (rightSib !== -1 && nodes[rightSib].keys.length > minK) {
      const midIdx = ci;
      const midKey = nodes[pcur].keys[midIdx];
      const firstKey = nodes[rightSib].keys.shift() as number;
      const firstChild = nodes[rightSib].children.shift();
      nodes[pcur].keys[midIdx] = firstKey;
      nodes[cur].keys.push(midKey);
      if (firstChild !== undefined) nodes[cur].children.push(firstChild);
      steps.push(
        snap(
          3,
          pcur,
          `借右兄弟 ${S(rightSib)}：$[${firstKey}]$ ↔ 父键 $[${midKey}]$`,
          `borrow right ${S(rightSib)}`,
        ),
      );
      break;
    }
    // 合并
    const midIdx = rightSib === -1 ? ci - 1 : ci;
    const midKey = nodes[pcur].keys[midIdx];
    const keep = rightSib === -1 ? leftSib : cur;
    const merge = rightSib === -1 ? cur : rightSib;
    nodes[keep].keys.push(midKey, ...nodes[merge].keys);
    nodes[keep].children.push(...nodes[merge].children);
    nodes[pcur].keys.splice(midIdx, 1);
    nodes[pcur].children.splice(midIdx + 1, 1);
    steps.push(
      snap(
        4,
        pcur,
        `合并 ${S(keep)}+${S(merge)}：父键 $[${midKey}]$ 下移，删 ${S(merge)}`,
        `merge ${S(keep)}+${S(merge)} via ${midKey}`,
      ),
    );
    // 删掉 merge 节点（紧凑 id 重编号）
    nodes = nodes
      .filter((n) => n.id !== merge)
      .map((n) => ({ ...n, keys: [...n.keys], children: [...n.children] }));
    const map = new Map<number, number>();
    nodes.forEach((n, i) => map.set(n.id, i));
    nodes = nodes.map((n) => ({
      ...n,
      id: map.get(n.id)!,
      children: n.children.map((c) => map.get(c)!),
    }));
    root = map.get(root) ?? 0;
    cur = keep > merge ? keep - 1 : keep;
  }
  // 根空 → 降根
  if (nodes[root].keys.length === 0 && nodes[root].children.length === 0) {
    nodes = [];
    root = 0;
    steps.push(snap(5, null, "树空：根已删空", "empty tree"));
    return { steps, result: { nodes, root } };
  }
  if (nodes[root].keys.length === 0 && nodes[root].children.length > 0) {
    const child = nodes[root].children[0];
    steps.push(
      snap(
        5,
        root,
        `根空 → 降根为 ${S(child)}（高度-1）`,
        `shrink root to ${S(child)}`,
      ),
    );
    nodes = nodes
      .filter((n) => n.id !== root)
      .map((n) => ({
        ...n,
        keys: [...n.keys],
        children: [...n.children],
      }));
    const map = new Map<number, number>();
    nodes.forEach((n, i) => map.set(n.id, i));
    nodes = nodes.map((n) => ({
      ...n,
      id: map.get(n.id)!,
      children: n.children.map((c) => map.get(c)!),
    }));
    root = map.get(child) ?? 0;
  }
  steps.push(
    snap(
      5,
      null,
      `完成：删除 $x=${x}$ 后 ${S(root)} 为根`,
      `done: ${x} deleted`,
    ),
  );
  return { steps, result: { nodes, root } };
}

// ---------- B+ 树：同样货架 + 叶子右链 ----------

/** B+ 插入：键进叶；叶满分裂（中键上提到内层，数据留在叶）；根满建新根 */
export function bPlusInsertSteps(values: number[], m: number): BStep[] {
  const nodes: BNode[] = [];
  let root = 0;
  const steps: BStep[] = [];
  const snap = (
    line: number,
    focus: number | null,
    zh: string,
    en: string,
  ): BStep => ({
    line,
    nodes: nodes.map((n) => ({
      ...n,
      keys: [...n.keys],
      children: [...n.children],
      next: n.next ?? null,
    })),
    visible: nodes.length,
    root,
    focus,
    edge: null,
    msg: { zh, en },
  });
  const S = (id: number | null) =>
    id === null ? "∅" : `[${nodes[id].keys.join(",")}]`;
  for (const x of values) {
    steps.push(
      snap(
        0,
        root < nodes.length ? root : null,
        `插入 $x=${x}$（数据只进叶）`,
        `insert ${x} (leaf only)`,
      ),
    );
    if (nodes.length === 0) {
      nodes.push({ id: 0, keys: [x], children: [], next: null });
      steps.push(snap(1, 0, `根=叶 $[${x}]$`, `root leaf [${x}]`));
      continue;
    }
    // 下探到叶（内部只做索引）
    let p = root;
    while (nodes[p].children.length > 0) {
      const i = lowerBound(nodes[p].keys, x);
      steps.push(
        snap(0, p, `索引 ${S(p)} → 孩子 ${i}`, `index ${S(p)} → child ${i}`),
      );
      p = nodes[p].children[i];
    }
    const i = lowerBound(nodes[p].keys, x);
    nodes[p].keys.splice(i, 0, x);
    steps.push(
      snap(1, p, `叶 ${S(p)} 插入 $x=${x}$`, `leaf ${S(p)} insert ${x}`),
    );
    // 叶满分裂
    let cur = p;
    while (isFull(nodes[cur], m)) {
      const mid = Math.floor(nodes[cur].keys.length / 2);
      const midKey = nodes[cur].keys[mid];
      const isLeaf = nodes[cur].children.length === 0;
      // B+ 叶子：数据均分，midKey 留在右叶（slice(mid)）；
      // 内层：midKey 上提，右半必须 slice(mid+1)（否则父键与右孩子最小键重复、keys/children 失同步）
      const leftKeys = nodes[cur].keys.slice(0, mid);
      const rightKeys = isLeaf
        ? nodes[cur].keys.slice(mid)
        : nodes[cur].keys.slice(mid + 1);
      const leftCh = nodes[cur].children.slice(0, mid + 1);
      const rightCh = nodes[cur].children.slice(mid + 1);
      nodes[cur].keys = leftKeys;
      nodes[cur].children = leftCh;
      const rightId = nodes.length;
      nodes.push({
        id: rightId,
        keys: rightKeys,
        children: rightCh,
        next: isLeaf ? (nodes[cur].next ?? null) : undefined,
      });
      if (isLeaf) nodes[cur].next = rightId;
      const par = parentsOf(nodes);
      const pcur = par[cur];
      const idxKey = isLeaf ? rightKeys[0] : midKey;
      steps.push(
        snap(
          2,
          cur,
          `${S(cur)} 满 → 分裂：索引键 $[${idxKey}]$ 上提`,
          `split ${S(cur)}: index ${idxKey} up`,
        ),
      );
      if (pcur === -1) {
        const newRoot = nodes.length;
        nodes.push({ id: newRoot, keys: [idxKey], children: [cur, rightId] });
        root = newRoot;
        steps.push(
          snap(
            4,
            newRoot,
            `根满 → 新建根 $[${idxKey}]$`,
            `new root [${idxKey}]`,
          ),
        );
        break;
      }
      // B+ 内层/叶子分裂：索引键 idxKey 分隔 cur 与 rightId（位于原 cur 的位置 ci），
      // 必须插在 keys[ci]，而不是用 lowerBound（两者不一致会令 keys 与 children 失同步,
      // 后续下探 children[i] 越界崩溃）
      const ci = nodes[pcur].children.indexOf(cur);
      if (ci === -1) {
        // 防御：父引用丢失则重建父链（理论不可达，防呆）
        throw new Error(`bplus split: parent ${pcur} lost child ${cur}`);
      }
      nodes[pcur].keys.splice(ci, 0, idxKey);
      nodes[pcur].children.splice(ci, 1, cur, rightId);
      steps.push(
        snap(
          3,
          pcur,
          `内层 ${S(pcur)} 收索引 $[${idxKey}]$`,
          `index ${S(pcur)} takes ${idxKey}`,
        ),
      );
      cur = pcur;
    }
    steps.push(snap(1, cur, `完成 $x=${x}$`, `done ${x}`));
  }
  steps.push(
    snap(
      4,
      null,
      `完成：B+树 · 叶共 ${nodes.reduce((s, n) => s + n.keys.length, 0)} 键（数据全在叶）`,
      `done: B+ tree`,
    ),
  );
  return steps;
}

/** B+ 叶子链骨架（教学展示用）：返回叶子 id 顺序 */
export function bPlusLeaves(nodes: BNode[]): number[] {
  const leaves = nodes.filter((n) => n.children.length === 0).map((n) => n.id);
  leaves.sort((a, b) => nodes[a].keys[0] - nodes[b].keys[0]);
  return leaves;
}
