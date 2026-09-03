import { T } from '../../i18n/lang';
import type { Frame } from '../../engine/types';

/** 数组算法章节共享：排序/查找共用数组场景、参数条与柱状渲染 */

// 通用数组场景：arr 当前数组，hl 本帧聚焦点，done 已就绪/已排除位，cmp 比较数，mov 写回数
export type ArrayScene = {
  arr: number[];
  hl: number[];
  done: boolean[];
  cmp: number;
  mov: number;
  aux?: number[] | null; // 辅助行（如归并的暂存段），与 arr 等长或空
  note?: string; // 非公式的状态补充（纯文本，不进 KaTeX）
};

export type ArrayCfg = {
  n: number;
  valuesStr: string; // 逗号/空格分隔，供持久化与手输
};

export const ARRAY_DEFAULT: ArrayCfg = { n: 8, valuesStr: '38,27,43,3,9,82,10,15' };

export function randArray(n: number, lo = 5, hi = 99): number[] {
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(lo + Math.floor(Math.random() * (hi - lo + 1)));
  return a;
}

export function parseArr(s: string): number[] | null {
  const parts = s.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 16) return null;
  const out: number[] = [];
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isFinite(v) || Math.trunc(v) !== v || v < 0 || v > 999) return null;
    out.push(v);
  }
  return out;
}

export function normScene(s: any): ArrayScene {
  const arr = Array.isArray(s?.arr) ? (s.arr as any[]).filter((v) => typeof v === 'number' && Number.isFinite(v)) : [];
  const n = arr.length;
  const hl = Array.isArray(s?.hl) ? (s.hl as any[]).filter((v) => Number.isInteger(v) && v >= 0 && v < n) : [];
  const done = Array.isArray(s?.done) ? arr.map((_, i) => !!(s.done as any[])[i]) : arr.map(() => false);
  const aux = Array.isArray(s?.aux) ? (s.aux as any[]).filter((v) => typeof v === 'number' && Number.isFinite(v)) : null;
  return {
    arr,
    hl,
    done,
    cmp: Number.isFinite(s?.cmp) ? s.cmp : 0,
    mov: Number.isFinite(s?.mov) ? s.mov : 0,
    aux,
    note: typeof s?.note === 'string' ? s.note : undefined,
  };
}

export function blankScene(): ArrayScene {
  return { arr: [], hl: [], done: [], cmp: 0, mov: 0, aux: null };
}

type Push = (line: number, caption: { zh: string; en: string }, scene: ArrayScene) => void;
export function framePusher(frames: Frame<ArrayScene>[], base: () => ArrayScene): Push {
  return (line, caption, scene) => {
    frames.push({ line, caption: T(caption.zh, caption.en), scene });
  };
}

/** 通用参数条：规模滑杆 + 数组手输 + 打乱 + 示例（直控 config，无 draft 滞留） */
export function ArrayControls({ config, onChange, t, extra }: any) {
  const isZh = t(T('中文', 'en')) !== 'en';
  const shuffle = (n: number) => onChange({ ...config, n, valuesStr: randArray(n).join(',') });
  return (
    <div style={{ display: 'grid', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca' }}>{isZh ? '模式' : 'MODE'}</span>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <span>n</span>
          <input className="txt" type="range" min={4} max={12} value={config.n} onChange={(e) => shuffle(Number(e.target.value))} style={{ width: 110 }} />
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{config.n}</span>
        </label>
        {extra}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{isZh ? '参数' : 'PARAMS'}</span>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <span>A</span>
          <input
            className="txt"
            value={config.valuesStr}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9,，\s]/g, '');
              const parsed = parseArr(v);
              onChange({ ...config, valuesStr: v, n: parsed ? parsed.length : config.n });
            }}
            style={{ width: 200, fontFamily: 'ui-monospace, monospace' }}
            placeholder="38,27,43,3,9,82,10"
          />
        </label>
        <button className="ghost" onClick={() => shuffle(config.n)}>↻ {t(T('打乱', 'Shuffle'))}</button>
        <button className="ghost" onClick={() => onChange({ ...config, valuesStr: '5,2,9,1,5,6' })}>示例</button>
      </div>
    </div>
  ) as unknown as never;
}

/** 通用柱状渲染：hl 高亮蓝，done 置灰绿，aux 第二行小柱 */
export function ArrayRender({ scene: _scene }: any) {
  const scene = normScene(_scene);
  const mx = Math.max(...scene.arr, 1);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="bars">
        {scene.arr.length === 0 ? (
          <span style={{ color: '#94a3b8', fontSize: 12 }}>空数组 — 输入 1~16 个 0~999 的整数</span>
        ) : (
          scene.arr.map((v, i) => {
            const active = scene.hl.includes(i);
            const settled = scene.done[i];
            return (
              <div
                key={i}
                className={`bar ${active ? 'hl' : ''}`}
                style={{
                  height: `${(v / mx) * 140 + 14}px`,
                  ...(settled && !active ? { background: '#10b981', borderColor: '#059669' } : {}),
                }}
                title={`A[${i}]=${v}`}
              >
                <span>{v}</span>
              </div>
            );
          })
        )}
      </div>
      {scene.aux && scene.aux.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-end' }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>tmp</span>
          {(() => {
            const m2 = Math.max(...scene.aux, 1);
            return (scene.aux as number[]).map((v, i) => (
              <div key={i} style={{ width: 22, height: `${(v / m2) * 44 + 8}px`, background: '#e0e7ff', border: '1px solid #c7d2fe', borderRadius: 4, fontSize: 9, textAlign: 'center', color: '#4338ca', overflow: 'hidden' }}>{v}</div>
            ));
          })()}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', fontSize: 12, color: '#64748b' }}>
        <span>比较 {scene.cmp}</span>
        <span>写回 {scene.mov}</span>
        {scene.note && <span>{scene.note}</span>}
      </div>
    </div>
  ) as unknown as never;
}
