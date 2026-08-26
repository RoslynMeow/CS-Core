import type { ComponentType } from 'react';
import type { Text } from '../i18n/lang';

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
  Controls?: ComponentType<{ config: C; onChange: (c: C) => void; t: (x: Text) => string }>;
  randomize?: (c: C) => C;
  generate: (config: C) => FramesOrInfinite<S>;
  Render: ComponentType<{ scene: S; t: (x: Text) => string; config?: C; onChange?: (c: C) => void }>;
  code?: Text[];
  codeFor?: (config: C) => Text[];
}
