# G-Meet Server API Documentation

## Overview

This server provides RESTful and WebSocket (Socket.IO) APIs for real-time video/audio rooms using mediasoup. Below are the available endpoints and events.

---

## REST API Endpoints

### 1. Create Room

Base_URL=<http://localhost:3002>

**POST** `/api/rooms`

**Request Body:**

```json
{
  "hostName": "string"
}
```

**Response:**

```json
{
  "success": true,
  "roomId": "string",
  "message": "Room created successfully"
}
```

---

### 2. Get Room Info

**GET** `/api/rooms/:roomId`

**Response:**

```json
{
  "success": true,
  "room": {
    "id": "string",
    "participantCount": number,
    "createdAt": "ISODate",
    "participants": [
      {
        "userId": "string",
        "name": "string",
        "joinedAt": "ISODate",
        "isHost": true/false
      }
    ]
  }
}
```

---

### 3. List Active Rooms

**GET** `/api/rooms`

**Response:**

```json
{
  "success": true,
  "rooms": [
    {
      "id": "string",
      "participantCount": number,
      "createdAt": "ISODate"
    }
  ]
}
```

---

## Socket.IO Events (`/mediasoup` namespace)

### Connection

- `connection-success`: Sent on successful connection. `{ socketId }`

### Room Management

- `joinRoom`: Join a room. `{ roomId, userName, userId? }`
  - **Response:** `{ success, roomId, userId, isHost, participants, existingProducers, messages }`
- `peer-joined`: Notifies others when a peer joins. `{ socketId, userId, userName, isHost }`
- `peerLeft`: Notifies others when a peer leaves. `{ socketId, userId, userName }`

### Messaging

- `sendMessage`: Send a chat message. `{ roomId, message }`
  - **Response:** `{ success, messageId }`
- `newMessage`: Broadcasts a new message. `{ id, userId, userName, message, timestamp }`

### Mediasoup Signaling

- `getRouterRtpCapabilities`: Get RTP capabilities. **Response:** `{ rtpCapabilities }`
- `createProducerTransport`: Create transport for producing media.
- `connectProducerTransport`: Connect producer transport. `{ dtlsParameters }`
- `produce`: Start producing media. `{ kind, rtpParameters }`
  - **Response:** `{ id }`
- `createConsumerTransport`: Create transport for consuming media.
- `connectConsumerTransport`: Connect consumer transport. `{ dtlsParameters }`
- `consume`: Consume media. `{ producerId, rtpCapabilities }`
  - **Response:** `{ id, producerId, kind, rtpParameters }`
- `resumeConsumer`: Resume a consumer. `{ consumerId }`
- `pauseConsumer`: Pause a consumer. `{ consumerId }`
- `getProducers`: Get list of producers in the room. **Response:** `{ producers }`
- `producerClosed`: Notifies when a producer is closed. `{ producerId, socketId, userId }`
- `newProducer`: Notifies about a new producer. `{ producerId, socketId, userId, kind }`

---

## Room Object Structure

```typescript
Room {
  id: string;
  participants: Map<string, {
    socketId: string;
    userId: string;
    name: string;
    joinedAt: Date;
    isHost: boolean;
  }>;
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
```

---

## Notes

- All REST endpoints return JSON.
- Socket.IO events use callbacks for responses/errors.
- Room cleanup is automatic for empty rooms.

---

For more details, see the source code or contact the maintainer.
