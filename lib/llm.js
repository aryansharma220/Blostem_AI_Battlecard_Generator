import OpenAI from "openai";

const openRouterKey = process.env.OPENROUTER_API_KEY || "";
const groqKey = process.env.GROQ_API_KEY || "";
const requestedProvider = String(process.env.LLM_PROVIDER || "").toLowerCase();

const OPENROUTER_EXTRACTION_MODEL =
  process.env.OPENROUTER_EXTRACTION_MODEL ||
  process.env.EXTRACTION_MODEL ||
  "qwen/qwen3-next-80b-a3b-instruct";
const OPENROUTER_SYNTHESIS_MODEL =
  process.env.OPENROUTER_SYNTHESIS_MODEL ||
  process.env.SYNTHESIS_MODEL ||
  "qwen/qwen3-next-80b-a3b-instruct";

const GROQ_EXTRACTION_MODEL =
  process.env.GROQ_EXTRACTION_MODEL ||
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-120b";
const GROQ_SYNTHESIS_MODEL =
  process.env.GROQ_SYNTHESIS_MODEL ||
  process.env.GROQ_MODEL ||
  "openai/gpt-oss-120b";

const provider =
  requestedProvider === "groq" && groqKey
    ? "groq"
    : requestedProvider === "openrouter" && openRouterKey
    ? "openrouter"
    : openRouterKey
    ? "openrouter"
    : groqKey
    ? "groq"
    : "none";

const debugLLM = String(process.env.LLM_DEBUG || "").toLowerCase() === "true";

const modelConfig =
  provider === "groq"
    ? {
        extraction: GROQ_EXTRACTION_MODEL,
        synthesis: GROQ_SYNTHESIS_MODEL,
      }
    : {
        extraction: OPENROUTER_EXTRACTION_MODEL,
        synthesis: OPENROUTER_SYNTHESIS_MODEL,
      };

let client = null;
if (provider === "openrouter") {
  client = new OpenAI({
    apiKey: openRouterKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME || "Blostem Battlecard Studio",
    },
  });
} else if (provider === "groq") {
  client = new OpenAI({
    apiKey: groqKey,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

const ANALYST_SYSTEM_PROMPT = `ROLE
You are a senior enterprise GTM strategist helping a Blostem Account Executive prepare for a fintech/BFSI sales conversation.

OBJECTIVE
Generate tactical, evidence-backed competitive intelligence that helps the AE understand where the competitor wins, where they lose, and how to run a credible enterprise sales conversation.

RULES
- Prioritize actionable insights over generic summaries.
- Avoid marketing language, hype, vague praise, and unsupported competitive attacks.
- Separate facts from inferences.
- Explicitly mention weak, stale, single-source, or contradictory evidence.
- Identify contradictions, tradeoffs, and uncertainty when present in the supplied evidence.
- Focus on enterprise operational concerns: procurement, implementation risk, integration depth, reconciliation, settlement, compliance, support, reliability, cost predictability, and governance.
- Do not invent claims, metrics, dates, customer counts, or private/internal sources.
- Use only evidence provided in the prompt.
- If evidence is weak, mark confidence low or omit the claim.
- Make outputs useful for an AE: tactical discovery questions, positioning angles, procurement concerns, operational risks, and enterprise readiness concerns.
- When the user prompt asks for a JSON schema, return valid JSON in exactly that schema and express these priorities through the available fields.`;

export function isLLMConfigured() {
  return Boolean(client);
}

export function getLLMProvider() {
  return {
    provider,
    model: modelConfig.synthesis,
    extraction_model: modelConfig.extraction,
    synthesis_model: modelConfig.synthesis,
    configured: Boolean(client),
  };
}

function pickModel(opts = {}) {
  if (opts.model) return opts.model;
  const task = String(opts.task || opts.modelRole || "").toLowerCase();
  if (task === "extraction" || task === "extract" || task === "analysis") return modelConfig.extraction;
  return modelConfig.synthesis;
}

export function parseJsonObject(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Empty LLM response");

  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    if (!candidate || candidate === text) throw new Error("LLM response was not valid JSON");
    return JSON.parse(candidate);
  }
}

export function parseJsonArray(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Empty LLM response");

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      const firstArray = Object.values(parsed).find(Array.isArray);
      if (firstArray) return firstArray;
      return [parsed];
    }
    throw new Error("LLM response was not a JSON array");
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    if (!candidate || candidate === text) throw new Error("LLM response was not valid JSON array");
    const parsed = JSON.parse(candidate);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
}

function lexicalEmbedding(text, length = 384) {
  const vector = Array.from({ length }, () => 0);
  const tokens = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9+.%₹\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);

  tokens.forEach((token, position) => {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i += 1) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const index = Math.abs(hash) % length;
    vector[index] += 1 / Math.sqrt(position + 1);
  });

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

export async function embed(text) {
  // Local lexical vector used only as a transparent fallback ranker.
  return lexicalEmbedding(text);
}

async function createChatCompletion(messages, opts = {}, includeJsonFormat = true) {
  const request = {
    model: pickModel(opts),
    messages,
    max_tokens: opts.maxTokens || 800,
    temperature: opts.temperature ?? 0.2,
  };

  if (includeJsonFormat && opts.responseFormat !== "text") {
    request.response_format = { type: "json_object" };
  }

  return client.chat.completions.create(request);
}

function readCompletionContent(resp, requestMeta = {}) {
  const choice = resp?.choices?.[0] || {};
  const content = choice.message?.content || "";

  if (debugLLM) {
    console.log("LLM response:", {
      provider,
      model: requestMeta.model,
      json_mode: requestMeta.jsonMode,
      finish_reason: choice.finish_reason,
      content_length: content.length,
      content_preview: content.slice(0, 300),
    });
  }

  return content;
}

export async function chatCompletion(messages, opts = {}) {
  if (!client) return null;
  const jsonMode = opts.responseFormat !== "text";
  const resp = await createChatCompletion(messages, opts, jsonMode);
  return readCompletionContent(resp, { model: pickModel(opts), jsonMode });
}

export async function completion(prompt, opts = {}) {
  if (!client) return null;

  const messages = [
    { role: "system", content: opts.systemPrompt || ANALYST_SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];

  try {
    const jsonMode = opts.responseFormat !== "text";
    const resp = await createChatCompletion(messages, opts, jsonMode);
    const content = readCompletionContent(resp, { model: pickModel(opts), jsonMode });
    if (!content && jsonMode) throw new Error("Empty structured LLM response");
    return content;
  } catch (err) {
    if (opts.responseFormat === "text") throw err;
    const resp = await createChatCompletion(messages, { ...opts, responseFormat: "text" }, false);
    return readCompletionContent(resp, { model: pickModel(opts), jsonMode: false });
  }
}
