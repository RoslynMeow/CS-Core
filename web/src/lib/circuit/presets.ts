/**
 * 电路通用库 · 预置电路 + 原理图布局
 * ==================================
 * 布局与电气网表解耦：
 *   - circuit：真实网表（求解用）
 *   - layout：仅画图用（节点坐标、元件两端坐标、装饰导线）
 * 元件两端坐标若省略，则默认取其 a/b 节点坐标（直线连接）。
 */

import { T, type Text } from '../../i18n/lang';
import type { Circuit, NodeId } from './netlist';

export interface Pt { x: number; y: number; }
export interface NodeLayout extends Pt {
  /** 该节点画接地符号 */
  gnd?: boolean;
  /** 该节点画 VDD 电源轨符号 */
  vdd?: boolean;
  /** 端子：画圆圈并显示电压（in/out 仅决定标注位置） */
  term?: 'in' | 'out';
  /** 画图用的显示名（默认用节点 id） */
  label?: string;
}
export interface PresetLayout {
  width: number;
  height: number;
  nodes: Record<NodeId, NodeLayout>;
  /** 覆盖元件的绘制端子：a/b 为两端；MOS 额外给 g（栅极引出点） */
  comps?: Record<string, { a: Pt; b: Pt; g?: Pt }>;
  /** 装饰导线（仅视觉，不参与电气；连通性由网表节点决定） */
  wires?: [Pt, Pt][];
}

export interface CircuitPreset {
  id: string;
  title: Text;
  desc: Text;
  circuit: Circuit;
  layout: PresetLayout;
}

// ─────────────────────────────────────────────────────────────
// 1) 分压器
// ─────────────────────────────────────────────────────────────
const divider: CircuitPreset = {
  id: 'divider',
  title: T('分压器', 'Voltage Divider'),
  desc: T(
    '两电阻串联分压：Vout = Vin · R2 / (R1 + R2)。改阻值看中点电压与电流变化。',
    'Two resistors in series: Vout = Vin · R2 / (R1 + R2). Edit resistance to see Vout.',
  ),
  circuit: {
    components: [
      { id: 'V1', kind: 'V', a: 'vin', b: 'gnd', v: 10, label: 'Vin' },
      { id: 'R1', kind: 'R', a: 'vin', b: 'vout', r: 1000, label: 'R1' },
      { id: 'R2', kind: 'R', a: 'vout', b: 'gnd', r: 1000, label: 'R2' },
    ],
  },
  layout: {
    width: 440,
    height: 420,
    nodes: {
      vin: { x: 210, y: 70, label: 'in' },
      vout: { x: 210, y: 220, label: 'out' },
      gnd: { x: 210, y: 390, gnd: true },
    },
    comps: {
      V1: { a: { x: 90, y: 70 }, b: { x: 90, y: 330 } },
    },
    wires: [
      [{ x: 210, y: 70 }, { x: 90, y: 70 }],
      [{ x: 90, y: 330 }, { x: 90, y: 390 }],
      [{ x: 90, y: 390 }, { x: 210, y: 390 }],
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// 2) 电流分流（并联电阻）
// ─────────────────────────────────────────────────────────────
const currentDivider: CircuitPreset = {
  id: 'current-divider',
  title: T('电流分流', 'Current Divider'),
  desc: T(
    '恒流源供入后，电流按电导分配到并联电阻：I₁/I₂ = R₂/R₁。',
    'A current source splits across parallel resistors: I₁/I₂ = R₂/R₁.',
  ),
  circuit: {
    components: [
      { id: 'I1', kind: 'I', a: 'gnd', b: 'n1', i: 0.006, label: 'Is' },
      { id: 'R1', kind: 'R', a: 'n1', b: 'gnd', r: 1000, label: 'R1' },
      { id: 'R2', kind: 'R', a: 'n1', b: 'gnd', r: 2000, label: 'R2' },
    ],
  },
  layout: {
    width: 460,
    height: 400,
    nodes: {
      n1: { x: 230, y: 70, label: 'N' },
      gnd: { x: 230, y: 360, gnd: true },
    },
    comps: {
      I1: { a: { x: 90, y: 360 }, b: { x: 90, y: 70 } },
      R1: { a: { x: 175, y: 70 }, b: { x: 175, y: 360 } },
      R2: { a: { x: 285, y: 70 }, b: { x: 285, y: 360 } },
    },
    wires: [
      [{ x: 230, y: 70 }, { x: 90, y: 70 }],
      [{ x: 230, y: 70 }, { x: 175, y: 70 }],
      [{ x: 230, y: 70 }, { x: 285, y: 70 }],
      [{ x: 230, y: 360 }, { x: 90, y: 360 }],
      [{ x: 230, y: 360 }, { x: 175, y: 360 }],
      [{ x: 230, y: 360 }, { x: 285, y: 360 }],
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// 3) 惠斯通电桥（不平衡）
// ─────────────────────────────────────────────────────────────
const bridge: CircuitPreset = {
  id: 'bridge',
  title: T('惠斯通电桥', 'Wheatstone Bridge'),
  desc: T(
    '四臂电桥：桥臂对称时 V(a)=V(b)，中点电压差为 0；改一臂打破平衡即出现差值。',
    'Four-arm bridge: balanced arms give V(a)=V(b); change one arm to unbalance.',
  ),
  circuit: {
    components: [
      { id: 'V1', kind: 'V', a: 'vcc', b: 'gnd', v: 10, label: 'Vcc' },
      { id: 'R1', kind: 'R', a: 'vcc', b: 'a', r: 1000, label: 'R1' },
      { id: 'R2', kind: 'R', a: 'a', b: 'gnd', r: 1000, label: 'R2' },
      { id: 'R3', kind: 'R', a: 'vcc', b: 'b', r: 1000, label: 'R3' },
      { id: 'R4', kind: 'R', a: 'b', b: 'gnd', r: 1000, label: 'R4' },
    ],
  },
  layout: {
    width: 460,
    height: 400,
    nodes: {
      vcc: { x: 230, y: 60, label: 'Vcc' },
      a: { x: 130, y: 205, label: 'a' },
      b: { x: 330, y: 205, label: 'b' },
      gnd: { x: 230, y: 350, gnd: true },
    },
    comps: {
      V1: { a: { x: 70, y: 60 }, b: { x: 70, y: 350 } },
    },
    wires: [
      [{ x: 230, y: 60 }, { x: 70, y: 60 }],
      [{ x: 70, y: 350 }, { x: 230, y: 350 }],
    ],
  },
};

export const presets: CircuitPreset[] = [divider, currentDivider, bridge];

export function findPreset(id: string): CircuitPreset {
  return presets.find((p) => p.id === id) ?? presets[0];
}
