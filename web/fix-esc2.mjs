// 修复 graph.ts 伪代码数组的 4 反斜杠转义 bug（LEVEL_CODE 等，行 1595-1869）
// 源码 `\\\\`（4 反斜杠）→ 运行时 `\\`（2 反斜杠）→ KaTeX 把 \\gets 渲染成 "gets"。
// 正确：源码 `\\`（2 反斜杠）→ 运行时 `\`（1 反斜杠）→ 渲染 ←。
// 用 fromCharCode 构造字面串，杜绝转义歧义。
import fs from "fs";
const p = "src/lib/graph.ts";
const BS = String.fromCharCode(92); // 单个反斜杠
const B4 = BS.repeat(4); // 4 个
const B2 = BS.repeat(2); // 2 个
const lines = fs.readFileSync(p, "utf8").split("\n");
let changed = 0;
for (let i = 1594; i < 1870 && i < lines.length; i++) {
  const before = lines[i];
  lines[i] = lines[i].split(B4).join(B2);
  if (lines[i] !== before) changed++;
}
fs.writeFileSync(p, lines.join("\n"));
console.log("fixed lines:", changed);
