(function () {
  var root = document.getElementById("shopkeeper-chat-root");
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = "1";

  var proxy = root.dataset.proxy;
  var accent = root.dataset.accent || "#1f1b16";
  var side = root.dataset.position === "left" ? "left" : "right";
  var greeting = root.dataset.greeting || "";
  var launcherLabel = root.dataset.launcherLabel || "Chat with us";

  // Inline, because a theme rule like `div:empty { display: none }` out-specifies
  // anything we can write in :host. Belt and braces with the light-DOM child in
  // chat.liquid: that stops :empty matching, this survives any other theme rule
  // that targets the host by id or class.
  root.style.display = "block";

  var shadow = root.attachShadow({ mode: "open" });
  shadow.innerHTML = [
    "<style>",
    ":host { all: initial; display: block; }",
    "*, *::before, *::after { box-sizing: border-box; }",
    ".launcher {",
    "  position: fixed; bottom: 20px; " + side + ": 20px; z-index: 2147483000;",
    "  display: flex; align-items: center; gap: 8px;",
    "  padding: 12px 18px; border: none; border-radius: 999px; cursor: pointer;",
    "  background: " + accent + "; color: #fff;",
    "  font: 500 15px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
    "  box-shadow: 0 4px 16px rgba(0,0,0,.18);",
    "}",
    ".panel {",
    "  position: fixed; bottom: 84px; " + side + ": 20px; z-index: 2147483000;",
    "  width: min(380px, calc(100vw - 40px)); height: min(520px, calc(100vh - 120px));",
    "  display: none; flex-direction: column; overflow: hidden;",
    "  background: #fff; border-radius: 14px; box-shadow: 0 8px 40px rgba(0,0,0,.22);",
    "  font: 400 15px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
    "  color: #1a1a1a;",
    "}",
    ".panel[data-open='1'] { display: flex; }",
    ".header {",
    "  padding: 14px 16px; background: " + accent + "; color: #fff;",
    "  display: flex; justify-content: space-between; align-items: center;",
    "}",
    ".header h2 { margin: 0; font-size: 15px; font-weight: 600; }",
    ".close { background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; line-height: 1; padding: 0 4px; }",
    ".log { flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }",
    ".msg { max-width: 85%; padding: 9px 13px; border-radius: 14px; white-space: pre-wrap; word-wrap: break-word; }",
    ".msg.them { align-self: flex-start; background: #f0efec; }",
    ".msg.me { align-self: flex-end; background: " + accent + "; color: #fff; }",
    ".msg.note { align-self: center; background: none; color: #8a8a8a; font-size: 13px; text-align: center; }",
    ".composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #e8e6e2; }",
    ".composer input { flex: 1; padding: 10px 12px; border: 1px solid #d8d5d0; border-radius: 999px; font: inherit; min-width: 0; }",
    ".composer input:focus { outline: 2px solid " + accent + "; outline-offset: 1px; }",
    ".composer button { border: none; background: " + accent + "; color: #fff; border-radius: 999px; padding: 0 16px; cursor: pointer; font: inherit; }",
    ".composer button:disabled { opacity: .45; cursor: default; }",
    "@media (prefers-reduced-motion: no-preference) { .launcher { transition: transform .15s ease; } .launcher:hover { transform: translateY(-1px); } }",
    "</style>",
    "<button class='launcher' part='launcher' aria-haspopup='dialog' aria-expanded='false'>",
    "  <span aria-hidden='true'>&#128172;</span><span class='launcher-label'></span>",
    "</button>",
    "<div class='panel' role='dialog' aria-modal='false' aria-label='Chat with us' data-open='0'>",
    "  <div class='header'><h2>Chat with us</h2><button class='close' aria-label='Close chat'>&times;</button></div>",
    "  <div class='log' role='log' aria-live='polite'></div>",
    "  <form class='composer'>",
    "    <input type='text' name='message' autocomplete='off' placeholder='Type a message&hellip;' aria-label='Message' maxlength='4000' />",
    "    <button type='submit'>Send</button>",
    "  </form>",
    "</div>"
  ].join("");

  var launcher = shadow.querySelector(".launcher");
  var panel = shadow.querySelector(".panel");
  var log = shadow.querySelector(".log");
  var form = shadow.querySelector(".composer");
  var input = shadow.querySelector(".composer input");
  var sendBtn = shadow.querySelector(".composer button");

  shadow.querySelector(".launcher-label").textContent = launcherLabel;

  var storageKey = "shopkeeper-chat:" + root.dataset.shop;
  var session = null;
  var seen = Object.create(null);
  var poller = null;

  function append(text, kind) {
    var el = document.createElement("div");
    el.className = "msg " + kind;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function stored() {
    try { return JSON.parse(localStorage.getItem(storageKey) || "null"); } catch (e) { return null; }
  }

  function store(value) {
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  // Text of messages already on screen as optimistic bubbles, waiting for the
  // server's own copy to come back on a poll. The optimistic bubble carries no
  // id — the send endpoint answers 202 before the message is persisted, so there
  // is no id to carry — which means the polled copy looks brand new and the
  // shopper watches their own message appear twice. Matching on text is enough:
  // the only thing being reconciled is a message this browser just sent.
  var awaitingEcho = [];

  function dropEcho(text) {
    var i = awaitingEcho.indexOf(text);
    if (i !== -1) awaitingEcho.splice(i, 1);
    return i !== -1;
  }

  function render(messages) {
    (messages || []).forEach(function (m) {
      if (seen[m.id]) return;
      seen[m.id] = true;
      // Already on screen from the optimistic append — adopt the id and move on.
      if (m.from === "customer" && dropEcho(m.text)) return;
      append(m.text, m.from === "customer" ? "me" : "them");
    });
  }

  function bootstrap() {
    var prior = stored() || {};
    return fetch(proxy + "/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: prior.sessionId || null,
        resumeToken: prior.resumeToken || null,
        pageUrl: root.dataset.pageUrl || location.href,
        locale: document.documentElement.lang || null
      })
    }).then(function (r) {
      // Disabled is not an error the shopper should read about: the widget
      // simply is not there. Either switch — platform or merchant — lands here,
      // and removing the host takes the shadow root and the poller with it.
      if (r.status === 403) { root.remove(); return null; }
      if (!r.ok) throw new Error("bootstrap " + r.status);
      return r.json();
    }).then(function (data) {
      if (!data) return;
      session = data;
      if (data.sessionId) {
        store({ sessionId: data.sessionId, resumeToken: data.resumeToken || prior.resumeToken });
      }
      if (greeting && !(data.messages || []).length) append(greeting, "note");
      render(data.messages);
      startPolling();
    });
  }

  function poll() {
    if (!session || !session.token) return;
    fetch(proxy + "/messages", {
      headers: { Authorization: "Bearer " + session.token }
    }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (data) {
      if (data) render(data.messages);
    }).catch(function () { /* transient */ });
  }

  function startPolling() {
    if (poller) return;
    poller = setInterval(function () {
      if (panel.dataset.open === "1" && document.visibilityState === "visible") poll();
    }, 8000);
  }

  var opening = null;
  function open() {
    panel.dataset.open = "1";
    launcher.setAttribute("aria-expanded", "true");
    input.focus();
    if (!opening) {
      opening = bootstrap().catch(function () {
        append("We couldn't start the chat just now. Please try again shortly.", "note");
        opening = null;
      });
    }
  }

  function close() {
    panel.dataset.open = "0";
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  }

  launcher.addEventListener("click", function () {
    panel.dataset.open === "1" ? close() : open();
  });
  shadow.querySelector(".close").addEventListener("click", close);

  panel.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || !session || !session.token) return;

    input.value = "";
    sendBtn.disabled = true;
    var pending = append(text, "me");
    awaitingEcho.push(text);
    var clientMessageId = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 10);

    fetch(proxy + "/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.token },
      body: JSON.stringify({ text: text, clientMessageId: clientMessageId })
    }).then(function (r) {
      // A budget refusal is not a delivery failure, and saying "check your
      // connection" for one sends the shopper to fix something that is not
      // broken. The server supplies the wording; it knows which limit was hit.
      if (r.status === 429) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          // Nothing was accepted, so nothing will echo back. Releasing the entry
          // stops it from swallowing an identical message the shopper retries.
          dropEcho(text);
          pending.style.opacity = "0.5";
          append(body.shopperMessage || "Too many messages just now. Try again in a moment.", "note");
        });
      }
      if (!r.ok) throw new Error("send " + r.status);
      setTimeout(poll, 1200);
    }).catch(function () {
      dropEcho(text);
      pending.style.opacity = "0.5";
      append("Not delivered. Check your connection and try again.", "note");
    }).finally(function () {
      sendBtn.disabled = false;
      input.focus();
    });
  });
})();
