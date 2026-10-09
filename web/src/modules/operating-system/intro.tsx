import { T, type Text } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 操作系统 · 第1章 概述与系统调用
//   对应 tex/OperatingSystem/chapters/intro.tex
//   dual-mode(逐帧) / syscall(逐帧) / interrupt(逐帧)
// =====================================================================

type SubMode = "dual-mode" | "syscall" | "interrupt";

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

// ---------------------------------------------------------------------
// dual-mode：用户态 ↔ 内核态 逐帧切换
// ---------------------------------------------------------------------
type DualScene = { mode: "user" | "kernel"; event: "app" | "trap" | "service" | "return" };

const DUAL_EVENT: Record<DualScene["event"], [string, string]> = {
  app: ["应用在用户态执行普通指令", "app runs ordinary instructions in user mode"],
  trap: ["系统调用/中断触发陷阱，CPU 切换到内核态", "syscall/interrupt traps, CPU switches to kernel mode"],
  service: ["内核态执行特权服务，访问受保护资源", "kernel mode runs a privileged service over protected resources"],
  return: ["处理完毕，切换回用户态继续执行", "done, switch back to user mode and resume"],
};

function DualModeRender({ scene, t, onNext, step, count }: any) {
  const zh = isZh(t);
  const s = (scene ?? { mode: "user", event: "app" }) as DualScene;
  const userActive = s.mode === "user";
  const canNext = !!onNext && (typeof count !== "number" || step < count - 1);
  const info = DUAL_EVENT[s.event] ?? DUAL_EVENT.app;
  const evLabel = s.event === "app" ? T("应用执行", "app runs")
    : s.event === "trap" ? T("陷入陷阱", "trap")
    : s.event === "service" ? T("内核服务", "kernel service")
    : T("返回用户态", "return");
  const nextLabel = s.event === "app" ? T("点击「应用」发起系统调用", "click app to syscall")
    : s.event === "trap" ? T("点击「内核」执行特权服务", "click kernel to run service")
    : s.event === "service" ? T("点击返回用户态", "click to return to user")
    : T("重新运行应用", "run app again");
  const modeBox = (active: boolean, kind: "user" | "kernel") => {
    const user = kind === "user";
    const bg = user ? "#dbeafe" : "#fef3c7";
    const bd = user ? (active ? "#3b82f6" : "#bfdbfe") : (active ? "#f59e0b" : "#fde68a");
    const fg = user ? "#1e3a8a" : "#92400e";
    const sub = user ? "#334155" : "#78350f";
    const clickable = active && canNext;
    return (
      <div onClick={clickable ? (e: any) => { e.stopPropagation(); onNext(); } : undefined}
        style={{ flex: "1 1 200px", padding: "14px 16px", borderRadius: 12, background: bg, border: `2px solid ${bd}`, boxShadow: active ? "0 0 0 3px rgba(59,130,246,.18)" : undefined, opacity: active ? 1 : 0.5, cursor: clickable ? "pointer" : "default" }}>
        <div style={{ fontWeight: 900, color: fg }}>{user ? (zh ? "用户态 (user mode)" : "User mode") : (zh ? "内核态 (kernel mode)" : "Kernel mode")}</div>
        <div style={{ fontSize: 12, color: sub, marginTop: 4 }}>{user ? (zh ? "应用运行，受限，不能执行特权指令" : "apps run, restricted, no privileged instructions") : (zh ? "OS 运行，可执行特权指令、访问全部资源" : "OS runs, privileged instructions, full access")}</div>
        <div style={{ marginTop: 8, display: "inline-block", padding: "4px 10px", borderRadius: 999, background: user ? "#bfdbfe" : "#fde68a", color: fg, fontSize: 12, fontWeight: 800 }}>
          {user ? (zh ? "应用 app" : "app") : (zh ? "内核 kernel" : "kernel")}{clickable ? (zh ? " · 点我推进" : " · click") : ""}
        </div>
      </div>
    );
  };
  return (
    <Panel>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", alignItems: "stretch" }}>
        {modeBox(userActive, "user")}
        {modeBox(!userActive, "kernel")}
      </div>
      <StepPanel t={t} title={t(T("状态 / 数值", "Status / Values"))}
        rows={[
          [t(T("当前模式", "Mode")), userActive ? (zh ? "用户态" : "user") : (zh ? "内核态" : "kernel")],
          [t(T("事件", "Event")), zh ? evLabel.zh : evLabel.en],
          [t(T("步骤", "Step")), `${(step ?? 0) + 1}/${count ?? 4}`],
        ]}
        onNext={onNext} showNext={canNext} nextLabel={t(nextLabel)} />
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text={zh
          ? "$\\text{用户态} \\xrightarrow{\\text{系统调用/中断/异常}} \\text{内核态} \\xrightarrow{\\text{返回}} \\text{用户态}$"
          : "$\\text{user} \\xrightarrow{\\text{syscall/irq/exception}} \\text{kernel} \\xrightarrow{\\text{return}} \\text{user}$"} />
      </div>
      <Note>{zh ? `当前事件：${info[0]}` : `Event: ${info[1]}`}</Note>
    </Panel>
  );
}
function dualModeGenerate(_config: any): Frame<DualScene>[] {
  return [
    { line: 0, caption: T("用户态：应用执行普通指令", "User mode: app runs an ordinary instruction"), scene: { mode: "user", event: "app" } },
    { line: 1, caption: T("$\\text{trap}$：系统调用/中断使 CPU 切入内核态", "$\\text{trap}$: syscall/interrupt switches CPU to kernel mode"), scene: { mode: "kernel", event: "trap" } },
    { line: 2, caption: T("内核态：执行特权服务，访问受保护资源", "Kernel mode: run privileged service over protected resources"), scene: { mode: "kernel", event: "service" } },
    { line: 3, caption: T("返回：切回用户态，应用继续执行", "Return: switch back to user mode, app resumes"), scene: { mode: "user", event: "return" } },
  ];
}
const DUAL_CODE = [
  T("user: 应用执行", "user: run app"),
  T("trap / 中断 → 内核态", "trap / interrupt → kernel"),
  T("kernel: 执行特权服务", "kernel: run privileged service"),
  T("return → 用户态", "return → user mode"),
];

// ---------------------------------------------------------------------
// syscall：陷入路径逐帧
// ---------------------------------------------------------------------
type SyscallScene = { step: number };

const SYSCALL_STEPS: { zh: [string, string]; en: [string, string] }[] = [
  { zh: ["① 用户程序", "调用库函数，如 read()，准备发起 I/O"], en: ["① App", "calls a library fn, e.g. read(), initiating I/O"] },
  { zh: ["② 库函数 libc", "把参数装入寄存器，执行 trap 指令"], en: ["② libc", "loads args into registers, executes trap"] },
  { zh: ["③ 陷入", "CPU 切到内核态，跳转系统调用入口"], en: ["③ Trap", "CPU enters kernel, jumps to syscall entry"] },
  { zh: ["④ 分发", "按系统调用号查表，定位内核服务"], en: ["④ Dispatch", "look up syscall number in the table"] },
  { zh: ["⑤ 内核服务", "执行服务，访问硬件/受保护资源"], en: ["⑤ Service", "run service, touch hardware/resources"] },
  { zh: ["⑥ 返回", "结果写回寄存器，切回用户态"], en: ["⑥ Return", "result to register, back to user mode"] },
];

function SyscallRender({ scene, t, onNext, step, count }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0 }) as SyscallScene;
  const canNext = !!onNext && (typeof count !== "number" || step < count - 1);
  const curStep = SYSCALL_STEPS[Math.max(0, Math.min(SYSCALL_STEPS.length - 1, s.step))];
  const [ca] = zh ? curStep.zh : curStep.en;
  const inKernel = s.step >= 2 && s.step < 5;
  const nextLabel = s.step >= SYSCALL_STEPS.length - 1
    ? T("重新调用 read()", "call read() again")
    : T("点击推进系统调用路径", "click to advance the syscall path");
  return (
    <Panel>
      <div style={{ display: "grid", gap: 6 }}>
        {SYSCALL_STEPS.map((st, i) => {
          const [a, b] = zh ? st.zh : st.en;
          const cur = i === s.step;
          const clickable = cur && canNext;
          return (
            <div key={i} onClick={clickable ? (e: any) => { e.stopPropagation(); onNext(); } : undefined}
              style={{ display: "flex", gap: 12, padding: "8px 14px", borderRadius: 10, background: cur ? "#eef2ff" : "#f8fafc", border: `1px solid ${cur ? "#c7d2fe" : "#e2e8f0"}`, opacity: i <= s.step ? 1 : 0.45, cursor: clickable ? "pointer" : "default" }}>
              <span style={{ fontWeight: 800, color: cur ? "#4338ca" : "#3730a3", width: 96, flexShrink: 0 }}>{a}</span>
              <span style={{ fontSize: 13, color: "#334155" }}>{b}</span>
              {clickable && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#4338ca", whiteSpace: "nowrap" }}>{zh ? "点我推进" : "click"}</span>}
            </div>
          );
        })}
      </div>
      <StepPanel t={t} title={t(T("状态 / 数值", "Status / Values"))}
        rows={[
          [t(T("步骤", "Step")), `${s.step + 1}/${SYSCALL_STEPS.length}`],
          [t(T("阶段", "Phase")), ca],
          [t(T("模式", "Mode")), inKernel ? (zh ? "内核态" : "kernel") : (zh ? "用户态" : "user")],
          [t(T("系统调用号", "Syscall no")), "rax = read"],
        ]}
        onNext={onNext} showNext={canNext} nextLabel={t(nextLabel)} />
      <div style={{ textAlign: "center", fontSize: 13, fontFamily: "ui-monospace, monospace", color: "#475569" }}>
        <MathText text={zh ? "参数经寄存器：$\\text{rax}=\\text{调用号},\\ \\text{rdi},\\ \\text{rsi},\\ \\text{rdx}$" : "args via registers: $\\text{rax}=\\text{syscall\\_no},\\ \\text{rdi},\\ \\text{rsi},\\ \\text{rdx}$"} />
      </div>
      <Table
        head={zh ? ["类别", "系统调用", "作用"] : ["Class", "Calls", "Purpose"]}
        rows={zh
          ? [["进程控制", "fork, exec, exit, wait", "创建/替换/终止/等待进程"], ["文件", "open, read, write, close", "文件 I/O"], ["设备", "ioctl, mmap", "设备控制与映射"], ["信息", "getpid, time", "获取系统信息"], ["通信", "pipe, socket", "进程间通信"]]
          : [["Process", "fork, exec, exit, wait", "create/replace/terminate/wait"], ["File", "open, read, write, close", "file I/O"], ["Device", "ioctl, mmap", "device control/map"], ["Info", "getpid, time", "system info"], ["IPC", "pipe, socket", "inter-process communication"]]} />
      <Note>{zh ? "系统调用是受控入口：参数与编号经寄存器传递，内核校验后执行，避免用户直接触碰硬件。" : "Syscalls are the controlled entry: args/number via registers, validated in kernel, so user code never touches hardware directly."}</Note>
    </Panel>
  );
}
function syscallGenerate(_config: any): Frame<SyscallScene>[] {
  const caps: [string, string][] = [
    ["用户程序调用库函数，如 read()", "app calls a library fn, e.g. read()"],
    ["libc 把参数装入寄存器并执行 trap 指令", "libc loads args into registers and executes trap"],
    ["CPU 切入内核态，跳转系统调用入口", "CPU enters kernel mode, jumps to syscall entry"],
    ["按系统调用号查表分发到内核服务", "dispatch to the kernel service by syscall number"],
    ["内核执行服务，访问设备/受保护资源", "kernel runs the service over devices/resources"],
    ["结果写回寄存器，切回用户态继续执行", "result written to register, back to user mode"],
  ];
  return caps.map(([zh, en], i) => ({ line: i, caption: T(zh, en), scene: { step: i } }));
}
const SYSCALL_CODE = [
  T("app: read(fd, buf, n)", "app: read(fd, buf, n)"),
  T("libc: 参数装入寄存器", "libc: load args into regs"),
  T("trap: 切入内核态", "trap: enter kernel mode"),
  T("dispatch: 按调用号查表", "dispatch: index by syscall no"),
  T("service: 执行内核服务", "service: run kernel service"),
  T("return: 结果回写并返回", "return: write result, back to user"),
];

// ---------------------------------------------------------------------
// interrupt：保存现场 → 查向量 → 处理 → 恢复 逐帧
// ---------------------------------------------------------------------
type IrqScene = { step: number };

const IRQ_STEPS: { zh: [string, string]; en: [string, string] }[] = [
  { zh: ["① 中断请求", "设备发出 IRQ，CPU 在完成当前指令后响应"], en: ["① IRQ", "device raises IRQ, CPU responds after current instruction"] },
  { zh: ["② 保存现场", "保存 PC 与寄存器，避免被处理程序覆盖"], en: ["② Save", "save PC and registers so the ISR can't clobber them"] },
  { zh: ["③ 查向量表", "按中断号查向量表，定位处理程序入口"], en: ["③ Vector", "look up the vector table by IRQ number"] },
  { zh: ["④ 处理", "执行设备/内核处理逻辑（ISR）"], en: ["④ Handle", "run the device/kernel ISR logic"] },
  { zh: ["⑤ 恢复现场", "恢复寄存器与 PC，返回被中断的指令"], en: ["⑤ Restore", "restore registers & PC, resume interrupted instruction"] },
];

function InterruptRender({ scene, t, onNext, step, count }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0 }) as IrqScene;
  const canNext = !!onNext && (typeof count !== "number" || step < count - 1);
  const curStep = IRQ_STEPS[Math.max(0, Math.min(IRQ_STEPS.length - 1, s.step))];
  const [ca] = zh ? curStep.zh : curStep.en;
  const saved = s.step >= 1 && s.step < 4;
  const deviceClickable = s.step === 0 && canNext;
  const nextLabel = deviceClickable
    ? T("点击「设备」发出中断", "click device to raise IRQ")
    : s.step >= IRQ_STEPS.length - 1
      ? T("重新触发中断", "raise IRQ again")
      : T("点击推进中断处理", "click to advance the ISR");
  const rows: React.ReactNode[][] = zh
    ? [
      ["中断 Interrupt", "异步、外部设备", "时钟、网卡、键盘", "抢占式调度的基础"],
      ["异常 Exception", "同步、当前指令", "除零、缺页、非法指令", "可能需内核修复或终止进程"],
      ["陷阱 Trap", "同步、主动请求", "系统调用", "进入内核的合法途径"],
    ]
    : [
      ["Interrupt", "async, external device", "timer, NIC, keyboard", "basis of preemptive scheduling"],
      ["Exception", "sync, current instruction", "divide-by-zero, page fault", "kernel fixes or kills process"],
      ["Trap", "sync, voluntary", "system call", "legal gateway into kernel"],
    ];
  return (
    <Panel>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div onClick={deviceClickable ? (e: any) => { e.stopPropagation(); onNext(); } : undefined}
          style={{ padding: "10px 18px", borderRadius: 12, background: deviceClickable ? "#fde68a" : "#f8fafc", border: `2px solid ${deviceClickable ? "#f59e0b" : "#e2e8f0"}`, fontWeight: 800, color: "#92400e", fontSize: 13, cursor: deviceClickable ? "pointer" : "default" }}>
          {zh ? "设备 device · 发出 IRQ" : "device · raise IRQ"}{deviceClickable ? (zh ? " · 点我触发" : " · click") : ""}
        </div>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {IRQ_STEPS.map((st, i) => {
          const [a, b] = zh ? st.zh : st.en;
          const cur = i === s.step;
          const clickable = cur && canNext;
          return (
            <div key={i} onClick={clickable ? (e: any) => { e.stopPropagation(); onNext(); } : undefined}
              style={{ display: "flex", gap: 12, padding: "8px 14px", borderRadius: 10, background: cur ? "#eef2ff" : "#f8fafc", border: `1px solid ${cur ? "#c7d2fe" : "#e2e8f0"}`, opacity: i <= s.step ? 1 : 0.45, cursor: clickable ? "pointer" : "default" }}>
              <span style={{ fontWeight: 800, color: cur ? "#4338ca" : "#3730a3", width: 96, flexShrink: 0 }}>{a}</span>
              <span style={{ fontSize: 13, color: "#334155" }}>{b}</span>
              {clickable && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#4338ca", whiteSpace: "nowrap" }}>{zh ? "点我推进" : "click"}</span>}
            </div>
          );
        })}
      </div>
      <StepPanel t={t} title={t(T("状态 / 数值", "Status / Values"))}
        rows={[
          [t(T("步骤", "Step")), `${s.step + 1}/${IRQ_STEPS.length}`],
          [t(T("阶段", "Phase")), ca],
          [t(T("现场", "Context")), saved ? (zh ? "已保存" : "saved") : (zh ? "未保存" : "—")],
          [t(T("T_context", "T_context")), "T_save + T_dispatch + T_restore"],
        ]}
        onNext={onNext} showNext={canNext} nextLabel={t(nextLabel)} />
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$T_{context} = T_{save} + T_{dispatch} + T_{restore}$" />
      </div>
      <Note>{zh ? "上下文切换本身不做有用功，却要付出保存/恢复现场的开销；中断越频繁，这项固定成本占比越高。" : "A context switch does no useful work yet pays the save/restore cost; more frequent interrupts mean a larger fixed overhead."}</Note>
      <Table head={zh ? ["类型", "来源", "例子", "说明"] : ["Type", "Source", "Examples", "Note"]} rows={rows} />
    </Panel>
  );
}
function interruptGenerate(_config: any): Frame<IrqScene>[] {
  const caps: [string, string][] = [
    ["设备发出中断请求 IRQ，CPU 响应", "device raises IRQ, CPU responds"],
    ["保存 PC 与寄存器（保存现场）", "save PC and registers"],
    ["按中断号查向量表，定位处理程序", "look up the vector table by IRQ number"],
    ["执行设备/内核处理逻辑", "run the device/kernel handler"],
    ["恢复寄存器与 PC，返回被中断指令", "restore registers & PC, resume interrupted instruction"],
  ];
  return caps.map(([zh, en], i) => ({ line: i, caption: T(zh, en), scene: { step: i } }));
}
const INTERRUPT_CODE = [
  T("raise: 设备发出 IRQ", "raise: device IRQ"),
  T("save: 保存 PC + 寄存器", "save: PC + registers"),
  T("vector: 查中断向量表", "vector: look up ISR entry"),
  T("handle: 执行处理程序", "handle: run the ISR"),
  T("restore: 恢复现场并返回", "restore: resume interrupted code"),
];

const SUBS: Record<SubMode, SubDef> = {
  "dual-mode": { title: T("双模式", "Dual Mode"), Render: DualModeRender, generate: dualModeGenerate, code: DUAL_CODE },
  syscall: { title: T("系统调用", "System Calls"), Render: SyscallRender, generate: syscallGenerate, code: SYSCALL_CODE },
  interrupt: { title: T("中断与异常", "Interrupts"), Render: InterruptRender, generate: interruptGenerate, code: INTERRUPT_CODE },
};

export const { module: osIntroModule, GROUPS: osIntroGroups } = makeChapter<SubMode>({
  id: "os-overview",
  title: T("操作系统概述", "OS Overview"),
  desc: T("内核结构、用户态/内核态双模式、系统调用陷入路径、中断/异常/陷阱与上下文切换开销。", "Kernel structures, dual mode, syscall trap path, interrupts/exceptions/traps, context-switch cost."),
  tags: ["operating-system", "intro"],
  groups: [
    { label: "概述", opts: [
      { v: "dual-mode", zh: "双模式", en: "Dual Mode" },
      { v: "syscall", zh: "系统调用", en: "System Calls" },
      { v: "interrupt", zh: "中断与异常", en: "Interrupts" },
    ] },
  ],
  subs: SUBS,
});
