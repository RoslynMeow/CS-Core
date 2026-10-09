import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, Chips, NumField, TextField, Row, Steps, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 软件工程 · 结构化分析与设计
//   对应 tex/SoftwareEngineering/chapters/structured.tex
//   dfd(数据流图) / data-dictionary(数据字典)
// =====================================================================

type SubMode = "dfd" | "data-dictionary";

// DFD 元素方框：外部实体(矩形) / 加工(圆角) / 数据存储(方角) —— 纯 HTML + inline style
function Box({ label, kind, active }: { label: string; kind: "entity" | "proc" | "store"; active?: boolean }) {
  const skin = {
    entity: { background: "#dbeafe", border: "1.5px solid #93c5fd", color: "#1d4ed8", borderRadius: 4 },
    proc: { background: "#ffedd5", border: "1.5px solid #fdba74", color: "#c2410c", borderRadius: 16 },
    store: { background: "#dcfce7", border: "1.5px solid #86efac", color: "#15803d", borderRadius: 3 },
  }[kind];
  return (
    <div style={{ ...skin, padding: "9px 13px", fontSize: 12.5, fontWeight: 700, textAlign: "center", whiteSpace: "pre-line", minWidth: 78, transition: "all .18s ease", opacity: active ? 1 : 0.55, boxShadow: active ? "0 0 0 3px rgba(99,102,241,0.4)" : "none", transform: active ? "scale(1.06)" : "none" }}>
      {label}
    </div>
  );
}

// 数据流箭头（CSS 三角，不依赖 Unicode 箭头字符）
function Flow({ label, active }: { label?: string; active?: boolean }) {
  const color = active ? "#6366f1" : "#94a3b8";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 56, transition: "opacity .18s ease", opacity: active ? 1 : 0.55 }}>
      {label && <span style={{ fontSize: 10, color: active ? "#4338ca" : "#64748b", fontWeight: active ? 700 : 400, whiteSpace: "nowrap" }}>{label}</span>}
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ width: active ? 34 : 30, height: active ? 3 : 2, background: color }} />
        <div style={{ width: 0, height: 0, borderTop: "4px solid transparent", borderBottom: "4px solid transparent", borderLeft: `7px solid ${color}` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// dfd
// ---------------------------------------------------------------------
type DfdScene = { step: number; activeNode: number; activeEdge: number };

function DfdRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? {}) as Partial<DfdScene>;
  const step = s.step ?? 0;
  const activeNode = s.activeNode ?? -1;
  const activeEdge = s.activeEdge ?? -1;
  const rows: React.ReactNode[][] = zh
    ? [
      ["外部实体", "矩形", "系统边界外的参与者（人 / 组织 / 外部系统），数据的源或宿"],
      ["加工", "圆 / 椭圆", "对数据做变换的处理单元，命名用「动词 + 名词」"],
      ["数据存储", "开口矩形", "数据的静态仓库（文件 / 表 / 库），只能由加工读写"],
      ["数据流", "带箭头的线", "沿箭头方向流动的数据，命名用名词，不代表控制 / 时序"],
    ]
    : [
      ["External entity", "Rectangle", "Actor outside the boundary; source or sink of data"],
      ["Process", "Circle / ellipse", "Transforms data; named verb + noun"],
      ["Data store", "Open rectangle", "Static repository; read / written only by processes"],
      ["Data flow", "Arrow", "Data moving in the arrow's direction; a noun, not control"],
    ];
  type Node = { label: string; kind: "entity" | "proc" | "store" };
  const nodes: Node[] = zh
    ? [
      { label: "客户", kind: "entity" },
      { label: "1 处理订单", kind: "proc" },
      { label: "订单表", kind: "store" },
      { label: "2 核对库存", kind: "proc" },
      { label: "仓库", kind: "entity" },
    ]
    : [
      { label: "Customer", kind: "entity" },
      { label: "1 Process order", kind: "proc" },
      { label: "Orders", kind: "store" },
      { label: "2 Check stock", kind: "proc" },
      { label: "Warehouse", kind: "entity" },
    ];
  const flows = zh ? ["订单", "写入", "读取", "发货单"] : ["order", "write", "read", "shipment"];
  const steps = zh
    ? [
      "外部实体「客户」提交订单（数据流的源）",
      "加工 1 接收并变换数据（转换）",
      "加工 1 把结果写入数据存储「订单表」",
      "加工 2 从数据存储读取数据",
      "加工 2 输出发货单到外部实体「仓库」（数据流的宿）",
    ]
    : [
      "External entity \"Customer\" submits the order (source)",
      "Process 1 receives and transforms the data",
      "Process 1 writes the result into data store \"Orders\"",
      "Process 2 reads from the data store",
      "Process 2 outputs the shipment to external entity \"Warehouse\" (sink)",
    ];
  const cur = Math.max(0, Math.min(steps.length - 1, step));
  return (
    <Panel>
      <Table head={zh ? ["元素", "符号", "说明"] : ["Element", "Symbol", "Meaning"]} rows={rows} />
      <div style={{ fontWeight: 800, color: "#334155", fontSize: 13 }}>{zh ? "订单处理系统数据流（逐帧）" : "Order-system data flow (frame by frame)"}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 4, padding: "6px 0" }}>
        {nodes.map((n, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center" }}>
            <Box label={n.label} kind={n.kind} active={activeNode === i} />
            {i < nodes.length - 1 && <Flow label={flows[i]} active={activeEdge === i} />}
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 14px", borderRadius: 10, background: "#eef2ff", border: "1px solid #c7d2fe", fontSize: 13, color: "#3730a3", lineHeight: 1.8, fontWeight: 600 }}>
        {steps[cur]}
      </div>
      <Note tone="warn">
        {zh
          ? <>平衡原则：父图中某加工在边界上的输入 / 输出数据流，必须与子图边界的数据流一一对应——分解时数据不凭空产生，也不凭空消失。加工编号形如 <MathText text={"$1 \\to 1.1, 1.2$"} />。</>
          : <>Balancing: the boundary data flows of a process in the parent diagram must match those of its child diagram exactly — no data is created or lost. Numbering like <MathText text={"$1 \\to 1.1, 1.2$"} />.</>}
      </Note>
    </Panel>
  );
}

function dfdGenerate(_config: any): Frame<DfdScene>[] {
  return [
    { line: 0, caption: T("外部实体「客户」提交订单（数据流的源）", "External entity \"Customer\" submits an order (source)"), scene: { step: 0, activeNode: 0, activeEdge: -1 } },
    { line: 1, caption: T("加工接收订单并变换数据（转换）", "Process receives the order and transforms the data"), scene: { step: 1, activeNode: 1, activeEdge: 0 } },
    { line: 2, caption: T("加工把结果写入数据存储「订单表」", "Process writes the result into data store \"Orders\""), scene: { step: 2, activeNode: 2, activeEdge: 1 } },
    { line: 3, caption: T("另一加工从数据存储读取数据", "Another process reads from the data store"), scene: { step: 3, activeNode: 3, activeEdge: 2 } },
    { line: 4, caption: T("加工输出发货单到外部实体「仓库」（数据流的宿）", "Process outputs the shipment to external entity \"Warehouse\" (sink)"), scene: { step: 4, activeNode: 4, activeEdge: 3 } },
  ];
}

const DFD_CODE = [
  T("外部实体 → 加工（提交数据）", "entity → process (submit)"),
  T("加工：变换数据", "process: transform data"),
  T("加工 → 数据存储（写入）", "process → store (write)"),
  T("数据存储 → 加工（读取）", "store → process (read)"),
  T("加工 → 外部实体（输出）", "process → entity (output)"),
];

// ---------------------------------------------------------------------
// data-dictionary
// ---------------------------------------------------------------------
function DictControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <Row>
      <TextField label={zh ? "名称" : "Name"} value={config.name} onChange={(v) => onChange({ ...config, name: v })} width={110} />
      <TextField label={zh ? "组成" : "Body"} value={config.body} onChange={(v) => onChange({ ...config, body: v })} width={300} />
    </Row>
  );
}
function DictRender({ config, t }: any) {
  const zh = isZh(t);
  const sym: React.ReactNode[][] = zh
    ? [
      ["=", "被定义项 = 其组成", "订单 = 订单号 + 客户 + {订单项}"],
      ["+", "顺序连接（逻辑与）", "客户 = 姓名 + 地址 + 电话"],
      ["{ }", "重复（0 次或多次）", "{订单项}"],
      ["[ ]", "从中选择一项", "性别 = [男 | 女]"],
      ["|", "在 [ ] 内分隔备选项", "男 | 女"],
      ["( )", "可选（可有可无）", "电话 = 座机 + (手机)"],
    ]
    : [
      ["=", "defined as (composition)", "order = order-no + customer + {item}"],
      ["+", "sequence (logical AND)", "customer = name + address + phone"],
      ["{ }", "repetition (0 or more)", "{item}"],
      ["[ ]", "choose exactly one", "gender = [male | female]"],
      ["|", "separates options in [ ]", "male | female"],
      ["( )", "optional", "phone = landline + (mobile)"],
    ];
  const examples: React.ReactNode[][] = zh
    ? [
      ["订单", "订单号 + 客户 + {订单项} + 下单日期"],
      ["订单项", "商品号 + 数量 + 单价"],
      ["客户", "客户号 + 姓名 + (联系电话)"],
    ]
    : [
      ["order", "order-no + customer + {item} + date"],
      ["item", "sku + qty + unit-price"],
      ["customer", "id + name + (phone)"],
    ];
  return (
    <Panel>
      <Table head={zh ? ["记号", "含义", "例"] : ["Symbol", "Meaning", "Example"]} rows={sym} />
      <div style={{ fontWeight: 800, color: "#334155", fontSize: 13 }}>{zh ? "示例：订单的数据字典" : "Example: data dictionary for an order"}</div>
      <Table head={zh ? ["数据项", "定义"] : ["Entry", "Definition"]} rows={examples} />
      <Steps items={zh
        ? [["定义流入", "为 DFD 中每条数据流命名并定义其组成"], ["定义存储", "说明数据存储的记录结构"], ["保持一致", "数据字典须与 DFD 中的名字、组成一致"]]
        : [["Flows", "name and define every data flow in the DFD"], ["Stores", "describe each data store's record structure"], ["Consistency", "names and compositions must match the DFD"]]} />
      <Note>
        {zh
          ? <>当前条目：<b style={{ fontFamily: "ui-monospace, monospace" }}>{config.name} = {config.body}</b>。数据字典是 DFD 的精确补充，缺了它，数据流图只是「有名字的箭头」。</>
          : <>Current entry: <b style={{ fontFamily: "ui-monospace, monospace" }}>{config.name} = {config.body}</b>. The dictionary is the precise companion to the DFD.</>}
      </Note>
    </Panel>
  );
}

const SUBS: Record<SubMode, SubDef> = {
  dfd: { title: T("数据流图", "DFD"), Render: DfdRender, generate: dfdGenerate, code: DFD_CODE },
  "data-dictionary": {
    title: T("数据字典", "Data Dictionary"),
    defaultConfig: { name: "订单", body: "订单号 + 客户 + {订单项}" },
    Controls: DictControls,
    Render: DictRender,
  },
};

export const { module: seStructuredModule, GROUPS: seStructuredGroups } = makeChapter<SubMode>({
  id: "se-structured",
  title: T("结构化分析与设计", "Structured Analysis"),
  desc: T(
    "数据流图 DFD（四种元素、0/1 层分解、平衡原则）、数据字典记法（= + [] | {} ()）。",
    "DFD (elements, level 0/1 decomposition, balancing) and data-dictionary notation.",
  ),
  tags: ["software-engineering", "structured"],
  groups: [
    { label: "结构化", opts: [
      { v: "dfd", zh: "数据流图", en: "DFD" },
      { v: "data-dictionary", zh: "数据字典", en: "Data Dictionary" },
    ] },
  ],
  subs: SUBS,
});
