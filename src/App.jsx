import { useState, useCallback } from "react";
import UploadZone from "./components/UploadZone";
import DocumentQueue from "./components/DocumentQueue";
import HumanReview from "./components/HumanReview";
import ResultsPanel from "./components/ResultsPanel";
import Header from "./components/Header";
import { processDocument, approveDocument, rejectDocument } from "./services/api";
import Dashboard from "./dashboard/OperationalDashboard";
import "./styles/global.css";

// ── DEMO MODE ────────────────────────────────────────────────────────────────
// true  → mock data, no Azure backend needed (for demos / presentations)
// false → real Azure Logic Apps + Blob Storage
const DEMO_MODE = true;
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Mock EPF/SOCSO/EIS payroll data generator
function generateMockResult(filename) {
  const empCount = Math.floor(Math.random() * 18) + 5;
  // ~70% chance high confidence, ~30% chance low (triggers Human Review)
  const baseConf = Math.random() > 0.3
    ? (Math.random() * 0.20 + 0.78)   // 0.78–0.98  → completed
    : (Math.random() * 0.14 + 0.61);  // 0.61–0.75  → needs_review

  const salaryBands = [1800,2000,2200,2500,2800,3000,3250,3500,3750,4200,5000,5350,6600,9800];

  const employees = Array.from({ length: empCount }, (_, i) => {
    const salary   = salaryBands[Math.floor(Math.random() * salaryBands.length)];
    const empEpf   = Math.round(salary * 0.11);
    const emplEpf  = Math.round(salary * 0.13);
    const socsoEmp = salary <= 4000 ? +(salary * 0.005).toFixed(2)  : 19.75;
    const socsoEr  = salary <= 4000 ? +(salary * 0.0175).toFixed(2) : 69.05;
    const eis      = salary <= 4000 ? +(salary * 0.002).toFixed(2)  : 7.90;
    const pcb      = salary > 5000  ? Math.floor(salary * 0.08)     : 0;
    const fc       = Math.min(0.999, Math.max(0.50, +(baseConf + (Math.random() * 0.06 - 0.03)).toFixed(3)));

    const n = (v) => ({ type: "number", valueNumber: v,       confidence: fc });
    const s = (v) => ({ type: "string", valueString: String(v), confidence: fc });

    return {
      type: "object",
      valueObject: {
        EmployeeNumber: s(`EMP${String(i + 1).padStart(3, "0")}`),
        BasicSalary:    n(salary),
        Pcb:            n(pcb),
        EmployeeEpf:    n(empEpf),
        EmployeeSocso:  n(socsoEmp),
        EmployeeEis:    n(eis),
        EmployerEpf:    n(emplEpf),
        EmployerSocso:  n(socsoEr),
        EmployerEis:    n(eis),
        TotalEpf:       n(empEpf + emplEpf),
        TotalSocso:     n(+(socsoEmp + socsoEr).toFixed(2)),
        TotalEis:       n(+(eis * 2).toFixed(2)),
      },
    };
  });

  const status = baseConf < 0.75 ? "needs_review" : "completed";

  return {
    id:              crypto.randomUUID(),
    filename,
    status,
    confidence:      baseConf,
    needsReview:     baseConf < 0.75,
    documentType:    "document",
    extractedFields: { EmployeeRecords: { type: "array", valueArray: employees } },
    rawText:         "",
    pages:           1,
    model:           "azure-content-understanding [DEMO]",
    analyzerVersion: "demo-2.0",
    uploadedAt:      new Date().toISOString(),
    humanReviewed:   false,
    fieldCorrected:  false,
    rejectReason:    null,
    tags:            ["processed", "document", baseConf < 0.75 ? "low-confidence" : "high-confidence", "demo"],
  };
}

// Compute real average confidence from Azure CU extractedFields
function computeAvgConfidence(extractedFields, fallback) {
  if (!extractedFields) return fallback;
  const confs = [];
  const collect = (obj) => {
    if (!obj || typeof obj !== "object") return;
    if (typeof obj.confidence === "number") confs.push(obj.confidence);
    Object.values(obj).forEach((v) => { if (typeof v === "object") collect(v); });
  };
  collect(extractedFields);
  if (!confs.length) return fallback;
  return confs.reduce((a, b) => a + b, 0) / confs.length;
}

export default function App() {
  const [documents, setDocuments]         = useState([]);
  const [activeTab, setActiveTab]         = useState("upload");
  const [reviewQueue, setReviewQueue]     = useState([]);
  const [processedDocs, setProcessedDocs] = useState([]);

  const pendingReview = reviewQueue.filter((d) => d.status === "pending_review");

  const handleFilesAdded = useCallback((files) => {
    const newDocs = files.map((file) => ({
      id:         crypto.randomUUID(),
      file,
      name:       file.name,
      size:       file.size,
      type:       file.type,
      status:     "queued",
      progress:   0,
      uploadedAt: new Date().toISOString(),
    }));
    setDocuments((prev) => [...prev, ...newDocs]);
    setActiveTab("queue");
    processDocuments(newDocs);
  }, []);

  const processDocuments = (docs) => {
    docs.forEach(async (doc) => {

      setDocuments((prev) =>
        prev.map((d) => d.id === doc.id ? { ...d, status: "analyzing", progress: 20 } : d)
      );

      const progressTimer = setInterval(() => {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id && d.progress < 85 ? { ...d, progress: d.progress + 3 } : d
          )
        );
      }, 1000);

      try {
        let result;

        if (DEMO_MODE) {
          // Simulate realistic Azure processing time (2.5–4.5s)
          await sleep(2500 + Math.random() * 2000);
          result = generateMockResult(doc.name);
        } else {
          // Real Azure Logic App call
          const res = await processDocument(doc.file);
          result = res.document;
        }

        clearInterval(progressTimer);

        const avgConf = DEMO_MODE
          ? result.confidence
          : computeAvgConfidence(result.extractedFields, result.confidence ?? 0);

        const normalisedResult = {
          documentType:    result.documentType    || "Document",
          confidence:      avgConf,
          extractedFields: result.extractedFields || {},
          tags:            result.tags            || [],
          processingTime:  result.processingTime  || "—",
          model:           result.model           || "azure-content-understanding",
          rawText:         result.rawText         || "",
          pages:           result.pages           || 0,
          status:          result.status,
          id:              result.id,
        };

        const realStatus = avgConf < 0.75 ? "needs_review" : "completed";

        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? { ...d, progress: 100, status: realStatus, confidence: avgConf, result: normalisedResult, backendId: result.id }
              : d
          )
        );

        if (realStatus === "needs_review") {
          setReviewQueue((prev) => [
            ...prev,
            {
              ...doc,
              file:          doc.file,
              status:        "pending_review",
              confidence:    avgConf,
              avgConfidence: avgConf,
              result:        { ...normalisedResult, status: "needs_review" },
              backendId:     result.id,
            },
          ]);
        } else {
          setProcessedDocs((prev) => [
            ...prev,
            {
              ...doc,
              confidence:    avgConf,
              avgConfidence: avgConf,
              result:        normalisedResult,
              backendId:     result.id,
              humanReviewed: false,
              reviewedAt:    new Date().toISOString(),
            },
          ]);
        }

      } catch (err) {
        clearInterval(progressTimer);
        console.error("[App] Processing failed for", doc.name, "-", err.message);
        setDocuments((prev) =>
          prev.map((d) => d.id === doc.id ? { ...d, status: "rejected", progress: 100 } : d)
        );
      }
    });
  };

  const handleReviewApprove = async (docId, correctedData) => {
    const doc = reviewQueue.find((d) => d.id === docId)
             || processedDocs.find((d) => d.id === docId);
    if (!doc) return;

    if (!DEMO_MODE && doc.backendId) {
      try {
        await approveDocument(doc.backendId, correctedData?.extractedFields, correctedData?.documentType);
      } catch (err) {
        console.error("[App] Approve failed:", err.message);
      }
    }

    const reviewed = {
      ...doc,
      status:        "completed",
      result:        correctedData || doc.result,
      humanReviewed: true,
      reviewedAt:    new Date().toISOString(),
    };

    setProcessedDocs((prev) => {
      const exists = prev.find((d) => d.id === docId);
      return exists ? prev.map((d) => d.id === docId ? reviewed : d) : [...prev, reviewed];
    });
    setReviewQueue((prev) => prev.map((d) => d.id === docId ? { ...d, status: "approved" } : d));
    setDocuments((prev)  => prev.map((d) => d.id === docId ? { ...d, status: "completed" } : d));
  };

  const handleReviewReject = async (docId, reason) => {
    const doc = reviewQueue.find((d) => d.id === docId)
             || processedDocs.find((d) => d.id === docId);

    if (!DEMO_MODE && doc?.backendId) {
      try {
        await rejectDocument(doc.backendId, reason);
      } catch (err) {
        console.error("[App] Reject failed:", err.message);
      }
    }

    setReviewQueue((prev) => prev.map((d) => d.id === docId ? { ...d, status: "rejected", rejectReason: reason } : d));
    setDocuments((prev)  => prev.map((d) => d.id === docId ? { ...d, status: "rejected" } : d));
  };

  return (
    <div className="app">
      <Header demoMode={DEMO_MODE} />

      <nav className="tab-nav">
        <button className={`tab-btn ${activeTab === "upload" ? "active" : ""}`} onClick={() => setActiveTab("upload")}>
          <span className="tab-icon">⬆</span> Upload
        </button>
        <button className={`tab-btn ${activeTab === "queue" ? "active" : ""}`} onClick={() => setActiveTab("queue")}>
          <span className="tab-icon">⏳</span> Processing
          {documents.filter((d) => ["queued","analyzing"].includes(d.status)).length > 0 && (
            <span className="badge pulse">{documents.filter((d) => ["queued","analyzing"].includes(d.status)).length}</span>
          )}
        </button>
        <button className={`tab-btn ${activeTab === "review" ? "active" : ""}`} onClick={() => setActiveTab("review")}>
          <span className="tab-icon">👁</span> Human Review
          {pendingReview.length > 0 && <span className="badge warn pulse">{pendingReview.length}</span>}
        </button>
        <button className={`tab-btn ${activeTab === "results" ? "active" : ""}`} onClick={() => setActiveTab("results")}>
          <span className="tab-icon">✓</span> Results
          {processedDocs.length > 0 && <span className="badge success">{processedDocs.length}</span>}
        </button>
        <button className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`} onClick={() => setActiveTab("dashboard")}>
          <span className="tab-icon">📊</span> Dashboard
        </button>
      </nav>

      {/* Demo mode banner */}
      {DEMO_MODE && (
        <div style={{
          background: "linear-gradient(90deg, #f59e0b, #d97706)",
          color: "#fff",
          textAlign: "center",
          padding: "5px 16px",
          fontSize: 11,
          fontFamily: "var(--mono)",
          fontWeight: 600,
          letterSpacing: "0.04em",
        }}>
          Set{" "}
          <code style={{ background: "rgba(0,0,0,0.25)", padding: "1px 5px", borderRadius: 3 }}></code>
          {" "}in App.jsx to go live
        </div>
      )}

      <main className="main-content">
        {activeTab === "upload"    && <UploadZone onFilesAdded={handleFilesAdded} />}
        {activeTab === "queue"     && <DocumentQueue documents={documents} />}
        {activeTab === "review"    && <HumanReview queue={reviewQueue} onApprove={handleReviewApprove} onReject={handleReviewReject} />}
        {activeTab === "results"   && <ResultsPanel documents={processedDocs} onApprove={handleReviewApprove} onReject={handleReviewReject} />}
        {activeTab === "dashboard" && <Dashboard processedDocs={processedDocs} reviewQueue={reviewQueue} documents={documents} />}
      </main>
    </div>
  );
}
