import fs from "fs";
const p = "src/lib/graph.ts";
const lines = fs.readFileSync(p, "utf8").split("\n");
let changed = 0;
// 伪代码数组区：LEVEL_CODE (1595) / ALL_BFS_CODE (1630) / ALL_DFS_CODE (1665) / CYCLE_CODE (1700) / DIJKSTRA / PRIM / KRUSKAL / BELLMAN … 到 1869 行。
// 源码 4 反斜杠 `\\\\` → 运行时 2 反斜杠 → KaTeX 把 `\\gets` 渲染成 "gets" 乱码。
// 正确：源码 2 反斜杠 `\\` → 运行时 1 反斜杠 → 渲染 ←。
// 只用 replaceAll 把 4 反斜杠串 → 2 反斜杠串；2 反斜杠（正确）的行不受影响。
for (let i = 1594; i < 1870 && i < lines.length; i++) {
  const before = lines[i];
  lines[i] = before.replaceAll("\\\\\\\\", "\\\\");
  if (lines[i] !== before) changed++;
}
fs.writeFileSync(p, lines.join("\n"));
console.log("fixed lines:", changed);
