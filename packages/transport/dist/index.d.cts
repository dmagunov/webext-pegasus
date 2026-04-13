import { Browser } from 'webextension-polyfill';
import { JsonValue } from 'type-fest';

declare function definePegasusBrowserAPI(): Browser | null;

type RuntimeContext = 'devtools' | 'background' | 'popup' | 'sidepanel' | 'newtab' | 'options' | 'content-script' | 'window';
interface Endpoint {
    context: RuntimeContext;
    tabId: number | null;
    frameId?: number;
}
type Destination = Endpoint | RuntimeContext | string;
interface PegasusMessage<TData extends JsonValue> {
    /**
     * The data that was passed into `sendMessage`
     */
    data: TData;
    id: string;
    timestamp: number;
    sender: Endpoint;
}
type OnMessageCallback<TProtocolMap extends Record<string, any> = Record<string, any>, TType extends keyof TProtocolMap = never> = (message: PegasusMessage<GetMessageProtocolDataType<TProtocolMap[TType]>>) => MaybePromise<GetMessageProtocolReturnType<TProtocolMap[TType]>>;

interface TransportMessagingAPI<TProtocolMap extends Record<string, any> = Record<string, any>> {
    /**
     * Sends a message to some other part of your extension.
     *
     * Notes:
     * - If there is no listener on the other side an error will be thrown where sendMessage was called.
     * - Listener on the other may want to reply. Get the reply by awaiting the returned Promise
     * - An error thrown in listener callback (in the destination context) will behave as usual, that is, bubble up, but the same error will also be thrown where sendMessage was called
     * - If the listener receives the message but the destination disconnects (tab closure for exmaple) before responding, sendMessage will throw an error in the sender context.
     */
    sendMessage: <TType extends keyof TProtocolMap>(messageID: TType, data: GetMessageProtocolDataType<TProtocolMap[TType]>, destination?: Destination) => Proimsify<GetMessageProtocolReturnType<TProtocolMap[TType]>>;
    /**
     * Register one and only one listener, per messageId per context. That will be called upon sendMessage from other side.
     * Optionally, send a response to sender by returning any value or if async a Promise.
     */
    onMessage: <TType extends keyof TProtocolMap>(messageID: TType, callback: OnMessageCallback<TProtocolMap, TType>) => RemoveListenerCallback;
}
interface TransportBroadcastEventAPI<TProtocolMap extends Record<string, any> = Record<string, any>> {
    /**
     * Broadcast Channel API alternative for browser extensions
     * Allows basic communication between extension contexts (that is, windows, popups, devtools, content-scripts, background, etc...)
     */
    onBroadcastEvent: <TType extends keyof TProtocolMap>(eventID: TType, callback: (event: PegasusMessage<TProtocolMap[TType]>) => void) => () => void;
    /**
     * Broadcast Channel API alternative for browser extensions
     * Allows basic communication between extension contexts (that is, windows, popups, devtools, content-scripts, background, etc...)
     *
     * Emits an event, which can be of any kind of serialazible Object, to "every" listener in any extension context with the same extension.
     */
    emitBroadcastEvent: <TType extends keyof TProtocolMap>(eventID: TType, data: TProtocolMap[TType]) => Promise<void>;
}
/**
 * Call to ensure an active listener has been removed.
 *
 * If the listener has already been removed with `Messenger.removeAllListeners`, this is a noop.
 */
type RemoveListenerCallback = () => void;
/**
 * Either a Promise of a type, or that type directly. Used to indicate that a method can by sync or
 * async.
 */
type MaybePromise<T> = Promise<T> | T;
/**
 * Given a function declaration, `ProtocolWithReturn`, or a value, return the message's data type.
 */
type GetMessageProtocolDataType<T> = T extends (...args: infer Args) => any ? Args['length'] extends 0 | 1 ? Args[0] : never : T extends any ? T : never;
/**
 * Given a function declaration, `ProtocolWithReturn`, or a value, return the message's return type.
 */
type GetMessageProtocolReturnType<T> = T extends (...args: any[]) => infer R ? R : void;
/**
 * Proimsify<T> returns Promise<T> if it is not a promise, otherwise it returns T.
 */
type Proimsify<T> = T extends Promise<unknown> ? T : Promise<T>;

declare const MissingProtocolMap$1: unique symbol;
type MissingProtocolMapType$1 = typeof MissingProtocolMap$1;
type PegasusMessagingReturnType$1<TProtocolMap extends Record<string, any>> = [
    TProtocolMap
] extends [never] ? MissingProtocolMapType$1 : TransportBroadcastEventAPI<TProtocolMap>;
declare function definePegasusEventBus<TProtocolMap extends Record<string, any> = never>(): PegasusMessagingReturnType$1<TProtocolMap>;

declare const MissingProtocolMap: unique symbol;
type MissingProtocolMapType = typeof MissingProtocolMap;
type PegasusMessagingReturnType<TProtocolMap extends Record<string, any>> = [
    TProtocolMap
] extends [never] ? MissingProtocolMapType : TransportMessagingAPI<TProtocolMap>;
declare function definePegasusMessageBus<TProtocolMap extends Record<string, any> = never>(): PegasusMessagingReturnType<TProtocolMap>;

declare const isInternalEndpoint: ({ context: ctx }: Endpoint) => boolean;

export { type Destination, type Endpoint, type OnMessageCallback, type PegasusMessage, type RuntimeContext, definePegasusBrowserAPI, definePegasusEventBus, definePegasusMessageBus, isInternalEndpoint };
