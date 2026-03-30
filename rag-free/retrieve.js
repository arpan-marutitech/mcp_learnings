const getEmbedding = require("./embedding");
const { search } = require("./vectorStore");

async function retrieve(query, k = 5) {
  const embedding = await getEmbedding(query);
  return search(embedding, k);
}

module.exports = retrieve;
