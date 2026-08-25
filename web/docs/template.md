# 模板 · Stage / Controls / Pseudocode / Playback

> 第1章 `positional-system` 已定版，后续所有知识点按此模板复用。

## 1. 整体布局 `Stage`

```
Stage
 ├─ stage-head（标题/简介/tags/id）
 ├─ stage-controls（两区）
 │   ├─ 模式参数（淡紫）：进位制、模式
 │   └─ 知识点参数（灰）：数码 A/B + 重新生成（仅随机知识点参数，不动模式）
 ├─ PlaybackBar（首帧/上一步/播放/下一步/末帧 + 速度 + 计数 ∞）
 └─ stage-body（响应式 1.15fr / 0.85fr，<900px 单列）
     ├─ canvas（动画 + caption MathText）
     └─ Pseudocode（PC 高亮）
```

- `stage-controls` 必须分 `模式参数` vs `知识点参数`，`randomize(c)` 只动后者。
- `重新生成` 放在知识点参数组末尾，调用 `randNumeral(base)`。

## 2. ModuleDef 契约 `engine/types.ts`

```ts
type Frame<S> = { caption: Text; scene: S; line?: number }
type FramesOrInfinite<S> = Frame<S>[] | { frames: Frame<S>[]; extend: (last,i)=>Frame<S>[] }
interface ModuleDef<S,C> {
  id, title, desc, tags, defaultConfig, Controls, randomize?, generate, Render, code?, codeFor?
}
```

- `generate` 返回 `FramesOrInfinite`，无限用 `extend`（如后继）。
- `codeFor(config)` 按模式返回对应伪代码，`Frame.line` 必须 `0 <= line < code.length` 且每条可执行语句一帧。

## 3. Controls 规范

- 中文下只显中文，英文下只显英文，通过 `t(T('进位制','Base'))`。
- 样式：模式区 `#eef2ff/#c7d2fe`，知识点区 `#f8fafc/#e2e8f0`，圆角 12。
- 输入用 `.txt`，下拉用 `.txt`。

## 4. Pseudocode `components/Pseudocode.tsx`

- 标题按语言：`zh→伪代码` / `en→Pseudocode`。
- 行号重编号（过滤空行），`active===i` 高亮，文本走 `MathText`。
- 正文只含 `$...$` 数学，注释在 `//` 后。

## 5. Playback `engine/usePlayback.ts` + `components/PlaybackBar.tsx`

- 支持有限与无限：`infinite` 时 `下一步/末帧` 不禁用，`count` 显示 `∞`，到末尾自动 `extend`。
- 速度 `0.25–3×`，`play/pause/toggle/stepFwd/stepBack/first/last`。

## 6. 动画粒度

- 一行一帧，`while/for` 循环头、分支、赋值各一帧，`highlight = len-1-i` 逐位右→左。
- 中间态不裁（如 `99→00→100` 保留 `00`），`curTrim` 保底 `origLen`。

## 7. 字符表

- 全局共享 `64` 位 `custom-alphabet:global`，`n` 进制取前 `n` 位，默认 `defaultAlphabet`，手绘在 `#/settings` 的画板。
- 展示双排：数码（默认）在上，手绘在下，空位虚线。

## 8. 首页

- 只平铺原子 `id`，`MathText` 渲染简介，`tags` + `id` 元信息，不按章节分层。

## 9. 新增知识点步骤

1. 新建 `modules/<topic>/<id>.tsx` 实现 `ModuleDef`
2. 在 `modules/registry.ts` 注册
3. 复用 `Stage` + `Pseudocode` + `PlaybackBar`，无需另写布局
