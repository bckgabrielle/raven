import { useEffect, useState } from "react";

export const SPEEDS = [0.5, 0.75, 1] as const;

export function formatTime(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Simulated playback clock. When the real avatar renderer exists,
// replace this timer with the renderer's own time and play state.
export function useAvatarPlayback(duration: number, resetKey: unknown, keysEnabled: boolean) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(0.75);
  const [prevKey, setPrevKey] = useState<unknown>(resetKey);

  // React's recommended way to reset state when an input changes:
  // adjust it during render instead of inside an effect.
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setTime(0);
    setPlaying(false);
  } else if (playing && duration > 0 && time >= duration) {
    setPlaying(false); // reached the end
  }

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTime((t) => Math.min(duration, t + 0.1 * speed)), 100);
    return () => clearInterval(id);
  }, [playing, speed, duration]);

  const toggle = () => {
    if (!playing && time >= duration) setTime(0);
    setPlaying(!playing);
  };
  const replay = () => {
    setTime(0);
    setPlaying(true);
  };

  useEffect(() => {
    if (!keysEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.code !== "Space" || target?.closest("input, textarea, select, button, a, dialog")) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return { time, playing, speed, setSpeed, seek: setTime, toggle, replay };
}