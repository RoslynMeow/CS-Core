import type { Text } from "../i18n/lang";
import type { BinNode, BstStep, TreeSnap } from "./graph";
import { bstSearchOnTree } from "./graph";

// ============================================================
// P3.5：红黑树（Red-Black Tree）
// 结构与 BST/AVL 完全一致（BinNode 数组 + 紧凑 id），颜色存放在 n.red
// （true=红，false/缺省=黑；NIL 子节点 = null = 黑）。
// 建树/查询/插入/删除全部按 CLRS RB-INSERT / RB-DELETE 逐 case 出帧。
// ============================================================

/** 红黑树节点：BinNode + red（true=红，false/缺省=黑） */
export type RBNode = BinNode;

/** RB 插入伪代码（build/insert 共用；行 0 为新值宣布、行 7 为完成，与 buildDualFrames 约定一致）
 *  正文仅含伪代码结构词与 $数学$，中文说明均在 // 注释后 */
export const RB_INSERT_CODE: Text[] = [
  { zh: "new $z$; $z.c \\gets RED$  // 新节点染红", en: "new $z$; $z.c \\gets RED$  // new node, red" },
  { zh: "$y \\gets NIL$; $x \\gets root$  // 定位空位", en: "$y \\gets NIL$; $x \\gets root$  // locate" },
  { zh: "while $x \\neq NIL$: $y \\gets x$, $x \\gets$ child  // 左/右下探", en: "while $x \\neq NIL$: $y \\gets x$, descend  // left/right" },
  { zh: "$z.p \\gets y$; attach $z$  // 空位挂入", en: "$z.p \\gets y$; attach $z$" },
  { zh: "while $z.p.c = RED$:  // 红红冲突", en: "while $z.p.c = RED$:  // red-red conflict" },
  { zh: "if $u = uncle(z)$ RED: $p,u \\gets BLACK$; $g \\gets RED$; $z \\gets g$  // case1 叔红", en: "if uncle $u$ RED: $p,u \\gets BLACK$; $g \\gets RED$; $z \\gets g$  // case1" },
  { zh: "elif $z$ inner: $rotate(p)$  // case2 内侧旋父", en: "elif $z$ is inner: $rotate(p)$  // case2" },
  { zh: "else: $p \\gets BLACK$; $g \\gets RED$; $rotate(g)$  // case3 外侧旋爷", en: "else: $p \\gets BLACK$; $g \\gets RED$; $rotate(g)$  // case3" },
  { zh: "$root.c \\gets BLACK$  // 根恒黑 · 完成", en: "$root.c \\gets BLACK$  // done" },
];

/** RB 删除伪代码（全量的删黑修复 case1-4）；正文仅数学 + 伪代码结构词，中文在 // 后 */
export const RB_DELETE_CODE: Text[] = [
  { zh: "locate $z$; $y \\gets z$; $y.orig \\gets y.color$  // 定位 $z$ 并记录", en: "locate $z$; $y \\gets z$; record $y.color$" },
  { zh: "if $z$ child $\\leq 1$: $x \\gets$ child $\\vee$ NIL; $transplant(z, x)$  // 至多一子", en: "if $\\leq 1$ child: $x \\gets$ child or NIL, $transplant(z,x)$" },
  { zh: "else: $y \\gets min(z.R)$; $y.orig \\gets y.color$; $x \\gets y.R$  // 双子找后继", en: "else: $y \\gets$ min of right subtree, $x \\gets y.R$" },
  { zh: "$transplant(y,x)$; $transplant(z,y)$; $y.color \\gets z.color$  // 后继顶替", en: "$transplant(y,x)$; $transplant(z,y)$; $y.color \\gets z.color$" },
  { zh: "if $y.orig = BLACK$: $fixup(x)$  // 删黑 → 双黑补救", en: "if $y.c$ was BLACK: $fixup(x)$  // double-black" },
  { zh: "while $x \\neq root \\wedge x = BLACK$:  // 双黑上升", en: "while $x \\neq root \\wedge x$ is BLACK $\\uparrow$  // double-black" },
  { zh: "case1 $w = sib(x)$ RED: $w \\gets BLACK$; $p \\gets RED$; $rotate(p)$; $w \\gets$ new  // 兄红旋父", en: "case1 $w$ RED: recolor + rotate parent" },
  { zh: "case2 $w$ BLACK $\\wedge$ children BLACK: $w \\gets RED$; $x \\gets x.p$  // 双子黑上移", en: "case2 sibling's children BLACK: $w$ RED, double-black moves up" },
  { zh: "case3 near child RED: $near \\gets BLACK$; $w \\gets RED$; $rotate(w)$; $w \\gets$ new  // 旋兄", en: "case3 near child RED / far BLACK: recolor + rotate sibling" },
  { zh: "case4 far child RED: $w.color \\gets p.color$; $p \\gets BLACK$; $far \\gets BLACK$; $rotate(p)$; $x \\gets root$  // 旋父消双黑", en: "case4 far child RED: recolor + rotate parent, $x \\gets root$" },
  { zh: "$x.c \\gets BLACK$; $root.c \\gets BLACK$  // 完成", en: "$x.c \\gets BLACK$; done" },
];

function binParents(nodes: BinNode[]): number[] {
  const par = Array(nodes.length).fill(-1);
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].left !== null) par[nodes[i].left!] = i;
    if (nodes[i].right !== null) par[nodes[i].right!] = i;
  }
  return par;
}

function isRed(nodes: BinNode[], u: number | null): boolean {
  return u !== null && nodes[u].red === true;
}

/** 左旋：以 y 为轴右孩子 x 上提；返回旋转后的子树根 */
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
/** 右旋：以 y 为轴左孩子 x 上提 */
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

/** 物理删除节点 d 并重新编号（紧凑 id，父 id < 子 id），返回新数组 + 新根 */
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

/** 插入序列建红黑树（逐帧含变色 + 旋转）；节点 id = 插入顺序，与 bstFromValues 一致 */
export function rbInsertSteps(values: number[]): BstStep[] {
  const nodes: BinNode[] = [];
  let root = 0;
  const steps: BstStep[] = [];
  const S = (id: number | null) => (id === null ? "∅" : String(nodes[id].val));
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
    steps.push(snap(0, null, `插入 $x=${x}$（红）`, `insert ${x} (red)`));
    if (nodes.length === 0) {
      nodes.push({ id: 0, val: x, left: null, right: null, red: false });
      steps.push(snap(7, 0, `根 = ${x}（黑）`, `root ${x} (black)`));
      continue;
    }
    // BST 定位空位（从当前 root 出发）
    let p = root;
    while (true) {
      steps.push(snap(1, p, `下探：$x=${x}$ vs $p=${nodes[p].val}$`, `x=${x} vs p=${nodes[p].val}`));
      const cur = nodes[p];
      if (x < cur.val) {
        if (cur.left === null) {
          cur.left = nodes.length;
          nodes.push({ id: nodes.length, val: x, left: null, right: null, red: true });
          p = nodes.length - 1;
          break;
        }
        p = cur.left;
      } else {
        if (cur.right === null) {
          cur.right = nodes.length;
          nodes.push({ id: nodes.length, val: x, left: null, right: null, red: true });
          p = nodes.length - 1;
          break;
        }
        p = cur.right;
      }
    }
    const inserted = p;
    steps.push(snap(3, inserted, `挂 $z=${x}$（RED）到空位`, `attach ${x} (red)`));
    // RB-INSERT-FIXUP：红红冲突沿父链向上修
    let z = inserted;
    while (true) {
      const par = binParents(nodes);
      const pz = par[z];
      if (pz === -1 || !isRed(nodes, pz)) break; // 父黑/根 → 无事
      const gp = par[pz];
      const pIsLeft = nodes[gp].left === pz;
      const u = pIsLeft ? nodes[gp].right : nodes[gp].left;
      if (isRed(nodes, u)) {
        // case1：叔红 → 父/叔黑、爷红，z 上移两代
        nodes[pz].red = false;
        if (u !== null) nodes[u].red = false;
        nodes[gp].red = true;
        steps.push(snap(5, gp, `case1：叔 ${S(u)} 红 → 父/叔黑、爷红，$z\\gets$ 爷=${S(gp)}`, `case1: uncle red`));
        z = gp;
        continue;
      }
      // 叔黑/无 → case2 + case3
      if (pIsLeft ? nodes[pz].right === z : nodes[pz].left === z) {
        // case2：z 是内侧 → 绕父旋转，使 z 变外侧
        root = pIsLeft ? rotL(nodes, root, pz) : rotR(nodes, root, pz);
        steps.push(snap(6, pz, `case2：$z$ 内侧 → 旋父 ${S(pz)} 使 $z$ 变外侧`, `case2: inner → rotate parent`));
        // 旋转后 z 不再沿原变量追踪：重新定位 z（现为旋转轴的旧父）→ 父链已变，重跑一次循环头
        z = pz;
        const par2 = binParents(nodes);
        const p2 = par2[z];
        if (p2 === -1 || !isRed(nodes, p2)) break;
        const gp2 = par2[p2];
        nodes[p2].red = false;
        nodes[gp2].red = true;
        root = pIsLeft ? rotR(nodes, root, gp2) : rotL(nodes, root, gp2);
        steps.push(snap(7, gp2, `case3：$z$ 外侧 → 父黑、爷红、旋爷 ${S(gp2)}`, `case3: outer → rotate gp`));
        break;
      }
      // z 已是外侧 → 直接 case3
      nodes[pz].red = false;
      nodes[gp].red = true;
      root = pIsLeft ? rotR(nodes, root, gp) : rotL(nodes, root, gp);
      steps.push(snap(7, gp, `case3：$z$ 外侧 → 父黑、爷红、旋爷 ${S(gp)}`, `case3: outer → rotate gp`));
      break;
    }
    // 根恒黑
    const parB = binParents(nodes);
    let rr = -1;
    for (let i = 0; i < nodes.length; i++)
      if (parB[i] === -1) {
        rr = i;
        break;
      }
    if (rr >= 0) nodes[rr].red = false;
    root = rr >= 0 ? rr : root;
    steps.push(snap(7, root, `$root.c \\gets BLACK$（当前根 ${S(root)}）`, `root → black`));
  }
  steps.push(
    snap(7, null, `完成：红黑中序 $[${nodes.map((n) => n.val).sort((a, b) => a - b).join(", ")}]$`, `done: RB inorder ${inorderOf(nodes).join(", ")}`),
  );
  return steps;
}

/** 红黑真·插入：向现有树插 x 并沿父链变色/旋转修复，返回动画 + 结果树 */
export function rbInsertOne(
  nodes0: BinNode[],
  root0: number,
  x: number,
): { steps: BstStep[]; result: TreeSnap } {
  const nodes = nodes0.map((n) => ({ ...n }));
  let root = root0;
  const steps: BstStep[] = [];
  const S = (id: number | null) => (id === null ? "∅" : String(nodes[id].val));
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
    nodes.push({ id: 0, val: x, left: null, right: null, red: false });
    steps.push(snap(0, null, `插入 $x=${x}$ → 根（黑）`, `root ${x} (black)`));
    steps.push(snap(7, null, `完成：红黑中序 $[${x}]$`, `done`));
    return { steps, result: { nodes, root: 0 } };
  }
  steps.push(snap(0, null, `插入 $x=${x}$（红）`, `insert ${x} (red)`));
  let p = root;
  while (true) {
    steps.push(snap(1, p, `下探：$x=${x}$ vs $p=${nodes[p].val}$`, `x=${x} vs p=${nodes[p].val}`));
    const cur = nodes[p];
    if (x < cur.val) {
      if (cur.left === null) {
        cur.left = nodes.length;
        nodes.push({ id: nodes.length, val: x, left: null, right: null, red: true });
        p = nodes.length - 1;
        break;
      }
      p = cur.left;
    } else {
      if (cur.right === null) {
        cur.right = nodes.length;
        nodes.push({ id: nodes.length, val: x, left: null, right: null, red: true });
        p = nodes.length - 1;
        break;
      }
      p = cur.right;
    }
  }
  const inserted = p;
  steps.push(snap(3, inserted, `挂 $z=${x}$（RED）`, `attach ${x} (red)`));
  let z = inserted;
  while (true) {
    const par = binParents(nodes);
    const pz = par[z];
    if (pz === -1 || !isRed(nodes, pz)) break;
    const gp = par[pz];
    const pIsLeft = nodes[gp].left === pz;
    const u = pIsLeft ? nodes[gp].right : nodes[gp].left;
    if (isRed(nodes, u)) {
      nodes[pz].red = false;
      if (u !== null) nodes[u].red = false;
      nodes[gp].red = true;
      steps.push(snap(5, gp, `case1：叔 ${S(u)} 红 → 父/叔黑、爷红，$z\\gets$ 爷=${S(gp)}`, `case1`));
      z = gp;
      continue;
    }
    if (pIsLeft ? nodes[pz].right === z : nodes[pz].left === z) {
      root = pIsLeft ? rotL(nodes, root, pz) : rotR(nodes, root, pz);
      steps.push(snap(6, pz, `case2：$z$ 内侧 → 旋父 ${S(pz)}`, `case2`));
      z = pz;
      const par2 = binParents(nodes);
      const p2 = par2[z];
      if (p2 === -1 || !isRed(nodes, p2)) break;
      const gp2 = par2[p2];
      nodes[p2].red = false;
      nodes[gp2].red = true;
      root = pIsLeft ? rotR(nodes, root, gp2) : rotL(nodes, root, gp2);
      steps.push(snap(7, gp2, `case3：$z$ 外侧 → 父黑、爷红、旋爷 ${S(gp2)}`, `case3`));
      break;
    }
    nodes[pz].red = false;
    nodes[gp].red = true;
    root = pIsLeft ? rotR(nodes, root, gp) : rotL(nodes, root, gp);
    steps.push(snap(7, gp, `case3：$z$ 外侧 → 父黑、爷红、旋爷 ${S(gp)}`, `case3`));
    break;
  }
  const parB = binParents(nodes);
  let rr = -1;
  for (let i = 0; i < nodes.length; i++)
    if (parB[i] === -1) {
      rr = i;
      break;
    }
  if (rr >= 0) nodes[rr].red = false;
  root = rr >= 0 ? rr : root;
  steps.push(
    snap(7, null, `完成：红黑中序 $[${nodes.map((n) => n.val).sort((a, b) => a - b).join(", ")}]$`, `done`),
  );
  return { steps, result: { nodes, root } };
}

/** 红黑真·删除（CLRS 全量 case1-4）：删现有树中的 target，返回动画 + 结果树 */
export function rbDeleteOnTree(
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
  // RB-DELETE-FIXUP：x 可能为 null（NIL）→ 用 xPar/xSide 追踪其位置
  const fixup = (
    x: number | null,
    xPar: number | null,
    xSide: "l" | "r" | null,
  ): number => {
    while (true) {
      const isRootX = x !== null && x === root;
      if (isRootX || xSide === null) {
        if (x !== null) nodes[x].red = false;
        const parR = binParents(nodes);
        let rr = -1;
        for (let i = 0; i < nodes.length; i++)
          if (parR[i] === -1) {
            rr = i;
            break;
          }
        if (rr >= 0) nodes[rr].red = false;
        root = rr >= 0 ? rr : root;
        return root;
      }
      if (x !== null && isRed(nodes, x)) {
        nodes[x].red = false; // 红节点吸收双黑 → 结束
        break;
      }
      // x 是黑（含 NIL）：case 分析
      const p = xPar as number;
      const w = xSide === "l" ? nodes[p].right : nodes[p].left;
      if (isRed(nodes, w)) {
        // case1：兄红 → 父↔w 换色，旋父，w 更新为新兄弟
        nodes[w as number].red = false;
        nodes[p].red = true;
        root = xSide === "l" ? rotL(nodes, root, p) : rotR(nodes, root, p);
        steps.push(snap(7, p, `case1：兄 ${S(w)} 红 → 换色 + 旋父`, `case1: sibling red`));
        continue; // x 的父仍是 p（旋转以 p 为轴，x 位置不变）
      }
      const wl = w === null || w === undefined ? null : nodes[w].left;
      const wr = w === null || w === undefined ? null : nodes[w].right;
      const wlBlack = !isRed(nodes, wl);
      const wrBlack = !isRed(nodes, wr);
      if (wlBlack && wrBlack) {
        // case2：双子黑 → w 红、把双黑上移给父
        if (w !== null) nodes[w].red = true;
        steps.push(snap(8, w ?? p, `case2：兄 ${S(w)} 双子黑 → 兄红、双黑上移`, `case2`));
        if (p === root) {
          // 父是根 → 双黑落到根，黑高全局 -1，完成
          break;
        }
        x = p;
        const par = binParents(nodes);
        xPar = par[p];
        xSide = xPar === -1 ? null : nodes[xPar].left === p ? "l" : "r";
        continue;
      }
      const far = xSide === "l" ? wr : wl;
      if (far === null || !isRed(nodes, far)) {
        // case3：近子红、远子黑 → 换色 + 旋兄，w 更新
        const near = xSide === "l" ? wl : wr;
        if (near !== null) nodes[near].red = false;
        if (w !== null) nodes[w].red = true;
        root = xSide === "l" ? rotR(nodes, root, w as number) : rotL(nodes, root, w as number);
        steps.push(snap(9, w, `case3：兄 ${S(w)} 近子红 → 换色 + 旋兄`, `case3`));
        continue;
      }
      // case4：远子红 → w 取父色、父/远子黑、旋父、x→root
      if (w !== null) nodes[w].red = nodes[p].red === true;
      nodes[p].red = false;
      if (far !== null) nodes[far].red = false;
      root = xSide === "l" ? rotL(nodes, root, p) : rotR(nodes, root, p);
      steps.push(snap(10, p, `case4：兄 ${S(w)} 远子红 → 换色 + 旋父，双黑消除`, `case4`));
      x = root;
      xPar = null;
      xSide = null;
    }
    const parR = binParents(nodes);
    let rr = -1;
    for (let i = 0; i < nodes.length; i++)
      if (parR[i] === -1) {
        rr = i;
        break;
      }
    if (rr >= 0) nodes[rr].red = false;
    root = rr >= 0 ? rr : root;
    return root;
  };

  if (nodes.length === 0) {
    steps.push(snap(0, null, `空树：无 ${target} 可删`, `empty`));
    return { steps, result: { nodes, root } };
  }
  // 定位
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
    steps.push(snap(0, null, `$x=${target}$ 不存在（空位）`, `not found`));
    return { steps, result: { nodes, root } };
  }
  const z = cur as number;
  const zl = nodes[z].left,
    zr = nodes[z].right;
  const zIsLeft = par !== null && nodes[par].left === z;
  let yOrig = nodes[z].red === true;
  let x: number | null = null;
  let xPar: number | null = par;
  let xSide: "l" | "r" | null = zIsLeft ? "l" : "r";
  if (par === null) xSide = null;

  if (zl === null && zr === null) {
    // 叶子：直接摘除（transplant(z, NIL)）
    steps.push(snap(2, z, `$p=${S(z)}$ 无子女 → transplant(z, NIL)`, `leaf`));
    if (par === null) {
      // 删除根且树只剩一个节点
      nodes = [];
      root = 0;
      steps.push(snap(11, null, `完成：空树`, `done: empty`));
      return { steps, result: { nodes, root } };
    }
    if (zIsLeft) nodes[par as number].left = null;
    else nodes[par as number].right = null;
    xPar = par;
    xSide = zIsLeft ? "l" : "r";
  } else if (zl === null || zr === null) {
    // 一子：子顶替
    steps.push(snap(2, z, `$p=${S(z)}$ 仅一子 → 子顶替（transplant）`, `one child`));
    const ch = (zl === null ? zr : zl) as number;
    if (par === null) {
      root = ch;
      x = ch;
      xPar = null;
      xSide = null;
    } else {
      if (zIsLeft) nodes[par as number].left = ch;
      else nodes[par as number].right = ch;
      x = ch;
      xPar = par;
      xSide = zIsLeft ? "l" : "r";
    }
  } else {
    // 双子：y = 右子树最小；y 顶替 z（颜色跟随 z）
    let y = zr as number;
    let yPar = z;
    steps.push(snap(3, z, `$p=${S(z)}$ 双子 → $y \\gets$ 右子树最小`, `two children`));
    while (nodes[y].left !== null) {
      steps.push(snap(3, y, `找后继：$y=${S(y)}$（左走）`, `succ ${S(y)}`));
      yPar = y;
      y = nodes[y].left as number;
    }
    steps.push(snap(3, y, `后继 $y=${S(y)}$`, `successor ${S(y)}`));
    yOrig = nodes[y].red === true;
    x = nodes[y].right;
    if (yPar === z) {
      // y 是 z 的直接右子 → x 留在 y 右侧，y 顶替 z
      nodes[y].left = zl;
      xPar = y;
      xSide = "r";
    } else {
      // transplant(y, y.right)；再 transplant(z, y)
      nodes[yPar].left = x;
      nodes[y].right = zr;
      nodes[y].left = zl;
      xPar = yPar;
      xSide = "l";
    }
    nodes[y].red = nodes[z].red === true;
    if (par === null) {
      root = y;
    } else if (zIsLeft) nodes[par as number].left = y;
      else nodes[par as number].right = y;
  }

  // 物理删除 z（紧凑编号；双子/一子已把 z 摘离，孤儿节点不再被引用）
  if (x !== null || par !== null) {
    const removed = removeNode(nodes, root, z);
    nodes = removed.nodes;
    root = removed.root;
    if (x !== null) x = x > z ? x - 1 : x;
    if (xPar !== null) xPar = xPar > z ? xPar - 1 : xPar;
  }

  // 删的黑 → fixup
  if (yOrig === false && nodes.length > 0) {
    steps.push(snap(5, x ?? xPar, "删的是黑 → 双黑补救", "double-black fixup"));
    if (x === null) {
      // x=NIL：xPar/xSide 已有
      root = fixup(null, xPar, xSide);
    } else {
      const par2 = binParents(nodes);
      const px = par2[x];
      root = fixup(x, px === -1 ? null : px, px === -1 ? null : nodes[px].left === x ? "l" : "r");
    }
  } else {
    // 删的是红 → 不修复，仅确保根黑
    const parB = binParents(nodes);
    let rr = -1;
    for (let i = 0; i < nodes.length; i++)
      if (parB[i] === -1) {
        rr = i;
        break;
      }
    if (rr >= 0) nodes[rr].red = false;
    root = rr >= 0 ? rr : root;
  }
  steps.push(
    snap(11, null, `完成：红黑中序 $[${nodes.map((n) => n.val).sort((a, b) => a - b).join(", ") || "∅"}]$`, `done`),
  );
  return { steps, result: { nodes, root } };
}

/** 红黑查找：与 BST 完全相同（节点快照保留 red），直接复用 */
export function rbSearchOnTree(
  nodes: BinNode[],
  root: number,
  target: number,
): BstStep[] {
  return bstSearchOnTree(nodes, root, target);
}

/** 中序遍历值序列（完成帧展示；与 graph 内 inorderOf 等价但避免循环依赖） */
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

/** 红黑树黑高：bh(u) = u 为黑 +1 / 红 +0，NIL=0；两子树黑高相等（性质） */
export function rbBlackHeight(nodes: BinNode[], root: number): number[] {
  const bh = Array(nodes.length).fill(0);
  const post: number[] = [];
  const rec = (u: number | null) => {
    if (u === null) return;
    rec(nodes[u].left);
    rec(nodes[u].right);
    post.push(u);
  };
  if (nodes.length) rec(root);
  for (const u of post) {
    const lh = nodes[u].left === null ? 0 : bh[nodes[u].left];
    const rh = nodes[u].right === null ? 0 : bh[nodes[u].right];
    bh[u] = (nodes[u].red === true ? 0 : 1) + Math.max(lh, rh);
  }
  return bh;
}

/** 节点黑高标注（类似 AVL 的 bfAnn）：id → "bh=2" */
export function bhAnn(nodes: BinNode[]): Record<number, string> {
  let root = 0;
  const par = binParents(nodes);
  for (let i = 0; i < nodes.length; i++)
    if (par[i] === -1) {
      root = i;
      break;
    }
  const bh = rbBlackHeight(nodes, root);
  const ann: Record<number, string> = {};
  for (let i = 0; i < bh.length; i++) ann[i] = `bh=${bh[i]}`;
  return ann;
}