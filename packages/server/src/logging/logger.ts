import { redact } from "./redact.js";

export interface LogFields { [key: string]: unknown }

/** Just the slice of a writable stream a log line needs, so tests can inject. */
export interface LogSink { write(chunk: string): unknown }

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerOptions {
  stream?: LogSink;
  now?: () => Date;
  level?: string;
  format?: string;
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function parseLevel(value: string | undefined): LogLevel {
  const candidate = (value ?? "").toLowerCase();
  return candidate in LEVEL_ORDER ? (candidate as LogLevel) : "info";
}

/**
 * One JSON object per line on stdout, which systemd captures into the journal.
 *
 * Env-driven rather than Config-driven on purpose: logging has to work before
 * loadConfig() has validated anything, including in the failure path where
 * loadConfig() itself throws.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const stream = options.stream ?? process.stdout;
  const now = options.now ?? (() => new Date());
  const minimum = LEVEL_ORDER[parseLevel(options.level ?? process.env.LOG_LEVEL)];
  const format = (options.format ?? process.env.LOG_FORMAT ?? "json").toLowerCase();

  function emit(level: LogLevel, msg: string, fields?: LogFields): void {
    if (LEVEL_ORDER[level] < minimum) return;
    const ts = now().toISOString();
    // The message is as caller-controlled as the fields are: draftProxy.ts and
    // the Gateway client both build strings like `Bearer <token>` and one of
    // them will eventually be handed straight to logger.error().
    const safeMsg = String(redact(msg));

    let line: string;
    try {
      // ts/level/msg are written first and defended: a caller field named "ts"
      // must not be able to forge the timestamp or the level of a journal line,
      // and the reserved keys also have to keep their leading key order.
      const record: Record<string, unknown> = { ts, level, msg: safeMsg };
      for (const [key, value] of Object.entries(redact(fields ?? {}) as LogFields)) {
        if (!(key in record)) record[key] = value;
      }
      line = format === "text" ? toText(record) : JSON.stringify(record);
    } catch (error) {
      // A logger that throws is worse than no logger: this runs inside an http
      // "finish" handler and inside the uncaughtException handler, where a
      // throw would take the live service down. Degrade to a line that still
      // says what happened.
      const reason = error instanceof Error ? error.message : String(error);
      line = JSON.stringify({ ts, level, msg: safeMsg, logError: `unserialisable fields: ${reason}` });
    }

    try {
      stream.write(`${line}\n`);
    } catch {
      // stdout is a pipe; if the reader is gone there is nowhere left to
      // report that, and failing the caller over it would be absurd.
    }
  }

  function toText(record: Record<string, unknown>): string {
    const { ts, level, msg, ...rest } = record;
    const tail = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
    return `${ts as string} ${(level as string).toUpperCase()} ${msg as string}${tail}`;
  }

  const logger: Logger = {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
  };
  return logger;
}
