export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'DELETE' | 'OPTIONS';
export type RouteGroup = 'api' | 'chat';

export interface RouteContract {
  readonly id: string;
  readonly methods: readonly HttpMethod[];
  /** Ruta canónica publicada. */
  readonly path: string;
  /** Variantes aceptadas por el router: sin distinguir mayúsculas y con slash final opcional. */
  readonly pattern: RegExp;
  readonly group: RouteGroup;
}

export const routes = {
  health: {
    id: 'health',
    methods: ['GET', 'HEAD'],
    path: '/api/health',
    pattern: /^\/api\/health\/?$/i,
    group: 'api',
  },
  contact: {
    id: 'contact',
    methods: ['POST'],
    path: '/api/contact',
    pattern: /^\/api\/contact\/?$/i,
    group: 'api',
  },
  subscribe: {
    id: 'subscribe',
    methods: ['POST'],
    path: '/api/subscriptions',
    pattern: /^\/api\/subscriptions\/?$/i,
    group: 'api',
  },
  unsubscribe: {
    id: 'unsubscribe',
    methods: ['DELETE'],
    path: '/api/subscriptions',
    pattern: /^\/api\/subscriptions\/?$/i,
    group: 'api',
  },
  chatStarters: {
    id: 'chatStarters',
    methods: ['GET', 'HEAD'],
    path: '/api/chat/starters',
    pattern: /^\/api\/chat\/starters\/?$/i,
    group: 'chat',
  },
  chat: {
    id: 'chat',
    methods: ['POST'],
    path: '/api/chat',
    pattern: /^\/api\/chat\/?$/i,
    group: 'chat',
  },
} as const satisfies Record<string, RouteContract>;

export type OperationId = keyof typeof routes;

export function matchesRoute(route: RouteContract, method: string, rawPath: string): boolean {
  return route.methods.includes(method as HttpMethod) && route.pattern.test(rawPath);
}
