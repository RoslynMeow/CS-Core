import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';

type Cfg = { text: string; pattern: string };
type Scene = { text: string; pattern: string; next: number[]; ti: number; pi: number; phase: 'next' | 'match' | 'done'; found: number; note: string };
const DEFAULT_CFG: Cfg = { text: 'abababcababa', pattern: 'ababa' };

function nextOf(p: string): number[] {
  const n = p.length; const next = new Array(n).fill(0);
  let k = 0;
  for (let i = 1; i < n; i++) {
    while (k > 0 && p[i] !== p[k]) k = next[k - 1];
    if (p[i] === p[k]) k++;
    next[i] = k;
  }
  return next;
}

function gen(cfg: Cfg): Frame<Scene>[] {
  const text = (cfg.text || '').replace(/[^\x00-\x7F]/g, '').slice(0, 24);
  const pattern = (cfg.pattern || '').replace(/[^\x00-\x7F]/g, '').slice(0, 12);
  const m = pattern.length;
  if (!text || !m) return [{ line: 0, caption: T('输入文本与模式串', 'Enter text and pattern'), scene: { text, pattern, next: [], ti: -1, pi: -1, phase: 'next', found: -1, note: '' } }];
  const next = nextOf(pattern);
  const frames: Frame<Scene>[] = [];
  const base = (): Scene => ({ text, pattern, next, ti: -1, pi: -1, phase: 'next', found: -1, note: '' });
  // 1) 构造 next[]
  frames.push({ line: 0, caption: T('构造 next[] 失效函数', 'Build failure function next[]'), scene: { ...base(), note: 'next[i] = 最长相等前后缀长度' } });
  let k = 0;
  for (let i = 1; i < m; i++) {
    while (k > 0 && pattern[i] !== pattern[k]) k = next[k - 1];
    if (pattern[i] === pattern[k]) k++;
    next[i] = k;
    frames.push({ line: 1, caption: T(`$next[${i}]=${k}$`, `next[${i}]=${k}`), scene: { ...base(), pi: i, phase: 'next', note: `p[${i}]=${pattern[i]}` } });
  }
  frames.push({ line: 2, caption: T(`$next=[${next.join(',')}]$`, `next=[${next.join(',')}]`), scene: { ...base(), phase: 'match', note: '' } });
  // 2) 匹配
  let j = 0;
  for (let i = 0; i < text.length; i++) {
    frames.push({ line: 3, caption: T(`比较 $T[${i}]=${text[i]}$ 与 $P[${j}]=${pattern[j]}$`, `compare T[${i}] vs P[${j}]`), scene: { ...base(), ti: i, pi: j, phase: 'match', note: '' } });
    while (j > 0 && text[i] !== pattern[j]) {
      j = next[j - 1];
      frames.push({ line: 4, caption: T(`失配 → $j\\gets next[${j}]=${next[j] ?? 0}$`, `mismatch → j = next = ${next[j] ?? 0}`), scene: { ...base(), ti: i, pi: j, phase: 'match', note: '回退 j' } });
    }
    if (text[i] === pattern[j]) j++;
    if (j === m) {
      const pos = i - m + 1;
      frames.push({ line: 5, caption: T(`命中！位置 $${pos}$`, `found at ${pos}`), scene: { ...base(), ti: i, pi: j, phase: 'done', found: pos, note: '' } });
      return frames;
    }
  }
  frames.push({ line: 6, caption: T('未找到匹配', 'not found'), scene: { ...base(), phase: 'done', found: -1, note: '' } });
  return frames;
}

function KmpRender({ scene: _scene }: any) {
  const s = ((_scene ?? {}) as Scene);
  if (!s || !s.text) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>输入文本与模式串</div> as unknown as never;
  const cell = (ch: string, active: boolean, color = '#6366f1') => (
    <div style={{ width: 26, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${active ? color : '#e2e8f0'}`, background: active ? '#eef2ff' : '#fff', borderRadius: 6, fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: active ? color : '#334155' }}>{ch}</div>
  );
  const winStart = s.ti >= 0 && s.pi >= 0 ? s.ti - s.pi : -1;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
        {s.text.split('').map((ch, i) => <div key={i}>{cell(ch, i === s.ti, '#0ea5e9')}</div>)}
      </div>
      <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
        {s.pattern.split('').map((ch, i) => {
          const overlap = winStart >= 0 && i >= 0;
          return <div key={i} style={{ marginLeft: i === 0 ? (winStart > 0 ? winStart * 29 : 0) : 0, opacity: overlap || winStart < 0 ? 1 : 0.15 }}>{cell(ch, i === s.pi, '#4f46e5')}</div>;
        })}
      </div>
      {s.next && s.next.length > 0 && (
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
          {s.next.map((v, i) => (
            <div key={i} style={{ width: 26, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: 'ui-monospace, monospace', color: i === s.pi ? '#4338ca' : '#94a3b8', borderTop: '1px dashed #cbd5e1' }}>{v}</div>
          ))}
        </div>
      )}
      <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, color: s.phase === 'done' && s.found >= 0 ? '#15803d' : '#475569' }}>
        {s.phase === 'done' ? (s.found >= 0 ? `命中位置 ${s.found}` : '未匹配') : (s.note || '')}
      </div>
    </div>
  ) as unknown as never;
}

export const kmpModule: ModuleDef<Scene, Cfg> = {
  id: 'kmp',
  title: T('串匹配 KMP', 'KMP'),
  desc: T('先构造 next[] 失效函数；失配时按 $next$ 回退模式串指针，$O(n+m)$。', 'Build next[]; on mismatch fall back j by next[] — O(n+m).'),
  tags: ['data-structures', 'string'],
  defaultConfig: DEFAULT_CFG,
  Controls({ config, onChange, t }: any) {
    const isZh = t(T('中文', 'en')) !== 'en';
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <span>{isZh ? '文本 T' : 'Text'}</span>
          <input className="txt" value={config.text} onChange={(e) => onChange({ ...config, text: e.target.value })} style={{ width: 200, fontFamily: 'ui-monospace, monospace' }} />
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <span>{isZh ? '模式 P' : 'Pattern'}</span>
          <input className="txt" value={config.pattern} onChange={(e) => onChange({ ...config, pattern: e.target.value })} style={{ width: 120, fontFamily: 'ui-monospace, monospace' }} />
        </label>
      </div>
    );
  },
  code: [
    T('$next \\gets$ 失效函数 // 最长相等前后缀', '$next$: failure function'),
    T('$next[i] \\gets$ …', '$next[i] \\gets$ …'),
    T('// 匹配：对每个 $T[i]$', '// match'),
    T('if $T[i] = P[j]$: $i{+}{+}, j{+}{+}$', 'if equal: i++, j++'),
    T('else $j \\gets next[j-1]$ // 回退, $i$ 不回退', 'else j = next[j-1]'),
    T('if $j = m$: return $i-m$ // 命中', 'if j==m: found'),
    T('return $-1$ // 未找到', 'return -1'),
  ],
  generate: gen,
  Render: KmpRender as never,
};
