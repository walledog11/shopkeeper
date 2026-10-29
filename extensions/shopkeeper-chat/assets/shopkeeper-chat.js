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
  var card = null;
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

  var storageKey = "shopkeeper-chat:" + root.dataset.shop;
  var session = null;
  var seen = Object.create(null);
  var poller = null;
  var unreadCount = 0;
  var hasSentMessage = false;
  var typingEl = null;
  var lastFocusedBeforeOpen = null;
  var mobileQuery = window.matchMedia("(max-width: 480px)");
  var viewportRaf = 0;
  var scrollEndTimer = null;
  var savedScrollY = 0;

  function previewBarTop() {
    // Shopify's preview bar lives in the browser's top layer. A higher z-index
    // cannot clear it; use its visible wrapper, not the full-height iframe.
    var bar = document.getElementById("PBarNextFrameWrapper");
    var bounds = bar && bar.getBoundingClientRect();
    return bounds && bounds.height > 0 ? Math.max(0, bounds.top) : window.innerHeight;
  }

  function isMobileLayout() {
    return mobileQuery.matches;
  }

  function isVisibleOnViewport() {
    return (isMobileLayout() ? root.dataset.showMobile : root.dataset.showDesktop) !== "false";
  }

  function clearMobilePanelLayout() {
    panel.style.top = "";
    panel.style.left = "";
    panel.style.right = "";
    panel.style.bottom = "";
    panel.style.width = "";
    panel.style.maxWidth = "";
    panel.style.height = "";
    panel.style.transform = "";
    panel.style.webkitTransform = "";
    panel.style.removeProperty("--sk-viewport-height");
    panel.dataset.keyboard = "0";
    unlockPageScroll();
  }

  function lockPageScroll() {
    if (!isMobileLayout() || document.body.dataset.skScrollLocked === "1") return;
    savedScrollY = window.scrollY;
    document.body.dataset.skScrollLocked = "1";
    document.body.style.position = "fixed";
    document.body.style.top = "-" + savedScrollY + "px";
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }

  function unlockPageScroll() {
    if (document.body.dataset.skScrollLocked !== "1") return;
    document.body.dataset.skScrollLocked = "0";
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    window.scrollTo(0, savedScrollY);
  }

  function syncMobilePanelLayout() {
    var availableBottom = Math.min(window.innerHeight, previewBarTop());
    root.style.setProperty("--sk-preview-offset", (window.innerHeight - availableBottom) + "px");
    if (!isVisibleOnViewport()) {
      panel.dataset.open = "0";
      launcher.setAttribute("aria-expanded", "false");
      setLauncherOpen(false);
      clearMobilePanelLayout();
      return;
    }
    if (!isMobileLayout() || panel.dataset.open !== "1") {
      clearMobilePanelLayout();
      return;
    }
    lockPageScroll();
    var vv = window.visualViewport;
    if (!vv) {
      panel.style.top = "0";
      panel.style.left = "0";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.width = "100%";
      panel.style.maxWidth = "100%";
      panel.style.height = availableBottom + "px";
      panel.style.transform = "none";
      panel.style.webkitTransform = "none";
      panel.style.setProperty("--sk-viewport-height", availableBottom + "px");
      return;
    }
    var top = Math.max(0, vv.offsetTop);
    var left = Math.max(0, vv.offsetLeft);
    var width = Math.max(0, vv.width);
    var height = Math.max(0, Math.min(vv.height, availableBottom - top));
    panel.style.top = "0";
    panel.style.left = left + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.width = width + "px";
    panel.style.maxWidth = width + "px";
    panel.style.height = height + "px";
    panel.style.transform = "translate3d(0," + top + "px,0)";
    panel.style.webkitTransform = "translate3d(0," + top + "px,0)";
    panel.style.setProperty("--sk-viewport-height", height + "px");
  }

  function scheduleMobileLayout() {
    if (viewportRaf) return;
    viewportRaf = requestAnimationFrame(function () {
      viewportRaf = 0;
      syncMobilePanelLayout();
    });
  }

  function scheduleScrollEnd(smooth) {
    if (scrollEndTimer) clearTimeout(scrollEndTimer);
    if (!smooth) {
      scrollLogToEnd(false);
      return;
    }
    scrollEndTimer = setTimeout(function () {
      scrollEndTimer = null;
      scrollLogToEnd(true);
    }, 320);
  }

  function setKeyboardOpen(isOpen) {
    panel.dataset.keyboard = isOpen ? "1" : "0";
    scheduleMobileLayout();
    scheduleScrollEnd(isOpen);
  }

  function bindMobileViewport() {
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", scheduleMobileLayout, { passive: true });
      window.visualViewport.addEventListener("scroll", scheduleMobileLayout, { passive: true });
    }
    window.addEventListener("resize", scheduleMobileLayout, { passive: true });
    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", scheduleMobileLayout);
    } else if (typeof mobileQuery.addListener === "function") {
      mobileQuery.addListener(scheduleMobileLayout);
    }
  }

  bindMobileViewport();

  function observePreviewBar() {
    var bar = document.getElementById("PBarNextFrameWrapper");
    if (!bar) return false;
    if (window.ResizeObserver) new ResizeObserver(scheduleMobileLayout).observe(bar);
    bar.addEventListener("toggle", scheduleMobileLayout);
    scheduleMobileLayout();
    return true;
  }

  if (!observePreviewBar() && location.search.indexOf("preview_theme_id=") !== -1) {
    var previewObserver = new MutationObserver(function () {
      if (observePreviewBar()) previewObserver.disconnect();
    });
    previewObserver.observe(document.body, { childList: true, subtree: true });
  }

  function formatTime(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  }

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

  function createAvatar() {
    var avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");
    if (logoUrl) {
      var logo = document.createElement("img");
      logo.src = logoUrl;
      logo.alt = "";
      logo.addEventListener("error", function () { avatar.innerHTML = launcherIconChat; });
      avatar.appendChild(logo);
    } else {
      avatar.innerHTML = launcherIconChat;
    }
    return avatar;
  }

  function append(text, kind, at) {
    var el = document.createElement("div");
    el.className = "msg " + kind;
    if (kind === "me" || kind === "them") {
      var avatar = createAvatar();
      var wrap = document.createElement("div");
      wrap.className = "bubble-wrap";
      var bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = text;
      wrap.appendChild(bubble);
      var stamp = formatTime(at || new Date().toISOString());
      if (stamp) {
        var time = document.createElement("time");
        time.className = "msg-time";
        time.dateTime = at || "";
        time.textContent = stamp;
        wrap.appendChild(time);
      }
      if (kind === "me") {
        el.appendChild(wrap);
        el.appendChild(avatar);
      } else {
        el.appendChild(avatar);
        el.appendChild(wrap);
      }
    } else {
      el.textContent = text;
    }
    log.appendChild(el);
    scrollLogToEnd();
    return el;
  }

  function showTyping() {
    if (typingEl) return;
    typingEl = document.createElement("div");
    typingEl.className = "msg them typing";
    typingEl.setAttribute("aria-hidden", "true");
    var avatar = createAvatar();
    var wrap = document.createElement("div");
    wrap.className = "bubble-wrap";
    var bubble = document.createElement("div");
    bubble.className = "bubble";
    for (var i = 0; i < 3; i++) {
      var dot = document.createElement("span");
      dot.className = "typing-dot";
      bubble.appendChild(dot);
    }
    wrap.appendChild(bubble);
    typingEl.appendChild(avatar);
    typingEl.appendChild(wrap);
    log.appendChild(typingEl);
    scrollLogToEnd();
  }

  function hideTyping() {
    if (typingEl) {
      typingEl.remove();
      typingEl = null;
    }
  }

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
    quickActions.dataset.hidden = card ? "1" : "0";
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

  function stored() {
    try { return JSON.parse(localStorage.getItem(storageKey) || "null"); } catch (e) { return null; }
  }

  function store(value) {
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

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
    sendBtn.disabled = sending || !session;
    verifyBtn.disabled = Boolean(card) || !session;
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
    opening = null;
    store(null);
    if (poller) { clearInterval(poller); poller = null; }
    closeCard();
    clearWaitingNotice();
    hideTyping();
    setConnection(disabled ? "Chat is unavailable. Please use the shop's contact page." : "This chat has ended. Reconnect to start a new chat.", !disabled);
  }

  var refreshing = null;
  function requestSession() {
    if (preview) {
      session = { sessionId: "preview", token: "preview", messages: [] };
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
          beginNewConversation(null, null, true);
          render(data.messages);
          setEscalated(data.escalated === true);
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
      render(data.messages);
      setEscalated(data.escalated === true);
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
    if (!session) connect();
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

  function closeCard() {
    if (card) { card.remove(); card = null; }
    verifyBtn.disabled = !session;
    syncQuickActions();
  }

  function openCard() {
    if (!session) return;
    if (card) { card.querySelector("input").focus(); return; }
    verifyBtn.disabled = true;
    card = document.createElement("div");
    syncQuickActions();
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
        scrollLogToEnd();
      });
    });
    return primary;
  }

  function scrollLogToEnd(smooth) {
    if (smooth && isMobileLayout() && typeof log.scrollTo === "function") {
      log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
      return;
    }
    log.scrollTop = log.scrollHeight;
  }

  function postVerify(body) {
    if (preview) return Promise.resolve({ status: body.action === "request" ? "sent" : "verified" });
    return authedFetch("/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok && r.status !== 400) throw new Error("verify " + r.status);
      return r.json();
    });
  }

  function renderAskStep() {
    var currentCard = card;
    cardShell("Check an order", "Enter the order number and the email used at checkout.");
    var orderField = addField("Order number", "text", "#1025");
    var emailField = addField("Email", "email", "you@example.com");
    addActions("Send code", function (fail) {
      var orderName = orderField.value.trim();
      var email = emailField.value.trim();
      if (!orderName || !email) return fail("Both fields are needed.");

      postVerify({ action: "request", orderName: orderName, email: email }).then(function (data) {
        if (card !== currentCard) return;
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
    if (!preview) orderField.focus();
    scrollLogToEnd();
  }

  function renderCodeStep(orderName) {
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
    scrollLogToEnd();
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

  function sendMessage(text, retryEntry) {
    if (!text || sending || !session || !session.token) return;
    if (preview) {
      hasSentMessage = true;
      renderPrompts();
      append(text, "me");
      input.value = "";
      resizeComposer();
      append("Thanks for your message! This is a preview of how replies will look in your store.", "them");
      return;
    }
    if (retryEntry && retryEntry.sessionId !== session.sessionId) {
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
      id: window.crypto.randomUUID(), text: text, sessionId: session.sessionId,
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
      sendBtn.disabled = !session;
      input.focus();
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || !session || sending) return;
    var retry = failedDraft && failedDraft.text === text && failedDraft.sessionId === session.sessionId
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
      session = { sessionId: "preview", token: "preview", messages: [] };
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
