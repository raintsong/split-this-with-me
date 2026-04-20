const BASE_URL = import.meta.env.VITE_API_URL || "";

export default function Login() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--color-bg)",
    }}>
      <div style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: "2.5rem",
        width: "100%",
        maxWidth: "360px",
        textAlign: "center",
        boxShadow: "var(--shadow-md)",
      }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 600, marginBottom: "0.5rem" }}>Splits</h1>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "2rem" }}>
          Track shared expenses with your people.
        </p>
        <a
          href={`${BASE_URL}/auth/login`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.6rem",
            background: "var(--color-accent)",
            color: "#fff",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem 1.25rem",
            fontWeight: 500,
            fontSize: "0.95rem",
            transition: "background 0.15s",
          }}
          onMouseOver={(e) => e.currentTarget.style.background = "var(--color-accent-hover)"}
          onMouseOut={(e) => e.currentTarget.style.background = "var(--color-accent)"}
        >
          <GoogleIcon />
          Continue with Google
        </a>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#fff" fillOpacity=".9"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#fff" fillOpacity=".8"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#fff" fillOpacity=".8"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#fff" fillOpacity=".9"/>
    </svg>
  );
}
