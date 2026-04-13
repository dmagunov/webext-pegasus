import {
  PortMessage,
  createDeliveryLogger,
  createFingerprint,
  decodeConnectionArgs,
  internalPacketTypeRouter
} from "./chunk-HLFR4LBZ.js";
import {
  createBroadcastEventRuntime,
  createMessageRuntime,
  deserializeEndpoint,
  serializeEndpoint
} from "./chunk-T4RVFDRH.js";
import {
  initTransportAPI
} from "./chunk-MDHNL3MP.js";

// background.ts
import browser from "webextension-polyfill";
function initPegasusTransport() {
  const pendingResponses = createDeliveryLogger();
  const connMap = /* @__PURE__ */ new Map();
  const oncePortConnectedCbs = /* @__PURE__ */ new Map();
  const onceSessionEndCbs = /* @__PURE__ */ new Map();
  const oncePortConnected = (endpointName, cb) => {
    oncePortConnectedCbs.set(
      endpointName,
      (oncePortConnectedCbs.get(endpointName) || /* @__PURE__ */ new Set()).add(cb)
    );
    return () => {
      const su = oncePortConnectedCbs.get(endpointName);
      if (su?.delete(cb) && su?.size === 0) {
        oncePortConnectedCbs.delete(endpointName);
      }
    };
  };
  const onceSessionEnded = (sessionFingerprint, cb) => {
    onceSessionEndCbs.set(
      sessionFingerprint,
      (onceSessionEndCbs.get(sessionFingerprint) || /* @__PURE__ */ new Set()).add(cb)
    );
  };
  const notifyEndpoint = (endpoint) => ({
    withFingerprint: (fingerprint) => {
      const nextChain = (v) => ({ and: () => v });
      const notifications = {
        aboutIncomingMessage: (message) => {
          const recipient = connMap.get(endpoint);
          if (recipient == null) {
            throw new Error("Unable to find recipient endpoint");
          }
          PortMessage.toExtensionContext(recipient.port, {
            message,
            status: "incoming"
          });
          return nextChain(notifications);
        },
        aboutMessageUndeliverability: (resolvedDestination, message) => {
          const sender = connMap.get(endpoint);
          if (sender?.fingerprint === fingerprint) {
            PortMessage.toExtensionContext(sender.port, {
              message,
              resolvedDestination,
              status: "undeliverable"
            });
          }
          return nextChain(notifications);
        },
        aboutSessionEnded: (endedSessionFingerprint) => {
          const conn = connMap.get(endpoint);
          if (conn?.fingerprint === fingerprint) {
            PortMessage.toExtensionContext(conn.port, {
              fingerprint: endedSessionFingerprint,
              status: "terminated"
            });
          }
          return nextChain(notifications);
        },
        aboutSuccessfulDelivery: (receipt) => {
          const sender = connMap.get(endpoint);
          if (sender == null) {
            throw new Error("Unable to find sender endpoint");
          }
          PortMessage.toExtensionContext(sender.port, {
            receipt,
            status: "delivered"
          });
          return nextChain(notifications);
        },
        whenDeliverableTo: (targetEndpoint) => {
          const notifyDeliverability = () => {
            const origin = connMap.get(endpoint);
            if (origin?.fingerprint === fingerprint && connMap.has(targetEndpoint)) {
              PortMessage.toExtensionContext(origin.port, {
                deliverableTo: targetEndpoint,
                status: "deliverable"
              });
              return true;
            }
          };
          if (!notifyDeliverability()) {
            const unsub = oncePortConnected(
              targetEndpoint,
              notifyDeliverability
            );
            onceSessionEnded(fingerprint, unsub);
          }
          return nextChain(notifications);
        }
      };
      return notifications;
    }
  });
  const sessFingerprint = createFingerprint();
  const messageRuntime = createMessageRuntime(
    "background",
    async (message) => {
      if (message.origin.context === "background" && ["content-script", "devtools"].includes(message.destination.context) && !message.destination.tabId) {
        throw new TypeError(
          "When sending messages from background page, use @tabId syntax to target specific tab"
        );
      }
      const resolvedSender = serializeEndpoint({
        ...message.origin,
        ...message.origin.context === "window" && { context: "content-script" }
      });
      const resolvedDestination = serializeEndpoint({
        ...message.destination,
        ...message.destination.context === "window" && {
          context: "content-script"
        },
        tabId: message.destination.tabId || message.origin.tabId
      });
      message.destination.tabId = null;
      message.destination.frameId = void 0;
      const dest = () => connMap.get(resolvedDestination);
      const sender = () => connMap.get(resolvedSender);
      const deliver = () => {
        notifyEndpoint(resolvedDestination).withFingerprint(dest().fingerprint).aboutIncomingMessage(message);
        const receipt = {
          from: {
            endpointId: resolvedSender,
            fingerprint: sender()?.fingerprint
          },
          message,
          to: dest().fingerprint
        };
        if (message.messageType === "message") {
          pendingResponses.add(receipt);
        }
        if (message.messageType === "reply") {
          pendingResponses.remove(message.id);
        }
        if (sender()) {
          notifyEndpoint(resolvedSender).withFingerprint(sender().fingerprint).aboutSuccessfulDelivery(receipt);
        }
      };
      if (dest()?.port) {
        deliver();
      } else if (message.messageType === "message") {
        if (message.origin.context === "background") {
          oncePortConnected(resolvedDestination, deliver);
        } else if (sender()) {
          notifyEndpoint(resolvedSender).withFingerprint(sender().fingerprint).aboutMessageUndeliverability(resolvedDestination, message).and().whenDeliverableTo(resolvedDestination);
        }
      }
    },
    async (message) => {
      const resolvedSender = serializeEndpoint({
        ...message.origin,
        ...message.origin.context === "window" && { context: "content-script" }
      });
      const sender = connMap.get(resolvedSender);
      if (sender == null) {
        throw new Error("Unable to find sender endpoint");
      }
      const receipt = {
        from: {
          endpointId: resolvedSender,
          fingerprint: sender.fingerprint
        },
        message,
        to: sessFingerprint
      };
      notifyEndpoint(resolvedSender).withFingerprint(sender.fingerprint).aboutSuccessfulDelivery(receipt);
    }
  );
  browser.runtime.onConnect.addListener((incomingPort) => {
    const connArgs = decodeConnectionArgs(incomingPort.name);
    if (!connArgs) {
      return;
    }
    connArgs.endpointName ||= serializeEndpoint({
      context: "content-script",
      frameId: incomingPort.sender?.frameId,
      tabId: incomingPort.sender?.tab?.id ?? null
    });
    const { tabId: linkedTabId, frameId: linkedFrameId } = deserializeEndpoint(
      connArgs.endpointName
    );
    connMap.set(connArgs.endpointName, {
      fingerprint: connArgs.fingerprint,
      port: incomingPort
    });
    oncePortConnectedCbs.get(connArgs.endpointName)?.forEach((cb) => cb());
    oncePortConnectedCbs.delete(connArgs.endpointName);
    onceSessionEnded(connArgs.fingerprint, () => {
      const rogueMsgs = pendingResponses.entries().filter((pendingMessage) => pendingMessage.to === connArgs.fingerprint);
      pendingResponses.remove(rogueMsgs);
      rogueMsgs.forEach((rogueMessage) => {
        if (rogueMessage.from.endpointId === "background") {
          messageRuntime.endTransaction(rogueMessage.message.transactionId);
        } else {
          notifyEndpoint(rogueMessage.from.endpointId).withFingerprint(rogueMessage.from.fingerprint).aboutSessionEnded(connArgs.fingerprint);
        }
      });
    });
    incomingPort.onDisconnect.addListener(() => {
      if (connMap.get(connArgs.endpointName)?.fingerprint === connArgs.fingerprint) {
        connMap.delete(connArgs.endpointName);
      }
      onceSessionEndCbs.get(connArgs.fingerprint)?.forEach((cb) => cb());
      onceSessionEndCbs.delete(connArgs.fingerprint);
    });
    incomingPort.onMessage.addListener((msg) => {
      if (msg.type === "sync") {
        const allActiveSessions = [...connMap.values()].map(
          (conn) => conn.fingerprint
        );
        const stillPending = msg.pendingResponses.filter(
          (fp) => allActiveSessions.includes(fp.to)
        );
        pendingResponses.add(...stillPending);
        msg.pendingResponses.filter(
          (deliveryReceipt) => !allActiveSessions.includes(deliveryReceipt.to)
        ).forEach(
          (deliveryReceipt) => notifyEndpoint(connArgs.endpointName).withFingerprint(connArgs.fingerprint).aboutSessionEnded(deliveryReceipt.to)
        );
        msg.pendingDeliveries.forEach(
          (intendedDestination) => notifyEndpoint(connArgs.endpointName).withFingerprint(connArgs.fingerprint).whenDeliverableTo(intendedDestination)
        );
        return;
      }
      if (msg.type === "deliver" && msg.message?.origin?.context) {
        msg.message.origin.tabId = linkedTabId;
        msg.message.origin.frameId = linkedFrameId;
        internalPacketTypeRouter(msg.message, { eventRuntime, messageRuntime });
      }
    });
  });
  let undeliveredEvents = [];
  setTimeout(() => {
    Promise.all(
      undeliveredEvents.map(routeEvent)
    ).catch((err) => {
      console.error("Error while tying to deliver undelivered events:", err);
    });
    undeliveredEvents = void 0;
  }, 500);
  const routeEvent = async (event) => {
    if (connMap.size === 0 && undeliveredEvents !== void 0) {
      undeliveredEvents.push(event);
      return;
    }
    connMap.forEach((port, endpoint) => {
      notifyEndpoint(endpoint).withFingerprint(port.fingerprint).aboutIncomingMessage(event);
    });
    if (event.origin.context !== "background") {
      eventRuntime.handleEvent(event);
    }
  };
  const eventRuntime = createBroadcastEventRuntime("background", routeEvent);
  initTransportAPI({
    browser,
    emitBroadcastEvent: eventRuntime.emitBroadcastEvent,
    onBroadcastEvent: eventRuntime.onBroadcastEvent,
    onMessage: messageRuntime.onMessage,
    sendMessage: messageRuntime.sendMessage
  });
}
export {
  initPegasusTransport
};
