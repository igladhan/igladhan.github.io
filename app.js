/* ==========================================================================
   BESTIARIUM MUNDI — Interactive Archival Engine (app.js)
   ========================================================================== */

(function () {
  "use strict";

  const CANONICAL_REGIONS = [
    "Ancient Near East & Persia",
    "Egypt & Africa",
    "Greece & Aegean",
    "Etruria, Rome & Byzantium",
    "Medieval, Celtic & Norse Europe",
    "Renaissance & Early Modern Europe",
    "East Asia & Eurasian Steppe",
    "South & Southeast Asia",
    "The Americas & Oceania"
  ];

  const CANONICAL_ERAS = [
    "Prehistory & Bronze Age",
    "Iron Age & Classical Antiquity",
    "Post-Classical & Medieval",
    "Renaissance & Early Modern",
    "Enlightenment & 19th Century"
  ];

  const ERA_SPANS = {
    "Prehistory & Bronze Age": "c. 38,000 – 1200 BCE",
    "Iron Age & Classical Antiquity": "c. 1200 BCE – 500 CE",
    "Post-Classical & Medieval": "c. 500 – 1400 CE",
    "Renaissance & Early Modern": "c. 1400 – 1750 CE",
    "Enlightenment & 19th Century": "c. 1750 – 1905 CE"
  };

  const ATLAS_COORDS = {
    "The Americas & Oceania": { x: 215, y: 245, short: "Americas & Oceania" },
    "Medieval, Celtic & Norse Europe": { x: 472, y: 122, short: "Medieval & Norse" },
    "Renaissance & Early Modern Europe": { x: 486, y: 162, short: "Early Modern Europe" },
    "Etruria, Rome & Byzantium": { x: 515, y: 188, short: "Rome & Byzantium" },
    "Greece & Aegean": { x: 548, y: 196, short: "Greece & Aegean" },
    "Egypt & Africa": { x: 530, y: 268, short: "Egypt & Africa" },
    "Ancient Near East & Persia": { x: 605, y: 205, short: "Near East & Persia" },
    "South & Southeast Asia": { x: 718, y: 248, short: "South & SE Asia" },
    "East Asia & Eurasian Steppe": { x: 785, y: 175, short: "East Asia & Steppe" }
  };

  // Piecewise historical stops for smooth, intuitive chronological slider control
  const YEAR_STOPS = [-40000, -3500, -1500, -700, -300, 100, 600, 1100, 1450, 1700, 1910];

  const PAGE_SIZE = 48;

  const state = {
    items: [],
    filtered: [],
    visibleCount: PAGE_SIZE,
    search: "",
    region: "ALL",
    era: "ALL",
    morphology: "ALL",
    mediumCategory: "ALL",
    creatureExact: "ALL",
    sort: "chrono-asc",
    sliderMin: 0,
    sliderMax: 100,
    view: "gallery",
    atlasRegion: "Ancient Near East & Persia",
    compareIds: [],
    activeModalId: null,
    theme: localStorage.getItem("bestiarium_theme") || "vellum"
  };

  /* ------------------------------------------------------------------------
     Utility Helpers
     ------------------------------------------------------------------------ */
  function esc(val) {
    if (val === null || val === undefined) return "";
    return String(val)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sliderToYear(pos) {
    const p = Math.max(0, Math.min(100, Number(pos)));
    const segCount = YEAR_STOPS.length - 1;
    const scaled = (p / 100) * segCount;
    const idx = Math.min(segCount - 1, Math.floor(scaled));
    const frac = scaled - idx;
    return Math.round(YEAR_STOPS[idx] + frac * (YEAR_STOPS[idx + 1] - YEAR_STOPS[idx]));
  }

  function formatYear(y) {
    if (y < 0) return `${Math.abs(y).toLocaleString()} BCE`;
    if (y === 0) return "1 CE";
    return `${y} CE`;
  }

  function makeFallbackSvgDataUri(item) {
    const title = esc((item.title || item.creature || "Historical Artifact").slice(0, 52));
    const creature = esc((item.creature || "Mythical Beast").toUpperCase().slice(0, 34));
    const civ = esc((item.civilization || item.region || "").slice(0, 42));
    const date = esc(item.dateDisplay || formatYear(item.yearSort || 0));
    const cat = esc(item.catalogNumber || "ARCHIVE PLATE");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">
      <rect width="640" height="480" fill="#ebe3d3"/>
      <rect x="20" y="20" width="600" height="440" fill="none" stroke="#8c6d46" stroke-width="2"/>
      <rect x="28" y="28" width="584" height="424" fill="none" stroke="#8c6d46" stroke-width="0.75" stroke-dasharray="4 3"/>
      <text x="320" y="95" text-anchor="middle" font-family="monospace" font-size="13" fill="#7a5c38" letter-spacing="3">${cat}</text>
      <circle cx="320" cy="185" r="44" fill="none" stroke="#8c3b2b" stroke-width="1.5"/>
      <path d="M298 196 C308 164, 332 164, 342 196 M306 178 L334 178" stroke="#8c3b2b" stroke-width="1.5" fill="none"/>
      <text x="320" y="272" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="21" fill="#292118" letter-spacing="2">${creature}</text>
      <text x="320" y="308" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="16" fill="#4a3e31">${title}</text>
      <text x="320" y="352" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#6b5d4d">${civ}</text>
      <text x="320" y="378" text-anchor="middle" font-family="monospace" font-size="12" fill="#8c3b2b">${date}</text>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  // Global resilient image error handler attached via event delegation
  window.handlePlateError = function (imgEl, id) {
    const item = state.items.find((x) => x.id === id);
    if (!item) return;
    const stage = Number(imgEl.dataset.fallbackStage || "0");
    if (stage === 0 && item.fullImageUrl && imgEl.src !== item.fullImageUrl) {
      imgEl.dataset.fallbackStage = "1";
      imgEl.src = item.fullImageUrl;
    } else if (stage <= 1) {
      imgEl.dataset.fallbackStage = "2";
      imgEl.src = makeFallbackSvgDataUri(item);
    }
  };

  /* ------------------------------------------------------------------------
     Theme Handling
     ------------------------------------------------------------------------ */
  function applyTheme(theme) {
    state.theme = theme === "basalt" ? "basalt" : "vellum";
    document.documentElement.setAttribute("data-theme", state.theme);
    localStorage.setItem("bestiarium_theme", state.theme);
    const label = document.getElementById("theme-toggle-label");
    if (label) {
      label.textContent = state.theme === "vellum" ? "Nocturne Basalt" : "Folio Vellum";
    }
  }

  /* ------------------------------------------------------------------------
     Data Loading & Normalization
     ------------------------------------------------------------------------ */
  async function loadArchiveData() {
    let raw = null;
    if (window.MYTHICAL_ARCHIVE && Array.isArray(window.MYTHICAL_ARCHIVE.items)) {
      raw = window.MYTHICAL_ARCHIVE;
    } else {
      const resp = await fetch("data/depictions.json");
      raw = await resp.json();
    }

    const items = (raw.items || raw || []).slice();
    items.sort((a, b) => (a.yearSort || 0) - (b.yearSort || 0));
    items.forEach((item, idx) => {
      item.catalogNumber = `CAT. ${String(idx + 1).padStart(3, "0")}`;
      item._searchBlob = [
        item.title,
        item.creature,
        item.creatureFamily,
        item.localName,
        item.civilization,
        item.region,
        item.originLocation,
        item.dateDisplay,
        item.era,
        item.medium,
        item.mediumCategory,
        item.morphology,
        item.creator,
        item.repository,
        item.description,
        ...(item.anatomy || [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    });

    state.items = items;
    populateFacetDropdowns();
    renderHeroStats();
    renderWingStrip();
    applyFiltersAndRender();
  }

  function renderHeroStats() {
    const items = state.items;
    const creatures = new Set(items.map((d) => (d.creature || "").trim().toLowerCase())).size;
    const cultures = new Set(items.map((d) => (d.civilization || "").trim().toLowerCase())).size;
    const minYear = items.reduce((m, d) => Math.min(m, d.yearSort || 0), 0);
    const maxYear = items.reduce((m, d) => Math.max(m, d.yearSort || 0), 0);

    document.getElementById("stat-total-works").textContent = items.length.toLocaleString();
    document.getElementById("stat-total-creatures").textContent = creatures.toLocaleString();
    document.getElementById("stat-total-cultures").textContent = cultures.toLocaleString();
    const spanYears = Math.max(1000, maxYear - minYear);
    document.getElementById("stat-year-span").textContent = `${Math.round(spanYears / 1000).toLocaleString()},000+ yrs`;

    document.getElementById("masthead-corpus-stat").textContent =
      `${items.length} Verified Plates · 9 Global Wings`;
    const colophon = document.getElementById("colophon-build-stats");
    if (colophon) {
      colophon.textContent =
        `Argon Verified Corpus: ${items.length} plates across ${cultures} civilizations (${formatYear(minYear)} – ${formatYear(maxYear)})`;
    }
  }

  function populateFacetDropdowns() {
    const eraSel = document.getElementById("filter-era-select");
    CANONICAL_ERAS.forEach((era) => {
      const count = state.items.filter((i) => i.era === era).length;
      if (count > 0) {
        const opt = document.createElement("option");
        opt.value = era;
        opt.textContent = `${era} (${count})`;
        eraSel.appendChild(opt);
      }
    });

    const morphs = Array.from(new Set(state.items.map((i) => i.morphology).filter(Boolean))).sort();
    const morphSel = document.getElementById("filter-morphology-select");
    morphs.forEach((m) => {
      const count = state.items.filter((i) => i.morphology === m).length;
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = `${m} (${count})`;
      morphSel.appendChild(opt);
    });

    const mediums = Array.from(new Set(state.items.map((i) => i.mediumCategory).filter(Boolean))).sort();
    const medSel = document.getElementById("filter-medium-select");
    mediums.forEach((med) => {
      const count = state.items.filter((i) => i.mediumCategory === med).length;
      const opt = document.createElement("option");
      opt.value = med;
      opt.textContent = `${med} (${count})`;
      medSel.appendChild(opt);
    });
  }

  function renderWingStrip() {
    const strip = document.getElementById("wings-filter-strip");
    const counts = {};
    state.items.forEach((i) => {
      counts[i.region] = (counts[i.region] || 0) + 1;
    });

    let html = `<button type="button" class="wing-pill" data-region="ALL" aria-pressed="${state.region === "ALL"}">
      <span>All Global Wings</span>
      <span class="wing-count">${state.items.length}</span>
    </button>`;

    CANONICAL_REGIONS.forEach((reg) => {
      if (!counts[reg]) return;
      const active = state.region === reg;
      html += `<button type="button" class="wing-pill" data-region="${esc(reg)}" aria-pressed="${active}">
        <span>${esc(reg)}</span>
        <span class="wing-count">${counts[reg]}</span>
      </button>`;
    });

    strip.innerHTML = html;
    document.getElementById("active-wing-indicator").textContent =
      state.region === "ALL" ? "All Nine Global Wings" : state.region;
  }

  /* ------------------------------------------------------------------------
     Filtering & Sorting
     ------------------------------------------------------------------------ */
  function applyFiltersAndRender(keepPagination) {
    if (!keepPagination) state.visibleCount = PAGE_SIZE;

    const q = state.search.trim().toLowerCase();
    const minYear = sliderToYear(state.sliderMin);
    const maxYear = sliderToYear(state.sliderMax);

    document.getElementById("chrono-range-readout").textContent =
      `${formatYear(minYear)} – ${formatYear(maxYear)}`;

    const filtered = state.items.filter((item) => {
      if (state.region !== "ALL" && item.region !== state.region) return false;
      if (state.era !== "ALL" && item.era !== state.era) return false;
      if (state.morphology !== "ALL" && item.morphology !== state.morphology) return false;
      if (state.mediumCategory !== "ALL" && item.mediumCategory !== state.mediumCategory) return false;
      if (
        state.creatureExact !== "ALL" &&
        item.creatureFamily !== state.creatureExact &&
        item.creature !== state.creatureExact
      ) {
        return false;
      }

      const y = Number(item.yearSort || 0);
      if (state.sliderMin > 0 && y < minYear) return false;
      if (state.sliderMax < 100 && y > maxYear) return false;

      if (q) {
        const tokens = q.split(/\s+/);
        for (let t = 0; t < tokens.length; t++) {
          if (!item._searchBlob.includes(tokens[t])) return false;
        }
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (state.sort === "chrono-asc") return (a.yearSort || 0) - (b.yearSort || 0);
      if (state.sort === "chrono-desc") return (b.yearSort || 0) - (a.yearSort || 0);
      if (state.sort === "creature-asc") return (a.creature || "").localeCompare(b.creature || "");
      if (state.sort === "culture-asc") return (a.civilization || "").localeCompare(b.civilization || "");
      return 0;
    });

    state.filtered = filtered;
    renderFilterRibbon();
    renderStage();
  }

  function renderFilterRibbon() {
    const summaryEl = document.getElementById("results-count-summary");
    summaryEl.innerHTML = `Showing <strong>${state.filtered.length}</strong> of <strong>${state.items.length}</strong> historical depictions`;

    const chips = [];
    if (state.region !== "ALL") chips.push({ key: "region", label: `Wing: ${state.region}` });
    if (state.era !== "ALL") chips.push({ key: "era", label: `Era: ${state.era}` });
    if (state.morphology !== "ALL") chips.push({ key: "morphology", label: `Form: ${state.morphology}` });
    if (state.mediumCategory !== "ALL") chips.push({ key: "mediumCategory", label: `Medium: ${state.mediumCategory}` });
    if (state.creatureExact !== "ALL") chips.push({ key: "creatureExact", label: `Creature: ${state.creatureExact}` });
    if (state.search.trim()) chips.push({ key: "search", label: `Query: “${state.search.trim()}”` });
    if (state.sliderMin > 0 || state.sliderMax < 100) {
      chips.push({
        key: "chrono",
        label: `${formatYear(sliderToYear(state.sliderMin))} – ${formatYear(sliderToYear(state.sliderMax))}`
      });
    }

    const container = document.getElementById("active-filter-chips");
    if (!chips.length) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML =
      chips
        .map(
          (c) =>
            `<button type="button" class="filter-chip" data-clear-key="${esc(c.key)}" title="Remove filter">${esc(c.label)} <span aria-hidden="true">×</span></button>`
        )
        .join("") +
      `<button type="button" class="btn-reset-filters" id="btn-reset-all-filters">Reset All</button>`;
  }

  /* ------------------------------------------------------------------------
     Stage Renderers (Gallery, Timeline, Concordance, Provenance Atlas)
     ------------------------------------------------------------------------ */
  function renderStage() {
    const stage = document.getElementById("exhibition-stage");
    if (!state.filtered.length) {
      stage.innerHTML = `<div style="text-align:center; padding:4rem 1rem; border:1px dashed var(--border-strong); border-radius:3px;">
        <h2 style="font-family:'Cormorant Garamond',serif; font-size:1.85rem; margin:0 0 0.5rem;">No Historical Plates Match Current Criteria</h2>
        <p style="color:var(--ink-muted); margin:0 0 1.25rem;">Broaden your chronological range, region wing, or search terms to explore the full archive.</p>
        <button type="button" class="btn-utility" id="btn-empty-reset">Restore Complete Corpus</button>
      </div>`;
      return;
    }

    if (state.view === "gallery") renderGalleryView(stage);
    else if (state.view === "timeline") renderTimelineView(stage);
    else if (state.view === "concordance") renderConcordanceView(stage);
    else if (state.view === "atlas") renderAtlasView(stage);
  }

  function renderGalleryView(stage) {
    const slice = state.filtered.slice(0, state.visibleCount);
    const cardsHtml = slice
      .map((item) => {
        const pinned = state.compareIds.includes(item.id);
        const anatomyTags = (item.anatomy || [])
          .slice(0, 3)
          .map((t) => `<span class="anatomy-tag">${esc(t)}</span>`)
          .join("");

        return `<article class="artifact-card" data-id="${esc(item.id)}">
          <div class="plate-stage" data-open-id="${esc(item.id)}">
            <img
              src="${esc(item.thumbUrl)}"
              alt="${esc(item.title)} — ${esc(item.creature)} (${esc(item.civilization)}, ${esc(item.dateDisplay)})"
              class="plate-img"
              loading="lazy"
              decoding="async"
              data-fallback-stage="0"
              onerror="window.handlePlateError(this, '${esc(item.id)}')"
            />
            <span class="plate-cat-badge">${esc(item.catalogNumber)}</span>
            <button
              type="button"
              class="btn-pin-compare"
              data-pin-id="${esc(item.id)}"
              aria-pressed="${pinned}"
              title="Pin plate for side-by-side comparison"
            >${pinned ? "✓ Pinned" : "+ Compare"}</button>
          </div>
          <div class="card-body">
            <div class="card-meta-top">
              <span>${esc(item.civilization)}</span>
              <span class="card-date">${esc(item.dateDisplay)}</span>
            </div>
            <div class="card-creature-row">
              <span class="card-creature">${esc(item.creature)}</span>
              ${item.localName ? `<span class="card-local-name">${esc(item.localName)}</span>` : ""}
            </div>
            <h2 class="card-title" data-open-id="${esc(item.id)}">${esc(item.title)}</h2>
            <p class="card-desc">${esc(item.description)}</p>
            <div class="card-anatomy">${anatomyTags}</div>
            <div class="card-footer">
              <span class="card-repo" title="${esc(item.repository)}">${esc(item.repository)}</span>
              <button type="button" class="card-open-link" data-open-id="${esc(item.id)}">Inspect →</button>
            </div>
          </div>
        </article>`;
      })
      .join("");

    const remaining = state.filtered.length - slice.length;
    const moreBtn =
      remaining > 0
        ? `<div class="load-more-wrap">
            <button type="button" class="btn-load-more" id="btn-load-more-plates">
              Unveil Next ${Math.min(PAGE_SIZE, remaining)} Plates (${remaining} remaining)
            </button>
          </div>`
        : "";

    stage.innerHTML = `<div class="gallery-grid">${cardsHtml}</div>${moreBtn}`;
  }

  function renderTimelineView(stage) {
    const chapters = CANONICAL_ERAS.map((era) => {
      const items = state.filtered
        .filter((i) => i.era === era)
        .sort((a, b) => (a.yearSort || 0) - (b.yearSort || 0));
      if (!items.length) return "";

      const nodes = items
        .map(
          (item) => `<div class="timeline-node" data-open-id="${esc(item.id)}">
            <div class="timeline-year">${esc(item.dateDisplay)}</div>
            <img
              src="${esc(item.thumbUrl)}"
              alt="${esc(item.title)}"
              class="timeline-thumb"
              loading="lazy"
              data-fallback-stage="0"
              onerror="window.handlePlateError(this, '${esc(item.id)}')"
            />
            <div>
              <div class="card-creature-row">
                <span class="card-creature">${esc(item.creature)}</span>
                <span class="card-local-name">· ${esc(item.civilization)} (${esc(item.region)})</span>
              </div>
              <h3 style="font-family:'Cormorant Garamond',serif; font-size:1.28rem; margin:0.15rem 0;">${esc(item.title)}</h3>
              <p style="margin:0; font-size:0.9rem; color:var(--ink-secondary);">${esc(item.medium)} — ${esc(item.repository)}</p>
            </div>
          </div>`
        )
        .join("");

      return `<section class="era-chapter">
        <div class="era-header">
          <h2 class="era-title">${esc(era)}</h2>
          <span class="era-span">${esc(ERA_SPANS[era] || "")} · ${items.length} Depictions</span>
        </div>
        <div class="timeline-list">${nodes}</div>
      </section>`;
    }).join("");

    stage.innerHTML = `<div class="timeline-river">${chapters}</div>`;
  }

  function renderConcordanceView(stage) {
    const groups = new Map();
    state.filtered.forEach((item) => {
      const key = item.creatureFamily || item.creature || "Mythical Beasts";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });

    const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
      if (b[1].length !== a[1].length) return b[1].length - a[1].length;
      return a[0].localeCompare(b[0]);
    });

    const html = sortedGroups
      .map(([family, list]) => {
        const wingCount = new Set(list.map((x) => x.region)).size;
        const sampleNames = Array.from(new Set(list.map((x) => x.creature))).slice(0, 4).join(" · ");
        const thumbs = list
          .map(
            (item) => `<img
              src="${esc(item.thumbUrl)}"
              alt="${esc(item.title)}"
              title="${esc(item.creature)} — ${esc(item.title)} (${esc(item.civilization)}, ${esc(item.dateDisplay)})"
              class="concordance-mini"
              loading="lazy"
              data-open-id="${esc(item.id)}"
              data-fallback-stage="0"
              onerror="window.handlePlateError(this, '${esc(item.id)}')"
            />`
          )
          .join("");

        return `<div class="concordance-entry">
          <div class="concordance-head">
            <h2 class="concordance-name">${esc(family)}</h2>
            <span class="wing-count">${list.length} plates · ${wingCount} ${wingCount === 1 ? "wing" : "wings"}</span>
          </div>
          <div style="font-family:'Plus Jakarta Sans',sans-serif; font-size:0.76rem; color:var(--ink-muted);">
            ${esc(sampleNames)}
          </div>
          <div class="concordance-thumbs">${thumbs}</div>
          <button type="button" class="card-open-link" style="align-self:flex-start;" data-filter-creature="${esc(family)}">
            Isolate ${list.length} Depictions in Museum Plates →
          </button>
        </div>`;
      })
      .join("");

    stage.innerHTML = `<div class="concordance-grid">${html}</div>`;
  }

  function renderAtlasView(stage) {
    const regionCounts = {};
    state.filtered.forEach((i) => {
      regionCounts[i.region] = (regionCounts[i.region] || 0) + 1;
    });

    if (!regionCounts[state.atlasRegion]) {
      const firstAvailable = CANONICAL_REGIONS.find((r) => regionCounts[r] > 0);
      if (firstAvailable) state.atlasRegion = firstAvailable;
    }

    const nodesSvg = CANONICAL_REGIONS.map((reg) => {
      const coord = ATLAS_COORDS[reg];
      if (!coord) return "";
      const cnt = regionCounts[reg] || 0;
      if (cnt === 0) return "";
      const radius = Math.min(28, Math.max(14, 11 + Math.sqrt(cnt) * 3));
      const isActive = state.atlasRegion === reg;
      return `<g class="atlas-node ${isActive ? "is-active" : ""}" data-atlas-region="${esc(reg)}" transform="translate(${coord.x}, ${coord.y})">
        <circle class="atlas-node-circle" r="${radius}"></circle>
        <text class="atlas-node-count" y="0">${cnt}</text>
        <text class="atlas-node-label" y="${radius + 14}">${esc(coord.short)}</text>
      </g>`;
    }).join("");

    const activeItems = state.filtered.filter((i) => i.region === state.atlasRegion);
    const sidebarItems = activeItems
      .map(
        (item) => `<div class="atlas-mini-item" data-open-id="${esc(item.id)}">
          <img
            src="${esc(item.thumbUrl)}"
            alt="${esc(item.title)}"
            class="atlas-mini-img"
            loading="lazy"
            data-fallback-stage="0"
            onerror="window.handlePlateError(this, '${esc(item.id)}')"
          />
          <div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:0.68rem; color:var(--accent-cinnabar);">
              ${esc(item.creature)} · ${esc(item.dateDisplay)}
            </div>
            <div style="font-family:'Cormorant Garamond',serif; font-weight:600; font-size:1.05rem; line-height:1.2;">
              ${esc(item.title)}
            </div>
            <div style="font-family:'Plus Jakarta Sans',sans-serif; font-size:0.72rem; color:var(--ink-muted);">
              ${esc(item.originLocation)}
            </div>
          </div>
        </div>`
      )
      .join("");

    stage.innerHTML = `<div class="atlas-container">
      <div class="atlas-map-frame">
        <div class="section-overline" style="margin-bottom:0.5rem;">
          <span class="overline-label">Cartographic Provenance Distribution</span>
          <span class="overline-label">Click any medallion to inspect wing</span>
        </div>
        <svg class="atlas-svg" viewBox="0 0 1000 460" role="img" aria-label="World map of mythical creature artifact provenances">
          <!-- Stylized Archival Continental Silhouettes -->
          <!-- North & South America -->
          <path class="atlas-continent" d="M75,65 L195,55 L285,95 L265,165 L220,205 L245,235 L315,275 L295,375 L245,435 L215,415 L225,320 L185,255 L145,205 L95,135 Z" />
          <!-- Greenland -->
          <path class="atlas-continent" d="M315,38 L395,32 L380,82 L325,78 Z" />
          <!-- Europe -->
          <path class="atlas-continent" d="M435,75 L545,62 L585,115 L565,185 L515,202 L455,192 L428,148 Z" />
          <!-- Africa -->
          <path class="atlas-continent" d="M442,212 L555,208 L612,258 L585,365 L528,412 L492,358 L475,295 L432,265 Z" />
          <!-- Eurasia & East/South Asia -->
          <path class="atlas-continent" d="M575,68 L855,65 L915,125 L868,215 L815,265 L752,298 L705,292 L668,248 L605,242 L572,188 Z" />
          <!-- Japan & Maritime SE Asia & Oceania -->
          <path class="atlas-continent" d="M878,158 L898,175 L884,208 L866,195 Z" />
          <path class="atlas-continent" d="M755,308 L838,315 L848,342 L762,338 Z" />
          <path class="atlas-continent" d="M805,362 L905,358 L915,418 L818,422 Z" />
          ${nodesSvg}
        </svg>
      </div>
      <div class="atlas-sidebar">
        <span class="overline-label">Selected Provenance Wing</span>
        <h2 style="font-family:'Cormorant Garamond',serif; font-size:1.65rem; margin:0.2rem 0 0.25rem;">
          ${esc(state.atlasRegion)}
        </h2>
        <div style="font-family:'JetBrains Mono',monospace; font-size:0.74rem; color:var(--ink-muted);">
          ${activeItems.length} cataloged works in current filter
        </div>
        <div class="atlas-sidebar-list">${sidebarItems}</div>
      </div>
    </div>`;
  }

  /* ------------------------------------------------------------------------
     Monograph Inspection Lightbox & Comparative Modal
     ------------------------------------------------------------------------ */
  function openMonograph(id) {
    const item = state.items.find((x) => x.id === id);
    if (!item) return;
    state.activeModalId = id;

    const currentIdx = state.filtered.findIndex((x) => x.id === id);
    const prevItem = currentIdx > 0 ? state.filtered[currentIdx - 1] : null;
    const nextItem = currentIdx >= 0 && currentIdx < state.filtered.length - 1 ? state.filtered[currentIdx + 1] : null;

    const related = state.items
      .filter(
        (x) =>
          x.id !== item.id &&
          (x.creatureFamily === item.creatureFamily ||
            (x.morphology === item.morphology && x.region !== item.region))
      )
      .sort((a, b) => {
        const aCross = (a.creatureFamily === item.creatureFamily ? 2 : 0) + (a.region !== item.region ? 1 : 0);
        const bCross = (b.creatureFamily === item.creatureFamily ? 2 : 0) + (b.region !== item.region ? 1 : 0);
        return bCross - aCross;
      })
      .slice(0, 4);

    const pinned = state.compareIds.includes(item.id);

    const dialog = document.getElementById("monograph-dialog-content");
    dialog.innerHTML = `
      <div class="modal-topbar">
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <span class="masthead-stat">${esc(item.catalogNumber)}</span>
          <span style="font-family:'JetBrains Mono',monospace; font-size:0.75rem; color:var(--ink-muted);">
            ${esc(item.region)}
          </span>
        </div>
        <div style="display:flex; align-items:center; gap:0.45rem;">
          ${prevItem ? `<button type="button" class="btn-utility" data-open-id="${esc(prevItem.id)}">← Prev</button>` : ""}
          ${nextItem ? `<button type="button" class="btn-utility" data-open-id="${esc(nextItem.id)}">Next →</button>` : ""}
          <button type="button" class="btn-utility" data-pin-id="${esc(item.id)}" aria-pressed="${pinned}">
            ${pinned ? "✓ In Compare Tray" : "+ Pin to Compare"}
          </button>
          <button type="button" class="btn-utility" id="btn-close-modal" aria-label="Close monograph">Close ✕</button>
        </div>
      </div>

      <div class="monograph-layout">
        <div class="monograph-visual-col">
          <img
            src="${esc(item.fullImageUrl || item.thumbUrl)}"
            alt="${esc(item.title)}"
            class="monograph-img"
            id="monograph-main-img"
            data-fallback-stage="1"
            onerror="window.handlePlateError(this, '${esc(item.id)}')"
            title="Click to toggle magnification"
          />
          <div style="margin-top:0.8rem; font-family:'JetBrains Mono',monospace; font-size:0.7rem; color:var(--ink-muted); text-align:center;">
            Click plate to magnify · <a href="${esc(item.commonsUrl)}" target="_blank" rel="noopener noreferrer">View Source Record &amp; High-Res File on Wikimedia Commons ↗</a>
          </div>
        </div>

        <div class="monograph-text-col">
          <div>
            <div class="card-creature-row">
              <span class="card-creature">${esc(item.creature)}</span>
              ${item.localName ? `<span class="card-local-name">${esc(item.localName)}</span>` : ""}
            </div>
            <h2 id="modal-heading" style="font-family:'Cormorant Garamond',serif; font-size:clamp(1.65rem,2.5vw,2.25rem); line-height:1.12; margin:0.25rem 0 0.5rem;">
              ${esc(item.title)}
            </h2>
            <p style="font-size:1.03rem; line-height:1.68; color:var(--ink-secondary); margin:0;">
              ${esc(item.description)}
            </p>
          </div>

          <dl class="spec-ledger">
            <div class="ledger-item">
              <dt>Civilization / Period</dt>
              <dd>${esc(item.civilization)}</dd>
            </div>
            <div class="ledger-item">
              <dt>Date of Creation</dt>
              <dd>${esc(item.dateDisplay)}</dd>
            </div>
            <div class="ledger-item">
              <dt>Provenance / Origin</dt>
              <dd>${esc(item.originLocation)}</dd>
            </div>
            <div class="ledger-item">
              <dt>Historical Era</dt>
              <dd>${esc(item.era)}</dd>
            </div>
            <div class="ledger-item">
              <dt>Material &amp; Technique</dt>
              <dd>${esc(item.medium)}</dd>
            </div>
            <div class="ledger-item">
              <dt>Morphological Class</dt>
              <dd>${esc(item.morphology)}</dd>
            </div>
            <div class="ledger-item">
              <dt>Artist / Workshop</dt>
              <dd>${esc(item.creator)}</dd>
            </div>
            <div class="ledger-item">
              <dt>Holding Repository</dt>
              <dd>${esc(item.repository)}</dd>
            </div>
          </dl>

          <div>
            <span class="overline-label">Hybrid Anatomical Elements</span>
            <div class="card-anatomy" style="padding-top:0.4rem;">
              ${(item.anatomy || []).map((a) => `<span class="anatomy-tag">${esc(a)}</span>`).join("")}
            </div>
          </div>
        </div>
      </div>

      ${
        related.length
          ? `<div class="related-strip">
              <span class="overline-label">Cross-Cultural Cognates &amp; Morphological Parallels</span>
              <div class="related-cards">
                ${related
                  .map(
                    (r) => `<div class="atlas-mini-item" data-open-id="${esc(r.id)}">
                      <img
                        src="${esc(r.thumbUrl)}"
                        alt="${esc(r.title)}"
                        class="atlas-mini-img"
                        loading="lazy"
                        data-fallback-stage="0"
                        onerror="window.handlePlateError(this, '${esc(r.id)}')"
                      />
                      <div>
                        <div style="font-family:'JetBrains Mono',monospace; font-size:0.66rem; color:var(--accent-cinnabar);">${esc(r.creature)}</div>
                        <div style="font-family:'Cormorant Garamond',serif; font-weight:600; font-size:0.98rem; line-height:1.15;">${esc(r.title)}</div>
                        <div style="font-size:0.7rem; color:var(--ink-muted);">${esc(r.civilization)}</div>
                      </div>
                    </div>`
                  )
                  .join("")}
              </div>
            </div>`
          : ""
      }
    `;

    const modal = document.getElementById("monograph-modal");
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function openCompareModal() {
    const specimens = state.compareIds.map((id) => state.items.find((x) => x.id === id)).filter(Boolean);
    if (!specimens.length) return;
    state.activeModalId = "COMPARE";

    const cols = specimens
      .map(
        (item) => `<div class="compare-col">
          <img
            src="${esc(item.thumbUrl)}"
            alt="${esc(item.title)}"
            data-fallback-stage="0"
            onerror="window.handlePlateError(this, '${esc(item.id)}')"
          />
          <div class="card-meta-top">
            <span>${esc(item.catalogNumber)}</span>
            <span>${esc(item.dateDisplay)}</span>
          </div>
          <span class="card-creature">${esc(item.creature)} ${item.localName ? `(${esc(item.localName)})` : ""}</span>
          <h3 style="font-family:'Cormorant Garamond',serif; font-size:1.35rem; margin:0;">${esc(item.title)}</h3>
          <div style="font-family:'Plus Jakarta Sans',sans-serif; font-size:0.8rem; color:var(--ink-secondary);">
            <strong>Culture:</strong> ${esc(item.civilization)} (${esc(item.region)})<br/>
            <strong>Medium:</strong> ${esc(item.medium)}<br/>
            <strong>Morphology:</strong> ${esc(item.morphology)}<br/>
            <strong>Repository:</strong> ${esc(item.repository)}
          </div>
          <p style="font-size:0.88rem; color:var(--ink-secondary); margin:0;">${esc(item.description)}</p>
          <div class="card-anatomy">
            ${(item.anatomy || []).map((a) => `<span class="anatomy-tag">${esc(a)}</span>`).join("")}
          </div>
        </div>`
      )
      .join("");

    const dialog = document.getElementById("monograph-dialog-content");
    dialog.innerHTML = `
      <div class="modal-topbar">
        <h2 id="modal-heading" style="font-family:'Cormorant Garamond',serif; font-size:1.45rem; margin:0;">
          Comparative Iconographic Study (${specimens.length} Specimens)
        </h2>
        <button type="button" class="btn-utility" id="btn-close-modal">Close ✕</button>
      </div>
      <div class="compare-grid">${cols}</div>
    `;

    const modal = document.getElementById("monograph-modal");
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    const modal = document.getElementById("monograph-modal");
    modal.hidden = true;
    state.activeModalId = null;
    document.body.style.overflow = "";
  }

  function toggleComparePin(id) {
    const idx = state.compareIds.indexOf(id);
    if (idx >= 0) {
      state.compareIds.splice(idx, 1);
    } else {
      if (state.compareIds.length >= 3) state.compareIds.shift();
      state.compareIds.push(id);
    }
    renderCompareDock();
    applyFiltersAndRender(true);
    if (state.activeModalId && state.activeModalId !== "COMPARE") {
      openMonograph(state.activeModalId);
    }
  }

  function renderCompareDock() {
    const dock = document.getElementById("compare-dock");
    if (!state.compareIds.length) {
      dock.hidden = true;
      return;
    }
    dock.hidden = false;
    document.getElementById("compare-count").textContent = String(state.compareIds.length);
    const slots = document.getElementById("compare-slots");
    slots.innerHTML = state.compareIds
      .map((id) => {
        const item = state.items.find((x) => x.id === id);
        if (!item) return "";
        return `<span class="compare-pill">
          <img src="${esc(item.thumbUrl)}" alt="" data-fallback-stage="0" onerror="window.handlePlateError(this, '${esc(item.id)}')" />
          <span>${esc(item.creature)}</span>
          <button type="button" style="background:none;border:0;cursor:pointer;padding:0 2px;" data-pin-id="${esc(item.id)}" title="Remove">×</button>
        </span>`;
      })
      .join("");
  }

  function resetAllFilters() {
    state.search = "";
    state.region = "ALL";
    state.era = "ALL";
    state.morphology = "ALL";
    state.mediumCategory = "ALL";
    state.creatureExact = "ALL";
    state.sliderMin = 0;
    state.sliderMax = 100;

    document.getElementById("archive-search-input").value = "";
    document.getElementById("filter-era-select").value = "ALL";
    document.getElementById("filter-morphology-select").value = "ALL";
    document.getElementById("filter-medium-select").value = "ALL";
    document.getElementById("slider-year-min").value = "0";
    document.getElementById("slider-year-max").value = "100";

    renderWingStrip();
    applyFiltersAndRender();
  }

  /* ------------------------------------------------------------------------
     Event Listeners & Keyboard Navigation
     ------------------------------------------------------------------------ */
  function bindEvents() {
    applyTheme(state.theme);

    document.getElementById("btn-theme-toggle").addEventListener("click", () => {
      applyTheme(state.theme === "vellum" ? "basalt" : "vellum");
    });

    document.getElementById("btn-random-specimen").addEventListener("click", () => {
      const pool = state.filtered.length ? state.filtered : state.items;
      if (!pool.length) return;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      openMonograph(pick.id);
    });

    document.getElementById("wings-filter-strip").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-region]");
      if (!btn) return;
      state.region = btn.getAttribute("data-region");
      renderWingStrip();
      applyFiltersAndRender();
    });

    document.getElementById("archive-search-input").addEventListener("input", (e) => {
      state.search = e.target.value;
      applyFiltersAndRender();
    });

    document.getElementById("filter-era-select").addEventListener("change", (e) => {
      state.era = e.target.value;
      applyFiltersAndRender();
    });

    document.getElementById("filter-morphology-select").addEventListener("change", (e) => {
      state.morphology = e.target.value;
      applyFiltersAndRender();
    });

    document.getElementById("filter-medium-select").addEventListener("change", (e) => {
      state.mediumCategory = e.target.value;
      applyFiltersAndRender();
    });

    document.getElementById("sort-order-select").addEventListener("change", (e) => {
      state.sort = e.target.value;
      applyFiltersAndRender();
    });

    const minSlider = document.getElementById("slider-year-min");
    const maxSlider = document.getElementById("slider-year-max");
    minSlider.addEventListener("input", () => {
      if (Number(minSlider.value) > Number(maxSlider.value)) {
        minSlider.value = maxSlider.value;
      }
      state.sliderMin = Number(minSlider.value);
      applyFiltersAndRender();
    });
    maxSlider.addEventListener("input", () => {
      if (Number(maxSlider.value) < Number(minSlider.value)) {
        maxSlider.value = minSlider.value;
      }
      state.sliderMax = Number(maxSlider.value);
      applyFiltersAndRender();
    });

    document.querySelectorAll(".view-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        state.view = tab.getAttribute("data-view");
        document.querySelectorAll(".view-tab").forEach((t) => {
          t.setAttribute("aria-selected", String(t === tab));
        });
        renderStage();
      });
    });

    document.getElementById("active-filter-chips").addEventListener("click", (e) => {
      if (e.target.closest("#btn-reset-all-filters")) {
        resetAllFilters();
        return;
      }
      const chip = e.target.closest("[data-clear-key]");
      if (!chip) return;
      const k = chip.getAttribute("data-clear-key");
      if (k === "region") {
        state.region = "ALL";
        renderWingStrip();
      } else if (k === "era") {
        state.era = "ALL";
        document.getElementById("filter-era-select").value = "ALL";
      } else if (k === "morphology") {
        state.morphology = "ALL";
        document.getElementById("filter-morphology-select").value = "ALL";
      } else if (k === "mediumCategory") {
        state.mediumCategory = "ALL";
        document.getElementById("filter-medium-select").value = "ALL";
      } else if (k === "creatureExact") {
        state.creatureExact = "ALL";
      } else if (k === "search") {
        state.search = "";
        document.getElementById("archive-search-input").value = "";
      } else if (k === "chrono") {
        state.sliderMin = 0;
        state.sliderMax = 100;
        minSlider.value = "0";
        maxSlider.value = "100";
      }
      applyFiltersAndRender();
    });

    document.body.addEventListener("click", (e) => {
      const pinBtn = e.target.closest("[data-pin-id]");
      if (pinBtn) {
        e.stopPropagation();
        toggleComparePin(pinBtn.getAttribute("data-pin-id"));
        return;
      }

      const openTrigger = e.target.closest("[data-open-id]");
      if (openTrigger) {
        openMonograph(openTrigger.getAttribute("data-open-id"));
        return;
      }

      const creatureBtn = e.target.closest("[data-filter-creature]");
      if (creatureBtn) {
        state.creatureExact = creatureBtn.getAttribute("data-filter-creature");
        state.view = "gallery";
        document.querySelectorAll(".view-tab").forEach((t) => {
          t.setAttribute("aria-selected", String(t.getAttribute("data-view") === "gallery"));
        });
        applyFiltersAndRender();
        window.scrollTo({ top: document.querySelector(".control-deck").offsetTop - 70, behavior: "smooth" });
        return;
      }

      const atlasNode = e.target.closest("[data-atlas-region]");
      if (atlasNode) {
        state.atlasRegion = atlasNode.getAttribute("data-atlas-region");
        renderStage();
        return;
      }

      if (e.target.closest("#btn-load-more-plates")) {
        state.visibleCount += PAGE_SIZE;
        renderStage();
        return;
      }

      if (e.target.closest("#btn-empty-reset")) {
        resetAllFilters();
        return;
      }

      if (e.target.closest("#btn-close-modal") || e.target.id === "monograph-modal") {
        closeModal();
        return;
      }

      if (e.target.id === "monograph-main-img") {
        e.target.classList.toggle("is-zoomed");
      }
    });

    document.getElementById("btn-open-compare").addEventListener("click", openCompareModal);
    document.getElementById("btn-clear-compare").addEventListener("click", () => {
      state.compareIds = [];
      renderCompareDock();
      applyFiltersAndRender(true);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "SELECT") {
        e.preventDefault();
        document.getElementById("archive-search-input").focus();
        return;
      }
      if (e.key === "Escape" && state.activeModalId) {
        closeModal();
        return;
      }
      if (state.activeModalId && state.activeModalId !== "COMPARE") {
        const idx = state.filtered.findIndex((x) => x.id === state.activeModalId);
        if (e.key === "ArrowRight" && idx >= 0 && idx < state.filtered.length - 1) {
          openMonograph(state.filtered[idx + 1].id);
        } else if (e.key === "ArrowLeft" && idx > 0) {
          openMonograph(state.filtered[idx - 1].id);
        }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    loadArchiveData().catch((err) => {
      console.error("Failed to initialize Bestiarium Mundi archive:", err);
    });
  });
})();
