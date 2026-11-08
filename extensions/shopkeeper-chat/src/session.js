export function createSessionClient({ root, proxy, preview, setConnection, onEndSession, onSessionChanged, onMessages }) {
  var storageKey = "shopkeeper-chat:" + root.dataset.shop;
  var session = null;
  var poller = null;
  function stored() {
    try { return JSON.parse(localStorage.getItem(storageKey) || "null"); } catch (e) { return null; }
  }

  function store(value) {
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  function timedFetch(url, options) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 15000);
    return fetch(url, Object.assign({}, options, { signal: controller.signal })).finally(function () {
      clearTimeout(timer);
    });
  }

  function endSession(disabled) {
    session = null;
    store(null);
    if (poller) { clearInterval(poller); poller = null; }
    onEndSession(disabled);
  }

  var refreshing = null;
  function requestSession() {
    if (preview) {
      startPreview();
      setConnection("");
      return Promise.resolve(session);
    }
    if (refreshing) return refreshing;
    var prior = stored() || {};
    refreshing = timedFetch(proxy + "/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: prior.sessionId || null,
        resumeToken: prior.resumeToken || null,
        pageUrl: root.dataset.pageUrl || location.href,
        locale: document.documentElement.lang || null
      })
    }).then(function (r) {
      if (r.status === 403) { endSession(true); return null; }
      if (!r.ok) throw new Error("bootstrap " + r.status);
      return r.json();
    }).then(function (data) {
      if (!data) return null;
      session = data;
      setConnection("");
      if (data.sessionId) {
        store({ sessionId: data.sessionId, resumeToken: data.resumeToken || prior.resumeToken });
      }
      return data;
    }).finally(function () {
      refreshing = null;
    });
    return refreshing;
  }

  function authedFetch(path, init, retried) {
    if (!session || !session.token) return Promise.reject(new Error("no session"));
    var sessionId = session.sessionId;
    var options = Object.assign({}, init);
    options.headers = Object.assign({}, init && init.headers, {
      Authorization: "Bearer " + session.token
    });
    return timedFetch(proxy + path, options).then(function (r) {
      if (!session || session.sessionId !== sessionId) throw new Error("session changed");
      if (r.status === 403 || r.status === 404) { endSession(r.status === 403); return r; }
      if (r.status !== 401 || retried) return r;
      return requestSession().then(function (data) {
        if (!data) return r;
        if (data.sessionId !== sessionId) {
          onSessionChanged(data);
          throw new Error("session changed");
        }
        return authedFetch(path, init, true);
      });
    });
  }

  function poll() {
    if (!session || !session.token) return;
    authedFetch("/messages", {}).then(function (r) {
      if (!r.ok) throw new Error("poll " + r.status);
      return r.json();
    }).then(function (data) {
      if (!data) return;
      setConnection("");
      onMessages(data);
    }).catch(function () {
      if (session) setConnection("Connection interrupted. Checking for replies again shortly.");
    });
  }

  function startPolling() {
    if (preview) return;
    if (poller) return;
    poller = setInterval(function () {
      if (document.visibilityState === "visible") poll();
    }, 8000);
  }

  function startPreview() {
    session = { sessionId: "preview", token: "preview", messages: [] };
  }
  return { get session() { return session; }, requestSession, authedFetch, poll, startPolling, startPreview };
}
