import { useEffect, useState } from "react";
import { useLang } from "./i18n/LangContext";
import { Stage } from "./components/Stage";
import { allModules, findModule } from "./modules/registry";
import { MathText } from "./lib/tex";
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
                              <div
                                    style={{ fontSize: 14, fontWeight: 800 }}
                              >
                                    {headerTitle}
                              </div>
                        )}
                        {mod && (
                              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                    {(mod.tags ?? []).map((x) => (
                                          <span key={x} className="tag">
                                                {x}
                                          </span>
                                    ))}
                                    <span
                                          className="tag"
                                          style={{
                                                background: "#f8fafc",
                                                color: "#475569",
                                                borderColor: "#e2e8f0",
                                          }}
                                    >
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
                              <Stage mod={mod as never} />
                        ) : (
                              <div className="home">
                                    <div
                                          className="grid"
                                          style={{ marginTop: 14 }}
                                    >
                                          {allModules.map((m) => (
                                                <button
                                                      key={m.id}
                                                      className="card"
                                                      onClick={() =>
                                                            (location.hash = `#/module/${m.id}`)
                                                      }
                                                >
                                                      <div className="card-title">
                                                            {m.title.zh}
                                                      </div>
                                                      <div
                                                            style={{
                                                                  fontSize: 12,
                                                                  color: "#94a3b8",
                                                            }}
                                                      >
                                                            {m.title.en}
                                                      </div>
                                                      {m.desc && (
                                                            <div className="card-desc">
                                                                  <MathText
                                                                        text={
                                                                              m
                                                                                    .desc
                                                                                    .zh
                                                                        }
                                                                  />
                                                            </div>
                                                      )}
                                                      <div className="card-meta">
                                                            {m.tags?.map(
                                                                  (t) => (
                                                                        <span
                                                                              key={
                                                                                    t
                                                                              }
                                                                              className="meta primary"
                                                                        >
                                                                              {
                                                                                    t
                                                                              }
                                                                        </span>
                                                                  ),
                                                            )}
                                                            <span className="meta">
                                                                  {m.id}
                                                            </span>
                                                      </div>
                                                </button>
                                          ))}
                                    </div>
                              </div>
                        )}
                  </main>
            </div>
      );
}
