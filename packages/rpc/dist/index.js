// src/RPCServices.ts
import { definePegasusMessageBus as definePegasusMessageBus2 } from "@webext-pegasus/transport";

// src/utils/createProxy.ts
import { definePegasusMessageBus } from "@webext-pegasus/transport";
function createProxy(messageKey, destination, path) {
  const wrapped = () => {
  };
  const proxy = new Proxy(wrapped, {
    // Executed when the object is called as a function
    apply(_target, _thisArg, args) {
      const { sendMessage } = definePegasusMessageBus();
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
  const { onMessage } = definePegasusMessageBus2();
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
export {
  getRPCService,
  registerRPCService
};
