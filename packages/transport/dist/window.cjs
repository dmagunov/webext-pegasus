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

// window.ts
var window_exports = {};
__export(window_exports, {
  initPegasusTransport: () => initPegasusTransport
});
module.exports = __toCommonJS(window_exports);

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

// window.ts
function initPegasusTransport({ namespace } = {}) {
  const win = usePostMessaging("window");
  const messageRuntime = createMessageRuntime(
    "window",
    (message) => win.postMessage(message)
  );
  const eventRuntime = createBroadcastEventRuntime(
    "window",
    (event) => win.postMessage(event)
  );
  win.onMessage((msg) => {
    if ("type" in msg && "transactionID" in msg) {
      messageRuntime.endTransaction(msg.transactionID);
    } else if (isInternalBroadcastEvent(msg)) {
      eventRuntime.handleEvent(msg);
    } else if (isInternalMessage(msg)) {
      messageRuntime.handleMessage(msg);
    } else {
      throw new TypeError("Unknown message type");
    }
  });
  if (namespace) {
    win.setNamespace(namespace);
    win.enable();
  }
  initTransportAPI({
    browser: null,
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
