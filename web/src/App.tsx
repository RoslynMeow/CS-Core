import { useEffect, useMemo, useState } from 'react';
import { useLang } from './i18n/LangContext';
import { Stage } from './components/Stage';
import { findModule, searchModules } from './modules/registry';
import { MathText } from './lib/tex';
import { Settings } from './pages/Settings';
import { MemoryVisualizer } from './pages/MemoryVisualizer';
import { GraphStudio } from './pages/GraphStudio';

type Route = { kind: 'home' } | { kind: 'module'; id: string } | { kind: 'settings' } | { kind: 'memory' } | { kind: 'graph' };
function getRoute(): Route {
  const h = location.hash;
  if (h.startsWith('#/settings') || h.startsWith('#/alphabet')) return { kind: 'settings' };
  if (h.startsWith('#/memory')) return { kind: 'memory' };
  if (h.startsWith('#/graph')) return { kind: 'graph' };
  const m = h.match(/^#\/module\/(.+)/);
  if (m) return { kind: 'module', id: m[1] };
  return { kind: 'home' };
}
const TAGS: { id: string | null; label: string }[] = [
  { id: null, label: '全部' },
  { id: 'data-structures', label: '数据结构' },
  { id: 'computer-organization', label: '计算机组成' },
];

export function App() {
  useLang();
  const [route, setRoute] = useState<Route>(getRoute());
  useEffect(() => {
    const h = () => setRoute(getRoute());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const mod = route.kind === 'module' ? findModule(route.id) : null;
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const filtered = useMemo(() => searchModules(q, tag), [q, tag]);

  return (
    <div className="app">
      <header className="hdr">
        <div className="brand" onClick={() => (location.hash = '')}>
          计算机学习 <small>· Interactive</small>
        </div>
        <div className="spacer" />
        <button className={`pill ${route.kind === 'memory' ? 'active' : ''}`} onClick={() => (location.hash = '#/memory')} title="HEX 内存可视化 — 支持 URL Base64 或手动输入">
          内存可视化
        </button>
        <button className={`pill ${route.kind === 'graph' ? 'active' : ''}`} onClick={() => (location.hash = '#/graph')} title="通用图自由创建与探索（开发期测试页，后期删除）">
          图测试
        </button>
        <button className={`pill ${route.kind === 'settings' ? 'active' : ''}`} onClick={() => (location.hash = '#/settings')}>设置</button>
      </header>
      <main className="main">
        {route.kind === 'settings' ? (
          <Settings />
        ) : route.kind === 'memory' ? (
          <MemoryVisualizer />
        ) : route.kind === 'graph' ? (
          <GraphStudio />
        ) : mod ? (
          <>
            <button className="ghost" onClick={() => (location.hash = '')} style={{ marginBottom: 12 }}>
              ← 返回首页
            </button>
            <Stage mod={mod as never} />
          </>
        ) : (
          <div className="home">
            <div className="home-head">
              <h1 className="home-title">计算机学习</h1>
            </div>
            <div className="home-toolbar">
              <label className="search">
                <input placeholder="搜索：进制 / 展开 / expansion / base" value={q} onChange={e => setQ(e.target.value)} />
              </label>
              <span className="count">{filtered.length} 个</span>
            </div>
            <div className="tagbar">
              {TAGS.map(t => (
                <button key={String(t.id)} className={`chip ${tag === t.id ? 'active' : ''}`} onClick={() => setTag(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="grid" style={{ marginTop: 14 }}>
              {filtered.map(m => (
                <button key={m.id} className="card" onClick={() => (location.hash = `#/module/${m.id}`)}>
                  <div className="card-title">{m.title.zh}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{m.title.en}</div>
                  {m.desc && (
                    <div className="card-desc">
                      <MathText text={m.desc.zh} />
                    </div>
                  )}
                  <div className="card-meta">
                    {m.tags?.map(t => (
                      <span key={t} className="meta primary">
                        {t}
                      </span>
                    ))}
                    <span className="meta">{m.id}</span>
                  </div>
                </button>
              ))}
            </div>
            {filtered.length === 0 && <div className="empty">无匹配 · No results</div>}
          </div>
        )}
      </main>
    </div>
  );
}
