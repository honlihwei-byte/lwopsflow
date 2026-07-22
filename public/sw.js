self.addEventListener("push", (event) => {
  let data = { title: "LW OpsFlow", body: "", url: "/employee/notifications" };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    /* ignore */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: { url: data.url },
      tag: data.tag || "opsflow-notification",
      renotify: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/employee/notifications";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
