import { T, type Text } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, NumField, TextField, Row, Steps, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 软件工程 · 第2章 需求工程
//   对应 tex/SoftwareEngineering/chapters/requirements.tex
//   elicitation(需求获取) / usecase(用例建模)
// =====================================================================

type SubMode = "elicitation" | "usecase";

function ElicitationRender({ config, t }: any) {
  const zh = isZh(t);
  const rows: React.ReactNode[][] = zh
    ? [
      ["访谈 Interview", "与干系人一对一 / 小组交流", "深挖隐含需求；成本高、依赖技巧"],
      ["问卷 Questionnaire", "结构化问题批量收集", "覆盖广、易统计；难追问细节"],
      ["观察 Observation", "到现场看真实工作流", "发现未说出口的需求；耗时"],
      ["原型 Prototype", "可运行 / 低保真原型试错", "澄清模糊需求；易被误当成品"],
      ["文档分析 Document", "分析表单、手册、旧系统", "快速获取业务规则；文档易过时"],
    ]
    : [
      ["Interview", "one-on-one / group talk", "uncover tacit needs; costly"],
      ["Questionnaire", "structured batch collection", "broad, easy to tally; no follow-up"],
      ["Observation", "watch real workflow on site", "find unspoken needs; time-consuming"],
      ["Prototype", "runnable / low-fi trial", "clarify fuzzy needs; mistaken as final"],
      ["Document Analysis", "study forms, manuals, legacy", "fast business rules; may be stale"],
    ];
  const n = Number(config.n ?? 0);
  const c = Number(config.c ?? 0);
  const m = Number(config.m ?? 0);
  const ratio = n > 0 ? Math.min(100, (c / n) * 100) : 0;
  return (
    <Panel>
      <Table head={zh ? ["方法", "做法", "适用与要点"] : ["Method", "Approach", "Fit & pitfalls"]} rows={rows} />
      <Row>
        <span style={{ fontSize: 12, color: "#475569" }}>{zh ? "基线" : "Baseline"}: <b>{config.baseline}</b></span>
        <span style={{ fontSize: 12, color: "#475569" }}>{zh ? "需求总数" : "Requirements"}: <b>{n}</b></span>
        <span style={{ fontSize: 12, color: "#475569" }}>{zh ? "变更请求" : "Change reqs"}: <b>{c}</b></span>
        <span style={{ fontSize: 12, color: "#475569" }}>{zh ? "平均影响模块" : "Modules each"}: <b>{m}</b></span>
      </Row>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 84, fontSize: 12, color: "#475569" }}>{zh ? "变更占比" : "Change ratio"}</span>
        <div style={{ flex: 1, height: 16, background: "#f1f5f9", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ width: `${ratio}%`, height: "100%", background: ratio > 30 ? "#ef4444" : "#6366f1" }} />
        </div>
        <span style={{ width: 132, fontSize: 11, color: "#94a3b8", textAlign: "right" }}>{ratio.toFixed(1)}% · {c * m} {zh ? "模块影响" : "module hits"}</span>
      </div>
      <Steps items={zh
        ? [["基线", "需求评审通过后冻结，作为变更与验收基准"], ["变更控制", "变更申请 (CR) → 影响分析 → 批准/拒绝 → 更新基线"], ["追溯矩阵", "需求 ↔ 设计 ↔ 代码 ↔ 测试 双向链接，保证覆盖"]]
        : [["Baseline", "freeze after review; basis for change & acceptance"], ["Change Control", "CR → impact analysis → approve/reject → update baseline"], ["Traceability", "bidirectional req ↔ design ↔ code ↔ test links"]]} />
      <Note tone="warn">{zh ? "需求蔓延 (scope creep) 是进度与成本失控的头号诱因：需求变更必须有基线、有评审、有追溯。" : "Scope creep is the top cause of overruns: every change needs a baseline, a review, and traceability."}</Note>
    </Panel>
  );
}

function ElicitationControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <Row>
      <TextField label={zh ? "基线版本" : "Baseline"} value={config.baseline} onChange={(v) => onChange({ ...config, baseline: v })} width={90} mono={false} placeholder="v1.0" />
      <NumField label={zh ? "需求总数" : "Req count"} value={config.n} onChange={(v) => onChange({ ...config, n: v })} min={1} max={2000} width={80} />
      <NumField label={zh ? "变更请求" : "Changes"} value={config.c} onChange={(v) => onChange({ ...config, c: v })} min={0} max={2000} width={80} />
      <NumField label={zh ? "影响模块" : "Modules"} value={config.m} onChange={(v) => onChange({ ...config, m: v })} min={1} max={50} width={70} />
    </Row>
  );
}

const USECASE_ACTOR = T("顾客", "Customer");
const USECASE_FLOW: Text[] = [
  T("① 选择商品并加入购物车", "① Select items, add to cart"),
  T("② 填写收货地址", "② Fill in shipping address"),
  T("③ 选择支付方式并支付", "③ Choose payment and pay"),
];
const USECASE_POST = T("订单已创建、库存已扣减、返回订单号", "Order created, stock decremented, order id returned");

type UseCaseScene = { step: number; actor: Text; flow: Text[]; extended: boolean };

function UseCaseRender({ scene, config, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<UseCaseScene>;
  const flow = Array.isArray(s.flow) ? s.flow : [];
  const n = flow.length;
  const step = Number(s.step ?? 0);
  const revealed = Math.max(0, Math.min(n, step));
  const active = step >= 1 && step <= n ? step - 1 : -1;
  const showExtend = step > n;
  const done = step > n + 1;
  const actor = s.actor ? t(s.actor) : "";
  const name = String(config?.name ?? "");
  return (
    <Panel>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ padding: "8px 14px", borderRadius: 999, fontWeight: 800, fontSize: 13, background: step === 0 ? "#eef2ff" : "#f8fafc", border: `1px solid ${step === 0 ? "#c7d2fe" : "#e2e8f0"}`, color: step === 0 ? "#4338ca" : "#475569" }}>
          {zh ? "参与者" : "Actor"} · {actor}
        </div>
        <span style={{ color: "#94a3b8", fontSize: 18 }}>→</span>
        <div style={{ padding: "8px 14px", borderRadius: 999, fontWeight: 800, fontSize: 13, background: step > 0 && !done ? "#eef2ff" : "#f8fafc", border: `1px solid ${step > 0 && !done ? "#c7d2fe" : "#e2e8f0"}`, color: "#3730a3" }}>
          {zh ? "用例" : "Use case"} · {name}
        </div>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {flow.map((f, i) => {
          const cur = i === active;
          const shown = i < revealed;
          return (
            <div key={i} style={{ display: "flex", gap: 12, padding: "9px 14px", borderRadius: 10, background: cur ? "#eef2ff" : "#f8fafc", border: `1px solid ${cur ? "#c7d2fe" : "#e2e8f0"}`, opacity: shown || cur ? 1 : 0.45 }}>
              <span style={{ fontWeight: 800, color: cur ? "#4338ca" : "#3730a3", width: 64, flexShrink: 0 }}>{zh ? `步骤 ${i + 1}` : `Step ${i + 1}`}</span>
              <span style={{ fontSize: 13, color: "#334155" }}>{t(f)}</span>
            </div>
          );
        })}
      </div>
      {showExtend && (
        <div style={{ display: "flex", gap: 12, padding: "9px 14px", borderRadius: 10, background: s.extended ? "#ecfdf5" : "#f8fafc", border: `1px solid ${s.extended ? "#a7f3d0" : "#e2e8f0"}` }}>
          <span style={{ fontWeight: 800, color: s.extended ? "#047857" : "#94a3b8", width: 96, flexShrink: 0 }}>{"<<extend>>"}</span>
          <span style={{ fontSize: 13, color: "#334155" }}>
            {zh ? "应用优惠券" : "Apply coupon"} — {s.extended ? (zh ? "条件成立，插入基础用例" : "condition true, inserted into base") : (zh ? "条件不成立，跳过" : "condition false, skipped")}
          </span>
        </div>
      )}
      {done && <Note>{zh ? `后置条件：${USECASE_POST.zh}` : `Postcondition: ${USECASE_POST.en}`}</Note>}
      <Note tone="warn">
        {zh ? <>include 一定执行、被复用；extend 仅在条件成立时插入，箭头指向被复用/基础的一端：<MathText text={"$\\ll\\text{extend}\\gg \\to base$"} />。</> : <>include always runs and is reused; extend only inserts under a condition, its arrow points at the base end: <MathText text={"$\\ll\\text{extend}\\gg \\to base$"} />.</>}
      </Note>
    </Panel>
  );
}

function usecaseGenerate(config: any): Frame<UseCaseScene>[] {
  const name = String(config?.name ?? "提交订单");
  const flow = USECASE_FLOW;
  const frames: Frame<UseCaseScene>[] = [
    { line: 0, caption: T(`参与者「${USECASE_ACTOR.zh}」发起用例「${name}」`, `Actor "${USECASE_ACTOR.en}" initiates use case "${name}"`), scene: { step: 0, actor: USECASE_ACTOR, flow: [], extended: false } },
  ];
  flow.forEach((f, i) => {
    frames.push({ line: 2, caption: T(`主流程第 ${i + 1} 步：${f.zh}`, `Main flow step ${i + 1}: ${f.en}`), scene: { step: i + 1, actor: USECASE_ACTOR, flow: flow.slice(0, i + 1), extended: false } });
  });
  frames.push({ line: 3, caption: T("条件不成立：跳过 $\\ll$extend$\\gg$ 分支", "Condition false: skip the $\\ll$extend$\\gg$ branch"), scene: { step: flow.length + 1, actor: USECASE_ACTOR, flow, extended: false } });
  frames.push({ line: 3, caption: T("条件成立：执行 $\\ll$extend$\\gg$「应用优惠券」", "Condition true: run $\\ll$extend$\\gg$ \"Apply coupon\""), scene: { step: flow.length + 1, actor: USECASE_ACTOR, flow, extended: true } });
  frames.push({ line: 4, caption: T(`后置条件：${USECASE_POST.zh}`, `Postcondition: ${USECASE_POST.en}`), scene: { step: flow.length + 2, actor: USECASE_ACTOR, flow, extended: true } });
  return frames;
}

const USECASE_CODE = [
  T("$actor \\to$ use case", "$actor \\to$ use case"),
  T("$\\textbf{for}$ step $\\in$ main-flow", "$\\textbf{for}$ step $\\in$ main-flow"),
  T("  execute(step)", "  execute(step)"),
  T("$\\textbf{if}$ cond $\\Rightarrow$ <<extend>>", "$\\textbf{if}$ cond $\\Rightarrow$ <<extend>>"),
  T("assert postcondition", "assert postcondition"),
];

function UseCaseControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <Row>
      <TextField label={zh ? "用例名称" : "Use case"} value={config.name} onChange={(v) => onChange({ ...config, name: v })} width={180} mono={false} placeholder={zh ? "提交订单" : "Place Order"} />
    </Row>
  );
}

const SUBS: Record<SubMode, SubDef> = {
  elicitation: { title: T("需求获取", "Elicitation"), defaultConfig: { baseline: "v1.0", n: 120, c: 15, m: 3 }, Controls: ElicitationControls, Render: ElicitationRender },
  usecase: { title: T("用例建模", "Use Case"), defaultConfig: { name: "提交订单" }, Controls: UseCaseControls, Render: UseCaseRender, generate: usecaseGenerate, code: USECASE_CODE },
};

export const { module: seRequirementsModule, GROUPS: seRequirementsGroups } = makeChapter<SubMode>({
  id: "se-requirements",
  title: T("需求工程", "Requirements Engineering"),
  desc: T("需求获取方法、需求管理与追溯矩阵、功能/非功能需求与 SRS 特征、用例建模（参与者/用例/include/extend）。", "Elicitation methods, requirement management & traceability, functional/non-functional requirements & SRS, use case modeling."),
  tags: ["software-engineering", "requirements"],
  groups: [
    { label: "需求", opts: [
      { v: "elicitation", zh: "需求获取", en: "Elicitation" },
      { v: "usecase", zh: "用例建模", en: "Use Case" }] },
  ],
  subs: SUBS,
});
