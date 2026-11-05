// The gateway's own SIGINT and SIGTERM handlers, told apart from those a library
// adds for itself: the Spectrum client removes Spectrum's handlers once its app is
// built and never these, even when one is registered while an app is being built.
const gatewayShutdownListeners = new WeakSet<NodeJS.SignalsListener>();

export function onShutdownSignals(listener: () => void): () => void {
  gatewayShutdownListeners.add(listener);
  process.on('SIGTERM', listener);
  process.on('SIGINT', listener);

  return () => {
    process.off('SIGTERM', listener);
    process.off('SIGINT', listener);
  };
}

export function isGatewayShutdownListener(listener: NodeJS.SignalsListener): boolean {
  return gatewayShutdownListeners.has(listener);
}
