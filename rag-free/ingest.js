require("dotenv").config();
const readPDF = require("./pdfReader");
const chunkText = require("./chunker");
const getEmbedding = require("./embedding");
const { addToIndex, saveIndex } = require("./vectorStore");

const PDF_PATH = process.env.PDF_PATH || "./policy.pdf";

(async () => {
  console.log(`📄 Reading PDF: ${PDF_PATH}`);
  const text = await readPDF(PDF_PATH);

  console.log("✂️  Chunking text...");
  const chunks = chunkText(text);
  console.log(`   → ${chunks.length} chunks created`);

  console.log("🧬 Generating embeddings and indexing...");
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await getEmbedding(chunks[i]);
    addToIndex(embedding, chunks[i]);
    process.stdout.write(`\r   → ${i + 1}/${chunks.length} chunks indexed`);
  }

  console.log("\n💾 Saving index to disk...");
  saveIndex();
  console.log("✅ Data indexed and saved successfully");
})();
