(() => {
  "use strict";

  const APP_PAGE = "./configurateur.html";
  const SESSION_KEY = "rosebuds-online-access-v04";
  const CREDENTIAL_SALT = "rosebuds-configurator-v1";
  const CREDENTIAL_HASH = "773378c2ea078c94a654dac3bc5aba02721f3e4cc682f7160cce46c653873e9c";

  const form = document.getElementById("access-form");
  const usernameInput = document.getElementById("access-username");
  const passwordInput = document.getElementById("access-password");
  const errorMessage = document.getElementById("access-error");
  const submitButton = document.getElementById("access-submit");

  function applicationUrl() {
    const query = new URLSearchParams(window.location.search);
    query.delete("logout");
    const suffix = query.size ? `?${query.toString()}` : "";
    return `${APP_PAGE}${suffix}${window.location.hash}`;
  }

  function openApplication() {
    window.location.replace(applicationUrl());
  }

  async function sha256(value) {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  const query = new URLSearchParams(window.location.search);
  if (query.get("logout") === "1") sessionStorage.removeItem(SESSION_KEY);

  if (sessionStorage.getItem(SESSION_KEY) === "granted") {
    openApplication();
    return;
  }

  window.requestAnimationFrame(() => usernameInput.focus());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorMessage.textContent = "";
    submitButton.disabled = true;
    submitButton.textContent = "Vérification...";

    try {
      if (!window.crypto?.subtle) {
        throw new Error("La vérification sécurisée n'est pas disponible dans ce navigateur.");
      }

      const candidate = `${CREDENTIAL_SALT}|${usernameInput.value.trim()}|${passwordInput.value}`;
      if ((await sha256(candidate)) !== CREDENTIAL_HASH) {
        passwordInput.value = "";
        passwordInput.focus();
        errorMessage.textContent = "Identifiant ou mot de passe incorrect.";
        return;
      }

      sessionStorage.setItem(SESSION_KEY, "granted");
      openApplication();
    } catch (error) {
      errorMessage.textContent = error?.message || "La connexion n'a pas pu être vérifiée.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Accéder au configurateur";
    }
  });
})();
