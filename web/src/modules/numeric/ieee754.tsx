import { T } from "../../i18n/lang";
import type { Frame, ModuleDef } from "../../engine/types";
import { MathText } from "../../lib/tex";

type Mode = "encode" | "decode";
type Prec = 32 | 64;
type Cfg = {
  mode: Mode;
  prec: Prec;
  decimal: string;
  s: number;
  e: string;
  m: string;
};
const DEFAULT_CFG: Cfg = {
  mode: "encode",
  prec: 32 as Prec,
  decimal: "3.14",
  s: 0,
  e: "10000000",
  m: "1" + "0".repeat(22),
};
type Scene = {
  mode: Mode;
  prec: Prec;
  decimal: string;
  s: number;
  eBits: string;
  mBits: string;
  Eraw: number;
  Mraw: number;
  bias: number;
  kind: "zero" | "denorm" | "normal" | "inf" | "nan" | "invalid";
  exp: number;
  mant: number;
  value: number | null;
  bits: string;
};

function info(prec: Prec) {
  if (prec === 64) return { eLen: 11, mLen: 52, bias: 1023, eMax: 2047 };
  return { eLen: 8, mLen: 23, bias: 127, eMax: 255 };
}
function parseBin(s: string, len: number): number | null {
  if (s.length !== len || !/^[01]+$/.test(s)) return null;
  if (len <= 31) {
    let v = 0;
    for (const ch of s) v = (v << 1) | (ch === "1" ? 1 : 0);
    return v;
  } else {
    // 52 bits may exceed 32-bit, use BigInt then Number if safe else parse via loop with float
    let v = 0;
    for (const ch of s) v = v * 2 + (ch === "1" ? 1 : 0);
    return v;
  }
}
function floatBits(f: number, prec: Prec): string {
  if (prec === 32) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, f, false);
    const u = new DataView(buf).getUint32(0, false);
    return u.toString(2).padStart(32, "0");
  } else {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, f, false);
    const hi = new DataView(buf).getUint32(0, false);
    const lo = new DataView(buf).getUint32(4, false);
    const hiStr = hi.toString(2).padStart(32, "0");
    const loStr = lo.toString(2).padStart(32, "0");
    return (hiStr + loStr).padStart(64, "0");
  }
}
function classify(E: number, M: number, prec: Prec): Scene["kind"] {
  const { eMax } = info(prec);
  if (E === eMax) return M === 0 ? "inf" : "nan";
  if (E === 0) return M === 0 ? "zero" : "denorm";
  return "normal";
}

function decodeScene(
  s: number,
  eStr: string,
  mStr: string,
  prec: Prec,
): { scene: Scene; E: number; M: number } {
  const { bias, eMax, mLen } = info(prec);
  const E = parseBin(eStr, info(prec).eLen) ?? 0;
  const M = parseBin(mStr, mLen) ?? 0;
  const bits = `${s}${eStr}${mStr}`;
  const kind = classify(E, M, prec);
  let exp = 0,
    mant = 0,
    value: number | null = null;
  if (kind === "normal") {
    exp = E - bias;
    mant = 1 + M / 2 ** mLen;
    value = (-1) ** s * mant * 2 ** exp;
  } else if (kind === "denorm") {
    exp = 1 - bias;
    mant = M / 2 ** mLen;
    value = (-1) ** s * mant * 2 ** exp;
  } else if (kind === "zero") value = s === 0 ? 0 : -0;
  else if (kind === "inf") value = s === 0 ? Infinity : -Infinity;
  const decimal = value === null ? "NaN" : String(value);
  const scene: Scene = {
    mode: "decode",
    prec,
    decimal,
    s,
    eBits: eStr,
    mBits: mStr,
    Eraw: E,
    Mraw: M,
    bias,
    kind,
    exp,
    mant,
    value,
    bits,
  };
  void eMax;
  return { scene, E, M };
}

function encodeDecimal(
  decimalStr: string,
  prec: Prec,
):
  | {
      ok: true;
      s: number;
      eStr: string;
      mStr: string;
      bits: string;
      value: number;
      kind: Scene["kind"];
      E: number;
      M: number;
      exp: number;
      mant: number;
    }
  | { ok: false; reason: string } {
  const t = decimalStr.trim();
  const low = t.toLowerCase();
  const { eLen, mLen } = info(prec);
  const eMax = info(prec).eMax;
  if (low === "nan" || low === "+nan" || low === "-nan") {
    const eStr = "1".repeat(eLen);
    const mStr = "1" + "0".repeat(mLen - 1);
    const bits = `0${eStr}${mStr}`;
    return {
      ok: true,
      s: 0,
      eStr,
      mStr,
      bits,
      value: NaN,
      kind: "nan",
      E: eMax,
      M: 2 ** (mLen - 1),
      exp: 0,
      mant: 0,
    };
  }
  if (
    low === "inf" ||
    low === "+inf" ||
    low === "infinity" ||
    low === "+infinity"
  ) {
    const eStr = "1".repeat(eLen);
    const mStr = "0".repeat(mLen);
    const bits = `0${eStr}${mStr}`;
    return {
      ok: true,
      s: 0,
      eStr,
      mStr,
      bits,
      value: Infinity,
      kind: "inf",
      E: eMax,
      M: 0,
      exp: 0,
      mant: 0,
    };
  }
  if (low === "-inf" || low === "-infinity") {
    const eStr = "1".repeat(eLen);
    const mStr = "0".repeat(mLen);
    const bits = `1${eStr}${mStr}`;
    return {
      ok: true,
      s: 1,
      eStr,
      mStr,
      bits,
      value: -Infinity,
      kind: "inf",
      E: eMax,
      M: 0,
      exp: 0,
      mant: 0,
    };
  }
  const num = Number(t);
  if (Number.isNaN(num)) return { ok: false, reason: "非数字" };
  const bits = floatBits(num, prec);
  const s = bits[0] === "1" ? 1 : 0;
  const eStr = bits.slice(1, 1 + eLen);
  const mStr = bits.slice(1 + eLen);
  const E = parseInt(eStr, 2);
  const Mraw = mStr ? parseInt(mStr.slice(-31) || "0", 2) : 0; // for classify we need full M; use BigInt safe? for 52 bits parse via loop
  let M = 0;
  for (const ch of mStr) M = M * 2 + (ch === "1" ? 1 : 0);
  const kind = classify(E, M, prec);
  let exp = 0,
    mant = 0;
  const { bias } = info(prec);
  if (kind === "normal") {
    exp = E - bias;
    mant = 1 + M / 2 ** mLen;
  } else if (kind === "denorm") {
    exp = 1 - bias;
    mant = M / 2 ** mLen;
  }
  void Mraw;
  return { ok: true, s, eStr, mStr, bits, value: num, kind, E, M, exp, mant };
}

const CODE = {
  encode: [
    T(
      "$abs \\gets |x|,\\; S \\gets (x<0?1:0)$",
      "$abs \\gets |x|,\\; S \\gets (x<0?1:0)$",
    ),
    T(
      "if $abs=0$ → $E\\gets0$, $M\\gets0$ // \\pm0",
      "if $abs=0$ → $E\\gets0$, $M\\gets0$",
    ),
    T(
      "else if $abs=\\infty$/NaN → $E\\gets2^{k}-1$",
      "else if $abs=\\infty$/NaN → $E\\gets2^{k}-1$",
    ),
    T(
      "$e \\gets \\lfloor\\log_2 abs\\rfloor$",
      "$e \\gets \\lfloor\\log_2 abs\\rfloor$",
    ),
    T(
      "  if $e < 1-Bias$ → $E\\gets0$, $M\\gets round(abs\\cdot2^{Bias-1+mLen})$ // 非规格化",
      "  if $e < 1-Bias$ → denorm",
    ),
    T(
      "  else $E\\gets e+Bias$, $M\\gets round((abs/2^{e}-1)\\cdot2^{mLen})$",
      "  else $E\\gets e+Bias$, $M$",
    ),
    T("$bits \\gets S|E|M$", "$bits \\gets S|E|M$"),
  ] as never,
  decode: [
    T(
      "$S \\gets b_{prec-1},\\; E \\gets e_{k-1}\\dots e_0,\\; M \\gets m_{t-1}\\dots m_0$",
      "$S,E,M$",
    ),
    T("if $E=2^{k}-1$:", "if $E=2^k-1$:"),
    T(
      "  $M=0 \\implies \\pm\\infty$ else $\\text{NaN}$",
      "  $M=0 \\implies \\pm\\infty$ else NaN",
    ),
    T("if $E=0$:", "if $E=0$:"),
    T(
      "  $M=0 \\implies \\pm0$ else $x=(-1)^S\\cdot0.M\\cdot2^{1-Bias}$",
      "  denorm",
    ),
    T(
      "else $x=(-1)^S\\cdot1.M\\cdot2^{E-Bias}$",
      "else $x=(-1)^S 1.M 2^{E-Bias}$",
    ),
  ] as never,
};

function genEncode(decimalStr: string, prec: Prec): Frame<Scene>[] {
  const frames: Frame<Scene>[] = [];
  const enc = encodeDecimal(decimalStr, prec);
  const { eLen, mLen, bias } = info(prec);
  const qE = "?".repeat(eLen);
  const qM = "?".repeat(mLen);
  const qBits = "?".repeat(prec);
  if (!enc.ok) {
    return [
      {
        line: 0,
        caption: T(
          `! 无法解析 “${decimalStr}”`,
          `Cannot parse “${decimalStr}”`,
        ),
        scene: {
          mode: "encode",
          prec,
          decimal: decimalStr,
          s: 0,
          eBits: "0".repeat(eLen),
          mBits: "0".repeat(mLen),
          Eraw: 0,
          Mraw: 0,
          bias,
          kind: "invalid",
          exp: 0,
          mant: 0,
          value: null,
          bits: "0".repeat(prec),
        },
      },
    ];
  }
  const { s, eStr, mStr, bits, value, kind, E, M, exp, mant } = enc;
  const mk = (
    k: Scene["kind"],
    eB: string,
    mB: string,
    b: string,
    exp2: number,
    mant2: number,
    v: number | null,
  ): Scene => ({
    mode: "encode",
    prec,
    decimal: decimalStr,
    s,
    eBits: eB,
    mBits: mB,
    Eraw: kind === "invalid" ? 0 : E,
    Mraw: kind === "invalid" ? 0 : M,
    bias,
    kind: k,
    exp: exp2,
    mant: mant2,
    value: v,
    bits: b,
  });
  const absVal = Number.isFinite(value) ? Math.abs(value as number) : value;
  // step 0: input, all unknown
  frames.push({
    line: 0,
    caption: T(
      `输入 $x=${decimalStr}$，$prec=${prec}$`,
      `Input $x=${decimalStr}$`,
    ),
    scene: mk("invalid", qE, qM, qBits, 0, 0, value),
  });
  // step 0 second frame: S determined, E/M still ?
  frames.push({
    line: 0,
    caption: T(
      `$abs=|x|=${absVal}$, $S=${s}$（${s === 1 ? "负" : "正"}）`,
      `$abs=${absVal}$ $S=${s}$`,
    ),
    scene: mk(kind, qE, qM, `${s}${qE}${qM}`, 0, 0, value),
  });
  if (kind === "zero") {
    // E/M become known as 0
    frames.push({
      line: 1,
      caption: T(`$abs=0$ → $E=0$, $M=0$`, `$abs=0$`),
      scene: mk(
        kind,
        "0".repeat(eLen),
        "0".repeat(mLen),
        `${s}${"0".repeat(eLen)}${"0".repeat(mLen)}`,
        0,
        0,
        value,
      ),
    });
    frames.push({
      line: 6,
      caption: T(
        `$bits=${bits.slice(0, 1)}|${bits.slice(1, 1 + eLen)}|${bits.slice(1 + eLen).slice(0, 8)}\\dots$`,
        `$bits`,
      ),
      scene: mk(kind, eStr, mStr, bits, 0, 0, value),
    });
    return frames;
  }
  if (kind === "inf") {
    frames.push({
      line: 2,
      caption: T(`$abs=\\infty$ → $E=2^{${eLen}}-1$, $M=0$`, `inf`),
      scene: mk(
        kind,
        "1".repeat(eLen),
        "0".repeat(mLen),
        `${s}${"1".repeat(eLen)}${"0".repeat(mLen)}`,
        0,
        0,
        value,
      ),
    });
    frames.push({
      line: 6,
      caption: T(`$bits=${bits}$`, `$bits`),
      scene: mk(kind, eStr, mStr, bits, 0, 0, value),
    });
    return frames;
  }
  if (kind === "nan") {
    frames.push({
      line: 2,
      caption: T(`$abs=\\text{NaN}$ → $E=2^{${eLen}}-1$, $M\\neq0$`, `NaN`),
      scene: mk(
        kind,
        "1".repeat(eLen),
        "1" + "?".repeat(mLen - 1),
        `${s}${"1".repeat(eLen)}${"1" + "?".repeat(mLen - 1)}`,
        0,
        0,
        value,
      ),
    });
    frames.push({
      line: 6,
      caption: T(`$bits=${bits}$`, `$bits`),
      scene: mk(kind, eStr, mStr, bits, 0, 0, value),
    });
    return frames;
  }
  // e determined, E/M still ?
  frames.push({
    line: 3,
    caption: T(
      `$e=\\lfloor\\log_2 abs\\rfloor=${Number.isFinite(exp) ? exp : "—"}$`,
      `$e=${exp}$`,
    ),
    scene: mk(kind, qE, qM, `${s}${qE}${qM}`, exp, 0, value),
  });
  if (kind === "denorm") {
    frames.push({
      line: 4,
      caption: T(`$e=${exp} < 1-${bias}$ → 非规格化`, `denorm $e<1-Bias$`),
      scene: mk(kind, qE, qM, `${s}${qE}${qM}`, exp, mant, value),
    });
    // E=0 known, M about to be computed
    frames.push({
      line: 4,
      caption: T(
        `$E\\gets0$, $M\\gets round(abs\\cdot2^{${bias - 1 + info(prec).mLen}})=${M}$`,
        `$M=${M}$`,
      ),
      scene: mk(
        kind,
        "0".repeat(eLen),
        mStr,
        `${s}${"0".repeat(eLen)}${mStr}`,
        exp,
        mant,
        value,
      ),
    });
    frames.push({
      line: 6,
      caption: T(`$bits=${bits}$`, `$bits`),
      scene: mk(kind, eStr, mStr, bits, exp, mant, value),
    });
    return frames;
  }
  // normal: E and M become known step by step
  frames.push({
    line: 4,
    caption: T(`$e<1-Bias$? 否 → 规格化`, `e>=1-Bias normal`),
    scene: mk(kind, qE, qM, `${s}${qE}${qM}`, exp, mant, value),
  });
  frames.push({
    line: 5,
    caption: T(
      `$E\\gets e+${bias}=${E}$, $M\\gets round((abs/2^{e}-1)\\cdot2^{${info(prec).mLen}})=${M}$`,
      `$E=${E}$ $M=${M}$`,
    ),
    scene: mk(kind, eStr, qM, `${s}${eStr}${qM}`, exp, mant, value),
  });
  // M known
  frames.push({
    line: 5,
    caption: T(`$M$ 已求得`, `$M`),
    scene: mk(kind, eStr, mStr, `${s}${eStr}${mStr}`, exp, mant, value),
  });
  frames.push({
    line: 6,
    caption: T(`$bits=S|E|M=${bits.slice(0, 16)}\\dots$`, `$bits`),
    scene: mk(kind, eStr, mStr, bits, exp, mant, value),
  });
  return frames;
}

function genDecode(
  s: number,
  eStr: string,
  mStr: string,
  prec: Prec,
): Frame<Scene>[] {
  const { scene, E, M } = decodeScene(s, eStr, mStr, prec);
  const frames: Frame<Scene>[] = [];
  frames.push({
    line: 0,
    caption: T(
      `取场 $S=${s}$, $E=${eStr}=${E}$, $M=${mStr.slice(0, 6)}\\dots$`,
      `Fields`,
    ),
    scene,
  });
  frames.push({
    line: 1,
    caption: T(`$E=${E}$，$M=${M === 0 ? "0" : "\\neq0"}$`, `$E=${E}$`),
    scene: { ...scene, Eraw: E, Mraw: M },
  });
  const { eMax } = info(prec);
  if (E === eMax) {
    if (M === 0) {
      frames.push({
        line: 2,
        caption: T(`$E=2^{k}-1$ 且 $M=0$ → $\\pm\\infty$`, `inf`),
        scene: { ...scene, kind: "inf", value: s === 0 ? Infinity : -Infinity },
      });
      frames.push({
        line: 5,
        caption: T(s === 0 ? `$+\\infty$` : `$-\\infty$`, `inf`),
        scene: { ...scene, kind: "inf", value: s === 0 ? Infinity : -Infinity },
      });
    } else {
      frames.push({
        line: 2,
        caption: T(`$E=2^{k}-1$ $M\\neq0$ → $\\text{NaN}$`, `NaN`),
        scene: { ...scene, kind: "nan", value: null },
      });
      frames.push({
        line: 5,
        caption: T(`$\\text{NaN}$`, `NaN`),
        scene: { ...scene, kind: "nan", value: null },
      });
    }
    return frames;
  }
  if (E === 0) {
    if (M === 0) {
      frames.push({
        line: 3,
        caption: T(`$E=0$ $M=0$ → $\\pm0$`, `±0`),
        scene: { ...scene, kind: "zero", value: s === 0 ? 0 : -0 },
      });
      frames.push({
        line: 5,
        caption: T(s === 0 ? `$+0$` : `$-0$`, `±0`),
        scene: { ...scene, kind: "zero", value: s === 0 ? 0 : -0 },
      });
    } else {
      const { bias, mLen } = info(prec);
      const exp = 1 - bias,
        mant = M / 2 ** mLen,
        value = (-1) ** s * mant * 2 ** exp;
      frames.push({
        line: 3,
        caption: T(`$E=0$ $M\\neq0$ → 非规格化`, `denorm`),
        scene: { ...scene, kind: "denorm", exp, mant, value },
      });
      frames.push({
        line: 4,
        caption: T(
          `$x=(-1)^{${s}}0.${mStr.slice(0, 4)}\\dots2^{${exp}}\\approx${value.toExponential(3)}$`,
          `denorm`,
        ),
        scene: { ...scene, kind: "denorm", exp, mant, value },
      });
      frames.push({
        line: 5,
        caption: T(`$x\\approx${value}$`, `≈${value}`),
        scene: { ...scene, kind: "denorm", exp, mant, value },
      });
    }
    return frames;
  }
  const { bias, mLen } = info(prec);
  const exp = E - bias,
    mant = 1 + M / 2 ** mLen,
    value = (-1) ** s * mant * 2 ** exp;
  frames.push({
    line: 5,
    caption: T(`$x=(-1)^{${s}}1.M2^{${exp}}\\approx${value}$`, `≈${value}`),
    scene: { ...scene, kind: "normal", exp, mant, value },
  });
  return frames;
}

export const ieee754Module: ModuleDef<Scene, Cfg> = {
  id: "ieee754",
  title: T("IEEE 754 浮点", "IEEE 754 Float"),
  desc: T(
    "十进制 ↔ $S|E|M$，32 位 $Bias127$ / 64 位 $Bias1023$，特殊值同理。",
    "Decimal ↔ $S|E|M$, 32/64-bit.",
  ),
  tags: ["data-structures", "computer-organization"],
  defaultConfig: DEFAULT_CFG,
  randomize(c) {
    if (c.mode === "encode") {
      const vals = ["0", "-0", "1", "-2.5", "0.1", "3.14", "1e-30", "3.4e38"];
      return { ...c, decimal: vals[Math.floor(Math.random() * vals.length)] };
    } else {
      const { eLen, mLen } = info(c.prec);
      const eMax = info(c.prec).eMax;
      const s = Math.random() < 0.5 ? 0 : 1;
      const eVal = 1 + Math.floor(Math.random() * (eMax - 1));
      const e = eVal.toString(2).padStart(eLen, "0");
      const m = Array.from({ length: mLen }, () =>
        Math.random() < 0.5 ? "0" : "1",
      ).join("");
      return { ...c, s, e, m };
    }
  },
  Controls({ config, onChange, t }) {
    const isZh = t(T("中文", "en")) !== "en";
    const { eLen, mLen } = info(config.prec);
    const presets: { label: string; decimal: string }[] = [
      { label: "1.0", decimal: "1" },
      { label: "3.14", decimal: "3.14" },
      { label: "0.1", decimal: "0.1" },
      { label: "1e-40(非规格化)", decimal: "1e-40" },
      { label: "+0", decimal: "0" },
      { label: "-0", decimal: "-0" },
      { label: "+Inf", decimal: "Infinity" },
      { label: "-Inf", decimal: "-Infinity" },
      { label: "NaN", decimal: "NaN" },
    ];
    return (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "8px 10px",
            borderRadius: 12,
            background: "#eef2ff",
            border: "1px solid #c7d2fe",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 800, color: "#4338ca" }}>
            {isZh ? "模式" : "MODE"}
          </span>
          <label
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              fontSize: 13,
            }}
          >
            <span>{t(T("方向", "Mode"))}</span>
            <select
              className="txt"
              value={config.mode}
              onChange={(e) =>
                onChange({ ...config, mode: e.target.value as Mode })
              }
            >
              <option value="encode">
                {t(T("十进制 → 位", "Dec → Bits"))}
              </option>
              <option value="decode">
                {t(T("位 → 十进制", "Bits → Dec"))}
              </option>
            </select>
          </label>
          <label
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              fontSize: 13,
            }}
          >
            <span>{t(T("精度", "Prec"))}</span>
            <select
              className="txt"
              value={config.prec}
              onChange={(e) => {
                const prec = Number(e.target.value) as Prec;
                const { eLen: nl, mLen: ml } = info(prec);
                // adapt E/M lengths
                let ne = config.e,
                  nm = config.m;
                if (ne.length !== nl) ne = ne.padStart(nl, "0").slice(-nl);
                if (nm.length !== ml) nm = (nm + "0".repeat(ml)).slice(0, ml);
                // if encode, re-encode decimal under new prec
                const enc = encodeDecimal(config.decimal, prec);
                if (enc.ok)
                  onChange({
                    ...config,
                    prec,
                    s: enc.s,
                    e: enc.eStr,
                    m: enc.mStr,
                  });
                else onChange({ ...config, prec, e: ne, m: nm });
              }}
            >
              <option value={32}>32 位 (float)</option>
              <option value={64}>64 位 (double)</option>
            </select>
          </label>
          <label
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              fontSize: 13,
            }}
          >
            <span>{t(T("预设", "Preset"))}</span>
            <select
              className="txt"
              value=""
              onChange={(e) => {
                const d = e.target.value;
                if (!d) return;
                if (config.mode === "encode")
                  onChange({ ...config, decimal: d });
                else {
                  const enc = encodeDecimal(d, config.prec);
                  if (enc.ok)
                    onChange({ ...config, s: enc.s, e: enc.eStr, m: enc.mStr });
                }
              }}
            >
              <option value="">{t(T("选择…", "Pick…"))}</option>
              {presets.map((p) => (
                <option key={p.label} value={p.decimal}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "8px 10px",
            borderRadius: 12,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>
            {isZh ? "参数" : "PARAMS"}
          </span>
          {config.mode === "encode" ? (
            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontSize: 13,
              }}
            >
              <span>
                <MathText text="$x$" />
              </span>
              <input
                className="txt"
                value={config.decimal}
                onChange={(e) =>
                  onChange({ ...config, decimal: e.target.value })
                }
                style={{ width: 160 }}
                placeholder="3.14 / -0 / Infinity / NaN"
              />
            </label>
          ) : (
            <>
              <label
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <span>
                  <MathText text="$S$" />
                </span>
                <select
                  className="txt"
                  value={config.s}
                  onChange={(e) =>
                    onChange({ ...config, s: Number(e.target.value) })
                  }
                  style={{ width: 64 }}
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                </select>
              </label>
              <label
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <span>
                  <MathText text="$E$" />
                </span>
                <input
                  className="txt"
                  value={config.e}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      e: e.target.value.replace(/[^01]/g, "").slice(0, eLen),
                    })
                  }
                  style={{
                    width: eLen === 11 ? 120 : 96,
                    fontFamily: "monospace",
                  }}
                  placeholder={eLen === 11 ? "01111111111" : "10000000"}
                />
              </label>
              <label
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <span>
                  <MathText text="$M$" />
                </span>
                <input
                  className="txt"
                  value={config.m}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      m: e.target.value.replace(/[^01]/g, "").slice(0, mLen),
                    })
                  }
                  style={{
                    width: mLen === 52 ? 320 : 200,
                    fontFamily: "monospace",
                  }}
                  placeholder={mLen === 52 ? "1" + "0".repeat(51) : "100..."}
                />
              </label>
            </>
          )}
          <button
            className="ghost"
            onClick={() => {
              if (config.mode === "encode") {
                const vals = ["0", "-0", "1", "-2.5", "0.1", "3.14"];
                onChange({
                  ...config,
                  decimal: vals[Math.floor(Math.random() * vals.length)],
                });
              } else {
                const { eLen, mLen } = info(config.prec);
                const eMax = info(config.prec).eMax;
                const s = Math.random() < 0.5 ? 0 : 1;
                const eVal = 1 + Math.floor(Math.random() * (eMax - 1));
                onChange({
                  ...config,
                  s,
                  e: eVal.toString(2).padStart(eLen, "0"),
                  m: Array.from({ length: mLen }, () =>
                    Math.random() < 0.5 ? "0" : "1",
                  ).join(""),
                });
              }
            }}
          >
            ↻ {t(T("重新生成", "Regenerate"))}
          </button>
          <button
            className="ghost"
            onClick={() => onChange(DEFAULT_CFG as Cfg)}
          >
            {t(T("清空", "Clear"))}
          </button>
        </div>
      </div>
    ) as unknown as never;
  },
  codeFor(cfg) {
    return CODE[cfg.mode] as never;
  },
  generate(cfg) {
    if (cfg.mode === "encode") return genEncode(cfg.decimal, cfg.prec);
    return genDecode(cfg.s, cfg.e, cfg.m, cfg.prec);
  },
  Render({ scene }) {
    const eStr = scene.eBits;
    const sColor = "#f59e0b",
      eColor = "#6366f1",
      mColor = "#06b6d4";
    const bits = scene.bits;
    const valStr =
      scene.value === null
        ? "NaN"
        : Number.isFinite(scene.value)
          ? Object.is(scene.value, -0)
            ? "-0"
            : String(scene.value)
          : String(scene.value);
    const kindLabel =
      scene.kind === "zero"
        ? "±0"
        : scene.kind === "inf"
          ? "∞"
          : scene.kind === "nan"
            ? "NaN"
            : scene.kind === "denorm"
              ? "非规格化"
              : scene.kind === "invalid"
                ? "无效"
                : "规格化";
    const { eLen, bias } = info(scene.prec);
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div
          style={{
            display: "flex",
            gap: 2,
            justifyContent: "center",
            flexWrap: "wrap",
            alignItems: "center",
            fontFamily: "monospace",
            fontSize: 11,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 2,
              padding: "4px 6px",
              background: "#fffbeb",
              border: `1px solid ${sColor}`,
              borderRadius: 8,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: sColor,
                fontWeight: 800,
                marginRight: 4,
              }}
            >
              S
            </span>
            <span
              style={{
                width: 18,
                textAlign: "center",
                fontWeight: 800,
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 4,
              }}
            >
              {scene.s}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 1,
              padding: "4px 6px",
              background: "#eef2ff",
              border: `1px solid ${eColor}`,
              borderRadius: 8,
              flexWrap: "wrap",
              maxWidth: eLen === 11 ? 220 : 170,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: eColor,
                fontWeight: 800,
                marginRight: 4,
              }}
            >
              E {scene.prec === 64 ? "(11)" : "(8)"}
            </span>
            {eStr.split("").map((ch, i) => (
              <span
                key={i}
                style={{
                  width: 13,
                  textAlign: "center",
                  fontWeight: 700,
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 3,
                  fontSize: 10,
                }}
              >
                {ch}
              </span>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              gap: 1,
              padding: "4px 6px",
              background: "#ecfeff",
              border: `1px solid ${mColor}`,
              borderRadius: 8,
              maxWidth: scene.prec === 64 ? 520 : 360,
              overflow: "hidden",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: mColor,
                fontWeight: 800,
                marginRight: 4,
              }}
            >
              M {scene.prec === 64 ? "(52)" : "(23)"}
            </span>
            {scene.mBits.split("").map((ch, i) => (
              <span
                key={i}
                style={{
                  minWidth: 9,
                  textAlign: "center",
                  fontSize: 9,
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 2,
                }}
              >
                {ch}
              </span>
            ))}
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: 11, color: "#64748b" }}>
          {scene.mode === "encode" ? (
            <MathText
              text={`$x=${scene.decimal}$ → $S=${scene.s}$ $E=${scene.Eraw}$ $M$ · ${kindLabel} · ${scene.prec}位`}
            />
          ) : (
            <MathText
              text={`$S=${scene.s}$ $E=${scene.Eraw}$ $M$ → $x\\approx${valStr}$ · ${kindLabel}`}
            />
          )}
        </div>

        <div
          style={{
            textAlign: "center",
            padding: "8px 10px",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            background: "#f8fafc",
            fontFamily: "monospace",
            fontSize: 10,
            wordBreak: "break-all",
          }}
        >
          {scene.prec === 64
            ? `${bits.slice(0, 1)} | ${bits.slice(1, 12)} | ${bits.slice(12).slice(0, 20)}…`
            : `${bits.slice(0, 1)} | ${bits.slice(1, 9)} | ${bits.slice(9).slice(0, 12)}…`}
          <span style={{ marginLeft: 8, color: "#94a3b8" }}>
            {scene.prec} 位
          </span>
        </div>

        <div
          style={{
            textAlign: "center",
            padding: "8px 10px",
            border: "1px solid #c7d2fe",
            borderRadius: 10,
            background: "#eef2ff",
          }}
        >
          {scene.kind === "normal" && (
            <MathText
              text={`$x=(-1)^{${scene.s}}\\cdot ${scene.mant.toFixed(6)}\\cdot2^{${scene.exp}}\\approx ${valStr}$`}
            />
          )}
          {scene.kind === "denorm" && (
            <MathText
              text={`$x=(-1)^{${scene.s}}0.${scene.mBits.slice(0, 4)}\\dots\\cdot2^{${1 - bias}}\\approx ${valStr}$`}
            />
          )}
          {scene.kind === "zero" && (
            <MathText text={scene.s === 0 ? `$+0$` : `$-0$`} />
          )}
          {scene.kind === "inf" && (
            <MathText text={scene.s === 0 ? `$+\\infty$` : `$-\\infty$`} />
          )}
          {scene.kind === "nan" && <MathText text={`$\\text{NaN}$`} />}
          {scene.kind === "invalid" && (
            <span style={{ color: "#ef4444" }}>! 输入无效</span>
          )}
        </div>

        <div style={{ textAlign: "center", fontSize: 11, color: "#94a3b8" }}>
          <MathText
            text={
              scene.mode === "encode"
                ? `$十进制\\to S|E|M$ · $Bias=${bias}$`
                : `$S|E|M\\to十进制$ · $Bias=${bias}$`
            }
          />
        </div>
      </div>
    ) as unknown as never;
  },
};
