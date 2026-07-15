/* global Peer */
const $ = (selector) => document.querySelector(selector);
const home = $('#home');
const viewer = $('#viewer');
const sender = $('#sender');
let peer = null;
let activeCall = null;
let localStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let controlConnection = null;

function show(section) {
  [home, viewer, sender].forEach((item) => item.classList.toggle('hidden', item !== section));
}

function roomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `cam-${[...bytes].map((n) => chars[n % chars.length]).join('').toLowerCase()}`;
}

function displayCode(id) { return id.replace(/^cam-/, '').toUpperCase().replace(/(.{4})/, '$1 '); }
function normalizeCode(value) { return `cam-${value.replace(/[^a-z0-9]/gi, '').toLowerCase().replace(/^cam/, '')}`; }

function setStatus(element, message, error = false) {
  element.classList.remove('hidden');
  element.classList.toggle('error', error);
  element.querySelector('span').textContent = message;
}

function closeEverything() {
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
  if (activeCall) activeCall.close();
  if (localStream) localStream.getTracks().forEach((track) => track.stop());
  if (peer) peer.destroy();
  if (controlConnection) controlConnection.close();
  activeCall = peer = localStream = controlConnection = null;
  $('#remoteVideo').srcObject = null;
  $('#localVideo').srcObject = null;
  $('#videoStage').classList.add('hidden');
  $('#previewStage').classList.add('hidden');
  $('#codeCard').classList.remove('hidden');
  $('#connectForm').classList.remove('hidden');
}

function peerErrorMessage(error) {
  if (error.type === 'peer-unavailable') return 'That computer code was not found. Check it and try again.';
  if (error.type === 'network') return 'Network connection failed. Check both devices are online.';
  return error.message || 'The connection could not be created.';
}

function startViewer() {
  closeEverything();
  show(viewer);
  const id = roomId();
  $('#roomCode').textContent = displayCode(id);
  setStatus($('#viewerStatus'), 'Creating secure room…');
  peer = new Peer(id);
  peer.on('open', () => setStatus($('#viewerStatus'), 'Ready — waiting for your phone'));
  peer.on('connection', (connection) => {
    if (controlConnection) controlConnection.close();
    controlConnection = connection;
    connection.on('data', (command) => {
      if (command === 'screenshot') saveScreenshot();
      if (command === 'record') toggleRecording();
    });
  });
  peer.on('call', (call) => {
    if (activeCall) { call.close(); return; }
    activeCall = call;
    setStatus($('#viewerStatus'), 'Phone found — connecting…');
    call.answer();
    call.on('stream', (stream) => {
      $('#remoteVideo').srcObject = stream;
      $('#codeCard').classList.add('hidden');
      $('#videoStage').classList.remove('hidden');
    });
    call.on('close', () => {
      activeCall = null;
      $('#remoteVideo').srcObject = null;
      $('#videoStage').classList.add('hidden');
      $('#codeCard').classList.remove('hidden');
      setStatus($('#viewerStatus'), 'Disconnected — ready to reconnect');
    });
  });
  peer.on('error', (error) => setStatus($('#viewerStatus'), peerErrorMessage(error), true));
}

async function getCamera(facingMode) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS and a supported browser.');
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false
  });
}

async function connectSender(event) {
  event.preventDefault();
  const button = $('#connectButton');
  const target = normalizeCode($('#codeInput').value);
  button.disabled = true;
  setStatus($('#senderStatus'), 'Requesting camera permission…');
  try {
    localStream = await getCamera($('#cameraSelect').value);
    $('#localVideo').srcObject = localStream;
    setStatus($('#senderStatus'), 'Connecting to computer…');
    peer = new Peer();
    peer.on('error', (error) => {
      setStatus($('#senderStatus'), peerErrorMessage(error), true);
      button.disabled = false;
    });
    peer.on('open', () => {
      controlConnection = peer.connect(target, { reliable: true });
      activeCall = peer.call(target, localStream);
      if (!activeCall) throw new Error('Could not start the video call.');
      activeCall.on('stream', () => {});
      activeCall.on('close', stopSender);
      activeCall.on('error', (error) => setStatus($('#senderStatus'), peerErrorMessage(error), true));
      $('#connectForm').classList.add('hidden');
      $('#previewStage').classList.remove('hidden');
    });
  } catch (error) {
    if (localStream) localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
    const denied = error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access and try again.' : error.message;
    setStatus($('#senderStatus'), denied, true);
    button.disabled = false;
  }
}

function sendRemoteCommand(command) {
  if (!controlConnection?.open) {
    const toast = $('#captureToast');
    toast.textContent = 'Remote control is still connecting';
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); toast.textContent = 'Screenshot saved'; }, 1800);
    return;
  }
  controlConnection.send(command);
  if (command === 'record') {
    const button = $('#remoteRecord');
    const recording = !button.classList.contains('recording');
    button.classList.toggle('recording', recording);
    button.querySelector('span').textContent = recording ? 'Stop & save' : 'Start recording';
  }
}

function stopSender() {
  closeEverything();
  show(sender);
  $('#connectButton').disabled = false;
  $('#senderStatus').classList.add('hidden');
}

function saveScreenshot() {
  const video = $('#remoteVideo');
  if (!video.videoWidth || !video.videoHeight) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `phone-camera-${timestamp}.png`;
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    const toast = $('#captureToast');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 1800);
  }, 'image/png');
}

function preferredRecordingType() {
  return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function toggleRecording() {
  const stream = $('#remoteVideo').srcObject;
  const button = $('#recordButton');
  if (!stream) return;
  if (mediaRecorder?.state === 'recording') {
    mediaRecorder.stop();
    return;
  }
  if (!window.MediaRecorder) {
    const toast = $('#captureToast');
    toast.textContent = 'Recording is not supported in this browser';
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
    return;
  }
  recordedChunks = [];
  const mimeType = preferredRecordingType();
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  mediaRecorder.addEventListener('dataavailable', (event) => { if (event.data.size) recordedChunks.push(event.data); });
  mediaRecorder.addEventListener('stop', () => {
    button.classList.remove('recording');
    button.querySelector('span').textContent = 'Record';
    button.title = 'Start recording';
    if (!recordedChunks.length) return;
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `phone-camera-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    const toast = $('#captureToast');
    toast.textContent = 'Recording saved';
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); toast.textContent = 'Screenshot saved'; }, 1800);
  });
  mediaRecorder.start(1000);
  button.classList.add('recording');
  button.querySelector('span').textContent = 'Stop';
  button.title = 'Stop and save recording';
}

async function flipCamera() {
  if (!localStream) return;
  const next = $('#cameraSelect').value === 'environment' ? 'user' : 'environment';
  try {
    const nextStream = await getCamera(next);
    const nextTrack = nextStream.getVideoTracks()[0];
    const senderTrack = activeCall?.peerConnection?.getSenders().find((item) => item.track?.kind === 'video');
    if (senderTrack) await senderTrack.replaceTrack(nextTrack);
    localStream.getTracks().forEach((track) => track.stop());
    localStream = nextStream;
    $('#localVideo').srcObject = nextStream;
    $('#cameraSelect').value = next;
  } catch (error) { setStatus($('#senderStatus'), error.message, true); }
}

$('#watchButton').addEventListener('click', startViewer);
$('#cameraButton').addEventListener('click', () => { closeEverything(); show(sender); });
$('#connectForm').addEventListener('submit', connectSender);
$('#stopSender').addEventListener('click', stopSender);
$('#flipButton').addEventListener('click', flipCamera);
$('#disconnectViewer').addEventListener('click', startViewer);
$('#fullscreenButton').addEventListener('click', () => $('#videoStage').requestFullscreen?.());
$('#screenshotButton').addEventListener('click', saveScreenshot);
$('#recordButton').addEventListener('click', toggleRecording);
$('#remoteScreenshot').addEventListener('click', () => sendRemoteCommand('screenshot'));
$('#remoteRecord').addEventListener('click', () => sendRemoteCommand('record'));
$('#copyCode').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('#roomCode').textContent.replace(' ', ''));
  $('#copyCode small').textContent = 'Copied!';
  setTimeout(() => { $('#copyCode small').textContent = 'Tap to copy'; }, 1500);
});
document.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', () => { closeEverything(); show(home); }));
window.addEventListener('beforeunload', closeEverything);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
