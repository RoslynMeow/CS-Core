/**
 * 数字逻辑库 · 子电路自动布局
 * ==========================
 * 供「点开子电路」后没有手写布局时使用：按门的依赖列（拓扑层）从左到右排，
 * 输入在左、输出在右。（仅处理门；含子块的定义请用预置手写布局。）
 */

import type { DigCircuit, DigLayout } from './types';

export function autoLayout(circuit: DigCircuit): DigLayout {
  const colOf = new Map<string, number>();
  for (const i of circuit.inputs) colOf.set(i.net, 0);

  const gateCol = new Map<string, number>();
  for (let iter = 0; iter < 200; iter++) {
    let changed = false;
    for (const g of circuit.gates) {
      const c = Math.max(0, ...g.inputs.map((n) => colOf.get(n) ?? 0)) + 1;
      if (gateCol.get(g.id) !== c) {
        gateCol.set(g.id, c);
        colOf.set(g.output, c);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const maxCol = Math.max(0, ...colOf.values());
  const colX = (c: number) => 60 + c * 160;

  const inputs: DigLayout['inputs'] = {};
  circuit.inputs.forEach((i, idx) => { inputs[i.id] = { x: 40, y: 50 + idx * 70 }; });

  const gates: DigLayout['gates'] = {};
  const perCol = new Map<number, number>();
  for (const g of circuit.gates) {
    const c = gateCol.get(g.id) ?? 1;
    const idx = perCol.get(c) ?? 0;
    perCol.set(c, idx + 1);
    gates[g.id] = { x: colX(c) - 30, y: 40 + idx * 80 };
  }

  const outputs: DigLayout['outputs'] = {};
  circuit.outputs.forEach((o, idx) => {
    const c = (colOf.get(o.net) ?? maxCol) + 1;
    outputs[o.id] = { x: colX(c), y: 50 + idx * 70 };
  });

  const rows = Math.max(circuit.inputs.length, circuit.outputs.length, 2);
  return {
    width: colX(maxCol + 2),
    height: Math.max(220, 40 + rows * 70),
    inputs,
    gates,
    outputs,
    blocks: {},
  };
}
