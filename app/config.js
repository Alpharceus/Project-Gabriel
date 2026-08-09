// Deployment config. On Firebase Hosting the SDK config is auto-served from
// /__/firebase/init.json, so only the FCM web-push key belongs here.
// Fill after project setup: Firebase console → Project settings →
// Cloud Messaging → Web Push certificates → key pair.
export const CONFIG = {
  vapidKey: "BErHO6kVPQ9Wz2Y3dbzC60Rbt4aoY6yGtEPFEti11UttVz-jUmLiGzx_2HQfYa5gXp-4jzRAHCOVSD5Ehd5fhoU",
  // Optional override when NOT hosted on Firebase Hosting:
  // firebase: { apiKey: "...", authDomain: "...", projectId: "...",
  //             messagingSenderId: "...", appId: "..." },
  firebase: null,
};
