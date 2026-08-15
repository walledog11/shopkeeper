(function () {
  var root = document.getElementById("shopkeeper-chat-root");
  if (!root || root.dataset.mounted) return;
  root.dataset.mounted = "1";

  var proxy = root.dataset.proxy;
  var side = root.dataset.position === "left" ? "left" : "right";
  var greeting = root.dataset.greeting || "";
  var launcherLabel = root.dataset.launcherLabel || "Chat with us";
  var panelTitle = root.dataset.panelTitle || launcherLabel;
  var statusLine = root.dataset.statusLine || "";
  var logoUrl = root.dataset.logoUrl || "";
  var accent = root.dataset.accent || "#1a1a1a";

  var colorBlack = "#1a1a1a";
  var colorWhite = "#ffffff";
  var colorTan = "#d4b896";
  var colorTanBg = "#f5ebe0";
  var colorTanShadow = "#c4a574";
  var colorTanDot = "#d9cfc0";
  var colorMuted = "#6b5d4f";
  var colorAccent = accent;

  var brutalBorder = "2px solid " + colorBlack;
  var brutalShadow = "-2px 2px 0 " + colorTanShadow;
  var brutalShadowSm = "-2px 2px 0 " + colorTanShadow;
  var brutalShadowFocus = "-3px 3px 0 " + colorTanShadow;
  var panelRadius = side === "right" ? "18px 18px 0 18px" : "18px 18px 18px 0";
  var launcherRadius = side === "right" ? "22px 22px 0 22px" : "22px 22px 22px 0";
  var sideInset = side + ": max(20px, env(safe-area-inset-" + side + "));";

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
    "<style>",
    ":host { all: initial; display: block; overflow: hidden; }",
    "*, *::before, *::after { box-sizing: border-box; }",
    ".launcher {",
    "  position: fixed; bottom: max(20px, env(safe-area-inset-bottom)); " + sideInset + " z-index: 2147483000;",
    "  display: flex; align-items: center; gap: 10px;",
    "  padding: 12px 20px; cursor: pointer;",
    "  border: " + brutalBorder + "; border-radius: " + launcherRadius + ";",
    "  background: " + colorAccent + "; color: " + colorWhite + ";",
    "  font: 600 15px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
    "  box-shadow: " + brutalShadow + ";",
    "}",
    ".launcher[data-open='1'] { box-shadow: none; }",
    ".launcher-badge {",
    "  position: absolute; top: -6px; " + (side === "right" ? "right" : "left") + ": -4px;",
    "  min-width: 18px; height: 18px; padding: 0 5px;",
    "  border: " + brutalBorder + "; border-radius: 999px;",
    "  background: #c44; color: " + colorWhite + ";",
    "  font: 700 11px/14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
    "  text-align: center;",
    "  display: none;",
    "}",
    ".launcher-badge[data-visible='1'] { display: block; }",
    ".launcher-icon {",
    "  display: flex; align-items: center; justify-content: center;",
    "  width: 28px; height: 28px; flex-shrink: 0;",
    "  border: 2px solid " + colorBlack + "; border-radius: 50%;",
    "  background: " + colorTan + "; box-shadow: " + brutalShadowSm + ";",
    "}",
    ".launcher[data-open='1'] .launcher-icon { box-shadow: none; }",
    ".launcher-icon svg { display: block; width: 22px; height: 22px; }",
    ".launcher[data-open='1'] { padding: 12px; gap: 0; }",
    ".launcher[data-open='1'] .launcher-label { display: none; }",
    ".panel {",
    "  position: fixed; bottom: 84px; " + sideInset + " z-index: 2147483000;",
    "  width: min(380px, calc(100vw - 40px)); height: min(520px, calc(100vh - 120px));",
    "  display: none; flex-direction: column; overflow: hidden; min-height: 0; max-width: 100%;",
    "  background: " + colorWhite + "; border: none; border-radius: " + panelRadius + ";",
    "  box-shadow: none;",
    "  font: 400 15px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;",
    "  color: " + colorBlack + ";",
    "}",
    ".panel[data-open='1'] { display: flex; }",
    ".header {",
    "  padding: 14px 16px; background: " + colorAccent + "; color: " + colorWhite + ";",
    "  display: flex; justify-content: space-between; align-items: center; gap: 12px;",
    "  border-bottom: " + brutalBorder + "; flex-shrink: 0;",
    "}",
    ".header-brand { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }",
    ".header-logo {",
    "  width: 36px; height: 36px; flex-shrink: 0;",
    "  border: 2px solid " + colorWhite + "; border-radius: 50%; object-fit: cover;",
    "}",
    ".header-text { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; }",
    ".header h2 { margin: 0; font-size: 15px; font-weight: 700; white-space: nowrap; flex-shrink: 0; }",
    ".header-status { margin: 0; font-size: 12px; font-weight: 400; opacity: .88; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }",
    ".header-status::before { content: '\\00b7'; margin-right: 8px; opacity: .75; }",
    ".header-close {",
    "  display: none; flex-shrink: 0; align-items: center; justify-content: center;",
    "  width: 34px; height: 34px; padding: 0; cursor: pointer;",
    "  border: 2px solid " + colorWhite + "; border-radius: 50%;",
    "  background: " + colorTan + "; color: " + colorBlack + ";",
    "}",
    ".header-close svg { display: block; width: 16px; height: 16px; }",
    ".header-close:focus-visible { outline: 2px solid " + colorWhite + "; outline-offset: 2px; }",
    ".log { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 14px;",
    "  background-color: " + colorTanBg + ";",
    "  background-image: radial-gradient(circle, " + colorTanDot + " 1px, transparent 1px);",
    "  background-size: 14px 14px; -webkit-overflow-scrolling: touch; }",
    ".msg { display: flex; align-items: flex-end; gap: 8px; max-width: 92%; }",
    ".msg.them { align-self: flex-start; }",
    ".msg.me { align-self: flex-end; }",
    ".msg .bubble-wrap { display: flex; flex-direction: column; gap: 4px; min-width: 0; }",
    ".msg.me .bubble-wrap { align-items: flex-end; }",
    ".msg .bubble {",
    "  padding: 10px 14px; white-space: pre-wrap; word-wrap: break-word; overflow-wrap: anywhere;",
    "  border: " + brutalBorder + "; font-size: 15px; line-height: 1.4;",
    "  box-shadow: " + brutalShadow + ";",
    "}",
    ".msg.them .bubble { background: " + colorWhite + "; color: " + colorBlack + "; border-radius: 18px 18px 18px 0; }",
    ".msg.me .bubble { background: " + colorAccent + "; color: " + colorWhite + "; border-radius: 18px 18px 0 18px; }",
    ".msg-time { font-size: 11px; color: " + colorMuted + "; line-height: 1; }",
    ".msg .avatar { flex-shrink: 0; width: 34px; height: 34px; }",
    ".msg .avatar svg { display: block; width: 34px; height: 34px; }",
    ".msg.note { align-self: center; background: none; color: " + colorMuted + "; font-size: 13px; text-align: center; max-width: 100%; }",
    ".msg.typing .bubble { display: flex; align-items: center; gap: 4px; min-width: 52px; min-height: 40px; padding: 12px 14px; }",
    ".typing-dot { width: 7px; height: 7px; border-radius: 50%; background: " + colorMuted + "; animation: typing-bounce 1.2s ease-in-out infinite; }",
    ".typing-dot:nth-child(2) { animation-delay: .15s; }",
    ".typing-dot:nth-child(3) { animation-delay: .3s; }",
    "@keyframes typing-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .45; } 30% { transform: translateY(-4px); opacity: 1; } }",
    ".quick-actions { flex-shrink: 0; padding: 14px 12px 12px; background: " + colorWhite + "; overflow: hidden; }",
    ".quick-actions[data-hidden='1'] { display: none; }",
    ".quick-actions-track {",
    "  display: flex; flex-wrap: nowrap; align-items: center; gap: 8px;",
    "  overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch;",
    "  overscroll-behavior-x: contain; scrollbar-width: none;",
    "}",
    ".quick-actions-track::-webkit-scrollbar { display: none; }",
    ".prompt-chip, .verify-open { flex: 0 0 auto; white-space: nowrap; }",
    ".prompt-chip {",
    "  border: " + brutalBorder + "; background: " + colorWhite + "; color: " + colorBlack + ";",
    "  border-radius: 999px; padding: 8px 12px; cursor: pointer;",
    "  font: inherit; font-size: 13px; font-weight: 600; line-height: 1.2; text-align: left;",
    "}",
    ".prompt-chip:hover { background: " + colorTanBg + "; }",
    ".prompt-chip:focus-visible { outline: 2px solid " + colorTan + "; outline-offset: 2px; }",
    ".composer { display: flex; align-items: flex-end; gap: 8px; padding: 12px; background: " + colorWhite + "; border-top: " + brutalBorder + "; flex-shrink: 0; min-width: 0; max-width: 100%; }",
    ".composer textarea {",
    "  flex: 1; padding: 10px 14px; min-width: 0; width: 100%; min-height: 42px; max-height: 120px; resize: none;",
    "  font: inherit; font-size: 16px; line-height: 1.35; overflow-y: auto; overflow-x: hidden;",
    "  border: " + brutalBorder + "; border-radius: 16px;",
    "  background: " + colorWhite + ";",
    "}",
    ".composer textarea:focus { outline: none; border-color: " + colorTan + "; }",
    ".composer button {",
    "  border: " + brutalBorder + "; background: " + colorAccent + "; color: " + colorWhite + ";",
    "  border-radius: 16px; padding: 10px 16px; line-height: 1.2; flex-shrink: 0;",
    "  cursor: pointer; font: inherit; font-weight: 600;",
    "}",
    ".composer button:disabled { opacity: .45; cursor: default; }",
    ".verify-open {",
    "  display: inline-flex; align-items: center; justify-content: center; gap: 8px;",
    "  border: " + brutalBorder + "; background: " + colorWhite + "; color: " + colorBlack + "; cursor: pointer;",
    "  font: inherit; font-size: 13px; font-weight: 600; line-height: 1.2;",
    "  padding: 10px 16px; border-radius: 999px; box-shadow: none;",
    "}",
    ".verify-open:hover { background: " + colorTanBg + "; }",
    ".verify-open:focus-visible { outline: 2px solid " + colorTan + "; outline-offset: 2px; }",
    ".verify-open:disabled { opacity: .45; cursor: default; }",
    ".card {",
    "  align-self: stretch; border: " + brutalBorder + "; border-radius: 18px 18px 18px 0;",
    "  padding: 12px; background: " + colorWhite + "; box-shadow: " + brutalShadow + ";",
    "  display: flex; flex-direction: column; gap: 8px;",
    "}",
    ".card h3 { margin: 0; font-size: 14px; font-weight: 700; }",
    ".card p { margin: 0; font-size: 13px; color: " + colorMuted + "; }",
    ".card label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: " + colorMuted + "; font-weight: 600; }",
    ".card input {",
    "  padding: 8px 10px; border: " + brutalBorder + "; border-radius: 10px 10px 10px 0;",
    "  font: inherit; font-size: 14px; min-width: 0; box-shadow: " + brutalShadowSm + ";",
    "}",
    ".card input:focus { outline: none; box-shadow: " + brutalShadowFocus + "; }",
    ".card .actions { display: flex; gap: 8px; }",
    ".card button {",
    "  border: " + brutalBorder + "; background: " + colorAccent + "; color: " + colorWhite + ";",
    "  border-radius: 12px 12px 0 12px; padding: 8px 14px; cursor: pointer;",
    "  font: inherit; font-size: 14px; font-weight: 600; box-shadow: " + brutalShadowSm + ";",
    "}",
    ".card button.ghost { background: " + colorWhite + "; color: " + colorBlack + "; border-radius: 12px 12px 12px 0; }",
    ".card button:disabled { opacity: .45; cursor: default; }",
    ".card .err { color: #a33; font-size: 12px; font-weight: 600; }",
    "@media (max-width: 480px) {",
    "  .panel {",
    "    top: 0; left: 0; right: auto; bottom: auto; width: 100%; max-width: 100%;",
    "    height: var(--sk-viewport-height, 100dvh); max-height: var(--sk-viewport-height, 100dvh);",
    "    border-radius: 0; touch-action: manipulation; -webkit-backface-visibility: hidden;",
    "  }",
    "  .quick-actions {",
    "    max-height: 72px; opacity: 1;",
    "    transition: max-height .22s cubic-bezier(.32,.72,0,1), opacity .18s ease, padding .22s cubic-bezier(.32,.72,0,1);",
    "  }",
    "  .panel[data-keyboard='1'] .quick-actions {",
    "    max-height: 0; opacity: 0; padding-top: 0; padding-bottom: 0; pointer-events: none;",
    "  }",
    "  .header { padding-top: max(14px, env(safe-area-inset-top)); }",
    "  .header-close { display: inline-flex; }",
    "  .launcher[data-open='1'] { display: none; }",
    "  .composer { padding-bottom: 12px; }",
    "  .card input { font-size: 16px; }",
    "}",
    "@media (prefers-reduced-motion: no-preference) {",
    "  .launcher, .verify-open, .card button, .composer button { transition: transform .12s ease, box-shadow .12s ease, background .12s ease; }",
    "  .launcher:not([data-open='1']):hover {",
    "    transform: translate(1px, -1px); box-shadow: " + brutalShadowFocus + ";",
    "  }",
    "  .launcher[data-open='1']:hover { filter: brightness(1.08); }",
    "  .card button:hover {",
    "    transform: translate(1px, -1px); box-shadow: " + brutalShadowFocus + ";",
    "  }",
    "  .composer button:hover { transform: none; box-shadow: none; filter: brightness(1.08); }",
    "}",
    "@media (prefers-reduced-motion: reduce) {",
    "  .typing-dot { animation: none; opacity: .7; }",
    "}",
    "</style>",
    "<button class='launcher' part='launcher' aria-haspopup='dialog' aria-expanded='false'>",
    "  <span class='launcher-badge' aria-hidden='true'></span>",
    "  <span class='launcher-icon' aria-hidden='true'>",
    "    <svg viewBox='0 0 22 22'><circle cx='11' cy='8' r='4.5' fill='" + colorTan + "' stroke='" + colorBlack + "' stroke-width='1.75'/>",
    "    <path d='M3 20c0-4.5 3.5-7.5 8-7.5s8 3 8 7.5' fill='" + colorTan + "' stroke='" + colorBlack + "' stroke-width='1.75' stroke-linejoin='round'/>",
    "    <path d='M8 9 Q11 11.5 14 9' fill='none' stroke='" + colorBlack + "' stroke-width='1.5' stroke-linecap='round'/></svg>",
    "  </span><span class='launcher-label'></span>",
    "</button>",
    "<div class='panel' role='dialog' aria-modal='false' data-open='0'>",
    "  <div class='header'>",
    "    <div class='header-brand'>",
    "      <img class='header-logo' alt='' hidden />",
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
    "      <button class='verify-open' type='button'>&#128274; Check an order</button>",
    "    </div>",
    "  </div>",
    "  <form class='composer'>",
    "    <textarea name='message' autocomplete='off' placeholder='Type a message&hellip;' aria-label='Message' maxlength='4000' rows='1'></textarea>",
    "    <button type='submit'>Send</button>",
    "  </form>",
    "</div>"
  ].join("");

  var launcher = shadow.querySelector(".launcher");
  var launcherBadge = shadow.querySelector(".launcher-badge");
  var launcherIcon = shadow.querySelector(".launcher-icon");
  var launcherLabelEl = shadow.querySelector(".launcher-label");
  var panel = shadow.querySelector(".panel");
  var headerTitle = shadow.querySelector(".header h2");
  var headerStatus = shadow.querySelector(".header-status");
  var headerLogo = shadow.querySelector(".header-logo");
  var headerClose = shadow.querySelector(".header-close");
  var log = shadow.querySelector(".log");
  var quickActions = shadow.querySelector(".quick-actions");
  var quickActionsTrack = shadow.querySelector(".quick-actions-track");
  var verifyBtn = shadow.querySelector(".verify-open");
  var form = shadow.querySelector(".composer");
  var input = shadow.querySelector(".composer textarea");
  var sendBtn = shadow.querySelector(".composer button");
  var card = null;

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

  var launcherIconChat = [
    "<svg viewBox='0 0 22 22'><circle cx='11' cy='8' r='4.5' fill='" + colorTan + "' stroke='" + colorBlack + "' stroke-width='1.75'/>",
    "<path d='M3 20c0-4.5 3.5-7.5 8-7.5s8 3 8 7.5' fill='" + colorTan + "' stroke='" + colorBlack + "' stroke-width='1.75' stroke-linejoin='round'/>",
    "<path d='M8 9 Q11 11.5 14 9' fill='none' stroke='" + colorBlack + "' stroke-width='1.5' stroke-linecap='round'/></svg>"
  ].join("");
  var launcherIconClose = [
    "<svg viewBox='0 0 22 22' aria-hidden='true'>",
    "<path d='M6 6 L16 16 M16 6 L6 16' fill='none' stroke='" + colorBlack + "' stroke-width='2' stroke-linecap='round'/>",
    "</svg>"
  ].join("");

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

  function isMobileLayout() {
    return mobileQuery.matches;
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
      panel.style.height = "100dvh";
      panel.style.transform = "none";
      panel.style.webkitTransform = "none";
      panel.style.setProperty("--sk-viewport-height", "100dvh");
      return;
    }
    var top = Math.max(0, vv.offsetTop);
    var left = Math.max(0, vv.offsetLeft);
    var width = Math.max(0, vv.width);
    var height = Math.max(0, vv.height);
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

  function avatarSvg(fill) {
    return [
      "<svg viewBox='0 0 34 34' aria-hidden='true'>",
      "<circle cx='17' cy='12' r='6.5' fill='" + fill + "' stroke='#000' stroke-width='2'/>",
      "<path d='M5 30c0-7 5.5-11.5 12-11.5s12 4.5 12 11.5' fill='" + fill + "' stroke='#000' stroke-width='2' stroke-linejoin='round'/>",
      "<path d='M12.5 13.5 Q17 17.5 21.5 13.5' fill='none' stroke='#000' stroke-width='1.75' stroke-linecap='round'/>",
      "</svg>"
    ].join("");
  }

  function append(text, kind, at) {
    var el = document.createElement("div");
    el.className = "msg " + kind;
    if (kind === "me" || kind === "them") {
      var avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.innerHTML = kind === "me" ? avatarSvg(colorTan) : avatarSvg(colorWhite);
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
    var avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.innerHTML = avatarSvg(colorWhite);
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

  function dropEcho(text) {
    var i = awaitingEcho.indexOf(text);
    if (i !== -1) awaitingEcho.splice(i, 1);
    return i !== -1;
  }

  var WAITING_NOTICE_MS = 20000;
  var waitingTimer = null;
  var waitingNoticeShown = false;

  function clearWaitingNotice() {
    if (waitingTimer) {
      clearTimeout(waitingTimer);
      waitingTimer = null;
    }
  }

  function armWaitingNotice() {
    clearWaitingNotice();
    waitingTimer = setTimeout(function () {
      waitingTimer = null;
      if (waitingNoticeShown) return;
      waitingNoticeShown = true;
      hideTyping();
      append("Someone from the shop is looking at this — the reply will appear right here.", "note");
    }, WAITING_NOTICE_MS);
  }

  function render(messages) {
    (messages || []).forEach(function (m) {
      if (seen[m.id]) return;
      seen[m.id] = true;
      if (m.from === "customer") hasSentMessage = true;
      if (m.from === "customer" && dropEcho(m.text)) return;
      if (m.from !== "customer") {
        clearWaitingNotice();
        waitingNoticeShown = false;
        hideTyping();
        if (panel.dataset.open !== "1") bumpUnread();
      }
      append(m.text, m.from === "customer" ? "me" : "them", m.at);
    });
    renderPrompts();
  }

  function requestSession() {
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
      if (r.status === 403) { root.remove(); return null; }
      if (!r.ok) throw new Error("bootstrap " + r.status);
      return r.json();
    }).then(function (data) {
      if (!data) return null;
      session = data;
      if (data.sessionId) {
        store({ sessionId: data.sessionId, resumeToken: data.resumeToken || prior.resumeToken });
      }
      return data;
    });
  }

  function bootstrap() {
    return requestSession().then(function (data) {
      if (!data) return;
      if (greeting && !(data.messages || []).length) append(greeting, "note");
      render(data.messages);
      startPolling();
    });
  }

  function authedFetch(path, init, retried) {
    if (!session || !session.token) return Promise.reject(new Error("no session"));
    var options = Object.assign({}, init);
    options.headers = Object.assign({}, init && init.headers, {
      Authorization: "Bearer " + session.token
    });
    return fetch(proxy + path, options).then(function (r) {
      if (r.status !== 401 || retried) return r;
      return requestSession().then(function (data) {
        if (!data) return r;
        return authedFetch(path, init, true);
      });
    });
  }

  function poll() {
    if (!session || !session.token) return;
    authedFetch("/messages", {}).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (data) {
      if (data) render(data.messages);
    }).catch(function () { /* transient */ });
  }

  function startPolling() {
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
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  var opening = null;
  function open() {
    lastFocusedBeforeOpen = document.activeElement;
    panel.dataset.open = "1";
    launcher.setAttribute("aria-expanded", "true");
    setLauncherOpen(true);
    clearUnread();
    syncMobilePanelLayout();
    if (!isMobileLayout()) input.focus();
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
    setLauncherOpen(false);
    clearMobilePanelLayout();
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
    verifyBtn.disabled = false;
    syncQuickActions();
  }

  function openCard() {
    if (card) { card.querySelector("input").focus(); return; }
    verifyBtn.disabled = true;
    syncQuickActions();
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

  function sendMessage(text) {
    if (!text || !session || !session.token) return;

    hasSentMessage = true;
    renderPrompts();
    sendBtn.disabled = true;
    var pending = append(text, "me");
    awaitingEcho.push(text);
    showTyping();
    armWaitingNotice();
    var clientMessageId = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 10);

    authedFetch("/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text, clientMessageId: clientMessageId })
    }).then(function (r) {
      if (r.status === 429) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          dropEcho(text);
          clearWaitingNotice();
          hideTyping();
          var pendingBubble = pending.querySelector(".bubble");
          if (pendingBubble) pendingBubble.style.opacity = "0.5";
          else pending.style.opacity = "0.5";
          append(body.shopperMessage || "Too many messages just now. Try again in a moment.", "note");
        });
      }
      if (!r.ok) throw new Error("send " + r.status);
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (body.verification) {
          dropEcho(text);
          clearWaitingNotice();
          hideTyping();
          append(verificationNote(body.verification, "that order"), "note");
          return;
        }
        setTimeout(poll, 1200);
      });
    }).catch(function () {
      dropEcho(text);
      clearWaitingNotice();
      hideTyping();
      var pendingBubble = pending.querySelector(".bubble");
      if (pendingBubble) pendingBubble.style.opacity = "0.5";
      else pending.style.opacity = "0.5";
      append("Not delivered. Check your connection and try again.", "note");
    }).finally(function () {
      sendBtn.disabled = false;
      input.focus();
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    resizeComposer();
    sendMessage(text);
  });
})();
