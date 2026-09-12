/**
 * 数字逻辑库 · 标准库
 * ==================
 * - 数字层：DigPreset（门 + 子电路层级 + 布局 + 时间窗）。
 * - 电学层：基本门（NOT/NAND/NOR）的 CMOS 内部，用我们自己的电气库
 *   （lib/circuit：MOS + MNA）给出真实节点电压/电流，不依赖任何外部原理图库。
 *   复合门 AND/OR/XOR 用子电路定义（门级）搭建 → 下钻可见层级。
 */

import { T } from '../../i18n/lang';
import type { Component, Circuit, NodeId } from '../circuit/netlist';
import type { CircuitPreset, PresetLayout } from '../circuit/presets';
import type { DigDef, DigPreset, GateKind, LogicValue } from './types';

const VDD = 5;
const RLOAD = 10000;

/** 理想电源轨：VDD 与各逻辑输入（0/1 → 0/5V）。栅极作为电压轨也让节点不悬空。 */
function rails(inputs: { net: string; on: boolean }[] = []): { net: NodeId; v: number }[] {
  return [{ net: 'vdd', v: VDD }, ...inputs.map((i) => ({ net: i.net, v: i.on ? VDD : 0 }))];
}

function leafPreset(kind: string, circuit: Circuit, layout: PresetLayout): CircuitPreset {
  return {
    id: `leaf-${kind}`,
    title: T(`${kind} 内部`, `${kind} internals`),
    desc: T('0/1 逻辑输入 → MOS 导通/截止 → 电流方向。', 'Logic in, MOS switching, current out.'),
    circuit,
    layout,
  };
}

/** NOT：上拉 PMOS + 下拉 NMOS */
function notLeaf(a: LogicValue): CircuitPreset {
  const on1 = a === '1';
  const comps: Component[] = [
    { id: 'p', kind: 'M', channel: 'P', a: 'y', b: 'vdd', g: 'A', on: !on1, label: 'p' },
    { id: 'n', kind: 'M', channel: 'N', a: 'y', b: 'gnd', g: 'A', on: on1, label: 'n' },
    { id: 'RL', kind: 'R', a: 'y', b: 'gnd', r: RLOAD, label: 'RL' },
  ];
  const layout: PresetLayout = {
    width: 420, height: 460,
    nodes: {
      vdd: { x: 210, y: 50, vdd: true },
      y: { x: 210, y: 235, term: 'out', label: 'Y' },
      gnd: { x: 210, y: 420, gnd: true },
      A: { x: 60, y: 235, term: 'in', label: 'A' },
    },
    comps: {
      p: { a: { x: 210, y: 180 }, b: { x: 210, y: 100 }, g: { x: 155, y: 140 } },
      n: { a: { x: 210, y: 290 }, b: { x: 210, y: 370 }, g: { x: 155, y: 330 } },
      RL: { a: { x: 340, y: 235 }, b: { x: 340, y: 420 } },
    },
    wires: [
      [{ x: 60, y: 235 }, { x: 155, y: 235 }],
      [{ x: 155, y: 140 }, { x: 155, y: 330 }],
      [{ x: 210, y: 100 }, { x: 210, y: 50 }],
      [{ x: 210, y: 180 }, { x: 210, y: 235 }],
      [{ x: 210, y: 235 }, { x: 210, y: 290 }],
      [{ x: 210, y: 235 }, { x: 340, y: 235 }],
      [{ x: 210, y: 370 }, { x: 210, y: 420 }],
      [{ x: 340, y: 420 }, { x: 210, y: 420 }],
    ],
  };
  return leafPreset('NOT', { components: comps, rails: rails([{ net: 'A', on: on1 }]) }, layout);
}

/** NAND：上拉并联 PMOS，下拉串联 NMOS。栅极走器件外侧通道，导线不压管子。 */
function nandLeaf(a: LogicValue, b: LogicValue): CircuitPreset {
  const onA = a === '1';
  const onB = b === '1';
  const comps: Component[] = [
    { id: 'pA', kind: 'M', channel: 'P', a: 'y', b: 'vdd', g: 'A', on: !onA, label: 'pA' },
    { id: 'pB', kind: 'M', channel: 'P', a: 'y', b: 'vdd', g: 'B', on: !onB, label: 'pB' },
    { id: 'nA', kind: 'M', channel: 'N', a: 'y', b: 'mid', g: 'A', on: onA, label: 'nA' },
    { id: 'nB', kind: 'M', channel: 'N', a: 'mid', b: 'gnd', g: 'B', on: onB, label: 'nB' },
    { id: 'RL', kind: 'R', a: 'y', b: 'gnd', r: RLOAD, label: 'RL' },
  ];
  const layout: PresetLayout = {
    width: 470, height: 480,
    nodes: {
      vdd: { x: 260, y: 55, vdd: true },
      y: { x: 260, y: 230, term: 'out', label: 'Y' },
      mid: { x: 260, y: 330 },
      gnd: { x: 260, y: 440, gnd: true },
      A: { x: 40, y: 140, term: 'in', label: 'A' },
      B: { x: 40, y: 190, term: 'in', label: 'B' },
    },
    comps: {
      pA: { a: { x: 200, y: 180 }, b: { x: 200, y: 100 }, g: { x: 150, y: 140 } },
      pB: { a: { x: 320, y: 180 }, b: { x: 320, y: 100 }, g: { x: 370, y: 140 } },
      nA: { a: { x: 260, y: 280 }, b: { x: 260, y: 320 }, g: { x: 210, y: 300 } },
      nB: { a: { x: 260, y: 340 }, b: { x: 260, y: 380 }, g: { x: 210, y: 360 } },
      RL: { a: { x: 420, y: 230 }, b: { x: 420, y: 440 } },
    },
    wires: [
      // VDD
      [{ x: 200, y: 100 }, { x: 200, y: 55 }],
      [{ x: 320, y: 100 }, { x: 320, y: 55 }],
      [{ x: 200, y: 55 }, { x: 320, y: 55 }],
      // 输出节点 Y
      [{ x: 200, y: 230 }, { x: 420, y: 230 }],
      [{ x: 200, y: 180 }, { x: 200, y: 230 }],
      [{ x: 320, y: 180 }, { x: 320, y: 230 }],
      [{ x: 260, y: 230 }, { x: 260, y: 280 }],
      // 串联中点
      [{ x: 260, y: 320 }, { x: 260, y: 340 }],
      // 地
      [{ x: 260, y: 380 }, { x: 260, y: 440 }],
      [{ x: 420, y: 440 }, { x: 260, y: 440 }],
      // A 栅极：左侧通道 x=100
      [{ x: 40, y: 140 }, { x: 100, y: 140 }],
      [{ x: 100, y: 140 }, { x: 150, y: 140 }],
      [{ x: 100, y: 140 }, { x: 100, y: 300 }],
      [{ x: 100, y: 300 }, { x: 210, y: 300 }],
      // B 栅极：x=140 通道；pB 栅极从右侧绕行（x=400），避开 pA
      [{ x: 40, y: 190 }, { x: 140, y: 190 }],
      [{ x: 140, y: 190 }, { x: 140, y: 360 }],
      [{ x: 140, y: 360 }, { x: 210, y: 360 }],
      [{ x: 140, y: 250 }, { x: 400, y: 250 }],
      [{ x: 400, y: 250 }, { x: 400, y: 140 }],
      [{ x: 400, y: 140 }, { x: 370, y: 140 }],
    ],
  };
  return leafPreset('NAND', { components: comps, rails: rails([{ net: 'A', on: onA }, { net: 'B', on: onB }]) }, layout);
}

/** NOR：上拉串联 PMOS，下拉并联 NMOS。B 栅极从下方绕行，不压器件。 */
function norLeaf(a: LogicValue, b: LogicValue): CircuitPreset {
  const onA = a === '1';
  const onB = b === '1';
  const comps: Component[] = [
    { id: 'pA', kind: 'M', channel: 'P', a: 'midp', b: 'vdd', g: 'A', on: !onA, label: 'pA' },
    { id: 'pB', kind: 'M', channel: 'P', a: 'y', b: 'midp', g: 'B', on: !onB, label: 'pB' },
    { id: 'nA', kind: 'M', channel: 'N', a: 'y', b: 'gnd', g: 'A', on: onA, label: 'nA' },
    { id: 'nB', kind: 'M', channel: 'N', a: 'y', b: 'gnd', g: 'B', on: onB, label: 'nB' },
    { id: 'RL', kind: 'R', a: 'y', b: 'gnd', r: RLOAD, label: 'RL' },
  ];
  const layout: PresetLayout = {
    width: 480, height: 480,
    nodes: {
      vdd: { x: 260, y: 50, vdd: true },
      midp: { x: 260, y: 140 },
      y: { x: 260, y: 240, term: 'out', label: 'Y' },
      gnd: { x: 260, y: 440, gnd: true },
      A: { x: 40, y: 100, term: 'in', label: 'A' },
      B: { x: 40, y: 180, term: 'in', label: 'B' },
    },
    comps: {
      pA: { a: { x: 260, y: 120 }, b: { x: 260, y: 80 }, g: { x: 210, y: 100 } },
      pB: { a: { x: 260, y: 200 }, b: { x: 260, y: 160 }, g: { x: 210, y: 180 } },
      nA: { a: { x: 180, y: 280 }, b: { x: 180, y: 360 }, g: { x: 140, y: 320 } },
      nB: { a: { x: 340, y: 280 }, b: { x: 340, y: 360 }, g: { x: 380, y: 320 } },
      RL: { a: { x: 430, y: 240 }, b: { x: 430, y: 440 } },
    },
    wires: [
      [{ x: 260, y: 80 }, { x: 260, y: 50 }],
      [{ x: 260, y: 120 }, { x: 260, y: 140 }],
      [{ x: 260, y: 140 }, { x: 260, y: 160 }],
      [{ x: 180, y: 240 }, { x: 430, y: 240 }],
      [{ x: 260, y: 200 }, { x: 260, y: 240 }],
      [{ x: 180, y: 240 }, { x: 180, y: 280 }],
      [{ x: 340, y: 240 }, { x: 340, y: 280 }],
      [{ x: 180, y: 360 }, { x: 180, y: 440 }],
      [{ x: 340, y: 360 }, { x: 340, y: 440 }],
      [{ x: 180, y: 440 }, { x: 430, y: 440 }],
      // A 栅极
      [{ x: 40, y: 100 }, { x: 210, y: 100 }],
      [{ x: 140, y: 100 }, { x: 140, y: 320 }],
      // B 栅极（从下方绕行到 nB 右侧）
      [{ x: 40, y: 180 }, { x: 210, y: 180 }],
      [{ x: 110, y: 180 }, { x: 110, y: 400 }],
      [{ x: 110, y: 400 }, { x: 420, y: 400 }],
      [{ x: 420, y: 400 }, { x: 420, y: 320 }],
      [{ x: 420, y: 320 }, { x: 380, y: 320 }],
    ],
  };
  return leafPreset('NOR', { components: comps, rails: rails([{ net: 'A', on: onA }, { net: 'B', on: onB }]) }, layout);
}

/** DTL（二极管-晶体管逻辑）NAND：输入二极管 + 基极电阻 + 三极管 + 集电极电阻。开关级。 */
function dtlNandLeaf(a: LogicValue, b: LogicValue): CircuitPreset {
  const qOn = a === '1' && b === '1';
  const daOn = a === '0';
  const dbOn = b === '0';
  const comps: Component[] = [
    { id: 'RC', kind: 'R', a: 'vcc', b: 'y', r: 4000, label: 'RC' },
    { id: 'RB', kind: 'R', a: 'vcc', b: 'bnode', r: 12000, label: 'RB' },
    { id: 'DA', kind: 'D', a: 'A', b: 'bnode', on: daOn, label: 'DA' },
    { id: 'DB', kind: 'D', a: 'B', b: 'bnode', on: dbOn, label: 'DB' },
    { id: 'Q1', kind: 'Q', a: 'y', b: 'gnd', base: 'bnode', npn: true, on: qOn, label: 'Q1' },
  ];
  const layout: PresetLayout = {
    width: 520, height: 420,
    nodes: {
      vcc: { x: 230, y: 50, vdd: true },
      y: { x: 470, y: 210, term: 'out', label: 'Y' },
      bnode: { x: 120, y: 255 },
      gnd: { x: 360, y: 380, gnd: true },
      A: { x: 40, y: 255, term: 'in', label: 'A' },
      B: { x: 40, y: 315, term: 'in', label: 'B' },
    },
    comps: {
      RC: { a: { x: 360, y: 80 }, b: { x: 360, y: 170 } },
      RB: { a: { x: 120, y: 80 }, b: { x: 120, y: 255 } },
      DA: { a: { x: 60, y: 255 }, b: { x: 120, y: 255 } },
      DB: { a: { x: 60, y: 315 }, b: { x: 120, y: 315 } },
      Q1: { a: { x: 360, y: 210 }, b: { x: 360, y: 300 }, g: { x: 280, y: 255 } },
    },
    wires: [
      [{ x: 120, y: 50 }, { x: 360, y: 50 }],
      [{ x: 120, y: 50 }, { x: 120, y: 80 }],
      [{ x: 360, y: 50 }, { x: 360, y: 80 }],
      [{ x: 360, y: 170 }, { x: 360, y: 210 }],
      [{ x: 360, y: 210 }, { x: 470, y: 210 }],
      [{ x: 360, y: 300 }, { x: 360, y: 380 }],
      [{ x: 40, y: 255 }, { x: 60, y: 255 }],
      [{ x: 40, y: 315 }, { x: 60, y: 315 }],
      [{ x: 120, y: 315 }, { x: 120, y: 255 }],
      [{ x: 120, y: 255 }, { x: 280, y: 255 }],
    ],
  };
  const circ: Circuit = { components: comps, rails: rails([{ net: 'A', on: a === '1' }, { net: 'B', on: b === '1' }, { net: 'vcc', on: true }]) };
  // vcc 电压 5V
  circ.rails = [{ net: 'vcc', v: VDD }, { net: 'A', v: a === '1' ? VDD : 0 }, { net: 'B', v: b === '1' ? VDD : 0 }];
  return leafPreset('NAND-DTL', circ, layout);
}

/** 叶子门 → 电学视图；variant：CMOS（默认）/ DTL（NAND） */
export function gateLeafPreset(kind: GateKind, a: LogicValue, b: LogicValue, variant: 'cmos' | 'dtl' = 'cmos'): CircuitPreset | null {
  if (kind === 'NAND' && variant === 'dtl') return dtlNandLeaf(a, b);
  switch (kind) {
    case 'NOT': return notLeaf(a);
    case 'BUF': return notLeaf(a);
    case 'NAND': return nandLeaf(a, b);
    case 'NOR': return norLeaf(a, b);
    default: return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 复合门的门级定义（下钻看到层级）
// ─────────────────────────────────────────────────────────────
const xorDef: DigDef = {
  id: 'XOR',
  name: T('异或门', 'XOR'),
  ports: [{ name: 'A', dir: 'in' }, { name: 'B', dir: 'in' }, { name: 'Y', dir: 'out' }],
  circuit: {
    inputs: [{ id: 'a', net: 'A', value: '0' }, { id: 'b', net: 'B', value: '0' }],
    outputs: [{ id: 'o', net: 'Y', label: 'Y' }],
    gates: [
      { id: 'g1', kind: 'NAND', inputs: ['A', 'B'], output: 'n1', delay: 0.3 },
      { id: 'g2', kind: 'NAND', inputs: ['A', 'n1'], output: 'n2', delay: 0.3 },
      { id: 'g3', kind: 'NAND', inputs: ['B', 'n1'], output: 'n3', delay: 0.3 },
      { id: 'g4', kind: 'NAND', inputs: ['n2', 'n3'], output: 'Y', delay: 0.3 },
    ],
    blocks: [],
  },
  layout: {
    width: 840, height: 320,
    inputs: { a: { x: 40, y: 80 }, b: { x: 40, y: 200 } },
    gates: {
      g1: { x: 220, y: 120 },
      g2: { x: 420, y: 40 },
      g3: { x: 420, y: 220 },
      g4: { x: 620, y: 120 },
    },
    outputs: { o: { x: 800, y: 141 } },
    blocks: {},
  },
};

const andDef: DigDef = {
  id: 'AND',
  name: T('与门', 'AND'),
  ports: [{ name: 'A', dir: 'in' }, { name: 'B', dir: 'in' }, { name: 'Y', dir: 'out' }],
  circuit: {
    inputs: [{ id: 'a', net: 'A', value: '0' }, { id: 'b', net: 'B', value: '0' }],
    outputs: [{ id: 'o', net: 'Y', label: 'Y' }],
    gates: [
      { id: 'nd', kind: 'NAND', inputs: ['A', 'B'], output: 'nn', delay: 0.3 },
      { id: 'iv', kind: 'NOT', inputs: ['nn'], output: 'Y', delay: 0.2 },
    ],
    blocks: [],
  },
  layout: {
    width: 640, height: 180,
    inputs: { a: { x: 40, y: 70 }, b: { x: 40, y: 120 } },
    gates: { nd: { x: 210, y: 60 }, iv: { x: 410, y: 64 } },
    outputs: { o: { x: 580, y: 81 } },
    blocks: {},
  },
};

const orDef: DigDef = {
  id: 'OR',
  name: T('或门', 'OR'),
  ports: [{ name: 'A', dir: 'in' }, { name: 'B', dir: 'in' }, { name: 'Y', dir: 'out' }],
  circuit: {
    inputs: [{ id: 'a', net: 'A', value: '0' }, { id: 'b', net: 'B', value: '0' }],
    outputs: [{ id: 'o', net: 'Y', label: 'Y' }],
    gates: [
      { id: 'nr', kind: 'NOR', inputs: ['A', 'B'], output: 'nn', delay: 0.3 },
      { id: 'iv', kind: 'NOT', inputs: ['nn'], output: 'Y', delay: 0.2 },
    ],
    blocks: [],
  },
  layout: {
    width: 640, height: 180,
    inputs: { a: { x: 40, y: 70 }, b: { x: 40, y: 120 } },
    gates: { nr: { x: 210, y: 60 }, iv: { x: 410, y: 64 } },
    outputs: { o: { x: 580, y: 81 } },
    blocks: {},
  },
};

const haDef: DigDef = {
  id: 'HA',
  name: T('半加器', 'Half Adder'),
  ports: [{ name: 'A', dir: 'in' }, { name: 'B', dir: 'in' }, { name: 'S', dir: 'out' }, { name: 'Cout', dir: 'out' }],
  circuit: {
    inputs: [{ id: 'a', net: 'A', value: '0' }, { id: 'b', net: 'B', value: '0' }],
    outputs: [{ id: 's', net: 'S', label: 'S' }, { id: 'c', net: 'Cout', label: 'Cout' }],
    gates: [],
    blocks: [
      { id: 'ux', defId: 'XOR', label: 'XOR', connections: { A: 'A', B: 'B', Y: 'S' } },
      { id: 'ua', defId: 'AND', label: 'AND', connections: { A: 'A', B: 'B', Y: 'Cout' } },
    ],
  },
  layout: {
    width: 600, height: 300,
    inputs: { a: { x: 40, y: 58 }, b: { x: 40, y: 86 } },
    gates: {},
    outputs: { s: { x: 500, y: 72 }, c: { x: 500, y: 202 } },
    blocks: { ux: { x: 250, y: 30 }, ua: { x: 250, y: 160 } },
  },
};

export const digDefs: DigDef[] = [xorDef, andDef, orDef, haDef];

// ─────────────────────────────────────────────────────────────
// 预置数字电路
// ─────────────────────────────────────────────────────────────
const nandPreset: DigPreset = {
  id: 'nand',
  title: T('NAND 门', 'NAND Gate'),
  desc: T('点输入 A/B 切换 0/1，看输出 Y；点门可钻进去看 CMOS 内部与电流。', 'Toggle A/B; click the gate to open its CMOS.'),
  top: {
    inputs: [{ id: 'iA', net: 'A', label: 'A', value: '1' }, { id: 'iB', net: 'B', label: 'B', value: '1' }],
    outputs: [{ id: 'oY', net: 'Y', label: 'Y' }],
    gates: [{ id: 'g1', kind: 'NAND', inputs: ['A', 'B'], output: 'Y', delay: 0.5 }],
    blocks: [],
  },
  layout: {
    width: 520, height: 210,
    inputs: { iA: { x: 40, y: 65 }, iB: { x: 40, y: 130 } },
    gates: { g1: { x: 240, y: 55 } },
    outputs: { oY: { x: 460, y: 78 } },
    blocks: {},
  },
  defs: digDefs,
  window: 3,
};

const hazardPreset: DigPreset = {
  id: 'hazard',
  title: T('毛刺 / 冒险', 'Glitch / Hazard'),
  desc: T('Y = A·B + ¬A·C。令 B=C=1，切换 A：两条路径延迟不同，Y 会短暂塌陷——真实延迟下的静态 1 冒险。', 'Static-1 hazard with unequal path delays.'),
  top: {
    inputs: [
      { id: 'iA', net: 'A', label: 'A', value: '0' },
      { id: 'iB', net: 'B', label: 'B', value: '1' },
      { id: 'iC', net: 'C', label: 'C', value: '1' },
    ],
    outputs: [{ id: 'oY', net: 'Y', label: 'Y' }],
    gates: [
      { id: 'nA', kind: 'NOT', inputs: ['A'], output: 'nA', delay: 0.1 },
    ],
    blocks: [
      { id: 'u1', defId: 'AND', label: 'AND', connections: { A: 'A', B: 'B', Y: 't1' } },
      { id: 'u2', defId: 'AND', label: 'AND', connections: { A: 'nA', B: 'C', Y: 't2' } },
      { id: 'u3', defId: 'OR', label: 'OR', connections: { A: 't1', B: 't2', Y: 'Y' } },
    ],
  },
  layout: {
    width: 800, height: 300,
    inputs: { iA: { x: 30, y: 120 }, iB: { x: 30, y: 30 }, iC: { x: 30, y: 210 } },
    gates: { nA: { x: 165, y: 100 } },
    outputs: { oY: { x: 750, y: 120 } },
    blocks: { u1: { x: 350, y: 10 }, u2: { x: 350, y: 175 }, u3: { x: 570, y: 90 } },
  },
  defs: digDefs,
  window: 3,
};

const halfAdderPreset: DigPreset = {
  id: 'half-adder',
  title: T('半加器（层级）', 'Half Adder (hierarchy)'),
  desc: T('点 HA 方块钻进去看 XOR/AND；再点 AND 看它由 NAND+NOT 组成，最后点 NAND 到 CMOS。', 'Drill HA → XOR/AND → NAND → CMOS.'),
  top: {
    inputs: [{ id: 'iA', net: 'A', label: 'A', value: '1' }, { id: 'iB', net: 'B', label: 'B', value: '1' }],
    outputs: [{ id: 'oS', net: 'S', label: 'S' }, { id: 'oC', net: 'Cout', label: 'Cout' }],
    gates: [],
    blocks: [{ id: 'u1', defId: 'HA', label: 'HA', connections: { A: 'A', B: 'B', S: 'S', Cout: 'Cout' } }],
  },
  layout: {
    width: 620, height: 240,
    inputs: { iA: { x: 40, y: 83 }, iB: { x: 40, y: 111 } },
    gates: {},
    outputs: { oS: { x: 510, y: 83 }, oC: { x: 510, y: 111 } },
    blocks: { u1: { x: 250, y: 55 } },
  },
  defs: digDefs,
  window: 3,
};

// ─────────────────────────────────────────────────────────────
// 时序电路：SR 锁存 / D 锁存 / D 触发器（都由门 + 反馈搭成，真实延迟）
// ─────────────────────────────────────────────────────────────
const srLatchPreset: DigPreset = {
  id: 'sr-latch',
  title: T('SR 锁存器', 'SR Latch'),
  desc: T('交叉耦合 NAND：S=0 置 1，R=0 清 0，S=R=1 保持。', 'Cross-coupled NAND latch.'),
  top: {
    inputs: [
      { id: 'iS', net: 'S', label: 'S', value: '1' },
      { id: 'iR', net: 'R', label: 'R', value: '1' },
    ],
    outputs: [
      { id: 'oQ', net: 'Q', label: 'Q' },
      { id: 'oQN', net: 'qn', label: 'QN' },
    ],
    gates: [
      { id: 'gq', kind: 'NAND', inputs: ['S', 'qn'], output: 'Q', delay: 0.3 },
      { id: 'gqn', kind: 'NAND', inputs: ['R', 'Q'], output: 'qn', delay: 0.3 },
    ],
    blocks: [],
  },
  layout: {
    width: 600, height: 280,
    inputs: { iS: { x: 40, y: 70 }, iR: { x: 40, y: 200 } },
    gates: { gq: { x: 260, y: 70 }, gqn: { x: 260, y: 200 } },
    outputs: { oQ: { x: 520, y: 91 }, oQN: { x: 520, y: 221 } },
    blocks: {},
  },
  defs: digDefs,
  window: 3,
};

const dLatchPreset: DigPreset = {
  id: 'd-latch',
  title: T('D 锁存器', 'D Latch'),
  desc: T('电平敏感：clk=1 时输出跟随 D，clk=0 时保持。时钟自动翻转。', 'Level-sensitive D latch; clk auto-toggles.'),
  top: {
    inputs: [
      { id: 'iD', net: 'D', label: 'D', value: '0' },
      { id: 'iC', net: 'clk', label: 'clk', value: '0', clock: 4 },
    ],
    outputs: [{ id: 'oQ', net: 'Q', label: 'Q' }],
    gates: [
      { id: 'nD', kind: 'NOT', inputs: ['D'], output: 'nD', delay: 0.05 },
      { id: 's', kind: 'NAND', inputs: ['D', 'clk'], output: 's', delay: 0.05 },
      { id: 'r', kind: 'NAND', inputs: ['nD', 'clk'], output: 'r', delay: 0.05 },
      { id: 'gq', kind: 'NAND', inputs: ['s', 'qn'], output: 'Q', delay: 0.12 },
      { id: 'gqn', kind: 'NAND', inputs: ['r', 'Q'], output: 'qn', delay: 0.12 },
    ],
    blocks: [],
  },
  layout: {
    width: 820, height: 300,
    inputs: { iD: { x: 40, y: 70 }, iC: { x: 40, y: 210 } },
    gates: {
      nD: { x: 170, y: 55 },
      s: { x: 360, y: 20 },
      r: { x: 360, y: 190 },
      gq: { x: 560, y: 20 },
      gqn: { x: 560, y: 190 },
    },
    outputs: { oQ: { x: 760, y: 41 } },
    blocks: {},
  },
  defs: digDefs,
  window: 3,
};

const dffPreset: DigPreset = {
  id: 'dff',
  title: T('D 触发器（主从）', 'D Flip-Flop (master-slave)'),
  desc: T('两个电平锁存器主从串接：clk 上升沿把 D 锁存到 Q，其余时间保持。', 'Master-slave D-FF: rising edge captures D.'),
  top: {
    inputs: [
      { id: 'iD', net: 'D', label: 'D', value: '0' },
      { id: 'iC', net: 'clk', label: 'clk', value: '0', clock: 6 },
    ],
    outputs: [{ id: 'oQ', net: 'Q', label: 'Q' }],
    gates: [
      { id: 'nclk', kind: 'NOT', inputs: ['clk'], output: 'nclk', delay: 0.05 },
      { id: 'mnD', kind: 'NOT', inputs: ['D'], output: 'mnD', delay: 0.05 },
      { id: 'ms', kind: 'NAND', inputs: ['D', 'nclk'], output: 'ms', delay: 0.05 },
      { id: 'mr', kind: 'NAND', inputs: ['mnD', 'nclk'], output: 'mr', delay: 0.05 },
      { id: 'mq', kind: 'NAND', inputs: ['ms', 'mqn'], output: 'mQ', delay: 0.12 },
      { id: 'mqn', kind: 'NAND', inputs: ['mr', 'mQ'], output: 'mqn', delay: 0.12 },
      { id: 'snD', kind: 'NOT', inputs: ['mQ'], output: 'snD', delay: 0.05 },
      { id: 'ss', kind: 'NAND', inputs: ['mQ', 'clk'], output: 'ss', delay: 0.05 },
      { id: 'sr', kind: 'NAND', inputs: ['snD', 'clk'], output: 'sr', delay: 0.05 },
      { id: 'sq', kind: 'NAND', inputs: ['ss', 'sqn'], output: 'Q', delay: 0.12 },
      { id: 'sqn', kind: 'NAND', inputs: ['sr', 'Q'], output: 'sqn', delay: 0.12 },
    ],
    blocks: [],
  },
  layout: {
    width: 1120, height: 420,
    inputs: { iD: { x: 40, y: 90 }, iC: { x: 40, y: 330 } },
    gates: {
      nclk: { x: 150, y: 300 },
      mnD: { x: 150, y: 70 },
      ms: { x: 300, y: 40 },
      mr: { x: 300, y: 190 },
      mq: { x: 460, y: 40 },
      mqn: { x: 460, y: 190 },
      snD: { x: 620, y: 190 },
      ss: { x: 760, y: 40 },
      sr: { x: 760, y: 190 },
      sq: { x: 920, y: 40 },
      sqn: { x: 920, y: 190 },
    },
    outputs: { oQ: { x: 1080, y: 61 } },
    blocks: {},
  },
  defs: digDefs,
  window: 3,
};

export const digPresets: DigPreset[] = [nandPreset, hazardPreset, halfAdderPreset, srLatchPreset, dLatchPreset, dffPreset];

export function findDigPreset(id: string): DigPreset {
  return digPresets.find((p) => p.id === id) ?? digPresets[0];
}
