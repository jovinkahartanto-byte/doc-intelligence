import { useState, useCallback } from "react";
import UploadZone from "./components/UploadZone";
import DocumentQueue from "./components/DocumentQueue";
import HumanReview from "./components/HumanReview";
import ResultsPanel from "./components/ResultsPanel";
import Header from "./components/Header";
import { processDocument, approveDocument, rejectDocument } from "./services/api";
import "./styles/global.css";

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [activeTab, setActiveTab] = useState("upload");
  const [reviewQueue, setReviewQueue] = useState([]);
  const [processedDocs, setProcessedDocs] = useState([]);

  const pendingReview = reviewQueue.filter((d) => d.status === "pending_review");

  const handleFilesAdded = useCallback((files) => {
    const newDocs = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: "queued",
      progress: 0,
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
        prev.map((d) =>
          d.id === doc.id ? { ...d, status: "analyzing", progress: 30 } : d
        )
      );

      try {
        // Tick progress to 60 while waiting for Logic App
        const progressTimer = setInterval(() => {
          setDocuments((prev) =>
            prev.map((d) =>
              d.id === doc.id && d.progress < 90
                ? { ...d, progress: d.progress + 5 }
                : d
            )
          );
        }, 800);

        // Call real Logic App backend via Netlify proxy
        const res = await processDocument(doc.file);

        clearInterval(progressTimer);

        const result = res.document;

        // Normalise the result shape to match what the UI components expect
        const normalisedResult = {
          documentType:    result.documentType   || "Document",
          confidence:      result.confidence     || 0,
          extractedFields: result.extractedFields || {},
          tags:            result.tags            || [],
          processingTime:  result.processingTime  || "—",
          model:           result.model           || "azure-content-understanding",
          rawText:         result.rawText         || "",
        };

        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? {
                  ...d,
                  progress:  100,
                  status:    result.status,
                  confidence: result.confidence,
                  result:    normalisedResult,
                  backendId: result.id,
                }
              : d
          )
        );

        if (result.status === "needs_review") {
          setReviewQueue((prev) => [
            ...prev,
            {
              ...doc,
              status:     "pending_review",
              confidence: result.confidence,
              result:     normalisedResult,
              backendId:  result.id,
            },
          ]);
        } else {
          setProcessedDocs((prev) => [
            ...prev,
            {
              ...doc,
              confidence:   result.confidence,
              result:       normalisedResult,
              backendId:    result.id,
              humanReviewed: false,
              reviewedAt:   new Date().toISOString(),
            },
          ]);
        }

      } catch (err) {
        console.error("Processing failed for", doc.name, err);
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === doc.id
              ? { ...d, status: "rejected", progress: 100 }
              : d
          )
        );
      }
    });
  };

  const handleReviewApprove = async (docId, correctedData) => {
    const doc = reviewQueue.find((d) => d.id === docId);
    if (!doc) return;

    // Call backend first if we have a backendId
    if (doc.backendId) {
      try {
        await approveDocument(
          doc.backendId,
          correctedData?.extractedFields,
          correctedData?.documentType
        );
      } catch (err) {
        console.error("Approve API call failed:", err);
        // Continue with UI update even if API fails
      }
    }

    const reviewed = {
      ...doc,
      status:        "completed",
      result:        correctedData || doc.result,
      humanReviewed: true,
      reviewedAt:    new Date().toISOString(),
    };

    setProcessedDocs((prev) => [...prev, reviewed]);
    setReviewQueue((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, status: "approved" } : d))
    );
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, status: "completed" } : d))
    );
  };

  const handleReviewReject = async (docId, reason) => {
    const doc = reviewQueue.find((d) => d.id === docId);

    // Call backend if we have a backendId
    if (doc?.backendId) {
      try {
        await rejectDocument(doc.backendId, reason);
      } catch (err) {
        console.error("Reject API call failed:", err);
      }
    }

    setReviewQueue((prev) =>
      prev.map((d) =>
        d.id === docId ? { ...d, status: "rejected", rejectReason: reason } : d
      )
    );
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, status: "rejected" } : d))
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
          {documents.filter((d) => ["queued", "analyzing"].includes(d.status)).length > 0 && (
            <span className="badge pulse">
              {documents.filter((d) => ["queued", "analyzing"].includes(d.status)).length}
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
      </nav>

      <main className="main-content">
        {activeTab === "upload" && <UploadZone onFilesAdded={handleFilesAdded} />}
        {activeTab === "queue" && <DocumentQueue documents={documents} />}
        {activeTab === "review" && (
          <HumanReview
            queue={reviewQueue}
            onApprove={handleReviewApprove}
            onReject={handleReviewReject}
          />
        )}
        {activeTab === "results" && <ResultsPanel documents={processedDocs} />}
      </main>
    </div>
  );
}
