import "dotenv/config";

export const config = {
  embedder: {
    provider: "openai",
    config: {
      apiKey: process.env.OPENAI_API_KEY || "",
      model: "text-embedding-3-small",
    },
  },
  vectorStore: {
    provider: "redis",
    config: {
      collectionName: "memories",
      embeddingModelDims: 1536,
      redisUrl: "redis://localhost:6379",
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
    },
  },
  llm: {
    provider: "openai",
    config: {
      apiKey: process.env.OPENAI_API_KEY || "",
      model: "gpt-5-mini",
    },
  },
};
