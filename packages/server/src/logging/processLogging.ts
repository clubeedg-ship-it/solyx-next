import type { Logger } from "./logger.js";

export interface ProcessLike {
  on(event: string, listener: (...args: any[]) => void): unknown;
}

export interface ProcessLoggingOptions {
  logger: Logger;
  proc?: ProcessLike;
  exit?: (code: number) => void;
}

/**
 * Records why the process died before it dies.
 *
 * Registering these handlers SUPPRESSES Node's default crash, so each one must
 * still exit non-zero: a log-and-continue handler would turn today's
 * crash-and-systemd-restart into a half-dead process still serving a live
 * client. The exit is deferred by one tick because stdout to the journal is a
 * pipe — process.exit() in the same turn can drop the line we just wrote.
 */
export function installProcessLogging(options: ProcessLoggingOptions): void {
  const proc = options.proc ?? process;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const { logger } = options;

  const fatal = (event: string, msg: string) => (reason: unknown) => {
    logger.error(msg, {
      event,
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    setImmediate(() => exit(1));
  };

  proc.on("unhandledRejection", fatal("process.unhandledRejection", "Unhandled promise rejection"));
  proc.on("uncaughtException", fatal("process.uncaughtException", "Uncaught exception"));
}
