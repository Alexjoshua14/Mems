export const config = {
  vectorStore: {
    provider: "pgvector",
    config: {
      collectionName: "memories",
      embeddingModelDims: 1536,
      user: "test",
      password: "123",
      host: "127.0.0.1",
      port: 5432,
      diskann: false, // Optional, requires pgvectorscale extension
    },
  },
};
