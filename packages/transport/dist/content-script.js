import {
  createPersistentPort
} from "./chunk-MGKVAXGD.js";
import {
  internalPacketTypeRouter
} from "./chunk-HLFR4LBZ.js";
import {
  usePostMessaging
} from "./chunk-FJFUVJVR.js";
import {
  createBroadcastEventRuntime,
  createMessageRuntime
} from "./chunk-T4RVFDRH.js";
import {
  initTransportAPI
} from "./chunk-MDHNL3MP.js";

// content-script.ts
import browser from "webextension-polyfill";
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
