import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useFetch, api } from "../hooks/useApi";

export default function Admin() {
  const { user } = useAuth();
  const [adminToken, setAdminToken] = useState("");
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [stats, setStats] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [adminError, setAdminError] = useState(null);
  
  const adminHeaders = adminToken ? { headers: { "X-Admin-Token": adminToken } } : {};

  const { data: allGroups, loading: groupsLoading, setData: setAllGroups } = useFetch(
    isAdminMode ? "/api/groups/admin/all" : null,
    [isAdminMode, adminToken],
    adminHeaders
  );
  const { data: allTransactions, loading: txLoading } = useFetch(
    isAdminMode ? "/api/transactions/admin/all" : null,
    [isAdminMode, adminToken],
    adminHeaders
  );

  useEffect(() => {
    if (isAdminMode) {
      // Fetch stats when in admin mode
      const headers = adminToken ? { "X-Admin-Token": adminToken } : undefined;
      api("/api/admin/stats", { headers })
        .then(setStats)
        .catch((err) => {
          console.error("Failed to fetch admin stats:", err);
          setStats(null);
        });
    }
  }, [isAdminMode, adminToken]);

  const enableAdminMode = async () => {
    try {
      // Test admin access
      await api("/api/groups/admin/all", {
        headers: { "X-Admin-Token": adminToken }
      });
      setIsAdminMode(true);
      localStorage.setItem("adminToken", adminToken);
    } catch (err) {
      alert("Failed to enable admin mode: " + (err.message || "Invalid admin token"));
    }
  };

  const disableAdminMode = () => {
    setIsAdminMode(false);
    setAdminToken("");
    localStorage.removeItem("adminToken");
  };

  const seedDatabase = async () => {
    if (!confirm("This will clear all data and create fresh test data. Continue?")) return;
    setSeeding(true);
    try {
      const headers = adminToken ? { "X-Admin-Token": adminToken } : undefined;
      await api("/api/admin/seed", { method: "POST", headers });
      alert("Database seeded successfully!");
      // Refresh groups and stats
      setStats(await api("/api/admin/stats", { headers }));
      const groups = await api("/api/groups/admin/all", { headers });
      setAllGroups(groups);
    } catch (err) {
      alert("Error seeding database: " + err.message);
    } finally {
      setSeeding(false);
    }
  };

  // Auto-enable if token exists
  useEffect(() => {
    const savedToken = localStorage.getItem("adminToken");
    if (!savedToken) return;

    api("/api/groups/admin/all", {
      headers: { "X-Admin-Token": savedToken }
    })
      .then(() => {
        setAdminToken(savedToken);
        setIsAdminMode(true);
        setAdminError(null);
      })
      .catch(() => {
        localStorage.removeItem("adminToken");
        setAdminToken("");
        setIsAdminMode(false);
        setAdminError("Saved admin token is invalid. Please enter a valid token.");
      });
  }, []);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.8rem", fontWeight: 600, marginBottom: "2rem" }}>Admin Panel</h1>

      {user && (
        <div style={{ marginBottom: "1rem", padding: "0.5rem", background: "var(--color-bg)", borderRadius: "var(--radius-sm)" }}>
          Logged in as: <strong>{user.display_name}</strong> ({user.email})
        </div>
      )}

      {!isAdminMode ? (
        <div style={{ ...card, marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "1rem" }}>Enable Admin Mode</h2>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
            Enter the admin token to access all groups and transactions.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="password"
              placeholder="Admin token"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={enableAdminMode} style={primaryBtn}>
              Enable Admin
            </button>
          </div>
          {adminError && (
            <p style={{ color: "var(--color-danger)", marginTop: "0.75rem" }}>{adminError}</p>
          )}
          <p style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
            Default development token: <code>dev-admin-token</code>
          </p>
        </div>
      ) : (
        <div style={{ marginBottom: "2rem" }}>
          <button onClick={disableAdminMode} style={{ ...ghostBtn, color: "var(--color-danger)", borderColor: "var(--color-danger)" }}>
            Disable Admin Mode
          </button>
          <div style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginTop: "1rem" }}>
            Admin mode is active using the saved token from your browser storage.
            Click disable to enter a different token manually.
          </div>

          {/* Development Tools */}
          <div style={{ ...card, marginTop: "2rem", marginBottom: "2rem", borderColor: "var(--color-accent)", background: "rgba(var(--color-accent-rgb), 0.05)" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "1rem", color: "var(--color-accent)" }}>
              Development Tools
            </h2>
            
            {/* Stats */}
            {stats && (
              <div style={{ marginBottom: "1.5rem", padding: "1rem", background: "var(--color-surface)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.5rem" }}>Database Statistics</h3>
                <div style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
                  <div>👤 Users: <strong>{stats.users}</strong></div>
                  <div>📁 Groups: <strong>{stats.groups}</strong></div>
                  <div>💸 Transactions: <strong>{stats.transactions}</strong></div>
                  <div>🔀 Splits: <strong>{stats.splits}</strong></div>
                </div>
              </div>
            )}

            {/* Seed Data */}
            <div>
              <p style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
                Generate test data with sample groups and transactions
              </p>
              <button 
                onClick={seedDatabase}
                disabled={seeding}
                style={{ ...primaryBtn, background: "var(--color-success)" }}>
                {seeding ? "Seeding..." : "Seed Test Data"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdminMode && (
        <>
          {/* All Groups */}
          <div style={{ ...card, marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "1rem" }}>All Groups ({allGroups?.length || 0})</h2>
            {groupsLoading ? (
              <p>Loading groups...</p>
            ) : (
              <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
                {allGroups?.map((group) => (
                  <Link key={group.id} to={`/groups/${group.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{ ...card, padding: "1rem" }}>
                      <h3 style={{ fontWeight: 600 }}>{group.name}</h3>
                      <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>{group.description}</p>
                      <p style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                        Created by: {group.members.find(m => m.id === group.created_by_id)?.display_name}
                      </p>
                      <p style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                        Members: {group.members.map(m => m.display_name).join(", ")}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* All Transactions */}
          <div style={{ ...card }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "1rem" }}>All Transactions ({allTransactions?.length || 0})</h2>
            {txLoading ? (
              <p>Loading transactions...</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {allTransactions?.map((tx) => (
                  <div key={tx.id} style={{ ...card, padding: "1rem", opacity: tx.is_hidden ? 0.6 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        {tx.is_settlement && (
                          <span style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase",
                            letterSpacing: "0.05em", color: "var(--color-success)", display: "block", marginBottom: "0.2rem" }}>
                            Settlement
                          </span>
                        )}
                        <div style={{ fontWeight: 500 }}>{tx.description}</div>
                        <div style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginTop: "0.15rem" }}>
                          Group: {tx.group_id} · Paid by {tx.paid_by.display_name} · {tx.date}
                        </div>
                        {!tx.is_settlement && (
                          <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.4rem" }}>
                            {tx.splits.map(s => `${s.display_name}: ${s.share_amount} ${tx.currency}`).join(" · ")}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 600 }}>
                          {Number(tx.amount).toFixed(2)} {tx.currency}
                        </div>
                        {tx.is_hidden && (
                          <span style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)" }}>Hidden</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const card = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  padding: "1rem 1.25rem",
  boxShadow: "var(--shadow-sm)",
};

const primaryBtn = {
  background: "var(--color-accent)",
  color: "#fff",
  border: "none",
  borderRadius: "var(--radius-sm)",
  padding: "0.5rem 1rem",
  fontWeight: 500,
  fontSize: "0.875rem",
};

const ghostBtn = {
  background: "transparent",
  color: "var(--color-text-secondary)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  padding: "0.4rem 0.9rem",
  fontSize: "0.875rem",
};

const inputStyle = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  fontSize: "0.95rem",
  background: "var(--color-bg)",
  color: "var(--color-text-primary)",
  display: "block",
};