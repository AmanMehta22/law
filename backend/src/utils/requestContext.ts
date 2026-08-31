import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  services: string[];
  route: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function pushService(name: string) {
  const ctx = requestContext.getStore();
  if (ctx && !ctx.services.includes(name)) {
    ctx.services.push(name);
  }
}

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}
