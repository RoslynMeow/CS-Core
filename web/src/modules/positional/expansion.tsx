import { T } from '../../i18n/lang';
import type { ModuleDef, Frame } from '../../engine/types';
import { MathText } from '../../lib/tex';

type Cfg = { base: number; numeral: string };
type Scene = { base: number; digits: number[]; value: number; highlight: number | null; partials: number[] };

function parseDigits(numeral: string, base: number): number[] | null {
  const s = numeral.trim();
  if (!s) return null;
  const msb = s.split('').map(ch => {
    const v = parseInt(ch, base);
    return Number.isNaN(v) ? NaN : v;
  });
  if (msb.some(v => Number.isNaN(v) || v < 0 || v >= base)) return null;
  return msb.reverse();
}

export const expansionModule: ModuleDef<Scene, Cfg> = {
  id: 'positional-expansion',
  title: T('按权展开', 'Polynomial Expansion'),
  desc: T('数码序列 $\\{P_i\\}$ 按位权 $n^i$ 展开求值：$y=\\sum P_i\\cdot n^i$，逐位累加演示守恒。', 'Expand $\\{P_i\\}$ by $y=\\sum P_i n^i$, accumulating term by term.'),
  tags: ['data-structures'],
  defaultConfig: { base: 2, numeral: '1011' },
  Controls({ config, onChange }) {
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>
          base <input className="txt" type="number" min={2} max={16} value={config.base} onChange={e => onChange({ ...config, base: Math.max(2, Math.min(16, Number(e.target.value) || 2)) })} style={{ width: 72 }} />
        </label>
        <label>
          numeral <input className="txt" value={config.numeral} onChange={e => onChange({ ...config, numeral: e.target.value })} style={{ width: 130 }} />
        </label>
      </div>
    ) as unknown as never;
  },
  code: [
    T('$y \\gets 0$', '$y \\gets 0$'),
    T('for $i \\gets 0$ to $k-1$:', 'for $i \\gets 0$ to $k-1$:'),
    T('  $y \\gets y + P_i\\cdot n^i$  // 累加第 $i$ 位', '  $y \\gets y + P_i\\cdot n^i$  // accumulate digit $i$'),
    T('return $y$', 'return $y$'),
  ],
  generate(cfg) {
    const lsb = parseDigits(cfg.numeral, cfg.base);
    const frames: Frame<Scene>[] = [];
    if (!lsb) {
      frames.push({ line: 0, caption: T(`⚠ 数码不合法：需 $P_i\\in[0,${cfg.base})$`, `⚠ Invalid digits: need $P_i\\in[0,${cfg.base})$`), scene: { base: cfg.base, digits: [], value: 0, highlight: null, partials: [] } });
      return frames;
    }
    const k = lsb.length;
    let y = 0;
    const partials: number[] = [];
    frames.push({ line: 0, caption: T(`初始化 $y=0$，$n=${cfg.base}$，数码 $P=${cfg.numeral}$`, `Init $y=0$, $n=${cfg.base}$, digits $P=${cfg.numeral}$`), scene: { base: cfg.base, digits: lsb.slice().reverse(), value: 0, highlight: null, partials: [] } });
    for (let i = 0; i < k; i++) {
      const term = lsb[i] * Math.pow(cfg.base, i);
      frames.push({ line: 1, caption: T(`进入 $i=${i}$，$P_${i}=${lsb[i]}$，位权 $n^{${i}}=${Math.pow(cfg.base, i)}$`, `Loop $i=${i}$: $P_${i}=${lsb[i]}$, weight $n^{${i}}=${Math.pow(cfg.base, i)}$`), scene: { base: cfg.base, digits: lsb.slice().reverse(), value: y, highlight: k - 1 - i, partials: [...partials] } });
      y += term;
      partials.push(term);
      frames.push({ line: 2, caption: T(`累加 $y \\gets ${y - term} + ${lsb[i]}\\cdot${cfg.base}^{${i}} = ${y}$`, `Accum $y \\gets ${y - term} + ${lsb[i]}\\cdot${cfg.base}^{${i}} = ${y}$`), scene: { base: cfg.base, digits: lsb.slice().reverse(), value: y, highlight: k - 1 - i, partials: [...partials] } });
    }
    frames.push({ line: 3, caption: T(`完成：$(${cfg.numeral})_{${cfg.base}} = ${y}_{10}$，验证 $y=\\sum P_i n^i$`, `Done: $(${cfg.numeral})_{${cfg.base}} = ${y}_{10}$, $y=\\sum P_i n^i$`), scene: { base: cfg.base, digits: lsb.slice().reverse(), value: y, highlight: null, partials } });
    return frames;
  },
  Render({ scene }) {
    return (
      <div>
        <div className="digits">
          {scene.digits.map((d, i) => {
            const lsbIdx = scene.digits.length - 1 - i;
            const active = scene.highlight === i;
            return (
              <div key={i} className={`digit ${active ? 'active' : ''}`}>
                <small>
                  <MathText text={`$n^{${lsbIdx}}$`} />
                </small>
                <strong>{d}</strong>
                <small>
                  <MathText text={`$\\times ${scene.base}^{${lsbIdx}}$`} />
                </small>
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: 'center', marginTop: 10, fontSize: 13 }}>
          <MathText text={`$y$ = ${scene.value}`} />
          {scene.partials.length > 0 && <span style={{ marginLeft: 8, color: '#64748b' }}>({scene.partials.join(' + ')})</span>}
        </div>
        <div style={{ textAlign: 'center', marginTop: 6, fontSize: 12, color: '#64748b' }}>
          <MathText text={'$y = \\sum P_i\\cdot n^i$'} />
        </div>
      </div>
    ) as unknown as never;
  },
};
