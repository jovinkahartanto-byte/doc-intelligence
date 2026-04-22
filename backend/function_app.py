"""
Azure Function: Document Intelligence Processing
Backend powered by Azure AI Foundry Content Understanding

Endpoint: POST /api/process-document
"""

import azure.functions as func
import json
import logging
import os
import uuid
from datetime import datetime, timezone
import httpx
from azure.storage.blob import BlobServiceClient
from azure.cosmos import CosmosClient

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

# ── Configuration ─────────────────────────────────────────────────────────────
AZURE_AI_ENDPOINT      = os.environ["AZURE_AI_CONTENT_UNDERSTANDING_ENDPOINT"]
AZURE_AI_KEY           = os.environ["AZURE_AI_KEY"]
COSMOS_CONN_STR        = os.environ["COSMOS_DB_CONNECTION_STRING"]
COSMOS_DB_NAME         = os.environ.get("COSMOS_DB_NAME", "docintel")
COSMOS_CONTAINER       = os.environ.get("COSMOS_CONTAINER", "documents")
BLOB_CONN_STR          = os.environ["AZURE_BLOB_CONNECTION_STRING"]
BLOB_CONTAINER_RAW     = os.environ.get("BLOB_CONTAINER_RAW", "raw-uploads")
BLOB_CONTAINER_RESULTS = os.environ.get("BLOB_CONTAINER_RESULTS", "processed-results")
CONFIDENCE_THRESHOLD   = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.75"))


# ── Process Document ─────────────────────────────────────────────────────────
@app.route(route="process-document", methods=["POST"])
async def process_document(req: func.HttpRequest) -> func.HttpResponse:
    """
    Accepts multipart/form-data with file field.
    Returns JSON with extraction result and confidence flag.
    """
    logging.info("process-document triggered")

    try:
        file_data = req.files.get("file")
        if not file_data:
            return _err("No file provided", 400)

        filename    = file_data.filename
        content     = file_data.read()
        content_type = file_data.content_type
        doc_id      = str(uuid.uuid4())

        # 1. Store raw upload in Blob Storage
        blob_url = _upload_to_blob(doc_id, filename, content, content_type)

        # 2. Call Azure AI Content Understanding
        result = await _call_content_understanding(content, content_type, filename)

        # 3. Determine if human review is needed
        confidence   = result.get("confidence", 0.0)
        needs_review = confidence < CONFIDENCE_THRESHOLD
        status       = "needs_review" if needs_review else "completed"

        # 4. Persist to Cosmos DB
        record = {
            "id":           doc_id,
            "filename":     filename,
            "blobUrl":      blob_url,
            "status":       status,
            "confidence":   confidence,
            "needsReview":  needs_review,
            "documentType": result.get("documentType"),
            "extractedFields": result.get("fields", {}),
            "rawText":      result.get("content", ""),
            "tags":         result.get("tags", []),
            "model":        result.get("model", "azure-content-understanding"),
            "processingTime": result.get("processingTime"),
            "uploadedAt":   datetime.now(timezone.utc).isoformat(),
            "reviewedAt":   None,
            "humanReviewed": False,
        }
        _save_to_cosmos(record)

        return func.HttpResponse(
            json.dumps({"success": True, "document": record}),
            mimetype="application/json",
            status_code=200,
        )

    except Exception as exc:
        logging.exception("Error processing document")
        return _err(str(exc), 500)


# ── Human Review Approval ────────────────────────────────────────────────────
@app.route(route="review/{doc_id}", methods=["PATCH"])
async def review_document(req: func.HttpRequest) -> func.HttpResponse:
    """
    PATCH /api/review/{doc_id}
    Body: { "action": "approve"|"reject", "correctedFields": {...}, "reason": "..." }
    """
    doc_id = req.route_params.get("doc_id")
    try:
        body   = req.get_json()
        action = body.get("action")  # "approve" | "reject"

        cosmos = CosmosClient.from_connection_string(COSMOS_CONN_STR)
        container = cosmos.get_database_client(COSMOS_DB_NAME).get_container_client(COSMOS_CONTAINER)
        doc = container.read_item(item=doc_id, partition_key=doc_id)

        if action == "approve":
            doc["status"]          = "completed"
            doc["humanReviewed"]   = True
            doc["reviewedAt"]      = datetime.now(timezone.utc).isoformat()
            if body.get("correctedFields"):
                doc["extractedFields"] = body["correctedFields"]
            if body.get("correctedDocumentType"):
                doc["documentType"]   = body["correctedDocumentType"]
        elif action == "reject":
            doc["status"]       = "rejected"
            doc["humanReviewed"] = True
            doc["reviewedAt"]   = datetime.now(timezone.utc).isoformat()
            doc["rejectReason"] = body.get("reason", "Rejected by reviewer")
        else:
            return _err("Invalid action", 400)

        container.replace_item(item=doc_id, body=doc)

        # Export result to Blob for Power BI refresh
        _export_result_for_powerbi(doc)

        return func.HttpResponse(
            json.dumps({"success": True, "document": doc}),
            mimetype="application/json",
        )
    except Exception as exc:
        logging.exception("Error updating review")
        return _err(str(exc), 500)


# ── List Results ─────────────────────────────────────────────────────────────
@app.route(route="results", methods=["GET"])
async def list_results(req: func.HttpRequest) -> func.HttpResponse:
    """GET /api/results?status=completed&limit=100"""
    status = req.params.get("status", "completed")
    limit  = int(req.params.get("limit", 100))
    try:
        cosmos     = CosmosClient.from_connection_string(COSMOS_CONN_STR)
        container  = cosmos.get_database_client(COSMOS_DB_NAME).get_container_client(COSMOS_CONTAINER)
        query      = f"SELECT * FROM c WHERE c.status = '{status}' ORDER BY c.uploadedAt DESC OFFSET 0 LIMIT {limit}"
        items      = list(container.query_items(query=query, enable_cross_partition_query=True))
        return func.HttpResponse(json.dumps(items), mimetype="application/json")
    except Exception as exc:
        logging.exception("Error listing results")
        return _err(str(exc), 500)


# ── Helpers ───────────────────────────────────────────────────────────────────
async def _call_content_understanding(content: bytes, content_type: str, filename: str) -> dict:
    """
    Calls Azure AI Foundry Content Understanding REST API.
    POST {endpoint}/contentunderstanding/analyzers/{analyzer}:analyze?api-version=2024-12-01-preview
    """
    analyzer   = _select_analyzer(content_type)
    api_url    = (
        f"{AZURE_AI_ENDPOINT}/contentunderstanding/analyzers"
        f"/{analyzer}:analyze?api-version=2024-12-01-preview"
    )
    headers = {
        "Ocp-Apim-Subscription-Key": AZURE_AI_KEY,
        "Content-Type": content_type,
    }

    import time
    start = time.time()

    async with httpx.AsyncClient(timeout=120) as client:
        # Submit analysis job
        resp = await client.post(api_url, content=content, headers=headers)
        resp.raise_for_status()
        result_location = resp.headers.get("Operation-Location")

        if result_location:
            # Poll for async result
            for _ in range(30):
                await _async_sleep(2)
                poll = await client.get(
                    result_location,
                    headers={"Ocp-Apim-Subscription-Key": AZURE_AI_KEY}
                )
                poll_json = poll.json()
                if poll_json.get("status") in ("succeeded", "failed"):
                    resp_json = poll_json
                    break
            else:
                raise TimeoutError("Azure analysis polling timed out")
        else:
            resp_json = resp.json()

    elapsed = f"{(time.time() - start):.2f}s"
    return _normalize_response(resp_json, elapsed)


def _normalize_response(raw: dict, processing_time: str) -> dict:
    """Normalise Azure Content Understanding response to our internal schema."""
    result = raw.get("result", raw)
    contents = result.get("contents", [{}])
    first = contents[0] if contents else {}

    # Extract confidence — Azure returns per-field confidence
    fields_raw = first.get("fields", {})
    confidences = [
        v.get("confidence", 1.0)
        for v in fields_raw.values()
        if isinstance(v, dict) and "confidence" in v
    ]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.8

    # Flatten field values
    fields = {
        k: (v.get("valueString") or v.get("value") or str(v.get("content", "")))
        for k, v in fields_raw.items()
        if isinstance(v, dict)
    }

    return {
        "documentType": first.get("kind", result.get("modelId", "Document")),
        "confidence":   avg_confidence,
        "fields":       fields,
        "content":      first.get("content", ""),
        "pages":        len(first.get("pages", [])),
        "model":        result.get("modelId", "prebuilt-document"),
        "processingTime": processing_time,
        "tags":         _derive_tags(avg_confidence, first.get("kind", "")),
    }


def _derive_tags(confidence: float, doc_kind: str) -> list[str]:
    tags = ["processed"]
    if doc_kind:
        tags.append(doc_kind.lower().replace(" ", "_"))
    tags.append("high-confidence" if confidence >= 0.75 else "low-confidence")
    return tags


def _select_analyzer(content_type: str) -> str:
    """Choose the right Azure Content Understanding analyzer."""
    if "pdf" in content_type:
        return "prebuilt-documentAnalysis"
    if "image" in content_type:
        return "prebuilt-documentAnalysis"
    return "prebuilt-documentAnalysis"


def _upload_to_blob(doc_id: str, filename: str, content: bytes, content_type: str) -> str:
    client = BlobServiceClient.from_connection_string(BLOB_CONN_STR)
    blob_name = f"{doc_id}/{filename}"
    blob = client.get_blob_client(container=BLOB_CONTAINER_RAW, blob=blob_name)
    blob.upload_blob(content, overwrite=True, content_settings={"content_type": content_type})
    return blob.url


def _save_to_cosmos(record: dict):
    cosmos = CosmosClient.from_connection_string(COSMOS_CONN_STR)
    container = (
        cosmos
        .get_database_client(COSMOS_DB_NAME)
        .get_container_client(COSMOS_CONTAINER)
    )
    container.upsert_item(record)


def _export_result_for_powerbi(doc: dict):
    """
    Appends/updates the processed results blob that Power BI reads via DirectQuery
    or scheduled refresh. The blob is newline-delimited JSON (NDJSON).
    """
    try:
        client = BlobServiceClient.from_connection_string(BLOB_CONN_STR)
        blob = client.get_blob_client(
            container=BLOB_CONTAINER_RESULTS,
            blob=f"results/{doc['id']}.json"
        )
        blob.upload_blob(
            json.dumps(doc, default=str),
            overwrite=True,
            content_settings={"content_type": "application/json"}
        )
    except Exception:
        logging.warning("Could not export to Power BI blob — non-fatal")


async def _async_sleep(seconds: float):
    import asyncio
    await asyncio.sleep(seconds)


def _err(msg: str, code: int = 400) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps({"success": False, "error": msg}),
        mimetype="application/json",
        status_code=code,
    )
