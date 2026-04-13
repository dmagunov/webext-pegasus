// src/BroadcastEventRuntime.ts
import { serializeError } from "serialize-error";
import uuid from "tiny-uid";
var createBroadcastEventRuntime = (thisContext, routeEvent, localEvent) => {
  const runtimeId = uuid();
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
          `Error(s) occurred while handling broadcast event ${eventID}: ${errs.map((err) => serializeError(err)).join(", ")}`
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
        transactionId: uuid()
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
import { serializeError as serializeError2 } from "serialize-error";
import uuid2 from "tiny-uid";
var createMessageRuntime = (thisContext, routeMessage, localMessage) => {
  const runtimeId = uuid2();
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
            message.err = serializeError2(err);
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
          transactionId: uuid2()
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

// src/utils/internalPacketTypeGuards.ts
function isInternalBroadcastEvent(packet) {
  return packet.messageType === "broadcastEvent";
}
function isInternalMessage(packet) {
  return packet.messageType === "message" || packet.messageType === "reply";
}

export {
  createBroadcastEventRuntime,
  deserializeEndpoint,
  serializeEndpoint,
  createMessageRuntime,
  isInternalBroadcastEvent,
  isInternalMessage
};
