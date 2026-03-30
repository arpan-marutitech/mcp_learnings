const axios = require("axios");

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const LLM_MODEL = process.env.LLM_MODEL || "llama3";
const FALLBACK_ANSWER = "Not available in policy";

function normalizePolicyAnswer(answer) {
  const text = String(answer || "").trim();
  const normalized = text
    .toLowerCase()
    .replace(/^"|"$/g, "")
    .replace(/\.$/, "")
    .trim();

  // Only force fallback when the whole answer is a fallback phrase.
  // Keep detailed answers intact even if they mention fallback wording.
  if (normalized === "not available in policy" || normalized === "not found in policy") {
    return FALLBACK_ANSWER;
  }

  return text;
}

function buildPrompt(query, context) {
  return `You are a strict company policy assistant.

Instructions:
1. Only use given context
2. Do not hallucinate
3. If answer is fully missing/unclear in context, respond with: "Not available in policy"
4. Provide concise answer
5. Highlight important rules
6. If context has partial details, provide those details clearly

Context:
${context.join("\n\n")}

User Question:
${query}

Final Answer:`;
}

async function generateAnswer(query, context, options = {}) {
  const prompt = buildPrompt(query, context);

  if (!Array.isArray(context) || context.length === 0) {
    const fallback = FALLBACK_ANSWER;
    if (options.includePrompt) {
      return {
        answer: fallback,
        prompt,
      };
    }
    return { answer: fallback };
  }

  const res = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
    model: LLM_MODEL,
    prompt,
    stream: false,
  });

  const answer = normalizePolicyAnswer(res.data.response);

  if (options.includePrompt) {
    return {
      answer,
      prompt,
    };
  }

  return { answer };
}

module.exports = { generateAnswer, buildPrompt };
