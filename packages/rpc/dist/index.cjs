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
var rpc_exports = {};
__export(rpc_exports, {
  getRPCService: () => getRPCService,
  registerRPCService: () => registerRPCService
});
module.exports = __toCommonJS(rpc_exports);

// src/RPCServices.ts
var import_transport2 = require("@webext-pegasus/transport");

// src/utils/createProxy.ts
var import_transport = require("@webext-pegasus/transport");
function createProxy(messageKey, destination, path) {
  const wrapped = () => {
  };
  const proxy = new Proxy(wrapped, {
    // Executed when the object is called as a function
    apply(_target, _thisArg, args) {
      const { sendMessage } = (0, import_transport.definePegasusMessageBus)();
      return sendMessage(
        messageKey,
        {
          args,
          path: path ?? null
        },
        destination
      );
    },
    // Executed when accessing a property on an object
    get(target, propertyName, receiver) {
      if (propertyName === "__proxy" || typeof propertyName === "symbol") {
        return Reflect.get(target, propertyName, receiver);
      }
      return createProxy(
        messageKey,
        destination,
        path == null ? propertyName : `${path}.${propertyName}`
      );
    }
  });
  proxy.__proxy = true;
  return proxy;
}

// src/utils/getMessageKey.ts
function getMessageKey(serviceName) {
  return `pegasus-rpc-service.${serviceName}`;
}

// src/RPCServices.ts
var RegisteredServices = /* @__PURE__ */ new Set();
function getRPCService(serviceName, destination) {
  return createProxy(getMessageKey(serviceName), destination);
}
function registerRPCService(serviceName, service) {
  if (RegisteredServices.has(serviceName)) {
    throw new Error(`Service ${serviceName} already registered`);
  }
  const messageKey = getMessageKey(serviceName);
  const pegasusService = service;
  const { onMessage } = (0, import_transport2.definePegasusMessageBus)();
  onMessage(messageKey, ({ data, ...message }) => {
    if (typeof data !== "object" || data == null || !("path" in data) || !("args" in data) || !Array.isArray(data.args)) {
      throw new Error(
        `Invalid message received for pegasus-rpc-service "${serviceName}": ${JSON.stringify(
          data,
          void 0,
          2
        )}`
      );
    }
    const path = data.path == null || typeof data.path !== "string" ? null : data.path;
    const serviceCb = path == null ? pegasusService : pegasusService[path];
    if (typeof serviceCb !== "function") {
      throw new Error(
        `Invalid message received for pegasus-rpc-service "${serviceName}": ${path != null ? `Can't find method "${path}` : "Expected service to be a function"}"`
      );
    }
    return Promise.resolve(serviceCb.bind(service)(message, ...data.args));
  });
  RegisteredServices.add(serviceName);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getRPCService,
  registerRPCService
});
