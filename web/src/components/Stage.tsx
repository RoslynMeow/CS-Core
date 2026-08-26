import { createElement, useEffect, useMemo, useState } from 'react';

// 全站统一：把用户行为（模式 + 参数）持久化到 localStorage，除非用户手动清空
function cfgKey(id: string) { return `module-cfg:${id}`; }
// 剔除动画/瞬态字段，只保存用户可见状态
function persistable(c: object): object {
  const { prevValuesStr, prevKeysStr, execTick, op, ...rest } = c as Record<string, unknown>;
  return { ...rest, prevValuesStr: undefined, prevKeysStr: undefined, execTick: 0, op: 'idle' }; // undefined 键在 JSON 中省略
}
import { useLang } from '../i18n/LangContext';
import type { ModuleDef } from '../engine/types';
import { usePlayback } from '../engine/usePlayback';
import { Pseudocode } from './Pseudocode';
import { PlaybackBar } from './PlaybackBar';
import { MathText } from '../lib/tex';

export function Stage({ mod }: { mod: ModuleDef }) {
  const { t } = useLang();
  const [config, setConfig] = useState(() => {
    // 统一：载入上次用户的 config（模式 + 参数），除非用户手动清空
    try {
      const saved = localStorage.getItem(cfgKey(mod.id));
      if (saved !== null) {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        return { ...(mod.defaultConfig as object), ...parsed } as typeof mod.defaultConfig;
      }
    } catch {}
    return mod.defaultConfig;
  });
  // 用户 config 每次变化持久化，供下次载入
  useEffect(() => {
    try {
      localStorage.setItem(cfgKey(mod.id), JSON.stringify(persistable(config as object)));
    } catch {}
  }, [mod, config]);
  const frames = useMemo(() => mod.generate(config), [mod, config]);
  const code = useMemo(() => (mod.codeFor ? mod.codeFor(config) : mod.code ?? []), [mod, config]);
  // 统一：所有知识点进入不自动播放，停在首帧，需点“执行”或手动播放
  const isManual = true;
  const pb = usePlayback(frames, { autoPlay: !isManual, autoPlayOnMount: !isManual });
  const handleChange = (c: unknown) => {
    if (pb.playing) return;
    setConfig(c as never);
  };

  return (
    <div className="stage">
      <div className="stage-head">
        <h1 className="mod-title">{t(mod.title)}</h1>
        {mod.desc && (
          <p className="mod-desc">
            <MathText text={t(mod.desc)} />
          </p>
        )}
        {mod.tags && (
          <div className="tags">
            {mod.tags.map(x => (
              <span key={x} className="tag">
                {x}
              </span>
            ))}
            <span className="tag" style={{ background: '#f8fafc', color: '#475569', borderColor: '#e2e8f0' }}>
              {mod.id}
            </span>
          </div>
        )}
      </div>
      {mod.Controls && (
        <div className="stage-controls" style={pb.playing ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
          {createElement(mod.Controls as never, { config: config as never, onChange: handleChange as never, t, onPlay: pb.play } as never)}
          {!mod.randomize && (
            <button className="ghost" onClick={() => pb.first()}>
              ↻ {t({ zh: '重新生成', en: 'Regenerate' })}
            </button>
          )}
        </div>
      )}
      <PlaybackBar pb={pb} />
      <div className="stage-body">
        <div className="canvas">
          {pb.frame && <mod.Render scene={pb.frame.scene} t={t} config={config as never} onChange={handleChange as never} />}
          {pb.frame && (
            <div className="caption">
              <MathText text={t(pb.frame.caption)} />
            </div>
          )}
        </div>
        {code.length > 0 && <Pseudocode code={code} active={pb.frame?.line} />}
      </div>
    </div>
  );
}
