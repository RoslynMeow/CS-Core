import { createElement } from "react";
import type { ModuleDef } from "../engine/types";
import { T, type Text } from "../i18n/lang";

import { dataUnifiedModule, GROUPS as dataGroups } from "./data/unified";
import { storageUnifiedModule, GROUPS as storageGroups } from "./storage/unified";
import { treeUnifiedModule, GROUPS as treeGroups } from "./tree/unified";
import { graphUnifiedModule, GROUPS as graphGroups } from "./graph/unified";
import { arrayUnifiedModule, GROUPS as arrayGroups } from "./array/unified";
import { raceModule } from "./array/compare";
import { algorithmAnalysisModule, GROUPS as analysisGroups } from "./data-structures/algorithmAnalysis";
import { classicAlgorithmsModule, GROUPS as classicGroups } from "./data-structures/classicAlgorithms";
import { introModule, GROUPS as introGroups } from "./computer-organization/intro";
import { digitalLogicModule, GROUPS as digitalGroups } from "./computer-organization/digitalLogic";
import { instructionSetModule, GROUPS as isaGroups } from "./computer-organization/instructionSet";
import { cpuDatapathModule, GROUPS as datapathGroups } from "./computer-organization/cpuDatapath";
import { cpuControlModule, GROUPS as controlGroups } from "./computer-organization/cpuControl";
import { pipelineModule, GROUPS as pipelineGroups } from "./computer-organization/pipeline";
import { memoryHierarchyModule, GROUPS as memoryGroups } from "./computer-organization/memory";
import { ioBusModule, GROUPS as ioGroups } from "./computer-organization/ioBus";
import { cProgrammingModule, GROUPS as cGroups } from "./c-programming/index";
import { cnIntroModule, cnIntroGroups } from "./computer-network/intro";
import { cnPacketModule, cnPacketGroups } from "./computer-network/packet";
import { cnApplicationModule, cnApplicationGroups } from "./computer-network/application";
import { cnTransportModule, cnTransportGroups } from "./computer-network/transport";
import { cnNetworkDataModule, cnNetworkDataGroups } from "./computer-network/networkData";
import { cnNetworkControlModule, cnNetworkControlGroups } from "./computer-network/networkControl";
import { cnLinkModule, cnLinkGroups } from "./computer-network/link";
import { cnWirelessModule, cnWirelessGroups } from "./computer-network/wireless";
import { cnSecurityModule, cnSecurityGroups } from "./computer-network/security";
import { osIntroModule, osIntroGroups } from "./operating-system/intro";
import { osProcessModule, osProcessGroups } from "./operating-system/process";
import { osSchedulingModule, osSchedulingGroups } from "./operating-system/scheduling";
import { osSyncModule, osSyncGroups } from "./operating-system/sync";
import { osMemoryModule, osMemoryGroups } from "./operating-system/memory";
import { osVmModule, osVmGroups } from "./operating-system/virtualMemory";
import { osFsModule, osFsGroups } from "./operating-system/filesystem";
import { osIoModule, osIoGroups } from "./operating-system/io";
import { osProtectionModule, osProtectionGroups } from "./operating-system/protection";
import { seIntroModule, seIntroGroups } from "./software-engineering/intro";
import { seRequirementsModule, seRequirementsGroups } from "./software-engineering/requirements";
import { seStructuredModule, seStructuredGroups } from "./software-engineering/structured";
import { seUmlModule, seUmlGroups } from "./software-engineering/uml";
import { seErModule, seErGroups } from "./software-engineering/er";
import { seDesignModule, seDesignGroups } from "./software-engineering/design";
import { seTestingModule, seTestingGroups } from "./software-engineering/testing";
import { seProjectModule, seProjectGroups } from "./software-engineering/project";

// SAFETY: 所有模块实现同一 ModuleDef 契约;泛型形参仅约束模块内部实现,运行时结构一致
const asModule = (m: unknown): ModuleDef => m as ModuleDef;
type Opt = { v: string; zh: string; en: string };
type Group = { label: string; opts: Opt[] };

export type SubjectKey = "ds" | "co" | "c" | "cn" | "os" | "se";
export const SUBJECTS: { key: SubjectKey; zh: string; en: string }[] = [
  { key: "ds", zh: "数据结构与算法", en: "Data Structures & Algorithms" },
  { key: "co", zh: "计算机组成原理", en: "Computer Organization" },
  { key: "c", zh: "C 语言", en: "The C Language" },
  { key: "cn", zh: "计算机网络", en: "Computer Networking" },
  { key: "os", zh: "操作系统", en: "Operating Systems" },
  { key: "se", zh: "软件工程", en: "Software Engineering" },
];

type Chapter = { subject: SubjectKey; module: ModuleDef; groups: Group[]; single?: boolean };
const CHAPTERS: Chapter[] = [
  { subject: "ds", module: asModule(dataUnifiedModule), groups: dataGroups },
  { subject: "ds", module: asModule(algorithmAnalysisModule), groups: analysisGroups },
  { subject: "ds", module: asModule(classicAlgorithmsModule), groups: classicGroups },
  { subject: "ds", module: asModule(storageUnifiedModule), groups: storageGroups },
  { subject: "ds", module: asModule(treeUnifiedModule), groups: treeGroups },
  { subject: "ds", module: asModule(graphUnifiedModule), groups: graphGroups },
  { subject: "ds", module: asModule(arrayUnifiedModule), groups: arrayGroups },
  { subject: "ds", module: asModule(raceModule), groups: [], single: true },
  { subject: "co", module: asModule(introModule), groups: introGroups },
  { subject: "co", module: asModule(digitalLogicModule), groups: digitalGroups },
  { subject: "co", module: asModule(instructionSetModule), groups: isaGroups },
  { subject: "co", module: asModule(cpuDatapathModule), groups: datapathGroups },
  { subject: "co", module: asModule(cpuControlModule), groups: controlGroups },
  { subject: "co", module: asModule(pipelineModule), groups: pipelineGroups },
  { subject: "co", module: asModule(memoryHierarchyModule), groups: memoryGroups },
  { subject: "co", module: asModule(ioBusModule), groups: ioGroups },
  { subject: "c", module: asModule(cProgrammingModule), groups: cGroups },
  { subject: "cn", module: asModule(cnIntroModule), groups: cnIntroGroups },
  { subject: "cn", module: asModule(cnPacketModule), groups: cnPacketGroups },
  { subject: "cn", module: asModule(cnApplicationModule), groups: cnApplicationGroups },
  { subject: "cn", module: asModule(cnTransportModule), groups: cnTransportGroups },
  { subject: "cn", module: asModule(cnNetworkDataModule), groups: cnNetworkDataGroups },
  { subject: "cn", module: asModule(cnNetworkControlModule), groups: cnNetworkControlGroups },
  { subject: "cn", module: asModule(cnLinkModule), groups: cnLinkGroups },
  { subject: "cn", module: asModule(cnWirelessModule), groups: cnWirelessGroups },
  { subject: "cn", module: asModule(cnSecurityModule), groups: cnSecurityGroups },
  { subject: "os", module: asModule(osIntroModule), groups: osIntroGroups },
  { subject: "os", module: asModule(osProcessModule), groups: osProcessGroups },
  { subject: "os", module: asModule(osSchedulingModule), groups: osSchedulingGroups },
  { subject: "os", module: asModule(osSyncModule), groups: osSyncGroups },
  { subject: "os", module: asModule(osMemoryModule), groups: osMemoryGroups },
  { subject: "os", module: asModule(osVmModule), groups: osVmGroups },
  { subject: "os", module: asModule(osFsModule), groups: osFsGroups },
  { subject: "os", module: asModule(osIoModule), groups: osIoGroups },
  { subject: "os", module: asModule(osProtectionModule), groups: osProtectionGroups },
  { subject: "se", module: asModule(seIntroModule), groups: seIntroGroups },
  { subject: "se", module: asModule(seRequirementsModule), groups: seRequirementsGroups },
  { subject: "se", module: asModule(seStructuredModule), groups: seStructuredGroups },
  { subject: "se", module: asModule(seUmlModule), groups: seUmlGroups },
  { subject: "se", module: asModule(seErModule), groups: seErGroups },
  { subject: "se", module: asModule(seDesignModule), groups: seDesignGroups },
  { subject: "se", module: asModule(seTestingModule), groups: seTestingGroups },
  { subject: "se", module: asModule(seProjectModule), groups: seProjectGroups },
];

// 把一个子卡包装成独立顶层模块: 顶层委托原章节的 Controls/generate/Render,
// 默认 subMode 设为该子卡; 章节内下拉仍可切换(就地导航)。
function wrapCard(module: ModuleDef, o: Opt, subject: SubjectKey): ModuleDef {
  const chapter = module as any;
  const force = (c: any) => ({ ...(c ?? {}), subMode: o.v });
  const hasCode = !!(module as any).codeFor || !!(module as any).code;
  // 画布点击推进：仅对「纯线性动画」章节默认开启；带自身画布交互的章节（图/树/数字电路等）不开启，避免误触
  const ADVANCE_CHAPTERS = new Set([
    "computer-overview", "instruction-set", "cpu-datapath", "pipeline",
    "memory-hierarchy", "c-programming", "algorithm-analysis",
  ]);
  return {
    id: `${module.id}/${o.v}`,
    title: T(o.zh, o.en),
    desc: module.desc,
    tags: module.tags,
    interactive: module.interactive,
    advanceOnCanvas: (module as any).advanceOnCanvas ?? (hasCode && !module.interactive && ADVANCE_CHAPTERS.has(module.id)),
    persistExclude: [...(module.persistExclude ?? []), "subMode"],
    chapter: module.title,
    subject,
    defaultConfig: { ...(chapter.defaultConfig ?? {}), subMode: o.v },
    Controls: (module.Controls
      ? ((props: any) => createElement(module.Controls as any, { ...props, config: force(props.config), embedded: true }))
      : undefined) as any,
    Side: (module.Side
      ? ((props: any) => createElement(module.Side as any, { ...props, config: force(props.config) }))
      : undefined) as any,
    randomize: (module.randomize as any),
    generate: (c: any) => chapter.generate(force(c)),
    codeFor: (module.codeFor ? ((c: any) => chapter.codeFor(force(c))) : undefined) as any,
    onPlayEnd: (module.onPlayEnd ? ((c: any) => chapter.onPlayEnd(force(c))) : undefined) as any,
    blockedReason: (module.blockedReason ? ((c: any) => chapter.blockedReason(force(c))) : undefined) as any,
    Render: (props: any) => createElement(module.Render as any, { ...props, config: force(props.config) }),
  } as unknown as ModuleDef;
}

function chapterCards(ch: Chapter): ModuleDef[] {
  const chapter = ch.module as any;
  if (ch.single) {
    return [{
      ...(ch.module as any),
      chapter: ch.module.title,
      subject: ch.subject,
    } as unknown as ModuleDef];
  }
  const cards: ModuleDef[] = [];
  for (const g of ch.groups) {
    for (const o of g.opts) cards.push(wrapCard(ch.module, o, ch.subject));
  }
  void chapter;
  return cards;
}

export const KNOWLEDGE: Record<string, ModuleDef> = {};
export const chapterRedirect: Record<string, string> = {};
export type HomeChapter = { id: string; title: Text; cards: ModuleDef[] };
export const homeSections: { key: SubjectKey; zh: string; en: string; chapters: HomeChapter[] }[] =
  SUBJECTS.map((s) => ({ key: s.key, zh: s.zh, en: s.en, chapters: [] }));

for (const ch of CHAPTERS) {
  const cards = chapterCards(ch);
  const section = homeSections.find((s) => s.key === ch.subject);
  section?.chapters.push({ id: ch.module.id, title: ch.module.title, cards });
  for (const card of cards) KNOWLEDGE[card.id] = card;
  // 旧链接 #/module/<chapter> → 首个知识点
  if (cards[0]) chapterRedirect[ch.module.id] = cards[0].id;
}

export const allModules = Object.values(KNOWLEDGE);

export function findModule(id: string) {
  if (KNOWLEDGE[id]) return KNOWLEDGE[id];
  const redirect = chapterRedirect[id];
  return redirect ? KNOWLEDGE[redirect] ?? null : null;
}

export function searchModules(q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return allModules;
  return allModules.filter((m) => {
    const hay = [
      m.id,
      m.title.zh,
      m.title.en,
      m.desc?.zh ?? "",
      m.desc?.en ?? "",
      m.chapter?.zh ?? "",
      m.chapter?.en ?? "",
      ...(m.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(s);
  });
}
