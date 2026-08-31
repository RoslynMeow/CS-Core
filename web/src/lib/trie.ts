import type { Text } from "../i18n/lang";

// ============================================================
// P3.7：字符树家族（字典树 Trie / 基数树 Radix / 后缀树 Suffix）
// 三者共用同一套“字符节点 + 边标签”表示，各自出帧：
//  - 字典树：节点=字符，边=扩展；词尾节点标记
//  - 基数树：单子路径压缩 → 边标签=子串（读边标即可还原路径）
//  - 后缀树：后缀字典树 → 压缩后缀树（$ 结束符），边标签=子串
// ============================================================

export type TrieNode = {
  id: number;
  /** 节点上的字符（根 = ""） */
  ch: string;
  /** 是否是一个词的结尾（字典树/后缀字典树语义） */
  isEnd: boolean;
  parent: number | null;
  /** 有序孩子（按字符，紧凑 id，id > 父 id） */
  children: Record<string, number>;
};

export type TrieSnapshot = {
  nodes: TrieNode[];
  root: number;
};

/** trie 动画步进：与 BstStep 结构对齐（模块组帧用） */
export type TrieStep = {
  line: number;
  nodes: TrieNode[]; // 当前快照（紧凑 id）
  visible: number; // 已插入的字符节点数（= nodes.length）
  root: number;
  focus: number | null; // 当前访问/插入的节点
  edge: [number, number] | null;
  msg: Text;
  /** 建词帧：本次新插入的字符节点 id（飞入高亮） */
  fresh?: number[];
};

export const TRIE_INSERT_CODE: Text[] = [
  { zh: "$p \\gets root$；$i \\gets 0$  // 逐字符下探", en: "$p \\gets root$; $i \\gets 0$  // walk chars" },
  { zh: "while $i < |w|$：$p \\gets p.child(w_i)$，无则新建", en: "while $i < |w|$: go to $child(w_i)$, create if missing" },
  { zh: "$p.end \\gets true$  // 标记完整词", en: "$p.end \\gets true$  // mark word end" },
];

export const TRIE_SEARCH_CODE: Text[] = [
  { zh: "$p \\gets root$；$i \\gets 0$  // 逐字符下探", en: "$p \\gets root$; $i \\gets 0$  // walk chars" },
  { zh: "while $i < |w|$：$p \\gets p.child(w_i)$（无 → 失败）", en: "while $i < |w|$: follow $child(w_i)$ (missing → fail)" },
  { zh: "return $p.end$  // 词尾才算命中（前缀不算）", en: "return $p.end$  // must be a word end (prefix alone fails)" },
];

export const TRIE_DELETE_CODE: Text[] = [
  { zh: "定位词尾 $p$（逐字符下探，无 → 失败）", en: "locate word end $p$ (walk chars, missing → fail)" },
  { zh: "while $p \\neq root$：删 $p$（无子·非他词尾）", en: "while $p \\neq root$: delete $p$ (no children · not other word end)" },
  { zh: "$end \\gets false$  // 只清标记", en: "$end \\gets false$  // clear flag only" },
];

export const RADIX_INSERT_CODE: Text[] = [
  { zh: "$p \\gets root$  // 沿边找最长前缀匹配", en: "$p \\gets root$  // longest prefix match" },
  { zh: "分裂边（新节点承接剩余子串）$\\to$ 插入", en: "split edge (new node takes the leftover) $\\to$ insert" },
  { zh: "合并无分支路径（压缩）", en: "compress single-child paths" },
];

function parents(nodes: TrieNode[]): number[] {
  const par = Array(nodes.length).fill(-1);
  nodes.forEach((n) => {
    if (n.parent !== null) par[n.id] = n.parent;
  });
  return par;
}

// ---------- 布局：字符树（多子节点水平扇出） ----------

/** 递归子树叶子数（决定水平宽度） */
function leafCount(nodes: TrieNode[], u: number): number {
  const ks = Object.keys(nodes[u].children);
  if (ks.length === 0) return 1;
  let c = 0;
  for (const k of ks) c += leafCount(nodes, nodes[u].children[k]);
  return c;
}

/** 字符树布局：根在左上，孩子按子树叶子数水平分配；返回 id → 坐标 */
export function trieLayout(
  nodes: TrieNode[],
  root: number,
  box: { x0: number; y0: number; w: number; h: number },
): { x: number; y: number }[] {
  const pos: { x: number; y: number }[] = nodes.map(() => ({ x: 0, y: 0 }));
  const depth = (u: number): number => {
    let d = 0;
    let v = u;
    while (nodes[v].parent !== null) {
      d++;
      v = nodes[v].parent!;
    }
    return d;
  };
  const maxDepth = nodes.reduce((m, n) => Math.max(m, depth(n.id)), 0);
  const stepY = Math.min(64, Math.max(38, box.h / Math.max(2, maxDepth + 1)));
  const leaves = nodes.reduce((m, n) => m + (Object.keys(n.children).length === 0 ? 1 : 0), 0);
  const unit = box.w / Math.max(1, leaves);
  // 递归分配 x 区间
  const alloc = (u: number, x0: number, x1: number): void => {
    const lc = leafCount(nodes, u);
    pos[u] = { x: (x0 + x1) / 2, y: box.y0 + depth(u) * stepY };
    if (lc <= 1) return;
    const ks = Object.keys(nodes[u].children);
    const total = ks.reduce((s, k) => s + leafCount(nodes, nodes[u].children[k]), 0);
    let cur = x0;
    for (const k of ks) {
      const c = nodes[u].children[k];
      const w = (leafCount(nodes, c) / total) * (x1 - x0);
      alloc(c, cur, cur + w);
      cur += w;
    }
  };
  if (nodes.length) alloc(root, box.x0, box.x0 + box.w);
  return pos;
}

// ---------- 字典树：建词 / 查找 / 真·插入 / 真·删除 ----------

/** 由词列表构建字典树帧序列（逐词逐字符） */
export function trieBuildSteps(words: string[]): TrieStep[] {
  const nodes: TrieNode[] = [{ id: 0, ch: "", isEnd: false, parent: null, children: {} }];
  const root = 0;
  const steps: TrieStep[] = [];
  const snap = (
    line: number,
    focus: number | null,
    edge: [number, number] | null,
    zh: string,
    en: string,
    fresh?: number[],
  ): TrieStep => {
    // 紧凑化 id（始终为 0..n-1，children 引用跟随）
    const map = new Map<number, number>();
    nodes.forEach((n, i) => map.set(n.id, i));
    const compact: TrieNode[] = nodes.map((n, i) => ({
      ...n,
      id: i,
      parent: n.parent === null ? null : map.get(n.parent!)!,
      children: Object.fromEntries(
        Object.entries(n.children).map(([k, v]) => [k, map.get(v)!]),
      ),
    }));
    return {
      line,
      nodes: compact,
      visible: compact.length,
      root,
      focus,
      edge,
      msg: { zh, en },
      ...(fresh ? { fresh } : {}),
    };
  };
  for (const w of words) {
    if (!w) continue;
    steps.push(snap(0, null, null, `插入词 “${w}”`, `insert "${w}"`));
    let p: number | null = root;
    const fresh: number[] = [];
    for (const ch of w) {
      const c: number | undefined = nodes[p!].children[ch];
      if (c === undefined) {
        const id = nodes.length;
        nodes.push({ id, ch, isEnd: false, parent: p!, children: {} });
        nodes[p!].children[ch] = id;
        fresh.push(id);
        p = id;
        steps.push(snap(1, p, [p, nodes[p].parent!], `新建字符 ${ch}（词 “${w}”）`, `create '${ch}'`, [...fresh]));
      } else {
        p = c;
        steps.push(snap(1, p!, [p!, nodes[p!].parent!], `已有字符 ${ch} → 继续`, `existing '${ch}'`, [...fresh]));
      }
    }
    if (p !== null) nodes[p!].isEnd = true;
    steps.push(snap(2, p, null, `“${w}” 词尾标记 ✓（紫色虚线环 = 选中查看）`, `"${w}" end ✓`, [...fresh]));
  }
  steps.push(
    snap(2, null, null, `完成：${words.length} 个词 · ${nodes.length - 1} 个字符节点`, `done: ${words.length} word(s), ${nodes.length - 1} char node(s)`),
  );
  return steps;
}

/** 查找词：逐字符下探；词尾命中 */
export function trieSearchSteps(
  nodes0: TrieNode[],
  root0: number,
  word: string,
): TrieStep[] {
  const nodes = nodes0.map((n) => ({ ...n, children: { ...n.children } }));
  const root = root0;
  const steps: TrieStep[] = [];
  const snap = (
    line: number,
    focus: number | null,
    edge: [number, number] | null,
    zh: string,
    en: string,
  ): TrieStep => ({
    line,
    nodes: nodes.map((n) => ({ ...n, children: { ...n.children } })),
    visible: nodes.length,
    root,
    focus,
    edge,
    msg: { zh, en },
  });
  steps.push(snap(0, null, null, `查词 “${word}” (${word.length} 字符)`, `search "${word}"`));
  let p: number | null = root;
  for (let i = 0; i < word.length; i++) {
    const c: number | undefined = nodes[p!].children[word[i]];
    if (c === undefined) {
      steps.push(snap(1, p, null, `第 ${i + 1} 字符 ${word[i]} 无此孩子 → 失败`, `no child '${word[i]}' → fail`));
      steps.push(snap(2, null, null, `“${word}” 不存在（路径中断）`, `"${word}" not found`));
      return steps;
    }
    p = c;
    steps.push(snap(1, p!, [p!, nodes[p!].parent!], `下探 ${word[i]} → ${word.slice(0, i + 1)}`, `walk '${word[i]}' → "${word.slice(0, i + 1)}"`));
  }
  if (nodes[p!].isEnd) {
    steps.push(snap(2, p, null, `“${word}” 命中（词尾 ✓）`, `"${word}" found`));
  } else {
    steps.push(snap(2, p, null, `“${word}” 是前缀，非完整词（无词尾标记）`, `"${word}" is a prefix, not a word`));
  }
  return steps;
}

/** 前缀补全：返回以 prefix 开头的所有完整词（用于右侧面板与自动补全演示） */
export function trieCompletions(nodes: TrieNode[], root: number, prefix: string): string[] {
  const out: string[] = [];
  let p: number | null = root;
  for (const ch of prefix) {
    p = nodes[p!].children[ch] ?? null;
    if (p === null) return out;
  }
  const walk = (u: number, s: string): void => {
    if (nodes[u].isEnd) out.push(s);
    for (const [k, v] of Object.entries(nodes[u].children).sort()) walk(v, s + k);
  };
  if (p !== null) walk(p, prefix);
  return out;
}

/** 真·插入：向现有 trie 插入一个词（可能新建路径节点），返回动画 + 新 trie */
export function trieInsertOne(
  nodes0: TrieNode[],
  root0: number,
  word: string,
): { steps: TrieStep[]; result: TrieSnapshot } {
  const nodes = nodes0.map((n) => ({ ...n, children: { ...n.children } }));
  const root = root0;
  const steps: TrieStep[] = [];
  const snap = (
    line: number,
    focus: number | null,
    edge: [number, number] | null,
    zh: string,
    en: string,
    fresh?: number[],
  ): TrieStep => ({
    line,
    nodes: nodes.map((n) => ({ ...n, children: { ...n.children } })),
    visible: nodes.length,
    root,
    focus,
    edge,
    msg: { zh, en },
    ...(fresh ? { fresh } : {}),
  });
  steps.push(snap(0, null, null, `插入词 “${word}”`, `insert "${word}"`));
  let p: number | null = root;
  const fresh: number[] = [];
  for (const ch of word) {
    const c: number | undefined = nodes[p!].children[ch];
    if (c === undefined) {
      const id = nodes.length;
      nodes.push({ id, ch, isEnd: false, parent: p!, children: {} });
      nodes[p!].children[ch] = id;
      fresh.push(id);
      p = id;
      steps.push(snap(1, p, [p, nodes[p].parent!], `新建字符 ${ch}`, `create '${ch}'`, [...fresh]));
    } else {
      p = c;
      steps.push(snap(1, p!, [p!, nodes[p!].parent!], `已有字符 ${ch} → 继续`, `existing '${ch}'`, [...fresh]));
    }
  }
  nodes[p!].isEnd = true;
  steps.push(snap(2, p, null, `“${word}” 词尾标记 ✓`, `"${word}" end ✓`, [...fresh]));
  steps.push(snap(2, null, null, `完成：新词 “${word}” 已插入`, `done: "${word}" inserted`));
  return { steps, result: { nodes, root } };
}

/** 真·删除：删词尾标记并向上回收无子非词尾节点，返回动画 + 新 trie */
export function trieDeleteOne(
  nodes0: TrieNode[],
  root0: number,
  word: string,
): { steps: TrieStep[]; result: TrieSnapshot } {
  let nodes = nodes0.map((n) => ({ ...n, children: { ...n.children } }));
  const root = root0;
  const steps: TrieStep[] = [];
  const snap = (
    line: number,
    focus: number | null,
    edge: [number, number] | null,
    zh: string,
    en: string,
  ): TrieStep => ({
    line,
    nodes: nodes.map((n) => ({ ...n, children: { ...n.children } })),
    visible: nodes.length,
    root,
    focus,
    edge,
    msg: { zh, en },
  });
  steps.push(snap(0, null, null, `删词 “${word}”`, `delete "${word}"`));
  let p: number | null = root;
  for (const ch of word) {
    p = nodes[p!].children[ch] ?? null;
    if (p === null) {
      steps.push(snap(1, null, null, `无此路径 → “${word}” 不存在`, `no such path → not found`));
      return { steps, result: { nodes, root } };
    }
    steps.push(snap(1, p, [p, nodes[p].parent!], `下探 ${ch}`, `walk '${ch}'`));
  }
  if (!nodes[p!].isEnd) {
    steps.push(snap(1, p, null, `“${word}” 是前缀非词 → 改词尾仅清标记？否，直接失败`, `prefix only → fail`));
    return { steps, result: { nodes, root } };
  }
  // 向上回收：无子 且 非其他词尾 的节点删除
  steps.push(snap(2, p, null, `清词尾 ✓ 并回收无分支路径`, `clear end ✓, reclaim`));
  const toRemove = new Set<number>();
  let u: number | null = p;
  while (u !== null && u !== root && Object.keys(nodes[u].children).length === 0) {
    toRemove.add(u);
    const par: number = nodes[u].parent!;
    delete nodes[par].children[nodes[u].ch];
    u = par;
  }
  if (toRemove.size > 0) {
    nodes = nodes.filter((n) => !toRemove.has(n.id)).map((n, i) => ({ ...n, id: i }));
    // 重映射孩子引用
    const map = new Map<number, number>();
    nodes.forEach((n, i) => map.set(n.id, i));
    nodes = nodes.map((n) => ({
      ...n,
      parent: n.parent === null ? null : map.get(n.parent!) ?? null,
      children: Object.fromEntries(
        Object.entries(n.children)
          .filter(([, v]) => map.has(v))
          .map(([k, v]) => [k, map.get(v)!]),
      ),
    }));
  }
  steps.push(snap(2, null, null, `完成：“${word}” 已删除`, `done: "${word}" deleted`));
  return { steps, result: { nodes, root } };
}

// ---------- 基数树（压缩字典树）：建树 / 插入 ----------

/** 单子节点 = 压缩候选（可合并到父边）；返回 id 列表 */
export function compressible(nodes: TrieNode[]): number[] {
  const out: number[] = [];
  for (const n of nodes)
    if (n.id !== 0 && Object.keys(n.children).length === 1 && !n.isEnd)
      out.push(n.id);
  return out;
}

/**
 * 把给定节点快照压缩成“边标签树”（基数树 / 后缀树表示）：
 * 每个节点保存到根的子串 label，边 = label；用于渲染“读边长即还原路径”。
 * 返回 { labels: 每节点完整前缀, 可压缩节点 } 供模块加帧。
 */
export function radixOf(nodes: TrieNode[], root: number): { label: string[] } {
  const label = Array(nodes.length).fill("");
  if (!nodes.length) return { label };
  const rec = (u: number, prefix: string) => {
    label[u] = prefix;
    for (const [k, v] of Object.entries(nodes[u].children).sort())
      rec(v, prefix + k);
  };
  rec(root, "");
  return { label };
}

/** 后缀字典树：把 s + "$" 的所有后缀插入 → 得到后缀字典树帧序列 */
export function suffixTrieBuildSteps(s: string): TrieStep[] {
  const t = s + "$";
  const suffixes: string[] = [];
  for (let i = 0; i < t.length; i++) suffixes.push(t.slice(i));
  return trieBuildSteps(suffixes);
}

/** 从后缀字典树快照生成“压缩后缀树”帧序列：单子节点合并（边标签 = 子串） */
export function suffixTreeFrames(
  nodes0: TrieNode[],
  root: number,
): { nodes: TrieNode[]; edgeLabels: Record<string, string> }[] {
  // 逐步压缩：每帧合并一批单子非词尾节点（子串并入父边），生成边标签
  const frames: { nodes: TrieNode[]; edgeLabels: Record<string, string> }[] = [];
  let nodes = nodes0.map((n) => ({ ...n, children: { ...n.children } }));
  const push = () => {
    const { label } = radixOf(nodes, root);
    const edgeLabels: Record<string, string> = {};
    for (const n of nodes) {
      if (n.parent !== null) {
        const p = nodes[n.parent];
        // 边标签 = 该节点相对父节点的整段子串（压缩后路径即标签）
        const from = label[p.id].length;
        edgeLabels[`${n.parent}-${n.id}`] = label[n.id].slice(from);
      }
    }
    frames.push({ nodes: nodes.map((n) => ({ ...n, children: { ...n.children } })), edgeLabels });
  };
  push();
  // 迭代压缩：合并 单子 · 非词尾 · 非根 的节点到父（该节点字符并入父的边标签）
  for (let iter = 0; iter < 30; iter++) {
    const cs = compressible(nodes);
    if (cs.length === 0) break;
    const target = cs[0];
    const tNode: TrieNode = nodes[target];
    const par: TrieNode = nodes[tNode.parent!];
    const [onlyCh, onlyId] = Object.entries(tNode.children)[0];
    // 孩子上提：改挂到 父 之名下（字符 = 父旧字符 + 该节点字符 + 孩子字符 → 合并进边标签）
    par.children[tNode.ch + onlyCh] = onlyId;
    nodes[onlyId].parent = par.id;
    delete par.children[tNode.ch];
    nodes = nodes.filter((n) => n.id !== target).map((n, i) => ({ ...n, id: i }));
    const map = new Map<number, number>();
    nodes.forEach((n, i) => map.set(n.id, i));
    nodes = nodes.map((n) => ({
      ...n,
      parent: n.parent === null ? null : map.get(n.parent!) ?? null,
      children: Object.fromEntries(
        Object.entries(n.children)
          .filter(([, v]) => map.has(v))
          .map(([k, v]) => [k, map.get(v)!]),
      ),
    }));
    push();
  }
  return frames;
}