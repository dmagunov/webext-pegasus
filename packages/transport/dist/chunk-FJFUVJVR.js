// src/post-message/message-port.ts
var promise;
var getMessagePort = (thisContext, namespace, onMessage) => promise ??= new Promise((resolve) => {
  const acceptMessagingPort = (event) => {
    const {
      data: { cmd, scope, context },
      ports
    } = event;
    if (cmd === "webext-port-offer" && scope === namespace && context !== thisContext) {
      window.removeEventListener("message", acceptMessagingPort);
      ports[0].onmessage = onMessage;
      ports[0].postMessage("port-accepted");
      return resolve(ports[0]);
    }
  };
  const offerMessagingPort = () => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      if (event.data === "port-accepted") {
        window.removeEventListener("message", acceptMessagingPort);
        return resolve(channel.port1);
      }
      onMessage?.(event);
    };
    window.postMessage(
      {
        cmd: "webext-port-offer",
        context: thisContext,
        scope: namespace
      },
      "*",
      [channel.port2]
    );
  };
  window.addEventListener("message", acceptMessagingPort);
  if (thisContext === "window") {
    setTimeout(offerMessagingPort, 0);
  } else {
    offerMessagingPort();
  }
});

// src/post-message/index.ts
var usePostMessaging = (thisContext) => {
  let allocatedNamespace;
  let messagingEnabled = false;
  let onMessageCallback;
  let portP;
  return {
    enable: () => messagingEnabled = true,
    onMessage: (cb) => onMessageCallback = cb,
    postMessage: async (msg) => {
      if (thisContext !== "content-script" && thisContext !== "window") {
        throw new Error("Endpoint does not use postMessage");
      }
      if (!messagingEnabled) {
        throw new Error("Communication with window has not been allowed");
      }
      ensureNamespaceSet(allocatedNamespace);
      return (await portP).postMessage(msg);
    },
    setNamespace: (nsps) => {
      if (allocatedNamespace) {
        throw new Error("Namespace once set cannot be changed");
      }
      allocatedNamespace = nsps;
      portP = getMessagePort(
        thisContext,
        nsps,
        ({ data }) => onMessageCallback?.(data)
      );
    }
  };
};
function ensureNamespaceSet(namespace) {
  if (typeof namespace !== "string" || namespace.trim().length === 0) {
    throw new Error(
      `pegasus-transport uses window.postMessage to talk with other "window"(s) for message routingwhich is global/conflicting operation in case there are other scripts using pegasus-transport. Call initPegasusTransport({namespace}) (in window) or initPegasusTransport({allowWindowMessagingForNamespace}) (in content-script) to isolate your app. Example: setNamespace('com.facebook.react-devtools'). Make sure to use same namespace across all your scripts whereever window.postMessage is likely to be used\``
    );
  }
}

export {
  usePostMessaging
};
