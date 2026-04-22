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
  const [saving, setSaving] = useState(false);

  // Transaction form state
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [date, setDate] = useState(today());
  const [paidById, setPaidById] = useState(null); // null = current user
  const [splitMode, setSplitMode] = useState("even"); // "even" or "custom"
  const [customSplits, setCustomSplits] = useState([]);

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
        method: "POST", body: { user_id: u.id },
      });
      setGroup(updated);
      setSearchResults([]);
      setMemberQuery("");
    } catch (err) { alert(err.message); }
  };

  const removeMember = async (memberId) => {
    if (!confirm("Remove this member?")) return;
    try {
      const updated = await api(`/api/groups/${groupId}/members/${memberId}`, { method: "DELETE" });
      setGroup(updated);
    } catch (err) { alert(err.message); }
  };

  // When amount changes in even mode, keep customSplits in sync
  const handleAmountChange = (val) => {
    setAmount(val);
    if (splitMode === "custom" && group) {
      const share = group.members.length ? (parseFloat(val) / group.members.length).toFixed(2) : "0";
      setCustomSplits(group.members.map(m => ({ user_id: m.id, display_name: m.display_name, share_amount: share })));
    }
  };

  const openTxForm = () => {
    if (group) {
      setPaidById(user?.id);
      const share = group.members.length ? (parseFloat(amount || 0) / group.members.length).toFixed(2) : "0";
      setCustomSplits(group.members.map(m => ({ user_id: m.id, display_name: m.display_name, share_amount: share })));
    }
    setShowTxForm(true);
  };

  const handleSplitModeChange = (mode) => {
    setSplitMode(mode);
    if (mode === "custom" && group) {
      const share = group.members.length ? (parseFloat(amount || 0) / group.members.length).toFixed(2) : "0";
      setCustomSplits(group.members.map(m => ({ user_id: m.id, display_name: m.display_name, share_amount: share })));
    }
  };

  const updateCustomSplit = (userId, value) => {
    setCustomSplits(prev => prev.map(s => s.user_id === userId ? { ...s, share_amount: value } : s));
  };

  // Build splits payload — even split divides equally, custom uses entered values
  const buildSplits = () => {
    if (splitMode === "even") {
      const members = group.members;
      const share = (parseFloat(amount) / members.length).toFixed(2);
      // Adjust for rounding — add remainder to first member
      const splits = members.map(m => ({ user_id: m.id, share_amount: parseFloat(share) }));
      const total = splits.reduce((s, x) => s + x.share_amount, 0);
      const diff = parseFloat((parseFloat(amount) - total).toFixed(2));
      if (diff !== 0) splits[0].share_amount = parseFloat((splits[0].share_amount + diff).toFixed(2));
      return splits;
    }
    return customSplits.map(s => ({ user_id: s.user_id, share_amount: parseFloat(s.share_amount) }));
  };

  const customTotal = customSplits.reduce((s, x) => s + (parseFloat(x.share_amount) || 0), 0);
  const txTotal = parseFloat(amount) || 0;
  const splitsDiff = Math.abs(customTotal - txTotal);

  const submitTransaction = async (e) => {
    e.preventDefault();
    if (splitMode === "custom" && splitsDiff > 0.01) return;
    setSaving(true);
    try {
      const tx = await api(`/api/transactions/group/${groupId}`, {
        method: "POST",
        body: {
          description,
          amount: parseFloat(amount),
          currency,
          date,
          paid_by_id: paidById || user?.id,
          splits: buildSplits(),
        },
      });
      setTransactions(prev => [tx, ...(prev || [])]);
      // Reset form
      setDescription(""); setAmount(""); setCurrency("USD"); setDate(today());
      setSplitMode("even"); setShowTxForm(false);
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
    setTransactions(prev => prev.filter(t => t.id !== txId));
    const newBalances = await api(`/api/groups/${groupId}/balances`);
    setBalances(newBalances);
  };

  if (groupLoading) return <div style={{ padding: "2rem" }}>Loading…</div>;
  if (!group) return <div style={{ padding: "2rem" }}>Group not found.</div>;

  const isCreator = group.created_by_id === user?.id;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1rem" }}>
      <Link to="/dashboard" style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>← Dashboard</Link>

      <div style={{ margin: "1rem 0 1.5rem" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 600 }}>{group.name}</h1>
        {group.description && <p style={{ color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>{group.description}</p>}
      </div>

      {/* Members */}
      <div style={{ ...card, marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600 }}>Members</h2>
          <button onClick={() => setShowMemberForm(v => !v)} style={ghostBtn}>
            {showMemberForm ? "Cancel" : "+ Add member"}
          </button>
        </div>
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
        {showMemberForm && (
          <div style={{ marginTop: "1rem", borderTop: "1px solid var(--color-border)", paddingTop: "1rem" }}>
            <input placeholder="Search by name or email…" value={memberQuery}
              onChange={(e) => searchUsers(e.target.value)} style={inputStyle} />
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
              {Object.entries(b.currencies).map(([cur, amt]) => (
                <span key={cur} style={{
                  marginLeft: "0.75rem", fontSize: "0.875rem",
                  color: amt >= 0 ? "var(--color-success)" : "var(--color-danger)",
                }}>
                  {amt >= 0 ? "+" : ""}{Number(amt).toFixed(2)} {cur}
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

          {/* Description */}
          <input placeholder="Description" required value={description}
            onChange={e => setDescription(e.target.value)} style={inputStyle} />

          {/* Amount + currency */}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <input type="number" placeholder="Amount" required min="0.01" step="0.01" value={amount}
              onChange={e => handleAmountChange(e.target.value)} style={{ ...inputStyle, flex: 2 }} />
            <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              {(currencies || ["USD", "EUR", "GBP", "JPY"]).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ ...inputStyle, marginTop: "0.5rem" }} />

          {/* Paid by */}
          <div style={{ marginTop: "0.75rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.3rem" }}>
              Paid by
            </label>
            <select value={paidById || user?.id} onChange={e => setPaidById(parseInt(e.target.value))}
              style={inputStyle}>
              {group.members.map(m => (
                <option key={m.id} value={m.id}>
                  {m.id === user?.id ? `${m.display_name} (you)` : m.display_name}
                </option>
              ))}
            </select>
          </div>

          {/* Split mode toggle */}
          <div style={{ marginTop: "0.75rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.3rem" }}>
              Split
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" onClick={() => handleSplitModeChange("even")}
                style={{ ...toggleBtn, background: splitMode === "even" ? "var(--color-accent)" : "transparent",
                  color: splitMode === "even" ? "#fff" : "var(--color-text-secondary)" }}>
                Evenly
              </button>
              <button type="button" onClick={() => handleSplitModeChange("custom")}
                style={{ ...toggleBtn, background: splitMode === "custom" ? "var(--color-accent)" : "transparent",
                  color: splitMode === "custom" ? "#fff" : "var(--color-text-secondary)" }}>
                Custom
              </button>
            </div>
          </div>

          {/* Even split preview */}
          {splitMode === "even" && amount && (
            <div style={{ marginTop: "0.6rem", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
              {group.members.map(m => m.display_name).join(", ")} each pay{" "}
              <strong>{(parseFloat(amount) / group.members.length).toFixed(2)} {currency}</strong>
            </div>
          )}

          {/* Custom split inputs */}
          {splitMode === "custom" && (
            <div style={{ marginTop: "0.75rem" }}>
              {customSplits.map(s => (
                <div key={s.user_id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                  <span style={{ flex: 1, fontSize: "0.875rem" }}>{s.display_name}</span>
                  <input type="number" step="0.01" min="0" value={s.share_amount}
                    onChange={e => updateCustomSplit(s.user_id, e.target.value)}
                    style={{ ...inputStyle, width: 100, textAlign: "right" }} />
                  <span style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", width: 36 }}>{currency}</span>
                </div>
              ))}
              {splitsDiff > 0.01 && (
                <p style={{ fontSize: "0.8rem", color: "var(--color-danger)", marginTop: "0.25rem" }}>
                  Splits must equal total ({txTotal.toFixed(2)}). Difference: {splitsDiff.toFixed(2)}
                </p>
              )}
            </div>
          )}

          <button type="submit" disabled={saving || (splitMode === "custom" && splitsDiff > 0.01)}
            style={{ ...primaryBtn, marginTop: "0.75rem", width: "100%",
              opacity: (splitMode === "custom" && splitsDiff > 0.01) ? 0.5 : 1 }}>
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
                  {tx.splits.map(s => `${s.display_name}: ${s.share_amount} ${tx.currency}`).join(" · ")}
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
const toggleBtn = {
  border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)",
  padding: "0.4rem 0.9rem", fontSize: "0.875rem", cursor: "pointer",
};