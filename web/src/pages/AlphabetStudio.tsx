import { useEffect, useState } from 'react';
import { defaultAlphabet } from '../lib/alphabet';
import { loadGlobal, saveGlobal, clearGlobal, migrateIfNeeded } from '../lib/alphabetStorage';
import { GlyphEditor } from '../components/canvas/GlyphEditor';

export function AlphabetStudio() {
  const [base, setBase] = useState(16);
  const [glyphs, setGlyphs] = useState<(string | null)[]>(() => Array(64).fill(null));
  const [editing, setEditing] = useState<number | null>(null);
  const defaults = defaultAlphabet(base);

  useEffect(() => {
    migrateIfNeeded();
    const g = loadGlobal();
    if (g) setGlyphs(g.glyphs);
  }, []);

  const save = () => { saveGlobal(glyphs); alert('已保存到全局共享池，所有进位制共用前 n 位'); };
  const clear = () => {
    if (!confirm('清空全部 64 位手绘？')) return;
    clearGlobal();
    setGlyphs(Array(64).fill(null));
  };

  return (
    <div className="stage" style={{ padding: 16 }}>
      <h2 style={{ margin: 0 }}>字符画板 · 全局共享</h2>
      <p style={{ color: '#64748b', margin: '6px 0 12px' }}>
        画一次，所有进位制共享：`n` 进制取前 `n` 位（`0 … n-1`）。比如在二进制画好 `0/1`，切到 `16` 进制时前两位直接复用，无需重画。
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label>预览进位制 n <input className="txt" type="number" min={2} max={64} value={base} onChange={e => setBase(Math.max(2, Math.min(64, Number(e.target.value) || 16)))} style={{ width: 80 }} /></label>
        <button className="pill active" onClick={save}>保存到本地</button>
        <button className="pill" onClick={clear}>清空全部</button>
        <span style={{ fontSize: 12, color: '#64748b' }}>{glyphs.filter(Boolean).length}/64 已绘制 · 当前 n={base} 取前 {base} 位</span>
      </div>

      <div style={{ fontWeight: 800, margin: '10px 0 6px' }}>默认（前 {base} 位预览）· {defaults.join(' ')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(56px,1fr))', gap: 8 }}>
        {defaults.map((ch, i) => (
          <div key={i} style={{ border: i < base ? '1px solid #4f46e5' : '1px solid #e2e8f0', borderRadius: 10, padding: '10px 6px', textAlign: 'center', background: i < base ? '#eef2ff' : '#f8fafc', opacity: i < base ? 1 : .45 }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{i}</div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{ch}</div>
          </div>
        ))}
      </div>

      <div style={{ fontWeight: 800, margin: '14px 0 6px' }}>你的手绘（全局 64 位）· 点击放大绘制 · 前 {base} 位高亮为当前进位制可用</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(72px,1fr))', gap: 8 }}>
        {Array.from({ length: 64 }).map((_, i) => {
          const active = i < base;
          return (
            <button key={i} onClick={() => setEditing(i)} style={{ border: active ? '1px solid #4f46e5' : '1px dashed #cbd5e1', borderRadius: 12, padding: 6, background: active ? '#fff' : '#f8fafc', cursor: 'pointer', textAlign: 'center', opacity: active ? 1 : .55 }}>
              <div style={{ fontSize: 11, color: active ? '#4f46e5' : '#94a3b8' }}>{i} {active ? '·' : ''}</div>
              <div style={{ width: 56, height: 56, margin: '4px auto', border: '1px dashed #cbd5e1', borderRadius: 8, overflow: 'hidden', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {glyphs[i] ? <img src={glyphs[i]!} alt={`g${i}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ color: '#94a3b8', fontSize: 11 }}>空</span>}
              </div>
            </button>
          );
        })}
      </div>

      {editing !== null && (
        <GlyphEditor
          initial={glyphs[editing]}
          onClose={() => setEditing(null)}
          onSave={dataUrl => { const next = [...glyphs]; next[editing!] = dataUrl; setGlyphs(next); setEditing(null); }}
        />
      )}
    </div>
  );
}
