import browser from 'webextension-polyfill';

import {createBroadcastEventRuntime} from './src/BroadcastEventRuntime';
import {createMessageRuntime} from './src/MessageRuntime';
import {createPersistentPort} from './src/PersistentPort';
import {initTransportAPI} from './src/TransportAPI';
import {internalPacketTypeRouter} from './src/utils/internalPacketTypeRouter';

export async function initPegasusTransport(): Promise<void> {
  const tab = await browser.tabs.getCurrent();
  if (!tab?.id) {
    throw new Error(
      'Unable to resolve tab ID for newtab context. ' +
        'Ensure initPegasusTransport() is called from a newtab override page.',
    );
  }

  const tabId = tab.id;
  const port = createPersistentPort(`newtab@${tabId}`);
  const messageRuntime = createMessageRuntime('newtab', async (message) =>
    port.postMessage(message),
  );

  port.onMessage((packet) =>
    internalPacketTypeRouter(packet, {eventRuntime, messageRuntime}),
  );

  const eventRuntime = createBroadcastEventRuntime('newtab', async (event) => {
    port.postMessage(event);
  });

  initTransportAPI({
    browser: browser,
    emitBroadcastEvent: eventRuntime.emitBroadcastEvent,
    onBroadcastEvent: eventRuntime.onBroadcastEvent,
    onMessage: messageRuntime.onMessage,
    sendMessage: messageRuntime.sendMessage,
  });
}
