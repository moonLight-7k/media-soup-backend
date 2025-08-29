// Global variables
let socket;
let room = null;
let userId = null;
let userName = null;
let isHost = false;
let mediaStream = null;
let screenStream = null;
let localVideo = null;
let producerTransport = null;
let consumerTransport = null;
let producers = new Map();
let consumers = new Map();
let audioProducer = null;
let videoProducer = null;
let screenProducer = null;
let isMuted = false;
let isCameraOff = false;
let isScreenSharing = false;
let unreadMessages = 0;

// DOM Elements
const welcomeScreen = document.getElementById('welcome-screen');
const roomScreen = document.getElementById('room-screen');
const createRoomForm = document.getElementById('create-room-form');
const joinRoomForm = document.getElementById('join-room-form');
const roomsContainer = document.getElementById('rooms-container');
const videosContainer = document.getElementById('videos-container');
const localVideoElement = document.getElementById('local-video');
const roomIdDisplay = document.getElementById('room-id-display');
const participantCount = document.getElementById('participant-count');
const inviteBtn = document.getElementById('invite-btn');
const leaveBtn = document.getElementById('leave-btn');
const micBtn = document.getElementById('mic-btn');
const cameraBtn = document.getElementById('camera-btn');
const screenShareBtn = document.getElementById('screen-share-btn');
const chatBtn = document.getElementById('chat-btn');
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatMessageInput = document.getElementById('chat-message');
const closeChat = document.getElementById('close-chat');
const unreadCountBadge = document.getElementById('unread-count');
const notificationContainer = document.getElementById('notification-container');

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
    // Check if the browser supports WebRTC
    if (!hasWebRTCSupport()) {
        showNotification('Your browser does not support WebRTC. Please use a modern browser like Chrome, Firefox, or Edge.', 'error');
        return;
    }

    // Fetch active rooms
    fetchActiveRooms();

    // Set up event listeners
    createRoomForm.addEventListener('submit', handleCreateRoom);
    joinRoomForm.addEventListener('submit', handleJoinRoom);
    leaveBtn.addEventListener('click', handleLeaveRoom);
    micBtn.addEventListener('click', toggleMicrophone);
    cameraBtn.addEventListener('click', toggleCamera);
    screenShareBtn.addEventListener('click', toggleScreenShare);
    chatBtn.addEventListener('click', toggleChatPanel);
    closeChat.addEventListener('click', toggleChatPanel);
    chatForm.addEventListener('submit', handleSendMessage);
    inviteBtn.addEventListener('click', handleInvite);
}

// Check WebRTC support
function hasWebRTCSupport() {
    return navigator.mediaDevices && 
           navigator.mediaDevices.getUserMedia && 
           window.RTCPeerConnection;
}

// Switch between screens
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Create a new room
async function handleCreateRoom(event) {
    event.preventDefault();
    
    const hostName = document.getElementById('host-name').value.trim();
    if (!hostName) {
        showNotification('Please enter your name', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/rooms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                hostName
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            userName = hostName;
            userId = data.hostUserId;
            isHost = true;
            
            // Join the room
            joinRoom(data.roomId);
        } else {
            showNotification(data.message || 'Failed to create room', 'error');
        }
    } catch (error) {
        console.error('Error creating room:', error);
        showNotification('Failed to create room. Please try again.', 'error');
    }
}

// Join an existing room
async function handleJoinRoom(event) {
    event.preventDefault();
    
    const name = document.getElementById('join-name').value.trim();
    const roomId = document.getElementById('room-id').value.trim();
    
    if (!name || !roomId) {
        showNotification('Please enter your name and room ID', 'warning');
        return;
    }
    
    // Check if room exists
    try {
        const response = await fetch(`/api/rooms/${roomId}`);
        const data = await response.json();
        
        if (data.success) {
            userName = name;
            userId = crypto.randomUUID();
            isHost = false;
            
            // Join the room
            joinRoom(roomId);
        } else {
            showNotification(data.message || 'Room not found', 'error');
        }
    } catch (error) {
        console.error('Error joining room:', error);
        showNotification('Failed to join room. Please try again.', 'error');
    }
}

// Join room and setup WebRTC
async function joinRoom(roomId) {
    try {
        // Get user media
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                aspectRatio: { ideal: 1.7777777778 }
            }
        });
        
        // Display local video
        localVideoElement.srcObject = mediaStream;
        
        // Connect to Socket.IO server
        socket = io('/mediasoup');
        
        // Setup socket event handlers
        setupSocketHandlers(roomId);
        
        // Switch to room screen
        showScreen('room-screen');
        roomIdDisplay.textContent = `Room: ${roomId}`;
        
        // Save room ID
        room = roomId;
        
        showNotification(`You've joined room: ${roomId}`, 'success');
    } catch (error) {
        console.error('Error joining room:', error);
        showNotification('Failed to access camera/microphone. Please check your permissions.', 'error');
    }
}

// Setup socket event handlers
function setupSocketHandlers(roomId) {
    socket.on('connect', async () => {
        console.log('Connected to server');
        
        // Join the room
        socket.emit('joinRoom', {
            roomId,
            userId,
            name: userName,
            isHost
        });
    });
    
    socket.on('roomJoined', async (data) => {
        console.log('Room joined:', data);
        updateParticipantCount(data.participantCount);
        
        // Get router RTP capabilities
        socket.emit('getRouterRtpCapabilities', { roomId });
    });
    
    socket.on('routerRtpCapabilities', async (data) => {
        // Initialize device with router capabilities
        await initializeDevice(data.routerRtpCapabilities);
        
        // Create send transport
        socket.emit('createWebRtcTransport', {
            roomId,
            userId,
            direction: 'producer'
        });
    });
    
    socket.on('producerTransportCreated', async (data) => {
        await createSendTransport(data.params);
        
        // Create receive transport
        socket.emit('createWebRtcTransport', {
            roomId,
            userId,
            direction: 'consumer'
        });
    });
    
    socket.on('consumerTransportCreated', async (data) => {
        await createReceiveTransport(data.params);
        
        // Start producing media
        await startProducing();
    });
    
    socket.on('newProducer', async (data) => {
        // Consume new producer's media
        await consumeProducer(data.producerId, data.userId, data.kind);
        if (data.name) {
            // Update the video label with the participant's name
            const videoLabel = document.querySelector(`#video-${data.userId} .video-label`);
            if (videoLabel) {
                videoLabel.textContent = data.name;
            }
        }
    });
    
    socket.on('producerClosed', (data) => {
        removeConsumer(data.userId, data.kind);
    });
    
    socket.on('participantJoined', (data) => {
        showNotification(`${data.name} joined the room`, 'info');
        updateParticipantCount(data.participantCount);
    });
    
    socket.on('participantLeft', (data) => {
        showNotification(`${data.name} left the room`, 'info');
        updateParticipantCount(data.participantCount);
        removeParticipantVideos(data.userId);
    });
    
    socket.on('chatMessage', (data) => {
        addChatMessage(data);
        
        // If chat panel is not open, increment unread count
        if (!chatPanel.classList.contains('open')) {
            unreadMessages++;
            updateUnreadBadge();
        }
    });
    
    socket.on('roomDeleted', (data) => {
        showNotification('This room has been deleted by the host', 'warning');
        handleLeaveRoom();
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showNotification('Disconnected from server', 'error');
    });
}

// Initialize mediasoup device
async function initializeDevice(routerRtpCapabilities) {
    try {
        // Load the mediasoup-client Device
        const { Device } = window.mediasoupClient;
        
        // Create a new mediasoup Device
        const device = new Device();
        
        // Initialize the device with router RTP capabilities
        await device.load({ routerRtpCapabilities });
        
        // Store the device in a global variable for later use
        window.mediasoupDevice = device;
        
        console.log('Device initialized with RTP capabilities');
        
        // Check if device can produce/consume audio and video
        const canProduceAudio = device.canProduce('audio');
        const canProduceVideo = device.canProduce('video');
        
        if (!canProduceAudio || !canProduceVideo) {
            console.warn(`Browser cannot produce some media types: audio=${canProduceAudio}, video=${canProduceVideo}`);
        }
        
        return device;
    } catch (error) {
        console.error('Error initializing device:', error);
        showNotification('Failed to initialize media device. Please reload the page.', 'error');
        throw error;
    }
}

// Create WebRTC transport for sending media
async function createSendTransport(transportOptions) {
    try {
        // Create a new WebRTC transport for producing media
        producerTransport = window.mediasoupDevice.createSendTransport(transportOptions);
        
        // Setup event listeners for the transport
        setupProducerTransportListeners();
        
        console.log('Producer transport created');
        return producerTransport;
    } catch (error) {
        console.error('Error creating send transport:', error);
        showNotification('Failed to create media transport. Please reload the page.', 'error');
        throw error;
    }
}

// Create WebRTC transport for receiving media
async function createReceiveTransport(transportOptions) {
    try {
        // Create a new WebRTC transport for consuming media
        consumerTransport = window.mediasoupDevice.createRecvTransport(transportOptions);
        
        // Setup event listeners for the transport
        setupConsumerTransportListeners();
        
        console.log('Consumer transport created');
        return consumerTransport;
    } catch (error) {
        console.error('Error creating receive transport:', error);
        showNotification('Failed to create media transport. Please reload the page.', 'error');
        throw error;
    }
}

// Setup producer transport event listeners
function setupProducerTransportListeners() {
    // Set up connect and produce event listeners
    producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
            // Signal to the server to connect the transport
            socket.emit('connectProducerTransport', {
                roomId: room,
                userId,
                dtlsParameters
            });

            socket.once('producerTransportConnected', () => {
                // Tell the transport that it's connected
                callback();
            });
        } catch (error) {
            errback(error);
        }
    });

    producerTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        try {
            // Signal to the server to create a producer
            socket.emit('produce', {
                roomId: room,
                userId,
                kind,
                rtpParameters
            });

            socket.once('produced', ({ producerId }) => {
                // Tell the transport that the producer was created successfully
                callback({ id: producerId });
                
                // Store the producer in the corresponding variable
                if (kind === 'audio') {
                    audioProducer = producerTransport.producers.get(producerId);
                } else if (kind === 'video') {
                    videoProducer = producerTransport.producers.get(producerId);
                } else if (kind === 'screen') {
                    screenProducer = producerTransport.producers.get(producerId);
                }
            });
        } catch (error) {
            errback(error);
        }
    });
    
    console.log('Producer transport listeners set up');
}

// Setup consumer transport event listeners
function setupConsumerTransportListeners() {
    // Set up connect event listener
    consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
            // Signal to the server to connect the transport
            socket.emit('connectConsumerTransport', {
                roomId: room,
                userId,
                dtlsParameters
            });

            socket.once('consumerTransportConnected', () => {
                // Tell the transport that it's connected
                callback();
            });
        } catch (error) {
            errback(error);
        }
    });
    
    console.log('Consumer transport listeners set up');
}

// Start producing audio and video
async function startProducing() {
    try {
        // Produce audio
        await produceTrack('audio', mediaStream.getAudioTracks()[0]);
        
        // Produce video
        await produceTrack('video', mediaStream.getVideoTracks()[0]);
        
        console.log('Started producing audio and video');
    } catch (error) {
        console.error('Error starting to produce:', error);
    }
}

// Produce a media track
async function produceTrack(kind, track) {
    try {
        if (!producerTransport) {
            throw new Error('Producer transport not created');
        }

        // Create a producer
        const producer = await producerTransport.produce({
            track,
            encodings: kind === 'video' ? 
                [
                    { maxBitrate: 100000 },
                    { maxBitrate: 300000 },
                    { maxBitrate: 900000 }
                ] : undefined,
            codecOptions: kind === 'video' ? 
                { videoGoogleStartBitrate: 1000 } : undefined,
            appData: { kind }
        });

        // Store the producer in the map
        producers.set(kind, producer);

        // Store in the appropriate variable
        if (kind === 'audio') {
            audioProducer = producer;
        } else if (kind === 'video') {
            videoProducer = producer;
        }

        // Handle producer events
        producer.on('trackended', () => {
            console.log(`${kind} track ended`);
            
            // Close the producer
            producer.close();
            
            // Notify server about closed producer
            socket.emit('closeProducer', {
                roomId: room,
                userId,
                kind
            });
            
            // Remove from the map
            producers.delete(kind);
            
            if (kind === 'audio') {
                audioProducer = null;
            } else if (kind === 'video') {
                videoProducer = null;
            }
        });

        console.log(`Producing ${kind} track`);
        return producer;
    } catch (error) {
        console.error(`Error producing ${kind}:`, error);
        showNotification(`Failed to publish ${kind}. Please check your permissions.`, 'error');
        throw error;
    }
}

// Consume a producer's media
async function consumeProducer(producerId, producerUserId, kind) {
    try {
        if (!consumerTransport) {
            throw new Error('Consumer transport not created');
        }

        if (!window.mediasoupDevice.canConsume({ producerId })) {
            throw new Error(`Cannot consume producer ${producerId}`);
        }

        // Create video element for remote participant if it's video
        if (kind === 'video' && !document.getElementById(`video-${producerUserId}`)) {
            createRemoteVideoElement(producerUserId);
        }

        // Get consumer parameters from server
        socket.emit('consume', {
            roomId: room,
            userId,
            producerId,
            rtpCapabilities: window.mediasoupDevice.rtpCapabilities
        });

        // Wait for server response with consumer parameters
        const consumerParams = await new Promise((resolve) => {
            socket.once('consumerCreated', (data) => {
                resolve(data.params);
            });
        });

        // Create consumer
        const consumer = await consumerTransport.consume({
            id: consumerParams.id,
            producerId: consumerParams.producerId,
            kind: consumerParams.kind,
            rtpParameters: consumerParams.rtpParameters
        });

        // Store consumer in the map with userId and kind as key
        const key = `${producerUserId}-${kind}`;
        consumers.set(key, consumer);

        // Resume consumer
        socket.emit('resumeConsumer', {
            roomId: room,
            userId,
            consumerId: consumer.id
        });

        // If it's video, attach it to the video element
        if (kind === 'video') {
            const videoElement = document.getElementById(`remote-video-${producerUserId}`);
            if (videoElement) {
                videoElement.srcObject = new MediaStream([consumer.track]);
            }
        } 
        // If it's audio, create an audio element or add to existing stream
        else if (kind === 'audio') {
            const audioElement = document.createElement('audio');
            audioElement.id = `remote-audio-${producerUserId}`;
            audioElement.autoplay = true;
            audioElement.srcObject = new MediaStream([consumer.track]);
            document.body.appendChild(audioElement);
        }

        // Handle consumer events
        consumer.on('trackended', () => {
            console.log(`Consumer track ended for ${kind} from user ${producerUserId}`);
            removeConsumer(producerUserId, kind);
        });

        consumer.on('transportclose', () => {
            console.log(`Consumer transport closed for ${kind} from user ${producerUserId}`);
            removeConsumer(producerUserId, kind);
        });

        console.log(`Consuming ${kind} from producer ${producerId} (user: ${producerUserId})`);
        return consumer;
    } catch (error) {
        console.error('Error consuming producer:', error);
        showNotification(`Failed to receive ${kind} from remote participant`, 'error');
    }
}

// Remove consumer when producer is closed
function removeConsumer(producerUserId, kind) {
    console.log(`Removing ${kind} consumer for user ${producerUserId}`);
    
    // Get consumer from map
    const key = `${producerUserId}-${kind}`;
    const consumer = consumers.get(key);
    
    if (consumer) {
        // Close the consumer
        consumer.close();
        consumers.delete(key);
    }
    
    // Remove audio element if it's audio
    if (kind === 'audio') {
        const audioElement = document.getElementById(`remote-audio-${producerUserId}`);
        if (audioElement) {
            audioElement.remove();
        }
    }
    
    // If it's video, check if user has any other tracks (audio)
    // If not, remove the video element
    if (kind === 'video') {
        const audioConsumerKey = `${producerUserId}-audio`;
        if (!consumers.has(audioConsumerKey)) {
            removeRemoteVideoElement(producerUserId);
        }
    }
    
    // If it's audio, check if the user has video
    // If not and if the video element exists, remove it
    if (kind === 'audio') {
        const videoConsumerKey = `${producerUserId}-video`;
        if (!consumers.has(videoConsumerKey)) {
            removeRemoteVideoElement(producerUserId);
        }
    }
}

// Create video element for remote participant
function createRemoteVideoElement(userId) {
    const videoWrapper = document.createElement('div');
    videoWrapper.className = 'remote-video-wrapper';
    videoWrapper.id = `video-${userId}`;
    
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.id = `remote-video-${userId}`;
    
    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = 'Remote User'; // This would be the actual name in a real implementation
    
    videoWrapper.appendChild(video);
    videoWrapper.appendChild(label);
    videosContainer.appendChild(videoWrapper);
}

// Remove video element for remote participant
function removeRemoteVideoElement(userId) {
    const videoElement = document.getElementById(`video-${userId}`);
    if (videoElement) {
        videoElement.remove();
    }
}

// Remove all videos for a participant
function removeParticipantVideos(userId) {
    removeRemoteVideoElement(userId);
}

// Leave the room
function handleLeaveRoom() {
    if (socket) {
        socket.emit('leaveRoom', {
            roomId: room,
            userId
        });
        socket.disconnect();
    }
    
    // Stop all streams
    stopAllStreams();
    
    // Reset state
    resetState();
    
    // Switch back to welcome screen
    showScreen('welcome-screen');
    showNotification('You left the room', 'info');
}

// Stop all media streams
function stopAllStreams() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
}

// Reset app state
function resetState() {
    room = null;
    userId = null;
    userName = null;
    isHost = false;
    producers.clear();
    consumers.clear();
    audioProducer = null;
    videoProducer = null;
    screenProducer = null;
    isMuted = false;
    isCameraOff = false;
    isScreenSharing = false;
    unreadMessages = 0;
    
    // Reset UI
    updateUnreadBadge();
    chatMessages.innerHTML = '';
    if (chatPanel.classList.contains('open')) {
        chatPanel.classList.remove('open');
    }
}

// Toggle microphone
function toggleMicrophone() {
    if (!mediaStream) return;
    
    const audioTrack = mediaStream.getAudioTracks()[0];
    if (audioTrack) {
        isMuted = !isMuted;
        audioTrack.enabled = !isMuted;
        
        // Update UI
        if (isMuted) {
            micBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            micBtn.classList.add('muted');
        } else {
            micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            micBtn.classList.remove('muted');
        }
        
        // Notify server
        socket.emit('muteState', {
            roomId: room,
            userId,
            muted: isMuted
        });
    }
}

// Toggle camera
function toggleCamera() {
    if (!mediaStream) return;
    
    const videoTrack = mediaStream.getVideoTracks()[0];
    if (videoTrack) {
        isCameraOff = !isCameraOff;
        videoTrack.enabled = !isCameraOff;
        
        // Update UI
        if (isCameraOff) {
            cameraBtn.innerHTML = '<i class="fas fa-video-slash"></i>';
            cameraBtn.classList.add('muted');
        } else {
            cameraBtn.innerHTML = '<i class="fas fa-video"></i>';
            cameraBtn.classList.remove('muted');
        }
        
        // Notify server
        socket.emit('videoState', {
            roomId: room,
            userId,
            videoPaused: isCameraOff
        });
    }
}

// Toggle screen sharing
async function toggleScreenShare() {
    if (isScreenSharing) {
        // Stop screen sharing
        if (screenProducer) {
            // Close screen producer
            socket.emit('closeProducer', {
                roomId: room,
                userId,
                producerId: screenProducer.id
            });
        }
        
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
            screenStream = null;
        }
        
        isScreenSharing = false;
        screenShareBtn.innerHTML = '<i class="fas fa-desktop"></i>';
        screenShareBtn.classList.remove('muted');
    } else {
        try {
            // Start screen sharing
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true
            });
            
            // Produce screen track
            // This would be replaced with actual mediasoup-client code
            console.log('Screen share started');
            
            isScreenSharing = true;
            screenShareBtn.innerHTML = '<i class="fas fa-stop"></i>';
            screenShareBtn.classList.add('muted');
            
            // Handle when user stops sharing via the browser UI
            screenStream.getVideoTracks()[0].addEventListener('ended', () => {
                toggleScreenShare();
            });
        } catch (error) {
            console.error('Error sharing screen:', error);
            showNotification('Failed to share screen. Please try again.', 'error');
        }
    }
}

// Toggle chat panel
function toggleChatPanel() {
    chatPanel.classList.toggle('open');
    
    // Reset unread count when opening
    if (chatPanel.classList.contains('open')) {
        unreadMessages = 0;
        updateUnreadBadge();
    }
}

// Update unread message badge
function updateUnreadBadge() {
    if (unreadMessages > 0) {
        unreadCountBadge.textContent = unreadMessages > 9 ? '9+' : unreadMessages;
        unreadCountBadge.classList.remove('hidden');
    } else {
        unreadCountBadge.classList.add('hidden');
    }
}

// Send chat message
function handleSendMessage(event) {
    event.preventDefault();
    
    const message = chatMessageInput.value.trim();
    if (!message) return;
    
    // Send to server
    socket.emit('sendMessage', {
        roomId: room,
        userId,
        userName,
        message
    });
    
    // Clear input
    chatMessageInput.value = '';
}

// Add message to chat
function addChatMessage(data) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    
    if (data.userId === userId) {
        messageElement.classList.add('self');
    }
    
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    messageElement.innerHTML = `
        <div>
            <span class="message-sender">${data.userName}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-content">${data.message}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Update participant count
function updateParticipantCount(count) {
    participantCount.textContent = `${count} participant${count !== 1 ? 's' : ''}`;
}

// Handle invite button
function handleInvite() {
    const roomUrl = `${window.location.origin}?room=${room}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(roomUrl)
        .then(() => {
            showNotification('Room link copied to clipboard!', 'success');
        })
        .catch(() => {
            showNotification('Failed to copy link. Please copy it manually: ' + roomUrl, 'error');
        });
}

// Fetch active rooms
async function fetchActiveRooms() {
    try {
        const response = await fetch('/api/rooms');
        const data = await response.json();
        
        if (data.success) {
            displayActiveRooms(data.rooms);
        } else {
            roomsContainer.innerHTML = '<p>Failed to load active rooms</p>';
        }
    } catch (error) {
        console.error('Error fetching active rooms:', error);
        roomsContainer.innerHTML = '<p>Failed to load active rooms</p>';
    }
}

// Display active rooms
function displayActiveRooms(rooms) {
    if (!rooms || rooms.length === 0) {
        roomsContainer.innerHTML = '<p>No active rooms available</p>';
        return;
    }
    
    roomsContainer.innerHTML = '';
    rooms.forEach(room => {
        const roomElement = document.createElement('div');
        roomElement.className = 'room-item';
        
        const createdAt = new Date(room.createdAt);
        const timeString = `${createdAt.getHours().toString().padStart(2, '0')}:${createdAt.getMinutes().toString().padStart(2, '0')}`;
        
        roomElement.innerHTML = `
            <div class="room-item-info">
                <strong>Room: ${room.id}</strong>
                <span class="room-creator">Created by: ${room.createdBy}</span>
            </div>
            <div class="room-participants">
                <i class="fas fa-users"></i> ${room.participantCount}
                <button class="btn secondary join-room-btn" data-room-id="${room.id}">Join</button>
            </div>
        `;
        
        roomsContainer.appendChild(roomElement);
    });
    
    // Add event listeners to join buttons
    document.querySelectorAll('.join-room-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('room-id').value = btn.dataset.roomId;
        });
    });
}

// Display notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = message;
    
    notificationContainer.appendChild(notification);
    
    // Remove notification after 5 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 5000);
}

// Check URL for room parameter on load
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    
    if (roomId) {
        document.getElementById('room-id').value = roomId;
    }
});
