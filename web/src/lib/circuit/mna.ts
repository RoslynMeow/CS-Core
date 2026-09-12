/**
 * 电路通用库 · 改进节点法求解器（Modified Nodal Analysis, MNA）
 * ==========================================================
 * 未知量 x = [各非地节点电压, 各电压支路电流]；
 *   G·v + B·j = i_s   （KCL 行）
 *   C·v       = e_s   （电压约束行, 如 V 源 v_a−v_b=V、L 的直流短路 v_a−v_b=0）
 * 独立源、线性电阻在 DC 下都是线性方程, 一次高斯消元即得精确解。
 * 非线性元件（二极管/BJT/MOS）留待后续在此叠牛顿迭代 + 伴随模型。
 *
 * MVP 支持：R / V / I；C 在 DC 视为开路（无支路），L 在 DC 视为短路（0V 电压支路）。
 */

import type { Circuit, Component, NodeId } from './netlist';

export interface DCResult {
  /** 节点电压（含地 = 0） */
  nodeVoltages: Record<NodeId, number>;
  /** 各元件电流，正方向为元件 a→b（V 源为其内部 a→b 的支路电流） */
  elementCurrents: Record<string, number>;
  /** 非地节点顺序（便于面板稳定排序） */
  nodeOrder: NodeId[];
}

/** 是否参与电流求解的电压支路：V 源 + L（直流短路） */
function isVBranch(c: Component): boolean {
  return c.kind === 'V' || c.kind === 'L';
}

/** 在导纳矩阵对角/交叉处叠加电导（自动跳过地节点） */
function stampConductance(
  A: number[][],
  ia: number,
  ib: number,
  g: number,
): void {
  if (ia >= 0) A[ia][ia] += g;
  if (ib >= 0) A[ib][ib] += g;
  if (ia >= 0 && ib >= 0) {
    A[ia][ib] -= g;
    A[ib][ia] -= g;
  }
}

/** 高斯消元（部分主元）。奇异 → 悬空节点/矛盾约束。 */
export function solveLinear(Ain: number[][], bin: number[]): number[] {
  const n = bin.length;
  const A = Ain.map((row) => row.slice());
  const b = bin.slice();
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    if (Math.abs(A[piv][col]) < 1e-12) {
      throw new Error('电路无解或存在悬空节点（DC 下该节点无直流通路）');
    }
    if (piv !== col) {
      const tr = A[piv]; A[piv] = A[col]; A[col] = tr;
      const tb = b[piv]; b[piv] = b[col]; b[col] = tb;
    }
    const d = A[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / d;
      if (f === 0) continue;
      for (let cc = col; cc < n; cc++) A[r][cc] -= f * A[col][cc];
      b[r] -= f * b[col];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let cc = r + 1; cc < n; cc++) s -= A[r][cc] * x[cc];
    x[r] = s / A[r][r];
  }
  return x;
}

/** 直流工作点分析 */
export function solveDC(circuit: Circuit): DCResult {
  const ground = circuit.ground ?? 'gnd';
  // 理想电源轨 → 对地理想电压源（仅求解用）
  const comps: Component[] = [
    ...circuit.components,
    ...(circuit.rails ?? []).map((r, i) => ({
      id: `__rail${i}`, kind: 'V' as const, a: r.net, b: ground, v: r.v,
    })),
  ];
  const nodes = new Set<NodeId>([ground]);
  for (const c of comps) {
    nodes.add(c.a);
    nodes.add(c.b);
    if (c.kind === 'M') nodes.add(c.g);
    if (c.kind === 'Q') nodes.add(c.base);
  }
  const nodeOrder = [...nodes].filter((n) => n !== ground).sort();
  const idx = new Map<NodeId, number>();
  nodeOrder.forEach((n, i) => idx.set(n, i));
  const gi = (n: NodeId): number => (n === ground ? -1 : (idx.get(n) as number));

  const vBranches = comps.filter(isVBranch);
  const n = nodeOrder.length;
  const m = vBranches.length;
  const size = n + m;

  const A: number[][] = Array.from({ length: size }, () =>
    new Array<number>(size).fill(0),
  );
  const z = new Array<number>(size).fill(0);

  for (const c of comps) {
    if (c.kind === 'R') {
      stampConductance(A, gi(c.a), gi(c.b), 1 / c.r);
    } else if (c.kind === 'C') {
      // DC 开路：无贡献
    } else if (c.kind === 'I') {
      // 电流源内部 a→b：从 a 抽出、注入 b
      const ia = gi(c.a);
      const ib = gi(c.b);
      if (ia >= 0) z[ia] -= c.i;
      if (ib >= 0) z[ib] += c.i;
    } else if (c.kind === 'M') {
      // 开关级：导通→源漏间一个小电阻；截止→开路。栅极绝缘，无电流。
      if (c.on) stampConductance(A, gi(c.a), gi(c.b), 1 / (c.ron ?? 5));
    } else if (c.kind === 'D') {
      // 二极管：正向导通→小电阻；反向/截止→开路
      if (c.on) stampConductance(A, gi(c.a), gi(c.b), 1 / (c.ron ?? 10));
    } else if (c.kind === 'Q') {
      // 三极管：饱和导通→c-e 小电阻 + b-e 小电阻；截止→全断
      if (c.on) {
        stampConductance(A, gi(c.a), gi(c.b), 1 / (c.ron ?? 5));
        stampConductance(A, gi(c.base), gi(c.b), 1 / (c.rbe ?? 100));
      }
    }
  }

  vBranches.forEach((c, k) => {
    const row = n + k;
    const ia = gi(c.a);
    const ib = gi(c.b);
    if (ia >= 0) { A[ia][row] += 1; A[row][ia] += 1; }
    if (ib >= 0) { A[ib][row] -= 1; A[row][ib] -= 1; }
    z[row] = c.kind === 'V' ? c.v : 0;
  });

  // 纯 MOS 内部节点(如 NAND 串联中点)在管子全截止时会悬空 → 加极小对地电导防奇异。
  // 只对「仅由 MOS 源漏构成、又无其他直流通路」的节点加，不影响普通悬空节点报错。
  const mosNodes = new Set<NodeId>();
  const otherNodes = new Set<NodeId>([ground]);
  for (const c of comps) {
    if (c.kind === 'M') { mosNodes.add(c.a); mosNodes.add(c.b); }
    else if (c.kind === 'D') { mosNodes.add(c.a); mosNodes.add(c.b); }
    else if (c.kind === 'Q') { mosNodes.add(c.a); mosNodes.add(c.b); mosNodes.add(c.base); }
    else { otherNodes.add(c.a); otherNodes.add(c.b); }
  }
  for (const r of circuit.rails ?? []) otherNodes.add(r.net);
  for (const nd of mosNodes) {
    if (otherNodes.has(nd)) continue;
    const i = gi(nd);
    if (i >= 0) A[i][i] += 1e-9;
  }

  const x = solveLinear(A, z);
  const nodeVoltages: Record<NodeId, number> = { [ground]: 0 };
  nodeOrder.forEach((nd, i) => { nodeVoltages[nd] = x[i]; });

  const branchCurrent = new Map<string, number>();
  vBranches.forEach((c, k) => branchCurrent.set(c.id, x[n + k]));

  const elementCurrents: Record<string, number> = {};
  for (const c of circuit.components) {
    const va = nodeVoltages[c.a] ?? 0;
    const vb = nodeVoltages[c.b] ?? 0;
    switch (c.kind) {
      case 'R': elementCurrents[c.id] = (va - vb) / c.r; break;
      case 'V':
      case 'L': elementCurrents[c.id] = branchCurrent.get(c.id) ?? 0; break;
      case 'I': elementCurrents[c.id] = c.i; break;
      case 'C': elementCurrents[c.id] = 0; break; // DC 开路
      case 'M': elementCurrents[c.id] = c.on ? (va - vb) / (c.ron ?? 5) : 0; break;
      case 'D': elementCurrents[c.id] = c.on ? (va - vb) / (c.ron ?? 10) : 0; break;
      case 'Q': elementCurrents[c.id] = c.on ? (va - vb) / (c.ron ?? 5) : 0; break;
    }
  }

  return { nodeVoltages, elementCurrents, nodeOrder };
}
