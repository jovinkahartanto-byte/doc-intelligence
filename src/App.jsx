import { useState, useCallback, useRef } from "react";
import UploadZone from "./components/UploadZone";
import DocumentQueue from "./components/DocumentQueue";
import HumanReview from "./components/HumanReview";
import ResultsPanel from "./components/ResultsPanel";
import Header from "./components/Header";
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
    simulateProcessing(newDocs);
  }, []);

  const simulateProcessing = (docs) => {
    docs.forEach((doc) => {
      // Simulate upload progress
      let progress = 0;
      const uploadInterval = setInterval(() => {
        progress += Math.random() * 20 + 5;
        if (progress >= 100) {
          progress = 100;
          clearInterval(uploadInterval);
          setDocuments((prev) =>
            prev.map((d) =>
              d.id === doc.id ? { ...d, progress: 100, status: "analyzing" } : d
            )
          );
          // Simulate Azure analysis
          setTimeout(() => {
            const confidence = Math.random();
            const result = generateMockResult(doc, confidence);

            setDocuments((prev) =>
              prev.map((d) =>
                d.id === doc.id
                  ? {
                      ...d,
                      status: confidence < 0.75 ? "needs_review" : "completed",
                      confidence,
                      result,
                    }
                  : d
              )
            );

            if (confidence < 0.75) {
              setReviewQueue((prev) => [
                ...prev,
                {
                  ...doc,
                  status: "pending_review",
                  confidence,
                  result,
                },
              ]);
            } else {
              setProcessedDocs((prev) => [
                ...prev,
                { ...doc, confidence, result, reviewedAt: new Date().toISOString() },
              ]);
            }
          }, 2000 + Math.random() * 2000);
        }
        setDocuments((prev) =>
          prev.map((d) => (d.id === doc.id ? { ...d, progress } : d))
        );
      }, 200);
    });
  };

  const handleReviewApprove = (docId, correctedData) => {
    const doc = reviewQueue.find((d) => d.id === docId);
    if (doc) {
      const reviewed = {
        ...doc,
        status: "completed",
        result: correctedData || doc.result,
        humanReviewed: true,
        reviewedAt: new Date().toISOString(),
      };
      setProcessedDocs((prev) => [...prev, reviewed]);
      setReviewQueue((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, status: "approved" } : d))
      );
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, status: "completed" } : d))
      );
    }
  };

  const handleReviewReject = (docId, reason) => {
    setReviewQueue((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, status: "rejected", rejectReason: reason } : d))
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

function generateMockResult(doc, confidence) {
  const docTypes = ["Invoice", "Contract", "Receipt", "ID Document", "Medical Record", "Legal Filing"];
  const docType = docTypes[Math.floor(Math.random() * docTypes.length)];
  return {
    documentType: docType,
    confidence: confidence,
    extractedFields: {
      documentId: `DOC-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      amount: docType === "Invoice" || docType === "Receipt" ? `$${(Math.random() * 10000).toFixed(2)}` : null,
      vendor: docType === "Invoice" ? ["Acme Corp", "TechSupply Ltd", "Global Services"][Math.floor(Math.random() * 3)] : null,
      language: "English",
      pages: Math.ceil(Math.random() * 5),
    },
    tags: ["processed", docType.toLowerCase().replace(" ", "_"), confidence > 0.75 ? "high-confidence" : "low-confidence"],
    rawText: `[Extracted text from ${doc.name} — ${Math.floor(Math.random() * 500 + 100)} words]`,
    processingTime: `${(Math.random() * 3 + 0.5).toFixed(2)}s`,
    model: "azure-content-understanding-v1",
  };
}
