import type { ComponentType } from "react";
import type { Text } from "../i18n/lang";

export interface Frame<S = unknown> {
  caption: Text;
  scene: S;
  line?: number;
}

export interface InfiniteFrames<S = unknown> {
  frames: Frame<S>[];
  extend: (last: Frame<S>, lastIndex: number) => Frame<S>[];
}
export type FramesOrInfinite<S = unknown> = Frame<S>[] | InfiniteFrames<S>;

export interface ModuleDef<S = unknown, C = unknown> {
  id: string;
  title: Text;
  desc?: Text;
  tags?: string[];
  defaultConfig: C;
  Controls?: ComponentType<{
    config: C;
    onChange: (c: C) => void;
    t: (x: Text) => string;
  }>;
  randomize?: (c: C) => C;
  generate: (config: C) => FramesOrInfinite<S>;
  /** 动画播到末帧结束时回调；返回新 config 则自动应用（如建树/插入/删除后写入 work 并切回查看） */
  onPlayEnd?: (config: C) => C | null;
  /** 持久化到 localStorage 时排除的瞬态字段（如堆的 work/applied：无参数操作的结果不应跨会话污染首帧） */
  persistExclude?: string[];
  /** 右侧面板（替代伪代码列）：如术语模式的「图例 + 节点属性」；与 Render 共享 inspected/onInspect */
  Side?: ComponentType<{
    scene: S;
    t: (x: Text) => string;
    config?: C;
    onChange?: (c: C) => void;
    inspected?: number | null;
    onInspect?: (id: number | null) => void;
  }>;
  Render: ComponentType<{
    scene: S;
    t: (x: Text) => string;
    config?: C;
    onChange?: (c: C) => void;
    // 画布节点选中联动（terms 模式：右侧图例/属性面板）
    inspected?: number | null;
    onInspect?: (id: number | null) => void;
  }>;
  code?: Text[];
  codeFor?: (config: C) => Text[];
  /** 纯画布模式：隐藏讲解条与右侧栏（伪代码/Side），只留画布全宽（如排序 PK） */
  bare?: boolean;
}
