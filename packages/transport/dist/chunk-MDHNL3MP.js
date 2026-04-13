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
function getTransportAPI() {
  if (API == null) {
    throw new Error(
      `Messaging API wan't set. Make sure you called "initPegasusTransport" within current context before using @webext-pegasus packages.`
    );
  }
  return API;
}

export {
  initTransportAPI,
  getTransportAPI
};
