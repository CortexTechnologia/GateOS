import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Agora ele é obrigado a usar a URL do Postgres
    url: process.env.DATABASE_URL,
  },
});