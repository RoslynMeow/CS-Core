// select 取全局 d3(经典脚本加载, 不走打包器)。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let selImpl: ((el: any) => any) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const select = (el: any): any => {
  if (!selImpl) throw new Error('d3 select not bound');
  return selImpl(el);
};

// 自定义节点渲染器(d3-hwschematic 官方扩展�?: 标准库没有晶体管/电源/端子,
// 在此按标准画法定义一次成库。写法仿照内�?OperatorNodeRenderer�?
const GREEN = '#16a34a';
const GRAY = '#64748b';
const RED = '#dc2626';
const DARK = '#1f2937';



class FetRenderer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private sch: any) { void this.sch; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selector = (n: any) => !!n?.hwMeta && n.hwMeta.cls === 'Mos';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prepare = (n: any) => { n.width = 30; n.height = 48; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render = (root: any, nodeG: any) => {
    void root;
    // class="node" 必需: 库用 selectAll('.node') 做 d3 join 更新节点,
    // 无此 class 则每次 bindData 都当全新节点追加, 旧图不清 → 点击开关叠画。
    // 同时让节点套上 .d3-hwschematic g.node 主题样式。
    nodeG.attr('class', 'node');
    nodeG.attr('transform', (d: { x: number; y: number }) => `translate(${d.x} ${d.y})`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeG.each(function (this: Element, d: any) {
      const g = select(this as Element);
      const on = !!d.hwMeta.on;
      const col = on ? GREEN : GRAY;
      const nmos = d.hwMeta.name === 'NMOS';
      // D/S 细引线(上下各一段)
      g.append('line').attr('x1', 15).attr('y1', 0).attr('x2', 15).attr('y2', 12).attr('stroke', col).attr('stroke-width', 1.6);
      g.append('line').attr('x1', 15).attr('y1', 36).attr('x2', 15).attr('y2', 48).attr('stroke', col).attr('stroke-width', 1.6);
      // 沟道短粗棒(一粗一细才是管子)
      g.append('line').attr('x1', 15).attr('y1', 12).attr('x2', 15).attr('y2', 36).attr('stroke', col).attr('stroke-width', 4).attr('stroke-linecap', 'butt');
      // 栅极(颜色跟栅信号)
      const gc = d.hwMeta.gateOn ? GREEN : GRAY;
      g.append('line').attr('x1', 2).attr('y1', 24).attr('x2', 11).attr('y2', 24).attr('stroke', gc).attr('stroke-width', 1.8);
      // 源极箭头: NMOS 在下指向�?朝沟�?, PMOS 在上指向�?背离沟道)
      g.append('polygon')
        .attr('points', nmos ? '10,44 20,44 15,35' : '10,13 20,13 15,4')
        .attr('fill', col).attr('stroke', 'none');
      // 引脚注字
      const fs = (x: number, y: number, t: string) => {
        g.append('text').attr('x', x).attr('y', y).attr('font-size', 8)
          .attr('font-family', 'monospace').attr('fill', on ? '#059669' : '#475569').text(t);
      };
      fs(22, 8, nmos ? 'D' : 'S');
      fs(22, 44, nmos ? 'S' : 'D');
      fs(0, 20, 'G');
    });
  };
}

class PowerRenderer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private sch: any) { void this.sch; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selector = (n: any) => !!n?.hwMeta && n.hwMeta.cls === 'Power';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prepare = (n: any) => {
    if (n.hwMeta.name === 'VDD') { n.width = 30; n.height = 16; }
    else { n.width = 26; n.height = 30; }
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render = (root: any, nodeG: any) => {
    void root;
    nodeG.attr('class', 'node');
    nodeG.attr('transform', (d: { x: number; y: number }) => `translate(${d.x} ${d.y})`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeG.each(function (this: Element, d: any) {
      const g = select(this as Element);
      if (d.hwMeta.name === 'VDD') {
        g.append('rect').attr('x', 3).attr('y', 2).attr('width', 24).attr('height', 5).attr('fill', RED).attr('stroke', 'none');
        g.append('line').attr('x1', 15).attr('y1', 7).attr('x2', 15).attr('y2', 16).attr('stroke', RED).attr('stroke-width', 2);
        g.append('text').attr('x', 15).attr('y', -2).attr('font-size', 9).attr('text-anchor', 'middle').attr('font-family', 'monospace').attr('fill', RED).text('Vdd');
      } else {
        g.append('line').attr('x1', 13).attr('y1', 0).attr('x2', 13).attr('y2', 12).attr('stroke', DARK).attr('stroke-width', 2);
        g.append('line').attr('x1', 1).attr('y1', 12).attr('x2', 25).attr('y2', 12).attr('stroke', DARK).attr('stroke-width', 2);
        g.append('line').attr('x1', 5).attr('y1', 18).attr('x2', 21).attr('y2', 18).attr('stroke', DARK).attr('stroke-width', 1.6);
        g.append('line').attr('x1', 9).attr('y1', 24).attr('x2', 17).attr('y2', 24).attr('stroke', DARK).attr('stroke-width', 1.3);
      }
    });
  };
}

class TermRenderer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private sch: any) { void this.sch; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selector = (n: any) => !!n?.hwMeta && n.hwMeta.cls === 'Term';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prepare = (n: any) => { n.width = 22; n.height = 22; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render = (root: any, nodeG: any) => {
    void root;
    nodeG.attr('class', 'node');
    nodeG.attr('transform', (d: { x: number; y: number }) => `translate(${d.x} ${d.y})`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeG.each(function (this: Element, d: any) {
      const g = select(this as Element);
      const on = d.hwMeta.val === 1;
      g.append('circle').attr('cx', 11).attr('cy', 11).attr('r', 8)
        .attr('fill', on ? '#dcfce7' : '#ffffff')
        .attr('stroke', on ? GREEN : GRAY).attr('stroke-width', 1.8);
      g.append('text').attr('x', 11).attr('y', 14.5).attr('font-size', 10).attr('font-weight', 'bold')
        .attr('text-anchor', 'middle').attr('font-family', 'monospace')
        .attr('fill', on ? '#15803d' : '#475569').text(String(d.hwMeta.val ?? ''));
      if (d.hwMeta.name) {
        g.append('text').attr('x', 11).attr('y', 32).attr('font-size', 9).attr('text-anchor', 'middle')
          .attr('font-family', 'monospace').attr('fill', '#475569').text(d.hwMeta.name);
      }
    });
  };
}

export function registerCustomRenderers(
  sch: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeRenderers: { registerRenderer: (r: any) => void };
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectFn: (el: any) => any,
) {
  selImpl = selectFn;
  sch.nodeRenderers.registerRenderer(new FetRenderer(sch));
  sch.nodeRenderers.registerRenderer(new PowerRenderer(sch));
  sch.nodeRenderers.registerRenderer(new TermRenderer(sch));
}
