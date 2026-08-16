const imageInput = document.getElementById("imageInput");
const generateBtn = document.getElementById("generateBtn");
const gifBtn = document.getElementById("gifBtn");
const statusBox = document.getElementById("status");
const photoLayer = document.getElementById("photoLayer");
const placeholder = document.getElementById("placeholder");

let selectedImageURL = null;

function setStatus(message) {
  if (statusBox) statusBox.textContent = message;
}

imageInput.addEventListener("change", function () {
  const file = this.files && this.files[0];

  if (!file) {
    generateBtn.disabled = true;
    gifBtn.disabled = true;
    setStatus("Chargez une photo pour commencer.");
    return;
  }

  if (selectedImageURL) {
    URL.revokeObjectURL(selectedImageURL);
  }

  selectedImageURL = URL.createObjectURL(file);

  photoLayer.src = selectedImageURL;
  photoLayer.classList.remove("animating");
  photoLayer.classList.add("visible");

  if (placeholder) {
    placeholder.style.display = "none";
  }

  generateBtn.disabled = false;
  gifBtn.disabled = true;

  setStatus("Photo chargée. Touchez « Créer l’aperçu 3D ».");
});

generateBtn.addEventListener("click", function () {
  if (!selectedImageURL) return;

  photoLayer.classList.remove("animating");
  void photoLayer.offsetWidth;
  photoLayer.classList.add("animating");

  gifBtn.disabled = false;

  setStatus(
    "Aperçu 3D actif : mouvement gauche ↔ droite et profondeur visuelle renforcée."
  );
});

gifBtn.addEventListener("click", function () {
  if (!selectedImageURL) return;

  setStatus(
    "Aperçu démo actif. L’export GIF sera ajouté à l’étape suivante."
  );
});
