import type { ModuleDef } from "../engine/types";
import { dataUnifiedModule } from "./data/unified";
import { storageUnifiedModule } from "./storage/unified";
import { treeUnifiedModule } from "./tree/unified";
import { graphUnifiedModule } from "./graph/unified";
import { arrayUnifiedModule } from "./array/unified";
import { raceModule } from "./array/compare";
import { digitalLogicModule } from "./computer-organization/digitalLogic";
import { instructionSetModule } from "./computer-organization/instructionSet";
import { cpuDatapathModule } from "./computer-organization/cpuDatapath";
import { cpuControlModule } from "./computer-organization/cpuControl";
import { pipelineModule } from "./computer-organization/pipeline";
import { memoryHierarchyModule } from "./computer-organization/memory";
import { ioBusModule } from "./computer-organization/ioBus";

// SAFETY: 所有模块实现同一 ModuleDef 契约;泛型形参仅约束模块内部实现,运行时结构一致
const asModule = (m: unknown): ModuleDef => m as ModuleDef;

export const KNOWLEDGE: Record<string, ModuleDef> = {
  [dataUnifiedModule.id]: asModule(dataUnifiedModule),
  [storageUnifiedModule.id]: asModule(storageUnifiedModule),
  [treeUnifiedModule.id]: asModule(treeUnifiedModule),
  [graphUnifiedModule.id]: asModule(graphUnifiedModule),
  [arrayUnifiedModule.id]: asModule(arrayUnifiedModule),
  [raceModule.id]: asModule(raceModule),
  [digitalLogicModule.id]: asModule(digitalLogicModule),
  [instructionSetModule.id]: asModule(instructionSetModule),
  [cpuDatapathModule.id]: asModule(cpuDatapathModule),
  [cpuControlModule.id]: asModule(cpuControlModule),
  [pipelineModule.id]: asModule(pipelineModule),
  [memoryHierarchyModule.id]: asModule(memoryHierarchyModule),
  [ioBusModule.id]: asModule(ioBusModule),
};

export const allModules = Object.values(KNOWLEDGE);
export function findModule(id: string) {
  return KNOWLEDGE[id] ?? null;
}

export function searchModules(q: string, tag: string | null) {
  const s = q.trim().toLowerCase();
  return allModules.filter((m) => {
    if (tag && !(m.tags ?? []).includes(tag)) return false;
    if (!s) return true;
    const hay = [
      m.id,
      m.title.zh,
      m.title.en,
      m.desc?.zh ?? "",
      m.desc?.en ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(s);
  });
}
