require("dotenv").config();
const express = require("express");
const retrieve = require("./retrieve");
const { generateAnswer } = require("./llm");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post("/ask", async (req, res) => {
  const { question } = req.body;

  if (!question || typeof question !== "string" || question.trim() === "") {
    return res.status(400).json({ error: "A non-empty 'question' field is required." });
  }

  try {
    const docs = await retrieve(question.trim());
    const { answer } = await generateAnswer(question.trim(), docs);
    res.json({ answer });
  } catch (err) {
    console.error("Error processing request:", err.message);
    res.status(500).json({ error: "Failed to process question. Ensure Ollama is running." });
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`🚀 RAG server running on http://localhost:${PORT}`);
  console.log(`   POST /ask  { "question": "..." }`);
});
