# DocIntel — Architecture & Deployment Guide

## Overview

DocIntel is an end-to-end intelligent document processing pipeline built on:

- **Frontend**: React (Vite) — hosted on Netlify
- **Backend**: Azure Functions (Python) — hosted on Azure
- **AI Engine**: Azure AI Foundry Content Understanding
- **Storage**: Azure Blob Storage + Azure Cosmos DB
- **Reporting**: Microsoft Power BI

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         NETLIFY (CDN)                           │
│                                                                 │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐   │
│   │  Upload Zone │   │   Doc Queue  │   │  Human Review    │   │
│   │  (PDF/Image) │   │  (Progress)  │   │  (HITL < 75%)    │   │
│   └──────┬───────┘   └──────────────┘   └────────┬─────────┘   │
└──────────┼───────────────────────────────────────┼─────────────┘
           │  POST /api/process-document            │ PATCH /api/review/{id}
           ▼                                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                  AZURE FUNCTIONS (Python)                        │
│                                                                 │
│   process_document()          review_document()                 │
│   list_results()                                                │
└──────────┬────────────────────────────────┬────────────────────┘
           │                                │
     ┌─────▼──────┐                   ┌─────▼──────┐
     │  Azure AI  │                   │  Cosmos DB │
     │  Foundry   │                   │  (Records) │
     │  Content   │                   └─────┬──────┘
     │  Understanding│                      │
     └─────┬──────┘                   ┌─────▼──────┐
           │                          │  Blob      │
     ┌─────▼──────┐                   │  Storage   │
     │  Raw File  │                   │  Results   │
     │  Blob      │                   │  (for PBI) │
     └────────────┘                   └─────┬──────┘
                                            │
                                      ┌─────▼──────┐
                                      │  Power BI  │
                                      │  Service   │
                                      └────────────┘
```

---

## Component Breakdown

### 1. Frontend (Netlify)

| Component | Description |
|-----------|-------------|
| Upload Zone | Drag-and-drop or click-to-upload for PDF & image files (max 50MB) |
| Document Queue | Real-time processing status with progress bars |
| Human Review | Cards for low-confidence docs; editable fields for correction |
| Results Panel | Searchable table with CSV/JSON export for Power BI |

**Confidence Threshold**: Documents with AI confidence < 75% are automatically routed to Human Review.

### 2. Azure Functions Backend

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/process-document` | POST | Accept file, call Azure AI, return result |
| `/api/review/{doc_id}` | PATCH | Approve or reject reviewed documents |
| `/api/results` | GET | List processed documents |

### 3. Azure AI Foundry Content Understanding

The backend uses the **Azure AI Content Understanding** prebuilt analyzers:

- `prebuilt-documentAnalysis` — general documents, PDFs, scanned images
- `prebuilt-invoice` — invoices (amount, vendor, date)
- `prebuilt-receipt` — receipts
- `prebuilt-idDocument` — identity documents

Each field returned includes a `confidence` score. The average field confidence is used to determine if human review is needed.

### 4. Data Storage

**Azure Blob Storage**:
- `raw-uploads/` — original uploaded files
- `processed-results/` — per-document JSON files for Power BI

**Azure Cosmos DB**:
- Database: `docintel`
- Container: `documents` (partition key: `/id`)
- Full document record including review history

---

## Deployment Guide

### Step 1 — Azure Resources

Create the following in Azure Portal or via CLI:

```bash
# Resource Group
az group create --name docintel-rg --location eastus

# Storage Account
az storage account create --name docintelstorage --resource-group docintel-rg --sku Standard_LRS
az storage container create --name raw-uploads --account-name docintelstorage
az storage container create --name processed-results --account-name docintelstorage

# Cosmos DB
az cosmosdb create --name docintel-cosmos --resource-group docintel-rg
az cosmosdb sql database create --account-name docintel-cosmos --name docintel
az cosmosdb sql container create --account-name docintel-cosmos --database-name docintel --name documents --partition-key-path /id

# Azure AI Foundry (Content Understanding)
az cognitiveservices account create \
  --name docintel-ai \
  --resource-group docintel-rg \
  --kind AIServices \
  --sku S0 \
  --location eastus

# Azure Function App
az functionapp create \
  --name docintel-functions \
  --resource-group docintel-rg \
  --consumption-plan-location eastus \
  --runtime python \
  --runtime-version 3.11 \
  --functions-version 4 \
  --storage-account docintelstorage
```

### Step 2 — Deploy Azure Functions

```bash
cd backend
func azure functionapp publish docintel-functions
```

Set App Settings:
```bash
az functionapp config appsettings set \
  --name docintel-functions \
  --resource-group docintel-rg \
  --settings \
  AZURE_AI_CONTENT_UNDERSTANDING_ENDPOINT="https://docintel-ai.cognitiveservices.azure.com" \
  AZURE_AI_KEY="<key>" \
  COSMOS_DB_CONNECTION_STRING="<connection-string>" \
  AZURE_BLOB_CONNECTION_STRING="<connection-string>" \
  CONFIDENCE_THRESHOLD="0.75"
```

### Step 3 — Deploy Frontend to Netlify

```bash
# Install dependencies and build
npm install
npm run build

# Deploy via Netlify CLI
npx netlify-cli deploy --prod --dir=dist
```

Or connect your GitHub repo in the Netlify dashboard:
1. New site → Import from Git
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Add environment variable: `VITE_API_BASE_URL=https://docintel-functions.azurewebsites.net/api`

---

## Power BI Setup

### Data Sources

#### Option A — Azure Blob Storage (Recommended for scheduled refresh)

1. Open Power BI Desktop
2. **Get Data → Azure → Azure Blob Storage**
3. Account: `docintelstorage`
4. Navigate to `processed-results/` container
5. Transform: expand JSON content, normalize fields

#### Option B — Cosmos DB DirectQuery

1. **Get Data → Azure → Azure Cosmos DB**
2. URL: `https://docintel-cosmos.documents.azure.com:443/`
3. Database: `docintel`, Collection: `documents`

### Recommended Visuals

| Visual | Description |
|--------|-------------|
| Card | Total documents processed today |
| Card | Average confidence score |
| Card | Documents pending human review |
| Pie Chart | Document types breakdown |
| Line Chart | Documents processed over time |
| Bar Chart | Confidence distribution by document type |
| Table | Recent low-confidence documents (human review queue) |
| KPI | Human review rate (target: < 20%) |
| Funnel | Auto-approved vs Human-reviewed vs Rejected |

### DAX Measures

```dax
// Review Rate
Review Rate = 
DIVIDE(
    COUNTROWS(FILTER(documents, documents[humanReviewed] = TRUE())),
    COUNTROWS(documents)
)

// Avg Confidence
Avg Confidence = AVERAGE(documents[confidence])

// Auto-Approved
Auto Approved = 
COUNTROWS(FILTER(documents, documents[status] = "completed" && documents[humanReviewed] = FALSE()))

// Rejected Rate  
Rejected Rate = 
DIVIDE(
    COUNTROWS(FILTER(documents, documents[status] = "rejected")),
    COUNTROWS(documents)
)
```

### Refresh Schedule

In Power BI Service:
1. Publish report from Desktop
2. Dataset Settings → Scheduled Refresh
3. Set to **every 15 minutes** (or hourly)
4. Configure Azure Blob Storage credentials

---

## Security Considerations

- Azure Function endpoints are protected by **Function-level API keys**
- Frontend calls are made with the key stored in Netlify environment variables (never in client code)
- Blob Storage uses **private containers** — no public access
- Cosmos DB access is restricted to the Function App via connection strings stored in Azure Key Vault (recommended)
- Enable **Azure Private Endpoints** for production deployments
- Configure **CORS** in host.json to restrict to your Netlify domain only

---

## Human-in-the-Loop Workflow

```
Document Uploaded
       │
       ▼
Azure AI Analysis
       │
  Confidence?
  ┌────┴────┐
< 75%     ≥ 75%
  │          │
  ▼          ▼
Human     Auto-approve
Review    → Cosmos DB
  │       → Blob Export
  ├── Approve (with corrections)
  │      → Update Cosmos DB
  │      → Export to Power BI blob
  └── Reject
         → Mark rejected
         → Logged for audit
```

The reviewer can:
- Edit any extracted field inline
- Correct the document type classification
- Approve with corrections (saves corrected data)
- Reject with a reason (logged for audit trail)
