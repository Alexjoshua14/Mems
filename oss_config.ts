import "dotenv/config";

export const config = {
  embedder: {
    provider: "ollama",
    config: {
      model: "all-minilm",
      url: "http://localhost:11434",
    },
  },
  vectorStore: {
    provider: "qdrant",
    config: {
      collectionName: "memories",
      embeddingModelDims: 384,
      host: "localhost",
      port: 6333,
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
