import { useEffect, useState } from 'react';
import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { buildMemoryUrl, hexFromBytes, toHexByte } from '../../lib/memoryDump';
/**
 * 字符串 · 定界与运算
 * 基于 tex/DataStructure/LinearStructureAndADT「字符串 (String)」与
 * tex/CProgrammingLanguage <string.h>：字符数组 + \0 终结符的物理存储，
 * 以及 strlen / strcat / strcmp 三种经典运算的逐字节走查。
 * 承接 sequential-list（连续存储）与 character-encoding（字符→ASCII 字节）。
 */
type Mode = 'layout' | 'strlen' | 'strcat' | 'strcmp';
type Cfg = { mode: Mode; s1: string; s2: string; execTick: number };

type Cell = { ch: string; byte: number };
type Scene = {
  mode: Mode;
  // 只读展示：s1 与 s2 的字符序列（含末尾 \0 哨兵）
  s1: Cell[];
  s2: Cell[];
  base1: number; // s1 的连续内存基址
  base2: number; // s2 的连续内存基址
  // 运算焦点
  focus1: number | null; // s1 内下标
  focus2: number | null; // s2 内下标
  phase: 'idle' | 'count' | 'copy' | 'compare' | 'result';
  len1: number; // strlen(s1) 结果（不含 \0）
  diff: number; // strcmp 结果
  concat: Cell[]; // strcat 拼接结果
  caption: string;
};

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

// 导出内存 dump：两条字符串各占一段连续分配区，供 #/memory 查看
function buildDump(cfg: Cfg) {
  const s1 = toCells(cfg.s1).map(c => c.byte);
  const s2 = toCells(cfg.s2).map(c => c.byte);
  const base1 = baseFor(0);
  const base2 = baseFor(2);
  const mk = (key: string, addr: number, bytes: number[], label: string, color: string) => ({
    key, addr: `0x${addr.toString(16)}`, size: bytes.length, hex: hexFromBytes(bytes),
    label, color,
    fields: bytes.map((b, i) => ({ name: b === 0 ? `[${i}] \\0` : `[${i}]`, offset: i, size: 1, type: b === 0 ? 'str' : 'char', color })),
  });
  return {
    base: `0x${base1.toString(16)}`, total: 0x40, endian: 'little',
    allocations: [
      mk('s1', base1, s1, `s1 = "${cfg.s1}"（含终结符 0x00）· strlen=${Math.max(0, s1.length - 1)}`, '#4f46e5'),
      mk('s2', base2, s2, `s2 = "${cfg.s2}"（含终结符 0x00）· strlen=${Math.max(0, s2.length - 1)}`, '#0ea5e9'),
    ],
  };
}
function toCells(s: string): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < s.length; i++) out.push({ ch: s[i], byte: s.charCodeAt(i) & 0xff });
  out.push({ ch: '␀', byte: 0 }); // 终结符
  return out;
}
// 内存基址：稳定的伪地址（方案 B：进程内固定），仅随内容长度对齐
let seq = 0x555555559800;
function baseFor(k: number) { return seq + k * 0x30; } // 每条字符串从固定偏移开始

function buildScene(cfg: Cfg, phase: Scene['phase'], focus1: number | null, focus2: number | null): Scene {
  const s1 = toCells(cfg.s1);
  const s2 = toCells(cfg.s2);
  const len1 = Math.max(0, s1.length - 1); // 不含哨兵
  // strcmp：逐位比较 ASCII
  let diff = 0;
  for (let i = 0; i < Math.max(s1.length, s2.length); i++) {
    const a = s1[i].byte, b = s2[i].byte;
    if (a !== b) { diff = a - b; break; }
  }
  // strcat：dst=s1 末尾的 \0 被覆盖，把 src 逐字符复制（含 src 的 \0）
  const concat: Cell[] = [...s1.slice(0, -1), ...s2];
  let caption = '';
  if (phase === 'idle') caption = T(`$s_1="${cfg.s1}"$，$s_2="${cfg.s2}"$ · 选中运算查看`, `s1/s2 ready`).zh;
  return { mode: cfg.mode, s1, s2, base1: baseFor(0), base2: baseFor(1), focus1, focus2, phase, len1, diff, concat, caption };
}

function gen(cfg: Cfg): Frame<Scene>[] {
  const s1 = toCells(cfg.s1);
  const s2 = toCells(cfg.s2);
  const idle = buildScene(cfg, 'idle', null, null);
  if (cfg.mode === 'layout') {
    return [
      { line: 0, caption: T(`物理存储：$s \\in \\Sigma^*$ 映为字符数组，尾加终结符 $\\#\\notin\\Sigma$（0x00）界定边界`, 'layout'), scene: buildScene(cfg, 'idle', null, null) },
      { line: 1, caption: T(`$s_1="${cfg.s1}"$：字符 ${s1.length - 1} 个 + 哨兵 $\\#=0x00$ @$0x${baseFor(0).toString(16)}$`, 's1 layout'), scene: buildScene(cfg, 'idle', s1.length - 1, null) },
      { line: 2, caption: T(`$s_2="${cfg.s2}"$：同样以 $\\#=0x00$ 界定，长度 $|s_2|=${Math.max(0, s2.length - 1)}$`, 's2 layout'), scene: buildScene(cfg, 'idle', null, s2.length - 1) },
    ];
  }
  if (cfg.mode === 'strlen') {
    const frames: Frame<Scene>[] = [];
    frames.push({ line: 0, caption: T(`$p \\gets s_1$，计数 $n \\gets 0$`, `n=0`), scene: buildScene(cfg, 'count', 0, null) });
    for (let i = 0; i < s1.length - 1; i++) frames.push({ line: 1, caption: T(`$s_1[${i}]="${cfg.s1[i]}"$、ASCII $\\texttt{${toHexByte(s1[i].byte)}}$ $\\neq \\# $, $n\\gets ${i + 1}$，$p\\gets p{+}1$`, `count ${i + 1}`), scene: buildScene(cfg, 'count', i, null) });
    frames.push({ line: 2, caption: T(`遇 $\\#=0x00$，返回 $n=${Math.max(0, s1.length - 1)}$（不含终结符）`, `strlen=${Math.max(0, s1.length - 1)}`), scene: buildScene({ ...cfg, mode: cfg.mode }, 'result', s1.length - 1, null) });
    return frames;
  }
  if (cfg.mode === 'strcat') {
    const N = Math.max(0, s1.length - 1); // dst 原始长度
    const src = s2.slice(0, -1);
    const frames: Frame<Scene>[] = [];
    frames.push({ line: 0, caption: T(`$\\texttt{strcat}(s_1,s_2)$：定位 $s_1$ 末尾的 $\\#$`, `find NUL`), scene: buildScene(cfg, 'copy', s1.length - 1, null) });
    for (let i = 0; i < src.length; i++) frames.push({ line: 1, caption: T(`把 $s_2[${i}]="${src[i].ch}"$ 覆盖到 $s_1$ 末尾（含其 $\\#$ 传输）`, `copy ${src[i].ch}`), scene: buildScene(cfg, 'copy', N + i, i) });
    frames.push({ line: 2, caption: T(`拼接结果 "${cfg.s1 + cfg.s2}"，$|s|=${src.length + N}$`, 'done'), scene: buildScene(cfg, 'result', null, null) });
    return frames;
  }
  // strcmp
  const M = Math.max(s1.length, s2.length);
  const frames: Frame<Scene>[] = [];
  frames.push({ line: 0, caption: T(`$p \\gets s_1,\\; q \\gets s_2$，逐位比较 ASCII`, `compare`), scene: buildScene(cfg, 'compare', 0, 0) });
  for (let i = 0; i < M; i++) {
    const a = s1[i], b = s2[i];
    const aByte = a ? a.byte : 0, bByte = b ? b.byte : 0;
    if (aByte === bByte && i < Math.min(s1.length, s2.length) - 1) frames.push({ line: 1, caption: T(`$s_1[${i}]=s_2[${i}]$（皆 ${aByte}），$p$、$q$ 同进`, `equal ${aByte}`), scene: buildScene(cfg, 'compare', i, i) });
    else { frames.push({ line: 2, caption: T(`$s_1[${i}].ASCII=${aByte}$ vs $s_2[${i}].ASCII=${bByte}$ $\\Rightarrow$ $\\mathtt{strcmp}=${aByte - bByte}$（$<0$ 则 $s_1<s_2$）`, `diff ${aByte - bByte}`), scene: buildScene(cfg, 'result', i, i) }); break; }
  }
  if (frames.length === 1) frames.push({ line: 2, caption: T('相等（含终结符）：strcmp = 0', 'equal: 0'), scene: buildScene(cfg, 'result', null, null) });
  return frames;
}

const CODE: Record<Mode, any> = {
  layout: [
    T('$s \\in \\Sigma^*$ 映为字符数组', '$s$ as char array'),
    T('尾加 $\\#\\notin\\Sigma$（0x00）界定边界', 'append $\\#$'),
    T('strlen=$|s|$ 不含 $\\#$', 'len=$|s|$'),
  ] as never,
  strlen: [
    T('$n \\gets 0;\\; p \\gets s$', '$n=0,p=s$'),
    T('while $*p \\neq \\#$: $n{+}{+};\\; p{+}{+}$', 'while $*p\\neq\\#$'),
    T('return $n$', 'return $n$'),
  ] as never,
  strcat: [
    T('$p \\gets$ 定位 $s_1$ 的 $\\#$', 'find NUL in s1'),
    T('while $*q \\neq \\#$: $*p{+}{+}\\gets *q{+}{+}$', 'copy src'),
    T('$*p \\gets \\#$ // 补终结符', 'append $\\#$'),
  ] as never,
  strcmp: [
    T('比较 $s_1[i]$ 与 $s_2[i]$ 的 ASCII', 'compare byte'),
    T('相等则 $i{+}{+}$ 继续', 'equal → next'),
    T('return $s_1[i]-s_2[i]$', 'return diff'),
  ] as never,
};

function sanitize(s: string, n: number): string { return s.replace(/[^\x20-\x7E]/g, '').slice(0, n); }

export const stringOpsModule: ModuleDef<Scene, Cfg> = {
  id: 'string',
  title: T('字符串 · 定界与运算', 'String · Terminator & Ops'),
  desc: T('$s\\in\\Sigma^*$ 以字符数组存放、$\\#\\notin\\Sigma$（0x00）终结；strlen/strcat/strcmp 逐字节走查。', 'Char array + NUL terminator; strlen/strcat/strcmp.'),
  tags: ['data-structures', 'computer-organization'],
  defaultConfig: { mode: 'layout' as Mode, s1: 'Hi', s2: '!' , execTick: 0 },
  randomize(c) {
    const pick = ['Hi', 'OK', 'Go', 'Cat', 'Dog', 'A', 'bc'];
    const pick2 = ['!', '?', 'z', 'x', 'Hi', 'cat', 'ab'];
    const s1 = pick[Math.floor(Math.random() * pick.length)];
    const s2 = pick2[Math.floor(Math.random() * pick2.length)];
    return { ...c, s1, s2, execTick: 0 } as Cfg;
  },
  Controls({ config, onChange, t }: any) {
    const isZh = t(T('中文', 'en')) !== 'en';
    const [draft, setDraft] = useState<Cfg>(config);
    const set = (p: Partial<Cfg>) => setDraft(s => ({ ...s, ...p }));
    useEffect(() => { if (draft.s1 !== config.s1 || draft.s2 !== config.s2 || draft.mode !== config.mode) setDraft(config); }, [config]);
    return (
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca' }}>{isZh ? '模式' : 'MODE'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>{t(T('运算', 'Op'))}</span>
            <select className="txt" value={draft.mode} onChange={e => set({ mode: e.target.value as Mode })}>
              <option value="layout">{t(T('物理存储', 'Layout'))}</option>
              <option value="strlen">{t(T('strlen 求长', 'strlen'))}</option>
              <option value="strcat">{t(T('strcat 拼接', 'strcat'))}</option>
              <option value="strcmp">{t(T('strcmp 比较', 'strcmp'))}</option>
            </select></label>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{isZh ? '参数' : 'PARAMS'}</span>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>$s_1$</span>
            <input className="txt" value={draft.s1} onChange={e => set({ s1: sanitize(e.target.value, 12) })} style={{ width: 90 }} placeholder="Hi" /></label>
          {(draft.mode === 'layout' || draft.mode === 'strcmp' || draft.mode === 'strcat') && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><span>$s_2$</span>
            <input className="txt" value={draft.s2} onChange={e => set({ s2: sanitize(e.target.value, 8) })} style={{ width: 70 }} placeholder="!" /></label>}
          <button className="ghost" onClick={() => onChange(stringOpsModule.randomize!(draft))}>↻ {t(T('重新生成', 'Regenerate'))}</button>
          <button className="ghost" onClick={() => onChange({ ...stringOpsModule.defaultConfig } as Cfg)}>{t(T('清空', 'Clear'))}</button>
          <button className="pill" onClick={() => { location.href = buildMemoryUrl(buildDump({ ...draft, execTick: config.execTick } as Cfg) as any); }}>查看内存 ↗</button>
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) { return CODE[cfg.mode] as never; },
  generate: gen,
  Render({ scene }) {
    const row = (label: string, cells: Cell[], base: number, focus: number | null, tag: string) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{label} · @0x{base.toString(16)}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {cells.map((c, i) => {
            const isTerm = c.byte === 0;
            const isFocus = focus === i;
            return (
              <div key={i} style={{ minWidth: 62, textAlign: 'center', padding: '6px 6px', borderRadius: 10, background: isTerm ? '#0f172a' : isFocus ? '#4f46e5' : '#fff', color: isTerm ? '#e2e8f0' : isFocus ? '#fff' : '#0f172a', border: `1.5px solid ${isFocus ? '#4f46e5' : isTerm ? '#0f172a' : '#c7d2fe'}` }}>
                <div style={{ fontSize: 10, opacity: 0.75 }}>{isTerm ? '\\0' : (tag === 's1' ? `${i}` : `${i}`)}</div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{isTerm ? '␀' : c.ch}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 9, marginTop: 2, color: isTerm ? '#94a3b8' : isFocus ? '#e0e7ff' : '#64748b' }}>ASCII 0x{toHexByte(c.byte)}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ border: '1px solid #c7d2fe', borderRadius: 12, overflow: 'hidden', background: '#eef2ff' }}>
          <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 800, color: '#4338ca', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>逻辑视图 · 字符串</span>
            <span style={{ fontWeight: 400, color: '#64748b' }}>字符数组 + $\\#$（0x00）终结 · 1 字符 = 1 字节</span>
          </div>
          <div style={{ padding: 12, display: 'grid', gap: 12 }}>
            <div style={{ textAlign: 'center', fontSize: 12, color: '#475569', fontWeight: 700 }}>
              {scene.phase === 'result' && scene.mode === 'strlen' ? `strlen(${scene.s1.slice(0, -1).map(c => c.ch).join('')}) = ${scene.len1}` : ''}
              {scene.phase === 'result' && scene.mode === 'strcmp' ? `strcmp = ${scene.diff}` : ''}
              {scene.phase === 'result' && scene.mode === 'strcat' ? `strcat → "${scene.concat.slice(0, -1).map(c => c.ch).join('')}"` : ''}
            </div>
            {scene.mode === 'strcat' && scene.phase === 'result' ? (
              row(`拼接结果 · 新 $|s|=${scene.concat.length - 1}$`, scene.concat, scene.base1, null, 's1')
            ) : (
              row(`$s_1="${scene.s1.slice(0, -1).map(c => c.ch).join('')}"$ · 长度 ${scene.len1}`, scene.s1, scene.base1, scene.focus1, 's1')
            )}
            {(scene.mode === 'layout' || scene.mode === 'strcmp' || (scene.mode === 'strcat' && scene.phase !== 'result')) && (
              row(`$s_2="${scene.s2.slice(0, -1).map(c => c.ch).join('')}"$`, scene.s2, scene.base2, scene.focus2, 's2')
            )}
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#64748b', textAlign: 'center' }}>
              s1 字节: {scene.s1.map(c => toHexByte(c.byte)).join(' ')} · s2 字节: {scene.s2.map(c => toHexByte(c.byte)).join(' ')}
            </div>
          </div>
        </div>
      </div>
    ) as unknown as never;
  },
};
