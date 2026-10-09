import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Note, isZh, makeChapter, type SubDef } from "../common/chapter";

type SubMode = "relationships" | "normalization";

function EntityBox({ title, attrs = [], weak = false }: { title: string; attrs?: string[]; weak?: boolean }) {
  return (
    <div style={{ border: weak ? "4px double #6366f1" : "2px solid #6366f1", borderRadius: 8, background: "#eef2ff", padding: "8px 12px", minWidth: 116, textAlign: "center" }}>
      <div style={{ fontWeight: 800, color: "#4338ca", fontSize: 13 }}>{title}</div>
      {attrs.length > 0 && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #c7d2fe", display: "grid", gap: 2 }}>
          {attrs.map((a) => (
            <div key={a} style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: "#334155", textDecoration: a.includes("PK") ? "underline" : "none" }}>{a}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Diamond({ label }: { label: string }) {
  return (
    <div style={{ width: 88, height: 88, display: "grid", placeItems: "center", flexShrink: 0 }}>
      <div style={{ width: 58, height: 58, transform: "rotate(45deg)", background: "#fef3c7", border: "2px solid #d97706", borderRadius: 6, display: "grid", placeItems: "center" }}>
        <span style={{ transform: "rotate(-45deg)", fontSize: 11, fontWeight: 800, color: "#92400e", textAlign: "center", lineHeight: 1.2 }}>{label}</span>
      </div>
    </div>
  );
}

function Link({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", color: "#94a3b8" }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: "#4338ca" }}>{label}</span>
      <span style={{ fontSize: 18, lineHeight: 1 }}>—</span>
    </div>
  );
}

// ---------------------------------------------------------------------
// relationships: 联系与基数 逐帧动画
//   1:1 → 1:N → M:N（不可直接存储）→ 分解为中间表（复合主键）
// ---------------------------------------------------------------------
type RelKind = "1:1" | "1:N" | "M:N";
type RelTable = { name: string; head: string[]; rows: string[][]; key?: string[] };
type RelScene = { step: number; entities: [string, string]; rel: RelKind; tables: RelTable[] };

const REL_ENT: Record<string, [string, string]> = {
  teacher: ["教师", "Teacher"],
  office: ["办公室", "Office"],
  klass: ["班级", "Class"],
  student: ["学生", "Student"],
  course: ["课程", "Course"],
};

const REL_TBL: Record<string, [string, string]> = {
  office: ["办公室", "Office"],
  student: ["学生", "Student"],
  course: ["课程", "Course"],
  enroll: ["选课", "Enroll"],
};

const REL_ATTR: Record<string, [string, string]> = {
  oid: ["办公室号", "oid"],
  location: ["位置", "location"],
  tid: ["教师号", "tid"],
  sid: ["学号", "sid"],
  name: ["姓名", "name"],
  cid: ["课程号", "cid"],
  title: ["课程名", "title"],
  grade: ["成绩", "grade"],
};

function RelationshipsRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0, entities: ["teacher", "office"], rel: "1:1", tables: [] }) as RelScene;
  const ent = (k: string) => (zh ? REL_ENT[k]?.[0] : REL_ENT[k]?.[1]) ?? k;
  const tbl = (k: string) => (zh ? REL_TBL[k]?.[0] : REL_TBL[k]?.[1]) ?? k;
  const attr = (k: string) => (zh ? REL_ATTR[k]?.[0] : REL_ATTR[k]?.[1]) ?? k;
  const card: Record<RelKind, [string, string]> = { "1:1": ["1", "1"], "1:N": ["1", "N"], "M:N": ["M", "N"] };
  const [cl, cr] = card[s.rel] ?? ["1", "1"];
  const junction = s.rel === "M:N" && s.tables.some((x) => x.name === "enroll");
  let note: string;
  if (s.rel === "M:N" && !junction) {
    note = zh
      ? "M:N 不能直接存储：放任一侧都会产生多值单元，破坏 1NF 并导致更新异常。"
      : "M:N cannot be stored directly: on either side it creates a multi-valued cell, breaking 1NF and causing update anomalies.";
  } else if (s.rel === "M:N") {
    note = zh
      ? "分解：新建中间表，主键 = 双方主键的组合 $(sid, cid)$，联系属性（如 $成绩$）一并放入。"
      : "Decompose: create a junction table keyed by both PKs $(sid, cid)$, carrying relationship attributes (e.g. $grade$).";
  } else if (s.rel === "1:N") {
    note = zh
      ? "1:N：把 1 端主键作为外键放入 N 端，N 端可重复出现该外键。"
      : "1:N: put the 1-side PK as a foreign key on the N-side; it may repeat there.";
  } else {
    note = zh
      ? "1:1：在任一侧加入对方主键作外键并加 $UNIQUE$，或直接把两表合并。"
      : "1:1: add the other PK as a $UNIQUE$ foreign key on either side, or merge the two tables.";
  }
  return (
    <Panel>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, flexWrap: "wrap", padding: "10px 8px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
        <EntityBox title={ent(s.entities[0])} />
        <Link label={cl} />
        <Diamond label={s.rel === "M:N" ? (zh ? "选修" : "Enroll") : (zh ? "拥有" : "own")} />
        <Link label={cr} />
        <EntityBox title={ent(s.entities[1])} />
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {s.tables.map((r, idx) => (
          <div key={r.name + idx} style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#3730a3" }}>{tbl(r.name)}</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "ui-monospace, monospace", background: "#fff" }}>
                <thead>
                  <tr>
                    {r.head.map((h) => {
                      const k = !!r.key?.includes(h);
                      return <th key={h} style={{ padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #e2e8f0", fontSize: 12, color: k ? "#4338ca" : "#475569", textDecoration: k ? "underline" : undefined }}>{attr(h)}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 ? "#f8fafc" : "#fff" }}>
                      {row.map((c, j) => {
                        const k = !!r.key?.includes(r.head[j]);
                        return <td key={j} style={{ padding: "5px 10px", borderBottom: "1px solid #f1f5f9", color: k ? "#4338ca" : j === 0 ? "#0f172a" : "#475569", fontWeight: k || j === 0 ? 700 : 400 }}>{c}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      <Note tone={s.rel === "M:N" && !junction ? "warn" : "info"}><MathText text={note} /></Note>
    </Panel>
  );
}

function relationshipsGenerate(_config: any): Frame<RelScene>[] {
  const student: RelTable = { name: "student", head: ["sid", "name"], rows: [["S1", "Ann"], ["S2", "Bob"]] };
  const course: RelTable = { name: "course", head: ["cid", "title"], rows: [["C1", "DB"], ["C2", "OS"]] };
  const enroll2: RelTable = { name: "enroll", head: ["sid", "cid"], rows: [["S1", "C1"], ["S1", "C2"], ["S2", "C1"]], key: ["sid", "cid"] };
  const enroll3: RelTable = { name: "enroll", head: ["sid", "cid", "grade"], rows: [["S1", "C1", "90"], ["S1", "C2", "85"], ["S2", "C1", "76"]], key: ["sid", "cid"] };
  return [
    { line: 0, caption: T("1:1：教师↔办公室，外键放任一侧并加 $UNIQUE$", "1:1: Teacher↔Office, FK on either side with $UNIQUE$"), scene: { step: 0, entities: ["teacher", "office"], rel: "1:1", tables: [{ name: "office", head: ["oid", "location", "tid"], rows: [["O1", "A", "T1"]] }] } },
    { line: 1, caption: T("1:N：班级→学生，1 端主键 $cid$ 作为外键放入 N 端", "1:N: Class→Student, 1-side PK $cid$ as FK on the N-side"), scene: { step: 1, entities: ["klass", "student"], rel: "1:N", tables: [{ name: "student", head: ["sid", "name", "cid"], rows: [["S1", "Ann", "C1"], ["S2", "Bob", "C1"]] }] } },
    { line: 2, caption: T("M:N：学生↔课程，任一侧都无法直接存储（多值单元破坏 1NF）", "M:N: Student↔Course, neither side can store it directly (multi-valued cell breaks 1NF)"), scene: { step: 2, entities: ["student", "course"], rel: "M:N", tables: [student, course] } },
    { line: 3, caption: T("分解：新建中间表「选课」，主键 = 双方主键组合 $(sid, cid)$", "Decompose: junction table Enroll keyed by both PKs $(sid, cid)$"), scene: { step: 3, entities: ["student", "course"], rel: "M:N", tables: [student, course, enroll2] } },
    { line: 4, caption: T("联系属性（如 $成绩$）放入中间表，M:N 建模完成", "Relationship attributes (e.g. $grade$) go into the junction table; M:N modeling done"), scene: { step: 4, entities: ["student", "course"], rel: "M:N", tables: [student, course, enroll3] } },
  ];
}
const REL_CODE = [
  T("1:1 → 外键放任一侧 + $UNIQUE$，或合并为一张表", "1:1 → FK on either side + $UNIQUE$, or merge"),
  T("1:N → 把 1 端主键作为外键放入 N 端", "1:N → put 1-side PK as FK on the N-side"),
  T("M:N → 无法直接存储（多值单元破坏 1NF）", "M:N → cannot be stored directly (multi-valued cell breaks 1NF)"),
  T("新建中间表，主键 = 双方主键的组合", "create a junction table keyed by both PKs"),
  T("联系属性放入中间表 → 完成 M:N 建模", "put relationship attributes in the junction → M:N done"),
];

type NormRel = { name: string; head: string[]; rows: string[][]; bad?: string[] };
type NormIssue = "repeat" | "partial" | "transitive" | "none";
type NormScene = { step: number; table: NormRel[]; issue: NormIssue };

const NORM_ATTR: Record<string, [string, string]> = {
  sid: ["学号", "sid"],
  courses: ["选课信息", "courses"],
  cid: ["课程", "course"],
  grade: ["成绩", "grade"],
  teacher: ["教师", "teacher"],
  phone: ["教师电话", "phone"],
};
const NORM_REL: Record<string, [string, string]> = {
  raw: ["未规范化 R", "Unnormalized R"],
  n1: ["R1 (1NF)", "R1 (1NF)"],
  ec: ["选课", "Enroll"],
  course: ["课程", "Course"],
  teacher: ["教师", "Teacher"],
};

function normalizationGenerate(_config: any): Frame<NormScene>[] {
  const raw: NormRel = { name: "raw", head: ["sid", "courses"], rows: [["S1", "C1:90:王五:123, C2:85:王五:123"]], bad: ["courses"] };
  const n1: NormRel = { name: "n1", head: ["sid", "cid", "grade", "teacher", "phone"], rows: [["S1", "C1", "90", "王五", "123"], ["S1", "C2", "85", "王五", "123"]], bad: ["teacher", "phone"] };
  const ec: NormRel = { name: "ec", head: ["sid", "cid", "grade"], rows: [["S1", "C1", "90"], ["S1", "C2", "85"]] };
  const course2: NormRel = { name: "course", head: ["cid", "teacher", "phone"], rows: [["C1", "王五", "123"], ["C2", "王五", "123"]], bad: ["phone"] };
  const course3: NormRel = { name: "course", head: ["cid", "teacher"], rows: [["C1", "王五"], ["C2", "王五"]] };
  const teacher3: NormRel = { name: "teacher", head: ["teacher", "phone"], rows: [["王五", "123"]] };
  return [
    { line: 0, caption: T("未规范化：$R(学号, 课程, 成绩, 教师, 教师电话)$，一格里塞入多门课（重复组 / 非原子值）", "Unnormalized: $R(sid, course, grade, teacher, phone)$ packs several courses into one cell (repeating group)"), scene: { step: 0, table: [raw], issue: "repeat" } },
    { line: 1, caption: T("1NF：拆成每行一门课，属性均为原子值；部分依赖 $课程 \\to 教师$ 仍在", "1NF: one course per row, all values atomic; partial dependency $course \\to teacher$ remains"), scene: { step: 1, table: [n1], issue: "partial" } },
    { line: 2, caption: T("2NF：按完全依赖分解为 选课 与 课程，消除部分依赖；传递依赖 $课程 \\to 教师 \\to 教师电话$ 仍在", "2NF: decompose into Enroll and Course, removing the partial dependency; transitive $course \\to teacher \\to phone$ remains"), scene: { step: 2, table: [ec, course2], issue: "transitive" } },
    { line: 3, caption: T("3NF：抽出 $教师 \\to 教师电话$ 单独成表，消除传递依赖，完成规范化", "3NF: factor $teacher \\to phone$ into its own table, removing the transitive dependency"), scene: { step: 3, table: [ec, course3, teacher3], issue: "none" } },
  ];
}
const NORM_CODE = [
  T("// R(学号, 课程, 成绩, 教师, 教师电话)", "// R(sid, course, grade, teacher, phone)"),
  T("R ← 消去重复组 / 多值 → 1NF", "R ← remove repeating groups / multivalued → 1NF"),
  T("R ← 按完全依赖分解，消去部分依赖 → 2NF", "R ← decompose on full deps, drop partial → 2NF"),
  T("R ← 抽出中间属性，消去传递依赖 → 3NF", "R ← factor out mediator, drop transitive → 3NF"),
  T("return 一组 3NF 关系", "return a set of 3NF relations"),
];

function NormalizationRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0, table: [], issue: "none" }) as NormScene;
  const attr = (k: string) => (zh ? NORM_ATTR[k]?.[0] : NORM_ATTR[k]?.[1]) ?? k;
  const rel = (k: string) => (zh ? NORM_REL[k]?.[0] : NORM_REL[k]?.[1]) ?? k;
  const issue: Record<NormIssue, [string, string]> = {
    repeat: [
      "非原子值：一个单元格塞入多门课（重复组）→ 违反 1NF。",
      "Non-atomic cell: several courses packed into one cell (repeating group) → violates 1NF.",
    ],
    partial: [
      "部分依赖：$课程 \\to 教师$、$课程 \\to 教师电话$ 只依赖复合键 $(学号,课程)$ 的一部分（与 $学号$ 无关）→ 违反 2NF。",
      "Partial dependency: $course \\to teacher$、$course \\to phone$ depend only on part of the composite key $(sid,course)$, not on $sid$ → violates 2NF.",
    ],
    transitive: [
      "传递依赖：$课程 \\to 教师 \\to 教师电话$，教师电话经由教师间接依赖课程 → 违反 3NF。",
      "Transitive dependency: $course \\to teacher \\to phone$, phone depends on course only via teacher → violates 3NF.",
    ],
    none: [
      "所有非主属性都完全且直接依赖于候选键，已达到 3NF。",
      "Every non-prime attribute fully and directly depends on a candidate key — 3NF reached.",
    ],
  };
  return (
    <Panel>
      <Note tone={s.issue === "none" ? "info" : "warn"}>
        <span style={{ fontWeight: 800 }}>{zh ? `第 ${s.step} 步 · ` : `Step ${s.step} · `}</span>
        <MathText text={issue[s.issue][zh ? 0 : 1]} />
      </Note>
      <div style={{ display: "grid", gap: 12 }}>
        {s.table.map((r) => (
          <div key={r.name} style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#3730a3" }}>{rel(r.name)}</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "ui-monospace, monospace", background: "#fff" }}>
                <thead>
                  <tr>
                    {r.head.map((h) => {
                      const bad = !!r.bad?.includes(h);
                      return (
                        <th key={h} style={{ padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #e2e8f0", fontSize: 12, color: bad ? "#b91c1c" : "#475569", background: bad ? "#fef2f2" : undefined }}>{attr(h)}</th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 ? "#f8fafc" : "#fff" }}>
                      {row.map((c, j) => {
                        const bad = !!r.bad?.includes(r.head[j]);
                        return <td key={j} style={{ padding: "5px 10px", borderBottom: "1px solid #f1f5f9", color: bad ? "#b91c1c" : j === 0 ? "#0f172a" : "#475569", fontWeight: j === 0 ? 700 : 400 }}>{c}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      <Note>{zh ? "函数依赖 $X\\to Y$：任意两行在 $X$ 上相同，则在 $Y$ 上也必相同。规范化逐步消除非原子值（1NF）、部分依赖（2NF）与传递依赖（3NF），且分解保持无损连接。" : "Functional dependency $X\\to Y$: equal on $X$ ⇒ equal on $Y$. Normalization removes non-atomic values (1NF), partial (2NF) and transitive (3NF) dependencies, with lossless-join decompositions."}</Note>
    </Panel>
  );
}

const SUBS: Record<SubMode, SubDef> = {
  relationships: { title: T("联系与基数", "Relationships"), Render: RelationshipsRender, generate: relationshipsGenerate, code: REL_CODE },
  normalization: { title: T("规范化", "Normalization"), Render: NormalizationRender, generate: normalizationGenerate, code: NORM_CODE },
};

export const { module: seErModule, GROUPS: seErGroups } = makeChapter<SubMode>({
  id: "se-er",
  title: T("数据建模与 ER", "Data Modeling / ER"),
  desc: T("联系与基数 1:1/1:N/M:N、参与约束、ER 到关系模式的转换、函数依赖与 1NF/2NF/3NF/BCNF。", "Relationships & 1:1/1:N/M:N cardinality, participation, ER-to-relational mapping, functional dependencies & normal forms."),
  tags: ["software-engineering", "er"],
  groups: [
    { label: "数据建模", opts: [
      { v: "relationships", zh: "联系与基数", en: "Relationships" },
      { v: "normalization", zh: "规范化", en: "Normalization" },
    ] },
  ],
  subs: SUBS,
});
