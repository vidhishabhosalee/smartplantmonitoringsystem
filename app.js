// Database connection (public read key)
const DB_URL = "https://nflxynlazkwtxypmpiob.supabase.co/rest/v1/plant_readings";
const DB_KEY = "sb_publishable_uNvp_mo1jBGlvH-Fp-cnbw_yj1EyGxb";
const ONLINE_MS = 30000;

async function q(params) {
  const r = await fetch(`${DB_URL}?${params}`, { headers: { apikey: DB_KEY } });
  if (!r.ok) throw new Error("Failed to load");
  return r.json();
}
const latest = () => q("select=*&order=created_at.desc&limit=1").then(r => r[0]);
const since = (ms) => q(`select=moisture,created_at&created_at=gte.${new Date(Date.now()-ms).toISOString()}&order=created_at.asc&limit=2000`);

const level = m => m < 30 ? "dry" : m < 60 ? "moist" : "optimal";
const LABEL = { dry: "Dry – Water Needed", moist: "Moist", optimal: "Optimal" };
const PLANT = { dry: "Thirsty 🥀", moist: "Okay 🌿", optimal: "Happy 🌱" };
const fmt = d => new Date(d).toLocaleString();
const online = r => r && Date.now() - new Date(r.created_at) < ONLINE_MS;
const $ = id => document.getElementById(id);

// Header badge on every page
async function badge() {
  try {
    const r = await latest(); const b = $("badge");
    b.className = "badge " + (online(r) ? "on" : "off");
    b.textContent = (online(r) ? "● Online" : "● Offline") + (r ? " · " + new Date(r.created_at).toLocaleTimeString() : "");
  } catch {}
}
badge(); setInterval(badge, 5000);
document.querySelectorAll("nav a").forEach(a => { if (location.pathname.endsWith(a.getAttribute("href")) || (location.pathname.endsWith("/") && a.getAttribute("href")==="index.html")) a.classList.add("active"); });

function ring(m) {
  const c = 2 * Math.PI * 70, p = Math.max(0, Math.min(100, m)), col = { dry: "#d64545", moist: "#d99a1e", optimal: "#2f9e5b" }[level(m)];
  return `<svg width="180" height="180"><circle cx="90" cy="90" r="70" stroke="#e2e8df" stroke-width="14" fill="none"/>
  <circle cx="90" cy="90" r="70" stroke="${col}" stroke-width="14" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-p/100)}" transform="rotate(-90 90 90)"/>
  <text x="90" y="98" text-anchor="middle" font-size="32" font-weight="800" fill="#1c2b1f">${m}%</text></svg>`;
}

let chart;
function drawChart(canvasId, rows) {
  const ctx = $(canvasId); if (!ctx) return;
  const data = { labels: rows.map(r => new Date(r.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })),
    datasets: [{ label: "Moisture %", data: rows.map(r => r.moisture), borderColor: "#2f7d4a", backgroundColor: "rgba(47,125,74,.15)", fill: true, tension: .35, pointRadius: 0 }] };
  if (chart) { chart.data = data; chart.update(); return; }
  chart = new Chart(ctx, { type: "line", data, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 }, x: { ticks: { maxTicksLimit: 8 } } } } });
}
const RANGES = { "1h": 36e5, "6h": 216e5, "24h": 864e5, "7d": 6048e5 };
function setupRanges(canvasId, def = "24h", after) {
  const box = $("ranges"); let cur = def;
  const load = async () => { const rows = await since(RANGES[cur]); drawChart(canvasId, rows); after && after(rows); };
  box.innerHTML = Object.keys(RANGES).map(k => `<button data-k="${k}" class="${k===cur?"active":""}">${k}</button>`).join("");
  box.onclick = e => { const k = e.target.dataset.k; if (!k) return; cur = k; box.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.k===k)); load(); };
  load(); setInterval(load, 15000);
}

// Page: Dashboard
async function dashboard() {
  const r = await latest().catch(() => null);
  if (!r) { $("ring").innerHTML = "<p class='muted'>No readings yet</p>"; return; }
  const l = level(r.moisture);
  $("ring").innerHTML = ring(r.moisture);
  $("status").innerHTML = `<span class="pill ${l}">${LABEL[l]}</span><p class="big" style="margin-top:12px">${PLANT[l]}</p>`;
  $("device").innerHTML = `<p class="big">${online(r) ? "Online" : "Offline"}</p><p class="muted">${r.device_id}</p>`;
  $("last").innerHTML = `<p class="big">${r.moisture}%</p><p class="muted">${fmt(r.created_at)}</p>`;
}

// Page: Analytics
function analytics(rows) {
  const v = rows.map(r => r.moisture); if (!v.length) return;
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  $("avg").textContent = avg.toFixed(1) + "%"; $("min").textContent = Math.min(...v) + "%";
  $("max").textContent = Math.max(...v) + "%"; $("count").textContent = v.length;
  $("opt").textContent = Math.round(v.filter(x => x >= 60).length / v.length * 100) + "%";
}

// Page: Alerts
async function alerts() {
  const r = await latest().catch(() => null);
  if (r) { const l = level(r.moisture);
    $("current").innerHTML = `<span class="pill ${l}">${LABEL[l]}</span><p style="margin-top:10px">${l==="dry"?"Soil is dry — water your plant now.":l==="moist"?"Moisture is fine, keep an eye on it.":"Your plant is well hydrated."}</p>`; }
  const rows = await since(RANGES["24h"]); const ev = []; let prev;
  rows.forEach(x => { const l = level(x.moisture); if (l !== prev) ev.push({ l, x }); prev = l; });
  $("history").innerHTML = ev.reverse().map(e => `<li><span class="pill ${e.l}">${LABEL[e.l]}</span><span class="muted">${e.x.moisture}% · ${fmt(e.x.created_at)}</span></li>`).join("") || "<li class='muted'>No alerts in last 24h</li>";
}

// Page: Device
async function device() {
  const r = await latest().catch(() => null);
  $("info").innerHTML = `<tr><td>Device ID</td><td>${r?.device_id ?? "ESP32_001"}</td></tr>
  <tr><td>Status</td><td>${online(r) ? "Online" : "Offline"}</td></tr>
  <tr><td>Last reading</td><td>${r ? fmt(r.created_at) : "—"}</td></tr>
  <tr><td>Sensor</td><td>Capacitive soil moisture sensor</td></tr>
  <tr><td>Display</td><td>OLED 128×64</td></tr><tr><td>Connectivity</td><td>Wi-Fi</td></tr>`;
}

const page = document.body.dataset.page;
if (page === "dashboard") { dashboard(); setInterval(dashboard, 5000); setupRanges("chart"); }
if (page === "analytics") setupRanges("chart", "7d", analytics);
if (page === "alerts") { alerts(); setInterval(alerts, 10000); }
if (page === "device") { device(); setInterval(device, 5000); }
