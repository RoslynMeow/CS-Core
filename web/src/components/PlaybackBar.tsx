import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBackward, faBackwardStep, faForward, faForwardStep, faPause, faPlay } from '@fortawesome/free-solid-svg-icons';
import type { Playback } from '../engine/usePlayback';

export function PlaybackBar({ pb, disabled }: { pb: Playback; disabled?: boolean }) {
  const atFirst = disabled || pb.index <= 0;
  const atLast = disabled || (!pb.infinite && pb.index >= pb.count - 1);
  return (
    <div className="playback" style={disabled ? { opacity: 0.55 } : undefined}>
      <button disabled={atFirst} onClick={pb.first}>
        <FontAwesomeIcon icon={faBackwardStep} style={{ width: 11, marginRight: 4 }} />
        首帧
      </button>
      <button disabled={atFirst} onClick={pb.stepBack}>
        <FontAwesomeIcon icon={faBackward} style={{ width: 11, marginRight: 4 }} />
        上一步
      </button>
      <button className="primary" disabled={disabled} onClick={pb.toggle}>
        <FontAwesomeIcon icon={pb.playing ? faPause : faPlay} style={{ width: 11, marginRight: 4 }} />
        {pb.playing ? '暂停' : '播放'}
      </button>
      <button disabled={atLast} onClick={pb.stepFwd}>
        下一步
        <FontAwesomeIcon icon={faForward} style={{ width: 11, marginLeft: 4 }} />
      </button>
      <button disabled={atLast} onClick={pb.last}>
        末帧
        <FontAwesomeIcon icon={faForwardStep} style={{ width: 11, marginLeft: 4 }} />
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