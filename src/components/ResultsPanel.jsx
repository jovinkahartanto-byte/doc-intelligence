import { useState } from "react";

function flattenFields(fields) {
  if (!fields) return {};
  const out = {};
  for (const [key, val] of Object.entries(fields)) {
    if (val === null || val === undefined) continue;
    if (typeof val === "object") {
      out[key] = val.valueString ?? val.valueNumber ?? val.value ?? val.content ?? "";
    } else {
      out[key] = val;
    }
  }
  return out;
}

function extractEmployeeRows(extractedFields) {
  if (!extractedFields) return null;
  const recordsField = extractedFields.EmployeeRecords;
  if (!recordsField) return null;
  const arr = recordsField.valueArray || recordsField;
  if (!Array.isArray(arr)) return null;
  return arr.map((item) => {
    const obj = item.valueObject || item;
    const row = {};
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === "object" && val !== null) {
        row[key] = val.valueNumber ?? val.valueString ?? val.value ?? val.content ?? "";
      } else {
        row[key] = val;
      }
    }
    return row;
  });
}

function fmt(val) {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "number") return val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return String(val);
}

function EmployeeTable({ rows }) {
  if (!rows || rows.length === 0) return (
    <div style={{ padding: "20px", color: "var(--text3)", fontSize: 12, fontStyle: "italic" }}>No employee records found.</div>
  );

  const cols = Object.keys(rows[0]);

  const colGroups = {
    "Employee":               ["EmployeeNumber"],
    "Salary":                 ["BasicSalary","Pcb"],
    "Employee Contributions": ["EmployeeEpf","EmployeeSocso","EmployeeEis"],
    "Employer Contributions": ["EmployerEpf","EmployerSocso","EmployerEis"],
    "Totals":                 ["TotalEpf","TotalSocso","TotalEis"],
  };

  const groupedCols  = Object.values(colGroups).flat();
  const extraCols    = cols.filter(c => !groupedCols.includes(c));
  const orderedCols  = [...groupedCols.filter(c => cols.includes(c)), ...extraCols];

  const totals = {};
  for (const col of orderedCols) {
    const vals = rows.map(r => r[col]).filter(v => typeof v === "number");
    if (vals.length === rows.length) totals[col] = vals.reduce((a, b) => a + b, 0);
  }

  const colorForCol = (col) => {
    if (col === "EmployeeNumber") return "var(--accent)";
    if (["BasicSalary","Pcb"].includes(col)) return "var(--text)";
    if (col.startsWith("Employee")) return "#f59e0b";
    if (col.startsWith("Employer")) return "#10b981";
    if (col.startsWith("Total")) return "#6366f1";
    return "var(--text2)";
  };

  const bgForCol = (col) => {
    if (["EmployeeEpf","EmployeeSocso","EmployeeEis"].includes(col)) return "rgba(245,158,11,0.04)";
    if (["EmployerEpf","EmployerSocso","EmployerEis"].includes(col)) return "rgba(16,185,129,0.04)";
    if (["TotalEpf","TotalSocso","TotalEis"].includes(col))          return "rgba(99,102,241,0.06)";
    return "transparent";
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
        <thead>
          {/* Group header row */}
          <tr style={{ background: "var(--surface3)" }}>
            {Object.entries(colGroups).map(([group, groupCols]) => {
              const present = groupCols.filter(c => cols.includes(c));
              if (!present.length) return null;
              const groupColor = group === "Employee Contributions" ? "#f59e0b"
                               : group === "Employer Contributions" ? "#10b981"
                               : group === "Totals" ? "#6366f1" : "var(--text3)";
              return (
                <th key={group} colSpan={present.length} style={{
                  padding: "6px 10px", textAlign: "center",
                  fontFamily: "var(--mono)", fontSize: 9,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  color: groupColor, borderBottom: "1px solid var(--border)",
                  borderRight: "1px solid var(--border2)",
                }}>
                  {group}
                </th>
              );
            })}
            {extraCols.length > 0 && (
              <th colSpan={extraCols.length} style={{ padding: "6px 10px", fontFamily: "var(--mono)", fontSize: 9, color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>Other</th>
            )}
          </tr>
          {/* Column name row */}
          <tr style={{ background: "var(--surface2)" }}>
            {orderedCols.map(col => (
              <th key={col} style={{
                padding: "8px 10px",
                textAlign: col === "EmployeeNumber" ? "left" : "right",
                fontFamily: "var(--mono)", fontSize: 10, fontWeight: 500,
                color: colorForCol(col),
                borderBottom: "1px solid var(--border)",
                background: bgForCol(col), whiteSpace: "nowrap",
              }}>
                {col.replace(/([A-Z])/g, " $1").trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
              {orderedCols.map(col => (
                <td key={col} style={{
                  padding: "9px 10px",
                  textAlign: col === "EmployeeNumber" ? "left" : "right",
                  fontFamily: col === "EmployeeNumber" ? "var(--mono)" : "inherit",
                  fontSize: 12, color: colorForCol(col),
                  background: bgForCol(col), whiteSpace: "nowrap",
                }}>
                  {fmt(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {Object.keys(totals).length > 0 && (
          <tfoot>
            <tr style={{ background: "var(--surface2)", borderTop: "2px solid var(--border2)" }}>
              {orderedCols.map(col => (
                <td key={col} style={{
                  padding: "9px 10px",
                  textAlign: col === "EmployeeNumber" ? "left" : "right",
                  fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700,
                  color: totals[col] !== undefined ? colorForCol(col) : "var(--text3)",
                  background: bgForCol(col), whiteSpace: "nowrap",
                }}>
                  {col === "EmployeeNumber"
                    ? <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)" }}>TOTAL ({rows.length})</span>
                    : totals[col] !== undefined ? fmt(totals[col]) : "—"}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function GenericFields({ fields }) {
  const flat    = flattenFields(fields);
  const entries = Object.entries(flat).filter(([, v]) => v !== "" && v !== null && v !== undefined);
  if (!entries.length) return <div style={{ fontSize: 12, color: "var(--text3)", fontStyle: "italic" }}>No fields extracted.</div>;
  return (
    <div>
      {entries.map(([key, val]) => (
        <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", gap: 12 }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)", flexShrink: 0 }}>
            {key.replace(/([A-Z])/g, " $1").trim()}
          </span>
          <span style={{ fontSize: 12, color: "var(--text)", textAlign: "right", wordBreak: "break-word" }}>{fmt(val)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ResultsPanel({ documents }) {
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState(null);
  const [activeView, setActiveView] = useState("table");

  const filtered = documents.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.result?.documentType?.toLowerCase().includes(search.toLowerCase())
  );

  const handleExportCSV = () => {
    if (selected) {
      const rows = extractEmployeeRows(selected.result?.extractedFields);
      if (rows && rows.length > 0) {
        const headers = Object.keys(rows[0]);
        const csv = [headers, ...rows.map(r => headers.map(h => r[h] ?? ""))].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = `${selected.name.replace(/\.[^.]+$/, "")}_records.csv`; a.click();
        URL.revokeObjectURL(url); return;
      }
    }
    const headers = ["Filename","Document Type","Confidence","Human Reviewed","Uploaded At"];
    const rows    = documents.map(d => [d.name, d.result?.documentType||"", d.confidence ? (d.confidence*100).toFixed(1)+"%" : "", d.humanReviewed?"Yes":"No", d.uploadedAt||""]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = `docintel-${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(documents.map(d => ({ id: d.backendId||d.id, filename: d.name, documentType: d.result?.documentType, confidence: d.confidence, humanReviewed: d.humanReviewed||false, extractedFields: d.result?.extractedFields, tags: d.result?.tags })), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `docintel-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
  };

  const fmtConf     = (c) => c == null ? "—" : (c * 100).toFixed(1) + "%";
  const confClass   = (c) => c == null ? "low" : c >= 0.75 ? "high" : c >= 0.5 ? "medium" : "low";

  if (documents.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📊</div>
        <h3>No results yet</h3>
        <p>Processed documents will appear here</p>
      </div>
    );
  }

  const selectedRows = selected ? extractEmployeeRows(selected.result?.extractedFields) : null;

  return (
    <div>
      <div className="results-toolbar">
        <input className="search-input" placeholder="Search results..." value={search} onChange={e => setSearch(e.target.value)} />
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
            <th>Records</th>
            <th>Tags</th>
            <th>Review</th>
            <th>View</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(doc => {
            const empRows = extractEmployeeRows(doc.result?.extractedFields);
            return (
              <tr key={doc.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{doc.name}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)", marginTop: 2 }}>{doc.backendId || "—"}</div>
                </td>
                <td>{doc.result?.documentType || "—"}</td>
                <td><span className={`conf-value ${confClass(doc.confidence)}`}>{fmtConf(doc.confidence)}</span></td>
                <td style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)" }}>
                  {empRows ? `${empRows.length} employees` : "—"}
                </td>
                <td>{(doc.result?.tags || []).map(tag => <span key={tag} className={`tag ${tag.replace(/[^a-z]/g, "-")}`}>{tag}</span>)}</td>
                <td>{doc.humanReviewed ? <span className="tag human-reviewed">Human</span> : <span className="tag high-confidence">Auto</span>}</td>
                <td>
                  <button
                    onClick={() => { setSelected(selected?.id === doc.id ? null : doc); setActiveView("table"); }}
                    style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid var(--border2)", background: selected?.id === doc.id ? "var(--accent2)" : "var(--surface2)", color: selected?.id === doc.id ? "white" : "var(--text2)", fontSize: 11, cursor: "pointer", fontFamily: "var(--mono)" }}
                  >
                    {selected?.id === doc.id ? "Close" : "View"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Detail Panel */}
      {selected && (
        <div style={{ marginTop: 16, background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 8, overflow: "hidden" }}>

          {/* Panel header */}
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)" }}>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{selected.name}</div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>
                {selected.result?.documentType || "Document"} · Confidence: <span style={{ color: selected.confidence >= 0.75 ? "var(--success)" : "var(--warn)" }}>{fmtConf(selected.confidence)}</span>
                {selectedRows ? ` · ${selectedRows.length} employee records` : ""}
                {" · "}Uploaded: {selected.uploadedAt ? new Date(selected.uploadedAt).toLocaleString() : "—"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {["table","fields","raw"].map(v => (
                <button key={v} onClick={() => setActiveView(v)} style={{
                  padding: "4px 12px", borderRadius: 4, border: "1px solid var(--border2)",
                  background: activeView === v ? "var(--accent)" : "var(--surface3)",
                  color: activeView === v ? "var(--bg)" : "var(--text2)",
                  fontSize: 10, cursor: "pointer", fontFamily: "var(--mono)",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  {v === "table" ? "Table" : v === "fields" ? "Fields" : "Raw JSON"}
                </button>
              ))}
              {activeView === "table" && selectedRows && (
                <button className="export-btn" onClick={handleExportCSV} style={{ padding: "4px 12px", fontSize: 10 }}>↓ Export Table</button>
              )}
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 22, lineHeight: 1 }}>×</button>
            </div>
          </div>

          {/* Table view */}
          {activeView === "table" && (
            <div>
              {selectedRows ? (
                <>
                  {/* Summary cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--border)" }}>
                    {[
                      ["Employees", selectedRows.length],
                      ["Total Basic Salary", "MYR " + fmt(selectedRows.reduce((s, r) => s + (Number(r.BasicSalary)||0), 0))],
                      ["Total EPF Contribution", "MYR " + fmt(selectedRows.reduce((s, r) => s + (Number(r.TotalEpf)||0), 0))],
                      ["Total SOCSO", "MYR " + fmt(selectedRows.reduce((s, r) => s + (Number(r.TotalSocso)||0), 0))],
                    ].map(([l, v]) => (
                      <div key={l} style={{ padding: "14px 18px", background: "var(--surface2)", borderRight: "1px solid var(--border)" }}>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 5 }}>{l}</div>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 17, fontWeight: 700, color: "var(--accent)" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <EmployeeTable rows={selectedRows} />
                </>
              ) : (
                <div style={{ padding: "16px 18px" }}>
                  <GenericFields fields={selected.result?.extractedFields} />
                </div>
              )}
            </div>
          )}

          {/* Fields view */}
          {activeView === "fields" && (
            <div style={{ padding: "16px 18px" }}>
              <GenericFields fields={selected.result?.extractedFields} />
            </div>
          )}

          {/* Raw JSON view */}
          {activeView === "raw" && (
            <div style={{ padding: "16px 18px" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 10 }}>Full Extracted Fields JSON</div>
              <pre style={{ background: "var(--surface3)", border: "1px solid var(--border)", borderRadius: 6, padding: "12px 14px", fontSize: 10, color: "var(--text2)", fontFamily: "var(--mono)", maxHeight: 400, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>
                {JSON.stringify(selected.result?.extractedFields, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="powerbi-banner">
        <div className="powerbi-banner-text">
          <h4>Power BI Integration Ready</h4>
          <p>Click View → Export Table on any document to get a flat employee records CSV ready for Power BI.</p>
        </div>
        <button className="powerbi-btn" onClick={handleExportCSV}>📊 Export for Power BI</button>
      </div>
    </div>
  );
}
