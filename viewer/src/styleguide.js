// Renders every icon in the built sprite sheet, so the set can be judged as a set.
// Reads the same manifest MapLibre does, meaning it always shows the current
// `bin/sprites` output rather than a hand-kept list that drifts.
const SHEET = "/sprites/freenauticalchart";
const PREVIEW = 86; // px; matches .preview in the page

const [manifest, sheet] = await Promise.all([
  fetch(`${SHEET}.json`).then((r) => {
    if (!r.ok)
      throw new Error(`no sprite manifest at ${SHEET}.json (${r.status}) — run bin/sprites`);
    return r.json();
  }),
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`no sprite sheet at ${SHEET}.png — run bin/sprites`));
    img.src = `${SHEET}.png`;
  }),
]);

const names = Object.keys(manifest).sort();
// Generated combinations (`pillar/horizontal/red_white`) dwarf the hand-drawn
// singletons, so the flat names get their own group and lead — those are the
// ones a style decision is actually about.
const groupOf = (name) => (name.includes("/") ? name.split("/")[0] : "(single symbols)");
const groups = [...new Set(names.map(groupOf))].sort((a, b) =>
  a === "(single symbols)" ? -1 : b === "(single symbols)" ? 1 : a.localeCompare(b),
);

const $ = (id) => document.getElementById(id);
$("group").append(
  new Option("all", ""),
  ...groups.map((g) => new Option(`${g} (${names.filter((n) => groupOf(n) === g).length})`, g)),
);
$("group").value = "(single symbols)";

// `?q=poi-&sea=%23333333` makes any view of the sheet linkable, so a symbol
// under discussion can be pointed at rather than described.
const params = new URLSearchParams(location.search);
for (const id of ["q", "group", "sea"]) if (params.has(id)) $(id).value = params.get(id);

// Cap the DOM rather than the result count — the full sheet is ~5k icons and
// each card carries a background of a multi-megabyte image.
const LIMIT = 400;

function sprite(name, scale) {
  const { x, y, width, height } = manifest[name];
  const el = document.createElement("div");
  el.className = "sprite";
  el.style.width = `${width * scale}px`;
  el.style.height = `${height * scale}px`;
  el.style.backgroundImage = `url(${SHEET}.png)`;
  el.style.backgroundSize = `${sheet.naturalWidth * scale}px ${sheet.naturalHeight * scale}px`;
  el.style.backgroundPosition = `${-x * scale}px ${-y * scale}px`;
  // Blocky upscales are the point when inspecting; downscales should stay smooth.
  el.style.imageRendering = scale > 1 ? "pixelated" : "auto";
  return el;
}

function card(name) {
  const { width, height } = manifest[name];
  const el = document.createElement("div");
  el.className = "card";
  el.tabIndex = 0;
  el.dataset.name = name;
  el.setAttribute("role", "option");
  el.setAttribute("aria-selected", "false");

  const label = document.createElement("div");
  label.className = "name";
  label.textContent = name;

  // Only ever shrink: an icon smaller than the box stays at true size, so the
  // grid reads as a set of real sizes rather than everything normalised.
  const fit = Math.min(1, PREVIEW / width, PREVIEW / height);
  const dims = document.createElement("div");
  dims.className = "dims";
  dims.textContent = fit < 1 ? `${width}×${height} · ${fit.toFixed(2)}×` : `${width}×${height}`;

  const preview = document.createElement("div");
  preview.className = "preview";
  preview.append(sprite(name, fit));

  el.append(label, dims, preview);
  return el;
}

let selected = null;

function showDetail(name) {
  selected = name;
  const m = manifest[name];
  $("d-name").textContent = name;
  $("d-size").textContent = `${m.width} × ${m.height}`;
  $("d-xy").textContent = `${m.x}, ${m.y}`;
  $("d-ink").textContent = inkCoverage(name);
  $("detail").classList.add("open");
  document.querySelector("main").classList.add("with-detail");
  for (const c of document.querySelectorAll(".card")) {
    c.setAttribute("aria-selected", String(c.dataset.name === name));
  }
  renderZoom();
}

function hideDetail() {
  selected = null;
  $("detail").classList.remove("open");
  document.querySelector("main").classList.remove("with-detail");
  for (const c of document.querySelectorAll(".card")) c.setAttribute("aria-selected", "false");
}

function renderZoom() {
  if (!selected) return;
  const { width, height } = manifest[selected];
  const zoom = Number($("zoom").value);

  // The frame is the artwork's exact scaled box, so grid lines fall on source
  // pixel boundaries instead of wherever the container happens to start.
  const frame = document.createElement("div");
  frame.className = "pixelframe";
  frame.style.width = `${width * zoom}px`;
  frame.style.height = `${height * zoom}px`;
  if ($("grid-toggle").checked) {
    frame.style.backgroundImage =
      "linear-gradient(to right, rgba(0,0,0,.18) 1px, transparent 1px)," +
      "linear-gradient(to bottom, rgba(0,0,0,.18) 1px, transparent 1px)";
    frame.style.backgroundSize = `${zoom}px ${zoom}px`;
  }
  const img = sprite(selected, zoom);
  img.classList.add("zoomed");
  frame.append(img);
  $("zoomBox").replaceChildren(frame);
}

// Share of the icon box that is actually inked — the sheet's line art sits
// around 11-22%, so it's the quickest tell that a symbol is too heavy.
const inkCache = new Map();
function inkCoverage(name) {
  if (!inkCache.has(name)) {
    const { x, y, width, height } = manifest[name];
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(sheet, x, y, width, height, 0, 0, width, height);
    const d = ctx.getImageData(0, 0, width, height).data;
    let on = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 128) on++;
    inkCache.set(name, `${((on / (width * height)) * 100).toFixed(1)}%`);
  }
  return inkCache.get(name);
}

function render() {
  const q = $("q").value.trim().toLowerCase();
  const group = $("group").value;
  document.documentElement.style.setProperty("--sea", $("sea").value);
  const url = new URLSearchParams({ q, group, sea: $("sea").value });
  history.replaceState(null, "", q || group ? `?${url}` : location.pathname);

  // Comma-separated terms are OR'd, so unrelated symbols can be pulled into one
  // view to be compared — the whole point when settling a house style.
  const terms = q
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const matches = names.filter(
    (n) =>
      (!group || groupOf(n) === group) &&
      (!terms.length || terms.some((t) => n.toLowerCase().includes(t))),
  );
  const shown = matches.slice(0, LIMIT);

  $("grid").replaceChildren(...shown.map(card));
  if (selected) {
    for (const c of document.querySelectorAll(".card")) {
      c.setAttribute("aria-selected", String(c.dataset.name === selected));
    }
  }
  $("count").textContent =
    shown.length < matches.length
      ? `${shown.length} of ${matches.length} shown (${names.length} in sheet)`
      : `${matches.length} of ${names.length} in sheet`;
}

$("grid").addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (card) showDetail(card.dataset.name);
});
$("grid").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const card = e.target.closest(".card");
  if (card) {
    e.preventDefault();
    showDetail(card.dataset.name);
  }
});
$("close").addEventListener("click", hideDetail);
document.addEventListener("keydown", (e) => e.key === "Escape" && hideDetail());
for (const id of ["zoom", "grid-toggle"]) $(id).addEventListener("input", renderZoom);
for (const id of ["q", "group", "sea"]) $(id).addEventListener("input", render);
render();
