export function createMessageRenderer({ log, scrollLogToEnd, getLogoUrl, launcherIconChat }) {
  var typingEl = null;
  function formatTime(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch (e) {
      return "";
    }
  }

  function createAvatar() {
    var avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");
    var logoUrl = getLogoUrl();
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

  return { createAvatar, append, showTyping, hideTyping };
}
