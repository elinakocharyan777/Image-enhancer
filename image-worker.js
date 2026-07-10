importScripts("./ml-model.js");

const MAX_PROCESSING_TIME = 30_000;
const cancelledTasks = new Set();

self.addEventListener("message", function (event) {
  const message = event.data;

  if (message.type === "cancel") {
    cancelledTasks.add(message.taskId);
    return;
  }

  if (message.type === "process") {
    processImage(message);
  }
});

async function processImage(message) {
  try {
    const startTime = performance.now();
    const taskId = message.taskId;
    const width = message.width;
    const height = message.height;
    const pixels = new Uint8ClampedArray(message.buffer);

    if (isCancelled(taskId)) {
      sendCancelled(taskId);
      return;
    }

    sendStatus(taskId, 30, "анализ признаков изображения");

    const features = analyzeImage(pixels);

    if (isCancelled(taskId)) {
      sendCancelled(taskId);
      return;
    }

    sendStatus(taskId, 50, "запуск ML-модели для подбора параметров");

    const correctionParams = predictCorrectionParams(features);

    if (isCancelled(taskId)) {
      sendCancelled(taskId);
      return;
    }

    sendStatus(taskId, 60, "применение параметров коррекции");

    await applyCorrection(pixels, correctionParams, taskId, startTime);

    if (isCancelled(taskId)) {
      sendCancelled(taskId);
      return;
    }

    self.postMessage(
      {
        type: "result",
        taskId,
        width,
        height,
        buffer: pixels.buffer,
        features,
        correctionParams
      },
      [pixels.buffer]
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      taskId: message.taskId,
      message: error.message
    });
  }
}

function sendStatus(taskId, progress, text) {
  self.postMessage({
    type: "status",
    taskId,
    progress,
    text
  });
}

function sendCancelled(taskId) {
  cancelledTasks.delete(taskId);

  self.postMessage({
    type: "cancelled",
    taskId
  });
}

function isCancelled(taskId) {
  return cancelledTasks.has(taskId);
}

function analyzeImage(pixels) {
  let brightnessSum = 0;
  let brightnessSquareSum = 0;
  let saturationSum = 0;
  let count = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];

    const brightness = getBrightness(red, green, blue);
    const saturation = getSaturation(red, green, blue);

    brightnessSum += brightness;
    brightnessSquareSum += brightness * brightness;
    saturationSum += saturation;

    count++;
  }

  const averageBrightness = brightnessSum / count;
  const brightnessVariance =
    brightnessSquareSum / count - averageBrightness * averageBrightness;

  const contrast = Math.sqrt(brightnessVariance);
  const averageSaturation = saturationSum / count;

  return {
    averageBrightness,
    contrast,
    averageSaturation
  };
}

function predictCorrectionParams(features) {
  if (!self.ImageEnhancementMLModel) {
    throw new Error("ML-модель не загрузилась.");
  }

  const prediction = self.ImageEnhancementMLModel.predict(features);

  return {
    brightnessValue: prediction.brightnessValue,
    contrastValue: prediction.contrastValue,
    saturationValue: prediction.saturationValue,
    modelVersion: prediction.modelVersion
  };
}

async function applyCorrection(pixels, params, taskId, startTime) {
  const totalLength = pixels.length;
  const chunkSize = 800000;

  for (let i = 0; i < totalLength; i += 4) {
    if (isCancelled(taskId)) {
      return;
    }

    let red = pixels[i];
    let green = pixels[i + 1];
    let blue = pixels[i + 2];

    red = red + params.brightnessValue;
    green = green + params.brightnessValue;
    blue = blue + params.brightnessValue;

    red = applyContrast(red, params.contrastValue);
    green = applyContrast(green, params.contrastValue);
    blue = applyContrast(blue, params.contrastValue);

    const brightness = getBrightness(red, green, blue);

    red = brightness + (red - brightness) * params.saturationValue;
    green = brightness + (green - brightness) * params.saturationValue;
    blue = brightness + (blue - brightness) * params.saturationValue;

    pixels[i] = clamp(red);
    pixels[i + 1] = clamp(green);
    pixels[i + 2] = clamp(blue);

    if (i % chunkSize === 0) {
      const elapsedTime = performance.now() - startTime;

      if (elapsedTime > MAX_PROCESSING_TIME) {
        throw new Error("Обработка превысила максимальное время 30 секунд.");
      }

      const progress = 60 + Math.round((i / totalLength) * 30);
      sendStatus(taskId, progress, "обработка изображения");

      await pause();
    }
  }
}

function pause() {
  return new Promise(function (resolve) {
    setTimeout(resolve, 0);
  });
}

function applyContrast(value, contrastValue) {
  return (value - 128) * contrastValue + 128;
}

function getBrightness(red, green, blue) {
  return 0.299 * red + 0.587 * green + 0.114 * blue;
}

function getSaturation(red, green, blue) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);

  if (max === 0) {
    return 0;
  }

  return (max - min) / max;
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}
