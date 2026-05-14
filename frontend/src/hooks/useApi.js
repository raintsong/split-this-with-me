const BASE_URL = import.meta.env.VITE_API_URL || "";

export function getToken() {
  return localStorage.getItem("auth_token");
}

export function setToken(token) {
  localStorage.setItem("auth_token", token);
}

export function clearToken() {
  localStorage.removeItem("auth_token");
}

export async function api(path, options = {}) {
  const token = getToken();
  const adminToken = localStorage.getItem("adminToken");
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (adminToken) {
    headers["X-Admin-Token"] = adminToken;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Request failed" }));
    const error = new Error(err.error || "Request failed");
    Object.assign(error, err);
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

import { useState, useEffect } from "react";

export function useFetch(path, deps = [], options = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!path) return;
    setLoading(true);
    api(path, options)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [path, ...deps, JSON.stringify(options)]);

  return { data, loading, error, setData };
}