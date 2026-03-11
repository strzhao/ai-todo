// Service Worker for AI Todo push notifications

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag,
    data: data.data || {},
  };

  event.waitUntil(self.registration.showNotification(data.title || "AI Todo", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Try to reuse an existing window
        for (const client of clientList) {
          if (client.url.includes(self.location.origin)) {
            client.navigate(url);
            client.focus();
            return;
          }
        }
        self.clients.openWindow(url);
      })
  );
});
