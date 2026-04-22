# Logic Apps Backend — Setup Guide

## Overview

Two Logic App workflows replace the Azure Functions backend:

| Workflow | File | Trigger | Purpose |
|---|---|---|---|
| `process-document` | `process-document-workflow.json` | HTTP POST | Upload file → Azure Content Understanding → Cosmos DB |
| `review-document`  | `review-document-workflow.json`  | HTTP POST | Approve or reject a flagged document |

---

## Step 1 — Create Azure Resources

You need these resources before deploying the Logic Apps:

```bash
# Resource Group
az group create --name docintel-rg --location eastus

# Storage Account + containers
az storage account create --name docintelstorage --resource-group docintel-rg --sku Standard_LRS
az storage container create --name raw-uploads      --account-name docintelstorage
az storage container create --name processed-results --account-name docintelstorage

# Cosmos DB
az cosmosdb create --name docintel-cosmos --resource-group docintel-rg
az cosmosdb sql database  create --account-name docintel-cosmos --name docintel
az cosmosdb sql container create --account-name docintel-cosmos \
  --database-name docintel --name documents --partition-key-path /id
```

Your Azure AI Foundry resource is already created:
- Endpoint: `https://jovinkahar-9449-resource.cognitiveservices.azure.com`
- Analyzer:  `redacted-idp-epf`

---

## Step 2 — Create the Logic Apps

### In Azure Portal:

1. Search **Logic Apps** → **+ Create**
2. Choose **Consumption** plan (pay-per-execution, cheapest)
3. Name: `docintel-process-document`, Region: same as your other resources
4. Click **Review + Create → Create**
5. Repeat for `docintel-review-document`

---

## Step 3 — Import the Workflow JSON

For each Logic App:

1. Open the Logic App in Azure Portal
2. Go to **Logic app designer** (left menu)
3. Click **Code view** (top right toggle)
4. Paste the contents of the corresponding `.json` file
5. Click **Save**

---

## Step 4 — Set Up API Connections

The workflows use two managed connectors. Set these up once and both Logic Apps share them.

### Azure Blob Storage connection:
1. In the Logic App designer, click the **Store Raw File to Blob** action
2. Click **Change connection → Add new**
3. Enter your Storage Account name and key
4. Save

### Cosmos DB connection:
1. Click the **Save to CosmosDB** action
2. Click **Change connection → Add new**
3. Enter your Cosmos DB account name and key
4. Save

---

## Step 5 — Set Parameters

In each Logic App → **Settings → Parameters**, set:

### process-document workflow:
| Parameter | Value |
|---|---|
| `azure_cu_endpoint` | `https://jovinkahar-9449-resource.cognitiveservices.azure.com` |
| `azure_cu_api_version` | `2025-05-01-preview` |
| `azure_cu_subscription_key` | Your Azure AI Foundry key |
| `analyzer_id` | `redacted-idp-epf` |
| `confidence_threshold` | `0.75` |

> For the subscription key, use **Key Vault reference** in production:
> `@Microsoft.KeyVault(SecretUri=https://your-vault.vault.azure.net/secrets/cu-key/)`

---

## Step 6 — Get the Trigger URLs

For each Logic App:

1. Open the Logic App → **Overview**
2. Click **Workflow** name → opens the designer
3. Click the **HTTP Trigger** step
4. Copy the full **HTTP POST URL** — it looks like:

```
https://prod-xx.eastus.logic.azure.com/workflows/abc123.../triggers/HTTP_Trigger/paths/invoke?api-version=2016-10-01&sp=...&sig=...
```

Paste these into your frontend `.env.local`:
```
VITE_LOGICAPP_PROCESS_URL=<process-document trigger URL>
VITE_LOGICAPP_REVIEW_URL=<review-document trigger URL>
```

---

## Step 7 — Enable CORS on Logic Apps

Logic Apps HTTP triggers accept requests from any origin by default. The SAS signature in the URL acts as authentication — keep these URLs private (in Netlify environment variables, never in client code).

---

## Workflow Flow Diagram

```
POST /process-document
{
  "fileName": "invoice.pdf",
  "fileContent": "<base64>",    ← file upload
  "contentType": "application/pdf"
}
  OR
{
  "fileName": "receipt.png",
  "fileUrl": "https://..."      ← URL reference
}

         │
         ▼
┌─────────────────────────────────────┐
│  1. Store to Blob Storage           │ raw-uploads/{docId}/filename
│  2. POST to Content Understanding  │ analyzer: redacted-idp-epf
│  3. Poll until succeeded/failed    │ every 2s, up to 10 minutes
│  4. Confidence < 0.75?             │
│     → needs_review / completed     │
│  5. Save to Cosmos DB              │ db: docintel / col: documents
│  6. Return JSON response           │
└─────────────────────────────────────┘

Response:
{
  "success": true,
  "document": {
    "id": "uuid",
    "filename": "invoice.pdf",
    "status": "needs_review",   ← or "completed"
    "confidence": 0.61,
    "needsReview": true,
    "documentType": "Invoice",
    "extractedFields": { ... },
    "uploadedAt": "2025-01-01T..."
  }
}
```

---

## Testing the Logic Apps

Use the built-in **Run Trigger** in Azure Portal to test before wiring up the frontend:

1. Logic App → **Overview → Run Trigger → With payload**
2. Paste a test body:
```json
{
  "fileName": "test-receipt.png",
  "fileUrl": "https://raw.githubusercontent.com/Azure/azure-sdk-for-python/main/sdk/formrecognizer/azure-ai-formrecognizer/tests/sample_forms/receipt/contoso-receipt.png"
}
```
3. Click **Run** and watch the execution in **Runs history**

Each step shows its input/output — makes debugging very easy.

---

## Monitoring

- **Logic App → Runs history** — see every execution, success/failure, and per-step timing
- **Logic App → Metrics** — execution count, failure rate, latency
- Enable **Diagnostic settings** to send logs to Log Analytics for Power BI alerting
