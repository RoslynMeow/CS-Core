import { useRef, useState } from "react";

export function SplitPane({ top, bottom, initialTop = 62 }: { top: React.ReactNode; bottom: React.ReactNode; initialTop?: number }) {
  const [topPct, setTopPct] = useState(initialTop);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const sy = useRef(0);
  const start = useRef(initialTop);
  const onDown = (e: React.MouseEvent) => {
    drag.current = true;
    sy.current = e.clientY;
    start.current = topPct;
    const move = (ev: MouseEvent) => {
      if (!drag.current || !ref.current) return;
      const h = ref.current.getBoundingClientRect().height;
      const d = ((ev.clientY - sy.current) / h) * 100;
      let n = start.current + d;
      n = Math.max(22, Math.min(78, n));
      setTopPct(n);
    };
    const up = () => {
      drag.current = false;
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };
  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: 0 }}>
      <div style={{ height: `${topPct}%`, minHeight: 120, display: "flex", flexDirection: "column", overflow: "hidden" }}>{top}</div>
      <div
        onMouseDown={onDown}
        onDoubleClick={() => setTopPct(initialTop)}
        title="拖动调整 / 双击复位"
        style={{ height: 8, flexShrink: 0, cursor: "row-resize", background: "#e2e8f0", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#c7d2fe")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#e2e8f0")}
      >
        <div style={{ width: 36, height: 3, borderRadius: 999, background: "#94a3b8" }} />
      </div>
      <div style={{ height: `${100 - topPct}%`, minHeight: 120, display: "flex", flexDirection: "column", overflow: "hidden" }}>{bottom}</div>
    </div>
  );
}
