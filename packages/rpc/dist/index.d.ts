import { JsonValue } from 'type-fest';

type RuntimeContext = 'devtools' | 'background' | 'popup' | 'sidepanel' | 'newtab' | 'options' | 'content-script' | 'window';
interface Endpoint {
    context: RuntimeContext;
    tabId: number;
    frameId?: number;
}
type Destination = Endpoint | RuntimeContext | string;
interface PegasusRPCMessage {
    sender: Endpoint;
    id: string;
    timestamp: number;
}
/**
 * Tail<T> returns a tuple with the first element removed
 * so Tail<[1, 2, 3]> is [2, 3]
 * (works by using rest tuples)
 */
type Tail<T> = T extends [unknown, ...infer TailType] ? TailType : T;
/**
 * Head<T> returns first element type
 * so Head<[1, 2, 3]> is 1
 * (works by using rest tuples)
 */
type Head<T> = T extends [infer HeadType, ...unknown[]] ? HeadType : T;
/**
 * Proimsify<T> returns Promise<T> if it is not a promise, otherwise it returns T.
 */
type Proimsify<T> = T extends Promise<unknown> ? T : Promise<T>;
/**
 * A type that ensures a service has only async methods.
 * - ***If all methods are async***, it returns the original type.
 * - ***If the service has non-async methods***, it returns a `DeepAsync` of the service.
 */
type PegasusRPCService<TService> = TService extends DeepAsync<TService> ? TService : DeepAsync<TService>;
/**
 * A recursive type that deeply converts all methods in `TService` to be async.
 */
type DeepAsync<TService> = TService extends (...args: any) => unknown ? ToAsyncFunction<TService> : TService extends {
    [key: string]: any;
} ? {
    [fn in keyof TService]: DeepAsync<TService[fn]>;
} : never;
type ToAsyncFunction<T extends (...args: unknown[]) => unknown> = (...args: Tail<Parameters<T>>) => Proimsify<ReturnType<T>>;
type Unpacked<T> = T extends Array<infer U> ? U : T extends ReadonlyArray<infer U> ? U : T;
type GoodFuncParamType = JsonValue | unknown;
type GoodFuncReturnType = Promise<JsonValue> | JsonValue | void | Promise<void>;
type GoodParamsHead<T> = Head<T> extends PegasusRPCMessage ? any : unknown;
type GoodParamsTail<T> = Tail<T> extends [] ? GoodParamsHead<T> : [Exclude<Unpacked<Tail<T>>, GoodFuncParamType>] extends [never] ? GoodParamsHead<T> : unknown;
type GoodParams<T> = T extends GoodParamsHead<T> ? GoodParamsTail<T> : never;
type GoodFunc<T extends (...args: any) => any> = (...args: GoodParams<Parameters<T>>[]) => GoodFuncReturnType;
type IPegasusRPCServiceInternal<T> = {
    [K in keyof T]: T[K] extends (...args: any) => any ? GoodFunc<T[K]> : never;
};
type IPegasusRPCService<T> = T extends (...args: any) => any ? GoodFunc<T> : IPegasusRPCServiceInternal<T>;

declare function getRPCService<TService extends IPegasusRPCService<unknown> & object & Check, Check = TService extends IPegasusRPCService<TService> ? unknown : never>(serviceName: string, destination: Destination): PegasusRPCService<TService>;
declare function registerRPCService<TService extends IPegasusRPCService<unknown> & object & Check, Check = TService extends IPegasusRPCService<TService> ? unknown : never>(serviceName: string, service: TService): void;

export { type Destination, type Endpoint, type IPegasusRPCService, type PegasusRPCMessage, type PegasusRPCService, type RuntimeContext, getRPCService, registerRPCService };
