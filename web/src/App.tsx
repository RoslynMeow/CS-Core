import { useEffect, useMemo, useState } from "react";
import { useLang } from "./i18n/LangContext";
import { Stage } from "./components/Stage";
import { homeSections, findModule, searchModules } from "./modules/registry";
import { Settings } from "./pages/Settings";
import { MemoryVisualizer } from "./pages/MemoryVisualizer";

type Route =
      | { kind: "home" }
      | { kind: "module"; id: string }
      | { kind: "settings" }
      | { kind: "memory" };
function getRoute(): Route {
      const h = location.hash;
      if (h.startsWith("#/settings") || h.startsWith("#/alphabet"))
            return { kind: "settings" };
      if (h.startsWith("#/memory")) return { kind: "memory" };
      const m = h.match(/^#\/module\/(.+)/);
      if (m) return { kind: "module", id: m[1] };
      return { kind: "home" };
}

export function App() {
      const { t } = useLang();
      const [route, setRoute] = useState<Route>(getRoute());
      useEffect(() => {
            const h = () => setRoute(getRoute());
            window.addEventListener("hashchange", h);
            return () => window.removeEventListener("hashchange", h);
      }, []);
      const [q, setQ] = useState("");
      const [expanded, setExpanded] = useState<Record<string, boolean>>({});
      const matched = useMemo(() => new Set(searchModules(q).map((m) => m.id)), [q]);
      const searching = q.trim().length > 0;
      const totalCards = useMemo(
            () => homeSections.reduce((n, s) => n + s.chapters.reduce((m, c) => m + c.cards.length, 0), 0),
            [],
      );
      const mod = route.kind === "module" ? findModule(route.id) : null;
      const headerTitle =
            route.kind === "module"
                  ? mod
                        ? t(mod.title)
                        : null
                  : route.kind === "settings"
                        ? "设置"
                        : route.kind === "memory"
                              ? "内存可视化"
                              : null;

      return (
            <div className="app">
                  <header className="hdr">
                        <div
                              className="brand"
                              onClick={() => (location.hash = "")}
                        >
                              计算机学习
                        </div>
                        {headerTitle && (
                              <div style={{ fontSize: 14, fontWeight: 800 }}>
                                    {headerTitle}
                              </div>
                        )}
                        {mod && (
                              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                    {mod.chapter && (
                                          <span className="tag" style={{ background: "#eef2ff", color: "#4338ca", borderColor: "#c7d2fe" }}>
                                                {mod.chapter.zh}
                                          </span>
                                    )}
                                    {(mod.tags ?? []).map((x) => (
                                          <span key={x} className="tag">{x}</span>
                                    ))}
                                    <span className="tag" style={{ background: "#f8fafc", color: "#475569", borderColor: "#e2e8f0" }}>
                                          {mod.id}
                                    </span>
                              </div>
                        )}
                        <div className="spacer" />
                        <button
                              className={`pill ${route.kind === "memory" ? "active" : ""}`}
                              onClick={() => (location.hash = "#/memory")}
                              title="HEX 内存可视化 — 支持 URL Base64 或手动输入"
                        >
                              内存可视化
                        </button>
                        <button
                              className={`pill ${route.kind === "settings" ? "active" : ""}`}
                              onClick={() => (location.hash = "#/settings")}
                        >
                              设置
                        </button>
                  </header>
                  <main className="main">
                        {route.kind === "settings" ? (
                              <Settings />
                        ) : route.kind === "memory" ? (
                              <MemoryVisualizer />
                        ) : mod ? (
                              <Stage key={mod.id} mod={mod as never} />
                        ) : (
                              <div className="home">
                                    <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                                          <input
                                                className="txt"
                                                value={q}
                                                onChange={(e) => setQ(e.target.value)}
                                                placeholder="搜索知识点… 如 卡诺图 / 并查集 / 流水线 / 指针"
                                                style={{ flex: 1, minWidth: 240, maxWidth: 460 }}
                                          />
                                          <span style={{ fontSize: 12, color: "#94a3b8" }}>
                                                {searching ? `${matched.size} / ${totalCards}` : `${totalCards} 个知识点`}
                                          </span>
                                          <button
                                                className="ghost"
                                                onClick={() =>
                                                      setExpanded(
                                                            Object.fromEntries(
                                                                  homeSections.flatMap((s) => s.chapters.map((c) => [c.id, true])),
                                                            ),
                                                      )
                                                }
                                          >
                                                全部展开
                                          </button>
                                          <button
                                                className="ghost"
                                                onClick={() => setExpanded({})}
                                          >
                                                全部折叠
                                          </button>
                                    </div>
                                    {homeSections.map((sec) => {
                                          const chapters = sec.chapters
                                                .map((ch) => ({ ...ch, cards: ch.cards.filter((m) => matched.has(m.id)) }))
                                                .filter((ch) => !searching || ch.cards.length > 0);
                                          if (chapters.length === 0) return null;
                                          return (
                                                <section key={sec.key} style={{ marginTop: 20 }}>
                                                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 0 6px 2px" }}>
                                                            <h2 style={{ fontSize: 16, fontWeight: 900, color: "#1e293b", margin: 0 }}>
                                                                  {sec.zh}
                                                            </h2>
                                                            <span style={{ fontSize: 12, color: "#94a3b8" }}>{sec.en}</span>
                                                      </div>
                                                      {chapters.map((ch) => {
                                                            const open = searching ? true : !!expanded[ch.id];
                                                            return (
                                                                  <div key={ch.id} style={{ marginBottom: 8 }}>
                                                                        <button
                                                                              onClick={() => {
                                                                                    if (!searching) setExpanded((e) => ({ ...e, [ch.id]: !e[ch.id] }));
                                                                              }}
                                                                              style={{
                                                                                    width: "100%",
                                                                                    display: "flex",
                                                                                    alignItems: "center",
                                                                                    gap: 8,
                                                                                    padding: "7px 12px",
                                                                                    borderRadius: 10,
                                                                                    border: "1px solid #e2e8f0",
                                                                                    background: open ? "#f1f5f9" : "#fff",
                                                                                    cursor: "pointer",
                                                                                    textAlign: "left",
                                                                              }}
                                                                        >
                                                                              <span style={{ width: 12, color: "#64748b", fontWeight: 800 }}>{open ? "▾" : "▸"}</span>
                                                                              <span style={{ fontWeight: 800, color: "#334155", fontSize: 14 }}>{ch.title.zh}</span>
                                                                              <span style={{ color: "#94a3b8", fontSize: 12 }}>{ch.title.en}</span>
                                                                              <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>{ch.cards.length} 个知识点</span>
                                                                        </button>
                                                                        {open && (
                                                                              <div className="grid" style={{ marginTop: 8 }}>
                                                                                    {ch.cards.map((m) => (
                                                                                          <button
                                                                                                key={m.id}
                                                                                                className="card"
                                                                                                onClick={() => (location.hash = `#/module/${m.id}`)}
                                                                                          >
                                                                                                <div className="card-title">{m.title.zh}</div>
                                                                                                <div style={{ fontSize: 12, color: "#94a3b8" }}>{m.title.en}</div>
                                                                                                <div className="card-meta">
                                                                                                      {(m.tags ?? []).slice(0, 2).map((tg) => (
                                                                                                            <span key={tg} className="meta primary">{tg}</span>
                                                                                                      ))}
                                                                                                      <span className="meta">{m.id}</span>
                                                                                                </div>
                                                                                          </button>
                                                                                    ))}
                                                                              </div>
                                                                        )}
                                                                  </div>
                                                            );
                                                      })}
                                                </section>
                                          );
                                    })}
                                    {searching && matched.size === 0 && (
                                          <div style={{ marginTop: 24, color: "#94a3b8", fontSize: 14 }}>没有匹配的知识点</div>
                                    )}
                              </div>
                        )}
                  </main>
            </div>
      );
}
