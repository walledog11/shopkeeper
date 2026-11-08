import { createMessageRenderer } from "./messages.js";
import { createViewport } from "./viewport.js";
import { createSessionClient } from "./session.js";
import { createVerification, verificationNote } from "./verification.js";

(async function () {
  var root = document.getElementById("shopkeeper-chat-root");
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = "1";

  // Fetch presentation settings before mounting. This is intentionally separate
  // from bootstrap: simply seeing the launcher must not create a session.
  var publishedSettings = null;
  if (root.dataset.configUrl) {
    var configController = new AbortController();
    var configTimeout = setTimeout(function () { configController.abort(); }, 8000);
    try {
      var configResponse = await fetch(root.dataset.configUrl, { signal: configController.signal, cache: "no-store" });
      if (!configResponse.ok) return;
      var configData = await configResponse.json();
      if (configData.enabled !== true) return;
      publishedSettings = configData.configuration && configData.configuration.settings;
    } catch (error) {
      // Stay hidden if availability or placement cannot be confirmed.
      return;
    } finally {
      clearTimeout(configTimeout);
    }
  }

  var proxy = root.dataset.proxy;
  var preview = root.dataset.preview === "1";
  var greeting = root.dataset.greeting || "";
  var launcherLabel = root.dataset.launcherLabel || "Chat with us";
  var panelTitle = root.dataset.panelTitle || root.dataset.shopName || launcherLabel;
  var statusLine = root.dataset.statusLine || "";
  var logoUrl = root.dataset.logoUrl || "";

  function parsePrompts(raw) {
    if (!raw) return [];
    return raw.split(/\r?\n/).map(function (line) {
      return line.trim();
    }).filter(Boolean).slice(0, 6);
  }

  var quickPrompts = parsePrompts(root.dataset.prompts || "");

  root.style.display = "block";

  var shadow = root.attachShadow({ mode: "open" });
  shadow.innerHTML = [
    "<button class='launcher' part='launcher' aria-haspopup='dialog' aria-expanded='false'>",
    "  <span class='launcher-badge' aria-hidden='true'></span>",
    "  <span class='launcher-icon' aria-hidden='true'>",
    "  </span><span class='launcher-label'></span>",
    "</button>",
    "<div class='panel' role='dialog' aria-modal='false' data-open='0'>",
    "  <div class='header'>",
    "    <div class='header-brand'>",
    "      <img class='header-logo' alt='' hidden />",
    "      <span class='header-mark' aria-hidden='true'></span>",
    "      <div class='header-text'>",
    "        <h2></h2>",
    "        <p class='header-status' hidden></p>",
    "      </div>",
    "    </div>",
    "    <button type='button' class='header-close' aria-label='Close chat'>",
    "      <svg viewBox='0 0 16 16' aria-hidden='true'>",
    "        <path d='M4 4 L12 12 M12 4 L4 12' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'/>",
    "      </svg>",
    "    </button>",
    "  </div>",
    "  <div class='log' role='log' aria-live='polite'></div>",
    "  <div class='quick-actions'>",
    "    <div class='quick-actions-track'>",
    "      <button class='verify-open' type='button'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' aria-hidden='true'><rect x='5' y='10' width='14' height='11' rx='2'/><path d='M8 10V7a4 4 0 0 1 8 0v3'/></svg>Check an order</button>",
    "    </div>",
    "  </div>",
    "  <form class='composer'>",
    "    <textarea name='message' autocomplete='off' placeholder='Type a message&hellip;' aria-label='Message' maxlength='4000' rows='1'></textarea>",
    "    <button type='submit' aria-label='Send message'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 19V5m-6 6 6-6 6 6'/></svg></button>",
    "  </form>",
    "</div>"
  ].join("");

  // The preview supplies these exact asset contents as a template. Storefronts
  // load the same two files from Shopify's extension CDN.
  var previewStyles = preview && document.getElementById("shopkeeper-preview-styles");
  if (previewStyles) {
    shadow.prepend(previewStyles.content.cloneNode(true));
  } else {
    var stylesheets = [root.dataset.tokensStylesheet, root.dataset.stylesheet].filter(Boolean);
    if (stylesheets.length) {
      root.style.visibility = "hidden";
      var loaded = 0;
      stylesheets.forEach(function (href) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.onload = function () { if (++loaded === stylesheets.length) root.style.visibility = ""; };
        shadow.appendChild(link);
      });
    }
  }

  var launcher = shadow.querySelector(".launcher");
  var launcherBadge = shadow.querySelector(".launcher-badge");
  var launcherIcon = shadow.querySelector(".launcher-icon");
  var launcherLabelEl = shadow.querySelector(".launcher-label");
  var panel = shadow.querySelector(".panel");
  var headerTitle = shadow.querySelector(".header h2");
  var headerStatus = shadow.querySelector(".header-status");
  var headerLogo = shadow.querySelector(".header-logo");
  var headerMark = shadow.querySelector(".header-mark");
  var headerClose = shadow.querySelector(".header-close");
  var log = shadow.querySelector(".log");
  var quickActions = shadow.querySelector(".quick-actions");
  var quickActionsTrack = shadow.querySelector(".quick-actions-track");
  var verifyBtn = shadow.querySelector(".verify-open");
  var form = shadow.querySelector(".composer");
  var input = shadow.querySelector(".composer textarea");
  var sendBtn = shadow.querySelector(".composer button");
  var connection = document.createElement("div");
  connection.className = "msg note connection-status";
  connection.setAttribute("role", "status");
  connection.hidden = true;
  form.parentNode.insertBefore(connection, form);
  sendBtn.disabled = true;
  verifyBtn.disabled = true;

  headerTitle.textContent = panelTitle;
  panel.setAttribute("aria-label", panelTitle);
  if (statusLine) {
    headerStatus.textContent = statusLine;
    headerStatus.hidden = false;
  }
  if (logoUrl) {
    headerLogo.src = logoUrl;
    headerLogo.alt = panelTitle;
    headerLogo.hidden = false;
  }

  var launcherIconChat = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z'/></svg>";
  var launcherIconClose = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' aria-hidden='true'><path d='m6 6 12 12M6 18 18 6'/></svg>";

  launcherLabelEl.textContent = launcherLabel;
  launcherIcon.innerHTML = launcherIconChat;

  function setLauncherOpen(isOpen) {
    launcher.dataset.open = isOpen ? "1" : "0";
    if (!isOpen) launcherLabelEl.textContent = launcherLabel;
    launcherIcon.innerHTML = isOpen ? launcherIconClose : launcherIconChat;
    launcher.setAttribute("aria-label", isOpen ? "Close chat" : launcherLabel);
    panel.setAttribute("aria-modal", isOpen ? "true" : "false");
  }
  setLauncherOpen(false);

  var { createAvatar, append, showTyping, hideTyping } = createMessageRenderer({
    log, scrollLogToEnd, getLogoUrl: () => logoUrl, launcherIconChat,
  });
  var client = createSessionClient({
    root, proxy, preview, setConnection,
    onEndSession: function (disabled) {
      opening = null;
      closeCard();
      clearWaitingNotice();
      hideTyping();
      setConnection(disabled ? "Chat is unavailable. Please use the shop's contact page." : "This chat has ended. Reconnect to start a new chat.", !disabled);
    },
    onSessionChanged: function (data) {
      beginNewConversation(null, null, true);
      render(data.messages);
      setEscalated(data.escalated === true);
    },
    onMessages: function (data) {
      render(data.messages);
      setEscalated(data.escalated === true);
    },
  });
  var { requestSession, authedFetch, poll, startPolling } = client;
  var verification = createVerification({
    log, verifyBtn, preview, hasSession: () => Boolean(client.session),
    authedFetch, append, syncQuickActions, scrollLogToEnd,
  });
  var { openCard, closeCard } = verification;
  var seen = Object.create(null);
  var unreadCount = 0;
  var hasSentMessage = false;
  var lastFocusedBeforeOpen = null;
  var { isMobileLayout, isVisibleOnViewport, clearMobilePanelLayout, syncMobilePanelLayout, setKeyboardOpen } =
    createViewport({ root, panel, launcher, setLauncherOpen, scrollLogToEnd });

  function resizeComposer() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }

  input.addEventListener("input", resizeComposer);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("focus", function () {
    if (isMobileLayout()) setKeyboardOpen(true);
    else syncMobilePanelLayout();
  });
  input.addEventListener("blur", function () {
    if (isMobileLayout()) setKeyboardOpen(false);
    else syncMobilePanelLayout();
  });

  panel.addEventListener("focusin", function (e) {
    if (!isMobileLayout()) return;
    if (e.target === input) return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) {
      setKeyboardOpen(true);
    }
  });
  panel.addEventListener("focusout", function (e) {
    if (!isMobileLayout()) return;
    if (panel.contains(e.relatedTarget)) return;
    setKeyboardOpen(false);
  });

  function updateUnreadBadge() {
    if (unreadCount > 0) {
      launcherBadge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
      launcherBadge.dataset.visible = "1";
      launcherBadge.setAttribute("aria-label", unreadCount + " unread messages");
    } else {
      launcherBadge.dataset.visible = "0";
      launcherBadge.textContent = "";
      launcherBadge.removeAttribute("aria-label");
    }
  }

  function clearUnread() {
    unreadCount = 0;
    updateUnreadBadge();
  }

  function bumpUnread() {
    if (panel.dataset.open === "1") return;
    unreadCount += 1;
    updateUnreadBadge();
  }

  function syncQuickActions() {
    quickActions.dataset.hidden = verification.isOpen() ? "1" : "0";
  }

  function renderPrompts() {
    quickActionsTrack.querySelectorAll(".prompt-chip").forEach(function (el) {
      el.remove();
    });
    if (quickPrompts.length && !hasSentMessage) {
      quickPrompts.forEach(function (label) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "prompt-chip";
        chip.textContent = label;
        chip.addEventListener("click", function () {
          input.value = label;
          resizeComposer();
          input.focus();
        });
        quickActionsTrack.insertBefore(chip, verifyBtn);
      });
    }
  }

  renderPrompts();

  var awaitingEcho = [];
  var sending = false;
  var failedDraft = null;

  function dropEcho(message) {
    var i = awaitingEcho.findIndex(function (entry) {
      return message.clientMessageId ? entry.id === message.clientMessageId : entry.text === message.text;
    });
    if (i === -1) return false;
    var entry = awaitingEcho.splice(i, 1)[0];
    confirmDelivery(entry);
    return true;
  }

  function confirmDelivery(entry) {
    entry.delivered = true;
    entry.element.querySelector(".bubble").style.opacity = "";
    if (entry.retry) { entry.retry.remove(); entry.retry = null; }
    if (failedDraft === entry) {
      if (input.value === entry.text) { input.value = ""; resizeComposer(); }
      failedDraft = null;
    }
  }

  function beginNewConversation(beforeEl, currentEcho, showDivider) {
    seen = Object.create(null);
    awaitingEcho = currentEcho ? [currentEcho] : [];
    if (!showDivider) return;

    var divider = document.createElement("div");
    divider.className = "conversation-boundary";
    divider.setAttribute("role", "separator");
    divider.setAttribute("aria-label", "New conversation");
    var label = document.createElement("span");
    label.textContent = "New conversation";
    divider.appendChild(label);
    log.insertBefore(divider, beforeEl);
    scrollLogToEnd();
  }

  var WAITING_NOTICE_MS = 20000;
  var waitingTimer = null;
  var waitingNotice = null;

  function clearWaitingNotice() {
    if (waitingTimer) {
      clearTimeout(waitingTimer);
      waitingTimer = null;
    }
    if (waitingNotice) { waitingNotice.remove(); waitingNotice = null; }
  }

  var HANDOFF_NOTICE = "Your message has been passed to the shop. Replies will appear here.";

  function armWaitingNotice() {
    clearWaitingNotice();
    waitingTimer = setTimeout(function () {
      waitingTimer = null;
      if (noticeEl) return;
      hideTyping();
      waitingNotice = append("Still waiting for a reply. You can keep this chat open or check back later.", "note");
    }, WAITING_NOTICE_MS);
  }

  // Only server-confirmed escalation promises a handoff to the shop.
  var noticeEl = null;

  function showHandoffNotice() {
    clearWaitingNotice();
    hideTyping();
    if (!noticeEl) {
      noticeEl = append(HANDOFF_NOTICE, "note");
      return;
    }
    // Already up. Move it only when something rendered below it, and scroll only
    // then: this runs on every poll, and an unconditional scroll-to-end every 8
    // seconds would drag a shopper reading back through the thread to the bottom.
    if (log.lastChild !== noticeEl) {
      log.appendChild(noticeEl);
      scrollLogToEnd();
    }
  }

  function setEscalated(isEscalated) {
    if (isEscalated) {
      showHandoffNotice();
      return;
    }
    if (noticeEl) {
      noticeEl.remove();
      noticeEl = null;
    }
  }

  function render(messages) {
    (messages || []).forEach(function (m) {
      if (seen[m.id]) return;
      seen[m.id] = true;
      if (m.from === "customer") hasSentMessage = true;
      if (m.from === "customer" && dropEcho(m)) return;
      if (m.from !== "customer") {
        clearWaitingNotice();
        hideTyping();
        if (panel.dataset.open !== "1") bumpUnread();
      }
      append(m.text, m.from === "customer" ? "me" : "them", m.at);
    });
    renderPrompts();
  }

  function setConnection(message, retry) {
    connection.textContent = message || "";
    connection.hidden = !message;
    if (retry) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = "Reconnect";
      button.addEventListener("click", connect);
      connection.appendChild(document.createTextNode(" "));
      connection.appendChild(button);
    }
    sendBtn.disabled = sending || !client.session;
    verifyBtn.disabled = verification.isOpen() || !client.session;
  }

  function bootstrap() {
    return requestSession().then(function (data) {
      if (!data) return;
      if (greeting && !(data.messages || []).length && !log.querySelector("[data-welcome]")) {
        append(greeting, "them").dataset.welcome = "1";
      }
      render(data.messages);
      setEscalated(data.escalated === true);
      startPolling();
    });
  }

  function focusablesInPanel() {
    return Array.prototype.slice.call(
      panel.querySelectorAll("button, textarea, input, [href], [tabindex]:not([tabindex='-1'])")
    ).filter(function (el) {
      return !el.disabled && el.offsetParent !== null;
    });
  }

  function trapPanelFocus(e) {
    if (panel.dataset.open !== "1" || e.key !== "Tab") return;
    var nodes = focusablesInPanel();
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (e.shiftKey && shadow.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && shadow.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  var opening = null;
  function connect() {
    if (opening) return opening;
    setConnection("Connecting…");
    opening = bootstrap().catch(function () {
      setConnection("We couldn't connect. Your draft is still here.", true);
    }).finally(function () { opening = null; });
    return opening;
  }
  function open() {
    if (!isVisibleOnViewport()) return;
    lastFocusedBeforeOpen = document.activeElement;
    panel.dataset.open = "1";
    launcher.setAttribute("aria-expanded", "true");
    setLauncherOpen(true);
    clearUnread();
    syncMobilePanelLayout();
    if (!isMobileLayout() && !preview) input.focus();
    if (!client.session) connect();
  }

  function close() {
    panel.dataset.open = "0";
    launcher.setAttribute("aria-expanded", "false");
    setLauncherOpen(false);
    clearMobilePanelLayout();
    if (preview) return;
    launcher.focus();
    if (lastFocusedBeforeOpen && typeof lastFocusedBeforeOpen.focus === "function") {
      try { lastFocusedBeforeOpen.focus(); } catch (e) { /* stale node */ }
    }
  }

  launcher.addEventListener("click", function () {
    panel.dataset.open === "1" ? close() : open();
  });

  headerClose.addEventListener("click", close);

  panel.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    trapPanelFocus(e);
  });

  function scrollLogToEnd(smooth) {
    if (smooth && isMobileLayout() && typeof log.scrollTo === "function") {
      log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
      return;
    }
    log.scrollTop = log.scrollHeight;
  }

  function sendMessage(text, retryEntry) {
    if (!text || sending || !client.session || !client.session.token) return;
    if (preview) {
      hasSentMessage = true;
      renderPrompts();
      append(text, "me");
      input.value = "";
      resizeComposer();
      append("Thanks for your message! This is a preview of how replies will look in your store.", "them");
      return;
    }
    if (retryEntry && retryEntry.sessionId !== client.session.sessionId) {
      input.value = text;
      resizeComposer();
      setConnection("Your previous chat ended. Send this draft to start a new conversation.");
      return;
    }

    var hadConversationOnScreen = Boolean(log.querySelector(".msg.me, .msg.them:not([data-welcome])"));
    hasSentMessage = true;
    renderPrompts();
    sending = true;
    setConnection("");
    var entry = retryEntry || {
      id: window.crypto.randomUUID(), text: text, sessionId: client.session.sessionId,
      element: append(text, "me"), delivered: false, retry: null
    };
    if (!retryEntry) awaitingEcho.push(entry);
    if (entry.retry) { entry.retry.remove(); entry.retry = null; }
    entry.element.querySelector(".bubble").style.opacity = "";
    if (input.value.trim() === text) { input.value = ""; resizeComposer(); }
    showTyping();
    armWaitingNotice();

    function failed(message) {
      if (entry.delivered) return;
      clearWaitingNotice();
      hideTyping();
      entry.element.querySelector(".bubble").style.opacity = "0.65";
      if (!input.value) { input.value = text; resizeComposer(); failedDraft = entry; }
      var retry = document.createElement("button");
      retry.type = "button";
      retry.className = "retry-send";
      retry.textContent = "Retry message";
      retry.addEventListener("click", function () { sendMessage(text, entry); });
      entry.retry = document.createElement("div");
      entry.retry.className = "err";
      entry.retry.appendChild(document.createTextNode(message + " "));
      entry.retry.appendChild(retry);
      entry.element.querySelector(".bubble-wrap").appendChild(entry.retry);
    }

    authedFetch("/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text, clientMessageId: entry.id })
    }).then(function (r) {
      if (r.status === 429) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          failed(body.shopperMessage || "Too many messages just now. Try again in a moment.");
        });
      }
      if (!r.ok) throw new Error("send " + r.status);
      return r.json().catch(function () { return {}; }).then(function (body) {
        confirmDelivery(entry);
        if (body.verification) {
          dropEcho({ clientMessageId: entry.id });
          clearWaitingNotice();
          hideTyping();
          append(verificationNote(body.verification, "that order"), "note");
          return;
        }
        if (body.isNewThread === true) {
          beginNewConversation(entry.element, entry, hadConversationOnScreen);
        }
        setTimeout(poll, 1200);
      });
    }).catch(function () {
      failed("Couldn't confirm delivery. Your message is saved here.");
    }).finally(function () {
      sending = false;
      sendBtn.disabled = !client.session;
      input.focus();
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || !client.session || sending) return;
    var retry = failedDraft && failedDraft.text === text && failedDraft.sessionId === client.session.sessionId
      ? failedDraft : null;
    sendMessage(text, retry);
  });

  function safeLogo(value) {
    try {
      var url = new URL(value, location.href);
      var localPreview = preview && url.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
      return (url.protocol === "https:" || localPreview) && !url.username && !url.password ? url.href : "";
    } catch (e) { return ""; }
  }

  function applyConfiguration(settings) {
    var previousLogo = logoUrl;
    var previousPrompts = JSON.stringify(quickPrompts);
    if (settings) {
      greeting = settings.greeting || "";
      launcherLabel = settings.launcherLabel || "Chat with us";
      panelTitle = settings.title || root.dataset.shopName || "Chat with us";
      statusLine = settings.subtitle || "";
      logoUrl = settings.logoUrl ? safeLogo(settings.logoUrl) : "";
      quickPrompts = Array.isArray(settings.quickPrompts) ? settings.quickPrompts.slice(0, 6) : [];
    }
    var accent = settings ? settings.accentColor : root.dataset.accent;
    if (!/^#[0-9a-f]{6}$/i.test(accent || "")) accent = "#1b1a19";
    var rgb = [1, 3, 5].map(function (offset) {
      var value = parseInt(accent.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    var luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    root.style.setProperty("--sk-accent", accent);
    root.style.setProperty("--sk-accent-text", luminance > 0.179 ? "#000000" : "#ffffff");
    root.dataset.position = (settings ? settings.position : root.dataset.position) === "left" ? "left" : "right";
    root.dataset.launcherStyle = settings && settings.launcherStyle === "icon" ? "icon" : "label";
    root.dataset.showDesktop = String(!settings || settings.showOnDesktop !== false);
    root.dataset.showMobile = String(!settings || settings.showOnMobile !== false);
    ["X", "Y"].forEach(function (axis) {
      var value = settings && settings["offset" + axis];
      root.style.setProperty("--sk-offset-" + axis.toLowerCase(), (typeof value === "number" && isFinite(value) ? Math.max(12, Math.min(64, value)) : 20) + "px");
    });
    headerTitle.textContent = panelTitle;
    panel.setAttribute("aria-label", panelTitle);
    headerStatus.textContent = statusLine;
    headerStatus.hidden = !statusLine;
    headerLogo.hidden = !logoUrl;
    headerMark.innerHTML = launcherIconChat;
    headerMark.hidden = Boolean(logoUrl);
    if (logoUrl) { if (headerLogo.getAttribute("src") !== logoUrl) headerLogo.src = logoUrl; headerLogo.alt = panelTitle; }
    else headerLogo.removeAttribute("src");
    setLauncherOpen(panel.dataset.open === "1");
    if (previousPrompts !== JSON.stringify(quickPrompts)) renderPrompts();
    if (previousLogo !== logoUrl) {
      log.querySelectorAll(".avatar").forEach(function (avatar) { avatar.replaceWith(createAvatar()); });
    }
  }

  headerLogo.addEventListener("error", function () { headerLogo.hidden = true; headerMark.hidden = false; });
  applyConfiguration(publishedSettings);

  if (preview) {
    // Only the authenticated editor sets data-preview. No sessions, messages,
    // polling, verification email, or external AI calls are made in this mode.
    var previewScene = null;
    root.addEventListener("shopkeeper:preview", function (event) {
      var detail = event.detail || {};
      applyConfiguration(detail.settings);
      // Editing appearance must not erase a conversation, verification form,
      // draft, or the shopper's open/closed state on every keystroke.
      if (previewScene === detail.scene) {
        var welcome = log.querySelector("[data-welcome]");
        if (welcome) {
          if (greeting) welcome.querySelector(".bubble").textContent = greeting;
          else welcome.remove();
        } else if (greeting) {
          welcome = append(greeting, "them");
          welcome.dataset.welcome = "1";
          log.prepend(welcome);
        }
        syncMobilePanelLayout();
        return;
      }
      previewScene = detail.scene;
      hideTyping();
      closeCard();
      log.textContent = "";
      hasSentMessage = false;
      client.startPreview();
      sendBtn.disabled = false;
      setConnection("");
      renderPrompts();
      if (detail.scene === "launcher") { close(); return; }
      open();
      if (greeting) append(greeting, "them").dataset.welcome = "1";
      if (detail.scene === "conversation" || detail.scene === "loading" || detail.scene === "error") {
        append("Does this come in a smaller size?", "me");
        hasSentMessage = true;
        renderPrompts();
      }
      if (detail.scene === "conversation") append("Of course. Which size are you looking for? I can help you find the right fit.", "them");
      if (detail.scene === "verification") openCard();
      if (detail.scene === "loading") showTyping();
      if (detail.scene === "error") setConnection("We couldn't connect. Your draft is still here.", true);
    });
  }
})();
