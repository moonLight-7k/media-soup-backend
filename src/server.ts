import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { createRouter, createWorker } from "./mediasoup/config.mediasoup";
import { registerMediasoupHandlers } from "./mediasoup/handlers";
import { types as mediasoupTypes } from "mediasoup";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Room } from "./types";
import logger from "./logger";

export const app = express();
const port = process.env.PORT || 3002;
const server = http.createServer(app);

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// log incoming requests
app.use((req, res, next) => {
  logger.info(
    `[API] ${req.method} ${req.originalUrl} - Body: ${JSON.stringify(req.body)}`,
  );
  next();
});

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const mediasoupNamespace = io.of("/mediasoup");

const rooms: Map<string, Room> = new Map();

let worker: mediasoupTypes.Worker<mediasoupTypes.AppData>;
let router: mediasoupTypes.Router<mediasoupTypes.AppData>;

// create a room
app.post("/api/rooms", (req, res) => {
  const { hostName, hostUserId } = req.body;
  if (!hostName || !hostUserId) {
    logger.warn(
      `[API] Room creation failed: missing hostName or hostUserId. Body: ${JSON.stringify(
        req.body,
      )}`,
    );
    return res.status(400).json({
      success: false,
      message: "Host name and host user ID are required",
    });
  }

  const roomId = uuidv4().substring(0, 8);
  hostName;
  const finalHostUserId = hostUserId;

  const room: Room = {
    id: roomId,
    createdBy: hostName,
    hostUserId: finalHostUserId,
    participants: new Map(),
    producers: new Map(),
    consumers: new Map(),
    producerTransports: new Map(),
    consumerTransports: new Map(),
    messages: [],
    createdAt: new Date(),
  };

  rooms.set(roomId, room);

  logger.info(
    `[ROOM] Created: ${roomId} by ${hostName} (${finalHostUserId}) | Total rooms: ${rooms.size}`,
  );

  res.json({
    success: true,
    roomId,
    hostUserId: finalHostUserId,
    message: "Room created successfully",
  });
});

//get room by id
app.get("/api/rooms/:roomId", (req, res) => {
  const { roomId } = req.params;
  if (!roomId) {
    logger.warn(
      `[API] Room details request missing roomId. Params: ${JSON.stringify(
        req.params,
      )}`,
    );
    return res.status(400).json({
      success: false,
      message: "Room ID is required",
    });
  }
  const room = rooms.get(roomId);

  if (!room) {
    logger.warn(`[API] Room details not found for roomId: ${roomId}`);
    return res.status(404).json({
      success: false,
      message: "Room not found",
    });
  }

  logger.info(`[ROOM] Details requested for roomId: ${roomId}`);

  res.json({
    success: true,
    message: "Room found",
    room: {
      id: room.id,
      participantCount: room.participants.size,
      createdAt: room.createdAt,
      createdBy: room.createdBy,
      hostUserId: room.hostUserId,
      participants: Array.from(room.participants.values()).map((p) => ({
        userId: p.userId,
        name: p.name,
        joinedAt: p.joinedAt,
        isHost: p.isHost,
        isOnline: true, // Assuming all participants are online
      })),
    },
  });
});

// list of all rooms
app.get("/api/rooms", (req, res) => {
  const activeRooms = Array.from(rooms.entries()).map(([id, room]) => ({
    id,
    participantCount: room.participants.size,
    createdAt: room.createdAt,
    createdBy: room.createdBy,
    hostUserId: room.hostUserId,
  }));

  res.json({
    success: true,
    rooms: activeRooms,
  });
});

// delete a room by id
app.delete("/api/rooms/:roomId", (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;

  if (!roomId || !userId) {
    logger.warn(
      `[API] Room deletion failed: missing roomId or userId. Params: ${JSON.stringify(
        req.params,
      )}, Body: ${JSON.stringify(req.body)}`,
    );
    return res.status(400).json({
      success: false,
      message: "Room ID and User ID are required",
    });
  }

  const room = rooms.get(roomId);
  if (!room) {
    logger.warn(
      `[API] Room deletion failed: room not found for roomId: ${roomId}`,
    );
    return res.status(404).json({
      success: false,
      message: "Room not found",
    });
  }

  if (room.hostUserId !== userId) {
    logger.warn(
      `[API] Room deletion denied: user ${userId} is not host of room ${roomId}`,
    );
    return res.status(403).json({
      success: false,
      message: "Only the host can delete the room",
    });
  }

  room.producerTransports.forEach((transport) => transport.close());
  room.consumerTransports.forEach((transport) => transport.close());
  room.producers.forEach((producer) => producer.close());
  room.consumers.forEach((consumer) => consumer.close());

  mediasoupNamespace.to(roomId).emit("roomDeleted", {
    roomId,
    message: "Room has been deleted by the host",
  });

  rooms.delete(roomId);
  logger.info(
    `[ROOM] Deleted: ${roomId} by host ${userId} | Remaining rooms: ${rooms.size}`,
  );

  res.json({
    success: true,
    message: "Room deleted successfully",
  });
});

// get rooms by userId
app.get("/api/users/:userId/rooms", (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    logger.warn(
      `[API] User rooms request missing userId. Params: ${JSON.stringify(
        req.params,
      )}`,
    );
    return res.status(400).json({
      success: false,
      message: "User ID is required",
    });
  }

  const userRooms = Array.from(rooms.entries())
    .filter(([_, room]) => {
      return (
        room.hostUserId === userId ||
        Array.from(room.participants.values()).some((p) => p.userId === userId)
      );
    })
    .map(([id, room]) => ({
      id,
      participantCount: room.participants.size,
      createdAt: room.createdAt,
      createdBy: room.createdBy,
      isHost: room.hostUserId === userId,
      isActive: Array.from(room.participants.values()).some(
        (p) => p.userId === userId,
      ),
    }));

  logger.info(
    `[API] User rooms requested for userId: ${userId} | Found: ${userRooms.length}`,
  );

  res.json({
    success: true,
    rooms: userRooms,
  });
});

// init MSoup
(async () => {
  try {
    worker = await createWorker();
    router = await createRouter(worker);
    registerMediasoupHandlers(mediasoupNamespace, worker, router, rooms);
    logger.info("MediaSoup initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize MediaSoup:", error);
    process.exit(1);
  }
})();

// periodic cleanup
// setInterval(() => {
//   let cleanedRooms = 0;

//   for (const [roomId, room] of rooms.entries()) {
//     if (room.participants.size === 0) {
//       const roomAge = Date.now() - room.createdAt.getTime();
//       const roomAgeHours = roomAge / (1000 * 60 * 60);

//       if (roomAgeHours >= 1) {
//         room.producerTransports.forEach((transport) => transport.close());
//         room.consumerTransports.forEach((transport) => transport.close());
//         room.producers.forEach((producer) => producer.close());
//         room.consumers.forEach((consumer) => consumer.close());

//         rooms.delete(roomId);
//         cleanedRooms++;
//         logger.info(
//           `[ROOM] Periodic cleanup: deleted empty room ${roomId} (age: ${roomAgeHours.toFixed(
//             2
//           )} hours) | Remaining rooms: ${rooms.size}`
//         );
//       }
//     }
//   }

//   if (cleanedRooms > 0) {
//     logger.info(
//       `[CLEANUP] Removed ${cleanedRooms} empty rooms | Current room count: ${rooms.size}`
//     );
//   }
// }, 60000);

// setInterval(() => {
//   const activeRoomsCount = rooms.size;
//   const totalParticipants = Array.from(rooms.values()).reduce(
//     (sum, room) => sum + room.participants.size,
//     0
//   );

//   logger.info(
//     `Active rooms: ${activeRoomsCount}, Total participants: ${totalParticipants}`
//   );
// }, 5000);

server.listen(port, () => {
  logger.info(`Server running at http://localhost:${port}`);
  logger.info(`MediaSoup namespace available at /mediasoup`);
});
