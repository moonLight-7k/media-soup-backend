# MediaSoup Backend - Google Meet Clone

A robust WebRTC backend built with MediaSoup for video conferencing, similar to Google Meet functionality.

## Features

✅ **Room Management**

- Create rooms with unique IDs
- Join rooms by room ID
- Host and participant roles
- Room persistence and cleanup

✅ **Video Conferencing**

- Many-to-many video/audio communication
- Screen sharing support
- Adaptive bitrate streaming
- Multiple codec support (VP8, VP9, H.264, Opus)

✅ **Real-time Chat**

- Text messaging within rooms
- Message history
- User identification

✅ **Advanced Features**

- Transport management with reconnection
- Producer/Consumer lifecycle management
- Comprehensive logging
- Error handling and recovery
- Performance monitoring

## Architecture

```
├── src/
│   ├── server.ts                 # Main server file
│   ├── logger.ts                 # Winston logger configuration
│   └── mediasoup/
│       ├── handlers.ts           # Socket.IO event handlers
│       ├── config.mediasoup.ts   # MediaSoup configuration
│       └── transport.ts          # Transport management
├── dist/                         # Compiled JavaScript
├── logs/                         # Log files
└── public/                       # Static files
```

## Prerequisites

- Node.js >= 18.0.0
- pnpm
- TypeScript

## Installation

1. **Clone and install dependencies**

```bash
git clone <your-repo>
cd mediasoup-backend
pnpm install
```

2. **Set up environment variables**

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Create logs directory**

```bash
pnpm run prepare-logs
```

4. **Build the project**

```bash
pnpm run build
```

5. **Start the server**

```bash
# Development
pnpm run dev

# Production
pnpm start
```

## Environment Configuration

### Basic Configuration (.env)

```bash
PORT=3002
NODE_ENV=development
MEDIASOUP_LISTEN_IP=0.0.0.0
MEDIASOUP_ANNOUNCED_IP=127.0.0.1
RTC_MIN_PORT=10000
RTC_MAX_PORT=10100
LOG_LEVEL=debug
```

### Production Configuration

```bash
NODE_ENV=production
MEDIASOUP_ANNOUNCED_IP=your-public-ip
LOG_LEVEL=info
DTLS_CERT_FILE=/path/to/cert.pem
DTLS_PRIVATE_KEY_FILE=/path/to/private-key.pem
```

## API Endpoints

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/rooms` | Create a new room |
| GET | `/api/rooms/:roomId` | Get room information |
| GET | `/api/rooms` | List all active rooms |

### Socket.IO Events

#### Client → Server

- `joinRoom` - Join a room
- `sendMessage` - Send chat message
- `getRouterRtpCapabilities` - Get router capabilities
- `createProducerTransport` - Create producer transport
- `createConsumerTransport` - Create consumer transport
- `connectProducerTransport` - Connect producer transport
- `connectConsumerTransport` - Connect consumer transport
- `produce` - Start producing media
- `consume` - Start consuming media
- `resumeConsumer` - Resume paused consumer
- `getProducers` - Get existing producers

#### Server → Client

- `connection-success` - Connection established
- `peer-joined` - New peer joined room
- `peerLeft` - Peer left room
- `newProducer` - New media producer available
- `producerClosed` - Producer closed
- `newMessage` - New chat message

## Usage Examples

### 1. Create and Join Room

```javascript
// Create room
const response = await fetch('/api/rooms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ hostName: 'John Doe' })
});
const { roomId } = await response.json();

// Join room via Socket.IO
socket.emit('joinRoom', {
  roomId,
  userName: 'Jane Smith'
}, (response) => {
  if (response.success) {
    console.log('Joined room:', response.roomId);
  }
});
```

### 2. Start Video Call

```javascript
// Initialize MediaSoup client
const client = new MediaSoupClient();
await client.connect('http://localhost:3002');
await client.joinRoom(roomId, 'User Name');
await client.initializeDevice();

// Start camera
const { stream, producer } = await client.startCamera();

// Handle new producers from other peers
client.onNewProducer = async ({ producerId }) => {
  const consumer = await client.consume(producerId);
  // Display the remote video
};
```

### 3. Send Chat Messages

```javascript
// Send message
await client.sendMessage('Hello everyone!');

// Receive messages
client.onNewMessage = ({ userName, message, timestamp }) => {
  console.log(`${userName}: ${message}`);
};
```

## Deployment

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
COPY public ./public

EXPOSE 3002
CMD ["pnpm", "start"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  mediasoup-backend:
    build: .
    ports:
      - "3002:3002"
      - "10000-10100:10000-10100/udp"
    environment:
      - NODE_ENV=production
      - MEDIASOUP_ANNOUNCED_IP=your-public-ip
    volumes:
      - ./logs:/app/logs
```

## Monitoring

### Monitoring Endpoints

```javascript
// Worker resource usage (logged every minute)
const usage = await worker.getResourceUsage();

// Transport statistics
const stats = await transport.getStats();
```

## Performance Optimization

### Server Optimizations

1. **Use PM2 for clustering**

```bash
pnpm install -g pm2
pm2 start dist/server.js -i max
```

2. **Enable compression**

```javascript
app.use(compression());
```

3. **Configure transport limits**

```javascript
initialAvailableOutgoingBitrate: 1000000,
maxIncomingBitrate: 1500000
```

### Client Optimizations

1. **Use simulcast for video**

```javascript
encodings: [
  { maxBitrate: 100000 },
  { maxBitrate: 300000 },
  { maxBitrate: 900000 }
]
```

2. **Implement adaptive bitrate**
3. **Use TURN servers for NAT traversal**

## Troubleshooting

### Common Issues

1. **Connection Issues**
   - Check firewall settings (UDP ports 10000-10100)
   - Verify MEDIASOUP_ANNOUNCED_IP in production
   - Check TURN server configuration

2. **Audio/Video Issues**
   - Verify codec support
   - Check browser permissions
   - Monitor transport statistics

3. **Performance Issues**
   - Increase worker CPU limits
   - Optimize video encodings
   - Monitor memory usage

### Debug Mode

```bash
LOG_LEVEL=debug npm run dev
```

### Health Checks

```bash
# Check server status
curl http://localhost:3002/api/rooms

# Check specific room
curl http://localhost:3002/api/rooms/{roomId}
```

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:

- Create an issue on GitHub
- Check the troubleshooting section
- Review MediaSoup documentation

## Roadmap

- [ ] Recording functionality
- [ ] Live streaming (RTMP/HLS)
- [ ] File sharing
- [ ] Whiteboard integration
- [ ] Mobile app support
- [ ] Load balancing
- [ ] Database persistence
- [ ] User authentication
