import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, NumField, Row, Steps, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 软件工程 · 项目管理与质量
//   对应 tex/SoftwareEngineering/chapters/project.tex
//   estimation(规模与成本估算 · 逐帧推导) / scheduling(进度与关键路径)
// =====================================================================

type SubMode = "estimation" | "scheduling";

// ---------------------------------------------------------------------
// estimation：COCOMO 基本模型（组织型）逐帧公式推导
//   KLOC → 工作量 E → 开发工期 D → 平均团队规模 E/D
// ---------------------------------------------------------------------
type EstimationScene = { kloc: number; E: number; D: number; team: number; step: number };

function estimationGenerate(config: any): Frame<EstimationScene>[] {
  const kloc = Math.max(1, Number(config.kloc) || 33);
  const E = 2.4 * Math.pow(kloc, 1.05);
  const D = 2.5 * Math.pow(E, 0.38);
  const team = E / D;
  const f = (x: number, d = 1) => x.toFixed(d);
  return [
    { line: 0, caption: T(
      `规模 $KLOC = ${f(kloc, 0)}$（$= ${f(kloc * 1000, 0)}$ LOC）`,
      `Size $KLOC = ${f(kloc, 0)}$ ($= ${f(kloc * 1000, 0)}$ LOC)`),
      scene: { kloc, E, D, team, step: 0 } },
    { line: 1, caption: T(
      `工作量 $E = 2.4\\cdot ${f(kloc, 0)}^{1.05} = ${f(E)}$ 人月`,
      `Effort $E = 2.4\\cdot ${f(kloc, 0)}^{1.05} = ${f(E)}$ person-months`),
      scene: { kloc, E, D, team, step: 1 } },
    { line: 2, caption: T(
      `开发工期 $D = 2.5\\cdot ${f(E)}^{0.38} = ${f(D)}$ 月`,
      `Schedule $D = 2.5\\cdot ${f(E)}^{0.38} = ${f(D)}$ months`),
      scene: { kloc, E, D, team, step: 2 } },
    { line: 3, caption: T(
      `平均团队规模 $= E/D = ${f(E)}/${f(D)} \\approx ${f(team)}$ 人`,
      `Average team size $= E/D = ${f(E)}/${f(D)} \\approx ${f(team)}$ people`),
      scene: { kloc, E, D, team, step: 3 } },
  ];
}

const ESTIMATION_CODE = [
  T("$KLOC$ 规模输入", "input size $KLOC$"),
  T("$E \\gets 2.4\\cdot KLOC^{1.05}$", "$E \\gets 2.4\\cdot KLOC^{1.05}$"),
  T("$D \\gets 2.5\\cdot E^{0.38}$", "$D \\gets 2.5\\cdot E^{0.38}$"),
  T("$Team \\gets E / D$", "$Team \\gets E / D$"),
  T("输出 $E$（人月）、$D$（月）、团队规模", "output $E$ (PM), $D$ (mo), team size"),
];

function EstimationRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<EstimationScene>;
  const kloc = s.kloc ?? 33;
  const E = s.E ?? 2.4 * Math.pow(kloc, 1.05);
  const D = s.D ?? 2.5 * Math.pow(E, 0.38);
  const team = s.team ?? E / D;
  const step = s.step ?? 3;
  const f = (x: number, d = 1) => x.toFixed(d);
  const showE = step >= 1;
  const showD = step >= 2;
  const showT = step >= 3;

  const rows: React.ReactNode[][] = [
    [zh ? "规模 KLOC" : "Size KLOC", `${f(kloc, 0)} KLOC（${f(kloc * 1000, 0)} LOC）`, zh ? "输入" : "input"],
    [zh ? "工作量 E" : "Effort E", showE ? <b style={{ color: "#4338ca" }}>{f(E)} {zh ? "人月" : "PM"}</b> : "?", "$E = 2.4\\cdot KLOC^{1.05}$"],
    [zh ? "开发工期 D" : "Schedule D", showD ? <b style={{ color: "#4338ca" }}>{f(D)} {zh ? "月" : "mo"}</b> : "?", "$D = 2.5\\cdot E^{0.38}$"],
    [zh ? "团队规模" : "Team", showT ? <b style={{ color: "#4338ca" }}>{f(team)} {zh ? "人" : "ppl"}</b> : "?", "$Team = E / D$"],
  ];

  return (
    <Panel>
      <Row>
        <span style={{ fontSize: 14 }}>{zh ? "组织型 COCOMO 基本模型：" : "Organic COCOMO basic model:"}</span>
        <MathText text={"$E = 2.4 \\times (KLOC)^{1.05}$"} />
        <MathText text={"$D = 2.5 \\times E^{0.38}$"} />
        <MathText text={"$Team = E / D$"} />
      </Row>
      <Table head={zh ? ["项目", "值", "公式"] : ["Item", "Value", "Formula"]} rows={rows} />
      <Note>
        {zh
          ? "工作量随规模超线性增长（指数 $1.05>1$）：规模翻倍，人月增长超过一倍，所以「加人」并不能线性缩短工期。"
          : "Effort grows super-linearly with size (exponent $1.05>1$): doubling size more than doubles person-months, so adding people can't shorten the schedule linearly."}
      </Note>
      <Steps items={zh
        ? [["① 规模", "以 KLOC 表示被估系统的规模"], ["② 工作量", "$E = 2.4\\cdot KLOC^{1.05}$（人月）"], ["③ 工期", "$D = 2.5\\cdot E^{0.38}$（月）"], ["④ 团队规模", "$Team = E/D$（人）"]]
        : [["① Size", "system size in KLOC"], ["② Effort", "$E = 2.4\\cdot KLOC^{1.05}$ (PM)"], ["③ Schedule", "$D = 2.5\\cdot E^{0.38}$ (mo)"], ["④ Team", "$Team = E/D$ (people)"]]} />
    </Panel>
  );
}

function EstimationControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "规模 KLOC" : "Size KLOC"} value={config.kloc} onChange={(v) => onChange({ ...config, kloc: v })} min={1} max={2000} step={1} width={90} />
    </div>
  );
}

// ---------------------------------------------------------------------
// scheduling：固定小例子的 CPM 前向/后向计算 + 甘特条
// ---------------------------------------------------------------------
type Act = { id: string; dur: number; preds: string[] };
const ACTS: Act[] = [
  { id: "A", dur: 3, preds: [] },
  { id: "B", dur: 4, preds: ["A"] },
  { id: "C", dur: 2, preds: ["A"] },
  { id: "D", dur: 5, preds: ["B"] },
  { id: "E", dur: 1, preds: ["C"] },
  { id: "F", dur: 2, preds: ["D", "E"] },
];

function cpm(acts: Act[]) {
  const es: Record<string, number> = {};
  const ef: Record<string, number> = {};
  for (const a of acts) {
    es[a.id] = a.preds.length ? Math.max(...a.preds.map((p) => ef[p])) : 0;
    ef[a.id] = es[a.id] + a.dur;
  }
  const total = Math.max(...acts.map((a) => ef[a.id]));
  const succ: Record<string, string[]> = {};
  acts.forEach((a) => a.preds.forEach((p) => { (succ[p] = succ[p] ?? []).push(a.id); }));
  const lf: Record<string, number> = {};
  const ls: Record<string, number> = {};
  for (let i = acts.length - 1; i >= 0; i--) {
    const a = acts[i];
    const s = succ[a.id];
    lf[a.id] = s && s.length ? Math.min(...s.map((x) => ls[x])) : total;
    ls[a.id] = lf[a.id] - a.dur;
  }
  const float: Record<string, number> = {};
  acts.forEach((a) => { float[a.id] = ls[a.id] - es[a.id]; });
  return { es, ef, ls, lf, float, total };
}

type CpmScene = {
  phase: number;
  step: number;
  act: string | null;
  es: Record<string, number>;
  ef: Record<string, number>;
  ls: Record<string, number>;
  lf: Record<string, number>;
  float: Record<string, number>;
  total: number;
  critical: string[];
};

function pick(keys: string[], m: Record<string, number>): Record<string, number> {
  const o: Record<string, number> = {};
  for (const k of keys) o[k] = m[k];
  return o;
}

function schedulingGenerate(_config: any): Frame<CpmScene>[] {
  const { es, ef, ls, lf, float, total } = cpm(ACTS);
  const succ: Record<string, string[]> = {};
  ACTS.forEach((a) => a.preds.forEach((p) => { (succ[p] = succ[p] ?? []).push(a.id); }));
  const critical = ACTS.filter((a) => float[a.id] === 0).map((a) => a.id);
  const base: CpmScene = { phase: 1, step: 0, act: null, es: {}, ef: {}, ls: {}, lf: {}, float: {}, total, critical };
  const frames: Frame<CpmScene>[] = [];

  // (1) 正向：ES = max(EF_pred)，EF = ES + dur
  const doneE: string[] = [];
  ACTS.forEach((a) => {
    doneE.push(a.id);
    const expr = a.preds.length ? `\\max\\{${a.preds.map((p) => `EF_{${p}}`).join(",")}\\}` : "0";
    frames.push({
      line: 1,
      caption: T(
        "正向：$ES_{" + a.id + "}=" + expr + "=" + es[a.id] + "$，$EF_{" + a.id + "}=" + es[a.id] + "+" + a.dur + "=" + ef[a.id] + "$",
        "Forward: $ES_{" + a.id + "}=" + expr + "=" + es[a.id] + "}$, $EF_{" + a.id + "}=" + es[a.id] + "+" + a.dur + "=" + ef[a.id] + "$",
      ),
      scene: { ...base, phase: 1, step: doneE.length, act: a.id, es: pick(doneE, es), ef: pick(doneE, ef) },
    });
  });

  // (2) 反向：LF = min(LS_succ)，LS = LF − dur
  const doneL: string[] = [];
  for (let i = ACTS.length - 1; i >= 0; i--) {
    const a = ACTS[i];
    doneL.push(a.id);
    const s = succ[a.id];
    const sexpr = s && s.length ? `\\min\\{${s.map((x) => `LS_{${x}}`).join(",")}\\}` : `${total}`;
    frames.push({
      line: 3,
      caption: T(
        "反向：$LF_{" + a.id + "}=" + sexpr + "=" + lf[a.id] + "$，$LS_{" + a.id + "}=" + lf[a.id] + "-" + a.dur + "=" + ls[a.id] + "$",
        "Backward: $LF_{" + a.id + "}=" + sexpr + "=" + lf[a.id] + "}$, $LS_{" + a.id + "}=" + lf[a.id] + "-" + a.dur + "=" + ls[a.id] + "$",
      ),
      scene: { ...base, phase: 2, step: doneL.length, act: a.id, es, ef, ls: pick(doneL, ls), lf: pick(doneL, lf) },
    });
  }

  // (3) 浮动：TF = LS − ES
  const doneF: string[] = [];
  ACTS.forEach((a) => {
    doneF.push(a.id);
    frames.push({
      line: 4,
      caption: T(
        "浮动：$TF_{" + a.id + "}=LS_{" + a.id + "}-ES_{" + a.id + "}=" + ls[a.id] + "-" + es[a.id] + "=" + float[a.id] + "$",
        "Float: $TF_{" + a.id + "}=LS_{" + a.id + "}-ES_{" + a.id + "}=" + ls[a.id] + "-" + es[a.id] + "=" + float[a.id] + "$",
      ),
      scene: { ...base, phase: 3, step: doneF.length, act: a.id, es, ef, ls, lf, float: pick(doneF, float) },
    });
  });

  // (4) 关键路径：TF = 0
  frames.push({
    line: 5,
    caption: T(
      `关键路径 $${critical.join(" \\to ")}$，总工期 $= ${total}$`,
      `Critical path $${critical.join(" \\to ")}$, total duration $= ${total}$`,
    ),
    scene: { ...base, phase: 4, step: ACTS.length, act: null, es, ef, ls, lf, float },
  });

  return frames;
}

const SCHEDULING_CODE = [
  T("$ES=\\max\\{EF_{pred}\\}$，$EF=ES+dur$", "$ES=\\max\\{EF_{pred}\\}$, $EF=ES+dur$"),
  T("正向：按拓扑序遍历活动", "forward pass: visit acts in topo order"),
  T("$LF=\\min\\{LS_{succ}\\}$，$LS=LF-dur$", "$LF=\\min\\{LS_{succ}\\}$, $LS=LF-dur$"),
  T("反向：按逆拓扑序遍历活动", "backward pass: reverse topo order"),
  T("$TF=LS-ES=LF-EF$", "$TF=LS-ES=LF-EF$"),
  T("关键路径 $=\\{TF=0\\}$", "critical path $=\\{TF=0\\}$"),
];

function SchedulingRender({ scene, t }: any) {
  const zh = isZh(t);
  const full = cpm(ACTS);
  const s = (scene ?? {}) as Partial<CpmScene>;
  const phase = s.phase ?? 4;
  const es = s.es ?? full.es;
  const ef = s.ef ?? full.ef;
  const ls = s.ls ?? full.ls;
  const lf = s.lf ?? full.lf;
  const fl = s.float ?? full.float;
  const total = s.total ?? full.total;
  const act = s.act ?? null;
  const showL = phase >= 2;
  const showF = phase >= 3;
  const showC = phase >= 4;
  const cell = (v: number | undefined) => (v === undefined ? "?" : v);

  const rows: React.ReactNode[][] = ACTS.map((a) => {
    const isCur = a.id === act;
    const critical = showC && fl[a.id] === 0;
    return [
      <span style={{ color: critical ? "#b91c1c" : isCur ? "#4338ca" : "#0f172a", fontWeight: critical || isCur ? 800 : 700 }}>{a.id}{critical ? " ★" : ""}</span>,
      a.dur,
      a.preds.length ? a.preds.join(", ") : "—",
      cell(es[a.id]), cell(ef[a.id]),
      showL ? cell(ls[a.id]) : "?",
      showL ? cell(lf[a.id]) : "?",
      <span style={{ color: critical ? "#b91c1c" : "#475569", fontWeight: critical ? 800 : 400 }}>{showF ? cell(fl[a.id]) : "?"}</span>,
    ];
  });

  return (
    <Panel>
      <Note>
        {zh
          ? "关键路径法 (CPM)：把活动建成网络，正向算最早开始 ES/完成 EF，反向算最晚完成 LF/开始 LS；总浮动时间 TF = LS − ES = LF − EF，TF = 0 的活动组成关键路径。"
          : "Critical Path Method: build an activity network, forward pass gives ES/EF, backward pass gives LS/LF; total float TF = LS − ES = LF − EF. Activities with TF = 0 form the critical path."}
      </Note>

      <div style={{ display: "grid", gap: 6 }}>
        {ACTS.map((a) => {
          const isCur = a.id === act;
          const critical = showC && fl[a.id] === 0;
          const esV = es[a.id];
          return (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 46, fontSize: 12, color: critical ? "#b91c1c" : isCur ? "#4338ca" : "#475569", fontWeight: critical || isCur ? 800 : 600 }}>{a.id} ({a.dur})</span>
              <div style={{ flex: 1, height: 16, background: "#f1f5f9", borderRadius: 8, position: "relative" }}>
                {showL && ls[a.id] !== undefined && (
                  <div style={{ position: "absolute", left: `${(ls[a.id] / total) * 100}%`, width: `${(a.dur / total) * 100}%`, height: "100%", background: "#e2e8f0", borderRadius: 8 }} />
                )}
                {esV !== undefined && (
                  <div style={{
                    position: "absolute", left: `${(esV / total) * 100}%`, width: `${(a.dur / total) * 100}%`,
                    height: "100%", background: critical ? "#ef4444" : "#6366f1", borderRadius: 8, opacity: isCur ? 1 : 0.85,
                  }} />
                )}
              </div>
              <span style={{ width: 92, fontSize: 11, color: "#94a3b8", textAlign: "right" }}>
                {esV !== undefined ? `ES ${esV}${ef[a.id] !== undefined ? ` EF ${ef[a.id]}` : ""}` : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <Table
        head={zh ? ["活动", "工期", "前置", "ES", "EF", "LS", "LF", "浮动 TF"] : ["Act", "Dur", "Preds", "ES", "EF", "LS", "LF", "Float"]}
        rows={rows} />
      {showC && (
        <Note tone="warn">
          <MathText text={zh ? "关键路径：$A \\to B \\to D \\to F$，总工期 $= 3+4+5+2 = 14$。C、E 各有 6 个时间单位浮动，可推迟而不影响总工期。" : "Critical path: $A \\to B \\to D \\to F$, total duration $= 3+4+5+2 = 14$. C and E each have 6 units of float."} />
        </Note>
      )}
      <Steps items={zh
        ? [["甘特图", "横条显示各活动起止，直观展示并行与进度跟踪"], ["PERT", "三点估算（乐观/最可能/悲观）应对工期不确定性"], ["关键路径", "零浮动活动串成最短工期链，须重点监控"]]
        : [["Gantt", "bars show start/end, visualize parallelism & tracking"], ["PERT", "three-point estimate for duration uncertainty"], ["Critical path", "zero-float chain = shortest duration, monitor closely"]]} />
    </Panel>
  );
}

const SUBS: Record<SubMode, SubDef> = {
  estimation: {
    title: T("规模与成本估算", "Size & Cost Estimation"),
    defaultConfig: { kloc: 33 },
    Controls: EstimationControls,
    Render: EstimationRender,
    generate: estimationGenerate,
    code: ESTIMATION_CODE,
  },
  scheduling: {
    title: T("进度与关键路径", "Scheduling & Critical Path"),
    Render: SchedulingRender,
    generate: schedulingGenerate,
    code: SCHEDULING_CODE,
  },
};

export const { module: seProjectModule, GROUPS: seProjectGroups } = makeChapter<SubMode>({
  id: "se-project",
  title: T("项目管理与质量", "Project Management"),
  desc: T(
    "规模与成本估算（LOC / 功能点 FP / COCOMO 基本模型逐帧推导 E、D 与团队规模）与进度计划（甘特图 / PERT / 关键路径 CPM 与浮动时间）。",
    "Size & cost estimation (LOC / FP / COCOMO basic model deriving E, D and team size) and scheduling (Gantt / PERT / CPM & float).",
  ),
  tags: ["software-engineering", "project"],
  groups: [
    {
      label: "项目管理", opts: [
        { v: "estimation", zh: "成本估算", en: "Estimation" },
        { v: "scheduling", zh: "进度与关键路径", en: "Scheduling" },
      ],
    },
  ],
  subs: SUBS,
});
