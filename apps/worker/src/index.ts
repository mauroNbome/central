// Proceso aparte para jobs en segundo plano (sync de calendario, LLM,
// recordatorios): las llamadas externas no deben bloquear requests de la api.
// Sin jobs todavía; se suma un script "dev" cuando exista el primero.
console.log("worker: sin jobs registrados");
