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

// content-script.ts
var content_script_exports = {};
__export(content_script_exports, {
  initPegasusTransport: () => initPegasusTransport
});
module.exports = __toCommonJS(content_script_exports);
var import_webextension_polyfill2 = __toESM(require("webextension-polyfill"), 1);

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

// src/PersistentPort.ts
var import_webextension_polyfill = __toESM(require("webextension-polyfill"), 1);

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

// src/PersistentPort.ts
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
    port = import_webextension_polyfill.default.runtime.connect({
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

// src/post-message/message-port.ts
var promise;
var getMessagePort = (thisContext, namespace, onMessage) => promise ??= new Promise((resolve) => {
  const acceptMessagingPort = (event) => {
    const {
      data: { cmd, scope, context },
      ports
    } = event;
    if (cmd === "webext-port-offer" && scope === namespace && context !== thisContext) {
      window.removeEventListener("message", acceptMessagingPort);
      ports[0].onmessage = onMessage;
      ports[0].postMessage("port-accepted");
      return resolve(ports[0]);
    }
  };
  const offerMessagingPort = () => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      if (event.data === "port-accepted") {
        window.removeEventListener("message", acceptMessagingPort);
        return resolve(channel.port1);
      }
      onMessage?.(event);
    };
    window.postMessage(
      {
        cmd: "webext-port-offer",
        context: thisContext,
        scope: namespace
      },
      "*",
      [channel.port2]
    );
  };
  window.addEventListener("message", acceptMessagingPort);
  if (thisContext === "window") {
    setTimeout(offerMessagingPort, 0);
  } else {
    offerMessagingPort();
  }
});

// src/post-message/index.ts
var usePostMessaging = (thisContext) => {
  let allocatedNamespace;
  let messagingEnabled = false;
  let onMessageCallback;
  let portP;
  return {
    enable: () => messagingEnabled = true,
    onMessage: (cb) => onMessageCallback = cb,
    postMessage: async (msg) => {
      if (thisContext !== "content-script" && thisContext !== "window") {
        throw new Error("Endpoint does not use postMessage");
      }
      if (!messagingEnabled) {
        throw new Error("Communication with window has not been allowed");
      }
      ensureNamespaceSet(allocatedNamespace);
      return (await portP).postMessage(msg);
    },
    setNamespace: (nsps) => {
      if (allocatedNamespace) {
        throw new Error("Namespace once set cannot be changed");
      }
      allocatedNamespace = nsps;
      portP = getMessagePort(
        thisContext,
        nsps,
        ({ data }) => onMessageCallback?.(data)
      );
    }
  };
};
function ensureNamespaceSet(namespace) {
  if (typeof namespace !== "string" || namespace.trim().length === 0) {
    throw new Error(
      `pegasus-transport uses window.postMessage to talk with other "window"(s) for message routingwhich is global/conflicting operation in case there are other scripts using pegasus-transport. Call initPegasusTransport({namespace}) (in window) or initPegasusTransport({allowWindowMessagingForNamespace}) (in content-script) to isolate your app. Example: setNamespace('com.facebook.react-devtools'). Make sure to use same namespace across all your scripts whereever window.postMessage is likely to be used\``
    );
  }
}

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

// content-script.ts
function initPegasusTransport({
  allowWindowMessagingForNamespace
} = {}) {
  const win = usePostMessaging("content-script");
  const port = createPersistentPort();
  const messageRuntime = createMessageRuntime(
    "content-script",
    async (message) => {
      if (message.destination.context === "window" && // if the message is addressed to the window, we need to make sure
      // that current content script is the top level script
      window.top === window && // If the message is addressed to the specific tab, we need to pass it to background script
      // first to forward it to the correct tab / frame
      !message.destination.tabId && !message.destination.frameId) {
        await win.postMessage(message);
      } else {
        port.postMessage(message);
      }
    }
  );
  const eventRuntime = createBroadcastEventRuntime(
    "content-script",
    async (event) => {
      port.postMessage(event);
    },
    async (event) => win.postMessage(event)
  );
  win.onMessage((message) => {
    if ("type" in message && "transactionID" in message) {
      messageRuntime.endTransaction(message.transactionID);
    } else {
      const payload = Object.assign({}, message, {
        origin: {
          // a message event inside `content-script` means a script inside `window` dispatched it to be forwarded
          // so we're making sure that the origin is not tampered (i.e script is not masquerading it's true identity)
          context: "window",
          tabId: null
        }
      });
      internalPacketTypeRouter(payload, { eventRuntime, messageRuntime });
    }
  });
  port.onMessage(
    (packet) => internalPacketTypeRouter(packet, { eventRuntime, messageRuntime })
  );
  port.onFailure((message) => {
    if (message.origin.context === "window") {
      win.postMessage({
        transactionID: message.transactionId,
        type: "error"
      });
      return;
    }
    messageRuntime.endTransaction(message.transactionId);
  });
  if (allowWindowMessagingForNamespace) {
    win.setNamespace(allowWindowMessagingForNamespace);
    win.enable();
  }
  initTransportAPI({
    browser: import_webextension_polyfill2.default,
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
