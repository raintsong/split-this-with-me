import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useFetch, api } from "../hooks/useApi";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { data: groups, loading, setData: setGroups } = useFetch("/api/groups/");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const createGroup = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const group = await api("/api/groups/", { method: "POST", body: { name, description } });
      setGroups((prev) => [...(prev || []), group]);
      setName("");
      setDescription("");
      setShowForm(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 600 }}>Splits</h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>{user?.display_name}</p>
        </div>
        <button onClick={logout} style={ghostBtn}>Sign out</button>
      </div>

      {/* Groups list */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>Your groups</h2>
        <button onClick={() => setShowForm((v) => !v)} style={primaryBtn}>
          {showForm ? "Cancel" : "+ New group"}
        </button>
      </div>

      {/* New group form */}
      {showForm && (
        <form onSubmit={createGroup} style={{ ...card, marginBottom: "1rem" }}>
          <input
            placeholder="Group name (e.g. Hawaii Trip)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputStyle, marginTop: "0.5rem" }}
          />
          <button type="submit" disabled={saving} style={{ ...primaryBtn, marginTop: "0.75rem", width: "100%" }}>
            {saving ? "Creating…" : "Create group"}
          </button>
        </form>
      )}

      {loading && <p style={{ color: "var(--color-text-secondary)" }}>Loading…</p>}

      {!loading && groups?.length === 0 && (
        <p style={{ color: "var(--color-text-secondary)" }}>No groups yet. Create one to get started.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {groups?.map((group) => (
          <Link
            key={group.id}
            to={`/groups/${group.id}`}
            style={{ ...card, display: "block", textDecoration: "none", color: "inherit" }}
          >
            <div style={{ fontWeight: 500 }}>{group.name}</div>
            {group.description && (
              <div style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginTop: "0.2rem" }}>
                {group.description}
              </div>
            )}
            <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.4rem" }}>
              {group.members.length} member{group.members.length !== 1 ? "s" : ""}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Shared inline styles
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
