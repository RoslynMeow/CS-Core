import { T } from '../../i18n/lang';
import type { Frame, ModuleDef } from '../../engine/types';
import { ArrayControls, parseArr, blankScene, type ArrayCfg } from './shared';
import { bubbleModule, selectionModule, insertionModule } from './sortBasic';
import { shellModule, mergeModule, quickModule } from './sortFast';
import { heapModule, countingModule, radixModule, bucketModule } from './sortExtra';

/** 排序 PK：同一初始数组，10 个排序同页锁步播放，比完成先后＋比较/写回数 */

type Racer = { mod: unknown; title: string };
const RACERS: Racer[] = [
  { mod: bubbleModule, title: '冒泡' },
  { mod: selectionModule, title: '选择' },
  { mod: insertionModule, title: '插入' },
  { mod: shellModule, title: '希尔' },
  { mod: mergeModule, title: '归并' },
  { mod: quickModule, title: '快排' },
  { mod: heapModule, title: '堆排' },
  { mod: countingModule, title: '计数' },
  { mod: radixModule, title: '基数' },
  { mod: bucketModule, title: '桶排' },
];

export type RaceSub = {
  title: string;
  arr: number[];
  hl: number[];
  done: boolean[];
  cmp: number;
  mov: number;
  total: number; // 该算法总帧数
  finished: boolean; // 本步是否已跑完
  unsupported: boolean; // 如计数遇到 max>99
};

export type RaceScene = { step: number; total: number; subs: RaceSub[] };
export type RaceCfg = ArrayCfg;

function framesOf(r: unknown): Frame<any>[] {
  if (Array.isArray(r)) return r as Frame<any>[];
  const o = r as { frames?: Frame<any>[] };
  if (o && Array.isArray(o.frames)) return o.frames;
  return [];
}

function badInput(): Frame<RaceScene>[] {
  const subs: RaceSub[] = RACERS.map((r) => ({
    title: r.title, arr: [], hl: [], done: [], cmp: 0, mov: 0, total: 0, finished: true, unsupported: false,
  }));
  return [{
    line: 0,
    caption: T('! 数组不合法：2~30 个 0~999 的整数，逗号/空格分隔', '! Invalid array'),
    scene: { step: 0, total: 0, subs },
  }];
}

function raceGen(cfg: RaceCfg): Frame<RaceScene>[] {
  const arr = parseArr(cfg.valuesStr);
  if (!arr) return badInput();
  const runs = RACERS.map((r) => {
    try {
      return framesOf((r.mod as ModuleDef).generate(cfg as never));
    } catch {
      return [];
    }
  });
  const totals = runs.map((f) => f.length);
  const total = Math.max(1, ...totals);
  const frames: Frame<RaceScene>[] = [];
  for (let k = 0; k < total; k++) {
    const subs: RaceSub[] = runs.map((f, j) => {
      const fr = f[Math.min(k, f.length - 1)];
      const s = (fr?.scene ?? blankScene()) as any;
      const unsupported = !Array.isArray(s.arr) || s.arr.length === 0;
      const done = Array.isArray(s.done) && s.done.length === (s.arr ?? []).length
        ? (s.done as boolean[]).map(Boolean)
        : (s.arr ?? []).map(() => false);
      return {
        title: RACERS[j].title,
        arr: unsupported ? [] : ([...(s.arr as number[])] as number[]),
        hl: unsupported ? [] : ((s.hl ?? []) as number[]).filter((v) => Number.isInteger(v)),
        done,
        cmp: Number.isFinite(s.cmp) ? s.cmp : 0,
        mov: Number.isFinite(s.mov) ? s.mov : 0,
        total: totals[j],
        finished: k >= totals[j] - 1 && totals[j] > 0,
        unsupported,
      };
    });
    const doneNames = subs.filter((s) => s.finished && !s.unsupported).map((s) => `${s.title}@${s.total}`).join('，');
    frames.push({
      line: 0,
      caption: T(
        `第 ${k + 1}/${total} 步${doneNames ? ` · 已完成：${doneNames}` : ''}`,
        `Step ${k + 1}/${total}`,
      ),
      scene: { step: k, total, subs },
    });
  }
  return frames;
}

function RaceRender({ scene: _scene }: any) {
  const scene = (_scene ?? {}) as RaceScene;
  const subs = Array.isArray(scene.subs) ? scene.subs : [];
  return (
    <div className="race-grid">
      {subs.map((s, j) => {
        const mx = Math.max(...s.arr, 1);
        const rank = subs.filter((o) => !o.unsupported && o.total < s.total).length + 1;
        return (
          <div key={j} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
            <div style={{ padding: '6px 10px', fontSize: 12, fontWeight: 800, color: '#4338ca', display: 'flex', gap: 6, alignItems: 'center', background: '#eef2ff' }}>
              <span>{s.title}</span>
              {s.unsupported
                ? <span style={{ fontWeight: 400, color: '#b91c1c', fontSize: 11 }}>不支持（值域&gt;99）</span>
                : s.finished
                  ? <span style={{ fontWeight: 700, color: '#059669', fontSize: 11 }}>✓ {s.total}步 · 第{rank}名</span>
                  : <span style={{ fontWeight: 400, color: '#64748b', fontSize: 11 }}>共 {s.total} 步…</span>}
            </div>
            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', justifyContent: 'center', height: 104, padding: '6px 8px', flexWrap: 'nowrap', overflow: 'hidden' }}>
              {s.arr.length === 0 ? (
                <span style={{ color: '#cbd5e1', fontSize: 11, alignSelf: 'center' }}>—</span>
              ) : (
                s.arr.map((v, i) => (
                  <div
                    key={i}
                    title={`${v}`}
                    style={{
                      flex: '1 1 0px',
                      minWidth: 4,
                      height: `${(v / mx) * 84 + 8}px`,
                      borderRadius: '3px 3px 0 0',
                      background: s.hl.includes(i) ? '#4f46e5' : s.done[i] ? '#10b981' : '#94a3b8',
                      transition: 'height .25s, background-color .25s',
                    }}
                  />
                ))
              )}
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#64748b', padding: '0 6px 6px' }}>
              比较 {s.cmp} · 写回 {s.mov}
            </div>
          </div>
        );
      })}
    </div>
  ) as unknown as never;
}

export const raceModule: ModuleDef<RaceScene, RaceCfg> = {
  id: 'sort-race',
  title: T('排序 PK', 'Sorting Race'),
  desc: T('同一数组十路同跑，锁步比完成先后与比较/写回数。', 'Race all sorts on one array.'),
  tags: ['algorithms'],
  defaultConfig: { n: 8, valuesStr: '38,27,43,3,9,82,10,15' },
  Controls(p) { return ArrayControls(p as any) as never; },
  code: [T("$race$ // 十路同跑，锁步对比", "$race$")],
  bare: true,
  generate: raceGen,
  Render(p: any) { return RaceRender(p) as never; },
};
