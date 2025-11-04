import { Memory, type MemoryItem } from "mem0ai/oss";
import { type Message, type SearchResult } from "mem0ai/oss";
import OpenAI from "openai";
import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { config } from "./oss_config.ts";

let memory: Memory;
let openaiClient: OpenAI;

try {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY must be set in environment variables or .env file.",
    );
  }

  memory = new Memory(config);
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log("Clients intialized successfully");
} catch (error: any) {
  console.error("Initialization Error:", error.message);
  process.exit(1);
}

const USER_ID = "platform-quickstart-user";

const rl = readline.createInterface({ input, output });

/**
 * Searches for memories using the Mem0 API.
 *
 * @param query – The search query to use.
 * @param userId – The user ID to filter memories by.
 * @returns
 */
async function searchMemories(
  query: string,
  userId: string,
): Promise<Array<MemoryItem>> {
  console.log("\n[Mem0 Platform] Searching memories..");

  try {
    if (!userId) {
      throw new Error("User ID is required");
    } else {
      console.log(`[Mem0 Platform] Searching for memories for user ${userId}`);
    }
    const results = await memory.search(query, {
      userId,
      limit: 3,
    });
    const memories = results.results || [];

    console.log(`[Mem0 Platform] Found ${memories.length} relevant memories`);
    return memories;
  } catch (error: any) {
    console.error("[Mem0 Platform] Search Error:", error.message);
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
  memoryContext: string,
): Promise<string> {
  console.log("[Chatbot] Generating response..");

  const systemPrompt =
    "You are a helpful assistant that remembers previous interactions.";

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
  userId: string,
): Promise<void> {
  console.log("[Mem0 Platform] Adding interaction to memory..");
  const interaction: Message[] = [
    { role: "user", content: userQuery },
    { role: "assistant", content: aiResponse },
  ];

  try {
    const result = await memory.add(interaction, {
      userId,
    });
    const memories = result.results;
    console.log("[Mem0 Platform] Interaction added to memory.");
    if (memories && memories.length > 0) {
      console.log("[Mem0 Platform] Raw memories:");
      console.log(JSON.stringify(memories, null, 2));
    }
  } catch (error: any) {
    console.error(
      "[Mem0 Platform] Error adding interaction to memory:",
      error.message,
    );
  }
}

async function wipeMemory(userId: string): Promise<boolean> {
  console.log(`[Mem0 Platform] Wiping memories for user ${USER_ID}...`);
  try {
    const res = await memory.deleteAll({ userId });
    console.log(
      `[Mem0 Platform] Memories wiped for user ${USER_ID}. Message from mem0:`,
      res.message,
    );
    return true;
  } catch (error: any) {
    console.error("[Mem0 Platform] Error wiping memories:", error.message);
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
  console.log(`[Mem0 Platform] Listing memories for user ${USER_ID}...`);
  try {
    const results = await memory.getAll({
      userId,
    });
    return results.results;
  } catch (error: any) {
    console.error("[Mem0 Platform] Error listing memories:", error.message);
    return [];
  }
}

async function runOSSChat() {
  console.log(
    `\nChat session started for user: ${USER_ID}. Type 'quit' to exit.`,
  );

  try {
    while (true) {
      const userInput = await rl.question("You: ");
      if (userInput.toLowerCase() === "quit") {
        break;
      } else if (userInput.toLowerCase() === "reset") {
        const confirmation = await rl.question(
          `Enter y to confirm memory wipe for user: ${USER_ID}: `,
        );
        if (confirmation.toLowerCase() === "y") {
          await wipeMemory(USER_ID);
        }
        continue;
      } else if (userInput.toLowerCase() === "list") {
        const memories = await listMemory(USER_ID);
        console.log(
          `Memories listed for user ${USER_ID}:\n\n`,
          memoryOverview(memories),
        );
        continue;
      } else if (userInput.toLowerCase() === "inspect") {
        const memories = await listMemory(USER_ID);
        console.log(
          `Memories listed for user ${USER_ID}:`,
          JSON.stringify(memories, null, 2),
        );
        continue;
      }
      if (!userInput.trim()) continue;

      const relevantMemories = await searchMemories(userInput, USER_ID);
      const memoryPromptContext = formatMemoriesForPrompt(relevantMemories);

      const aiOutput = await getChatbotResponse(userInput, memoryPromptContext);
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

runOSSChat();
