/**
 * 数字逻辑库 · 层级展平
 * ====================
 * 把自底向上的子电路（BlockInst → DigDef）递归展开成纯门 + 输入/输出的扁平网表，
 * 供事件仿真使用。节点命名空间化：实例 U1 内部网 n1 → "U1/n1"；子电路端口按
 * connections 接到父层网表。展平只用于「求解」，画布仍按层级逐层展示（下钻）。
 */

import type { DigCircuit, DigDef, DigInput, DigOutput, GateInst } from './types';

export interface FlatCircuit {
  inputs: DigInput[];
  outputs: DigOutput[];
  gates: GateInst[];
}

export function flatten(top: DigCircuit, defs: DigDef[]): FlatCircuit {
  const defMap = new Map(defs.map((d) => [d.id, d]));
  const out: FlatCircuit = { inputs: [], outputs: [], gates: [] };

  const expand = (circuit: DigCircuit, prefix: string, portMap: Map<string, string> | null) => {
    const mapNet = (n: string): string => portMap?.get(n) ?? prefix + n;
    // 只有顶层电路的输入/输出端子才是真正的驱动/观测点；
    // 子电路内部的端口端子只是边界网，由父层驱动（否则会与父层输入冲突成 X）。
    if (portMap === null) {
      for (const inp of circuit.inputs) out.inputs.push({ ...inp, net: mapNet(inp.net) });
      for (const o of circuit.outputs) out.outputs.push({ ...o, net: mapNet(o.net) });
    }
    for (const g of circuit.gates) {
      out.gates.push({
        ...g,
        id: prefix + g.id,
        inputs: g.inputs.map(mapNet),
        output: mapNet(g.output),
      });
    }
    for (const b of circuit.blocks) {
      const def = defMap.get(b.defId);
      if (!def) continue;
      const childMap = new Map<string, string>();
      for (const p of def.ports) {
        const parentNet = b.connections[p.name];
        if (parentNet !== undefined) childMap.set(p.name, mapNet(parentNet));
      }
      expand(def.circuit, `${prefix}${b.id}/`, childMap);
    }
  };

  expand(top, '', null);
  return out;
}
