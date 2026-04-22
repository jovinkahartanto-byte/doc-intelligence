/**
 * api.js — Frontend API service
 * Calls Logic Apps HTTP trigger endpoints instead of Azure Functions
 */

const PROCESS_URL = import.meta.env.VITE_LOGICAPP_PROCESS_URL;
const REVIEW_URL  = import.meta.env.VITE_LOGICAPP_REVIEW_URL;

/**
 * Upload and process a document via the Logic App trigger.
 * Converts the file to base64 and posts to the workflow.
 */
export async function processDocument(file) {
  const base64 = await fileToBase64(file);

  const response = await fetch(PROCESS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName:    file.name,
      fileContent: base64,
      contentType: file.type,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  return response.json(); // { success, document }
}

/**
 * Submit a URL instead of uploading binary content.
 * Useful for files already stored in Blob Storage.
 */
export async function processDocumentUrl(fileName, fileUrl) {
  const response = await fetch(PROCESS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, fileUrl }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * Approve a document (with optional field corrections).
 */
export async function approveDocument(documentId, correctedFields, correctedDocumentType) {
  const response = await fetch(REVIEW_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      documentId,
      action: "approve",
      correctedFields,
      correctedDocumentType,
    }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * Reject a document with a reason.
 */
export async function rejectDocument(documentId, reason) {
  const response = await fetch(REVIEW_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      documentId,
      action: "reject",
      reason,
    }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]); // strip data:...;base64,
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
