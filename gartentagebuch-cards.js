// Gartentagebuch Felder-Card f\u00fcr Home Assistant
// Zeigt Standorte + Felder mit aktueller Belegung, \u00f6ffnet Ernte-/Pflanzen-Modal
// Spricht direkt mit der Gartentagebuch-App-API (/garten/api)

class GartentagebuchFelderCard extends HTMLElement {
  setConfig(config) {
    if (!config.api_base) throw new Error("api_base ist erforderlich, z.B. https://gartentagebuch.heyder-assistant.de/garten/api");
    this._config = config;
    this._beds = [];
    this._occupancy = {};
    this._plants = [];
    this._loaded = false;
    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
      this._render();
    }
    this._loadData();
  }

  set hass(hass) { this._hass = hass; }

  getCardSize() { return 4; }

  static getConfigElement() {
    return document.createElement("gartentagebuch-felder-card-editor");
  }

  static getStubConfig() {
    return { title: "Garten", api_base: "" };
  }

  async _loadData() {
    const base = this._config.api_base.replace(/\/$/, "");
    try {
      const [beds, occ, plants] = await Promise.all([
        fetch(`${base}/beds`).then(r => r.json()),
        fetch(`${base}/beds/occupancy`).then(r => r.json()),
        fetch(`${base}/plants`).then(r => r.json()).catch(() => [])
      ]);
      this._beds = beds;
      this._occupancy = occ;
      this._plants = plants;
      this._loaded = true;
      this._renderGrid();
    } catch (e) {
      this._loaded = "error";
      this._renderGrid(e.message);
    }
  }

  _render() {
    this._root.innerHTML = `
      <style>
        :host { --gt-green-deep:#2d5016; --gt-green-mid:#4a7c2f; --gt-harvest:#e8a020; --gt-harvest-pale:#fdf0d0;
                --gt-cream:#f9f5ec; --gt-cream-dark:#ede8d8; --gt-white:#fff;
                --gt-text-fixed:#2a2a1e; --gt-text-muted-fixed:#6b6b50;
                --gt-text-adaptive: var(--primary-text-color, #2a2a1e);
                --gt-text-muted-adaptive: var(--secondary-text-color, #6b6b50);
                --gt-title-color: var(--primary-text-color, #2d5016); }
        ha-card { padding: 16px 18px; font-family: 'Lato', sans-serif; }
        .gt-title { font-size:1.15rem; font-weight:700; color:var(--gt-title-color); margin-bottom:14px; display:flex; align-items:center; gap:8px; }
        .gt-standort { margin-bottom: 18px; }
        .gt-standort-name { font-size:.78rem; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--gt-text-muted-adaptive); margin-bottom:8px; }
        .gt-felder { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:10px; }
        .gt-feld { background:var(--gt-cream); border:1.5px solid var(--gt-cream-dark); border-radius:12px; padding:12px 10px; cursor:pointer; transition:.15s; text-align:center; }
        .gt-feld:hover { border-color: var(--gt-green-mid); transform: translateY(-1px); }
        .gt-feld.leer { opacity:.6; }
        .gt-feld.geplant { border-style:dashed; border-color:var(--gt-harvest); }
        .gt-feld-badge { font-size:.68rem; font-weight:700; color:#8a5a00; background:var(--gt-harvest-pale); border-radius:6px; padding:1px 6px; display:inline-block; margin-top:2px; }
        .gt-feld-badge-dauerhaft { color:var(--gt-green-deep); background:#e8f5d8; }
        .gt-feld-name { font-size:.72rem; font-weight:700; color:var(--gt-text-muted-fixed); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
        .gt-feld-emoji { font-size:1.6rem; }
        .gt-feld-plant { font-size:.85rem; font-weight:600; color:var(--gt-text-fixed); margin-top:2px; }
        .gt-feld-empty-label { font-size:.8rem; color:var(--gt-text-muted-fixed); margin-top:2px; }
        .gt-loading, .gt-error { color:var(--gt-text-muted-adaptive); font-size:.9rem; padding:8px 0; }
        .gt-error { color:#c0392b; }

        .gt-modal-backdrop { display:none; position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:1000; align-items:center; justify-content:center; padding:16px; }
        .gt-modal-backdrop.open { display:flex; }
        .gt-modal { background:var(--gt-white); border-radius:16px; padding:26px 22px; max-width:420px; width:100%; box-shadow:0 8px 40px rgba(0,0,0,.3); }
        .gt-modal-title { font-size:1.15rem; font-weight:700; color:var(--gt-green-deep); margin-bottom:6px; }
        .gt-modal-sub { font-size:.88rem; color:var(--gt-text-muted-fixed); margin-bottom:16px; }
        .gt-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .gt-form-full { grid-column: span 2; }
        .gt-form-grid label { display:block; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--gt-text-muted-fixed); margin-bottom:4px; }
        .gt-form-grid input, .gt-form-grid select { width:100%; box-sizing:border-box; padding:9px 11px; border:1.5px solid var(--gt-cream-dark); border-radius:8px; font-size:.92rem; color:var(--gt-text-fixed); background:var(--gt-cream); }
        .gt-modal-actions { display:flex; gap:8px; margin-top:16px; flex-wrap:wrap; }
        .gt-btn { border:none; border-radius:10px; padding:10px 14px; font-weight:700; font-size:.88rem; cursor:pointer; font-family:'Lato',sans-serif; }
        .gt-btn-cancel { background:none; border:1.5px solid var(--gt-cream-dark); color:var(--gt-text-muted-fixed); }
        .gt-btn-teil { flex:1; background:linear-gradient(135deg,#f0ad3d,var(--gt-harvest)); color:#5a3a00; }
        .gt-btn-final { flex:1; background:linear-gradient(135deg,#c0392b,#922b21); color:#fff; }
        .gt-btn-pflanzen { flex:1; background:linear-gradient(135deg,var(--gt-green-mid),var(--gt-green-deep)); color:#fff; }
      </style>
      <ha-card>
        <div class="gt-title">\u{1F33F} ${this._config.title || "Garten"}</div>
        <div class="gt-grid-container"><div class="gt-loading">Lade\u2026</div></div>
      </ha-card>

      <div class="gt-modal-backdrop" id="harvest-backdrop">
        <div class="gt-modal">
          <div class="gt-modal-title">\u{1F33E} Ernte eintragen</div>
          <div class="gt-modal-sub" id="harvest-sub"></div>
          <div class="gt-form-grid">
            <div><label>Datum</label><input type="date" id="h-date"></div>
            <div><label>Menge (optional)</label><input type="number" step="0.001" min="0" placeholder="z.B. 1.5" id="h-amount"></div>
            <div>
              <label>Einheit</label>
              <select id="h-unit"><option value="kg">kg</option><option value="g">g</option><option value="St\u00fcck">St\u00fcck</option></select>
            </div>
            <div class="gt-form-full"><label>Notiz (optional)</label><input type="text" placeholder="z.B. erste Ernte, sehr s\u00fc\u00df\u2026" id="h-note"></div>
          </div>
          <div class="gt-modal-actions">
            <button class="gt-btn gt-btn-cancel" id="h-cancel">Abbrechen</button>
            <button class="gt-btn gt-btn-teil" id="h-teil">\u{1F33E} Teilernte</button>
            <button class="gt-btn gt-btn-final" id="h-final">\u{2713} Endg\u00fcltig ernten</button>
          </div>
        </div>
      </div>

      <div class="gt-modal-backdrop" id="plant-backdrop">
        <div class="gt-modal">
          <div class="gt-modal-title">\u{1F331} Pflanzen eintragen</div>
          <div class="gt-modal-sub" id="plant-sub"></div>
          <div class="gt-form-grid">
            <div class="gt-form-full">
              <label>Pflanze</label>
              <select id="p-plant"></select>
            </div>
            <div><label>Datum</label><input type="date" id="p-date"></div>
          </div>
          <div class="gt-modal-actions">
            <button class="gt-btn gt-btn-cancel" id="p-cancel">Abbrechen</button>
            <button class="gt-btn gt-btn-pflanzen" id="p-save">\u{1F331} Pflanzen</button>
          </div>
        </div>
      </div>
    `;

    this._root.getElementById("h-cancel").onclick = () => this._closeHarvestModal();
    this._root.getElementById("p-cancel").onclick = () => this._closePlantModal();
    this._root.getElementById("h-teil").onclick = () => this._saveHarvest(false);
    this._root.getElementById("h-final").onclick = () => this._saveHarvest(true);
    this._root.getElementById("p-save").onclick = () => this._savePlant();
  }

  _renderGrid(errorMsg) {
    const container = this._root.querySelector(".gt-grid-container");
    if (this._loaded === "error") {
      container.innerHTML = `<div class="gt-error">Fehler beim Laden: ${errorMsg || "unbekannt"}. L\u00e4uft CORS auf der App?</div>`;
      return;
    }
    if (!this._loaded) {
      container.innerHTML = `<div class="gt-loading">Lade\u2026</div>`;
      return;
    }

    let roots = this._beds.filter(b => !b.parent_id);
    if (this._config.standort_id) roots = roots.filter(b => b.id === this._config.standort_id);

    if (!roots.length) {
      container.innerHTML = `<div class="gt-loading">Keine Standorte gefunden.</div>`;
      return;
    }

    const getLeaves = (bed) => {
      const children = this._beds.filter(b => b.parent_id === bed.id);
      if (!children.length) return [bed];
      return children.flatMap(getLeaves);
    };

    container.innerHTML = roots.map(standort => {
      const zielListe = getLeaves(standort);
      const tiles = zielListe.map(feld => {
        const occ = (this._occupancy[feld.id] || [])[0];
        if (occ && (occ.source === "tagebuch" || occ.source === "dauerhaft")) {
          const badge = occ.source === "dauerhaft" ? `<div class="gt-feld-badge gt-feld-badge-dauerhaft">Dauerhaft</div>` : "";
          return `<div class="gt-feld" data-bed-id="${feld.id}" data-action="harvest" data-plant="${this._esc(occ.plant)}" data-emoji="${occ.emoji || "\u{1F331}"}">
            <div class="gt-feld-name">${this._esc(feld.name)}</div>
            <div class="gt-feld-emoji">${occ.emoji || "\u{1F331}"}</div>
            <div class="gt-feld-plant">${this._esc(occ.plant)}</div>
            ${badge}
          </div>`;
        }
        if (occ && occ.source === "planer") {
          return `<div class="gt-feld geplant" data-bed-id="${feld.id}" data-action="plant" data-preselect="${this._esc(occ.plant)}">
            <div class="gt-feld-name">${this._esc(feld.name)}</div>
            <div class="gt-feld-emoji">${occ.emoji || "\u{1F331}"}</div>
            <div class="gt-feld-plant">${this._esc(occ.plant)}</div>
            <div class="gt-feld-badge">Geplant</div>
          </div>`;
        }
        return `<div class="gt-feld leer" data-bed-id="${feld.id}" data-action="plant">
          <div class="gt-feld-name">${this._esc(feld.name)}</div>
          <div class="gt-feld-emoji">\u{2795}</div>
          <div class="gt-feld-empty-label">leer</div>
        </div>`;
      }).join("");
      return `<div class="gt-standort">
        <div class="gt-standort-name">${this._esc(standort.name)}</div>
        <div class="gt-felder">${tiles}</div>
      </div>`;
    }).join("");

    container.querySelectorAll(".gt-feld").forEach(el => {
      el.onclick = () => {
        const bedId = parseInt(el.dataset.bedId, 10);
        if (el.dataset.action === "harvest") {
          this._openHarvestModal(bedId, el.dataset.plant, el.dataset.emoji);
        } else {
          this._openPlantModal(bedId, el.dataset.preselect || null);
        }
      };
    });
  }

  _esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  _today() { return new Date().toISOString().split("T")[0]; }

  _openHarvestModal(bedId, plant, emoji) {
    const bed = this._beds.find(b => b.id === bedId);
    this._activeBedId = bedId;
    this._activePlant = plant;
    this._activeEmoji = emoji;
    this._root.getElementById("harvest-sub").textContent = `${emoji} ${plant} \u00b7 ${bed ? bed.name : ""}`;
    this._root.getElementById("h-date").value = this._today();
    this._root.getElementById("h-amount").value = "";
    this._root.getElementById("h-unit").value = "kg";
    this._root.getElementById("h-note").value = "";
    this._root.getElementById("harvest-backdrop").classList.add("open");
  }
  _closeHarvestModal() { this._root.getElementById("harvest-backdrop").classList.remove("open"); }

  _openPlantModal(bedId, preselectName) {
    const bed = this._beds.find(b => b.id === bedId);
    this._activeBedId = bedId;
    this._root.getElementById("plant-sub").textContent = (bed ? bed.name : "") + (preselectName ? " \u00b7 laut Planung: " + preselectName : "");
    const sel = this._root.getElementById("p-plant");
    sel.innerHTML = this._plants.map(p => `<option value="${p.id}" data-emoji="${p.emoji}" data-fam="${p.plant_family_id || ""}">${p.emoji} ${this._esc(p.name)}</option>`).join("");
    if (preselectName) {
      const match = this._plants.find(p => p.name.toLowerCase() === preselectName.toLowerCase());
      if (match) sel.value = String(match.id);
    }
    this._root.getElementById("p-date").value = this._today();
    this._root.getElementById("plant-backdrop").classList.add("open");
  }
  _closePlantModal() { this._root.getElementById("plant-backdrop").classList.remove("open"); }

  async _saveHarvest(final) {
    const base = this._config.api_base.replace(/\/$/, "");
    const amount = this._root.getElementById("h-amount").value;
    const body = {
      id: Date.now(),
      emoji: this._activeEmoji,
      plant: this._activePlant,
      date: this._root.getElementById("h-date").value,
      cat: "harvest",
      bed_id: this._activeBedId,
      description: this._root.getElementById("h-note").value || (final ? "Letzte Ernte" : ""),
      harvest_amount: amount ? parseFloat(amount) : null,
      harvest_unit: this._root.getElementById("h-unit").value,
      harvest_final: !!final
    };
    try {
      const r = await fetch(`${base}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      this._closeHarvestModal();
      await this._loadData();
    } catch (e) {
      alert("Fehler beim Speichern: " + e.message);
    }
  }

  async _savePlant() {
    const base = this._config.api_base.replace(/\/$/, "");
    const sel = this._root.getElementById("p-plant");
    const opt = sel.options[sel.selectedIndex];
    if (!opt) { alert("Bitte Pflanze w\u00e4hlen"); return; }
    const body = {
      id: Date.now(),
      emoji: opt.dataset.emoji || "\u{1F331}",
      plant: opt.textContent.trim().replace(/^\S+\s/, ""),
      date: this._root.getElementById("p-date").value,
      cat: "plant",
      bed_id: this._activeBedId,
      plant_id: parseInt(opt.value, 10),
      plant_family_id: opt.dataset.fam ? parseInt(opt.dataset.fam, 10) : null
    };
    try {
      const r = await fetch(`${base}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      this._closePlantModal();
      await this._loadData();
    } catch (e) {
      alert("Fehler beim Speichern: " + e.message);
    }
  }
}

customElements.define("gartentagebuch-felder-card", GartentagebuchFelderCard);

class GartentagebuchFelderCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _schema() {
    return [
      { name: "title", selector: { text: {} } },
      { name: "api_base", selector: { text: {} } },
      { name: "standort_id", selector: { number: { mode: "box" } } }
    ];
  }

  _labels(name) {
    const map = {
      title: "Titel",
      api_base: "API Basis-URL (z.B. http://DEINE-IP-ODER-DOMAIN:3002/garten/api)",
      standort_id: "Standort-ID (optional, nur einen Standort anzeigen)"
    };
    return map[name] || name;
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        this._config = ev.detail.value;
        this.dispatchEvent(new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true
        }));
      });
      this.innerHTML = "";
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
    this._form.schema = this._schema();
    this._form.computeLabel = (s) => this._labels(s.name);
  }
}

customElements.define("gartentagebuch-felder-card-editor", GartentagebuchFelderCardEditor);

class GartentagebuchGehoelzeCard extends HTMLElement {
  setConfig(config) {
    if (!config.api_base) throw new Error("api_base ist erforderlich, z.B. http://DEINE-IP-ODER-DOMAIN:3002/garten/api");
    this._config = config;
    this._items = [];
    this._plants = [];
    this._loaded = false;
    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
      this._render();
    }
    this._loadData();
  }

  set hass(hass) { this._hass = hass; }

  getCardSize() { return 3; }

  static getConfigElement() {
    return document.createElement("gartentagebuch-gehoelze-card-editor");
  }

  static getStubConfig() {
    return { title: "Gehoelze", api_base: "" };
  }

  async _loadData() {
    const base = this._config.api_base.replace(/\/$/, "");
    try {
      const [items, plants] = await Promise.all([
        fetch(`${base}/perennials`).then(r => r.json()),
        fetch(`${base}/plants`).then(r => r.json()).catch(() => [])
      ]);
      this._items = items.filter(i => !i.removed_year);
      this._plants = plants;
      this._loaded = true;
      this._renderList();
    } catch (e) {
      this._loaded = "error";
      this._renderList(e.message);
    }
  }

  _render() {
    this._root.innerHTML = `
      <style>
        :host { --gh-green-deep:#2d5016; --gh-green-mid:#4a7c2f; --gh-cream:#f9f5ec; --gh-cream-dark: var(--divider-color, #ede8d8);
                --gh-text: var(--primary-text-color, #2a2a1e);
                --gh-text-muted: var(--secondary-text-color, #6b6b50);
                --gh-text-fixed:#2a2a1e; --gh-text-muted-fixed:#6b6b50;
                --gh-white:#fff; --gh-red:#c0392b; --gh-title-color: var(--primary-text-color, #2d5016); }
        ha-card { padding: 16px 18px; font-family: 'Lato', sans-serif; }
        .gh-title { font-size:1.15rem; font-weight:700; color:var(--gh-title-color); margin-bottom:14px; display:flex; align-items:center; gap:8px; }
        .gh-row { display:flex; align-items:center; gap:12px; padding:10px 8px; border-bottom:1px solid var(--gh-cream-dark); cursor:pointer; }
        .gh-row:last-child { border-bottom:none; }
        .gh-row:hover { background: var(--secondary-background-color, var(--gh-cream)); }
        .gh-emoji { font-size:1.5rem; width:2rem; text-align:center; flex-shrink:0; }
        .gh-info { flex:1; min-width:0; }
        .gh-name { font-weight:700; color:var(--gh-text); font-size:.95rem; }
        .gh-meta { font-size:.8rem; color:var(--gh-text-muted); margin-top:2px; }
        .gh-add-row { display:flex; align-items:center; justify-content:center; gap:8px; padding:12px; margin-top:8px; border:1.5px dashed var(--gh-cream-dark); border-radius:10px; cursor:pointer; color:var(--gh-text-muted); font-weight:700; font-size:.88rem; }
        .gh-add-row:hover { border-color:var(--gh-green-mid); color:var(--gh-green-deep); }
        .gh-loading, .gh-error, .gh-empty { color:var(--gh-text-muted); font-size:.9rem; padding:8px 0; }
        .gh-error { color:var(--gh-red); }

        .gh-modal-backdrop { display:none; position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:1000; align-items:center; justify-content:center; padding:16px; }
        .gh-modal-backdrop.open { display:flex; }
        .gh-modal { background:var(--gh-white); border-radius:16px; padding:26px 22px; max-width:420px; width:100%; box-shadow:0 8px 40px rgba(0,0,0,.3); }
        .gh-modal-title { font-size:1.15rem; font-weight:700; color:var(--gh-green-deep); margin-bottom:16px; }
        .gh-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .gh-form-full { grid-column: span 2; }
        .gh-form-grid label { display:block; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--gh-text-muted-fixed); margin-bottom:4px; }
        .gh-form-grid input, .gh-form-grid select { width:100%; box-sizing:border-box; padding:9px 11px; border:1.5px solid var(--gh-cream-dark); border-radius:8px; font-size:.92rem; color:var(--gh-text-fixed); background:var(--gh-cream); }
        .gh-modal-actions { display:flex; gap:8px; margin-top:16px; flex-wrap:wrap; }
        .gh-btn { border:none; border-radius:10px; padding:10px 14px; font-weight:700; font-size:.88rem; cursor:pointer; font-family:'Lato',sans-serif; }
        .gh-btn-cancel { background:none; border:1.5px solid var(--gh-cream-dark); color:var(--gh-text-muted-fixed); }
        .gh-btn-save { flex:1; background:linear-gradient(135deg,var(--gh-green-mid),var(--gh-green-deep)); color:#fff; }
        .gh-btn-remove { background:none; border:1.5px solid var(--gh-red); color:var(--gh-red); }
        .gh-btn-harvest-open { background:none; border:1.5px solid var(--gh-green-mid); color:var(--gh-green-deep); }

        /* Ernte-Modal: bewusst dunkles Design */
        .gh-dark-modal { background:#1e1e1e; border-radius:16px; padding:26px 22px; max-width:420px; width:100%; box-shadow:0 8px 40px rgba(0,0,0,.5); border:1px solid #333; }
        .gh-dark-modal-title { font-size:1.15rem; font-weight:700; color:#f2f2f2; margin-bottom:6px; }
        .gh-dark-modal-sub { font-size:.88rem; color:#a8a8a8; margin-bottom:16px; }
        .gh-dark-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .gh-dark-form-full { grid-column: span 2; }
        .gh-dark-form-grid label { display:block; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:#9a9a9a; margin-bottom:4px; }
        .gh-dark-form-grid input, .gh-dark-form-grid select { width:100%; box-sizing:border-box; padding:9px 11px; border:1.5px solid #3a3a3a; border-radius:8px; font-size:.92rem; color:#f2f2f2; background:#2a2a2a; }
        .gh-dark-form-grid input::placeholder { color:#777; }
        .gh-dark-modal-actions { display:flex; gap:8px; margin-top:16px; flex-wrap:wrap; }
        .gh-dark-btn { border:none; border-radius:10px; padding:10px 14px; font-weight:700; font-size:.88rem; cursor:pointer; font-family:'Lato',sans-serif; }
        .gh-dark-btn-cancel { background:none; border:1.5px solid #3a3a3a; color:#c0c0c0; }
        .gh-dark-btn-teil { flex:1; background:linear-gradient(135deg,#f0ad3d,#e8a020); color:#3a2600; }
        .gh-dark-btn-roden { flex:1; background:linear-gradient(135deg,#c0392b,#7a1f16); color:#fff; }
      </style>
      <ha-card>
        <div class="gh-title">\u{1F333} ${this._config.title || "Gehoelze"}</div>
        <div class="gh-list-container"><div class="gh-loading">Lade\u2026</div></div>
      </ha-card>

      <div class="gh-modal-backdrop" id="gh-modal-backdrop">
        <div class="gh-modal">
          <div class="gh-modal-title" id="gh-modal-title">\u{1F333} Geh\u00f6lz hinzuf\u00fcgen</div>
          <div class="gh-form-grid">
            <div class="gh-form-full"><label>Name</label><input type="text" id="gh-name" placeholder="z.B. Apfelbaum Boskoop"></div>
            <div class="gh-form-full">
              <label>Pflanze (optional, f\u00fcr Emoji/Familie)</label>
              <select id="gh-plant"><option value="">\u2013 keine \u2013</option></select>
            </div>
            <div><label>Pflanzjahr</label><input type="number" id="gh-year"></div>
            <div class="gh-form-full"><label>Standort-Notiz (optional)</label><input type="text" id="gh-location" placeholder="z.B. Ecke hinterer Zaun"></div>
          </div>
          <div class="gh-modal-actions">
            <button class="gh-btn gh-btn-cancel" id="gh-cancel">Abbrechen</button>
            <button class="gh-btn gh-btn-harvest-open" id="gh-harvest-open" style="display:none">\u{1F33E} Ernte</button>
            <button class="gh-btn gh-btn-remove" id="gh-remove" style="display:none">Entfernt markieren</button>
            <button class="gh-btn gh-btn-save" id="gh-save">Speichern</button>
          </div>
        </div>
      </div>

      <div class="gh-modal-backdrop" id="gh-harvest-backdrop">
        <div class="gh-dark-modal">
          <div class="gh-dark-modal-title">\u{1F33E} Ernte eintragen</div>
          <div class="gh-dark-modal-sub" id="gh-harvest-sub"></div>
          <div class="gh-dark-form-grid">
            <div><label>Datum</label><input type="date" id="gh-h-date"></div>
            <div><label>Menge (optional)</label><input type="number" step="0.001" min="0" placeholder="z.B. 1.5" id="gh-h-amount"></div>
            <div>
              <label>Einheit</label>
              <select id="gh-h-unit"><option value="kg">kg</option><option value="g">g</option><option value="St\u00fcck">St\u00fcck</option></select>
            </div>
            <div class="gh-dark-form-full"><label>Notiz (optional)</label><input type="text" placeholder="z.B. erste Ernte, sehr s\u00fc\u00df\u2026" id="gh-h-note"></div>
          </div>
          <div class="gh-dark-modal-actions">
            <button class="gh-dark-btn gh-dark-btn-cancel" id="gh-h-cancel">Abbrechen</button>
            <button class="gh-dark-btn gh-dark-btn-teil" id="gh-h-teil">\u{1F33E} Teilernte</button>
            <button class="gh-dark-btn gh-dark-btn-roden" id="gh-h-roden">\u{1FA93} Roden</button>
          </div>
        </div>
      </div>
    `;

    this._root.getElementById("gh-cancel").onclick = () => this._closeModal();
    this._root.getElementById("gh-save").onclick = () => this._save();
    this._root.getElementById("gh-remove").onclick = () => this._markRemoved();
    this._root.getElementById("gh-harvest-open").onclick = () => this._openHarvestModal();
    this._root.getElementById("gh-h-cancel").onclick = () => this._closeHarvestModal();
    this._root.getElementById("gh-h-teil").onclick = () => this._saveHarvest(false);
    this._root.getElementById("gh-h-roden").onclick = () => this._saveHarvest(true);
  }

  _renderList(errorMsg) {
    const container = this._root.querySelector(".gh-list-container");
    if (this._loaded === "error") {
      container.innerHTML = `<div class="gh-error">Fehler beim Laden: ${errorMsg || "unbekannt"}</div>`;
      return;
    }
    if (!this._loaded) {
      container.innerHTML = `<div class="gh-loading">Lade\u2026</div>`;
      return;
    }
    const year = new Date().getFullYear();
    const rows = this._items.map(item => {
      const alter = year - item.planted_year + 1;
      const emoji = item.plant_emoji || "\u{1F333}";
      const meta = [`seit ${item.planted_year} (${alter} Jahre)`, item.location_note].filter(Boolean).join(" \u00b7 ");
      return `<div class="gh-row" data-id="${item.id}">
        <div class="gh-emoji">${emoji}</div>
        <div class="gh-info">
          <div class="gh-name">${this._esc(item.name)}</div>
          <div class="gh-meta">${this._esc(meta)}</div>
        </div>
      </div>`;
    }).join("");
    const emptyMsg = this._items.length ? "" : `<div class="gh-empty">Noch keine Geh\u00f6lze erfasst.</div>`;
    container.innerHTML = `${emptyMsg}${rows}<div class="gh-add-row" id="gh-add-row">\u2795 Geh\u00f6lz hinzuf\u00fcgen</div>`;

    container.querySelectorAll(".gh-row").forEach(el => {
      el.onclick = () => this._openEditModal(parseInt(el.dataset.id, 10));
    });
    container.querySelector("#gh-add-row").onclick = () => this._openAddModal();
  }

  _esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  _fillPlantSelect(selectedPlantId) {
    const sel = this._root.getElementById("gh-plant");
    sel.innerHTML = `<option value="">\u2013 keine \u2013</option>` + this._plants.map(p =>
      `<option value="${p.id}">${p.emoji} ${this._esc(p.name)}</option>`
    ).join("");
    if (selectedPlantId) sel.value = String(selectedPlantId);
  }

  _openAddModal() {
    this._editingId = null;
    this._root.getElementById("gh-modal-title").textContent = "\u{1F333} Geh\u00f6lz hinzuf\u00fcgen";
    this._root.getElementById("gh-name").value = "";
    this._fillPlantSelect(null);
    this._root.getElementById("gh-year").value = new Date().getFullYear();
    this._root.getElementById("gh-location").value = "";
    this._root.getElementById("gh-remove").style.display = "none";
    this._root.getElementById("gh-harvest-open").style.display = "none";
    this._root.getElementById("gh-modal-backdrop").classList.add("open");
  }

  _openEditModal(id) {
    const item = this._items.find(i => i.id === id);
    if (!item) return;
    this._editingId = id;
    this._root.getElementById("gh-modal-title").textContent = "\u2702\uFE0F " + item.name + " bearbeiten";
    this._root.getElementById("gh-name").value = item.name;
    this._fillPlantSelect(item.plant_id);
    this._root.getElementById("gh-year").value = item.planted_year;
    this._root.getElementById("gh-location").value = item.location_note || "";
    this._root.getElementById("gh-remove").style.display = "inline-block";
    this._root.getElementById("gh-harvest-open").style.display = "inline-block";
    this._root.getElementById("gh-modal-backdrop").classList.add("open");
  }

  _closeModal() { this._root.getElementById("gh-modal-backdrop").classList.remove("open"); }

  _openHarvestModal() {
    if (!this._editingId) return;
    const item = this._items.find(i => i.id === this._editingId);
    if (!item) return;
    this._root.getElementById("gh-modal-backdrop").classList.remove("open");
    this._root.getElementById("gh-harvest-sub").textContent = `${item.plant_emoji || "\u{1F333}"} ${item.name}`;
    this._root.getElementById("gh-h-date").value = this._todayStr();
    this._root.getElementById("gh-h-amount").value = "";
    this._root.getElementById("gh-h-unit").value = "kg";
    this._root.getElementById("gh-h-note").value = "";
    this._root.getElementById("gh-harvest-backdrop").classList.add("open");
  }

  _closeHarvestModal() { this._root.getElementById("gh-harvest-backdrop").classList.remove("open"); }

  _todayStr() { return new Date().toISOString().split("T")[0]; }

  async _saveHarvest(roden) {
    if (!this._editingId) return;
    const item = this._items.find(i => i.id === this._editingId);
    if (!item) return;
    const base = this._config.api_base.replace(/\/$/, "");
    const amount = this._root.getElementById("gh-h-amount").value;
    const body = {
      id: Date.now(),
      emoji: item.plant_emoji || "\u{1F333}",
      plant: item.name,
      date: this._root.getElementById("gh-h-date").value,
      cat: "harvest",
      plant_id: item.plant_id || null,
      perennial_id: item.id,
      description: this._root.getElementById("gh-h-note").value || (roden ? "Gerodet" : ""),
      harvest_amount: amount ? parseFloat(amount) : null,
      harvest_unit: this._root.getElementById("gh-h-unit").value,
      harvest_final: !!roden
    };
    try {
      const r = await fetch(`${base}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      if (roden) {
        const patchBody = {
          name: item.name, plant_id: item.plant_id, planted_year: item.planted_year,
          location_note: item.location_note, removed_year: new Date().getFullYear()
        };
        const r2 = await fetch(`${base}/perennials/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patchBody) });
        if (!r2.ok) throw new Error(await r2.text());
      }
      this._closeHarvestModal();
      await this._loadData();
    } catch (e) {
      alert("Fehler beim Speichern: " + e.message);
    }
  }

  async _save() {
    const base = this._config.api_base.replace(/\/$/, "");
    const name = this._root.getElementById("gh-name").value.trim();
    if (!name) { alert("Bitte Namen eingeben"); return; }
    const plantSel = this._root.getElementById("gh-plant");
    const body = {
      name,
      plant_id: plantSel.value ? parseInt(plantSel.value, 10) : null,
      planted_year: parseInt(this._root.getElementById("gh-year").value, 10) || new Date().getFullYear(),
      location_note: this._root.getElementById("gh-location").value.trim() || null
    };
    try {
      const url = this._editingId ? `${base}/perennials/${this._editingId}` : `${base}/perennials`;
      const method = this._editingId ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      this._closeModal();
      await this._loadData();
    } catch (e) {
      alert("Fehler beim Speichern: " + e.message);
    }
  }

  async _markRemoved() {
    if (!this._editingId) return;
    if (!confirm("Dieses Gehoelz als entfernt markieren?")) return;
    const base = this._config.api_base.replace(/\/$/, "");
    const item = this._items.find(i => i.id === this._editingId);
    const body = {
      name: item.name,
      plant_id: item.plant_id,
      planted_year: item.planted_year,
      location_note: item.location_note,
      removed_year: new Date().getFullYear()
    };
    try {
      const r = await fetch(`${base}/perennials/${this._editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      this._closeModal();
      await this._loadData();
    } catch (e) {
      alert("Fehler: " + e.message);
    }
  }
}

customElements.define("gartentagebuch-gehoelze-card", GartentagebuchGehoelzeCard);

class GartentagebuchGehoelzeCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _schema() {
    return [
      { name: "title", selector: { text: {} } },
      { name: "api_base", selector: { text: {} } }
    ];
  }

  _labels(name) {
    const map = {
      title: "Titel",
      api_base: "API Basis-URL (z.B. http://DEINE-IP-ODER-DOMAIN:3002/garten/api)"
    };
    return map[name] || name;
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        this._config = ev.detail.value;
        this.dispatchEvent(new CustomEvent("config-changed", {
          detail: { config: this._config },
          bubbles: true,
          composed: true
        }));
      });
      this.innerHTML = "";
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = this._config;
    this._form.schema = this._schema();
    this._form.computeLabel = (s) => this._labels(s.name);
  }
}

customElements.define("gartentagebuch-gehoelze-card-editor", GartentagebuchGehoelzeCardEditor);

window.customCards.push({
  type: "gartentagebuch-gehoelze-card",
  name: "Gartentagebuch Gehoelze",
  description: "Liste der Gehoelze/Baeume/Buesche mit Alter und Standort, Hinzufuegen/Bearbeiten/Entfernen"
});

// F\u00fcr die Karten-Auswahl in der HA-UI (optional, aber nett)
window.customCards = window.customCards || [];
window.customCards.push({
  type: "gartentagebuch-felder-card",
  name: "Gartentagebuch Felder",
  description: "Zeigt Standorte/Felder mit aktueller Belegung, Ernte- und Pflanzen-Modal"
});
