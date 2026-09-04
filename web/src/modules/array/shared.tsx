import { useLayoutEffect, useRef } from 'react';
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
  aux?: (number | null)[] | null; // 辅助行（如归并的暂存段、计数的 cnt），null 槽位显示为空格
  buckets?: number[][] | null; // 桶结构（基数/桶排），每桶成员列表
  swap?: { i: number; j: number } | null; // 本帧正在交换的一对下标（渲染前序数组＋位移）
  slide?: { from: number; to: number } | null; // 单个元素 from→to 位移（插入/希尔后移）
  note?: string; // 非公式的状态补充（纯文本，不进 KaTeX）;
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
  if (parts.length === 0 || parts.length > 30) return null;
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
  const inRange = (v: any) => Number.isInteger(v) && v >= 0 && v < n;
  const hl = Array.isArray(s?.hl) ? (s.hl as any[]).filter(inRange) : [];
  const done = Array.isArray(s?.done) ? arr.map((_, i) => !!(s.done as any[])[i]) : arr.map(() => false);
  const auxRaw = Array.isArray(s?.aux) ? (s.aux as any[]) : null;
  const aux = auxRaw ? auxRaw.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)) : null;
  const bucketsRaw = Array.isArray(s?.buckets) ? (s.buckets as any[]).slice(0, 12) : null;
  const buckets = bucketsRaw
    ? bucketsRaw.map((b) =>
        Array.isArray(b) ? (b as any[]).filter((v) => typeof v === 'number' && Number.isFinite(v)).slice(0, 16) : [],
      )
    : null;
  const sw = s?.swap;
  const swap = sw && inRange(sw.i) && inRange(sw.j) && sw.i !== sw.j ? { i: sw.i, j: sw.j } : null;
  const sl = s?.slide;
  const slide = sl && inRange(sl.from) && inRange(sl.to) && sl.from !== sl.to ? { from: sl.from, to: sl.to } : null;
  return {
    arr,
    hl,
    done,
    cmp: Number.isFinite(s?.cmp) ? s.cmp : 0,
    mov: Number.isFinite(s?.mov) ? s.mov : 0,
    aux,
    buckets,
    swap,
    slide,
    note: typeof s?.note === 'string' ? s.note : undefined,
  };
}

export function blankScene(): ArrayScene {
  return { arr: [], hl: [], done: [], cmp: 0, mov: 0, aux: null, buckets: null, swap: null, slide: null };
}

type Push = (line: number, caption: { zh: string; en: string }, scene: ArrayScene) => void;
export function framePusher(frames: Frame<ArrayScene>[], base: () => ArrayScene): Push {
  return (line, caption, scene) => {
    frames.push({ line, caption: T(caption.zh, caption.en), scene });
  };
}

/** 通用参数条：单行（规模 n 2~30 + 数组手输 + 打乱 + 示例，直控 config，无 draft 滞留） */
export function ArrayControls({ config, onChange, t, extra }: any) {
  const shuffle = (n: number) => onChange({ ...config, n, valuesStr: randArray(n).join(',') });
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe', flexWrap: 'wrap', width: '100%' }}>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
        <span>n</span>
        <input className="txt" type="range" min={2} max={30} value={Math.max(2, Math.min(30, config.n))} onChange={(e) => shuffle(Number(e.target.value))} style={{ width: 110 }} />
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{config.n}</span>
      </label>
      {extra}
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
    </div>
  ) as unknown as never;
}

/** 柱宽随 n 自适应：一行放下不滚动（n 越大柱越窄） */
export function barSize(n: number): { w: number; gap: number; font: number } {
  if (n <= 12) return { w: 28, gap: 6, font: 10 };
  if (n <= 16) return { w: 22, gap: 5, font: 10 };
  if (n <= 20) return { w: 18, gap: 4, font: 9 };
  if (n <= 24) return { w: 14, gap: 3, font: 8 };
  return { w: 11, gap: 3, font: 8 };
}

/** 通用柱状渲染：hl 高亮蓝，done 置绿；柱子按值身份 key，FLIP 真实换位（只动位置不动高度） */
export function ArrayRender({ scene: _scene }: any) {
  const scene = normScene(_scene);
  const mx = Math.max(...scene.arr, 1);
  const bs = barSize(scene.arr.length);
  // 值身份：同值按出现序号区分，交换时 DOM 节点随身份走，FLIP 补位移
  const seen = new Map<number, number>();
  const keys = scene.arr.map((v) => {
    const k = seen.get(v) ?? 0;
    seen.set(v, k + 1);
    return `${v}#${k}`;
  });
  const barRefs = useRef(new Map<string, HTMLDivElement>());
  const prevLeft = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    barRefs.current.forEach((el, key) => {
      if (!el.isConnected) return;
      const left = el.offsetLeft;
      next.set(key, left);
      const old = prevLeft.current.get(key);
      if (old !== undefined && old !== left) {
        el.animate(
          [{ transform: `translateX(${old - left}px)` }, { transform: 'translateX(0px)' }],
          { duration: 320, easing: 'cubic-bezier(.3,.7,.3,1)' },
        );
      }
    });
    prevLeft.current = next;
  });
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="bars" style={{ overflowX: 'auto', gap: bs.gap }}>
        {scene.arr.length === 0 ? (
          <span style={{ color: '#94a3b8', fontSize: 12 }}>空数组 — 输入 2~30 个 0~999 的整数</span>
        ) : (
          scene.arr.map((v, i) => {
            const active = scene.hl.includes(i);
            const settled = scene.done[i];
            return (
              <div
                key={keys[i]}
                ref={(el) => {
                  if (el) barRefs.current.set(keys[i], el);
                  else barRefs.current.delete(keys[i]);
                }}
                className={`bar ${active ? 'hl' : ''}`}
                style={{
                  width: bs.w,
                  minWidth: bs.w,
                  height: `${(v / mx) * 140 + 14}px`,
                  fontSize: bs.font,
                  overflow: 'hidden',
                  transition: 'height .3s, background-color .35s',
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
      {scene.buckets && scene.buckets.length > 0 && (
        <div style={{ display: 'grid', gap: 4, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
          {scene.buckets.map((b, bi) => (
            <div key={bi} style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#475569', fontWeight: 800, minWidth: 34 }}>桶{bi}</span>
              {b.length === 0 ? (
                <span style={{ fontSize: 11, color: '#cbd5e1', border: '1px dashed #cbd5e1', borderRadius: 6, padding: '2px 10px' }}>空</span>
              ) : (
                b.map((v, k) => (
                  <span key={k} style={{ minWidth: 30, textAlign: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'ui-monospace, monospace', background: '#fff', border: '1.5px solid #0ea5e9', borderRadius: 6, padding: '2px 6px', color: '#0f172a' }}>{v}</span>
                ))
              )}
            </div>
          ))}
        </div>
      )}
      {scene.aux && scene.aux.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-end' }}>
          <span style={{ fontSize: 11, color: '#64748b', minWidth: 28 }}>tmp</span>
          {(() => {
            const nums = (scene.aux as (number | null)[]).filter((v): v is number => v !== null);
            const m2 = nums.length ? Math.max(...nums) : 1;
            return (scene.aux as (number | null)[]).map((v, i) =>
              v === null ? (
                <span key={i} style={{ width: 26, height: 14, border: '1px dashed #cbd5e1', borderRadius: 4 }} />
              ) : (
                <span key={i} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <span style={{ width: 26, height: `${(v / m2) * 56 + 10}px`, background: '#e0e7ff', border: '1px solid #c7d2fe', borderRadius: 4, fontSize: 10, textAlign: 'center', color: '#4338ca', fontWeight: 700, overflow: 'hidden', transition: 'height .3s' }}>{v}</span>
                  <span style={{ fontSize: 9, color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>{i}</span>
                </span>
              ),
            );
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
