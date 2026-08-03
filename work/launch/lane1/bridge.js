/**
 * Lane 1 — approved UI → Gravity Forms bridge.
 *
 * The approved frontend is untouched. This layer intercepts each form's submit
 * before its UI-only handler can fake a success state, mirrors the answers
 * (including files) into a hidden real Gravity Form, submits over GF's own AJAX
 * path, and only then shows that form's existing success state. A failure stays
 * visible instead of being swallowed.
 *
 * Three adapters share one submit pipeline; each activates only if its anchor
 * is present, so one bundle serves every page.
 *
 *   #installForm   the 17-step installation wizard      (pages 800, 807)
 *   #contactForm   the FAQ contact form                 (page 721)
 *   form.hero-form the installer purchase-info capture  (page 781)
 *
 * Config comes from window.SOLYX_GF_BRIDGE = { formId }.
 */
(function () {
  var CFG = window.SOLYX_GF_BRIDGE || {};
  var FORM_ID = CFG.formId;
  if (!FORM_ID) return;

  // Eight photos from a phone on mobile data can outlast a short timeout. At 60s
  // the visitor was told it failed while the entry had in fact been saved, so
  // they submitted again and the lead arrived twice.
  var TIMEOUT_MS = 180000;

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function host() {
    return document.querySelector("#solyx-gf-host");
  }

  function gfForm() {
    var h = host();
    return h ? h.querySelector("#gform_" + FORM_ID) : null;
  }

  // ------------------------------------------------------------- error display

  function buildErrorBox() {
    var box = document.createElement("div");
    box.id = "solyx-form-error";
    box.setAttribute("role", "alert");
    box.style.cssText =
      "margin:16px 0;padding:14px 16px;border:1px solid #F4831F;border-radius:12px;" +
      "background:#FFF6EE;color:#3D3D3D;font-size:15px;line-height:1.45;";
    return box;
  }

  function clearError() {
    var box = document.querySelector("#solyx-form-error");
    if (box && box.parentNode) box.parentNode.removeChild(box);
  }

  /** place(box) inserts the box wherever the calling adapter wants it. */
  function showError(place, message, details) {
    clearError();
    var box = buildErrorBox();
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
    place(box);
    box.scrollIntoView({ behavior: "smooth", block: "center" });
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

  // ----------------------------------------------------------- mirror helpers

  function copyValue(srcEl, gfName) {
    var form = gfForm();
    if (!form || !srcEl) return;
    var dst = form.querySelector('[name="' + gfName + '"]');
    if (dst) dst.value = srcEl.value || "";
  }

  /** Frontend checkboxes carry no value attribute, so map by checked state. */
  function copyChecked(srcEl, gfName) {
    var form = gfForm();
    if (!form) return;
    var dst = form.querySelector('[name="' + gfName + '"]');
    if (dst) dst.checked = !!(srcEl && srcEl.checked);
  }

  function setPageUrl(gfName) {
    var form = gfForm();
    if (!form) return;
    var el = form.querySelector('[name="' + gfName + '"]');
    if (el) el.value = window.location.href;
  }

  // --------------------------------------------------------- submit pipeline

  /**
   * opts = { mirror, onSuccess, onFailUi, place }
   *   mirror()    copy the visible UI into the hidden form; false aborts
   *   onSuccess() show the frontend's own success state
   *   onFailUi()  restore the frontend to an editable state
   *   place(box)  insert the error box
   */
  function submitVia(opts) {
    var form = gfForm();
    if (!form) return false;

    var settled = false;
    var timer = null;
    var observer = null;

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
      opts.onSuccess();
    }

    function fail(message, details, keepLocked) {
      if (settled) return;
      settled = true;
      stop();
      if (!keepLocked) opts.onFailUi();
      showError(opts.place, message, details);
    }

    if (opts.mirror() === false) {
      opts.onFailUi();
      showError(opts.place, "Verzenden is nu niet mogelijk. Probeer het later opnieuw of mail naar info@solyxenergy.nl.");
      return true;
    }

    // GF replaces the wrapper inside the host on AJAX return, so observe the
    // stable host rather than the wrapper itself.
    var h = host();
    observer = new MutationObserver(function () {
      if (h.querySelector(".solyx-gf-ok")) {
        succeed();
        return;
      }
      var f = gfForm();
      if (f && f.querySelector(".gfield_error, .gform_submission_error, .gform_validation_errors")) {
        fail(
          "We konden je gegevens niet verzenden. Controleer de gegevens hieronder en probeer het opnieuw.",
          validationMessages()
        );
      }
    });
    observer.observe(h, { childList: true, subtree: true });

    timer = setTimeout(function () {
      // Deliberately stays locked. The submission may well have reached the
      // server, so re-enabling the button here is what produced duplicate leads.
      fail(
        "Het verzenden duurt langer dan verwacht. Mogelijk hebben we je gegevens al ontvangen — " +
          "verstuur het formulier niet nogmaals. Neem bij twijfel contact op via info@solyxenergy.nl.",
        null,
        true
      );
    }, TIMEOUT_MS);

    var gfSubmit = form.querySelector('input[type="submit"], button[type="submit"]');
    if (form.requestSubmit && gfSubmit) form.requestSubmit(gfSubmit);
    else if (gfSubmit) gfSubmit.click();
    else form.submit();
    return true;
  }

  // ------------------------------------------------- adapter: install wizard

  var WIZ_TEXT = {
    firstName: "input_1",
    lastName: "input_2",
    email: "input_3",
    phone: "input_4",
    address: "input_5",
    city: "input_6",
    boilerOther: "input_9",
    notes: "input_14",
  };
  var WIZ_CHOICE = {
    installation: ["input_7.1", "input_7.2"],
    boilerType: ["input_8"],
    splitter: ["input_10"],
    separateGroup: ["input_11"],
    cvConnection: ["input_12"],
    spaceNextToCV: ["input_13"],
    installerShare: ["input_15.1"],
    marketingOptIn: ["input_16.1"],
  };
  // The wizard caps each photo zone at two files (data-max="2"); each maps to
  // its own single-file GF field.
  var WIZ_FILES = {
    meterkast: ["input_17", "input_18"],
    cvSpecs: ["input_19", "input_20"],
    cvBottom: ["input_21", "input_22"],
    installSpace: ["input_23", "input_24"],
  };

  function initWizard() {
    var wizard = document.querySelector("#installForm");
    var submitBtn = document.querySelector("#submitBtn");
    if (!wizard || !submitBtn || !host()) return;

    var busy = false;

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

      Object.keys(WIZ_TEXT).forEach(function (name) {
        copyValue(wizard.querySelector('[name="' + name + '"]'), WIZ_TEXT[name]);
      });

      Object.keys(WIZ_CHOICE).forEach(function (name) {
        var targets = WIZ_CHOICE[name];
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

      Object.keys(WIZ_FILES).forEach(function (name) {
        var src = wizard.querySelector('input[type="file"][name="' + name + '"]');
        if (!src) return;
        var picked = src.files ? Array.prototype.slice.call(src.files) : [];
        WIZ_FILES[name].forEach(function (target, i) {
          var dst = form.querySelector('input[type="file"][name="' + target + '"]');
          if (!dst) return;
          var dt = new DataTransfer();
          if (picked[i]) dt.items.add(picked[i]);
          dst.files = dt.files;
        });
      });

      setPageUrl("input_26");
      return true;
    }

    function showDoneStep() {
      var steps = Array.prototype.slice.call(wizard.querySelectorAll(".step"));
      var done = wizard.querySelector("#form-step-17") || wizard.querySelector(".form-step-17");
      if (!done) {
        setPending(false);
        return;
      }
      steps.forEach(function (s) {
        s.classList.remove("active");
      });
      done.classList.add("active");
      var navRow = document.querySelector("#navRow");
      if (navRow) navRow.style.display = "none";
      var counter = document.querySelector("#stepCounter");
      if (counter) counter.style.display = "none";
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function place(box) {
      var step = activeStep();
      if (step) step.appendChild(box);
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
        if (!gfForm()) return; // No backend present: leave existing behaviour alone.

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        clearError();
        setPending(true);
        submitVia({
          mirror: mirror,
          onSuccess: showDoneStep,
          onFailUi: function () {
            setPending(false);
          },
          place: place,
        });
      },
      true
    );
  }

  // ------------------------------------------------- adapter: FAQ contact form

  function initContact() {
    var form = document.querySelector("#contactForm");
    if (!form || !host()) return;
    var btn = form.querySelector(".cf-submit");
    var busy = false;
    var label = btn ? btn.textContent : "";

    function setPending(on) {
      busy = on;
      if (!btn) return;
      btn.disabled = on;
      btn.style.opacity = on ? "0.6" : "";
      btn.textContent = on ? "Versturen…" : label;
    }

    function mirror() {
      if (!gfForm()) return false;
      copyValue(form.querySelector('[name="naam"]'), "input_1");
      copyValue(form.querySelector('[name="email"]'), "input_2");
      copyValue(form.querySelector('[name="woonplaats"]'), "input_3");
      copyValue(form.querySelector('[name="telefoon"]'), "input_4");
      copyValue(form.querySelector('[name="personen"]'), "input_5");
      copyValue(form.querySelector('[name="zonnepanelen"]'), "input_6");
      copyValue(form.querySelector('[name="tapwater"]'), "input_7");
      copyValue(form.querySelector('[name="bericht"]'), "input_8");
      copyChecked(form.querySelector('[name="marketing"]'), "input_9.1");
      setPageUrl("input_11");
      return true;
    }

    function place(box) {
      if (btn && btn.parentNode) btn.parentNode.insertBefore(box, btn);
      else form.appendChild(box);
    }

    document.addEventListener(
      "submit",
      function (e) {
        if (e.target !== form) return;
        if (busy) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (!gfForm()) return; // No backend present: leave existing behaviour alone.

        e.preventDefault();
        e.stopImmediatePropagation();

        // The markup carries novalidate and the approved handler validates by
        // hand, so reproduce that exactly before doing anything else.
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }

        clearError();
        setPending(true);
        submitVia({
          mirror: mirror,
          onSuccess: function () {
            form.classList.add("sent");
            form.scrollIntoView({ behavior: "smooth", block: "center" });
          },
          onFailUi: function () {
            setPending(false);
          },
          place: place,
        });
      },
      true
    );
  }

  // ------------------------------------- adapter: installer purchase-info form

  function initHero() {
    var form = document.querySelector("form.hero-form");
    if (!form || !host()) return;
    var btn = form.querySelector(".hero-form-btn");
    var busy = false;
    var markup = btn ? btn.innerHTML : "";

    function setPending(on) {
      busy = on;
      if (!btn) return;
      btn.disabled = on;
      btn.style.opacity = on ? "0.6" : "";
      if (on) btn.textContent = "Versturen…";
      else btn.innerHTML = markup;
    }

    function mirror() {
      if (!gfForm()) return false;
      // The approved markup gives this input no name attribute.
      copyValue(form.querySelector(".hero-form-input") || form.querySelector('input[type="email"]'), "input_1");
      setPageUrl("input_3");
      return true;
    }

    function place(box) {
      if (form.parentNode) form.parentNode.insertBefore(box, form.nextSibling);
    }

    document.addEventListener(
      "submit",
      function (e) {
        if (e.target !== form) return;
        if (busy) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (!gfForm()) return; // No backend present: leave existing behaviour alone.

        e.preventDefault();
        e.stopImmediatePropagation();

        clearError();
        setPending(true);
        submitVia({
          mirror: mirror,
          onSuccess: function () {
            // Matches the approved success state exactly.
            if (btn) btn.textContent = "Verzonden ✓";
          },
          onFailUi: function () {
            setPending(false);
          },
          place: place,
        });
      },
      true
    );
  }

  ready(function () {
    if (!host()) return;
    initWizard();
    initContact();
    initHero();
  });
})();
