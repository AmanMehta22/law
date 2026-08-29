import { prisma } from "../config";

class HealthService {
  async getHealthStatus() {
    const checks: Record<string, { status: "ok" | "down"; error?: string }> = {};

    // Database reachability. A health endpoint that only says "ok" without
    // touching its dependencies tells you nothing during an incident.
    try {
      await prisma.$queryRaw`SELECT 1`;

      checks.database = { status: "ok" };
    } catch (error) {
      checks.database = {
        status: "down",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const allUp = Object.values(checks).every(
      (check) => check.status === "ok",
    );

    return {
      status: allUp ? "ok" : "degraded",
      checks,
      timeStamp: new Date().toISOString(),
    };
  }
}

export const healthService = new HealthService();
