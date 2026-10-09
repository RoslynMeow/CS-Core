import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, TextField, Row, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 操作系统 · 保护与安全
//   对应 tex/OperatingSystem/chapters/protection.tex
//   access-control(访问矩阵 / ACL / 能力表，逐帧判定)
//   permissions(UNIX rwx 与八进制权限，逐帧判定)
// =====================================================================

type SubMode = "access-control" | "permissions";

// ---------------------------------------------------------------------
// access-control (逐帧动画：主体请求 → 查访问矩阵 → ACL/能力视角 → 判定)
// ---------------------------------------------------------------------
const AC_SUBJECTS = [
  { id: "A", zh: "用户 A", en: "User A" },
  { id: "B", zh: "用户 B", en: "User B" },
  { id: "admin", zh: "管理员", en: "Admin" },
] as const;

const AC_OBJECTS = [
  { id: "F1", zh: "文件 F₁", en: "File F₁" },
  { id: "F2", zh: "文件 F₂", en: "File F₂" },
  { id: "P", zh: "打印机 P", en: "Printer P" },
] as const;

const AC_RIGHTS: Record<string, Record<string, string[]>> = {
  A: { F1: ["read", "write"], F2: ["read"], P: [] },
  B: { F1: ["read"], F2: [], P: ["print"] },
  admin: { F1: ["read", "write", "execute"], F2: ["read", "write", "execute"], P: ["print", "configure"] },
};

const AC_OP: Record<string, { zh: string; en: string }> = {
  read: { zh: "读", en: "read" },
  write: { zh: "写", en: "write" },
  execute: { zh: "执行", en: "execute" },
  print: { zh: "打印", en: "print" },
  configure: { zh: "配置", en: "configure" },
};

type AcScene = { subject: string; object: string; op: string; allowed: boolean; step: number };

function acName(id: string, zh: boolean): string {
  const hit = AC_SUBJECTS.find((x) => x.id === id) ?? AC_OBJECTS.find((x) => x.id === id);
  return hit ? (zh ? hit.zh : hit.en) : id;
}

function acRights(subject: string, object: string, zh: boolean): string {
  const rs = AC_RIGHTS[subject]?.[object] ?? [];
  return rs.length ? rs.map((r) => (zh ? AC_OP[r]?.zh : AC_OP[r]?.en) ?? r).join(" / ") : "—";
}

function acHighlight(on: boolean) {
  return on
    ? { background: "#eef2ff", color: "#4338ca", fontWeight: 800, borderRadius: 6, padding: "1px 6px", display: "inline-block" as const }
    : undefined;
}

function AccessControlRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? { subject: "B", object: "F1", op: "write", allowed: false, step: 3 }) as AcScene;
  const subLabel = acName(s.subject, zh);
  const objLabel = acName(s.object, zh);
  const opLabel = (zh ? AC_OP[s.op]?.zh : AC_OP[s.op]?.en) ?? s.op;
  const consulted = s.step >= 1;
  const showViews = s.step >= 2;
  const verdict = s.step >= 3;
  const stage = s.step;

  const matrixHead = [zh ? "主体 \\ 客体" : "Subject \\ Object", ...AC_OBJECTS.map((o) => (zh ? o.zh : o.en))];
  const matrixRows: React.ReactNode[][] = AC_SUBJECTS.map((sub) => {
    const rowHi = consulted && sub.id === s.subject;
    return [
      <span style={acHighlight(rowHi)}>{zh ? sub.zh : sub.en}</span>,
      ...AC_OBJECTS.map((obj) => <span style={acHighlight(rowHi && obj.id === s.object)}>{acRights(sub.id, obj.id, zh)}</span>),
    ];
  });

  const aclRows: React.ReactNode[][] = AC_SUBJECTS.map((sub) => [
    <span style={acHighlight(sub.id === s.subject)}>{zh ? sub.zh : sub.en}</span>,
    <span style={acHighlight(sub.id === s.subject)}>{acRights(sub.id, s.object, zh)}</span>,
  ]);
  const capRows: React.ReactNode[][] = AC_OBJECTS.map((obj) => [
    <span style={acHighlight(obj.id === s.object)}>{zh ? obj.zh : obj.en}</span>,
    <span style={acHighlight(obj.id === s.object)}>{acRights(s.subject, obj.id, zh)}</span>,
  ]);

  const stages: [string, string][] = zh
    ? [
      ["① 请求", `${subLabel} → ${opLabel} → ${objLabel}`],
      ["② 查矩阵", `M[${subLabel}][${objLabel}]`],
      ["③ 视角", "按列 = ACL；按行 = 能力表"],
      ["④ 判定", s.allowed ? "允许" : "拒绝 EACCES"],
    ]
    : [
      ["① Request", `${subLabel} → ${opLabel} → ${objLabel}`],
      ["② Lookup", `M[${subLabel}][${objLabel}]`],
      ["③ View", "column = ACL; row = capability"],
      ["④ Verdict", s.allowed ? "allow" : "deny EACCES"],
    ];

  return (
    <Panel>
      <Row>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#3730a3" }}>{zh ? "请求" : "Request"}</span>
        <span style={{ fontSize: 14, fontFamily: "ui-monospace, monospace", color: "#334155" }}>
          <b>{subLabel}</b> → <b>{opLabel}</b> → <b>{objLabel}</b>
        </span>
      </Row>
      <Table head={matrixHead} rows={matrixRows} />
      {showViews && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#4338ca" }}>{zh ? `ACL：谁能访问 ${objLabel}` : `ACL: who can access ${objLabel}`}</div>
            <Table head={zh ? ["主体", "权利"] : ["Subject", "Rights"]} rows={aclRows} />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#4338ca" }}>{zh ? `能力表：${subLabel} 能访问什么` : `Capabilities: what ${subLabel} can access`}</div>
            <Table head={zh ? ["客体", "权利"] : ["Object", "Rights"]} rows={capRows} />
          </div>
        </div>
      )}
      <div style={{ display: "grid", gap: 6 }}>
        {stages.map(([a, b], i) => {
          const cur = i === stage && stage < 3;
          return (
            <div key={a} style={{ display: "flex", gap: 12, padding: "9px 14px", borderRadius: 10, background: cur ? "#eef2ff" : "#f8fafc", border: `1px solid ${cur ? "#c7d2fe" : "#e2e8f0"}`, opacity: i <= stage || stage >= 3 ? 1 : 0.45 }}>
              <span style={{ fontWeight: 800, color: cur ? "#4338ca" : "#3730a3", width: 96 }}>{a}</span>
              <span style={{ fontSize: 13, color: "#334155" }}>{b}</span>
            </div>
          );
        })}
      </div>
      {verdict && (
        <div style={{ textAlign: "center", padding: "8px 14px", borderRadius: 10, fontWeight: 800, fontSize: 14, background: s.allowed ? "#dcfce7" : "#fee2e2", color: s.allowed ? "#166534" : "#b91c1c" }}>
          {s.allowed ? (zh ? "允许：操作放行，返回 0" : "Allow: access granted, returns 0") : (zh ? "拒绝：返回 EACCES" : "Deny: returns EACCES")}
        </div>
      )}
      <Note tone={verdict && !s.allowed ? "warn" : "info"}>
        {zh
          ? "访问矩阵通常稀疏：按列拆成 ACL（客体为中心，权限易撤销），按行拆成能力表（主体为中心，权限可传递）。二者是同一矩阵的两种存储视角。"
          : "The matrix is usually sparse: by column it is an ACL (object-centric, easy revocation), by row a capability list (subject-centric, delegatable). Both are two views of one matrix."}
      </Note>
    </Panel>
  );
}

const AC_CODE = [
  T("主体 $s$ 请求对客体 $o$ 执行 $op$", "subject $s$ requests $op$ on object $o$"),
  T("查访问矩阵 $M[s][o]$", "index the matrix $M[s][o]$"),
  T("按列读作 $ACL$，按行读作能力表", "column → $ACL$, row → capability list"),
  T("$op \\in M[s][o]$ 则允许，否则 $EACCES$", "$op \\in M[s][o]$ ⇒ allow, else $EACCES$"),
];

function accessControlGenerate(_config: any): Frame<AcScene>[] {
  const subject = "B";
  const object = "F1";
  const op = "write";
  const allowed = (AC_RIGHTS[subject]?.[object] ?? []).includes(op);
  const base: AcScene = { subject, object, op, allowed, step: 0 };
  return [
    { line: 0, caption: T("用户 B 请求对 文件 F₁ 执行写", "User B requests write on File F₁"), scene: { ...base, step: 0 } },
    { line: 1, caption: T("查访问矩阵 $M[s][o]$", "index the matrix $M[s][o]$"), scene: { ...base, step: 1 } },
    { line: 2, caption: T("按列 = $ACL$，按行 = 能力表：同一矩阵两种视角", "column = $ACL$, row = capability: one matrix, two views"), scene: { ...base, step: 2 } },
    { line: 3, caption: allowed ? T("$op \\in M[s][o]$：允许", "$op \\in M[s][o]$: allow") : T("$op \\notin M[s][o]$：拒绝 $EACCES$", "$op \\notin M[s][o]$: deny $EACCES$"), scene: { ...base, step: 3 } },
  ];
}

// ---------------------------------------------------------------------
// permissions (逐帧动画：请求 → 主体类别 → rwx 三位 → 判定)
// ---------------------------------------------------------------------
const PERM_DEFAULT = { perm: "754" };

function parseDigit(d: number) {
  return (d & 4 ? "r" : "-") + (d & 2 ? "w" : "-") + (d & 1 ? "x" : "-");
}

function opsOf(d: number, zh: boolean) {
  const out: string[] = [];
  if (d & 4) out.push(zh ? "读" : "read");
  if (d & 2) out.push(zh ? "写" : "write");
  if (d & 1) out.push(zh ? "执行" : "execute");
  return out.length ? out.join(" / ") : zh ? "无" : "none";
}

type PermWho = "owner" | "group" | "other";
type PermOp = "r" | "w" | "x";

type PermScene = {
  mode: string;
  op: PermOp;
  who: PermWho;
  bits: string;
  allowed: boolean;
  step: number;
  special?: number | null;
  flags?: string[];
  bad?: boolean;
};

const OP_META: Record<PermOp, { bit: number; zh: string; en: string }> = {
  r: { bit: 4, zh: "读", en: "read" },
  w: { bit: 2, zh: "写", en: "write" },
  x: { bit: 1, zh: "执行", en: "execute" },
};
const WHO_META: Record<PermWho, { zh: string; en: string }> = {
  owner: { zh: "属主", en: "owner" },
  group: { zh: "同组", en: "group" },
  other: { zh: "其他", en: "other" },
};

function permGenerate(config: any): Frame<PermScene>[] {
  const raw = String(config.perm ?? "");
  const valid = /^[0-7]{3,4}$/.test(raw);
  const base: PermScene = { mode: raw, op: "r", who: "owner", bits: "---", allowed: false, step: 0 };
  if (!valid) {
    return [{ line: 0, caption: T("! 权限位非法：应为 3–4 位八进制（每位 0–7）", "! Invalid mode: expect 3–4 octal digits (each 0–7)"), scene: { ...base, bad: true } }];
  }
  const special = raw.length === 4 ? Number(raw[0]) : null;
  const digits = raw.slice(-3).split("").map(Number);
  const flags = special === null
    ? []
    : [special & 4 ? "setuid" : "", special & 2 ? "setgid" : "", special & 1 ? "sticky" : ""].filter(Boolean);
  const reqs: { who: PermWho; op: PermOp }[] = [
    { who: "owner", op: "x" },
    { who: "group", op: "w" },
    { who: "other", op: "r" },
  ];
  const frames: Frame<PermScene>[] = [];
  reqs.forEach(({ who, op }, i) => {
    const d = digits[i];
    const bits = parseDigit(d);
    const allowed = (d & OP_META[op].bit) !== 0;
    const scene: PermScene = { mode: raw, who, op, bits, allowed, step: 1, special, flags };
    if (i === 0) {
      const caption = special !== null
        ? T(`解析八进制 ${raw}：特殊位 ${special}${flags.length ? "（" + flags.join("/") + "）" : ""}`, `parse octal ${raw}: special digit ${special}${flags.length ? " (" + flags.join("/") + ")" : ""}`)
        : T(`解析八进制 ${raw}`, `parse octal ${raw}`);
      frames.push({ line: 0, caption, scene: { ...scene, step: 0 } });
    }
    frames.push({ line: 1, caption: T(`确定主体类别：${WHO_META[who].zh}`, `determine subject class: ${WHO_META[who].en}`), scene });
    frames.push({ line: 2, caption: T(`取出 ${WHO_META[who].zh} 的三位：${bits}`, `take ${WHO_META[who].en}'s three bits: ${bits}`), scene: { ...scene, step: 2 } });
    frames.push({ line: 3, caption: T(`检查${OP_META[op].zh}位 $${OP_META[op].bit} \\to ${allowed ? "1" : "0"}$`, `test ${OP_META[op].en} bit $${OP_META[op].bit} \\to ${allowed ? "1" : "0"}$`), scene: { ...scene, step: 3 } });
    frames.push({ line: 4, caption: allowed ? T(`${WHO_META[who].zh}${OP_META[op].zh}：允许 (0)`, `${WHO_META[who].en} ${OP_META[op].en}: allowed (0)`) : T(`${WHO_META[who].zh}${OP_META[op].zh}：拒绝 $EACCES$`, `${WHO_META[who].en} ${OP_META[op].en}: denied $EACCES$`), scene: { ...scene, step: 4 } });
  });
  return frames;
}

const PERM_CODE = [
  T("解析八进制 $mode$ 与请求 $(who,op)$", "parse octal $mode$ and request $(who, op)$"),
  T("按 属主 → 同组 → 其他 定位主体类别", "locate class: owner → group → other"),
  T("取出该类别的三位 $rwx$", "take that class's $rwx$ bits"),
  T("检查所需位 $r{=}4,\\ w{=}2,\\ x{=}1$", "test needed bit $r{=}4,\\ w{=}2,\\ x{=}1$"),
  T("位为 1 允许；否则 $EACCES$", "bit set → allow; else $EACCES$"),
];

function PermissionsControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <TextField label={zh ? "八进制权限" : "Octal mode"} value={config.perm} onChange={(v: string) => onChange({ ...config, perm: v })} width={120} placeholder="754" />
      <span style={{ fontSize: 11, color: "#94a3b8" }}>{zh ? "3 或 4 位，每位 0–7" : "3 or 4 digits, each 0–7"}</span>
    </div>
  );
}

function PermissionsRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? { mode: "754" }) as PermScene;
  const raw = String(s.mode ?? "");
  const valid = /^[0-7]{3,4}$/.test(raw);

  if (s.bad || !valid) {
    return (
      <Panel>
        <Row>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#b45309" }}>{zh ? "非法输入" : "Invalid input"}</span>
          <span style={{ fontSize: 20, fontWeight: 900, color: "#b45309", fontFamily: "ui-monospace, monospace" }}>{raw || "∅"}</span>
        </Row>
        <Note tone="warn">
          {zh
            ? "权限必须是 3 位或 4 位的八进制数（每位 0–7）。例如 rwxr-xr-- = 754，带 setuid 则形如 4755。"
            : "Mode must be a 3- or 4-digit octal number (each digit 0–7). e.g. rwxr-xr-- = 754; with setuid it looks like 4755."}
        </Note>
      </Panel>
    );
  }

  const special = raw.length === 4 ? Number(raw[0]) : null;
  const digits = raw.slice(-3).split("").map(Number);
  const [u, g, o] = digits;
  const classes = zh ? ["属主 owner", "同组 group", "其他 other"] : ["Owner", "Group", "Other"];
  const clsIndex = s.who === "group" ? 1 : s.who === "other" ? 2 : 0;

  const rows: React.ReactNode[][] = digits.map((d, i) => {
    const cur = i === clsIndex;
    const st = cur
      ? { background: "#eef2ff", color: "#4338ca", fontWeight: 700, borderRadius: 6, padding: "1px 6px", display: "inline-block" }
      : undefined;
    return [
      <span style={st}>{classes[i]}</span>,
      <span style={st}>{String(d)}</span>,
      <span style={st}>{parseDigit(d)}</span>,
      <span style={st}>{opsOf(d, zh)}</span>,
    ];
  });

  const specialFlags = special === null
    ? []
    : [
      special & 4 ? "setuid" : "",
      special & 2 ? "setgid" : "",
      special & 1 ? "sticky" : "",
    ].filter(Boolean);

  const op = OP_META[s.op] ?? OP_META.r;
  const step = s.step ?? 4;
  const stage = step - 1;
  const stages: [string, string][] = zh
    ? [
      ["① 主体类别", classes[clsIndex]],
      ["② 三位权限", s.bits],
      ["③ 所需位", `${op.zh} = ${op.bit} → ${s.allowed ? "1" : "0"}`],
      ["④ 判定", s.allowed ? "允许 (0)" : "拒绝 EACCES"],
    ]
    : [
      ["① Class", classes[clsIndex]],
      ["② Three bits", s.bits],
      ["③ Needed bit", `${op.en} = ${op.bit} → ${s.allowed ? "1" : "0"}`],
      ["④ Verdict", s.allowed ? "allowed (0)" : "denied EACCES"],
    ];

  return (
    <Panel>
      <Row>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#3730a3" }}>{zh ? "符号表示" : "Symbolic"}</span>
        <span style={{ fontSize: 20, fontWeight: 900, color: "#4338ca", fontFamily: "ui-monospace, monospace" }}>
          {parseDigit(u) + parseDigit(g) + parseDigit(o)}
        </span>
        <span style={{ fontSize: 14, color: "#64748b", fontFamily: "ui-monospace, monospace" }}>
          = {raw}
          {specialFlags.length ? ` (${specialFlags.join(", ")})` : ""}
        </span>
      </Row>
      <Table
        head={zh ? ["类别", "八进制", "rwx", "允许操作"] : ["Class", "Octal", "rwx", "Allowed"]}
        rows={rows}
      />
      {special !== null && (
        <Note>
          {zh
            ? `特殊位 ${special}：${specialFlags.length ? specialFlags.join(" / ") : "无"}。setuid 让程序以属主身份运行，sticky 使目录中只有属主可删除自己的文件。`
            : `Special digit ${special}: ${specialFlags.length ? specialFlags.join(" / ") : "none"}. setuid runs the program as the owner; sticky lets only owners delete their files in a directory.`}
        </Note>
      )}
      <div style={{ fontSize: 12, fontWeight: 800, color: "#4338ca", padding: "2px 4px" }}>
        {zh ? `访问判定：${classes[clsIndex]} 请求 ${op.zh} 文件` : `Access check: ${classes[clsIndex]} requests ${op.en}`}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {stages.map(([a, b], i) => {
          const cur = i === stage;
          const done = i < stage;
          return (
            <div key={a} style={{ display: "flex", gap: 12, padding: "9px 14px", borderRadius: 10, background: cur ? "#eef2ff" : "#f8fafc", border: `1px solid ${cur ? "#c7d2fe" : "#e2e8f0"}`, opacity: cur || done || stage < 0 ? 1 : 0.45 }}>
              <span style={{ fontWeight: 800, color: cur ? "#4338ca" : "#3730a3", width: 96 }}>{a}</span>
              <span style={{ fontSize: 13, color: "#334155" }}>{b}</span>
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={zh
          ? `$mode = 4\\text{属主} + 2\\text{组} + 1\\text{其他},\\quad r{=}4\\ w{=}2\\ x{=}1$`
          : `$mode = 4\\cdot u + 2\\cdot g + 1\\cdot o,\\quad r{=}4\\ w{=}2\\ x{=}1$`} />
      </div>
      <Note tone={step >= 4 && !s.allowed ? "warn" : "info"}>
        {step < 4
          ? (zh ? "内核按 属主 → 同组 → 其他 定位第一类权限，再检查所需位。" : "The kernel locates the first applicable class owner → group → other, then tests the needed bit.")
          : s.allowed
            ? (zh ? "对应位为 1，操作放行，返回 0。" : "The needed bit is set, access granted, returns 0.")
            : (zh ? "对应位为 0，open/exec 返回 EACCES（Permission denied）。" : "The needed bit is 0, open/exec returns EACCES (Permission denied).")}
      </Note>
    </Panel>
  );
}

const SUBS: Record<SubMode, SubDef> = {
  "access-control": { title: T("访问控制", "Access Control"), Render: AccessControlRender, generate: accessControlGenerate, code: AC_CODE },
  permissions: { title: T("权限位", "Permissions"), defaultConfig: PERM_DEFAULT, Controls: PermissionsControls, Render: PermissionsRender, generate: permGenerate, code: PERM_CODE },
};

export const { module: osProtectionModule, GROUPS: osProtectionGroups } = makeChapter<SubMode>({
  id: "os-protection",
  title: T("保护与安全", "Protection & Security"),
  desc: T("保护域与访问矩阵、ACL 与能力表、UNIX rwx 权限位与八进制表示、setuid/sticky。", "Protection domains & access matrix, ACL vs capability list, UNIX rwx mode bits & octal notation, setuid/sticky."),
  tags: ["operating-system", "protection"],
  groups: [
    { label: "保护", opts: [
      { v: "access-control", zh: "访问控制", en: "Access Control" },
      { v: "permissions", zh: "权限位", en: "Permissions" },
    ] },
  ],
  subs: SUBS,
});
