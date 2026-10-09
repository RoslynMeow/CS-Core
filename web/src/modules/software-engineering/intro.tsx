import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Note, NumField, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 软件工程 · 第1章 概述与过程模型
//   对应 tex/SoftwareEngineering/chapters/intro.tex
//   lifecycle(生命周期)
// =====================================================================

type SubMode = "lifecycle";

type LifecycleScene = { phase: number; cost: number };

function LifecycleRender({ scene, config, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? { phase: 0, cost: 1 }) as LifecycleScene;
  const stages: [string, string][] = zh
    ? [["需求", "收集、分析、确认、管理"], ["设计", "架构、模块、接口、数据结构"], ["实现", "编码、单元测试、代码评审"], ["测试", "集成、系统、验收"], ["维护", "纠错、适应、完善、预防"]]
    : [["Requirements", "elicit, analyze, validate, manage"], ["Design", "architecture, modules, interfaces"], ["Implementation", "coding, unit test, review"], ["Testing", "integration, system, acceptance"], ["Maintenance", "corrective, adaptive, perfective"]];
  const k = Number(config?.k) || 4;
  const costs = stages.map(([label], i) => ({ i, label, c: Math.pow(k / 2, i) }));
  const max = Math.max(...costs.map((c) => c.c));
  const desc = stages[s.phase]?.[1] ?? "";
  return (
    <Panel>
      <div style={{ display: "grid", gap: 6 }}>
        {costs.map((c) => {
          const cur = c.i === s.phase;
          return (
            <div key={c.i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 10, background: cur ? "#eef2ff" : "#f8fafc", border: `1px solid ${cur ? "#c7d2fe" : "#e2e8f0"}`, opacity: c.i <= s.phase ? 1 : 0.5 }}>
              <span style={{ width: 88, fontSize: 13, fontWeight: 800, color: cur ? "#4338ca" : "#3730a3" }}>{c.label}</span>
              <div style={{ flex: 1, height: 16, background: "#f1f5f9", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ width: `${(c.c / max) * 100}%`, height: "100%", background: cur ? "#6366f1" : "#a5b4fc" }} />
              </div>
              <span style={{ width: 52, fontSize: 12, color: "#475569", textAlign: "right" }}>{c.c.toFixed(1)}×</span>
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={`$C_{fix} \\approx ${s.cost.toFixed(1)}\\times,\\quad C \\propto e^{k\\cdot stage}$`} />
      </div>
      <Note>{zh ? `当前阶段「${costs[s.phase]?.label}」：${desc}。` : `Current phase "${costs[s.phase]?.label}": ${desc}.`}</Note>
      <Note tone="warn">{zh ? "缺陷发现越晚，修复代价呈指数增长：需求阶段改一行，测试阶段可能要重构。所以尽早评审与测试。" : "The later a defect is found, the exponentially costlier it is to fix: early reviews and testing pay off."}</Note>
    </Panel>
  );
}

const LIFECYCLE_CODE = [
  T("阶段 $p \\gets$ 需求 → 设计 → 实现 → 测试 → 维护", "phase $p \\gets$ req → design → impl → test → maint"),
  T("缺陷在阶段 $p$ 引入", "defect introduced at phase $p$"),
  T("修复代价 $C \\propto e^{k\\cdot p}$", "fix cost $C \\propto e^{k\\cdot p}$"),
  T("$C \\gets \\left(k/2\\right)^{p}$", "$C \\gets \\left(k/2\\right)^{p}$"),
  T("越晚发现，代价越高", "the later found, the costlier"),
];

function lifecycleGenerate(config: any): Frame<LifecycleScene>[] {
  const k = Number(config?.k) || 4;
  const names = [
    T("需求", "Requirements"), T("设计", "Design"), T("实现", "Implementation"),
    T("测试", "Testing"), T("维护", "Maintenance"),
  ];
  return names.map((n, i) => {
    const cost = Math.pow(k / 2, i);
    return {
      line: i,
      caption: T(`阶段「${n.zh}」：修复代价约 $${cost.toFixed(1)}\\times$`, `phase "${n.en}": fix cost $\\approx ${cost.toFixed(1)}\\times$`),
      scene: { phase: i, cost },
    };
  });
}
function LifecycleControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "代价增长率 k" : "Growth k"} value={config.k} onChange={(v) => onChange({ ...config, k: v })} min={1} max={10} step={0.5} width={90} />
    </div>
  );
}

const SUBS: Record<SubMode, SubDef> = {
  lifecycle: { title: T("生命周期", "Lifecycle"), defaultConfig: { k: 4 }, Controls: LifecycleControls, Render: LifecycleRender, generate: lifecycleGenerate, code: LIFECYCLE_CODE },
};

export const { module: seIntroModule, GROUPS: seIntroGroups } = makeChapter<SubMode>({
  id: "se-overview",
  title: T("软件工程概述", "SE Overview"),
  desc: T("软件生命周期与缺陷修复代价。", "Software lifecycle & defect fix cost."),
  tags: ["software-engineering", "intro"],
  groups: [
    { label: "概述", opts: [
      { v: "lifecycle", zh: "生命周期", en: "Lifecycle" },
    ] },
  ],
  subs: SUBS,
});
