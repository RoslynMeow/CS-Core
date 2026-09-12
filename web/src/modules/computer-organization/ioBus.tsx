import { T } from "../../i18n/lang";
import { makeChapterStub } from "./chapterStub";

// =====================================================================
// I/O 系统与总线 · 占位
//   对应 tex/ComputerOrganization/chapters/io_bus.tex
// =====================================================================

export const ioBusModule = makeChapterStub({
  id: "io-bus",
  title: T("I/O 与总线", "I/O & Bus"),
  desc: T("I/O 层次 / 内存映射 / 轮询·中断·DMA / 总线与 PCIe / 磁盘与 SSD。", "I/O hierarchy / memory-mapped / polling, interrupt, DMA / bus & PCIe / disk & SSD."),
  tags: ["computer-organization", "io"],
  reuse: { zh: "与操作系统重叠: 组成原理讲总线/中断/DMA 硬件, OS 讲驱动与 I/O 调度", en: "Overlap with OS: hardware bus/interrupt/DMA here, drivers & scheduling in OS" },
  groups: [
    {
      v: "layers", zh: "I/O 系统层次", en: "Layers",
      items: [
        { zh: "设备 → 设备控制器 → 总线 → CPU/内存", en: "Device → controller → bus → CPU/memory" },
        { zh: "控制器寄存器: 状态 / 控制 / 数据", en: "Controller registers: status / control / data" },
        { zh: "CPU 通过寄存器与设备交互, 屏蔽设备差异", en: "CPU talks via registers, abstracting devices" },
      ],
    },
    {
      v: "mapped", zh: "内存映射 vs 独立 I/O", en: "Mapped I/O",
      items: [
        { zh: "内存映射 I/O: 设备寄存器占用地址空间, 用普通 load/store", en: "Memory-mapped: registers in address space, normal load/store" },
        { zh: "独立 I/O: 专用 in/out 指令与独立地址空间 (x86)", en: "Isolated I/O: dedicated in/out (x86)" },
        { zh: "内存映射更统一, 现代主流", en: "Memory-mapped dominates" },
      ],
    },
    {
      v: "sync", zh: "I/O 同步方式", en: "Synchronization",
      items: [
        { zh: "轮询: CPU 反复查状态位, 简单但忙等浪费", en: "Polling: busy-wait on status bit" },
        { zh: "中断: 设备就绪时通知 CPU; 保存现场 → ISR", en: "Interrupt: device notifies; context save → ISR" },
        { zh: "DMA: 设备直接与内存传输, 完成后中断; CPU 解放", en: "DMA: device ↔ memory directly, interrupt on done" },
        { zh: "中断优先级 / 屏蔽 / 向量表", en: "Priorities / masking / vector table" },
      ],
    },
    {
      v: "bus", zh: "总线与 PCIe", en: "Bus & PCIe",
      items: [
        { zh: "总线: 数据 / 地址 / 控制线, 多设备共享", en: "Bus: data/address/control lines shared" },
        { zh: "同步总线(时钟) vs 异步总线(握手)", en: "Synchronous (clock) vs asynchronous (handshake)" },
        { zh: "PCIe: 点对点串行、多 lane、分层(事务/数据链路/物理)", en: "PCIe: point-to-point serial, lanes, layered" },
        { zh: "带宽 vs 延迟: 串行高频取代并行宽总线", en: "Serial high-freq over wide parallel" },
      ],
    },
    {
      v: "storage", zh: "磁盘与固态存储", en: "Disk & SSD",
      items: [
        { zh: "HDD: 盘片/磁道/扇区; 寻道 + 旋转 + 传输", en: "HDD: platter/track/sector; seek + rotation + transfer" },
        { zh: "SSD: NAND 闪存, 无机械延迟; 磨损均衡 / GC", en: "SSD: NAND flash, no mechanics; wear leveling / GC" },
        { zh: "DMA + 大块传输摊薄开销", en: "DMA amortizes cost with large blocks" },
      ],
    },
    {
      v: "summary", zh: "系统总线架构总结", en: "Summary",
      items: [
        { zh: "北桥/南桥 → SoC 集成 (内存控制器/PCIe 进 CPU)", en: "North/South bridge → SoC integration" },
        { zh: "多核与并行 I/O, 缓存一致性互联", en: "Multicore & parallel I/O, coherent interconnect" },
        { zh: "I/O 是系统性能与 OS 交互的关键界面", en: "I/O is the key CPU/OS interface" },
      ],
    },
  ],
});
