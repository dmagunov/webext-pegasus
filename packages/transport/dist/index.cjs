"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// index.ts
var transport_exports = {};
__export(transport_exports, {
  definePegasusBrowserAPI: () => definePegasusBrowserAPI,
  definePegasusEventBus: () => definePegasusEventBus,
  definePegasusMessageBus: () => definePegasusMessageBus,
  isInternalEndpoint: () => isInternalEndpoint
});
module.exports = __toCommonJS(transport_exports);

// src/TransportAPI.ts
var API = null;
function getTransportAPI() {
  if (API == null) {
    throw new Error(
      `Messaging API wan't set. Make sure you called "initPegasusTransport" within current context before using @webext-pegasus packages.`
    );
  }
  return API;
}

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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  definePegasusBrowserAPI,
  definePegasusEventBus,
  definePegasusMessageBus,
  isInternalEndpoint
});
