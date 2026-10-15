/** Manifiesto con el que un módulo se registra en el hub. */
export interface ServerModule<TRoutes = unknown> {
  /** Prefijo de rutas HTTP: /api/<name> */
  name: string;
  routes: TRoutes;
}
