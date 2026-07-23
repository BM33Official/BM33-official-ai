export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 40,
        background:
          "radial-gradient(900px 520px at 80% -10%, rgba(79,70,229,.14), transparent 60%)," +
          "radial-gradient(700px 460px at 0% 10%, rgba(6,199,85,.10), transparent 55%)," +
          "linear-gradient(180deg,#eef1fb,#f4f2fb)",
      }}
    >
      <div
        style={{
          maxWidth: 460,
          textAlign: "center",
          background: "#fff",
          border: "1px solid #e7ebf3",
          borderRadius: 22,
          padding: "40px 34px",
          boxShadow: "0 22px 48px -18px rgba(30,40,90,.28)",
        }}
      >
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 13,
            margin: "0 auto 16px",
            background: "linear-gradient(135deg,#4f46e5,#1e40af)",
            boxShadow: "0 8px 22px rgba(59,63,216,.32)",
          }}
        />
        <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 800, letterSpacing: "-.03em" }}>
          BM33.official 🤖
        </h1>
        <p style={{ margin: 0, color: "#6b7391", lineHeight: 1.6 }}>
          LINE bot กลางของรุ่น BM33 คณะแพทยศาสตร์วชิรพยาบาล
        </p>
        <p style={{ margin: "6px 0 22px", color: "#9aa2bd", fontSize: 13 }}>
          webhook: <code>/api/line-webhook</code>
        </p>
        <a
          href="/admin"
          style={{
            display: "inline-block",
            padding: "11px 22px",
            borderRadius: 12,
            fontWeight: 800,
            color: "#fff",
            textDecoration: "none",
            background: "linear-gradient(135deg,#4f46e5,#3b47d6 45%,#1e40af)",
            boxShadow: "0 8px 22px rgba(59,63,216,.3)",
          }}
        >
          เข้าสู่ Control Center →
        </a>
      </div>
    </main>
  );
}
