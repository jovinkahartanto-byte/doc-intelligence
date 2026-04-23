import { useState } from "react";

// ── Flatten Azure CU EmployeeRecords array into flat field rows ───────────────
function flattenToFieldRows(extractedFields) {
  if (!extractedFields) return { fields: {}, confs: {} };

  const fields = {};
  const confs  = {};

  // Handle EmployeeRecords array (payroll format)
  const empRecords = extractedFields.EmployeeRecords?.valueArray || extractedFields.EmployeeRecords;
  if (Array.isArray(empRecords)) {
    empRecords.forEach((item, idx) => {
      const obj = item.valueObject || item;
      const rowNum = idx + 1;
      Object.entries(obj).forEach(([key, val]) => {
        if (typeof val === "object" && val !== null) {
          const label = `Row ${rowNum}: ${key}`;
          fields[label] = val.valueNumber !== undefined ? String(val.valueNumber)
                        : val.valueString !== undefined ? val.valueString
                        : val.content || "";
          confs[label] = val.confidence || 0;
        }
      });
    });
    return { fields, confs };
  }

  // Generic fields fallback
  Object.entries(extractedFields).forEach(([key, val]) => {
    if (typeof val === "object" && val !== null) {
      fields[key] = val.valueString ?? (val.valueNumber !== undefined ? String(val.valueNumber) : val.content || "");
      confs[key]  = val.confidence || 0;
    } else {
      fields[key] = String(val ?? "");
      confs[key]  = 0;
    }
  });
  return { fields, confs };
}

function confBadge(c) {
  if (!c || c === 0) return { cls: "badge-none", label: "—" };
  const pct = Math.round(c * 100) + "%";
  if (c >= 0.9) return { cls: "badge-high", label: pct };
  if (c >= 0.7) return { cls: "badge-med",  label: pct };
  return { cls: "badge-low", label: pct };
}

function countByConf(confs) {
  let high = 0, med = 0, low = 0;
  Object.values(confs).forEach(c => {
    if (c >= 0.9) high++;
    else if (c >= 0.7) med++;
    else if (c > 0) low++;
  });
  return { high, med, low, total: Object.keys(confs).length };
}

// ── Single Document Result View ───────────────────────────────────────────────
function DocumentResult({ doc, onClose, onApprove, onReject }) {
  const rawFields = doc.result?.extractedFields;
  const { fields: initFields, confs } = flattenToFieldRows(rawFields);
  const [fields, setFields]     = useState(initFields);
  const [validated, setValidated] = useState(false);
  const [recordId, setRecordId]   = useState(null);
  const [showRaw, setShowRaw]     = useState(false);
  const [step, setStep]           = useState(doc.result ? 3 : 2);

  const stats = countByConf(confs);
  const confidence = doc.confidence;
  const fmtConf = (c) => c == null ? "—" : (c * 100).toFixed(1) + "%";

  const handleValidate = () => {
    const id = "REC-" + Date.now().toString(36).toUpperCase();
    setRecordId(id);
    setValidated(true);
    setStep(4);
    if (onApprove) onApprove(doc.id, { ...doc.result, extractedFields: fields });
  };

  const handleReject = () => {
    if (onReject) onReject(doc.id, "Rejected during review");
  };

  const handleExportCSV = () => {
    const rows = Object.entries(fields).map(([k, v]) => [k, v, Math.round((confs[k] || 0) * 100) + "%"]);
    const csv  = [["Field","Value","Confidence"], ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${doc.name.replace(/\.[^.]+$/, "")}_fields.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#f8fafc", padding: "24px", borderRadius: 12, border: "1px solid #e2e8f0" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>📄 {doc.name}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
            Azure AI Document Intelligence &nbsp;·&nbsp; Payroll extraction &nbsp;·&nbsp; HITL validation
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "#94a3b8", cursor: "pointer", lineHeight: 1 }}>×</button>
      </div>

      {/* Stepper */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
        {[["1","Configure & upload"],["2","Extract"],["3","Review & edit"],["4","Validate"]].map(([num, label], i) => {
          const n = i + 1;
          const isDone   = n < step;
          const isActive = n === step;
          return (
            <div key={num} style={{ display: "flex", alignItems: "center", flex: n < 4 ? 1 : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 500, color: isDone ? "#16a34a" : isActive ? "#1e293b" : "#94a3b8", whiteSpace: "nowrap" }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", border: `1.5px solid ${isDone ? "#86efac" : isActive ? "#1e293b" : "#cbd5e1"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, background: isDone ? "#dcfce7" : isActive ? "#1e293b" : "transparent", color: isDone ? "#16a34a" : isActive ? "#fff" : "#94a3b8", flexShrink: 0 }}>
                  {isDone ? "✓" : num}
                </div>
                {label}
              </div>
              {n < 4 && <div style={{ flex: 1, height: 1, background: "#e2e8f0", margin: "0 10px" }} />}
            </div>
          );
        })}
      </div>

      {/* Summary cards */}
      {stats.total > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
          {[
            ["Fields extracted", stats.total, "#0f172a"],
            ["High confidence", stats.high, "#15803d"],
            ["Medium confidence", stats.med, "#92400e"],
            ["Needs review", stats.low, "#dc2626"],
          ].map(([label, val, color]) => (
            <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 22, fontWeight: 600, color }}>{val}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>

        {/* Left — doc info */}
        <div>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 2.2 }}>
              <div><strong style={{ color: "#334155" }}>File:</strong> {doc.name}</div>
              <div><strong style={{ color: "#334155" }}>Type:</strong> {doc.result?.documentType || "Document"}</div>
              <div><strong style={{ color: "#334155" }}>Confidence:</strong>{" "}
                <span style={{ color: confidence >= 0.75 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{fmtConf(confidence)}</span>
              </div>
              <div><strong style={{ color: "#334155" }}>Pages:</strong> {doc.result?.pages || "—"}</div>
              <div><strong style={{ color: "#334155" }}>Model:</strong> {doc.result?.model || "azure-content-understanding"}</div>
              <div><strong style={{ color: "#334155" }}>Status:</strong>{" "}
                <span style={{ color: doc.result?.status === "completed" ? "#16a34a" : "#f59e0b", fontWeight: 500 }}>{doc.result?.status || "—"}</span>
              </div>
              <div><strong style={{ color: "#334155" }}>Uploaded:</strong> {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString() : "—"}</div>
            </div>
          </div>

          {/* Tags */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
            {(doc.result?.tags || []).map(tag => (
              <span key={tag} style={{ padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: tag.includes("high") ? "#dcfce7" : tag.includes("low") ? "#fee2e2" : "#f1f5f9", color: tag.includes("high") ? "#15803d" : tag.includes("low") ? "#dc2626" : "#475569" }}>
                {tag}
              </span>
            ))}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={handleExportCSV} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid #e2e8f0", background: "#fff", color: "#334155" }}>
              ↓ Export CSV
            </button>
            {!validated && (
              <button onClick={handleReject} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626" }}>
                ✗ Reject document
              </button>
            )}
          </div>
        </div>

        {/* Right — fields table */}
        <div>
          {Object.keys(fields).length > 0 ? (
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 76px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <div>Field</div><div>Value</div><div style={{ textAlign: "center" }}>Conf.</div>
              </div>

              {/* Field rows */}
              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                {Object.entries(fields).map(([key, val]) => {
                  const { cls, label } = confBadge(confs[key]);
                  const badgeStyle = {
                    "badge-high": { background: "#dcfce7", color: "#15803d" },
                    "badge-med":  { background: "#fef9c3", color: "#92400e" },
                    "badge-low":  { background: "#fee2e2", color: "#dc2626" },
                    "badge-none": { background: "#f1f5f9", color: "#64748b" },
                  }[cls];
                  return (
                    <div key={key} style={{ display: "grid", gridTemplateColumns: "200px 1fr 76px", borderBottom: "1px solid #f1f5f9", alignItems: "center" }}>
                      <div style={{ padding: "8px 12px", fontSize: 12, fontWeight: 500, color: "#475569", background: "#fafafa", borderRight: "1px solid #f1f5f9", minHeight: 36, display: "flex", alignItems: "center", wordBreak: "break-word" }}>
                        {key}
                      </div>
                      <div style={{ padding: "4px 8px" }}>
                        <input
                          type="text"
                          value={val}
                          onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))}
                          disabled={validated}
                          style={{ border: "none", background: "transparent", fontSize: 13, color: "#1e293b", width: "100%", outline: "none", padding: "4px 6px", borderRadius: 6, fontFamily: "inherit" }}
                          onFocus={e => e.target.style.background = "#eff6ff"}
                          onBlur={e => e.target.style.background = "transparent"}
                        />
                      </div>
                      <div style={{ padding: "6px 8px", textAlign: "center" }}>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, ...badgeStyle }}>
                          {label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ padding: "24px", textAlign: "center", fontSize: 13, color: "#94a3b8", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 12 }}>
              No fields extracted. Check Raw JSON below.
            </div>
          )}

          {/* Raw JSON toggle */}
          <div style={{ marginBottom: 12 }}>
            <span onClick={() => setShowRaw(r => !r)} style={{ fontSize: 12, color: "#3b82f6", cursor: "pointer", textDecoration: "underline" }}>
              {showRaw ? "Hide" : "Show"} raw JSON
            </span>
            {showRaw && (
              <pre style={{ background: "#0f172a", borderRadius: 8, padding: 12, fontFamily: "monospace", fontSize: 11, color: "#94a3b8", maxHeight: 240, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: 8 }}>
                {JSON.stringify(rawFields, null, 2)}
              </pre>
            )}
          </div>

          {/* Validate banner */}
          {validated && (
            <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "14px 18px", marginBottom: 12 }}>
              <strong style={{ color: "#15803d", fontSize: 14 }}>✓ Record validated and saved</strong>
              <p style={{ fontSize: 13, color: "#166534", marginTop: 4 }}>
                Record ID: <strong>{recordId}</strong> &nbsp;·&nbsp; {Object.keys(fields).length} fields saved &nbsp;·&nbsp; {new Date().toLocaleString()}
              </p>
            </div>
          )}

          {/* Action row */}
          {!validated && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={handleValidate}
                disabled={Object.keys(fields).length === 0}
                style={{ padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", background: "#16a34a", color: "#fff", border: "1px solid #16a34a", opacity: Object.keys(fields).length === 0 ? 0.45 : 1 }}
              >
                ✓ Validate &amp; save
              </button>
              <button onClick={() => setFields(initFields)} style={{ padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "1px solid #e2e8f0", background: "#fff", color: "#334155" }}>
                Reset edits
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Results Panel ────────────────────────────────────────────────────────
export default function ResultsPanel({ documents, onApprove, onReject }) {
  const [search, setSearch]   = useState("");
  const [selected, setSelected] = useState(null);

  const filtered = documents.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.result?.documentType?.toLowerCase().includes(search.toLowerCase())
  );

  const fmtConf   = (c) => c == null ? "—" : (c * 100).toFixed(1) + "%";
  const confColor = (c) => c == null ? "#dc2626" : c >= 0.75 ? "#16a34a" : c >= 0.5 ? "#92400e" : "#dc2626";

  const handleExportAll = () => {
    const headers = ["Filename","Type","Confidence","Status","Human Reviewed","Uploaded At"];
    const rows    = documents.map(d => [d.name, d.result?.documentType||"", fmtConf(d.confidence), d.result?.status||"", d.humanReviewed?"Yes":"No", d.uploadedAt||""]);
    const csv = [headers,...rows].map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href=url; a.download=`docintel-${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (documents.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📊</div>
        <h3>No results yet</h3>
        <p>Processed documents will appear here</p>
      </div>
    );
  }

  if (selected) {
    return (
      <div>
        <DocumentResult
          doc={selected}
          onClose={() => setSelected(null)}
          onApprove={(id, data) => { if (onApprove) onApprove(id, data); setSelected(null); }}
          onReject={(id, reason) => { if (onReject) onReject(id, reason); setSelected(null); }}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="results-toolbar">
        <input className="search-input" placeholder="Search results..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="export-btn" onClick={handleExportAll}>↓ Export all CSV</button>
        </div>
      </div>

      <table className="results-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Type</th>
            <th>Confidence</th>
            <th>Status</th>
            <th>Tags</th>
            <th>Review</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(doc => (
            <tr key={doc.id}>
              <td>
                <div style={{ fontWeight: 500 }}>{doc.name}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginTop: 2 }}>{doc.backendId || "—"}</div>
              </td>
              <td>{doc.result?.documentType || "—"}</td>
              <td>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: confColor(doc.confidence) }}>
                  {fmtConf(doc.confidence)}
                </span>
              </td>
              <td>
                <span style={{ padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: doc.result?.status === "completed" ? "#dcfce7" : "#fef9c3", color: doc.result?.status === "completed" ? "#15803d" : "#92400e" }}>
                  {doc.result?.status || "—"}
                </span>
              </td>
              <td>{(doc.result?.tags || []).map(tag => <span key={tag} className={`tag ${tag.replace(/[^a-z]/g, "-")}`}>{tag}</span>)}</td>
              <td>{doc.humanReviewed ? <span className="tag human-reviewed">Human</span> : <span className="tag high-confidence">Auto</span>}</td>
              <td>
                <button
                  onClick={() => setSelected(doc)}
                  style={{ padding: "5px 14px", borderRadius: 7, border: "1px solid #e2e8f0", background: "#1e293b", color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                >
                  Review →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="powerbi-banner">
        <div className="powerbi-banner-text">
          <h4>Power BI Integration Ready</h4>
          <p>Click Review on any document to validate fields, then export CSV for Power BI.</p>
        </div>
        <button className="powerbi-btn" onClick={handleExportAll}>📊 Export for Power BI</button>
      </div>
    </div>
  );
}
