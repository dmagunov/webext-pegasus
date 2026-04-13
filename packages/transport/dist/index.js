import {
  getTransportAPI
} from "./chunk-MDHNL3MP.js";

// src/definePegasusBrowserAPI.ts
function definePegasusBrowserAPI() {
  const { browser } = getTransportAPI();
  return browser;
}

// src/definePegasusEventBus.ts
function definePegasusEventBus() {
  const { onBroadcastEvent, emitBroadcastEvent } = getTransportAPI();
  return {
    emitBroadcastEvent,
    onBroadcastEvent
  };
}

// src/definePegasusMessageBus.ts
function definePegasusMessageBus() {
  const { onMessage, sendMessage } = getTransportAPI();
  return { onMessage, sendMessage };
}

// src/isInternalEndpoint.ts
var internalEndpoints = [
  "background",
  "devtools",
  "content-script",
  "newtab",
  "options",
  "popup",
  "sidepanel"
];
var isInternalEndpoint = ({ context: ctx }) => internalEndpoints.includes(ctx);
export {
  definePegasusBrowserAPI,
  definePegasusEventBus,
  definePegasusMessageBus,
  isInternalEndpoint
};
