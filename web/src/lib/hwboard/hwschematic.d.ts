declare module 'd3-hwschematic' {
  export class HwSchematic {
    constructor(svg: unknown);
    bindData(graph: unknown): Promise<void>;
    terminate(): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeRenderers: { registerRenderer(r: any): void };
  }
}
