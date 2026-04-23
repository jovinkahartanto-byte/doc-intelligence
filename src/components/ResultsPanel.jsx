import { useState } from "react";

export default function ResultsPanel({ documents }) {
  const [search, setSearch]   = useState("");
  const [selected, setSelected] = useState(null);

  const filtered = documents.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.result?.documentType?.toLowerCase().includes(search.toLowerCase())
  );

  const handleExportCSV = () => {
    const headers = ["ID","Filename","Document Type","Confidence","Date","Human Reviewed","Tags","Processing Time"];
    const rows = documents.map((d) => [
      d.result?.extractedFields?.documentId || d.backendId || "",
      d.name,
      d.result?.documentType || "",
      d.confidence != null ? (d.confidence * 100).toFixed(1) + "%" : "",
      d.result?.extractedFields?.date || "",
      d.humanReviewed ? "Yes" : "No",
      (d.result?.tags || []).join("; "),
      d.result?.processingTime || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `docintel-results-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(documents.map(d => ({
      id:              d.backendId || d.id,
      filename:        d.name,
      documentType:    d.result?.documentType,
      confidence:      d.confidence,
      humanReviewed:   d.humanReviewed || false,
      extractedFields: d.result?.extractedFields,
      tags:            d.result?.tags,
      processingTime:  d.result?.processingTime,
      reviewedAt:      d.reviewedAt,
    })), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href = url; a.download = `docintel-results-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const getConfClass = (c) => {
    if (c == null) return "low";
    return c >= 0.75 ? "high" : c >= 0.5 ? "medium" : "low";
  };

  const formatConfidence = (c) => {
    if (c == null || c === undefined) return "—";
    return (c * 100).toFixed(1) + "%";
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

  return (
    <div>
      <div className="results-toolbar">
        <input
          className="search-input"
          placeholder="Search results..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="export-btn" onClick={handleExportCSV}>↓ CSV</button>
          <button className="export-btn" onClick={handleExportJSON}>↓ JSON</button>
        </div>
      </div>

      <table className="results-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Type</th>
            <th>Confidence</th>
            <th>Date</th>
            <th>Tags</th>
            <th>Review</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((doc) => (
            <tr key={doc.id}>
              <td>
                <div style={{ fontWeight: 500 }}>{doc.name}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginTop: 2 }}>
                  {doc.backendId || doc.result?.extractedFields?.documentId || "—"}
                </div>
              </td>
              <td>{doc.result?.documentType || "—"}</td>
              <td>
                <span className={`conf-value ${getConfClass(doc.confidence)}`}>
                  {formatConfidence(doc.confidence)}
                </span>
              </td>
              <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)" }}>
                {doc.result?.extractedFields?.date || doc.reviewedAt?.split("T")[0] || "—"}
              </td>
              <td>
                {(doc.result?.tags || []).map((tag) => (
                  <span key={tag} className={`tag ${tag.replace(/[^a-z]/g, "-")}`}>{tag}</span>
                ))}
              </td>
              <td>
                {doc.humanReviewed
                  ? <span className="tag human-reviewed">Human</span>
                  : <span className="tag high-confidence">Auto</span>}
              </td>
              <td>
                <button
                  onClick={() => setSelected(selected?.id === doc.id ? null : doc)}
                  style={{
                    padding: "3px 10px", borderRadius: 4, border: "1px solid var(--border2)",
                    background: selected?.id === doc.id ? "var(--accent2)" : "var(--surface2)",
                    color: selected?.id === doc.id ? "white" : "var(--text2)",
                    fontSize: 11, cursor: "pointer", fontFamily: "var(--mono)",
                  }}
                >
                  {selected?.id === doc.id ? "Close" : "View"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Extracted Fields Detail Panel ── */}
      {selected && (
        <div style={{
          marginTop: 16,
          background: "var(--surface)",
          border: "1px solid var(--border2)",
          borderRadius: 8,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--surface2)",
          }}>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                {selected.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                {selected.result?.documentType || "Document"} ·
                Confidence: <span style={{ color: selected.confidence >= 0.75 ? "var(--success)" : "var(--warn)" }}>
                  {formatConfidence(selected.confidence)}
                </span> ·
                Model: {selected.result?.model || "azure-content-understanding"}
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 18 }}
            >×</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>

            {/* Extracted Fields */}
            <div style={{ padding: "16px 18px", borderRight: "1px solid var(--border)" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 12 }}>
                Extracted Fields
              </div>

              {selected.result?.extractedFields && Object.keys(selected.result.extractedFields).length > 0 ? (
                Object.entries(selected.result.extractedFields).map(([key, value]) => {
                  if (value === null || value === undefined || value === "") return null;

                  // Handle nested objects from Azure Content Understanding
                  const displayValue = typeof value === "object"
                    ? (value.valueString || value.content || value.value || JSON.stringify(value))
                    : String(value);

                  return (
                    <div key={key} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      padding: "7px 0",
                      borderBottom: "1px solid var(--border)",
                      gap: 12,
                    }}>
                      <span style={{
                        fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase",
                        letterSpacing: "0.06em", color: "var(--text3)", flexShrink: 0, paddingTop: 2,
                      }}>
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text)", textAlign: "right", wordBreak: "break-word" }}>
                        {displayValue}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div style={{ fontSize: 12, color: "var(--text3)", fontStyle: "italic" }}>
                  No fields extracted — the analyzer may not have returned structured fields for this document type.
                  Check the raw text below.
                </div>
              )}
            </div>

            {/* Raw Text + Metadata */}
            <div style={{ padding: "16px 18px" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 12 }}>
                Raw Extracted Text
              </div>
              <div style={{
                background: "var(--surface3)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "10px 12px",
                fontSize: 11,
                color: "var(--text2)",
                fontFamily: "var(--mono)",
                maxHeight: 200,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                lineHeight: 1.6,
                marginBottom: 14,
              }}>
                {selected.result?.rawText
                  ? String(selected.result.rawText).substring(0, 2000) + (String(selected.result.rawText).length > 2000 ? "\n\n[truncated...]" : "")
                  : "No raw text available"}
              </div>

              {/* Metadata */}
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 10 }}>
                Metadata
              </div>
              {[
                ["Backend ID",       selected.backendId || "—"],
                ["Processing Time",  selected.result?.processingTime || "—"],
                ["Model",            selected.result?.model || "—"],
                ["Human Reviewed",   selected.humanReviewed ? "Yes" : "No"],
                ["Reviewed At",      selected.reviewedAt ? new Date(selected.reviewedAt).toLocaleString() : "—"],
                ["File Size",        selected.size ? `${(selected.size / 1024).toFixed(1)} KB` : "—"],
                ["File Type",        selected.type || "—"],
              ].map(([l, v]) => (
                <div key={l} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 11,
                }}>
                  <span style={{ color: "var(--text3)", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</span>
                  <span style={{ color: "var(--text2)" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="powerbi-banner">
        <div className="powerbi-banner-text">
          <h4>Power BI Integration Ready</h4>
          <p>Export your results as CSV or JSON and connect to Power BI via Azure Blob Storage or direct API.</p>
        </div>
        <button className="powerbi-btn" onClick={handleExportCSV}>
          📊 Export for Power BI
        </button>
      </div>
    </div>
  );
}
