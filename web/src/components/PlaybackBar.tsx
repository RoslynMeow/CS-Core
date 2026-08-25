import type { Playback } from '../engine/usePlayback';

export function PlaybackBar({ pb }: { pb: Playback }) {
  const atFirst = pb.index <= 0;
  const atLast = !pb.infinite && pb.index >= pb.count - 1;
  return (
    <div className="playback">
      <button disabled={atFirst} onClick={pb.first}>
        ⏮ 首帧
      </button>
      <button disabled={atFirst} onClick={pb.stepBack}>
        ◀ 上一步
      </button>
      <button className="primary" onClick={pb.toggle}>
        {pb.playing ? '⏸ 暂停' : '▶ 播放'}
      </button>
      <button disabled={atLast} onClick={pb.stepFwd}>
        下一步 ▶
      </button>
      <button disabled={atLast} onClick={pb.last}>
        末帧 ⏭
      </button>
      <label className="speed">
        速度 <input type="range" min={0.25} max={3} step={0.25} value={pb.speed} onChange={e => pb.setSpeed(Number(e.target.value))} /> {pb.speed.toFixed(2)}×
      </label>
      <span className="progress">
        {pb.index + 1} / {pb.infinite ? '∞' : pb.count}
      </span>
    </div>
  );
}
