import type { User } from '@folio/shared';

export type Env = {
  Bindings: { DB: D1Database; SESSION_SECRET: string; APP_ORIGIN: string; ENVIRONMENT: string };
  Variables: { session: string; user: User };
};
