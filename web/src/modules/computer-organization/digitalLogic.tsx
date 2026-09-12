import { createElement } from "react";
import { T } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { HwBoard } from "../../lib/hwboard/HwBoard";
import { ElkBuilder } from "../../lib/hwboard/elk";

// =====================================================================
// 数字逻辑 · 单模块聚合 · 交互式画布
//   cmos(元件层: 晶体管/反相器/NAND/NOR) → gates(门电路+万能门)
//   → adder(半加/全加/行波进位) → muxdecode(MUX/译码器)
//   → alu(1-bit ALU) → seq(锁存器/触发器/寄存器)
//   interactive: 无播放条/无伪代码, 整页画布。点击画布输入切换 0/1,
//   onChange 触发重算, 电路高亮实时更新。
// =====================================================================

type SubMode =
  | "cmos"
  | "gates"
  | "boolalg"
  | "kmap"
  | "adder"
  | "cla"
  | "muxdecode"
  | "alu"
  | "seq";

// =====================================================================
// 占位子模块: 布尔代数化简 / 卡诺图 / 超前进位加法器
//   先占位, 后续按 STUB_INFO 规划逐项实现(交互式画布)。
// =====================================================================
type StubMode = "boolalg" | "kmap" | "cla";

const STUB_INFO: Record<StubMode, { title: string; en: string; items: { zh: string; en: string }[] }> = {
  boolalg: {
    title: "布尔代数化简", en: "Boolean Algebra",
    items: [
      { zh: "基本定律: 交换 / 结合 / 分配 / 吸收 / 德·摩根", en: "Laws: commutative / associative / distributive / absorption / De Morgan" },
      { zh: "真值表 → 标准与或式(SOP) / 全加器布尔式", en: "Truth table → canonical SOP" },
      { zh: "代数化简: 逐步合并相邻项, 消去冗余变量", en: "Algebraic simplification: absorb adjacent terms" },
    ],
  },
  kmap: {
    title: "卡诺图", en: "Karnaugh Map",
    items: [
      { zh: "格雷码排列行列 (00 / 01 / 11 / 10), 相邻仅一位不同", en: "Gray-code ordering, adjacent cells differ by one bit" },
      { zh: "1 格分组: 圈 1 / 2 / 4 / 8 个相邻项, 圈越大项越少", en: "Group 1/2/4/8 adjacent cells; larger group → fewer terms" },
      { zh: "圈可跨边界环绕; 每个 1 至少被一圈覆盖", en: "Wraparound allowed; every 1 must be covered" },
      { zh: "任意项(don't care)按有利原则取 0/1", en: "Exploit don't-care terms" },
    ],
  },
  cla: {
    title: "超前进位加法器", en: "Carry Lookahead Adder",
    items: [
      { zh: "进位生成 $G_i=A_iB_i$ / 传播 $P_i=A_i\\oplus B_i$", en: "Generate $G_i=A_iB_i$ / propagate $P_i=A_i\\oplus B_i$" },
      { zh: "并行展开: $C_{i+1}=G_i+P_iC_i$ 逐层代入, 消除串行进位", en: "Parallel expansion $C_{i+1}=G_i+P_iC_i$" },
      { zh: "延迟 $O(\\log n)$, 对比行波进位 $O(n)$", en: "Delay $O(\\log n)$ vs ripple $O(n)$" },
    ],
  },
};

function StubRender({ config, t }: any) {
  const key = (config?.subMode ?? "boolalg") as StubMode;
  const info = STUB_INFO[key] ?? STUB_INFO.boolalg;
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ maxWidth: 720, margin: "28px auto", padding: "22px 26px", border: "1.5px dashed #c7d2fe", borderRadius: 16, background: "#f8faff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 20, fontWeight: 900, color: "#4338ca" }}>{isZh ? info.title : info.en}</span>
        <span style={{ fontSize: 12, fontWeight: 800, padding: "2px 10px", borderRadius: 999, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>{isZh ? "建设中" : "WIP"}</span>
      </div>
      <div style={{ fontSize: 13, color: "#64748b", margin: "8px 0 14px" }}>{isZh ? "占位页 — 规划内容如下:" : "Placeholder — planned content:"}</div>
      <ul style={{ margin: 0, paddingLeft: 20, color: "#334155", fontSize: 13, lineHeight: 2 }}>
        {info.items.map((it, i) => <li key={i}>{isZh ? it.zh : it.en}</li>)}
      </ul>
    </div>
  );
}

function makeStub(key: StubMode): ModuleDef {
  const info = STUB_INFO[key];
  return {
    id: key,
    title: T(info.title, info.en),
    tags: ["computer-organization", "digital-logic"],
    defaultConfig: {} as unknown as never,
    generate: () => [{ caption: T(`${info.title}(占位)`, `${info.en} (WIP)`), scene: { subMode: key } }] as never,
    Render: StubRender as never,
  } as unknown as ModuleDef;
}

// ===================== 看板辅助件(HTML) =====================
/** 真值表(HTML, 排版优于画布内文字) */
function TruthTable({ head, rows, hit }: { head: string[]; rows: string[][]; hit: number }) {
  return (
    <table style={{ margin: "10px auto 0", borderCollapse: "collapse", fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
      <thead>
        <tr>{head.map((h, i) => <th key={i} style={{ padding: "2px 10px", color: "#64748b", borderBottom: "1px solid #e2e8f0", fontWeight: 700 }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, k) => (
          <tr key={k} style={k === hit ? { background: "#dcfce7", fontWeight: 800, color: "#15803d" } : { color: "#94a3b8" }}>
            {r.map((c, i) => <td key={i} style={{ padding: "2px 10px", textAlign: "center" }}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// (手写 SVG 零件已退役: 电路统一走 HwBoard + d3-hwschematic 自动布局)

// =====================================================================
// 子模块 1: cmos —— 元件层(开关模型 / 反相器 / NAND / NOR)
// =====================================================================
type CmosMode = "switch" | "inverter" | "nand" | "nor";
type CmosCfg = { mode: CmosMode; a: 0 | 1; b: 0 | 1 };
const cmosDefault: CmosCfg = { mode: "switch", a: 1, b: 0 };
type CmosScene = CmosCfg & { y: 0 | 1 };

function cmosY(mode: CmosMode, a: 0 | 1, b: 0 | 1): 0 | 1 {
  if (mode === "switch") return a;
  if (mode === "inverter") return (a === 1 ? 0 : 1) as 0 | 1;
  if (mode === "nand") return (a === 1 && b === 1 ? 0 : 1) as 0 | 1;
  return (a === 1 || b === 1 ? 0 : 1) as 0 | 1;
}

const cmosScene = (c: CmosCfg): CmosScene => ({ ...c, y: cmosY(c.mode, c.a, c.b) });

// ---- CMOS 元件: FET 级网表(Vdd 顶轨 / GND 底轨, 纵向电源流, 与门符号箭头同向) ----
// 电流模型: 开关状态(导通绿/截止红)与电流路径分离 —— 某段导线/管子当且仅当它位于
// 两个不同端子(VDD/GND/输出)之间、只经导通管的通路上时才有电流(applyCurrent 标记 cur)。
// 截止管相连的死端 stub 无电流 → 灰; HwBoard 再把超边内碰到截止管的具体线段逐段置灰。
const cmosJson = (el: ElkBuilder) => ElkBuilder.applyCurrent(el.build("DOWN"));

// 开关模型拆成 NMOS / PMOS 两块独立单管板(各用各的 VDD/GND, 主干不再共享):
// 导通侧整板绿(VDD→管→GND), 截止侧整板灰(管红/线灰/栅蓝), 不再有共用主干绿盖灰的误读。
function cmosSwitchNmosJson(a: 0 | 1) {
  const el = new ElkBuilder();
  const vdd = el.power("VDD");
  const gnd = el.power("GND");
  const inG = el.input("G", a);
  const n = el.fet("NMOS", a === 1, a === 1);
  el.net("Vdd", 1, "vdd", vdd.p, [n.d]);
  el.net("G", a, "ctrl", inG.o, [n.g]);
  el.net("GND", 0, "gnd", n.s, [gnd.p]);
  return cmosJson(el);
}

function cmosSwitchPmosJson(a: 0 | 1) {
  const el = new ElkBuilder();
  const vdd = el.power("VDD");
  const gnd = el.power("GND");
  const inG = el.input("G", a);
  const p = el.fet("PMOS", a === 0, a === 1);
  el.net("Vdd", 1, "vdd", vdd.p, [p.s]);
  el.net("G", a, "ctrl", inG.o, [p.g]);
  el.net("GND", 0, "gnd", p.d, [gnd.p]);
  return cmosJson(el);
}

function cmosInverterJson(a: 0 | 1, key = "A") {
  const el = new ElkBuilder();
  const vdd = el.power("VDD");
  const gnd = el.power("GND");
  const inA = el.input(key, a);
  const y = (a === 1 ? 0 : 1) as 0 | 1;
  const p = el.fet("PMOS", a === 0, a === 1);
  const n = el.fet("NMOS", a === 1, a === 1);
  const oY = el.output("Y", y);
  el.net("Vdd", 1, "vdd", vdd.p, [p.s]);
  el.net("A", a, "ctrl", inA.o, [p.g, n.g]);
  el.net("Y", y, "sig", [p.d, n.d], [oY.i]);
  el.net("GND", 0, "gnd", n.s, [gnd.p]);
  return cmosJson(el);
}

function cmosNandJson(a: 0 | 1, b: 0 | 1) {
  const el = new ElkBuilder();
  const vdd = el.power("VDD");
  const gnd = el.power("GND");
  const inA = el.input("A", a);
  const inB = el.input("B", b);
  const y = (a === 1 && b === 1 ? 0 : 1) as 0 | 1;
  const pA = el.fet("PMOS", a === 0, a === 1);
  const pB = el.fet("PMOS", b === 0, b === 1);
  const nA = el.fet("NMOS", a === 1, a === 1);
  const nB = el.fet("NMOS", b === 1, b === 1);
  const oY = el.output("Y", y);
  el.net("Vdd", 1, "vdd", vdd.p, [pA.s, pB.s]);
  el.net("A", a, "ctrl", inA.o, [pA.g, nA.g]);
  el.net("B", b, "ctrl", inB.o, [pB.g, nB.g]);
  // 上拉并联 / 下拉串联: Y 在双 PMOS 漏极与 nA 漏极之间
  el.net("Y", y, "sig", [pA.d, pB.d], [nA.d, oY.i]);
  el.net("MID", (a === 1 && b === 0 ? 1 : 0) as 0 | 1, "sig", nA.s, [nB.d]);
  el.net("GND", 0, "gnd", nB.s, [gnd.p]);
  return cmosJson(el);
}

function cmosNorJson(a: 0 | 1, b: 0 | 1) {
  const el = new ElkBuilder();
  const vdd = el.power("VDD");
  const gnd = el.power("GND");
  const inA = el.input("A", a);
  const inB = el.input("B", b);
  const y = (a === 1 || b === 1 ? 0 : 1) as 0 | 1;
  const pA = el.fet("PMOS", a === 0, a === 1);
  const pB = el.fet("PMOS", b === 0, b === 1);
  const nA = el.fet("NMOS", a === 1, a === 1);
  const nB = el.fet("NMOS", b === 1, b === 1);
  const oY = el.output("Y", y);
  el.net("Vdd", 1, "vdd", vdd.p, [pA.s]);
  el.net("A", a, "ctrl", inA.o, [pA.g, nA.g]);
  el.net("B", b, "ctrl", inB.o, [pB.g, nB.g]);
  // 上拉串联: Vdd → pA → MIDP → pB → Y ; 下拉并联
  el.net("MIDP", (a === 0 ? 1 : 0) as 0 | 1, "sig", pA.d, [pB.s]);
  el.net("Y", y, "sig", pB.d, [nA.d, nB.d, oY.i]);
  el.net("GND", 0, "gnd", [nA.s, nB.s], [gnd.p]);
  return cmosJson(el);
}

function CmosRender({ scene, onChange }: { scene: CmosScene; onChange: (c: CmosCfg) => void }) {
  const { mode, a, b } = scene;
  const toggleA = () => onChange({ ...scene, a: (a === 1 ? 0 : 1) as 0 | 1 });
  const toggleB = () => onChange({ ...scene, b: (b === 1 ? 0 : 1) as 0 | 1 });
  const inKey = mode === "switch" ? "G" : "A";
  // 纯画布交互: 输入条已去掉, 点画布内的 G/A/B 端子直接翻转(经 onToggleKey 回调)
  const onToggleKey = (key: string) => {
    if (key === inKey) toggleA();
    else if (key === "B") toggleB();
  };
  if (mode === "switch") {
    // 双板并排: 左 NMOS / 右 PMOS, 各自独立电源轨
    const boards = [
      { id: "nmos", title: `NMOS 开关 (${a === 1 ? "导通" : "断开"})`, hot: a === 1, json: cmosSwitchNmosJson(a) },
      { id: "pmos", title: `PMOS 开关 (${a === 0 ? "导通" : "断开"})`, hot: a === 0, json: cmosSwitchPmosJson(a) },
    ];
    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {boards.map((bd) => (
          <div key={bd.id} style={{ flex: "1 1 300px", minWidth: 280 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: bd.hot ? "#15803d" : "#b91c1c", margin: "0 0 4px 2px" }}>{bd.title}</div>
            <HwBoard json={bd.json} height={400} onToggle={onToggleKey} />
          </div>
        ))}
      </div>
    );
  }
  const json =
    mode === "inverter" ? cmosInverterJson(a) :
    mode === "nand" ? cmosNandJson(a, b) : cmosNorJson(a, b);
  return <HwBoard json={json} height={mode === "inverter" ? 420 : 500} onToggle={onToggleKey} />;
}

// =====================================================================
// 子模块 2: gates —— 门电路符号 + NAND 万能门
// =====================================================================
type GateMode = "not" | "and" | "or" | "nand" | "nor" | "xor" | "universal";
type GateCfg = { mode: GateMode; a: 0 | 1; b: 0 | 1 };
const gateDefault: GateCfg = { mode: "and", a: 1, b: 1 };
type GateScene = GateCfg;

function gateOut(mode: GateMode, a: 0 | 1, b: 0 | 1): number {
  switch (mode) {
    case "not": return a === 1 ? 0 : 1;
    case "and": return a && b ? 1 : 0;
    case "or": return a || b ? 1 : 0;
    case "nand": return a && b ? 0 : 1;
    case "nor": return a || b ? 0 : 1;
    case "xor": return a !== b ? 1 : 0;
    default: return 0;
  }
}

const TTLABEL: Record<string, string> = {
  and: "AND", or: "OR", not: "NOT", nand: "NAND", nor: "NOR", xor: "XOR",
};

function GateRender({ scene, onChange }: { scene: GateScene; onChange: (c: GateCfg) => void }) {
  const { mode, a, b } = scene;
  const toggleA = () => onChange({ ...scene, a: (a === 1 ? 0 : 1) as 0 | 1 });
  const toggleB = () => onChange({ ...scene, b: (b === 1 ? 0 : 1) as 0 | 1 });
  const onToggleKey = (key: string) => {
    if (key === "A") toggleA();
    else if (key === "B") toggleB();
  };
  if (mode === "universal") {
    // 三种独立搭法(无法合并成一张图), 横向并排同屏可见
    const mkNot = () => {
      const el = new ElkBuilder();
      const inA = el.input("A", a);
      const n = el.gate("NAND");
      const oY = el.output("Y", a === 1 ? 0 : 1);
      el.net("A", a, "sig", inA.o, [n.a, n.b]);
      el.net("Y", (a === 1 ? 0 : 1) as 0 | 1, "sig", n.y, [oY.i]);
      return el.build();
    };
    const mkAnd = () => {
      const el = new ElkBuilder();
      const inA = el.input("A", a);
      const inB = el.input("B", b);
      const n = el.gate("NAND");
      const nt = el.gate("NOT");
      const oY = el.output("Y", gateOut("and", a, b));
      el.net("A", a, "sig", inA.o, [n.a]);
      el.net("B", b, "sig", inB.o, [n.b]);
      el.net("N", gateOut("nand", a, b), "sig", n.y, [nt.a]);
      el.net("Y", gateOut("and", a, b), "sig", nt.y, [oY.i]);
      return el.build();
    };
    const mkOr = () => {
      const el = new ElkBuilder();
      const inA = el.input("A", a);
      const inB = el.input("B", b);
      const na = el.gate("NOT");
      const nb = el.gate("NOT");
      const n = el.gate("NAND");
      const oY = el.output("Y", gateOut("or", a, b));
      el.net("A", a, "sig", inA.o, [na.a]);
      el.net("B", b, 'sig', inB.o, [nb.a]);
      el.net("NA", (a === 1 ? 0 : 1) as 0 | 1, "sig", na.y, [n.a]);
      el.net("NB", (b === 1 ? 0 : 1) as 0 | 1, "sig", nb.y, [n.b]);
      el.net("Y", gateOut("or", a, b), "sig", n.y, [oY.i]);
      return el.build();
    };
    const groups: { title: string; json: unknown }[] = [
      { title: "1) NOT: 两输入短接", json: mkNot() },
      { title: "2) AND = NAND + NOT", json: mkAnd() },
      { title: "3) OR: 德·摩根 A+B = 非(非A · 非B)", json: mkOr() },
    ];
    return (
      <div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {groups.map((g) => (
            <div key={g.title} style={{ flex: "1 1 320px", minWidth: 300 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", margin: "0 0 4px 2px" }}>{g.title}</div>
              <HwBoard json={g.json} height={280} onToggle={onToggleKey} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  const out = gateOut(mode, a, b);
  const op = mode.toUpperCase() as "AND" | "OR" | "NOT" | "NAND" | "NOR" | "XOR";
  const json = (() => {
    const el = new ElkBuilder();
    const inA = el.input("A", a);
    const g = el.gate(op);
    const oY = el.output("Y", out);
    el.net("A", a, "sig", inA.o, [g.a]);
    if (mode !== "not") {
      const inB = el.input("B", b);
      el.net("B", b, "sig", inB.o, [g.b]);
    }
    el.net("Y", out, "sig", g.y, [oY.i]);
    return el.build();
  })();
  const combos = mode === "not" ? [[0], [1]] : TT2.map(([aa, bb]) => [aa, bb]);
  const hit = combos.findIndex((r) => r[0] === a && (mode === "not" || r[1] === b));
  return (
    <div>
      <div style={{ position: "relative" }}>
        <HwBoard json={json} height={300} onToggle={onToggleKey} />
        {/* 真值表直接画在画布内(右上角) */}
        <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(255,255,255,0.94)", border: "1px solid #e2e8f0", borderRadius: 10, padding: "2px 6px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
          <TruthTable
            head={mode === "not" ? ["A", "Y"] : ["A", "B", "Y"]}
            rows={combos.map((r) => (mode === "not" ? [`${r[0]}`, `${gateOut("not", r[0] as 0 | 1, 0)}`] : [`${r[0]}`, `${r[1]}`, `${gateOut(mode, r[0] as 0 | 1, r[1] as 0 | 1)}`]))}
            hit={hit}
          />
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// 子模块 3: adder —— 半加器 / 全加器 / 行波进位
// =====================================================================
type AdderMode = "half" | "full" | "ripple";
type AdderCfg = { mode: AdderMode; a: number; b: number; cin: 0 | 1; bits: number };
const adderDefault: AdderCfg = { mode: "half", a: 1, b: 1, cin: 0, bits: 4 };
type AdderScene = AdderCfg;

function halfAdder(a: number, b: number) {
  return { s: a ^ b, cout: a & b };
}
function fullAdder(a: number, b: number, cin: number) {
  const h1 = halfAdder(a, b);
  const s = h1.s ^ cin;
  const cout = h1.cout | (h1.s & cin);
  return { s, cout };
}

// ---- adder 试点: HwBoard 网表构建(门级半加/全加 + FA 盒链行波) ----
function adderHalfJson(a: 0 | 1, b: 0 | 1) {
  const el = new ElkBuilder();
  const inA = el.input("A", a);
  const inB = el.input("B", b);
  const x = el.gate("XOR");
  const nd = el.gate("AND");
  const oS = el.output("S", (a ^ b) as 0 | 1);
  const oC = el.output("Cout", (a & b) as 0 | 1);
  el.net("A", a, "sig", inA.o, [x.a, nd.a]);
  el.net("B", b, "sig", inB.o, [x.b, nd.b]);
  el.net("S", (a ^ b) as 0 | 1, "sig", x.y, [oS.i]);
  el.net("Cout", (a & b) as 0 | 1, "sig", nd.y, [oC.i]);
  return el.build();
}

function adderFullJson(a: 0 | 1, b: 0 | 1, cin: 0 | 1) {
  const el = new ElkBuilder();
  const inA = el.input("A", a);
  const inB = el.input("B", b);
  const inC = el.input("Cin", cin);
  const x1 = el.gate("XOR");
  const x2 = el.gate("XOR");
  const a1 = el.gate("AND");
  const a2 = el.gate("AND");
  const or = el.gate("OR");
  const ab = (a ^ b) as 0 | 1;
  const s = (ab ^ cin) as 0 | 1;
  const cout = ((a & b) | (ab & cin)) as 0 | 1;
  const oS = el.output("S", s);
  const oC = el.output("Cout", cout);
  el.net("A", a, "sig", inA.o, [x1.a, a1.a]);
  el.net("B", b, "sig", inB.o, [x1.b, a1.b]);
  el.net("Cin", cin, "sig", inC.o, [x2.b, a2.b]);
  el.net("AB", ab, "sig", x1.y, [x2.a, a2.a]);
  el.net("C1", (a & b) as 0 | 1, "sig", a1.y, [or.a]);
  el.net("C2", (ab & cin) as 0 | 1, "sig", a2.y, [or.b]);
  el.net("S", s, "sig", x2.y, [oS.i]);
  el.net("Cout", cout, "sig", or.y, [oC.i]);
  return el.build('DOWN');
}

// 行波链(单板支持任意级; 级多时用 DOWN 纵向, 避免横向折行互叠)
function adderRippleChain(aBits: number, bBits: number, lo: number, count: number, cin: number, direction: 'RIGHT' | 'DOWN' = 'RIGHT') {
  const el = new ElkBuilder();
  const inC = el.input(`C${lo}`, cin);
  const vertical = direction === 'DOWN';
  const compact = direction === 'RIGHT' && count > 4;
  const fas: { id: string; pins: Record<string, [string, string]> }[] = [];
  let c = cin;
  for (let k = 0; k < count; k++) {
    const i = lo + k;
    const ai = ((aBits >> i) & 1) as 0 | 1;
    const bi = ((bBits >> i) & 1) as 0 | 1;
    const cinI = c;
    const r = fullAdder(ai, bi, cinI);
    // 横向: 纯西进东出, 进位 Cout(东)→Cin(西)水平串接(级多紧凑窄盒);
    // 纵向: A/B 北进、S/Cout 南出, 进位上下直连, 一列排下(位数多时更整齐)
    const inA = el.input(`A${i}`, ai, vertical ? 'SOUTH' : 'EAST');
    const inB = el.input(`B${i}`, bi, vertical ? 'SOUTH' : 'EAST');
    const fa = vertical
      ? el.box(
        `FA${i}`,
        [{ name: 'A', side: 'NORTH' }, { name: 'B', side: 'NORTH' }, { name: 'Cin', side: 'NORTH' }],
        [{ name: 'S', side: 'SOUTH' }, { name: 'Cout', side: 'SOUTH' }],
        `bit${i}`,
      )
      : el.box(`FA${i}`, ['A', 'B', 'Cin'], ['S', 'Cout'], compact ? '' : `bit${i}`);
    const oS = el.output(`S${i}`, r.s as 0 | 1, vertical ? 'NORTH' : 'WEST');
    el.net(`A${i}`, ai, 'sig', inA.o, [fa.pins['A']]);
    el.net(`B${i}`, bi, 'sig', inB.o, [fa.pins['B']]);
    if (k === 0) {
      el.net(`C${lo}`, cin as 0 | 1, 'sig', inC.o, [fa.pins['Cin']]);
    } else {
      el.net(`C${i}`, cinI as 0 | 1, 'sig', fas[k - 1].pins['Cout'], [fa.pins['Cin']]);
    }
    el.net(`S${i}`, r.s as 0 | 1, 'sig', fa.pins['S'], [oS.i]);
    fas.push(fa);
    c = r.cout;
  }
  const oC = el.output('Cout', c as 0 | 1, vertical ? 'NORTH' : 'WEST');
  el.net('Cout', c as 0 | 1, 'sig', fas[count - 1].pins['Cout'], [oC.i]);
  return {
    json: el.build(direction, compact ? {
      'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers': '24',
      'org.eclipse.elk.spacing.nodeNode': '12',
      'org.eclipse.elk.spacing.edgeNode': '10',
    } : {}),
    cout: c,
  };
}

function AdderRender({ scene, onChange }: { scene: AdderScene; onChange: (c: AdderCfg) => void }) {
  const { mode } = scene;
  const aa = scene.a & 1;
  const bb = scene.b & 1;
  const cc = scene.cin;
  const half = halfAdder(aa, bb);
  const full = fullAdder(aa, bb, cc);
  const toggleA = () => onChange({ ...scene, a: aa === 1 ? 0 : 1 });
  const toggleB = () => onChange({ ...scene, b: bb === 1 ? 0 : 1 });
  const toggleC = () => onChange({ ...scene, cin: (cc === 1 ? 0 : 1) as 0 | 1 });
  if (mode === "ripple") {
    const n = Math.max(2, Math.min(8, scene.bits | 0));
    const aBits = (scene.a & ((1 << n) - 1)) >>> 0;
    const bBits = (scene.b & ((1 << n) - 1)) >>> 0;
    const sum = aBits + bBits;
    // 单板: 始终横向一排(级多紧凑窄盒), 不再拆板
    const low = adderRippleChain(aBits, bBits, 0, n, 0, 'RIGHT');
    const chains: { title: string; json: unknown }[] = [{ title: "", json: low.json }];
    const onToggleBit = (key: string) => {
      const ma = /^A(\d+)$/.exec(key);
      const mb = /^B(\d+)$/.exec(key);
      if (ma) {
        const i = Number(ma[1]);
        onChange({ ...scene, a: (scene.a ^ (1 << i)) & ((1 << n) - 1) });
      } else if (mb) {
        const i = Number(mb[1]);
        onChange({ ...scene, b: (scene.b ^ (1 << i)) & ((1 << n) - 1) });
      }
    };
    return (
      <div>
        {chains.map((ch) => (
          <div key={ch.title || "all"} style={{ marginTop: ch.title ? 10 : 0 }}>
            {ch.title && <div style={{ fontSize: 12, fontWeight: 800, color: "#334155", margin: "0 0 4px 2px" }}>{ch.title}</div>}
            <HwBoard json={ch.json} height={n <= 4 ? 560 : 600} onToggle={onToggleBit} />
          </div>
        ))}
      </div>
    );
  }
  const show = mode === "half" ? half : full;
  const onToggleKey = (key: string) => {
    if (key === "A") toggleA();
    else if (key === "B") toggleB();
    else if (key === "Cin") toggleC();
  };
  const json = mode === "half"
    ? adderHalfJson(aa as 0 | 1, bb as 0 | 1)
    : adderFullJson(aa as 0 | 1, bb as 0 | 1, cc);
  void show;
  return (
    <div>
      <HwBoard json={json} height={mode === "half" ? 300 : 420} onToggle={onToggleKey} />
    </div>
  );
}

// =====================================================================
// 子模块 4: muxdecode —— 多路选择器 / 译码器
// =====================================================================
type MuxMode = "mux" | "decode";
type MuxCfg = { mode: MuxMode; s: 0 | 1; d0: 0 | 1; d1: 0 | 1; a1: 0 | 1; a0: 0 | 1 };
const muxDefault: MuxCfg = { mode: "mux", s: 1, d0: 0, d1: 1, a1: 1, a0: 0 };
type MuxScene = MuxCfg;

// ---- mux/decode: 门级网表(MUX = NOT + 2AND + OR; 译码器 = 2NOT + 4AND) ----
function muxGateJson(s: 0 | 1, d0: 0 | 1, d1: 0 | 1) {
  const el = new ElkBuilder();
  const inS = el.input("S", s);
  const inD0 = el.input("D0", d0);
  const inD1 = el.input("D1", d1);
  const ns = (s === 1 ? 0 : 1) as 0 | 1;
  const m0 = (ns === 1 && d0 === 1 ? 1 : 0) as 0 | 1;
  const m1 = (s === 1 && d1 === 1 ? 1 : 0) as 0 | 1;
  const y = (m0 === 1 || m1 === 1 ? 1 : 0) as 0 | 1;
  const nt = el.gate("NOT");
  const a0 = el.gate("AND");
  const a1 = el.gate("AND");
  const or = el.gate("OR");
  const oY = el.output("Y", y);
  el.net("S", s, "sig", inS.o, [nt.a, a1.b]);
  el.net("D0", d0, "sig", inD0.o, [a0.a]);
  el.net("D1", d1, "sig", inD1.o, [a1.a]);
  el.net("NS", ns, "sig", nt.y, [a0.b]);
  el.net("M0", m0, "sig", a0.y, [or.a]);
  el.net("M1", m1, "sig", a1.y, [or.b]);
  el.net("Y", y, "sig", or.y, [oY.i]);
  return el.build("DOWN");
}

function decodeJson(a1: 0 | 1, a0: 0 | 1) {
  const el = new ElkBuilder();
  const inA1 = el.input("A1", a1);
  const inA0 = el.input("A0", a0);
  const na1 = (a1 === 1 ? 0 : 1) as 0 | 1;
  const na0 = (a0 === 1 ? 0 : 1) as 0 | 1;
  const hit = a1 * 2 + a0;
  const n1 = el.gate("NOT");
  const n0 = el.gate("NOT");
  const gs = [el.gate("AND"), el.gate("AND"), el.gate("AND"), el.gate("AND")];
  const outs = [0, 1, 2, 3].map((i) => el.output(`Y${i}`, (i === hit ? 1 : 0) as 0 | 1));
  // Y0=~A1·~A0 Y1=~A1·A0 Y2=A1·~A0 Y3=A1·A0
  el.net("A1", a1, "sig", inA1.o, [n1.a, gs[2].a, gs[3].a]);
  el.net("A0", a0, "sig", inA0.o, [n0.a, gs[1].b, gs[3].b]);
  el.net("NA1", na1, "sig", n1.y, [gs[0].a, gs[1].a]);
  el.net("NA0", na0, "sig", n0.y, [gs[0].b, gs[2].b]);
  [0, 1, 2, 3].forEach((i) => {
    el.net(`Y${i}`, (i === hit ? 1 : 0) as 0 | 1, "sig", gs[i].y, [outs[i].i]);
  });
  return el.build();
}

function MuxRender({ scene, onChange }: { scene: MuxScene; onChange: (c: MuxCfg) => void }) {
  const { mode } = scene;
  const set = (p: Partial<MuxCfg>) => onChange({ ...scene, ...p });
  if (mode === "mux") {
    const onToggleKey = (key: string) => {
      if (key === "S") set({ s: (scene.s === 1 ? 0 : 1) as 0 | 1 });
      else if (key === "D0") set({ d0: (scene.d0 === 1 ? 0 : 1) as 0 | 1 });
      else if (key === "D1") set({ d1: (scene.d1 === 1 ? 0 : 1) as 0 | 1 });
    };
    return (
      <div>
      <HwBoard json={muxGateJson(scene.s, scene.d0, scene.d1)} height={440} onToggle={onToggleKey} />
      </div>
    );
  }
  // 2-to-4 译码器: 恰好一个输出为 1
  const onToggleKey = (key: string) => {
    if (key === "A1") set({ a1: (scene.a1 === 1 ? 0 : 1) as 0 | 1 });
    else if (key === "A0") set({ a0: (scene.a0 === 1 ? 0 : 1) as 0 | 1 });
  };
  return (
    <div>
    <HwBoard json={decodeJson(scene.a1, scene.a0)} height={480} onToggle={onToggleKey} />
    </div>
  );
}

// =====================================================================
// 子模块 5: alu —— 1-bit ALU (AND/OR/ADD + MUX)
// =====================================================================
type AluCfg = { op: "and" | "or" | "add"; a: 0 | 1; b: 0 | 1; cin: 0 | 1 };
const aluDefault: AluCfg = { op: "add", a: 1, b: 1, cin: 0 };
type AluScene = AluCfg & { result: number; cout: number };

// ---- alu: AND / OR / FA 三路 + MUX 盒选通(Op=[S1S0]: 00 AND / 01 OR / 10 ADD) ----
function aluJson(op: "and" | "or" | "add", a: 0 | 1, b: 0 | 1) {
  const el = new ElkBuilder();
  const inA = el.input("A", a);
  const inB = el.input("B", b);
  const inC0 = el.input("C0", 0);
  const s1 = (op === "add" ? 1 : 0) as 0 | 1;
  const s0 = (op === "or" ? 1 : 0) as 0 | 1;
  const d0 = (a & b) as 0 | 1;
  const d1 = (a | b) as 0 | 1;
  const fa = fullAdder(a, b, 0);
  const result = (op === "and" ? d0 : op === "or" ? d1 : fa.s) as 0 | 1;
  const cout = (op === "add" ? fa.cout : 0) as 0 | 1;
  const gAnd = el.gate("AND");
  const gOr = el.gate("OR");
  const faBox = el.box("FA", ["A", "B", "Cin"], ["S", "Cout"], "全加器");
  // S1/S0 直接做 MUX 顶部端口(不拉长线), 当前选择值写进盒内 bodyText;
  // toggleKey='op' 使点击 MUX 盒循环切换运算
  const mux = el.box(
    "MUX",
    ["D0", "D1", "D2", { name: "S1", side: "NORTH" }, { name: "S0", side: "NORTH" }],
    ["R"],
    `3选1 [S1S0]=${s1}${s0}`,
    "op",
  );
  const oR = el.output("R", result);
  const oC = el.output("Cout", cout);
  el.net("A", a, "sig", inA.o, [gAnd.a, gOr.a, faBox.pins["A"]]);
  el.net("B", b, "sig", inB.o, [gAnd.b, gOr.b, faBox.pins["B"]]);
  el.net("C0", 0, "sig", inC0.o, [faBox.pins["Cin"]]);
  el.net("D0", d0, "sig", gAnd.y, [mux.pins["D0"]]);
  el.net("D1", d1, "sig", gOr.y, [mux.pins["D1"]]);
  el.net("D2", fa.s as 0 | 1, "sig", faBox.pins["S"], [mux.pins["D2"]]);
  el.net("R", result, "sig", mux.pins["R"], [oR.i]);
  el.net("Cout", cout, "sig", faBox.pins["Cout"], [oC.i]);
  return el.build();
}

function AluRender({ scene, onChange }: { scene: AluScene; onChange: (c: AluCfg) => void }) {
  const { op, a, b, result, cout } = scene;
  const sel = op === "and" ? "00" : op === "or" ? "01" : "10";
  const cycleOp = () => {
    const next = op === "and" ? "or" : op === "or" ? "add" : "and";
    onChange({ ...scene, op: next });
  };
  const onToggleKey = (key: string) => {
    if (key === "A") onChange({ ...scene, a: (a === 1 ? 0 : 1) as 0 | 1 });
    else if (key === "B") onChange({ ...scene, b: (b === 1 ? 0 : 1) as 0 | 1 });
    else if (key === "op") cycleOp();
  };
  return (
    <div>
    <HwBoard json={aluJson(op, a, b)} height={480} onToggle={onToggleKey} />
    </div>
  );
}

// =====================================================================
// 子模块 6: seq —— SR 锁存器 / D 触发器 / 寄存器
// =====================================================================
type SeqMode = "latch" | "dff" | "register";
type SeqCfg = { mode: SeqMode; s: 0 | 1; r: 0 | 1; d: 0 | 1; clk: 0 | 1; reg: string; write: 0 | 1; q: 0 | 1; qn: 0 | 1 };
const seqDefault: SeqCfg = { mode: "latch", s: 1, r: 0, d: 1, clk: 1, reg: "1011", write: 1, q: 1, qn: 0 };
type SeqScene = SeqCfg & { q: 0 | 1; qn: 0 | 1; illegal: boolean; loaded: boolean };

/** SR 锁存状态转移: S=1 置位, R=1 复位, S=R=0 保持(prev), S=R=1 非法(都拉零) */
function latchNext(
  s: 0 | 1,
  r: 0 | 1,
  prev: 0 | 1,
): { q: 0 | 1; qn: 0 | 1; illegal: boolean } {
  if (s === 1 && r === 1) return { q: 0, qn: 0, illegal: true };
  if (s === 1) return { q: 1, qn: 0, illegal: false };
  if (r === 1) return { q: 0, qn: 1, illegal: false };
  return { q: prev, qn: (prev === 1 ? 0 : 1) as 0 | 1, illegal: false };
}

// ---- seq: SR 锁存(2×NOR 交叉耦合) / D 触发器盒 / n 位寄存器组 ----
function seqLatchJson(s: 0 | 1, r: 0 | 1, q: 0 | 1, qn: 0 | 1) {
  const el = new ElkBuilder();
  const inS = el.input("S", s);
  const inR = el.input("R", r);
  const n1 = el.gate("NOR");
  const n2 = el.gate("NOR");
  const oQ = el.output("Q", q);
  const oQN = el.output("QN", qn);
  el.net("R", r, "sig", inR.o, [n1.a]);
  el.net("S", s, "sig", inS.o, [n2.a]);
  // 交叉耦合反馈: Q → NOR2 下输入, QN → NOR1 下输入(ELK 反向边绕回)
  el.net("Q", q, "sig", n1.y, [oQ.i, n2.b]);
  el.net("QN", qn, "sig", n2.y, [oQN.i, n1.b]);
  return el.build();
}

function seqDffJson(d: 0 | 1, clk: 0 | 1, q: 0 | 1) {
  const el = new ElkBuilder();
  const inD = el.input("D", d);
  const inClk = el.input("clk", clk);
  const qn = (q === 1 ? 0 : 1) as 0 | 1;
  const box = el.box("DFF", ["D", "CLK"], ["Q", "QN"], "边沿触发");
  const oQ = el.output("Q", q);
  const oQN = el.output("QN", qn);
  el.net("D", d, "sig", inD.o, [box.pins["D"]]);
  el.net("clk", clk, "sig", inClk.o, [box.pins["CLK"]]);
  el.net("Q", q, "sig", box.pins["Q"], [oQ.i]);
  el.net("QN", qn, "sig", box.pins["QN"], [oQN.i]);
  return el.build();
}

function seqRegJson(bits: string, clk: 0 | 1, write: 0 | 1) {
  const el = new ElkBuilder();
  const n = bits.length;
  // 每盒独立 clk/WE 端子链(4 链互不相连, ELK 按创建顺序网格打包, 行优先单调):
  // 共享总线版会被交叉最小化打乱盒序(实测), 独立链无此问题。
  // 端子 key 相同而 id 唯一, 点击任一 clk/WE 都翻转全局。
  for (let i = 0; i < n; i++) {
    const di = (bits[i] === "1" ? 1 : 0) as 0 | 1;
    const inD = el.input(`D${i}`, di);
    const inClk = el.input("clk", clk);
    const inWE = el.input("WE", write);
    const box = el.box(`DFF${i}`, ["D", "WE", "CLK"], [`Q${i}`], `bit${i}`);
    const oQ = el.output(`Q${i}`, di);
    el.net(`D${i}`, di, "sig", inD.o, [box.pins["D"]]);
    el.net(`WE${i}`, write, "sig", inWE.o, [box.pins["WE"]]);
    el.net(`clk${i}`, clk, "sig", inClk.o, [box.pins["CLK"]]);
    el.net(`Q${i}`, di, "sig", box.pins[`Q${i}`], [oQ.i]);
  }
  return el.build();
}

function SeqRender({ scene, onChange }: { scene: SeqScene; onChange: (c: SeqCfg) => void }) {
  const { mode } = scene;
  const set = (p: Partial<SeqCfg>) => onChange({ ...scene, ...p });
  if (mode === "latch") {
    const { s, r, q, qn, illegal } = scene;
    const applySR = (ns: 0 | 1, nr: 0 | 1) => {
      const l = latchNext(ns, nr, q);
      set({ s: ns, r: nr, q: l.q, qn: l.qn });
    };
    const onToggleKey = (key: string) => {
      if (key === "S") applySR((s === 1 ? 0 : 1), r);
      else if (key === "R") applySR(s, (r === 1 ? 0 : 1));
    };
    return (
      <div>
      <HwBoard json={seqLatchJson(s, r, q, qn)} height={440} onToggle={onToggleKey} />
      <div style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: illegal ? "#dc2626" : "#059669", marginTop: 4 }}>
        {illegal ? `S=R=1 非法 — Q 与 QN 都被拉到 0, 状态不确定` : `S=${s} R=${r} → Q=${q}`}
      </div>
      </div>
    );
  }
  if (mode === "dff") {
    const { d, clk, q } = scene;
    const onToggleKey = (key: string) => {
      if (key === "D") set({ d: (d === 1 ? 0 : 1) as 0 | 1 });
      else if (key === "clk") set({ clk: (clk === 1 ? 0 : 1) as 0 | 1 });
    };
    return (
      <div>
      <HwBoard json={seqDffJson(d, clk, q)} height={320} onToggle={onToggleKey} />
      <div style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: "#1e40af", marginTop: 4 }}>
        {clk === 1 ? `clk=1 (边沿) → Q 锁存 D=${d}` : `clk=0 → Q=${q} 保持`}
      </div>
      </div>
    );
  }
  const bits = scene.reg.replace(/[^01]/g, "").slice(0, 8) || "0000";
  const onToggleKey = (key: string) => {
    const m = /^D(\d+)$/.exec(key);
    if (m) {
      const i = Number(m[1]);
      const arr = bits.split("");
      arr[i] = arr[i] === "1" ? "0" : "1";
      set({ reg: arr.join("") });
    } else if (key === "clk") set({ clk: (scene.clk === 1 ? 0 : 1) as 0 | 1 });
    else if (key === "WE") set({ write: (scene.write === 1 ? 0 : 1) as 0 | 1 });
  };
  return (
    <div>
    <HwBoard json={seqRegJson(bits, scene.clk, scene.write)} height={bits.length <= 4 ? 480 : 480 + (bits.length - 4) * 110} onToggle={onToggleKey} />
    <div style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: "#1e40af", marginTop: 4 }}>
      {`D=${bits}${scene.loaded ? ` → Q=${bits}` : " → 保持"}`}
    </div>
    </div>
  );
}

// =====================================================================
// 聚合: 单模块 (interactive: 无播放条/无伪代码, 整页画布)
// =====================================================================
type Cfg = { subMode: SubMode; [k: string]: any };

function sceneOf(sub: SubMode, c: any): any {
  if (sub === "cmos") return cmosScene(c);
  if (sub === "gates") return c;
  if (sub === "adder") return c;
  if (sub === "muxdecode") return c;
  if (sub === "alu") {
    const full = fullAdder(c.a & 1, c.b & 1, c.cin);
    return { ...c, result: c.op === "and" ? (c.a & c.b) : c.op === "or" ? (c.a | c.b) : full.s, cout: c.op === "add" ? full.cout : 0 };
  }
  if (sub === "seq") {
    if (c.mode === "latch") {
      const l = latchNext(c.s, c.r, ((c.q ?? 1) as 0 | 1));
      return { ...c, q: l.q, qn: l.qn, illegal: l.illegal, loaded: false };
    }
    if (c.mode === "dff") return { ...c, q: c.clk === 1 ? c.d : 0, qn: c.clk === 1 ? (c.d === 1 ? 0 : 1) : 1, illegal: false, loaded: false };
    return { ...c, q: 0, qn: 1, illegal: false, loaded: c.clk === 1 && c.write === 1 };
  }
  return c;
}

const SUB: Record<SubMode, ModuleDef> = {
  boolalg: makeStub("boolalg"),
  kmap: makeStub("kmap"),
  cla: makeStub("cla"),
  cmos: {
    id: "cmos", title: T("CMOS 元件", "CMOS Devices"), tags: ["computer-organization", "digital-logic"],
    defaultConfig: cmosDefault,
    Controls: CmosControls, generate: (c: CmosCfg) => [{ caption: T("CMOS 元件", "CMOS"), scene: cmosScene(c) }] as never,
    Render: CmosRender as never,
  } as unknown as ModuleDef,
  gates: {
    id: "gates", title: T("门电路", "Logic Gates"), tags: ["computer-organization", "digital-logic"],
    defaultConfig: gateDefault,
    Controls: GateControls, generate: (c: GateCfg) => [{ caption: T("门电路", "Gates"), scene: c }] as never,
    Render: GateRender as never,
  } as unknown as ModuleDef,
  adder: {
    id: "adder", title: T("加法器", "Adders"), tags: ["computer-organization", "digital-logic"],
    defaultConfig: adderDefault,
    Controls: AdderControls, generate: (c: AdderCfg) => [{ caption: T("加法器", "Adders"), scene: c }] as never,
    Render: AdderRender as never,
  } as unknown as ModuleDef,
  muxdecode: {
    id: "muxdecode", title: T("MUX/译码器", "MUX/Decoder"), tags: ["computer-organization", "digital-logic"],
    defaultConfig: muxDefault,
    Controls: MuxControls, generate: (c: MuxCfg) => [{ caption: T("MUX/译码器", "MUX/Decoder"), scene: c }] as never,
    Render: MuxRender as never,
  } as unknown as ModuleDef,
  alu: {
    id: "alu", title: T("1-bit ALU", "1-bit ALU"), tags: ["computer-organization", "digital-logic"],
    defaultConfig: aluDefault,
    Controls: AluControls, generate: (c: AluCfg) => [{ caption: T("1-bit ALU", "1-bit ALU"), scene: sceneOf("alu", c) }] as never,
    Render: AluRender as never,
  } as unknown as ModuleDef,
  seq: {
    id: "seq", title: T("时序电路", "Sequential"), tags: ["computer-organization", "digital-logic"],
    defaultConfig: seqDefault,
    Controls: SeqControls, generate: (c: SeqCfg) => [{ caption: T("时序电路", "Sequential"), scene: sceneOf("seq", c) }] as never,
    Render: SeqRender as never,
  } as unknown as ModuleDef,
};

const MAP: Record<SubMode, ModuleDef> = SUB;
const GROUPS: { label: string; opts: { v: SubMode; zh: string; en: string }[] }[] = [
  { label: "元件层", opts: [
    { v: "cmos", zh: "CMOS 元件", en: "CMOS" },
    { v: "gates", zh: "门电路", en: "Gates" },
  ]},
  { label: "代数化简", opts: [
    { v: "boolalg", zh: "布尔代数化简", en: "Boolean" },
    { v: "kmap", zh: "卡诺图", en: "K-Map" },
  ]},
  { label: "组合电路", opts: [
    { v: "adder", zh: "加法器", en: "Adder" },
    { v: "cla", zh: "超前进位加法器", en: "CLA" },
    { v: "muxdecode", zh: "MUX/译码器", en: "MUX/Dec" },
    { v: "alu", zh: "1-bit ALU", en: "ALU" },
  ]},
  { label: "时序电路", opts: [
    { v: "seq", zh: "锁存器/触发器", en: "FF/Latch" },
  ]},
];

function activeOf(sub: unknown): ModuleDef {
  return (MAP as Record<string, ModuleDef>)[sub as string] ?? SUB.cmos;
}
function subKeyOf(sub: unknown): SubMode {
  return (MAP as Record<string, ModuleDef>)[sub as string] ? (sub as SubMode) : "cmos";
}
function safeCfg(sub: unknown, config: Cfg): Cfg {
  const m = activeOf(sub) as any;
  const d = (m.defaultConfig ?? {}) as any;
  return { ...d, ...(config as any), subMode: subKeyOf(sub) } as Cfg;
}

const DEFAULT: Cfg = { subMode: "cmos", ...(SUB.cmos as any).defaultConfig };

export const digitalLogicModule: ModuleDef<any, Cfg> = {
  id: "digital-logic",
  title: T("数字逻辑", "Digital Logic"),
  desc: T("CMOS 元件 → 门电路 → 加法器 → MUX/译码器 → ALU → 时序电路。点击画布切换输入, 观察电路输出。", "CMOS → gates → adders → MUX → ALU → sequential. Click inputs on canvas."),
  tags: ["computer-organization", "digital-logic"],
  interactive: true,
  defaultConfig: DEFAULT,
  randomize(c) {
    const safe = safeCfg(c.subMode, c);
    const m = activeOf(c.subMode) as any;
    if (!m.randomize) return safe;
    return { ...safe, ...m.randomize(safe), subMode: safe.subMode };
  },
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const sub = subKeyOf(config.subMode);
    const active = activeOf(sub) as any;
    const safe = safeCfg(sub, config);
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>{isZh ? "数字逻辑" : "DIGITAL LOGIC"}</span>
          <select className="txt" value={sub} onChange={(e) => { const key = subKeyOf(e.target.value); const m = activeOf(key) as any; onChange({ ...config, ...((m.defaultConfig as any) ?? {}), subMode: key } as any); }} style={{ minWidth: 200, fontWeight: 700 }}>
            {GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.opts.map((o) => <option key={o.v} value={o.v}>{isZh ? o.zh : o.en}</option>)}
              </optgroup>
            ))}
          </select>
          {active?.Controls && createElement(active.Controls as any, { config: safe as any, onChange: onChange as any, t })}
        </div>
      </div>
    ) as unknown as never;
  },
  generate(config) {
    const safe = safeCfg((config as Cfg).subMode, config as Cfg);
    const m = activeOf((config as Cfg).subMode) as any;
    const res: any = m.generate(safe);
    const frames: any[] = Array.isArray(res) ? res : res?.frames ?? [];
    return frames.length ? frames : [{ caption: T("数字逻辑", "Digital Logic"), scene: safe }];
  },
  Render(props) {
    const safe = safeCfg((props.config as Cfg).subMode, props.config as Cfg);
    const m = activeOf((props.config as Cfg).subMode) as any;
    // scene 直接从当前 config 生成(不依赖播放器帧): 播放器帧与 config 异步同步,
    // 切换子模块时旧 scene 会让新子模块 Render 崩(如 alu 缺 op → op.toUpperCase() 崩)。
    // 交互式画布本就是 config 驱动, 这里即时生成 scene, 切换即时正确、无需刷新。
    const scene = sceneOf(safe.subMode, safe);
    return createElement(m.Render as any, { ...(props as any), scene, config: safe } as any);
  },
};

// =====================================================================
// Controls (每个子模块一个, 仅模式切换; 输入全部移到画布点击)
// =====================================================================
function CmosControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const modes: Array<[CmosMode, string, string]> = [
    ["switch", "开关模型", "Switch"],
    ["inverter", "反相器", "Inverter"],
    ["nand", "NAND", "NAND"],
    ["nor", "NOR", "NOR"],
  ];
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>{isZh ? "电路" : "CIRCUIT"}</span>
      <select className="txt" value={config.mode} onChange={(e) => onChange({ ...config, mode: e.target.value as CmosMode })}>
        {modes.map(([v, zh, en]) => <option key={v} value={v}>{isZh ? zh : en}</option>)}
      </select>
    </div>
  ) as unknown as never;
}

function GateControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const modes: Array<[GateMode, string, string]> = [
    ["and", "AND", "AND"], ["or", "OR", "OR"], ["not", "NOT", "NOT"],
    ["nand", "NAND", "NAND"], ["nor", "NOR", "NOR"], ["xor", "XOR", "XOR"],
    ["universal", "NAND 万能门", "Universal"],
  ];
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>{isZh ? "门" : "GATE"}</span>
      <select className="txt" value={config.mode} onChange={(e) => onChange({ ...config, mode: e.target.value as GateMode })}>
        {modes.map(([v, zh, en]) => <option key={v} value={v}>{isZh ? zh : en}</option>)}
      </select>
    </div>
  ) as unknown as never;
}

function AdderControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const modes: Array<[AdderMode, string, string]> = [
    ["half", "半加器", "Half"], ["full", "全加器", "Full"], ["ripple", "行波进位", "Ripple"],
  ];
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>{isZh ? "电路" : "CIRCUIT"}</span>
      <select className="txt" value={config.mode} onChange={(e) => onChange({ ...config, mode: e.target.value as AdderMode })}>
        {modes.map(([v, zh, en]) => <option key={v} value={v}>{isZh ? zh : en}</option>)}
      </select>
      {config.mode === "ripple" && (
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><span>{t(T("位数", "Bits"))}</span>
          <select className="txt" value={config.bits} onChange={(e) => onChange({ ...config, bits: Number(e.target.value) })} style={{ width: 60 }}>
            {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
    </div>
  ) as unknown as never;
}

function MuxControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const modes: Array<[MuxMode, string, string]> = [
    ["mux", "多路选择器", "MUX"], ["decode", "译码器", "Decoder"],
  ];
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>{isZh ? "电路" : "CIRCUIT"}</span>
      <select className="txt" value={config.mode} onChange={(e) => onChange({ ...config, mode: e.target.value as MuxMode })}>
        {modes.map(([v, zh, en]) => <option key={v} value={v}>{isZh ? zh : en}</option>)}
      </select>
    </div>
  ) as unknown as never;
}

function AluControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>{isZh ? "运算" : "OP"}</span>
      <select className="txt" value={config.op} onChange={(e) => onChange({ ...config, op: e.target.value as AluCfg["op"] })}>
        <option value="and">AND (00)</option>
        <option value="or">OR (01)</option>
        <option value="add">ADD (10)</option>
      </select>
    </div>
  ) as unknown as never;
}

function SeqControls({ config, onChange, t }: any) {
  const isZh = t(T("中文", "en")) !== "en";
  const modes: Array<[SeqMode, string, string]> = [
    ["latch", "SR 锁存器", "SR Latch"], ["dff", "D 触发器", "D-FF"], ["register", "寄存器", "Register"],
  ];
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>{isZh ? "电路" : "CIRCUIT"}</span>
      <select className="txt" value={config.mode} onChange={(e) => onChange({ ...config, mode: e.target.value as SeqMode })}>
        {modes.map(([v, zh, en]) => <option key={v} value={v}>{isZh ? zh : en}</option>)}
      </select>
      {config.mode === "register" && (
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><span>{t(T("位数", "Bits"))}</span>
          <select className="txt" value={config.reg} onChange={(e) => onChange({ ...config, reg: e.target.value })} style={{ width: 80 }}>
            {["11", "101", "1011", "1101", "1111", "101011", "11010011"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      )}
    </div>
  ) as unknown as never;
}

// 2 输入真值表
const TT2: Array<[number, number, number]> = [
  [0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 1],
];