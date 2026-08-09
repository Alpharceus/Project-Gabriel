// Deployment config. On Firebase Hosting the SDK config is auto-served from
// /__/firebase/init.json, so only the FCM web-push key belongs here.
// Fill after project setup: Firebase console → Project settings →
// Cloud Messaging → Web Push certificates → key pair.
export const CONFIG = {
  vapidKey: "",
  // Optional override when NOT hosted on Firebase Hosting:
  // firebase: { apiKey: "...", authDomain: "...", projectId: "...",
  //             messagingSenderId: "...", appId: "..." },
  firebase: null,
};
