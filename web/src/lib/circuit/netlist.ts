/**
 * 电路通用库 · 网表模型（纯数据，无渲染/无 React）
 * ============================================
 * 设计目标：图/树模块的 `lib/graph.ts` 之于图算法，这里是模拟电路的地基——
 * 只描述「节点 + 元件」，把物理求解交给 mna.ts。数字逻辑那套 hwboard 是示意图
 * 上色，不参与物理计算；本库是真正求解节点电压/支路电流，与画布解耦、可单测。
 *
 * 约定：
 * - 节点用字符串 id 标识，接地节点默认 `'gnd'`（电压恒 0）。
 * - 元件两端 a / b 有方向含义：
 *     R/C/L：a→b 为电流正方向（仅用于读数正负）。
 *     V 源：a 为正极、b 为负极（v_a − v_b = value）。
 *     I 源：电流在源内部由 a 流向 b（即从 b 端推向外部电路）。
 */

export type NodeId = string;

export interface ComponentBase {
  id: string;
  a: NodeId;
  b: NodeId;
  /** 展示名（默认用 id） */
  label?: string;
}

export interface Resistor extends ComponentBase { kind: 'R'; r: number; }
export interface Capacitor extends ComponentBase { kind: 'C'; c: number; }
export interface Inductor extends ComponentBase { kind: 'L'; l: number; }
export interface VoltageSource extends ComponentBase { kind: 'V'; v: number; }
export interface CurrentSource extends ComponentBase { kind: 'I'; i: number; }

/** MOSFET（开关级）：数字/逻辑量驱动栅极 → 源漏之间导通或断开。
 *  a = 漏极 D，b = 源极 S，g = 栅极 G（栅极不参与电流，纯控制端）。
 *  on 由上层逻辑值决定（NMOS: 栅=1 导通；PMOS: 栅=0 导通）。 */
export interface Mosfet extends ComponentBase {
  kind: 'M';
  channel: 'N' | 'P';
  g: NodeId;
  on: boolean;
  /** 导通电阻，默认 5Ω */
  ron?: number;
}

export type Component =
  | Resistor
  | Capacitor
  | Inductor
  | VoltageSource
  | CurrentSource
  | Mosfet
  | Diode
  | Bjt;

/** 二极管（开关级）：a=阳极，b=阴极。on 由上层逻辑判定（正向导通≈小电阻，反向断开）。 */
export interface Diode extends ComponentBase {
  kind: 'D';
  on: boolean;
  ron?: number;
}

/** 三极管（开关级）：a=集电极，b=发射极，base=基极。
 *  on 表示饱和导通（c-e ≈ 小电阻，b-e 也导通）；off 表示截止（全断）。 */
export interface Bjt extends ComponentBase {
  kind: 'Q';
  base: NodeId;
  npn: boolean;
  on: boolean;
  ron?: number;
  rbe?: number;
}

export interface Circuit {
  components: Component[];
  /** 接地节点，默认 'gnd' */
  ground?: NodeId;
  /** 理想电源轨：把节点钉在固定电压（求解时等效为对地理想电压源，仅计算用，不画） */
  rails?: { net: NodeId; v: number }[];
}

/** 收集网表里出现的全部节点 id（含地） */
export function circuitNodes(circuit: Circuit): NodeId[] {
  const set = new Set<NodeId>();
  for (const c of circuit.components) {
    set.add(c.a);
    set.add(c.b);
  }
  set.add(circuit.ground ?? 'gnd');
  return [...set];
}

/** 深拷贝（页面做参数编辑时避免污染预置原始数据） */
export function cloneCircuit(circuit: Circuit): Circuit {
  return {
    ground: circuit.ground,
    rails: circuit.rails?.map((r) => ({ ...r })),
    components: circuit.components.map((c) => ({ ...c })),
  };
}

/** 元件数值字段名（R→r, V→v, I→i, C→c, L→l；MOS/二极管/三极管用 ron） */
export function valueKey(kind: Component['kind']): 'r' | 'c' | 'l' | 'v' | 'i' {
  switch (kind) {
    case 'R': return 'r';
    case 'C': return 'c';
    case 'L': return 'l';
    case 'V': return 'v';
    case 'I': return 'i';
    case 'M':
    case 'D':
    case 'Q': return 'r';
  }
}

/** 读取元件数值（开关元件返回导通电阻） */
export function componentValue(c: Component): number {
  switch (c.kind) {
    case 'R': return c.r;
    case 'C': return c.c;
    case 'L': return c.l;
    case 'V': return c.v;
    case 'I': return c.i;
    case 'M': return c.ron ?? 5;
    case 'D': return c.ron ?? 10;
    case 'Q': return c.ron ?? 5;
  }
}
