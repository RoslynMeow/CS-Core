# 伪代码与回放（Pseudocode & Playback）

> 统一规范：`Frame.line` 为 PC，逐语句一帧；`usePlayback` 驱动 `Pseudocode` 高亮与 `Stage` 动画。

## 1. PC 契约 `engine/types.ts`

```ts
interface Frame<S> { caption: Text; scene: S; line?: number } // 0-based PC
type FramesOrInfinite<S> = Frame<S>[] | { frames: Frame<S>[]; extend: (last,i)=>Frame<S>[] }
interface ModuleDef<S,C> {
  code?: Text[]; codeFor?: (c:C)=>Text[];
  generate: (c:C)=>FramesOrInfinite<S>;
}
```

- `code / codeFor(config)` 为当前展示的伪代码数组，`line` 必须 `0 <= line < code.length` 且指向非空行。
- `Pseudocode.tsx` 过滤空行后重编号展示，但高亮按原下标 `active===i`。
- `dev` 下越界或空行会 `console.warn`。

## 2. 数据流

```
code / codeFor(config) → Pseudocode 渲染
generate(config) → Frame[] | {frames, extend}
         ↓
usePlayback(framesOr) → { frame, index, playing, speed, toggle, stepFwd/back, first/last }
         ↓
Stage: Render(scene) + Pseudocode(active=frame.line) + caption(MathText)
```

- 切换 `config` 或语言重建帧并回首帧。
- 无限：`extend` 在到达末尾时按需追加，`PlaybackBar` 的 `下一步/末帧` 不禁用，计数显示 `∞`。

## 3. 编写规范

### 3.1 一行一帧

- 每条可执行语句（`for/while` 头、`if`、赋值、返回）各一帧，`line` 从 `0` 走到 `code.length-1`。
- 例：`99→100` 的进位链 `while→清零→i++` 每位各一帧，保留中间 `00` 不裁。

### 3.2 伪代码语言

- 正文 = 纯数学 `$...$` + 少量英文结构词（`while/if/for` 等循环分支头、`return/locate/insert/merge` 等操作动词），如 `while $i < |w|$: $p \gets p.child(w_i)$`、`if $|keys| = m$ → split`。
- 说明放 `//` 后，并按语言本地化：zh 注释中文、en 注释英文，如 `$R_i \gets s \bmod n$  // 本位` / `// current digit`。
- 禁止 `//` 前出现中文字符或中文叙述；英文结构词允许（伪代码关键词），其余概念一律进 `//`。
- 纯数学行（无结构词，如 `if $|keys| < \lceil m/2\rceil-1$:`）可不带 `//`，且 zh/en 写法须完全一致。

### 3.3 多模式

- 单模式：`code`
- 多模式：`codeFor(config)` 按 `mode` 返回对应数组，`generate` 同步分支。

### 3.4 公式与空行

- 全部走 `MathText`，`$...$` 由 KaTeX 渲染。
- 不写空行占位，空行会被过滤导致高亮错位。

## 4. Playback 用法 `engine/usePlayback.ts`

```ts
const pb = usePlayback(framesOr, { interval: 800 });
// pb.frame, pb.index, pb.count, pb.infinite
// pb.play/pause/toggle/stepFwd/stepBack/first/last, pb.speed/setSpeed
```

- 有限：到末尾 `playing→false`。
- 无限：到末尾调 `extend` 续帧，可一直播放（如后继）。

`components/PlaybackBar.tsx` 封装 `首帧/上一步/播放/下一步/末帧` + 速度滑杆，`infinite` 时末侧不禁用。

## 5. 渲染细节 `components/Pseudocode.tsx`

- 标题按语言：`zh→伪代码` / `en→Pseudocode`。
- `code` 过滤空行，行号按可见行重排，高亮按原下标。

## 6. 常见排查

| 症状 | 原因 | 修复 |
| ------ | ------ | ------ |
| `PC out of range` | `line` 越界 | 使 `line` 在 `[0,code.length)` |
| 某行永不高亮 | 循环头未产帧 | 补一帧 |
| 高亮错位 | 用重编号行号 | 用原下标 |
| 显示全部伪代码 | 未用 `codeFor` | 按模式返回 |
| 中文在正文 | 自然语言在 `//` 前 | 移入注释 |

## 7. 示例

`positional-system` 后继 5 行：

```Pseudocode
[0] $i \gets 0$
[1] while $P_i = n-1$:
[2]   $P_i \gets 0$
[3]   $i \gets i+1$
[4] $P_i \gets P_i+1$
```

帧：`1→2→3→4` 逐位进位，`extend` 实现无限后继。
