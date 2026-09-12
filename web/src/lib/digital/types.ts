/**
 * 数字逻辑库 · 类型定义
 * ====================
 * 与 lib/circuit（电学/模拟）并列：这里只有「逻辑量 0/1/X/Z」和「门 + 子电路层级」，
 * 不管电压电流。两者的交接点在「门」这一层——门的 CMOS 内部才是电学（见 stdlib 的
 * ElectricalView）。这样数字输入(0/1)和电学输入(电压/电流)就分得清清楚楚。
 */

import type { Text } from '../../i18n/lang';

/** 四值逻辑：0 / 1 / 未知 X / 高阻 Z */
export type LogicValue = '0' | '1' | 'X' | 'Z';

export type NetId = string;

export type GateKind = 'AND' | 'OR' | 'NOT' | 'NAND' | 'NOR' | 'XOR' | 'BUF';

/** 门实例：输入网表顺序对应符号的上/下引脚 */
export interface GateInst {
  id: string;
  kind: GateKind;
  inputs: NetId[];
  output: NetId;
  /** 传播延迟（时间单位，真实延迟可演示毛刺） */
  delay: number;
}

/** 子电路实例：引用一个 DigDef，把端口接到父层网表 */
export interface BlockInst {
  id: string;
  defId: string;
  /** 端口名 → 父层网表 */
  connections: Record<string, NetId>;
  label?: string;
}

/** 顶层/内部的可交互输入端子 */
export interface DigInput {
  id: string;
  net: NetId;
  label?: string;
  /** 初始/当前逻辑值 */
  value: LogicValue;
  /** 若设置，则该输入是自动时钟：周期 = 此值（时间单位），每半个周期翻转一次，不可手动点击 */
  clock?: number;
}

/** 输出端子（观测点） */
export interface DigOutput {
  id: string;
  net: NetId;
  label?: string;
}

export interface DigCircuit {
  inputs: DigInput[];
  outputs: DigOutput[];
  gates: GateInst[];
  blocks: BlockInst[];
  /** 悬空/未驱动网的默认值（默认 Z） */
  pullup?: NetId[];
}

/** 可复用子电路定义：circuit 里以「端口名」作为边界网名 */
export interface DigDef {
  id: string;
  name: Text;
  ports: { name: string; dir: 'in' | 'out' }[];
  circuit: DigCircuit;
  /** 可选手写布局（含子块的定义必须给；纯门定义可省略走自动布局） */
  layout?: DigLayout;
}

/** 画布布局（数字层）：输入/门/输出/子电路块的坐标 */
export interface Pt { x: number; y: number }

export interface DigLayout {
  width: number;
  height: number;
  inputs: Record<string, Pt>;
  gates: Record<string, Pt>;
  outputs: Record<string, Pt>;
  blocks: Record<string, Pt>;
}

/** 一个可展示/仿真的预置数字电路 */
export interface DigPreset {
  id: string;
  title: Text;
  desc: Text;
  top: DigCircuit;
  layout: DigLayout;
  defs: DigDef[];
  /** 时间轴长度（仿真窗口） */
  window: number;
}
