import { T } from "../../i18n/lang";
import type { Frame } from "../../engine/types";
import { Panel, Note, isZh, makeChapter, type SubDef } from "../common/chapter";

// =====================================================================
// 软件工程 · 第6章 设计原则与模式
//   对应 tex/SoftwareEngineering/chapters/design.tex
//   patterns(观察者模式) 逐帧动画：注册 → 状态变化 → notify() → update()
// =====================================================================

type SubMode = "patterns";

type ObserverObj = { name: string; value: string; updated: boolean };
type ObserverScene = {
  step: number;
  subject: { name: string; state: string };
  observers: ObserverObj[];
  messages: string[];
};

function ObserverRender({ scene, t }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0, subject: { name: "Subject", state: "-" }, observers: [], messages: [] }) as ObserverScene;
  return (
    <Panel>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 190px", padding: "12px 16px", borderRadius: 12, background: "#eef2ff", border: "2px solid #6366f1", textAlign: "center" }}>
          <div style={{ fontWeight: 800, color: "#3730a3" }}>{s.subject.name}</div>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "#4338ca", marginTop: 4 }}>state = {s.subject.state}</div>
        </div>
        <div style={{ display: "grid", gap: 8, flex: "1 1 190px" }}>
          {s.observers.map((o) => (
            <div key={o.name} style={{ padding: "8px 14px", borderRadius: 10, background: o.updated ? "#dcfce7" : "#f8fafc", border: `2px solid ${o.updated ? "#16a34a" : "#cbd5e1"}`, transition: "all .2s" }}>
              <div style={{ fontWeight: 800, color: "#1e293b" }}>{o.name}</div>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#475569" }}>value = {o.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, background: "#0f172a", color: "#e2e8f0", padding: 12, borderRadius: 10, lineHeight: 1.9 }}>
        {s.messages.length === 0 && <div style={{ color: "#94a3b8" }}>{zh ? "（尚无消息）" : "(no messages yet)"}</div>}
        {s.messages.map((m, i) => <div key={i} style={{ color: i === s.messages.length - 1 ? "#7dd3fc" : "#cbd5e1" }}>{m}</div>)}
      </div>
      <Note>{zh ? "观察者模式：主题（Subject）持有观察者列表，状态变化时 $notify()$ 逐一调用 $update()$，实现一对多、松耦合的事件通知。" : "Observer pattern: the Subject keeps a list of observers; on state change $notify()$ calls $update()$ on each — a one-to-many, loosely coupled event notification."}</Note>
    </Panel>
  );
}

function observerGenerate(_config: any): Frame<ObserverScene>[] {
  const A0: ObserverObj = { name: "ObserverA", value: "-", updated: false };
  const B0: ObserverObj = { name: "ObserverB", value: "-", updated: false };
  const A1: ObserverObj = { name: "ObserverA", value: "42", updated: true };
  const B1: ObserverObj = { name: "ObserverB", value: "42", updated: true };
  const subj0 = { name: "Subject", state: "-" };
  const subj1 = { name: "Subject", state: "42" };
  return [
    { line: 0, caption: T("Subject 注册 ObserverA：$attach()$ 加入观察者列表", "Subject registers ObserverA via $attach()$"), scene: { step: 0, subject: subj0, observers: [A0, B0], messages: ["attach(ObserverA)"] } },
    { line: 0, caption: T("再注册 ObserverB，列表中现有两个观察者", "register ObserverB; the list now holds two observers"), scene: { step: 1, subject: subj0, observers: [A0, B0], messages: ["attach(ObserverA)", "attach(ObserverB)"] } },
    { line: 1, caption: T("主题状态改变：$state \\gets 42$", "subject state changes: $state \\gets 42$"), scene: { step: 2, subject: subj1, observers: [A0, B0], messages: ["setState(42)"] } },
    { line: 2, caption: T("$notify()$：主题向列表内每个观察者发出通知", "$notify()$: subject notifies every observer in its list"), scene: { step: 3, subject: subj1, observers: [A0, B0], messages: ["notify() → ObserverA", "notify() → ObserverB"] } },
    { line: 3, caption: T("每个观察者执行 $update()$，拉取新状态", "each observer runs $update()$ to pull the new state"), scene: { step: 4, subject: subj1, observers: [A1, B1], messages: ["ObserverA.update()", "ObserverB.update()"] } },
    { line: 4, caption: T("观察者同步完成：$value \\gets 42$，一对多通知结束", "observers synced: $value \\gets 42$; the one-to-many update completes"), scene: { step: 5, subject: subj1, observers: [A1, B1], messages: ["ObserverA.value = 42", "ObserverB.value = 42"] } },
  ];
}

const OBSERVER_CODE = [
  T("subject.attach(obs)", "subject.attach(obs)"),
  T("subject.setState(newValue)", "subject.setState(newValue)"),
  T("subject.notify()", "subject.notify()"),
  T("obs.update(subject)", "obs.update(subject)"),
  T("observer.value = subject.state", "observer.value = subject.state"),
];

const SUBS: Record<SubMode, SubDef> = {
  patterns: { title: T("设计模式 · 观察者", "Design Patterns · Observer"), Render: ObserverRender, generate: observerGenerate, code: OBSERVER_CODE },
};

export const { module: seDesignModule, GROUPS: seDesignGroups } = makeChapter<SubMode>({
  id: "se-design",
  title: T("设计原则与模式", "Design Principles & Patterns"),
  desc: T("观察者模式：主题注册观察者、状态变化后 $notify()$ 通知，观察者 $update()$ 同步新状态。", "Observer pattern: a subject registers observers, changes state, then $notify()$es them so each $update()$s."),
  tags: ["software-engineering", "design"],
  groups: [
    { label: "设计", opts: [
      { v: "patterns", zh: "设计模式", en: "Patterns" },
    ] },
  ],
  subs: SUBS,
});
