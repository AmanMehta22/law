import { env } from "../config";

const levels = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
} as const;

type Level = keyof typeof levels;

class Logger {
  private currentLevel =
    levels[env.LOG_LEVEL as keyof typeof levels] ?? levels.debug;

  private scope: string[];

  constructor(scope: string[] = []) {
    this.scope = scope;
  }

  child(scope: string): Logger {
    return new Logger([...this.scope, scope]);
  }

  private prefix(): string {
    return this.scope.length > 0 ? `[${this.scope.join("][")}] ` : "";
  }

  private shouldLog(level: Level) {
    if (!env.ENABLE_LOGS) return false;

    return levels[level] <= this.currentLevel;
  }

  info(message: string, data?: unknown) {
    if (!this.shouldLog("info")) return;

    console.log(
      `[INFO] ${new Date().toISOString()} - ${this.prefix()}${message}`,
      data ?? "",
    );
  }

  warn(message: string, data?: unknown) {
    if (!this.shouldLog("warn")) return;

    console.warn(
      `[WARN] ${new Date().toISOString()} - ${this.prefix()}${message}`,
      data ?? "",
    );
  }

  error(message: string, data?: unknown) {
    if (!this.shouldLog("error")) return;

    console.error(
      `[ERROR] ${new Date().toISOString()} - ${this.prefix()}${message}`,
      data ?? "",
    );
  }

  debug(message: string, data?: unknown) {
    if (!this.shouldLog("debug")) return;

    console.log(
      `[DEBUG] ${new Date().toISOString()} - ${this.prefix()}${message}`,
      data ?? "",
    );
  }

  startTimer() {
    return new Timer(this);
  }
}

class Timer {
  private start = Date.now();

  constructor(private logger: Logger) {}

  done(message: string, data?: unknown) {
    const durationMs = Date.now() - this.start;

    if (data && typeof data === "object" && !Array.isArray(data)) {
      this.logger.info(message, {
        duration: `${durationMs}ms`,
        ...(data as object),
      });
    } else {
      this.logger.info(message, {
        duration: `${durationMs}ms`,
        data,
      });
    }
  }

  get elapsed(): number {
    return Date.now() - this.start;
  }
}

export { Logger };

export const logger = new Logger(["BACKEND"]);
