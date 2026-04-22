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
  const [showSettleForm, setShowSettleForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Transaction form
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [date, setDate] = useState(today());
  const [paidById, setPaidById] = useState(null);
  const [splitMode, setSplitMode] = useState("even");
  const [customSplits, setCustomSplits] = useState([]);

  // Settle form
  const [settlePayerId, setSettlePayerId] = useState(null);
  const [settlePayeeId, setSettlePayeeId] = useState(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleCurrency, setSettleCurrency] = useState("USD");

  // Member search
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
    } catch (e) { setSearchResults([]); }
    finally { setSearching(false); }
  }, [group]);

  const addMember = async (u) => {
    try {
      const updated = await api(`/api/groups/${groupId}/members`, { method: "POST", body: { user_id: u.id } });
      setGroup(updated); setSearchResults([]); setMemberQuery("");
    } catch (err) { alert(err.message); }
  };

  const removeMember = async (memberId) => {
    if (!confirm("Remove this member?")) return;
    try {
      const updated = await api(`/api/groups/${groupId}/members/${memberId}`, { method: "DELETE" });
      setGroup(updated);
    } catch (err) { alert(err.message); }
  };

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
      setCustomSplits(group.members.map(m => ({ user_id: m.id, display_name: m.display_name, share_amount: "0" })));
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

  const buildSplits = () => {
    if (splitMode === "even") {
      const members = group.members;
      const share = (parseFloat(amount) / members.length).toFixed(2);
      const splits = members.map(m => ({ user_id: m.id, share_amount: parseFloat(share) }));
      const diff = parseFloat((parseFloat(amount) - splits.reduce((s, x) => s + x.share_amount, 0)).toFixed(2));
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
        body: { description, amount: parseFloat(amount), currency, date, paid_by_id: paidById || user?.id, splits: buildSplits() },
      });
      setTransactions(prev => [tx, ...(prev || [])]);
      setDescription(""); setAmount(""); setCurrency("USD"); setDate(today()); setSplitMode("even"); setShowTxForm(false);
      setBalances(await api(`/api/groups/${groupId}/balances`));
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  // Open settle form and pre-fill sensible defaults from balances
  const openSettleForm = () => {
    if (balances && user) {
      // Find the current user's biggest debt (negative balance) as default
      const myBalance = balances.find(b => b.user.id === user.id);
      if (myBalance) {
        const biggestDebt = Object.entries(myBalance.currencies)
          .filter(([, amt]) => amt < 0)
          .sort(([, a], [, b]) => a - b)[0];
        if (biggestDebt) {
          setSettleCurrency(biggestDebt[0]);
          setSettleAmount(Math.abs(biggestDebt[1]).toFixed(2));
          setSettlePayerId(user.id);
          // Find who is owed the most in that currency
          const creditor = balances
            .filter(b => b.user.id !== user.id && (b.currencies[biggestDebt[0]] || 0) > 0)
            .sort((a, b) => (b.currencies[biggestDebt[0]] || 0) - (a.currencies[biggestDebt[0]] || 0))[0];
          if (creditor) setSettlePayeeId(creditor.user.id);
        }
      }
      if (!settlePayerId) setSettlePayerId(user.id);
      if (!settlePayeeId && group?.members) {
        const other = group.members.find(m => m.id !== user.id);
        if (other) setSettlePayeeId(other.id);
      }
    }
    setShowSettleForm(true);
  };

  const submitSettle = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const tx = await api(`/api/transactions/group/${groupId}/settle`, {
        method: "POST",
        body: { payer_id: settlePayerId, payee_id: settlePayeeId, amount: parseFloat(settleAmount), currency: settleCurrency },
      });
      setTransactions(prev => [tx, ...(prev || [])]);
      setShowSettleForm(false);
      setBalances(await api(`/api/groups/${groupId}/balances`));
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const deleteTransaction = async (txId) => {
    if (!confirm("Delete this transaction?")) return;
    await api(`/api/transactions/${txId}`, { method: "DELETE" });
    setTransactions(prev => prev.filter(t => t.id !== txId));
    setBalances(await api(`/api/groups/${groupId}/balances`));
  };

  if (groupLoading) return <div style={{ padding: "2rem" }}>Loading…</div>;
  if (!group) return <div style={{ padding: "2rem" }}>Group not found.</div>;

  const isCreator = group.created_by_id === user?.id;
  const anyDebts = balances?.some(b => Object.values(b.currencies).some(v => v !== 0));

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
                {m.id === group.created_by_id && <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginLeft: "0.4rem" }}>(creator)</span>}
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

      {/* Balances + Settle */}
      {balances && (
        <div style={{ ...card, marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h2 style={{ fontSize: "0.9rem", fontWeight: 600 }}>Balances</h2>
            {anyDebts && (
              <button onClick={showSettleForm ? () => setShowSettleForm(false) : openSettleForm}
                style={{ ...ghostBtn, color: "var(--color-accent)", borderColor: "var(--color-accent)" }}>
                {showSettleForm ? "Cancel" : "Settle up"}
              </button>
            )}
          </div>

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

          {/* Settle form */}
          {showSettleForm && (
            <form onSubmit={submitSettle} style={{ marginTop: "1rem", borderTop: "1px solid var(--color-border)", paddingTop: "1rem" }}>
              <p style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
                Record a payment between two members to clear their balance.
              </p>

              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Who paid</label>
                  <select value={settlePayerId || ""} onChange={e => setSettlePayerId(parseInt(e.target.value))} style={inputStyle} required>
                    <option value="" disabled>Select…</option>
                    {group.members.map(m => (
                      <option key={m.id} value={m.id}>{m.id === user?.id ? `${m.display_name} (you)` : m.display_name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Who received</label>
                  <select value={settlePayeeId || ""} onChange={e => setSettlePayeeId(parseInt(e.target.value))} style={inputStyle} required>
                    <option value="" disabled>Select…</option>
                    {group.members.filter(m => m.id !== settlePayerId).map(m => (
                      <option key={m.id} value={m.id}>{m.id === user?.id ? `${m.display_name} (you)` : m.display_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input type="number" placeholder="Amount" min="0.01" step="0.01" required
                  value={settleAmount} onChange={e => setSettleAmount(e.target.value)}
                  style={{ ...inputStyle, flex: 2 }} />
                <select value={settleCurrency} onChange={e => setSettleCurrency(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                  {(currencies || ["USD", "EUR", "GBP"]).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <button type="submit" disabled={saving} style={{ ...primaryBtn, marginTop: "0.75rem", width: "100%",
                background: "var(--color-success)" }}>
                {saving ? "Recording…" : "Record payment"}
              </button>
            </form>
          )}
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
          <input placeholder="Description" required value={description}
            onChange={e => setDescription(e.target.value)} style={inputStyle} />
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <input type="number" placeholder="Amount" required min="0.01" step="0.01" value={amount}
              onChange={e => handleAmountChange(e.target.value)} style={{ ...inputStyle, flex: 2 }} />
            <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              {(currencies || ["USD", "EUR", "GBP", "JPY"]).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ ...inputStyle, marginTop: "0.5rem" }} />
          <div style={{ marginTop: "0.75rem" }}>
            <label style={labelStyle}>Paid by</label>
            <select value={paidById || user?.id} onChange={e => setPaidById(parseInt(e.target.value))} style={inputStyle}>
              {group.members.map(m => (
                <option key={m.id} value={m.id}>{m.id === user?.id ? `${m.display_name} (you)` : m.display_name}</option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <label style={labelStyle}>Split</label>
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
          {splitMode === "even" && amount && (
            <div style={{ marginTop: "0.6rem", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
              {group.members.map(m => m.display_name).join(", ")} each pay{" "}
              <strong>{(parseFloat(amount) / group.members.length).toFixed(2)} {currency}</strong>
            </div>
          )}
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
            style={{ ...primaryBtn, marginTop: "0.75rem", width: "100%", opacity: (splitMode === "custom" && splitsDiff > 0.01) ? 0.5 : 1 }}>
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
          <div key={tx.id} style={{ ...card, ...(tx.is_settlement ? settlementCard : {}) }}>
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
                  {tx.is_settlement ? "Payment recorded" : `Paid by ${tx.paid_by.display_name}`} · {tx.date}
                </div>
                {!tx.is_settlement && (
                  <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.4rem" }}>
                    {tx.splits.map(s => `${s.display_name}: ${s.share_amount} ${tx.currency}`).join(" · ")}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 600, color: tx.is_settlement ? "var(--color-success)" : "inherit" }}>
                  {Number(tx.amount).toFixed(2)} {tx.currency}
                </div>
                <button onClick={() => deleteTransaction(tx.id)}
                  style={{ ...ghostBtn, fontSize: "0.75rem", marginTop: "0.4rem", color: "var(--color-danger)", borderColor: "var(--color-danger)" }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function today() { return new Date().toISOString().slice(0, 10); }

const card = {
  background: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)", padding: "1rem 1.25rem", boxShadow: "var(--shadow-sm)",
};
const settlementCard = {
  borderColor: "var(--color-border-success)",
  background: "var(--color-background-success)",
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
const labelStyle = {
  fontSize: "0.8rem", fontWeight: 500, color: "var(--color-text-secondary)",
  display: "block", marginBottom: "0.3rem",
};
const toggleBtn = {
  border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)",
  padding: "0.4rem 0.9rem", fontSize: "0.875rem", cursor: "pointer",
};