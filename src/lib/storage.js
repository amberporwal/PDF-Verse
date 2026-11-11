import { useEffect, useState } from "react";

// localStorage can be unavailable (private mode, blocked cookies). Never let that break the app.
export function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function useStoredState(key, initial) {
  const [value, setValue] = useState(() => readStorage(key, initial));
  useEffect(() => writeStorage(key, value), [key, value]);
  return [value, setValue];
}
