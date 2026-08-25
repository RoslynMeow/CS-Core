// 会话级链式布局（方案 B）：同一进程（刷新前）复用同一个 Heap，分配/释放真实增量，
// 释放的空洞会被后续 allocate 以 first-fit 复用；基址进程内固定，ASLR 仅刷新时一次。
import { Heap, realisticUserBase } from './heap';
import { hexFromBytes } from './memoryDump';

let processBase: number | null = null;
// 同一进程内只会取一次真实用户堆基址；刷新（新 bundle）即“新进程”重新 ASLR
export function processBaseOnce(): number {
  if (processBase === null) processBase = realisticUserBase(0);
  return processBase;
}

export type ChainNode = { idx: number; key: string; addr: number; data: number; next: number | null; size: number; hex: string; bytes: number[] };

export type ChainWriter = (h: Heap, addr: number, data: number, nextAddr: number | null) => number[];

export class ChainSession {
  heap: Heap;
  nodeSize: number;
  layoutKey: string; // 布局签名：elemSize/ptrSize/endian 变化即重建，避免旧字节错用新端序
  writer: ChainWriter;
  nodes: ChainNode[] = [];
  counter = 0;
  appliedKey: string | null = null; // 已增量应用的 prev>cur 签名

  constructor(nodeSize: number, writer: ChainWriter, layoutKey = '') {
    this.nodeSize = nodeSize;
    this.writer = writer;
    this.layoutKey = layoutKey;
    this.heap = new Heap(384, processBaseOnce());
  }
  private mk(idx: number, key: string, addr: number, data: number, next: number | null, bytes: number[]): ChainNode {
    return { idx, key, addr, data, next, size: this.nodeSize, hex: hexFromBytes(bytes), bytes };
  }
  // 全量重建（boot / 示例 / 清空 / 参数变化 / 刷新后）：同一 heap 上 reset 重新 first-fit 分配
  boot(vals: number[]) {
    this.heap.resetAll();
    this.nodes = []; this.counter = 0; this.appliedKey = null;
    const addrs: (number | null)[] = [];
    for (const v of vals) { const a = this.heap.allocate(`n${this.counter}`, this.nodeSize); this.counter++; addrs.push(a); }
    for (let i = 0; i < vals.length && i < addrs.length; i++) {
      const next = i + 1 < addrs.length ? addrs[i + 1]! : null;
      const bytes = this.writer(this.heap, addrs[i]!, vals[i], next);
      this.nodes.push(this.mk(i, `n${i}`, addrs[i]!, vals[i], next, bytes));
    }
  }
  private rewrite(node: ChainNode, next: number | null) {
    const bytes = this.writer(this.heap, node.addr, node.data, next);
    node.bytes = bytes; node.next = next; node.hex = hexFromBytes(bytes);
  }
  // 增量：prevVals → curVals 仅相差一个节点（插入或删除单一位置）时，真实 allocate/free + 局部改链
  delta(prevVals: number[], curVals: number[], key: string): boolean {
    // 幂等：链已处于目标状态（帧间状态切换/重复调用直接短路）
    if (this.nodes.length === curVals.length && this.nodes.every((n, i) => n.data === curVals[i])) return true;
    // 前置：链必须已处于 prevVals 状态；若失配（首次/参数变化）先 boot(prev) 再增量
    const matchPrev = this.nodes.length === prevVals.length && this.nodes.every((n, i) => n.data === prevVals[i]);
    if (!matchPrev) this.boot(prevVals);
    if (prevVals.length === curVals.length && prevVals.every((v, i) => v === curVals[i])) return true; // 目标=prev（操作前帧）
    let p = 0;
    while (p < prevVals.length && p < curVals.length && prevVals[p] === curVals[p]) p++;
    if (curVals.length === prevVals.length + 1) {
      const val = curVals[p];
      const addr = this.heap.allocate(`n${this.counter}`, this.nodeSize);
      if (addr === null) return false;
      const nKey = `n${this.counter}`; this.counter++;
      const prevNode = p - 1 >= 0 ? this.nodes[p - 1] : null;
      const nextNode = p < prevVals.length ? this.nodes[p] : null;
      const bytes = this.writer(this.heap, addr, val, nextNode?.addr ?? null);
      const newNode = this.mk(p, nKey, addr, val, nextNode?.addr ?? null, bytes);
      if (prevNode) this.rewrite(prevNode, addr);
      const newNodes: ChainNode[] = [];
      for (let i = 0; i < curVals.length; i++) {
        if (i === p) newNodes.push(newNode);
        else if (i < p) newNodes.push(this.nodes[i]);
        else newNodes.push(this.nodes[i - 1]);
      }
      this.reindex(newNodes);
      this.appliedKey = key;
      return true;
    }
    if (curVals.length === prevVals.length - 1) {
      const gone = this.nodes[p];
      if (!gone) return false;
      const prevNode = p - 1 >= 0 ? this.nodes[p - 1] : null;
      const nextNode = p + 1 < this.nodes.length ? this.nodes[p + 1] : null;
      if (prevNode) this.rewrite(prevNode, nextNode?.addr ?? null);
      this.heap.free(gone.key);
      const newNodes = this.nodes.filter((_, i) => i !== p);
      this.reindex(newNodes);
      this.appliedKey = key;
      return true;
    }
    return false; // 差异不止一处 → 调用方 fallback boot
  }
  private reindex(nodes: ChainNode[]) {
    nodes.forEach((n, i) => { n.idx = i; });
    this.nodes = nodes;
  }
  getHeapBase() { return this.heap.base; }
}