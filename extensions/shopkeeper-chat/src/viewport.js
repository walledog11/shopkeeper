export function createViewport({ root, panel, launcher, setLauncherOpen, scrollLogToEnd }) {
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

  return { isMobileLayout, isVisibleOnViewport, clearMobilePanelLayout, syncMobilePanelLayout, setKeyboardOpen };
}
