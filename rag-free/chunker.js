function chunkText(text, size = 500, overlap = 50) {
  const chunks = [];
  let i = 0;

  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size - overlap;
  }

  return chunks;
}

module.exports = chunkText;
