/**
 * api.js — Frontend API service
 * After getting 202 from process, polls the review Logic App with action:"get"
 * to fetch the completed document from Cosmos DB.
 */

const PROCESS_URL = "/api/process";
const REVIEW_URL  = "/api/review";

// ── Process Document ──────────────────────────────────────────────────────────
export async function processDocument(file) {
  console.log("[api] processDocument →", file.name, `(${(file.size/1024).toFixed(1)} KB)`);

  const base64 = await fileToBase64(file);

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
    throw new Error(`Network error: ${networkErr.message}`);
  }

  const text = await response.text();
  console.log("[api] process response:", response.status, text);

  if (!response.ok) {
    throw new Error(`Logic App returned HTTP ${response.status}: ${text}`);
  }

  let data;
  try { data = JSON.parse(text); } catch {
    throw new Error(`Invalid JSON from Logic App: ${text}`);
  }

  // 202 — Logic App accepted, poll for result
  const documentId = data.documentId;
  if (!documentId) throw new Error("No documentId in response");

  console.log("[api] polling for result, documentId:", documentId);
  return await pollForResult(documentId);
}

// ── Poll review Logic App until document is complete ─────────────────────────
async function pollForResult(documentId, maxAttempts = 40, intervalMs = 5000) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    console.log(`[api] poll attempt ${i + 1}/${maxAttempts} for ${documentId}`);

    try {
      const response = await fetch(REVIEW_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          action: "get",
        }),
      });

      const text = await response.text();
      console.log("[api] poll response:", response.status, text.substring(0, 200));

      if (!response.ok) {
        console.warn("[api] poll not ready, retrying...");
        continue;
      }

      const data = JSON.parse(text);
      const doc  = data.document || data;

      // Still processing — keep polling
      if (!doc || !doc.status || doc.status === "processing") {
        console.log("[api] document still processing, waiting...");
        continue;
      }

      console.log("[api] ✓ document ready — status:", doc.status, "confidence:", doc.confidence);
      return { document: doc };

    } catch (err) {
      console.warn("[api] poll error, retrying:", err.message);
    }
  }

  throw new Error("Timed out waiting for document. Check Logic App Runs history in Azure Portal.");
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
  console.log("[api] approve:", response.status, text);
  if (!response.ok) throw new Error(`Approve failed ${response.status}: ${text}`);
  try { return JSON.parse(text); } catch { return {}; }
}

// ── Reject Document ───────────────────────────────────────────────────────────
export async function rejectDocument(documentId, reason) {
  console.log("[api] rejectDocument →", documentId);
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
  console.log("[api] reject:", response.status, text);
  if (!response.ok) throw new Error(`Reject failed ${response.status}: ${text}`);
  try { return JSON.parse(text); } catch { return {}; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
