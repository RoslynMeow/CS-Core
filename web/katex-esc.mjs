import katex from "./node_modules/katex/dist/katex.mjs";

function render(m) {
  try {
    return katex.renderToString(m, { throwOnError: true }).includes("←")
      ? "OK ←"
      : "FAIL(no arrow): " + m;
  } catch (e) {
    return "ERR: " + e.message.slice(0, 80);
  }
}

// What LEVEL_CODE in graph.ts looks like after TS string parsing:
// source has "\\\\gets" (4 chars) -> runtime "\\gets" (2 chars)
const levelCodeStyle = "Q \\\\gets \\\\{r\\\\}";
// Source has "\\gets" (2 chars) -> runtime "\gets" (1 char)
const moduleStyle = "Q \\gets \\{r\\}";

console.log("LEVEL_CODE runtime (source \\\\gets):", render(levelCodeStyle));
console.log("module CODE runtime (source \\gets):", render(moduleStyle));
