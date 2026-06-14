export function registerPwaServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext && window.location.hostname !== "localhost") return;
  if (window.location.protocol !== "http:" && window.location.protocol !== "https:") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app remains fully usable without the service worker.
    });
  });
}
