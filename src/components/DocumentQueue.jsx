const FILE_ICONS = {
  "application/pdf": "📕",
  "image/jpeg": "🖼",
  "image/png": "🖼",
  "image/tiff": "🖼",
  "image/webp": "🖼",
  "image/bmp": "🖼",
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentQueue({ documents }) {
  const counts = {
    queued: documents.filter((d) => d.status === "queued").length,
    analyzing: documents.filter((d) => d.status === "analyzing").length,
    completed: documents.filter((d) => d.status === "completed").length,
    needs_review: documents.filter((d) => d.status === "needs_review").length,
  };

  if (documents.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📭</div>
        <h3>No documents in queue</h3>
        <p>Upload documents to begin processing</p>
      </div>
    );
  }

  return (
    <div>
      <div className="queue-header">
        <span className="section-title">Processing Queue</span>
        <div className="queue-stats">
          {counts.queued > 0 && <span className="stat">Queued: <span>{counts.queued}</span></span>}
          {counts.analyzing > 0 && <span className="stat">Analyzing: <span>{counts.analyzing}</span></span>}
          {counts.completed > 0 && <span className="stat">Done: <span>{counts.completed}</span></span>}
          {counts.needs_review > 0 && <span className="stat">Review: <span style={{ color: "var(--warn)" }}>{counts.needs_review}</span></span>}
        </div>
      </div>

      <div className="doc-list">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className={`doc-card ${doc.status === "analyzing" ? "scanning" : ""}`}
          >
            <div className="doc-icon">
              {FILE_ICONS[doc.type] || "📄"}
            </div>
            <div className="doc-info">
              <div className="doc-name">{doc.name}</div>
              <div className="doc-meta">
                {formatSize(doc.size)} · {new Date(doc.uploadedAt).toLocaleTimeString()}
                {doc.result && ` · ${doc.result.documentType}`}
              </div>
            </div>
            {(doc.status === "queued" || doc.status === "analyzing") && (
              <div className="progress-wrap">
                <div className="progress-label">
                  <span>{doc.status === "analyzing" ? "Analyzing" : "Uploading"}</span>
                  <span>{Math.floor(doc.progress)}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${doc.progress}%` }} />
                </div>
              </div>
            )}
            {doc.confidence !== undefined && doc.status !== "analyzing" && (
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", textAlign: "right", minWidth: 60 }}>
                <div style={{ marginBottom: 2 }}>CONF</div>
                <div className={`conf-value ${doc.confidence >= 0.75 ? "high" : doc.confidence >= 0.5 ? "medium" : "low"}`}>
                  {(doc.confidence * 100).toFixed(0)}%
                </div>
              </div>
            )}
            <div className={`status-chip ${doc.status}`}>
              {doc.status.replace("_", " ")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
