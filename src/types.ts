import { types as mediasoupTypes } from "mediasoup";

// Room management
export interface Room {
  id: string;
  hostUserId: string; // UUID of the host
  createdBy: string;
  participants: Map<
    string,
    {
      socketId: string;
      userId: string;
      name: string;
      joinedAt: Date;
      isHost: boolean;
    }
  >;
  producers: Map<string, mediasoupTypes.Producer>;
  consumers: Map<string, mediasoupTypes.Consumer>;
  producerTransports: Map<string, mediasoupTypes.WebRtcTransport>;
  consumerTransports: Map<string, mediasoupTypes.WebRtcTransport>;
  messages: Array<{
    id: string;
    userId: string;
    userName: string;
    message: string;
    timestamp: Date;
  }>;
  createdAt: Date;
}

export type SocketHandler = (...args: any[]) => Promise<void> | void;
