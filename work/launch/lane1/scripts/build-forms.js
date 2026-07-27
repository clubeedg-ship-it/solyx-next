#!/usr/bin/env node
/**
 * Lane 1 — generate Gravity Forms import files for the two installation wizards.
 *
 * The approved wizard UI stays untouched; these forms are the backend it submits
 * into. Choice values mirror the wizard input values exactly so the bridge can
 * map by value attribute (see bridge.js).
 *
 * Output: gf-installatie.json, gf-boilergarant.json (GF Import/Export format).
 */
const fs = require("node:fs");
const path = require("node:path");

const OUT = path.resolve(__dirname, "..");
const GF_VERSION = "2.10.5";
const NOTIFY_TO = "info@solyxenergy.nl";

// Photo zones: the wizard allows 2 images per zone. GF single-file upload fields
// render a plain <input type="file">, which the bridge can populate via
// DataTransfer. GF multi-file fields use their own async uploader and cannot be
// mirrored without relying on plugin internals.
const PHOTO_ZONES = [
  { name: "meterkast", label: "Foto van de gehele meterkast" },
  { name: "cvSpecs", label: "Foto van de CV-combiketel specificaties" },
  { name: "cvBottom", label: "Foto's van de onderkant van de CV-ketel" },
  { name: "installSpace", label: "Foto's van de installatieruimte" },
];

const IMAGE_EXT = "jpg,jpeg,png,heic,heif,webp";

function choices(pairs) {
  return pairs.map(([text, value]) => ({ text, value, isSelected: false, price: "" }));
}

function buildFields() {
  const f = [];
  const push = (field) => {
    f.push({
      isRequired: false,
      size: "large",
      errorMessage: "",
      inputs: null,
      description: "",
      allowsPrepopulate: false,
      visibility: "visible",
      pageNumber: 1,
      formId: 0,
      ...field,
    });
  };

  push({ id: 1, type: "text", label: "Voornaam", adminLabel: "firstName", isRequired: true });
  push({ id: 2, type: "text", label: "Achternaam", adminLabel: "lastName", isRequired: true });
  push({ id: 3, type: "email", label: "E-mailadres", adminLabel: "email", isRequired: true });
  push({ id: 4, type: "phone", label: "Telefoonnummer", adminLabel: "phone", isRequired: true, phoneFormat: "standard" });
  push({ id: 5, type: "text", label: "Installatieadres", adminLabel: "address", isRequired: true });
  push({ id: 6, type: "text", label: "Woonplaats", adminLabel: "city", isRequired: true });

  push({
    id: 7,
    type: "checkbox",
    label: "Installatie van",
    adminLabel: "installation",
    enableChoiceValue: true,
    choices: choices([
      ["Nymo", "nymo"],
      ["Elektrische boiler", "boiler"],
    ]),
    inputs: [
      { id: "7.1", label: "Nymo", name: "" },
      { id: "7.2", label: "Elektrische boiler", name: "" },
    ],
  });

  push({
    id: 8,
    type: "radio",
    label: "Welke boiler wordt geïnstalleerd?",
    adminLabel: "boilerType",
    enableChoiceValue: true,
    choices: choices([
      ["100L boiler", "100L"],
      ["150L boiler", "150L"],
      ["Anders", "anders"],
    ]),
  });
  push({ id: 9, type: "text", label: "Boiler — anders, namelijk", adminLabel: "boilerOther" });

  push({
    id: 10,
    type: "radio",
    label: "Is er een P1-poort splitter nodig?",
    adminLabel: "splitter",
    enableChoiceValue: true,
    choices: choices([
      ["Ja", "ja"],
      ["Nee", "nee"],
      ["Weet ik niet", "onbekend"],
    ]),
  });

  push({
    id: 11,
    type: "radio",
    label: "Aparte elektrische groep aanwezig?",
    adminLabel: "separateGroup",
    enableChoiceValue: true,
    choices: choices([
      ["Ja", "ja"],
      ["Nee", "nee"],
      ["Anders / weet ik niet", "anders"],
    ]),
  });

  push({
    id: 12,
    type: "radio",
    label: "Wordt de boiler aangesloten op de CV-combiketel?",
    adminLabel: "cvConnection",
    enableChoiceValue: true,
    choices: choices([
      ["Ja", "ja"],
      ["Nee", "nee"],
      ["Er is al een elektrische boiler geïnstalleerd", "al-geinstalleerd"],
    ]),
  });

  push({
    id: 13,
    type: "radio",
    label: "Genoeg ruimte naast de CV-combiketel?",
    adminLabel: "spaceNextToCV",
    enableChoiceValue: true,
    choices: choices([
      ["Ja, er is genoeg ruimte", "ja"],
      ["Nee / misschien niet", "nee"],
    ]),
  });

  push({ id: 14, type: "textarea", label: "Opmerkingen", adminLabel: "notes" });

  push({
    id: 15,
    type: "checkbox",
    label: "Toestemming delen met installateur",
    adminLabel: "installerShare",
    isRequired: true,
    enableChoiceValue: true,
    choices: choices([["Akkoord dat dit formulier gedeeld wordt met de installateur in de regio", "ja"]]),
    inputs: [{ id: "15.1", label: "Akkoord", name: "" }],
  });

  push({
    id: 16,
    type: "checkbox",
    label: "Marketing opt-in",
    adminLabel: "marketingOptIn",
    enableChoiceValue: true,
    choices: choices([["Wil op de hoogte blijven van nieuwe producten en acties", "ja"]]),
    inputs: [{ id: "16.1", label: "Opt-in", name: "" }],
  });

  // 8 single-file upload fields: 2 per photo zone.
  let id = 17;
  PHOTO_ZONES.forEach((zone) => {
    for (let n = 1; n <= 2; n++) {
      push({
        id: id++,
        type: "fileupload",
        label: `${zone.label} (${n})`,
        adminLabel: `${zone.name}${n}`,
        allowedExtensions: IMAGE_EXT,
        multipleFiles: false,
      });
    }
  });

  push({ id: 25, type: "hidden", label: "Bron", adminLabel: "source", defaultValue: "" });
  push({ id: 26, type: "hidden", label: "Pagina", adminLabel: "pageUrl", defaultValue: "" });

  return f;
}

function buildForm({ title, description, source, notificationId, confirmationId }) {
  const fields = buildFields();
  fields.find((f) => f.id === 25).defaultValue = source;

  return {
    title,
    description,
    labelPlacement: "top_label",
    descriptionPlacement: "below",
    button: { type: "text", text: "Verzenden", imageUrl: "" },
    fields,
    version: GF_VERSION,
    // The wizard owns the visible success state; this confirmation is only what
    // the hidden form returns to the bridge.
    confirmations: {
      [confirmationId]: {
        id: confirmationId,
        name: "Default Confirmation",
        isDefault: true,
        type: "message",
        message: '<div class="solyx-gf-ok">ok</div>',
        url: "",
        pageId: "",
        queryString: "",
      },
    },
    notifications: {
      [notificationId]: {
        id: notificationId,
        isActive: true,
        to: NOTIFY_TO,
        name: "Aanvraag naar Solyx",
        event: "form_submission",
        toType: "email",
        // From the site address so SPF/DKIM stay valid; the customer address is
        // the reply target instead of the sender.
        from: "{admin_email}",
        fromName: "Solyx Energy website",
        replyTo: "{E-mailadres:3}",
        subject: `${title}: {Voornaam:1} {Achternaam:2} — {Woonplaats:6}`,
        message: "{all_fields}",
        disableAutoformat: false,
      },
    },
    enableHoneypot: true,
    requireLogin: false,
    is_active: "1",
    is_trash: "0",
  };
}

const forms = {
  "gf-installatie.json": buildForm({
    title: "Installatie aanvraag",
    description: "",
    source: "installatie-formulier",
    notificationId: "5f1a20c4a1001",
    confirmationId: "5f1a20c4a2001",
  }),
  "gf-boilergarant.json": buildForm({
    title: "Boilergarant installatie aanvraag",
    description: "",
    source: "installatie-formulier-boilergarant",
    notificationId: "5f1a20c4a1002",
    confirmationId: "5f1a20c4a2002",
  }),
};

Object.entries(forms).forEach(([file, form]) => {
  const payload = { version: GF_VERSION, 0: form };
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(payload, null, 2));
  console.log(`wrote ${file} — ${form.fields.length} fields`);
});
