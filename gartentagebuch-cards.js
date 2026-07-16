// Gartentagebuch Felder-Card f\u00fcr Home Assistant
// Zeigt Standorte + Felder mit aktueller Belegung, \u00f6ffnet Ernte-/Pflanzen-Modal
// Spricht direkt mit der Gartentagebuch-App-API (/garten/api)

class GartentagebuchFelderCard extends HTMLElement {
  setConfig(config) {
    if (!config.addon_slug) throw new Error("addon_slug ist erforderlich");
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
    this._ingressBase = null;
    if (this._hass) this._loadData();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialLoadDone) {
      this._initialLoadDone = true;
      this._loadData();
    }
  }

  getCardSize() { return 3; }

  static getConfigElement() {
    return document.createElement("gartentagebuch-felder-card-editor");
  }

  static getStubConfig() {
    return { title: "Pflanzen", addon_slug: "", design: "light" };
  }

  async _base() {
    if (!this._config.addon_slug) throw new Error("addon_slug ist nicht konfiguriert");
    if (!this._ingressBase) {
      if (!this._hass) throw new Error("Warte auf Home Assistant Verbindung...");
      const raw = await this._hass.connection.sendMessagePromise({
        type: "supervisor/api",
        endpoint: `/addons/${this._config.addon_slug}/info`,
        method: "get"
      });
      const data = raw && raw.data ? raw.data : raw;
      if (!data || !data.ingress_entry) throw new Error("Ingress-URL fuer '" + this._config.addon_slug + "' nicht gefunden. Slug korrekt?");
      this._ingressBase = data.ingress_entry.replace(/\/$/, "") + "/garten/api";
    }
    return this._ingressBase;
  }

  async _fetchJson(url) {
    const r = await fetch(url);
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Ung\u00fcltige Antwort (kein JSON, Add-on evtl. noch am Starten): ${text.slice(0, 100)}`);
    }
  }

  async _loadData(retryCount) {
    retryCount = retryCount || 0;
    try {
      const base = await this._base();
      const [entries, plans, beds, plants] = await Promise.all([
        this._fetchJson(`${base}/entries`),
        this._fetchJson(`${base}/plans`),
        this._fetchJson(`${base}/beds`),
        this._fetchJson(`${base}/plants`)
      ]);
      this._entries = entries;
      this._plans = plans;
      this._beds = beds;
      this._plants = plants;
      this._loaded = true;
      this._renderList();
    } catch (e) {
      if (retryCount < 5) {
        setTimeout(() => this._loadData(retryCount + 1), 2000 * (retryCount + 1));
        return;
      }
      this._loaded = "error";
      this._renderList((e && (e.message || e.error || e.error_message || (typeof e === "string" ? e : JSON.stringify(e)))));
    }
  }

  _esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  _today() { return new Date().toISOString().split("T")[0]; }

  _bedPath(bedId) {
    if (!bedId) return "";
    const parts = [];
    let b = this._beds.find(x => x.id === bedId);
    while (b) { parts.unshift(b.name); b = b.parent_id ? this._beds.find(x => x.id === b.parent_id) : null; }
    return parts.join(" \u203a ");
  }

  _getPlantGroups() {
    const year = new Date().getFullYear();
    const groups = {}, order = [];
    const keyFor = o => o.plant_id ? `id_${o.plant_id}` : `name_${(o.plant || "").toLowerCase()}`;
    const ensure = o => {
      const k = keyFor(o);
      if (!groups[k]) {
        groups[k] = { key: k, plant_id: o.plant_id || null, name: o.plant, emoji: o.emoji, planted: [], harvests: [], permanent: [], planned: [] };
        order.push(k);
      }
      return groups[k];
    };
    this._entries.forEach(e => {
      if (!e.date || new Date(e.date).getFullYear() !== year) return;
      if (e.cat === "plant") ensure(e).planted.push(e);
      else if (e.cat === "harvest") ensure(e).harvests.push(e);
    });
    this._plans.forEach(p => {
      if (p.is_permanent) {
        if (p.year <= year && (p.removed_year == null || p.removed_year > year)) ensure(p).permanent.push(p);
      } else if (p.year === year && !p.done) {
        ensure(p).planned.push(p);
      }
    });
    order.sort((a, b) => groups[a].name.localeCompare(groups[b].name));
    return { groups, order };
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
        .gt-plant-card { background:var(--gt-bg); border:1.5px solid var(--gt-bg-alt); border-radius:12px; padding:12px 14px; margin-bottom:8px; cursor:pointer; transition:.15s; }
        .gt-plant-card:hover { border-color: var(--gt-accent-mid); }
        .gt-plant-head { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
        .gt-plant-emoji { font-size:1.6rem; }
        .gt-plant-name { font-weight:700; color:var(--gt-accent); }
        .gt-badges { display:flex; flex-wrap:wrap; gap:5px; }
        .gt-badge { font-size:.68rem; font-weight:700; padding:2px 8px; border-radius:10px; white-space:nowrap; }
        .gt-badge-planned { background:#e8f5d8; color:var(--gt-accent); }
        .gt-badge-planted { background:var(--gt-harvest-pale); color:#7a4800; }
        .gt-badge-harvest { background:var(--gt-harvest-pale); color:#7a4800; }
        .gt-badge-final { background:#27ae60; color:#fff; }
        .gt-badge-permanent { background:#5a9a3a; color:#fff; }
        .gt-add-row { display:flex; align-items:center; justify-content:center; gap:8px; padding:12px; margin-top:8px; border:1.5px dashed var(--gt-bg-alt); border-radius:10px; cursor:pointer; color:var(--gt-text-muted); font-weight:700; font-size:.88rem; }
        .gt-add-row:hover { border-color:var(--gt-accent-mid); color:var(--gt-accent); }
        .gt-loading, .gt-error, .gt-empty { color:var(--gt-text-muted); font-size:.9rem; padding:8px 0; }
        .gt-error { color:#e05d4a; }

        .gt-modal-backdrop { display:none; position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:1000; align-items:center; justify-content:center; padding:16px; }
        .gt-modal-backdrop.open { display:flex; }
        .gt-modal { background:var(--gt-modal-bg); color:var(--gt-text); border-radius:16px; padding:26px 22px; max-width:440px; width:100%; box-shadow:0 8px 40px rgba(0,0,0,.4); max-height:85vh; overflow-y:auto; }
        .gt-modal-title { font-size:1.15rem; font-weight:700; color:var(--gt-accent); margin-bottom:6px; }
        .gt-modal-sub { font-size:.88rem; color:var(--gt-text-muted); margin-bottom:16px; }
        .gt-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .gt-form-full { grid-column: span 2; }
        .gt-form-grid label { display:block; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--gt-text-muted); margin-bottom:4px; }
        .gt-form-grid input, .gt-form-grid select { width:100%; box-sizing:border-box; padding:9px 11px; border:1.5px solid var(--gt-bg-alt); border-radius:8px; font-size:.92rem; color:var(--gt-text); background:var(--gt-input-bg); }
        .gt-form-grid input::placeholder { color:var(--gt-text-muted); opacity:.7; }
        .gt-checkbox-row { display:flex; align-items:center; gap:8px; font-size:.88rem; font-weight:700; color:var(--gt-accent); cursor:pointer; }
        .gt-modal-actions { display:flex; gap:8px; margin-top:16px; flex-wrap:wrap; }
        .gt-btn { border:none; border-radius:10px; padding:10px 14px; font-weight:700; font-size:.88rem; cursor:pointer; font-family:'Lato',sans-serif; }
        .gt-btn-cancel { background:none; border:1.5px solid var(--gt-bg-alt); color:var(--gt-text-muted); }
        .gt-btn-teil { flex:1; background:linear-gradient(135deg,#f0ad3d,var(--gt-harvest)); color:#3a2600; }
        .gt-btn-final { flex:1; background:linear-gradient(135deg,#c0392b,#922b21); color:#fff; }
        .gt-btn-roden { flex:1; background:linear-gradient(135deg,#c0392b,#7a1f16); color:#fff; }
        .gt-btn-save { flex:1; background:linear-gradient(135deg,var(--gt-accent-mid),var(--gt-accent)); color:#fff; }

        .gt-pd-section { margin-bottom:16px; }
        .gt-pd-title { font-size:.82rem; font-weight:700; color:var(--gt-accent); padding:4px 0; border-bottom:2px solid var(--gt-bg-alt); margin-bottom:6px; }
        .gt-pd-row { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 4px; border-bottom:1px solid var(--gt-bg-alt); }
        .gt-pd-row:last-child { border-bottom:none; }
        .gt-pd-row-main { font-size:.88rem; }
        .gt-pd-row-actions { display:flex; gap:6px; flex-shrink:0; }
      </style>
      <ha-card>
        <div class="gt-title">\u{1F33F} ${this._config.title || "Pflanzen"}</div>
        <div class="gt-grid-container"><div class="gt-loading">Lade\u2026</div></div>
      </ha-card>

      <div class="gt-modal-backdrop" id="detail-backdrop">
        <div class="gt-modal">
          <div class="gt-modal-title" id="detail-title"></div>
          <div id="detail-body"></div>
          <div class="gt-modal-actions"><button class="gt-btn gt-btn-cancel" id="detail-close" style="flex:1">Schlie\u00dfen</button></div>
        </div>
      </div>

      <div class="gt-modal-backdrop" id="new-entry-backdrop">
        <div class="gt-modal">
          <div class="gt-modal-title">\u{1F331} Neue Pflanzung</div>
          <div class="gt-form-grid">
            <div class="gt-form-full"><label>Pflanze aus Katalog</label><select id="ne-plant"></select></div>
            <div><label>Datum</label><input type="date" id="ne-date"></div>
            <div><label>Beet (optional)</label><select id="ne-bed"><option value="">\u2013 Kein Beet \u2013</option></select></div>
            <div class="gt-form-full"><label class="gt-checkbox-row"><input type="checkbox" id="ne-permanent" style="width:16px;height:16px"> \u{1F33F} Dauerbepflanzung \u2013 bleibt jedes Jahr</label></div>
          </div>
          <div class="gt-modal-actions">
            <button class="gt-btn gt-btn-cancel" id="ne-cancel">Abbrechen</button>
            <button class="gt-btn gt-btn-save" id="ne-save">\u{1F331} Pflanzen</button>
          </div>
        </div>
      </div>

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
            <button class="gt-btn gt-btn-final" id="h-final">\u2713 Endg\u00fcltig ernten</button>
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

      <div class="gt-modal-backdrop" id="date-edit-backdrop">
        <div class="gt-modal" style="max-width:320px">
          <div class="gt-modal-title">\u{1F4C5} Datum \u00e4ndern</div>
          <input type="date" id="de-date" style="width:100%;box-sizing:border-box;padding:9px 11px;border:1.5px solid var(--gt-bg-alt);border-radius:8px;background:var(--gt-input-bg);color:var(--gt-text)">
          <div class="gt-modal-actions">
            <button class="gt-btn gt-btn-cancel" id="de-cancel">Abbrechen</button>
            <button class="gt-btn gt-btn-save" id="de-save">Speichern</button>
          </div>
        </div>
      </div>
    `;

    this._root.getElementById("detail-close").onclick = () => this._closeDetail();
    this._root.getElementById("ne-cancel").onclick = () => this._closeNewEntryModal();
    this._root.getElementById("ne-save").onclick = () => this._saveNewEntry();
    this._root.getElementById("h-cancel").onclick = () => this._closeHarvestModal();
    this._root.getElementById("h-teil").onclick = () => this._saveHarvest(false);
    this._root.getElementById("h-final").onclick = () => this._saveHarvest(true);
    this._root.getElementById("dh-cancel").onclick = () => this._closeDauerhaftModal();
    this._root.getElementById("dh-teil").onclick = () => this._saveDauerhaftHarvest(false);
    this._root.getElementById("dh-roden").onclick = () => this._saveDauerhaftHarvest(true);
    this._root.getElementById("de-cancel").onclick = () => this._closeDateEdit();
    this._root.getElementById("de-save").onclick = () => this._saveDateEdit();
  }

  _renderList(errorMsg) {
    const container = this._root.querySelector(".gt-grid-container");
    if (this._loaded === "error") {
      container.innerHTML = `<div class="gt-error">Fehler beim Laden: ${errorMsg || "unbekannt"}</div>`;
      return;
    }
    if (!this._loaded) {
      container.innerHTML = `<div class="gt-loading">Lade\u2026</div>`;
      return;
    }
    const { groups, order } = this._getPlantGroups();
    const year = new Date().getFullYear();
    const rows = order.map(k => {
      const g = groups[k];
      const badges = [];
      if (g.planned.length) badges.push(`<span class="gt-badge gt-badge-planned">\u{1F4C5} Geplant</span>`);
      if (g.planted.length) badges.push(`<span class="gt-badge gt-badge-planted">\u{1F331} Gepflanzt</span>`);
      const teil = g.harvests.filter(h => !h.harvest_final).length;
      if (teil) badges.push(`<span class="gt-badge gt-badge-harvest">\u{1F33E} ${teil}x Teilernte</span>`);
      if (g.harvests.some(h => h.harvest_final)) badges.push(`<span class="gt-badge gt-badge-final">\u2713 Final geerntet</span>`);
      if (g.permanent.length) badges.push(`<span class="gt-badge gt-badge-permanent">\u{1F33F} Dauerhaft</span>`);
      return `<div class="gt-plant-card" data-key="${this._esc(k)}">
        <div class="gt-plant-head"><span class="gt-plant-emoji">${g.emoji || "\u{1F331}"}</span><div class="gt-plant-name">${this._esc(g.name)}</div></div>
        <div class="gt-badges">${badges.join("")}</div>
      </div>`;
    });
    const empty = order.length ? "" : `<div class="gt-empty">Keine Pflanzen ${year}.</div>`;
    container.innerHTML = empty + rows.join("") + `<div class="gt-add-row" id="add-row">\u2795 Neue Pflanzung</div>`;
    container.querySelectorAll(".gt-plant-card").forEach(el => {
      el.onclick = () => this._openDetail(el.dataset.key);
    });
    container.querySelector("#add-row").onclick = () => this._openNewEntryModal();
  }

  _openDetail(key) {
    const { groups } = this._getPlantGroups();
    const g = groups[key];
    if (!g) return;
    this._currentDetailKey = key;
    let html = "";
    if (g.planned.length) {
      html += `<div class="gt-pd-section"><div class="gt-pd-title">\u{1F4C5} Geplant</div>` + g.planned.map(p => `
        <div class="gt-pd-row"><div class="gt-pd-row-main">${p.bed_id ? this._esc(this._bedPath(p.bed_id)) : "Kein Beet"}${p.month ? " \u00b7 " + p.month + "/" + p.year : ""}</div>
        <div class="gt-pd-row-actions"><button class="gt-btn gt-btn-cancel" style="padding:4px 8px" onclick="this.getRootNode().host._deletePlanFromDetail(${p.id})">\u{1F5D1}</button></div></div>
      `).join("") + `</div>`;
    }
    if (g.permanent.length) {
      html += `<div class="gt-pd-section"><div class="gt-pd-title">\u{1F33F} Dauerhaft</div>` + g.permanent.map(p => `
        <div class="gt-pd-row"><div class="gt-pd-row-main">${p.bed_id ? this._esc(this._bedPath(p.bed_id)) : "Kein Beet"} \u00b7 seit ${p.year}</div>
        <div class="gt-pd-row-actions"><button class="gt-btn gt-btn-teil" style="padding:4px 8px" onclick="this.getRootNode().host._closeDetail();this.getRootNode().host._openDauerhaftModal(${p.bed_id || "null"},'${this._esc(g.name).replace(/'/g, "\\'")}','${g.emoji || "\u{1F331}"}',${p.id})">\u{1F33E}</button></div></div>
      `).join("") + `</div>`;
    }
    if (g.planted.length) {
      html += `<div class="gt-pd-section"><div class="gt-pd-title">\u{1F331} Pflanzungen</div>` + g.planted.map(e => `
        <div class="gt-pd-row"><div class="gt-pd-row-main">${this._fmtDate(e.date)}${e.bed_id ? " \u00b7 " + this._esc(this._bedPath(e.bed_id)) : ""}</div>
        <div class="gt-pd-row-actions">
          <button class="gt-btn gt-btn-teil" style="padding:4px 8px" title="Ernte" onclick="this.getRootNode().host._closeDetail();this.getRootNode().host._openHarvestModal(${e.bed_id || "null"},'${this._esc(e.plant).replace(/'/g, "\\'")}','${e.emoji || "\u{1F331}"}')">\u{1F33E}</button>
          <button class="gt-btn gt-btn-cancel" style="padding:4px 8px" title="Datum" onclick="this.getRootNode().host._openDateEdit(${e.id})">\u270F\uFE0F</button>
          <button class="gt-btn gt-btn-cancel" style="padding:4px 8px" onclick="this.getRootNode().host._deleteEntryFromDetail(${e.id})">\u{1F5D1}</button>
        </div></div>
      `).join("") + `</div>`;
    }
    if (g.harvests.length) {
      html += `<div class="gt-pd-section"><div class="gt-pd-title">\u{1F33E} Ernten</div>` + g.harvests.map(e => {
        const menge = e.harvest_amount ? `${e.harvest_amount} ${e.harvest_unit || ""}` : "";
        const fin = e.harvest_final ? `<span class="gt-badge gt-badge-final">\u2713 Final</span>` : `<span class="gt-badge gt-badge-harvest">Teilernte</span>`;
        return `<div class="gt-pd-row"><div class="gt-pd-row-main">${this._fmtDate(e.date)}${menge ? " \u00b7 " + menge : ""} ${fin}</div>
        <div class="gt-pd-row-actions">
          <button class="gt-btn gt-btn-cancel" style="padding:4px 8px" title="Datum" onclick="this.getRootNode().host._openDateEdit(${e.id})">\u270F\uFE0F</button>
          <button class="gt-btn gt-btn-cancel" style="padding:4px 8px" onclick="this.getRootNode().host._deleteEntryFromDetail(${e.id})">\u{1F5D1}</button>
        </div></div>`;
      }).join("") + `</div>`;
    }
    this._root.getElementById("detail-title").innerHTML = `${g.emoji || "\u{1F331}"} ${this._esc(g.name)}`;
    this._root.getElementById("detail-body").innerHTML = html || `<div class="gt-empty">Keine Daten</div>`;
    this._root.getElementById("detail-backdrop").classList.add("open");
  }
  _closeDetail() { this._root.getElementById("detail-backdrop").classList.remove("open"); }
  async _refreshDetail() {
    await this._loadData();
    if (this._currentDetailKey) this._openDetail(this._currentDetailKey);
  }
  async _deleteEntryFromDetail(id) {
    try {
      const base = await this._base();
      await fetch(`${base}/entries/${id}`, { method: "DELETE" });
      this._refreshDetail();
    } catch (e) { alert("Fehler: " + e.message); }
  }
  async _deletePlanFromDetail(id) {
    try {
      const base = await this._base();
      await fetch(`${base}/plans/${id}`, { method: "DELETE" });
      this._refreshDetail();
    } catch (e) { alert("Fehler: " + e.message); }
  }

  _fmtDate(d) {
    if (!d) return "\u2013";
    const [y, m, day] = d.split("-");
    return `${day}.${m}.${y}`;
  }

  _openDateEdit(entryId) {
    const e = this._entries.find(x => x.id === entryId);
    if (!e) return;
    this._dateEditEntry = e;
    this._root.getElementById("de-date").value = e.date;
    this._root.getElementById("date-edit-backdrop").classList.add("open");
  }
  _closeDateEdit() { this._root.getElementById("date-edit-backdrop").classList.remove("open"); }
  async _saveDateEdit() {
    const e = this._dateEditEntry;
    if (!e) return;
    const newDate = this._root.getElementById("de-date").value;
    if (!newDate) return;
    try {
      const base = await this._base();
      const r = await fetch(`${base}/entries/${e.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji: e.emoji, plant: e.plant, date: newDate, location: e.location, description: e.description, cat: e.cat, bed_id: e.bed_id, plant_cat: e.plant_cat, plant_family_id: e.plant_family_id, harvest_amount: e.harvest_amount, harvest_unit: e.harvest_unit, plant_id: e.plant_id })
      });
      if (!r.ok) throw new Error(await r.text());
      this._closeDateEdit();
      this._refreshDetail();
    } catch (err) { alert("Fehler: " + err.message); }
  }

  _openNewEntryModal() {
    const sel = this._root.getElementById("ne-plant");
    sel.innerHTML = `<option value="">\u2013 Pflanze w\u00e4hlen \u2013</option>` + this._plants.map(p =>
      `<option value="${p.id}" data-emoji="${p.emoji}" data-fam="${p.plant_family_id || ""}">${p.emoji} ${this._esc(p.name)}</option>`
    ).join("");
    const bedSel = this._root.getElementById("ne-bed");
    bedSel.innerHTML = `<option value="">\u2013 Kein Beet \u2013</option>` + this._beds
      .filter(b => !b.parent_id)
      .map(root => this._bedOptionsRecursive(root, 0)).join("");
    this._root.getElementById("ne-date").value = this._today();
    this._root.getElementById("ne-permanent").checked = false;
    this._root.getElementById("new-entry-backdrop").classList.add("open");
  }
  _bedOptionsRecursive(bed, indent) {
    const children = this._beds.filter(b => b.parent_id === bed.id);
    let html = `<option value="${bed.id}">${"\u00a0\u00a0\u00a0".repeat(indent)}${this._esc(bed.name)}</option>`;
    children.forEach(c => { html += this._bedOptionsRecursive(c, indent + 1); });
    return html;
  }
  _closeNewEntryModal() { this._root.getElementById("new-entry-backdrop").classList.remove("open"); }
  async _saveNewEntry() {
    const sel = this._root.getElementById("ne-plant");
    const opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) { alert("Bitte Pflanze w\u00e4hlen"); return; }
    const bedId = this._root.getElementById("ne-bed").value || null;
    const date = this._root.getElementById("ne-date").value;
    const isPermanent = this._root.getElementById("ne-permanent").checked;
    const plantName = opt.textContent.trim().replace(/^\S+\s/, "");
    const entry = {
      id: Date.now(), emoji: opt.dataset.emoji, plant: plantName, date, cat: "plant",
      bed_id: bedId ? parseInt(bedId, 10) : null, plant_id: parseInt(opt.value, 10),
      plant_family_id: opt.dataset.fam ? parseInt(opt.dataset.fam, 10) : null
    };
    try {
      const base = await this._base();
      const r = await fetch(`${base}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
      if (!r.ok) throw new Error(await r.text());
      if (isPermanent) {
        const plan = {
          id: Date.now() + 1, emoji: entry.emoji, plant: entry.plant, month: 0, month_to: 0,
          year: new Date(date).getFullYear(), bed_id: entry.bed_id, plant_family_id: entry.plant_family_id,
          is_permanent: true, plant_id: entry.plant_id
        };
        await fetch(`${base}/plans`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(plan) });
      }
      this._closeNewEntryModal();
      await this._loadData();
    } catch (e) { alert("Fehler beim Speichern: " + e.message); }
  }

  _openHarvestModal(bedId, plant, emoji) {
    this._activeBedId = bedId; this._activePlant = plant; this._activeEmoji = emoji;
    this._root.getElementById("harvest-sub").textContent = `${emoji} ${plant}${bedId ? " \u00b7 " + this._bedPath(bedId) : ""}`;
    this._root.getElementById("h-date").value = this._today();
    this._root.getElementById("h-amount").value = "";
    this._root.getElementById("h-unit").value = "kg";
    this._root.getElementById("h-note").value = "";
    this._root.getElementById("harvest-backdrop").classList.add("open");
  }
  _closeHarvestModal() { this._root.getElementById("harvest-backdrop").classList.remove("open"); }
  async _saveHarvest(final) {
    const amount = this._root.getElementById("h-amount").value;
    const body = {
      id: Date.now(), emoji: this._activeEmoji, plant: this._activePlant,
      date: this._root.getElementById("h-date").value, cat: "harvest", bed_id: this._activeBedId,
      description: this._root.getElementById("h-note").value || (final ? "Letzte Ernte" : ""),
      harvest_amount: amount ? parseFloat(amount) : null, harvest_unit: this._root.getElementById("h-unit").value,
      harvest_final: !!final
    };
    try {
      const base = await this._base();
      const r = await fetch(`${base}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      this._closeHarvestModal();
      await this._loadData();
    } catch (e) { alert("Fehler beim Speichern: " + e.message); }
  }

  _openDauerhaftModal(bedId, plant, emoji, planId) {
    this._activePlanId = planId; this._activeDauerhaftEmoji = emoji; this._activeDauerhaftPlant = plant; this._activeDauerhaftBedId = bedId;
    this._root.getElementById("dauerhaft-sub").textContent = `${emoji} ${plant}${bedId ? " \u00b7 " + this._bedPath(bedId) : ""}`;
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
      id: Date.now(), emoji: this._activeDauerhaftEmoji, plant: this._activeDauerhaftPlant,
      date: this._root.getElementById("dh-date").value, cat: "harvest", bed_id: this._activeDauerhaftBedId,
      description: this._root.getElementById("dh-note").value || (roden ? "Gerodet" : ""),
      harvest_amount: amount ? parseFloat(amount) : null, harvest_unit: this._root.getElementById("dh-unit").value,
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
    } catch (e) { alert("Fehler beim Speichern: " + e.message); }
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
      addon_slug: "Add-on Slug (z.B. 3744e95d_garden_journal)",
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

customElements.define("gartentagebuch-felder-card-editor", GartentagebuchFelderCardEditor);

class GartentagebuchGehoelzeCard extends HTMLElement {
  setConfig(config) {
    if (!config.addon_slug) throw new Error("addon_slug ist erforderlich");
    this._config = config;
    this.setAttribute("data-theme", config.design === "dark" ? "dark" : "light");
    this._items = [];
    this._plants = [];
    this._loaded = false;
    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
      this._render();
    }
    this._ingressBase = null;
    if (this._hass) this._loadData();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialLoadDone) {
      this._initialLoadDone = true;
      this._loadData();
    }
  }

  async _base() {
    if (!this._config.addon_slug) throw new Error("addon_slug ist nicht konfiguriert");
    if (!this._ingressBase) {
      if (!this._hass) throw new Error("Warte auf Home Assistant Verbindung...");
      const raw = await this._hass.connection.sendMessagePromise({
        type: "supervisor/api",
        endpoint: `/addons/${this._config.addon_slug}/info`,
        method: "get"
      });
      const data = raw && raw.data ? raw.data : raw;
      if (!data || !data.ingress_entry) throw new Error("Ingress-URL fuer '" + this._config.addon_slug + "' nicht gefunden. Slug korrekt?");
      this._ingressBase = data.ingress_entry.replace(/\/$/, "") + "/garten/api";
    }
    return this._ingressBase;
  }

  async _fetchJson(url) {
    const r = await fetch(url);
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Ung\u00fcltige Antwort (kein JSON, Add-on evtl. noch am Starten): ${text.slice(0, 100)}`);
    }
  }

  getCardSize() { return 3; }

  static getConfigElement() {
    return document.createElement("gartentagebuch-gehoelze-card-editor");
  }

  static getStubConfig() {
    return { title: "Gehoelze", addon_slug: "", design: "light" };
  }

  async _loadData(retryCount) {
    retryCount = retryCount || 0;
    try {
      const base = await this._base();
      const [items, plants] = await Promise.all([
        this._fetchJson(`${base}/perennials`),
        this._fetchJson(`${base}/plants`).catch(() => [])
      ]);
      this._items = items.filter(i => !i.removed_year);
      this._plants = plants;
      this._loaded = true;
      this._renderList();
    } catch (e) {
      if (retryCount < 5) {
        setTimeout(() => this._loadData(retryCount + 1), 2000 * (retryCount + 1));
        return;
      }
      this._loaded = "error";
      this._renderList((e && (e.message || e.error || e.error_message || (typeof e === "string" ? e : JSON.stringify(e)))));
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
      addon_slug: "Add-on Slug (z.B. 3744e95d_garden_journal)",
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
    if (!config.addon_slug) throw new Error("addon_slug ist erforderlich");
    this._config = config;
    this.setAttribute("data-theme", config.design === "dark" ? "dark" : "light");
    this._loaded = false;
    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
      this._render();
    }
    this._ingressBase = null;
    if (this._hass) this._loadData();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialLoadDone) {
      this._initialLoadDone = true;
      this._loadData();
    }
  }

  async _base() {
    if (!this._config.addon_slug) throw new Error("addon_slug ist nicht konfiguriert");
    if (!this._ingressBase) {
      if (!this._hass) throw new Error("Warte auf Home Assistant Verbindung...");
      const raw = await this._hass.connection.sendMessagePromise({
        type: "supervisor/api",
        endpoint: `/addons/${this._config.addon_slug}/info`,
        method: "get"
      });
      const data = raw && raw.data ? raw.data : raw;
      if (!data || !data.ingress_entry) throw new Error("Ingress-URL fuer '" + this._config.addon_slug + "' nicht gefunden. Slug korrekt?");
      this._ingressBase = data.ingress_entry.replace(/\/$/, "") + "/garten/api";
    }
    return this._ingressBase;
  }

  async _fetchJson(url) {
    const r = await fetch(url);
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Ung\u00fcltige Antwort (kein JSON, Add-on evtl. noch am Starten): ${text.slice(0, 100)}`);
    }
  }

  getCardSize() { return 2; }

  static getConfigElement() {
    return document.createElement("gartentagebuch-uebersicht-card-editor");
  }

  static getStubConfig() {
    return { title: "Garten \u00dcbersicht", addon_slug: "", design: "light" };
  }

  async _loadData(retryCount) {
    retryCount = retryCount || 0;
    try {
      const base = await this._base();
      const [occ, perennials, entries, costs] = await Promise.all([
        this._fetchJson(`${base}/beds/occupancy`),
        this._fetchJson(`${base}/perennials`),
        this._fetchJson(`${base}/entries`),
        this._fetchJson(`${base}/costs`)
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
      if (retryCount < 5) {
        setTimeout(() => this._loadData(retryCount + 1), 2000 * (retryCount + 1));
        return;
      }
      this._loaded = "error";
      this._renderStats((e && (e.message || e.error || e.error_message || (typeof e === "string" ? e : JSON.stringify(e)))));
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
      addon_slug: "Add-on Slug (z.B. 3744e95d_garden_journal)",
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
    if (!config.addon_slug) throw new Error("addon_slug ist erforderlich");
    this._config = config;
    this.setAttribute("data-theme", config.design === "dark" ? "dark" : "light");
    this._costs = [];
    this._kategorien = [];
    this._loaded = false;
    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
      this._render();
    }
    this._ingressBase = null;
    if (this._hass) this._loadData();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialLoadDone) {
      this._initialLoadDone = true;
      this._loadData();
    }
  }

  async _base() {
    if (!this._config.addon_slug) throw new Error("addon_slug ist nicht konfiguriert");
    if (!this._ingressBase) {
      if (!this._hass) throw new Error("Warte auf Home Assistant Verbindung...");
      const raw = await this._hass.connection.sendMessagePromise({
        type: "supervisor/api",
        endpoint: `/addons/${this._config.addon_slug}/info`,
        method: "get"
      });
      const data = raw && raw.data ? raw.data : raw;
      if (!data || !data.ingress_entry) throw new Error("Ingress-URL fuer '" + this._config.addon_slug + "' nicht gefunden. Slug korrekt?");
      this._ingressBase = data.ingress_entry.replace(/\/$/, "") + "/garten/api";
    }
    return this._ingressBase;
  }

  async _fetchJson(url) {
    const r = await fetch(url);
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Ung\u00fcltige Antwort (kein JSON, Add-on evtl. noch am Starten): ${text.slice(0, 100)}`);
    }
  }

  getCardSize() { return 3; }

  static getConfigElement() {
    return document.createElement("gartentagebuch-kosten-card-editor");
  }

  static getStubConfig() {
    return { title: "Garten Kosten", addon_slug: "", design: "light" };
  }

  async _loadData(retryCount) {
    retryCount = retryCount || 0;
    try {
      const base = await this._base();
      const [costs, kategorien] = await Promise.all([
        this._fetchJson(`${base}/costs`),
        this._fetchJson(`${base}/costs/kategorien`)
      ]);
      this._costs = costs;
      this._kategorien = kategorien;
      this._loaded = true;
      this._renderContent();
    } catch (e) {
      if (retryCount < 5) {
        setTimeout(() => this._loadData(retryCount + 1), 2000 * (retryCount + 1));
        return;
      }
      this._loaded = "error";
      this._renderContent((e && (e.message || e.error || e.error_message || (typeof e === "string" ? e : JSON.stringify(e)))));
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
      addon_slug: "Add-on Slug (z.B. 3744e95d_garden_journal)",
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
