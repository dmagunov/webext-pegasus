import {
  PortMessage,
  createDeliveryLogger,
  createFingerprint,
  encodeConnectionArgs
} from "./chunk-HLFR4LBZ.js";

// src/PersistentPort.ts
import browser from "webextension-polyfill";
var createPersistentPort = (name = "") => {
  const fingerprint = createFingerprint();
  let port;
  let undeliveredQueue = [];
  const pendingResponses = createDeliveryLogger();
  const onMessageListeners = /* @__PURE__ */ new Set();
  const onFailureListeners = /* @__PURE__ */ new Set();
  const handleMessage = (msg, msgPort) => {
    switch (msg.status) {
      case "undeliverable":
        if (!undeliveredQueue.some((m) => m.message.id === msg.message.id)) {
          undeliveredQueue = [
            ...undeliveredQueue,
            {
              message: msg.message,
              resolvedDestination: msg.resolvedDestination
            }
          ];
        }
        return;
      case "deliverable":
        undeliveredQueue = undeliveredQueue.reduce((acc, queuedMsg) => {
          if (queuedMsg.resolvedDestination === msg.deliverableTo) {
            PortMessage.toBackground(msgPort, {
              message: queuedMsg.message,
              type: "deliver"
            });
            return acc;
          }
          return [...acc, queuedMsg];
        }, []);
        return;
      case "delivered":
        if (msg.receipt.message.messageType === "message") {
          pendingResponses.add(msg.receipt);
        }
        return;
      case "incoming":
        if (msg.message.messageType === "reply") {
          pendingResponses.remove(msg.message.id);
        }
        onMessageListeners.forEach((cb) => cb(msg.message, msgPort));
        return;
      case "terminated": {
        const rogueMsgs = pendingResponses.entries().filter((receipt) => msg.fingerprint === receipt.to);
        pendingResponses.remove(rogueMsgs);
        rogueMsgs.forEach(
          ({ message }) => onFailureListeners.forEach((cb) => cb(message))
        );
      }
    }
  };
  const connect = () => {
    port = browser.runtime.connect({
      name: encodeConnectionArgs({
        endpointName: name,
        fingerprint
      })
    });
    port.onMessage.addListener(handleMessage);
    port.onDisconnect.addListener(connect);
    PortMessage.toBackground(port, {
      pendingDeliveries: [
        ...new Set(
          undeliveredQueue.map(({ resolvedDestination }) => resolvedDestination)
        )
      ],
      pendingResponses: pendingResponses.entries(),
      type: "sync"
    });
  };
  connect();
  return {
    onFailure(cb) {
      onFailureListeners.add(cb);
    },
    onMessage(cb) {
      onMessageListeners.add(cb);
    },
    postMessage(message) {
      PortMessage.toBackground(port, {
        message,
        type: "deliver"
      });
    }
  };
};

export {
  createPersistentPort
};
