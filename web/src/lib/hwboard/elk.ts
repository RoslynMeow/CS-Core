// ELK JSON 构建器(d3-hwschematic 输入)。
// 用法: 建门/管子/电源/端子 → 用 net() 把端口连成网表 → build() 出图 JSON。
// 布局由 ELK 自动完成; 数值/颜色变化只需重建 JSON 重渲染(结构不变则布局稳定)。

export type NetKind = 'sig' | 'vdd' | 'gnd' | 'ctrl';
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
    toggleKey?: string,
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
      // toggleKey: 点击该盒子触发看板 onToggle(toggleKey)(如 ALU 点 MUX 切换运算, 免去远处端子+长线)
      hwMeta: { name: label, cls: 'Box', bodyText: sub ? `${label}\n${sub}` : label, cssClass: 'node', toggleKey },
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

  /** 连网表: from 驱动(可多源), to 负载; 颜色按值/种类自动(null 端口自动忽略)。
   *  kind: sig 信号(1 绿流动, 0 灰) / vdd 电源红 / gnd 接地黑 /
   *        ctrl 控制信号(固定色、无流动, 不表示电流 —— 如 CMOS 栅极输入) */
  net(name: string, val: number, kind: NetKind, from: PortRef | PortRef[], to: (PortRef | null)[]) {
    const cssStyle =
      (kind === 'vdd' ? 'stroke:#16a34a;stroke-width:2.2' :
      kind === 'gnd' ? 'stroke:#1f2937;stroke-width:2' :
      kind === 'ctrl' ? 'stroke:#3b82f6;stroke-width:2' :
      val === 1 ? 'stroke:#16a34a;stroke-width:2.2' : 'stroke:#64748b;stroke-width:1.6') + ';fill:none';
    const srcs = (Array.isArray(from[0]) ? (from as PortRef[]) : [from as PortRef]);
    this.edges.push({
      id: `e${this.eid++}`,
      sources: srcs.map(([n, p]) => [n, p]),
      targets: to.filter((t): t is PortRef => !!t).map(([n, p]) => [n, p]),
      hwMeta: {
        name,
        kind,
        cssStyle,
      },
    });
  }

  /**
   * 电流传播(CMOS): 端子—端子通路模型。
   *  端子 = VDD / GND / 输出端子(out_, 每个输出各算一个端子; 输入 in_ 不算端子)。
   *  无向图 = 导线(同一 net 内端口全互连) + 导通管源漏(NORTH↔SOUTH, 栅极 WEST 绝缘不参与)。
   *  某段导线/某只管子当且仅当它位于某条「两个不同端子之间、只经导通管」的简单通路上时才有电流(cur):
   *  上拉导通 VDD→Y / 下拉导通 Y→GND / 开关直通 VDD→GND 记 cur;
   *  截止管相连的死端 stub(只连单侧端子、无对侧通路)无电流 → 灰。
   *  ctrl 网表(蓝色栅极控制信号)不表示电流, 保持原样。
   * 之后渲染层据此上色: cur 绿色流动, 非 cur 灰, ctrl 保持蓝。
   */
  static applyCurrent(graph: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    children?: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    edges?: any[];
  }) {
    const nodes = graph.children ?? [];
    const edges = graph.edges ?? [];
    // —— 端口 / 管子 / 端子索引 ——
    const portNode = new Map<string, unknown>();
    // 导通管源漏配对(NORTH↔SOUTH); 栅极(WEST)绝缘, 不建边
    const fetSib = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetOfPort = new Map<string, any>();
    const termKey = new Map<string, string>();
    for (const n of nodes) {
      const cls = n.hwMeta?.cls;
      const name = n.hwMeta?.name;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ports: any[] = n.ports ?? [];
      for (const p of ports) portNode.set(p.id, n);
      if (cls === 'Mos') {
        for (const p of ports) fetOfPort.set(p.id, n);
        if (n.hwMeta?.on) {
          const north = ports.find((p) => p.properties?.side === 'NORTH');
          const south = ports.find((p) => p.properties?.side === 'SOUTH');
          if (north && south) {
            fetSib.set(north.id, south.id);
            fetSib.set(south.id, north.id);
          }
        }
      }
      if (cls === 'Power' && (name === 'VDD' || name === 'GND')) {
        for (const p of ports) termKey.set(p.id, name as string);
      } else if (typeof n.id === 'string' && n.id.startsWith('out_')) {
        for (const p of ports) termKey.set(p.id, `OUT:${n.id}`);
      }
    }
    // —— 参与电流计算的导线网(ctrl 除外) ——
    const nets = edges.filter((e) => e.hwMeta?.kind !== 'ctrl');
    const netPorts = new Map<string, string[]>();
    for (const e of nets) {
      const ps: [string, string][] = [...(e.sources ?? []), ...(e.targets ?? [])];
      netPorts.set(e.id, ps.map(([, pid]) => pid).filter((pid) => portNode.has(pid)));
    }
    // 无向 BFS: start 在「去掉 excluded 后」能到达的端子 key 集合
    const reach = (
      start: string,
      excludedWire: { net: string; a: string; b: string } | null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      excludedFet: any | null,
    ): Set<string> => {
      const seen = new Set<string>([start]);
      const q: string[] = [start];
      const keys = new Set<string>();
      while (q.length) {
        const u = q.shift() as string;
        const k = termKey.get(u);
        if (k) keys.add(k);
        // 导线邻居: 同 net 内其他端口(被去掉的那对除外)
        for (const e of nets) {
          const arr = netPorts.get(e.id) ?? [];
          if (!arr.includes(u)) continue;
          for (const v of arr) {
            if (v === u) continue;
            if (excludedWire && e.id === excludedWire.net &&
              ((u === excludedWire.a && v === excludedWire.b) || (u === excludedWire.b && v === excludedWire.a))) continue;
            if (!seen.has(v)) { seen.add(v); q.push(v); }
          }
        }
        // 开关邻居: 导通管另一侧源漏
        const s = fetSib.get(u);
        if (s && !seen.has(s) && fetOfPort.get(u) !== excludedFet) {
          seen.add(s);
          q.push(s);
        }
      }
      return keys;
    };
    // —— 上色: 「有电」= 该网与 VDD 连通(经导通管) → 绿色实线; 否则灰 ——
    // 与 VDD 连通 = 该网处于高电平; 被截止管隔断的支路不再是高电平 → 灰。
    // 栅极控制线保持蓝; 地线深灰; 全程无动画。
    for (const e of nets) {
      const arr = netPorts.get(e.id) ?? [];
      let hot = false;
      for (const p of arr) { if (reach(p, null, null).has('VDD')) { hot = true; break; } }
      e.hwMeta = e.hwMeta ?? {};
      e.hwMeta.hot = hot;
    }
    for (const e of edges) {
      const meta = e.hwMeta ?? {};
      if (meta.kind === 'ctrl') continue;
      if (meta.kind === 'gnd') { meta.cssStyle = 'stroke:#1f2937;stroke-width:2;fill:none'; meta.cssClass = ''; continue; }
      meta.cssStyle = meta.hot
        ? 'stroke:#16a34a;stroke-width:2.2;fill:none'
        : 'stroke:#64748b;stroke-width:1.8;fill:none';
      meta.cssClass = '';
    }
    return graph;
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
