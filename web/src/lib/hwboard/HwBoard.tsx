import { useEffect, useMemo, useRef, useState } from 'react';
import { ensureHwVendor, hwGlobal } from './vendor';
import { registerCustomRenderers } from './renderers';
import 'd3-hwschematic/dist/d3-hwschematic.css';
import './hwboard.css';

// 统一电路看板: d3-hwschematic 只读渲染(无编辑 UI)。
// 电路 = ELK JSON 数据(程序控制流程), 符号 = 标准库(内置门 + 自定义晶体管/电源/端子),
// 数值变化重建 JSON 重渲染; 输入端子点击翻转经 onToggle 回调。
// 引擎以经典脚本加载(老库依赖草率模式, 不走打包器)。
//
// 结构/实例生命周期: 外层按「结构签名」给内层 Board 加 React key。
//  - 结构切换(如反相器→NAND, 节点 id 集变化) → key 变 → Board 卸载重挂,
//    得到全新 svg + 全新 HwSchematic(干净冷启动, 彻底释放旧 ELK worker)。
//    同一实例复用 + 换不同结构图, 会因库内残留 _d3ObjMap 崩(sections undefined),
//    或 worker 未释放导致新图 bindData 卡住/空白 —— 必须重挂规避。
//  - 仅值变化(id 不变) → key 不变 → Board 复用, bindData 同结构(安全, 不闪烁)。
export function HwBoard({
  json, height = 480, onToggle,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  height?: number;
  onToggle?: (key: string) => void;
}) {
  // 结构签名 = 顶层节点 id 集合(elk.ts 用实例内计数, 结构不同则 id 集不同)
  const structKey = useMemo(
    () => (json?.children ?? []).map((c: { id?: string }) => c.id).join(','),
    [json],
  );
  return (
    <Board key={structKey} json={json} height={height} onToggle={onToggle} />
  );
}

// 单块看板: 每次挂载建一个全新 HwSchematic(生命周期=一次结构签名)。
function Board({
  json, height, onToggle,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  height: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onToggle?: (key: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schRef = useRef<any>(null);
  const toggleRef = useRef(onToggle);
  toggleRef.current = onToggle;
  const [ready, setReady] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  // 创建 HwSchematic: 每块板(每次挂载)只建一次。
  useEffect(() => {
    let dead = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sch: any = null;
    ensureHwVendor().then(() => {
      if (dead) return;
      const svgDom = svgRef.current;
      if (!svgDom) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d3 = hwGlobal() as any;
      sch = new d3.HwSchematic(d3.select(svgDom));
      registerCustomRenderers(sch, d3.select);
      schRef.current = sch;
      setReady(true);
    }).catch((e: unknown) => {
      if (!dead) setErrMsg(e instanceof Error ? e.message : String(e));
    });
    return () => {
      dead = true;
      try { sch?.terminate?.(); } catch { /* ignore */ }
      schRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 每次 json 变化(同结构: 值/尺寸变化)在既有实例上 bindData。
  useEffect(() => {
    const sch = schRef.current;
    const svgDom = svgRef.current;
    if (!sch || !svgDom || !json || !ready) return;
    // 每次渲染前按当前 height 定尺寸(布局引擎读 style 宽度, 百分比会被 parseInt 截断)。
    // 宽度必须取自父容器而非 svg.clientWidth: svg 自身带 2px 边框, 用 clientWidth 会
    // 每次 -2px 递归收缩(点击一次开关画布就窄一点)。
    const parent = svgDom.parentElement;
    const W = Math.max(320, (parent ? parent.clientWidth : 0) || svgDom.clientWidth || 800);
    svgDom.setAttribute('width', String(W));
    svgDom.setAttribute('height', String(height));
    svgDom.style.width = `${W}px`;
    let alive = true;
    sch.bindData(json).then(() => {
      if (!alive || !svgDom) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d3 = hwGlobal() as any;
      const root = d3.select(svgDom);
      // 可见连线: 把网表颜色/流动画搬到可见 .link 上。
      // 库把 cssStyle/cssClass 放在 hwMeta.parent.hwMeta(hyper edge 展开后), 直接读 hwMeta 读不到。
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodeById: Record<string, any> = {};
      for (const c of (json?.children ?? []) as { id?: string }[]) {
        if (c.id) nodeById[c.id] = c;
      }
      root.selectAll('path.link').each(function (this: Element, d: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hwMeta?: any;
        source?: string;
        target?: string;
      }) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const el = d3.select(this as any);
        const parent = (d?.hwMeta?.parent ?? {}) as { hwMeta?: { cssStyle?: string; cssClass?: string; cur?: boolean } };
        const meta = parent.hwMeta ?? (d?.hwMeta ?? {});
        if (meta.cssStyle) {
          // 电流(cur)超边里, 不流动的支路:
          //  - 连接到「截止管」: 电流只流经开的开关, 共享电源/地线到截止管那段保持灰
          //  - 连接到「输出端子(out_)」: 电流从 VDD 流到断点为止, 输出端子只是观测点, 引线不流动
          if (meta.cur) {
            const src = nodeById[(d as { source?: string }).source ?? ''];
            const tgt = nodeById[(d as { target?: string }).target ?? ''];
            const srcId = (d as { source?: string }).source ?? '';
            const tgtId = (d as { target?: string }).target ?? '';
            const blocked =
              (src?.hwMeta?.cls === 'Mos' && !src.hwMeta.on) ||
              (tgt?.hwMeta?.cls === 'Mos' && !tgt.hwMeta.on) ||
              srcId.startsWith('out_') ||
              tgtId.startsWith('out_');
            if (blocked) {
              // 无电流流经的支路: 保持普通灰线
              el.attr('style', 'stroke:#64748b;stroke-width:1.8;fill:none');
              el.attr('class', 'link');
              return;
            }
          }
          el.attr('style', meta.cssStyle);
        }
        if (meta.cssClass) el.attr('class', `link ${meta.cssClass}`);
      });
      // 输入端子挂点击(节点 id 以 in_ 开头) + 声明了 toggleKey 的盒子(如 ALU 的 MUX)
      root
        .selectAll('g')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((d: any) =>
          (!!d?.id && String(d.id).startsWith('in_')) || !!d?.hwMeta?.toggleKey,
        )
        .style('cursor', 'pointer')
        .on('click.toggle', (_ev: unknown, d: { id: string; hwMeta?: { toggleKey?: string } }) => {
          if (d?.hwMeta?.toggleKey) {
            toggleRef.current?.(d.hwMeta.toggleKey);
            return;
          }
          const m = /^in_(.+)_\d+$/.exec(d.id);
          if (m) toggleRef.current?.(m[1]);
        });
    }).catch((e: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[HwBoard] bindData failed:', e instanceof Error ? (e.stack || e.message).slice(0, 400) : String(e));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json, ready, height]);

  return (
    <div style={{ position: 'relative' }}>
      {!ready && !errMsg && (
        <div style={{ width: '100%', height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, color: '#64748b', fontSize: 13 }}>
          看板引擎加载中…
        </div>
      )}
      {errMsg && (
        <div style={{ width: '100%', height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, color: '#b91c1c', fontSize: 13 }}>
          {errMsg}
        </div>
      )}
      <svg
        ref={svgRef}
        style={{ width: '100%', height, display: ready ? 'block' : 'none', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}
      />
    </div>
  );
}
