import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import {
  trieBuildSteps, trieSearchSteps, trieInsertOne, trieDeleteOne, trieLayout,
  TRIE_INSERT_CODE, TRIE_SEARCH_CODE, TRIE_DELETE_CODE,
  type TrieNode,
} from '../../lib/trie';

type Mode = 'build' | 'search' | 'insert' | 'delete';
type Cfg = { mode: Mode; words: string; target: string };
type Scene = {
  nodes: TrieNode[];
  root: number;
  focus: number | null;
  edge: [number, number] | null;
  fresh: number[];
};

const DEFAULT_CFG: Cfg = { mode: 'build', words: 'cat,car,card,dog', target: 'car' };

function wordsOf(s: string): string[] {
  return s.split(/[\s,，]+/).map((w) => w.trim()).filter(Boolean).slice(0, 12);
}
function depthOf(nodes: TrieNode[], root: number): number {
  let mx = 0;
  for (const n of nodes) {
    let d = 0; let v = n.id;
    while (v !== root && nodes[v]?.parent !== null && v !== undefined) { d++; v = nodes[v].parent!; }
    if (d > mx) mx = d;
  }
  return mx;
}
function clean(s: string): string { return s.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase(); }

function gen(cfg: Cfg): Frame<Scene>[] {
  const words = wordsOf(cfg.words);
  if (words.length === 0) return [{ line: 0, caption: T('输入若干单词（逗号/空格分隔）', 'Enter words (comma/space)'), scene: { nodes: [{ id: 0, ch: '', isEnd: false, parent: null, children: {} }], root: 0, focus: null, edge: null, fresh: [] } }];
  if (cfg.mode === 'build') {
    return trieBuildSteps(words).map((s) => ({
      line: s.line, caption: s.msg, scene: { nodes: s.nodes, root: s.root, focus: s.focus, edge: s.edge, fresh: s.fresh ?? [] },
    }));
  }
  const base = (() => { const r = trieBuildSteps(words); return r[r.length - 1]?.nodes ?? []; })();
  const target = clean(cfg.target);
  let steps: { line: number; nodes: TrieNode[]; focus: number | null; edge: [number, number] | null; msg: any }[] = [];
  if (cfg.mode === 'search') steps = trieSearchSteps(base, 0, target).map((s) => ({ line: s.line, nodes: s.nodes, focus: s.focus, edge: s.edge, msg: s.msg }));
  else if (cfg.mode === 'insert') steps = trieInsertOne(base, 0, target).steps;
  else steps = trieDeleteOne(base, 0, target).steps;
  return steps.map((s) => ({ line: s.line, caption: s.msg, scene: { nodes: s.nodes, root: 0, focus: s.focus, edge: s.edge, fresh: (s as any).fresh ?? [] } }));
}

function TrieRender({ scene: _scene }: any) {
  const s = ((_scene ?? {}) as Scene);
  const nodes = Array.isArray(s.nodes) ? s.nodes : [];
  if (nodes.length === 0) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>空树</div> as unknown as never;
  const leaves = nodes.filter((n) => Object.keys(n.children).length === 0).length;
  const depth = depthOf(nodes, s.root ?? 0);
  const W = Math.max(360, leaves * 84);
  const H = Math.max(200, (depth + 1) * 76);
  const pos = trieLayout(nodes, s.root ?? 0, { x0: 30, y0: 30, w: W - 60, h: H - 60 });
  const focus = s.focus;
  const fresh = new Set(s.fresh ?? []);
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block', margin: '0 auto' }}>
        {nodes.map((n) => Object.entries(n.children).map(([ch, cid]) => {
          const a = pos[n.id], b = pos[cid];
          const active = s.edge && ((s.edge[0] === n.id && s.edge[1] === cid) || (s.edge[1] === n.id && s.edge[0] === cid));
          return (
            <g key={`${n.id}-${cid}`}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={active ? '#4f46e5' : '#cbd5e1'} strokeWidth={active ? 2.5 : 1.5} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle" fontSize={12} fontWeight={800} fill={active ? '#4338ca' : '#94a3b8'}>{ch}</text>
            </g>
          );
        }))}
        {nodes.map((n) => {
          const p = pos[n.id];
          const isRoot = n.id === (s.root ?? 0);
          const hot = focus === n.id;
          const isFresh = fresh.has(n.id);
          const fill = hot ? '#4f46e5' : isFresh ? '#eef2ff' : '#fff';
          const stroke = n.isEnd ? '#16a34a' : isRoot ? '#94a3b8' : '#6366f1';
          return (
            <g key={n.id}>
              {n.isEnd && <circle cx={p.x} cy={p.y} r={20} fill="none" stroke="#16a34a" strokeWidth={1.5} strokeDasharray="3 2" />}
              <circle cx={p.x} cy={p.y} r={15} fill={fill} stroke={stroke} strokeWidth={2} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={12} fontWeight={800} fill={hot ? '#fff' : '#0f172a'}>{isRoot ? '∅' : n.ch}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center' }}>
        {T('绿色虚线环 = 词尾（完整词）；边标签 = 字符', 'Green dashed ring = word end; edge label = char').zh}
      </div>
    </div>
  ) as unknown as never;
}

export const trieModule: ModuleDef<Scene, Cfg> = {
  id: 'trie',
  title: T('字典树 Trie', 'Trie'),
  desc: T('按字符逐层建/查/插/删；词尾标记区分完整词与前缀，边标签为字符。', 'Char-by-char build/search/insert/delete; word-end marks complete words.'),
  tags: ['data-structures', 'string'],
  defaultConfig: DEFAULT_CFG,
  Controls({ config, onChange, t }: any) {
    const isZh = t(T('中文', 'en')) !== 'en';
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="txt" value={config.mode} onChange={(e) => onChange({ ...config, mode: e.target.value as Mode })} style={{ fontWeight: 700 }}>
          <option value="build">{isZh ? '建树' : 'Build'}</option>
          <option value="search">{isZh ? '查找' : 'Search'}</option>
          <option value="insert">{isZh ? '插入' : 'Insert'}</option>
          <option value="delete">{isZh ? '删除' : 'Delete'}</option>
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <span>{isZh ? '词表' : 'Words'}</span>
          <input className="txt" value={config.words} onChange={(e) => onChange({ ...config, words: e.target.value })} style={{ width: 200, fontFamily: 'ui-monospace, monospace' }} placeholder="cat,car,dog" />
        </label>
        {config.mode !== 'build' && (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <span>{isZh ? '目标词' : 'Word'}</span>
            <input className="txt" value={config.target} onChange={(e) => onChange({ ...config, target: e.target.value })} style={{ width: 110, fontFamily: 'ui-monospace, monospace' }} placeholder="car" />
          </label>
        )}
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) {
    const c = cfg as Cfg;
    if (c.mode === 'search') return TRIE_SEARCH_CODE as never;
    if (c.mode === 'delete') return TRIE_DELETE_CODE as never;
    return TRIE_INSERT_CODE as never;
  },
  generate: gen,
  Render: TrieRender as never,
};
