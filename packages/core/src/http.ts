/**
 * Entorno Hono compartido por la api y las rutas de los módulos.
 * `userId` lo pone un middleware de la api: hoy un usuario fijo, mañana auth.
 * Las rutas nunca lo leen del body ni de la query.
 */
export type HubEnv = {
  Variables: {
    userId: string;
  };
};
