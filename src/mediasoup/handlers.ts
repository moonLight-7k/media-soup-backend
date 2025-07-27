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
    // Extract userId and userName from connection query
    const { userId: clientUserId, userName: clientUserName } = socket.handshake.query;

    logger.info(`[SOCKET] Peer connected: ${socket.id}, ClientUserId: ${clientUserId}, UserName: ${clientUserName}`);

    let currentRoom: Room | null = null;
    let currentUserId: string | null = null;
    let currentUserName: string | null = null;

    // Store user info on socket for easy access
    socket.data.userId = clientUserId as string;
    socket.data.userName = clientUserName as string;

    socket.emit("connection-success", {
      socketId: socket.id,
      userId: clientUserId,
      userName: clientUserName,
    });

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

      logger.info(`[SOCKET] ${socket.id} attempting to join room: ${roomId} as ${userName || "Anonymous"}`);

      const room = rooms.get(roomId);
      if (!room) {
        return callback({ error: "Room not found" });
      }

      // Use provided userId or generate new one
      const finalUserId = userId || uuidv4();
      const finalUserName = userName || "Anonymous";

      currentUserId = finalUserId;
      currentUserName = finalUserName;
      currentRoom = room;

      // Update socket data
      socket.data.userId = finalUserId;
      socket.data.userName = finalUserName;

      // Check if user is already in room (reconnection case)
      let existingParticipant = null;
      for (const [socketId, participant] of room.participants.entries()) {
        if (participant.userId === finalUserId) {
          existingParticipant = participant;
          // Remove old socket entry
          room.participants.delete(socketId);
          logger.warn(`[ROOM] Duplicate join detected for userId: ${finalUserId} in room: ${roomId}`);
          break;
        }
      }

      // Determine if user is host
      const isHost =
        existingParticipant?.isHost || room.participants.size === 0;

      // Add participant to room with new socket ID
      room.participants.set(socket.id, {
        socketId: socket.id,
        userId: finalUserId,
        name: finalUserName,
        joinedAt: existingParticipant?.joinedAt || new Date(),
        isHost,
      });

      // Join socket room
      socket.join(roomId);

      // Get existing producers in the room (exclude own producers)
      const existingProducers = Array.from(room.producers.entries())
        .filter(([key]) => {
          const [socketId] = key.split("-");
          const participant = room.participants.get(socketId);
          return participant && participant.userId !== finalUserId;
        })
        .map(([key, producer]) => {
          const [socketId] = key.split("-");
          const participant = room.participants.get(socketId);
          return {
            producerId: producer.id,
            socketId: socketId,
            userId: participant?.userId,
            kind: producer.kind,
          };
        });

      // Notify others about peer joined/rejoined
      socket.to(roomId).emit("peer-joined", {
        socketId: socket.id,
        userId: finalUserId,
        userName: finalUserName,
        isHost,
        isReconnection: !!existingParticipant,
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

      logger.info(`[ROOM] ${finalUserName} (${finalUserId}) joined room ${roomId} as ${isHost ? "host" : "participant"}. Total participants: ${room.participants.size}`);
      logger.debug(`[ROOM] State after join: ${JSON.stringify({ id: roomId, participants: Array.from(room.participants.values()) })}`);
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

      // Close existing producer of same kind for this socket
      const existingProducerKey = `${socket.id}-${kind}`;
      const existingProducer = currentRoom.producers.get(existingProducerKey);
      if (existingProducer) {
        existingProducer.close();
        currentRoom.producers.delete(existingProducerKey);
      }

      const producer = await transport.produce({ kind, rtpParameters });
      currentRoom.producers.set(existingProducerKey, producer);

      producer.on("transportclose", () => {
        logger.info(`Producer transport closed: ${producer.id}`);
        producer.close();
        currentRoom?.producers.delete(existingProducerKey);
      });

      // Notify others about new producer
      socket.to(currentRoom.id).emit("newProducer", {
        producerId: producer.id,
        socketId: socket.id,
        userId: currentUserId,
        kind: producer.kind,
      });

      callback({ id: producer.id });

      logger.info(
        `Producer created: ${producer.id} (${kind}) for ${socket.id} (User: ${currentUserId})`
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

        const consumerKey = `${socket.id}-${producerId}`;
        currentRoom.consumers.set(consumerKey, consumer);

        consumer.on("transportclose", () => {
          logger.info(`Consumer transport closed: ${consumer.id}`);
          consumer.close();
          currentRoom?.consumers.delete(consumerKey);
        });

        consumer.on("producerclose", () => {
          logger.info(`Producer closed for consumer: ${consumer.id}`);
          consumer.close();
          currentRoom?.consumers.delete(consumerKey);
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
        .filter(([key]) => {
          const [socketId] = key.split("-");
          const participant = currentRoom!.participants.get(socketId);
          // Exclude own producers based on userId, not socketId
          return participant && participant.userId !== currentUserId;
        })
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
    wrapHandler("disconnect", (reason) => {
      logger.info(`[SOCKET] Peer disconnected: ${socket.id} (Reason: ${reason})`);

      if (currentRoom && currentUserId) {
        const participant = currentRoom.participants.get(socket.id);

        // Clean up transports for this socket
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

        // Clean up producers for this socket
        const socketProducers = Array.from(
          currentRoom.producers.entries()
        ).filter(([key]) => key.startsWith(socket.id));

        socketProducers.forEach(([key, producer]) => {
          producer.close();
          currentRoom!.producers.delete(key);
          socket.to(currentRoom!.id).emit("producerClosed", {
            producerId: producer.id,
            socketId: socket.id,
            userId: currentUserId,
          });
        });

        // Clean up consumers for this socket
        const socketConsumers = Array.from(
          currentRoom.consumers.entries()
        ).filter(([key]) => key.startsWith(socket.id));

        socketConsumers.forEach(([key, consumer]) => {
          consumer.close();
          currentRoom!.consumers.delete(key);
        });

        // Remove participant from room
        currentRoom.participants.delete(socket.id);

        // Notify others about peer leaving
        socket.to(currentRoom.id).emit("peerLeft", {
          socketId: socket.id,
          userId: currentUserId,
          userName: participant?.name,
        });

        logger.info(`[ROOM] ${participant?.name} (${currentUserId}) left room ${currentRoom.id}. Remaining participants: ${currentRoom.participants.size}`);
        logger.debug(`[ROOM] State after leave: ${JSON.stringify({ id: currentRoom.id, participants: Array.from(currentRoom.participants.values()) })}`);

        // Clean up room if empty
        if (currentRoom.participants.size === 0) {
          // Close all remaining resources
          currentRoom.producerTransports.forEach((transport) =>
            transport.close()
          );
          currentRoom.consumerTransports.forEach((transport) =>
            transport.close()
          );
          currentRoom.producers.forEach((producer) => producer.close());
          currentRoom.consumers.forEach((consumer) => consumer.close());

          // rooms.delete(currentRoom.id);
          logger.info(`[ROOM] Deleted: ${currentRoom.id} (empty after disconnect)`);
        }

        logger.info(`[SOCKET] Cleaned up resources for ${socket.id} (User: ${currentUserId}) in room ${currentRoom.id}`);
      }
    });
  });
};
