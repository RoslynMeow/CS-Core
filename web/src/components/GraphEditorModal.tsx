import { useEffect } from "react";
import { GraphEditor, type GraphEditorProps } from "./GraphEditor";

export function GraphEditorModal({ open, onClose, ...props }: GraphEditorProps & { open: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{ background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(15,23,42,.3)", width: 820, maxWidth: "100%", maxHeight: "92vh", overflow: "auto", padding: 16, display: "flex", flexDirection: "column" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{props.title ?? "图编辑器"}</div>
          <button className="ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={onClose}>✕ 关闭</button>
        </div>
        <GraphEditor {...props} onCancel={onClose} onConfirm={(g) => { props.onConfirm(g); onClose(); }} />
      </div>
    </div>
  );
}
