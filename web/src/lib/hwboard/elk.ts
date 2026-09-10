// ELK JSON 构建器(d3-hwschematic 输入)。
// 用法: 建门/管子/电源/端子 → 用 net() 把端口连成网表 → build() 出图 JSON。
// 布局由 ELK 自动完成; 数值/颜色变化只需重建 JSON 重渲染(结构不变则布局稳定)。

export type NetKind = 'sig' | 'vdd' | 'gnd';
export type Side = 'WEST' | 'EAST' | 'NORTH' | 'SOUTH';
type PortRef = [nodeId: string, portId: string];

const FIXED = { 'org.eclipse.elk.portConstraints': 'FIXED_ORDER' };

export class ElkBuilder {
  // 实例内计数: 同一电路每次构建产出相同 id, ELK 迭代顺序固定, 布局跨渲染/跨会话稳定。
  // (此前全局自增 seed 使每次渲染 id 都不同, 同一电路换次渲染就可能换布局/重叠)
  // id 只需图内唯一(HwBoard 每块板独立成图), 跨板重复无妨。
  private n = 0;
  private children: unknown[] = [];
  private edges: unknown[] = [];
  private eid = 0;

  private id(p: string) {
    return `${p}_${this.n++}`;
  }

  private ports(defs: { name: string; dir: 'INPUT' | 'OUTPUT'; side: Side; index: number }[]) {
    return defs.map((p, i) => ({
      id: `${p.name}_${i}_${this.n}`,
      hwMeta: { name: p.name },
      direction: p.dir,
      properties: { side: p.side, index: p.index },
      children: [],
    }));
  }

  /** 标准门(cls Operator, d3-hwschematic 内置 ANSI 符号): AND/NAND/OR/NOR/XOR/NOT */
  gate(op: 'AND' | 'NAND' | 'OR' | 'NOR' | 'XOR' | 'NOT', label = '') {
    const id = this.id('g');
    const two = op !== 'NOT';
    const ports = this.ports([
      { name: 'A', dir: 'INPUT', side: 'WEST', index: 0 },
      ...(two ? [{ name: 'B', dir: 'INPUT', side: 'WEST', index: 1 } as const] : []),
      { name: 'Y', dir: 'OUTPUT', side: 'EAST', index: 0 },
    ]);
    this.children.push({
      id,
      // cssClass 必须自带基础类: Operator 渲染器会用它覆盖 class 属性
      hwMeta: { name: op, cls: 'Operator', bodyText: label, cssClass: 'node node-operator' },
      properties: { ...FIXED },
      ports, children: [], edges: [],
    });
    const p = (nm: string) => ports.find((x) => (x.hwMeta as { name: string }).name === nm) as { id: string };
    return { id, a: [id, p('A').id] as PortRef, b: two ? ([id, p('B').id] as PortRef) : null, y: [id, p('Y').id] as PortRef };
  }

  /** 2选1 MUX(内置梯形符号) */
  mux2() {
    const id = this.id('mux');
    const ports = this.ports([
      { name: 'D0', dir: 'INPUT', side: 'WEST', index: 0 },
      { name: 'D1', dir: 'INPUT', side: 'WEST', index: 1 },
      { name: 'S', dir: 'INPUT', side: 'SOUTH', index: 0 },
      { name: 'Y', dir: 'OUTPUT', side: 'EAST', index: 0 },
    ]);
    this.children.push({
      id,
      hwMeta: { name: 'MUX', cls: 'Operator', cssClass: 'node node-operator' },
      properties: { ...FIXED },
      ports, children: [], edges: [],
    });
    const p = (nm: string) => ports.find((x) => (x.hwMeta as { name: string }).name === nm) as { id: string };
    return {
      id,
      d0: [id, p('D0').id] as PortRef, d1: [id, p('D1').id] as PortRef,
      s: [id, p('S').id] as PortRef, y: [id, p('Y').id] as PortRef,
    };
  }

  /** 通用方框(如 FA/寄存器/DFF 组): bodyText 居中显示。
   *  端口可逐个定侧:
   *  string 表默认侧(输入 WEST/输出 EAST),
   *  {name, side} 定侧(如 FA 链 A/B 走 NORTH, Cin/Cout 走 WEST/EAST, S 走 SOUTH, 横向排成教材式行波) */
  box(
    label: string,
    inputs: (string | { name: string; side: Side })[],
    outputs: (string | { name: string; side: Side })[],
    sub = '',
  ) {
    const id = this.id('box');
    const normIn = (e: string | { name: string; side: Side }) =>
      typeof e === 'string' ? { name: e, side: 'WEST' as Side } : e;
    const normOut = (e: string | { name: string; side: Side }) =>
      typeof e === 'string' ? { name: e, side: 'EAST' as Side } : e;
    const ports = this.ports([
      ...inputs.map((e, index) => ({ ...normIn(e), dir: 'INPUT' as const, index })),
      ...outputs.map((e, index) => ({ ...normOut(e), dir: 'OUTPUT' as const, index })),
    ]);
    this.children.push({
      id,
      hwMeta: { name: label, cls: 'Box', bodyText: sub ? `${label}\n${sub}` : label, cssClass: 'node' },
      properties: { ...FIXED },
      ports, children: [], edges: [],
    });
    const p = (nm: string) => ports.find((x) => (x.hwMeta as { name: string }).name === nm) as { id: string };
    const pins: Record<string, PortRef> = {};
    for (const pt of ports) pins[(pt.hwMeta as { name: string }).name] = [id, pt.id];
    return { id, pins, p };
  }

  /** MOSFET(自定义渲染器): G 西; 源极恒朝电源轨(NMOS: D 北/S 南, PMOS: S 北/D 南),
   *  与符号箭头一致(上拉管源在上, 下拉管源在下), Vdd/GND 走短竖线直连。
   *  gateOn: 栅极引线颜色跟随栅信号值(不传则与管体同色) */
  fet(kind: 'NMOS' | 'PMOS', on: boolean, gateOn?: boolean) {
    const id = this.id('fet');
    const pmos = kind === 'PMOS';
    const ports = this.ports([
      { name: 'G', dir: 'INPUT', side: 'WEST', index: 0 },
      { name: pmos ? 'S' : 'D', dir: pmos ? 'INPUT' : 'OUTPUT', side: 'NORTH', index: 0 },
      { name: pmos ? 'D' : 'S', dir: pmos ? 'OUTPUT' : 'INPUT', side: 'SOUTH', index: 0 },
    ]);
    this.children.push({
      id,
      hwMeta: { name: kind, cls: 'Mos', on, gateOn: gateOn ?? on },
      properties: { ...FIXED },
      ports, children: [], edges: [],
    });
    const p = (nm: string) => ports.find((x) => (x.hwMeta as { name: string }).name === nm) as { id: string };
    return { id, g: [id, p('G').id] as PortRef, d: [id, p('D').id] as PortRef, s: [id, p('S').id] as PortRef };
  }

  /** 电源(自定义渲染器) */
  power(kind: 'VDD' | 'GND') {
    const id = this.id('pwr');
    const out = kind === 'VDD';
    const ports = this.ports([{ name: out ? 'O' : 'I', dir: out ? 'OUTPUT' : 'INPUT', side: out ? 'SOUTH' : 'NORTH', index: 0 }]);
    this.children.push({
      id,
      hwMeta: { name: kind, cls: 'Power' },
      properties: { ...FIXED },
      ports, children: [], edges: [],
    });
    return { id, p: [id, (ports[0] as { id: string }).id] as PortRef };
  }

  /** 可点击输入端子(自定义渲染器, id 以 in_ 开头会被看板挂点击)。
   *  side 定输出脚方位(默认 EAST; 需要从上方接入时传 SOUTH) */
  input(key: string, val: number, side: Side = 'EAST') {
    const id = `in_${key}_${this.n++}`;
    const ports = this.ports([{ name: 'O', dir: 'OUTPUT', side, index: 0 }]);
    this.children.push({
      id,
      hwMeta: { name: key, cls: 'Term', val, inputKey: key },
      properties: { ...FIXED },
      ports, children: [], edges: [],
    });
    return { id, o: [id, (ports[0] as { id: string }).id] as PortRef };
  }

  /** 输出端子(只显示值)。side 定输入脚方位(默认 WEST; 需要从下方接出时传 NORTH) */
  output(key: string, val: number, side: Side = 'WEST') {
    const id = `out_${key}_${this.n++}`;
    const ports = this.ports([{ name: 'I', dir: 'INPUT', side, index: 0 }]);
    this.children.push({
      id,
      hwMeta: { name: key, cls: 'Term', val, inputKey: '' },
      properties: { ...FIXED },
      ports, children: [], edges: [],
    });
    return { id, i: [id, (ports[0] as { id: string }).id] as PortRef };
  }

  /** 连网表: from 驱动(可多源), to 负载; 颜色按值/种类自动(null 端口自动忽略) */
  net(name: string, val: number, kind: NetKind, from: PortRef | PortRef[], to: (PortRef | null)[]) {
    const cssStyle =
      (kind === 'vdd' ? 'stroke:#dc2626;stroke-width:2' :
      kind === 'gnd' ? 'stroke:#1f2937;stroke-width:2' :
      val === 1 ? 'stroke:#16a34a;stroke-width:2.2' : 'stroke:#64748b;stroke-width:1.6') + ';fill:none';
    const srcs = (Array.isArray(from[0]) ? (from as PortRef[]) : [from as PortRef]);
    this.edges.push({
      id: `e${this.eid++}`,
      sources: srcs.map(([n, p]) => [n, p]),
      targets: to.filter((t): t is PortRef => !!t).map(([n, p]) => [n, p]),
      hwMeta: {
        name,
        cssStyle,
        ...(kind === 'sig' && val === 1 ? { cssClass: 'flow-on' } : {}),
      },
    });
  }

  /** extra: 透传 ELK 根选项(如寄存器组用 considerModelOrder 锁定盒顺序) */
  build(direction: 'RIGHT' | 'DOWN' = 'RIGHT', extra: Record<string, string> = {}) {
    return {
      id: 'root',
      hwMeta: { maxId: this.n + 100 },
      properties: {
        ...(direction === 'DOWN' ? { 'org.eclipse.elk.direction': 'DOWN' } : {}),
        ...extra,
        // 元件间距, 避免并联管挤叠; BK 放置策略拉直长边
        'org.eclipse.elk.spacing.nodeNode': '28',
        'org.eclipse.elk.spacing.edgeNode': '16',
        'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers': '42',
        'org.eclipse.elk.layered.spacing.edgeEdgeBetweenLayers': '14',
        'org.eclipse.elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
        'org.eclipse.elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      },
      ports: [],
      children: this.children,
      edges: this.edges,
    };
  }
}
