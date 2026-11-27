import { PrismaClient } from '@prisma/client';

export type AppPrismaClient = PrismaClient;

export function createPrismaClient(): AppPrismaClient {
  return new PrismaClient();
}
