/* The transcription waveform: thin rounded bars that scroll in from the right,
   one per step, starting from an empty strip and resting as dots when the
   room is quiet. Each bar is the
   loudest the microphone heard during its step. Without a microphone, or
   without permission, the strip stays at rest. ?speed= slows the scroll with
   the rest of the page's motion. */
(function () {
  var canvas = document.querySelector('.transcribe__wave-canvas');
  var context = canvas.getContext('2d');

  // A bar is always BAR wide; at rest it is BAR tall too, which makes it a dot.
  var BAR = 3;
  var PITCH = 6;
  var STEP_MS = 140;
  // Loudness, in dBFS, mapped onto the bar's height: below QUIET_DB is a dot,
  // LOUD_DB and above is the full height.
  var QUIET_DB = -52;
  var LOUD_DB = -14;

  var samples = [];
  var width = 0;
  var height = 0;
  var ratio = 1;
  var frame = 0;
  var lastStep = 0;
  var running = false;

  var audio = null;
  var analyser = null;
  var buffer = null;
  var stream = null;
  var session = 0;
  var stepPeak = 0;

  function capacity() {
    return Math.ceil(width / PITCH) + 2;
  }

  function resize() {
    ratio = window.devicePixelRatio || 1;
    var box = canvas.getBoundingClientRect();
    width = box.width;
    height = box.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(0);
  }

  // Snapped to device pixels, or a scrolling 3px dot smears across four of them
  // and stops reading as a circle.
  function snap(value) {
    return Math.round(value * ratio) / ratio;
  }

  function bar(x, level) {
    var h = Math.max(BAR, level * height);
    var r = BAR / 2;
    x = snap(x);
    var y = snap((height - h) / 2);
    context.beginPath();
    if (h === BAR) {
      context.arc(x + r, y + r, r, 0, Math.PI * 2);
    } else {
      context.moveTo(x, y + r);
      context.arc(x + r, y + r, r, Math.PI, 0);
      context.lineTo(x + BAR, y + h - r);
      context.arc(x + r, y + h - r, r, 0, Math.PI);
    }
    context.closePath();
    context.fill();
  }

  // offset is how far, from 0 to 1, the strip has moved toward the next step,
  // so the scroll is continuous rather than a jump per bar.
  function draw(offset) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = getComputedStyle(canvas).color;
    var count = samples.length;
    for (var i = 0; i < count; i++) {
      var x = width - (count - i) * PITCH + (1 - offset) * PITCH;
      if (x < -BAR || x > width) continue;
      bar(x, samples[i]);
    }
  }

  function loudness() {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(buffer);
    var sum = 0;
    for (var i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    var rms = Math.sqrt(sum / buffer.length);
    if (rms <= 0) return 0;
    var db = 20 * Math.log10(rms);
    var level = (db - QUIET_DB) / (LOUD_DB - QUIET_DB);
    return Math.min(1, Math.max(0, level));
  }

  function tick(now) {
    if (!running) return;
    stepPeak = Math.max(stepPeak, loudness());
    var step = STEP_MS / (window.__ppSpeed || 1);
    if (!lastStep) lastStep = now;
    while (now - lastStep >= step) {
      samples.push(stepPeak);
      stepPeak = 0;
      if (samples.length > capacity()) samples.shift();
      lastStep += step;
    }
    draw((now - lastStep) / step);
    frame = requestAnimationFrame(tick);
  }

  function release() {
    if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
    if (audio) audio.close();
    stream = null;
    audio = null;
    analyser = null;
  }

  // The audio context is made inside the tap that started listening, because
  // iOS only lets one start from a user gesture.
  function listen() {
    var mine = ++session;
    var Context = window.AudioContext || window.webkitAudioContext;
    if (!Context || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    audio = new Context();
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then(function (granted) {
        if (mine !== session) {
          granted.getTracks().forEach(function (track) { track.stop(); });
          return;
        }
        stream = granted;
        analyser = audio.createAnalyser();
        analyser.fftSize = 1024;
        buffer = new Float32Array(analyser.fftSize);
        audio.createMediaStreamSource(stream).connect(analyser);
        audio.resume();
      })
      .catch(function (error) {
        console.warn('Transcribe: no microphone input —', error.name);
      });
  }

  window.transcribeWave = {
    start: function () {
      if (running) return;
      running = true;
      samples = [];
      stepPeak = 0;
      lastStep = 0;
      listen();
      frame = requestAnimationFrame(tick);
    },
    stop: function () {
      running = false;
      session++;
      cancelAnimationFrame(frame);
      release();
    },
  };

  new ResizeObserver(resize).observe(canvas);
})();
