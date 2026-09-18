import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSemanticGroups,
  classifyCardText,
  documentInventory,
  sanitiseOcrLines,
} from "../card-v32-semantic-core.js";

test("l'OCR conserve le texte exact et normalise sa confiance", () => {
  const [line] = sanitiseOcrLines([{ id: "a", text: "  +33 6 12 34 56 78  ", bbox: [.2,.3,.4,.05], confidence: 92 }]);
  assert.equal(line.text, "+33 6 12 34 56 78");
  assert.equal(line.role, "phone");
  assert.equal(line.confidence, .92);
});

test("les rôles déterministes protègent les coordonnées critiques", () => {
  assert.equal(classifyCardText("contact@microplayer.fr"), "email");
  assert.equal(classifyCardText("www.microplayer.fr"), "website");
  assert.equal(classifyCardText("12 rue de Dijon 21800 Quetigny"), "address");
});

test("un pictogramme proche rejoint le groupe de son texte", () => {
  const groups = buildSemanticGroups([
    { id:"phone", type:"text", role:"phone", text:"06 12 34 56 78", bbox:[.55,.45,.3,.05] },
    { id:"phone-icon", type:"object", role:"other", label:"icône téléphone", bbox:[.51,.45,.025,.05] },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].role, "phone");
  assert.equal(groups[0].items.length, 2);
});

test("l'inventaire refuse une fausse analyse réduite à un seul bloc", () => {
  const inventory = documentInventory([{ id:"one", type:"text", role:"other", text:"Carte entière", bbox:[0,0,1,1] }]);
  assert.equal(inventory.complete, false);
});
