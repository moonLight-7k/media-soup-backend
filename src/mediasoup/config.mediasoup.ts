import * as mediasoup from "mediasoup";
import { types as mediasoupTypes } from "mediasoup";
import logger from "../logger";

export const mediaCodecs: mediasoupTypes.RtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
    parameters: {
      "sprop-stereo": 1,
      useinbandfec: 1,
      usedtx: 1,
    },
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
      "x-google-max-bitrate": 2000,
      "x-google-min-bitrate": 100,
    },
  },
  {
    kind: "video",
    mimeType: "video/VP9",
    clockRate: 90000,
    parameters: {
      "profile-id": 2,
      "x-google-start-bitrate": 1000,
      "x-google-max-bitrate": 2000,
      "x-google-min-bitrate": 100,
    },
  },
  {
    kind: "video",
    mimeType: "video/h264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "4d0032",
      "level-asymmetry-allowed": 1,
      "x-google-start-bitrate": 1000,
      "x-google-max-bitrate": 2000,
      "x-google-min-bitrate": 100,
    },
  },
  {
    kind: "video",
    mimeType: "video/h264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1,
      "x-google-start-bitrate": 1000,
      "x-google-max-bitrate": 2000,
      "x-google-min-bitrate": 100,
    },
  },
];

// Worker configuration
const workerSettings: mediasoupTypes.WorkerSettings = {
  logLevel: process.env.NODE_ENV === "production" ? "warn" : "debug",
  logTags: ["info", "ice", "dtls", "rtp", "sctp", "simulcast", "svc", "score"],
  rtcMinPort: Number(process.env.RTC_MIN_PORT) || 10000,
  rtcMaxPort: Number(process.env.RTC_MAX_PORT) || 10100,
  dtlsCertificateFile: process.env.DTLS_CERT_FILE,
  dtlsPrivateKeyFile: process.env.DTLS_PRIVATE_KEY_FILE,
};

// Router configuration
const routerOptions: mediasoupTypes.RouterOptions = {
  mediaCodecs,
};

// WebRTC transport configuration
export const webRtcTransportOptions: mediasoupTypes.WebRtcTransportOptions = {
  listenIps: [
    {
      ip: process.env.MEDIASOUP_LISTEN_IP || "0.0.0.0",
      announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
    },
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  preferTcp: false,
  initialAvailableOutgoingBitrate: 1000000,
  maxSctpMessageSize: 262144,
  // Additional transport settings for better performance
  enableSctp: true,
  numSctpStreams: { OS: 1024, MIS: 1024 },
  appData: {},
};

// Plain transport configuration (for recording/streaming)
export const plainTransportOptions: mediasoupTypes.PlainTransportOptions = {
  listenIp: {
    ip: process.env.MEDIASOUP_LISTEN_IP || "0.0.0.0",
    announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
  },
  rtcpMux: false,
  comedia: true,
  appData: {},
};

// Worker creation with error handling and monitoring
export const createWorker = async (): Promise<mediasoupTypes.Worker> => {
  logger.info("Creating mediasoup worker...");

  try {
    const worker = await mediasoup.createWorker(workerSettings);

    logger.info(`Worker created successfully`, {
      pid: worker.pid,
      rtcMinPort: workerSettings.rtcMinPort,
      rtcMaxPort: workerSettings.rtcMaxPort,
    });

    // Worker event handlers
    worker.on("died", (error: any) => {
      logger.error(`Mediasoup worker died unexpectedly`, {
        pid: worker.pid,
        error: error.message,
        code: error.code,
      });

      // Graceful shutdown
      setTimeout(() => {
        logger.error("Exiting process due to worker death");
        process.exit(1);
      }, 2000);
    });

    // Monitor worker resource usage
    worker.observer.on("newrouter", (router) => {
      logger.info(`New router created`, { routerId: router.id });

      router.observer.on("newtransport", (transport) => {
        logger.debug(`New transport created`, {
          routerId: router.id,
          transportId: transport.id,
          transportType: transport.constructor.name,
        });
      });

      router.observer.on("newrtpobserver", (rtpObserver) => {
        logger.debug(`New RTP observer created`, {
          routerId: router.id,
          rtpObserverId: rtpObserver.id,
        });
      });
    });

    // Periodically log worker resource usage
    setInterval(async () => {
      try {
        const usage = await worker.getResourceUsage();
        logger.info("Worker resource usage:", {
          pid: worker.pid,
          usage,
        });
        logger.debug("Worker resource usage", {
          pid: worker.pid,
          ...usage,
        });
      } catch (error) {
        logger.warn("Failed to get worker resource usage", { error });
      }
    }, 60000); // Every minute

    return worker;
  } catch (error: any) {
    logger.error("Failed to create mediasoup worker", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

// Router creation with monitoring
export const createRouter = async (
  worker: mediasoupTypes.Worker
): Promise<mediasoupTypes.Router> => {
  logger.info("Creating router...");

  try {
    const router = await worker.createRouter(routerOptions);

    logger.info("Router created successfully", {
      routerId: router.id,
      codecs: mediaCodecs.length,
    });

    // Router event monitoring
    router.observer.on("newtransport", (transport) => {
      logger.debug(`Transport created on router`, {
        routerId: router.id,
        transportId: transport.id,
      });

      // Monitor transport events
      transport.observer.on("newproducer", (producer) => {
        logger.debug(`Producer created`, {
          routerId: router.id,
          transportId: transport.id,
          producerId: producer.id,
          kind: producer.kind,
          type: producer.type,
        });
      });

      transport.observer.on("newconsumer", (consumer) => {
        logger.debug(`Consumer created`, {
          routerId: router.id,
          transportId: transport.id,
          consumerId: consumer.id,
          kind: consumer.kind,
          type: consumer.type,
        });
      });

      transport.observer.on("newdataproducer", (dataProducer) => {
        logger.debug(`Data producer created`, {
          routerId: router.id,
          transportId: transport.id,
          dataProducerId: dataProducer.id,
        });
      });

      transport.observer.on("newdataconsumer", (dataConsumer) => {
        logger.debug(`Data consumer created`, {
          routerId: router.id,
          transportId: transport.id,
          dataConsumerId: dataConsumer.id,
        });
      });
    });

    return router;
  } catch (error: any) {
    logger.error("Failed to create router", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

// Utility function to check if router can consume
export const canConsume = (
  router: mediasoupTypes.Router,
  producerId: string,
  rtpCapabilities: mediasoupTypes.RtpCapabilities
): boolean => {
  try {
    return router.canConsume({ producerId, rtpCapabilities });
  } catch (error: any) {
    logger.error("Error checking if router can consume", {
      producerId,
      error: error.message,
    });
    return false;
  }
};

// Get router RTP capabilities with error handling
export const getRouterRtpCapabilities = (
  router: mediasoupTypes.Router
): mediasoupTypes.RtpCapabilities => {
  try {
    return router.rtpCapabilities;
  } catch (error: any) {
    logger.error("Error getting router RTP capabilities", {
      error: error.message,
    });
    throw error;
  }
};

// Validate RTP capabilities
export const validateRtpCapabilities = (
  rtpCapabilities: mediasoupTypes.RtpCapabilities
): boolean => {
  try {
    if (!rtpCapabilities || !rtpCapabilities.codecs) {
      return false;
    }

    // Check if codecs array is not empty
    if (rtpCapabilities.codecs.length === 0) {
      return false;
    }

    // Basic validation of codec structure
    for (const codec of rtpCapabilities.codecs) {
      if (!codec.mimeType || !codec.kind || !codec.clockRate) {
        return false;
      }
    }

    return true;
  } catch (error: any) {
    logger.error("Error validating RTP capabilities", {
      error: error.message,
    });
    return false;
  }
};

// Export configuration constants
export const config = {
  worker: workerSettings,
  router: routerOptions,
  webRtcTransport: webRtcTransportOptions,
  plainTransport: plainTransportOptions,
  mediaCodecs,
} as const;
