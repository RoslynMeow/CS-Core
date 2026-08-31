import { useState } from "react";
import { T, type Text } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import {
  trieBuildSteps,
  trieSearchSteps,
  trieInsertOne,
  trieDeleteOne,
  trieLayout,
  TRIE_INSERT_CODE,
  TRIE_SEARCH_CODE,
  TRIE_DELETE_CODE,
  type TrieNode,
  type TrieStep,
  type TrieSnapshot,
} from "../../lib/trie";
import { GraphCanvas, type GraphCanvasScene } from "../../components/canvas/GraphCanvas";

// ---------- 字符树共享配置（trie / radix / suffix 共用） ----------

/** 预设词表（教学用） */
export const PRESET_WORDS = [
  "she",
  "sells",
  "sea",
  "shells",
  "by",
  "the",
  "sea",
  "shore",
];
export type TextCfg = {
  words: string[];
  target: string;
  x: string;
  applied?: boolean;
};
export const TEXT_DEFAULTS: TextCfg = {
  words: ["she", "sells", "sea", "shells"],
  target: "sea",
  x: "him",
};

/** 字符树文本控件：词表编辑（逗号/空格分隔）+ 预设 + 随机单次词输入 */
export function TextPanel({
  cfg,
  onChange,
  t,
  showWordInput,
}: {
  cfg: TextCfg;
  onChange: (c: TextCfg) => void;
  t: (x: Text) => string;
  showWordInput?: "target" | "x";
}) {
  const isZh = t(T("中文", "en")) !== "en";
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState(cfg.words.join(", "));
  const applyWords = (raw: string): void => {
    const ws = raw
      .split(/[\s,，、]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (ws.length === 0) {
      setErr(isZh ? "词表为空" : "empty word list");
      return;
    }
    setErr(null);
    onChange({ ...cfg, words: ws, applied: false });
  };
  const preset = () => {
    const ws =
      PRESET_WORDS[0] && cfg.words.join(",") === PRESET_WORDS.join(",")
        ? ["cat", "car", "cart", "card", "dog", "door"]
        : PRESET_WORDS.slice();
    setDraft(ws.join(", "));
    onChange({ ...cfg, words: ws, applied: false });
  };
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        width: "100%",
      }}
    >
      <input
        className="txt"
        style={{ flex: "1 1 220px", minWidth: 150 }}
        defaultValue={draft}
        placeholder={isZh ? "词表（逗号/空格分隔）" : "words, comma separated"}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            applyWords(draft);
            e.currentTarget.blur();
          }
        }}
      />
      <button className="ghost" onClick={() => applyWords(draft)}>
        {t(T("应用词表", "Apply"))}
      </button>
      <button className="ghost" onClick={preset}>
        {t(T("预设词", "Preset"))}
      </button>
      {showWordInput && (
        <label
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            fontSize: 13,
          }}
        >
          <span>
            {showWordInput === "target"
              ? t(T("目标词", "Word"))
              : t(T("插词", "Word"))}
          </span>
          <input
            className="txt"
            style={{ width: 76 }}
            value={cfg[showWordInput]}
            onChange={(e) =>
              onChange({
                ...cfg,
                [showWordInput]: e.target.value.trim(),
                applied: false,
              })
            }
          />
        </label>
      )}
      {err && <span style={{ fontSize: 11, color: "#dc2626" }}>{err}</span>}
    </div>
  );
}

// ---------- 场景组帧：TrieNode 快照 → GraphCanvasScene ----------

const TRIE_BOX = { x0: 26, y0: 20, w: 708, h: 400 };
/** 词尾节点 tone 索引（蓝） */
const END_TONE = 1;

function trieScene(
  nodes: TrieNode[],
  step: Pick<TrieStep, "focus" | "edge" | "fresh">,
  edgeLabels?: Record<string, string>,
  annotate?: Record<number, string>,
): GraphCanvasScene {
  const pos = trieLayout(nodes, 0, TRIE_BOX);
  const freshSet = new Set(step.fresh ?? []);
  const tone: Record<number, number> = {};
  nodes.forEach((n) => {
    // 词尾节点 = 蓝（索引 1）；fresh 新建字符节点探索环高亮
    if (n.isEnd) tone[n.id] = END_TONE;
  });
  const currentId = step.focus ?? null;
  // fresh 节点用 exploring 环
  const exploring =
    freshSet.size > 0 ? Math.max(...Array.from(freshSet)) : null;
  return {
    current: currentId,
    exploring,
    visited: [],
    frontier: [],
    order: [],
    edge: step.edge ?? null,
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.ch || "∅",
      x: pos[n.id]?.x ?? 0,
      y: pos[n.id]?.y ?? 0,
    })),
    edges: nodes.flatMap((n) =>
      Object.values(n.children).map((v) => ({ u: n.id, v })),
    ),
    ...(Object.keys(tone).length ? { tone } : {}),
    ...(edgeLabels ? { edgeLabels } : {}),
    ...(annotate ? { annotate } : {}),
  };
}

// ---------- 字典树模块 ----------

type Mode = "build" | "search" | "insert" | "delete";
type Cfg = TextCfg & { mode: Mode };
const DEFAULT: Cfg = { ...TEXT_DEFAULTS, mode: "build" };
const CODE: Record<Mode, Text[]> = {
  build: TRIE_INSERT_CODE,
  search: TRIE_SEARCH_CODE,
  insert: TRIE_INSERT_CODE,
  delete: TRIE_DELETE_CODE,
};

function buildFrames(cfg: Cfg): Frame<GraphCanvasScene>[] {
  const words = cfg.words.filter(Boolean);
  if (words.length === 0) {
    return [
      {
        line: 0,
        caption: T("词表为空：请先输入词", "word list is empty"),
        scene: {
          current: null,
          exploring: null,
          visited: [],
          frontier: [],
          order: [],
          edge: null,
          nodes: [],
          edges: [],
        },
      },
    ];
  }
  if (cfg.mode === "build") {
    const steps = trieBuildSteps(words);
    return steps.map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: trieScene(s.nodes, s, undefined, undefined),
    }));
  }
  // search / insert / delete：先看是否已建 trie（未建 → 提示先建）
  // 无持久化 work：每次重新从词表建之后执行选定操作 → 组合帧
  const buildSteps = trieBuildSteps(words);
  const base: TrieSnapshot = {
    nodes: buildSteps[buildSteps.length - 1].nodes,
    root: 0,
  };
  if (cfg.mode === "search") {
    if (!cfg.target) {
      return [...buildSteps].map((s) => ({
        line: s.line,
        caption: s.msg,
        scene: trieScene(s.nodes, s),
      }));
    }
    const steps = trieSearchSteps(base.nodes, base.root, cfg.target);
    return steps.map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: trieScene(s.nodes, s),
    }));
  }
  if (cfg.mode === "insert") {
    if (!cfg.x) {
      return [
        {
          line: 0,
          caption: T("请输入要插入的词", "enter a word to insert"),
          scene: trieScene(base.nodes, { focus: null, edge: null, fresh: [] }),
        },
      ];
    }
    const out = trieInsertOne(base.nodes, base.root, cfg.x);
    return out.steps.map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: trieScene(s.nodes, s),
    }));
  }
  if (cfg.mode === "delete") {
    if (!cfg.target) {
      return [
        {
          line: 0,
          caption: T("请输入要删除的词", "enter a word to delete"),
          scene: trieScene(base.nodes, { focus: null, edge: null, fresh: [] }),
        },
      ];
    }
    const out = trieDeleteOne(base.nodes, base.root, cfg.target);
    return out.steps.map((s) => ({
      line: s.line,
      caption: s.msg,
      scene: trieScene(s.nodes, s),
    }));
  }
  return [];
}

export const TrieModule: ModuleDef<GraphCanvasScene, Cfg> = {
  id: "trie",
  title: T("字典树 · Trie", "Trie"),
  desc: T(
    "建树（逐词插入）/ 查找（须完整词）/ 插入 / 删除（回收无分支路径）；词尾蓝色标记；点节点 → 下侧显示该路径词表",
    "build (insert words) · search (full word only) · insert · delete (reclaim single-child paths); word-end blue; click a node → words under that path",
  ),
  tags: ["data-structures"],
  defaultConfig: DEFAULT,
  randomize(c) {
    const words =
      c.words.join(",") === PRESET_WORDS.slice(0, 4).join(",")
        ? ["banana", "bandana", "ban", "band", "dog", "door", "dorm"]
        : PRESET_WORDS.slice(0, 4);
    return { ...c, words, applied: false };
  },
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "8px 10px",
            borderRadius: 12,
            background: "#eef2ff",
            border: "1px solid #c7d2fe",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "#4338ca",
              letterSpacing: ".04em",
            }}
          >
            {isZh ? "操作" : "OP"}
          </span>
          <select
            className="txt"
            value={config.mode}
            onChange={(e) =>
              onChange({ ...config, mode: e.target.value as Mode })
            }
          >
            <option value="build">{t(T("建树", "Build"))}</option>
            <option value="search">{t(T("查找", "Search"))}</option>
            <option value="insert">{t(T("插入", "Insert"))}</option>
            <option value="delete">{t(T("删除", "Delete"))}</option>
          </select>
          <TextPanel
            cfg={config}
            onChange={(c) => onChange({ ...config, ...c })}
            t={t}
            showWordInput={
              config.mode === "search" || config.mode === "delete"
                ? "target"
                : config.mode === "insert"
                  ? "x"
                  : undefined
            }
          />
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) {
    return CODE[cfg.mode];
  },
  generate(config) {
    return buildFrames(config);
  },
  Render({ scene, t }) {
    return <GraphCanvas scene={scene} t={t} />;
  },
};

// 导出别名：让 radix / suffix 复用同一场景组帧
export { trieScene as charScene, TRIE_BOX as CHAR_BOX, END_TONE as END_TONE_IDX };