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

// SAFETY: 所有模块实现同一 ModuleDef 契约;泛型形参仅约束模块内部实现,运行时结构一致
const asModule = (m: unknown): ModuleDef => m as ModuleDef;
type Opt = { v: string; zh: string; en: string };
type Group = { label: string; opts: Opt[] };

export type SubjectKey = "ds" | "co" | "c";
export const SUBJECTS: { key: SubjectKey; zh: string; en: string }[] = [
  { key: "ds", zh: "数据结构与算法", en: "Data Structures & Algorithms" },
  { key: "co", zh: "计算机组成原理", en: "Computer Organization" },
  { key: "c", zh: "C 语言", en: "The C Language" },
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
];

// 把一个子卡包装成独立顶层模块: 顶层委托原章节的 Controls/generate/Render,
// 默认 subMode 设为该子卡; 章节内下拉仍可切换(就地导航)。
function wrapCard(module: ModuleDef, o: Opt, subject: SubjectKey): ModuleDef {
  const chapter = module as any;
  return {
    id: `${module.id}/${o.v}`,
    title: T(o.zh, o.en),
    desc: module.desc,
    tags: module.tags,
    interactive: module.interactive,
    persistExclude: module.persistExclude,
    chapter: module.title,
    subject,
    defaultConfig: { ...(chapter.defaultConfig ?? {}), subMode: o.v },
    Controls: (module.Controls
      ? ((props: any) => createElement(module.Controls as any, { ...props, embedded: true }))
      : undefined) as any,
    Side: (module.Side
      ? ((props: any) => createElement(module.Side as any, props))
      : undefined) as any,
    randomize: (module.randomize as any),
    generate: (c: any) => chapter.generate(c),
    codeFor: (module.codeFor ? ((c: any) => chapter.codeFor(c)) : undefined) as any,
    onPlayEnd: (module.onPlayEnd ? ((c: any) => chapter.onPlayEnd(c)) : undefined) as any,
    blockedReason: (module.blockedReason ? ((c: any) => chapter.blockedReason(c)) : undefined) as any,
    Render: (props: any) => createElement(module.Render as any, props),
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
