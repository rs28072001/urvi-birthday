/*

The Kawaii Spatial Diorama, 3D engine.
   
Needs js/vendor/three-diorama.min.js (window.THREE) and js/app.js (window.GM635). 
   

*/

(function () {
'use strict';
const Bus = window.GM635;
const THREE = window.THREE;
if (!Bus) return;
if (!THREE || !THREE.WebGLRenderer) { Bus.fail('three-missing'); return; }
const { OrbitControls, RoundedBoxGeometry } = THREE;



function hasWebGL(){
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e) { return false; }
}
if (!hasWebGL()) Bus.fail('webgl');
else {
  try { boot(); }
  catch (err) { console.error(err); Bus.fail('boot'); }
}

function boot(){
  const V3 = THREE.Vector3;
  const stage = document.getElementById('stage');
  const reduced = () => Bus.reduced;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  /* Candy palette: the brief's Blush, Mint and Lavender pushed brighter so they survive
     3D shading, plus butter and sky accents for small props. Brief originals, for reference:
     Blush #FFD1DC, Mint #C8E6C9, Lavender #E6E6FA */
  const COL = {
    white: 0xFFFFFF, ink: 0x1F1B24,
    blush: 0xFFC3D3, mint: 0xB4E8BD, lav: 0xDEDAFB,
    blushDeep: 0xFF9DBD, mintDeep: 0x7FD498, lavDeep: 0xB9B1F0,
    blushSoft: 0xFFE3EB, lavSoft: 0xF0EEFF,
    butter: 0xFFE27A, sky: 0x9FD8FF
  };

  /* ---------- Renderer ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0xffffff, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.05, 260);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xFFE3EB, 1.4);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xFFFDF8, 1.35);
  key.position.set(6, 12, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 32 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025; key.shadow.radius = 5;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xF1EEFF, 0.55);
  fill.position.set(-5, 4, 9);
  scene.add(fill);

  /* ---------- Primitive helpers ---------- */
  const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, metalness: 0 }, o || {}));
  const shade = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  const rbox = (w, h, d, r, color, o) => shade(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(r, Math.min(w, h, d) / 2 - 0.002)), mat(color, o)));
  const sph = (r, color, o, seg = 32) => shade(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), mat(color, o)));
  const cyl = (rt, rb, h, color, o, seg = 32) => shade(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, o)));
  const cap = (r, len, color, o) => shade(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 20), mat(color, o)));
  const put = (m, x, y, z, parent) => { m.position.set(x, y, z); (parent || scene).add(m); return m; };

  function radialTexture(stops, size = 256){
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(s => grd.addColorStop(s[0], s[1]));
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const shadowTex = radialTexture([[0, 'rgba(78,66,128,0.34)'], [0.45, 'rgba(78,66,128,0.13)'], [1, 'rgba(78,66,128,0)']]);
  /* floating shadow: lavender core with a blush halo, never grey on the white page */
  const floatTex = radialTexture([[0, 'rgba(126,112,196,0.30)'], [0.42, 'rgba(196,150,196,0.14)'], [0.75, 'rgba(255,209,220,0.06)'], [1, 'rgba(255,209,220,0)']]);
  const softTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']], 64);

  /* ---------- Room shell ---------- */
  const FLOOR = 0.06;
  const floatShadow = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ map: floatTex, transparent: true, depthWrite: false }));
  floatShadow.renderOrder = 0;
  floatShadow.rotation.x = -Math.PI / 2; floatShadow.position.y = -1.6;
  scene.add(floatShadow);

  /* cutting-mat dot grid on the white page, fading out toward the edges */
  const gridMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uFade: { value: 1 },
      uDot: { value: new THREE.Vector3(0.725, 0.702, 0.910) },   /* #B9B3E8 */
      uMark: { value: new THREE.Vector3(0.957, 0.655, 0.737) }   /* #F4A7BC */
    },
    vertexShader: `
      varying vec2 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uFade; uniform vec3 uDot; uniform vec3 uMark;
      varying vec2 vW;
      void main(){
        float fade = 1.0 - smoothstep(8.0, 25.0, length(vW));
        vec2 g = vW / 0.7;
        vec2 id = floor(g + 0.5);
        float d = length(fract(g + 0.5) - 0.5);
        bool major = mod(id.x, 5.0) == 0.0 && mod(id.y, 5.0) == 0.0;
        float r = major ? 0.11 : 0.065;
        float aa = fwidth(d) * 1.2;
        float dotA = 1.0 - smoothstep(r - aa, r + aa, d);
        float a = dotA * fade * uFade * (major ? 0.75 : 0.55);
        if (a < 0.002) discard;
        gl_FragColor = vec4(major ? uMark : uDot, a);
      }`
  });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), gridMat);
  grid.rotation.x = -Math.PI / 2; grid.position.y = -1.66; grid.renderOrder = -1;
  scene.add(grid);

  /* a few pastel clouds and stars drifting outside the room */
  const ambient = [];
  function cloud(x, y, z, s, color){
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
    [[0, 0, 0, 0.55], [0.58, -0.08, 0.02, 0.42], [-0.58, -0.1, 0.04, 0.4], [0.2, 0.34, 0.02, 0.4], [-0.24, 0.26, -0.04, 0.34]].forEach(b => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(b[3], 24, 18), mat(color, { emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.95 }));
      m.position.set(b[0], b[1], b[2]); m.scale.y = 0.86; g.add(m);
    });
    scene.add(g); ambient.push({ g, base: g.position.clone(), s, seed: Math.random() * 6, spin: 0 });
  }
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.19 : 0.45; i ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  starShape.closePath();
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3 });
  starGeo.center();
  function starObj(x, y, z, s, color){
    const m = new THREE.Mesh(starGeo, mat(color, { emissive: color, emissiveIntensity: 0.2, roughness: 0.55 }));
    m.position.set(x, y, z); m.scale.setScalar(s); scene.add(m);
    ambient.push({ g: m, base: m.position.clone(), s, seed: Math.random() * 6, spin: 0.5 });
  }
  /* placed in the page margins of the default isometric view */
  cloud(-1.6, 0.2, 7.4, 1.15, 0xEAE7FF);
  cloud(6.4, 3.7, -4.6, 1.0, 0xFFE8EF);
  cloud(8.2, 0.25, -1.55, 0.75, 0xE4F7E8);
  starObj(7.0, 2.2, -2.6, 0.75, COL.butter);
  starObj(-2.5, 1.8, 7.2, 0.55, COL.blushDeep);
  let amb = 1;

  put(rbox(10.8, 0.9, 10.8, 0.32, 0xC6C0F2), 0, -0.45, 0);
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    put(rbox(2.07, 0.12, 2.07, 0.05, (i + j) % 2 ? COL.lavSoft : 0xFFF5F8), i * 2.1, 0, j * 2.1);
  }
  const floorPick = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 10.5), new THREE.MeshBasicMaterial({ visible: false }));
  floorPick.rotation.x = -Math.PI / 2; floorPick.position.y = FLOOR; floorPick.userData.floor = true;
  scene.add(floorPick);

  put(rbox(10.8, 5.2, 0.4, 0.18, COL.blush), 0, 2.6, -5.2);
  put(rbox(0.4, 5.2, 10.8, 0.18, COL.mint), -5.2, 2.6, 0);
  put(rbox(10.4, 0.3, 0.14, 0.06, COL.white), 0, 0.2, -4.96);
  put(rbox(0.14, 0.3, 10.4, 0.06, COL.white), -4.96, 0.2, 0);

  /* bead garland on the back wall */
  const beadCols = [COL.lavDeep, COL.butter, COL.mintDeep, COL.blushDeep, COL.sky, COL.white];
  for (let i = 0; i < 17; i++) {
    const x = -4.4 + i * 0.55, y = 4.55 - 0.32 * Math.sin((i / 16) * Math.PI);
    put(sph(0.1, beadCols[i % 6], null, 16), x, y, -4.92);
  }
  /* window on the left wall */
  put(rbox(0.16, 2.0, 2.4, 0.1, COL.white), -4.94, 2.95, -2.3);
  put(rbox(0.08, 1.7, 2.1, 0.04, COL.sky, { emissive: 0xCFEAFF, emissiveIntensity: 0.55 }), -4.88, 2.95, -2.3);
  put(rbox(0.1, 1.7, 0.08, 0.03, COL.white), -4.84, 2.95, -2.3);
  put(rbox(0.1, 0.08, 2.1, 0.03, COL.white), -4.84, 2.95, -2.3);
  [[-2.9, 3.35, 0.16], [-2.72, 3.4, 0.2], [-2.55, 3.33, 0.14], [-1.8, 2.55, 0.12], [-1.66, 2.6, 0.15]].forEach(c => {
    const m = put(sph(c[2], COL.white, { emissive: 0xffffff, emissiveIntensity: 0.2 }, 16), -4.83, c[1], c[0]);
    m.scale.x = 0.3; m.castShadow = false;
  });
  /* shelf above the TV */
  put(rbox(2.3, 0.12, 0.5, 0.05, COL.white), -2.0, 3.75, -4.75);
  [[-2.8, 0.42, COL.mintDeep], [-2.6, 0.5, COL.blushDeep], [-2.4, 0.38, COL.sky], [-2.22, 0.3, COL.butter]].forEach(b => put(rbox(0.16, b[1], 0.36, 0.04, b[2]), b[0], 3.81 + b[1] / 2, -4.75));
  put(sph(0.2, COL.mintDeep, null, 20), -1.3, 4.0, -4.75);
  put(cyl(0.15, 0.12, 0.2, COL.blush, null, 20), -1.3, 3.9, -4.75);

  /* rug */
  put(cyl(2.3, 2.3, 0.02, COL.blush, null, 64), 0.2, 0.07, 0.5).castShadow = false;
  const rugEdge = put(new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.05, 10, 80), mat(COL.mint)), 0.2, 0.08, 0.5);
  rugEdge.rotation.x = Math.PI / 2; rugEdge.receiveShadow = true;

  /* plant: also the secret sprout, which grows in three stages and blooms */
  const plant = new THREE.Group(); plant.position.set(-3.9, 0, 3.8); scene.add(plant);
  put(cyl(0.38, 0.3, 0.62, COL.blush), 0, 0.37, 0, plant);
  put(cyl(0.34, 0.34, 0.04, 0x8f7fa6, null, 24), 0, 0.67, 0, plant);
  const leafG = new THREE.Group(); leafG.position.y = 0.7; plant.add(leafG);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const leaf = put(sph(0.2, COL.mintDeep, null, 20), Math.cos(a) * 0.18, 0.32 + (i % 2) * 0.12, Math.sin(a) * 0.18, leafG);
    leaf.scale.set(0.7, 1.6, 0.7); leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
  }
  const stem = put(cyl(0.032, 0.04, 1, COL.mintDeep, null, 12), 0, 0.7, 0, plant);
  const flowerHead = new THREE.Group(); plant.add(flowerHead);
  flowerHead.rotation.set(0.35, Math.PI / 4, 0);
  const bud = put(sph(0.13, COL.butter, { emissive: 0xFFE27A, emissiveIntensity: 0.25 }, 16), 0, 0, 0, flowerHead);
  const petalRing = new THREE.Group(); flowerHead.add(petalRing);
  const petalCols = [COL.blush, COL.blushDeep, COL.blush, COL.lavDeep, COL.blush, COL.blushDeep, COL.blush, COL.sky];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, piv = new THREE.Group(); piv.rotation.z = a; petalRing.add(piv);
    const pt = put(sph(0.16, petalCols[i], { roughness: 0.6 }, 16), 0, 0.2, -0.02, piv); pt.scale.set(0.62, 1, 0.3);
  }
  const sprout = { g: { x: 0, v: 0 }, target: 0, stage: 0, bloom: { x: 0, v: 0, target: 0 } };
  function poseSprout(){
    const g = Math.max(0, sprout.g.x), b = Math.max(0, sprout.bloom.x);
    const H = 0.8 + g * 0.95;
    stem.scale.y = H; stem.position.y = 0.7 + H / 2;
    flowerHead.position.y = 0.7 + H;
    leafG.scale.set(1 + g * 0.3, 1 + g * 0.45, 1 + g * 0.3);
    bud.scale.setScalar(1 + g * 0.35 + b * 0.25);
    petalRing.scale.setScalar(Math.max(0.001, b));
    petalRing.visible = b > 0.002;
  }
  poseSprout();

  /* bean bag */
  const bean = put(sph(0.78, COL.lavDeep), -3.4, 0.46, -0.9); bean.scale.set(1, 0.56, 1);
  put(sph(0.5, COL.lav), -3.5, 0.62, -0.95).scale.set(1, 0.35, 1);

  /* ---------- Section objects ---------- */
  const sections = {};
  function makeSection(id, group, anchor){
    group.userData.section = id;
    group.userData.anchor = anchor;
    group.userData.hover = { x: 0, v: 0, target: 0 };
    group.userData.mats = [];
    group.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) group.userData.mats.push(o.material); });
    group.userData.baseScale = group.scale.clone();
    sections[id] = group;
  }

  /* 01 TV */
  const tv = new THREE.Group(); tv.position.set(-2.0, FLOOR, -4.1); scene.add(tv);
  put(rbox(2.3, 0.72, 1.05, 0.22, COL.lavDeep), 0, 0.46, 0, tv);
  [[-0.95, -0.38], [0.95, -0.38], [-0.95, 0.38], [0.95, 0.38]].forEach(p => put(cyl(0.06, 0.05, 0.12, COL.white, null, 12), p[0], 0.06, p[1], tv));
  put(rbox(0.5, 0.08, 0.04, 0.02, COL.white), -0.5, 0.46, 0.53, tv);
  put(rbox(0.5, 0.08, 0.04, 0.02, COL.white), 0.5, 0.46, 0.53, tv);
  put(rbox(2.0, 1.5, 0.95, 0.3, COL.blush), 0, 1.58, 0, tv);
  put(rbox(1.68, 1.18, 0.1, 0.12, COL.white), 0, 1.64, 0.44, tv);
  put(sph(0.05, COL.mintDeep, null, 12), -0.75, 0.93, 0.47, tv);
  put(sph(0.05, COL.lavDeep, null, 12), -0.6, 0.93, 0.47, tv);
  [[-0.3, 0.45, COL.mintDeep], [0.3, -0.45, COL.lavDeep]].forEach(a => {
    const piv = new THREE.Group(); piv.position.set(a[0], 2.3, 0); piv.rotation.z = a[1]; tv.add(piv);
    put(cyl(0.025, 0.025, 0.8, COL.ink, null, 8), 0, 0.4, 0, piv);
    put(sph(0.09, a[2], { emissive: a[2], emissiveIntensity: 0.4 }, 16), 0, 0.82, 0, piv);
  });
  /* the screen: an animated canvas */
  const SCW = 768, SCH = 522;
  const scCanvas = document.createElement('canvas'); scCanvas.width = SCW; scCanvas.height = SCH;
  const sg = scCanvas.getContext('2d');
  const screenTex = new THREE.CanvasTexture(scCanvas); screenTex.colorSpace = THREE.SRGBColorSpace; screenTex.anisotropy = 4;
  const screen = put(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.02), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })), 0, 1.64, 0.495, tv);
  const tvGlow = new THREE.PointLight(0xFFD1DC, 2.4, 5, 1.6); tvGlow.position.set(0, 1.64, 1.3); tv.add(tvGlow);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xFFC2D2, transparent: true, opacity: 0.55, depthWrite: false }));
  halo.scale.set(4.2, 3.4, 1); halo.position.set(0, 1.64, -0.6); tv.add(halo);
  function star(x, y, r, a){
    sg.save(); sg.translate(x, y); sg.globalAlpha = a; sg.fillStyle = '#ffffff'; sg.beginPath();
    for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.28 : r; const an = i * Math.PI / 4; sg.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
    sg.closePath(); sg.fill(); sg.restore();
  }
  function drawScreen(t){
    const grd = sg.createLinearGradient(0, 0, SCW, SCH);
    grd.addColorStop(0, '#DCD7FF'); grd.addColorStop(0.5, '#FFBDD0'); grd.addColorStop(0.85, '#FFE9A8'); grd.addColorStop(1, '#AEEBB8');
    sg.globalAlpha = 1; sg.fillStyle = grd; sg.fillRect(0, 0, SCW, SCH);
    const still = reduced();
    for (let i = 0; i < 16; i++) {
      const x = (i * 131) % SCW + (still ? 0 : Math.sin(t * 0.4 + i) * 8);
      const y = (i * 79 + 40) % SCH + (still ? 0 : Math.cos(t * 0.3 + i * 2) * 6);
      star(x, y, 7 + (i % 3) * 4, still ? 0.7 : 0.45 + 0.45 * Math.abs(Math.sin(t * 1.3 + i)));
    }
    const cx = SCW * 0.7, cy = SCH * 0.5;
    sg.globalAlpha = 0.6; sg.fillStyle = '#ffffff';
    sg.beginPath(); sg.arc(cx, cy, 158, 0, Math.PI * 2); sg.fill();
    sg.globalAlpha = 1;
    const blink = !still && (t % 3.7) < 0.13 ? 0.12 : 1;
    sg.fillStyle = '#1F1B24';
    [-56, 56].forEach(dx => { sg.beginPath(); sg.ellipse(cx + dx, cy - 14, 17, 24 * blink, 0, 0, Math.PI * 2); sg.fill(); });
    if (blink > 0.5) { sg.fillStyle = '#ffffff'; [-56, 56].forEach(dx => { sg.beginPath(); sg.arc(cx + dx + 6, cy - 24, 6, 0, Math.PI * 2); sg.fill(); }); }
    sg.fillStyle = '#FF8FB3';
    [-100, 100].forEach(dx => { sg.beginPath(); sg.ellipse(cx + dx, cy + 26, 26, 15, 0, 0, Math.PI * 2); sg.fill(); });
    sg.strokeStyle = '#1F1B24'; sg.lineWidth = 7; sg.lineCap = 'round'; sg.lineJoin = 'round';
    sg.beginPath(); sg.moveTo(cx - 24, cy + 26); sg.quadraticCurveTo(cx - 12, cy + 44, cx, cy + 28); sg.quadraticCurveTo(cx + 12, cy + 44, cx + 24, cy + 26); sg.stroke();
    sg.fillStyle = '#1F1B24'; sg.beginPath(); sg.roundRect(34, 30, 104, 40, 20); sg.fill();
    sg.fillStyle = '#ffffff'; sg.font = '800 22px Nunito, Quicksand, sans-serif'; sg.textBaseline = 'middle'; sg.fillText('CH 01', 52, 51);
    sg.fillStyle = 'rgba(255,255,255,0.07)';
    for (let y = 0; y < SCH; y += 5) sg.fillRect(0, y, SCW, 2);
    const vg = sg.createRadialGradient(SCW / 2, SCH / 2, SCH * 0.3, SCW / 2, SCH / 2, SCW * 0.62);
    vg.addColorStop(0, 'rgba(255,255,255,0)'); vg.addColorStop(1, 'rgba(196,191,239,0.35)');
    sg.fillStyle = vg; sg.fillRect(0, 0, SCW, SCH);
    screenTex.needsUpdate = true;
  }
  drawScreen(0);
  makeSection('hero', tv, new V3(0, 2.72, 0.3));

  /* 02 Floating frame with the ripple plane */
  const frame = new THREE.Group(); frame.position.set(-4.3, 2.75, 1.55); frame.rotation.y = Math.PI / 2; scene.add(frame);
  put(rbox(2.5, 1.9, 0.18, 0.14, COL.lavDeep), 0, 0, 0, frame);
  put(rbox(2.28, 1.68, 0.2, 0.1, COL.white), 0, 0, 0.01, frame);
  put(sph(0.11, COL.blushDeep, null, 16), 0, 1.0, 0.1, frame);
  [-1, 1].forEach(s => { const l = put(sph(0.16, COL.blushDeep, null, 16), s * 0.2, 1.0, 0.08, frame); l.scale.set(1.35, 0.8, 0.55); l.rotation.z = s * 0.3; });
  const PW = 2.0, PH = 1.4;
  const rippleU = {
    uTime: { value: 0 }, uStart: { value: -10 }, uOrigin: { value: new THREE.Vector2(0.5, 0.5) },
    uAmp: { value: 0.1 }, uIdle: { value: 1 },
    uTexA: { value: null }, uTexB: { value: null }, uHasA: { value: 0 }, uHasB: { value: 0 },
    uCoverA: { value: new THREE.Vector2(1, 1) }, uCoverB: { value: new THREE.Vector2(1, 1) }, uMix: { value: 0 }, uWipe: { value: new THREE.Vector2(0.5, 0.5) }
  };
  const rippleMat = new THREE.ShaderMaterial({
    uniforms: rippleU,
    vertexShader: `
      uniform float uTime; uniform float uStart; uniform vec2 uOrigin; uniform float uAmp; uniform float uIdle;
      varying vec2 vUv; varying float vWave;
      void main(){
        vUv = uv;
        vec3 p = position;
        float t = max(uTime - uStart, 0.0);
        float d = length((uv - uOrigin) * vec2(${(PW / PH).toFixed(3)}, 1.0));
        float front = t * 0.55;
        float env = exp(-t * 1.2) * (1.0 - smoothstep(front, front + 0.2, d));
        float w = sin(d * 30.0 - t * 16.0) * env * exp(-d * 1.6);
        float idle = sin(uv.x * 5.0 + uTime * 1.3) * sin(uv.y * 4.0 + uTime * 0.9) * uIdle;
        p.z += w * uAmp + (idle + 1.0) * 0.018;
        vWave = w + idle * 0.25;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uTexA; uniform sampler2D uTexB; uniform float uHasA; uniform float uHasB;
      uniform vec2 uCoverA; uniform vec2 uCoverB; uniform float uMix; uniform vec2 uOrigin; uniform vec2 uWipe;
      varying vec2 vUv; varying float vWave;
      vec3 pastel(vec2 uv){
        vec3 a = vec3(0.902, 0.902, 0.980), b = vec3(1.0, 0.820, 0.863), c = vec3(0.784, 0.902, 0.788);
        vec3 col = mix(a, b, smoothstep(0.0, 0.8, uv.x + uv.y * 0.3));
        return mix(col, c, smoothstep(0.6, 1.2, uv.y + uv.x * 0.25));
      }
      vec3 cover(sampler2D t, vec2 uv, vec2 s){ return texture2D(t, (uv - 0.5) * s + 0.5).rgb; }
      void main(){
        vec2 dir = normalize(vUv - uOrigin + 1e-5);
        vec2 uv = clamp(vUv + dir * vWave * 0.022, 0.001, 0.999);
        vec3 A = mix(pastel(uv), cover(uTexA, uv, uCoverA), uHasA);
        vec3 B = mix(pastel(uv), cover(uTexB, uv, uCoverB), uHasB);
        float d = length((vUv - uWipe) * vec2(${(PW / PH).toFixed(3)}, 1.0));
        float r = uMix * 1.9;
        vec3 col = mix(B, A, smoothstep(r - 0.22, r, d));
        col += vWave * 0.2;
        col = mix(col, vec3(1.0, 0.82, 0.86), 0.05);
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const picture = put(new THREE.Mesh(new THREE.PlaneGeometry(PW, PH, 110, 77), rippleMat), 0, 0, 0.24, frame);
  makeSection('gallery', frame, new V3(0, 1.3, 0));

  /* 03 Cabinet with four drawers */
  const cab = new THREE.Group(); cab.position.set(2.3, FLOOR, -4.2); scene.add(cab);
  put(rbox(2.3, 2.4, 1.2, 0.2, COL.mint), 0, 1.3, 0, cab);
  [[-0.95, -0.4], [0.95, -0.4], [-0.95, 0.4], [0.95, 0.4]].forEach(p => put(sph(0.08, COL.white, null, 12), p[0], 0.07, p[1], cab));
  const drawerCols = [COL.blush, COL.lav, COL.white, COL.blush];
  const drawers = drawerCols.map((c, i) => {
    const g = new THREE.Group(); g.position.set(0, 2.12 - i * 0.54, 0.52); cab.add(g);
    put(rbox(1.8, 0.38, 0.9, 0.05, COL.lavSoft), 0, -0.02, -0.42, g);
    put(sph(0.1, [COL.butter, COL.mintDeep, COL.sky, COL.blushDeep][i], { emissive: 0xffffff, emissiveIntensity: 0.1 }, 16), -0.4 + i * 0.25, 0.12, -0.15, g);
    put(rbox(1.96, 0.46, 0.14, 0.08, c), 0, 0, 0.08, g);
    put(sph(0.07, COL.white, null, 16), 0, 0, 0.18, g);
    return { g, out: { x: 0, v: 0 }, target: 0 };
  });
  put(cyl(0.22, 0.22, 0.38, COL.sky, null, 24), -0.6, 2.69, 0, cab);
  put(sph(0.22, COL.blushDeep, null, 24), -0.6, 2.88, 0, cab).scale.y = 0.45;
  put(cyl(0.05, 0.14, 0.26, COL.white, null, 16), 0.55, 2.63, 0, cab);
  put(sph(0.26, COL.butter, { emissive: 0xFFE27A, emissiveIntensity: 0.6 }, 24), 0.55, 2.95, 0, cab);
  makeSection('cabinet', cab, new V3(0, 3.35, 0.3));

  /* 04 Mochi mailbox */
  const mail = new THREE.Group(); mail.position.set(3.75, FLOOR, 2.9); mail.rotation.y = Math.PI / 4; scene.add(mail);
  put(cyl(0.34, 0.4, 0.12, COL.butter), 0, 0.06, 0, mail);
  put(cyl(0.09, 0.09, 1.1, COL.lavDeep, null, 16), 0, 0.66, 0, mail);
  put(rbox(1.0, 0.95, 1.2, 0.42, COL.blush), 0, 1.62, 0, mail);
  put(rbox(0.5, 0.05, 0.1, 0.025, COL.ink), 0, 2.075, 0.1, mail);
  [-0.18, 0.18].forEach(x => put(sph(0.05, COL.ink, null, 12), x, 1.6, 0.6, mail).scale.z = 0.5);
  [-0.3, 0.3].forEach(x => { const c = put(sph(0.07, COL.blushDeep, null, 12), x, 1.51, 0.57, mail); c.scale.set(1, 0.6, 0.4); });
  const mouth = put(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI), mat(COL.ink)), 0, 1.53, 0.6, mail);
  mouth.rotation.z = Math.PI;
  const flag = new THREE.Group(); flag.position.set(0.53, 1.5, 0.15); mail.add(flag);
  put(rbox(0.05, 0.62, 0.05, 0.02, COL.white), 0, 0.31, 0, flag);
  put(rbox(0.04, 0.24, 0.34, 0.04, COL.mintDeep), 0, 0.5, -0.17, flag);
  const flagS = { x: -1.45, v: 0, target: -1.45 };
  flag.rotation.x = flagS.x;
  makeSection('mail', mail, new V3(0, 2.35, 0));

  /* ---------- Mochi the bunny ---------- */
  const bunny = new THREE.Group(); scene.add(bunny);
  const bob = new THREE.Group(); bunny.add(bob);
  const tilt = new THREE.Group(); bob.add(tilt);
  const W = COL.white;
  const bodyM = put(sph(0.42, W), 0, 0.44, 0, tilt); bodyM.scale.set(1, 0.9, 0.95);
  put(new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.055, 10, 32), mat(COL.mint)), 0, 0.74, 0, tilt).rotation.x = Math.PI / 2;
  const head = put(sph(0.38, W), 0, 1.02, 0, tilt); head.scale.set(1.08, 0.94, 1);
  const ears = [-1, 1].map(s => {
    const piv = new THREE.Group(); piv.position.set(s * 0.15, 1.3, -0.02); tilt.add(piv);
    const e = put(cap(0.1, 0.42, W), 0, 0.3, 0, piv); e.rotation.z = -s * 0.12;
    const inner = put(cap(0.055, 0.32, COL.blush), 0, 0.3, 0.06, piv); inner.rotation.z = -s * 0.12; inner.scale.z = 0.5;
    piv.userData.side = s; return piv;
  });
  const eyes = [-1, 1].map(s => {
    const g = new THREE.Group(); g.position.set(s * 0.13, 1.04, 0.33); tilt.add(g);
    put(sph(0.055, COL.ink, { roughness: 0.3 }, 16), 0, 0, 0, g).scale.z = 0.6;
    put(sph(0.018, W, { emissive: 0xffffff, emissiveIntensity: 0.6 }, 8), s * 0.012 + 0.015, 0.02, 0.03, g);
    return g;
  });
  [-1, 1].forEach(s => { const c = put(sph(0.07, COL.blushDeep, null, 12), s * 0.23, 0.93, 0.3, tilt); c.scale.set(1, 0.6, 0.4); });
  put(sph(0.028, COL.blushDeep, null, 10), 0, 0.97, 0.375, tilt);
  [-1, 1].forEach(s => { const m = put(new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.008, 6, 12, Math.PI), mat(COL.ink)), s * 0.022, 0.925, 0.365, tilt); m.rotation.z = Math.PI; });
  [-1, 1].forEach(s => put(sph(0.1, W, null, 16), s * 0.37, 0.5, 0.12, tilt));
  put(sph(0.12, COL.blush, null, 16), 0, 0.36, -0.4, tilt);
  const feet = [-1, 1].map(s => { const f = put(sph(0.11, W, null, 16), s * 0.17, 0.06, 0.1, bunny); f.scale.set(1, 0.55, 1.4); return f; });
  const bunShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  bunShadow.rotation.x = -Math.PI / 2; bunShadow.renderOrder = 1; scene.add(bunShadow);
  bunny.traverse(o => { o.userData.bunny = true; });

  const bun = {
    pos: new V3(0.3, 0, 0.8), target: null, moving: false, phase: 0, gait: 0,
    face: 0.7, faceTarget: 0.7, idle: 0, lock: 0, jumpY: 0, jumpV: 0,
    squash: { x: 0, v: 0 }, ear: { x: 0, v: 0 }, onArrive: null, faceAfter: null, stuck: 0, blinkT: 2.5, pendingOpen: null
  };
  const OBST = [
    { x: -2.0, z: -4.1, r: 1.35 }, { x: 2.3, z: -4.2, r: 1.45 }, { x: 3.75, z: 2.9, r: 0.72 },
    { x: -3.9, z: 3.8, r: 0.62 }, { x: -3.4, z: -0.9, r: 0.92 }
  ];
  const BOUND = 4.55, BUN_R = 0.3;
  function resolve(p){
    p.x = clamp(p.x, -BOUND, BOUND); p.z = clamp(p.z, -BOUND, BOUND);
    for (const o of OBST) {
      const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), min = o.r + BUN_R;
      if (d < min) { const k = min / (d || 1e-4); p.x = o.x + dx * k; p.z = o.z + dz * k; }
    }
    p.x = clamp(p.x, -BOUND, BOUND); p.z = clamp(p.z, -BOUND, BOUND);
    return p;
  }
  function walkTo(x, z, faceAfter, onArrive){
    bun.target = resolve(new V3(x, 0, z));
    if (!bun.moving) bun.phase = Math.ceil(bun.phase / Math.PI) * Math.PI;
    bun.moving = true; bun.faceAfter = faceAfter == null ? null : faceAfter; bun.onArrive = onArrive || null; bun.stuck = 0;
  }
  const SPOTS = {
    hero: { x: -2.0, z: -2.35, face: Math.PI },
    gallery: { x: -2.9, z: 1.55, face: -Math.PI / 2 },
    cabinet: { x: 2.3, z: -2.45, face: Math.PI },
    mail: { x: 2.9, z: 3.75, face: Math.PI / 4 },
    secret: { x: -3.25, z: 2.85, face: 0.85 }
  };

  /* Jump trigger zones: an object opens when Mochi jumps within reach of it */
  const TRIG = {
    hero: { x: -2.0, z: -4.1, r: 1.35 }, gallery: { x: -4.3, z: 1.55, r: 0.6 },
    cabinet: { x: 2.3, z: -4.2, r: 1.45 }, mail: { x: 3.75, z: 2.9, r: 0.72 },
    secret: { x: -3.9, z: 3.8, r: 0.62, hidden: true }
  };
  const REACH = 0.75;
  function nearSection(){
    let best = null, bd = Infinity;
    for (const id in TRIG) {
      const t = TRIG[id], d = Math.hypot(bun.pos.x - t.x, bun.pos.z - t.z) - t.r - BUN_R;
      if (d < bd) { bd = d; best = id; }
    }
    return bd < REACH ? best : null;
  }
  function jumpAction(){
    if (Bus.mode !== 'room' || fl.active || bun.jumpY > 0.01 || bun.jumpV !== 0) return;
    const id = nearSection();
    hop(4.4);
    Bus.audio.hop();
    if (id) {
      const t = TRIG[id];
      bun.faceTarget = Math.atan2(t.x - bun.pos.x, t.z - bun.pos.z); bun.lock = 2;
      bun.moving = false; bun.target = null; keys.clear();
      bun.pendingOpen = id;
    }
  }

  /* ---------- Particles: hearts, dust, floor ring, sparkles ---------- */
  const heartShape = new THREE.Shape();
  heartShape.moveTo(5, 5);
  heartShape.bezierCurveTo(5, 5, 4, 0, 0, 0);
  heartShape.bezierCurveTo(-6, 0, -6, 7, -6, 7);
  heartShape.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
  heartShape.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
  heartShape.bezierCurveTo(16, 7, 16, 0, 10, 0);
  heartShape.bezierCurveTo(7, 0, 5, 5, 5, 5);
  const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: 4, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: 1.6, bevelThickness: 1.6, curveSegments: 18 });
  heartGeo.center(); heartGeo.rotateZ(Math.PI); heartGeo.scale(0.024, 0.024, 0.024);
  const hearts = [];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(heartGeo, mat(i % 3 === 1 ? COL.blush : COL.blushDeep, { transparent: true, emissive: 0xFFB3C6, emissiveIntensity: 0.25, roughness: 0.45 }));
    m.visible = false; m.castShadow = true; scene.add(m);
    hearts.push({ m, life: 0, max: 2.6, vel: new V3(), spin: 0, pop: { x: 0, v: 0 }, alive: false });
  }
  const petalBurst = [];
  const petalGeo = new THREE.SphereGeometry(0.07, 12, 8); petalGeo.scale(0.6, 1, 0.22);
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(petalGeo, mat([COL.blush, COL.blushDeep, COL.butter, COL.lav, COL.sky, COL.mint][i % 6], { transparent: true, roughness: 0.6 }));
    m.visible = false; scene.add(m);
    petalBurst.push({ m, life: 0, max: 2.6, vel: new V3(), spin: 0, seed: i, size: 1, alive: false });
  }
  function burstPetals(n){
    const from = flowerHead.getWorldPosition(new V3());
    petalBurst.slice(0, n).forEach((p, i) => {
      const a = i / n * Math.PI * 2 + Math.random() * 0.4;
      p.alive = true; p.life = -i * 0.02; p.m.visible = false; p.m.position.copy(from);
      p.vel.set(Math.cos(a) * (0.9 + Math.random() * 0.6), 1.6 + Math.random() * 1.2, Math.sin(a) * (0.9 + Math.random() * 0.6));
      p.spin = (Math.random() - 0.5) * 8; p.size = 0.8 + Math.random() * 0.6; p.m.material.opacity = 1;
    });
  }
  const puffs = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0, roughness: 1 }));
    m.visible = false; scene.add(m); puffs.push({ m, life: 1, alive: false });
  }
  let puffIdx = 0;
  const rings = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 40), new THREE.MeshBasicMaterial({ color: COL.lavDeep, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return { m, t: 1, delay: 0 };
  });
  const SPARK = 70;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK * 3), sparkCol = new Float32Array(SPARK * 3), sparkSeed = new Float32Array(SPARK);
  const sparkPalette = [new THREE.Color(COL.blushDeep), new THREE.Color(COL.mintDeep), new THREE.Color(COL.lavDeep)];
  for (let i = 0; i < SPARK; i++) {
    sparkPos.set([(Math.random() - 0.5) * 9, 0.4 + Math.random() * 4.2, (Math.random() - 0.5) * 9], i * 3);
    const c = sparkPalette[i % 3]; sparkCol.set([c.r, c.g, c.b], i * 3); sparkSeed[i] = Math.random() * 10;
  }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.12, map: softTex, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
  scene.add(sparks);
  const sparkBase = sparkPos.slice();

  /* ---------- Camera, controls, flights ---------- */
  const HOME_T = new V3(0, 0.9, -0.2);
  const HOME_DIR = new V3(1, 0.78, 1).normalize();
  function homeDistance(){
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return Math.max(18.5, (camera.aspect < 0.9 ? 12.8 : 15.5) / (2 * tanH * camera.aspect), 11.5 / (2 * tanH));
  }
  const homePose = () => ({ pos: HOME_T.clone().addScaledVector(HOME_DIR, homeDistance()), tgt: HOME_T.clone() });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false; controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.6;
  controls.minPolarAngle = 0.7; controls.maxPolarAngle = 1.22;
  controls.minAzimuthAngle = 0.12; controls.maxAzimuthAngle = 1.46;
  let zoomDist = null;
  renderer.domElement.addEventListener('wheel', e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (Bus.mode !== 'room' || fl.active || !controls.enabled) return;
    let d = e.deltaY; if (e.deltaMode === 1) d *= 18; else if (e.deltaMode === 2) d *= 400;
    const base = zoomDist == null ? camera.position.distanceTo(controls.target) : zoomDist;
    zoomDist = clamp(base * Math.exp(clamp(d, -240, 240) * 0.0011), controls.minDistance, controls.maxDistance);
  }, { passive: false, capture: true });
  function setDistanceLimits(){ const d = homeDistance(); controls.minDistance = d * 0.55; controls.maxDistance = d * 1.35; }
  setDistanceLimits();
  const hp = homePose();
  camera.position.copy(hp.pos); controls.target.copy(hp.tgt); controls.update();
  const lookTarget = controls.target.clone();

  const tmpQ = new THREE.Quaternion();
  function focusPose(id){
    const a = camera.aspect, tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), portrait = a < 0.9, wide = a >= 0.9;
    if (id === 'hero') {
      const c = screen.getWorldPosition(new V3()), n = new V3(0, 0, 1).applyQuaternion(screen.getWorldQuaternion(tmpQ));
      const d = Math.min(1.02 / (2 * tanH), 1.5 / (2 * tanH * a)) * 0.9;
      if (portrait) c.add(new V3(0.26, -0.22, 0));
      return { pos: c.clone().addScaledVector(n, d), tgt: c };
    }
    if (id === 'gallery') {
      const c = picture.getWorldPosition(new V3()), n = new V3(0, 0, 1).applyQuaternion(picture.getWorldQuaternion(tmpQ));
      const d = Math.min(PH / (2 * tanH), PW / (2 * tanH * a)) * (portrait ? 0.95 : 1.22);
      return { pos: c.clone().addScaledVector(n, d), tgt: c };
    }
    if (id === 'cabinet') {
      const c = cab.localToWorld(new V3(0, 1.4, 0.6));
      const pos = c.clone().add(new V3(0, 1.1, portrait ? 10.5 : 7.4));
      const shift = wide ? new V3(1.55, 0, 0) : new V3(0, -1.6, 0);
      return { pos: pos.add(shift), tgt: c.add(shift) };
    }
    if (id === 'secret') {
      const c = plant.localToWorld(new V3(0, 1.45, 0)).add(new V3(SPOTS.secret.x, 1.25, SPOTS.secret.z)).multiplyScalar(0.5);
      const dir = new V3(1, 0.42, 0.55).normalize();
      const pos = c.clone().addScaledVector(dir, portrait ? 11 : 7.6);
      const view = c.clone().sub(pos).normalize(), right = new V3().crossVectors(view, camera.up).normalize();
      const shift = wide ? right.multiplyScalar(1.3) : new V3(0, -1.4, 0);
      return { pos: pos.add(shift), tgt: c.add(shift) };
    }
    const mb = mail.localToWorld(new V3(0, 1.4, 0)), sp = new V3(SPOTS.mail.x, 0.7, SPOTS.mail.z);
    const c = mb.add(sp).multiplyScalar(0.5);
    const dir = new V3(1, 0.42, 1).normalize();
    const pos = c.clone().addScaledVector(dir, portrait ? 10 : 7);
    const view = c.clone().sub(pos).normalize(), right = new V3().crossVectors(view, camera.up).normalize();
    const shift = wide ? right.multiplyScalar(1.15) : new V3(0, -1.5, 0);
    return { pos: pos.add(shift), tgt: c.add(shift) };
  }

  const fl = { active: false, t: 0, start: 0, dur: 1, fromP: new V3(), fromT: new V3(), dest: null, mid: null, midFired: false, done: null, arc: 0 };
  function fly(dest, dur, arc, mid, done){
    zoomDist = null;
    fl.active = true; fl.t = 0; fl.start = performance.now(); fl.dur = reduced() ? 0.35 : dur; fl.arc = reduced() ? 0 : arc;
    fl.fromP.copy(camera.position); fl.fromT.copy(lookTarget);
    fl.dest = dest; fl.mid = mid || null; fl.midFired = false; fl.done = done || null;
    controls.enabled = false;
  }
  let focusId = null;

  /* ---------- Hover / hotspots ---------- */
  const hotspotEls = {};
  document.querySelectorAll('[data-hotspot]').forEach(el => { hotspotEls[el.getAttribute('data-hotspot')] = el; });
  let hovered = null;
  function setHovered(id){
    if (hovered === id) return;
    if (hovered && hotspotEls[hovered]) hotspotEls[hovered].classList.remove('is-hover');
    hovered = id;
    if (id && hotspotEls[id]) hotspotEls[id].classList.add('is-hover');
    renderer.domElement.style.cursor = id ? 'pointer' : '';
  }
  document.querySelectorAll('.hotspot').forEach(el => {
    el.addEventListener('pointerenter', () => setHovered(el.getAttribute('data-hotspot')));
    el.addEventListener('pointerleave', () => setHovered(null));
  });

  /* ---------- Raycasting ---------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickables = [floorPick];
  Object.values(sections).forEach(g => g.traverse(o => { if (o.isMesh) pickables.push(o); }));
  bunny.traverse(o => { if (o.isMesh) pickables.push(o); });
  function sectionOf(o){ while (o) { if (o.userData.section) return o.userData.section; o = o.parent; } return null; }
  function pick(cx, cy){
    ndc.set(cx / window.innerWidth * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (!hit) return null;
    const sec = sectionOf(hit.object);
    if (sec) return { type: 'section', id: sec };
    if (hit.object.userData.bunny) return { type: 'bunny' };
    if (hit.object.userData.floor) return { type: 'floor', point: hit.point };
    return null;
  }
  const canvas = renderer.domElement;
  let down = null, hoverXY = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointermove', e => { hoverXY = { x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' }; });
  canvas.addEventListener('pointerleave', () => { hoverXY = null; setHovered(null); });
  canvas.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), long = performance.now() - down.t > 600;
    down = null;
    if (moved > 7 || long || Bus.mode !== 'room' || fl.active) return;
    const h = pick(e.clientX, e.clientY);
    if (!h) return;
    if (h.type === 'section') { kick(h.id); Bus.open(h.id); }
    else if (h.type === 'bunny') jumpAction();
    else if (h.type === 'floor') { walkTo(h.point.x, h.point.z); showRing(bun.target); }
  });
  function kick(id){ if (sections[id]) sections[id].userData.hover.v -= 2.2; else if (id === 'secret') sprout.g.v += 2.5; }
  function showRing(p){ rings.forEach((r, i) => { r.m.position.set(p.x, FLOOR + 0.03, p.z); r.t = 0; r.delay = i * 0.12; r.m.visible = true; }); }

  /* keyboard steering */
  const keys = new Set();
  const KEYMAP = { ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
  const isField = t => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && Bus.mode === 'room' && !isField(e.target)) {
      e.preventDefault();
      if (!e.repeat) jumpAction();
      return;
    }
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || Bus.mode !== 'room' || !KEYMAP[e.code]) return;
    if (e.target.closest && e.target.closest('.track')) return;
    e.preventDefault(); keys.add(KEYMAP[e.code]);
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space' && Bus.mode === 'room' && !isField(e.target)) e.preventDefault();
    if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]);
  });
  window.addEventListener('blur', () => keys.clear());

  /* ---------- Simulation (fixed 60 Hz substeps) ---------- */
  const H = 1 / 60;
  const SPEED = 1.9, STEP_RATE = 4.4;
  const spring = (s, target, k, c, h) => { s.v += (k * (target - s.x) - c * s.v) * h; s.x += s.v * h; };
  const wrapA = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const fwd = new V3(), rgt = new V3();

  function hop(v){ if (bun.jumpY > 0.01) return; bun.jumpV = reduced() ? v * 0.6 : v; bun.squash.v -= 3.5; }
  function footstep(n){
    Bus.audio.tap();
    bun.squash.v += 1.1;
    const foot = feet[n % 2], p = puffs[puffIdx++ % puffs.length];
    p.m.position.copy(foot.getWorldPosition(new V3())); p.m.position.y = FLOOR + 0.06;
    p.life = 0; p.alive = true; p.m.visible = true;
  }
  function spawnHearts(n){
    const headP = head.getWorldPosition(new V3()).add(new V3(0, 0.1, 0));
    const dir = new V3(Math.sin(bun.face), 0, Math.cos(bun.face));
    for (let i = 0; i < n; i++) {
      const h = hearts.find(x => !x.alive); if (!h) break;
      h.alive = true; h.life = -i * 0.08; h.m.visible = false;
      h.m.position.copy(headP).addScaledVector(dir, 0.35);
      const spread = (i - (n - 1) / 2) * 0.55;
      h.vel.copy(dir).multiplyScalar(0.9).add(new V3(dir.z * spread, 2.2 + Math.random() * 0.8, -dir.x * spread));
      h.spin = (Math.random() - 0.5) * 3; h.pop.x = 0; h.pop.v = 0;
      h.m.material.opacity = 1;
    }
  }

  function step(h, t){
    /* keyboard walking */
    if (keys.size && Bus.mode === 'room' && !fl.active) {
      fwd.copy(controls.target).sub(camera.position); fwd.y = 0; fwd.normalize();
      rgt.crossVectors(fwd, camera.up).normalize();
      const d = new V3();
      if (keys.has('f')) d.add(fwd); if (keys.has('b')) d.sub(fwd);
      if (keys.has('r')) d.add(rgt); if (keys.has('l')) d.sub(rgt);
      if (d.lengthSq() > 0) { d.normalize(); walkTo(bun.pos.x + d.x * 0.6, bun.pos.z + d.z * 0.6); }
    }
    /* walking */
    if (bun.moving && bun.target) {
      const dx = bun.target.x - bun.pos.x, dz = bun.target.z - bun.pos.z, dist = Math.hypot(dx, dz);
      if (dist < 0.04) arrive();
      else {
        const move = Math.min(dist, SPEED * h);
        const bx = bun.pos.x, bz = bun.pos.z;
        bun.pos.x += dx / dist * move; bun.pos.z += dz / dist * move;
        resolve(bun.pos);
        const real = Math.hypot(bun.pos.x - bx, bun.pos.z - bz);
        bun.stuck = real < move * 0.25 ? bun.stuck + h : 0;
        if (bun.stuck > 0.4) arrive();
        bun.faceTarget = Math.atan2(dx, dz);
        const prev = Math.floor(bun.phase / Math.PI);
        bun.phase += h * STEP_RATE * Math.PI;
        const now = Math.floor(bun.phase / Math.PI);
        if (now !== prev) footstep(now);
        bun.gait = Math.min(1, bun.gait + h * 7);
      }
    } else {
      bun.gait = Math.max(0, bun.gait - h * 5);
      bun.idle += h;
      if (bun.idle > 2.2 && bun.lock <= 0 && Bus.mode === 'room') bun.faceTarget = Math.atan2(camera.position.x - bun.pos.x, camera.position.z - bun.pos.z);
    }
    bun.lock -= h;
    bun.face += wrapA(bun.faceTarget - bun.face) * Math.min(1, h * 9);

    /* jump + springs */
    if (bun.jumpV !== 0 || bun.jumpY > 0) {
      bun.jumpV -= 13 * h; bun.jumpY += bun.jumpV * h;
      if (bun.pendingOpen && bun.jumpV <= 0) { const id = bun.pendingOpen; bun.pendingOpen = null; kick(id); Bus.open(id); }
      if (bun.jumpY <= 0) { const impact = -bun.jumpV; bun.jumpY = 0; bun.jumpV = 0; bun.squash.v += impact * 1.1; if (impact > 1.5) Bus.audio.tap(); }
    }
    spring(bun.squash, 0, 190, 11, h);
    spring(bun.ear, -0.38 * bun.gait + clamp(-bun.jumpV * 0.09, -0.5, 0.5), 95, 6.5, h);
    Object.values(sections).forEach(g => { const hv = g.userData.hover; spring(hv, hv.target, 170, 12, h); });
    drawers.forEach(d => spring(d.out, d.target, 230, 15, h));
    spring(sprout.g, sprout.target, 110, 8, h);
    spring(sprout.bloom, sprout.bloom.target, 90, 6.5, h);
    petalBurst.forEach(p => {
      if (!p.alive) return;
      p.life += h;
      if (p.life < 0) return;
      p.m.visible = true;
      p.vel.y -= 0.6 * h; p.vel.multiplyScalar(1 - h * 0.6);
      p.m.position.addScaledVector(p.vel, h);
      p.m.position.x += Math.sin(t * 3 + p.seed) * 0.004;
      p.m.rotation.x += p.spin * h; p.m.rotation.z += p.spin * 0.7 * h;
      const k = p.life / p.max; p.m.material.opacity = 1 - clamp((k - 0.55) / 0.45, 0, 1);
      p.m.scale.setScalar(Math.min(1, p.life * 8) * p.size);
      if (p.life > p.max) { p.alive = false; p.m.visible = false; }
    });
    spring(flagS, flagS.target, 110, 7.5, h);

    /* hearts */
    hearts.forEach(p => {
      if (!p.alive) return;
      p.life += h;
      if (p.life < 0) return;
      p.m.visible = true;
      spring(p.pop, 1, 140, 9, h);
      p.vel.y += (0.9 - p.vel.y) * h * 1.6;
      p.vel.x *= 1 - h * 0.9; p.vel.z *= 1 - h * 0.9;
      p.m.position.addScaledVector(p.vel, h);
      p.m.quaternion.copy(camera.quaternion);
      p.m.rotateZ(Math.sin(t * 3 + p.spin) * 0.3);
      p.m.rotateY(p.life * p.spin);
      const s = Math.max(0.001, p.pop.x); p.m.scale.setScalar(s);
      p.m.material.opacity = 1 - clamp((p.life / p.max - 0.6) / 0.4, 0, 1);
      if (p.life > p.max) { p.alive = false; p.m.visible = false; }
    });
    puffs.forEach(p => {
      if (!p.alive) return;
      p.life += h * 2;
      const s = 0.4 + p.life * 1.4; p.m.scale.set(s, s * 0.6, s);
      p.m.position.y += h * 0.15;
      p.m.material.opacity = 0.7 * (1 - p.life);
      if (p.life >= 1) { p.alive = false; p.m.visible = false; }
    });
    rings.forEach(r => {
      if (r.t >= 1) return;
      if (r.delay > 0) { r.delay -= h; return; }
      r.t += h / 0.75;
      const s = 0.5 + ease(Math.min(r.t, 1)) * 1.6; r.m.scale.set(s, s, s);
      r.m.material.opacity = 0.9 * (1 - r.t);
      if (r.t >= 1) r.m.visible = false;
    });
  }
  function arrive(){
    bun.moving = false; bun.idle = 0; bun.stuck = 0;
    if (bun.faceAfter != null) { bun.faceTarget = bun.faceAfter; bun.lock = 3; }
    const cb = bun.onArrive; bun.onArrive = null; bun.faceAfter = null;
    if (cb) cb();
  }

  /* ---------- Ripple texture feed from the HTML slider ---------- */
  const texCache = new Map();
  let curTex = -1, pending = null, lastRipple = -10;
  /* WebGL may only sample an image that is CORS-clean. Opened from file:// (double-clicked),
     local images are never clean, so the frame keeps its pastel gradient instead of erroring. */
  function canSample(img){
    const src = img.currentSrc || img.src || '';
    if (location.protocol === 'file:') return /^https?:/i.test(src) && !!img.crossOrigin;
    try { return new URL(src, location.href).origin === location.origin || !!img.crossOrigin; } catch (e) { return false; }
  }
  function textureFor(i, img){
    if (texCache.has(i)) return texCache.get(i);
    if (img && !canSample(img)) {
      /* double-clicked page: use the bundled data-URI copy of this image, if the package ships one */
      const alt = (window.GM635_FRAME_TEXTURES || [])[i];
      if (!alt) return null;
      if (!img.__frameAlt) {
        const a = new Image();
        a.onload = () => { if (curTex === -1 && i === 0) setPicture(0, img); };
        a.src = alt; img.__frameAlt = a;
      }
      if (!img.__frameAlt.complete || !img.__frameAlt.naturalWidth) return null;
      img = img.__frameAlt;
    }
    if (!img || !img.complete || !img.naturalWidth) {
      if (img && !img.dataset.wait) { img.dataset.wait = '1'; img.addEventListener('load', () => { if (curTex === -1 && i === 0) setPicture(0, img); }, { once: true }); }
      return null;
    }
    const tex = new THREE.Texture(img);
    tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const ia = img.naturalWidth / img.naturalHeight, pa = PW / PH;
    const cover = ia > pa ? new THREE.Vector2(pa / ia, 1) : new THREE.Vector2(1, ia / pa);
    const entry = { tex, cover }; texCache.set(i, entry); return entry;
  }
  function setPicture(i, img, u, v){
    const e = textureFor(i, img); if (!e || i === curTex) return;
    if (curTex === -1 && rippleU.uHasA.value === 0) {
      rippleU.uTexA.value = e.tex; rippleU.uCoverA.value.copy(e.cover); rippleU.uHasA.value = 1; curTex = i; return;
    }
    rippleU.uTexB.value = e.tex; rippleU.uCoverB.value.copy(e.cover); rippleU.uHasB.value = 1;
    rippleU.uWipe.value.set(u == null ? 0.5 : u, v == null ? 0.5 : 1 - v);
    rippleU.uMix.value = 0; pending = i; curTex = i;
  }
  const galleryImgs = document.querySelectorAll('#track img');
  if (galleryImgs[0]) setPicture(0, galleryImgs[0]);
  function startRipple(u, v, amp){
    rippleU.uOrigin.value.set(u, 1 - v);
    rippleU.uStart.value = rippleU.uTime.value;
    rippleU.uAmp.value = (reduced() ? 0.3 : 1) * amp;
    lastRipple = rippleU.uTime.value;
  }

  /* ---------- Engine API for the UI layer ---------- */
  const engine = {
    focus(id, onReveal){
      focusId = id;
      setHovered(null);
      const s = SPOTS[id];
      walkTo(s.x, s.z, s.face);
      if (id === 'gallery') rippleU.uIdle.value = reduced() ? 0 : 1;
      fly(() => focusPose(id), id === 'hero' ? 1.35 : 1.2, id === 'hero' ? 0.35 : 0.9, onReveal, null);
      if (reduced() && onReveal) setTimeout(onReveal, 360);
    },
    home(){
      focusId = null;
      drawers.forEach(d => { d.target = 0; });
      fly(homePose, 1.15, 0.9, null, () => { controls.target.copy(HOME_T); lookTarget.copy(HOME_T); controls.enabled = true; controls.update(); });
    },
    resetView(){ if (Bus.mode === 'room') fly(homePose, 0.9, 0.3, null, () => { controls.target.copy(HOME_T); lookTarget.copy(HOME_T); controls.enabled = true; controls.update(); }); },
    ripple(i, u, v, img){ setPicture(i, img, u, v); startRipple(u, v, 0.12); },
    rippleMove(i, u, v){ if (rippleU.uTime.value - lastRipple > 0.55) startRipple(u, v, 0.08); },
    drawer(i, on){ if (drawers[i]) { drawers[i].target = on ? 0.62 : 0; if (on) drawers[i].out.v += 1.5; } },
    grow(stage){
      sprout.stage = stage; sprout.target = stage / 3; sprout.g.v += 1.2;
      hop(2.6);
    },
    bloom(){
      sprout.bloom.target = 1; sprout.bloom.v += 2;
      burstPetals(reduced() ? 6 : 18);
      hop(4.6);
    },
    get sprout(){ return { stage: sprout.stage, g: sprout.g.x, bloom: sprout.bloom.x }; },
    hop(v){ hop(v || 4.4); },
    celebrate(){
      hop(4.6);
      spawnHearts(reduced() ? 2 : 5);
      flagS.target = 0; flagS.v -= 6;
      setTimeout(() => { flagS.target = -1.45; }, 3200);
    },
    project(id){
      const g = sections[id]; if (!g) return null;
      const p = id === 'mail' ? mail.localToWorld(new V3(0, 1.62, 0.5)) : g.localToWorld(g.userData.anchor.clone());
      return toScreen(p);
    },
    get bunny(){ return { x: bun.pos.x, z: bun.pos.z, moving: bun.moving, jumpY: bun.jumpY }; },
    walkTo,
    pick,
    get camera(){ return camera; },
    get flying(){ return fl.active; },
    jump: jumpAction,
    get near(){ return nearSection(); },
    get heartsAlive(){ return hearts.filter(h => h.alive && h.m.visible).length; }
  };
  function toScreen(v){
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, behind: p.z > 1 };
  }

  /* ---------- Resize ---------- */
  let lastAspect = camera.aspect;
  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    setDistanceLimits();
    if (Bus.mode === 'room' && !fl.active && Math.abs(camera.aspect - lastAspect) / lastAspect > 0.15) {
      const p = homePose(); camera.position.copy(p.pos); controls.target.copy(p.tgt); lookTarget.copy(p.tgt); controls.update();
    }
    lastAspect = camera.aspect;
  });

  /* ---------- Frame loop ---------- */
  const clock = new THREE.Clock();
  let acc = 0, time = 0, screenT = 0;
  const parallax = new V3(), parTarget = new V3();
  const tmp = new V3();
  window.addEventListener('pointermove', e => {
    parTarget.set((e.clientX / window.innerWidth - 0.5) * 0.08, -(e.clientY / window.innerHeight - 0.5) * 0.05, 0);
  }, { passive: true });

  let perfN = 0, perfSum = 0, perfStage = 0;
  function adapt(raw){
    if (perfStage > 1) return;
    perfN++; perfSum += raw;
    if (perfN < 90) return;
    const avg = perfSum / perfN; perfN = 0; perfSum = 0;
    if (avg > 0.034) {
      perfStage++;
      renderer.setPixelRatio(Math.max(perfStage > 1 ? 0.75 : 1, renderer.getPixelRatio() - 0.5));
      if (perfStage > 1) { renderer.shadowMap.type = THREE.PCFShadowMap; key.shadow.mapSize.set(1024, 1024); key.shadow.map && key.shadow.map.dispose(); key.shadow.map = null; }
      renderer.setSize(window.innerWidth, window.innerHeight);
    } else perfStage = 2;
  }
  function frameLoop(){
    const rawDt = clock.getDelta();
    adapt(rawDt);
    const dt = Math.min(rawDt, 0.1);
    time += dt;
    acc += dt;
    let n = 0;
    while (acc >= H && n < 8) { step(H, time); acc -= H; n++; }
    if (n === 8) acc = 0;
    const still = reduced();

    /* bunny pose */
    bunny.position.set(bun.pos.x, FLOOR + 0.02, bun.pos.z);
    bunny.rotation.y = bun.face;
    const wave = Math.sin(bun.phase);
    bob.position.y = (still ? 0 : Math.abs(wave) * 0.13 * bun.gait) + bun.jumpY;
    tilt.rotation.z = still ? 0 : Math.cos(bun.phase) * 0.13 * bun.gait;
    tilt.rotation.x = bun.gait * 0.08;
    const breathe = still ? 0 : Math.sin(time * 2.4) * 0.012 * (1 - bun.gait);
    const sq = clamp(bun.squash.x, -0.28, 0.28);
    bob.scale.set(1 + sq * 0.55, 1 - sq + breathe, 1 + sq * 0.55);
    feet.forEach((f, i) => {
      const lift = bun.gait * Math.max(0, i ? -wave : wave) * 0.11;
      f.position.y = 0.06 + lift + bun.jumpY * 0.9;
      f.position.z = 0.1 + (still ? 0 : Math.max(0, i ? -wave : wave) * 0.08 * bun.gait);
    });
    ears.forEach(e => { e.rotation.x = bun.ear.x; e.rotation.z = -e.userData.side * (0.08 + (still ? 0 : Math.sin(time * 1.7 + e.userData.side) * 0.05)); });
    bun.blinkT -= dt;
    const blinking = bun.blinkT < 0.12;
    eyes.forEach(e => { e.scale.y = blinking ? 0.12 : 1; });
    if (bun.blinkT < 0) bun.blinkT = 2.4 + Math.random() * 2.6;
    bunShadow.position.set(bun.pos.x, FLOOR + 0.035, bun.pos.z);
    const ss = 1 - Math.min(bun.jumpY, 1.2) * 0.4; bunShadow.scale.set(ss, ss, ss);
    bunShadow.material.opacity = ss;

    /* ambient page decor: fades away while a section is open */
    amb += ((Bus.mode === 'room' ? 1 : 0) - amb) * Math.min(1, dt * (still ? 20 : 3.5));
    gridMat.uniforms.uFade.value = amb;
    floatShadow.material.opacity = 0.55 + 0.45 * amb;
    ambient.forEach((a, i) => {
      const k = amb < 0.01 ? 0 : amb;
      a.g.visible = k > 0;
      a.g.scale.setScalar(a.s * (0.6 + 0.4 * k) * (k > 0 ? 1 : 0));
      a.g.position.set(a.base.x, a.base.y + (still ? 0 : Math.sin(time * 0.6 + a.seed) * 0.25) - (1 - k) * 0.8, a.base.z + (still ? 0 : Math.cos(time * 0.4 + a.seed) * 0.2));
      if (a.spin) a.g.rotation.set(0.2, still ? 0.6 : time * a.spin + a.seed, still ? 0 : Math.sin(time + a.seed) * 0.2);
      else a.g.rotation.y = still ? 0 : Math.sin(time * 0.2 + a.seed) * 0.15;
    });

    /* section objects: hover jelly + idle motion, and the jump-reach glow */
    const nearRaw = Bus.mode === 'room' && !fl.active ? nearSection() : null;
    const nearId = nearRaw && !TRIG[nearRaw].hidden ? nearRaw : null;
    Object.values(sections).forEach(g => {
      const hv = g.userData.hover;
      hv.target = (hovered === g.userData.section || nearId === g.userData.section) && Bus.mode === 'room' ? 1 : 0;
      const s = 1 + hv.x * 0.045;
      g.scale.set(g.userData.baseScale.x * s, g.userData.baseScale.y * (1 + hv.x * 0.06), g.userData.baseScale.z * s);
      const glow = Math.max(0, hv.x) * 0.16;
      g.userData.mats.forEach(m => { if (!m.userData.base) m.userData.base = { e: m.emissive.clone(), i: m.emissiveIntensity }; if (m.userData.base.i > 0.05) return; m.emissive.copy(m.color); m.emissiveIntensity = glow; });
    });
    frame.position.y = 2.75 + (still ? 0 : Math.sin(time * 1.1) * 0.07);
    frame.rotation.z = still ? 0 : Math.sin(time * 0.8) * 0.018;
    drawers.forEach(d => { d.g.position.z = 0.52 + d.out.x; });
    poseSprout();
    flowerHead.rotation.z = still ? 0 : Math.sin(time * 1.3) * 0.08 * (0.3 + sprout.g.x);
    petalRing.rotation.z = still ? 0 : time * 0.25 * sprout.bloom.x;
    flag.rotation.x = flagS.x;
    tvGlow.intensity = 2.2 + (still ? 0 : Math.sin(time * 2) * 0.5);
    halo.material.opacity = 0.45 + (still ? 0 : Math.sin(time * 2) * 0.1);
    screenT += dt;
    if (screenT > 1 / 12) { screenT = 0; drawScreen(time); }

    /* ripple plane */
    rippleU.uTime.value = time;
    if (pending !== null) {
      rippleU.uMix.value = Math.min(1, rippleU.uMix.value + dt * (still ? 6 : 1.6));
      if (rippleU.uMix.value >= 1) {
        rippleU.uTexA.value = rippleU.uTexB.value; rippleU.uCoverA.value.copy(rippleU.uCoverB.value); rippleU.uHasA.value = 1;
        rippleU.uMix.value = 0; pending = null;
      }
    }

    /* sparkles */
    if (!still) {
      for (let i = 0; i < SPARK; i++) {
        const s = sparkSeed[i];
        sparkPos[i * 3] = sparkBase[i * 3] + Math.sin(time * 0.3 + s) * 0.25;
        sparkPos[i * 3 + 1] = sparkBase[i * 3 + 1] + Math.sin(time * 0.5 + s * 2) * 0.3;
        sparkPos[i * 3 + 2] = sparkBase[i * 3 + 2] + Math.cos(time * 0.35 + s) * 0.25;
      }
      sparkGeo.attributes.position.needsUpdate = true;
    }

    /* camera */
    if (fl.active) {
      fl.t = Math.min(1, (performance.now() - fl.start) / 1000 / fl.dur);
      const e = ease(fl.t), d = fl.dest();
      camera.position.lerpVectors(fl.fromP, d.pos, e);
      camera.position.y += Math.sin(Math.PI * e) * fl.arc;
      lookTarget.lerpVectors(fl.fromT, d.tgt, e);
      camera.lookAt(lookTarget);
      if (!fl.midFired && fl.t >= 0.58) { fl.midFired = true; if (fl.mid) fl.mid(); }
      if (fl.t >= 1) { fl.active = false; const cb = fl.done; fl.done = null; if (cb) cb(); }
    } else if (focusId && Bus.mode === focusId) {
      parallax.lerp(still ? tmp.set(0, 0, 0) : parTarget, Math.min(1, dt * 3));
      const p = focusPose(focusId);
      const right = new V3().subVectors(p.tgt, p.pos).normalize().cross(camera.up).normalize();
      const scale = focusId === 'hero' ? 0.25 : 1;
      camera.position.copy(p.pos).addScaledVector(right, parallax.x * scale).add(tmp.set(0, parallax.y * scale, 0));
      lookTarget.copy(p.tgt);
      camera.lookAt(lookTarget);
    } else if (controls.enabled) {
      if (zoomDist != null) {
        const cur = camera.position.distanceTo(controls.target);
        let nd = still ? zoomDist : cur + (zoomDist - cur) * (1 - Math.exp(-dt * 9));
        if (Math.abs(zoomDist - nd) < 0.002) { nd = zoomDist; zoomDist = null; }
        camera.position.sub(controls.target).setLength(nd).add(controls.target);
      }
      controls.update();
      lookTarget.copy(controls.target);
    }

    /* hover pick (room only, mouse) */
    if (hoverXY && !hoverXY.touch && Bus.mode === 'room' && !fl.active) {
      const hp2 = pick(hoverXY.x, hoverXY.y);
      setHovered(hp2 && hp2.type === 'section' ? hp2.id : null);
      if (hp2 && hp2.type === 'bunny') renderer.domElement.style.cursor = 'pointer';
    }

    /* Mochi's speech bubble follows the bunny's head */
    if (sayEl && sayEl.classList.contains('is-on')) {
      const hp = toScreen(bob.localToWorld(new V3(0, 2.15, 0)));
      sayEl.style.setProperty('--x', hp.x.toFixed(1) + 'px');
      sayEl.style.setProperty('--y', hp.y.toFixed(1) + 'px');
    }

    /* HTML hotspots follow their 3D anchors */
    const showHot = Bus.mode === 'room' && !fl.active;
    for (const id in hotspotEls) {
      const el = hotspotEls[id], g = sections[id];
      const s = toScreen(g.localToWorld(tmp.copy(g.userData.anchor)));
      const off = s.behind || s.x < -40 || s.x > window.innerWidth + 40 || s.y < 20 || s.y > window.innerHeight;
      el.classList.toggle('is-hidden', !showHot || off);
      el.classList.toggle('is-near', id === nearId);
      const half = (el.offsetWidth || 0) / 2, cx = Math.min(Math.max(s.x, half + 8), window.innerWidth - half - 8);
      el.style.setProperty('--tail', (s.x - cx).toFixed(1) + 'px');
      el.style.setProperty('--x', cx.toFixed(1) + 'px');
      el.style.setProperty('--y', s.y.toFixed(1) + 'px');
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frameLoop);
  }

  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); });
  const sayEl = document.getElementById('mochiSay');
  Bus.attach(engine);
  requestAnimationFrame(frameLoop);
}
})();
