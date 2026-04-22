export default function Header() {
  return (
    <header className="app-header">
      <div className="logo">
        <div className="logo-mark">AI</div>
        <div>
          <div className="logo-text">DocIntel</div>
          <div className="logo-sub">Document Intelligence Platform</div>
        </div>
      </div>
      <div className="header-meta">
        <div className="status-dot">
          <div className="dot" />
          Azure Connected
        </div>
        <div className="azure-badge">Azure Content Understanding</div>
      </div>
    </header>
  );
}
