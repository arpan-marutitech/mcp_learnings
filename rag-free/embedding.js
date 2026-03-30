const axios = require("axios");

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

async function getEmbedding(text) {
  const res = await axios.post(`${OLLAMA_BASE_URL}/api/embeddings`, {
    model: "nomic-embed-text",
    prompt: text,
  });

  return res.data.embedding;
}

module.exports = getEmbedding;
