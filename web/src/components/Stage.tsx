import { createElement, useEffect, useMemo, useRef, useState } from "react";

// 全站统一：把用户行为（模式 + 参数）持久化到 localStorage，除非用户手动清空
function cfgKey(id: string) {
  return `module-cfg:${id}`;
}
// 剔除动画/瞬态字段与模块声明的排除字段（如堆的 work/applied：无参数操作的结果不应跨会话污染首帧）
function persistable(c: object, exclude: string[] = []): object {
  const { prevValuesStr, prevKeysStr, execTick, op, ...rest } = c as Record<
    string,
    unknown
  >;
  const out: Record<string, unknown> = {
    ...rest,
    prevValuesStr: undefined,
    prevKeysStr: undefined,
    execTick: 0,
    op: "idle",
  }; // undefined 键在 JSON 中省略
  for (const k of exclude) delete out[k];
  return out;
}
import { useLang } from "../i18n/LangContext";
import type { ModuleDef } from "../engine/types";
import { usePlayback } from "../engine/usePlayback";
import { Pseudocode } from "./Pseudocode";
import { PlaybackBar } from "./PlaybackBar";
import { MathText } from "../lib/tex";

export function Stage({ mod }: { mod: ModuleDef }) {
  const { t } = useLang();
  const [config, setConfig] = useState(() => {
    // 统一：载入上次用户的 config（模式 + 参数），除非用户手动清空
    try {
      const saved = localStorage.getItem(cfgKey(mod.id));
      if (saved !== null) {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        // 否访模块声明的排除字段（旧存档可能的 work/applied 残留 → 每轮首次进入回到来源）
        for (const k of mod.persistExclude ?? []) delete parsed[k];
        const merged = {
          ...(mod.defaultConfig as object),
          ...parsed,
        } as Record<string, unknown>;
        // 知识点输入框默认值为空（'' 或 NaN）的字段：始终以空为准，
        // 不采纳旧存档里的默认值/演示值（如 BST 搜索值 3、插值 5），让用户自己输入；
        // 内容字段（列表/字符串数据）除外，仍保留用户数据
        const CONTENT_KEYS = new Set([
          "valuesStr",
          "prevValuesStr",
          "dataStr",
          "prevDataStr",
          "keysStr",
          "prevKeysStr",
        ]);
        for (const k of Object.keys(mod.defaultConfig as object)) {
          if (CONTENT_KEYS.has(k)) continue;
          const d = (mod.defaultConfig as Record<string, unknown>)[k];
          if (d === "" || (typeof d === "number" && Number.isNaN(d))) {
            merged[k] = d;
          }
        }
        return merged as typeof mod.defaultConfig;
      }
    } catch {
      /* storage unavailable */
    }
    return mod.defaultConfig;
  });
  // 用户 config 每次变化持久化，供下次载入
  useEffect(() => {
    try {
      localStorage.setItem(
        cfgKey(mod.id),
        JSON.stringify(persistable(config as object, mod.persistExclude)),
      );
    } catch {
      /* storage unavailable */
    }
  }, [mod, config]);
  // 画布节点选中（terms 模式右侧图例/属性面板）：切换模式不丢选中，换树（随机生成/重新导入）时清除
  const [inspected, setInspected] = useState<number | null>(null);
  // 树身份 = source + values + imp（不含 mode）：同一棵树换模式保留结果
  const treeKey = useMemo(() => {
    const c = config as {
      source?: unknown;
      values?: unknown;
      imp?: unknown;
      confirmed?: unknown;
    } | null;
    return JSON.stringify([
      c?.source ?? null,
      c?.values ?? null,
      c?.imp ?? null,
      c?.confirmed ?? null,
    ]);
  }, [config]);
  useEffect(() => setInspected(null), [mod, treeKey]);
  const frames = useMemo(() => mod.generate(config), [mod, config]);
  const code = useMemo(
    () => (mod.codeFor ? mod.codeFor(config) : (mod.code ?? [])),
    [mod, config],
  );
  // 统一：所有知识点进入不自动播放，停在首帧，需点“执行”或手动播放
  const isManual = true;
  const pb = usePlayback(frames, {
    autoPlay: !isManual,
    autoPlayOnMount: !isManual,
  });
  // 动画播到末帧结束时：模块可用 onPlayEnd 把结果自动写回 config（如 AVL/BST 建树后自动应用为新版本）
  const prevPlaying = useRef(false);
  useEffect(() => {
    const ended =
      prevPlaying.current &&
      !pb.playing &&
      pb.count > 0 &&
      pb.index === pb.count - 1;
    prevPlaying.current = pb.playing;
    if (ended && mod.onPlayEnd) {
      const next = mod.onPlayEnd(config);
      if (next) setConfig(next as never);
    }
  }, [pb.playing, pb.index, pb.count, mod, config]);
  const handleChange = (c: unknown) => {
    if (pb.playing) return;
    setConfig(c as never);
  };
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    const err = (pb.frame?.scene as any)?.error as string | undefined;
    if (err) {
      setToast(err);
      const id = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(id);
    } else setToast(null);
  }, [pb.frame]);

  return (
    <div className="stage" style={{ position: "relative" }}>
      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "#92400e", color: "#fff", padding: "8px 16px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,.2)", maxWidth: "90vw", textAlign: "center" }}>
          ⚠ {toast}
        </div>
      )}
      {mod.Controls && (
        <div
          className="stage-controls"
          style={
            pb.playing ? { opacity: 0.6, pointerEvents: "none" } : undefined
          }
        >
          {createElement(
            mod.Controls as never,
            {
              config: config as never,
              onChange: handleChange as never,
              t,
              onPlay: pb.play,
            } as never,
          )}
        </div>
      )}
      <PlaybackBar pb={pb} />
      <div className="stage-body">
        <div className="canvas">
          {pb.frame && (
            <mod.Render
              scene={pb.frame.scene}
              t={t}
              config={config as never}
              onChange={handleChange as never}
              inspected={inspected as never}
              onInspect={(id) => setInspected(id ?? null)}
            />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          {(pb.frame?.scene as any)?.error && (
            <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", padding: "8px 10px", borderRadius: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span>⚠ {(pb.frame.scene as any).error}</span>
              <button onClick={() => setToast(null)} style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          )}
          {pb.frame && (
            <div className="caption" style={{ marginBottom: 4, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px" }}>
              <MathText text={t(pb.frame.caption)} />
            </div>
          )}
          {code.length > 0 && <Pseudocode code={code} active={pb.frame?.line} />}
          {mod.Side && pb.frame && (
            <mod.Side
              scene={pb.frame.scene}
              t={t}
              config={config as never}
              onChange={handleChange as never}
              inspected={inspected as never}
              onInspect={(id) => setInspected(id ?? null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
