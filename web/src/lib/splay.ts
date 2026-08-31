import type { Text } from "../i18n/lang";
import type { BinNode, BstStep, TreeSnap } from "./graph";
import { bstSearchOnTree } from "./graph";

// ============================================================
// P3.6：伸展树（Splay Tree）
// 无平衡因子/颜色：每次查找、插入、删除后把热点节点「伸展」到根
// （zig / zig-zig / zig-zag 三种旋转），摊还 O(log n)。
// 结构仍为 BinNode 数组 + 紧凑 id；旋转复用 rbtree 同款 rotL/rotR。
// ============================================================

/** Splay 纯旋转说明（搜索/建树内部帧高亮旋转类型）；正文仅英文伪代码词 + $数学$，中文在 // 后 */
export const SPLAY_CODE: Text[] = [
  { zh: "$rotate(x)$  // zig：$x$ 是根的孩子, 单旋", en: "$rotate(x)$  // zig: $x$ is root's child, single rotate" },
  { zh: "$rotate(p); rotate(x)$  // zig-zig：与父同侧, 双旋先父后 $x$", en: "$rotate(p); rotate(x)$  // zig-zig: same side, parent first" },
  { zh: "$rotate(x); rotate(p)$  // zig-zag：与父异侧, 双旋先 $x$ 后父", en: "$rotate(x); rotate(p)$  // zig-zag: opposite side, $x$ first" },
  { zh: "// $x$ 到达根", en: "// $x$ reaches the root" },
];

/** 插入/建树伪代码（正文数学 + 英文结构词，中文在 // 后） */
export const SPLAY_INSERT_CODE: Text[] = [
  { zh: "$z \\gets$ newNode  // BST 插入到空位的新节点", en: "$z \\gets$ newNode  // BST insert to leaf" },
  { zh: "while $z.p \\neq NIL$: $splay(z)$  // 旋到根", en: "while $z.p \\neq NIL$: $splay(z)$  // to root" },
  { zh: "$root \\gets z$  // 热点上浮至根", en: "$root \\gets z$  // hot node floats up" },
];

/** 删除伪代码（正文数学 + 英文结构词，中文在 // 后） */
export const SPLAY_DELETE_CODE: Text[] = [
  { zh: "locate $p$  // BST 删除搜索", en: "locate $p$  // BST delete search" },
  { zh: "$splay(p)$  // 先把目标旋到根", en: "$splay(p)$  // splay target to root first" },
  { zh: "$split(T, p)$  // 摘根：左右子树 $T_L$、$T_R$ 分离", en: "$split(T, p)$  // split into $T_L$ and $T_R$" },
  { zh: "if $T_L$ empty: $root \\gets T_R$  // 左子树空", en: "if $T_L$ empty: $root \\gets T_R$" },
  { zh: "else: $m \\gets max(T_L)$; $splay(m)$; attach $T_R$  // 右接 $T_R$, 完成", en: "else: $m \\gets max(T_L)$; $splay(m)$; attach $T_R$  // done" },
];

function binParents(nodes: BinNode[]): number[] {
  const par = Array(nodes.length).fill(-1);
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].left !== null) par[nodes[i].left!] = i;
    if (nodes[i].right !== null) par[nodes[i].right!] = i;
  }
  return par;
}

/** 左旋 / 右旋：以 y 为轴，返回新 root */
function rotL(nodes: BinNode[], root: number, y: number): number {
  const x = nodes[y].right!;
  const par = binParents(nodes);
  const py = par[y];
  nodes[y].right = nodes[x].left;
  nodes[x].left = y;
  if (py === -1) root = x;
  else if (nodes[py].left === y) nodes[py].left = x;
  else nodes[py].right = x;
  return root;
}
function rotR(nodes: BinNode[], root: number, y: number): number {
  const x = nodes[y].left!;
  const par = binParents(nodes);
  const py = par[y];
  nodes[y].left = nodes[x].right;
  nodes[x].right = y;
  if (py === -1) root = x;
  else if (nodes[py].left === y) nodes[py].left = x;
  else nodes[py].right = x;
  return root;
}

type Snap = (
  line: number,
  focus: number | null,
  zh: string,
  en: string,
) => void;

/** 核心：把节点 u 反复旋转到根；旋转类型逐帧 out（行号 0/1/2/3 = SPLAY_CODE） */
function splayUp(nodes: BinNode[], root: number, u: number, snap: Snap): number {
  while (true) {
    const par = binParents(nodes);
    const p = par[u];
    if (p === -1) break; // u 已是根
    const gp = par[p];
    const uIsLeft = nodes[p].left === u;
    if (gp === -1) {
      // zig：单旋
      root = uIsLeft ? rotR(nodes, root, p) : rotL(nodes, root, p);
      snap(0, u, `zig：$x=${nodes[u].val}$ 是根的孩子 → 单旋`, `zig: rotate ${nodes[u].val} to root`);
      break;
    }
    const pIsLeft = nodes[gp].left === p;
    if (uIsLeft === pIsLeft) {
      // zig-zig：同侧 → 先旋父再旋 x
      root = pIsLeft ? rotR(nodes, root, gp) : rotL(nodes, root, gp);
      root = pIsLeft ? rotR(nodes, root, p) : rotL(nodes, root, p);
      snap(1, u, `zig-zig：$x=${nodes[u].val}$ 与父同侧 → 双旋（先父后 $x$）`, `zig-zig: ${nodes[u].val}`);
    } else {
      // zig-zag：异侧 → 先旋 x 再旋父
      root = uIsLeft ? rotR(nodes, root, p) : rotL(nodes, root, p);
      root = pIsLeft ? rotL(nodes, root, gp) : rotR(nodes, root, gp);
      snap(2, u, `zig-zag：$x=${nodes[u].val}$ 与父异侧 → 双旋（先 $x$ 后父）`, `zig-zag: ${nodes[u].val}`);
    }
  }
  return root;
}

/** 物理删除节点 d（紧凑 id 重编号），返回新数组 + 新根 */
function removeNode(
  nodes: BinNode[],
  root: number,
  d: number,
): { nodes: BinNode[]; root: number } {
  const out: BinNode[] = [];
  const map = new Map<number, number>();
  for (const n of nodes)
    if (n.id !== d) {
      map.set(n.id, out.length);
      out.push({ ...n, id: out.length });
    }
  for (const o of out) {
    o.left = o.left === null ? null : map.get(o.left) ?? null;
    o.right = o.right === null ? null : map.get(o.right) ?? null;
  }
  let newRoot = root === d ? 0 : map.get(root) ?? 0;
  if (out.length === 0) newRoot = 0;
  return { nodes: out, root: newRoot };
}

/** 插入序列建伸展树：每个值 BST 插入 → splay 到根（热点上浮）；节点 id = 插入顺序 */
export function splayInsertSteps(values: number[]): BstStep[] {
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
    steps.push(snap(0, null, `插入 $x=${x}$`, `insert ${x}`));
    if (nodes.length === 0) {
      nodes.push({ id: 0, val: x, left: null, right: null });
      steps.push(snap(3, 0, `根 = ${x}（热点即根）`, `root ${x}`));
      continue;
    }
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
    steps.push(snap(1, inserted, `挂 $z=${x}$ → $splay(z)$`, `attach ${x}, splay`));
    root = splayUp(nodes, root, inserted, (l, f, z, e) => steps.push(snap(l, f, z, e)));
    steps.push(snap(2, root, `$z=${x}$ 成为根（热点上浮）`, `${x} is root`));
  }
  steps.push(
    snap(3, null, `完成：$n = ${nodes.length}$ · 中序 $[${inorderOf(nodes).join(", ")}]$`, `done: n=${nodes.length}`),
  );
  return steps;
}

/** 查找：BST 下探 + 命中点（未命中则最后访问点）splay 到根 */
export function splaySearchOnTree(
  nodes0: BinNode[],
  root0: number,
  target: number,
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
  if (nodes.length === 0)
    return { steps: [snap(0, null, "空树", "empty")], result: { nodes, root } };
  steps.push(snap(0, null, `找 $x=${target}$ → 命中点将 splay 到根`, `search ${target}`));
  let p: number | null = root;
  let last: number | null = null;
  while (p !== null) {
    steps.push(snap(1, p, `下探：$p=${nodes[p].val}$`, `p=${nodes[p].val}`));
    last = p;
    if (nodes[p].val === target) break;
    if (target < nodes[p].val) p = nodes[p].left;
    else p = nodes[p].right;
  }
  const hot = last;
  if (p === null)
    steps.push(snap(1, hot, `$x=${target}$ 未找到 → splay 最后访问点 ${nodes[hot as number].val}`, `not found, splay last`));
  else steps.push(snap(1, p, `$x=${target}$ 命中 ${nodes[p].val}`, `hit ${nodes[p].val}`));
  if (hot !== null) {
    root = splayUp(nodes, root, hot, (l, f, z, e) => steps.push(snap(l, f, z, e)));
    steps.push(snap(3, root, `热点 ${nodes[root].val} 到根`, `${nodes[root].val} at root`));
  }
  steps.push(snap(3, null, `完成：查找 ${p === null ? `未命中 ${target}` : `命中 ${target}`} · 树已重排`, `done`));
  return { steps, result: { nodes, root } };
}

/** 插入：向现有树插 x 并 splay 到根 */
export function splayInsertOne(
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
    steps.push(snap(2, null, `完成`, `done`));
    return { steps, result: { nodes, root: 0 } };
  }
  steps.push(snap(0, null, `插入 $x=${x}$`, `insert ${x}`));
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
  steps.push(snap(1, inserted, `挂 $z=${x}$ → $splay(z)$`, `attach ${x}, splay`));
  root = splayUp(nodes, root, inserted, (l, f, z, e) => steps.push(snap(l, f, z, e)));
  steps.push(snap(2, root, `$z=${x}$ 成为根`, `${x} is root`));
  steps.push(snap(2, null, `完成`, `done`));
  return { steps, result: { nodes, root } };
}

/** 删除：splay 目标到根 → 摘根 → 左子树最大者 splay 为新根、右接右子树 */
export function splayDeleteOnTree(
  nodes0: BinNode[],
  root0: number,
  target: number,
): { steps: BstStep[]; result: TreeSnap } {
  let nodes = nodes0.map((n) => ({ ...n }));
  let root = root0;
  const steps: BstStep[] = [];
  const before = nodes.map((n) => ({ ...n }));
  const S = (id: number | null) => (id === null ? "∅" : String(before[id]?.val ?? id));
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
    steps.push(snap(0, null, "空树：无目标可删", "empty"));
    return { steps, result: { nodes, root } };
  }
  // 定位（在 before 上走，避免 splay 过程中结构变化影响定位）
  let cur: number | null = root;
  let par: number | null = null;
  const locate = (): boolean => {
    while (cur !== null) {
      steps.push(snap(0, cur, `定位 $p=${S(cur)}$（删 $x=${target}$）`, `locate ${S(cur)}`));
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
    // 未找到：splay 最后访问的节点（热点上浮并保持树结构合法）
    if (par !== null) {
      steps.push(snap(1, null, `$x=${target}$ 不存在 → splay ${S(par)}`, `not found, splay last`));
      root = splayUp(nodes, root, par, (l, f, z, e) => steps.push(snap(l, f, z, e)));
    }
    steps.push(snap(4, null, `完成：$x=${target}$ 未删除`, `done: not deleted`));
    return { steps, result: { nodes, root } };
  }
  const z = cur as number;
  // splay 目标到根
  steps.push(snap(1, z, `$splay(${S(z)})$ → 目标到根`, `splay ${S(z)} to root`));
  root = splayUp(nodes, root, z, (l, f, zz, e) => steps.push(snap(l, f, zz, e)));
  const zId = root; // splay 后根 = z
  const zl = nodes[zId].left,
    zr = nodes[zId].right;
  steps.push(
    snap(2, zId, `摘根 ${S(zId)}：$T_L=${zl === null ? "∅" : "…"}$、$T_R=${zr === null ? "∅" : "…"}$`, `remove root ${S(zId)}`),
  );
  const removed = removeNode(nodes, root, zId);
  nodes = removed.nodes;
  if (nodes.length === 0) {
    steps.push(snap(4, null, "完成：树已空", "done: empty"));
    return { steps, result: { nodes, root: 0 } };
  }
  // 删除 z 后 id 重编号：原 id > zId 的节点 id 减 1
  const remap = (id: number) => (id > zId ? id - 1 : id);
  if (zl === null) {
    // 左子树空 → 只剩右子树，新根 = 唯一无父节点（重编号后的右子树根）
    const parR = binParents(nodes);
    let rr = 0;
    for (let i = 0; i < nodes.length; i++)
      if (parR[i] === -1) {
        rr = i;
        break;
      }
    root = rr;
    steps.push(snap(4, root, `新根 = 右子树根 ${nodes[root].val}`, `new root ${nodes[root].val}`));
    return { steps, result: { nodes, root } };
  }
  // 左子树非空：找左子树最大者 m（m 无右子），把 m 伸展到左子树根后右接 T_R
  let m = remap(zl);
  while (nodes[m].right !== null) m = nodes[m].right as number;
  steps.push(
    snap(4, m, `$m \\gets max(T_L)=${nodes[m].val}$ → $splay(m)$`, `m = max(left) = ${nodes[m].val}`),
  );
  // splayUp 只会在左子树内部旋转（右子树与 m 不连通），m 最终成为左子树根（无父）
  splayUp(nodes, m, m, (l, f, zz, e) => steps.push(snap(l, f, zz, e)));
  const zrNow = zr === null ? null : remap(zr);
  nodes[m].right = zrNow;
  root = m; // m 现在无父 → 整体根
  steps.push(
    snap(4, root, `完成：新根 ${nodes[root].val} 右接 $T_R$ · 中序 $[${inorderOf(nodes).join(", ")}]$`, `done: root ${nodes[root].val}`),
  );
  return { steps, result: { nodes, root } };
}

/** 中序遍历（完成帧） */
function inorderOf(nodes: BinNode[]): number[] {
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

/** 复用 BST 查找不满足 Splay 语义（需要 splay 重排） —— 仅作类型占位标记，模块内不使用 */
export const splaySearchSteps = bstSearchOnTree;