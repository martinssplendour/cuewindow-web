(function () {
  const authUserKey = "cuewindow-auth-user-v2";
  const authSessionKey = "cuewindow-auth-session-v1";
  const state = {
    config: window.CUEWINDOW_PUBLIC_CONFIG || {},
    user: readJson(authUserKey),
    session: readJson(authSessionKey),
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function field(form, name) {
    return form.elements.namedItem(name);
  }

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function showNotice(message, type = "info") {
    const notice = $("#siteNotice");
    if (!notice) return;
    notice.textContent = message;
    notice.classList.toggle("error", type === "error");
    notice.hidden = false;
  }

  function setLoading(form, loading) {
    form.querySelectorAll("button, input, textarea").forEach((node) => {
      node.disabled = loading;
    });
  }

  function supabaseConfigured() {
    return Boolean(state.config.supabaseUrl && state.config.supabaseAnonKey);
  }

  function authUrl(path) {
    return `${String(state.config.supabaseUrl || "").replace(/\/+$/, "")}/auth/v1/${path.replace(/^\/+/, "")}`;
  }

  function publicHeaders() {
    return {
      apikey: state.config.supabaseAnonKey,
      Authorization: `Bearer ${state.config.supabaseAnonKey}`,
      "Content-Type": "application/json",
    };
  }

  function userHeaders() {
    return {
      apikey: state.config.supabaseAnonKey,
      Authorization: `Bearer ${state.session?.accessToken || ""}`,
      "Content-Type": "application/json",
    };
  }

  async function parseResponse(response, fallback) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.msg || data?.message || data?.error_description || fallback);
    }
    return data;
  }

  function normalizeUser(user = {}, fallbackName = "") {
    const metadata = user.user_metadata || {};
    return {
      id: user.id || "",
      name: metadata.name || metadata.full_name || fallbackName || user.email?.split("@")[0] || "",
      email: user.email || "",
      created_at: user.created_at || "",
      updated_at: user.updated_at || user.last_sign_in_at || "",
    };
  }

  function normalizeSession(data = {}) {
    const session = data.session || data;
    return {
      accessToken: session.access_token || "",
      refreshToken: session.refresh_token || "",
      expiresAt: session.expires_at || null,
      tokenType: session.token_type || "bearer",
    };
  }

  function persistAuth(user, session) {
    state.user = user;
    state.session = session;
    writeJson(authUserKey, user);
    writeJson(authSessionKey, session);
  }

  function clearAuth() {
    state.user = null;
    state.session = null;
    localStorage.removeItem(authUserKey);
    localStorage.removeItem(authSessionKey);
  }

  async function signIn(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = field(form, "email").value.trim().toLowerCase();
    const password = field(form, "password").value;
    if (!email || !email.includes("@")) return showNotice("Enter a valid email address.", "error");
    if (!password) return showNotice("Enter your password.", "error");
    if (!supabaseConfigured()) return showNotice("Supabase is not configured for this website yet.", "error");

    setLoading(form, true);
    try {
      const response = await fetch(authUrl("token?grant_type=password"), {
        method: "POST",
        headers: publicHeaders(),
        body: JSON.stringify({ email, password }),
      });
      const data = await parseResponse(response, "Could not sign in");
      const session = normalizeSession(data);
      const user = normalizeUser(data.user || data.session?.user, email.split("@")[0]);
      if (!session.accessToken || !user.id) throw new Error("Authentication returned no session");
      persistAuth(user, session);
      window.location.href = "/dashboard/";
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setLoading(form, false);
    }
  }

  async function signUp(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = field(form, "name").value.trim();
    const email = field(form, "email").value.trim().toLowerCase();
    const password = field(form, "password").value;
    if (!name) return showNotice("Enter your name.", "error");
    if (!email || !email.includes("@")) return showNotice("Enter a valid email address.", "error");
    if (password.length < 8) return showNotice("Use a password with at least 8 characters.", "error");
    if (!supabaseConfigured()) return showNotice("Supabase is not configured for this website yet.", "error");

    setLoading(form, true);
    try {
      const response = await fetch(authUrl("signup"), {
        method: "POST",
        headers: publicHeaders(),
        body: JSON.stringify({ email, password, data: { name } }),
      });
      const data = await parseResponse(response, "Could not create account");
      const session = normalizeSession(data);
      if (session.accessToken) {
        persistAuth(normalizeUser(data.user || data.session?.user, name), session);
        window.location.href = "/dashboard/";
        return;
      }
      showNotice("Account created. Check your email if confirmation is enabled, then sign in.");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setLoading(form, false);
    }
  }

  async function requestPasswordReset(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = field(form, "email").value.trim().toLowerCase();
    if (!email || !email.includes("@")) return showNotice("Enter a valid email address.", "error");
    if (!supabaseConfigured()) return showNotice("Supabase is not configured for this website yet.", "error");

    setLoading(form, true);
    try {
      const configuredSiteUrl = String(state.config?.siteUrl || "").replace(/\/+$/, "");
      const redirectTo = configuredSiteUrl ? `${configuredSiteUrl}/reset-password` : `${window.location.origin}/reset-password`;
      const response = await fetch(authUrl(`recover?redirect_to=${encodeURIComponent(redirectTo)}`), {
        method: "POST",
        headers: publicHeaders(),
        body: JSON.stringify({ email }),
      });
      await parseResponse(response, "Could not send reset email");
      showNotice("Password reset email sent. Check your inbox.");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setLoading(form, false);
    }
  }

  function recoverySessionFromUrl() {
    const hash = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
    const accessToken = hash.get("access_token") || "";
    if (!accessToken) return null;
    return {
      accessToken,
      refreshToken: hash.get("refresh_token") || "",
      expiresAt: Number(hash.get("expires_at")) || null,
      tokenType: hash.get("token_type") || "bearer",
    };
  }

  async function setNewPassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = field(form, "password").value;
    const confirmPassword = field(form, "confirmPassword").value;
    if (password.length < 8) return showNotice("Use at least 8 characters.", "error");
    if (password !== confirmPassword) return showNotice("Passwords do not match.", "error");
    if (!state.session?.accessToken) return showNotice("Open the reset link from your email first.", "error");

    setLoading(form, true);
    try {
      const response = await fetch(authUrl("user"), {
        method: "PUT",
        headers: userHeaders(),
        body: JSON.stringify({ password }),
      });
      const user = await parseResponse(response, "Could not update password");
      persistAuth(normalizeUser(user), state.session);
      showNotice("Password updated. Redirecting to your dashboard...");
      setTimeout(() => {
        window.location.href = "/dashboard/";
      }, 700);
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setLoading(form, false);
    }
  }

  function renderDashboard() {
    const signedOut = $("#dashboardSignedOut");
    const signedIn = $("#dashboardSignedIn");
    if (!signedOut || !signedIn) return;
    signedOut.classList.toggle("is-hidden", Boolean(state.user));
    signedIn.classList.toggle("is-hidden", !state.user);
    if (!state.user) return;
    $("#dashboardName").textContent = state.user.name || "CueWindow user";
    $("#dashboardEmail").textContent = state.user.email || "No email available";
    $("#dashboardUserId").textContent = state.user.id || "Not available";
  }

  async function signOut() {
    if (supabaseConfigured() && state.session?.accessToken) {
      fetch(authUrl("logout"), {
        method: "POST",
        headers: userHeaders(),
      }).catch(() => {});
    }
    clearAuth();
    renderDashboard();
    showNotice("Signed out.");
  }

  const svgEye = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const svgEyeOff = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

  function setupPasswordToggles() {
    document.querySelectorAll("[data-toggle-password]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = button.closest(".password-field")?.querySelector("input");
        if (!input) return;
        const visible = input.type === "text";
        input.type = visible ? "password" : "text";
        button.setAttribute("aria-label", visible ? "Show password" : "Hide password");
        button.innerHTML = visible ? svgEye : svgEyeOff;
      });
    });
  }

  function boot() {
    document.querySelectorAll("[data-sign-in-form]").forEach((form) => form.addEventListener("submit", signIn));
    document.querySelectorAll("[data-sign-up-form]").forEach((form) => form.addEventListener("submit", signUp));
    document.querySelectorAll("[data-reset-request-form]").forEach((form) => form.addEventListener("submit", requestPasswordReset));
    document.querySelectorAll("[data-new-password-form]").forEach((form) => form.addEventListener("submit", setNewPassword));
    document.querySelectorAll("[data-sign-out]").forEach((button) => button.addEventListener("click", signOut));
    setupPasswordToggles();

    const recoverySession = recoverySessionFromUrl();
    if (recoverySession) {
      state.session = recoverySession;
      writeJson(authSessionKey, recoverySession);
      $("#resetRequestForm")?.classList.add("is-hidden");
      $("#newPasswordForm")?.classList.remove("is-hidden");
      history.replaceState(null, "", "/reset-password/");
    }

    renderDashboard();
  }

  boot();
})();
