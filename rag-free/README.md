# RAG Free — PDF Q&A with Ollama + FAISS

A fully **free, local** Retrieval-Augmented Generation (RAG) system for querying PDF documents.

## Stack

| Layer      | Tool                |
|------------|---------------------|
| LLM        | Ollama (`llama3`)   |
| Embeddings | Ollama (`nomic-embed-text`) |
| Vector DB  | FAISS (`faiss-node`) |
| Backend    | Node.js + Express   |
| PDF Parser | `pdf-parse`         |

## Architecture

```
PDF → Text → Chunks → Embeddings (Ollama) → FAISS (index)

User Query → Embedding → FAISS search → Top-K Chunks → LLM (Ollama) → Answer
```

---

## Prerequisites

### 1. Install Ollama
Download from https://ollama.com and install it, then pull the required models:

```bash
ollama pull llama3
ollama pull nomic-embed-text
```

### 2. Install Node dependencies

```bash
npm install
```

> **Note (Windows):** `faiss-node` requires native bindings. If installation fails, install the Windows build tools first:
> ```bash
> npm install --global windows-build-tools
> ```

---

## Setup

1. Copy `.env` and update values if needed (defaults work out of the box):
   - `OLLAMA_BASE_URL` — Ollama API URL (default: `http://localhost:11434`)
   - `LLM_MODEL` — model for answering (default: `llama3`)
   - `PDF_PATH` — path to your PDF (default: `./policy.pdf`)
   - `PORT` — server port (default: `3000`)

2. Place your PDF at the path defined in `PDF_PATH` (default: `./policy.pdf`).

---

## Usage

### Step 1 — Ingest PDF

```bash
npm run ingest
# or
node ingest.js
```

This reads the PDF, splits it into chunks, generates embeddings via Ollama, and stores them in the FAISS in-memory index.

> Re-run ingest every time you change the PDF.

### Step 2 — Start the server

```bash
npm start
# or
node server.js
```

### Step 3 — Ask questions

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the leave policy?"}'
```

Response:
```json
{
  "answer": "Employees are entitled to 15 days of annual leave..."
}
```

---

## Project Structure

```
rag-free/
├── server.js       # Express API — POST /ask endpoint
├── ingest.js       # One-time script: PDF → FAISS index
├── pdfReader.js    # Read & parse PDF file
├── chunker.js      # Split text into overlapping chunks
├── embedding.js    # Generate embeddings via Ollama
├── vectorStore.js  # FAISS index wrapper (add + search)
├── retrieve.js     # Query embedding + FAISS search
├── llm.js          # Generate answer via Ollama LLM
├── .env            # Environment configuration
└── package.json
```

---

## Health Check

```bash
GET http://localhost:3000/health
```
