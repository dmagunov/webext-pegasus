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

// newtab.ts
import browser from "webextension-polyfill";
async function initPegasusTransport() {
  const tab = await browser.tabs.getCurrent();
  if (!tab?.id) {
    throw new Error(
      "Unable to resolve tab ID for newtab context. Ensure initPegasusTransport() is called from a newtab override page."
    );
  }
  const tabId = tab.id;
  const port = createPersistentPort(`newtab@${tabId}`);
  const messageRuntime = createMessageRuntime(
    "newtab",
    async (message) => port.postMessage(message)
  );
  port.onMessage(
    (packet) => internalPacketTypeRouter(packet, { eventRuntime, messageRuntime })
  );
  const eventRuntime = createBroadcastEventRuntime("newtab", async (event) => {
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
