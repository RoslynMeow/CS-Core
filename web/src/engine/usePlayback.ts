import { useCallback, useEffect, useRef, useState } from 'react';
import type { Frame, FramesOrInfinite } from './types';

const SPEED_KEY = 'playback:speed';
function loadGlobalSpeed(): number {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    if (Number.isFinite(v) && v >= 0.25 && v <= 3) return v;
  } catch {}
  return 1;
}

export function usePlayback(framesOr: FramesOrInfinite, opts: { interval?: number; autoPlay?: boolean; autoPlayOnMount?: boolean } = {}) {
  const interval = opts.interval ?? 800;
  const autoPlay = opts.autoPlay ?? true;
  const autoPlayOnMount = opts.autoPlayOnMount ?? autoPlay;
  const isFirstRef = useRef(true);
  const isInfinite = !Array.isArray(framesOr);
  const initial = Array.isArray(framesOr) ? framesOr : framesOr.frames;
  const extendRef = useRef<((last: Frame, idx: number) => Frame[]) | null>(isInfinite ? (framesOr as { extend: (l: Frame, i: number) => Frame[] }).extend : null);
  extendRef.current = isInfinite ? (framesOr as { extend: (l: Frame, i: number) => Frame[] }).extend : null;

  const [frames, setFrames] = useState<Frame[]>(initial);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(loadGlobalSpeed);
  // 全局同步：写回 localStorage，其它卡片读取同一值
  const setSpeed = useCallback((v: number) => {
    const s = Math.min(3, Math.max(0.25, v));
    setSpeedState(s);
    try { localStorage.setItem(SPEED_KEY, String(s)); } catch {}
  }, []);

  const idxRef = useRef(index); idxRef.current = index;
  const framesRef = useRef(frames); framesRef.current = frames;

  useEffect(() => {
    setFrames(initial);
    setIndex(0);
    if (isFirstRef.current) {
      isFirstRef.current = false;
      setPlaying(autoPlayOnMount);
    } else {
      setPlaying(autoPlay);
    }
  }, [framesOr, autoPlay, autoPlayOnMount]);

  useEffect(() => {
    if (!playing) return;
    let id = window.setTimeout(function tick() {
      const cur = framesRef.current;
      const idx = idxRef.current;
      if (idx < cur.length - 1) {
        setIndex(idx + 1);
        id = window.setTimeout(tick, interval / speed);
      } else {
        const ext = extendRef.current?.(cur[cur.length - 1], cur.length - 1);
        if (ext && ext.length) {
          setFrames(f => [...f, ...ext]);
          setIndex(cur.length);
          id = window.setTimeout(tick, interval / speed);
        } else setPlaying(false);
      }
    }, interval / speed);
    return () => window.clearTimeout(id);
  }, [playing, speed, interval]);

  const play = useCallback(() => {
    if (idxRef.current >= framesRef.current.length - 1 && !extendRef.current) setIndex(0);
    setPlaying(true);
  }, []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => setPlaying(p => !p), []);
  const stepFwd = useCallback(() => {
    setPlaying(false);
    if (idxRef.current < framesRef.current.length - 1) setIndex(i => i + 1);
    else {
      const ext = extendRef.current?.(framesRef.current[framesRef.current.length - 1], framesRef.current.length - 1);
      if (ext && ext.length) { setFrames(f => [...f, ...ext]); setIndex(framesRef.current.length); }
    }
  }, []);
  const stepBack = useCallback(() => { setPlaying(false); setIndex(i => Math.max(i - 1, 0)); }, []);
  const first = useCallback(() => { setPlaying(false); setIndex(0); }, []);
  const last = useCallback(() => { setPlaying(false); setIndex(framesRef.current.length - 1); }, []);

  return { frames, frame: frames[index], index, count: frames.length, infinite: isInfinite, playing, speed, setSpeed, play, pause, toggle, stepFwd, stepBack, first, last };
}
export type Playback = ReturnType<typeof usePlayback>;
