import { useState, useEffect, useRef } from "react";

// ── Flatten Azure CU fields to flat key/value/confidence rows ─────────────────
function flattenFields(extractedFields) {
  if (!extractedFields) return { fields: {}, confs: {} };
  const fields = {};
  const confs  = {};
  const extractValue = (val) => {
    if (typeof val !== "object" || val === null) return String(val ?? "");
    if (val.valueNumber !== undefined) return String(val.valueNumber);
    if (val.valueString !== undefined) return val.valueString;
    if (val.content     !== undefined) return val.content;
    return "";
  };
  const extractConf = (val) => typeof val === "object" && val !== null && typeof val.confidence === "number" ? val.confidence : null;

  const empRecords = extractedFields.EmployeeRecords?.valueArray || extractedFields.EmployeeRecords;
  if (Array.isArray(empRecords)) {
    empRecords.forEach((item, idx) => {
      const obj = item.valueObject || item;
      Object.entries(obj).forEach(([key, val]) => {
        const label = `Row ${idx + 1}: ${key}`;
        fields[label] = extractValue(val);
        confs[label]  = extractConf(val);
      });
    });
    return { fields, confs };
  }
  Object.entries(extractedFields).forEach(([key, val]) => {
    fields[key] = extractValue(val);
    confs[key]  = extractConf(val);
  });
  return { fields, confs };
}

function confBadge(c) {
  if (c === null || c === undefined) return { bg: "#f1f5f9", color: "#64748b", label: "—" };
  const pct = Math.round(c * 100) + "%";
  if (c >= 0.9) return { bg: "#dcfce7", color: "#15803d", label: pct };
  if (c >= 0.75) return { bg: "#fef9c3", color: "#92400e", label: pct };
  return { bg: "#fee2e2", color: "#dc2626", label: pct };
}

// ── PDF / Image Preview ───────────────────────────────────────────────────────
function DocPreview({ file }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isPdf, setIsPdf]           = useState(false);
  const canvasRef                   = useRef(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);

    if (file.type === "application/pdf") {
      setIsPdf(true);
      // Use PDF.js if available, otherwise show embed
      if (window.pdfjsLib) {
        window.pdfjsLib.getDocument(url).promise.then(pdf => {
          pdf.getPage(1).then(page => {
            const vp     = page.getViewport({ scale: 1.2 });
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width  = vp.width;
            canvas.height = vp.height;
            page.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
          });
        });
      } else {
        setPreviewUrl(url);
      }
    } else if (file.type?.startsWith("image/")) {
      setIsPdf(false);
      setPreviewUrl(url);
    }
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!file) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontSize: 13 }}>
      No preview available
    </div>
  );

  if (isPdf && window.pdfjsLib) {
    return (
      <canvas ref={canvasRef} style={{ width: "100%", borderRadius: 6, display: "block" }} />
    );
  }

  if (isPdf) {
    return (
      <embed src={previewUrl} type="application/pdf" style={{ width: "100%", height: "100%", borderRadius: 6, minHeight: 400 }} />
    );
  }

  if (previewUrl) {
    return <img src={previewUrl} alt="Document preview" style={{ width: "100%", borderRadius: 6, display: "block" }} />;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8", fontSize: 13 }}>
      Loading preview...
    </div>
  );
}

// ── Review Card ───────────────────────────────────────────────────────────────
function ReviewCard({ doc, onApprove, onReject }) {
  const rawFields = doc.result?.extractedFields;
  const { fields: initFields, confs } = flattenFields(rawFields);
  const [fields, setFields]     = useState(initFields);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [validated, setValidated] = useState(false);

  const avgConf = (() => {
    const vals = Object.values(confs).filter(c => c !== null && c !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : doc.confidence;
  })();

  const lowConfFields = Object.entries(confs).filter(([, c]) => c !== null && c < 0.75);

  const fmtConf = (c) => c == null ? "—" : (c * 100).toFixed(1) + "%";
  const confColor = (c) => c == null ? "#94a3b8" : c >= 0.75 ? "#16a34a" : c >= 0.5 ? "#92400e" : "#dc2626";

  const handleApprove = () => {
    setValidated(true);
    onApprove(doc.id, { ...doc.result, documentType: doc.result?.documentType, extractedFields: fields });
  };

  const handleReject = () => {
    if (showReject && rejectReason) {
      onReject(doc.id, rejectReason);
    } else {
      setShowReject(true);
    }
  };

  // Show compact approved state
  if (doc.status === "approved") {
    return (
      <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 14 }}>{doc.name}</div>
          <div style={{ fontSize: 11, color: "#16a34a", marginTop: 3 }}>Reviewed and approved · {new Date().toLocaleString()}</div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#15803d", background: "#dcfce7", padding: "4px 14px", borderRadius: 20 }}>✓ Approved</span>
      </div>
    );
  }

  if (doc.status === "rejected") {
    return (
      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 500, color: "#0f172a" }}>{doc.name}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#dc2626" }}>✗ Rejected</span>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", border: "2px solid #f59e0b", borderRadius: 12, overflow: "hidden", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fffbeb" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{doc.name}</div>
          <div style={{ fontSize: 11, color: "#92400e", marginTop: 2, fontFamily: "monospace" }}>
            Low confidence — manual review required
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lowConfFields.length > 0 && (
            <span style={{ fontSize: 11, background: "#fee2e2", color: "#dc2626", padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>
              {lowConfFields.length} field{lowConfFields.length !== 1 ? "s" : ""} need attention
            </span>
          )}
          <span style={{ fontSize: 16, fontWeight: 700, color: confColor(avgConf) }}>
            {fmtConf(avgConf)}
          </span>
          <div style={{ width: 120, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${Math.round((avgConf ?? 0) * 100)}%`, height: "100%", background: (avgConf ?? 0) >= 0.75 ? "#16a34a" : (avgConf ?? 0) >= 0.5 ? "#f59e0b" : "#dc2626", borderRadius: 3, transition: "width 0.3s" }} />
          </div>
        </div>
      </div>

      {/* Two-column layout: PDF preview + fields */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 0 }}>

        {/* Left — PDF preview */}
        <div style={{ borderRight: "1px solid #f1f5f9", padding: 16, background: "#f8fafc", minHeight: 400 }}>
          <div style={{ fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", marginBottom: 10 }}>
            Document Preview
          </div>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", minHeight: 360 }}>
            <DocPreview file={doc.file} />
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "#64748b", lineHeight: 1.9 }}>
            <div><strong style={{ color: "#334155" }}>Type:</strong> {doc.result?.documentType || "Document"}</div>
            <div><strong style={{ color: "#334155" }}>Pages:</strong> {doc.result?.pages || "—"}</div>
            <div><strong style={{ color: "#334155" }}>Model:</strong> {doc.result?.model || "azure-content-understanding"}</div>
            <div><strong style={{ color: "#334155" }}>Uploaded:</strong> {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString() : "—"}</div>
          </div>
        </div>

        {/* Right — fields table */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {/* Field table header */}
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 60px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "8px 12px", fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <div>Field</div><div>Value</div><div style={{ textAlign: "center" }}>Conf.</div>
          </div>

          {/* Scrollable field rows */}
          <div style={{ overflowY: "auto", maxHeight: 420, flex: 1 }}>
            {Object.entries(fields).length === 0 ? (
              <div style={{ padding: 20, color: "#94a3b8", fontSize: 13, textAlign: "center" }}>No fields extracted</div>
            ) : (
              Object.entries(fields).map(([key, val]) => {
                const c = confs[key];
                const badge = confBadge(c);
                const isLow = c !== null && c !== undefined && c < 0.75;
                return (
                  <div key={key} style={{ display: "grid", gridTemplateColumns: "180px 1fr 60px", borderBottom: "1px solid #f1f5f9", alignItems: "center", background: isLow ? "#fffbeb" : "transparent" }}>
                    <div style={{ padding: "7px 12px", fontSize: 11, fontWeight: isLow ? 600 : 400, color: isLow ? "#92400e" : "#475569", background: isLow ? "#fef9c3" : "#fafafa", borderRight: "1px solid #f1f5f9", wordBreak: "break-word" }}>
                      {key}
                    </div>
                    <div style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={val}
                        onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))}
                        style={{ border: "none", background: "transparent", fontSize: 12, color: "#1e293b", width: "100%", outline: "none", padding: "4px 6px", borderRadius: 4, fontFamily: "inherit" }}
                        onFocus={e => e.target.style.background = "#eff6ff"}
                        onBlur={e => e.target.style.background = "transparent"}
                      />
                    </div>
                    <div style={{ padding: "6px 8px", textAlign: "center" }}>
                      <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: badge.bg, color: badge.color }}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Actions */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
            {validated ? (
              <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ color: "#15803d", fontSize: 13 }}>✓ Approved and saved</strong>
                {(() => {
                  const baseName = doc.name.replace(/\.[^.]+$/, "");
                  const dl = (c, f, t) => { const b = new Blob([c],{type:t}); const u=URL.createObjectURL(b); const a=document.createElement("a"); a.href=u; a.download=f; a.click(); URL.revokeObjectURL(u); };
                  const records = (() => {
                    const rows = {};
                    Object.entries(fields).forEach(([key, val]) => {
                      const m = key.match(/^Row (\d+): (.+)$/);
                      if (m) { const n=parseInt(m[1]); if(!rows[n]) rows[n]={Employee:n}; rows[n][m[2]]=val||""; }
                    });
                    return Object.values(rows);
                  })();
                  const exportCSV = () => {
                    if (records.length > 0) {
                      const cols = ["Employee", ...Object.keys(records[0]).filter(k=>k!=="Employee")];
                      dl([cols.join(","), ...records.map(r=>cols.map(c=>`"${r[c]??""}`).join(","))].join("\n"), `${baseName}_results.csv`, "text/csv");
                    } else {
                      dl(["Field,Value",...Object.entries(fields).map(([k,v])=>`"${k}","${v??""}"`)].join("\n"), `${baseName}_results.csv`, "text/csv");
                    }
                  };
                  const exportJSON = () => dl(JSON.stringify({ document: doc.name, exportedAt: new Date().toISOString(), humanReviewed: true, employeeRecords: records.length > 0 ? records : fields }, null, 2), `${baseName}_results.json`, "application/json");
                  const exportTXT = () => {
                    const div = "─".repeat(50);
                    const lines = ["DOCINTEL EXTRACTION REPORT", div, `Document: ${doc.name}`, `Exported: ${new Date().toLocaleString()}`, `Validated: Yes · Human reviewed`, div, ""];
                    if (records.length > 0) {
                      lines.push(`EMPLOYEE RECORDS (${records.length})`); lines.push(div);
                      records.forEach((r,i) => { lines.push(`Employee ${i+1}`); Object.entries(r).forEach(([k,v]) => { if(k!=="Employee") lines.push(`  ${k.padEnd(20)}: ${v??""}`); }); lines.push(""); });
                    } else { Object.entries(fields).forEach(([k,v]) => lines.push(`${k.padEnd(28)}: ${v??""}`)); }
                    lines.push(div); lines.push("Generated by DocIntel");
                    dl(lines.join("\n"), `${baseName}_results.txt`, "text/plain");
                  };
                  return (
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={exportCSV} style={{ padding:"5px 11px", borderRadius:6, border:"1px solid #86efac", background:"#fff", color:"#15803d", fontSize:11, cursor:"pointer", fontWeight:600 }}>↓ CSV</button>
                      <button onClick={exportJSON} style={{ padding:"5px 11px", borderRadius:6, border:"1px solid #86efac", background:"#fff", color:"#15803d", fontSize:11, cursor:"pointer", fontWeight:600 }}>↓ JSON</button>
                      <button onClick={exportTXT} style={{ padding:"5px 11px", borderRadius:6, border:"1px solid #86efac", background:"#fff", color:"#15803d", fontSize:11, cursor:"pointer", fontWeight:600 }}>↓ TXT</button>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <>
                {showReject && (
                  <input
                    type="text"
                    placeholder="Rejection reason..."
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, marginBottom: 10, fontFamily: "inherit", outline: "none" }}
                  />
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleApprove} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid #16a34a", background: "#16a34a", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                    ✓ Approve
                  </button>
                  <button onClick={handleReject} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                    {showReject ? "Confirm Reject" : "✗ Reject"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main HumanReview ──────────────────────────────────────────────────────────
export default function HumanReview({ queue, onApprove, onReject }) {
  const pending = queue.filter((d) => d.status === "pending_review");
  const done    = queue.filter((d) => ["approved", "rejected"].includes(d.status));

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
          &nbsp;·&nbsp; Documents flagged when AI confidence &lt; 75%
        </p>
      </div>

      {pending.length > 0 && (
        <>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--warn)", marginBottom: 12 }}>
            ⚠ Pending Review ({pending.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 28 }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {done.map((doc) => (
              <ReviewCard key={doc.id} doc={doc} onApprove={onApprove} onReject={onReject} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}