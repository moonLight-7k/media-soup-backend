import request from "supertest";
import { Server } from "socket.io";
import { createServer } from "http";
import { app } from "../src/server";
import { registerMediasoupHandlers } from "../src/mediasoup/handlers";
import { createRouter, createWorker } from "../src//mediasoup/config.mediasoup";
import { v4 as uuidv4 } from "uuid";

jest.mock("../src/mediasoup/config.mediasoup");
jest.mock("uuid");
jest.mock("../src/mediasoup/handlers");

describe("MediaSoup Server", () => {
  let server: any;
  let io: Server;

  beforeAll((done) => {
    server = createServer(app);
    io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });
    server.listen(() => done());
  });

  afterAll((done) => {
    server.close(() => done());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (createWorker as jest.Mock).mockResolvedValue({
      createRouter: jest.fn().mockResolvedValue({
        rtpCapabilities: { codecs: [], headerExtensions: [] },
        canConsume: jest.fn().mockReturnValue(true),
      }),
    });
    (uuidv4 as jest.Mock).mockReturnValue("12345678");
  });

  describe("API Endpoints", () => {
    describe("POST /api/rooms", () => {
      it("should create a new room successfully", async () => {
        const response = await request(app)
          .post("/api/rooms")
          .send({ hostName: "TestHost" })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          roomId: "12345678",
          message: "Room created successfully",
        });
      });
    });

    describe("GET /api/rooms/:roomId", () => {
      it("should return room details if room exists", async () => {
        await request(app).post("/api/rooms").send({ hostName: "TestHost" });

        const response = await request(app)
          .get("/api/rooms/12345678")
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.room).toHaveProperty("id", "12345678");
        expect(response.body.room).toHaveProperty("participantCount", 0);
      });

      it("should return 404 if room does not exist", async () => {
        const response = await request(app)
          .get("/api/rooms/nonexistent")
          .expect(404);

        expect(response.body).toEqual({
          success: false,
          message: "Room not found",
        });
      });
    });

    describe("GET /api/rooms", () => {
      it("should return list of active rooms", async () => {
        await request(app).post("/api/rooms").send({ hostName: "TestHost" });

        const response = await request(app).get("/api/rooms").expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.rooms).toHaveLength(1);
        expect(response.body.rooms[0]).toHaveProperty("id", "12345678");
      });
    });
  });

  describe("Socket.IO Handlers", () => {
    let socket: any;
    let mockRoom: any;

    beforeEach(() => {
      socket = {
        id: "socket1",
        emit: jest.fn(),
        join: jest.fn(),
        to: jest.fn().mockReturnValue({ emit: jest.fn() }),
        on: jest.fn(),
      };

      mockRoom = {
        id: "12345678",
        participants: new Map(),
        producers: new Map(),
        consumers: new Map(),
        producerTransports: new Map(),
        consumerTransports: new Map(),
        messages: [],
        createdAt: new Date(),
      };

      const rooms = new Map([["12345678", mockRoom]]);
      (registerMediasoupHandlers as jest.Mock).mockImplementation(
        (io, worker, router, roomsMap) => {
          io.on("connection", (s: any) => {
            socket = s;
            s.emit("connection-success", { socketId: s.id });
            s.on.mockImplementation((event: string, handler: Function) => {
              s[event] = handler;
            });
          });
        }
      );

      (createWorker as jest.Mock).mockResolvedValue({
        createRouter: jest.fn().mockResolvedValue({
          rtpCapabilities: { codecs: [], headerExtensions: [] },
          canConsume: jest.fn().mockReturnValue(true),
        }),
      });

      registerMediasoupHandlers(
        io.of("/mediasoup"),
        {} as any,
        {} as any,
        rooms
      );
    });

    it("should handle joinRoom event", (done) => {
      const callback = jest.fn();
      socket.joinRoom(
        { roomId: "12345678", userName: "TestUser", userId: "user1" },
        callback
      );

      setTimeout(() => {
        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            roomId: "12345678",
            userId: "user1",
            isHost: true,
            participants: [],
            existingProducers: [],
            messages: [],
          })
        );
      }, 100);
    });
  });
  it("should handle joinRoom event with existing room", (done) => {
    const callback = jest.fn();
    socket.joinRoom(
      { roomId: "12345678", userName: "TestUser", userId: "user1" },
      callback
    );
    setTimeout(() => {
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          roomId: "12345678",
          userId: "user1",
          isHost: true,
          participants: [],
          existingProducers: [],
          messages: [],
        })
      );
    }, 100);
  });
});

it("should handle joinRoom event with existing room", (done) => {
  const callback = jest.fn();
  socket.joinRoom(
    { roomId: "12345678", userName: "TestUser", userId: "user1" },
    callback
  );

  setTimeout(() => {
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        roomId: "12345678",
        userId: "user1",
        isHost: true,
        participants: [],
        existingProducers: [],
        messages: [],
      })
    );
    done();
  }, 100);
});
