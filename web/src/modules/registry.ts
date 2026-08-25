import type { ModuleDef } from '../engine/types';
import { positionalCoreModule } from './positional/core';
import { baseConversionModule } from './positional/baseConversion';
import { unsignedIntModule } from './numeric/unsignedInt';
import { twosComplementModule } from './numeric/twosComplement';
import { ieee754Module } from './numeric/ieee754';
import { characterEncodingModule } from './text/characterEncoding';
import { sequentialListModule } from './storage/sequentialList';
import { linkedListModule } from './storage/linkedList';
import { circularLinkedListModule } from './storage/circularLinkedList';
import { doublyLinkedListModule } from './storage/doublyLinkedList';
import { hashTableModule } from './storage/hashTable';
import { matrixModule } from './storage/matrix';
import { stackModule } from './storage/stack';
import { queueModule } from './storage/queue';

export const KNOWLEDGE: Record<string, ModuleDef> = {
  [positionalCoreModule.id]: positionalCoreModule as unknown as ModuleDef,
  [baseConversionModule.id]: baseConversionModule as unknown as ModuleDef,
  [unsignedIntModule.id]: unsignedIntModule as unknown as ModuleDef,
  [twosComplementModule.id]: twosComplementModule as unknown as ModuleDef,
  [ieee754Module.id]: ieee754Module as unknown as ModuleDef,
  [characterEncodingModule.id]: characterEncodingModule as unknown as ModuleDef,
  [sequentialListModule.id]: sequentialListModule as unknown as ModuleDef,
  [linkedListModule.id]: linkedListModule as unknown as ModuleDef,
  [circularLinkedListModule.id]: circularLinkedListModule as unknown as ModuleDef,
  [doublyLinkedListModule.id]: doublyLinkedListModule as unknown as ModuleDef,
  [hashTableModule.id]: hashTableModule as unknown as ModuleDef,
  [matrixModule.id]: matrixModule as unknown as ModuleDef,
  [stackModule.id]: stackModule as unknown as ModuleDef,
  [queueModule.id]: queueModule as unknown as ModuleDef,
};

export const allModules = Object.values(KNOWLEDGE);
export function findModule(id: string) { return KNOWLEDGE[id] ?? null; }

export function searchModules(q: string, tag: string | null) {
  const s = q.trim().toLowerCase();
  return allModules.filter(m => {
    if (tag && !(m.tags ?? []).includes(tag)) return false;
    if (!s) return true;
    const hay = [m.id, m.title.zh, m.title.en, m.desc?.zh ?? '', m.desc?.en ?? ''].join(' ').toLowerCase();
    return hay.includes(s);
  });
}
