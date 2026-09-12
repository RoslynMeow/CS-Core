/**
 * 电路通用库 · 对外入口
 * ==================
 * 纯 TS，无 React/DOM 依赖。消费者（画布/页面）从这里取：
 *   - 网表类型与工具：Component / Circuit / circuitNodes / componentValue …
 *   - 求解器：solveDC（后续追加 solveTransient / solveAC）
 *   - 预置电路与布局：presets
 */
export * from './netlist';
export * from './mna';
export * from './presets';
