import { useState } from "react";

export default function ResultsPanel({ documents }) {
  const [search, setSearch] = useState("");

  const filtered = documents.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.result?.documentType?.toLowerCase().includes(search.toLowerCase())
  );

  const handleExportCSV = () => {
    const headers = ["ID", "Filename", "Document Type", "Confidence", "Date", "Human Reviewed", "Tags", "Processing Time"];
    const rows = documents.map((d) => [
      d.result?.extractedFields?.documentId || "",
      d.name,
      d.result?.documentType || "",
      d.confidence ? (d.confidence * 100).toFixed(1) + "%" : "",
      d.result?.extractedFields?.date || "",
      d.humanReviewed ? "Yes" : "No",
      (d.result?.tags || []).join("; "),
      d.result?.processingTime || "",
    ]);

    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `docintel-results-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const data = documents.map((d) => ({
      id: d.result?.extractedFields?.documentId,
      filename: d.name,
      documentType: d.result?.documentType,
      confidence: d.confidence,
      humanReviewed: d.humanReviewed || false,
      extractedFields: d.result?.extractedFields,
      tags: d.result?.tags,
      processingTime: d.result?.processingTime,
      reviewedAt: d.reviewedAt,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `docintel-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getConfClass = (c) => (c >= 0.75 ? "high" : c >= 0.5 ? "medium" : "low");

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
          </tr>
        </thead>
        <tbody>
          {filtered.map((doc) => (
            <tr key={doc.id}>
              <td>
                <div style={{ fontWeight: 500 }}>{doc.name}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginTop: 2 }}>
                  {doc.result?.extractedFields?.documentId}
                </div>
              </td>
              <td>{doc.result?.documentType || "—"}</td>
              <td>
                <span className={`conf-value ${getConfClass(doc.confidence)}`}>
                  {doc.confidence ? (doc.confidence * 100).toFixed(1) + "%" : "—"}
                </span>
              </td>
              <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)" }}>
                {doc.result?.extractedFields?.date || "—"}
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
            </tr>
          ))}
        </tbody>
      </table>

      <div className="powerbi-banner">
        <div className="powerbi-banner-text">
          <h4>Power BI Integration Ready</h4>
          <p>
            Export your results as CSV or JSON and connect to Power BI via Azure Blob Storage or direct API.
            See the architecture guide for full Power BI dataset configuration.
          </p>
        </div>
        <button className="powerbi-btn" onClick={handleExportCSV}>
          📊 Export for Power BI
        </button>
      </div>
    </div>
  );
}
