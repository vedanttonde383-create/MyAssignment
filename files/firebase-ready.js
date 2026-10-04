window.firebaseReady = new Promise((resolve, reject) => {
  window.resolveFirebaseReady = resolve;
  window.rejectFirebaseReady = reject;
  setTimeout(() => reject(new Error("Firebase did not initialize. Check your network and Firebase configuration.")), 15000);
});