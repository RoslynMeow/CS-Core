/**
 * 数字逻辑库 · 四值逻辑
 * ====================
 * 0 / 1 / X（未知/冲突） / Z（高阻）。
 * - 多驱动（总线）用 resolve 决议：0 与 1 冲突 → X；全 Z → Z；X 参与 → X。
 * - 门求值：AND 遇 0 必 0、OR 遇 1 必 1（控制值优先），否则遇 X/Z → X。
 */

import type { GateKind, LogicValue } from './types';

export const LV0: LogicValue = '0';
export const LV1: LogicValue = '1';
export const LVX: LogicValue = 'X';
export const LVZ: LogicValue = 'Z';

export function isUnknown(v: LogicValue): boolean {
  return v === 'X' || v === 'Z';
}

/** 多驱动决议（一个网上所有驱动值） */
export function resolve(values: LogicValue[]): LogicValue {
  const active = values.filter((v) => v !== 'Z');
  if (active.length === 0) return 'Z';
  const has0 = active.includes('0');
  const has1 = active.includes('1');
  const hasX = active.includes('X');
  if (hasX || (has0 && has1)) return 'X';
  return has1 ? '1' : '0';
}

function not(v: LogicValue): LogicValue {
  if (v === '0') return '1';
  if (v === '1') return '0';
  return 'X';
}

/** 把 Z 输入当作未知（悬空输入）参与门求值 */
function asKnown(v: LogicValue): LogicValue {
  return v === 'Z' ? 'X' : v;
}

function andOf(vs: LogicValue[]): LogicValue {
  if (vs.some((v) => v === '0')) return '0';
  if (vs.every((v) => v === '1')) return '1';
  return 'X';
}
function orOf(vs: LogicValue[]): LogicValue {
  if (vs.some((v) => v === '1')) return '1';
  if (vs.every((v) => v === '0')) return '0';
  return 'X';
}

export function evalGate(kind: GateKind, ins: LogicValue[]): LogicValue {
  const vs = ins.map(asKnown);
  switch (kind) {
    case 'BUF': return vs[0] ?? 'X';
    case 'NOT': return not(vs[0] ?? 'X');
    case 'AND': return andOf(vs);
    case 'NAND': return not(andOf(vs));
    case 'OR': return orOf(vs);
    case 'NOR': return not(orOf(vs));
    case 'XOR': {
      if (vs.some(isUnknown)) return 'X';
      return vs.filter((v) => v === '1').length % 2 === 1 ? '1' : '0';
    }
  }
}

/** 逻辑值显示色（0 灰 / 1 绿 / X 红 / Z 淡） */
export function logicColor(v: LogicValue): string {
  switch (v) {
    case '0': return '#64748b';
    case '1': return '#16a34a';
    case 'X': return '#dc2626';
    case 'Z': return '#cbd5e1';
  }
}
