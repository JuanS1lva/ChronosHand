import './style.css';
import { HandLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

// App State
const state = {
  handLandmarker: null,
  webcamRunning: false,
  stream: null,
  
  // Calibration thresholds (raw Euclidean distance in 3D)
  minDistance: 0.03,
  maxDistance: 0.16,
  rawDistance: 0,
  smoothedDistance: 0,
  smoothingFactor: 0.08,
  
  // Hand tracking state
  handDetected: false,
  gestureActive: false,
  
  // Calibration arrays
  calibrationMode: 'none', // 'none' | 'min' | 'max'
  calibrationSamples: [],
  
  // Performance tracking
  fps: 0,
  frameCount: 0,
  lastFpsTime: performance.now(),
  lastFrameTime: 0,
  
  // Camera settings
  currentDeviceId: '',
  
  // Animation frames
  animationFrameId: null,
  
  // Seeking throttle state
  lastSeekTime: 0,
  targetTime: 0
};

// DOM Elements
const videoElement = document.getElementById('main-video');
const webcamElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');

const statusBadge = document.getElementById('app-status');

const gesturePill = document.getElementById('gesture-pill');
const handIndicator = document.getElementById('hand-indicator');
const scrubProgressBar = document.getElementById('scrub-progress');

const toggleCameraBtn = document.getElementById('toggle-camera-btn');
const camIconOn = document.getElementById('cam-icon-on');
const camIconOff = document.getElementById('cam-icon-off');
const camStatusLbl = document.getElementById('cam-status-lbl');
const fpsCounter = document.getElementById('fps-counter');

const quickToggleCameraBtn = document.getElementById('quick-toggle-camera-btn');
const quickCamIconOn = document.getElementById('quick-cam-icon-on');
const quickCamIconOff = document.getElementById('quick-cam-icon-off');
const cameraHint = document.getElementById('camera-hint');

const gaugeFill = document.getElementById('gauge-fill');
const minMarker = document.getElementById('min-marker');
const maxMarker = document.getElementById('max-marker');
const minCalibVal = document.getElementById('min-calib-val');
const maxCalibVal = document.getElementById('max-calib-val');
const rawDistanceVal = document.getElementById('raw-distance-val');

const calibMinBtn = document.getElementById('calib-min-btn');
const calibMaxBtn = document.getElementById('calib-max-btn');
const resetCalibBtn = document.getElementById('reset-calib-btn');

const smoothingRange = document.getElementById('smoothing-range');
const smoothingLbl = document.getElementById('smoothing-lbl');
const minDistRange = document.getElementById('min-dist-range');
const minDistLbl = document.getElementById('min-dist-lbl');
const maxDistRange = document.getElementById('max-dist-range');
const maxDistLbl = document.getElementById('max-dist-lbl');
const cameraSelect = document.getElementById('camera-select');

// File Upload DOM Elements
const dropZone = document.getElementById('drop-zone');
const uploadOverlay = document.getElementById('upload-overlay');
const fileInput = document.getElementById('file-input');
const selectFileBtn = document.getElementById('select-file-btn');
const uploadTriggerBtn = document.getElementById('upload-trigger-btn');
const loadDefaultBtn = document.getElementById('load-default-btn');

// Instantiate DrawingUtils
let drawingUtils = null;

// Preload remote video into memory (Blob) to ensure lag-free seek scrubbing
async function preloadDefaultVideo() {
  const defaultVideoURL = '/timelapse.mp4';
  try {
    // Fetch video
    const response = await fetch(defaultVideoURL);
    if (!response.ok) throw new Error('Respuesta de red no válida');
    
    const blob = await response.blob();
    const localURL = URL.createObjectURL(blob);
    videoElement.src = localURL;
    videoElement.load();
  } catch (error) {
    console.warn('CORS / Red impidió precargar video. Usando streaming directo:', error);
    videoElement.src = defaultVideoURL;
    videoElement.load();
  }
}

// Initialize Application
async function init() {
  try {
    setupEventListeners();
    updateUIFromState();
    
    // Load MediaPipe HandLandmarker
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
    );
    
    state.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 1
    });
    
    drawingUtils = new DrawingUtils(canvasCtx);
    
    statusBadge.className = 'status-indicator-dot connected';
    
    // Enable camera toggle button
    toggleCameraBtn.disabled = false;
    if (quickToggleCameraBtn) quickToggleCameraBtn.disabled = false;
    camStatusLbl.textContent = 'Listo para iniciar';
    
    // Get list of available cameras
    await populateCameraList();
    
    // Preload demo video
    await preloadDefaultVideo();
  } catch (error) {
    console.error('Error durante la inicialización:', error);
    statusBadge.className = 'status-indicator-dot error';
    alert('No se pudo inicializar MediaPipe. Revisa la consola para más detalles.');
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Video Events
  videoElement.addEventListener('loadedmetadata', updateVideoTimeDisplay);
  videoElement.addEventListener('timeupdate', updateVideoTimeDisplay);
  // Ensure video is paused
  videoElement.addEventListener('play', () => {
    videoElement.pause();
  });

  // Camera Control
  toggleCameraBtn.addEventListener('click', toggleWebcam);
  if (quickToggleCameraBtn) quickToggleCameraBtn.addEventListener('click', toggleWebcam);
  cameraSelect.addEventListener('change', handleCameraChange);

  // Calibration Buttons
  calibMinBtn.addEventListener('click', () => startCalibration('min'));
  calibMaxBtn.addEventListener('click', () => startCalibration('max'));
  resetCalibBtn.addEventListener('click', resetCalibration);

  // Settings Sliders
  smoothingRange.addEventListener('input', (e) => {
    state.smoothingFactor = parseFloat(e.target.value);
    smoothingLbl.textContent = state.smoothingFactor.toFixed(2);
  });
  
  minDistRange.addEventListener('input', (e) => {
    state.minDistance = parseFloat(e.target.value);
    minCalibVal.textContent = state.minDistance.toFixed(3);
    minDistLbl.textContent = state.minDistance.toFixed(3);
    updateGaugeMarkers();
  });
  
  maxDistRange.addEventListener('input', (e) => {
    state.maxDistance = parseFloat(e.target.value);
    maxCalibVal.textContent = state.maxDistance.toFixed(3);
    maxDistLbl.textContent = state.maxDistance.toFixed(3);
    updateGaugeMarkers();
  });

  // Drag and Drop Video Upload
  dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (state.webcamRunning) return; // Prevent dragover visual clutter when active
    uploadOverlay.classList.remove('hidden');
    uploadOverlay.classList.add('dragover');
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!state.webcamRunning) {
      uploadOverlay.classList.remove('hidden');
      uploadOverlay.classList.add('dragover');
    }
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    // Only hide if cursor actually exits the wrapper
    const rect = dropZone.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) {
      uploadOverlay.classList.add('hidden');
      uploadOverlay.classList.remove('dragover');
    }
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadOverlay.classList.remove('dragover');
    uploadOverlay.classList.add('hidden');
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadLocalVideo(e.dataTransfer.files[0]);
    }
  });

  // Manual File Selector
  selectFileBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Avoid loop
    fileInput.click();
  });

  uploadTriggerBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      loadLocalVideo(e.target.files[0]);
    }
  });

  // Restore Default Video
  loadDefaultBtn.addEventListener('click', async () => {
    await preloadDefaultVideo();
    videoElement.currentTime = 0;
  });

  // Bottom Dock & Expanded Panel Management
  const dockBtns = document.querySelectorAll('.dock-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const dockPanel = document.getElementById('dock-panel');
  const panelTitle = document.getElementById('panel-title');
  const btnClosePanel = document.getElementById('btn-close-panel');

  // Toggle or open a panel
  function openPanel(btn) {
    const targetTab = btn.getAttribute('data-tab');
    const titleText = btn.getAttribute('data-title') || 'Ajustes';

    // 1. Deactivate other dock buttons and activate current (filtering quick actions)
    dockBtns.forEach(b => {
      if (b.hasAttribute('data-tab')) {
        b.classList.remove('active');
      }
    });
    btn.classList.add('active');

    // 2. Set panel title
    panelTitle.textContent = titleText;

    // 3. Show correct panel and hide others
    tabPanels.forEach(panel => {
      if (panel.id === targetTab) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    // 4. Slide panel UP (make it visible)
    dockPanel.classList.remove('hidden');
    // Force a reflow for CSS transition
    void dockPanel.offsetWidth;
    dockPanel.classList.remove('slide-out');
    dockPanel.classList.add('slide-in');
  }

  // Close/Minimize the panel
  function closePanel() {
    dockBtns.forEach(b => {
      if (b.hasAttribute('data-tab')) {
        b.classList.remove('active');
      }
    });
    dockPanel.classList.remove('slide-in');
    dockPanel.classList.add('slide-out');
    
    // Hide panel fully after transition completes
    setTimeout(() => {
      if (dockPanel.classList.contains('slide-out')) {
        dockPanel.classList.add('hidden');
      }
    }, 300);
  }

  dockBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Ignore click logic if this button is a quick action (like the camera toggle) and doesn't map to a tab
      if (!btn.hasAttribute('data-tab')) return;

      // If the button is already active, close the panel
      if (btn.classList.contains('active')) {
        closePanel();
      } else {
        openPanel(btn);
      }
    });
  });

  if (btnClosePanel) {
    btnClosePanel.addEventListener('click', closePanel);
  }
}

// Load a local video file
function loadLocalVideo(file) {
  if (!file.type.startsWith('video/')) {
    alert('Por favor selecciona un archivo de video válido (.mp4, .webm, .mov).');
    return;
  }
  const fileURL = URL.createObjectURL(file);
  videoElement.src = fileURL;
  videoElement.load();
  videoElement.currentTime = 0;
}

// Update UI Sliders/Gauges to match state variables
function updateUIFromState() {
  smoothingRange.value = state.smoothingFactor;
  smoothingLbl.textContent = state.smoothingFactor.toFixed(2);
  
  minDistRange.value = state.minDistance;
  minDistLbl.textContent = state.minDistance.toFixed(3);
  minCalibVal.textContent = state.minDistance.toFixed(3);
  
  maxDistRange.value = state.maxDistance;
  maxDistLbl.textContent = state.maxDistance.toFixed(3);
  maxCalibVal.textContent = state.maxDistance.toFixed(3);
  
  updateGaugeMarkers();
}

// Position markers on the gauge visually
function updateGaugeMarkers() {
  const maxRawLimit = 0.30; // Max raw distance to map on the gauge track
  const minPercent = Math.min(95, Math.max(5, (state.minDistance / maxRawLimit) * 100));
  const maxPercent = Math.min(95, Math.max(5, (state.maxDistance / maxRawLimit) * 100));
  
  minMarker.style.left = `${minPercent}%`;
  maxMarker.style.left = `${maxPercent}%`;
}

// Populate list of video sources
async function populateCameraList() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    cameraSelect.innerHTML = '';
    
    if (videoDevices.length === 0) {
      const option = document.createElement('option');
      option.text = 'No se encontraron cámaras';
      cameraSelect.add(option);
      return;
    }
    
    videoDevices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Cámara ${index + 1}`;
      cameraSelect.add(option);
    });
    
    state.currentDeviceId = videoDevices[0].deviceId;
  } catch (error) {
    console.error('Error al enumerar dispositivos:', error);
  }
}

// Handle camera dropdown change
async function handleCameraChange(e) {
  state.currentDeviceId = e.target.value;
  if (state.webcamRunning) {
    // Restart stream with new camera ID
    stopWebcamStream();
    await startWebcamStream();
  }
}

// Toggle Webcam State
async function toggleWebcam() {
  if (state.webcamRunning) {
    stopWebcamStream();
  } else {
    await startWebcamStream();
  }
}

// Start Webcam Stream
async function startWebcamStream() {
  try {
    toggleCameraBtn.disabled = true;
    camStatusLbl.textContent = 'Iniciando cámara...';
    
    const constraints = {
      video: {
        deviceId: state.currentDeviceId ? { exact: state.currentDeviceId } : undefined,
        width: { ideal: 640 },
        height: { ideal: 480 }
      }
    };
    
    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    webcamElement.srcObject = state.stream;
    
    webcamElement.addEventListener('loadedmetadata', () => {
      // Set canvas dimensions to match video stream
      canvasElement.width = webcamElement.videoWidth;
      canvasElement.height = webcamElement.videoHeight;
      
      state.webcamRunning = true;
      toggleCameraBtn.disabled = false;
      toggleCameraBtn.classList.remove('btn-primary');
      toggleCameraBtn.classList.add('btn-secondary');
      toggleCameraBtn.textContent = 'Desactivar Cámara';
      if (camIconOff) camIconOff.classList.add('hidden');
      if (camIconOn) camIconOn.classList.remove('hidden');
      
      // Update quick toggle button states
      if (quickToggleCameraBtn) {
        quickToggleCameraBtn.classList.add('active');
        quickToggleCameraBtn.title = 'Desactivar Cámara';
      }
      if (quickCamIconOff) quickCamIconOff.classList.add('hidden');
      if (quickCamIconOn) quickCamIconOn.classList.remove('hidden');
      if (cameraHint) cameraHint.classList.add('hidden');
      
      camStatusLbl.textContent = 'Rastreo activo';
      
      // Enable calibration buttons
      calibMinBtn.disabled = false;
      calibMaxBtn.disabled = false;
      
      // Start tracking render loop
      state.lastFrameTime = performance.now();
      state.animationFrameId = requestAnimationFrame(renderLoop);
    });
  } catch (error) {
    console.error('Error al acceder a la cámara:', error);
    camStatusLbl.textContent = 'Error de cámara';
    toggleCameraBtn.disabled = false;
    alert('No se pudo acceder a la cámara. Asegúrate de otorgar permisos.');
  }
}

// Stop Webcam Stream
function stopWebcamStream() {
  state.webcamRunning = false;
  
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = null;
  }
  
  if (state.stream) {
    state.stream.getTracks().forEach(track => track.stop());
    state.stream = null;
  }
  
  webcamElement.srcObject = null;
  
  // Clean canvas overlay
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  // Reset states
  toggleCameraBtn.classList.add('btn-primary');
  toggleCameraBtn.classList.remove('btn-secondary');
  toggleCameraBtn.textContent = 'Activar Cámara';
  if (camIconOff) camIconOff.classList.remove('hidden');
  if (camIconOn) camIconOn.classList.add('hidden');
  
  // Reset quick toggle button states
  if (quickToggleCameraBtn) {
    quickToggleCameraBtn.classList.remove('active');
    quickToggleCameraBtn.title = 'Activar Cámara';
  }
  if (quickCamIconOff) quickCamIconOff.classList.remove('hidden');
  if (quickCamIconOn) quickCamIconOn.classList.add('hidden');
  if (cameraHint) cameraHint.classList.remove('hidden');
  
  camStatusLbl.textContent = 'Cámara inactiva';
  fpsCounter.textContent = '-- FPS';
  
  // Disable calibration
  calibMinBtn.disabled = true;
  calibMaxBtn.disabled = true;
  
  setHandDetected(false);
  setGestureActive(false);
}

// Set hand detection status
function setHandDetected(detected) {
  state.handDetected = detected;
  if (detected) {
    handIndicator.textContent = 'Mano detectada';
    handIndicator.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    handIndicator.style.color = 'var(--success)';
  } else {
    handIndicator.textContent = 'Mano no detectada';
    handIndicator.style.borderColor = 'rgba(244, 63, 94, 0.2)';
    handIndicator.style.color = 'var(--error)';
  }
}

// Set gesture active status
function setGestureActive(active) {
  state.gestureActive = active;
  if (active) {
    gesturePill.textContent = 'Control Activo';
    gesturePill.classList.add('active');
  } else {
    gesturePill.textContent = 'Gestos inactivos';
    gesturePill.classList.remove('active');
  }
}

// Calibration Management
function startCalibration(mode) {
  state.calibrationMode = mode;
  state.calibrationSamples = [];
  
  const targetBtn = mode === 'min' ? calibMinBtn : calibMaxBtn;
  const otherBtn = mode === 'min' ? calibMaxBtn : calibMinBtn;
  
  targetBtn.classList.remove('btn-secondary');
  targetBtn.classList.add('btn-primary');
  targetBtn.disabled = true;
  otherBtn.disabled = true;
  
  if (mode === 'min') {
    targetBtn.querySelector('span:first-child').textContent = 'Midiendo...';
    targetBtn.querySelector('.label').textContent = 'Mantén pellizcado';
  } else {
    targetBtn.querySelector('span:first-child').textContent = 'Midiendo...';
    targetBtn.querySelector('.label').textContent = 'Mantén abierto';
  }
}

function processCalibrationSample(distance) {
  if (state.calibrationMode === 'none') return;
  
  state.calibrationSamples.push(distance);
  
  const targetBtn = state.calibrationMode === 'min' ? calibMinBtn : calibMaxBtn;
  const count = state.calibrationSamples.length;
  
  // Visual loading countdown on the button label
  targetBtn.querySelector('.label').textContent = `Muestras: ${count}/20`;
  
  if (count >= 20) {
    // Average the samples to find the calibrated threshold
    const sum = state.calibrationSamples.reduce((a, b) => a + b, 0);
    const average = sum / count;
    
    if (state.calibrationMode === 'min') {
      state.minDistance = parseFloat(average.toFixed(4));
      minDistRange.value = state.minDistance;
      minCalibVal.textContent = state.minDistance.toFixed(3);
      minDistLbl.textContent = state.minDistance.toFixed(3);
    } else {
      state.maxDistance = parseFloat(average.toFixed(4));
      maxDistRange.value = state.maxDistance;
      maxCalibVal.textContent = state.maxDistance.toFixed(3);
      maxDistLbl.textContent = state.maxDistance.toFixed(3);
    }
    
    updateGaugeMarkers();
    finishCalibration();
  }
}

function finishCalibration() {
  const mode = state.calibrationMode;
  const targetBtn = mode === 'min' ? calibMinBtn : calibMaxBtn;
  const otherBtn = mode === 'min' ? calibMaxBtn : calibMinBtn;
  
  targetBtn.classList.remove('btn-primary');
  targetBtn.classList.add('btn-secondary');
  targetBtn.disabled = false;
  otherBtn.disabled = false;
  
  if (mode === 'min') {
    targetBtn.querySelector('span:first-child').textContent = 'Calibrar Cerrado';
    targetBtn.querySelector('.label').textContent = 'Junta los dedos';
  } else {
    targetBtn.querySelector('span:first-child').textContent = 'Calibrar Abierto';
    targetBtn.querySelector('.label').textContent = 'Separa los dedos';
  }
  
  state.calibrationMode = 'none';
  state.calibrationSamples = [];
}

function resetCalibration() {
  state.minDistance = 0.03;
  state.maxDistance = 0.16;
  updateUIFromState();
  finishCalibration();
}

// Video Time Display Updates
function updateVideoTimeDisplay() {
  if (!videoElement.duration) return;
  
  // Progress bar percent
  const percent = (videoElement.currentTime / videoElement.duration) * 100;
  scrubProgressBar.style.width = `${percent}%`;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const formattedMins = mins.toString().padStart(2, '0');
  const formattedSecs = secs.toString().padStart(2, '0');
  return `${formattedMins}:${formattedSecs}`;
}

// Core Rendering and Tracking Loop
function renderLoop(timestamp) {
  if (!state.webcamRunning) return;
  
  // Calculate FPS
  state.frameCount++;
  const elapsed = timestamp - state.lastFpsTime;
  if (elapsed >= 1000) {
    state.fps = Math.round((state.frameCount * 1000) / elapsed);
    fpsCounter.textContent = `${state.fps} FPS`;
    state.frameCount = 0;
    state.lastFpsTime = timestamp;
  }
  
  // Safely auto-scale canvas resolution to match active webcam video dimensions
  if (webcamElement.videoWidth > 0 && webcamElement.videoHeight > 0) {
    if (canvasElement.width !== webcamElement.videoWidth || canvasElement.height !== webcamElement.videoHeight) {
      canvasElement.width = webcamElement.videoWidth;
      canvasElement.height = webcamElement.videoHeight;
    }
  }

  // Clear canvas overlay
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  // Detect hand landmarks with readyState verification and try-catch safety
  let results = null;
  if (state.handLandmarker && webcamElement.readyState >= 2) {
    try {
      results = state.handLandmarker.detectForVideo(webcamElement, timestamp);
    } catch (err) {
      console.error("Error en detección de MediaPipe:", err);
    }
  }
  
  if (results && results.landmarks && results.landmarks.length > 0) {
    setHandDetected(true);
    setGestureActive(true);
    
    // We only process the first hand detected to avoid layout clutter
    const landmarks = results.landmarks[0];
    
    // Draw skeleton connections
    drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
      color: 'rgba(255, 255, 255, 0.25)',
      lineWidth: 2
    });
    
    // Draw simple dots
    drawingUtils.drawLandmarks(landmarks, {
      color: 'rgba(255, 255, 255, 0.4)',
      radius: (data) => (data.index === 4 || data.index === 8 ? 6 : 2)
    });
    
    // Landmark 4: THUMB_TIP
    // Landmark 8: INDEX_FINGER_TIP
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    
    // Calculate Euclidean distance in 3D
    const dx = thumbTip.x - indexTip.x;
    const dy = thumbTip.y - indexTip.y;
    const dz = thumbTip.z - indexTip.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    state.rawDistance = dist;
    rawDistanceVal.textContent = dist.toFixed(3);
    
    // If calibrating, collect samples
    if (state.calibrationMode !== 'none') {
      processCalibrationSample(dist);
    }
    
    // Apply low-pass filter (Exponential Moving Average) to smooth coordinate jitter
    state.smoothedDistance = (1 - state.smoothingFactor) * state.smoothedDistance + state.smoothingFactor * dist;
    
    // Map distance to normalized [0, 1] percentage
    let scrubPct = (state.smoothedDistance - state.minDistance) / (state.maxDistance - state.minDistance);
    scrubPct = Math.max(0, Math.min(1, scrubPct)); // Clamp between 0 and 1
    
    // Update visual gauge indicator
    const gaugePct = Math.max(0, Math.min(100, (dist / 0.30) * 100));
    gaugeFill.style.width = `${gaugePct}%`;
    
    // Draw the active line connecting Thumb Tip and Index Tip on canvas
    const x1 = thumbTip.x * canvasElement.width;
    const y1 = thumbTip.y * canvasElement.height;
    const x2 = indexTip.x * canvasElement.width;
    const y2 = indexTip.y * canvasElement.height;
    
    // Dynamic color gradient based on control scrub position
    // Close = Red-magenta, Open = Green-cyan
    const r = Math.round(244 - scrubPct * (244 - 6));
    const g = Math.round(63 + scrubPct * (182 - 63));
    const b = Math.round(94 + scrubPct * (212 - 94));
    const lineColor = `rgb(${r}, ${g}, ${b})`;
    const lineGlow = `rgba(${r}, ${g}, ${b}, 0.35)`;
    
    // Draw glow line
    canvasCtx.beginPath();
    canvasCtx.moveTo(x1, y1);
    canvasCtx.lineTo(x2, y2);
    canvasCtx.strokeStyle = lineGlow;
    canvasCtx.lineWidth = 10;
    canvasCtx.lineCap = 'round';
    canvasCtx.stroke();
    
    // Draw core active line
    canvasCtx.beginPath();
    canvasCtx.moveTo(x1, y1);
    canvasCtx.lineTo(x2, y2);
    canvasCtx.strokeStyle = lineColor;
    canvasCtx.lineWidth = 4;
    canvasCtx.stroke();
    
    // Draw highlighted circles around key landmarks
    canvasCtx.beginPath();
    canvasCtx.arc(x1, y1, 8, 0, 2 * Math.PI);
    canvasCtx.fillStyle = lineColor;
    canvasCtx.shadowBlur = 10;
    canvasCtx.shadowColor = lineColor;
    canvasCtx.fill();
    canvasCtx.shadowBlur = 0; // reset
    
    canvasCtx.beginPath();
    canvasCtx.arc(x2, y2, 8, 0, 2 * Math.PI);
    canvasCtx.fillStyle = lineColor;
    canvasCtx.shadowBlur = 10;
    canvasCtx.shadowColor = lineColor;
    canvasCtx.fill();
    canvasCtx.shadowBlur = 0; // reset
    
    // Write distance percentage tooltip on canvas
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2 - 15;
    canvasCtx.fillStyle = '#ffffff';
    canvasCtx.font = 'bold 12px "JetBrains Mono", monospace';
    canvasCtx.textAlign = 'center';
    canvasCtx.fillText(`${Math.round(scrubPct * 100)}%`, midX, midY);
    
    // Control the video scrubbing playhead with seek throttle and queue protection
    if (videoElement.duration) {
      state.targetTime = scrubPct * videoElement.duration;
      const timeDiff = Math.abs(videoElement.currentTime - state.targetTime);
      const now = performance.now();
      
      // Only seek if the change is meaningful (> 0.03s, roughly 1 frame)
      // AND the video is not currently processing a previous seek
      // AND we throttle seek requests to at most once every 33ms (~30fps)
      if (timeDiff > 0.03 && !videoElement.seeking && (now - state.lastSeekTime) > 33) {
        videoElement.currentTime = state.targetTime;
        state.lastSeekTime = now;
      }
    }
  } else {
    setHandDetected(false);
    setGestureActive(false);
    
    // Fade out gauge indicator slowly when hand is lost
    state.rawDistance = 0;
    rawDistanceVal.textContent = '0.000';
    gaugeFill.style.width = '0%';
  }
  
  // Loop
  state.animationFrameId = requestAnimationFrame(renderLoop);
}

// Boot application
init();
