(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ==========================================
  // 1. INITIALIZE MAP - ISLAMABAD, PAKISTAN
  // ==========================================

  const map = L.map("map", {
    center: [33.6844, 73.0479],
    zoom: 12,
    zoomControl: true
  });

  // ==========================================
  // 2. BASE MAP LAYERS
  // ==========================================

  // Street Map
  const streetMap = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Tiles &copy; Esri",
      maxZoom: 19
    }
  );

  // Satellite Map
  const satelliteMap = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Imagery &copy; Esri",
      maxZoom: 19
    }
  );

  // Terrain / Topographic Map
  const terrainMap = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Map data &copy; Esri, HERE, Garmin",
      maxZoom: 19
    }
  );

  // Default base map
  streetMap.addTo(map);

  // Layer selector: top-right corner
  L.control.layers(
    {
      "Street Map": streetMap,
      "Satellite Map": satelliteMap,
      "Terrain Map": terrainMap
    },
    {},
    {
      collapsed: false,
      position: "topright"
    }
  ).addTo(map);

  // ==========================================
  // 3. FLOOD REPORT LAYER
  // ==========================================

  const reportLayer = L.layerGroup().addTo(map);

  let selectedMarker = null;
  let selectedPoint = null;
  let reports = [];

  // Escape text before adding it to HTML
  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  // ==========================================
  // 4. FORM MESSAGE
  // ==========================================

  function message(text, type = "") {
    $("formMessage").textContent = text;
    $("formMessage").className = `form-message ${type}`;
  }

  // ==========================================
  // 5. API REQUEST FUNCTION
  // ==========================================

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || `Request failed (${response.status})`
      );
    }

    return data;
  }

  // ==========================================
  // 6. SELECT LOCATION BY CLICKING MAP
  // ==========================================

  map.on("click", (event) => {
    selectedPoint = {
      latitude: event.latlng.lat,
      longitude: event.latlng.lng
    };

    if (selectedMarker) {
      map.removeLayer(selectedMarker);
    }

    selectedMarker = L.marker(event.latlng)
      .addTo(map)
      .bindPopup("Selected flood report location")
      .openPopup();

    $("latitude").value =
      selectedPoint.latitude.toFixed(7);

    $("longitude").value =
      selectedPoint.longitude.toFixed(7);

    $("coordinateText").textContent =
      `${selectedPoint.latitude.toFixed(5)}, ` +
      `${selectedPoint.longitude.toFixed(5)}`;

    message("");
  });

  // ==========================================
  // 7. LOAD DASHBOARD STATISTICS
  // ==========================================

  async function loadStats() {
    try {
      const stats = await api("/api/stats");

      $("totalReports").textContent =
        stats.total ?? 0;

      $("activeReports").textContent =
        stats.active ?? 0;

      $("resolvedReports").textContent =
        stats.resolved ?? 0;

    } catch (error) {
      console.error("Unable to load statistics:", error);
    }
  }

  // ==========================================
  // 8. FLOOD SEVERITY COLORS
  // ==========================================

  function color(severity) {
    const colors = {
      Low: "#249b72",
      Medium: "#d99b1e",
      High: "#e36b3f",
      Critical: "#c93d54"
    };

    return colors[severity] || "#327a9c";
  }

  // ==========================================
  // 9. DISPLAY FLOOD REPORTS
  // ==========================================

  function renderReports() {
    reportLayer.clearLayers();

    const list = $("reportsList");

    if (!reports.length) {
      list.innerHTML =
        '<p class="muted">No reports found. ' +
        "Submit a report or change the filters.</p>";

      return;
    }

    list.innerHTML = reports.map((report) => `
      <article class="report-card">
        <div>
          <h3>${esc(report.location_name)}</h3>

          <p>${esc(report.description)}</p>

          <p>
            ${esc(
              report.created_at
                ? new Date(report.created_at).toLocaleString()
                : ""
            )}
            ·
            ${Number(report.latitude).toFixed(5)},
            ${Number(report.longitude).toFixed(5)}
          </p>
        </div>

        <div class="report-actions">
          <span class="pill severity-${esc(report.severity)}">
            ${esc(report.severity)}
          </span>

          <span class="pill">
            ${esc(report.status)}
          </span>

          ${
            report.status === "Active"
              ? `<button
                    class="resolve-button"
                    data-resolve="${Number(report.id)}"
                    type="button">
                    Mark resolved
                 </button>`
              : ""
          }
        </div>
      </article>
    `).join("");

    // Add report markers to the map
    reports.forEach((report) => {
      const latitude = Number(report.latitude);
      const longitude = Number(report.longitude);

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return;
      }

      L.circleMarker(
        [latitude, longitude],
        {
          radius: 8,
          color: color(report.severity),
          fillColor: color(report.severity),
          fillOpacity: 0.8,
          weight: 2
        }
      )
        .bindPopup(`
          <strong>${esc(report.location_name)}</strong>
          <br>
          Severity: ${esc(report.severity)}
          <br>
          Status: ${esc(report.status)}
          <br>
          ${esc(report.description)}
        `)
        .addTo(reportLayer);
    });
  }

  // ==========================================
  // 10. LOAD AND FILTER REPORTS
  // ==========================================

  async function loadReports() {
    const params = new URLSearchParams();

    const search = $("searchInput").value.trim();
    const severity = $("severityFilter").value;
    const status = $("statusFilter").value;

    if (search) {
      params.set("search", search);
    }

    if (severity) {
      params.set("severity", severity);
    }

    if (status) {
      params.set("status", status);
    }

    try {
      reports = await api(`/api/reports?${params.toString()}`);

      renderReports();

    } catch (error) {
      $("reportsList").innerHTML =
        `<p class="muted">${esc(error.message)} ` +
        "Check server and database.</p>";
    }
  }

  // ==========================================
  // 11. SUBMIT A FLOOD REPORT
  // ==========================================

  $("reportForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!selectedPoint) {
      message(
        "Please click the map first to select a location.",
        "error"
      );

      return;
    }

    const button = $("reportForm").querySelector(
      'button[type="submit"]'
    );

    button.disabled = true;

    message("Saving report...");

    try {
      await api("/api/reports", {
        method: "POST",

        body: JSON.stringify({
          location_name: $("locationName").value.trim(),

          description: $("description").value.trim(),

          severity: $("severity").value,

          latitude: selectedPoint.latitude,

          longitude: selectedPoint.longitude
        })
      });

      $("reportForm").reset();

      selectedPoint = null;

      if (selectedMarker) {
        map.removeLayer(selectedMarker);
      }

      selectedMarker = null;

      $("latitude").value = "";
      $("longitude").value = "";

      $("coordinateText").textContent =
        "Click the map to select a location.";

      message("Report submitted successfully.", "success");

      await Promise.all([
        loadReports(),
        loadStats()
      ]);

    } catch (error) {
      message(error.message, "error");

    } finally {
      button.disabled = false;
    }
  });

  // ==========================================
  // 12. MARK REPORT AS RESOLVED
  // ==========================================

  $("reportsList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-resolve]");

    if (!button) {
      return;
    }

    button.disabled = true;

    try {
      await api(
        `/api/reports/${button.dataset.resolve}/resolve`,
        {
          method: "PATCH"
        }
      );

      await Promise.all([
        loadReports(),
        loadStats()
      ]);

    } catch (error) {
      alert(error.message);
      button.disabled = false;
    }
  });

  // ==========================================
  // 13. SEARCH AND FILTER CONTROLS
  // ==========================================

  let searchTimer;

  $("searchInput").addEventListener("input", () => {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(loadReports, 250);
  });

  $("severityFilter").addEventListener(
    "change",
    loadReports
  );

  $("statusFilter").addEventListener(
    "change",
    loadReports
  );

  $("resetFilters").addEventListener("click", () => {
    $("searchInput").value = "";
    $("severityFilter").value = "";
    $("statusFilter").value = "";

    loadReports();
  });

  // ==========================================
  // 14. START DASHBOARD
  // ==========================================

  loadStats();
  loadReports();

})();