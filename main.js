import { ImageEnhancerAPI } from "./image-api.js";

const imageInput = document.getElementById("imageInput");
const dropZone=document.getElementById("dropZone");
const sourceImage = document.getElementById("sourceImage");
const resultImage = document.getElementById("resultImage");
const statusBlock = document.getElementById("statusBlock");
const statusText = document.getElementById("statusText");
const processButton = document.getElementById("processButton");
const cancelButton = document.getElementById("cancelButton");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const downloadButton = document.getElementById("downloadButton");
const sourcePlaceholder = document.getElementById("sourcePlaceholder");
const resultPlaceholder = document.getElementById("resultPlaceholder");
const processingOverlay = document.getElementById("processingOverlay");
const taskInfoBlock = document.getElementById("taskInfoBlock");
const taskInfoText = document.getElementById("taskInfoText");

const manualControls = document.getElementById("manualControls");
const brightnessSlider = document.getElementById("brightnessSlider");
const contrastSlider = document.getElementById("contrastSlider");
const saturationSlider = document.getElementById("saturationSlider");
const brightnessValue = document.getElementById("brightnessValue");
const contrastValue = document.getElementById("contrastValue");
const saturationValue = document.getElementById("saturationValue");
const resetAdjustmentsButton = document.getElementById("resetAdjustmentsButton");

const imageAPI = new ImageEnhancerAPI("image-worker.js");

let currentImageUrl = null;
let currentFile = null;
let originalFile = null;
let activeTaskId = null;
let processingStartTime = null;

let baseEnhancedImageData = null;
let manualCanvas = document.createElement("canvas");
let manualContext = manualCanvas.getContext("2d");
let manualRenderRequest = null;

function updateProgress(value, text) {
  progressBar.value = value;
  progressText.textContent = `${value}%`;
  statusText.textContent = `Статус: ${text}`;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateTaskInfo(items) {
  if (!Array.isArray(items)) {
    taskInfoText.innerHTML = `<div class="info-empty">${escapeHTML(items)}</div>`;
    return;
  }

  taskInfoText.innerHTML = items
    .map(function (item) {
      return `
        <div class="info-item">
          <span class="info-label">${escapeHTML(item.label)}</span>
          <span class="info-value">${escapeHTML(item.value)}</span>
        </div>
      `;
    })
    .join("");
}

function formatFileSize(bytes) {
  const megabytes = bytes / 1024 / 1024;
  return `${megabytes.toFixed(2)} МБ`;
}

function showImage(imageElement, placeholderElement, imageUrl) {
  imageElement.src = imageUrl;
  imageElement.classList.remove("hidden");
  placeholderElement.classList.add("hidden");
}

function clearImage(imageElement, placeholderElement) {
  imageElement.removeAttribute("src");
  imageElement.classList.add("hidden");
  placeholderElement.classList.remove("hidden");
}

function showStatusBlock() {
  statusBlock.classList.remove("hidden");
}

function hideStatusBlock() {
  statusBlock.classList.add("hidden");
}

function showTaskInfoBlock() {
  taskInfoBlock.classList.remove("hidden");
}

function hideTaskInfoBlock() {
  taskInfoBlock.classList.add("hidden");
}

function showProcessingState() {
  processingOverlay.classList.remove("hidden");
}

function hideProcessingState() {
  processingOverlay.classList.add("hidden");
}

function showManualControls() {
  manualControls.classList.remove("hidden");
}

function hideManualControls() {
  manualControls.classList.add("hidden");
  resetManualControls();
  baseEnhancedImageData = null;
}

function resetManualControls() {
  brightnessSlider.value = "0";
  contrastSlider.value = "100";
  saturationSlider.value = "100";
  updateManualLabels();
}

function updateManualLabels() {
  brightnessValue.textContent = brightnessSlider.value;
  contrastValue.textContent = `${contrastSlider.value}%`;
  saturationValue.textContent = `${saturationSlider.value}%`;
}

function showProcessButton() {
  processButton.classList.remove("hidden");
  cancelButton.classList.add("hidden");

  processButton.disabled = !currentFile;
  cancelButton.disabled = true;
}

function hideProcessButton() {
  processButton.classList.add("hidden");
  processButton.disabled = true;
}

function showCancelButton() {
  processButton.classList.add("hidden");
  cancelButton.classList.remove("hidden");

  processButton.disabled = true;
  cancelButton.disabled = false;
}

function hideCancelButton() {
  cancelButton.classList.add("hidden");
  cancelButton.disabled = true;
}

function isHeicFile(file) {
  const fileName = file.name.toLowerCase();

  return (
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif") ||
    file.type === "image/heic" ||
    file.type === "image/heif"
  );
}

function isSupportedImageFile(file) {
  const fileName = file.name.toLowerCase();

  return (
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".bmp") ||
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif")
  );
}

async function convertHeicToJpeg(file) {
  if (!window.heic2any) {
    throw new Error("Библиотека для обработки HEIC не загрузилась. Проверьте подключение к интернету.");
  }

  showStatusBlock();
  updateProgress(5, "HEIC-изображение конвертируется в JPEG...");

  const convertedBlob = await window.heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92
  });

  const finalBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
  const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");

  return new File([finalBlob], newName, {
    type: "image/jpeg"
  });
}

async function prepareSelectedFile(file) {
  if (!isSupportedImageFile(file)) {
    throw new Error("Неподдерживаемый формат файла. Выберите JPG, PNG, BMP, HEIC или HEIF.");
  }

  if (isHeicFile(file)) {
    return await convertHeicToJpeg(file);
  }

  return file;
}

function resetInterfaceForEmptyFile() {
  currentFile = null;
  originalFile = null;
  processingStartTime = null;
  activeTaskId = null;

  if (currentImageUrl) {
    URL.revokeObjectURL(currentImageUrl);
    currentImageUrl = null;
  }

  clearImage(sourceImage, sourcePlaceholder);
  clearImage(resultImage, resultPlaceholder);
  hideProcessingState();
  hideManualControls();

  downloadButton.classList.add("hidden");
  downloadButton.removeAttribute("href");

  updateProgress(0, "изображение не выбрано");
  updateTaskInfo("Задача пока не создана.");

  hideStatusBlock();
  hideTaskInfoBlock();
  hideProcessButton();
  hideCancelButton();
}

function startProcessing() {
  if (!currentFile) {
    showStatusBlock();
    updateProgress(0, "сначала выберите изображение");
    return;
  }

  showStatusBlock();
  showTaskInfoBlock();

  clearImage(resultImage, resultPlaceholder);
  hideManualControls();
  showProcessingState();

  downloadButton.classList.add("hidden");
  downloadButton.removeAttribute("href");

  showCancelButton();

  processingStartTime = performance.now();
  activeTaskId = imageAPI.createTask(currentFile);

  updateProgress(5, "задача создана, изображение загружается");

  updateTaskInfo([
    { label: "Файл", value: originalFile ? originalFile.name : currentFile.name },
    { label: "Формат", value: currentFile.type || "не определён" },
    { label: "Размер", value: formatFileSize(currentFile.size) },
    { label: "Статус", value: "автоматическая обработка выполняется" }
  ]);
}

function loadImageFromUrl(imageUrl) {
  return new Promise(function (resolve, reject) {
    const image = new Image();

    image.onload = function () {
      resolve(image);
    };

    image.onerror = function () {
      reject(new Error("Не удалось подготовить изображение для ручной настройки."));
    };

    image.src = imageUrl;
  });
}

async function prepareManualEditing(resultUrl) {
  const image = await loadImageFromUrl(resultUrl);

  manualCanvas.width = image.width;
  manualCanvas.height = image.height;

  manualContext.drawImage(image, 0, 0);

  baseEnhancedImageData = manualContext.getImageData(
    0,
    0,
    manualCanvas.width,
    manualCanvas.height
  );

  resetManualControls();
  applyManualAdjustments();
  showManualControls();
}

function scheduleManualAdjustments() {
  updateManualLabels();

  if (!baseEnhancedImageData) {
    return;
  }

  if (manualRenderRequest) {
    return;
  }

  manualRenderRequest = requestAnimationFrame(function () {
    manualRenderRequest = null;
    applyManualAdjustments();
  });
}

function applyManualAdjustments() {
  if (!baseEnhancedImageData) {
    return;
  }

  const brightness = Number(brightnessSlider.value);
  const contrast = Number(contrastSlider.value) / 100;
  const saturation = Number(saturationSlider.value) / 100;

  const width = baseEnhancedImageData.width;
  const height = baseEnhancedImageData.height;
  const sourcePixels = baseEnhancedImageData.data;
  const adjustedImageData = manualContext.createImageData(width, height);
  const resultPixels = adjustedImageData.data;

  for (let i = 0; i < sourcePixels.length; i += 4) {
    let red = sourcePixels[i];
    let green = sourcePixels[i + 1];
    let blue = sourcePixels[i + 2];

    red = red + brightness;
    green = green + brightness;
    blue = blue + brightness;

    red = applyContrast(red, contrast);
    green = applyContrast(green, contrast);
    blue = applyContrast(blue, contrast);

    const pixelBrightness = getBrightness(red, green, blue);

    red = pixelBrightness + (red - pixelBrightness) * saturation;
    green = pixelBrightness + (green - pixelBrightness) * saturation;
    blue = pixelBrightness + (blue - pixelBrightness) * saturation;

    resultPixels[i] = clamp(red);
    resultPixels[i + 1] = clamp(green);
    resultPixels[i + 2] = clamp(blue);
    resultPixels[i + 3] = sourcePixels[i + 3];
  }

  manualContext.putImageData(adjustedImageData, 0, 0);

  const adjustedResultUrl = manualCanvas.toDataURL("image/png");

  showImage(resultImage, resultPlaceholder, adjustedResultUrl);
  downloadButton.href = adjustedResultUrl;
}

function applyContrast(value, contrast) {
  return (value - 128) * contrast + 128;
}

function getBrightness(red, green, blue) {
  return 0.299 * red + 0.587 * green + 0.114 * blue;
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

resetInterfaceForEmptyFile();

imageInput.addEventListener("change", async function () {
  const file = imageInput.files[0];

  if (activeTaskId) {
    imageAPI.cancelTask(activeTaskId);
    activeTaskId = null;
  }

  if (!file) {
    resetInterfaceForEmptyFile();
    return;
  }

  try {
    originalFile = file;
    currentFile = null;
    activeTaskId = null;
    processingStartTime = null;

    clearImage(sourceImage, sourcePlaceholder);
    clearImage(resultImage, resultPlaceholder);
    hideProcessingState();
    hideManualControls();
    hideProcessButton();
    hideCancelButton();

    downloadButton.classList.add("hidden");
    downloadButton.removeAttribute("href");

    showStatusBlock();
    showTaskInfoBlock();

    updateProgress(0, `выбрано изображение "${file.name}"`);

    updateTaskInfo([
      { label: "Файл", value: file.name },
      { label: "Формат", value: file.type || "не определён" },
      { label: "Размер", value: formatFileSize(file.size) },
      { label: "Статус", value: "подготовка файла" }
    ]);

    const preparedFile = await prepareSelectedFile(file);

    currentFile = preparedFile;

    if (currentImageUrl) {
      URL.revokeObjectURL(currentImageUrl);
    }

    currentImageUrl = URL.createObjectURL(preparedFile);

    showImage(sourceImage, sourcePlaceholder, currentImageUrl);
    clearImage(resultImage, resultPlaceholder);

    const infoItems = [
      { label: "Файл", value: file.name },
      { label: "Формат", value: file.type || "не определён" },
      { label: "Размер", value: formatFileSize(file.size) },
      { label: "Статус", value: "изображение выбрано, запускается автоматическая обработка" }
    ];

    if (isHeicFile(file)) {
      infoItems.splice(3, 0, {
        label: "Конвертация",
        value: "HEIC/HEIF автоматически преобразован в JPEG"
      });
    }

    updateProgress(0, `изображение "${file.name}" готово к обработке`);
    updateTaskInfo(infoItems);

    startProcessing();
  } catch (error) {
    currentFile = null;
    originalFile = null;

    clearImage(sourceImage, sourcePlaceholder);
    clearImage(resultImage, resultPlaceholder);
    hideProcessingState();
    hideManualControls();
    hideProcessButton();
    hideCancelButton();

    downloadButton.classList.add("hidden");
    downloadButton.removeAttribute("href");

    showStatusBlock();
    showTaskInfoBlock();

    updateProgress(0, `ошибка: ${error.message}`);

    updateTaskInfo([
      { label: "Файл", value: file.name },
      { label: "Формат", value: file.type || "не определён" },
      { label: "Размер", value: formatFileSize(file.size) },
      { label: "Статус", value: "ошибка подготовки файла" },
      { label: "Описание ошибки", value: error.message }
    ]);
  }
});

processButton.addEventListener("click", function () {
  startProcessing();
});

cancelButton.addEventListener("click", function () {
  if (!activeTaskId) {
    return;
  }

  imageAPI.cancelTask(activeTaskId);
});

brightnessSlider.addEventListener("input", scheduleManualAdjustments);
contrastSlider.addEventListener("input", scheduleManualAdjustments);
saturationSlider.addEventListener("input", scheduleManualAdjustments);

resetAdjustmentsButton.addEventListener("click", function () {
  resetManualControls();
  applyManualAdjustments();
});

imageAPI.addEventListener("statuschange", function (event) {
  const { taskId, progress, text } = event.detail;

  if (taskId !== activeTaskId) {
    return;
  }

  updateProgress(progress, text);
});

imageAPI.addEventListener("result", async function (event) {
  const { taskId, resultUrl } = event.detail;

  if (taskId !== activeTaskId) {
    return;
  }

  hideProcessingState();
  showImage(resultImage, resultPlaceholder, resultUrl);

  downloadButton.href = resultUrl;
  downloadButton.classList.remove("hidden");

  const processingEndTime = performance.now();
  const processingTime = processingStartTime
    ? ((processingEndTime - processingStartTime) / 1000).toFixed(2)
    : "не определено";

  try {
    await prepareManualEditing(resultUrl);
  } catch (error) {
    updateProgress(100, `изображение обработано, но ручная настройка недоступна: ${error.message}`);
  }

  updateTaskInfo([
    { label: "Файл", value: originalFile ? originalFile.name : currentFile.name },
    { label: "Формат", value: currentFile.type || "не определён" },
    { label: "Размер", value: formatFileSize(currentFile.size) },
    { label: "Статус", value: "обработка завершена" },
    { label: "Время обработки", value: `${processingTime} сек.` },
    { label: "Формат результата", value: "PNG" }
  ]);

  activeTaskId = null;
  processingStartTime = null;
  showProcessButton();
});

imageAPI.addEventListener("cancelled", function (event) {
  const { taskId } = event.detail;

  if (taskId !== activeTaskId) {
    return;
  }

  hideProcessingState();
  hideManualControls();

  updateTaskInfo([
    { label: "Файл", value: originalFile ? originalFile.name : currentFile.name },
    { label: "Формат", value: currentFile.type || "не определён" },
    { label: "Размер", value: formatFileSize(currentFile.size) },
    { label: "Статус", value: "обработка прервана" }
  ]);

  activeTaskId = null;
  processingStartTime = null;
  showProcessButton();
});

imageAPI.addEventListener("error", function (event) {
  const { taskId, message } = event.detail;

  if (taskId !== activeTaskId) {
    return;
  }

  hideProcessingState();
  hideManualControls();

  updateTaskInfo([
    { label: "Файл", value: originalFile ? originalFile.name : "не выбран" },
    { label: "Формат", value: currentFile ? currentFile.type || "не определён" : "не определён" },
    { label: "Размер", value: currentFile ? formatFileSize(currentFile.size) : "не определён" },
    { label: "Статус", value: "ошибка" },
    { label: "Описание ошибки", value: message }
  ]);

  activeTaskId = null;
  processingStartTime = null;
  showProcessButton();
});

dropZone.addEventListener("click",()=>{

  imageInput.click();

});

dropZone.addEventListener("dragover",(e)=>{

  e.preventDefault();

  dropZone.classList.add("dragover");

});

dropZone.addEventListener("dragleave",()=>{

  dropZone.classList.remove("dragover");

});

dropZone.addEventListener("drop",(e)=>{

  e.preventDefault();

  dropZone.classList.remove("dragover");

  const file=e.dataTransfer.files[0];

  if(!file)return;

  imageInput.files=e.dataTransfer.files;

  imageInput.dispatchEvent(new Event("change"));

});