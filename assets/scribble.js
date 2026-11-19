/* Scribble — editable SVG character and deterministic motion clips. */
(() => {
  const svgNS = "http://www.w3.org/2000/svg";
  const ink = "#25212b";
  const paperWhite = "#fff9ed";
  const lime = "#cbec31";
  const blue = "#3457b5";
  let instance = 0;

  // Position and angle are in the character's local coordinates.
  const rest = {
    offset: [0, 0],
    head: [0, 0, -4],
    body: 0,
    gaze: [5, -1],
    eyes: [0.92, 0.84],
    brows: [0, -2, -2, 3],
    mouth: [25, 1, -7],
    leftArm: [116, 316, 139, 364, 133],
    rightArm: [280, 321, 252, 363, 36],
    leftLeg: [174, 389, 160, 435, -9],
    rightLeg: [229, 391, 236, 435, 4],
    rays: 0
  };
  const pose = (changes = {}) => ({ ...rest, ...changes });
  const neutral = pose();
  const blink = pose({ eyes: [0.06, 0.06], brows: [2, 0, -2, 3] });
  const pointReady = pose({
    offset: [0, -2], head: [3, -2, 2], gaze: [13, -3], brows: [-2, -8, 3, -5],
    rightArm: [287, 284, 312, 235, -44], mouth: [23, 1, -9]
  });
  const point = pose({
    offset: [3, -3], head: [8, -1, 5], gaze: [13, -2], eyes: [1, 0.96],
    brows: [-3, -10, 1, -4], rightArm: [306, 244, 449, 201, -6], mouth: [27, 4, -8]
  });
  const explain = pose({
    head: [-4, -6, -6], gaze: [-4, -1], brows: [-4, -5, -3, 1], mouth: [28, 7, -6],
    leftArm: [126, 320, 79, 274, 197], rightArm: [276, 317, 331, 262, -35]
  });
  const explainBeat = pose({
    offset: [-3, -3], head: [1, -3, 2], gaze: [2, -2], eyes: [1.03, 0.94],
    brows: [-7, -4, -5, 2], mouth: [23, 12, -3],
    leftArm: [123, 320, 77, 292, 196], rightArm: [285, 305, 348, 243, -50]
  });
  const think = pose({
    offset: [-4, 2], head: [-4, 1, -10], body: -4, eyes: [0.75, 0.52], gaze: [12, -12],
    brows: [3, -9, 8, -5], mouth: [18, 1, 1],
    leftArm: [108, 324, 156, 339, 48], rightArm: [285, 315, 263, 244, -106]
  });
  const surprise = pose({
    offset: [0, -7], head: [0, -15, 2], eyes: [1.32, 1.36], gaze: [4, 2],
    brows: [-17, -17, -2, 5], mouth: [15, 27, 0], rays: 1,
    leftArm: [124, 295, 69, 231, 216], rightArm: [290, 293, 347, 221, -53],
    leftLeg: [164, 382, 148, 431, -15], rightLeg: [247, 380, 256, 431, 12]
  });
  const crouch = pose({
    offset: [0, 9], head: [-4, 7, -6], eyes: [0.55, 0.54], brows: [1, -2, -2, 3],
    mouth: [20, 1, -3], leftLeg: [159, 378, 160, 426, -9],
    rightLeg: [244, 380, 236, 426, 4]
  });
  const step = (x, height, direction) => pose({
    offset: [x, height], head: [direction * 3, 0, direction * 7], body: direction * 5,
    leftArm: [126, 312, 126 + direction * 37, 362, 103 - direction * 35],
    rightArm: [277, 311, 266 - direction * 34, 358, 74 + direction * 32],
    leftLeg: [170 + direction * 18, 390, 164 + direction * 31, 429 + direction * 5, direction * 16],
    rightLeg: [230 - direction * 18, 388, 234 - direction * 31, 429 - direction * 5, -direction * 16]
  });
  const drawStart = 0.58;
  const drawDuration = 1.16;
  const target = [499, 206];
  const drawKeys = [[0, neutral], [0.33, pointReady], [drawStart, point],
    [drawStart + drawDuration, point], [2.04, pointReady], [2.40, neutral], [2.95, neutral]];
  const clips = {
    idle: {
      label: "Idle", description: "A quiet hold with a slow blink.",
      keys: [[0, neutral], [0.85, pose({ head: [0, -3, -2], offset: [0, -2] })],
        [1.14, neutral], [1.20, blink], [1.30, neutral], [2.3, neutral]]
    },
    enter: {
      label: "Walk in", description: "A quick walk in from the edge, followed by a settle.",
      keys: [[0, step(-460, -2, 1)], [0.24, step(-302, -4, -1)], [0.49, step(-165, -4, 1)],
        [0.72, step(-43, -5, -1)], [0.96, crouch], [1.19, neutral], [1.65, neutral]]
    },
    point: {
      label: "Point", description: "He looks toward the detail, then stretches an arm to point.",
      keys: [[0, neutral], [0.24, pointReady], [0.52, point], [1.71, point], [2.15, neutral]]
    },
    explain: {
      label: "Explain", description: "Two open-hand beats with a small nod.",
      keys: [[0, neutral], [0.34, explain], [0.63, explainBeat], [0.92, explain],
        [1.28, explainBeat], [1.74, explain], [2.20, neutral]]
    },
    think: {
      label: "Think", description: "A sideways look and a hand to the chin.",
      keys: [[0, neutral], [0.43, think], [1.08, { ...think, gaze: [5, -9] }],
        [1.62, think], [2.15, neutral]]
    },
    surprise: {
      label: "Surprised", description: "A quick recoil with wide eyes and hand-drawn reaction marks.",
      keys: [[0, neutral], [0.19, crouch], [0.38, surprise],
        [0.57, { ...surprise, offset: [0, -1], head: [0, -10, -1], rays: 0.85 }],
        [1.2, { ...surprise, offset: [0, 0], head: [1, -6, -2], rays: 0.5 }],
        [1.72, neutral]]
    },
    draw: {
      label: "Draw a circle", description: "The marker traces a real line around the blue dot.",
      keys: drawKeys, trace: circlePoint
    },
    arrow: {
      label: "Draw an arrow", description: "He draws an arrow toward the detail.",
      keys: drawKeys, trace: arrowPoint
    }
  };

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function interpolate(from, to, progress) {
    return from + (to - from) * progress;
  }

  function sample(keys, seconds, linear) {
    const next = keys.findIndex(([at]) => at > seconds);
    if (next === -1) return keys.at(-1)[1];
    if (next === 0) return keys[0][1];
    const [start, from] = keys[next - 1];
    const [end, to] = keys[next];
    const time = (seconds - start) / (end - start);
    const progress = linear ? time : time * time * (3 - 2 * time);
    return Object.fromEntries(Object.entries(from).map(([name, value]) => [
      name, Array.isArray(value)
        ? value.map((channel, i) => interpolate(channel, to[name][i], progress))
        : interpolate(value, to[name], progress)
    ]));
  }

  function make(name, attributes, parent) {
    const node = document.createElementNS(svgNS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    parent?.append(node);
    return node;
  }

  function stroke(parent, d, color, width, extra = {}) {
    return make("path", {
      d, fill: "none", stroke: color, "stroke-width": width,
      "stroke-linecap": "round", "stroke-linejoin": "round", ...extra
    }, parent);
  }

  function rotatePoint(x, y, degrees, [cx, cy]) {
    const angle = degrees * Math.PI / 180;
    const dx = x - cx;
    const dy = y - cy;
    return [cx + dx * Math.cos(angle) - dy * Math.sin(angle),
      cy + dx * Math.sin(angle) + dy * Math.cos(angle)];
  }

  // Deterministic ink hatching gives the outlines a drawn texture at any scale.
  function hatch(parent, clipId, [x, y, w, h], seed) {
    const marks = make("g", { "clip-path": `url(#${clipId})` }, parent);
    function random() {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    }
    for (let i = 0; i < 65; i += 1) {
      const px = x + random() * w;
      const py = y + random() * h;
      const length = 8 + random() * w * 0.21;
      const slope = -0.42 + random() * 1.03;
      stroke(marks, `M${px} ${py}q${length * 0.54} ${length * slope * .34} ${length} ${length * slope}`,
        i % 3 === 0 ? "#f7efdc" : "#847889", random() * 1.4 + .35,
        { opacity: random() * .26 + .13 });
    }
  }

  function circlePoint(progress) {
    const angle = -2.64 + progress * Math.PI * 2.08;
    const wobble = 1.8 * Math.sin(angle * 3) + 0.8 * Math.cos(angle * 5);
    return [target[0] + (57 + wobble) * Math.cos(angle), target[1] + (48 + wobble) * Math.sin(angle)];
  }

  function arrowPoint(progress) {
    const tip = [480, 224];
    const head = [453, 231];
    if (progress < .6) {
      const t = progress / .6;
      return [interpolate(390, tip[0], t), 276 - 52 * t * t - 5 * Math.sin(t * Math.PI)];
    }
    const corners = [[.6, tip], [.75, head], [.85, tip], [1, [473, 251]]];
    const next = corners.findIndex(([at]) => at >= progress);
    if (next < 1) return tip;
    const [start, from] = corners[next - 1];
    const [end, to] = corners[next];
    const t = (progress - start) / (end - start);
    return from.map((channel, i) => interpolate(channel, to[i], t));
  }

  function traceLine(trace, progress) {
    const samples = Math.max(1, Math.ceil(progress * 74));
    return Array.from({ length: samples + 1 }, (_, i) => {
      const [x, y] = trace(progress * i / samples);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ");
  }

  const liftTime = .28;

  function prepareDrawing(paths) {
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new Error("Add at least one SVG path.");
    }
    const layer = make("g", { "data-layer": "custom-ink", display: "none" });
    let end = drawStart;
    const strokes = paths.map((d, index) => {
      if (typeof d !== "string" || !/^\s*[Mm]/.test(d) || /[Mm]/.test(d.trim().slice(1))) {
        throw new Error(`Stroke ${index + 1} needs one SVG path starting with M or m.`);
      }
      const path = stroke(layer, d, blue, 4.6, { visibility: "hidden" });
      const length = path.getTotalLength();
      if (!Number.isFinite(length) || length <= 0) {
        throw new Error(`Stroke ${index + 1} needs a line or curve after its starting point.`);
      }
      const start = end + (index ? liftTime : 0);
      const span = Math.max(.24, length / 195);
      end = start + span;
      path.setAttribute("stroke-dasharray", `${length} ${length + 1}`);
      path.setAttribute("stroke-dashoffset", length);
      return { path, length, start, span, end };
    });
    return { layer, strokes, end, duration: end + .86 };
  }

  function penPosition(drawing, seconds) {
    const { strokes } = drawing;
    for (const { path, start, span, length } of strokes) {
      const distance = clamp((seconds - start) / span, 0, 1) * length;
      path.setAttribute("stroke-dashoffset", length - distance);
      path.setAttribute("visibility", distance > 0 ? "visible" : "hidden");
    }
    const next = strokes.findIndex(({ end }) => end >= seconds);
    const { path, start, span, length } = strokes.at(next);
    if (next > 0 && seconds < start) {
      const previous = strokes[next - 1];
      const from = previous.path.getPointAtLength(previous.length);
      const to = path.getPointAtLength(0);
      const t = clamp((seconds - previous.end) / liftTime, 0, 1);
      return [interpolate(from.x, to.x, t), interpolate(from.y, to.y, t) - 19 * Math.sin(Math.PI * t)];
    }
    const point = path.getPointAtLength(clamp((seconds - start) / span, 0, 1) * length);
    return [point.x, point.y];
  }

  function create(svg, initialPlacement = {}) {
    const prefix = `scribble-${++instance}`;
    let placement = { x: 0, y: 0, scale: 1, direction: 1, ...initialPlacement };
    const section = make("g", { "data-character": "Scribble" }, svg);
    const defs = make("defs", {}, section);
    const drawing = make("g", { "data-layer": "ink-on-paper" }, section);
    const line = stroke(drawing, "", blue, 4.6);
    const customDrawings = new Map();
    let visibleDrawing;
    const character = make("g", { "data-layer": "character" }, section);
    const legs = make("g", { "data-layer": "legs" }, character);
    const leftLeg = stroke(legs, "", ink, 7.2);
    const rightLeg = stroke(legs, "", ink, 7);
    const leftFoot = make("path", {
      d: "M2 -4C-8 -15 -23 -13 -29 -4Q-38 6 -26 9L0 8Q9 6 2 -4Z", fill: ink
    }, legs);
    const rightFoot = make("path", {
      d: "M-3 -3C0 -12 15 -12 25 -7Q37 0 28 8L0 9Q-9 7 -3 -3Z", fill: ink
    }, legs);

    const arms = make("g", { "data-layer": "arms" }, character);
    const sleeves = [stroke(arms, "", ink, 6.7), stroke(arms, "", ink, 7)];
    const fingers = {
      relaxed: "M-3 1Q0 -4 5 -6L15 -7Q20 -7 19 -4L10 1L20 4Q24 7 19 9L10 6L14 11Q14 15 10 14L4 9Q-2 10 -3 4Z",
      open: "M-3 0Q0 -4 5 -5L19 -12Q24 -14 24 -9L14 -2L27 -3Q33 -1 29 3L14 5L23 8Q28 12 22 14L10 9Q0 13 -3 6Z",
      point: "M-3 1Q0 -5 8 -7L32 -9Q39 -8 36 -4L17 0Q23 4 19 7L15 8Q18 12 13 13L8 13Q0 12 -3 6Z",
      pen: "M-3 0Q4 -8 13 -7Q22 -8 21 -2Q24 0 21 5Q20 12 11 12Q2 12 -3 6Z",
      chin: "M-3 0Q0 -6 6 -6L21 -9Q27 -9 26 -5L15 0Q21 0 21 4L16 10L6 12Q-2 11 -3 5Z"
    };
    const hands = sleeves.map(() => {
      const group = make("g", { "data-layer": "hand" }, arms);
      return { group, shape: make("path", { fill: ink }, group) };
    });
    const marker = make("g", { "data-layer": "marker" }, hands[1].group);
    make("rect", { x: 8, y: -6, width: 28, height: 9, rx: 2.6, fill: blue }, marker);
    make("path", { d: "M36 -6L42 -1.5L36 3Z", fill: ink }, marker);
    stroke(marker, "M17 -4H31", "#a5b8ee", 1.3);

    const body = make("g", { "data-layer": "torso" }, character);
    const bodyShape = "M190 246C204 239 218 251 220 270C224 291 252 312 256 333C261 359 235 373 210 373C188 374 160 361 153 344C142 324 168 305 175 285C179 272 179 255 190 246Z";
    const bodyClip = make("clipPath", { id: `${prefix}-body` }, defs);
    make("path", { d: bodyShape }, bodyClip);
    stroke(body, "M188 246C178 266 178 287 162 308C140 335 149 357 178 370M219 262C222 294 251 306 256 336C260 356 240 370 215 374", ink, 3);
    make("path", { d: bodyShape, fill: ink }, body);
    hatch(body, `${prefix}-body`, [146, 246, 113, 129], 3039);
    const bow = make("g", { "data-layer": "bow-tie" }, body);
    make("path", {
      d: "M193 259Q180 248 168 248L170 272Q180 275 194 266M206 258Q224 247 233 248L231 274Q221 276 205 267Z",
      fill: lime, stroke: ink, "stroke-width": 2.6, "stroke-linejoin": "round"
    }, bow);
    stroke(bow, "M174 252L188 260M229 253L212 260", "#e9f8a8", 2.1);
    make("rect", { x: 192, y: 255, width: 16, height: 15, rx: 6, fill: lime, stroke: ink, "stroke-width": 2 }, bow);

    const head = make("g", { "data-layer": "head" }, character);
    const silhouette = "M88 136C65 126 71 101 91 90C83 69 111 55 131 56C141 37 174 36 191 43C214 30 244 35 260 46C287 43 311 60 318 77C345 87 350 105 340 119C359 130 362 151 347 164C359 180 344 197 323 199C321 215 303 228 279 229C264 249 235 248 220 242C198 258 175 253 163 244C135 247 111 235 110 217C90 215 77 201 82 186C63 174 64 149 88 136Z";
    const headClip = make("clipPath", { id: `${prefix}-head` }, defs);
    make("path", { d: silhouette }, headClip);
    const loops = [
      "M151 69C103 73 63 117 76 140C89 160 127 137 141 121",
      "M209 57C184 26 125 48 95 73C73 93 80 103 117 95",
      "M254 56C281 28 327 56 332 75C342 102 297 113 288 107",
      "M307 91C338 75 365 109 354 130C344 150 312 154 301 151",
      "M336 131C373 139 367 182 339 192C310 201 300 185 303 177",
      "M326 176C357 204 308 237 271 234C247 234 248 216 272 214",
      "M274 220C254 251 218 261 196 241C186 232 194 224 214 221",
      "M191 234C155 263 112 237 106 215C103 198 126 196 142 195",
      "M130 211C102 228 70 200 80 179C85 167 102 167 113 171",
      "M98 178C75 183 56 160 67 144C74 132 102 123 121 130"
    ];
    loops.forEach((d, i) => stroke(head, d, ink, 2.1 + (i % 3) * 1.3));
    make("path", { d: silhouette, fill: ink }, head);
    hatch(head, `${prefix}-head`, [74, 35, 286, 216], 527);
    stroke(head, "M104 84Q137 51 174 54M224 47Q258 39 283 56M315 102Q339 108 342 127M102 191Q105 210 128 221",
      "#f7efdc", 1.7, { opacity: .63 });
    const face = make("g", { "data-layer": "face" }, head);
    const sockets = [
      { x: 163, y: 150, tilt: -11, d: "M-36 -12Q-4 -19 29 -14Q32 18 8 25Q-19 29 -31 10Z" },
      { x: 249, y: 133, tilt: -7, d: "M-34 -13Q-7 -21 28 -15Q33 16 9 25Q-18 31 -29 13Z" }
    ];
    const eyes = sockets.map(({ x, y, tilt, d }, i) => {
      const id = `${prefix}-eye-${i}`;
      const eyeClip = make("clipPath", { id }, defs);
      make("path", { d }, eyeClip);
      const eye = make("g", { transform: `translate(${x} ${y}) rotate(${tilt})` }, face);
      const lid = make("g", {}, eye);
      make("path", { d, fill: paperWhite }, lid);
      const cropped = make("g", { "clip-path": `url(#${id})` }, lid);
      const iris = make("ellipse", { rx: 13.5, ry: 22.5, fill: ink }, cropped);
      const brow = stroke(eye, "M-28 -26Q-8 -41 13 -32", paperWhite, 5.2);
      return { lid, iris, brow };
    });
    const mouth = make("path", { fill: paperWhite, stroke: paperWhite, "stroke-width": 3.8, "stroke-linejoin": "round" }, face);
    const rays = stroke(head, "M297 49l10 -18M316 57l17 -9M279 40l1 -20", ink, 4.8);
    // The chin gesture overlaps the face, so the leading hand sits above it.
    character.append(hands[1].group);
    const knuckles = stroke(hands[1].group, "M8 -3l9 -2M8 4l6 1", paperWhite, 1.5);

    function render(name, seconds) {
      const sketch = customDrawings.get(name);
      const clip = sketch ? clips.draw : clips[name];
      const end = sketch?.end ?? drawStart + drawDuration;
      const poseTime = sketch && seconds > drawStart
        ? drawStart + (seconds >= end ? drawDuration + seconds - end : 0)
        : seconds;
      const frame = sample(clip.keys, poseTime, name === "enter");
      const isDrawing = Boolean(clip.trace);
      const progress = clamp((seconds - drawStart) / drawDuration, 0, 1);
      let rightArm = frame.rightArm;
      let gaze = frame.gaze;

      if (visibleDrawing !== sketch) {
        visibleDrawing?.layer.setAttribute("display", "none");
        sketch?.layer.removeAttribute("display");
        visibleDrawing = sketch;
      }

      if (isDrawing) {
        const [tx, ty] = sketch ? penPosition(sketch, seconds) : clip.trace(progress);
        const angle = sketch ? -12 : -11 + 6 * Math.sin(progress * Math.PI * 2);
        const [tipX, tipY] = rotatePoint(42, -1.5, angle, [0, 0]);
        const reach = [289 + (tx - 445) * .24, 278 + (ty - 200) * .23,
          tx - tipX - frame.offset[0], ty - tipY - frame.offset[1], angle];
        const blend = Math.min(clamp(seconds / drawStart, 0, 1), clamp((end + .5 - seconds) / .5, 0, 1));
        rightArm = rightArm.map((value, i) => interpolate(value, reach[i], blend));
        if (sketch) gaze = [interpolate(gaze[0], 14, blend), interpolate(gaze[1], clamp((ty - 166) / 7, -13, 14), blend)];
      }

      const { x, y, scale, direction } = placement;
      section.setAttribute("transform", `translate(${x} ${y}) scale(${scale * direction} ${scale})`);
      character.setAttribute("transform", `translate(${frame.offset.join(" ")})`);
      drawing.setAttribute("visibility", isDrawing && !sketch && progress > 0 ? "visible" : "hidden");
      if (isDrawing && !sketch) line.setAttribute("d", traceLine(clip.trace, progress));
      body.setAttribute("transform", `rotate(${frame.body} 201 272)`);
      const [hx, hy, tilt] = frame.head;
      head.setAttribute("transform", `translate(${hx} ${hy}) rotate(${tilt} 202 241)`);
      eyes.forEach(({ lid, iris, brow }, i) => {
        lid.setAttribute("transform", `scale(1 ${frame.eyes[i]})`);
        iris.setAttribute("cx", gaze[0]);
        iris.setAttribute("cy", gaze[1]);
        brow.setAttribute("transform", `translate(0 ${frame.brows[i]}) rotate(${frame.brows[i + 2]} -7 -32)`);
      });
      const [width, opening, lift] = frame.mouth;
      const mx = 216;
      const my = 197;
      mouth.setAttribute("d", `M${mx - width} ${my}Q${mx} ${my - opening * .72 + 8} ${mx + width} ${my + lift}Q${mx + 3} ${my + opening + 14} ${mx - width} ${my}Z`);
      rays.setAttribute("opacity", frame.rays);
      const handsOpen = ["explain", "surprise"].includes(name) &&
        seconds >= clip.keys[1][0] * .7 && seconds < clip.keys.at(-1)[0] - .25;
      const penHeld = isDrawing && seconds >= .22 && seconds <= end + .51;
      const pointing = name === "point" && seconds >= .32 && seconds <= 1.88;
      const chinTouch = name === "think" && seconds >= .32 && seconds < 1.88;
      const leadingGrip = penHeld ? "pen" : pointing ? "point" : chinTouch ? "chin" : null;
      marker.setAttribute("visibility", penHeld ? "visible" : "hidden");
      knuckles.setAttribute("visibility", chinTouch ? "visible" : "hidden");
      [frame.leftArm, rightArm].forEach(([ex, ey, wx, wy, angle], i) => {
        const [sx, sy] = rotatePoint(i === 0 ? 174 : 222, 275, frame.body, [201, 272]);
        sleeves[i].setAttribute("d", `M${sx} ${sy}Q${ex} ${ey} ${wx} ${wy}`);
        hands[i].group.setAttribute("transform", `translate(${wx} ${wy}) rotate(${angle})`);
        const grip = (i === 1 && leadingGrip) || (handsOpen ? "open" : "relaxed");
        hands[i].shape.setAttribute("d", fingers[grip]);
      });
      [[frame.leftLeg, leftLeg, leftFoot], [frame.rightLeg, rightLeg, rightFoot]].forEach(
        ([[kx, ky, ax, ay, angle], leg, foot], i) => {
          const [sx, sy] = rotatePoint(i === 0 ? 184 : 222, 345, frame.body, [201, 272]);
          leg.setAttribute("d", `M${sx} ${sy}Q${kx} ${ky} ${ax} ${ay}`);
          foot.setAttribute("transform", `translate(${ax} ${ay}) rotate(${angle})`);
        }
      );
    }

    render("idle", 0);
    return {
      at: render,
      addDrawing(name, paths) {
        if (!name || Object.hasOwn(clips, name)) throw new Error("Use a new name for the drawing.");
        const next = prepareDrawing(paths);
        customDrawings.get(name)?.layer.remove();
        section.insertBefore(next.layer, character);
        customDrawings.set(name, next);
        return next.duration;
      },
      duration(name) { return customDrawings.get(name)?.duration ?? clips[name].keys.at(-1)[0]; },
      place(next) { placement = { ...placement, ...next }; },
      remove() { section.remove(); },
      poseSVG() {
        const box = character.getBBox();
        const width = Math.ceil(box.width + 32);
        const height = Math.ceil(box.height + 32);
        const documentSVG = make("svg", {
          viewBox: `${box.x - 16} ${box.y - 16} ${width} ${height}`, width, height
        });
        documentSVG.append(defs.cloneNode(true));
        const copy = character.cloneNode(true);
        copy.removeAttribute("transform");
        if (placement.direction < 0) {
          copy.setAttribute("transform", `translate(${2 * box.x + box.width} 0) scale(-1 1)`);
        }
        documentSVG.append(copy);
        return new XMLSerializer().serializeToString(documentSVG);
      }
    };
  }

  function track(timeline, rig, name, at = 0, placement = {}) {
    const clock = { time: 0 };
    const duration = rig.duration(name);
    const update = () => { rig.place(placement); rig.at(name, clock.time); };
    timeline.to(clock, { time: duration, duration, ease: "none", onStart: update, onUpdate: update }, at);
    return duration;
  }

  window.Scribble = Object.freeze({
    create,
    track,
    target: Object.freeze(target),
    motions: Object.freeze(Object.fromEntries(Object.entries(clips).map(([key, clip]) => [
      key, Object.freeze({
        label: clip.label, description: clip.description, duration: clip.keys.at(-1)[0],
        usesTarget: key === "point" || Boolean(clip.trace)
      })
    ])))
  });
})();
