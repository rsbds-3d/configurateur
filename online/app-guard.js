(() => {
  "use strict";

  const SESSION_KEY = "rosebuds-online-access-v04";
  if (window.sessionStorage.getItem(SESSION_KEY) === "granted") return;

  const destination = `./${window.location.search}${window.location.hash}`;
  window.location.replace(destination);
})();
