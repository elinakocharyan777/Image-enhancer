import { ImageEnhancerAPI } from "./image-api.js";

const imageInput = document.getElementById("imageInput");
const sourceImage = document.getElementById("sourceImage");
const resultImage = document.getElementById("resultImage");
const statusText = document.getElementById("statusText");
const processButton = document.getElementById("processButton");
const cancelButton = document.getElementById("cancelButton");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const downloadButton = document.getElementById("downloadButton");
const sourcePlaceholder = document.getElementById("sourcePlaceholder");
const resultPlaceholder = document.getElementById("resultPlaceholder");
const processingOverlay = document.getElementById("processingOverlay");
const taskInfoText = document.getElementById("taskInfoText");

const imageAPI = new ImageEnhancerAPI("image-worker.js");

let currentImageUrl = null;
let currentFile = null;
let originalFile = null;
let activeTaskId = null;
let processingStartTime = null;

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

function showProcessingState() {
  processingOverlay.classList.remove("hidden");
}

function hideProcessingState() {
  processingOverlay.classList.add("hidden");
}

function showProcessButton() {
  processButton.classList.remove("hidden");
  cancelButton.classList.add("hidden");

  processButton.disabled = !currentFile;
  cancelButton.disabled = true;
}

function showCancelButton() {
  processButton.classList.add("hidden");
  cancelButton.classList.remove("hidden");

  processButton.disabled = true;
  cancelButton.disabled = false;
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

imageInput.addEventListener("change", async function () {
  const file = imageInput.files[0];

  if (activeTaskId) {
    imageAPI.cancelTask(activeTaskId);
    activeTaskId = null;
  }

  if (!file) {
    currentFile = null;
    originalFile = null;
    processingStartTime = null;

    if (currentImageUrl) {
      URL.revokeObjectURL(currentImageUrl);
      currentImageUrl = null;
    }

    clearImage(sourceImage, sourcePlaceholder);
    clearImage(resultImage, resultPlaceholder);
    hideProcessingState();

    downloadButton.classList.add("hidden");
    downloadButton.removeAttribute("href");

    updateProgress(0, "изображение не выбрано");
    updateTaskInfo("Задача пока не создана.");
    showProcessButton();

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

    downloadButton.classList.add("hidden");
    downloadButton.removeAttribute("href");

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
      { label: "Статус", value: "изображение выбрано" }
    ];

    if (isHeicFile(file)) {
      infoItems.splice(3, 0, {
        label: "Конвертация",
        value: "HEIC/HEIF автоматически преобразован в JPEG"
      });
    }

    updateProgress(0, `изображение "${file.name}" готово к обработке`);
    updateTaskInfo(infoItems);

    showProcessButton();
  } catch (error) {
    currentFile = null;
    originalFile = null;

    clearImage(sourceImage, sourcePlaceholder);
    clearImage(resultImage, resultPlaceholder);
    hideProcessingState();

    downloadButton.classList.add("hidden");
    downloadButton.removeAttribute("href");

    updateProgress(0, `ошибка: ${error.message}`);

    updateTaskInfo([
      { label: "Файл", value: file.name },
      { label: "Формат", value: file.type || "не определён" },
      { label: "Размер", value: formatFileSize(file.size) },
      { label: "Статус", value: "ошибка подготовки файла" },
      { label: "Описание ошибки", value: error.message }
    ]);

    showProcessButton();
  }
});

processButton.addEventListener("click", function () {
  if (!currentFile) {
    updateProgress(0, "сначала выберите изображение");
    return;
  }

  clearImage(resultImage, resultPlaceholder);
  showProcessingState();

  downloadButton.classList.add("hidden");
  downloadButton.removeAttribute("href");

  showCancelButton();

  processingStartTime = performance.now();
  activeTaskId = imageAPI.createTask(currentFile);

  updateProgress(5, "задача создана, изображение загружается");

  updateTaskInfo([
    { label: "Исходный файл", value: originalFile ? originalFile.name : currentFile.name },
    { label: "Файл", value: currentFile.name },
    { label: "Формат", value: currentFile.type || "не определён" },
    { label: "Размер", value: formatFileSize(currentFile.size) },
    { label: "ID задачи", value: activeTaskId },
    { label: "Статус", value: "обработка выполняется" }
  ]);
});

cancelButton.addEventListener("click", function () {
  if (!activeTaskId) {
    return;
  }

  imageAPI.cancelTask(activeTaskId);
});

imageAPI.addEventListener("statuschange", function (event) {
  const { taskId, progress, text } = event.detail;

  if (taskId !== activeTaskId) {
    return;
  }

  updateProgress(progress, text);
});

imageAPI.addEventListener("result", function (event) {
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

  updateTaskInfo([
    { label: "Исходный файл", value: originalFile ? originalFile.name : currentFile.name },
    { label: "Формат", value: currentFile.type || "не определён" },
    { label: "Размер", value: formatFileSize(currentFile.size) },
    { label: "ID задачи", value: taskId },
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

  updateTaskInfo([
    { label: "Исходный файл", value: originalFile ? originalFile.name : currentFile.name },
    { label: "Формат", value: currentFile.type || "не определён" },
    { label: "Размер", value: formatFileSize(currentFile.size) },
    { label: "ID задачи", value: taskId },
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

  updateTaskInfo([
    { label: "Исходный файл", value: originalFile ? originalFile.name : "не выбран" },
    { label: "Формат", value: currentFile ? currentFile.type || "не определён" : "не определён" },
    { label: "Размер", value: currentFile ? formatFileSize(currentFile.size) : "не определён" },
    { label: "ID задачи", value: taskId },
    { label: "Статус", value: "ошибка" },
    { label: "Описание ошибки", value: message }
  ]);

  activeTaskId = null;
  processingStartTime = null;
  showProcessButton();
});