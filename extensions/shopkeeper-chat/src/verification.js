export function verificationNote(outcome, orderName) {
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


export function createVerification({ log, verifyBtn, preview, hasSession, authedFetch, append, syncQuickActions, scrollLogToEnd }) {
  var card = null;
  function closeCard() {
    if (card) { card.remove(); card = null; }
    verifyBtn.disabled = !hasSession();
    syncQuickActions();
  }

  function openCard() {
    if (!hasSession()) return;
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

  verifyBtn.addEventListener("click", openCard);

  return { openCard, closeCard, isOpen: () => Boolean(card) };
}
