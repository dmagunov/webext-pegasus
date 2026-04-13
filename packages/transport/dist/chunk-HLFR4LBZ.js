import {
  isInternalBroadcastEvent,
  isInternalMessage
} from "./chunk-T4RVFDRH.js";

// src/PortMessage.ts
var PortMessage = class {
  static toBackground(port, message) {
    return port.postMessage(message);
  }
  static toExtensionContext(port, message) {
    return port.postMessage(message);
  }
};

// src/utils/connection-args.ts
var isValidConnectionArgs = (args, requiredKeys = ["endpointName", "fingerprint"]) => typeof args === "object" && args !== null && requiredKeys.every((k) => k in args);
var encodeConnectionArgs = (args) => {
  if (!isValidConnectionArgs(args)) {
    throw new TypeError("Invalid connection args");
  }
  return JSON.stringify(args);
};
var decodeConnectionArgs = (encodedArgs) => {
  try {
    const args = JSON.parse(encodedArgs);
    return isValidConnectionArgs(args) ? args : null;
  } catch (error) {
    return null;
  }
};

// src/utils/delivery-logger.ts
var createDeliveryLogger = () => {
  let logs = [];
  return {
    add: (...receipts) => {
      logs = [...logs, ...receipts];
    },
    entries: () => logs,
    remove: (message) => {
      logs = typeof message === "string" ? logs.filter((receipt) => receipt.message.transactionId !== message) : logs.filter((receipt) => !message.includes(receipt));
    }
  };
};

// src/utils/endpoint-fingerprint.ts
import uid from "tiny-uid";
var createFingerprint = () => `uid::${uid(7)}`;

// src/utils/internalPacketTypeRouter.ts
function internalPacketTypeRouter(packet, {
  eventRuntime,
  messageRuntime
}) {
  if (isInternalBroadcastEvent(packet)) {
    eventRuntime.handleEvent(packet);
  } else if (isInternalMessage(packet)) {
    messageRuntime.handleMessage(packet);
  } else {
    throw new TypeError("Unknown message type");
  }
}

export {
  PortMessage,
  encodeConnectionArgs,
  decodeConnectionArgs,
  createDeliveryLogger,
  createFingerprint,
  internalPacketTypeRouter
};
