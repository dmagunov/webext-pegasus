"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// background.ts
var background_exports = {};
__export(background_exports, {
  initPegasusTransport: () => initPegasusTransport
});
module.exports = __toCommonJS(background_exports);
var import_webextension_polyfill = __toESM(require("webextension-polyfill"), 1);

// src/BroadcastEventRuntime.ts
var import_serialize_error = require("serialize-error");
var import_tiny_uid = __toESM(require("tiny-uid"), 1);
var createBroadcastEventRuntime = (thisContext, routeEvent, localEvent) => {
  const runtimeId = (0, import_tiny_uid.default)();
  const onEventListeners = /* @__PURE__ */ new Map();
  const handleEvent = async (event) => {
    const relayedViaBackground = event.hops.findIndex((hop) => hop.startsWith(`background::`)) !== -1;
    if (thisContext === "background" && event.origin.context === thisContext || relayedViaBackground) {
      localEvent?.(event);
      const { id: eventID } = event;
      const errs = [];
      const callbacks = onEventListeners.get(eventID) ?? [];
      for (const cb of callbacks) {
        try {
          await cb({
            data: event.data,
            id: eventID,
            sender: event.origin,
            timestamp: event.timestamp
          });
        } catch (error) {
          errs.push(error);
        }
      }
      if (errs.length > 0) {
        throw new Error(
          `Error(s) occurred while handling broadcast event ${eventID}: ${errs.map((err) => (0, import_serialize_error.serializeError)(err)).join(", ")}`
        );
      }
      if (relayedViaBackground) {
        return;
      }
    }
    event.hops.push(`${thisContext}::${runtimeId}`);
    return routeEvent(event);
  };
  return {
    emitBroadcastEvent: async (eventID, data) => {
      const payload = {
        data,
        hops: [],
        id: eventID,
        messageType: "broadcastEvent",
        origin: {
          context: thisContext,
          tabId: null
        },
        timestamp: Date.now(),
        transactionId: (0, import_tiny_uid.default)()
      };
      return await handleEvent(payload);
    },
    handleEvent,
    onBroadcastEvent: (eventID, callback) => {
      const currentListeners = onEventListeners.get(eventID) ?? [];
      onEventListeners.set(eventID, [
        ...currentListeners,
        callback
      ]);
      return () => {
        const oldListeners = onEventListeners.get(eventID) ?? [];
        onEventListeners.set(
          eventID,
          oldListeners.filter((listener) => listener !== callback)
        );
      };
    }
  };
};

// src/MessageRuntime.ts
var import_serialize_error2 = require("serialize-error");
var import_tiny_uid2 = __toESM(require("tiny-uid"), 1);

// src/utils/endpoint-utils.ts
var ENDPOINT_RE = /^((?:background$)|devtools|popup|sidepanel|newtab|options|content-script|window)(?:@(\d+)(?:\.(\d+))?)?$/;
var deserializeEndpoint = (endpoint) => {
  const [, context, tabId, frameId] = endpoint.match(ENDPOINT_RE) || [];
  return {
    context,
    frameId: frameId ? +frameId : void 0,
    tabId: +tabId
  };
};
var serializeEndpoint = ({
  context,
  tabId,
  frameId
}) => {
  if (["background", "popup", "sidepanel", "options"].includes(context)) {
    return context;
  }
  return `${context}@${tabId}${frameId ? `.${frameId}` : ""}`;
};

// src/MessageRuntime.ts
var createMessageRuntime = (thisContext, routeMessage, localMessage) => {
  const runtimeId = (0, import_tiny_uid2.default)();
  const openTransactions = /* @__PURE__ */ new Map();
  const onMessageListeners = /* @__PURE__ */ new Map();
  const handleMessage = (message) => {
    if (message.destination.context === thisContext && !message.destination.frameId && !message.destination.tabId) {
      localMessage?.(message);
      const { transactionId, id: messageID, messageType } = message;
      const handleReply = () => {
        const transactionP = openTransactions.get(transactionId);
        if (transactionP) {
          const { err, data } = message;
          if (err) {
            const dehydratedErr = err;
            const errCtr = self[dehydratedErr.name];
            const hydratedErr = new (typeof errCtr === "function" ? errCtr : Error)(dehydratedErr.message);
            for (const prop in dehydratedErr) {
              hydratedErr[prop] = dehydratedErr[prop];
            }
            transactionP.reject(hydratedErr);
          } else {
            transactionP.resolve(data);
          }
          openTransactions.delete(transactionId);
        }
      };
      const handleNewMessage = async () => {
        let reply = null;
        let err = null;
        let noHandlerFoundError = false;
        try {
          const cb = onMessageListeners.get(messageID);
          if (typeof cb === "function") {
            reply = await cb({
              data: message.data,
              id: messageID,
              sender: message.origin,
              timestamp: message.timestamp
            });
          } else {
            noHandlerFoundError = true;
            throw new Error(
              `[pegasus-transport] No handler registered in '${thisContext}' to accept messages with id '${messageID}'`
            );
          }
        } catch (error) {
          err = error;
        } finally {
          if (err) {
            message.err = (0, import_serialize_error2.serializeError)(err);
          }
          handleMessage({
            ...message,
            data: reply,
            destination: message.origin,
            hops: [],
            messageType: "reply",
            origin: { context: thisContext, tabId: null }
          });
          if (err && !noHandlerFoundError) {
            throw reply;
          }
        }
      };
      switch (messageType) {
        case "reply":
          return handleReply();
        case "message":
          return handleNewMessage();
      }
    }
    message.hops.push(`${thisContext}::${runtimeId}`);
    return routeMessage(message);
  };
  return {
    endTransaction: (transactionID) => {
      const transactionP = openTransactions.get(transactionID);
      transactionP?.reject("Transaction was ended before it could complete");
      openTransactions.delete(transactionID);
    },
    handleMessage,
    onMessage: (messageID, callback) => {
      onMessageListeners.set(messageID, callback);
      return () => onMessageListeners.delete(messageID);
    },
    sendMessage: (messageID, data, destination = "background") => {
      const endpoint = typeof destination === "string" ? deserializeEndpoint(destination) : destination;
      const errFn = "Bridge#sendMessage ->";
      if (!endpoint.context) {
        throw new TypeError(
          `${errFn} Destination must be any one of known destinations`
        );
      }
      return new Promise((resolve, reject) => {
        const payload = {
          data,
          destination: endpoint,
          hops: [],
          id: messageID,
          messageType: "message",
          origin: { context: thisContext, tabId: null },
          timestamp: Date.now(),
          transactionId: (0, import_tiny_uid2.default)()
        };
        openTransactions.set(payload.transactionId, { reject, resolve });
        try {
          handleMessage(payload);
        } catch (error) {
          openTransactions.delete(payload.transactionId);
          reject(error);
        }
      });
    }
  };
};

// src/PortMessage.ts
var PortMessage = class {
  static toBackground(port, message) {
    return port.postMessage(message);
  }
  static toExtensionContext(port, message) {
    return port.postMessage(message);
  }
};

// src/TransportAPI.ts
var API = null;
function initTransportAPI(api) {
  if (API != null) {
    throw new Error(
      'Messaging API already set. Likely you called "initPegasusTransport" twice in the same context.'
    );
  }
  API = api;
}

// src/utils/connection-args.ts
var isValidConnectionArgs = (args, requiredKeys = ["endpointName", "fingerprint"]) => typeof args === "object" && args !== null && requiredKeys.every((k) => k in args);
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
var import_tiny_uid3 = __toESM(require("tiny-uid"), 1);
var createFingerprint = () => `uid::${(0, import_tiny_uid3.default)(7)}`;

// src/utils/internalPacketTypeGuards.ts
function isInternalBroadcastEvent(packet) {
  return packet.messageType === "broadcastEvent";
}
function isInternalMessage(packet) {
  return packet.messageType === "message" || packet.messageType === "reply";
}

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

// background.ts
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
  import_webextension_polyfill.default.runtime.onConnect.addListener((incomingPort) => {
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
    browser: import_webextension_polyfill.default,
    emitBroadcastEvent: eventRuntime.emitBroadcastEvent,
    onBroadcastEvent: eventRuntime.onBroadcastEvent,
    onMessage: messageRuntime.onMessage,
    sendMessage: messageRuntime.sendMessage
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  initPegasusTransport
});
