# 内存可视化 · HEX 编辑器（Memory Visualizer）

> 路由 ` #/memory `（兼容旧 `#/memory-visualizer`），导航栏右上角 **内存可视化** 直达。本页用于把“结构化内存布局”以 HEX 编辑器形态可视化，输入为 `Base64(JSON)` 的 URL 直连或手动提交。**默认打开为空白**（`base=0x1000, total=64, allocations=[]` 的全空闲视图），仅当从 URL 载入 `?data=`、在 Base64 框点 **解析**、在 JSON 框输入后、或点击 **示例：基础 / 结构体** 时才渲染数据。

---

## 1. 访问方式

| 入口 | 说明 |
|------|------|
| **导航按钮** | 顶部 `hdr` 的 `内存可视化` 胶囊；`#/memory` 激活时高亮 |
| **URL 直连** | ` {origin}{pathname}#/memory?data=BASE64 `，页面加载即自动解码、渲染 |
| **手动 Base64** | 切到 `Base64` 标签页粘贴后点 **解析 Base64** |
| **手动 JSON** | 切到 `JSON` 标签页实时编辑（所见即所得），校验 / 转 Base64 / 复制 Base64 |

`?data=` 的别名均可：`?data` / `?d` / `?dump` / `?mem` / `?payload`，且同时兼容 `location.hash?data=` 与 `location.search?data=`（hash 优先）。修改后会触发 `hashchange` 自动重载。

分享链接在解析成功后自动生成，形式为 URL-safe Base64（`+/` → `-_`，去掉末尾 `=`），可直接复制分发。

---

## 2. 输入的 UTF-8 Base64

JSON 先按 **UTF-8** 编码再做 Base64，解码时按 URL-safe 归一化：

```
b64 -> pad('=') -> '-_' 还原为 '+/' -> atob -> TextDecoder(utf-8)
```

因此 `label`、`type` 等字段支持中文、不会出现 `btoa` 对非 latin-1 的乱码。手写 JS 生成示例：

```js
function b64EncodeJson(obj){
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
const link = `${location.origin}${location.pathname}#/memory?data=${b64EncodeJson(dump)}`;
```

解码失败或 JSON 解析失败会在输入区下方以红色块提示，`base/total` 回退到默认值，不会白屏。

---

## 3. 规定好的 JSON 格式

外层就是一个 JSON 对象，经 `Base64(JSON)` 后放入 `?data=`。缺省字段有默认值，整体兼容旧版本（无 `fields` 的纯块布局仍可渲染）。

```ts
type MemoryDump = {
  base?: number | string;   // 基址，默认 0x1000，支持 0x 前缀或十进制字符串/数字
  total?: number;           // 总字节，默认 128，范围 1..4096（越界回退 128）
  endian?: 'little'|'big'; // 仅影响多字节数值预览文案，默认 little
  allocations?: DumpAlloc[];
}

type DumpAlloc = {
  key: string;              // 必填，块唯一标识（用于图例、title 去重）
  addr: number | string;    // 必填，起始地址（同 base，支持 0x 或十进制）
  size: number;             // 必填，字节数（超出 total 的尾部被截断，<0 视为 0）
  label?: string;           // 展示名，默认 key
  color?: string;           // CSS 颜色，默认 #4f46e5
  hex?: string;             // 十六进制串，允许空格/换行，自动过滤非 [0-9a-f]，优先级最高
  data?: string;            // UTF-8 字符串，按字节循环填充至 size（仅当无 hex 时生效）
  fields?: DumpField[];     // 可选，结构体字段标注，详见 §4
}

type DumpField = {
  name: string;             // 必填，字段名
  offset: number;           // 必填，相对于所属 alloc 起始的字节偏移
  size: number;             // 必填，字段字节数
  type?: string;            // 展示用，如 "u32" / "i32" / "char[12]" / "ptr"
  color?: string;           // 覆盖 alloc 颜色，缺省继承 alloc.color
  value?: string | number;  // 预留，当前仅展示，不参与 hex 合成
}
```

### 解析规则（与 `buildDump` 一致）

1. `base/total/endian` 先规范化；`allocations` 非数组视为空数组。
2. 按 `allocations` 顺序写入 `Uint8Array(total)`：
   - `off = addr - base`，若 `off<0 || off>=total` 则整块跳过；
   - `size' = min(size, total - off)`；
   - `src = hexToBytes(hex)` 若 `hex` 非空，否则 `TextEncoder.encode(data)`，否则空；
   - 对 `i in [0,size')` 写入 `bytes[off+i] = src[i % src.length] & 0xff`，`src` 为空则填 `0x00`。
3. `hex` 中奇数位视为补 `0`（如 `"ABC"` → `AB C0`），大小写不敏感。
4. `data` 的 UTF-8 多字节（如中文）会展开为多字节再循环。
5. 重叠块按写入顺序后者覆盖前者；可视化层按 `addr` 升序排布，`addrToAlloc` 取最后写入者的映射用于着色。

---

## 4. fields：结构化标注（不改字节）

`fields` 仅做**叠加着色与表格**，与字节来源解耦。`offset/size` 必须满足 `0 <= offset`、`size>0`、`offset+size <= alloc.size`，否则该 field 被忽略。

渲染效果：

- HEX 单元格：若命中某 field，则背景取 `field.color ?? alloc.color`，底部有 2px 白线标记；
- ASCII 列：同色高亮；
- 右侧 **结构视图**：顶部为按 `size` 等比的段内比例条，下方逐字段显示 `hex 切片 / ASCII`、类型与 `+offset`。

示例见 `EXAMPLE_STRUCT`（需点击 **示例：结构体** 载入，默认不自动填充）：

```json
{
  "base": "0x1000",
  "total": 80,
  "endian": "little",
  "allocations": [
    {
      "key": "student", "addr": "0x1000", "size": 24,
      "label": "struct Student", "color": "#4f46e5",
      "hex": "2A000000640000004A6F686E20202020010000000000000000000000",
      "fields": [
        { "name": "id", "offset": 0, "size": 4, "type": "u32", "color": "#06b6d4" },
        { "name": "score", "offset": 4, "size": 4, "type": "i32", "color": "#10b981" },
        { "name": "name", "offset": 8, "size": 12, "type": "char[12]", "color": "#f59e0b" },
        { "name": "next", "offset": 20, "size": 4, "type": "ptr", "color": "#8b5cf6" }
      ]
    },
    {
      "key": "heap-int", "addr": "0x1020", "size": 16,
      "label": "int buffer[4]", "color": "#ec4899",
      "hex": "01000000020000000300000004000000",
      "fields": [
        { "name": "[0]", "offset": 0, "size": 4, "type": "i32" },
        { "name": "[1]", "offset": 4, "size": 4, "type": "i32" },
        { "name": "[2]", "offset": 8, "size": 4, "type": "i32" },
        { "name": "[3]", "offset": 12, "size": 4, "type": "i32" }
      ]
    }
  ]
}
```

---

## 5. HEX 编辑器交互

- **迷你内存条**（标题下方）：等比条带，色块=已分配，斜纹=空闲；点击色块选中该块首字节。
- **HEX 表**：`Address | Hex | ASCII`，默认 16 字节/行（可切 8/16/32），`ASCII` 可开关；
  - 已分配字节实心色块，未分配淡色边框；
  - hover 显示 `alloc (+field) @addr = 0xHH (dec)`；
  - 点击选中，底部详情条显示 `addr/off/hex/dec/char` 与归属 `alloc/field`。
- **结构视图**（右侧，<980px 时单列堆叠）：按地址升序卡片，点击卡片选中块首；卡片内比例条与字段列表，点击字段行可精确定位到该字段首地址。

---

## 6. 完整示例

### 6.1 最小可分享链接（hello）

```json
{ "base": "0x2000", "total": 48, "allocations": [{ "key": "s", "addr": "0x2000", "size": 8, "hex": "48656C6C6F212100", "label": "hello", "color": "#06b6d4" }] }
```

生成链接（浏览器控制台）：

```js
b64EncodeJson({ base:'0x2000', total:48, allocations:[{ key:'s', addr:'0x2000', size:8, hex:'48656C6C6F212100', label:'hello', color:'#06b6d4' }] })
```

### 6.2 链表节点（基础示例）

```json
{
  "base": "0x1000", "total": 64,
  "allocations": [
    { "key": "array", "addr": "0x1000", "size": 12, "hex": "0102030405060708090A0B0C", "label": "顺序表 A", "color": "#4f46e5" },
    { "key": "node0", "addr": "0x1010", "size": 8, "hex": "2A00000010100000", "label": "L[0]", "color": "#0ea5e9" },
    { "key": "node1", "addr": "0x1018", "size": 8, "hex": "2B00000000000000", "label": "L[1]", "color": "#f59e0b" }
  ]
}
```

### 6.3 data 回退（UTF-8 循环填充）

```json
{ "base": 4096, "total": 32, "allocations": [{ "key": "msg", "addr": 4096, "size": 16, "data": "Hi✓", "label": "utf8 demo" }] }
```

`✓` 为 3 字节 UTF-8，循环写入 16B 时自动按字节重复。

---

## 7. 约束与边界

- `total` 越界或非数字 → 128；`base` 非法 → 0x1000；`endian` 仅识别 `big`，其余为 `little`。
- 单块 `size` 超出 `total` 尾部会被截断；`off` 越界整块丢弃（不报错，仅不渲染）。
- `key` 重复时后者覆盖前者的 `addrToAlloc` 映射，内存条按排序后位置渲染，视觉上可能重叠（避免传入重叠的同 key）。
- `hex` 非法字符静默忽略，奇数长度补 `0`；空串等价于无 hex。
- `fields` 越界或重叠由调用方保证，本页不做合并校验，仅按 `offset` 排序展示。

---

## 8. 相关源码

- 页面：`web/src/pages/MemoryVisualizer.tsx`（`MemoryDump / DumpAlloc / DumpField`，`buildDump`，`EXAMPLE_BASIC / EXAMPLE_STRUCT`）
- 路由与入口：`web/src/App.tsx`（`Route kind='memory'`，`#/memory`，`hdr` 按钮）
- 适配说明：`web/src/lib/memory.ts` 为另一套“真堆沙盘”（`ArrayBuffer + DataView`），与本页的“快照式 HEX”互补；本页不依赖其运行时分配器，适合教学演示与外链分享。
