// Gartentagebuch Felder-Card f\u00fcr Home Assistant
// Zeigt Standorte + Felder mit aktueller Belegung, \u00f6ffnet Ernte-/Pflanzen-Modal
// Spricht direkt mit der Gartentagebuch-App-API (/garten/api)

class GartentagebuchFelderCard extends HTMLElement {
  setConfig(config) {
    if (!config.api_base && !config.addon_slug) throw new Error("api_base oder addon_slug ist erforderlich");
    this._config = config;
    this.setAttribute("data-theme", config.design === "dark" ? "dark" : "light");
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

  async _base() {
    if (this._config.api_base) return this._config.api_base.replace(/\/$/, "");
    if (this._config.addon_slug) {
      if (!this._ingressBase) {
        if (!this._hass) throw new Error("Warte auf Home Assistant Verbindung...");
        const raw = await this._hass.callApi("GET", `hassio/addons/${this._config.addon_slug}/info`);
        const data = raw && raw.data ? raw.data : raw;
        if (!data || !data.ingress_entry) throw new Error("Ingress-URL fuer '" + this._config.addon_slug + "' nicht gefunden. Slug korrekt?");
        this._ingressBase = data.ingress_entry.replace(/\/$/, "") + "/garten/api";
      }
      return this._ingressBase;
    }
    throw new Error("Weder api_base noch addon_slug konfiguriert");
  }

  getCardSize() { return 4; }

  static getConfigElement() {
    return document.createElement("gartentagebuch-felder-card-editor");
  }

  static getStubConfig() {
    return { title: "Garten", api_base: "", addon_slug: "", design: "light" };
  }

  async _loadData() {
    try {
      const base = await this._base();
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
        :host([data-theme="light"]) {
          --gt-bg:#f9f5ec; --gt-modal-bg:#fff; --gt-bg-alt:#ede8d8;
          --gt-text:#2a2a1e; --gt-text-muted:#6b6b50; --gt-input-bg:#f9f5ec;
          --gt-accent:#2d5016; --gt-accent-mid:#4a7c2f;
        }
        :host([data-theme="dark"]) {
          --gt-bg:#262626; --gt-modal-bg:#1e1e1e; --gt-bg-alt:#3a3a3a;
          --gt-text:#f2f2f2; --gt-text-muted:#a8a8a8; --gt-input-bg:#2a2a2a;
          --gt-accent:#8fce6a; --gt-accent-mid:#6ea852;
        }
        :host { --gt-harvest:#e8a020; --gt-harvest-pale:#fdf0d0; }
        ha-card { padding: 16px 18px; font-family: 'Lato', sans-serif; background:var(--gt-bg); color:var(--gt-text); }
        .gt-title { font-size:1.15rem; font-weight:700; color:var(--gt-accent); margin-bottom:14px; display:flex; align-items:center; gap:8px; }
        .gt-standort { margin-bottom: 18px; }
        .gt-standort-name { font-size:.78rem; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--gt-text-muted); margin-bottom:8px; }
        .gt-felder { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:10px; }
        .gt-feld { background:var(--gt-bg); border:1.5px solid var(--gt-bg-alt); border-radius:12px; padding:12px 10px; cursor:pointer; transition:.15s; text-align:center; }
        .gt-feld:hover { border-color: var(--gt-accent-mid); transform: translateY(-1px); }
        .gt-feld.leer { opacity:.6; }
        .gt-feld.geplant { border-style:dashed; border-color:var(--gt-harvest); }
        .gt-feld-badge { font-size:.68rem; font-weight:700; color:#8a5a00; background:var(--gt-harvest-pale); border-radius:6px; padding:1px 6px; display:inline-block; margin-top:2px; }
        .gt-feld-badge-dauerhaft { color:var(--gt-accent); background:var(--gt-bg-alt); }
        .gt-feld-name { font-size:.72rem; font-weight:700; color:var(--gt-text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }
        .gt-feld-emoji { font-size:1.6rem; }
        .gt-feld-plant { font-size:.85rem; font-weight:600; color:var(--gt-text); margin-top:2px; }
        .gt-feld-empty-label { font-size:.8rem; color:var(--gt-text-muted); margin-top:2px; }
        .gt-loading, .gt-error { color:var(--gt-text-muted); font-size:.9rem; padding:8px 0; }
        .gt-error { color:#e05d4a; }

        .gt-modal-backdrop { display:none; position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:1000; align-items:center; justify-content:center; padding:16px; }
        .gt-modal-backdrop.open { display:flex; }
        .gt-modal { background:var(--gt-modal-bg); color:var(--gt-text); border-radius:16px; padding:26px 22px; max-width:420px; width:100%; box-shadow:0 8px 40px rgba(0,0,0,.4); }
        .gt-modal-title { font-size:1.15rem; font-weight:700; color:var(--gt-accent); margin-bottom:6px; }
        .gt-modal-sub { font-size:.88rem; color:var(--gt-text-muted); margin-bottom:16px; }
        .gt-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .gt-form-full { grid-column: span 2; }
        .gt-form-grid label { display:block; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--gt-text-muted); margin-bottom:4px; }
        .gt-form-grid input, .gt-form-grid select { width:100%; box-sizing:border-box; padding:9px 11px; border:1.5px solid var(--gt-bg-alt); border-radius:8px; font-size:.92rem; color:var(--gt-text); background:var(--gt-input-bg); }
        .gt-form-grid input::placeholder { color:var(--gt-text-muted); opacity:.7; }
        .gt-modal-actions { display:flex; gap:8px; margin-top:16px; flex-wrap:wrap; }
        .gt-btn { border:none; border-radius:10px; padding:10px 14px; font-weight:700; font-size:.88rem; cursor:pointer; font-family:'Lato',sans-serif; }
        .gt-btn-cancel { background:none; border:1.5px solid var(--gt-bg-alt); color:var(--gt-text-muted); }
        .gt-btn-teil { flex:1; background:linear-gradient(135deg,#f0ad3d,var(--gt-harvest)); color:#3a2600; }
        .gt-btn-final { flex:1; background:linear-gradient(135deg,#c0392b,#922b21); color:#fff; }
        .gt-btn-roden { flex:1; background:linear-gradient(135deg,#c0392b,#7a1f16); color:#fff; }
        .gt-btn-pflanzen { flex:1; background:linear-gradient(135deg,var(--gt-accent-mid),var(--gt-accent)); color:#fff; }
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

      <div class="gt-modal-backdrop" id="dauerhaft-backdrop">
        <div class="gt-modal">
          <div class="gt-modal-title">\u{1F33E} Ernte eintragen</div>
          <div class="gt-modal-sub" id="dauerhaft-sub"></div>
          <div class="gt-form-grid">
            <div><label>Datum</label><input type="date" id="dh-date"></div>
            <div><label>Menge (optional)</label><input type="number" step="0.001" min="0" placeholder="z.B. 1.5" id="dh-amount"></div>
            <div>
              <label>Einheit</label>
              <select id="dh-unit"><option value="kg">kg</option><option value="g">g</option><option value="St\u00fcck">St\u00fcck</option></select>
            </div>
            <div class="gt-form-full"><label>Notiz (optional)</label><input type="text" placeholder="z.B. erste Ernte, sehr s\u00fc\u00df\u2026" id="dh-note"></div>
          </div>
          <div class="gt-modal-actions">
            <button class="gt-btn gt-btn-cancel" id="dh-cancel">Abbrechen</button>
            <button class="gt-btn gt-btn-teil" id="dh-teil">\u{1F33E} Teilernte</button>
            <button class="gt-btn gt-btn-roden" id="dh-roden">\u{1FA93} Roden</button>
          </div>
        </div>
      </div>
    `;

    this._root.getElementById("h-cancel").onclick = () => this._closeHarvestModal();
    this._root.getElementById("p-cancel").onclick = () => this._closePlantModal();
    this._root.getElementById("h-teil").onclick = () => this._saveHarvest(false);
    this._root.getElementById("h-final").onclick = () => this._saveHarvest(true);
    this._root.getElementById("p-save").onclick = () => this._savePlant();
    this._root.getElementById("dh-cancel").onclick = () => this._closeDauerhaftModal();
    this._root.getElementById("dh-teil").onclick = () => this._saveDauerhaftHarvest(false);
    this._root.getElementById("dh-roden").onclick = () => this._saveDauerhaftHarvest(true);
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
        if (occ && occ.source === "tagebuch") {
          return `<div class="gt-feld" data-bed-id="${feld.id}" data-action="harvest" data-plant="${this._esc(occ.plant)}" data-emoji="${occ.emoji || "\u{1F331}"}">
            <div class="gt-feld-name">${this._esc(feld.name)}</div>
            <div class="gt-feld-emoji">${occ.emoji || "\u{1F331}"}</div>
            <div class="gt-feld-plant">${this._esc(occ.plant)}</div>
          </div>`;
        }
        if (occ && occ.source === "dauerhaft") {
          return `<div class="gt-feld" data-bed-id="${feld.id}" data-action="dauerhaft" data-plant="${this._esc(occ.plant)}" data-emoji="${occ.emoji || "\u{1F331}"}" data-plan-id="${occ.plan_id}">
            <div class="gt-feld-name">${this._esc(feld.name)}</div>
            <div class="gt-feld-emoji">${occ.emoji || "\u{1F331}"}</div>
            <div class="gt-feld-plant">${this._esc(occ.plant)}</div>
            <div class="gt-feld-badge gt-feld-badge-dauerhaft">Dauerhaft</div>
          </div>`;
        }
        if (occ && occ.source === "planer") {
          return `<div class="gt-feld geplant" data-bed-id="${feld.id}" data-action="plan-convert" data-plan-id="${occ.plan_id}" data-plant="${this._esc(occ.plant)}" data-emoji="${occ.emoji || "\u{1F331}"}">
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
        } else if (el.dataset.action === "dauerhaft") {
          this._openDauerhaftModal(bedId, el.dataset.plant, el.dataset.emoji, parseInt(el.dataset.planId, 10));
        } else if (el.dataset.action === "plan-convert") {
          this._convertPlanToEntry(bedId, parseInt(el.dataset.planId, 10), el.dataset.plant, el.dataset.emoji);
        } else {
          this._openPlantModal(bedId, null);
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

  async _convertPlanToEntry(bedId, planId, plant, emoji) {
    const bed = this._beds.find(b => b.id === bedId);
    if (!confirm(`${emoji} ${plant} in ${bed ? bed.name : "diesem Feld"} jetzt als gepflanzt ins Tagebuch eintragen?`)) return;
    try {
      const base = await this._base();
      const plansRes = await fetch(`${base}/plans`);
      const plans = await plansRes.json();
      const plan = plans.find(p => String(p.id) === String(planId));
      if (!plan) throw new Error("Planung nicht gefunden");
      const r1 = await fetch(`${base}/plans/${planId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: true }) });
      if (!r1.ok) throw new Error(await r1.text());
      const catalogMatch = plan.plant_id ? this._plants.find(p => p.id === plan.plant_id) : null;
      const entry = {
        id: Date.now(),
        emoji: plan.emoji,
        plant: plan.plant,
        date: this._today(),
        location: "",
        description: "Aus Planung eingetragen",
        cat: "plant",
        bed_id: plan.bed_id || null,
        plant_cat: catalogMatch ? catalogMatch.plant_cat : null,
        plant_family_id: plan.plant_family_id || null
      };
      const r2 = await fetch(`${base}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
      if (!r2.ok) throw new Error(await r2.text());
      await this._loadData();
    } catch (e) {
      alert("Fehler: " + e.message);
    }
  }

  _openDauerhaftModal(bedId, plant, emoji, planId) {
    const bed = this._beds.find(b => b.id === bedId);
    this._activePlanId = planId;
    this._activeDauerhaftEmoji = emoji;
    this._activeDauerhaftPlant = plant;
    this._activeDauerhaftBedId = bedId;
    this._root.getElementById("dauerhaft-sub").textContent = `${emoji} ${plant} \u00b7 ${bed ? bed.name : ""}`;
    this._root.getElementById("dh-date").value = this._today();
    this._root.getElementById("dh-amount").value = "";
    this._root.getElementById("dh-unit").value = "kg";
    this._root.getElementById("dh-note").value = "";
    this._root.getElementById("dauerhaft-backdrop").classList.add("open");
  }

  _closeDauerhaftModal() { this._root.getElementById("dauerhaft-backdrop").classList.remove("open"); }

  async _saveDauerhaftHarvest(roden) {
    const amount = this._root.getElementById("dh-amount").value;
    const body = {
      id: Date.now(),
      emoji: this._activeDauerhaftEmoji,
      plant: this._activeDauerhaftPlant,
      date: this._root.getElementById("dh-date").value,
      cat: "harvest",
      bed_id: this._activeDauerhaftBedId,
      description: this._root.getElementById("dh-note").value || (roden ? "Gerodet" : ""),
      harvest_amount: amount ? parseFloat(amount) : null,
      harvest_unit: this._root.getElementById("dh-unit").value,
      harvest_final: !!roden
    };
    try {
      const base = await this._base();
      const r = await fetch(`${base}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      if (roden && this._activePlanId) {
        const plansRes = await fetch(`${base}/plans`);
        const plans = await plansRes.json();
        const plan = plans.find(p => String(p.id) === String(this._activePlanId));
        if (plan) {
          const patchBody = {
            emoji: plan.emoji, plant: plan.plant, month: plan.month, month_to: plan.month_to,
            year: plan.year, note: plan.note, bed_id: plan.bed_id, plant_family_id: plan.plant_family_id,
            is_permanent: plan.is_permanent, removed_year: new Date().getFullYear(),
            plant_cat: plan.plant_cat, plant_id: plan.plant_id
          };
          const r2 = await fetch(`${base}/plans/${this._activePlanId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patchBody) });
          if (!r2.ok) throw new Error(await r2.text());
        }
      }
      this._closeDauerhaftModal();
      await this._loadData();
    } catch (e) {
      alert("Fehler beim Speichern: " + e.message);
    }
  }

  async _saveHarvest(final) {
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
      const base = await this._base();
      const r = await fetch(`${base}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      this._closeHarvestModal();
      await this._loadData();
    } catch (e) {
      alert("Fehler beim Speichern: " + e.message);
    }
  }

  async _savePlant() {
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
      const base = await this._base();
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
      { name: "addon_slug", selector: { text: {} } },
      { name: "design", selector: { select: { mode: "dropdown", options: [
        { value: "light", label: "Hell" },
        { value: "dark", label: "Dunkel" }
      ] } } },
      { name: "standort_id", selector: { number: { mode: "box" } } }
    ];
  }

  _labels(name) {
    const map = {
      title: "Titel",
      api_base: "API Basis-URL (leer lassen, wenn addon_slug genutzt wird)",
      addon_slug: "Add-on Slug (z.B. 3744e95d_garden_journal) - alternative zu api_base fuer das HA Add-on",
      design: "Design",
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
    if (!config.api_base && !config.addon_slug) throw new Error("api_base oder addon_slug ist erforderlich");
    this._config = config;
    this.setAttribute("data-theme", config.design === "dark" ? "dark" : "light");
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

  async _base() {
    if (this._config.api_base) return this._config.api_base.replace(/\/$/, "");
    if (this._config.addon_slug) {
      if (!this._ingressBase) {
        if (!this._hass) throw new Error("Warte auf Home Assistant Verbindung...");
        const raw = await this._hass.callApi("GET", `hassio/addons/${this._config.addon_slug}/info`);
        const data = raw && raw.data ? raw.data : raw;
        if (!data || !data.ingress_entry) throw new Error("Ingress-URL fuer '" + this._config.addon_slug + "' nicht gefunden. Slug korrekt?");
        this._ingressBase = data.ingress_entry.replace(/\/$/, "") + "/garten/api";
      }
      return this._ingressBase;
    }
    throw new Error("Weder api_base noch addon_slug konfiguriert");
  }

  getCardSize() { return 3; }

  static getConfigElement() {
    return document.createElement("gartentagebuch-gehoelze-card-editor");
  }

  static getStubConfig() {
    return { title: "Gehoelze", api_base: "", addon_slug: "", design: "light" };
  }

  async _loadData() {
    try {
      const base = await this._base();
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
        :host([data-theme="light"]) {
          --gh-bg:#f9f5ec; --gh-modal-bg:#fff; --gh-bg-alt:#ede8d8;
          --gh-text:#2a2a1e; --gh-text-muted:#6b6b50; --gh-input-bg:#f9f5ec;
          --gh-accent:#2d5016; --gh-accent-mid:#4a7c2f; --gh-row-hover:#ede8d8;
        }
        :host([data-theme="dark"]) {
          --gh-bg:#262626; --gh-modal-bg:#1e1e1e; --gh-bg-alt:#3a3a3a;
          --gh-text:#f2f2f2; --gh-text-muted:#a8a8a8; --gh-input-bg:#2a2a2a;
          --gh-accent:#8fce6a; --gh-accent-mid:#6ea852; --gh-row-hover:#333;
        }
        :host { --gh-red:#c0392b; }
        ha-card { padding: 16px 18px; font-family: 'Lato', sans-serif; background:var(--gh-bg); color:var(--gh-text); }
        .gh-title { font-size:1.15rem; font-weight:700; color:var(--gh-accent); margin-bottom:14px; display:flex; align-items:center; gap:8px; }
        .gh-row { display:flex; align-items:center; gap:12px; padding:10px 8px; border-bottom:1px solid var(--gh-bg-alt); cursor:pointer; }
        .gh-row:last-child { border-bottom:none; }
        .gh-row:hover { background: var(--gh-row-hover); }
        .gh-emoji { font-size:1.5rem; width:2rem; text-align:center; flex-shrink:0; }
        .gh-info { flex:1; min-width:0; }
        .gh-name { font-weight:700; color:var(--gh-text); font-size:.95rem; }
        .gh-meta { font-size:.8rem; color:var(--gh-text-muted); margin-top:2px; }
        .gh-add-row { display:flex; align-items:center; justify-content:center; gap:8px; padding:12px; margin-top:8px; border:1.5px dashed var(--gh-bg-alt); border-radius:10px; cursor:pointer; color:var(--gh-text-muted); font-weight:700; font-size:.88rem; }
        .gh-add-row:hover { border-color:var(--gh-accent-mid); color:var(--gh-accent); }
        .gh-loading, .gh-error, .gh-empty { color:var(--gh-text-muted); font-size:.9rem; padding:8px 0; }
        .gh-error { color:var(--gh-red); }

        .gh-modal-backdrop { display:none; position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:1000; align-items:center; justify-content:center; padding:16px; }
        .gh-modal-backdrop.open { display:flex; }
        .gh-modal { background:var(--gh-modal-bg); color:var(--gh-text); border-radius:16px; padding:26px 22px; max-width:420px; width:100%; box-shadow:0 8px 40px rgba(0,0,0,.4); }
        .gh-modal-title { font-size:1.15rem; font-weight:700; color:var(--gh-accent); margin-bottom:16px; }
        .gh-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .gh-form-full { grid-column: span 2; }
        .gh-form-grid label { display:block; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--gh-text-muted); margin-bottom:4px; }
        .gh-form-grid input, .gh-form-grid select { width:100%; box-sizing:border-box; padding:9px 11px; border:1.5px solid var(--gh-bg-alt); border-radius:8px; font-size:.92rem; color:var(--gh-text); background:var(--gh-input-bg); }
        .gh-form-grid input::placeholder { color:var(--gh-text-muted); opacity:.7; }
        .gh-modal-actions { display:flex; gap:8px; margin-top:16px; flex-wrap:wrap; }
        .gh-btn { border:none; border-radius:10px; padding:10px 14px; font-weight:700; font-size:.88rem; cursor:pointer; font-family:'Lato',sans-serif; }
        .gh-btn-cancel { background:none; border:1.5px solid var(--gh-bg-alt); color:var(--gh-text-muted); }
        .gh-btn-save { flex:1; background:linear-gradient(135deg,var(--gh-accent-mid),var(--gh-accent)); color:#fff; }
        .gh-btn-teil { flex:1; background:linear-gradient(135deg,#f0ad3d,#e8a020); color:#3a2600; }
        .gh-btn-roden { flex:1; background:linear-gradient(135deg,#c0392b,#7a1f16); color:#fff; }
      </style>
      <ha-card>
        <div class="gh-title">\u{1F333} ${this._config.title || "Gehoelze"}</div>
        <div class="gh-list-container"><div class="gh-loading">Lade\u2026</div></div>
      </ha-card>

      <div class="gh-modal-backdrop" id="gh-modal-backdrop">
        <div class="gh-modal">
          <div class="gh-modal-title">\u{1F333} Geh\u00f6lz hinzuf\u00fcgen</div>
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
            <button class="gh-btn gh-btn-save" id="gh-save">Speichern</button>
          </div>
        </div>
      </div>

      <div class="gh-modal-backdrop" id="gh-harvest-backdrop">
        <div class="gh-modal">
          <div class="gh-modal-title">\u{1F33E} Ernte eintragen</div>
          <div class="gh-modal-sub" id="gh-harvest-sub"></div>
          <div class="gh-form-grid">
            <div><label>Datum</label><input type="date" id="gh-h-date"></div>
            <div><label>Menge (optional)</label><input type="number" step="0.001" min="0" placeholder="z.B. 1.5" id="gh-h-amount"></div>
            <div>
              <label>Einheit</label>
              <select id="gh-h-unit"><option value="kg">kg</option><option value="g">g</option><option value="St\u00fcck">St\u00fcck</option></select>
            </div>
            <div class="gh-form-full"><label>Notiz (optional)</label><input type="text" placeholder="z.B. erste Ernte, sehr s\u00fc\u00df\u2026" id="gh-h-note"></div>
          </div>
          <div class="gh-modal-actions">
            <button class="gh-btn gh-btn-cancel" id="gh-h-cancel">Abbrechen</button>
            <button class="gh-btn gh-btn-teil" id="gh-h-teil">\u{1F33E} Teilernte</button>
            <button class="gh-btn gh-btn-roden" id="gh-h-roden">\u{1FA93} Roden</button>
          </div>
        </div>
      </div>
    `;

    this._root.getElementById("gh-cancel").onclick = () => this._closeAddModal();
    this._root.getElementById("gh-save").onclick = () => this._save();
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
      el.onclick = () => this._openHarvestModal(parseInt(el.dataset.id, 10));
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
    this._root.getElementById("gh-name").value = "";
    this._fillPlantSelect(null);
    this._root.getElementById("gh-year").value = new Date().getFullYear();
    this._root.getElementById("gh-location").value = "";
    this._root.getElementById("gh-modal-backdrop").classList.add("open");
  }

  _closeAddModal() { this._root.getElementById("gh-modal-backdrop").classList.remove("open"); }

  _openHarvestModal(id) {
    const item = this._items.find(i => i.id === id);
    if (!item) return;
    this._harvestItemId = id;
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
    const item = this._items.find(i => i.id === this._harvestItemId);
    if (!item) return;
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
      const base = await this._base();
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
      const base = await this._base();
      const r = await fetch(`${base}/perennials`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      this._closeAddModal();
      await this._loadData();
    } catch (e) {
      alert("Fehler beim Speichern: " + e.message);
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
      { name: "api_base", selector: { text: {} } },
      { name: "addon_slug", selector: { text: {} } },
      { name: "design", selector: { select: { mode: "dropdown", options: [
        { value: "light", label: "Hell" },
        { value: "dark", label: "Dunkel" }
      ] } } }
    ];
  }

  _labels(name) {
    const map = {
      title: "Titel",
      api_base: "API Basis-URL (leer lassen, wenn addon_slug genutzt wird)",
      addon_slug: "Add-on Slug (z.B. 3744e95d_garden_journal) - alternative zu api_base fuer das HA Add-on",
      design: "Design"
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

class GartentagebuchUebersichtCard extends HTMLElement {
  setConfig(config) {
    if (!config.api_base && !config.addon_slug) throw new Error("api_base oder addon_slug ist erforderlich");
    this._config = config;
    this.setAttribute("data-theme", config.design === "dark" ? "dark" : "light");
    this._loaded = false;
    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
      this._render();
    }
    this._loadData();
  }

  set hass(hass) { this._hass = hass; }

  async _base() {
    if (this._config.api_base) return this._config.api_base.replace(/\/$/, "");
    if (this._config.addon_slug) {
      if (!this._ingressBase) {
        if (!this._hass) throw new Error("Warte auf Home Assistant Verbindung...");
        const raw = await this._hass.callApi("GET", `hassio/addons/${this._config.addon_slug}/info`);
        const data = raw && raw.data ? raw.data : raw;
        if (!data || !data.ingress_entry) throw new Error("Ingress-URL fuer '" + this._config.addon_slug + "' nicht gefunden. Slug korrekt?");
        this._ingressBase = data.ingress_entry.replace(/\/$/, "") + "/garten/api";
      }
      return this._ingressBase;
    }
    throw new Error("Weder api_base noch addon_slug konfiguriert");
  }

  getCardSize() { return 2; }

  static getConfigElement() {
    return document.createElement("gartentagebuch-uebersicht-card-editor");
  }

  static getStubConfig() {
    return { title: "Garten \u00dcbersicht", api_base: "", addon_slug: "", design: "light" };
  }

  async _loadData() {
    try {
      const base = await this._base();
      const [occ, perennials, entries, costs] = await Promise.all([
        fetch(`${base}/beds/occupancy`).then(r => r.json()),
        fetch(`${base}/perennials`).then(r => r.json()),
        fetch(`${base}/entries`).then(r => r.json()),
        fetch(`${base}/costs`).then(r => r.json())
      ]);

      const year = new Date().getFullYear();
      const yearStr = String(year);

      // Gepflanzt: wie im Tagebuch selbst - distinkte Pflanzen (nach plant_id, sonst Name),
      // die dieses Jahr gepflanzt wurden, unabhaengig vom Beet und ohne Ernte-Filter.
      const plantGroups = new Set();
      entries.forEach(e => {
        if (e.cat === "plant" && new Date(e.date).getFullYear() === year) {
          plantGroups.add(e.plant_id ? `id_${e.plant_id}` : `name_${e.plant}`);
        }
      });
      const gepflanzt = plantGroups.size;

      // Dauerbepflanzung: aktive Dauerbepflanzungen pro Feld (wie im Tagebuch-Tab)
      let dauerpflanzungen = 0;
      Object.values(occ).forEach(list => {
        list.forEach(p => { if (p.source === "dauerhaft") dauerpflanzungen++; });
      });

      const gehoelze = perennials.filter(p => !p.removed_year).length;

      // Kosten dieses Jahr, wie im Tagebuch (costs.filter date.startsWith(year))
      const kosten = costs
        .filter(c => (c.date || "").startsWith(yearStr))
        .reduce((sum, c) => sum + parseFloat(c.amount), 0);

      this._stats = { gepflanzt, dauerpflanzungen, gehoelze, kosten, year };
      this._loaded = true;
      this._renderStats();
    } catch (e) {
      this._loaded = "error";
      this._renderStats(e.message);
    }
  }

  _fmtEuro(v) {
    return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20ac";
  }

  _render() {
    this._root.innerHTML = `
      <style>
        :host([data-theme="light"]) {
          --gu-bg:#f9f5ec; --gu-bg-alt:#ede8d8; --gu-text:#2a2a1e; --gu-text-muted:#6b6b50; --gu-accent:#2d5016;
        }
        :host([data-theme="dark"]) {
          --gu-bg:#262626; --gu-bg-alt:#3a3a3a; --gu-text:#f2f2f2; --gu-text-muted:#a8a8a8; --gu-accent:#8fce6a;
        }
        ha-card { padding: 16px 18px; font-family: 'Lato', sans-serif; background:var(--gu-bg); color:var(--gu-text); }
        .gu-title { font-size:1.15rem; font-weight:700; color:var(--gu-accent); margin-bottom:14px; display:flex; align-items:center; gap:8px; }
        .gu-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
        .gu-cost-row { display:flex; align-items:center; justify-content:space-between; background:var(--gu-bg-alt); border-radius:12px; padding:12px 16px; margin-top:10px; }
        .gu-cost-label { display:flex; align-items:center; gap:8px; font-size:.78rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--gu-text-muted); }
        .gu-cost-label span.emoji { font-size:1.3rem; }
        .gu-cost-value { font-size:1.3rem; font-weight:700; color:var(--gu-text); }
        .gu-stat { background:var(--gu-bg-alt); border-radius:12px; padding:14px 8px; text-align:center; }
        .gu-stat-emoji { font-size:1.6rem; }
        .gu-stat-number { font-size:1.6rem; font-weight:700; color:var(--gu-text); margin-top:4px; }
        .gu-stat-number-money { font-size:1.1rem; }
        .gu-stat-label { font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--gu-text-muted); margin-top:2px; }
        .gu-loading, .gu-error { color:var(--gu-text-muted); font-size:.9rem; padding:8px 0; }
        .gu-error { color:#e05d4a; }
      </style>
      <ha-card>
        <div class="gu-title">\u{1F4CA} ${this._config.title || "Garten \u00dcbersicht"}</div>
        <div class="gu-stats-container"><div class="gu-loading">Lade\u2026</div></div>
      </ha-card>
    `;
  }

  _renderStats(errorMsg) {
    const container = this._root.querySelector(".gu-stats-container");
    if (this._loaded === "error") {
      container.innerHTML = `<div class="gu-error">Fehler beim Laden: ${errorMsg || "unbekannt"}</div>`;
      return;
    }
    if (!this._loaded) {
      container.innerHTML = `<div class="gu-loading">Lade\u2026</div>`;
      return;
    }
    const s = this._stats;
    container.innerHTML = `
      <div class="gu-stats">
        <div class="gu-stat">
          <div class="gu-stat-emoji">\u{1F331}</div>
          <div class="gu-stat-number">${s.gepflanzt}</div>
          <div class="gu-stat-label">Gepflanzt</div>
        </div>
        <div class="gu-stat">
          <div class="gu-stat-emoji">\u{1F33F}</div>
          <div class="gu-stat-number">${s.dauerpflanzungen}</div>
          <div class="gu-stat-label">Dauerbepflanzung</div>
        </div>
        <div class="gu-stat">
          <div class="gu-stat-emoji">\u{1F333}</div>
          <div class="gu-stat-number">${s.gehoelze}</div>
          <div class="gu-stat-label">Geh\u00f6lze</div>
        </div>
      </div>
      <div class="gu-cost-row">
        <div class="gu-cost-label"><span class="emoji">\u{1F4B0}</span> Kosten ${s.year}</div>
        <div class="gu-cost-value">${this._fmtEuro(s.kosten)}</div>
      </div>
    `;
  }
}

customElements.define("gartentagebuch-uebersicht-card", GartentagebuchUebersichtCard);

class GartentagebuchUebersichtCardEditor extends HTMLElement {
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
      { name: "addon_slug", selector: { text: {} } },
      { name: "design", selector: { select: { mode: "dropdown", options: [
        { value: "light", label: "Hell" },
        { value: "dark", label: "Dunkel" }
      ] } } }
    ];
  }

  _labels(name) {
    const map = {
      title: "Titel",
      api_base: "API Basis-URL (leer lassen, wenn addon_slug genutzt wird)",
      addon_slug: "Add-on Slug (z.B. 3744e95d_garden_journal) - alternative zu api_base fuer das HA Add-on",
      design: "Design"
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

customElements.define("gartentagebuch-uebersicht-card-editor", GartentagebuchUebersichtCardEditor);

class GartentagebuchKostenCard extends HTMLElement {
  setConfig(config) {
    if (!config.api_base && !config.addon_slug) throw new Error("api_base oder addon_slug ist erforderlich");
    this._config = config;
    this.setAttribute("data-theme", config.design === "dark" ? "dark" : "light");
    this._costs = [];
    this._kategorien = [];
    this._loaded = false;
    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
      this._render();
    }
    this._loadData();
  }

  set hass(hass) { this._hass = hass; }

  async _base() {
    if (this._config.api_base) return this._config.api_base.replace(/\/$/, "");
    if (this._config.addon_slug) {
      if (!this._ingressBase) {
        if (!this._hass) throw new Error("Warte auf Home Assistant Verbindung...");
        const raw = await this._hass.callApi("GET", `hassio/addons/${this._config.addon_slug}/info`);
        const data = raw && raw.data ? raw.data : raw;
        if (!data || !data.ingress_entry) throw new Error("Ingress-URL fuer '" + this._config.addon_slug + "' nicht gefunden. Slug korrekt?");
        this._ingressBase = data.ingress_entry.replace(/\/$/, "") + "/garten/api";
      }
      return this._ingressBase;
    }
    throw new Error("Weder api_base noch addon_slug konfiguriert");
  }

  getCardSize() { return 3; }

  static getConfigElement() {
    return document.createElement("gartentagebuch-kosten-card-editor");
  }

  static getStubConfig() {
    return { title: "Garten Kosten", api_base: "", addon_slug: "", design: "light" };
  }

  async _loadData() {
    try {
      const base = await this._base();
      const [costs, kategorien] = await Promise.all([
        fetch(`${base}/costs`).then(r => r.json()),
        fetch(`${base}/costs/kategorien`).then(r => r.json())
      ]);
      this._costs = costs;
      this._kategorien = kategorien;
      this._loaded = true;
      this._renderContent();
    } catch (e) {
      this._loaded = "error";
      this._renderContent(e.message);
    }
  }

  _fmtEuro(v) {
    return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20ac";
  }

  _render() {
    this._root.innerHTML = `
      <style>
        :host([data-theme="light"]) {
          --gk-bg:#f9f5ec; --gk-modal-bg:#fff; --gk-bg-alt:#ede8d8;
          --gk-text:#2a2a1e; --gk-text-muted:#6b6b50; --gk-input-bg:#f9f5ec; --gk-accent:#2d5016;
        }
        :host([data-theme="dark"]) {
          --gk-bg:#262626; --gk-modal-bg:#1e1e1e; --gk-bg-alt:#3a3a3a;
          --gk-text:#f2f2f2; --gk-text-muted:#a8a8a8; --gk-input-bg:#2a2a2a; --gk-accent:#8fce6a;
        }
        ha-card { padding: 16px 18px; font-family: 'Lato', sans-serif; background:var(--gk-bg); color:var(--gk-text); }
        .gk-title { font-size:1.15rem; font-weight:700; color:var(--gk-accent); margin-bottom:14px; display:flex; align-items:center; gap:8px; }
        .gk-total-row { display:flex; align-items:center; justify-content:space-between; background:var(--gk-bg-alt); border-radius:12px; padding:14px 16px; margin-bottom:12px; }
        .gk-total-label { font-size:.78rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--gk-text-muted); }
        .gk-total-value { font-size:1.5rem; font-weight:700; color:var(--gk-text); }
        .gk-cat-row { display:flex; align-items:center; gap:10px; padding:8px 4px; }
        .gk-cat-icon { font-size:1.2rem; width:1.6rem; text-align:center; flex-shrink:0; }
        .gk-cat-name { flex:1; font-size:.88rem; color:var(--gk-text); }
        .gk-cat-value { font-size:.88rem; font-weight:700; color:var(--gk-text-muted); }
        .gk-add-row { display:flex; align-items:center; justify-content:center; gap:8px; padding:12px; margin-top:8px; border:1.5px dashed var(--gk-bg-alt); border-radius:10px; cursor:pointer; color:var(--gk-text-muted); font-weight:700; font-size:.88rem; }
        .gk-add-row:hover { border-color:var(--gk-accent); color:var(--gk-accent); }
        .gk-loading, .gk-error, .gk-empty { color:var(--gk-text-muted); font-size:.9rem; padding:8px 0; }
        .gk-error { color:#e05d4a; }

        .gk-modal-backdrop { display:none; position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:1000; align-items:center; justify-content:center; padding:16px; }
        .gk-modal-backdrop.open { display:flex; }
        .gk-modal { background:var(--gk-modal-bg); color:var(--gk-text); border-radius:16px; padding:26px 22px; max-width:420px; width:100%; box-shadow:0 8px 40px rgba(0,0,0,.4); }
        .gk-modal-title { font-size:1.15rem; font-weight:700; color:var(--gk-accent); margin-bottom:16px; }
        .gk-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .gk-form-full { grid-column: span 2; }
        .gk-form-grid label { display:block; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--gk-text-muted); margin-bottom:4px; }
        .gk-form-grid input, .gk-form-grid select { width:100%; box-sizing:border-box; padding:9px 11px; border:1.5px solid var(--gk-bg-alt); border-radius:8px; font-size:.92rem; color:var(--gk-text); background:var(--gk-input-bg); }
        .gk-form-grid input::placeholder { color:var(--gk-text-muted); opacity:.7; }
        .gk-modal-actions { display:flex; gap:8px; margin-top:16px; flex-wrap:wrap; }
        .gk-btn { border:none; border-radius:10px; padding:10px 14px; font-weight:700; font-size:.88rem; cursor:pointer; font-family:'Lato',sans-serif; }
        .gk-btn-cancel { background:none; border:1.5px solid var(--gk-bg-alt); color:var(--gk-text-muted); }
        .gk-btn-save { flex:1; background:linear-gradient(135deg,#4a7c2f,#2d5016); color:#fff; }
      </style>
      <ha-card>
        <div class="gk-title">\u{1F4B0} ${this._config.title || "Garten Kosten"}</div>
        <div class="gk-content-container"><div class="gk-loading">Lade\u2026</div></div>
      </ha-card>

      <div class="gk-modal-backdrop" id="gk-modal-backdrop">
        <div class="gk-modal">
          <div class="gk-modal-title">\u{1F4B0} Ausgabe erfassen</div>
          <div class="gk-form-grid">
            <div><label>Datum</label><input type="date" id="gk-date"></div>
            <div>
              <label>Kategorie</label>
              <select id="gk-category"></select>
            </div>
            <div class="gk-form-full"><label>Betrag (\u20ac)</label><input type="number" step="0.01" min="0" placeholder="z.B. 12.90" id="gk-amount"></div>
            <div class="gk-form-full"><label>Beschreibung (optional)</label><input type="text" placeholder="z.B. Saatgut Tomaten" id="gk-desc"></div>
          </div>
          <div class="gk-modal-actions">
            <button class="gk-btn gk-btn-cancel" id="gk-cancel">Abbrechen</button>
            <button class="gk-btn gk-btn-save" id="gk-save">Speichern</button>
          </div>
        </div>
      </div>
    `;

    this._root.getElementById("gk-cancel").onclick = () => this._closeModal();
    this._root.getElementById("gk-save").onclick = () => this._save();
  }

  _renderContent(errorMsg) {
    const container = this._root.querySelector(".gk-content-container");
    if (this._loaded === "error") {
      container.innerHTML = `<div class="gk-error">Fehler beim Laden: ${errorMsg || "unbekannt"}</div>`;
      return;
    }
    if (!this._loaded) {
      container.innerHTML = `<div class="gk-loading">Lade\u2026</div>`;
      return;
    }
    const year = new Date().getFullYear();
    const yearStr = String(year);
    const yCosts = this._costs.filter(c => (c.date || "").startsWith(yearStr));
    const total = yCosts.reduce((s, c) => s + parseFloat(c.amount), 0);

    const catTotals = {};
    yCosts.forEach(c => { catTotals[c.category] = (catTotals[c.category] || 0) + parseFloat(c.amount); });
    const catRows = this._kategorien
      .map(k => ({ ...k, total: catTotals[k.name] || 0 }))
      .filter(k => k.total > 0)
      .sort((a, b) => b.total - a.total)
      .map(k => `<div class="gk-cat-row">
        <div class="gk-cat-icon">${k.icon || "\u{1F3F7}"}</div>
        <div class="gk-cat-name">${this._esc(k.name)}</div>
        <div class="gk-cat-value">${this._fmtEuro(k.total)}</div>
      </div>`).join("");

    container.innerHTML = `
      <div class="gk-total-row">
        <div class="gk-total-label">Gesamt ${year}</div>
        <div class="gk-total-value">${this._fmtEuro(total)}</div>
      </div>
      ${catRows || `<div class="gk-empty">Noch keine Ausgaben ${year}.</div>`}
      <div class="gk-add-row" id="gk-add-row">\u2795 Ausgabe hinzuf\u00fcgen</div>
    `;
    container.querySelector("#gk-add-row").onclick = () => this._openModal();
  }

  _esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  _openModal() {
    const sel = this._root.getElementById("gk-category");
    sel.innerHTML = this._kategorien.map(k => `<option value="${this._esc(k.name)}">${k.icon || "\u{1F3F7}"} ${this._esc(k.name)}</option>`).join("");
    this._root.getElementById("gk-date").value = new Date().toISOString().split("T")[0];
    this._root.getElementById("gk-amount").value = "";
    this._root.getElementById("gk-desc").value = "";
    this._root.getElementById("gk-modal-backdrop").classList.add("open");
  }

  _closeModal() { this._root.getElementById("gk-modal-backdrop").classList.remove("open"); }

  async _save() {
    const amount = this._root.getElementById("gk-amount").value;
    if (!amount || parseFloat(amount) <= 0) { alert("Bitte einen Betrag eingeben"); return; }
    const body = {
      cost_date: this._root.getElementById("gk-date").value,
      category: this._root.getElementById("gk-category").value,
      description: this._root.getElementById("gk-desc").value.trim() || null,
      amount: parseFloat(amount)
    };
    try {
      const base = await this._base();
      const r = await fetch(`${base}/costs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      this._closeModal();
      await this._loadData();
    } catch (e) {
      alert("Fehler beim Speichern: " + e.message);
    }
  }
}

customElements.define("gartentagebuch-kosten-card", GartentagebuchKostenCard);

class GartentagebuchKostenCardEditor extends HTMLElement {
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
      { name: "addon_slug", selector: { text: {} } },
      { name: "design", selector: { select: { mode: "dropdown", options: [
        { value: "light", label: "Hell" },
        { value: "dark", label: "Dunkel" }
      ] } } }
    ];
  }

  _labels(name) {
    const map = {
      title: "Titel",
      api_base: "API Basis-URL (leer lassen, wenn addon_slug genutzt wird)",
      addon_slug: "Add-on Slug (z.B. 3744e95d_garden_journal) - alternative zu api_base fuer das HA Add-on",
      design: "Design"
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

customElements.define("gartentagebuch-kosten-card-editor", GartentagebuchKostenCardEditor);

window.customCards.push({
  type: "gartentagebuch-kosten-card",
  name: "Gartentagebuch Kosten",
  description: "Jahresuebersicht der Ausgaben nach Kategorie, mit Modal zum Erfassen neuer Ausgaben"
});

window.customCards.push({
  type: "gartentagebuch-uebersicht-card",
  name: "Gartentagebuch \u00dcbersicht",
  description: "Zeigt Anzahl Gepflanzt/Dauerbepflanzung/Gehoelze direkt aus der API (kein MQTT-Sensor noetig)"
});

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
