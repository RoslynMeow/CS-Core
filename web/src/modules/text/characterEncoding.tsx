import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { MathText } from '../../lib/tex';

type Mode = 'ascii' | 'utf8';
type Cfg = { mode: Mode; char: string };
const DEFAULT_CFG: Cfg = { mode: 'utf8', char: 'A' };
type Scene = {
  mode: Mode;
  char: string;
  cp: number | null;
  cpHex: string;
  cpBin: string;
  asciiByte: string | null; // 8 bits if ascii
  utf8Bytes: string[]; // each as 8-bit string
  bytesHex: string[];
  kind: 'valid' | 'invalid' | 'non-ascii';
};

function toBin(n: number, len: number) { return n.toString(2).padStart(len, '0'); }

function build(char: string, mode: Mode): Scene | null {
  if (!char) return null;
  const cp = char.codePointAt(0) ?? null;
  if (cp === null) return null;
  const cpHex = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
  const cpBin = cp.toString(2);
  let asciiByte: string | null = null;
  if (cp <= 0x7f) asciiByte = '0' + toBin(cp, 7);
  const utf8Bytes: string[] = [];
  const bytesHex: string[] = [];
  if (cp <= 0x7f) {
    const b = '0' + toBin(cp, 7);
    utf8Bytes.push(b);
    bytesHex.push(parseInt(b, 2).toString(16).toUpperCase().padStart(2, '0'));
  } else if (cp <= 0x7ff) {
    const bin = toBin(cp, 11);
    const b1 = '110' + bin.slice(0, 5);
    const b2 = '10' + bin.slice(5);
    utf8Bytes.push(b1, b2);
    bytesHex.push(parseInt(b1, 2).toString(16).toUpperCase().padStart(2, '0'), parseInt(b2, 2).toString(16).toUpperCase().padStart(2, '0'));
  } else if (cp <= 0xffff) {
    const bin = toBin(cp, 16);
    const b1 = '1110' + bin.slice(0, 4);
    const b2 = '10' + bin.slice(4, 10);
    const b3 = '10' + bin.slice(10);
    utf8Bytes.push(b1, b2, b3);
    bytesHex.push(...utf8Bytes.map(b => parseInt(b, 2).toString(16).toUpperCase().padStart(2, '0')));
  } else if (cp <= 0x10ffff) {
    const bin = toBin(cp, 21);
    const b1 = '11110' + bin.slice(0, 3);
    const b2 = '10' + bin.slice(3, 9);
    const b3 = '10' + bin.slice(9, 15);
    const b4 = '10' + bin.slice(15);
    utf8Bytes.push(b1, b2, b3, b4);
    bytesHex.push(...utf8Bytes.map(b => parseInt(b, 2).toString(16).toUpperCase().padStart(2, '0')));
  }
  let kind: Scene['kind'] = 'valid';
  if (mode === 'ascii' && cp > 0x7f) kind = 'non-ascii';
  return { mode, char, cp, cpHex, cpBin, asciiByte, utf8Bytes, bytesHex, kind };
}

const CODE = {
  ascii: [
    T('$u \\gets codePoint(c)$ // $U+XXXX$', '$u \\gets codePoint(c)$'),
    T('if $u \\le 127$:', 'if $u \\le 127$:'),
    T('  $byte \\gets 0xxxxxxx$ // 7 位补 0', '  $byte \\gets 0xxxxxxx$'),
    T('else $\\text{非 ASCII}$ // 需 Unicode', 'else non-ASCII'),
  ] as never,
  utf8: [
    T('$u \\gets codePoint(c)$ // $U+XXXX$', '$u \\gets codePoint(c)$'),
    T('if $u \\le 0x7F$:', 'if $u \\le 0x7F$:'),
    T('  $bytes \\gets [0xxxxxxx]$ // 1 字节', '  $bytes \\gets [0xxxxxxx]$'),
    T('else if $u \\le 0x7FF$:', 'else if $u \\le 0x7FF$:'),
    T('  $bytes \\gets [110xxxxx,10xxxxxx]$ // 2 字节', '  $bytes \\gets [110xxxxx,10xxxxxx]$'),
    T('else if $u \\le 0xFFFF$:', 'else if $u \\le 0xFFFF$:'),
    T('  $bytes \\gets [1110xxxx,10xxxxxx,10xxxxxx]$ // 3 字节', '  $bytes \\gets [1110xxxx,10xxxxxx,10xxxxxx]$'),
    T('else $bytes \\gets [11110xxx,10xxxxxx,10xxxxxx,10xxxxxx]$ // 4 字节', 'else $bytes \\gets [11110xxx,10xxxxxx,10xxxxxx,10xxxxxx]$'),
  ] as never,
};

function gen(cfg: Cfg): Frame<Scene>[] {
  const frames: Frame<Scene>[] = [];
  const ch = cfg.char ? [...cfg.char][0] ?? '' : '';
  if (!ch) {
    return [{ line: 0, caption: T('输入一个字符', 'Input a character'), scene: { mode: cfg.mode, char: '', cp: null, cpHex: '', cpBin: '', asciiByte: null, utf8Bytes: [], bytesHex: [], kind: 'invalid' } }];
  }
  const full = build(ch, cfg.mode);
  if (!full) {
    return [{ line: 0, caption: T('! 无法解析字符', 'Invalid'), scene: { mode: cfg.mode, char: ch, cp: null, cpHex: '', cpBin: '', asciiByte: null, utf8Bytes: [], bytesHex: [], kind: 'invalid' } }];
  }
  // progressive: early frames hide bytes with ?
  const empty: Scene = { ...full, asciiByte: null, utf8Bytes: [], bytesHex: [] };
  if (cfg.mode === 'ascii') {
    frames.push({ line: 0, caption: T(`字符 $c=${ch}$，$u=${full.cpHex} = ${full.cp}$`, `char $c=${ch}$ $u=${full.cpHex}$`), scene: empty });
    frames.push({ line: 1, caption: T(full.cp! <= 127 ? `$u=${full.cp} \\le 127$ 判 ASCII` : `$u=${full.cp} >127$ 非 ASCII`, full.cp! <= 127 ? `$u<=127$` : `non-ASCII`), scene: empty });
    if (full.cp! <= 127) {
      frames.push({ line: 2, caption: T(`$byte gets 0${toBin(full.cp!, 7)}$ // $0x${full.cp!.toString(16).toUpperCase().padStart(2, '0')}$`, `byte 0${toBin(full.cp!, 7)}`), scene: full });
      frames.push({ line: 2, caption: T(`完成：$${ch}$ → $${full.asciiByte}$`, `Done`), scene: full });
    } else {
      frames.push({ line: 3, caption: T(`$${ch}$ 非 ASCII，需切 UTF-8`, `Need UTF-8`), scene: empty });
    }
    return frames;
  } else {
    const cp = full.cp!;
    frames.push({ line: 0, caption: T(`字符 $c=${ch}$，$u=${full.cpHex}$，$bin=${full.cpBin}$`, `char $c=${ch}$ $u=${full.cpHex}$`), scene: empty });
    if (cp <= 0x7f) {
      frames.push({ line: 1, caption: T(`$u=${cp} \\le 0x7F$ ? 是`, `$u<=0x7F$ yes`), scene: empty });
      frames.push({ line: 2, caption: T(`$bytes gets [0${toBin(cp, 7)}]$ // 1 字节`, `1 byte`), scene: full });
      frames.push({ line: 2, caption: T(`完成：$${ch}$ → 0x${full.bytesHex[0]}$`, `Done`), scene: full });
    } else if (cp <= 0x7ff) {
      frames.push({ line: 1, caption: T(`$u=${cp} \\le 0x7F$ ? 否`, `>0x7F`), scene: empty });
      frames.push({ line: 3, caption: T(`$u le 0x7FF$ ? 是 → 2 字节`, `2 bytes`), scene: empty });
      frames.push({ line: 4, caption: T(`$bytes gets [${full.utf8Bytes.join(',')}]$`, `bytes`), scene: full });
      frames.push({ line: 4, caption: T(`完成：$${ch}$ → ${full.bytesHex.map(h => '0x' + h).join(' ')}`, `Done`), scene: full });
    } else if (cp <= 0xffff) {
      frames.push({ line: 1, caption: T(`$u \\le 0x7F$ ? 否`, `>0x7F`), scene: empty });
      frames.push({ line: 3, caption: T(`$u le 0x7FF$ ? 否`, `>0x7FF`), scene: empty });
      frames.push({ line: 5, caption: T(`$u le 0xFFFF$ ? 是 → 3 字节`, `3 bytes`), scene: empty });
      frames.push({ line: 6, caption: T(`$bytes gets [${full.utf8Bytes.join(',')}]$`, `bytes`), scene: full });
      frames.push({ line: 6, caption: T(`完成：$${ch}$ → ${full.bytesHex.map(h => '0x' + h).join(' ')}`, `Done`), scene: full });
    } else {
      frames.push({ line: 1, caption: T(`$u \\le 0x7F$ ? 否`, `>0x7F`), scene: empty });
      frames.push({ line: 3, caption: T(`$u le 0x7FF$ ? 否`, `>0x7FF`), scene: empty });
      frames.push({ line: 5, caption: T(`$u le 0xFFFF$ ? 否`, `>0xFFFF`), scene: empty });
      frames.push({ line: 7, caption: T(`else 4 字节`, `4 bytes`), scene: empty });
      frames.push({ line: 7, caption: T(`$bytes gets [${full.utf8Bytes.join(',')}]$`, `bytes`), scene: full });
      frames.push({ line: 7, caption: T(`完成：$${ch}$ → ${full.bytesHex.map(h => '0x' + h).join(' ')}`, `Done`), scene: full });
    }
    return frames;
  }
}

export const characterEncodingModule: ModuleDef<Scene, Cfg> = {
  id: 'character-encoding',
  title: T('字符编码', 'Character Encoding'),
  desc: T('ASCII 7 位 $0xxxxxxx$ / Unicode $U+XXXX$ / UTF-8 变长 $1$-$4$ 字节。', 'ASCII / Unicode / UTF-8 1-4 bytes.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: DEFAULT_CFG,
  randomize(c) {
    const pool = ['A', 'a', '0', '好', '中', '€', '𝄞', 'é', 'ß'];
    return { ...c, char: pool[Math.floor(Math.random() * pool.length)] };
  },
  Controls({ config, onChange, t }) {
    const isZh = t(T('中文', 'en')) !== 'en';
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca' }}>{isZh ? '模式' : 'MODE'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span>{t(T('方案', 'Scheme'))}</span>
            <select className="txt" value={config.mode} onChange={e => onChange({ ...config, mode: e.target.value as Mode })}>
              <option value="ascii">ASCII</option>
              <option value="utf8">UTF-8</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{isZh ? '参数' : 'PARAMS'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span>{t(T('字符', 'Char'))}</span>
            <input className="txt" value={config.char} onChange={e => {
              const v = [...e.target.value][0] ?? '';
              onChange({ ...config, char: v });
            }} style={{ width: 80, textAlign: 'center', fontSize: 16 }} maxLength={2} placeholder="A/好" />
          </label>
          <button className="ghost" onClick={() => {
            const pool = ['A', 'a', '0', '好', '中', 'é', 'Ω', '𝄞'];
            onChange({ ...config, char: pool[Math.floor(Math.random() * pool.length)] });
          }}>↻ {t(T('重新生成', 'Regenerate'))}</button>
          <button className="ghost" onClick={() => onChange(DEFAULT_CFG as Cfg)}>{t(T('清空', 'Clear'))}</button>
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) { return CODE[cfg.mode] as never; },
  generate: gen,
  Render({ scene }) {
    if (scene.cp === null) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>输入一个字符</div> as unknown as never;
    const isAscii = scene.mode === 'ascii';
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ textAlign: 'center', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}>
          <div style={{ fontSize: 32 }}>{scene.char}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}><MathText text={`$${scene.cpHex}$ · $dec=${scene.cp}$ · $bin=${scene.cpBin}$`} /></div>
        </div>

        {isAscii ? (
          <div style={{ textAlign: 'center', padding: '10px 12px', border: `1px solid ${scene.kind === 'non-ascii' ? '#f59e0b' : '#c7d2fe'}`, borderRadius: 10, background: scene.kind === 'non-ascii' ? '#fffbeb' : '#eef2ff' }}>
            {scene.kind === 'non-ascii'
              ? <span style={{ color: '#d97706' }}>! 非 ASCII（&gt;127），需 UTF-8</span>
              : <><div style={{ fontFamily: 'monospace', fontSize: 14, letterSpacing: 1 }}>{scene.asciiByte}</div><div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}><MathText text={`$0xxxxxxx$ · $0x${scene.cp!.toString(16).toUpperCase().padStart(2, '0')}$`} /></div></>}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              {scene.utf8Bytes.map((b, i) => {
                const hex = scene.bytesHex[i];
                const isHeader = b.startsWith('0') || b.startsWith('110') || b.startsWith('1110') || b.startsWith('11110');
                return (
                  <div key={i} style={{ minWidth: 110, textAlign: 'center', padding: '6px 8px', borderRadius: 8, background: i === 0 ? '#eef2ff' : '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 0.5 }}>
                      <span style={{ color: isHeader ? '#4f46e5' : '#94a3b8', fontWeight: 800 }}>{b.slice(0, b.startsWith('0') ? 1 : b.startsWith('110') ? 3 : b.startsWith('1110') ? 4 : 5)}</span>
                      <span style={{ color: '#0f172a' }}>{b.slice(b.startsWith('0') ? 1 : b.startsWith('110') ? 3 : b.startsWith('1110') ? 4 : 5)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>0x{hex}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#64748b' }}>
              <MathText text={`$${scene.utf8Bytes.length}$ 字节 · ${scene.bytesHex.map(h => '0x' + h).join('\\;')}$`} />
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
              {scene.utf8Bytes.length === 1 ? '1 字节：0xxxxxxx' : scene.utf8Bytes.length === 2 ? '2 字节：110xxxxx 10xxxxxx' : scene.utf8Bytes.length === 3 ? '3 字节：1110xxxx 10xxxxxx 10xxxxxx' : '4 字节：11110xxx 10xxxxxx 10xxxxxx 10xxxxxx'}
            </div>
          </div>
        )}
      </div>
    ) as unknown as never;
  },
};
