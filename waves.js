/* The voice panel's waves: the "Ethereal voice waves" Figma shader, run on a
   WebGPU canvas inside .jobs__waves. The panel's CSS places and fades the
   layer; this draws into it, and only while the assistant is listening.

   The shader is the Figma agent's WGSL with two departures. It no longer
   samples the layer beneath it — the canvas composites over the panel with
   premultiplied alpha instead, so the surface's dark-scope swap and colour
   transition show through for free — and its two keyframeable inputs,
   voice level and motion phase, are driven live: level from the microphone
   when the browser grants one, otherwise from a simulated speech envelope,
   and phase from the clock. */
(function () {
  var tabbar = document.querySelector('.jobs__tabbar');
  var canvas = document.querySelector('.jobs__waves-canvas');
  if (!tabbar || !canvas) return;
  if (!navigator.gpu) {
    console.info('Voice waves: this browser has no WebGPU, so the panel stays plain.');
    return;
  }

  // Composition. The Figma defaults were set against a 377 x 220 frame with
  // the waves centred in it; this layer is the bottom 110px of the panel, so
  // the crests sit in its upper third and the filled region runs off its
  // floor. Center, width and height are percentages of the layer.
  var SHAPE = {
    frequency: 1.6,
    layers: 5,
    separation: 0.14,
    opacity: 0.72,
    center: [50, 56],
    width: 108,
    height: 100,
  };

  // Each layer's look, from the shader's defaults: blur radius (px), glow
  // strength, glow softness (px), and a gradient of [blue step, position,
  // alpha]. The steps are the kit's blue ramp, read from the stylesheet
  // below, so the waves are seeded with the same variables the Figma effect
  // was. Layers 6 to 8 only draw if SHAPE.layers is raised. A hidden layer
  // keeps its slot, so the others stay where they were, and draws nothing.
  var LAYERS = [
    { blur: 0.6, glow: 0.35, softness: 8, stops: [[700, 0, 0.48], [600, 0.55, 0.62], [400, 1, 0.4]] },
    { blur: 1.0, glow: 0.3, softness: 10, stops: [[600, 0, 0.35], [300, 0.45, 0.46], [700, 1, 0.42]], hidden: true },
    { blur: 0.4, glow: 0.45, softness: 6, stops: [[700, 0, 0.42], [400, 0.6, 0.56], [600, 1, 0.38]] },
    { blur: 1.5, glow: 0.25, softness: 12, stops: [[950, 0, 0.52], [600, 0.4, 0.6], [300, 1, 0.34]], hidden: true },
    { blur: 0.6, glow: 0.35, softness: 8, stops: [[400, 0, 0.34], [300, 0.65, 0.44], [700, 1, 0.46]] },
    { blur: 0.6, glow: 0.35, softness: 8, stops: [[700, 0, 0.4], [400, 0.5, 0.5], [600, 1, 0.35]] },
    { blur: 0.6, glow: 0.35, softness: 8, stops: [[600, 0, 0.4], [300, 0.7, 0.42], [700, 1, 0.38]] },
    { blur: 0.6, glow: 0.35, softness: 8, stops: [[950, 0, 0.45], [400, 0.55, 0.48], [600, 1, 0.36]] },
  ];

  // How the shapes move. Phase is the shader's own unit, one full cycle per
  // 1.0; speech speeds the flow up. Level is smoothed with a quick attack and
  // a slower release, the shape of a syllable rather than a meter.
  var PHASE_IDLE = 0.05;
  var PHASE_SPEECH = 0.2;
  var PHASE_REDUCED = 0.008;
  var ATTACK = 0.05;
  var RELEASE = 0.28;

  // Microphone: RMS of the waveform below the floor is room noise and reads
  // as silence; above it the gain brings ordinary speech up to the top of the
  // range, with a soft knee so a shout does not just clip.
  var MIC_FLOOR = 0.008;
  var MIC_GAIN = 5.5;
  var MIC_KNEE = 0.7;
  var LEVEL_IDLE = 0.2;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  var wgsl = `
diagnostic(off,derivative_uniformity);
struct WaveLayer {
  colors: array<vec4f, 8>,
  positions: array<vec4f, 2>,
  count: vec4f,
  settings: vec4f,
};
struct Uniforms {
  frameData: vec4f,
  voiceLevel: vec4f,
  motionPhase: vec4f,
  waveFrequency: vec4f,
  layerCount: vec4f,
  layerSeparation: vec4f,
  waveOpacity: vec4f,
  center: vec4f,
  waveWidth: vec4f,
  waveHeight: vec4f,
  layers: array<WaveLayer, 8>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VsIn {
  @location(0) pos: vec2f,
  @location(1) uv: vec2f,
};
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

fn paletteStopPos(layer: u32, i: u32) -> f32 {
  return u.layers[layer].positions[i / 4u][i & 3u];
}

fn paletteRamp(layer: u32, t: f32) -> vec4f {
  let n = clamp(u32(u.layers[layer].count.x), 0u, 8u);
  if (n == 0u) { return vec4f(0.0); }
  if (n == 1u || t <= paletteStopPos(layer, 0u)) { return u.layers[layer].colors[0]; }
  let last = n - 1u;
  if (t >= paletteStopPos(layer, last)) { return u.layers[layer].colors[last]; }
  for (var i = 0u; i < 7u; i = i + 1u) {
    if (i >= last) { break; }
    let p1 = paletteStopPos(layer, i + 1u);
    if (t <= p1) {
      let p0 = paletteStopPos(layer, i);
      return mix(u.layers[layer].colors[i], u.layers[layer].colors[i + 1u], (t - p0) / max(p1 - p0, 1e-5));
    }
  }
  return u.layers[layer].colors[last];
}

// The waveform geometry, reused by both the surface and its blur taps.
fn waveY(x: f32, fi: f32, position: f32, h: f32, energy: f32, phase: f32) -> f32 {
  let inside = 1.0 - smoothstep(0.96, 1.0, abs(x));
  let envelope = pow(max(0.0, 1.0 - x * x), 1.65) * inside;
  let angle = x * 3.141592654 * u.waveFrequency.x + phase * (0.74 + fi * 0.075) + fi * 1.31;
  let harmonic = sin(angle) * 0.72
    + sin(angle * 1.73 - phase * 0.37 + fi * 0.91) * (0.12 + 0.16 * energy)
    + sin(x * 3.141592654 * (u.waveFrequency.x * 3.1 + 0.4) + phase * 1.27 + fi * 2.1) * 0.10 * energy;
  let breathing = 0.84 + 0.16 * sin(phase * 0.53 + fi * 1.7);
  return envelope * (h * (0.012 + 0.38 * energy) * harmonic * breathing + position * h * u.layerSeparation.x * 0.75);
}

fn filledMask(p: vec2f, span: f32, fi: f32, position: f32, h: f32, energy: f32, phase: f32) -> f32 {
  let x = p.x / (span * 0.5);
  let upper = waveY(x, fi, position, h, energy, phase);
  let lower = h * 0.58;
  let sides = 1.0 - smoothstep(span * 0.5 - 0.6, span * 0.5 + 0.6, abs(p.x));
  let topCoverage = smoothstep(-0.6, 0.6, p.y - upper);
  let bottomCoverage = 1.0 - smoothstep(lower - 0.6, lower + 0.6, p.y);
  // A substantial filled region, gently dimmed toward its common lower baseline.
  let depthFade = mix(1.0, 0.42, clamp((p.y - upper) / max(lower - upper, 1.0), 0.0, 1.0));
  return sides * topCoverage * bottomCoverage * depthFade;
}

@vertex fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.position = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  return out;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Dimensions are CSS pixels, whatever the backing store's density, so the
  // blur radii and glow softness below keep the sizes they were tuned at.
  let dims = max(u.frameData.yz, vec2f(1.0));
  let voiceLevel = u.voiceLevel.x;
  let motionPhase = u.motionPhase.x;
  let layerCount = u.layerCount.x;
  let waveOpacity = u.waveOpacity.x;
  let center = u.center.xy;
  let waveWidth = u.waveWidth.x;
  let waveHeight = u.waveHeight.x;
  let p = (uv - center / 100.0) * dims;
  let span = max(dims.x * waveWidth / 100.0, 1.0);
  let h = dims.y * waveHeight / 100.0;
  let x = p.x / (span * 0.5);
  let inside = 1.0 - smoothstep(0.96, 1.0, abs(x));
  let envelope = pow(max(0.0, 1.0 - x * x), 1.65) * inside;
  let energy = clamp(voiceLevel, 0.0, 1.0);
  let count = clamp(i32(round(layerCount)), 1, 8);
  let phase = motionPhase * 6.283185307;
  // Premultiplied: colour never exceeds alpha, so the canvas can be handed
  // to the compositor as is.
  var color = vec3f(0.0);
  var alpha = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    if (i >= count) { break; }
    let fi = f32(i);
    let position = (fi - f32(count - 1) * 0.5) / max(f32(count - 1), 1.0);
    let settings = u.layers[u32(i)].settings;
    let blurRadius = max(settings.x, 0.0);
    let glowStrength = max(settings.y, 0.0);
    let softness = max(settings.z, 0.35);
    var coverage = 0.0;
    // Fixed 3x3 Gaussian quadrature blurs the filled shape in pixel space.
    for (var by = -1; by <= 1; by = by + 1) {
      for (var bx = -1; bx <= 1; bx = bx + 1) {
        let weightX = select(0.25, 0.5, bx == 0);
        let weightY = select(0.25, 0.5, by == 0);
        let tap = p + vec2f(f32(bx), f32(by)) * blurRadius * 1.5;
        coverage = coverage + filledMask(tap, span, fi, position, h, energy, phase) * weightX * weightY;
      }
    }
    let y = waveY(x, fi, position, h, energy, phase);
    let slope = (waveY(x + 2.0 / span, fi, position, h, energy, phase) - waveY(x - 2.0 / span, fi, position, h, energy, phase)) * 0.5;
    let delta = abs(p.y - y) / sqrt(1.0 + slope * slope);
    let halo = exp(-pow(delta / softness, 2.0)) * glowStrength * 0.16;
    let farHalo = exp(-pow(delta / (softness * 2.4), 2.0)) * glowStrength * 0.035;
    let rampPosition = clamp((x + 1.0) * 0.5 + position * 0.10 + 0.035 * sin(phase * 0.4 + fi), 0.0, 1.0);
    let tint = paletteRamp(u32(i), rampPosition);
    let depth = 0.7 + 0.3 * sin(fi * 1.73 + 0.4) * sin(fi * 1.73 + 0.4);
    let surfaceAlpha = clamp(coverage * tint.a * waveOpacity * depth * (0.62 + energy * 0.18), 0.0, 1.0);
    color = color * (1.0 - surfaceAlpha) + tint.rgb * surfaceAlpha;
    alpha = alpha * (1.0 - surfaceAlpha) + surfaceAlpha;
    // The halo is light added over whatever is underneath. Over a dark panel
    // a screen blend and an "over" of the same light are the same thing, so
    // it is carried as coverage and the compositor does the screening.
    let illumination = vec3f(1.0) - exp(-tint.rgb * tint.a * (halo + farHalo) * envelope * waveOpacity);
    let lightAlpha = max(illumination.r, max(illumination.g, illumination.b));
    color = color * (1.0 - lightAlpha) + illumination;
    alpha = alpha * (1.0 - lightAlpha) + lightAlpha;
  }
  return vec4f(color, alpha);
}
`;

  // The uniform block: ten vec4 of header, then eight 192-byte layers. The
  // layers only change with the constants above, so they are written once.
  var HEADER_FLOATS = 40;
  var LAYER_FLOATS = 48;
  var LAYER_OFFSET = HEADER_FLOATS * 4;
  var UNIFORM_BYTES = LAYER_OFFSET + LAYERS.length * LAYER_FLOATS * 4;

  // Base ramps do not change with the theme, so one read at startup is the
  // whole story.
  var rootStyle = getComputedStyle(document.documentElement);
  function shade(step) {
    var raw = rootStyle.getPropertyValue('--pp-color-blue-' + step).trim();
    var hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      var digits = hex[1];
      if (digits.length === 3) digits = digits.replace(/./g, '$&$&');
      return [0, 2, 4].map(function (at) {
        return parseInt(digits.slice(at, at + 2), 16) / 255;
      });
    }
    var channels = raw.match(/[\d.]+/g) || [];
    return [0, 1, 2].map(function (index) {
      return (parseFloat(channels[index]) || 0) / 255;
    });
  }

  function layerData() {
    var out = new Float32Array(LAYERS.length * LAYER_FLOATS);
    LAYERS.forEach(function (layer, index) {
      var base = index * LAYER_FLOATS;
      layer.stops.slice(0, 8).forEach(function (stop, i) {
        var rgb = shade(stop[0]);
        out[base + i * 4] = rgb[0];
        out[base + i * 4 + 1] = rgb[1];
        out[base + i * 4 + 2] = rgb[2];
        out[base + i * 4 + 3] = stop[2];
        out[base + 32 + i] = stop[1];
      });
      // A stop count of zero makes the palette return transparent, which
      // takes both the fill and the halo with it.
      out[base + 40] = layer.hidden ? 0 : Math.min(layer.stops.length, 8);
      out[base + 44] = layer.blur;
      out[base + 45] = layer.glow;
      out[base + 46] = layer.softness;
    });
    return out;
  }

  var header = new Float32Array(HEADER_FLOATS);
  function writeHeader(width, height, level, phase) {
    header[1] = width;
    header[2] = height;
    header[4] = level;
    header[8] = phase;
    header[12] = SHAPE.frequency;
    header[16] = SHAPE.layers;
    header[20] = SHAPE.separation;
    header[24] = SHAPE.opacity;
    header[28] = SHAPE.center[0];
    header[29] = SHAPE.center[1];
    header[32] = SHAPE.width;
    header[36] = SHAPE.height;
  }

  // The GPU side is built the first time the panel opens and kept; a lost
  // device is rebuilt on the next open.
  var gpu = null;
  var gpuPending = null;
  var gpuFailed = false;

  function initGPU() {
    if (gpu) return Promise.resolve(gpu);
    if (gpuPending) return gpuPending;
    gpuPending = navigator.gpu
      .requestAdapter()
      .then(function (adapter) {
        if (!adapter) throw new Error('no adapter');
        return adapter.requestDevice();
      })
      .then(function (device) {
        var context = canvas.getContext('webgpu');
        var format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({ device: device, format: format, alphaMode: 'premultiplied' });

        var module = device.createShaderModule({ code: wgsl });
        var pipeline = device.createRenderPipeline({
          layout: 'auto',
          vertex: {
            module: module,
            entryPoint: 'vs_main',
            buffers: [
              {
                arrayStride: 16,
                attributes: [
                  { shaderLocation: 0, format: 'float32x2', offset: 0 },
                  { shaderLocation: 1, format: 'float32x2', offset: 8 },
                ],
              },
            ],
          },
          fragment: { module: module, entryPoint: 'fs_main', targets: [{ format: format }] },
          primitive: { topology: 'triangle-list' },
        });

        var quad = device.createBuffer({
          size: 6 * 4 * 4,
          usage: GPUBufferUsage.VERTEX,
          mappedAtCreation: true,
        });
        new Float32Array(quad.getMappedRange()).set([
          -1, -1, 0, 1,
          1, -1, 1, 1,
          -1, 1, 0, 0,
          -1, 1, 0, 0,
          1, -1, 1, 1,
          1, 1, 1, 0,
        ]);
        quad.unmap();

        var uniforms = device.createBuffer({
          size: UNIFORM_BYTES,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(uniforms, LAYER_OFFSET, layerData());

        var bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniforms } }],
        });

        gpu = {
          device: device,
          context: context,
          pipeline: pipeline,
          quad: quad,
          uniforms: uniforms,
          bindGroup: bindGroup,
        };
        gpuPending = null;
        device.lost.then(function () {
          gpu = null;
          gpuPending = null;
        });
        return gpu;
      })
      .catch(function (error) {
        gpuFailed = true;
        gpuPending = null;
        console.info('Voice waves: WebGPU could not start, so the panel stays plain.', error);
        return null;
      });
    return gpuPending;
  }

  // The backing store follows the layer's CSS size at device density; the
  // shader is told the CSS size.
  var cssWidth = 0;
  var cssHeight = 0;
  function resize(entry) {
    var dpr = window.devicePixelRatio || 1;
    var rect = entry ? entry.contentRect : canvas.getBoundingClientRect();
    cssWidth = rect.width;
    cssHeight = rect.height;
    var width = Math.max(1, Math.round(cssWidth * dpr));
    var height = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }
  resize();
  if (window.ResizeObserver) {
    new ResizeObserver(function (entries) {
      resize(entries[0]);
    }).observe(canvas);
  }

  function draw(level, phase) {
    if (!gpu) return;
    writeHeader(cssWidth, cssHeight, level, phase);
    gpu.device.queue.writeBuffer(gpu.uniforms, 0, header);
    var encoder = gpu.device.createCommandEncoder();
    var pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpu.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(gpu.pipeline);
    pass.setBindGroup(0, gpu.bindGroup);
    pass.setVertexBuffer(0, gpu.quad);
    pass.draw(6);
    pass.end();
    gpu.device.queue.submit([encoder.finish()]);
  }

  // Voice level. The microphone is asked for when the panel first opens and
  // let go when it closes, so the browser's recording indicator tracks the
  // panel; a browser that remembers the grant asks nothing the second time.
  // Any refusal hands over to the simulated envelope for the session.
  var mic = { stream: null, context: null, analyser: null, samples: null, denied: false };

  function micSupported() {
    return !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      (window.AudioContext || window.webkitAudioContext)
    );
  }

  function startMic() {
    if (mic.denied || !micSupported()) return Promise.resolve(false);
    if (mic.stream) return mic.context.resume().then(function () { return true; });
    return navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (stream) {
        if (!active) {
          stream.getTracks().forEach(function (track) { track.stop(); });
          return false;
        }
        var Context = window.AudioContext || window.webkitAudioContext;
        mic.context = new Context();
        mic.analyser = mic.context.createAnalyser();
        mic.analyser.fftSize = 1024;
        mic.samples = new Float32Array(mic.analyser.fftSize);
        mic.context.createMediaStreamSource(stream).connect(mic.analyser);
        mic.stream = stream;
        applyMute();
        return mic.context.resume().then(function () { return true; });
      })
      .catch(function () {
        mic.denied = true;
        return false;
      });
  }

  // Mute is the panel's mic button, read from its pressed state so the two
  // cannot disagree. The track is disabled rather than stopped, which keeps
  // the grant and the recording indicator while sending silence. The loop
  // also pins the level to idle while muted, so the simulated envelope a
  // browser without a microphone falls back to goes quiet as well.
  var muteButton = document.querySelector('.jobs__talk-button--mic');

  function muted() {
    return !!muteButton && muteButton.getAttribute('aria-pressed') === 'true';
  }

  function applyMute() {
    if (!mic.stream) return;
    mic.stream.getAudioTracks().forEach(function (track) {
      track.enabled = !muted();
    });
  }

  if (muteButton) {
    new MutationObserver(applyMute).observe(muteButton, { attributes: true, attributeFilter: ['aria-pressed'] });
  }

  function stopMic() {
    if (!mic.stream) return;
    mic.stream.getTracks().forEach(function (track) { track.stop(); });
    mic.context.close().catch(function () {});
    mic.stream = null;
    mic.context = null;
    mic.analyser = null;
    mic.samples = null;
  }

  function micLevel() {
    mic.analyser.getFloatTimeDomainData(mic.samples);
    var sum = 0;
    for (var i = 0; i < mic.samples.length; i++) sum += mic.samples[i] * mic.samples[i];
    var rms = Math.sqrt(sum / mic.samples.length);
    var lifted = Math.max(0, rms - MIC_FLOOR) * MIC_GAIN;
    return LEVEL_IDLE + (1 - LEVEL_IDLE) * Math.min(1, Math.pow(lifted, MIC_KNEE));
  }

  function smoothstep(edge0, edge1, value) {
    var t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  // Speech without a speaker: phrases a few seconds long with pauses between
  // them, a syllabic flutter inside each, and a slower rise and fall across
  // the phrase. Incommensurate frequencies keep it from looping visibly.
  function simulatedLevel(t) {
    var breath = 0.5 + 0.5 * Math.sin(t * 0.41 + 0.7) * Math.sin(t * 0.17);
    var gate = smoothstep(0.25, 0.6, breath);
    var syllables = 0.55 + 0.45 * Math.sin(t * 6.1) * Math.sin(t * 3.7 + 0.4);
    var accent = 0.5 + 0.5 * Math.sin(t * 1.3 + 2.0);
    return LEVEL_IDLE + gate * (0.25 + 0.55 * syllables * (0.6 + 0.4 * accent));
  }

  // The loop. Runs while the panel is open and through its fade on the way
  // out, then stops, so a closed panel costs nothing.
  var active = false;
  var usingMic = false;
  var raf = 0;
  var last = 0;
  var clock = 0;
  var level = LEVEL_IDLE;
  var phase = 0;
  var stopping = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    // The speed devtool scales the page's transitions; the flow follows.
    dt = dt / (window.__ppSpeed || 1);
    clock += dt;

    var target = muted() ? LEVEL_IDLE : usingMic && mic.analyser ? micLevel() : simulatedLevel(clock);
    var rate = target > level ? ATTACK : RELEASE;
    level += (target - level) * (1 - Math.exp(-dt / rate));

    var pace = reduced.matches ? PHASE_REDUCED : PHASE_IDLE + PHASE_SPEECH * level;
    phase += dt * pace;

    draw(level, phase);
  }

  function token(name) {
    var value = getComputedStyle(tabbar).getPropertyValue(name).trim();
    var number = parseFloat(value) || 0;
    return /[\d.]s$/.test(value) ? number * 1000 : number;
  }

  function start() {
    active = true;
    window.clearTimeout(stopping);
    if (gpuFailed) return;
    initGPU().then(function () {
      if (gpu && active && !raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    });
    startMic().then(function (granted) {
      usingMic = granted && active;
      if (!active) stopMic();
    });
  }

  function stop() {
    active = false;
    window.clearTimeout(stopping);
    stopping = window.setTimeout(
      function () {
        if (active) return;
        cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
        usingMic = false;
        stopMic();
      },
      reduced.matches ? 0 : token('--pp-duration-3')
    );
  }

  function sync() {
    var voice = tabbar.dataset.state === 'voice';
    if (voice && !active) start();
    else if (!voice && active) stop();
  }

  new MutationObserver(sync).observe(tabbar, { attributes: true, attributeFilter: ['data-state'] });
  sync();
})();
