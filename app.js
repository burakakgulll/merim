(function(){
'use strict';
/* Merdiven imalat: montajlar tek 3B görünüş (adım yok, sac yok, ölçü yok); geometri doğrudan IFC'den, delikler IFC civatalarından */
const $app = document.getElementById('app');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = v => String(Math.round(v));
const GROUPS = { C:['C — Kolonlar','SHS80*3 kolon + taban, bağlantı ve başlık levhaları.'], B:['B — Merdiven kirişi','SHS80*3 kiriş + ayak ve taban levhası.'], K:['K — Korkuluk çerçeveleri','SHS40*2 kutu profil çerçeveler.'] };
const DIA_COL = { 14:'#1E9E52', 18:'#E8590C', 16:'#1C7ED6', 22:'#AE3EC9', 12:'#F08C00', 20:'#C2255C', 24:'#5C940D', 26:'#0B7285' };
const diaColor = d => DIA_COL[Math.round(d)] || '#495057';
const fileOf = mark => mark.replace('/','_');
const markSort = (a,b) => a.mark.split('/')[0].localeCompare(b.mark.split('/')[0]) || (+a.mark.split('/')[1]) - (+b.mark.split('/')[1]);
const loadScript = src => new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error(src)); document.head.appendChild(el); });
const imgSrc = name => (window.IMALAT_IMG && window.IMALAT_IMG[name]) || ('img/'+name+'.png');
async function loadAsm(mark){
  const D = window.IMALAT_DATA = window.IMALAT_DATA || {};
  if(!D[mark]) await loadScript('data/'+fileOf(mark)+'.js');
  if(!D[mark]) throw new Error(mark);
  return D[mark];
}
let INDEX = null, PAGES = null;

/* ---------- 3D (ortografik) ---------- */
const V = { renderer:null, scene:null, camera:null, controls:null, root:null, el:null, A:null, size:null, cam:'iso' };
function initViewer(){
  if(V.renderer) return;
  const r = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  r.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  V.renderer = r; V.scene = new THREE.Scene();
  V.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200000);
  V.scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8894, 0.85));
  const d1 = new THREE.DirectionalLight(0xffffff, 0.7); d1.position.set(0.4, 1, 0.7); V.scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.35); d2.position.set(-0.6, -0.4, -0.8); V.scene.add(d2);
  V.controls = new THREE.OrbitControls(V.camera, r.domElement);
  V.controls.addEventListener('change', render);
  window.addEventListener('resize', () => { resize(); if(V.A) setCamera(V.cam); });
}
function render(){
  if(!(V.renderer && V.el && V.el.isConnected)) return;
  if(V.root){
    const c = V.camera, ws = (c.top - c.bottom)/c.zoom;
    V.root.traverse(o => { if(o.isSprite) o.scale.set(o.userData.asp*o.userData.h*ws, o.userData.h*ws, 1); });
    V.camera.updateMatrixWorld(); V.root.updateMatrixWorld(true); declutter();
  }
  V.renderer.render(V.scene, V.camera);
}
function declutter(){
  const Wp = V.el.clientWidth, Hp = V.el.clientHeight, placed = [], sprites = [];
  V.root.traverse(o => { if(o.isSprite) sprites.push(o); });
  sprites.sort((a,b) => (b.userData.prio||0) - (a.userData.prio||0));
  const v = new THREE.Vector3();
  sprites.forEach(sp => {
    v.setFromMatrixPosition(sp.matrixWorld).project(V.camera);
    const h = sp.userData.h*Hp, w = sp.userData.asp*h;
    const cx = (v.x+1)/2*Wp - (sp.center.x-0.5)*w, cy = (1-v.y)/2*Hp + (sp.center.y-0.5)*h;
    const r = [cx-w/2-2, cy-h/2-2, cx+w/2+2, cy+h/2+2];
    const hit = placed.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
    sp.visible = !hit; if(!hit) placed.push(r);
  });
}
function resize(){ if(V.el && V.el.isConnected){ V.renderer.setSize(V.el.clientWidth, V.el.clientHeight, false); render(); } }
function makeLabel(text, bg, fg, h){
  const c = document.createElement('canvas'), ctx = c.getContext('2d'), fs = 64;
  const font = '700 '+fs+'px "Barlow Condensed","Arial Narrow",Arial,sans-serif';
  ctx.font = font; c.width = Math.ceil(ctx.measureText(text).width) + 32; c.height = fs + 24;
  ctx.font = font; ctx.fillStyle = bg; ctx.beginPath();
  if(ctx.roundRect) ctx.roundRect(0,0,c.width,c.height,14); else ctx.rect(0,0,c.width,c.height);
  ctx.fill(); ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.fillText(text, 16, c.height/2+3);
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest:false }));
  sp.renderOrder = 10; sp.userData.h = h; sp.userData.asp = c.width/c.height; return sp;
}
/* yerel çerçeve (x boyuna, y, z yukarı) -> three (x, z, -y) */
const P3 = (x,y,z) => new THREE.Vector3(x, z, -y);
const MAT = {};
function mats(){
  if(MAT.main) return;
  const std = c => new THREE.MeshStandardMaterial({ color:c, metalness:0.3, roughness:0.55, side:THREE.DoubleSide, flatShading:true, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1 });
  MAT.main = std(0x5F7C95); MAT.sec = std(0x9AAEBF);
  MAT.edge = new THREE.LineBasicMaterial({ color:0x1A2026 });
  MAT.hole = new THREE.MeshBasicMaterial({ color:0x111518, side:THREE.DoubleSide });
  MAT.zero = new THREE.LineBasicMaterial({ color:0xD3212D });
  MAT.ring = {};
}
const ringMat = d => MAT.ring[d] || (MAT.ring[d] = new THREE.MeshBasicMaterial({ color:new THREE.Color(diaColor(d)), side:THREE.DoubleSide }));
function geomOf(p){
  if(p._g) return p._g;
  const v = p.v, pos = new Float32Array(v.length);
  for(let i=0;i<v.length;i+=3){ pos[i] = v[i]; pos[i+1] = v[i+2]; pos[i+2] = -v[i+1]; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(p.f); g.computeVertexNormals();
  p._g = g; p._e = new THREE.EdgesGeometry(g, 25); return g;
}
function clearRoot(){ if(!V.root) return; V.root.traverse(o => { if(o.isSprite){ o.material.map.dispose(); o.material.dispose(); } }); V.scene.remove(V.root); V.root = null; }
function buildScene(A){
  mats();
  const g = new THREE.Group(), S = V.size;
  const seen = {};
  A.parts.forEach(p => {
    g.add(new THREE.Mesh(geomOf(p), p.main ? MAT.main : MAT.sec));
    g.add(new THREE.LineSegments(p._e, MAT.edge));
    const lb = makeLabel(p.pos, p.main ? '#2B3A47' : '#FFFFFF', p.main ? '#FFFFFF' : '#1A2026', p.main ? 0.05 : 0.04);
    lb.userData.prio = p.main ? 9 : (seen[p.pos] ? 1 : 4); seen[p.pos] = 1;
    lb.center.set(0.5, 0.5); lb.position.copy(P3((p.bmin[0]+p.bmax[0])/2, (p.bmin[1]+p.bmax[1])/2, (p.bmin[2]+p.bmax[2])/2)); g.add(lb);
    p.holes.forEach(h => {
      const [x,y,z,nx,ny,nz,d] = h, n = P3(nx,ny,nz).normalize(), pos = P3(x,y,z);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), n);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(d/2, d/2, 14, 20), MAT.hole); cyl.position.copy(pos); cyl.quaternion.copy(q); g.add(cyl);
      [-1,1].forEach(s => { const r = new THREE.Mesh(new THREE.TorusGeometry(d/2+3.5, 2.6, 8, 24), ringMat(Math.round(d)));
        r.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), n)); r.position.copy(pos).addScaledVector(n, s*7); g.add(r); });
    });
  });
  return g;
}
const DIRS = { iso:[-1,1,1], left:[-1,1,1], right:[1,1,1], front:[0,0,1], top:[0,0,1], back:[0,0,1], bottom:[0,0,1] };
const ROTX = { top: Math.PI/2, back: Math.PI, bottom: -Math.PI/2 };   // kamera önde, montaj boyuna ekseni etrafında döner
function setCamera(kind){
  const S = V.size, c = V.camera; V.cam = kind;
  let lo = 0, hi = S[0];
  const big = Math.max(S[1], S[2]);
  if(kind === 'left') hi = Math.min(S[0], big*4); if(kind === 'right') lo = Math.max(0, S[0] - big*4);
  const m = big*0.15 + 30, corners = [];
  [lo-m-big*0.6-60, hi+m].forEach(x => [-m, S[2]+m].forEach(z => [-m, S[1]+m].forEach(y => corners.push(P3(x,y,z)))));
  const rot = new THREE.Matrix4().makeRotationX(ROTX[kind] || 0);
  if(V.root){ V.root.rotation.x = ROTX[kind] || 0; V.root.updateMatrixWorld(true); }
  corners.forEach(q => q.applyMatrix4(rot));
  const t = P3((lo+hi)/2, S[1]/2, S[2]/2).applyMatrix4(rot);
  const dir = new THREE.Vector3(...DIRS[kind]).normalize(), D = S[0] + big*10 + 4000;
  c.position.copy(t).addScaledVector(dir, D); c.up.set(0,1,0); c.lookAt(t); c.updateMatrixWorld();
  const inv = c.matrixWorldInverse; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  corners.forEach(q => { const v = q.clone().applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); });
  const asp = V.el.clientWidth / V.el.clientHeight, cx = (x0+x1)/2, cy = (y0+y1)/2;
  let w = (x1-x0)*1.1, h = (y1-y0)*1.2; if(w/h > asp) h = w/asp; else w = h*asp;
  const rt = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 1);
  t.addScaledVector(rt, cx).addScaledVector(up, cy); c.position.addScaledVector(rt, cx).addScaledVector(up, cy);
  c.left = -w/2; c.right = w/2; c.top = h/2; c.bottom = -h/2; c.zoom = 1; c.near = 1; c.far = D*2 + 50000; c.updateProjectionMatrix();
  V.controls.target.copy(t); V.controls.update(); render();
}

/* ---------- sayfalar ---------- */
function setTitle(t){ document.title = t + ' · Merdiven imalat'; }
function homeView(){
  setTitle('Montajlar');
  let html = '<div class="intro"><h1>Merdiven imalat</h1><p class="lead muted">AGRO MER · '+INDEX.length+' montaj. Montaja dokun: 3B görünüş ve delikler.</p></div>';
  ['C','B','K'].forEach(g => {
    const list = INDEX.filter(a => a.mark.startsWith(g+'/')).sort(markSort);
    if(!list.length) return;
    html += '<section class="prof"><div class="prof-head"><h3>'+GROUPS[g][0]+'</h3><span class="muted">'+list.length+' montaj</span></div><p class="groupdesc">'+GROUPS[g][1]+'</p><div class="plist">'+
      list.map(a => '<a class="prow" href="#/m/'+a.mark+'"><span class="nm">'+esc(a.mark)+'</span><span class="sub"><b>'+a.qty+' adet</b> · '+a.nparts+' parça</span><span class="ends">'+esc(a.mainProf)+' · '+fmt(a.size[0])+' mm'+(a.nholes ? ' · <span class="hb">'+a.nholes+' delik</span>' : '')+'</span></a>').join('')+'</div></section>';
  });
  $app.innerHTML = html;
}
function bomTable(A){
  const rows = {};
  A.parts.forEach(p => { (rows[p.pos] = rows[p.pos] || { p, n:0, h:0 }); rows[p.pos].n++; rows[p.pos].h += p.holes.length; });
  const list = Object.values(rows).sort((a,b) => (b.p.main - a.p.main) || a.p.pos.localeCompare(b.p.pos, 'tr', {numeric:true}));
  return '<table class="bom"><thead><tr><th>Poz</th><th>Profil</th><th>Adet</th><th>Boy</th><th>Delik</th></tr></thead><tbody>'+
    list.map(r => '<tr><td class="n">'+esc(r.p.pos)+(r.p.main ? ' <small class="muted">ana</small>' : '')+'</td><td>'+esc(r.p.prof)+'</td><td>'+r.n+'</td><td>'+(r.p.L ? fmt(r.p.L) : '')+'</td><td>'+(r.h ? r.h : '')+'</td></tr>').join('')+'</tbody></table>';
}
async function asmView(mark){
  const meta = INDEX.find(a => a.mark === mark);
  if(!meta){ notFound(mark); return; }
  setTitle(mark);
  $app.innerHTML = '<h1>'+esc(mark)+'</h1><p class="muted">Yükleniyor…</p>';
  let A;
  try{ A = await loadAsm(mark); }catch(e){ $app.innerHTML = '<h1>'+esc(mark)+'</h1><p class="warn">Veri yüklenemedi. data klasörü index.html ile aynı yerde olmalı.</p>'; return; }
  if(location.hash !== '#/m/'+mark) return;
  const S = [0,1,2].map(k => Math.max(...A.parts.map(p => p.bmax[k])));
  const dias = [...new Set(A.parts.flatMap(p => p.holes.map(h => Math.round(h[6]))))].sort((a,b)=>a-b);
  const nh = A.parts.reduce((s,p) => s + p.holes.length, 0);
  const pg = (PAGES.pages[mark]||[]);
  $app.innerHTML =
    '<div class="ptitle"><h1>'+esc(mark)+'</h1></div>'+
    '<div class="facts"><div class="fact"><span>Adet</span><b>'+A.qty+'</b></div><div class="fact"><span>Ana parça</span><b>'+esc(meta.main)+' '+esc(meta.mainProf)+'</b></div><div class="fact"><span>Parça</span><b>'+A.parts.length+'</b></div><div class="fact"><span>Delik</span><b>'+nh+'</b></div>'+(A.kg ? '<div class="fact"><span>Ağırlık</span><b>'+A.kg+' kg</b></div>' : '')+'</div>'+
    '<div class="viewer" id="viewer">'+(dias.length ? '<div class="legend">'+dias.map(d => '<span><i style="background:'+diaColor(d)+'"></i>ø'+d+'</span>').join('')+'</div>' : '')+'<span class="vhint">Tek parmak: çevir · iki parmak: yakınlaş / kaydır</span></div>'+
    '<div class="vbtns" id="vbtns"><button data-c="iso">İzometrik</button><button data-c="front">Önden</button><button data-c="back">Arkadan</button><button data-c="top">Üstten</button><button data-c="bottom">Alttan</button><button data-c="left">Sol uç</button><button data-c="right">Sağ uç</button></div>'+

    '<h2>Parça listesi</h2>'+bomTable(A)+
    '<h2>Çizimler</h2><div class="drawings">'+pg.map(n => '<img loading="lazy" src="'+imgSrc('d'+n)+'" alt="'+esc(mark)+' montaj çizimi">').join('')+'</div>';
  initViewer(); V.el = document.getElementById('viewer'); V.el.appendChild(V.renderer.domElement); resize();
  V.A = A; V.size = S; clearRoot(); V.root = buildScene(A); V.scene.add(V.root);
  const mark_ = c => document.querySelectorAll('#vbtns button').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === c));
  document.querySelectorAll('#vbtns button').forEach(b => b.onclick = () => { mark_(b.dataset.c); setCamera(b.dataset.c); });
  const first = 'iso';   // her montaj izometrik açılır
  mark_(first); setCamera(first);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if(V.A === A){ clearRoot(); V.root = buildScene(A); V.scene.add(V.root); setCamera(V.cam); } });
}
function notFound(what){ $app.innerHTML = '<h1>Bulunamadı</h1><p class="lead">"'+esc(what)+'" listede yok. Montaj numarasını yaz (örn. C/9, B/1, K/7).</p><p><a href="#/">Montajlara dön</a></p>'; }
function route(){
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, '')); let m;
  window.scrollTo(0,0);
  if((m = h.match(/^m\/([A-Z]+\/\d+)$/))) asmView(m[1]); else homeView();
}
document.getElementById('searchForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = document.getElementById('q').value.trim().toUpperCase().replace(/\s+/g,'').replace(/^([A-Z]+)-?(\d+)$/, '$1/$2');
  if(/^[A-Z]+\/\d+$/.test(q)) location.hash = '#/m/'+q; else notFound(q);
  document.getElementById('q').blur();
});
window.addEventListener('hashchange', route);
(window.IMALAT_INDEX ? Promise.resolve() : Promise.all([loadScript('data/index.js'), loadScript('data/pages.js')]))
  .then(() => { INDEX = window.IMALAT_INDEX; PAGES = window.IMALAT_PAGES; route(); })
  .catch(() => { $app.innerHTML = '<h1>Yüklenemedi</h1><p class="lead">Veri dosyaları bulunamadı. index.html, app.js, style.css, lib, data ve img aynı klasörde olmalı.</p>'; });
})();
