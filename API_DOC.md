# G-Meet Video Conferencing API Documentation

## Overview

This document provides comprehensive documentation for the G-Meet backend API, a WebRTC-based video conferencing service built with MediaSoup. The API supports room management, real-time video/audio communication, and text messaging through both RESTful endpoints and Socket.IO events.

---

## REST API Endpoints

All REST API endpoints return JSON responses with a `success` boolean indicating whether the operation succeeded.

Base URL: `http://localhost:3002` (configurable via PORT environment variable)

### 1. Create Room

**Endpoint:** `POST /api/rooms`

Creates a new video conference room.

**Request Body:**
```json
{
  "hostName": "string",    // Required: Name of the room host
  "hostUserId": "string"   // Optional: User ID for the host (generated if not provided)
}
```

**Response:**
```json
{
  "success": true,
  "roomId": "string",      // 8-character unique room identifier
  "hostUserId": "string",  // UUID of the host (generated or provided)
  "message": "Room created successfully"
}
```

**Status Codes:**
- `200 OK`: Room created successfully
- `400 Bad Request`: Missing required fields

---

### 2. Get Room Details

**Endpoint:** `GET /api/rooms/:roomId`

Retrieves detailed information about a specific room.

**Path Parameters:**
- `roomId`: The unique identifier of the room

**Response:**
```json
{
  "success": true,
  "message": "Room found",
  "room": {
    "id": "string",
    "participantCount": 0,
    "createdAt": "2025-07-27T12:00:00Z",
    "createdBy": "string",
    "hostUserId": "string",
    "participants": [
      {
        "userId": "string",
        "name": "string",
        "joinedAt": "2025-07-27T12:05:00Z",
        "isHost": true,
        "isOnline": true
      }
    ]
  }
}
```

**Status Codes:**
- `200 OK`: Room found
- `404 Not Found`: Room does not exist
- `400 Bad Request`: Missing roomId

---

### 3. List All Active Rooms

**Endpoint:** `GET /api/rooms`

Returns a list of all currently active rooms on the server.

**Response:**
```json
{
  "success": true,
  "rooms": [
    {
      "id": "string",
      "participantCount": 0,
      "createdAt": "2025-07-27T12:00:00Z",
      "createdBy": "string",
      "hostUserId": "string"
    }
  ]
}
```

**Status Codes:**
- `200 OK`: Request successful

---

### 4. Delete Room

**Endpoint:** `DELETE /api/rooms/:roomId`

Deletes a room and all associated resources. Only the host can delete a room.

**Path Parameters:**
- `roomId`: The unique identifier of the room

**Request Body:**
```json
{
  "userId": "string"  // Required: Host's userId to verify permission
}
```

**Response:**
```json
{
  "success": true,
  "message": "Room deleted successfully"
}
```

**Status Codes:**
- `200 OK`: Room deleted successfully
- `400 Bad Request`: Missing roomId or userId
- `403 Forbidden`: User is not the host of the room
- `404 Not Found`: Room not found

---

### 5. Get User's Rooms

**Endpoint:** `GET /api/users/:userId/rooms`

Retrieves all rooms where a user is either a host or participant.

**Path Parameters:**
- `userId`: The unique identifier of the user

**Response:**
```json
{
  "success": true,
  "rooms": [
    {
      "id": "string",
      "participantCount": 0,
      "createdAt": "2025-07-27T12:00:00Z",
      "createdBy": "string",
      "isHost": true,
      "isActive": true
    }
  ]
}
```

**Status Codes:**
- `200 OK`: Request successful
- `400 Bad Request`: Missing userId

---

## Socket.IO Events

All events use the `/mediasoup` namespace. Events marked with (C→S) are emitted by clients to the server, and events marked with (S→C) are emitted by the server to clients.

### Connection Events

#### `connection` (C→S)
Triggered when a client connects to the Socket.IO server on the `/mediasoup` namespace.

#### `connection-success` (S→C)
Sent after successful connection to the server.

**Response Data:**
```javascript
{
  socketId: "string"  // Client's Socket.IO ID
}
```

### Room Management Events

#### `joinRoom` (C→S)
Join an existing room.

**Request Data:**
```javascript
{
  roomId: "string",    // Required: Room ID to join
  userName: "string",  // Required: User's display name
  userId: "string"     // Optional: User ID (generated if not provided)
}
```

**Response Data (via callback):**
```javascript
{
  success: true,
  roomId: "string",
  userId: "string",
  isHost: false,       // Whether the user is the host of the room
  participants: [      // List of participants in the room
    {
      socketId: "string",
      userId: "string",
      name: "string",
      joinedAt: "2025-07-27T12:05:00Z",
      isHost: false
    }
  ],
  existingProducers: [ // List of active media producers in the room
    {
      producerId: "string",
      socketId: "string",
      userId: "string",
      userName: "string",
      kind: "audio|video"
    }
  ],
  messages: [          // Recent chat messages in the room
    {
      id: "string",
      userId: "string",
      userName: "string",
      message: "string",
      timestamp: "2025-07-27T12:10:00Z"
    }
  ]
}
```

#### `peer-joined` (S→C)
Notifies all participants when a new user joins the room.

**Event Data:**
```javascript
{
  socketId: "string",
  userId: "string",
  userName: "string",
  isHost: false
}
```

#### `peerLeft` (S→C)
Notifies all participants when a user leaves the room.

**Event Data:**
```javascript
{
  socketId: "string",
  userId: "string",
  userName: "string"
}
```

#### `roomDeleted` (S→C)
Notifies all participants when a room is deleted by the host.

**Event Data:**
```javascript
{
  roomId: "string",
  message: "Room has been deleted by the host"
}
```

### Messaging Events

#### `sendMessage` (C→S)
Send a chat message to all participants in a room.

**Request Data:**
```javascript
{
  roomId: "string",
  message: "string"
}
```

**Response Data (via callback):**
```javascript
{
  success: true,
  messageId: "string"
}
```

#### `newMessage` (S→C)
Broadcasts a new message to all participants in a room.

**Event Data:**
```javascript
{
  id: "string",
  userId: "string",
  userName: "string",
  message: "string",
  timestamp: "2025-07-27T12:10:00Z"
}
```

### MediaSoup Events (WebRTC Signaling)

#### `getRouterRtpCapabilities` (C→S)
Get the RTP capabilities of the MediaSoup router.

**Response Data (via callback):**
```javascript
{
  rtpCapabilities: { /* MediaSoup RTP capabilities object */ }
}
```

#### `createProducerTransport` (C→S)
Create a transport for producing media (audio/video).

**Request Data:**
```javascript
{
  roomId: "string"
}
```

**Response Data (via callback):**
```javascript
{
  id: "string",
  iceParameters: { /* ICE parameters */ },
  iceCandidates: [ /* ICE candidates */ ],
  dtlsParameters: { /* DTLS parameters */ }
}
```

#### `connectProducerTransport` (C→S)
Connect a producer transport using DTLS parameters.

**Request Data:**
```javascript
{
  transportId: "string",
  dtlsParameters: { /* DTLS parameters */ }
}
```

**Response Data (via callback):**
```javascript
{ success: true }
```

#### `produce` (C→S)
Start producing media (audio/video) on a connected transport.

**Request Data:**
```javascript
{
  transportId: "string",
  kind: "audio|video",
  rtpParameters: { /* RTP parameters */ },
  appData: { /* Optional application data */ }
}
```

**Response Data (via callback):**
```javascript
{
  id: "string"  // Producer ID
}
```

#### `createConsumerTransport` (C→S)
Create a transport for consuming media from other participants.

**Request Data:**
```javascript
{
  roomId: "string"
}
```

**Response Data (via callback):**
```javascript
{
  id: "string",
  iceParameters: { /* ICE parameters */ },
  iceCandidates: [ /* ICE candidates */ ],
  dtlsParameters: { /* DTLS parameters */ }
}
```

#### `connectConsumerTransport` (C→S)
Connect a consumer transport using DTLS parameters.

**Request Data:**
```javascript
{
  transportId: "string",
  dtlsParameters: { /* DTLS parameters */ }
}
```

**Response Data (via callback):**
```javascript
{ success: true }
```

#### `consume` (C→S)
Consume media from a producer.

**Request Data:**
```javascript
{
  transportId: "string",
  producerId: "string",
  rtpCapabilities: { /* RTP capabilities */ }
}
```

**Response Data (via callback):**
```javascript
{
  id: "string",          // Consumer ID
  producerId: "string",
  kind: "audio|video",
  rtpParameters: { /* RTP parameters */ }
}
```

#### `resumeConsumer` (C→S)
Resume a paused consumer.

**Request Data:**
```javascript
{
  consumerId: "string"
}
```

**Response Data (via callback):**
```javascript
{ success: true }
```

#### `pauseConsumer` (C→S)
Pause a consumer.

**Request Data:**
```javascript
{
  consumerId: "string"
}
```

**Response Data (via callback):**
```javascript
{ success: true }
```

#### `getProducers` (C→S)
Get a list of producers in a room (excluding the requester's own producers).

**Request Data:**
```javascript
{
  roomId: "string"
}
```

**Response Data (via callback):**
```javascript
{
  producers: [
    {
      producerId: "string",
      socketId: "string",
      userId: "string",
      userName: "string",
      kind: "audio|video"
    }
  ]
}
```

#### `newProducer` (S→C)
Notifies clients when a new producer is added to the room.

**Event Data:**
```javascript
{
  producerId: "string",
  socketId: "string",
  userId: "string",
  userName: "string",
  kind: "audio|video"
}
```

#### `producerClosed` (S→C)
Notifies clients when a producer is closed (e.g., when a user turns off their camera/microphone or leaves).

**Event Data:**
```javascript
{
  producerId: "string",
  socketId: "string",
  userId: "string"
}
```

---

## Data Structures

### Room Object

```typescript
{
  id: string;                  // Unique room identifier
  hostUserId: string;          // UUID of the host
  createdBy: string;           // Name of the host
  participants: Map<string, {  // Map of participants by userId
    socketId: string;          // Socket.IO connection ID
    userId: string;            // Unique user identifier
    name: string;              // User's display name
    joinedAt: Date;            // When the user joined
    isHost: boolean;           // Whether this user is the host
  }>;
  producers: Map<string, mediasoupTypes.Producer>;           // Active media producers
  consumers: Map<string, mediasoupTypes.Consumer>;           // Active media consumers
  producerTransports: Map<string, mediasoupTypes.WebRtcTransport>; // Producer transports
  consumerTransports: Map<string, mediasoupTypes.WebRtcTransport>; // Consumer transports
  messages: Array<{           // Chat messages
    id: string;               // Unique message identifier
    userId: string;           // Sender's user ID
    userName: string;         // Sender's display name
    message: string;          // Message content
    timestamp: Date;          // When the message was sent
  }>;
  createdAt: Date;            // When the room was created
}
```

---

## Server Behavior

### Cleanup and Resource Management

- Empty rooms are logged every 5 minutes but not automatically deleted (commented out code suggests this feature is planned)
- When a room is deleted, all associated transports, producers, and consumers are properly closed
- When a user leaves or disconnects, their resources are cleaned up
- The server periodically logs active room counts and total participant counts

### Error Handling

- All REST API endpoints include validation and appropriate error responses
- Socket.IO events use try-catch blocks with error callbacks to prevent server crashes
- Errors are logged with detailed information for debugging

---

## Usage Limitations

- The server is designed to work within the port range specified in environment variables (default: RTC_MIN_PORT=10000, RTC_MAX_PORT=10100)
- MediaSoup configurations can be adjusted in config.mediasoup.ts
- The server relies on proper client-side handling of WebRTC signaling

---

## Media Capabilities

The MediaSoup router is configured to support:
- Multiple video codecs (VP8, VP9, H.264)
- Audio codec (OPUS)
- Simulcast and SVC for adaptive streaming quality
- ICE/DTLS for secure media transport

---

For more details, refer to the source code or contact the maintainer.
