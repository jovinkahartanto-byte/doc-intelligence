import { useState } from "react";

function ConfidenceBar({ value }) {
  const pct = Math.round(value * 100);
  const cls = value >= 0.75 ? "high" : value >= 0.5 ? "" : "low";
  return (
    <div className="confidence-bar">
      <div className="conf-track">
        <div className="conf-fill" style={{ width: `${pct}%` }} />
      </div>
      <span>{pct}%</span>
    </div>
  );
}

function ReviewCard({ doc, onApprove, onReject }) {
  const [fields, setFields] = useState(doc.result?.extractedFields || {});
  const [docType, setDocType] = useState(doc.result?.documentType || "");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const handleApprove = () => {
    onApprove(doc.id, { ...doc.result, documentType: docType, extractedFields: fields });
  };

  const handleReject = () => {
    if (showReject && rejectReason) {
      onReject(doc.id, rejectReason);
    } else {
      setShowReject(true);
    }
  };

  if (doc.status === "approved") {
    return (
      <div className="review-card approved">
        <div className="review-card-header">
          <span className="review-card-title">{doc.name}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--success)" }}>✓ Approved</span>
        </div>
      </div>
    );
  }

  if (doc.status === "rejected") {
    return (
      <div className="review-card rejected">
        <div className="review-card-header">
          <span className="review-card-title">{doc.name}</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--danger)" }}>✗ Rejected</span>
        </div>
      </div>
    );
  }

  return (
    <div className="review-card pending">
      <div className="review-card-header">
        <div>
          <div className="review-card-title">{doc.name}</div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2, fontFamily: "var(--mono)" }}>
            Low confidence — manual review required
          </div>
        </div>
        <ConfidenceBar value={doc.confidence} />
      </div>

      <div className="review-card-body">
        <div className="field-row">
          <span className="field-label">Doc Type</span>
          <input
            className="field-input"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
          />
        </div>
        {Object.entries(fields).filter(([, v]) => v !== null).map(([key, value]) => (
          <div key={key} className="field-row">
            <span className="field-label">{key.replace(/([A-Z])/g, " $1").trim()}</span>
            <input
              className="field-input"
              value={value}
              onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
            />
          </div>
        ))}

        {showReject && (
          <div style={{ marginTop: 12 }}>
            <input
              className="field-input"
              style={{ width: "100%" }}
              placeholder="Rejection reason..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="review-actions">
        <button className="btn-approve" onClick={handleApprove}>✓ Approve</button>
        <button className="btn-reject" onClick={handleReject}>
          {showReject ? "Confirm Reject" : "✗ Reject"}
        </button>
      </div>
    </div>
  );
}

export default function HumanReview({ queue, onApprove, onReject }) {
  const pending = queue.filter((d) => d.status === "pending_review");
  const done = queue.filter((d) => ["approved", "rejected"].includes(d.status));

  if (queue.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">👁</div>
        <h3>No items awaiting review</h3>
        <p>Documents with confidence below 75% will appear here</p>
      </div>
    );
  }

  return (
    <div>
      <div className="review-header">
        <h2 className="review-title">Human-in-the-Loop Review</h2>
        <p className="review-sub">
          {pending.length} item{pending.length !== 1 ? "s" : ""} awaiting review
          · Documents flagged when AI confidence &lt; 75%
        </p>
      </div>

      {pending.length > 0 && (
        <>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--warn)", marginBottom: 12 }}>
            ⚠ Pending Review ({pending.length})
          </div>
          <div className="review-grid" style={{ marginBottom: 28 }}>
            {pending.map((doc) => (
              <ReviewCard key={doc.id} doc={doc} onApprove={onApprove} onReject={onReject} />
            ))}
          </div>
        </>
      )}

      {done.length > 0 && (
        <>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 12 }}>
            Completed ({done.length})
          </div>
          <div className="review-grid">
            {done.map((doc) => (
              <ReviewCard key={doc.id} doc={doc} onApprove={onApprove} onReject={onReject} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
