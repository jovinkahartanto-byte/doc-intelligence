/**
 * api.js — Frontend API service
 * Polls /api/review (Blob Storage via Logic App) for results
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
    throw new Error(`Network error calling /api/process: ${networkErr.message}`);
  }

  const text = await response.text();
  console.log("[api] /api/process response:", response.status, text.substring(0, 300));

  if (!response.ok) {
    throw new Error(`/api/process returned HTTP ${response.status}: ${text}`);
  }

  let data;
  try { data = JSON.parse(text); } catch {
    throw new Error(`/api/process returned invalid JSON: ${text}`);
  }

  const documentId = data.documentId;
  if (!documentId) throw new Error(`No documentId in process response: ${text}`);

  console.log("[api] got documentId:", documentId, "— polling for result...");
  return await pollForResult(documentId);
}

// ── Poll review Logic App until blob is ready ─────────────────────────────────
async function pollForResult(documentId, maxAttempts = 40, intervalMs = 4000) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    console.log(`[api] poll ${i + 1}/${maxAttempts} — documentId: ${documentId}`);

    let response, text;
    try {
      response = await fetch(REVIEW_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, action: "get" }),
      });
      text = await response.text();
      console.log(`[api] poll ${i + 1} — HTTP ${response.status} — ${text.substring(0, 200)}`);
    } catch (networkErr) {
      console.warn(`[api] poll ${i + 1} — network error: ${networkErr.message}`);
      continue;
    }

    // 404 = blob not written yet, analysis still running — keep polling
    if (response.status === 404) {
      console.log(`[api] poll ${i + 1} — blob not ready yet, waiting...`);
      continue;
    }

    if (!response.ok) {
      console.warn(`[api] poll ${i + 1} — HTTP ${response.status}, retrying...`);
      continue;
    }

    let data;
    try { data = JSON.parse(text); } catch {
      console.warn("[api] poll — invalid JSON, retrying...");
      continue;
    }

    const doc = data.document || data;

    // Still processing — keep polling
    if (!doc || !doc.status || doc.status === "processing") {
      console.log(`[api] poll ${i + 1} — status: ${doc?.status || "unknown"}, still waiting...`);
      continue;
    }

    console.log(`[api] ✓ document ready — status: ${doc.status}, confidence: ${doc.confidence}`);
    return { document: doc };
  }

  throw new Error(
    `Timed out after ${maxAttempts} polls. Check Azure Portal → idp-logicapps → Runs history.`
  );
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
  console.log("[api] approve:", response.status, text.substring(0, 200));
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
  console.log("[api] reject:", response.status, text.substring(0, 200));
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