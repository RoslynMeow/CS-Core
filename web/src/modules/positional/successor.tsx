import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';

type Cfg = { base: number; numeral: string };
type Scene = { digits: number[]; i: number | null; carry: boolean };

function parseLSB(s: string, base: number): number[] | null {
  const msb = s.trim().split('').map(ch => parseInt(ch, base));
  if (msb.length === 0 || msb.some(v => Number.isNaN(v) || v < 0 || v >= base)) return null;
  return msb.reverse();
}

export const successorModule: ModuleDef<Scene, Cfg> = {
  id: 'positional-successor',
  title: T('后继与进位', 'Successor & Carry'),
  desc: T('演示 $P+1$ 的进位链：$P_i=n-1$ 则清零进位，否则 $P_i+1$ 终止。', 'Demo $P+1$: if $P_i=n-1$ zero and carry, else $P_i+1$ stops.'),
  tags: ['data-structures'],
  defaultConfig: { base: 10, numeral: '19' },
  Controls({ config, onChange }) {
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>
          base <input className="txt" type="number" min={2} max={16} value={config.base} onChange={e => onChange({ ...config, base: Math.max(2, Math.min(16, Number(e.target.value) || 10)) })} style={{ width: 72 }} />
        </label>
        <label>
          numeral <input className="txt" value={config.numeral} onChange={e => onChange({ ...config, numeral: e.target.value })} style={{ width: 130 }} />
        </label>
      </div>
    ) as unknown as never;
  },
  code: [
    T('$i \\gets 0$', '$i \\gets 0$'),
    T('while $P_i = n-1$:', 'while $P_i = n-1$:'),
    T('  $P_i \\gets 0$', '  $P_i \\gets 0$'),
    T('  $i \\gets i+1$', '  $i \\gets i+1$'),
    T('$P_i \\gets P_i+1$', '$P_i \\gets P_i+1$'),
  ],
  generate(cfg) {
    const orig = parseLSB(cfg.numeral, cfg.base);
    const frames: Frame<Scene>[] = [];
    if (!orig) {
      frames.push({ line: 0, caption: T('! 数码不合法', '! Invalid digits'), scene: { digits: [], i: null, carry: false } });
      return frames;
    }
    const p = [...orig, 0];
    const trim = (a: number[]) => {
      let k = a.length;
      while (k > 1 && a[k - 1] === 0) k--;
      return a.slice(0, k).reverse();
    };
    frames.push({ line: 0, caption: T(`$i\\gets0$，$P=${cfg.numeral}$，$n=${cfg.base}$`, `$i\\gets0$, $P=${cfg.numeral}$, $n=${cfg.base}$`), scene: { digits: trim(p), i: 0, carry: false } });
    let i = 0;
    while (true) {
      const pi = p[i] ?? 0;
      frames.push({ line: 1, caption: T(`判断 $P_${i}=${pi}$ 是否 $=n-1=${cfg.base - 1}$`, `Check $P_${i}=${pi}$ vs $n-1=${cfg.base - 1}$`), scene: { digits: trim(p), i, carry: pi === cfg.base - 1 } });
      if (pi === cfg.base - 1) {
        p[i] = 0;
        frames.push({ line: 2, caption: T(`$P_${i}=n-1$，清零 $P_${i}\\gets0$ 产生进位`, `$P_${i}=n-1$, zero $P_${i}\\gets0$ carry`), scene: { digits: trim(p), i, carry: true } });
        i++;
        frames.push({ line: 3, caption: T(`$i\\gets${i}$`, `$i\\gets${i}$`), scene: { digits: trim(p), i, carry: true } });
        if (i >= p.length) p.push(0);
      } else break;
    }
    p[i] = (p[i] ?? 0) + 1;
    frames.push({ line: 4, caption: T(`$P_${i}\\gets${p[i] - 1}+1=${p[i]}$ 终止`, `$P_${i}\\gets${p[i] - 1}+1=${p[i]}$ done`), scene: { digits: trim(p), i, carry: false } });
    return frames;
  },
  Render({ scene }) {
    return (
      <div className="digits">
        {scene.digits.map((d, idx) => {
          const lsb = scene.digits.length - 1 - idx;
          const active = scene.i !== null && lsb === scene.i;
          return (
            <div key={idx} className={`digit ${active ? 'active' : ''}`} style={active && scene.carry ? { background: '#fef3c7', borderColor: '#f59e0b' } : undefined}>
              <small>{lsb}</small>
              <strong>{d}</strong>
            </div>
          );
        })}
      </div>
    ) as unknown as never;
  },
};
