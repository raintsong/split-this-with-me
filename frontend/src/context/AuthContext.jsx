import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, clearToken } from "../hooks/useApi";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if we just came back from Google OAuth with a token in the URL
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("token");

    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      // Clean the token out of the URL without triggering a re-render
      window.history.replaceState({}, "", "/dashboard");
    }

    // Check auth using whatever token we now have
    api("/auth/me")
      .then((data) => {
        if (data.authenticated) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}