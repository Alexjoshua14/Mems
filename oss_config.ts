import "dotenv/config";

export const config = {
  embedder: {
    provider: "ollama",
    config: {
      model: "nomic-embed-text",
      url: "http://localhost:11434",
      embeddingDims: 768,
    },
  },
  vectorStore: {
    provider: "qdrant",
    config: {
      collectionName: "memories",
      embeddingModelDims: 768,
      dimension: 768,
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
