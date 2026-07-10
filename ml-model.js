(function () {
  const MODEL_VERSION = "1.0.0";

  const INPUT_FEATURES = [
    "averageBrightness",
    "contrast",
    "averageSaturation"
  ];

  const OUTPUT_PARAMS = [
    "brightnessValue",
    "contrastValue",
    "saturationValue"
  ];

  const MODEL_WEIGHTS = {
    hiddenBias: [0.05, -0.1, 0.08, 0.02, -0.04, 0.06],

    hiddenWeights: [
      [-1.15, 0.15, -0.10],
      [0.95, -0.20, 0.05],
      [0.10, -1.05, 0.10],
      [-0.05, 0.90, -0.15],
      [-0.05, 0.15, -1.10],
      [0.08, -0.10, 0.95]
    ],

    outputBias: [0.08, 0.12, 0.10],

    outputWeights: [
      [0.95, -0.75, 0.10, -0.08, 0.05, -0.03],
      [0.05, -0.05, 0.90, -0.35, 0.08, -0.04],
      [0.02, -0.03, 0.08, -0.06, 0.95, -0.35]
    ]
  };

  function predict(features) {
    const inputVector = normalizeFeatures(features);
    const hiddenVector = runHiddenLayer(inputVector);
    const outputVector = runOutputLayer(hiddenVector);

    const brightnessValue = clamp(outputVector[0] * 34, -30, 35);
    const contrastValue = clamp(1 + outputVector[1] * 0.28, 0.9, 1.3);
    const saturationValue = clamp(1 + outputVector[2] * 0.32, 0.9, 1.35);

    return {
      brightnessValue: roundNumber(brightnessValue, 2),
      contrastValue: roundNumber(contrastValue, 3),
      saturationValue: roundNumber(saturationValue, 3),
      modelVersion: MODEL_VERSION,
      inputFeatures: INPUT_FEATURES,
      outputParams: OUTPUT_PARAMS
    };
  }

  function normalizeFeatures(features) {
    const brightness = normalize(features.averageBrightness, 127.5, 127.5);
    const contrast = normalize(features.contrast, 55, 55);
    const saturation = normalize(features.averageSaturation, 0.5, 0.5);

    return [
      clamp(brightness, -1, 1),
      clamp(contrast, -1, 1),
      clamp(saturation, -1, 1)
    ];
  }

  function normalize(value, center, scale) {
    return (value - center) / scale;
  }

  function runHiddenLayer(inputVector) {
    return MODEL_WEIGHTS.hiddenWeights.map(function (weights, neuronIndex) {
      const sum = dotProduct(weights, inputVector) + MODEL_WEIGHTS.hiddenBias[neuronIndex];
      return Math.tanh(sum);
    });
  }

  function runOutputLayer(hiddenVector) {
    return MODEL_WEIGHTS.outputWeights.map(function (weights, outputIndex) {
      const sum = dotProduct(weights, hiddenVector) + MODEL_WEIGHTS.outputBias[outputIndex];
      return Math.tanh(sum);
    });
  }

  function dotProduct(weights, values) {
    let sum = 0;

    for (let i = 0; i < weights.length; i++) {
      sum += weights[i] * values[i];
    }

    return sum;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function roundNumber(value, digits) {
    const multiplier = 10 ** digits;
    return Math.round(value * multiplier) / multiplier;
  }

  self.ImageEnhancementMLModel = {
    version: MODEL_VERSION,
    inputFeatures: INPUT_FEATURES,
    outputParams: OUTPUT_PARAMS,
    predict
  };
})();
