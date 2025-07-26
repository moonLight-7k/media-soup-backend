import { Server } from "socket.io";
import { types as mediasoupTypes } from "mediasoup";
import { createWebRtcTransport } from "./transport";
import logger from "../logger";
import { v4 as uuidv4 } from "uuid";
import { Room } from "../types";

export const registerMediasoupHandlers = (
  io: ReturnType<Server["of"]>,
  worker: mediasoupTypes.Worker<mediasoupTypes.AppData>,
  router: mediasoupTypes.Router<mediasoupTypes.AppData>,
  rooms: Map<string, Room>
) => {
  io.on("connection", async (socket) => {
    logger.info(`Peer connected: ${socket.id}`);

    let currentRoom: Room | null = null;
    let currentUserId: string | null = null;

    socket.emit("connection-success", { socketId: socket.id });

    // Wrap all event handlers in a global try-catch to prevent crashes
    const wrapHandler = (event: string, handler: (...args: any[]) => void) => {
      socket.on(event, async (...args) => {
        try {
          await handler(...args);
        } catch (error: any) {
          logger.error(
            `Error in ${event} handler for socket ${socket.id}: ${error.message}`
          );
          // If the last argument is a callback, invoke it with an error
          const callback = args[args.length - 1];
          if (typeof callback === "function") {
            callback({ error: `Server error in ${event}: ${error.message}` });
          }
        }
      });
    };

    // Join Room Handler
    wrapHandler("joinRoom", async ({ roomId, userName, userId }, callback) => {
      if (typeof callback !== "function") {
        logger.warn(
          `No valid callback provided for joinRoom from ${socket.id}`
        );
        return;
      }

      logger.info(`Socket ${socket.id} attempting to join room: ${roomId}`);

      const room = rooms.get(roomId);
      if (!room) {
        return callback({ error: "Room not found" });
      }

      // Generate userId if not provided
      const finalUserId = userId || uuidv4();
      currentUserId = finalUserId;
      currentRoom = room;

      // Add participant to room
      const isHost = room.participants.size === 0;
      room.participants.set(socket.id, {
        socketId: socket.id,
        userId: finalUserId,
        name: userName,
        joinedAt: new Date(),
        isHost,
      });

      // Join socket room
      socket.join(roomId);

      // Get existing producers in the room
      const existingProducers = Array.from(room.producers.entries())
        .filter(([producerSocketId]) => producerSocketId !== socket.id)
        .map(([producerSocketId, producer]) => ({
          producerId: producer.id,
          socketId: producerSocketId,
          kind: producer.kind,
          userId: room.participants.get(producerSocketId)?.userId,
        }));

      // Notify others about new peer
      socket.to(roomId).emit("peer-joined", {
        socketId: socket.id,
        userId: finalUserId,
        userName,
        isHost,
      });

      // Send success response with room info
      callback({
        success: true,
        roomId,
        userId: finalUserId,
        isHost,
        participants: Array.from(room.participants.values()),
        existingProducers,
        messages: room.messages.slice(-50),
      });

      logger.info(`Socket ${socket.id} joined room ${roomId} as ${userName}`);
    });

    // Chat Message Handler
    wrapHandler("sendMessage", ({ roomId, message }, callback) => {
      if (typeof callback !== "function") {
        logger.warn(
          `No valid callback provided for sendMessage from ${socket.id}`
        );
        return;
      }

      if (!currentRoom || !currentUserId || currentRoom.id !== roomId) {
        return callback({ error: "Not in room" });
      }

      const participant = currentRoom.participants.get(socket.id);
      if (!participant) {
        return callback({ error: "Participant not found" });
      }

      const messageData = {
        id: uuidv4(),
        userId: currentUserId,
        userName: participant.name,
        message,
        timestamp: new Date(),
      };

      currentRoom.messages.push(messageData);

      // Broadcast message to all participants in room
      io.to(roomId).emit("newMessage", messageData);

      callback({ success: true, messageId: messageData.id });

      logger.debug(`Message sent in room ${roomId} by ${participant.name}`);
    });

    // Get Router RTP Capabilities
    wrapHandler("getRouterRtpCapabilities", (callback) => {
      if (typeof callback !== "function") {
        logger.warn(
          `No valid callback provided for getRouterRtpCapabilities from ${socket.id}`
        );
        return;
      }

      callback({ rtpCapabilities: router.rtpCapabilities });
      logger.debug(`Sent RTP capabilities to ${socket.id}`);
    });

    // Create Producer Transport
    wrapHandler("createProducerTransport", async (callback) => {
      if (typeof callback !== "function") {
        logger.warn(
          `No valid callback provided for createProducerTransport from ${socket.id}`
        );
        return;
      }

      if (!currentRoom) {
        return callback({ error: "Not in a room" });
      }

      const transport = await createWebRtcTransport(router, (params) => {
        if ("error" in params) {
          return callback({ error: "Failed to create transport" });
        }
        callback(params);
      });

      if (transport) {
        currentRoom.producerTransports.set(socket.id, transport);

        transport.on("dtlsstatechange", (dtlsState) => {
          logger.debug(`Producer transport DTLS state: ${dtlsState}`);
          if (dtlsState === "closed") {
            transport.close();
            currentRoom?.producerTransports.delete(socket.id);
          }
        });

        transport.on("@close", () => {
          logger.info(`Producer transport closed for ${socket.id}`);
        });

        logger.info(`Producer transport created for ${socket.id}`);
      }
    });

    // Create Consumer Transport
    wrapHandler("createConsumerTransport", async (callback) => {
      if (typeof callback !== "function") {
        logger.warn(
          `No valid callback provided for createConsumerTransport from ${socket.id}`
        );
        return;
      }

      if (!currentRoom) {
        return callback({ error: "Not in a room" });
      }

      const transport = await createWebRtcTransport(router, (params) => {
        if ("error" in params) {
          return callback({ error: "Failed to create transport" });
        }
        callback(params);
      });

      if (transport) {
        currentRoom.consumerTransports.set(socket.id, transport);

        transport.on("dtlsstatechange", (dtlsState) => {
          logger.debug(`Consumer transport DTLS state: ${dtlsState}`);
          if (dtlsState === "closed") {
            transport.close();
            currentRoom?.consumerTransports.delete(socket.id);
          }
        });

        transport.on("@close", () => {
          logger.info(`Consumer transport closed for ${socket.id}`);
        });

        logger.info(`Consumer transport created for ${socket.id}`);
      }
    });

    // Connect Producer Transport
    wrapHandler(
      "connectProducerTransport",
      async ({ dtlsParameters }, callback) => {
        if (typeof callback !== "function") {
          logger.warn(
            `No valid callback provided for connectProducerTransport from ${socket.id}`
          );
          return;
        }

        if (!currentRoom) {
          return callback({ error: "Not in a room" });
        }

        const transport = currentRoom.producerTransports.get(socket.id);
        if (!transport) {
          return callback({ error: "Producer transport not found" });
        }

        await transport.connect({ dtlsParameters });
        callback({ success: true });

        logger.debug(`Producer transport connected for ${socket.id}`);
      }
    );

    // Connect Consumer Transport
    wrapHandler(
      "connectConsumerTransport",
      async ({ dtlsParameters }, callback) => {
        if (typeof callback !== "function") {
          logger.warn(
            `No valid callback provided for connectConsumerTransport from ${socket.id}`
          );
          return;
        }

        if (!currentRoom) {
          return callback({ error: "Not in a room" });
        }

        const transport = currentRoom.consumerTransports.get(socket.id);
        if (!transport) {
          return callback({ error: "Consumer transport not found" });
        }

        await transport.connect({ dtlsParameters });
        callback({ success: true });

        logger.debug(`Consumer transport connected for ${socket.id}`);
      }
    );

    // Produce Media
    wrapHandler("produce", async ({ kind, rtpParameters }, callback) => {
      if (typeof callback !== "function") {
        logger.warn(`No valid callback provided for produce from ${socket.id}`);
        return;
      }

      if (!currentRoom) {
        return callback({ error: "Not in a room" });
      }

      const transport = currentRoom.producerTransports.get(socket.id);
      if (!transport) {
        return callback({ error: "Producer transport not found" });
      }

      const producer = await transport.produce({ kind, rtpParameters });
      currentRoom.producers.set(`${socket.id}-${kind}`, producer);

      producer.on("transportclose", () => {
        logger.info(`Producer transport closed: ${producer.id}`);
        producer.close();
        currentRoom?.producers.delete(`${socket.id}-${kind}`);
      });

      socket.to(currentRoom.id).emit("newProducer", {
        producerId: producer.id,
        socketId: socket.id,
        userId: currentUserId,
        kind: producer.kind,
      });

      callback({ id: producer.id });

      logger.info(
        `Producer created: ${producer.id} (${kind}) for ${socket.id}`
      );
    });

    // Consume Media
    wrapHandler(
      "consume",
      async ({ producerId, rtpCapabilities }, callback) => {
        if (typeof callback !== "function") {
          logger.warn(
            `No valid callback provided for consume from ${socket.id}`
          );
          return;
        }

        if (!currentRoom) {
          return callback({ error: "Not in a room" });
        }

        if (!router.canConsume({ producerId, rtpCapabilities })) {
          return callback({ error: "Cannot consume this producer" });
        }

        const transport = currentRoom.consumerTransports.get(socket.id);
        if (!transport) {
          return callback({ error: "Consumer transport not found" });
        }

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: true,
        });

        currentRoom.consumers.set(`${socket.id}-${producerId}`, consumer);

        consumer.on("transportclose", () => {
          logger.info(`Consumer transport closed: ${consumer.id}`);
          consumer.close();
          currentRoom?.consumers.delete(`${socket.id}-${producerId}`);
        });

        consumer.on("producerclose", () => {
          logger.info(`Producer closed for consumer: ${consumer.id}`);
          consumer.close();
          currentRoom?.consumers.delete(`${socket.id}-${producerId}`);
          socket.emit("producerClosed", { producerId });
        });

        callback({
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });

        logger.info(
          `Consumer created: ${consumer.id} for producer ${producerId}`
        );
      }
    );

    // Resume Consumer
    wrapHandler("resumeConsumer", async ({ consumerId }, callback) => {
      if (typeof callback !== "function") {
        logger.warn(
          `No valid callback provided for resumeConsumer from ${socket.id}`
        );
        return;
      }

      const consumer = Array.from(currentRoom?.consumers.values() || []).find(
        (c) => c.id === consumerId
      );

      if (!consumer) {
        return callback({ error: "Consumer not found" });
      }

      await consumer.resume();
      callback({ success: true });

      logger.debug(`Consumer resumed: ${consumerId}`);
    });

    // Pause Consumer
    wrapHandler("pauseConsumer", async ({ consumerId }, callback) => {
      if (typeof callback !== "function") {
        logger.warn(
          `No valid callback provided for pauseConsumer from ${socket.id}`
        );
        return;
      }

      const consumer = Array.from(currentRoom?.consumers.values() || []).find(
        (c) => c.id === consumerId
      );

      if (!consumer) {
        return callback({ error: "Consumer not found" });
      }

      await consumer.pause();
      callback({ success: true });

      logger.debug(`Consumer paused: ${consumerId}`);
    });

    // Get Producers
    wrapHandler("getProducers", (callback) => {
      if (typeof callback !== "function") {
        logger.warn(
          `No valid callback provided for getProducers from ${socket.id}`
        );
        return;
      }

      if (!currentRoom) {
        return callback({ error: "Not in a room" });
      }

      const producers = Array.from(currentRoom.producers.entries())
        .filter(([key]) => !key.startsWith(socket.id))
        .map(([key, producer]) => {
          const [socketId] = key.split("-");
          const participant = currentRoom!.participants.get(socketId);
          return {
            producerId: producer.id,
            socketId,
            userId: participant?.userId,
            userName: participant?.name,
            kind: producer.kind,
          };
        });

      callback({ producers });

      logger.debug(
        `Sent producers list to ${socket.id}: ${producers.length} producers`
      );
    });

    // Handle Disconnect
    wrapHandler("disconnect", () => {
      logger.info(`Peer disconnected: ${socket.id}`);

      if (currentRoom && currentUserId) {
        const participant = currentRoom.participants.get(socket.id);
        currentRoom.participants.delete(socket.id);

        const producerTransport = currentRoom.producerTransports.get(socket.id);
        if (producerTransport) {
          producerTransport.close();
          currentRoom.producerTransports.delete(socket.id);
        }

        const consumerTransport = currentRoom.consumerTransports.get(socket.id);
        if (consumerTransport) {
          consumerTransport.close();
          currentRoom.consumerTransports.delete(socket.id);
        }

        Array.from(currentRoom.producers.entries()).forEach(
          ([key, producer]) => {
            if (key.startsWith(socket.id)) {
              producer.close();
              currentRoom!.producers.delete(key);
              socket.to(currentRoom!.id).emit("producerClosed", {
                producerId: producer.id,
                socketId: socket.id,
                userId: currentUserId,
              });
            }
          }
        );

        Array.from(currentRoom.consumers.entries()).forEach(
          ([key, consumer]) => {
            if (key.startsWith(socket.id)) {
              consumer.close();
              currentRoom!.consumers.delete(key);
            }
          }
        );

        socket.to(currentRoom.id).emit("peerLeft", {
          socketId: socket.id,
          userId: currentUserId,
          userName: participant?.name,
        });

        // Clean up room if empty
        if (currentRoom.participants.size === 0) {
          rooms.delete(currentRoom.id);
          logger.info(`Room ${currentRoom.id} deleted as it is empty`);
        }

        logger.info(
          `Cleaned up resources for ${socket.id} in room ${currentRoom.id}`
        );
      }
    });
  });
};
