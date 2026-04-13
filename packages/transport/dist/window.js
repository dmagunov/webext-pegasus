import {
  usePostMessaging
} from "./chunk-FJFUVJVR.js";
import {
  createBroadcastEventRuntime,
  createMessageRuntime,
  isInternalBroadcastEvent,
  isInternalMessage
} from "./chunk-T4RVFDRH.js";
import {
  initTransportAPI
} from "./chunk-MDHNL3MP.js";

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
export {
  initPegasusTransport
};
