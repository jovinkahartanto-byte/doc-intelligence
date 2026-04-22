/**
 * api.js — Frontend API service
 * Calls Logic Apps via Netlify proxy redirects defined in netlify.toml
 * Proxy paths: /api/process  →  process-document Logic App trigger
 *              /api/review   →  review-document  Logic App trigger
 */

const PROCESS_URL = "/api/process";
const REVIEW_URL  = "/api/review";

// ── Process Document ──────────────────────────────────────────────────────────
export async function processDocument(file) {
  console.log("[api] processDocument →", file.name, `(${(file.size/1024).toFixed(1)} KB)`);

  let base64;
  try {
    base64 = await fileToBase64(file);
  } catch (e) {
    throw new Error(`Failed to read file: ${e.message}`);
  }

  let response;
  try {
    response = await fetch(PROCESS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName:    file.name,
        fileContent: base64,
        contentType: file.type || "application/octet-stream",
      }),
    });
  } catch (networkErr) {
    console.error("[api] Network error — is the Netlify proxy configured?", networkErr);
    throw new Error(`Network error: ${networkErr.message}`);
  }

  console.log("[api] response status:", response.status);

  // Read body as text first so we can log it regardless of content-type
  const text = await response.text();
  console.log("[api] response body:", text);

  if (!response.ok) {
    throw new Error(`Logic App returned HTTP ${response.status}: ${text}`);
  }

  // Parse JSON — Logic App may return empty body on some errors
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from Logic App: ${text}`);
  }

  // Logic App returned success:false in the body
  if (data.success === false) {
    throw new Error(`Logic App error: ${data.error || JSON.stringify(data)}`);
  }

  // Handle both { document: {...} } and flat { id, status, ... } shapes
  if (data.document) return data;
  return { document: data };
}

// ── Approve Document ──────────────────────────────────────────────────────────
export async function approveDocument(documentId, correctedFields, correctedDocumentType) {
  console.log("[api] approveDocument →", documentId);

  const response = await fetch(REVIEW_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      documentId,
      action: "approve",
      ...(correctedFields       && { correctedFields }),
      ...(correctedDocumentType && { correctedDocumentType }),
    }),
  });

  const text = await response.text();
  console.log("[api] approve response:", response.status, text);

  if (!response.ok) {
    throw new Error(`Approve failed HTTP ${response.status}: ${text}`);
  }

  try { return JSON.parse(text); } catch { return {}; }
}

// ── Reject Document ───────────────────────────────────────────────────────────
export async function rejectDocument(documentId, reason) {
  console.log("[api] rejectDocument →", documentId, reason);

  const response = await fetch(REVIEW_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      documentId,
      action: "reject",
      reason: reason || "Rejected by reviewer",
    }),
  });

  const text = await response.text();
  console.log("[api] reject response:", response.status, text);

  if (!response.ok) {
    throw new Error(`Reject failed HTTP ${response.status}: ${text}`);
  }

  try { return JSON.parse(text); } catch { return {}; }
}

// ── Helper ────────────────────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}