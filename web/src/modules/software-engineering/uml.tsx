import { T, type Text } from "../../i18n/lang";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, Chips, isZh, makeChapter, type SubDef } from "../common/chapter";

// 用户驱动的「状态 / 数值」面板：展示当前步的关键取值，并提供推进按钮
function StepPanel({ t, title, rows, onNext, nextLabel, showNext }: {
  t: (x: Text) => string;
  title: string;
  rows: [string, string][];
  onNext?: () => void;
  nextLabel: string;
  showNext: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 12px", borderRadius: 10, background: "#0f172a", color: "#e2e8f0", fontSize: 12 }}>
      <span style={{ fontWeight: 800, color: "#a5b4fc" }}>{title}</span>
      {rows.map(([k, v]) => (
        <span key={k} style={{ fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap" }}>{k} = <b style={{ color: "#fde047" }}>{v}</b></span>
      ))}
      {showNext && onNext && (
        <button className="primary" style={{ marginLeft: "auto" }} onClick={(e) => { e.stopPropagation(); onNext(); }}>{nextLabel}</button>
      )}
    </div>
  );
}

// =====================================================================
// 软件工程 · 面向对象与 UML
//   对应 tex/SoftwareEngineering/chapters/uml.tex
//   class(类图·逐帧) / sequence(时序图) / state(状态·活动图)
// =====================================================================

type SubMode = "class" | "sequence" | "state";

// 类图逐帧动画的数据模型：先逐类登场（属性+方法），再逐条画关系。
// 对应 tex/SoftwareEngineering/chapters/uml.tex：Person/Member/Book/Loan 借阅系统。
type RelKind = "assoc" | "aggr" | "comp" | "gen" | "dep";
type UmlClass = { name: string; attrs: string[]; methods: string[]; tone: string };
type UmlRel = { kind: RelKind; from: string; to: string; fromMult?: string; toMult?: string; zh: string; en: string };
type ClassScene = { step: number; classes: number; relations: RelKind[] };

const BOX_W = 150;
const BOX_H = 112;
const UML_W = 580;
const UML_H = 330;

const UML_CLASSES: Record<string, UmlClass> = {
  Person: { name: "Person", attrs: ["# name: String", "# email: String"], methods: ["+ getName(): String"], tone: "#eef2ff" },
  Member: { name: "Member", attrs: ["- memberId: String", "- joinDate: Date"], methods: ["+ borrow(b: Book): Loan"], tone: "#dcfce7" },
  Book: { name: "Book", attrs: ["- isbn: String", "- title: String"], methods: ["+ isAvailable(): bool"], tone: "#e0f2fe" },
  BookCopy: { name: "BookCopy", attrs: ["- barcode: String", "- shelf: String"], methods: ["+ isLent(): bool"], tone: "#fce7f3" },
  Catalog: { name: "Catalog", attrs: ["- name: String"], methods: ["+ search(k: String): Book[]"], tone: "#fef3c7" },
  Loan: { name: "Loan", attrs: ["- loanDate: Date", "- dueDate: Date"], methods: ["+ isOverdue(): bool"], tone: "#fde68a" },
};

const UML_POS: Record<string, { x: number; y: number }> = {
  Person: { x: 10, y: 10 },
  Member: { x: 215, y: 10 },
  Loan: { x: 420, y: 10 },
  Catalog: { x: 10, y: 210 },
  Book: { x: 215, y: 210 },
  BookCopy: { x: 420, y: 210 },
};

const UML_ORDER = ["Person", "Member", "Book", "BookCopy", "Catalog", "Loan"];
const UML_REL_ORDER: RelKind[] = ["assoc", "aggr", "comp", "gen", "dep"];

const UML_RELS: UmlRel[] = [
  { kind: "assoc", from: "Member", to: "Loan", fromMult: "1", toMult: "0..*", zh: "借阅", en: "borrows" },
  { kind: "aggr", from: "Catalog", to: "Book", fromMult: "1", toMult: "0..*", zh: "目录聚合图书", en: "catalog aggregates books" },
  { kind: "comp", from: "Book", to: "BookCopy", fromMult: "1", toMult: "1..*", zh: "书目拥有副本", en: "book owns copies" },
  { kind: "gen", from: "Member", to: "Person", zh: "会员是一种人", en: "a member is a person" },
  { kind: "dep", from: "Loan", to: "Book", zh: "借阅记录依赖书目", en: "loan depends on book" },
];

const REL_META: Record<RelKind, { zh: string; en: string; notation: string; bg: string; fg: string; zhNote: string; enNote: string }> = {
  assoc: { zh: "关联 Association", en: "Association", notation: "──", bg: "#eef2ff", fg: "#4338ca",
    zhNote: "实线连接两个类，两端标多重性：一个会员（1）对应 0..* 条借阅记录。", enNote: "Solid line between two classes, with end multiplicities: one member (1) to 0..* loans." },
  aggr: { zh: "聚合 Aggregation", en: "Aggregation", notation: "◇──", bg: "#dcfce7", fg: "#166534",
    zhNote: "空心菱形画在「整体」端：目录（1）聚合 0..* 本书，书可独立存在（has-a）。", enNote: "Hollow diamond on the whole end: a catalog (1) aggregates 0..* books that live independently (has-a)." },
  comp: { zh: "组合 Composition", en: "Composition", notation: "◆──", bg: "#fef3c7", fg: "#92400e",
    zhNote: "实心菱形画在「整体」端：书目（1）拥有 1..* 个副本，副本随书目消亡（owns-a）。", enNote: "Filled diamond on the whole end: a book (1) owns 1..* copies that die with it (owns-a)." },
  gen: { zh: "泛化 Generalization", en: "Generalization", notation: "──▷", bg: "#ede9fe", fg: "#5b21b6",
    zhNote: "空心三角指向「父类」端：会员继承人的属性与方法（is-a）。", enNote: "Hollow triangle points to the parent end: a member inherits a person's members (is-a)." },
  dep: { zh: "依赖 Dependency", en: "Dependency", notation: "⇢", bg: "#fee2e2", fg: "#b91c1c",
    zhNote: "虚线 + 开放箭头：借阅记录临时使用书目（参数/局部变量/返回值）。", enNote: "Dashed line + open arrow: a loan temporarily uses a book (param/local/return)." },
};

function ClassBox({ name, attrs, methods, tone = "#eef2ff" }: { name: string; attrs: string[]; methods: string[]; tone?: string }) {
  return (
    <div style={{ border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff", overflow: "hidden", fontSize: 12, fontFamily: "ui-monospace, monospace", width: "100%", height: BOX_H, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "5px 8px", background: tone, fontWeight: 800, textAlign: "center", color: "#1e293b" }}>{name}</div>
      <div style={{ padding: "4px 8px", borderTop: "1px solid #e2e8f0", color: "#475569", display: "grid", gap: 1, flex: 1 }}>
        {attrs.map((a) => <div key={a}>{a}</div>)}
      </div>
      <div style={{ padding: "4px 8px", borderTop: "1px solid #e2e8f0", color: "#334155", display: "grid", gap: 1, flex: 1 }}>
        {methods.map((m) => <div key={m}>{m}</div>)}
      </div>
    </div>
  );
}

type Pt = { x: number; y: number };
function centerOf(name: string): Pt {
  const p = UML_POS[name];
  return { x: p.x + BOX_W / 2, y: p.y + BOX_H / 2 };
}
function borderOf(c: Pt, o: Pt): Pt {
  const dx = o.x - c.x, dy = o.y - c.y;
  const s = Math.min((BOX_W / 2) / (Math.abs(dx) || 1e-6), (BOX_H / 2) / (Math.abs(dy) || 1e-6));
  return { x: c.x + dx * s, y: c.y + dy * s };
}
function unitVec(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}
function DiamondMark({ p, dir, filled, color }: { p: Pt; dir: Pt; filled: boolean; color: string }) {
  const perp = { x: -dir.y, y: dir.x };
  const L = 15, W = 8;
  const b = { x: p.x + dir.x * L, y: p.y + dir.y * L };
  const o = { x: p.x + dir.x * 2 * L, y: p.y + dir.y * 2 * L };
  const pts = `${p.x},${p.y} ${b.x + perp.x * W},${b.y + perp.y * W} ${o.x},${o.y} ${b.x - perp.x * W},${b.y - perp.y * W}`;
  return <polygon points={pts} fill={filled ? color : "#fff"} stroke={color} strokeWidth={1.2} />;
}
function TriangleMark({ p, dir, color }: { p: Pt; dir: Pt; color: string }) {
  const perp = { x: -dir.y, y: dir.x };
  const L = 17, W = 9;
  const b = { x: p.x + dir.x * L, y: p.y + dir.y * L };
  const pts = `${p.x},${p.y} ${b.x + perp.x * W},${b.y + perp.y * W} ${b.x - perp.x * W},${b.y - perp.y * W}`;
  return <polygon points={pts} fill="#fff" stroke={color} strokeWidth={1.2} />;
}
function OpenArrow({ p, dir, color }: { p: Pt; dir: Pt; color: string }) {
  const perp = { x: -dir.y, y: dir.x };
  const L = 13, W = 6;
  const b = { x: p.x + dir.x * L, y: p.y + dir.y * L };
  return <path d={`M ${b.x + perp.x * W} ${b.y + perp.y * W} L ${p.x} ${p.y} L ${b.x - perp.x * W} ${b.y - perp.y * W}`} fill="none" stroke={color} strokeWidth={1.3} />;
}
function MultLabel({ p, dir, text, color }: { p: Pt; dir: Pt; text: string; color: string }) {
  const perp = { x: -dir.y, y: dir.x };
  const q = { x: p.x + dir.x * 18 + perp.x * 10, y: p.y + dir.y * 18 + perp.y * 10 };
  return <text x={q.x} y={q.y} fontSize={12} fontFamily="ui-monospace, monospace" fill={color} textAnchor="middle">{text}</text>;
}

function ClassRender({ scene, t, playing, onNext }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0, classes: 0, relations: [] }) as ClassScene;
  const shown = new Set(s.relations);
  const cur: RelKind | null = s.relations.length ? s.relations[s.relations.length - 1] : null;
  const meta = cur ? REL_META[cur] : null;
  const classPhase = s.relations.length === 0 && s.classes < UML_ORDER.length;
  const nextClass = classPhase ? UML_ORDER[s.classes] : null;
  const nextRelIndex = !classPhase && s.relations.length < UML_REL_ORDER.length ? s.relations.length : -1;
  const nextRel = nextRelIndex >= 0 ? UML_RELS.find((x) => x.kind === UML_REL_ORDER[nextRelIndex]) ?? null : null;
  const nextMeta = nextRel ? REL_META[nextRel.kind] : null;
  const done = s.relations.length >= UML_REL_ORDER.length;
  const canNext = !!onNext && !playing && !done;
  const advance = (e: any) => { e.stopPropagation(); onNext?.(); };
  const lastClass = UML_ORDER[Math.max(0, s.classes - 1)];
  return (
    <Panel>
      <div style={{ textAlign: "center", padding: "8px 14px", borderRadius: 10, background: meta ? meta.bg : "#eef2ff", color: meta ? meta.fg : "#4338ca", fontWeight: 800, fontSize: 14 }}>
        {meta
          ? `${zh ? meta.zh : meta.en}  ${meta.notation}`
          : (zh ? "第一步：建立类（属性 + 方法，可见性 + - # ~）" : "Step 1: define classes (attributes + methods, visibility + - # ~)")}
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ position: "relative", width: UML_W, height: UML_H, margin: "0 auto", background: "#fbfdff", border: "1px dashed #cbd5e1", borderRadius: 12 }}>
          <svg width={UML_W} height={UML_H} style={{ position: "absolute", left: 0, top: 0 }}>
            {UML_RELS.map((r) => {
              if (!shown.has(r.kind)) return null;
              const c1 = centerOf(r.from), c2 = centerOf(r.to);
              const p1 = borderOf(c1, c2), p2 = borderOf(c2, c1);
              const d12 = unitVec(p1, p2), d21 = unitVec(p2, p1);
              const active = r.kind === cur;
              const color = active && meta ? meta.fg : "#94a3b8";
              return (
                <g key={r.kind}>
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth={active ? 2 : 1.3} strokeDasharray={r.kind === "dep" ? "6 4" : undefined} />
                  {r.kind === "aggr" && <DiamondMark p={p1} dir={d12} filled={false} color={color} />}
                  {r.kind === "comp" && <DiamondMark p={p1} dir={d12} filled color={color} />}
                  {r.kind === "gen" && <TriangleMark p={p2} dir={d21} color={color} />}
                  {r.kind === "dep" && <OpenArrow p={p2} dir={d21} color={color} />}
                  {r.fromMult && <MultLabel p={p1} dir={d12} text={r.fromMult} color={color} />}
                  {r.toMult && <MultLabel p={p2} dir={d21} text={r.toMult} color={color} />}
                </g>
              );
            })}
            {nextRel && (() => {
              const c1 = centerOf(nextRel.from), c2 = centerOf(nextRel.to);
              const p1 = borderOf(c1, c2), p2 = borderOf(c2, c1);
              return (
                <g onClick={canNext ? advance : undefined} style={{ cursor: canNext ? "pointer" : "default" }}>
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={16} />
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#6366f1" strokeWidth={2} strokeDasharray="6 4" />
                  <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 6} fontSize={11} fontFamily="ui-monospace, monospace" fill="#4338ca" textAnchor="middle">
                    {zh ? "点击画出" : "click to draw"}
                  </text>
                </g>
              );
            })()}
          </svg>
          {UML_ORDER.slice(0, s.classes).map((name) => {
            const c = UML_CLASSES[name];
            const p = UML_POS[name];
            const clickable = canNext && !classPhase;
            return (
              <div key={name} onClick={clickable ? advance : undefined}
                title={clickable ? t(T("点击画出下一条关系", "click to draw the next relation")) : undefined}
                style={{ position: "absolute", left: p.x, top: p.y, width: BOX_W, cursor: clickable ? "pointer" : "default" }}>
                <ClassBox name={c.name} attrs={c.attrs} methods={c.methods} tone={c.tone} />
              </div>
            );
          })}
          {nextClass && (
            <div onClick={canNext ? advance : undefined}
              title={t(T("点击添加下一个类", "click to add the next class"))}
              style={{ position: "absolute", left: UML_POS[nextClass].x, top: UML_POS[nextClass].y, width: BOX_W, cursor: canNext ? "pointer" : "default" }}>
              <div style={{ height: BOX_H, border: "2px dashed #6366f1", borderRadius: 10, background: "#f5f3ff", display: "grid", placeItems: "center", gap: 4, padding: 8, textAlign: "center", color: "#4338ca", fontSize: 12, fontFamily: "ui-monospace, monospace", fontWeight: 800 }}>
                <div>{zh ? "点击添加类" : "click to add class"}</div>
                <div>{nextClass}</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <StepPanel t={t} title={t(T("状态 / 数值", "Status / Values"))}
        rows={[
          [t(T("阶段", "Phase")), classPhase ? t(T("建立类", "Define classes")) : t(T("画关系", "Draw relations"))],
          [t(T("已建类", "Classes")), `${s.classes}/${UML_ORDER.length}`],
          [t(T("已画关系", "Relations")), `${s.relations.length}/${UML_REL_ORDER.length}`],
          [t(T("当前", "Current")), classPhase ? lastClass : (meta ? (zh ? meta.zh : meta.en) : "-")],
        ]}
        onNext={onNext} showNext={canNext}
        nextLabel={classPhase && nextClass
          ? t(T(`添加类 ${nextClass}`, `Add class ${nextClass}`))
          : nextMeta ? t(T(`画出${nextMeta.zh}`, `Draw ${nextMeta.en}`)) : t(T("完成", "Done"))} />
      <Table head={zh ? ["关系", "符号", "说明"] : ["Relation", "Notation", "Meaning"]}
        rows={zh
          ? [
            ["关联 Association", "──  1 ── 0..*", "一般连接，两端标多重性"],
            ["聚合 Aggregation", "◇──  整体端", "整体–部分，部分可独立存在（has-a）"],
            ["组合 Composition", "◆──  整体端", "整体–部分，部分随整体消亡（owns-a）"],
            ["泛化 Generalization", "──▷  父类端", "继承 is-a，子类复用父类"],
            ["依赖 Dependency", "⇢  虚线开放箭头", "临时使用：参数/局部变量/返回值"],
          ]
          : [
            ["Association", "──  1 ── 0..*", "general link with end multiplicities"],
            ["Aggregation", "◇──  whole end", "whole–part, part lives independently (has-a)"],
            ["Composition", "◆──  whole end", "whole–part, part dies with the whole (owns-a)"],
            ["Generalization", "──▷  parent end", "inheritance is-a, subclass reuses parent"],
            ["Dependency", "⇢  dashed open arrow", "temporary use: param/local/return"],
          ]} />
      <Chips items={zh
        ? [["+ public", "任何类可访问"], ["- private", "仅本类可访问"], ["# protected", "本类及子类"], ["~ package", "同包内可访问"]]
        : [["+ public", "any class"], ["- private", "this class only"], ["# protected", "class & subclasses"], ["~ package", "same package"]]} />
      {meta
        ? <Note>{zh ? meta.zhNote : meta.enNote}</Note>
        : <Note>{zh ? "类图先画「三格矩形」：类名、属性、方法；成员前缀 + 公有、- 私有、# 受保护、~ 包可见。静态成员加下划线，抽象成员用斜体。" : "A class is a three-compartment box: name, attributes, methods; member prefixes + public, - private, # protected, ~ package. Underline static members; italicize abstract ones."}</Note>}
      <Note tone="warn">{zh ? "聚合/组合的菱形画在「整体」端；泛化的空心三角画在「父类」端，方向反了语义就错。" : "The diamond sits on the whole end; the hollow triangle points to the parent end. Reversing them changes the meaning."}</Note>
    </Panel>
  );
}

type SeqMsg = { from: number; to: number; label: string; ret: boolean };
type SeqScene = { step: number; msgs: SeqMsg[] };

function SequenceRender({ scene, t, playing, onNext }: any) {
  const zh = isZh(t);
  const parts = zh ? ["用户", "控制器", "数据库"] : ["User", "Controller", "Database"];
  const s = (scene ?? { step: 0, msgs: [] }) as SeqScene;
  const labelText: Record<string, [string, string]> = {
    request: ["1: 提交请求", "1: request"],
    query: ["2: 查询数据", "2: query"],
    result: ["3: 返回结果", "3: result"],
    response: ["4: 响应", "4: response"],
  };
  const col = (i: number) => `${(i + 0.5) * (100 / parts.length)}%`;
  const shown = s.msgs.slice(0, s.step + 1);
  const curMsg = shown.length ? shown[shown.length - 1] : null;
  const nextMsg = s.msgs[s.step + 1];
  const canNext = !!onNext && !playing && !!nextMsg;
  const advance = (e: any) => { e.stopPropagation(); onNext?.(); };
  const msgLabel = (m: SeqMsg) => (labelText[m.label] ?? [m.label, m.label])[zh ? 0 : 1];
  const kinds: React.ReactNode[][] = zh
    ? [
      ["生命线 Lifeline", "对象下方虚线", "对象在时间轴上的存在"],
      ["激活条 Activation", "生命线上的窄矩形", "对象正在执行（控制焦点）"],
      ["同步消息 Sync", "实线 + 实心箭头", "调用后等待返回，阻塞"],
      ["异步消息 Async", "实线 + 开放箭头", "发送后不等待，继续执行"],
      ["返回消息 Return", "虚线 + 开放箭头", "把结果返回给调用者"],
      ["自消息 Self", "折返箭头", "对象调用自身方法"],
    ]
    : [
      ["Lifeline", "dashed vertical line", "object's existence over time"],
      ["Activation", "narrow bar on lifeline", "object is executing (focus)"],
      ["Synchronous", "solid line + filled arrow", "caller blocks until return"],
      ["Asynchronous", "solid line + open arrow", "sender continues, no wait"],
      ["Return", "dashed line + open arrow", "returns result to caller"],
      ["Self", "folded arrow", "object calls its own method"],
    ];
  return (
    <Panel>
      <div style={{ position: "relative", height: 244, background: "#fbfdff", border: "1px dashed #cbd5e1", borderRadius: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${parts.length}, 1fr)`, position: "absolute", top: 6, left: 0, right: 0 }}>
          {parts.map((p) => (
            <div key={p} style={{ margin: "0 10px", textAlign: "center", padding: "6px 4px", border: "1px solid #c7d2fe", borderRadius: 8, background: "#eef2ff", fontSize: 12, fontWeight: 700, color: "#3730a3" }}>{p}</div>
          ))}
        </div>
        {parts.map((_, i) => (
          <div key={i} style={{ position: "absolute", top: 40, bottom: 8, left: `calc(${col(i)} - 0.5px)`, borderLeft: "1px dashed #94a3b8" }} />
        ))}
        <div style={{ position: "absolute", left: `calc(${col(1)} - 4px)`, top: 44, height: 172, width: 8, background: "#e2e8f0", border: "1px solid #94a3b8", borderRadius: 2 }} />
        <div style={{ position: "absolute", left: `calc(${col(2)} - 4px)`, top: 96, height: 60, width: 8, background: "#e2e8f0", border: "1px solid #94a3b8", borderRadius: 2 }} />
        {shown.map((m, k) => {
          const a = Math.min(m.from, m.to);
          const b = Math.max(m.from, m.to);
          const rightward = m.to > m.from;
          const active = k === shown.length - 1;
          const lab = (labelText[m.label] ?? [m.label, m.label])[zh ? 0 : 1];
          return (
            <div key={k} style={{ position: "absolute", left: col(a), width: `${(b - a) * (100 / parts.length)}%`, top: 44 + k * 52 }}>
              <div style={{ fontSize: 11, color: active ? "#4338ca" : "#475569", fontWeight: active ? 800 : 400, textAlign: "center", whiteSpace: "nowrap" }}>{lab}</div>
              <div style={{ position: "relative", height: 0, borderTop: `1.5px ${m.ret ? "dashed" : "solid"} #334155`, marginTop: 3 }}>
                <span style={rightward
                  ? { position: "absolute", top: -8, right: -2, color: "#334155", fontSize: 12, lineHeight: 1 }
                  : { position: "absolute", top: -8, left: -2, color: "#334155", fontSize: 12, lineHeight: 1 }}>
                  {rightward ? "▶" : "◀"}
                </span>
              </div>
            </div>
          );
        })}
        {parts.map((_, i) => {
          const isTrigger = !!nextMsg && (nextMsg.from === i || nextMsg.to === i);
          return (
            <div key={`ln-${i}`} onClick={canNext ? advance : undefined}
              title={canNext ? t(T("点击生命线发送下一条消息", "click a lifeline to send the next message")) : undefined}
              style={{ position: "absolute", top: 0, bottom: 0, left: col(i), width: `${100 / parts.length}%`, transform: "translateX(-50%)", zIndex: 5, cursor: canNext ? "pointer" : "default", background: canNext && isTrigger ? "rgba(99,102,241,0.07)" : "transparent" }} />
          );
        })}
      </div>
      <StepPanel t={t} title={t(T("状态 / 数值", "Status / Values"))}
        rows={[
          [t(T("消息", "Message")), `${Math.min(s.step + 1, s.msgs.length)}/${s.msgs.length}`],
          [t(T("当前", "Current")), curMsg ? msgLabel(curMsg) : "-"],
          [t(T("类型", "Kind")), curMsg ? (curMsg.ret ? t(T("返回", "Return")) : t(T("同步", "Sync"))) : "-"],
          [t(T("方向", "From / To")), curMsg ? `${parts[curMsg.from]} / ${parts[curMsg.to]}` : "-"],
        ]}
        onNext={onNext} showNext={canNext}
        nextLabel={nextMsg
          ? t(T(`发送 ${parts[nextMsg.from]} 到 ${parts[nextMsg.to]}`, `send ${parts[nextMsg.from]} to ${parts[nextMsg.to]}`))
          : t(T("完成", "Done"))} />
      <Table head={zh ? ["要素", "图形", "说明"] : ["Element", "Notation", "Meaning"]} rows={kinds} />
      <Note>{zh ? "同步消息的发送者在收到返回前被阻塞，通常配套返回消息；异步消息发送后立即继续，常用于事件通知。" : "A synchronous sender blocks until it receives the return; an asynchronous sender continues immediately, common for event notifications."}</Note>
    </Panel>
  );
}

const SEQUENCE_CODE = [
  T("用户 → 控制器: 提交请求", "user → controller: request"),
  T("控制器 → 数据库: 查询数据", "controller → database: query"),
  T("数据库 ⇢ 控制器: 返回结果", "database ⇢ controller: result"),
  T("控制器 ⇢ 用户: 响应", "controller ⇢ user: response"),
  T("同步消息：调用者阻塞等待返回", "sync: caller blocks until return"),
  T("返回消息用虚线开放箭头", "return: dashed open arrow"),
];

function sequenceGenerate(_config: any): Frame<SeqScene>[] {
  const msgs: SeqMsg[] = [
    { from: 0, to: 1, label: "request", ret: false },
    { from: 1, to: 2, label: "query", ret: false },
    { from: 2, to: 1, label: "result", ret: true },
    { from: 1, to: 0, label: "response", ret: true },
  ];
  const caps: [string, string][] = [
    ["用户向控制器发出同步调用（提交请求）", "user makes a synchronous call (request)"],
    ["控制器向数据库发出同步调用（查询数据）", "controller makes a synchronous call (query)"],
    ["数据库以返回消息回送结果", "database returns the result"],
    ["控制器以返回消息响应调用者", "controller responds to the caller"],
  ];
  return msgs.map((_, i) => ({ line: i, caption: T(caps[i][0], caps[i][1]), scene: { step: i, msgs } }));
}

function StateBox({ label, tone }: { label: string; tone: string }) {
  return <span style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #cbd5e1", background: tone, fontSize: 12, fontWeight: 700, color: "#1e293b" }}>{label}</span>;
}

function Trans({ label, onClick, clickable = false }: { label: string; onClick?: (e: any) => void; clickable?: boolean }) {
  return (
    <span onClick={onClick} title={clickable ? label : undefined}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", fontSize: 10, color: "#64748b", cursor: clickable ? "pointer" : "default", padding: clickable ? "2px 4px" : 0, borderRadius: 6, background: clickable ? "#eef2ff" : undefined }}>
      <span>{label}</span>
      <span style={{ color: "#334155", fontSize: 14, lineHeight: 1 }}>→</span>
    </span>
  );
}

function FlowNode({ label, tone = "#eef2ff" }: { label: string; tone?: string }) {
  return <span style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: tone, fontSize: 12, color: "#1e293b", textAlign: "center" }}>{label}</span>;
}

function FlowDiamond({ label }: { label: string }) {
  return (
    <div style={{ position: "relative", width: 130, height: 64, display: "grid", placeItems: "center" }}>
      <div style={{ position: "absolute", inset: 0, margin: "auto", width: 44, height: 44, transform: "rotate(45deg)", border: "1px solid #cbd5e1", background: "#fef3c7" }} />
      <span style={{ position: "relative", fontSize: 11, color: "#334155", textAlign: "center" }}>{label}</span>
    </div>
  );
}

type StateKey = "created" | "paid" | "shipped" | "done";
type StateScene = { step: number; state: StateKey; event: string; prev: StateKey };

const STATE_SEQ: StateScene[] = [
  { step: 0, state: "created", event: "", prev: "created" },
  { step: 1, state: "created", event: "payFail", prev: "created" },
  { step: 2, state: "paid", event: "payOk", prev: "created" },
  { step: 3, state: "shipped", event: "ship", prev: "paid" },
  { step: 4, state: "done", event: "confirm", prev: "shipped" },
];

function StateRender({ scene, t, playing, onNext }: any) {
  const zh = isZh(t);
  const s = (scene ?? STATE_SEQ[0]) as StateScene;
  const nextScene = STATE_SEQ[s.step + 1];
  const canNext = !!onNext && !playing && !!nextScene;
  const advance = (e: any) => { e.stopPropagation(); onNext?.(); };
  const labels: Record<StateKey, string> = {
    created: zh ? "新建" : "Created",
    paid: zh ? "已支付" : "Paid",
    shipped: zh ? "已发货" : "Shipped",
    done: zh ? "已完成" : "Done",
  };
  const order: StateKey[] = ["created", "paid", "shipped", "done"];
  const transName: Record<string, string> = {
    "created>paid": zh ? "支付/扣款" : "pay/charge",
    "paid>shipped": zh ? "发货" : "ship",
    "shipped>done": zh ? "确认收货" : "confirm",
  };
  const eventText: Record<string, string> = {
    "": zh ? "（初始）" : "(initial)",
    payFail: zh ? "支付[$金额 \\le 0$]" : "pay[$amount \\le 0$]",
    payOk: zh ? "支付[$金额 > 0$]/扣款" : "pay[$amount > 0$]/charge",
    ship: zh ? "发货" : "ship",
    confirm: zh ? "确认收货" : "confirm",
  };
  const elems: React.ReactNode[][] = zh
    ? [
      ["状态 State", "圆角矩形", "对象所处的条件或状况"],
      ["初始状态", "实心圆", "唯一的入口"],
      ["终止状态", "牛眼（圆内实心圆）", "生命周期结束"],
      ["转移 Transition", "带箭头实线", "状态之间的迁移"],
      ["事件 Event", "转移上的触发名", "触发转移的信号"],
      ["守卫 Guard", "[条件]", "转移能否发生的布尔条件"],
      ["动作 Action", "/动作", "转移发生时执行的行为"],
    ]
    : [
      ["State", "rounded rectangle", "condition the object is in"],
      ["Initial", "filled circle", "unique entry point"],
      ["Final", "bullseye", "end of lifecycle"],
      ["Transition", "solid arrow", "migration between states"],
      ["Event", "trigger name on transition", "signal that fires the transition"],
      ["Guard", "[condition]", "boolean condition to allow transition"],
      ["Action", "/action", "behavior executed on transition"],
    ];
  const acts: React.ReactNode[][] = zh
    ? [
      ["开始 Initial", "实心圆", "流程入口"],
      ["活动 Action", "圆角矩形", "一个可执行的步骤"],
      ["判断 Decision", "菱形", "依据条件选择分支"],
      ["合并 Merge", "菱形", "多条分支汇合"],
      ["分叉/汇合 Fork/Join", "粗黑线", "并发流的开始与同步"],
      ["泳道 Swimlane", "分区", "按负责对象划分活动"],
      ["结束 Final", "牛眼", "流程终止"],
    ]
    : [
      ["Initial", "filled circle", "flow entry"],
      ["Action", "rounded rectangle", "an executable step"],
      ["Decision", "diamond", "choose a branch by condition"],
      ["Merge", "diamond", "branches rejoin"],
      ["Fork/Join", "thick bar", "start/sync of concurrent flows"],
      ["Swimlane", "partition", "group actions by owner"],
      ["Final", "bullseye", "flow termination"],
    ];
  return (
    <Panel>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, justifyContent: "center", padding: 10, borderRadius: 12, background: "#fbfdff", border: "1px dashed #cbd5e1" }}>
        {order.map((k, i) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <Trans label={transName[`${order[i - 1]}>${k}`]} clickable={canNext} onClick={canNext ? advance : undefined} />}
            <span onClick={canNext ? advance : undefined}
              title={canNext ? t(T("点击触发下一个事件", "click to fire the next event")) : undefined}
              style={{ display: "inline-flex", padding: 2, borderRadius: 12, boxShadow: k === s.state ? "0 0 0 2px #22c55e" : "none", cursor: canNext ? "pointer" : "default" }}>
              <StateBox label={labels[k]} tone={k === s.state ? "#dcfce7" : "#f1f5f9"} />
            </span>
          </span>
        ))}
      </div>
      {nextScene && (
        <div onClick={advance} title={t(T("点击触发下一个事件", "click to fire the next event"))}
          style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", padding: "8px 12px", borderRadius: 10, background: "#eef2ff", border: "2px dashed #6366f1", fontSize: 13, fontWeight: 800, color: "#3730a3", cursor: "pointer" }}>
          <span>{t(T("点击触发事件", "click to fire event"))}:</span>
          <span>{eventText[nextScene.event] ?? nextScene.event}</span>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", fontSize: 13, color: "#334155" }}>
        <span>{zh ? "事件" : "Event"}: <b>{eventText[s.event] ?? s.event}</b></span>
        <span style={{ color: "#cbd5e1" }}>|</span>
        <span>{zh ? "前一状态" : "Prev"}: <b>{labels[s.prev]}</b></span>
        <span style={{ color: "#cbd5e1" }}>|</span>
        <span>{zh ? "当前状态" : "State"}: <b>{labels[s.state]}</b></span>
      </div>
      <StepPanel t={t} title={t(T("状态 / 数值", "Status / Values"))}
        rows={[
          [t(T("步骤", "Step")), `${s.step + 1}/${STATE_SEQ.length}`],
          [t(T("前一状态", "Prev")), labels[s.prev]],
          [t(T("当前状态", "State")), labels[s.state]],
          [t(T("事件", "Event")), eventText[s.event] ?? s.event],
          [t(T("触发事件", "Trigger")), nextScene ? (eventText[nextScene.event] ?? nextScene.event) : t(T("完成", "Done"))],
        ]}
        onNext={onNext} showNext={canNext}
        nextLabel={nextScene ? t(T("触发事件", "Fire event")) : t(T("完成", "Done"))} />
      {s.event === "payFail"
        ? <Note tone="warn">{zh ? "守卫 [金额>0] 为假，转移不发生，对象保持「新建」。守卫把条件转移显式化。" : "Guard [amount>0] is false, so the transition does not fire; the object stays in Created. Guards make conditional transitions explicit."}</Note>
        : <Note>{zh ? "转移语法：事件[守卫]/动作，例如 支付[金额>0]/扣款。" : "Transition syntax: event[guard]/action, e.g. pay[amount>0]/charge."}</Note>}
      <Table head={zh ? ["状态图要素", "图形", "说明"] : ["State element", "Notation", "Meaning"]} rows={elems} />
      <div style={{ display: "grid", gap: 6, justifyItems: "center", padding: 12, borderRadius: 12, background: "#fbfdff", border: "1px dashed #cbd5e1" }}>
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#0f172a" }} />
        <FlowNode label={zh ? "接收订单" : "Receive order"} />
        <span style={{ color: "#94a3b8" }}>↓</span>
        <FlowDiamond label={zh ? "库存充足?" : "In stock?"} />
        <div style={{ display: "flex", gap: 48, fontSize: 11, color: "#475569" }}>
          <span>{zh ? "是 ↓" : "yes ↓"}</span>
          <span>{zh ? "否 ↓" : "no ↓"}</span>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          <FlowNode label={zh ? "扣减库存 / 生成发货单" : "deduct / create shipment"} tone="#dcfce7" />
          <FlowNode label={zh ? "通知缺货" : "notify out-of-stock"} tone="#fee2e2" />
        </div>
      </div>
      <Table head={zh ? ["活动图要素", "图形", "说明"] : ["Activity element", "Notation", "Meaning"]} rows={acts} />
      <Note tone="warn">{zh ? "状态图刻画「一个对象」因事件驱动的状态变迁；活动图刻画「一个流程」中动作与控制的流转。关注点不同。" : "A state machine models one object's event-driven state changes; an activity diagram models the flow of actions in a process."}</Note>
    </Panel>
  );
}

const STATE_CODE = [
  T("state ← 新建", "state ← Created"),
  T("on 支付[$金额>0$]: state ← 已支付", "on pay[$amount>0$]: state ← Paid"),
  T("on 发货: state ← 已发货", "on ship: state ← Shipped"),
  T("on 确认收货: state ← 已完成", "on confirm: state ← Done"),
  T("守卫为假 ⇒ 保持原状态", "false guard ⇒ stay in current state"),
];

function stateGenerate(_config: any): Frame<StateScene>[] {
  const seq = STATE_SEQ;
  const caps: [string, string][] = [
    ["初始状态：新建", "Initial state: Created"],
    ["事件 支付[$金额 \\le 0$]：守卫为假，不发生转移", "Event pay[$amount \\le 0$]: guard false, no transition"],
    ["事件 支付[$金额 > 0$]/扣款 → 已支付", "Event pay[$amount > 0$]/charge → Paid"],
    ["事件 发货 → 已发货", "Event ship → Shipped"],
    ["事件 确认收货 → 已完成", "Event confirm → Done"],
  ];
  const lines = [0, 4, 1, 2, 3];
  return seq.map((scene, i) => ({ line: lines[i], caption: T(caps[i][0], caps[i][1]), scene }));
}

const CLASS_CODE = [
  T("类 = 类名 + 属性 + 方法（$+|-|\\#|\\sim$ 可见性）", "class = name + attributes + methods ($+|-|\\#|\\sim$ visibility)"),
  T("关联：实线 + 多重性 $1 \\;──\\; 0..*$", "Association: solid line + multiplicities $1 \\;──\\; 0..*$"),
  T("聚合：空心菱形在整体端 $\\diamond──$", "Aggregation: hollow diamond on the whole end $\\diamond──$"),
  T("组合：实心菱形在整体端 $\\blacklozenge──$", "Composition: filled diamond on the whole end $\\blacklozenge──$"),
  T("泛化：空心三角指向父类 $──\\triangleright$", "Generalization: hollow triangle to the parent $──\\triangleright$"),
  T("依赖：虚线 + 开放箭头 $\\dashrightarrow$", "Dependency: dashed line + open arrow $\\dashrightarrow$"),
];

function classGenerate(_config: any): Frame<ClassScene>[] {
  const frames: Frame<ClassScene>[] = [];
  UML_ORDER.forEach((name, i) => {
    frames.push({
      line: 0,
      caption: T(`添加类 ${name}（属性与方法）`, `Add class ${name} (attributes & methods)`),
      scene: { step: frames.length, classes: i + 1, relations: [] },
    });
  });
  UML_REL_ORDER.forEach((k, i) => {
    const r = UML_RELS.find((x) => x.kind === k)!;
    frames.push({
      line: i + 1,
      caption: T(`画出${REL_META[k].zh}：${r.from} → ${r.to}（${r.zh}）`, `Draw ${REL_META[k].en}: ${r.from} → ${r.to} (${r.en})`),
      scene: { step: frames.length, classes: UML_ORDER.length, relations: UML_REL_ORDER.slice(0, i + 1) },
    });
  });
  return frames;
}

const SUBS: Record<SubMode, SubDef> = {
  class: { title: T("类图", "Class Diagram"), Render: ClassRender, generate: classGenerate, code: CLASS_CODE },
  sequence: { title: T("时序图", "Sequence Diagram"), Render: SequenceRender, generate: sequenceGenerate, code: SEQUENCE_CODE },
  state: { title: T("状态/活动图", "State/Activity"), Render: StateRender, generate: stateGenerate, code: STATE_CODE },
};

export const { module: seUmlModule, GROUPS: seUmlGroups } = makeChapter<SubMode>({
  id: "se-uml",
  title: T("面向对象与 UML", "OOP & UML"),
  desc: T("类图（类/属性/方法/可见性与关联、聚合、组合、泛化、依赖、多重性）、时序图、状态图与活动图。", "Class diagrams (members, visibility, association/aggregation/composition/generalization/dependency, multiplicity), sequence, state & activity diagrams."),
  tags: ["software-engineering", "uml"],
  groups: [
    { label: "UML", opts: [
      { v: "class", zh: "类图", en: "Class" },
      { v: "sequence", zh: "时序图", en: "Sequence" },
      { v: "state", zh: "状态/活动图", en: "State/Activity" },
    ] },
  ],
  subs: SUBS,
});
