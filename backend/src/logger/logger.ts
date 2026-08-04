import { env } from "../config";

const levels = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
} as const;

class Logger {
  private currentLevel =
    levels[env.LOG_LEVEL as keyof typeof levels] ?? levels.debug;

  private shouldLog(level: keyof typeof levels) {
    if (!env.ENABLE_LOGS) return false;

    return levels[level] <= this.currentLevel;
  }

  info(message: string, data?: unknown) {
    if (!this.shouldLog("info")) return;

    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data ?? "");
  }

  warn(message: string, data?: unknown) {
    if (!this.shouldLog("warn")) return;

    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, data ?? "");
  }

  error(message: string, data?: unknown) {
    if (!this.shouldLog("error")) return;

    console.error(
      `[ERROR] ${new Date().toISOString()} - ${message}`,
      data ?? "",
    );
  }

  debug(message: string, data?: unknown) {
    if (!this.shouldLog("debug")) return;

    console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, data ?? "");
  }

  // ⭐ This is what's missing
  startTimer() {
    return new Timer(this);
  }
}

class Timer {
  private start = Date.now();

  constructor(private logger: Logger) {}

  done(message: string, data?: unknown) {
    if (data && typeof data === "object" && !Array.isArray(data)) {
      this.logger.info(message, {
        duration: `${Date.now() - this.start}ms`,
        ...(data as object),
      });
    } else {
      this.logger.info(message, {
        duration: `${Date.now() - this.start}ms`,
        data,
      });
    }
  }
}

export const logger = new Logger();
