# Video Conferencing Application: User Flow

Below is a detailed user flow for the video conferencing application, presented as a sequence of steps from the client's perspective, starting from establishing a connection to participating in a video conference. The flow includes interactions with the WebSocket (Socket.IO) and MediaSoup for media streaming, depicted in a Markdown sequence diagram for clarity.

[View on Eraser![](https://app.eraser.io/workspace/1iQqZsVnefyMRVMAU5rT/preview?elements=M027XQtlkndqPLRm-Q1a5w&type=embed)](https://app.eraser.io/workspace/1iQqZsVnefyMRVMAU5rT?elements=M027XQtlkndqPLRm-Q1a5w)

<a href="https://app.eraser.io/workspace/1iQqZsVnefyMRVMAU5rT?elements=M027XQtlkndqPLRm-Q1a5w">View on Eraser<br /><img src="https://app.eraser.io/workspace/1iQqZsVnefyMRVMAU5rT/preview?elements=M027XQtlkndqPLRm-Q1a5w&type=embed" /></a>

## User Flow Sequence Diagram

```json
sequenceDiagram:
    participant Client
    participant Server
    participant MediaSoup

    Note over Client,Server: Initial Setup
    Client->>Server: Connect to Socket.IO (/mediasoup namespace)
    Server->>Client: Emit connection-success (socketId)
    Note over Client: Store socketId

    Note over Client,Server: Room Creation
    Client->>Server: POST /api/rooms (hostName)
    Server->>Client: Return roomId
    Note over Server: Create Room object, store in rooms Map

    Note over Client,Server: Joining Room
    Client->>Server: Emit joinRoom(roomId, userName, userId)
    Server->>Server: Validate roomId, add participant
    Server->>Client: Callback with room details, existing producers, messages
    Server->>Client: Broadcast peer-joined to other participants

    Note over Client,Server: Chat Messaging
    Client->>Server: Emit sendMessage(roomId, message)
    Server->>Server: Store message in room
    Server->>Client: Broadcast newMessage to room
    Server->>Client: Callback with messageId

    Note over Client,MediaSoup: Media Streaming Setup
    Client->>Server: Emit getRouterRtpCapabilities
    Server->>MediaSoup: Retrieve router.rtpCapabilities
    MediaSoup->>Server: Provide rtpCapabilities
    Server->>Client: Callback with rtpCapabilities

    Client->>Server: Emit createProducerTransport
    Server->>MediaSoup: Create WebRTC Transport
    MediaSoup->>Server: Return transport parameters
    Server->>Client: Callback with transport params (id, iceParameters, dtlsParameters)
    Note over Server: Store transport in room.producerTransports

    Client->>Server: Emit connectProducerTransport(dtlsParameters)
    Server->>MediaSoup: Connect transport
    MediaSoup->>Server: Transport connected
    Server->>Client: Callback success

    Client->>Server: Emit produce(kind, rtpParameters)
    Server->>MediaSoup: Create Producer
    MediaSoup->>Server: Return producer
    Server->>Client: Callback with producerId
    Server->>Client: Broadcast newProducer to room
    Note over Server: Store producer in room.producers

    Client->>Server: Emit createConsumerTransport
    Server->>MediaSoup: Create WebRTC Transport
    MediaSoup->>Server: Return transport parameters
    Server->>Client: Callback with transport params
    Note over Server: Store transport in room.consumerTransports

    Client->>Server: Emit connectConsumerTransport(dtlsParameters)
    Server->>MediaSoup: Connect transport
    MediaSoup->>Server: Transport connected
    Server->>Client: Callback success

    Client->>Server: Emit consume(producerId, rtpCapabilities)
    Server->>MediaSoup: Check canConsume, create Consumer
    MediaSoup->>Server: Return consumer
    Server->>Client: Callback with consumer details (id, producerId, kind, rtpParameters)
    Note over Server: Store consumer in room.consumers

    Client->>Server: Emit resumeConsumer(consumerId)
    Server->>MediaSoup: Resume consumer
    MediaSoup->>Server: Consumer resumed
    Server->>Client: Callback success

    Note over Client,Server: Ongoing Interaction
    Client->>Server: Emit getProducers
    Server->>Client: Callback with list of producers
    Note over Client: Display available media streams

    Note over Client,Server: Disconnection
    Client->>Server: Disconnect
    Server->>Server: Remove participant, close transports/producers/consumers
    Server->>Client: Broadcast peerLeft, producerClosed to room
    Note over Server: Delete room if empty
```

## Detailed User Flow Steps

1. Establish WebSocket Connection

- The client connects to the server via Socket.IO on the /mediasoup namespace.
- The server responds with a connection-success event, providing the client's socketId.
- The client stores the socketId for use in subsequent communications.

2. Create a Room

- The client sends a POST /api/rooms HTTP request with the host's name.
- The server generates a unique 8-character roomId using uuidv4 and creates a Room object with empty collections for participants, producers, consumers, transports, and messages.
- The server stores the room in a rooms Map and returns the roomId to the client.

3. Join a Room

- The client emits a joinRoom event with roomId, userName, and an optional userId.
- The server verifies the room exists, generates a userId if not provided, and adds the - client to the room’s participants Map.
- The client is marked as the host if they are the first participant.
- The server joins the client to the Socket.IO room (using socket.join(roomId)).
- The server sends existing producers and recent messages (last 50) to the client via callback.
- The server broadcasts a peer-joined event to other participants in the room.

4. Send Chat Messages

- The client emits a sendMessage event with roomId and the message content.
- The server validates the client’s participation, creates a message object (with id, userId, userName, message, and timestamp), and stores it in the room’s messages array.
- The server broadcasts a newMessage event to all room participants and confirms success to the sender via callback.

5. Set Up Media Streaming

- Get Router Capabilities:
  - The client emits getRouterRtpCapabilities to obtain the MediaSoup router’s RTP capabilities.
  - The server retrieves and returns these capabilities via callback.

- Create Producer Transport:
  - The client emits createProducerTransport.
  - The server creates a WebRTC transport via MediaSoup, stores it in the room’s producerTransports Map, and returns transport parameters (ID, ICE parameters, DTLS parameters).

- Connect Producer Transport:
  - The client emits connectProducerTransport with DTLS parameters.
  - The server connects the transport and confirms success.

- Produce Media:
  - The client emits produce with media kind (audio/video) and rtpParameters.
  - The server creates a producer, stores it in the room’s producers Map, broadcasts a newProducer event to the room, and returns the producerId.

- Create Consumer Transport:
  - The client emits createConsumerTransport.
  - The server creates and stores a consumer transport, returning its parameters.

- Connect Consumer Transport:
  - The client emits connectConsumerTransport with DTLS parameters.
  - The server connects the transport and confirms success.

- Consume Media:
  - The client emits consume with a producerId and its rtpCapabilities.
  - The server verifies compatibility, creates a consumer (initially paused), stores it in the room’s consumers Map, and returns consumer details.

- Resume Consumer:
  - The client emits resumeConsumer with the consumerId.
  - The server resumes the consumer and confirms success, allowing the client to receive the media stream.

6. Retrieve Active Producers

- The client emits getProducers to retrieve a list of active producers in the room.
- The server responds with a list of producers (excluding the client’s own), including producerId, socketId, userId, userName, and kind.

7. Handle Disconnection

- When the client disconnects (e.g., closes the browser), the server detects the disconnect event.
- The server removes the client from the room’s participants Map, closes associated transports, producers, and consumers, and broadcasts peerLeft and producerClosed events to the room.
- If the room becomes empty, the server deletes it from the rooms Map.

## Notes

- Error Handling: All Socket.IO events are wrapped in try-catch blocks to prevent crashes, with errors logged and sent to clients via callbacks.
- Periodic Cleanup: The server runs a cleanup task every 30 seconds to remove empty rooms and close their resources.
- Dependencies: The flow assumes the presence of logger, createWebRtcTransport, and types modules, which are not shown but are critical for logging, transport creation, and type definitions.

- This sequence outlines the end-to-end user experience, from connecting to the server to engaging in video conferencing and chat, with MediaSoup handling the media streaming efficiently.
