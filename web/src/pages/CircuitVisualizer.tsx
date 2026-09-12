import { useEffect, useMemo, useRef, useState } from 'react';
import { presets, findPreset, type CircuitPreset } from '../lib/circuit/presets';
import {
  cloneCircuit,
  componentValue,
  valueKey,
  type Circuit,
} from '../lib/circuit/netlist';
import { solveDC, type DCResult } from '../lib/circuit/mna';
import { formatValue } from '../lib/circuit/format';
import { CircuitCanvas } from '../components/canvas/CircuitCanvas';

import { digPresets, findDigPreset, gateLeafPreset } from '../lib/digital/stdlib';
import type { DigCircuit, DigLayout, GateKind, LogicValue } from '../lib/digital/types';
import { simulate, valueAt, type SimResult } from '../lib/digital/sim';
import { autoLayout } from '../lib/digital/layout';
import { DigitalCanvas } from '../components/canvas/DigitalCanvas';
import { WaveformCanvas } from '../components/canvas/WaveformCanvas';

// =====================================================================
// 电路可视化：数字域（持续运行 + 滚动逻辑分析仪 + 层级联动）/ 模拟域（DC）
// =====================================================================
export function CircuitVisualizer() {
  const [domain, setDomain] = useState<'digital' | 'analog'>('digital');
  const tab = (id: 'digital' | 'analog', zh: string) => (
    <button
      className="pill"
      onClick={() => setDomain(id)}
      style={domain === id ? { background: '#4338ca', color: '#fff', borderColor: '#4338ca' } : undefined}
    >
      {zh}
    </button>
  );
  return (
    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10, height: '100%', boxSizing: 'border-box', userSelect: 'none', WebkitUserSelect: 'none' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 12, background: '#eef2ff', border: '1px solid #c7d2fe' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#4338ca' }}>电路可视化</span>
        {tab('digital', '数字电路')}
        {tab('analog', '模拟电路')}
      </div>
      {domain === 'digital' ? <DigitalBoard /> : <AnalogBoard />}
    </div>
  );
}

// =====================================================================
// 数字域
// =====================================================================
type View =
  | { kind: 'circuit'; label: string; circuit: DigCircuit; layout: DigLayout; top: boolean; defId?: string; connections?: Record<string, string> }
  | { kind: 'gate'; label: string; gateKind: GateKind; inputNets: string[] };

function topView(circuit: DigCircuit, layout: DigLayout, label: string): View {
  return { kind: 'circuit', label, circuit, layout, top: true };
}

const TIMEBASES = [2, 4, 8, 16, 32];

function DigitalBoard() {
  const [presetId, setPresetId] = useState(digPresets[0].id);
  const preset = useMemo(() => findDigPreset(presetId), [presetId]);

  const [events, setEvents] = useState<{ t: number; net: string; value: LogicValue }[]>([]);
  const [init, setInit] = useState<Record<string, LogicValue>>({});
  const [views, setViews] = useState<View[]>(() => [topView(digPresets[0].top, digPresets[0].layout, digPresets[0].title.zh)]);
  const [time, setTime] = useState(0);
  const [timebase, setTimebase] = useState(8);
  const [variant, setVariant] = useState<'cmos' | 'dtl'>('cmos');
  const timeRef = useRef(0);
  timeRef.current = time;

  useEffect(() => {
    const base: Record<string, LogicValue> = {};
    for (const i of preset.top.inputs) base[i.net] = i.value;
    // 自动时钟：为带 clock 周期的输入预生成翻转事件（足够看到若干周期）
    const CLK_H = 200;
    const evs: { t: number; net: string; value: LogicValue }[] = [];
    for (const i of preset.top.inputs) {
      if (!i.clock) continue;
      const half = i.clock / 2;
      let v: LogicValue = '0';
      for (let t = half; t <= CLK_H + 1e-9; t += half) {
        v = v === '1' ? '0' : '1';
        evs.push({ t, net: i.net, value: v });
      }
    }
    setEvents(evs);
    setInit(base);
    setTime(0);
    setViews([topView(preset.top, preset.layout, preset.title.zh)]);
  }, [preset]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => t + dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const view = views[views.length - 1];

  // 切换视图时回到 CMOS
  useEffect(() => { setVariant('cmos'); }, [view]);

  const win = useMemo(() => Math.max(10, ...events.map((e) => e.t)) + 10, [events]);
  const rootSim: SimResult = useMemo(
    () => simulate(preset.top, preset.defs, { init, events, window: win }),
    [preset, init, events, win],
  );

  const inputVal = (net: string): LogicValue => {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].net === net) return events[i].value;
    return init[net] ?? '0';
  };

  // 视图栈各级仿真：内层由外层当前值驱动（联动）
  const sims = useMemo(() => {
    const out: (SimResult | null)[] = [rootSim];
    for (let i = 1; i < views.length; i++) {
      const v = views[i];
      if (v.kind !== 'circuit') { out.push(null); continue; }
      const parent = out[i - 1] ?? rootSim;
      const def = preset.defs.find((d) => d.id === v.defId);
      const initv: Record<string, LogicValue> = {};
      for (const p of def?.ports ?? []) {
        if (p.dir !== 'in') continue;
        const net = v.connections?.[p.name];
        initv[p.name] = net !== undefined ? valueAt(parent.waves.get(net), timeRef.current) : 'Z';
      }
      out.push(simulate(v.circuit, preset.defs, { init: initv, window: 10 }));
    }
    return out;
  }, [views, rootSim, preset]);

  const curSim: SimResult | null = view.kind === 'circuit' ? (sims[sims.length - 1] ?? rootSim) : null;
  const parentSim: SimResult = view.kind === 'gate' ? (sims[sims.length - 2] ?? rootSim) : rootSim;

  // 门内部电学视图（输入取自父层当前值）
  let leaf: { preset: CircuitPreset; result: DCResult | null; error: string } | null = null;
  if (view.kind === 'gate') {
    const ins = view.inputNets.map((n) => valueAt(parentSim.waves.get(n), timeRef.current));
    const lp = gateLeafPreset(view.gateKind, ins[0] ?? '0', ins[1] ?? ins[0] ?? '0', variant);
    if (lp) {
      try {
        leaf = { preset: lp, result: solveDC(lp.circuit), error: '' };
      } catch (e) {
        leaf = { preset: lp, result: null, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }

  // 把内层某条网名沿视图栈映射回顶层网名
  const resolveTopNet = (idx: number, net: string): string => {
    let cur = net;
    for (let i = idx; i >= 1; i--) {
      const v = views[i];
      if (v.kind !== 'circuit' || v.top) break;
      const def = preset.defs.find((d) => d.id === v.defId);
      if (def && def.ports.some((p) => p.name === cur)) {
        const nxt = v.connections?.[cur];
        if (nxt === undefined) return cur;
        cur = nxt;
      } else break;
    }
    return cur;
  };

  const toggleTopNet = (net: string) => {
    const inp = preset.top.inputs.find((i) => i.net === net);
    if (!inp) return;
    const cur = inputVal(net);
    const to: LogicValue = cur === '1' ? '0' : '1';
    setEvents((ev) => [...ev, { t: timeRef.current, net, value: to }]);
  };

  const toggleInput = (id: string) => {
    if (view.kind !== 'circuit') return;
    if (view.top) {
      const inp = preset.top.inputs.find((i) => i.id === id);
      if (inp && !inp.clock) toggleTopNet(inp.net); // 时钟自动翻转，不响应点击
      return;
    }
    const ci = view.circuit.inputs.find((i) => i.id === id);
    if (!ci) return;
    toggleTopNet(resolveTopNet(views.length - 1, ci.net));
  };

  const toggleLeafTerm = (nodeId: string) => {
    if (view.kind !== 'gate') return;
    const idx = nodeId === 'A' ? 0 : nodeId === 'B' ? 1 : -1;
    if (idx < 0) return;
    const net = view.inputNets[idx];
    if (!net) return;
    toggleTopNet(resolveTopNet(views.length - 2, net));
  };

  const openGate = (gateId: string) => {
    if (view.kind !== 'circuit') return;
    const g = view.circuit.gates.find((x) => x.id === gateId);
    if (!g) return;
    setViews((vs) => [...vs, { kind: 'gate', label: g.kind, gateKind: g.kind, inputNets: g.inputs }]);
  };

  const openBlock = (blockId: string) => {
    if (view.kind !== 'circuit') return;
    const b = view.circuit.blocks.find((x) => x.id === blockId);
    if (!b) return;
    const def = preset.defs.find((d) => d.id === b.defId);
    if (!def) return;
    setViews((vs) => [...vs, {
      kind: 'circuit', label: def.name.zh, circuit: def.circuit,
      layout: def.layout ?? autoLayout(def.circuit), top: false, defId: def.id, connections: { ...b.connections },
    }]);
  };

  const popTo = (i: number) => setViews((vs) => vs.slice(0, i + 1));

  const lanes = useMemo(() => {
    if (view.kind !== 'circuit' || !view.top) return [];
    const seen = new Set<string>();
    const list: { net: string; label: string }[] = [];
    const add = (net: string, label: string) => { if (seen.has(net)) return; seen.add(net); list.push({ net, label }); };
    for (const i of preset.top.inputs) add(i.net, i.label ?? i.net);
    for (const g of preset.top.gates) add(g.output, g.output);
    for (const o of preset.top.outputs) add(o.net, o.label ?? o.net);
    return list.map((x) => ({ ...x, samples: rootSim.waves.get(x.net) ?? [] }));
  }, [view, rootSim, preset]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <select className="txt" value={presetId} onChange={(e) => setPresetId(e.target.value)} style={{ minWidth: 170, fontWeight: 700 }}>
          {digPresets.map((p) => <option key={p.id} value={p.id}>{p.title.zh}</option>)}
        </select>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>时基</span>
        <select className="txt" value={timebase} onChange={(e) => setTimebase(Number(e.target.value))} style={{ width: 90 }}>
          {TIMEBASES.map((t) => <option key={t} value={t}>{t} 单位</option>)}
        </select>
      </div>

      {views.length > 1 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
          {views.map((v, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span style={{ color: '#94a3b8' }}>/</span>}
              <button
                className="pill"
                onClick={() => popTo(i)}
                style={i === views.length - 1 ? { background: '#eef2ff', borderColor: '#c7d2fe', fontWeight: 800 } : undefined}
              >
                {v.label}
              </button>
            </span>
          ))}
        </div>
      )}

      {view.kind === 'gate' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {view.gateKind === 'NAND' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {(['cmos', 'dtl'] as const).map((k) => (
                <button
                  key={k}
                  className="pill"
                  onClick={() => setVariant(k)}
                  style={variant === k ? { background: '#4338ca', color: '#fff', borderColor: '#4338ca' } : undefined}
                >
                  {k === 'cmos' ? 'CMOS' : 'DTL'}
                </button>
              ))}
            </div>
          )}
          {leaf
            ? <CircuitCanvas preset={leaf.preset} result={leaf.result} height={480} onToggleTerm={toggleLeafTerm} />
            : <div style={{ fontSize: 13, color: '#94a3b8', padding: 20 }}>该门暂无内部视图</div>}
        </div>
      ) : (
        <DigitalCanvas
          preset={{ ...preset, top: view.circuit, layout: view.layout }}
          sim={curSim ?? rootSim}
          time={time}
          onToggleInput={toggleInput}
          onOpenGate={openGate}
          onOpenBlock={openBlock}
          height={300}
        />
      )}

      {views.length === 1 && (
        <WaveformCanvas lanes={lanes} tStart={time - timebase} tEnd={time} height={220} />
      )}
    </div>
  );
}

// =====================================================================
// 模拟域（DC 板）
// =====================================================================
function initValues(p: CircuitPreset): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of p.circuit.components) out[c.id] = String(componentValue(c));
  return out;
}

function applyValues(base: Circuit, values: Record<string, string>): Circuit {
  const circuit = cloneCircuit(base);
  for (const c of circuit.components) {
    if (c.kind === 'M') continue;
    const raw = values[c.id];
    const n = Number(raw);
    if (raw !== undefined && raw !== '' && Number.isFinite(n)) {
      (c as unknown as Record<string, number>)[valueKey(c.kind)] = n;
    }
  }
  return circuit;
}

function unitOf(kind: Circuit['components'][number]['kind']): string {
  switch (kind) {
    case 'R': return 'Ω';
    case 'C': return 'F';
    case 'L': return 'H';
    case 'V': return 'V';
    case 'I': return 'A';
    case 'M': return '';
    case 'D': return '';
    case 'Q': return '';
  }
}

function AnalogBoard() {
  const [presetId, setPresetId] = useState(presets[0].id);
  const [values, setValues] = useState<Record<string, string>>(() => initValues(presets[0]));

  const preset = useMemo(() => findPreset(presetId), [presetId]);
  const circuit = useMemo(() => applyValues(preset.circuit, values), [preset, values]);
  const { result, error } = useMemo(() => {
    try {
      return { result: solveDC(circuit) as DCResult | null, error: '' };
    } catch (e) {
      return { result: null as DCResult | null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [circuit]);

  const switchPreset = (id: string) => { const p = findPreset(id); setPresetId(id); setValues(initValues(p)); };
  const setVal = (id: string, raw: string) => setValues((v) => ({ ...v, [id]: raw }));

  return (
    <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0, flexWrap: 'wrap' }}>
      <div style={{ flex: '2 1 420px', minWidth: 320, minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          <select className="txt" value={presetId} onChange={(e) => switchPreset(e.target.value)} style={{ minWidth: 170, fontWeight: 700 }}>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.title.zh}</option>)}
          </select>
          <button className="pill" onClick={() => setValues(initValues(preset))}>重置</button>
          <span style={{ fontSize: 12, color: '#475569' }}>{preset.desc.zh}</span>
        </div>
        <CircuitCanvas preset={preset} result={result} height={440} />
        {error && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 8px' }}>{error}</div>
        )}
      </div>

      <div style={{ flex: '1 1 260px', minWidth: 240, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
          <div style={{ padding: '6px 10px', fontSize: 12, fontWeight: 800, color: '#334155', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>元件数值</div>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {preset.circuit.components.map((c) => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ width: 44, fontWeight: 700, color: '#475569' }}>{c.label ?? c.id}</span>
                <input className="txt" type="number" value={values[c.id] ?? ''} onChange={(e) => setVal(c.id, e.target.value)} style={{ flex: 1, minWidth: 0 }} />
                <span style={{ width: 18, color: '#94a3b8' }}>{unitOf(c.kind)}</span>
              </label>
            ))}
          </div>
        </div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '6px 10px', fontSize: 12, fontWeight: 800, color: '#334155', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>求解结果（DC）</div>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
            {result ? (
              <>
                {result.nodeOrder.map((n) => (
                  <div key={n} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
                    <span style={{ color: '#475569' }}>{`V(${n})`}</span>
                    <span style={{ color: '#0f172a', fontWeight: 700 }}>{formatValue(result.nodeVoltages[n], 'V')}</span>
                  </div>
                ))}
                <div style={{ height: 1, background: '#e2e8f0', margin: '4px 0' }} />
                {circuit.components.map((c) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
                    <span style={{ color: '#475569' }}>{`I(${c.label ?? c.id})`}</span>
                    <span style={{ color: '#16a34a', fontWeight: 700 }}>{formatValue(result.elementCurrents[c.id] ?? 0, 'A')}</span>
                  </div>
                ))}
              </>
            ) : (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>—</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
