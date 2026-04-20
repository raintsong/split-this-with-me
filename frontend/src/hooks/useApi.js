// Base URL is empty in dev (Vite proxy handles it) and set to the Railway URL in production
const BASE_URL = import.meta.env.VITE_API_URL || "";

export async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "include", // Always send session cookie
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }

  // 204 No Content
  if (response.status === 204) return null;
  return response.json();
}

// Convenience hooks for components that need loading/error state
import { useState, useEffect } from "react";

export function useFetch(path, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!path) return;
    setLoading(true);
    api(path)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, deps);

  return { data, loading, error, setData };
}
