export class ImageEnhancerAPI extends EventTarget {
  constructor(workerPath) {
    super();

    this.worker = new Worker(workerPath);
    this.tasks = new Map();

    this.worker.addEventListener("message", (event) => {
      this.handleWorkerMessage(event.data);
    });
  }

  createTask(file) {
    const taskId = this.createTaskId();

    this.tasks.set(taskId, {
      taskId,
      status: "created",
      progress: 0,
      resultUrl: null,
      error: null,
      canvas: null
    });

    this.emitStatus(taskId, 0, "задача создана");
    this.prepareImage(taskId, file);

    return taskId;
  }

  getStatus(taskId) {
    const task = this.tasks.get(taskId);

    if (!task) {
      return null;
    }

    return {
      taskId: task.taskId,
      status: task.status,
      progress: task.progress,
      error: task.error
    };
  }

  cancelTask(taskId) {
    const task = this.tasks.get(taskId);

    if (!task) {
      return {
        ok: false,
        message: "Задача не найдена"
      };
    }

    if (
      task.status === "done" ||
      task.status === "cancelled" ||
      task.status === "error"
    ) {
      return {
        ok: false,
        message: "Задачу уже нельзя прервать"
      };
    }

    task.status = "cancel_requested";

    this.worker.postMessage({
      type: "cancel",
      taskId
    });

    this.emitStatus(taskId, task.progress, "запрошено прерывание обработки");

    return {
      ok: true,
      taskId
    };
  }

  getResult(taskId) {
    const task = this.tasks.get(taskId);

    if (!task) {
      return null;
    }

    return task.resultUrl;
  }

  validateFile(file) {
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".bmp", ".heic", ".heif"];
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/bmp",
      "image/x-ms-bmp",
      "image/heic",
      "image/heif"
    ];

    const fileName = file.name.toLowerCase();

    const hasAllowedExtension = allowedExtensions.some(function (extension) {
      return fileName.endsWith(extension);
    });

    const hasAllowedMimeType =
      !file.type || allowedMimeTypes.includes(file.type);

    if (!hasAllowedExtension || !hasAllowedMimeType) {
      throw new Error(
        "Неподдерживаемый формат файла. Выберите JPG, PNG, BMP, HEIC или HEIF."
      );
    }
  }

  isHeicFile(file) {
    const fileName = file.name.toLowerCase();

    return (
      fileName.endsWith(".heic") ||
      fileName.endsWith(".heif") ||
      file.type === "image/heic" ||
      file.type === "image/heif"
    );
  }

  async normalizeFile(file) {
    this.validateFile(file);

    if (!this.isHeicFile(file)) {
      return file;
    }

    if (!window.heic2any) {
      throw new Error("Библиотека для обработки HEIC не загрузилась.");
    }

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

  async prepareImage(taskId, file) {
    const task = this.tasks.get(taskId);

    if (!task) {
      return;
    }

    try {
      task.status = "loading";
      this.emitStatus(taskId, 5, "изображение загружается");

      const preparedFile = await this.normalizeFile(file);

      const imageUrl = URL.createObjectURL(preparedFile);

      const image = new Image();
      image.src = imageUrl;

      await image.decode();

      this.emitStatus(taskId, 15, "изображение загружено");

      const pixelsCount = image.width * image.height;

      if (pixelsCount > 15_000_000) {
        URL.revokeObjectURL(imageUrl);
        throw new Error("Изображение больше 15 Мп. Выберите изображение меньшего размера.");
      }

      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;

      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

      URL.revokeObjectURL(imageUrl);

      task.canvas = canvas;
      task.status = "processing";

      this.worker.postMessage(
        {
          type: "process",
          taskId,
          width: canvas.width,
          height: canvas.height,
          buffer: imageData.data.buffer
        },
        [imageData.data.buffer]
      );
    } catch (error) {
      this.setError(taskId, error.message);
    }
  }

  handleWorkerMessage(message) {
    const task = this.tasks.get(message.taskId);

    if (!task) {
      return;
    }

    if (message.type === "status") {
      task.status = "processing";
      task.progress = message.progress;

      this.emitStatus(message.taskId, message.progress, message.text);
      return;
    }

    if (message.type === "result") {
      const resultPixels = new Uint8ClampedArray(message.buffer);
      const resultImageData = new ImageData(
        resultPixels,
        message.width,
        message.height
      );

      const context = task.canvas.getContext("2d");
      context.putImageData(resultImageData, 0, 0);

      const resultUrl = task.canvas.toDataURL("image/png");

      task.status = "done";
      task.progress = 100;
      task.resultUrl = resultUrl;

      this.emitStatus(message.taskId, 100, "изображение успешно обработано");

      this.dispatchEvent(
        new CustomEvent("result", {
          detail: {
            taskId: message.taskId,
            resultUrl,
            features: message.features,
            correctionParams: message.correctionParams
          }
        })
      );

      return;
    }

    if (message.type === "cancelled") {
      task.status = "cancelled";
      task.progress = 0;

      this.emitStatus(message.taskId, 0, "обработка прервана");

      this.dispatchEvent(
        new CustomEvent("cancelled", {
          detail: {
            taskId: message.taskId
          }
        })
      );

      return;
    }

    if (message.type === "error") {
      this.setError(message.taskId, message.message);
    }
  }

  setError(taskId, message) {
    const task = this.tasks.get(taskId);

    if (!task) {
      return;
    }

    task.status = "error";
    task.error = message;
    task.progress = 0;

    this.emitStatus(taskId, 0, `ошибка: ${message}`);

    this.dispatchEvent(
      new CustomEvent("error", {
        detail: {
          taskId,
          message
        }
      })
    );
  }

  emitStatus(taskId, progress, text) {
    const task = this.tasks.get(taskId);

    if (task) {
      task.progress = progress;
    }

    this.dispatchEvent(
      new CustomEvent("statuschange", {
        detail: {
          taskId,
          status: task ? task.status : "unknown",
          progress,
          text
        }
      })
    );
  }

  createTaskId() {
    return `${Date.now()}-${Math.random()}`;
  }
}