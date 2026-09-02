import pathlib, re
for path in [r'E:\Github\CS-Core\web\src\modules\graph\unified.tsx', r'E:\Github\CS-Core\web\src\modules\tree\unified.tsx']:
    p = pathlib.Path(path)
    t = p.read_text(encoding='utf-8')
    # Replace SplitPane left column with drawer version
    # Find the Render return block that contains SplitPane
    # For graph: it has SplitPane with top and bottom
    # Replace the whole SplitPane block with drawer logic
    # Add memOpen state handling
    # First, ensure useState is imported (it is)
    # Replace the specific pattern for graph
    if 'SplitPane' in t:
        # Remove SplitPane import if needed, keep it for now but not used for left column (still used maybe elsewhere)
        # Replace the left column SplitPane with drawer
        # Pattern for graph unified's Render left column
        # Look for: return (\n      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>\n        <SplitPane
        # We will replace that whole return's inner left part with drawer version
        # Simplify: replace the first occurrence of "<SplitPane" block with drawer
        # For graph, the left column is inside Render's return
        # We'll do a simple string replace for the SplitPane usage in Render
        # Replace SplitPane import usage: find "        <SplitPane" and replace with drawer logic
        # Instead of complex regex, we will directly rewrite the Render function for both files to use drawer
        # For graph, replace the Render's return that contains SplitPane with new version that has memOpen
        old_graph_render = """    const onPickVertex = (id: number) => {
      const pick = cfg.pick ?? "root";
      if (cfg.subMode === "astar") {
        if (pick === "target") onChange?.({ ...cfg, target: id } as unknown as Cfg);
        else onChange?.({ ...cfg, root: id } as unknown as Cfg);
      } else if (cfg.subMode === "dinic") {
        if (pick === "sink") onChange?.({ ...cfg, sinkNode: id } as unknown as Cfg);
        else onChange?.({ ...cfg, sourceNode: id } as unknown as Cfg);
      } else if (cfg.subMode === "lca") {
        if (pick === "v") onChange?.({ ...cfg, lcaV: id } as unknown as Cfg);
        else onChange?.({ ...cfg, lcaU: id } as unknown as Cfg);
      } else {
        onChange?.({ ...cfg, root: id } as unknown as Cfg);
      }
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
        <SplitPane
          top={
            <div style={{ flex: 1, minHeight: 0, border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column" }}>
              <GraphEditor
                key={`editor-${cfg.subMode}-${currentImp?.n ?? 0}-${currentImp?.spec ?? ""}`}
                initialGraph={currentImp}
                constraints={constraintsFor(cfg.subMode, isZh)}
                highlight={highlight}
                embedded
                onPickVertex={onPickVertex}
                onConfirm={(g) => onChange?.({ ...cfg, imp: g, source: "graph", confirmed: true } as unknown as Cfg)}
                title={isZh ? "图编辑器 · 点选即设参（高亮）· 右键菜单" : "Graph Editor · click to pick"}
              />
            </div>
          }
          bottom={<LeftMemoryPanel g={gForMem} isZh={isZh} />}
        />
      </div>
    );"""
        new_graph_render = """    const [memOpen, setMemOpen] = useState(false);
    const onPickVertex = (id: number) => {
      const pick = cfg.pick ?? "root";
      if (cfg.subMode === "astar") {
        if (pick === "target") onChange?.({ ...cfg, target: id } as unknown as Cfg);
        else onChange?.({ ...cfg, root: id } as unknown as Cfg);
      } else if (cfg.subMode === "dinic") {
        if (pick === "sink") onChange?.({ ...cfg, sinkNode: id } as unknown as Cfg);
        else onChange?.({ ...cfg, sourceNode: id } as unknown as Cfg);
      } else if (cfg.subMode === "lca") {
        if (pick === "v") onChange?.({ ...cfg, lcaV: id } as unknown as Cfg);
        else onChange?.({ ...cfg, lcaU: id } as unknown as Cfg);
      } else {
        onChange?.({ ...cfg, root: id } as unknown as Cfg);
      }
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative" }}>
        <div style={{ flex: memOpen ? "0 0 50%" : "1", minHeight: 0, border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column" }}>
          <GraphEditor
            key={`editor-${cfg.subMode}-${currentImp?.n ?? 0}-${currentImp?.spec ?? ""}`}
            initialGraph={currentImp}
            constraints={constraintsFor(cfg.subMode, isZh)}
            highlight={highlight}
            embedded
            onPickVertex={onPickVertex}
            onConfirm={(g) => onChange?.({ ...cfg, imp: g, source: "graph", confirmed: true } as unknown as Cfg)}
            title={isZh ? "图编辑器 · 点选即设参（高亮）· 右键菜单" : "Graph Editor · click to pick"}
          />
        </div>
        <div onClick={() => setMemOpen(!memOpen)} style={{ height: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, cursor: "pointer", marginTop: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#4338ca" }}>{memOpen ? (isZh ? "收起内存表示 ▾" : "Hide Memory ▾") : (isZh ? "展开内存表示 ▸" : "Show Memory ▸")}</span>
          <span style={{ fontSize: 10, color: "#64748b", marginLeft: 6 }}>{memOpen ? (isZh ? "占画布 50%" : "50%") : (isZh ? "默认折叠" : "collapsed")}</span>
        </div>
        {memOpen && (
          <div style={{ height: "50%", minHeight: 0, border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column", marginTop: 6 }}>
            <LeftMemoryPanel g={gForMem} isZh={isZh} />
          </div>
        )}
      </div>
    );"""
        if old_graph_render in t:
            t = t.replace(old_graph_render, new_graph_render)
            print(f"fixed graph {path}")
        else:
            print(f"graph old not found in {path}")
            # debug: find snippet
            idx = t.find("onPickVertex")
            print(t[idx-500:idx+1500][:2000])
    # For tree, similar but simpler: replace its Render left column which also uses SplitPane
    old_tree_render = """    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%", minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 380, border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column" }}>
          <GraphEditor
            key={`tree-${cfg.subMode}-${currentImp?.n ?? 0}-${currentImp?.spec ?? ""}`}
            initialGraph={currentImp ?? { n: 7, spec: "0-1,0-2,1-3,1-4,2-5,2-6", labels: ["4","2","6","1","3","5","7"], directed: false, root: 0, layout: "tree" }}
            constraints={{ mustBeTree: true, hint: isZh ? "树需 n-1 边且无环" : "needs tree" }}
            highlight={highlight}
            embedded
            onConfirm={(g) => onChange?.({ ...cfg, treeImp: g } as unknown as Cfg)}
            title={isZh ? "树编辑器 · 直接编辑" : "Tree Editor"}
          />
        </div>
        <LeftMemoryPanel g={gForMem} isZh={isZh} />
      </div>
    );"""
    new_tree_render = """    const [memOpen, setMemOpen] = useState(false);
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, position: "relative" }}>
        <div style={{ flex: memOpen ? "0 0 50%" : "1", minHeight: 0, border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column" }}>
          <GraphEditor
            key={`tree-${cfg.subMode}-${currentImp?.n ?? 0}-${currentImp?.spec ?? ""}`}
            initialGraph={currentImp ?? { n: 7, spec: "0-1,0-2,1-3,1-4,2-5,2-6", labels: ["4","2","6","1","3","5","7"], directed: false, root: 0, layout: "tree" }}
            constraints={{ mustBeTree: true, hint: isZh ? "树需 n-1 边且无环" : "needs tree" }}
            highlight={highlight}
            embedded
            onConfirm={(g) => onChange?.({ ...cfg, treeImp: g } as unknown as Cfg)}
            title={isZh ? "树编辑器 · 直接编辑" : "Tree Editor"}
          />
        </div>
        <div onClick={() => setMemOpen(!memOpen)} style={{ height: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, cursor: "pointer", marginTop: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#4338ca" }}>{memOpen ? (isZh ? "收起内存表示 ▾" : "Hide Memory ▾") : (isZh ? "展开内存表示 ▸" : "Show Memory ▸")}</span>
          <span style={{ fontSize: 10, color: "#64748b", marginLeft: 6 }}>{memOpen ? (isZh ? "占画布 50%" : "50%") : (isZh ? "默认折叠" : "collapsed")}</span>
        </div>
        {memOpen && (
          <div style={{ height: "50%", minHeight: 0, border: "1px solid #c7d2fe", borderRadius: 12, overflow: "hidden", background: "#fff", display: "flex", flexDirection: "column", marginTop: 6 }}>
            <LeftMemoryPanel g={gForMem} isZh={isZh} />
          </div>
        )}
      </div>
    );"""
    if old_tree_render in t:
        t = t.replace(old_tree_render, new_tree_render)
        print(f"fixed tree {path}")

    p.write_text(t, encoding='utf-8')
    print(f"done {path}")

