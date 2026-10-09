import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, Chips, NumField, TextField, Row, Steps, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 软件工程 · 软件测试
//   对应 tex/SoftwareEngineering/chapters/testing.tex
//   blackbox(黑盒) / coverage(覆盖率)
// =====================================================================

type SubMode = "blackbox" | "coverage";

function BlackBoxRender({ config, t }: any) {
  const zh = isZh(t);
  const param: string = config?.param ?? "age";
  const min: number = config?.min ?? 1;
  const max: number = config?.max ?? 100;
  const pts: [string, number, string][] = zh
    ? [
      ["min−1", min - 1, "无效（低于下界）"],
      ["min", min, "有效（下界）"],
      ["min+1", min + 1, "有效"],
      ["max−1", max - 1, "有效"],
      ["max", max, "有效（上界）"],
      ["max+1", max + 1, "无效（高于上界）"],
    ]
    : [
      ["min−1", min - 1, "Invalid (below lower bound)"],
      ["min", min, "Valid (lower bound)"],
      ["min+1", min + 1, "Valid"],
      ["max−1", max - 1, "Valid"],
      ["max", max, "Valid (upper bound)"],
      ["max+1", max + 1, "Invalid (above upper bound)"],
    ];
  const ecRows: React.ReactNode[][] = zh
    ? [
      ["有效等价类", `[${min}, ${max}]`, String((min + max) / 2)],
      ["无效等价类（低）", `(−∞, ${min - 1}]`, String(min - 1)],
      ["无效等价类（高）", `[${max + 1}, +∞)`, String(max + 1)],
    ]
    : [
      ["Valid", `[${min}, ${max}]`, String((min + max) / 2)],
      ["Invalid (low)", `(−∞, ${min - 1}]`, String(min - 1)],
      ["Invalid (high)", `[${max + 1}, +∞)`, String(max + 1)],
    ];
  return (
    <Panel>
      <Note>{zh ? `被测参数 ${param} ∈ [${min}, ${max}]：每类取一个代表值即可，但缺陷多藏在边界。` : `Parameter ${param} ∈ [${min}, ${max}]: one representative per class suffices, but defects hide at the boundaries.`}</Note>
      <Table head={zh ? ["等价类", "范围", "代表值"] : ["Class", "Range", "Representative"]} rows={ecRows} />
      <Table head={zh ? ["边界点", "取值", "含义"] : ["Boundary", "Value", "Meaning"]} rows={pts} />
      <Chips items={zh
        ? [["原因 Cause", "输入条件/取值"], ["结果 Effect", "输出动作/状态变化"], ["因果图", "原因结果连线 + 约束"], ["判定表", "把图转为用例组合"]]
        : [["Cause", "input condition/value"], ["Effect", "output/state change"], ["Graph", "cause→effect edges + constraints"], ["Decision table", "turn graph into cases"]]} />
      <Note tone="warn">{zh ? "边界值分析是等价类划分的补充：先划等价类，再对每个类的边界取 min−1/min/min+1/max−1/max/max+1。因果图用于处理多个输入的组合与约束。" : "Boundary value analysis complements equivalence partitioning: partition first, then sample min−1/min/min+1/max−1/max/max+1. Cause-effect graphing handles input combinations and constraints."}</Note>
    </Panel>
  );
}

function BlackBoxControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <Row>
      <TextField label={zh ? "参数名" : "Param"} value={config.param} onChange={(v) => onChange({ ...config, param: v })} width={110} />
      <NumField label={zh ? "下界 min" : "Min"} value={config.min} onChange={(v) => onChange({ ...config, min: v })} min={-999} max={100000} width={90} />
      <NumField label={zh ? "上界 max" : "Max"} value={config.max} onChange={(v) => onChange({ ...config, max: v, min: Math.min(config.min, v) })} min={-999} max={100000} width={90} />
    </Row>
  );
}

// ---------------------------------------------------------------------
// coverage（逐帧动画）：用小段代码演示四类覆盖准则各需多少个测试用例
// ---------------------------------------------------------------------
type CoverCase = [number, number];
type CoverCrit = "statement" | "decision" | "condition" | "path";
type CoverageScene = {
  criterion: CoverCrit;
  testIndex: number;
  cases: CoverCase[];
  active: CoverCase | null;
  coveredStatements: number[];
  coveredBranches: string[];
};

const COVERAGE_CODE = [
  T("int f(int a, int b) {", "int f(int a, int b) {"),
  T("  int x = 0;                  // S1", "  int x = 0;                  // S1"),
  T("  if (a > 0 && b > 0)         // D", "  if (a > 0 && b > 0)         // D"),
  T("    x = a + b;                // S2", "    x = a + b;                // S2"),
  T("  return x;                   // S3", "  return x;                   // S3"),
];

const COVER_CRITERIA: { key: CoverCrit; zh: string; en: string; cases: CoverCase[] }[] = [
  { key: "statement", zh: "语句覆盖", en: "Statement", cases: [[2, 2]] },
  { key: "decision", zh: "判定覆盖", en: "Decision", cases: [[2, 2], [-1, 2]] },
  { key: "condition", zh: "条件覆盖", en: "Condition", cases: [[2, 2], [-1, -1]] },
  { key: "path", zh: "路径覆盖", en: "Path", cases: [[2, 2], [-1, 2], [2, -1]] },
];

function coverRun(a: number, b: number) {
  const c1 = a > 0;
  const c2 = b > 0;
  const d = c1 && c2;
  return {
    c1,
    c2,
    d,
    statements: d ? [1, 2, 3] : [1, 3],
    branches: [c1 ? "c1+" : "c1-", c2 ? "c2+" : "c2-", d ? "D+" : "D-", !c1 ? "P2" : c2 ? "P1" : "P3"],
  };
}

function coverageGenerate(_config: any): Frame<CoverageScene>[] {
  const frames: Frame<CoverageScene>[] = [];
  for (const crit of COVER_CRITERIA) {
    let covS: number[] = [];
    let covB: string[] = [];
    frames.push({
      line: crit.key === "statement" ? 1 : 2,
      caption: T(
        `${crit.zh}：至少需要 ${crit.cases.length} 个测试用例`,
        `${crit.en} coverage: needs at least ${crit.cases.length} case(s)`,
      ),
      scene: { criterion: crit.key, testIndex: -1, cases: [], active: null, coveredStatements: [], coveredBranches: [] },
    });
    crit.cases.forEach((c, k) => {
      const r = coverRun(c[0], c[1]);
      covS = Array.from(new Set([...covS, ...r.statements]));
      covB = Array.from(new Set([...covB, ...r.branches]));
      frames.push({
        line: r.d ? 3 : 4,
        caption: T(
          `用例 ${k + 1}: $(a,b)=(${c[0]},${c[1]})$，$a>0=${r.c1 ? "T" : "F"}$、$b>0=${r.c2 ? "T" : "F"}$，判定 $D=${r.d ? "T" : "F"}$`,
          `Case ${k + 1}: $(a,b)=(${c[0]},${c[1]})$, $a>0=${r.c1 ? "T" : "F"}$, $b>0=${r.c2 ? "T" : "F"}$, decision $D=${r.d ? "T" : "F"}$`,
        ),
        scene: { criterion: crit.key, testIndex: k, cases: crit.cases.slice(0, k + 1), active: c, coveredStatements: covS, coveredBranches: covB },
      });
    });
  }
  return frames;
}

function CoverageRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<CoverageScene>;
  const crit = s.criterion ?? "statement";
  const covS = s.coveredStatements ?? [];
  const covB = s.coveredBranches ?? [];
  const cases = s.cases ?? [];
  const active = s.active ?? null;
  const lines = COVERAGE_CODE.map((l) => t(l));

  const curCrit = COVER_CRITERIA.find((c) => c.key === crit) ?? COVER_CRITERIA[0];
  const critName = (c: { zh: string; en: string }) => (zh ? c.zh : c.en);

  const lineCovered = (i: number): boolean => {
    if (i === 1) return covS.includes(1);
    if (i === 3) return covS.includes(2);
    if (i === 4) return covS.includes(3);
    if (i === 2) return covB.includes("D+") || covB.includes("D-");
    return false;
  };

  const chip = (on: boolean, label: string, key: string) => (
    <span key={key} style={{ padding: "2px 9px", borderRadius: 999, fontSize: 12, fontWeight: 700, fontFamily: "ui-monospace, monospace", background: on ? "#dcfce7" : "#f1f5f9", color: on ? "#166534" : "#94a3b8", border: `1px solid ${on ? "#86efac" : "#e2e8f0"}`, transition: "all .15s" }}>{label}</span>
  );
  const group = (title: string, children: React.ReactNode) => (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", width: 62, flexShrink: 0 }}>{title}</span>
      {children}
    </div>
  );

  const stmtChips: [number, string][] = [[1, "S1"], [2, "S2"], [3, "S3"]];
  const decChips: [string, string][] = [["D+", "D=T"], ["D-", "D=F"]];
  const condChips: [string, string][] = [["c1+", "a>0=T"], ["c1-", "a>0=F"], ["c2+", "b>0=T"], ["c2-", "b>0=F"]];
  const pathChips: [string, string][] = zh
    ? [["P1", "①②均真"], ["P2", "①假（短路）"], ["P3", "②假"]]
    : [["P1", "both true"], ["P2", "① false"], ["P3", "② false"]];

  return (
    <Panel>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 300px", minWidth: 260, padding: "10px 8px", borderRadius: 10, background: "#0f172a", color: "#cbd5e1", fontFamily: "ui-monospace, monospace", fontSize: 12.5, lineHeight: 1.7, overflowX: "auto" }}>
          {lines.map((ln, i) => {
            const on = lineCovered(i);
            const dec = i === 2;
            return (
              <div key={i} style={{ padding: "1px 8px", borderRadius: 4, background: on ? (dec ? "#164e63" : "#14532d") : "transparent", color: on ? "#f0fdf4" : "#94a3b8", borderLeft: `3px solid ${on ? (dec ? "#22d3ee" : "#4ade80") : "transparent"}` }}>{ln}</div>
            );
          })}
          <div style={{ marginTop: 8, padding: "4px 8px", fontSize: 11, color: "#7dd3fc" }}>
            {zh ? "当前准则" : "Now"}: {critName(curCrit)} · {zh ? `${curCrit.cases.length} 个用例` : `${curCrit.cases.length} case(s)`}
          </div>
        </div>
        <div style={{ flex: "2 1 340px", minWidth: 280, display: "grid", gap: 8, alignContent: "start" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", width: 62, flexShrink: 0 }}>{zh ? "测试用例" : "Cases"}</span>
            {cases.length === 0 && <span style={{ fontSize: 12, color: "#94a3b8" }}>{zh ? "（尚未运行）" : "(none yet)"}</span>}
            {cases.map((c, i) => {
              const cur = !!active && active[0] === c[0] && active[1] === c[1] && i === s.testIndex;
              return <span key={i} style={{ padding: "2px 9px", borderRadius: 999, fontSize: 12, fontWeight: 700, fontFamily: "ui-monospace, monospace", background: cur ? "#fde68a" : "#e0e7ff", color: cur ? "#92400e" : "#3730a3", border: `1px solid ${cur ? "#fbbf24" : "#c7d2fe"}` }}>({c[0]},{c[1]})</span>;
            })}
          </div>
          {group(zh ? "语句" : "Stmt", stmtChips.map(([id, l]) => chip(covS.includes(id), l, `s${id}`)))}
          {group(zh ? "判定" : "Dec", decChips.map(([id, l]) => chip(covB.includes(id), l, `d${id}`)))}
          {group(zh ? "条件" : "Cond", condChips.map(([id, l]) => chip(covB.includes(id), l, `c${id}`)))}
          {group(zh ? "路径" : "Path", pathChips.map(([id, l]) => chip(covB.includes(id), l, `p${id}`)))}
        </div>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {COVER_CRITERIA.map((c) => {
          const cur = c.key === crit;
          return (
            <div key={c.key} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 10px", borderRadius: 8, background: cur ? "#eef2ff" : "#f8fafc", border: `1px solid ${cur ? "#c7d2fe" : "#e2e8f0"}`, opacity: cur ? 1 : 0.7 }}>
              <b style={{ color: "#3730a3", width: 72, flexShrink: 0 }}>{critName(c)}</b>
              <span style={{ fontSize: 12, color: "#475569" }}>{zh ? `最少 ${c.cases.length} 个用例` : `min ${c.cases.length} case(s)`}</span>
              <span style={{ marginLeft: "auto", fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#0f172a" }}>{c.cases.map((cc) => `(${cc[0]},${cc[1]})`).join("  ")}</span>
            </div>
          );
        })}
      </div>
      <Note tone="warn">
        {zh ? "强弱：判定覆盖 ⊃ 语句覆盖；条件覆盖不蕴含判定覆盖，需「判定/条件覆盖」兼顾；路径覆盖最强但路径数会爆炸，常用基本路径覆盖：" : "Strength: decision ⊃ statement; condition does not imply decision (use decision/condition); path is strongest but explodes, so basic-path coverage is used: "}
        <MathText text="$V(G)=E-N+2=P+1$" />
      </Note>
    </Panel>
  );
}

const SUBS: Record<SubMode, SubDef> = {
  blackbox: { title: T("黑盒测试", "Black-box"), defaultConfig: { param: "age", min: 1, max: 100 }, Controls: BlackBoxControls, Render: BlackBoxRender },
  coverage: { title: T("覆盖率", "Coverage"), Render: CoverageRender, generate: coverageGenerate, code: COVERAGE_CODE },
};

export const { module: seTestingModule, GROUPS: seTestingGroups } = makeChapter<SubMode>({
  id: "se-testing",
  title: T("软件测试", "Software Testing"),
  desc: T(
    "测试层次（单元/集成/系统/验收）与 V 模型、等价类划分/边界值分析/因果图的黑盒测试、语句/判定/条件/路径覆盖的白盒测试，以及用例设计与回归测试。",
    "Test levels (unit/integration/system/acceptance) & V-model, black-box (equivalence partitioning, boundary value analysis, cause-effect), white-box coverage (statement/decision/condition/path), test case design and regression testing."
  ),
  tags: ["software-engineering", "testing"],
  groups: [
    { label: "测试", opts: [
      { v: "blackbox", zh: "黑盒测试", en: "Black-box" },
      { v: "coverage", zh: "覆盖率", en: "Coverage" },
    ] },
  ],
  subs: SUBS,
});
