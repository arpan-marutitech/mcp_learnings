const faiss = require("faiss-node");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const INDEX_DIR = process.env.INDEX_PATH
  ? path.dirname(path.resolve(process.env.INDEX_PATH))
  : __dirname;
const FAISS_FILE = process.env.INDEX_PATH
  ? path.resolve(process.env.INDEX_PATH)
  : path.join(__dirname, "faiss.index");
const CHUNKS_FILE = FAISS_FILE.replace(/(\.[^.]+)?$/, ".chunks.json");

let index = null;
let dim = null;
let storedChunks = [];

// Auto-load from disk on module require (used by server.js)
(function loadFromDisk() {
  try {
    if (fs.existsSync(FAISS_FILE) && fs.existsSync(CHUNKS_FILE)) {
      index = faiss.IndexFlatL2.read(FAISS_FILE);
      dim = index.getDimension();
      storedChunks = JSON.parse(fs.readFileSync(CHUNKS_FILE, "utf8"));
      console.log(`✅ Loaded FAISS index (${storedChunks.length} chunks) from disk.`);
    }
  } catch (err) {
    console.error("⚠️  Could not load FAISS index from disk:", err.message);
  }
})();

function saveToDisk() {
  if (!fs.existsSync(INDEX_DIR)) {
    fs.mkdirSync(INDEX_DIR, { recursive: true });
  }
  index.write(FAISS_FILE);
  fs.writeFileSync(CHUNKS_FILE, JSON.stringify(storedChunks), "utf8");
}

function ensureIndex(embedding) {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Embedding must be a non-empty numeric array.");
  }

  if (!index) {
    dim = embedding.length;
    index = new faiss.IndexFlatL2(dim);
  }

  if (embedding.length !== dim) {
    throw new Error(
      `Embedding dimension mismatch: expected ${dim}, received ${embedding.length}`
    );
  }
}

function addToIndex(embedding, text) {
  ensureIndex(embedding);
  index.add(embedding);
  storedChunks.push(text);
}

function saveIndex() {
  saveToDisk();
}

function search(queryEmbedding, k = 5) {
  if (storedChunks.length === 0) {
    return [];
  }

  ensureIndex(queryEmbedding);

  const topK = Math.max(1, Math.min(k, storedChunks.length));
  const result = index.search(queryEmbedding, topK);

  return result.labels
    .filter((i) => i >= 0 && i < storedChunks.length)
    .map((i) => storedChunks[i]);
}

module.exports = { addToIndex, saveIndex, search };
