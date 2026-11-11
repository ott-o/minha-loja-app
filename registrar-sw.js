const nativo = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
if (!nativo && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
