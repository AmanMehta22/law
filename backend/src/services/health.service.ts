import { timeStamp } from "node:console";

class HealthService {
  getHealthStatus() {
    return {
      status: "Ok",
      message: "LegalBot Health is above the roof",
      timeStamp: new Date().toISOString(),
    };
  }
}

export const healthService = new HealthService();
