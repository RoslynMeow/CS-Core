/** 图显示主题（展示画布 + 编辑器共用）：无向边权重牌颜色可配，其余默认写死 */

export const UNDIRECTED_BADGE_DEFAULT = "#0e7490";
const UNDIRECTED_BADGE_KEY = "graph:undirectedBadgeColor";
export const UNDIRECTED_BADGE_STORAGE_KEY = UNDIRECTED_BADGE_KEY;

export function getUndirectedBadgeColor(): string {
  try {
    const v = localStorage.getItem(UNDIRECTED_BADGE_KEY);
    if (v && /^#[0-9a-fA-F]{6}$/.test(v)) return v;
  } catch {
    /* 无存储时用默认 */
  }
  return UNDIRECTED_BADGE_DEFAULT;
}

export function setUndirectedBadgeColor(c: string): void {
  try {
    if (/^#[0-9a-fA-F]{6}$/.test(c)) localStorage.setItem(UNDIRECTED_BADGE_KEY, c);
  } catch {
    /* ignore */
  }
}

/** 数字箭头尺寸：按权重位数放大，保证数字塞进三角形 */
export function weightArrow(w: number): { len: number; half: number; font: number } {
  const digits = String(Math.trunc(Math.abs(w)) || 0).length;
  const half = digits >= 3 ? 13 : digits === 2 ? 11 : 9;
  return { len: half * 2.1, half, font: digits >= 3 ? 8 : 10 };
}

/** 图是否算有权图：任一边带显式权重（含显式 1；新建默认边不存权重，保持无权图干净） */
export function graphHasWeight(edges: { weight?: number }[]): boolean {
  return edges.some((e) => e.weight !== undefined);
}
