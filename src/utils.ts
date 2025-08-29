import { Socket } from "socket.io";
import { SocketHandler } from "./types";
import logger from "./logger";

export const wrapHandler = (
  socket: Socket,
  event: string,
  handler: SocketHandler,
  options?: { timeoutMs?: number }
) => {
  const timeoutMs = options?.timeoutMs ?? 10000; // default 10s

  socket.on(event, async (...args: any[]) => {
    const maybeCallback = args[args.length - 1];
    const callback =
      typeof maybeCallback === "function" ? maybeCallback : undefined;

    try {
      await Promise.race([
        handler(...args),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Handler timed out")), timeoutMs)
        ),
      ]);
    } catch (error: any) {
      logger.error(
        `Error in [${event}] handler for socket ${socket.id}:`,
        error
      );

      callback?.({
        error: `Internal server error while handling [${event}]`,
      });
    }
  });
};
