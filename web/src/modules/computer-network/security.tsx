import { T } from "../../i18n/lang";
import { MathText } from "../../lib/tex";
import type { Frame } from "../../engine/types";
import { Panel, Table, Note, Chips, NumField, TextField, isZh, makeChapter, type SubDef } from "./shared";

// =====================================================================
// 计算机网络 · 第8章 网络安全
//   对应 tex/ComputerNetwork/chapters/security.tex
//   symmetric(对称加密) / publickey(公钥与 RSA) / integrity(完整性与签名) / tls(TLS/HTTPS)
// =====================================================================

type SubMode = "symmetric" | "publickey" | "integrity" | "tls";

type Kv = [string, React.ReactNode];

// 用户驱动触发器：点击推进到下一帧（onNext）
function NextButton({ onNext, zh, zhLabel, enLabel, disabled, hint }: { onNext?: () => void; zh: boolean; zhLabel: string; enLabel: string; disabled?: boolean; hint?: string }) {
  const off = !!disabled || typeof onNext !== "function";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 12px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe" }}>
      <button disabled={off} onClick={(e) => { e.stopPropagation(); if (!off) onNext?.(); }} style={{ padding: "7px 18px", borderRadius: 999, border: "1px solid #c7d2fe", background: off ? "#f1f5f9" : "#4338ca", color: off ? "#94a3b8" : "#fff", fontWeight: 800, fontSize: 13, cursor: off ? "default" : "pointer", fontFamily: "inherit" }}>
        {zh ? zhLabel : enLabel}
      </button>
      {!off && hint && <span style={{ fontSize: 12, color: "#4338ca" }}>{hint}</span>}
    </div>
  );
}

// 内联「状态 / 数值」面板：每步从 scene 派生
function ValuePanel({ zh, rows }: { zh: boolean; rows: Kv[] }) {
  if (!rows.length) return null;
  return (
    <div style={{ display: "grid", gap: 6, padding: "10px 14px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <div style={{ fontWeight: 800, color: "#1e293b", fontSize: 13 }}>{zh ? "状态 / 数值" : "State / Values"}</div>
      <Table head={zh ? ["项", "值"] : ["Item", "Value"]} rows={rows as React.ReactNode[][]} />
    </div>
  );
}

// ---------- BigInt 模幂 / 扩展欧几里得（RSA 安全计算） ----------

function modpow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  if (b < 0n) b += mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    e >>= 1n;
    b = (b * b) % mod;
  }
  return result;
}

// 返回 [g, x, y] 使 a*x + b*y = g
function egcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  if (b === 0n) return [a, 1n, 0n];
  const [g, x1, y1] = egcd(b, a % b);
  return [g, y1, x1 - (a / b) * y1];
}

// d = e^{-1} mod phi，若不存在返回 null
function modinv(e: bigint, phi: bigint): bigint | null {
  const [g, x] = egcd(((e % phi) + phi) % phi, phi);
  if (g !== 1n) return null;
  return ((x % phi) + phi) % phi;
}

// =====================================================================
// symmetric — 对称加密 · CBC 分组链接（动画）
// =====================================================================

const SYM_DEFAULT = { n: 3 };
const CBC_POOL = ["0x1A", "0xB7", "0x3C", "0x5D", "0x2E"];
const CBC_IV = "0x9E";
const CBC_KEY = "0x5A";

// 逐字节异或（结果保持两位十六进制）
function hexXor(a: string, b: string): string {
  return "0x" + ((parseInt(a, 16) ^ parseInt(b, 16)) & 0xff).toString(16).toUpperCase().padStart(2, "0");
}

function SymmetricControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "明文块数 n" : "Blocks n"} value={config.n} onChange={(v) => set({ n: Math.round(v) })} min={1} max={5} width={90} />
    </div>
  );
}

type CbcScene = {
  block: number;
  blocks: string[];
  iv: string;
  chain: string[];
  mode: "enc" | "dec";
  phase: "init" | "xor" | "enc" | "send" | "dec";
  xor: string | null;
  plain: string | null;
  key: string;
};

function SymmetricRender({ scene, t, onNext }: any) {
  const zh = isZh(t);
  const s = (scene ?? { block: -1, blocks: [], iv: CBC_IV, chain: [], mode: "enc", phase: "init", xor: null, plain: null, key: CBC_KEY }) as CbcScene;
  const n = s.blocks.length;
  const dec = s.mode === "dec";
  const done = dec && s.block <= 0;
  const phaseLabel: Record<CbcScene["phase"], string> = zh
    ? { init: "生成随机 IV", xor: "先异或上一密文", enc: "分组加密 E_K", send: "发送 IV 与密文", dec: "解密后异或还原" }
    : { init: "random IV", xor: "XOR previous ciphertext", enc: "block encrypt E_K", send: "send IV & ciphertext", dec: "decrypt then XOR" };
  const rows: Kv[] = [
    [zh ? "IV = C0" : "IV = C0", s.iv],
    [zh ? "密钥 K" : "Key K", s.key],
    [zh ? "阶段" : "Phase", phaseLabel[s.phase]],
    [zh ? "当前块" : "Current block", s.block < 0 ? "—" : `P${s.block + 1}`],
    [zh ? "异或中间值 X" : "XOR value X", s.xor ?? "—"],
    [zh ? "密文链" : "Cipher chain", s.chain.length ? s.chain.join("  ") : "—"],
  ];
  const box = (bg: string, bd: string, fg: string): React.CSSProperties => ({ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 56, padding: "5px 9px", borderRadius: 9, background: bg, border: `1px solid ${bd}`, color: fg, fontFamily: "ui-monospace, monospace", fontSize: 12, lineHeight: 1.4 });
  const row = (cur: boolean, shown: boolean): React.CSSProperties => ({ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "7px 10px", borderRadius: 10, background: cur ? "#eef2ff" : "#f8fafc", border: `1px solid ${cur ? "#c7d2fe" : "#e2e8f0"}`, opacity: shown ? 1 : 0.45 });
  const arrow = (label: string) => <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap" }}>{label}</span>;
  const badge = (zh
    ? { init: "生成随机 IV", xor: "先异或上一密文", enc: "分组加密 E_K", send: "发送 IV 与密文", dec: "解密后异或还原" }
    : { init: "random IV", xor: "XOR previous ciphertext", enc: "block encrypt E_K", send: "send IV & ciphertext", dec: "decrypt then XOR" })[s.phase];
  return (
    <Panel>
      <NextButton zh={zh} onNext={onNext} disabled={done} hint={zh ? "点击推进 CBC：逐块异或、加密，再逆序解密" : "click to advance CBC: XOR and encrypt block by block, then decrypt"}
        zhLabel={done ? "解密完成" : s.phase === "dec" ? "解密下一块" : "加密下一块"} enLabel={done ? "done" : s.phase === "dec" ? "decrypt next block" : "encrypt next block"} />
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$C_i = E_K(P_i \oplus C_{i-1}), \qquad P_i = D_K(C_i) \oplus C_{i-1}$" />
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={box("#fef9c3", "#fde047", "#854d0e")}><b>IV = C₀</b><span>{s.iv}</span></div>
        <div style={box("#f1f5f9", "#cbd5e1", "#334155")}><b>K</b><span>{s.key}</span></div>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#4338ca", padding: "3px 10px", borderRadius: 999, background: "#eef2ff", border: "1px solid #c7d2fe" }}>{badge}</span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {s.blocks.map((p, i) => {
          const prev = i === 0 ? s.iv : s.chain[i - 1];
          if (dec) {
            const c = s.chain[i];
            const x = hexXor(c, s.key);
            const plain = hexXor(x, prev);
            const cur = i === s.block;
            const shown = i >= s.block;
            return (
              <div key={i} style={row(cur, shown)}>
                <div style={box("#dbeafe", "#93c5fd", "#1e40af")}><b>C{i + 1}</b><span>{c}</span></div>
                {arrow("→ D_K →")}
                <div style={box("#f1f5f9", "#cbd5e1", "#334155")}><b>X</b><span>{x}</span></div>
                {arrow(`⊕ C${i} →`)}
                <div style={box("#dcfce7", "#86efac", "#166534")}><b>P{i + 1}</b><span>{plain}</span></div>
              </div>
            );
          }
          const c = s.chain[i];
          const processed = c !== undefined || (i === s.block && s.phase === "xor");
          const x = processed ? hexXor(p, prev) : null;
          const cur = i === s.block;
          const shown = i <= s.block || s.block === n;
          return (
            <div key={i} style={row(cur, shown)}>
              <div style={box("#dcfce7", "#86efac", "#166534")}><b>P{i + 1}</b><span>{p}</span></div>
              {arrow("⊕")}
              <div style={box("#fef9c3", "#fde047", "#854d0e")}><b>C{i}</b><span>{prev}</span></div>
              {arrow("= X →")}
              <div style={box("#f1f5f9", "#cbd5e1", "#334155")}><b>X</b><span>{x ?? "?"}</span></div>
              {arrow("E_K →")}
              <div style={box("#dbeafe", "#93c5fd", "#1e40af")}><b>C{i + 1}</b><span>{c ?? "?"}</span></div>
            </div>
          );
        })}
      </div>
      <Note>{zh
        ? "每个明文块先与上一密文块异或、再加密：相同明文块得到不同密文；IV 随机且每报文唯一。解密时先解密、再异或还原。"
        : "Each plaintext block is XORed with the previous ciphertext before encryption: equal blocks yield different ciphertext; the IV is fresh per message. Decryption reverses the order."}</Note>
      <ValuePanel zh={zh} rows={rows} />
    </Panel>
  );
}

function symmetricGenerate(config: any): Frame<CbcScene>[] {
  const n = Math.max(1, Math.min(CBC_POOL.length, Math.round(config.n ?? 3)));
  const blocks = CBC_POOL.slice(0, n);
  const iv = CBC_IV;
  const chain: string[] = [];
  let prev = iv;
  for (const p of blocks) {
    const c = hexXor(hexXor(p, prev), CBC_KEY);
    chain.push(c);
    prev = c;
  }
  const base = { blocks, iv, key: CBC_KEY, xor: null as string | null, plain: null as string | null };
  const frames: Frame<CbcScene>[] = [];
  frames.push({ line: 0, caption: T("随机生成 $IV=C_0$（每次会话唯一）", "Random $IV=C_0$ (unique per session)"), scene: { ...base, block: -1, chain: [], mode: "enc", phase: "init" } });
  for (let i = 0; i < n; i++) {
    const prevC = i === 0 ? iv : chain[i - 1];
    const x = hexXor(blocks[i], prevC);
    frames.push({ line: 1, caption: T(`第 ${i + 1} 块：$P_{${i + 1}} \\oplus C_{${i}} = ${blocks[i]} \\oplus ${prevC} = ${x}$`, `Block ${i + 1}: $P_{${i + 1}} \\oplus C_{${i}} = ${blocks[i]} \\oplus ${prevC} = ${x}$`), scene: { ...base, block: i, chain: chain.slice(0, i), mode: "enc", phase: "xor", xor: x } });
    frames.push({ line: 2, caption: T(`加密得 $C_{${i + 1}} = E_K(${x}) = ${chain[i]}$`, `Encrypt $C_{${i + 1}} = E_K(${x}) = ${chain[i]}$`), scene: { ...base, block: i, chain: chain.slice(0, i + 1), mode: "enc", phase: "enc", xor: x } });
  }
  frames.push({ line: 3, caption: T(`发送 $IV$ 与密文 $C_1 \\dots C_${n}$`, `Send $IV$ and ciphertext $C_1 \\dots C_${n}$`), scene: { ...base, block: n, chain: chain.slice(), mode: "enc", phase: "send" } });
  for (let i = n - 1; i >= 0; i--) {
    const prevC = i === 0 ? iv : chain[i - 1];
    const x = hexXor(chain[i], CBC_KEY);
    const p = hexXor(x, prevC);
    frames.push({ line: 4, caption: T(`解密 $P_{${i + 1}} = D_K(C_{${i + 1}}) \\oplus C_{${i}} = ${x} \\oplus ${prevC} = ${p}$`, `Decrypt $P_{${i + 1}} = D_K(C_{${i + 1}}) \\oplus C_{${i}} = ${x} \\oplus ${prevC} = ${p}$`), scene: { ...base, block: i, chain: chain.slice(), mode: "dec", phase: "dec", xor: x, plain: p } });
  }
  return frames;
}

const CBC_CODE = [
  T("$C_0 \\gets IV$（随机）", "$C_0 \\gets IV$ (random)"),
  T("$X \\gets P_i \\oplus C_{i-1}$", "$X \\gets P_i \\oplus C_{i-1}$"),
  T("$C_i \\gets E_K(X)$", "$C_i \\gets E_K(X)$"),
  T("发送 $IV, C_1, \\dots, C_n$", "send $IV, C_1, \\dots, C_n$"),
  T("$P_i \\gets D_K(C_i) \\oplus C_{i-1}$", "$P_i \\gets D_K(C_i) \\oplus C_{i-1}$"),
];

// =====================================================================
// publickey — 公钥加密与 RSA
// =====================================================================

const RSA_DEFAULT = { p: 61, q: 53, e: 17, m: 65 };

function RsaControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  const set = (p: any) => onChange({ ...config, ...p });
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <NumField label={zh ? "素数 p" : "Prime p"} value={config.p} onChange={(v) => set({ p: Math.round(v) })} min={2} max={100000} width={90} />
      <NumField label={zh ? "素数 q" : "Prime q"} value={config.q} onChange={(v) => set({ q: Math.round(v) })} min={2} max={100000} width={90} />
      <NumField label={zh ? "指数 e" : "Exponent e"} value={config.e} onChange={(v) => set({ e: Math.round(v) })} min={2} max={100000} width={90} />
      <NumField label={zh ? "明文 m" : "Plaintext m"} value={config.m} onChange={(v) => set({ m: Math.round(v) })} min={0} max={1e9} width={100} />
    </div>
  );
}

type RsaScene = {
  step: number;
  p: bigint;
  q: bigint;
  n: bigint;
  phi: bigint;
  e: bigint;
  d: bigint | null;
  m: bigint;
  c: bigint | null;
  dec: bigint | null;
};

function RsaRender({ scene, t, onNext }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0 }) as RsaScene;
  const step = s.step ?? 0;
  const fmt = (v: bigint | null | undefined): string => (v === null || v === undefined ? "—" : `${v}`);
  const valueRows: Kv[] = [
    [zh ? "n = p·q" : "n = p·q", fmt(s.n)],
    [zh ? "φ(n) = (p−1)(q−1)" : "φ(n) = (p−1)(q−1)", fmt(s.phi)],
    [zh ? "公钥 e" : "Public e", fmt(s.e)],
    [zh ? "私钥 d" : "Private d", fmt(s.d)],
    [zh ? "密文 c = mᵉ mod n" : "Cipher c = mᵉ mod n", fmt(s.c)],
    [zh ? "解密 cᵈ mod n" : "Decrypt cᵈ mod n", fmt(s.dec)],
  ];
  const rows: [string, string][] = zh
    ? [
      ["① 选取素数", `p = ${s.p}，q = ${s.q}`],
      ["② n = p·q", fmt(s.n)],
      ["③ φ(n) = (p−1)(q−1)", fmt(s.phi)],
      ["④ 选取 e", `e = ${s.e}`],
      ["⑤ d = e⁻¹ mod φ(n)", s.d === null ? "不存在（gcd(e,φ)≠1）" : `${s.d}（${s.e}·${s.d} ≡ 1 mod φ）`],
      ["⑥ 密文 c = mᵉ mod n", s.c === null ? "—" : `${s.c}（m = ${s.m}）`],
      ["⑦ 解密 m = cᵈ mod n", s.dec === null ? "—" : `${s.dec}`],
    ]
    : [
      ["① Pick primes", `p = ${s.p}, q = ${s.q}`],
      ["② n = p·q", fmt(s.n)],
      ["③ φ(n) = (p−1)(q−1)", fmt(s.phi)],
      ["④ Choose e", `e = ${s.e}`],
      ["⑤ d = e⁻¹ mod φ(n)", s.d === null ? "none (gcd(e,φ)≠1)" : `${s.d} (${s.e}·${s.d} ≡ 1 mod φ)`],
      ["⑥ Cipher c = mᵉ mod n", s.c === null ? "—" : `${s.c} (m = ${s.m})`],
      ["⑦ Decrypt m = cᵈ mod n", s.dec === null ? "—" : `${s.dec}`],
    ];
  return (
    <Panel>
      <NextButton zh={zh} onNext={onNext} disabled={step >= 6} hint={zh ? "点击逐步完成 RSA：素数与模数、欧拉函数、求逆、加解密" : "click to run RSA step by step: primes, n, φ, inverse, encrypt/decrypt"}
        zhLabel={step >= 6 ? "已完成" : "计算下一步"} enLabel={step >= 6 ? "done" : "compute next step"} />
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$K^-(K^+(m)) = m, \qquad K^+(K^-(m)) = m$" />
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map(([a, b], i) => {
          const cur = i === step;
          return (
            <div key={a} style={{ display: "flex", gap: 12, padding: "8px 14px", borderRadius: 10, background: cur ? "#eef2ff" : "#f8fafc", border: `1px solid ${cur ? "#c7d2fe" : "#e2e8f0"}`, opacity: i <= step ? 1 : 0.45 }}>
              <span style={{ fontWeight: 800, color: cur ? "#4338ca" : "#3730a3", width: 172, flexShrink: 0, fontFamily: "ui-monospace, monospace" }}>{a}</span>
              <span style={{ fontSize: 13, color: "#334155", fontFamily: "ui-monospace, monospace" }}>{b}</span>
            </div>
          );
        })}
      </div>
      <ValuePanel zh={zh} rows={valueRows} />
      <Note tone={s.d === null ? "warn" : "info"}>
        {zh
          ? "e 必须与 φ(n) 互素才能求逆；朴素 RSA 需配合 OAEP 填充，且 n 要足够大（≥2048 位）以防分解。"
          : "e must be coprime to φ(n) to invert; plain RSA needs OAEP padding and n ≥ 2048 bits to resist factoring."}
      </Note>
      <Chips items={zh
        ? [["公钥 (n,e)", "公开用于加密/验证"], ["私钥 (n,d)", "保密用于解密/签名"], ["困难性", "大整数分解"]]
        : [["Public (n,e)", "encrypt / verify"], ["Private (n,d)", "decrypt / sign"], ["Hardness", "integer factoring"]]} />
    </Panel>
  );
}

function rsaGenerate(config: any): Frame<RsaScene>[] {
  const p = BigInt(Math.max(2, Math.round(config.p)));
  const q = BigInt(Math.max(2, Math.round(config.q)));
  const e = BigInt(Math.max(2, Math.round(config.e)));
  const n = p * q;
  const phi = (p - 1n) * (q - 1n);
  const d = modinv(e, phi);
  const mRaw = BigInt(Math.max(0, Math.round(config.m)));
  const m = n > 0n ? mRaw % n : 0n;
  const c = d !== null ? modpow(m, e, n) : null;
  const dec = c !== null && d !== null ? modpow(c, d, n) : null;
  const base: RsaScene = { step: 0, p, q, n, phi, e, d, m, c, dec };
  return [
    { line: 0, caption: T(`选两个素数 $p=${p}, q=${q}$`, `Pick primes $p=${p}, q=${q}$`), scene: { ...base, step: 0 } },
    { line: 1, caption: T(`计算模数 $n=p\\cdot q=${n}$`, `Compute $n=p\\cdot q=${n}$`), scene: { ...base, step: 1 } },
    { line: 2, caption: T(`欧拉函数 $\\varphi=(p-1)(q-1)=${phi}$`, `Euler $\\varphi=(p-1)(q-1)=${phi}$`), scene: { ...base, step: 2 } },
    { line: 3, caption: T(`选公开指数 $e=${e}$，要求 $\\gcd(e,\\varphi)=1$`, `Choose public exponent $e=${e}$, $\\gcd(e,\\varphi)=1$`), scene: { ...base, step: 3 } },
    { line: 4, caption: d === null ? T(`$e$ 与 $\\varphi$ 不互素，$d=e^{-1}$ 不存在`, `$e$ not coprime to $\\varphi$, $d=e^{-1}$ does not exist`) : T(`求私钥 $d=e^{-1} \\bmod \\varphi=${d}$`, `Private key $d=e^{-1} \\bmod \\varphi=${d}$`), scene: { ...base, step: 4 } },
    { line: 5, caption: c === null ? T(`无法加密（$d$ 不存在）`, `Cannot encrypt ($d$ missing)`) : T(`加密 $c=m^{e} \\bmod n=${c}$，公钥 $(n,e)=(${n},${e})$`, `Encrypt $c=m^{e} \\bmod n=${c}$, public $(n,e)=(${n},${e})$`), scene: { ...base, step: 5 } },
    { line: 6, caption: dec === null ? T(`无法解密（$d$ 不存在）`, `Cannot decrypt ($d$ missing)`) : T(`解密 $m=c^{d} \\bmod n=${dec}$，还原明文`, `Decrypt $m=c^{d} \\bmod n=${dec}$, recovered`), scene: { ...base, step: 6 } },
  ];
}
const RSA_CODE = [
  T("选取素数 $p,\\ q$", "choose primes $p,\\ q$"),
  T("$n \\gets p\\cdot q$", "$n \\gets p\\cdot q$"),
  T("$\\varphi \\gets (p-1)(q-1)$", "$\\varphi \\gets (p-1)(q-1)$"),
  T("选 $e$，$\\gcd(e,\\varphi)=1$", "choose $e$, $\\gcd(e,\\varphi)=1$"),
  T("$d \\gets e^{-1} \\bmod \\varphi$", "$d \\gets e^{-1} \\bmod \\varphi$"),
  T("$c \\gets m^{e} \\bmod n$", "$c \\gets m^{e} \\bmod n$"),
  T("$m \\gets c^{d} \\bmod n$", "$m \\gets c^{d} \\bmod n$"),
];

// =====================================================================
// integrity — 报文完整性与数字签名（动画）
// =====================================================================

const SIG_DEFAULT = { msg: "转账 100 元" };

// FNV-1a 玩具散列 → 8 位十六进制摘要
function toyHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).toUpperCase().padStart(8, "0");
}

// 玩具「私钥签名」：逐位与 0xA 异或（自逆，便于验证）
function toySign(hash: string): string {
  return hash.split("").map((c) => ((parseInt(c, 16) ^ 0xa) & 0xf).toString(16)).join("").toUpperCase();
}

function IntegrityControls({ config, onChange, t }: any) {
  const zh = isZh(t);
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <TextField label={zh ? "报文 m" : "Message m"} value={config.msg} onChange={(v) => onChange({ ...config, msg: v })} width={200} mono={false} />
    </div>
  );
}

type SigScene = { step: number; hash: string; signature: string; msg: string; ok: boolean };

function IntegrityRender({ scene, t, onNext }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0, hash: "", signature: "", msg: "", ok: false }) as SigScene;
  const step = s.step ?? 0;
  const valueRows: Kv[] = [
    [zh ? "报文 m" : "Message m", s.msg],
    [zh ? "摘要 h = H(m)" : "Digest h = H(m)", s.hash],
    [zh ? "签名 σ" : "Signature σ", s.signature],
    [zh ? "验证结果" : "Verify", s.ok ? (zh ? "通过" : "ok") : (zh ? "失败" : "fail")],
  ];
  const steps: [string, string][] = zh
    ? [
      ["① 报文 → 摘要", `m = ${s.msg} ⟶ h = H(m) = ${s.hash}`],
      ["② 私钥签名", `σ = K_A⁻(h) = ${s.signature}`],
      ["③ 发送", `(m, σ) = (${s.msg}, ${s.signature})`],
      ["④ 接收方散列", `h′ = H(m) = ${s.hash}`],
      ["⑤ 公钥验证", `K_A⁺(σ) = ${s.hash} ${s.ok ? "= h′ ✓" : "≠ h′ ✗"}`],
    ]
    : [
      ["① message → digest", `m = ${s.msg} ⟶ h = H(m) = ${s.hash}`],
      ["② sign (private)", `σ = K_A⁻(h) = ${s.signature}`],
      ["③ send", `(m, σ) = (${s.msg}, ${s.signature})`],
      ["④ receiver hash", `h′ = H(m) = ${s.hash}`],
      ["⑤ verify (public)", `K_A⁺(σ) = ${s.hash} ${s.ok ? "= h′ ✓" : "≠ h′ ✗"}`],
    ];
  return (
    <Panel>
      <NextButton zh={zh} onNext={onNext} disabled={step >= 4} hint={zh ? "点击推进：散列、私钥签名、发送、验证" : "click to advance: hash, sign, send, verify"}
        zhLabel={step >= 4 ? "验证完成" : "签名 / 发送"} enLabel={step >= 4 ? "verified" : "sign / send"} />
      <div style={{ textAlign: "center", fontSize: 14 }}>
        <MathText text="$h = H(m), \qquad \sigma = K_A^-(h), \qquad K_A^+(\sigma) \stackrel{?}{=} H(m)$" />
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {steps.map(([a, b], i) => {
          const cur = i === step;
          const mine = i < 3;
          const bg = mine ? "#eef2ff" : "#dcfce7";
          const bd = mine ? "#c7d2fe" : "#86efac";
          const fg = mine ? "#4338ca" : "#166534";
          return (
            <div key={a} style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 14px", borderRadius: 10, background: cur ? bg : "#f8fafc", border: `1px solid ${cur ? bd : "#e2e8f0"}`, opacity: i <= step ? 1 : 0.45 }}>
              <span style={{ fontWeight: 800, color: fg, width: 132, flexShrink: 0, fontSize: 13 }}>{a}</span>
              <span style={{ fontSize: 12, color: "#334155", fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>{b}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", padding: "0 4px" }}>
        <span>{zh ? "发送方 A（私钥 K_A⁻）" : "sender A (private K_A⁻)"}</span>
        <span>{zh ? "接收方 B（公钥 K_A⁺）" : "receiver B (public K_A⁺)"}</span>
      </div>
      <ValuePanel zh={zh} rows={valueRows} />
      <Note>{zh
        ? "先散列再签名：H(m) 让签名与报文长度无关；任何人有公钥都能验证，但只有 A 能用私钥签名——提供鉴别与不可否认。"
        : "Hash-then-sign: H(m) decouples signature size from the message; anyone with the public key can verify, but only A can sign—giving authentication and non-repudiation."}</Note>
      <Chips items={zh
        ? [["完整性", "改动后果 h′≠h"], ["鉴别", "仅 A 的私钥可签"], ["不可否认", "签名绑定身份"], ["证书", "CA 用私钥签发"]]
        : [["Integrity", "tamper ⇒ h′≠h"], ["Authentication", "only A can sign"], ["Non-repudiation", "signature binds identity"], ["Certificate", "CA signs with private key"]]} />
    </Panel>
  );
}

function integrityGenerate(config: any): Frame<SigScene>[] {
  const msg = String(config.msg ?? "");
  const hash = toyHash(msg);
  const signature = toySign(hash);
  const ok = toySign(signature) === hash;
  const base: SigScene = { step: 0, hash, signature, msg, ok };
  return [
    { line: 0, caption: T(`对报文求摘要 $h=H(m)=${hash}$`, `Hash the message $h=H(m)=${hash}$`), scene: { ...base, step: 0 } },
    { line: 1, caption: T(`用 A 的私钥签名 $\\sigma=K_A^-(h)=${signature}$`, `Sign with A's private key $\\sigma=K_A^-(h)=${signature}$`), scene: { ...base, step: 1 } },
    { line: 2, caption: T("发送 $(m, \\sigma)$ 给接收方", "Send $(m, \\sigma)$ to the receiver"), scene: { ...base, step: 2 } },
    { line: 3, caption: T(`接收方重新散列 $h'=H(m)=${hash}$`, `Receiver recomputes $h'=H(m)=${hash}$`), scene: { ...base, step: 3 } },
    { line: 4, caption: ok ? T("公钥验证通过，签名有效", "Public-key verification succeeds, signature valid") : T("验证失败，报文或签名被篡改", "Verification failed: message or signature altered"), scene: { ...base, step: 4 } },
  ];
}

const SIG_CODE = [
  T("$h \\gets H(m)$", "$h \\gets H(m)$"),
  T("$\\sigma \\gets K_A^-(h)$", "$\\sigma \\gets K_A^-(h)$"),
  T("发送 $(m, \\sigma)$", "send $(m, \\sigma)$"),
  T("$h' \\gets H(m)$", "$h' \\gets H(m)$"),
  T("$K_A^+(\\sigma) = h'$？", "$K_A^+(\\sigma) = h'$?"),
];

// =====================================================================
// tls — TLS 与 HTTPS
// =====================================================================

type TlsScene = { step: number };

function TlsRender({ scene, t, onNext }: any) {
  const zh = isZh(t);
  const s = (scene ?? { step: 0 }) as TlsScene;
  const step = s.step ?? 0;
  const steps: [string, string, string][] = zh
    ? [
      ["1", "ClientHello / ServerHello", "协商版本与算法、交换随机数"],
      ["2", "Certificate", "服务器发送证书（含公钥）"],
      ["3", "Verify", "客户机用 CA 公钥验证证书链与身份"],
      ["4", "Key exchange", "公钥加密交换会话密钥，或 ECDHE 协商"],
      ["5", "Finished", "双方用会话密钥派生密钥并校验握手完整性"],
      ["6", "Application data", "对称加密 + MAC/AEAD 保护后续数据"],
    ]
    : [
      ["1", "ClientHello / ServerHello", "negotiate version & ciphers, exchange nonces"],
      ["2", "Certificate", "server sends certificate (with public key)"],
      ["3", "Verify", "client verifies chain/identity with CA key"],
      ["4", "Key exchange", "encrypt session key with public key, or ECDHE"],
      ["5", "Finished", "derive keys from session secret, verify handshake"],
      ["6", "Application data", "symmetric encryption + MAC/AEAD"],
    ];
  const valueRows: Kv[] = [
    [zh ? "握手步骤" : "Handshake step", `${step + 1} / 6`],
    [zh ? "当前消息" : "Current message", steps[step]?.[1] ?? "—"],
    [zh ? "说明" : "Detail", steps[step]?.[2] ?? "—"],
  ];
  return (
    <Panel>
      <NextButton zh={zh} onNext={onNext} disabled={step >= 5} hint={zh ? "点击发送下一条握手消息，逐步建立 TLS 会话" : "click to send the next handshake message, establishing the TLS session"}
        zhLabel={step >= 5 ? "握手完成" : "发送握手消息"} enLabel={step >= 5 ? "handshake done" : "send handshake message"} />
      <div style={{ display: "grid", gap: 6 }}>
        {steps.map(([n, a, b], i) => {
          const cur = i === step;
          return (
            <div key={a} style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 14px", borderRadius: 10, background: cur ? "#eef2ff" : "#f8fafc", border: `1px solid ${cur ? "#c7d2fe" : "#e2e8f0"}`, opacity: i <= step ? 1 : 0.45 }}>
              <span style={{ fontWeight: 800, color: cur ? "#4338ca" : "#3730a3", width: 20 }}>{n}</span>
              <span style={{ fontWeight: 700, color: cur ? "#4338ca" : "#3730a3", width: 200, flexShrink: 0, fontSize: 13 }}>{a}</span>
              <span style={{ fontSize: 13, color: "#334155" }}>{b}</span>
            </div>
          );
        })}
      </div>
      <ValuePanel zh={zh} rows={valueRows} />
      <Note>{zh
        ? "前向保密：使用 ECDHE 时，每次会话的临时密钥在结束后销毁；即使服务器长期私钥泄露，也无法解密历史流量。"
        : "Forward secrecy: with ECDHE the ephemeral session key is destroyed after use, so leaking the long-term private key cannot decrypt past traffic."}</Note>
      <Chips items={zh
        ? [["机密性", "会话密钥对称加密"], ["完整性", "AEAD / MAC"], ["鉴别", "证书链"], ["前向保密", "ECDHE"]]
        : [["Confidentiality", "symmetric session key"], ["Integrity", "AEAD / MAC"], ["Authentication", "cert chain"], ["Forward secrecy", "ECDHE"]]} />
    </Panel>
  );
}

function tlsGenerate(_config: any): Frame<TlsScene>[] {
  return [
    { line: 0, caption: T("ClientHello / ServerHello：协商版本、密码套件并交换随机数", "ClientHello / ServerHello: negotiate version, ciphers and exchange nonces"), scene: { step: 0 } },
    { line: 1, caption: T("Certificate：服务器发送包含公钥的证书", "Certificate: server sends its certificate with public key"), scene: { step: 1 } },
    { line: 2, caption: T("Verify：客户机用 CA 公钥验证证书链与身份", "Verify: client validates chain/identity with CA public key"), scene: { step: 2 } },
    { line: 3, caption: T("Key exchange：用 ECDHE 协商会话密钥（前向保密）", "Key exchange: agree on a session key via ECDHE (forward secrecy)"), scene: { step: 3 } },
    { line: 4, caption: T("Finished：派生密钥并校验握手完整性", "Finished: derive keys and verify handshake integrity"), scene: { step: 4 } },
    { line: 5, caption: T("Application data：对称加密 + AEAD 保护后续数据", "Application data: symmetric encryption + AEAD"), scene: { step: 5 } },
  ];
}
const TLS_CODE = [
  T("ClientHello / ServerHello（随机数）", "ClientHello / ServerHello (nonces)"),
  T("Certificate（服务器证书）", "Certificate (server)"),
  T("Verify（验证证书链）", "Verify (cert chain)"),
  T("Key exchange（ECDHE）", "Key exchange (ECDHE)"),
  T("Finished（派生并校验）", "Finished (derive & verify)"),
  T("Application data（AEAD）", "Application data (AEAD)"),
];

const SUBS: Record<SubMode, SubDef> = {
  symmetric: { title: T("对称加密", "Symmetric"), defaultConfig: SYM_DEFAULT, Controls: SymmetricControls, Render: SymmetricRender, generate: symmetricGenerate, code: CBC_CODE },
  publickey: { title: T("公钥与 RSA", "Public Key/RSA"), defaultConfig: RSA_DEFAULT, Controls: RsaControls, Render: RsaRender, generate: rsaGenerate, code: RSA_CODE },
  integrity: { title: T("完整性与签名", "Integrity/Signature"), defaultConfig: SIG_DEFAULT, Controls: IntegrityControls, Render: IntegrityRender, generate: integrityGenerate, code: SIG_CODE },
  tls: { title: T("TLS / HTTPS", "TLS"), Render: TlsRender, generate: tlsGenerate, code: TLS_CODE },
};

export const { module: cnSecurityModule, GROUPS: cnSecurityGroups } = makeChapter<SubMode>({
  id: "cn-security",
  title: T("网络安全", "Network Security"),
  desc: T(
    "安全目标（机密性/完整性/鉴别/不可否认）、对称加密与 CBC、RSA 计算、散列与 MAC 与数字签名、TLS 握手与前向保密。",
    "Security goals, symmetric cipher & CBC, RSA computation, hash/MAC/signature, TLS handshake and forward secrecy.",
  ),
  tags: ["computer-network", "security"],
  groups: [
    { label: "安全", opts: [
      { v: "symmetric", zh: "对称加密", en: "Symmetric" },
      { v: "publickey", zh: "公钥与 RSA", en: "Public Key/RSA" },
      { v: "integrity", zh: "完整性与签名", en: "Integrity/Signature" },
      { v: "tls", zh: "TLS / HTTPS", en: "TLS" },
    ] },
  ],
  subs: SUBS,
});
