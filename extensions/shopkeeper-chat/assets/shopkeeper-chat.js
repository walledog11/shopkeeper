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
    ".verify-open {",
    "  border: none; background: none; color: #6b6b6b; cursor: pointer; font: inherit; font-size: 13px;",
    "  padding: 0 12px 10px; text-align: " + (side === "left" ? "left" : "right") + "; text-decoration: underline;",
    "}",
    ".card {",
    "  align-self: stretch; border: 1px solid #e0ddd8; border-radius: 12px; padding: 12px; background: #fbfaf8;",
    "  display: flex; flex-direction: column; gap: 8px;",
    "}",
    ".card h3 { margin: 0; font-size: 14px; font-weight: 600; }",
    ".card p { margin: 0; font-size: 13px; color: #6b6b6b; }",
    ".card label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: #6b6b6b; }",
    ".card input { padding: 8px 10px; border: 1px solid #d8d5d0; border-radius: 8px; font: inherit; font-size: 14px; min-width: 0; }",
    ".card input:focus { outline: 2px solid " + accent + "; outline-offset: 1px; }",
    ".card .actions { display: flex; gap: 8px; }",
    ".card button { border: none; background: " + accent + "; color: #fff; border-radius: 8px; padding: 8px 14px; cursor: pointer; font: inherit; font-size: 14px; }",
    ".card button.ghost { background: none; color: #6b6b6b; }",
    ".card button:disabled { opacity: .45; cursor: default; }",
    ".card .err { color: #a33; font-size: 12px; }",
    "@media (prefers-reduced-motion: no-preference) { .launcher { transition: transform .15s ease; } .launcher:hover { transform: translateY(-1px); } }",
    "</style>",
    "<button class='launcher' part='launcher' aria-haspopup='dialog' aria-expanded='false'>",
    "  <span aria-hidden='true'>&#128172;</span><span class='launcher-label'></span>",
    "</button>",
    "<div class='panel' role='dialog' aria-modal='false' aria-label='Chat with us' data-open='0'>",
    "  <div class='header'><h2>Chat with us</h2><button class='close' aria-label='Close chat'>&times;</button></div>",
    "  <div class='log' role='log' aria-live='polite'></div>",
    "  <button class='verify-open' type='button'>&#128274; Check an order</button>",
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

  // Order verification. The whole exchange runs against /verify and never
  // touches the message pipeline: no Message row, no ticket, no plan, and
  // nothing here waits on the merchant approving anything. The agent learns the
  // result only by finding a verified session next time it builds context.
  var verifyBtn = shadow.querySelector(".verify-open");
  var card = null;

  function closeCard() {
    if (card) { card.remove(); card = null; }
    verifyBtn.disabled = false;
  }

  function openCard() {
    if (card) { card.querySelector("input").focus(); return; }
    verifyBtn.disabled = true;
    card = document.createElement("div");
    card.className = "card";
    log.appendChild(card);
    renderAskStep();
  }

  function cardShell(title, hint) {
    card.textContent = "";
    var h = document.createElement("h3");
    h.textContent = title;
    var p = document.createElement("p");
    p.textContent = hint;
    card.appendChild(h);
    card.appendChild(p);
    log.scrollTop = log.scrollHeight;
  }

  function addField(labelText, type, placeholder) {
    var label = document.createElement("label");
    label.textContent = labelText;
    var field = document.createElement("input");
    field.type = type;
    field.placeholder = placeholder;
    field.autocomplete = "off";
    label.appendChild(field);
    card.appendChild(label);
    return field;
  }

  function addActions(primaryLabel, onPrimary) {
    var actions = document.createElement("div");
    actions.className = "actions";
    var primary = document.createElement("button");
    primary.type = "button";
    primary.textContent = primaryLabel;
    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "ghost";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", closeCard);
    actions.appendChild(primary);
    actions.appendChild(cancel);
    card.appendChild(actions);

    var err = document.createElement("div");
    err.className = "err";
    card.appendChild(err);

    primary.addEventListener("click", function () {
      err.textContent = "";
      primary.disabled = true;
      onPrimary(function (message) {
        err.textContent = message || "";
        primary.disabled = false;
      });
    });
    return primary;
  }

  function postVerify(body) {
    return fetch(proxy + "/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.token },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok && r.status !== 400) throw new Error("verify " + r.status);
      return r.json();
    });
  }

  function renderAskStep() {
    cardShell("Check an order", "Enter the order number and the email used at checkout.");
    var orderField = addField("Order number", "text", "#1025");
    var emailField = addField("Email", "email", "you@example.com");
    addActions("Send code", function (fail) {
      var orderName = orderField.value.trim();
      var email = emailField.value.trim();
      if (!orderName || !email) return fail("Both fields are needed.");

      postVerify({ action: "request", orderName: orderName, email: email }).then(function (data) {
        if (data.status === "send_limit") {
          return fail("You've asked for a few codes already. Try again a bit later.");
        }
        if (data.status !== "sent") {
          return fail("We can't check orders right now.");
        }
        renderCodeStep(orderName);
      }).catch(function () {
        fail("Something went wrong. Try again in a moment.");
      });
    });
    orderField.focus();
  }

  function renderCodeStep(orderName) {
    // Deliberately says "if" — the reply is identical whether or not the order
    // exists and whether or not the email matched. Confirming either would tell
    // someone guessing that they guessed right.
    cardShell(
      "Enter your code",
      "If that's the email on the order, we've sent a 6-digit code to it. It expires in 10 minutes."
    );
    var codeField = addField("6-digit code", "text", "123456");
    codeField.setAttribute("inputmode", "numeric");
    codeField.maxLength = 6;
    addActions("Confirm", function (fail) {
      var code = codeField.value.trim();
      if (!code) return fail("Enter the code from your email.");

      postVerify({ action: "code", orderName: orderName, code: code }).then(function (data) {
        var message = verificationNote(data, orderName);
        if (data.status === "verified" || data.status === "already_verified") {
          closeCard();
          append(message, "note");
          return;
        }
        fail(message);
      }).catch(function () {
        fail("Something went wrong. Try again in a moment.");
      });
    });
    codeField.focus();
  }

  function verificationNote(outcome, orderName) {
    switch (outcome.status) {
      case "verified":
      case "already_verified":
        return "Confirmed — ask me anything about " + orderName + ".";
      case "wrong_code":
        return outcome.attemptsRemaining > 0
          ? "That code doesn't match. " + outcome.attemptsRemaining + " tries left."
          : "That code doesn't match.";
      case "expired":
        return "That code has expired. Ask for a new one to try again.";
      case "locked":
        return "That's too many tries on this order — the shop will need to help with this one.";
      default:
        return "There's no code waiting on this chat right now.";
    }
  }

  verifyBtn.addEventListener("click", openCard);

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
      return r.json().catch(function () { return {}; }).then(function (body) {
        // A code typed into the composer rather than the card. The server
        // handled it as a verification attempt, so it was never persisted and
        // no echo is coming — release the optimistic bubble's reservation and
        // answer inline instead of waiting on a poll that will never match.
        if (body.verification) {
          dropEcho(text);
          append(verificationNote(body.verification, "that order"), "note");
          return;
        }
        setTimeout(poll, 1200);
      });
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
