const config = {
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
};
