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
                --gt-cream:#f9f5ec; --gt-cream-dark:#ede8d8; --gt-text:#2a2a1e; --gt-text-muted:#6b6b50; --gt-white:#fff; }
        ha-card { padding: 16px 18px; font-family: 'Lato', sans-serif; }
        .gt-title { font-size:1.15rem; font-weight:700; color:var(--gt-green-deep); margin-bottom:14px; display:flex; align-items:center; gap:8px; }
        .gt-standort { margin-bottom: 18px; }
        .gt-standort-name { font-size:.78rem; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--gt-text-muted); margin-bottom:8px; }
        .gt-felder { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:10px; }
        .gt-feld { background:var(--gt-cream); border:1.5px solid var(--gt-cream-dark); border-radius:12px; padding:12px 10px; cursor:pointer; transition:.15s; text-align:center; }
        .gt-feld:hover { border-color: var(--gt-green-mid); transform: translateY(-1px); }
        .gt-feld.leer { opacity:.6; }
        .gt-feld-name { font-size:.72rem; font-weight:700; color:var(--gt-text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
        .gt-feld-emoji { font-size:1.6rem; }
        .gt-feld-plant { font-size:.85rem; font-weight:600; color:var(--gt-text); margin-top:2px; }
        .gt-feld-empty-label { font-size:.8rem; color:var(--gt-text-muted); margin-top:2px; }
        .gt-loading, .gt-error { color:var(--gt-text-muted); font-size:.9rem; padding:8px 0; }
        .gt-error { color:#c0392b; }

        .gt-modal-backdrop { display:none; position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:1000; align-items:center; justify-content:center; padding:16px; }
        .gt-modal-backdrop.open { display:flex; }
        .gt-modal { background:var(--gt-white); border-radius:16px; padding:26px 22px; max-width:420px; width:100%; box-shadow:0 8px 40px rgba(0,0,0,.3); }
        .gt-modal-title { font-size:1.15rem; font-weight:700; color:var(--gt-green-deep); margin-bottom:6px; }
        .gt-modal-sub { font-size:.88rem; color:var(--gt-text-muted); margin-bottom:16px; }
        .gt-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .gt-form-full { grid-column: span 2; }
        .gt-form-grid label { display:block; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--gt-text-muted); margin-bottom:4px; }
        .gt-form-grid input, .gt-form-grid select { width:100%; box-sizing:border-box; padding:9px 11px; border:1.5px solid var(--gt-cream-dark); border-radius:8px; font-size:.92rem; color:var(--gt-text); background:var(--gt-cream); }
        .gt-modal-actions { display:flex; gap:8px; margin-top:16px; flex-wrap:wrap; }
        .gt-btn { border:none; border-radius:10px; padding:10px 14px; font-weight:700; font-size:.88rem; cursor:pointer; font-family:'Lato',sans-serif; }
        .gt-btn-cancel { background:none; border:1.5px solid var(--gt-cream-dark); color:var(--gt-text-muted); }
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
        if (occ) {
          return `<div class="gt-feld" data-bed-id="${feld.id}" data-action="harvest" data-plant="${this._esc(occ.plant)}" data-emoji="${occ.emoji || "\u{1F331}"}">
            <div class="gt-feld-name">${this._esc(feld.name)}</div>
            <div class="gt-feld-emoji">${occ.emoji || "\u{1F331}"}</div>
            <div class="gt-feld-plant">${this._esc(occ.plant)}</div>
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
          this._openPlantModal(bedId);
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

  _openPlantModal(bedId) {
    const bed = this._beds.find(b => b.id === bedId);
    this._activeBedId = bedId;
    this._root.getElementById("plant-sub").textContent = bed ? bed.name : "";
    const sel = this._root.getElementById("p-plant");
    sel.innerHTML = this._plants.map(p => `<option value="${p.id}" data-emoji="${p.emoji}" data-fam="${p.plant_family_id || ""}">${p.emoji} ${this._esc(p.name)}</option>`).join("");
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

// F\u00fcr die Karten-Auswahl in der HA-UI (optional, aber nett)
window.customCards = window.customCards || [];
window.customCards.push({
  type: "gartentagebuch-felder-card",
  name: "Gartentagebuch Felder",
  description: "Zeigt Standorte/Felder mit aktueller Belegung, Ernte- und Pflanzen-Modal"
});
