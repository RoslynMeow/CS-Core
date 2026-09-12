/**
 * 数字逻辑库 · 事件驱动仿真（真实延迟 / 传输延迟）
 * ===============================================
 * - 初始化：对给定输入做不动点迭代求稳态（组合环不收敛 → X）。
 * - 激励：init 输入值 + 若干 {t, net, value} 跳变事件。
 * - 传播：某网值变化 → 触发读它的门，按门延迟 t+delay 调度输出（传输延迟，
 *   允许窄脉冲 → 能演示毛刺/冒险）。
 * - 记录：每个网的值变化序列（时间, 值），供波形图与画布按时刻回放。
 */

import type { DigCircuit, DigDef, LogicValue, NetId } from './types';
import { evalGate, resolve } from './logic';
import { flatten, type FlatCircuit } from './flatten';

export interface Sample { t: number; v: LogicValue }
export interface SimResult {
  flat: FlatCircuit;
  /** 每个网的值变化序列（首样本 t=0 为稳态初值） */
  waves: Map<NetId, Sample[]>;
  /** 所有出现过的网 */
  nets: NetId[];
  maxTime: number;
}

/** 网在时刻 t 的值（取最后一次 ≤ t 的变化） */
export function valueAt(samples: Sample[] | undefined, t: number): LogicValue {
  if (!samples || samples.length === 0) return 'Z';
  let v: LogicValue = samples[0].v;
  for (const s of samples) {
    if (s.t <= t + 1e-9) v = s.v; else break;
  }
  return v;
}

function computeSteady(flat: FlatCircuit, init: Map<NetId, LogicValue>) {
  const netVal = new Map<NetId, LogicValue>();
  const gateOut = new Map<string, LogicValue>();
  const gateByOut = new Map<NetId, string[]>();
  for (const g of flat.gates) {
    const arr = gateByOut.get(g.output) ?? [];
    arr.push(g.id);
    gateByOut.set(g.output, arr);
    gateOut.set(g.id, 'X');
  }
  const inputVal = new Map<string, LogicValue>();
  flat.inputs.forEach((i) => inputVal.set(i.id, init.get(i.net) ?? i.value));

  const netValueOf = (net: NetId): LogicValue => {
    const vals: LogicValue[] = [];
    for (const gid of gateByOut.get(net) ?? []) vals.push(gateOut.get(gid) ?? 'X');
    for (const i of flat.inputs) if (i.net === net) vals.push(inputVal.get(i.id) ?? 'Z');
    return vals.length ? resolve(vals) : (init.get(net) ?? 'Z');
  };

  let prev = '';
  for (let iter = 0; iter < 64; iter++) {
    for (const net of collectNets(flat, init)) netVal.set(net, netValueOf(net));
    for (const g of flat.gates) {
      const vals = g.inputs.map((n) => netVal.get(n) ?? 'Z');
      gateOut.set(g.id, evalGate(g.kind, vals));
    }
    const snap = [...netVal.entries()].sort().map(([k, v]) => `${k}=${v}`).join('|')
      + '#' + [...gateOut.entries()].sort().map(([k, v]) => `${k}=${v}`).join('|');
    if (snap === prev) return { netVal, gateOut };
    prev = snap;
  }
  // 不收敛（组合环）：把仍在跳变的输出记为 X
  for (const g of flat.gates) if (gateOut.get(g.id) === 'Z') gateOut.set(g.id, 'X');
  for (const net of netVal.keys()) netVal.set(net, netValueOf(net));
  return { netVal, gateOut };
}

function collectNets(flat: FlatCircuit, init: Map<NetId, LogicValue>): NetId[] {
  const s = new Set<NetId>();
  for (const i of flat.inputs) s.add(i.net);
  for (const o of flat.outputs) s.add(o.net);
  for (const g of flat.gates) { s.add(g.output); for (const n of g.inputs) s.add(n); }
  for (const n of init.keys()) s.add(n);
  return [...s];
}

export interface SimOptions {
  /** 初始输入值（网 → 值），用于先求稳态 */
  init: Record<NetId, LogicValue>;
  /** 激励事件：在 t 时刻把 net 置为 value */
  events?: { t: number; net: NetId; value: LogicValue }[];
  /** 仿真窗口上限 */
  window: number;
}

export function simulate(circuit: DigCircuit, defs: DigDef[], opts: SimOptions): SimResult {
  const flat = flatten(circuit, defs);
  const init = new Map<NetId, LogicValue>(Object.entries(opts.init));
  const { netVal, gateOut } = computeSteady(flat, init);

  const inputVal = new Map<string, LogicValue>();
  flat.inputs.forEach((i) => inputVal.set(i.id, init.get(i.net) ?? i.value));

  const gateById = new Map(flat.gates.map((g) => [g.id, g]));
  const gateByOut = new Map<NetId, string[]>();
  const triggers = new Map<NetId, string[]>();
  for (const g of flat.gates) {
    const a = gateByOut.get(g.output) ?? []; a.push(g.id); gateByOut.set(g.output, a);
    for (const n of g.inputs) {
      const t = triggers.get(n) ?? []; t.push(g.id); triggers.set(n, t);
    }
  }
  const nets = collectNets(flat, init);
  const waves = new Map<NetId, Sample[]>();
  for (const n of nets) waves.set(n, [{ t: 0, v: netVal.get(n) ?? 'Z' }]);

  const record = (net: NetId, t: number, v: LogicValue) => {
    const arr = waves.get(net) ?? [];
    const last = arr[arr.length - 1];
    if (!last || last.v !== v) arr.push({ t, v });
    if (!waves.has(net)) waves.set(net, arr);
  };

  const netValueOf = (net: NetId): LogicValue => {
    const vals: LogicValue[] = [];
    for (const gid of gateByOut.get(net) ?? []) vals.push(gateOut.get(gid) ?? 'X');
    for (const i of flat.inputs) if (i.net === net) vals.push(inputVal.get(i.id) ?? 'Z');
    return vals.length ? resolve(vals) : (netVal.get(net) ?? 'Z');
  };
  const updateNet = (net: NetId, t: number): boolean => {
    const v = netValueOf(net);
    if (v === netVal.get(net)) return false;
    netVal.set(net, v);
    record(net, t, v);
    return true;
  };

  type Ev = { t: number; kind: 'in' | 'gate'; id: string; value: LogicValue };
  const queue: Ev[] = [];
  const push = (e: Ev) => { queue.push(e); };
  const pop = (): Ev | undefined => {
    if (!queue.length) return undefined;
    let bi = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].t < queue[bi].t) bi = i;
    }
    return queue.splice(bi, 1)[0];
  };

  for (const e of opts.events ?? []) {
    if (e.t > opts.window) continue;
    const inp = flat.inputs.find((i) => i.net === e.net);
    // 只处理落在输入端子上的激励；直接置内部网暂不支持
    if (inp) push({ t: e.t, kind: 'in', id: inp.id, value: e.value });
  }

  let guard = 0;
  for (;;) {
    const ev = pop();
    if (!ev) break;
    if (ev.t > opts.window) break;
    if (guard++ > 200000) break;
    if (ev.kind === 'in') {
      inputVal.set(ev.id, ev.value);
      const inp = flat.inputs.find((i) => i.id === ev.id);
      if (!inp) continue;
      const changed = updateNet(inp.net, ev.t);
      if (changed) {
        for (const gid of triggers.get(inp.net) ?? []) {
          const g = gateById.get(gid)!;
          const val = evalGate(g.kind, g.inputs.map((n) => netVal.get(n) ?? 'Z'));
          push({ t: ev.t + g.delay, kind: 'gate', id: gid, value: val });
        }
      }
    } else {
      gateOut.set(ev.id, ev.value);
      const g = gateById.get(ev.id)!;
      const changed = updateNet(g.output, ev.t);
      if (changed) {
        for (const gid of triggers.get(g.output) ?? []) {
          const gg = gateById.get(gid)!;
          const val = evalGate(gg.kind, gg.inputs.map((n) => netVal.get(n) ?? 'Z'));
          push({ t: ev.t + gg.delay, kind: 'gate', id: gid, value: val });
        }
      }
    }
  }

  return { flat, waves, nets, maxTime: opts.window };
}
