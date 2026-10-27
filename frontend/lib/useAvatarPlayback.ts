import { useEffect, useRef, useState } from "react";
import type { TranslationResult } from "./types";

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const total = Math.floor(Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export interface AvatarPlayback {
  playing: boolean;
  time: number;
  speed: number;
  seek: (time: number) => void;
  toggle: () => void;
  replay: () => void;
  setSpeed: (speed: number) => void;
}

export function useAvatarPlayback(
  duration: number,
  _result: TranslationResult | null,
  active: boolean
): AvatarPlayback {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeedState] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clear() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  useEffect(() => clear, []);

  useEffect(() => {
    if (!active || !playing || duration <= 0) {
      clear();
      return;
    }
    const step = 0.05 * speed;
    intervalRef.current = setInterval(() => {
      setTime((t) => {
        const next = t + step;
        if (next >= duration) {
          clear();
          setPlaying(false);
          return duration;
        }
        return next;
      });
    }, 100);
    return clear;
  }, [active, playing, speed, duration]);

  function seek(next: number) {
    setTime(Math.max(0, Math.min(next, duration)));
  }

  function toggle() {
    if (time >= duration) {
      setTime(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }

  function replay() {
    setTime(0);
    setPlaying(true);
  }

  function setSpeed(next: number) {
    setSpeedState(next);
    setTime(0);
    setPlaying(true);
  }

  return { playing, time, speed, seek, toggle, replay, setSpeed };
}
