/* AD4 Studio — progressive mobile UX around pinned MosaicSlicer.
 * All slicing stays on the authenticated Python server. Never emulate G-code.
 * All physical printer actions are delegated to the existing AD4 manager.
 */
(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const staticPreview = window.__AD4_STATIC_PREVIEW__ === true;
  document.body.dataset.ad4Static = String(staticPreview);
  const sidebar = byId("sidebar");
  const sidebarContainer = byId("sidebar-container");
  const viewer = byId("viewer");
  if (!sidebar || !sidebarContainer || !viewer) return;

  const node = (tag, id, className, label) => {
    const item = document.createElement(tag);
    if (id) item.id = id;
    if (className) item.className = className;
    if (label) item.textContent = label;
    return item;
  };
  const isMobile = () => matchMedia("(max-width: 767px)").matches;
  // The upstream viewer tab clips overflowing children. A fixed settings
  // sheet inside it can be visually present but untouchable behind canvas.
  // Portal the sheet to <body> on phones; restore it for desktop layout.
  const sidebarParent = sidebarContainer.parentNode;
  const sidebarNext = sidebarContainer.nextSibling;
  function placeSettingsSheet() {
    if (isMobile() && sidebarContainer.parentNode !== document.body)
      document.body.append(sidebarContainer);
    else if (!isMobile() && sidebarContainer.parentNode !== sidebarParent)
      sidebarParent.insertBefore(sidebarContainer, sidebarNext);
  }
  placeSettingsSheet();
  const scrim = node("button", "ad4-sheet-scrim");
  scrim.type = "button";
  scrim.setAttribute("aria-label", "Close print settings");
  document.body.append(scrim);

  const sheetHeader = node("div", "ad4-sheet-header");
  sheetHeader.innerHTML = '<span class="ad4-handle" aria-hidden="true"></span>' +
    '<span class="ad4-heading"><small>ADVENTURER 4 · ARTILLERY PLA BASIC</small>' +
    '<strong>Print settings</strong></span>';
  const closeSheet = node("button", "ad4-sheet-close", "", "×");
  closeSheet.type = "button";
  closeSheet.setAttribute("aria-label", "Close print settings");
  sheetHeader.append(closeSheet);
  sidebar.prepend(sheetHeader);

  // Cura's native AD4 settings module now owns category/complexity tabs,
  // saved presets, reset controls and parameter help. Never duplicate its IDs.

  const setSheet = (open) => {
    const next = Boolean(open && isMobile());
    document.body.classList.toggle("ad4-sheet-open", next);
    sidebarContainer.setAttribute("aria-hidden", String(isMobile() && !next));
    settingsButton.setAttribute("aria-expanded", String(next));
    if (next) {
      closeSheet.focus({preventScroll:true});
    } else if (open && !isMobile()) {
      byId("setting-search")?.focus({preventScroll:true});
    }
  };
  scrim.addEventListener("click", () => setSheet(false));
  closeSheet.addEventListener("click", () => setSheet(false));
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && document.body.classList.contains("ad4-sheet-open")) {
      setSheet(false);
      settingsButton.focus({preventScroll:true});
    }
  });
  window.addEventListener("resize", () => {
    placeSettingsSheet();
    if (!isMobile()) document.body.classList.remove("ad4-sheet-open");
    sidebarContainer.setAttribute("aria-hidden",
      String(isMobile() && !document.body.classList.contains("ad4-sheet-open")));
    settingsButton.setAttribute("aria-expanded", String(document.body.classList.contains("ad4-sheet-open")));
  });
  sidebarContainer.setAttribute("aria-hidden", String(isMobile()));

  const pill = node("div", "ad4-model-pill");
  pill.innerHTML = '<span class="ad4-pill-dot"></span><strong>FlashForge Adventurer 4</strong>' +
    '<small>0.4 mm · Artillery PLA Basic</small>';
  viewer.append(pill);

  const hint = node("div", "ad4-empty-hint");
  hint.innerHTML = '<strong>Your build plate is ready</strong><span>Add an STL or 3MF model to begin. ' +
    'Adjust your slicing settings from the bottom bar.</span>';
  viewer.append(hint);

  const dock = node("nav", "ad4-bottom-dock");
  dock.setAttribute("aria-label", "Model and printer quick actions");
  dock.innerHTML = '<div id="ad4-dock-meta"><span id="ad4-dock-state" role="status">Loading model editor…</span>' +
    '<span id="ad4-dock-detail">Artillery PLA Basic · 0.4 mm</span></div>' +
    '<div id="ad4-dock-controls"></div>';
  document.body.append(dock);
  const controls = byId("ad4-dock-controls");
  const button = (id, label, classes, action) => {
    const b = node("button", id, classes, label);
    b.type = "button";
    b.addEventListener("click", action);
    controls.append(b);
    return b;
  };
  const settingsButton = button("ad4-dock-settings", "⚙ Settings", "ad4-dock-light",
    () => setSheet(!document.body.classList.contains("ad4-sheet-open") || !isMobile()));
  settingsButton.setAttribute("aria-expanded","false");
  settingsButton.setAttribute("aria-controls","sidebar-container");
  button("ad4-dock-model", "＋ Model", "ad4-dock-light",
    () => byId("stl-file")?.click());
  // Public Pages demo: a real manifold STL is opened through MosaicSlicer's
  // existing FileReader -> STLLoader -> Three.js model-viewer path.
  // This is a geometry preview only. We never synthesize print G-code.
  let demoPending = false;
  async function loadDemoModel() {
    if (demoPending) return;
    const editor = globalThis.app?.gui?.file;
    if (!editor?.load_file) return;
    demoPending = true;
    try {
      const res = await fetch("./demo-cube-20mm.stl", {cache:"force-cache"});
      if (!res.ok) throw Error("Demo STL not available (HTTP " + res.status + ")");
      const data = await res.blob();
      const sample = new File([data], "AD4_demo_cube_20mm.stl", {type:"model/stl"});
      editor.load_file(sample);
    } catch (error) {
      console.error("Could not load example STL", error);
      byId("ad4-dock-state").textContent = "Demo STL could not load";
    } finally {
      demoPending = false;
    }
  }
  const demoButton = button("ad4-dock-demo", "◈ Demo STL", "ad4-dock-light", loadDemoModel);
  demoButton.hidden = !staticPreview;
  const previewButton = button("ad4-dock-preview", "◫ Preview", "ad4-dock-light",
    () => byId("preview-tab-button")?.click());
  const sliceButton = button("ad4-dock-slice", "Slice model", "ad4-dock-primary",
    () => { if (!staticPreview && engineAvailable) byId("slice-button")?.click(); });
  const uploadButton = button("ad4-dock-upload", "Upload only", "ad4-dock-secondary",
    () => {
      if (staticPreview) return;
      byId("ad4-open-manager")?.click();
      byId("ad4-upload")?.click();
    });
  const printButton = button("ad4-dock-print", "Print", "ad4-dock-primary",
    () => {
      if (staticPreview) return;
      byId("ad4-open-manager")?.click();
      byId("ad4-send-print")?.click();
    });
  const stateNode = byId("ad4-dock-state");
  const detailNode = byId("ad4-dock-detail");
  let engineAvailable = false;
  let engineNotice = staticPreview ? "Public preview · slicing and printer controls require local server" :
    "Checking server slicer…";
  let lastHasModel = false;

  const demo = node("div", "ad4-demo-band", "", "DEMO · No server slicing");
  if (staticPreview) viewer.append(demo);

  // On Pages the actual bundled editor is usable for model viewing, not slicing.
  // Only the Linux origin can perform the native CuraEngine and AD4 operations.
  if (staticPreview) {
    byId("ad4-open-manager")?.setAttribute("disabled", "");
    byId("ad4-open-manager")?.setAttribute("title", "Available on the private Linux server");
    byId("preview-tab-button")?.setAttribute("title", "G-code preview requires server slicing");
    byId("slice-button")?.setAttribute("disabled", "");
  }
  async function checkPrinter() {
    if (staticPreview) return;
    const trigger = byId("ad4-open-manager");
    try {
      const response = await fetch("./api/printer/status", {cache:"no-store"});
      if (!response.ok) throw Error("Printer offline");
      const status = await response.json();
      const label = String(status.machine_status || status.status || "Unknown");
      const online = !/^(?:offline|disconnected|unknown|error)/i.test(label);
      document.body.classList.toggle("ad4-printer-online", online);
      if (trigger) {
        trigger.textContent = "AD4 · " + label.slice(0, 24);
        trigger.title = "Open printer manager · " + label;
      }
    } catch {
      document.body.classList.remove("ad4-printer-online");
      if (trigger) {
        trigger.textContent = "AD4 · Offline";
        trigger.title = "Open printer manager to diagnose connection";
      }
    }
  }
  async function checkEngine() {
    if (staticPreview) return;
    try {
      const response = await fetch("./api/slice/engine", {cache:"no-store"});
      const state = await response.json();
      engineAvailable = response.ok && state.available === true && state.location === "server";
      engineNotice = engineAvailable ? "CuraEngine ready · server" :
        (state.error || "Server engine unavailable");
    } catch {
      engineAvailable = false;
      engineNotice = "Cannot reach server CuraEngine";
    }
    refreshDock();
  }
  function refreshDock() {
    const app = globalThis.app;
    const gcode = app?.gui?.slicer?.exported_gcode;
    const modelName = app?.gui?.file?.stl_file_name;
    const progress = byId("slice-progress-container")?.dataset.active === "true";
    const hasGcode = typeof gcode === "string" && /^(?:G[01]\s|M10[49]\b)/m.test(gcode);
    const hasModel = Boolean(modelName);
    const exported = hasGcode && byId("slice-export-container")?.dataset.active === "true";
    document.body.classList.toggle("ad4-has-model", hasModel);
    const name = modelName ? String(modelName).split(/[\\/]/).pop() : "";
    if (progress) stateNode.textContent = "CuraEngine slicing on server…";
    else if (exported) stateNode.textContent = "G-code ready · " + name;
    else if (hasModel) stateNode.textContent = "Ready to slice · " + name;
    else stateNode.textContent = "No model loaded";
    const estimate = byId("gcode-time-estimate")?.textContent?.trim();
    const filament = byId("material-estimate")?.textContent?.trim();
    detailNode.textContent = exported && estimate ? [estimate,filament].filter(Boolean).join(" · ") : engineNotice;
    detailNode.title = detailNode.textContent;
    previewButton.hidden = !exported;
    sliceButton.hidden = exported;
    uploadButton.hidden = !exported;
    printButton.hidden = !exported;
    sliceButton.disabled = staticPreview || !engineAvailable || !hasModel || progress;
    sliceButton.textContent = progress ? "Slicing…" : "Slice model";
    uploadButton.disabled = staticPreview || !exported;
    printButton.disabled = staticPreview || !exported;
    if (hasModel !== lastHasModel) {
      lastHasModel = hasModel;
      if (hasModel) setSheet(false);
    }
  }

  byId("stl-file")?.addEventListener("change", () => setTimeout(refreshDock,500));
  byId("prepare-tab-button")?.addEventListener("click", refreshDock);
  byId("preview-tab-button")?.addEventListener("click", () => setSheet(false));
  byId("ad4-open-manager")?.addEventListener("click", () => setSheet(false));
  if (staticPreview) {
    stateNode.textContent = "Model viewer · public demo";
    detailNode.textContent = engineNotice;
  }
  if (staticPreview) {
    // Boot may finish before or after this independent UI overlay.
    // Only auto-populate an EMPTY plate after the complete editor has loaded.
    let sampleStarted = false;
    const timer = setInterval(() => {
      if (sampleStarted) return clearInterval(timer);
      const ready = byId("loading")?.style.display === "none";
      if (!ready || byId("ad4-startup-error")) return;
      sampleStarted = true;
      clearInterval(timer);
      if (!globalThis.app?.gui?.file?.stl_file_name) loadDemoModel();
    }, 400);
  }
  checkEngine();
  checkPrinter();
  refreshDock();
  setInterval(refreshDock, 800);
  if (!staticPreview) {
    setInterval(checkEngine, 30000);
    setInterval(checkPrinter, 12000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) { checkEngine(); checkPrinter(); }
    });
  }
})();
