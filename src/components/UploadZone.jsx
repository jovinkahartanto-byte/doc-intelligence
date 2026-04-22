import { useState, useRef, useCallback } from "react";

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/tiff", "image/bmp"];
const MAX_SIZE_MB = 50;

export default function UploadZone({ onFilesAdded }) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const validateFiles = (files) => {
    const valid = [];
    const errors = [];
    for (const f of files) {
      if (!ACCEPTED.includes(f.type)) {
        errors.push(`${f.name}: unsupported type`);
      } else if (f.size > MAX_SIZE_MB * 1024 * 1024) {
        errors.push(`${f.name}: exceeds ${MAX_SIZE_MB}MB limit`);
      } else {
        valid.push(f);
      }
    }
    return { valid, errors };
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const { valid, errors } = validateFiles(files);
    if (errors.length) setError(errors.join(", "));
    else setError(null);
    if (valid.length) onFilesAdded(valid);
  }, [onFilesAdded]);

  const handleChange = (e) => {
    const files = Array.from(e.target.files);
    const { valid, errors } = validateFiles(files);
    if (errors.length) setError(errors.join(", "));
    else setError(null);
    if (valid.length) onFilesAdded(valid);
    e.target.value = "";
  };

  return (
    <div className="upload-container">
      <div className="upload-header">
        <h1 className="upload-title">Upload Documents</h1>
        <p className="upload-sub">
          Drop PDF or image files to extract structured data using Azure Content Understanding.
          Low-confidence results are automatically flagged for human review.
        </p>
      </div>

      <div
        className={`upload-zone ${dragOver ? "drag-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="upload-icon">📄</div>
        <h3>Drop files here or click to browse</h3>
        <p>Supports <em>PDF</em>, <em>JPEG</em>, <em>PNG</em>, <em>TIFF</em>, <em>WEBP</em>, <em>BMP</em></p>
        <div className="upload-types">
          {["PDF", "JPG", "PNG", "TIFF", "BMP", "WEBP"].map((t) => (
            <span key={t} className="type-pill">{t}</span>
          ))}
        </div>
        <button className="upload-btn" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
          ↑ Select Files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,image/*"
          multiple
          style={{ display: "none" }}
          onChange={handleChange}
        />
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 4, color: "var(--danger)", fontSize: 12, fontFamily: "var(--mono)" }}>
          ⚠ {error}
        </div>
      )}

      <div className="upload-info">
        <div className="info-item">
          <div className="info-label">Max File Size</div>
          <div className="info-value">50 MB</div>
        </div>
        <div className="info-item">
          <div className="info-label">Review Threshold</div>
          <div className="info-value">75% confidence</div>
        </div>
        <div className="info-item">
          <div className="info-label">Powered By</div>
          <div className="info-value">Azure AI Foundry</div>
        </div>
      </div>
    </div>
  );
}
