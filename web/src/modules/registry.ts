import type { ModuleDef } from "../engine/types";
import { positionalCoreModule } from "./positional/core";
import { baseConversionModule } from "./positional/baseConversion";
import { unsignedIntModule } from "./numeric/unsignedInt";
import { twosComplementModule } from "./numeric/twosComplement";
import { ieee754Module } from "./numeric/ieee754";
import { characterEncodingModule } from "./text/characterEncoding";
import { stringOpsModule } from "./text/stringOps";
import { sequentialListModule } from "./storage/sequentialList";
import { linkedListModule } from "./storage/linkedList";
import { circularLinkedListModule } from "./storage/circularLinkedList";
import { doublyLinkedListModule } from "./storage/doublyLinkedList";
import { hashTableModule } from "./storage/hashTable";
import { matrixModule } from "./storage/matrix";
import { stackModule } from "./storage/stack";
import { queueModule } from "./storage/queue";
import { generalTreeModule } from "./tree/general";
import { treeTraverseModule } from "./tree/binary";
import { treeBstModule } from "./tree/bst";
import { treeAvlModule } from "./tree/avl";
import { treeHeapModule } from "./tree/heap";
import { treeRbModule } from "./tree/rb";
import { treeBTreeModule } from "./tree/btree";
import { BPlusModule } from "./tree/bplus";
import { graphUnifiedModule } from "./graph/unified";

// SAFETY: 所有模块实现同一 ModuleDef 契约;泛型形参仅约束模块内部实现,运行时结构一致
const asModule = (m: unknown): ModuleDef => m as ModuleDef;

export const KNOWLEDGE: Record<string, ModuleDef> = {
  [positionalCoreModule.id]: asModule(positionalCoreModule),
  [baseConversionModule.id]: asModule(baseConversionModule),
  [unsignedIntModule.id]: asModule(unsignedIntModule),
  [twosComplementModule.id]: asModule(twosComplementModule),
  [ieee754Module.id]: asModule(ieee754Module),
  [characterEncodingModule.id]: asModule(characterEncodingModule),
  [stringOpsModule.id]: asModule(stringOpsModule),
  [sequentialListModule.id]: asModule(sequentialListModule),
  [linkedListModule.id]: asModule(linkedListModule),
  [circularLinkedListModule.id]: asModule(circularLinkedListModule),
  [doublyLinkedListModule.id]: asModule(doublyLinkedListModule),
  [hashTableModule.id]: asModule(hashTableModule),
  [matrixModule.id]: asModule(matrixModule),
  [stackModule.id]: asModule(stackModule),
  [queueModule.id]: asModule(queueModule),
  [generalTreeModule.id]: asModule(generalTreeModule),
  [treeTraverseModule.id]: asModule(treeTraverseModule),
  [treeBstModule.id]: asModule(treeBstModule),
  [treeAvlModule.id]: asModule(treeAvlModule),
  [treeHeapModule.id]: asModule(treeHeapModule),
  [treeRbModule.id]: asModule(treeRbModule),
  [treeBTreeModule.id]: asModule(treeBTreeModule),
  [BPlusModule.id]: asModule(BPlusModule),
  [graphUnifiedModule.id]: asModule(graphUnifiedModule),
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
