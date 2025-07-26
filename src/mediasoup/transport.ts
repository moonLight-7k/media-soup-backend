import { types as mediasoupTypes } from "mediasoup";
import { webRtcTransportOptions } from "./config.mediasoup";
import logger from "../logger";

export type TransportParams =
  | {
      id: string;
      iceParameters: mediasoupTypes.IceParameters;
      iceCandidates: mediasoupTypes.IceCandidate[];
      dtlsParameters: mediasoupTypes.DtlsParameters;
      sctpParameters?: mediasoupTypes.SctpParameters;
    }
  | { error: string };

export const createWebRtcTransport = async (
  router: mediasoupTypes.Router,
  callback: (params: TransportParams) => void
): Promise<mediasoupTypes.WebRtcTransport | null> => {
  try {
    logger.debug("Creating WebRTC transport...");

    const transport = await router.createWebRtcTransport(
      webRtcTransportOptions
    );

    logger.info("WebRTC transport created successfully", {
      transportId: transport.id,
      iceRole: transport.iceRole,
      iceState: transport.iceState,
      dtlsState: transport.dtlsState,
    });

    // Set up transport event handlers
    setupTransportEventHandlers(transport);

    // Prepare transport parameters for client
    const transportParams: TransportParams = {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };

    // Add SCTP parameters if available (for data channels)
    if (transport.sctpParameters) {
      transportParams.sctpParameters = transport.sctpParameters;
    }

    // Send transport parameters to client
    callback(transportParams);

    return transport;
  } catch (error: any) {
    logger.error("Failed to create WebRTC transport", {
      error: error.message,
      stack: error.stack,
    });

    callback({ error: `Failed to create transport: ${error.message}` });
    return null;
  }
};

// Set up comprehensive event handlers for transport monitoring
const setupTransportEventHandlers = (
  transport: mediasoupTypes.WebRtcTransport
) => {
  const transportId = transport.id;

  // ICE state changes
  transport.on("icestatechange", (iceState) => {
    logger.debug("Transport ICE state changed", {
      transportId,
      iceState,
    });

    if (iceState === "closed") {
      logger.warn("Transport ICE connection closed", {
        transportId,
        iceState,
      });
    }
  });

  // DTLS state changes
  transport.on("dtlsstatechange", (dtlsState) => {
    logger.debug("Transport DTLS state changed", {
      transportId,
      dtlsState,
    });

    if (dtlsState === "failed") {
      logger.error("Transport DTLS failed", { transportId });
      transport.close();
    } else if (dtlsState === "closed") {
      logger.info("Transport DTLS closed", { transportId });
      if (!transport.closed) {
        transport.close();
      }
    }
  });

  // SCTP state changes (for data channels)
  transport.on("sctpstatechange", (sctpState) => {
    logger.debug("Transport SCTP state changed", {
      transportId,
      sctpState,
    });
  });

  // Transport close event
  transport.on("@close", () => {
    logger.info("Transport closed", { transportId });
  });

  // Producer-related events
  transport.observer.on("newproducer", (producer) => {
    logger.info("New producer on transport", {
      transportId,
      producerId: producer.id,
      kind: producer.kind,
      type: producer.type,
    });

    // Set up producer event handlers
    setupProducerEventHandlers(producer, transportId);
  });

  // Consumer-related events
  transport.observer.on("newconsumer", (consumer) => {
    logger.info("New consumer on transport", {
      transportId,
      consumerId: consumer.id,
      kind: consumer.kind,
      type: consumer.type,
    });

    // Set up consumer event handlers
    setupConsumerEventHandlers(consumer, transportId);
  });

  // Data producer events
  transport.observer.on("newdataproducer", (dataProducer) => {
    logger.info("New data producer on transport", {
      transportId,
      dataProducerId: dataProducer.id,
      label: dataProducer.label,
    });
  });

  // Data consumer events
  transport.observer.on("newdataconsumer", (dataConsumer) => {
    logger.info("New data consumer on transport", {
      transportId,
      dataConsumerId: dataConsumer.id,
      label: dataConsumer.label,
    });
  });
};

// Producer event handlers
const setupProducerEventHandlers = (
  producer: mediasoupTypes.Producer,
  transportId: string
) => {
  const producerId = producer.id;

  producer.on("score", (score) => {
    logger.debug("Producer score updated", {
      transportId,
      producerId,
      score,
    });
  });

  producer.on("videoorientationchange", (videoOrientation) => {
    logger.debug("Producer video orientation changed", {
      transportId,
      producerId,
      videoOrientation,
    });
  });

  // producer.on("pause", () => {
  //   logger.debug("Producer paused", {
  //     transportId,
  //     producerId,
  //   });
  // });

  // producer.on("resume", () => {
  //   logger.debug("Producer resumed", {
  //     transportId,
  //     producerId,
  //   });
  // });

  producer.on("transportclose", () => {
    logger.info("Producer transport closed", {
      transportId,
      producerId,
    });
  });

  producer.on("@close", () => {
    logger.info("Producer closed", {
      transportId,
      producerId,
    });
  });
};

// Consumer event handlers
const setupConsumerEventHandlers = (
  consumer: mediasoupTypes.Consumer,
  transportId: string
) => {
  const consumerId = consumer.id;

  consumer.on("score", (score) => {
    logger.debug("Consumer score updated", {
      transportId,
      consumerId,
      score,
    });
  });

  consumer.on("layerschange", (layers) => {
    logger.debug("Consumer layers changed", {
      transportId,
      consumerId,
      layers,
    });
  });

  // consumer.on("pause", () => {
  //   logger.debug("Consumer paused", {
  //     transportId,
  //     consumerId,
  //   });
  // });

  // consumer.on("resume", () => {
  //   logger.debug("Consumer resumed", {
  //     transportId,
  //     consumerId,
  //   });
  // });

  consumer.on("producerclose", () => {
    logger.info("Consumer producer closed", {
      transportId,
      consumerId,
    });
  });

  consumer.on("producerpause", () => {
    logger.debug("Consumer producer paused", {
      transportId,
      consumerId,
    });
  });

  consumer.on("producerresume", () => {
    logger.debug("Consumer producer resumed", {
      transportId,
      consumerId,
    });
  });

  consumer.on("transportclose", () => {
    logger.info("Consumer transport closed", {
      transportId,
      consumerId,
    });
  });

  consumer.on("@close", () => {
    logger.info("Consumer closed", {
      transportId,
      consumerId,
    });
  });
};

// Utility function to get transport stats
export const getTransportStats = async (
  transport: mediasoupTypes.WebRtcTransport
): Promise<any[]> => {
  try {
    const stats = await transport.getStats();
    logger.debug("Transport stats retrieved", {
      transportId: transport.id,
      statsCount: stats.length,
    });
    return stats;
  } catch (error: any) {
    logger.error("Failed to get transport stats", {
      transportId: transport.id,
      error: error.message,
    });
    throw error;
  }
};

// Utility function to close transport safely
export const closeTransport = (transport: mediasoupTypes.WebRtcTransport) => {
  try {
    if (!transport.closed) {
      logger.info("Closing transport", { transportId: transport.id });
      transport.close();
    }
  } catch (error: any) {
    logger.error("Error closing transport", {
      transportId: transport.id,
      error: error.message,
    });
  }
};

// Create plain transport for recording/streaming
export const createPlainTransport = async (
  router: mediasoupTypes.Router,
  options: Partial<mediasoupTypes.PlainTransportOptions> = {}
): Promise<mediasoupTypes.PlainTransport> => {
  try {
    const transport = await router.createPlainTransport({
      listenInfo: {
        ip: "127.0.0.1",
        protocol: "udp",
        portRange: { min: 40000, max: 49999 },
      },
    });

    logger.info("Plain transport created", {
      transportId: transport.id,
    });

    return transport;
  } catch (error: any) {
    logger.error("Failed to create plain transport", {
      error: error.message,
    });
    throw error;
  }
};
