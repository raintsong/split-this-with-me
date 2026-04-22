import { useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useFetch, api } from "../hooks/useApi";

export default function GroupDetail() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const { data: group, loading: groupLoading, setData: setGroup } = useFetch(`/api/groups/${groupId}`);
  const { data: transactions, loading: txLoading, setData: setTransactions } = useFetch(
    `/api/transactions/group/${groupId}`, [groupId]
  );
  const { data: balances, setData: setBalances } = useFetch(`/api/groups/${groupId}/balances`, [groupId]);
  const { data: currencies } = useFetch("/api/transactions/currencies");

  const [showTxForm, setShowTxForm] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [form, setForm] = useState({ description: "", amount: "", currency: "USD", date: today(), splits: [] });
  const [saving, setSaving] = useState(false);

  // Member search state
  const [memberQuery, setMemberQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const searchUsers = useCallback(async (q) => {
    setMemberQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await api(`/api/groups/users/search?q=${encodeURIComponent(q)}`);
      // Filter out people already in the group
      const memberIds = new Set(group?.members.map(m => m.id) || []);
      setSearchResults(results.filter(u => !memberIds.has(u.id)));
    } catch (e) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [group]);

  const addMember = async (u) => {
    try {
      const updated = await api(`/api/groups/${groupId}/members`, {
        method: "POST",
        body: { user_id: u.id },
      });
      setGroup(updated);
      setSearchResults([]);
      setMemberQuery("");
    } catch (err) {
      alert(err.message);
    }
  };

  const removeMember = async (memberId) => {
    if (!confirm("Remove this member?")) return;
    try {
      const updated = await api(`/api/groups/${groupId}/members/${memberId}`, { method: "DELETE" });
      setGroup(updated);
    } catch (err) {
      alert(err.message);
    }
  };

  const initSplits = (members, amount) => {
    const share = members.length ? (parseFloat(amount) / members.length).toFixed(2) : "0";
    return members.map((m) => ({ user_id: m.id, display_name: m.display_name, share_amount: share }));
  };

  const handleFormChange = (field, value) => {
    setForm((f) => {
      const updated = { ...f, [field]: value };
      if (field === "amount" && group) {
        updated.splits = initSplits(group.members, updated.amount || 0);
      }
      return updated;
    });
  };

  const openTxForm = () => {
    if (group) setForm((f) => ({ ...f, splits: initSplits(group.members, f.amount || 0) }));
    setShowTxForm(true);
  };

  const updateSplit = (userId, value) => {
    setForm((f) => ({
      ...f,
      splits: f.splits.map((s) => s.user_id === userId ? { ...s, share_amount: value } : s),
    }));
  };

  const submitTransaction = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        description: form.description,
        amount: parseFloat(form.amount),
        currency: form.currency,
        date: form.date,
        splits: form.splits.map((s) => ({ user_id: s.user_id, share_amount: parseFloat(s.share_amount) })),
      };
      const tx = await api(`/api/transactions/group/${groupId}`, { method: "POST", body: payload });
      setTransactions((prev) => [tx, ...(prev || [])]);
      setForm({ description: "", amount: "", currency: "USD", date: today(), splits: initSplits(group.members, 0) });
      setShowTxForm(false);
      const newBalances = await api(`/api/groups/${groupId}/balances`);
      setBalances(newBalances);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteTransaction = async (txId) => {
    if (!confirm("Delete this transaction?")) return;
    await api(`/api/transactions/${txId}`, { method: "DELETE" });
    setTransactions((prev) => prev.filter((t) => t.id !== txId));
    const newBalances = await api(`/api/groups/${groupId}/balances`);
    setBalances(newBalances);
  };

  if (groupLoading) return <div style={{ padding: "2rem" }}>Loading…</div>;
  if (!group) return <div style={{ padding: "2rem" }}>Group not found.</div>;

  const splitsTotal = form.splits.reduce((sum, s) => sum + (parseFloat(s.share_amount) || 0), 0);
  const txTotal = parseFloat(form.amount) || 0;
  const splitsDiff = Math.abs(splitsTotal - txTotal);
  const isCreator = group.created_by_id === user?.id;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1rem" }}>
      <Link to="/dashboard" style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>← Dashboard</Link>

      {/* Group header */}
      <div style={{ margin: "1rem 0 1.5rem" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 600 }}>{group.name}</h1>
        {group.description && <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>{group.description}</p>}
      </div>

      {/* Members section */}
      <div style={{ ...card, marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600 }}>Members</h2>
          <button onClick={() => setShowMemberForm(v => !v)} style={ghostBtn}>
            {showMemberForm ? "Cancel" : "+ Add member"}
          </button>
        </div>

        {/* Member list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {group.members.map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.9rem" }}>
                {m.display_name}
                {m.id === group.created_by_id && (
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginLeft: "0.4rem" }}>(creator)</span>
                )}
              </span>
              {isCreator && m.id !== group.created_by_id && (
                <button onClick={() => removeMember(m.id)}
                  style={{ ...ghostBtn, fontSize: "0.75rem", color: "var(--color-danger)", borderColor: "var(--color-danger)" }}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add member search */}
        {showMemberForm && (
          <div style={{ marginTop: "1rem", borderTop: "1px solid var(--color-border)", paddingTop: "1rem" }}>
            <input
              placeholder="Search by name or email…"
              value={memberQuery}
              onChange={(e) => searchUsers(e.target.value)}
              style={inputStyle}
            />
            {searching && <p style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.4rem" }}>Searching…</p>}
            {searchResults.length > 0 && (
              <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {searchResults.map((u) => (
                  <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "var(--color-bg)", border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)", padding: "0.5rem 0.75rem" }}>
                    <div>
                      <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>{u.display_name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>{u.email}</div>
                    </div>
                    <button onClick={() => addMember(u)} style={primaryBtn}>Add</button>
                  </div>
                ))}
              </div>
            )}
            {memberQuery.length >= 2 && !searching && searchResults.length === 0 && (
              <p style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.4rem" }}>
                No users found. They need to log in at least once before they can be added.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Balances */}
      {balances && (
        <div style={{ ...card, marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Balances</h2>
          {balances.map((b) => (
            <div key={b.user.id} style={{ marginBottom: "0.4rem" }}>
              <span style={{ fontWeight: 500 }}>{b.user.display_name}</span>
              {Object.entries(b.currencies).map(([currency, amount]) => (
                <span key={currency} style={{
                  marginLeft: "0.75rem", fontSize: "0.875rem",
                  color: amount >= 0 ? "var(--color-success)" : "var(--color-danger)",
                }}>
                  {amount >= 0 ? "+" : ""}{Number(amount).toFixed(2)} {currency}
                </span>
              ))}
              {Object.keys(b.currencies).length === 0 && (
                <span style={{ marginLeft: "0.75rem", fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>settled up</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Transactions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>Transactions</h2>
        <button onClick={showTxForm ? () => setShowTxForm(false) : openTxForm} style={primaryBtn}>
          {showTxForm ? "Cancel" : "+ Add expense"}
        </button>
      </div>

      {showTxForm && (
        <form onSubmit={submitTransaction} style={{ ...card, marginBottom: "1rem" }}>
          <input placeholder="Description" required value={form.description}
            onChange={(e) => handleFormChange("description", e.target.value)} style={inputStyle} />
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <input type="number" placeholder="Amount" required min="0.01" step="0.01" value={form.amount}
              onChange={(e) => handleFormChange("amount", e.target.value)}
              style={{ ...inputStyle, flex: 2 }} />
            <select value={form.currency} onChange={(e) => handleFormChange("currency", e.target.value)}
              style={{ ...inputStyle, flex: 1 }}>
              {(currencies || ["USD", "EUR", "GBP", "JPY"]).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <input type="date" value={form.date} onChange={(e) => handleFormChange("date", e.target.value)}
            style={{ ...inputStyle, marginTop: "0.5rem" }} />

          {form.splits.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <p style={{ fontSize: "0.8rem", fontWeight: 500, marginBottom: "0.4rem", color: "var(--color-text-secondary)" }}>
                Split amounts
              </p>
              {form.splits.map((s) => (
                <div key={s.user_id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                  <span style={{ flex: 1, fontSize: "0.875rem" }}>{s.display_name}</span>
                  <input type="number" step="0.01" min="0" value={s.share_amount}
                    onChange={(e) => updateSplit(s.user_id, e.target.value)}
                    style={{ ...inputStyle, width: 100, textAlign: "right" }} />
                  <span style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", width: 36 }}>{form.currency}</span>
                </div>
              ))}
              {splitsDiff > 0.01 && (
                <p style={{ fontSize: "0.8rem", color: "var(--color-danger)", marginTop: "0.25rem" }}>
                  Splits must equal total ({txTotal.toFixed(2)}). Difference: {splitsDiff.toFixed(2)}
                </p>
              )}
            </div>
          )}

          <button type="submit" disabled={saving || splitsDiff > 0.01}
            style={{ ...primaryBtn, marginTop: "0.75rem", width: "100%", opacity: splitsDiff > 0.01 ? 0.5 : 1 }}>
            {saving ? "Saving…" : "Add expense"}
          </button>
        </form>
      )}

      {txLoading && <p style={{ color: "var(--color-text-secondary)" }}>Loading…</p>}
      {!txLoading && transactions?.length === 0 && (
        <p style={{ color: "var(--color-text-secondary)" }}>No transactions yet.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {transactions?.map((tx) => (
          <div key={tx.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 500 }}>{tx.description}</div>
                <div style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginTop: "0.15rem" }}>
                  Paid by {tx.paid_by.display_name} · {tx.date}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.4rem" }}>
                  {tx.splits.map((s) => `${s.display_name}: ${s.share_amount} ${tx.currency}`).join(" · ")}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 600 }}>{Number(tx.amount).toFixed(2)} {tx.currency}</div>
                {tx.paid_by.id === user?.id && (
                  <button onClick={() => deleteTransaction(tx.id)}
                    style={{ ...ghostBtn, fontSize: "0.75rem", marginTop: "0.4rem", color: "var(--color-danger)", borderColor: "var(--color-danger)" }}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const card = {
  background: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)", padding: "1rem 1.25rem", boxShadow: "var(--shadow-sm)",
};
const primaryBtn = {
  background: "var(--color-accent)", color: "#fff", border: "none",
  borderRadius: "var(--radius-sm)", padding: "0.5rem 1rem", fontWeight: 500, fontSize: "0.875rem",
};
const ghostBtn = {
  background: "transparent", color: "var(--color-text-secondary)",
  border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)",
  padding: "0.4rem 0.9rem", fontSize: "0.875rem",
};
const inputStyle = {
  width: "100%", padding: "0.6rem 0.75rem", border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)", fontSize: "0.95rem", background: "var(--color-bg)",
  color: "var(--color-text-primary)", display: "block",
};