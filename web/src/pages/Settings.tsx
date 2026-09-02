import { useMemo, useState } from 'react';
import { useLang } from '../i18n/LangContext';
import { AlphabetStudio } from './AlphabetStudio';
import { allModules } from '../modules/registry';

type Entry = {
  id: string;
  label: string;
  desc: string;
  match: (k: string) => boolean;
};

// 后期加入的功能（非模块）各自的 localStorage 键
const FEATURE_ENTRIES: Entry[] = [
  {
    id: 'alphabet',
    label: '自定义字母表 · Custom Alphabet',
    desc: 'custom-alphabet:*（全局共享池 + 旧版各进位制键）',
    match: (k) => k.startsWith('custom-alphabet:'),
  },
  {
    id: 'playback',
    label: '播放速度 · Playback Speed',
    desc: 'playback:speed',
    match: (k) => k === 'playback:speed',
  },
  {
    id: 'memory',
    label: '记忆沙盘 · Memory Sandbox',
    desc: 'memory:allocs / memory:buffer',
    match: (k) => k === 'memory:allocs' || k === 'memory:buffer',
  },
  {
    id: 'graph',
    label: '图创建快照 · Graph Snapshot',
    desc: 'graph-studio:last',
    match: (k) => k === 'graph-studio:last',
  },
  {
    id: 'typeColors',
    label: '类型颜色 · Type Colors',
    desc: 'memory.typeColors.v1',
    match: (k) => k === 'memory.typeColors.v1',
  },
];

// 每个模块各自的状态存档
const MODULE_ENTRIES: Entry[] = allModules.map((m) => ({
  id: `mod:${m.id}`,
  label: `模块 · ${m.title.zh ?? m.title.en}`,
  desc: `module-cfg:${m.id}`,
  match: (k) => k === `module-cfg:${m.id}`,
}));

const ALL_ENTRIES: Entry[] = [...FEATURE_ENTRIES, ...MODULE_ENTRIES];

function ExperimentalZone() {
  return (
    <div className="stage" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>ExperimentalZone · 实验室</h3>
        <span style={{ fontSize: 11, color: '#6366f1', border: '1px solid #c7d2fe', borderRadius: 999, padding: '2px 8px', background: '#eef2ff' }}>Beta</span>
      </div>
      <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: 12 }}>实验性功能收纳 — 点击超链接进入独立页面</p>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a href="#/graph" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, background: '#4f46e5', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>图创建 · Graph Studio →</a>
        <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>自由建图 / 拖拽 / 右键菜单 / 随机生成（独立页面）</span>
      </div>
    </div>
  );
}

function hasAny(match: (k: string) => boolean): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && match(k)) return true;
    }
  } catch {
    /* 隐私模式等场景可能抛错，按无数据处理 */
  }
  return false;
}

export function Settings() {
  const { lang, setLang } = useLang();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // 数据只在「清除 + 刷新」时变化，挂载时快照一次即可
  const entries = useMemo(
    () => ALL_ENTRIES.map((e) => ({ ...e, hasData: hasAny(e.match) })),
    []
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allChecked = entries.length > 0 && selected.size === entries.length;
  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(entries.map((e) => e.id)));
  };

  const clearSelected = () => {
    const picked = entries.filter((e) => selected.has(e.id));
    if (picked.length === 0) return;
    if (!window.confirm(`确定清除选中的 ${picked.length} 项本地数据吗？此操作不可撤销。`)) return;
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && picked.some((e) => e.match(k))) localStorage.removeItem(k);
      }
    } catch {
      /* ignore */
    }
    // 复位模块级内存态（记忆沙盘 buffer/allocs、字母表编辑态等）
    window.location.reload();
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="stage" style={{ padding: 16 }}>
        <h2 style={{ margin: 0 }}>设置 · Settings</h2>
        <p style={{ color: '#64748b', margin: '6px 0 0' }}>所有全局设置在此集中管理</p>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#475569' }}>语言 / Language</span>
          <select className="txt" value={lang} onChange={(e) => setLang(e.target.value as any)} style={{ minWidth: 120 }}>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>i18n · 下拉选择（后续扩展）</span>
        </div>
      </div>
      <ExperimentalZone />
      <AlphabetStudio />
      <div className="stage" style={{ padding: 16, borderColor: '#fecaca' }}>
        <h3 style={{ margin: 0, color: '#b91c1c' }}>数据 · Data</h3>
        <p style={{ color: '#64748b', margin: '6px 0 0' }}>
          按项清除本地存储（localStorage）：勾选后点击「清除选中」，全选后清除即清空全部（仅本应用，不可撤销）
        </p>
        <label
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            color: '#334155',
          }}
        >
          <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ accentColor: '#b91c1c' }} />
          全选 · Select All
        </label>
        <div
          style={{
            marginTop: 8,
            maxHeight: 280,
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '6px 10px',
            display: 'grid',
            gap: 2,
          }}
        >
          {entries.map((e) => (
            <label
              key={e.id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '3px 2px' }}
            >
              <input
                type="checkbox"
                checked={selected.has(e.id)}
                onChange={() => toggle(e.id)}
                style={{ accentColor: '#b91c1c' }}
              />
              <span style={{ fontSize: 13, minWidth: 0 }}>
                {e.label}
                <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 8 }}>{e.desc}</span>
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  flexShrink: 0,
                  color: e.hasData ? '#16a34a' : '#cbd5e1',
                }}
              >
                {e.hasData ? '● 有数据' : '○ 无'}
              </span>
            </label>
          ))}
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="pill"
            style={{
              borderColor: '#fca5a5',
              color: '#b91c1c',
              background: '#fff1f2',
              opacity: selected.size === 0 ? 0.5 : 1,
              cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
            }}
            onClick={clearSelected}
            disabled={selected.size === 0}
          >
            清除选中 ({selected.size}) · Clear Selected
          </button>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            {entries.some((e) => e.hasData)
              ? '清除后页面将刷新以复位沙盘等内存态'
              : '当前没有可清除的数据'}
          </span>
        </div>
      </div>
    </div>
  );
}