import OpenAI from "openai";
import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { config } from "./oss_config.ts";
import { Memory, type MemoryItem, type Message } from "mem0ai/oss";

const OLLAMA_URL =
  (config as any)?.embedder?.config?.url || "http://127.0.0.1:11434";
const EMBED_MODEL = (config as any)?.embedder?.config?.model || "all-minilm";

const ANALYZE_PERFORMANCE = true;

async function warmEmbedder() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: "warmup" }),
    });
    await res.json();
    console.log(`[Warmup] Embedder '${EMBED_MODEL}' warmed.`);
  } catch (e: any) {
    console.warn("[Warmup] Failed to warm embedder:", e?.message || e);
  }
}

async function timeit<T>(
  label: string,
  fn: () => Promise<T>
): Promise<{ ms: number; value: T }> {
  const t0 = performance.now();
  const value = await fn();
  const ms = performance.now() - t0;
  if (ANALYZE_PERFORMANCE) {
    console.log(`[Perf] ${label}: ${ms.toFixed(2)} ms`);
  }
  return { ms, value };
}

let memory: Memory;
let openaiClient: OpenAI;

try {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY must be set in environment variables or .env file."
    );
  }

  memory = new Memory(config);
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log("Clients initialized successfully");
} catch (error: any) {
  console.error("Initialization Error:", error.message);
  process.exit(1);
}

const USER_ID = "oss-quickstart-user";

/**
 * Searches for memories using the Mem0 API.
 *
 * @param query – The search query to use.
 * @param userId – The user ID to filter memories by.
 * @returns
 */
async function searchMemories(
  query: string,
  userId: string
): Promise<Array<MemoryItem>> {
  console.log("\n[Mem0 OSS] Searching memories..");

  try {
    if (!userId) {
      throw new Error("User ID is required");
    } else {
      console.log(`[Mem0 OSS] Searching for memories for user ${userId}`);
    }
    const results = await memory.search(query, {
      userId,
      limit: 3,
    });
    const memories = results.results || [];

    console.log(`[Mem0 OSS] Found ${memories.length} relevant memories`);
    return memories;
  } catch (error: any) {
    console.error("[Mem0 OSS] Search Error:", error.message);
    return [];
  }
}

/**
 * Formats an array of SearchResults into a string for use in a prompt.
 *
 * @param memories – Array of SearchResults
 * @returns
 */
function formatMemoriesForPrompt(memories: Array<MemoryItem>): string {
  if (memories === undefined || !memories || memories.length === 0) {
    return "No relevant memories found for this context.";
  } else {
    console.log("[FormatMemoriesForPrompt] Formatting memories: ", memories);
  }

  const formatted = memories
    .map((mem) => `- ${mem.memory || "N/A"}`)
    .join("\n");
  return `Context from previous interactions:\n${formatted}`;
}

async function getChatbotResponse(
  userQuery: string,
  memoryContext: string
): Promise<string> {
  console.log("[Chatbot] Generating response..");

  const systemPrompt =
    "You are a helpful assistant that remembers previous interactions. Use the provided memory context if relevant.";

  try {
    const response = await openaiClient.responses.create({
      model: "gpt-5-mini",
      input: [
        { role: "system", content: `${systemPrompt}\n${memoryContext}` },
        { role: "user", content: userQuery },
      ],
    });

    const aiResponse =
      response.output_text.trim() ??
      "I'm sorry, I couldn't formulate a response..";
    console.log("[Chatbot] Generated response:", aiResponse);
    return aiResponse;
  } catch (error: any) {
    console.error("[Chatbot] Response Error:", error.message);
    return "I'm sorry, there was an error generating a response.";
  }
}
async function addInteractionToMemory(
  userQuery: string,
  aiResponse: string,
  userId: string
): Promise<void> {
  console.log("[Mem0 OSS] Adding interaction to memory..");

  const interaction: Message[] = [
    { role: "user", content: userQuery },
    { role: "assistant", content: aiResponse },
  ];

  try {
    const { value: result } = await timeit("mem0.add()", () =>
      memory.add(interaction, { userId })
    );

    const memories = result.results;
    console.log("[Mem0 OSS] Interaction added to memory.");
    if (memories && memories.length > 0) {
      console.log("[Mem0 OSS] Raw memories:");
      console.log(JSON.stringify(memories, null, 2));
    }
  } catch (error: any) {
    console.error(
      "[Mem0 OSS] Error adding interaction to memory:",
      error.message
    );
    console.error("Error details:", JSON.stringify(error, null, 2));
  }
}

async function wipeMemory(userId: string): Promise<boolean> {
  console.log(`[Mem0 OSS] Wiping memories for user ${userId}...`);
  try {
    const res = await memory.deleteAll({ userId });
    console.log(
      `[Mem0 OSS] Memories wiped for user ${userId}. Message from mem0:`,
      res.message
    );
    return true;
  } catch (error: any) {
    console.error("[Mem0 OSS] Error wiping memories:", error.message);
    return false;
  }
}

function memoryOverview(memories: Array<MemoryItem>): string {
  if (memories == null || memories.length == 0) {
    return "No memories found.";
  }
  return memories
    .map((mem) => {
      return `${mem.memory}\n  Timestamp: ${mem.updatedAt}\n`;
    })
    .join("\n");
}

async function listMemory(userId: string): Promise<Array<MemoryItem>> {
  console.log(`[Mem0 OSS] Listing memories for user ${userId}...`);
  try {
    const results = await memory.getAll({
      userId,
    });
    return results.results;
  } catch (error: any) {
    console.error("[Mem0 OSS] Error listing memories:", error.message);
    return [];
  }
}

async function runOSSChat() {
  console.log(
    `\nChat session started for user: ${USER_ID}. Type 'quit' to exit.`
  );

  await warmEmbedder();

  try {
    while (true) {
      const userInput = await rl.question("You: ");
      if (
        userInput.toLowerCase() === "quit" ||
        userInput.toLowerCase() === "exit"
      ) {
        break;
      } else if (userInput.toLowerCase() === "reset") {
        const confirmation = await rl.question(
          `Enter y to confirm memory wipe for user: ${USER_ID}: `
        );
        if (confirmation.toLowerCase() === "y") {
          await wipeMemory(USER_ID);
        }
        continue;
      } else if (userInput.toLowerCase() === "list") {
        const memories = await listMemory(USER_ID);
        console.log(
          `Memories listed for user ${USER_ID}:\n\n`,
          memoryOverview(memories)
        );
        continue;
      } else if (userInput.toLowerCase() === "inspect") {
        const memories = await listMemory(USER_ID);
        console.log(
          `Memories listed for user ${USER_ID}:`,
          JSON.stringify(memories, null, 2)
        );
        continue;
      }
      if (!userInput.trim()) continue;

      console.log("Gathering memories...");
      const { value: relevantMemories } = await timeit("mem0.search()", () =>
        searchMemories(userInput, USER_ID)
      );

      console.log("Formatting memories...");
      const memoryPromptContext = formatMemoriesForPrompt(relevantMemories);

      console.log("Generating response...");
      const { value: aiOutput } = await timeit("LLM response", () =>
        getChatbotResponse(userInput, memoryPromptContext)
      );
      console.log(`AI: ${aiOutput}`);

      await addInteractionToMemory(userInput, aiOutput, USER_ID);
    }
  } catch (error: any) {
    console.error("\nAn error occurred during the chat:", error.message);
  } finally {
    rl.close();
    console.log(`\nChat session ended for user: ${USER_ID}.`);
  }
}

const rl = readline.createInterface({ input, output });

runOSSChat();
