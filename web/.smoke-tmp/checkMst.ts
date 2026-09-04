import { graphUnifiedModule } from "../src/modules/graph/unified";
const M: any = graphUnifiedModule;
function framesOf(r: any): any[] { if (Array.isArray(r)) return r; if (r && Array.isArray(r.frames)) return r.frames; return []; }
for (const sub of ["prim","kruskal"]) {
  const cfg = { ...(M.defaultConfig as any), subMode: sub };
  const frames = framesOf(M.generate(cfg));
  const last = frames[frames.length-1]?.scene as any;
  console.log(sub, "frames", frames.length, "picked", last?.picked?.length, "dimUnpicked", last?.dimUnpicked, "edges", last?.edges?.length, "directed", last?.directed);
  // also check second last not dim
  const prev = frames[frames.length-2]?.scene as any;
  console.log(" prev dim", prev?.dimUnpicked);
}
