/**
 * Lane 1 — wizard → Gravity Forms bridge.
 *
 * The approved wizard UI is untouched. This layer intercepts its "Verzenden"
 * button before the UI-only handler can fake a success step, mirrors the answers
 * (including files) into a hidden real Gravity Form, submits it over GF's own
 * AJAX path, and only then shows the wizard's "Bedankt!" step. A failure stays
 * visible instead of being swallowed.
 *
 * Config comes from window.SOLYX_GF_BRIDGE = { formId }.
 */
(function () {
  var CFG = window.SOLYX_GF_BRIDGE || {};
  var formId = CFG.formId;
  if (!formId) return;

  var TIMEOUT_MS = 60000;

  // Wizard field name → Gravity Forms input name.
  var TEXT = {
    firstName: "input_1",
    lastName: "input_2",
    email: "input_3",
    phone: "input_4",
    address: "input_5",
    city: "input_6",
    boilerOther: "input_9",
    notes: "input_14",
  };
  var CHOICE = {
    installation: ["input_7.1", "input_7.2"],
    boilerType: ["input_8"],
    splitter: ["input_10"],
    separateGroup: ["input_11"],
    cvConnection: ["input_12"],
    spaceNextToCV: ["input_13"],
    installerShare: ["input_15.1"],
    marketingOptIn: ["input_16.1"],
  };
  // The wizard allows 2 photos per zone; each maps to its own single-file field.
  var FILES = {
    meterkast: ["input_17", "input_18"],
    cvSpecs: ["input_19", "input_20"],
    cvBottom: ["input_21", "input_22"],
    installSpace: ["input_23", "input_24"],
  };
  var PAGE_URL_INPUT = "input_26";

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  ready(function () {
    var wizard = document.querySelector("#installForm");
    var submitBtn = document.querySelector("#submitBtn");
    var host = document.querySelector("#solyx-gf-host");
    if (!wizard || !submitBtn || !host) return;

    var busy = false;
    var settled = false;
    var timer = null;
    var observer = null;

    function gfForm() {
      return host.querySelector("#gform_" + formId);
    }

    function activeStep() {
      return wizard.querySelector(".step.active") || wizard.querySelector(".active");
    }

    // Same rule the wizard's own validator uses, so the button keeps behaving
    // as approved when a required answer is missing.
    function currentStepValid() {
      var step = activeStep();
      if (!step) return false;
      var required = step.querySelectorAll("[required]");
      for (var i = 0; i < required.length; i++) {
        var el = required[i];
        if (el.type === "checkbox" ? !el.checked : !String(el.value || "").trim()) return false;
      }
      return true;
    }

    function errorBox() {
      var box = document.querySelector("#solyx-form-error");
      if (box) return box;
      box = document.createElement("div");
      box.id = "solyx-form-error";
      box.setAttribute("role", "alert");
      box.style.cssText =
        "margin:16px 0;padding:14px 16px;border:1px solid #F4831F;border-radius:12px;" +
        "background:#FFF6EE;color:#3D3D3D;font-size:15px;line-height:1.45;";
      return box;
    }

    function showError(message, details) {
      var box = errorBox();
      box.innerHTML = "";
      var p = document.createElement("p");
      p.style.cssText = "margin:0;font-weight:600;";
      p.textContent = message;
      box.appendChild(p);
      if (details && details.length) {
        var ul = document.createElement("ul");
        ul.style.cssText = "margin:8px 0 0;padding-left:20px;";
        details.slice(0, 8).forEach(function (d) {
          var li = document.createElement("li");
          li.textContent = d;
          ul.appendChild(li);
        });
        box.appendChild(ul);
      }
      var step = activeStep();
      if (step && box.parentNode !== step) step.appendChild(box);
      box.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function clearError() {
      var box = document.querySelector("#solyx-form-error");
      if (box && box.parentNode) box.parentNode.removeChild(box);
    }

    function setPending(on) {
      busy = on;
      submitBtn.disabled = on;
      submitBtn.style.opacity = on ? "0.6" : "";
      submitBtn.style.pointerEvents = on ? "none" : "";
      if (on) {
        submitBtn.dataset.solyxLabel = submitBtn.dataset.solyxLabel || submitBtn.textContent.trim();
        submitBtn.textContent = "Versturen…";
      } else if (submitBtn.dataset.solyxLabel) {
        submitBtn.textContent = submitBtn.dataset.solyxLabel;
      }
    }

    function mirror() {
      var form = gfForm();
      if (!form) return false;

      Object.keys(TEXT).forEach(function (name) {
        var src = wizard.querySelector('[name="' + name + '"]');
        var dst = form.querySelector('[name="' + TEXT[name] + '"]');
        if (src && dst) dst.value = src.value || "";
      });

      Object.keys(CHOICE).forEach(function (name) {
        var targets = CHOICE[name];
        targets.forEach(function (t) {
          Array.prototype.forEach.call(form.querySelectorAll('[name="' + t + '"]'), function (el) {
            el.checked = false;
          });
        });
        Array.prototype.forEach.call(wizard.querySelectorAll('[name="' + name + '"]'), function (src) {
          if (!src.checked) return;
          for (var i = 0; i < targets.length; i++) {
            var dst = form.querySelector('[name="' + targets[i] + '"][value="' + src.value + '"]');
            if (dst) {
              dst.checked = true;
              return;
            }
          }
        });
      });

      Object.keys(FILES).forEach(function (name) {
        var src = wizard.querySelector('input[type="file"][name="' + name + '"]');
        if (!src) return;
        var picked = src.files ? Array.prototype.slice.call(src.files) : [];
        FILES[name].forEach(function (target, i) {
          var dst = form.querySelector('input[type="file"][name="' + target + '"]');
          if (!dst) return;
          var dt = new DataTransfer();
          if (picked[i]) dt.items.add(picked[i]);
          dst.files = dt.files;
        });
      });

      var pageUrl = form.querySelector('[name="' + PAGE_URL_INPUT + '"]');
      if (pageUrl) pageUrl.value = window.location.href;
      return true;
    }

    function showDoneStep() {
      var steps = Array.prototype.slice.call(wizard.querySelectorAll(".step"));
      var done = wizard.querySelector("#form-step-17") || wizard.querySelector(".form-step-17");
      if (!done) return false;
      steps.forEach(function (s) {
        s.classList.remove("active");
      });
      done.classList.add("active");
      var navRow = document.querySelector("#navRow");
      if (navRow) navRow.style.display = "none";
      var counter = document.querySelector("#stepCounter");
      if (counter) counter.style.display = "none";
      window.scrollTo({ top: 0, behavior: "smooth" });
      return true;
    }

    function stop() {
      if (timer) clearTimeout(timer);
      if (observer) observer.disconnect();
      timer = null;
      observer = null;
    }

    function succeed() {
      if (settled) return;
      settled = true;
      stop();
      clearError();
      if (!showDoneStep()) setPending(false);
    }

    function fail(message, details) {
      if (settled) return;
      settled = true;
      stop();
      setPending(false);
      showError(message, details);
    }

    function validationMessages() {
      var form = gfForm();
      if (!form) return [];
      return Array.prototype.slice
        .call(form.querySelectorAll(".gfield_validation_message, .validation_message, .gform_submission_error"))
        .map(function (el) {
          return el.textContent.trim();
        })
        .filter(Boolean);
    }

    function watch() {
      settled = false;
      // GF replaces the wrapper inside the host on AJAX return, so observe the
      // stable host rather than the wrapper itself.
      observer = new MutationObserver(function () {
        if (host.querySelector(".solyx-gf-ok")) {
          succeed();
          return;
        }
        var form = gfForm();
        if (form && form.querySelector(".gfield_error, .gform_submission_error, .gform_validation_errors")) {
          fail(
            "We konden je aanvraag niet verzenden. Controleer de gegevens hieronder en probeer het opnieuw.",
            validationMessages()
          );
        }
      });
      observer.observe(host, { childList: true, subtree: true });

      timer = setTimeout(function () {
        fail(
          "Verzenden duurde te lang. Controleer je internetverbinding en probeer het opnieuw, " +
            "of mail je gegevens naar info@solyxenergy.nl."
        );
      }, TIMEOUT_MS);
    }

    // Capture on document so this runs before the wizard's own button handler,
    // whichever script loaded first.
    document.addEventListener(
      "click",
      function (e) {
        var btn = e.target && e.target.closest ? e.target.closest("#submitBtn") : null;
        if (!btn) return;
        if (busy) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Let the wizard show its own inline feedback for a missing answer.
        if (!currentStepValid()) return;

        var form = gfForm();
        if (!form) return; // No backend present: leave existing behaviour alone.

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        clearError();
        setPending(true);
        if (!mirror()) {
          fail("Verzenden is nu niet mogelijk. Probeer het later opnieuw of mail naar info@solyxenergy.nl.");
          return;
        }
        watch();

        var gfSubmit = form.querySelector('input[type="submit"], button[type="submit"]');
        if (form.requestSubmit && gfSubmit) form.requestSubmit(gfSubmit);
        else if (gfSubmit) gfSubmit.click();
        else form.submit();
      },
      true
    );
  });
})();
