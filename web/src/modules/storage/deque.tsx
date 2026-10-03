import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';

type Cfg = { items: number[]; note: string };
type Scene = { items: number[]; note: string };
const DEFAULT_CFG: Cfg = { items: [3, 7, 1], note: '' };

function gen(cfg: Cfg): Frame<Scene>[] {
  const items = (cfg.items ?? []).slice(0, 12);
  return [{ line: 0, caption: T('双端队列：两端都可入队/出队', 'Deque: push/pop both ends'), scene: { items, note: cfg.note ?? '' } }];
}

export const dequeModule: ModuleDef<Scene, Cfg> = {
  id: 'deque',
  title: T('双端队列', 'Deque'),
  desc: T('两端均可 $O(1)$ 入队/出队，兼顾栈与队列；循环数组或双向链表实现。', 'O(1) push/pop at both ends; works as stack or queue.'),
  tags: ['data-structures'],
  defaultConfig: DEFAULT_CFG,
  Controls({ config, onChange, t }: any) {
    const isZh = t(T('中文', 'en')) !== 'en';
    const items: number[] = (config.items ?? []).slice();
    const apply = (p: Partial<Cfg>) => onChange({ ...config, ...p });
    const op = (kind: string) => {
      const it = items.slice();
      if (kind === 'pf') it.unshift(Math.floor(Math.random() * 90) + 10);
      else if (kind === 'pb') it.push(Math.floor(Math.random() * 90) + 10);
      else if (kind === 'popf') it.shift();
      else if (kind === 'popb') it.pop();
      const label: Record<string, [string, string]> = {
        pf: ['前入队 push_front', 'push_front'], pb: ['后入队 push_back', 'push_back'],
        popf: ['前出队 pop_front', 'pop_front'], popb: ['后出队 pop_back', 'pop_back'],
      };
      apply({ items: it, note: label[kind][isZh ? 0 : 1] });
    };
    const btn = (kind: string, label: string) => (
      <button className="ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => op(kind)}>{label}</button>
    );
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>{isZh ? '前端' : 'front'}</span>
        {btn('pf', isZh ? '↤ 前入队' : 'push_front')}
        {btn('popf', isZh ? '前出队 ↦' : 'pop_front')}
        {btn('pb', isZh ? '后入队 ↦' : 'push_back')}
        {btn('popb', isZh ? '↤ 后出队' : 'pop_back')}
        <button className="ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => apply({ ...DEFAULT_CFG })}>{isZh ? '重置' : 'Reset'}</button>
      </div>
    );
  },
  code: [
    T('$deque$: 两端 $O(1)$', '$deque$: O(1) both ends'),
    T('$push\\_front(x)$: $front{-}{-}$; $D[front]\\gets x$', '$push\\_front$'),
    T('$push\\_back(x)$: $D[rear]\\gets x$; $rear{+}{+}$', '$push\\_back$'),
    T('$pop\\_front()/pop\\_back()$: 取走端元素', '$pop\\_front/pop\\_back$'),
  ],
  generate: gen,
  Render({ scene: _scene }: any) {
    const s = ((_scene as any) ?? {}) as Scene;
    const items = Array.isArray(s.items) ? s.items : [];
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {items.length === 0 ? <span style={{ color: '#94a3b8', fontSize: 13 }}>∅ 空</span> : items.map((v, i) => (
            <div key={i} className="digit" style={{ width: 52, height: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: i === 0 || i === items.length - 1 ? '#eef2ff' : '#fff' }}>
              <strong style={{ fontSize: 18 }}>{v}</strong>
              <small style={{ fontSize: 9, color: i === 0 ? '#4338ca' : i === items.length - 1 ? '#b45309' : '#94a3b8' }}>{i === 0 ? 'F' : ''}{i === items.length - 1 ? (i === 0 ? 'R' : 'R') : ''}</small>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b' }}>{s.note || T('用上方按钮操作两端', 'use buttons above').zh}</div>
      </div>
    ) as unknown as never;
  },
};
