import { useState, useCallback } from "react";
import UploadZone from "./components/UploadZone";
import DocumentQueue from "./components/DocumentQueue";
import HumanReview from "./components/HumanReview";
import ResultsPanel from "./components/ResultsPanel";
import Header from "./components/Header";
import { processDocument, approveDocument, rejectDocument } from "./services/api";
import Dashboard from "./dashboard/OperationalDashboard";
import "./styles/global.css";

// Compute real average confidence from Azure CU extractedFields
function computeAvgConfidence(extractedFields, fallback) {
  if (!extractedFields) return fallback;
  const confs = [];
  const collect = (obj) => {
    if (!obj || typeof obj !== "object") return;
    if (typeof obj.confidence === "number") confs.push(obj.confidence);
    Object.values(obj).forEach(v => { if (typeof v === "object") collect(v); });
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

      // Show analyzing state immediately
      setDocuments((prev) =>
        prev.map((d) => d.id === doc.id ? { ...d, status: "analyzing", progress: 20 } : d)
      );

      // Animate progress bar while waiting for Logic App
      const progressTimer = setInterval(() => {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id && d.progress < 85
              ? { ...d, progress: d.progress + 3 }
              : d
          )
        );
      }, 1000);

      try {
        // Call real Logic App — waits for Cosmos DB to have completed result
        const res    = await processDocument(doc.file);
        const result = res.document;

        clearInterval(progressTimer);

        // Normalise to what UI components expect
        const avgConf = computeAvgConfidence(result.extractedFields, result.confidence ?? 0);
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

        // Use avgConf to determine real routing — ignore blob's hardcoded status
        const realStatus = avgConf < 0.75 ? "needs_review" : "completed";

        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? {
                  ...d,
                  progress:   100,
                  status:     realStatus,
                  confidence: avgConf,
                  result:     normalisedResult,
                  backendId:  result.id,
                }
              : d
          )
        );

        if (realStatus === "needs_review") {
          // Goes to Human Review tab with REAL extracted fields
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
          // Goes to Results tab
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
          prev.map((d) =>
            d.id === doc.id ? { ...d, status: "rejected", progress: 100 } : d
          )
        );
      }
    });
  };

  const handleReviewApprove = async (docId, correctedData) => {
    const doc = reviewQueue.find((d) => d.id === docId)
             || processedDocs.find((d) => d.id === docId);
    if (!doc) return;

    if (doc.backendId) {
      try {
        await approveDocument(
          doc.backendId,
          correctedData?.extractedFields,
          correctedData?.documentType
        );
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
      return exists
        ? prev.map((d) => d.id === docId ? reviewed : d)
        : [...prev, reviewed];
    });
    setReviewQueue((prev) =>
      prev.map((d) => d.id === docId ? { ...d, status: "approved" } : d)
    );
    setDocuments((prev) =>
      prev.map((d) => d.id === docId ? { ...d, status: "completed" } : d)
    );
  };

  const handleReviewReject = async (docId, reason) => {
    const doc = reviewQueue.find((d) => d.id === docId)
             || processedDocs.find((d) => d.id === docId);

    if (doc?.backendId) {
      try {
        await rejectDocument(doc.backendId, reason);
      } catch (err) {
        console.error("[App] Reject failed:", err.message);
      }
    }

    setReviewQueue((prev) =>
      prev.map((d) =>
        d.id === docId ? { ...d, status: "rejected", rejectReason: reason } : d
      )
    );
    setDocuments((prev) =>
      prev.map((d) => d.id === docId ? { ...d, status: "rejected" } : d)
    );
  };

  return (
    <div className="app">
      <Header />
      <nav className="tab-nav">
        <button
          className={`tab-btn ${activeTab === "upload" ? "active" : ""}`}
          onClick={() => setActiveTab("upload")}
        >
          <span className="tab-icon">⬆</span> Upload
        </button>
        <button
          className={`tab-btn ${activeTab === "queue" ? "active" : ""}`}
          onClick={() => setActiveTab("queue")}
        >
          <span className="tab-icon">⏳</span> Processing
          {documents.filter((d) => ["queued","analyzing"].includes(d.status)).length > 0 && (
            <span className="badge pulse">
              {documents.filter((d) => ["queued","analyzing"].includes(d.status)).length}
            </span>
          )}
        </button>
        <button
          className={`tab-btn ${activeTab === "review" ? "active" : ""}`}
          onClick={() => setActiveTab("review")}
        >
          <span className="tab-icon">👁</span> Human Review
          {pendingReview.length > 0 && (
            <span className="badge warn pulse">{pendingReview.length}</span>
          )}
        </button>
        <button
          className={`tab-btn ${activeTab === "results" ? "active" : ""}`}
          onClick={() => setActiveTab("results")}
        >
          <span className="tab-icon">✓</span> Results
          {processedDocs.length > 0 && (
            <span className="badge success">{processedDocs.length}</span>
          )}
        </button>
        <button
          className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          <span className="tab-icon">📊</span> Dashboard
        </button>
      </nav>

      <main className="main-content">
        {activeTab === "upload"  && <UploadZone onFilesAdded={handleFilesAdded} />}
        {activeTab === "queue"   && <DocumentQueue documents={documents} />}
        {activeTab === "review"  && (
          <HumanReview
            queue={reviewQueue}
            onApprove={handleReviewApprove}
            onReject={handleReviewReject}
          />
        )}
        {activeTab === "results" && (
          <ResultsPanel
            documents={processedDocs}
            onApprove={handleReviewApprove}
            onReject={handleReviewReject}
          />
        )}
        {activeTab === "dashboard" && (
          <Dashboard
            processedDocs={processedDocs}
            reviewQueue={reviewQueue}
            documents={documents}
          />
        )}
      </main>
    </div>
  );
}