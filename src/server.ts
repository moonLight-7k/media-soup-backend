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

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Socket.IO namespace for MediaSoup
const mediasoupNamespace = io.of("/mediasoup");

const rooms: Map<string, Room> = new Map();

let worker: mediasoupTypes.Worker<mediasoupTypes.AppData>;
let router: mediasoupTypes.Router<mediasoupTypes.AppData>;

// [CREATE ROOM ENDPOINT]
app.post("/api/rooms", (req, res) => {
  const { hostName } = req.body;
  if (!hostName) {
    return res.status(400).json({
      success: false,
      message: "Host name is required",
    });
  }
  const roomId = uuidv4().substring(0, 8); // Short room ID

  const room: Room = {
    id: roomId,
    createdBy: hostName,
    participants: new Map(),
    producers: new Map(),
    consumers: new Map(),
    producerTransports: new Map(),
    consumerTransports: new Map(),
    messages: [],
    createdAt: new Date(),
  };

  rooms.set(roomId, room);

  res.json({
    success: true,
    roomId,
    message: "Room created successfully",
  });
});

// [GET ROOM DETAILS /w ID ENDPOactiveRoomsINT]
app.get("/api/rooms/:roomId", (req, res) => {
  const { roomId } = req.params;
  if (!roomId) {
    return res.status(400).json({
      success: false,
      message: "Room ID is required",
    });
  }
  const room = rooms.get(roomId);

  if (!room) {
    return res.status(404).json({
      success: false,
      message: "Room not found",
    });
  }

  res.json({
    success: true,
    message: "Room found",
    room: {
      id: room.id,
      participantCount: room.participants.size,
      createdAt: room.createdAt,
      participants: Array.from(room.participants.values()).map((p) => ({
        userId: p.userId,
        name: p.name,
        joinedAt: p.joinedAt,
        isHost: p.isHost,
      })),
    },
  });
});

// [GET ALL ACTIVE ROOMS ENDPOINT]
app.get("/api/rooms", (req, res) => {
  const activeRooms = Array.from(rooms.entries()).map(([id, room]) => ({
    id,
    participantCount: room.participants.size,
    createdAt: room.createdAt,
    createdBy: room.createdBy,
    
  }));

  res.json({
    success: true,
    rooms: activeRooms,
  });
});

// Initialize MediaSoup
(async () => {
  try {
    worker = await createWorker();
    router = await createRouter(worker);
    await registerMediasoupHandlers(mediasoupNamespace, worker, router, rooms);
    logger.info("MediaSoup initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize MediaSoup:", error);
    process.exit(1);
  }
})();

// Clean up empty rooms periodically
// setInterval(() => {
//   for (const [roomId, room] of rooms.entries()) {
//     if (room.participants.size === 0) {
//       // Close all transports and producers
//       room.producerTransports.forEach((transport) => transport.close());
//       room.consumerTransports.forEach((transport) => transport.close());
//       room.producers.forEach((producer) => producer.close());
//       room.consumers.forEach((consumer) => consumer.close());

//       rooms.delete(roomId);
//       logger.info(`Cleaned up empty room: ${roomId}`);
//     }
//   }
// }, 60000); // Check every 60 seconds

server.listen(port, () => {
  logger.info(`Server running at http://localhost:${port}`);
  logger.info(`MediaSoup namespace available at /mediasoup`);
});
