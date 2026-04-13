import {
  createPersistentPort
} from "./chunk-MGKVAXGD.js";
import {
  internalPacketTypeRouter
} from "./chunk-HLFR4LBZ.js";
import {
  createBroadcastEventRuntime,
  createMessageRuntime
} from "./chunk-T4RVFDRH.js";
import {
  initTransportAPI
} from "./chunk-MDHNL3MP.js";

// options.ts
import browser from "webextension-polyfill";
function initPegasusTransport() {
  const port = createPersistentPort("options");
  const messageRuntime = createMessageRuntime(
    "options",
    async (message) => port.postMessage(message)
  );
  port.onMessage(
    (packet) => internalPacketTypeRouter(packet, { eventRuntime, messageRuntime })
  );
  const eventRuntime = createBroadcastEventRuntime("options", async (event) => {
    port.postMessage(event);
  });
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
