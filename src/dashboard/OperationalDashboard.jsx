import { useState, useEffect, useRef } from "react";

// ── MOCK DATA GENERATION ──────────────────────────────────────────────────────

const DOC_TYPES = ["Invoice", "Contract", "Receipt", "ID Document", "Medical Record", "Legal Filing", "Purchase Order", "Bank Statement"];
const STAGES = ["Upload", "Azure AI Analysis", "Confidence Check", "Human Review", "Completed"];
const EXCEPTION_CAUSES = ["Low Confidence", "Missing Fields", "Corrupted File", "Unsupported Format", "Timeout", "Duplicate Document"];
const SLA_TARGETS = { "Invoice": 4, "Contract": 8, "Receipt": 2, "ID Document": 3, "Medical Record": 6, "Legal Filing": 12, "Purchase Order": 4, "Bank Statement": 3 };

function rnd(min, max) { return Math.random() * (max - min) + min; }
function rndInt(min, max) { return Math.floor(rnd(min, max + 1)); }
function pick(arr) { return arr[rndInt(0, arr.length - 1)]; }

function generateDailyVolume(days = 30) {
  const data = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const base = isWeekend ? rndInt(20, 60) : rndInt(80, 180);
    const auto = Math.floor(base * rnd(0.6, 0.8));
    const review = Math.floor(base * rnd(0.15, 0.25));
    const rejected = base - auto - review;
    data.push({
      date: d.toISOString().split("T")[0],
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      total: base,
      autoApproved: auto,
      humanReviewed: review,
      rejected: Math.max(0, rejected),
    });
  }
  return data;
}

function generateDocTypeBreakdown() {
  return DOC_TYPES.map(type => ({
    type,
    count: rndInt(40, 320),
    avgConfidence: rnd(0.55, 0.96),
    avgProcessingTime: rnd(1.2, 8.5),
    slaTarget: SLA_TARGETS[type],
    slaBreaches: rndInt(2, 18),
    manualCorrectionRate: rnd(0.08, 0.42),
  }));
}

function generateSLAData() {
  return DOC_TYPES.map(type => {
    const total = rndInt(50, 300);
    const breaches = rndInt(2, Math.floor(total * 0.25));
    return {
      type,
      total,
      compliant: total - breaches,
      breaches,
      slaTarget: SLA_TARGETS[type],
      compliancePct: ((total - breaches) / total * 100),
      avgActualTime: rnd(SLA_TARGETS[type] * 0.6, SLA_TARGETS[type] * 1.4),
    };
  });
}

function generateBreachingDocs() {
  const docs = [];
  for (let i = 0; i < 18; i++) {
    const type = pick(DOC_TYPES);
    const sla = SLA_TARGETS[type];
    const elapsed = sla + rnd(0.5, sla * 1.2);
    docs.push({
      id: `DOC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      type,
      filename: `${type.toLowerCase().replace(" ", "_")}_${rndInt(1000, 9999)}.pdf`,
      elapsed: elapsed.toFixed(1),
      slaTarget: sla,
      breach: (elapsed - sla).toFixed(1),
      status: pick(["needs_review", "analyzing", "queued"]),
      assignedTo: pick(["Ana S.", "Ben T.", "Cara M.", "Dev P.", "Elan R."]),
    });
  }
  return docs.sort((a, b) => b.breach - a.breach);
}

function generateAgingBuckets() {
  return [
    { bucket: "< 1 hour",   count: rndInt(8, 25),  color: "#10b981" },
    { bucket: "1–4 hours",  count: rndInt(12, 40), color: "#3b82f6" },
    { bucket: "4–8 hours",  count: rndInt(6, 20),  color: "#f59e0b" },
    { bucket: "8–24 hours", count: rndInt(4, 14),  color: "#f97316" },
    { bucket: "1–3 days",   count: rndInt(2, 8),   color: "#ef4444" },
    { bucket: "> 3 days",   count: rndInt(0, 4),   color: "#7f1d1d" },
  ];
}

function generateStageTime() {
  return STAGES.map(stage => ({
    stage,
    avgMinutes: stage === "Upload" ? rnd(0.1, 0.5)
      : stage === "Azure AI Analysis" ? rnd(2, 8)
      : stage === "Confidence Check" ? rnd(0.05, 0.2)
      : stage === "Human Review" ? rnd(15, 90)
      : rnd(0.1, 0.3),
    p95Minutes: stage === "Human Review" ? rnd(120, 360) : rnd(5, 25),
    docCount: rndInt(100, 400),
  }));
}

function generateConfidenceDistribution() {
  const buckets = ["0–20%","20–40%","40–60%","60–75%","75–85%","85–95%","95–100%"];
  const weights = [2, 5, 10, 18, 25, 28, 12];
  const total = weights.reduce((a, b) => a + b, 0);
  return buckets.map((b, i) => ({
    bucket: b,
    count: Math.floor(weights[i] / total * rndInt(800, 1200)),
    needsReview: i < 4,
  }));
}

function generateCorrectionRates() {
  return DOC_TYPES.map(type => ({
    type,
    reviewed: rndInt(30, 120),
    corrected: rndInt(5, 60),
    fieldCorrectionRate: rnd(0.1, 0.55),
    topCorrectedField: pick(["Date", "Amount", "Vendor", "Document Type", "ID Number", "Name"]),
  })).map(d => ({ ...d, correctionRate: d.corrected / d.reviewed }));
}

function generateExceptionBreakdown() {
  return EXCEPTION_CAUSES.map(cause => ({
    cause,
    count: rndInt(5, 85),
    trend: pick(["up", "down", "stable"]),
    pct: 0,
  })).map((d, _, arr) => {
    const total = arr.reduce((s, x) => s + x.count, 0);
    return { ...d, pct: (d.count / total * 100).toFixed(1) };
  }).sort((a, b) => b.count - a.count);
}

function generateHourlyThroughput() {
  return Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, "0")}:00`,
    docs: h >= 8 && h <= 18 ? rndInt(8, 35) : rndInt(0, 8),
  }));
}

// Generate all mock data once
const MOCK = {
  daily: generateDailyVolume(30),
  docTypes: generateDocTypeBreakdown(),
  sla: generateSLAData(),
  breaching: generateBreachingDocs(),
  aging: generateAgingBuckets(),
  stageTime: generateStageTime(),
  confidence: generateConfidenceDistribution(),
  corrections: generateCorrectionRates(),
  exceptions: generateExceptionBreakdown(),
  hourly: generateHourlyThroughput(),
};

const TOTALS = {
  processed: MOCK.daily.reduce((s, d) => s + d.total, 0),
  autoApproved: MOCK.daily.reduce((s, d) => s + d.autoApproved, 0),
  humanReviewed: MOCK.daily.reduce((s, d) => s + d.humanReviewed, 0),
  rejected: MOCK.daily.reduce((s, d) => s + d.rejected, 0),
  avgConfidence: (MOCK.docTypes.reduce((s, d) => s + d.avgConfidence, 0) / MOCK.docTypes.length),
  slaCompliance: (MOCK.sla.reduce((s, d) => s + d.compliant, 0) / MOCK.sla.reduce((s, d) => s + d.total, 0) * 100),
  breaching: MOCK.breaching.length,
  exceptions: MOCK.exceptions.reduce((s, d) => s + d.count, 0),
};

// ── CHART COMPONENTS ─────────────────────────────────────────────────────────

function BarChart({ data, valueKey, labelKey, color = "#0ea5e9", height = 120, showValue = false }) {
  const max = Math.max(...data.map(d => d[valueKey]));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height, padding: "0 2px" }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
          {showValue && <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 2, writingMode: "vertical-rl", transform: "rotate(180deg)", lineHeight: 1 }}>{d[valueKey]}</div>}
          <div
            title={`${d[labelKey]}: ${typeof d[valueKey] === "number" && d[valueKey] < 1 ? (d[valueKey] * 100).toFixed(0) + "%" : d[valueKey]}`}
            style={{
              width: "100%",
              background: color,
              borderRadius: "2px 2px 0 0",
              height: `${(d[valueKey] / max) * 100}%`,
              minHeight: 2,
              opacity: 0.85,
              transition: "opacity 0.15s",
              cursor: "default",
            }}
            onMouseEnter={e => e.target.style.opacity = 1}
            onMouseLeave={e => e.target.style.opacity = 0.85}
          />
        </div>
      ))}
    </div>
  );
}

function StackedBarChart({ data, height = 120 }) {
  const max = Math.max(...data.map(d => d.total));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
          <div style={{ width: "100%", display: "flex", flexDirection: "column-reverse", height: `${(d.total / max) * 100}%`, borderRadius: "2px 2px 0 0", overflow: "hidden" }}>
            <div style={{ flex: d.autoApproved, background: "#10b981", minHeight: d.autoApproved > 0 ? 1 : 0 }} />
            <div style={{ flex: d.humanReviewed, background: "#f59e0b", minHeight: d.humanReviewed > 0 ? 1 : 0 }} />
            <div style={{ flex: d.rejected, background: "#ef4444", minHeight: d.rejected > 0 ? 1 : 0 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function HorizontalBar({ value, max, color, label, sub }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "var(--text)" }}>{label}</span>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>{sub}</span>
      </div>
      <div style={{ height: 6, background: "var(--track)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(value / max) * 100}%`, background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function DonutArc({ pct, color, size = 72 }) {
  const r = 28, cx = 36, cy = 36;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox="0 0 72 72">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--track)" strokeWidth={8} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text)" fontFamily="monospace">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

function KpiCard({ label, value, sub, color = "#0ea5e9", trend, icon }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "16px 18px", borderTop: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)" }}>{label}</div>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--mono)", color: "var(--text)", lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)" }}>{sub}</div>}
      {trend !== undefined && (
        <div style={{ fontSize: 11, color: trend >= 0 ? "#10b981" : "#ef4444", marginTop: 4 }}>
          {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}% vs last period
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, sub, reportNum }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--accent)", background: "rgba(14,165,233,0.1)", padding: "2px 7px", borderRadius: 3 }}>R{reportNum}</span>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function Card({ children, span = 1 }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "16px 18px", gridColumn: `span ${span}` }}>
      {children}
    </div>
  );
}

function StatusChip({ status }) {
  const map = {
    needs_review: ["#fef3c7", "#92400e"],
    analyzing: ["#dbeafe", "#1e40af"],
    queued: ["#f3f4f6", "#6b7280"],
    completed: ["#d1fae5", "#065f46"],
  };
  const [bg, fg] = map[status] || map.queued;
  return <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: bg, color: fg, fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>{status.replace("_", " ")}</span>;
}

// ── MAIN DASHBOARD ────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",    label: "Overview",        reports: "R1–R3" },
  { id: "sla",         label: "SLA & Compliance", reports: "R4–R7" },
  { id: "operations",  label: "Operations",       reports: "R8–R9" },
  { id: "quality",     label: "Quality",          reports: "R10–R12" },
  { id: "realtime",    label: "Real-time Feed",   reports: "R13" },
];

export default function Dashboard({ processedDocs = [], reviewQueue = [], documents = [] }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [dateRange, setDateRange] = useState("30d");
  const [refreshed, setRefreshed] = useState(new Date().toLocaleTimeString());
  const [liveCount, setLiveCount] = useState(rndInt(3, 12));

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveCount(prev => Math.max(0, prev + rndInt(-2, 3)));
      setRefreshed(new Date().toLocaleTimeString());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const displayData = dateRange === "7d" ? MOCK.daily.slice(-7) : dateRange === "14d" ? MOCK.daily.slice(-14) : MOCK.daily;

  return (
    <div style={{
      "--bg": "#0d1117",
      "--card": "#161b22",
      "--border": "#21262d",
      "--text": "#e6edf3",
      "--muted": "#7d8590",
      "--accent": "#0ea5e9",
      "--track": "#21262d",
      "--mono": "'Courier New', monospace",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      background: "var(--bg)",
      color: "var(--text)",
      minHeight: "100vh",
      fontSize: 13,
    }}>

      {/* Top bar */}
      <div style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, background: "#0ea5e9", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "#000" }}>DI</div>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>DocIntel Operational Reports</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>Azure Content Understanding · Power BI Mock Dashboard</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {["7d","14d","30d"].map(r => (
              <button key={r} onClick={() => setDateRange(r)} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", background: dateRange === r ? "#0ea5e9" : "transparent", color: dateRange === r ? "#000" : "var(--muted)", fontFamily: "var(--mono)", fontSize: 10, cursor: "pointer" }}>{r}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
            Live · {refreshed}
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", padding: "0 24px", display: "flex", gap: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "10px 16px", background: "none", border: "none",
            borderBottom: `2px solid ${activeTab === t.id ? "#0ea5e9" : "transparent"}`,
            color: activeTab === t.id ? "#0ea5e9" : "var(--muted)",
            fontFamily: "var(--mono)", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}>
            {t.label}
            <span style={{ fontSize: 9, opacity: 0.6 }}>{t.reports}</span>
          </button>
        ))}
      </div>

      <div style={{ padding: "24px", maxWidth: 1280, margin: "0 auto" }}>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* KPI row — real live data */}
            {(() => {
              const liveTotal      = processedDocs.length + reviewQueue.length;
              const liveAuto       = processedDocs.filter(d => !d.humanReviewed).length;
              const liveHuman      = processedDocs.filter(d => d.humanReviewed).length + reviewQueue.filter(d => d.status === "approved").length;
              const livePending    = reviewQueue.filter(d => d.status === "pending_review").length;
              const liveProcessing = documents.filter(d => ["queued","analyzing"].includes(d.status)).length;
              const liveConfs      = processedDocs.map(d => d.confidence).filter(Boolean);
              const liveAvgConf    = liveConfs.length ? (liveConfs.reduce((a,b)=>a+b,0)/liveConfs.length*100).toFixed(1) : null;
              const useLive        = liveTotal > 0;
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  <KpiCard label="Total Processed" value={useLive ? liveTotal : TOTALS.processed.toLocaleString()} sub={useLive ? "This session" : "Last 30 days"} color="#0ea5e9" trend={useLive ? null : 12} icon="📄" />
                  <KpiCard label="Auto-Approved" value={useLive ? liveAuto : TOTALS.autoApproved.toLocaleString()} sub={useLive ? `${liveTotal ? (liveAuto/liveTotal*100).toFixed(1) : 0}% of total` : `${(TOTALS.autoApproved/TOTALS.processed*100).toFixed(1)}% of total`} color="#10b981" trend={useLive ? null : 5} icon="✓" />
                  <KpiCard label="Pending Review" value={useLive ? livePending : TOTALS.humanReviewed.toLocaleString()} sub={useLive ? `${liveProcessing} processing now` : `${(TOTALS.humanReviewed/TOTALS.processed*100).toFixed(1)}% review rate`} color="#f59e0b" trend={useLive ? null : -3} icon="👁" />
                  <KpiCard label="Avg Confidence" value={useLive && liveAvgConf ? `${liveAvgConf}%` : `${TOTALS.slaCompliance.toFixed(1)}%`} sub={useLive && liveAvgConf ? "Real extracted fields avg" : `${TOTALS.breaching} docs breaching now`} color={useLive ? (parseFloat(liveAvgConf) > 75 ? "#10b981" : "#f59e0b") : (TOTALS.slaCompliance > 90 ? "#10b981" : "#ef4444")} trend={useLive ? null : 2} icon="🎯" />
                </div>
              );
            })()}

            {/* R1 — Processing Volume */}
            <Card span={1}>
              <SectionHeader reportNum="1" title="Processing Volume — Daily Trend" sub={`Last ${dateRange} · Stacked by outcome`} />
              <div style={{ marginBottom: 8 }}>
                <StackedBarChart data={displayData} height={130} />
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {[["#10b981","Auto-approved"],["#f59e0b","Human reviewed"],["#ef4444","Rejected"]].map(([c,l]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--muted)" }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l}
                  </div>
                ))}
                <div style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>
                  Peak: {Math.max(...displayData.map(d=>d.total))} docs/day
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                {displayData.slice(-5).map(d => (
                  <div key={d.date} style={{ flex:1, textAlign:"center", fontSize:9, color:"var(--muted)", fontFamily:"var(--mono)" }}>{d.label}</div>
                ))}
              </div>
            </Card>

            {/* R2 + R3 side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Card>
                <SectionHeader reportNum="2" title="Documents by Date Range" sub="Daily totals with 7-day moving avg" />
                <BarChart data={displayData} valueKey="total" labelKey="label" color="#0ea5e9" height={110} />
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    ["Avg/day", Math.round(displayData.reduce((s,d)=>s+d.total,0)/displayData.length)],
                    ["Max/day", Math.max(...displayData.map(d=>d.total))],
                    ["Min/day", Math.min(...displayData.map(d=>d.total))],
                  ].map(([l,v]) => (
                    <div key={l} style={{ textAlign:"center", background:"var(--bg)", padding:"8px 4px", borderRadius:6 }}>
                      <div style={{ fontFamily:"var(--mono)", fontSize:16, fontWeight:700, color:"var(--accent)" }}>{v}</div>
                      <div style={{ fontSize:9, color:"var(--muted)", marginTop:2 }}>{l}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <SectionHeader reportNum="3" title="Breakdown by Document Type" sub="Volume and average confidence score" />
                {MOCK.docTypes.slice(0, 6).map(d => (
                  <HorizontalBar key={d.type} label={d.type} value={d.count}
                    max={Math.max(...MOCK.docTypes.map(x=>x.count))}
                    color={d.avgConfidence >= 0.8 ? "#10b981" : d.avgConfidence >= 0.65 ? "#f59e0b" : "#ef4444"}
                    sub={`${d.count} · ${(d.avgConfidence*100).toFixed(0)}% avg conf`}
                  />
                ))}
              </Card>
            </div>

            {/* Hourly throughput */}
            <Card>
              <SectionHeader reportNum="13" title="Real-time Hourly Throughput" sub="Documents processed per hour today · refreshes every 5s" />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#10b981", fontFamily:"var(--mono)" }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:"#10b981", boxShadow:"0 0 6px #10b981", animation:"none" }} />
                  {liveCount} documents processing now
                </div>
              </div>
              <BarChart data={MOCK.hourly} valueKey="docs" labelKey="hour" color="#6366f1" height={90} />
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, fontSize:9, color:"var(--muted)", fontFamily:"var(--mono)" }}>
                {MOCK.hourly.filter((_,i)=>i%4===0).map(h=><span key={h.hour}>{h.hour}</span>)}
              </div>
            </Card>
          </div>
        )}

        {/* ── SLA TAB ── */}
        {activeTab === "sla" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <KpiCard label="Overall SLA Compliance" value={`${TOTALS.slaCompliance.toFixed(1)}%`} color={TOTALS.slaCompliance>90?"#10b981":"#ef4444"} sub="Target: 95%" icon="🎯" />
              <KpiCard label="Docs Breaching SLA" value={TOTALS.breaching} color="#ef4444" sub="Require immediate attention" icon="🚨" />
              <KpiCard label="Avg Breach Overage" value={`${(MOCK.breaching.reduce((s,d)=>s+parseFloat(d.breach),0)/MOCK.breaching.length).toFixed(1)}h`} color="#f59e0b" sub="Average time over SLA" icon="⏰" />
              <KpiCard label="At-Risk (75–100% of SLA)" value={rndInt(8,22)} color="#f97316" sub="Will breach within 1h" icon="⚠" />
            </div>

            {/* R4 — Avg Processing Time */}
            <Card>
              <SectionHeader reportNum="4" title="Average Processing Time by Document Type" sub="Actual vs SLA target (hours)" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {MOCK.sla.map(d => {
                  const pct = (d.avgActualTime / d.slaTarget) * 100;
                  const color = pct <= 75 ? "#10b981" : pct <= 100 ? "#f59e0b" : "#ef4444";
                  return (
                    <div key={d.type} style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, padding:"12px 14px" }}>
                      <div style={{ fontSize:11, color:"var(--muted)", marginBottom:6, fontFamily:"var(--mono)" }}>{d.type}</div>
                      <div style={{ fontSize:20, fontWeight:700, color, fontFamily:"var(--mono)", marginBottom:4 }}>{d.avgActualTime.toFixed(1)}h</div>
                      <div style={{ fontSize:10, color:"var(--muted)", marginBottom:6 }}>Target: {d.slaTarget}h</div>
                      <div style={{ height:4, background:"var(--track)", borderRadius:2, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${Math.min(pct,100)}%`, background:color, borderRadius:2 }} />
                      </div>
                      <div style={{ fontSize:9, color, marginTop:4, fontFamily:"var(--mono)" }}>{pct.toFixed(0)}% of SLA used</div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* R5 — SLA Compliance % */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Card>
                <SectionHeader reportNum="5" title="SLA Compliance % by Process" sub="Compliant vs total documents" />
                {MOCK.sla.map(d => (
                  <div key={d.type} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:12 }}>{d.type}</span>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <span style={{ fontSize:10, color:"var(--muted)", fontFamily:"var(--mono)" }}>{d.compliant}/{d.total}</span>
                        <span style={{ fontSize:11, fontWeight:700, fontFamily:"var(--mono)", color: d.compliancePct>=95?"#10b981":d.compliancePct>=80?"#f59e0b":"#ef4444" }}>
                          {d.compliancePct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div style={{ height:5, background:"var(--track)", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${d.compliancePct}%`, background: d.compliancePct>=95?"#10b981":d.compliancePct>=80?"#f59e0b":"#ef4444", borderRadius:3 }} />
                    </div>
                  </div>
                ))}
              </Card>

              <Card>
                <SectionHeader reportNum="5b" title="SLA Compliance Donut" sub="At-a-glance by category" />
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:8, justifyItems:"center" }}>
                  {MOCK.sla.slice(0,8).map(d => (
                    <div key={d.type} style={{ textAlign:"center" }}>
                      <DonutArc pct={d.compliancePct} color={d.compliancePct>=95?"#10b981":d.compliancePct>=80?"#f59e0b":"#ef4444"} />
                      <div style={{ fontSize:9, color:"var(--muted)", marginTop:4, lineHeight:1.3 }}>{d.type}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* R6 — Breaching docs */}
            <Card>
              <SectionHeader reportNum="6" title="Documents Breaching SLA" sub={`${MOCK.breaching.length} documents currently over their SLA target · sorted by breach severity`} />
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)" }}>
                      {["Doc ID","Filename","Type","SLA Target","Elapsed","Breach","Status","Assigned To"].map(h => (
                        <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontFamily:"var(--mono)", fontSize:9, textTransform:"uppercase", letterSpacing:"0.07em", color:"var(--muted)", fontWeight:500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK.breaching.slice(0,10).map((d,i) => (
                      <tr key={d.id} style={{ borderBottom:"1px solid var(--border)", background: i%2===0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                        <td style={{ padding:"9px 10px", fontFamily:"var(--mono)", fontSize:11, color:"var(--accent)" }}>{d.id}</td>
                        <td style={{ padding:"9px 10px", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.filename}</td>
                        <td style={{ padding:"9px 10px" }}>{d.type}</td>
                        <td style={{ padding:"9px 10px", fontFamily:"var(--mono)", color:"var(--muted)" }}>{d.slaTarget}h</td>
                        <td style={{ padding:"9px 10px", fontFamily:"var(--mono)" }}>{d.elapsed}h</td>
                        <td style={{ padding:"9px 10px", fontFamily:"var(--mono)", color:"#ef4444", fontWeight:700 }}>+{d.breach}h</td>
                        <td style={{ padding:"9px 10px" }}><StatusChip status={d.status} /></td>
                        <td style={{ padding:"9px 10px", color:"var(--muted)" }}>{d.assignedTo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* R7 — Aging report */}
            <Card>
              <SectionHeader reportNum="7" title="Aging Report — Open Items by Time Bucket" sub="Documents currently in-flight, grouped by time since upload" />
              <div style={{ display:"flex", alignItems:"flex-end", gap:16 }}>
                {MOCK.aging.map(b => {
                  const max = Math.max(...MOCK.aging.map(x=>x.count));
                  return (
                    <div key={b.bucket} style={{ flex:1, textAlign:"center" }}>
                      <div style={{ fontSize:18, fontWeight:700, fontFamily:"var(--mono)", color:b.color, marginBottom:6 }}>{b.count}</div>
                      <div style={{ height:80, background:"var(--track)", borderRadius:4, overflow:"hidden", position:"relative" }}>
                        <div style={{ position:"absolute", bottom:0, left:0, right:0, background:b.color, height:`${(b.count/max)*100}%`, opacity:0.8, borderRadius:"4px 4px 0 0" }} />
                      </div>
                      <div style={{ fontSize:10, color:"var(--muted)", marginTop:6, lineHeight:1.3 }}>{b.bucket}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop:14, padding:"10px 14px", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:6, fontSize:11, color:"#fca5a5" }}>
                ⚠ {MOCK.aging.filter(b=>["1–3 days","> 3 days"].includes(b.bucket)).reduce((s,b)=>s+b.count,0)} documents are aged &gt;1 day — escalation recommended
              </div>
            </Card>
          </div>
        )}

        {/* ── OPERATIONS TAB ── */}
        {activeTab === "operations" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <KpiCard label="Avg Total Pipeline Time" value={`${(MOCK.stageTime.reduce((s,d)=>s+d.avgMinutes,0)/60).toFixed(1)}h`} color="#0ea5e9" sub="Upload to completion" icon="⚡" />
              <KpiCard label="Bottleneck Stage" value="Human Review" color="#f59e0b" sub={`Avg ${MOCK.stageTime.find(s=>s.stage==="Human Review")?.avgMinutes.toFixed(0)}min`} icon="🔍" />
              <KpiCard label="Avg AI Analysis Time" value={`${MOCK.stageTime.find(s=>s.stage==="Azure AI Analysis")?.avgMinutes.toFixed(1)}min`} color="#10b981" sub="Content Understanding latency" icon="🤖" />
              <KpiCard label="Avg Confidence Score" value={`${(TOTALS.avgConfidence*100).toFixed(1)}%`} color={TOTALS.avgConfidence>0.8?"#10b981":"#f59e0b"} sub="All documents · 30d" icon="📊" />
            </div>

            {/* R8 — Stage timing */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Card>
                <SectionHeader reportNum="8" title="Time Spent in Each Workflow Stage" sub="Average and P95 duration in minutes" />
                {MOCK.stageTime.map((s, i) => {
                  const maxAvg = Math.max(...MOCK.stageTime.map(x=>x.avgMinutes));
                  const colors = ["#0ea5e9","#6366f1","#10b981","#f59e0b","#10b981"];
                  return (
                    <div key={s.stage} style={{ marginBottom:14 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ width:20, height:20, borderRadius:10, background:colors[i], display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#000" }}>{i+1}</div>
                          <span style={{ fontSize:12 }}>{s.stage}</span>
                        </div>
                        <div style={{ fontFamily:"var(--mono)", fontSize:11 }}>
                          <span style={{ color:colors[i] }}>{s.avgMinutes < 1 ? `${(s.avgMinutes*60).toFixed(0)}s` : `${s.avgMinutes.toFixed(1)}min`}</span>
                          <span style={{ color:"var(--muted)", marginLeft:6 }}>p95: {s.p95Minutes.toFixed(0)}min</span>
                        </div>
                      </div>
                      <div style={{ height:6, background:"var(--track)", borderRadius:3, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${(s.avgMinutes/maxAvg)*100}%`, background:colors[i], borderRadius:3, opacity:0.85 }} />
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop:8, padding:"10px 12px", background:"var(--bg)", borderRadius:6, fontSize:11, color:"var(--muted)", borderLeft:"3px solid #f59e0b" }}>
                  Human Review accounts for <strong style={{ color:"var(--text)" }}>{((MOCK.stageTime.find(s=>s.stage==="Human Review")?.avgMinutes ?? 0) / MOCK.stageTime.reduce((s,d)=>s+d.avgMinutes,0)*100).toFixed(0)}%</strong> of total pipeline time
                </div>
              </Card>

              <Card>
                <SectionHeader reportNum="8b" title="Stage Volume Throughput" sub="Documents currently in each stage" />
                {MOCK.stageTime.map((s, i) => {
                  const colors = ["#0ea5e9","#6366f1","#f59e0b","#ef4444","#10b981"];
                  return (
                    <div key={s.stage} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12, padding:"10px 12px", background:"var(--bg)", borderRadius:6, border:"1px solid var(--border)" }}>
                      <div style={{ width:36, height:36, borderRadius:8, background: `${colors[i]}20`, border:`1px solid ${colors[i]}40`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>
                        {["⬆","🤖","⚖","👁","✓"][i]}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:500 }}>{s.stage}</div>
                        <div style={{ fontSize:10, color:"var(--muted)", marginTop:2 }}>
                          {s.docCount} docs · avg {s.avgMinutes < 1 ? `${(s.avgMinutes*60).toFixed(0)}s` : `${s.avgMinutes.toFixed(1)}min`}
                        </div>
                      </div>
                      <div style={{ fontFamily:"var(--mono)", fontSize:18, fontWeight:700, color:colors[i] }}>{s.docCount}</div>
                    </div>
                  );
                })}
              </Card>
            </div>

            {/* R9 — Confidence distribution */}
            <Card>
              <SectionHeader reportNum="9" title="Confidence Score Distribution" sub="All documents · below 75% threshold routed to human review" />
              <div style={{ display:"flex", alignItems:"flex-end", gap:8, height:140 }}>
                {MOCK.confidence.map(b => {
                  const max = Math.max(...MOCK.confidence.map(x=>x.count));
                  return (
                    <div key={b.bucket} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", height:"100%", justifyContent:"flex-end" }}>
                      <div style={{ fontSize:11, fontFamily:"var(--mono)", color: b.needsReview?"#ef4444":"#10b981", marginBottom:4 }}>{b.count}</div>
                      <div style={{ width:"100%", height:`${(b.count/max)*100}%`, background: b.needsReview?"rgba(239,68,68,0.7)":"rgba(16,185,129,0.7)", borderRadius:"3px 3px 0 0", border: b.needsReview?"1px solid #ef4444":"1px solid #10b981", borderBottom:"none" }} />
                      <div style={{ fontSize:10, color:"var(--muted)", marginTop:5, textAlign:"center", lineHeight:1.2 }}>{b.bucket}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop:12, display:"flex", gap:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"var(--muted)" }}>
                  <div style={{ width:10, height:10, background:"rgba(239,68,68,0.7)", borderRadius:2 }} /> Below threshold (→ Human Review)
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"var(--muted)" }}>
                  <div style={{ width:10, height:10, background:"rgba(16,185,129,0.7)", borderRadius:2 }} /> Above threshold (→ Auto-approved)
                </div>
                <div style={{ marginLeft:"auto", fontSize:10, fontFamily:"var(--mono)", color:"var(--muted)" }}>
                  Review rate: {(MOCK.confidence.filter(b=>b.needsReview).reduce((s,b)=>s+b.count,0) / MOCK.confidence.reduce((s,b)=>s+b.count,0)*100).toFixed(1)}%
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ── QUALITY TAB ── */}
        {activeTab === "quality" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <KpiCard label="Overall Correction Rate" value={`${(MOCK.corrections.reduce((s,d)=>s+d.correctionRate,0)/MOCK.corrections.length*100).toFixed(1)}%`} color="#f59e0b" sub="Fields corrected during review" icon="✏" />
              <KpiCard label="Total Exceptions (30d)" value={TOTALS.exceptions} color="#ef4444" sub="Across all exception types" icon="⚡" />
              <KpiCard label="First-Pass Accuracy" value={`${(100 - MOCK.corrections.reduce((s,d)=>s+d.correctionRate,0)/MOCK.corrections.length*100).toFixed(1)}%`} color="#10b981" sub="Docs correct without correction" icon="🎯" />
              <KpiCard label="Repeat Exception Rate" value={`${rndInt(8,18)}%`} color="#f97316" sub="Same doc type, same error" icon="🔄" />
            </div>

            {/* R10 — Manual correction rates */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Card>
                <SectionHeader reportNum="10" title="Manual Correction Rates" sub="% of reviewed documents where fields were corrected" />
                {MOCK.corrections.map(d => (
                  <div key={d.type} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, alignItems:"center" }}>
                      <span style={{ fontSize:12 }}>{d.type}</span>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <span style={{ fontSize:10, color:"var(--muted)" }}>Top: <span style={{ color:"#f59e0b" }}>{d.topCorrectedField}</span></span>
                        <span style={{ fontFamily:"var(--mono)", fontSize:12, fontWeight:700, color: d.correctionRate>0.4?"#ef4444":d.correctionRate>0.2?"#f59e0b":"#10b981" }}>
                          {(d.correctionRate*100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div style={{ height:5, background:"var(--track)", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${d.correctionRate*100}%`, background: d.correctionRate>0.4?"#ef4444":d.correctionRate>0.2?"#f59e0b":"#10b981", borderRadius:3 }} />
                    </div>
                  </div>
                ))}
              </Card>

              <Card>
                <SectionHeader reportNum="10b" title="Most Corrected Fields" sub="Fields most frequently edited during human review" />
                {[
                  { field:"Amount/Total", corrections: rndInt(120,280), pct: rnd(35,55) },
                  { field:"Date", corrections: rndInt(80,180), pct: rnd(22,38) },
                  { field:"Document Type", corrections: rndInt(60,140), pct: rnd(18,30) },
                  { field:"Vendor/Issuer", corrections: rndInt(40,100), pct: rnd(12,22) },
                  { field:"ID Number", corrections: rndInt(20,70), pct: rnd(8,15) },
                  { field:"Name", corrections: rndInt(10,50), pct: rnd(5,10) },
                ].map(f => (
                  <div key={f.field} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:9 }}>
                    <div style={{ width:120, fontSize:12, color:"var(--text)" }}>{f.field}</div>
                    <div style={{ flex:1, height:5, background:"var(--track)", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${f.pct}%`, background:"#6366f1", borderRadius:3 }} />
                    </div>
                    <div style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--muted)", width:30, textAlign:"right" }}>{f.corrections}</div>
                  </div>
                ))}
              </Card>
            </div>

            {/* R11 — Exception cause breakdown */}
            <Card>
              <SectionHeader reportNum="11" title="Exception Cause Breakdown" sub="Root cause analysis of all processing exceptions" />
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                <div>
                  {MOCK.exceptions.map((e, i) => {
                    const colors = ["#ef4444","#f97316","#f59e0b","#6366f1","#0ea5e9","#10b981"];
                    return (
                      <div key={e.cause} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                        <div style={{ width:10, height:10, borderRadius:2, background:colors[i], flexShrink:0 }} />
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                            <span style={{ fontSize:12 }}>{e.cause}</span>
                            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                              <span style={{ fontSize:10, color: e.trend==="up"?"#ef4444":e.trend==="down"?"#10b981":"var(--muted)" }}>
                                {e.trend==="up"?"↑ Rising":e.trend==="down"?"↓ Falling":"→ Stable"}
                              </span>
                              <span style={{ fontFamily:"var(--mono)", fontSize:12, color:colors[i] }}>{e.pct}%</span>
                            </div>
                          </div>
                          <div style={{ height:4, background:"var(--track)", borderRadius:2, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${e.pct}%`, background:colors[i], borderRadius:2 }} />
                          </div>
                        </div>
                        <div style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--muted)", width:24, textAlign:"right" }}>{e.count}</div>
                      </div>
                    );
                  })}
                </div>
                <div>
                  <div style={{ fontSize:12, color:"var(--muted)", marginBottom:14 }}>Exception trend — last 7 days</div>
                  <BarChart data={MOCK.daily.slice(-7).map(d=>({...d, exceptions: rndInt(5,30)}))} valueKey="exceptions" labelKey="label" color="#ef4444" height={100} />
                  <div style={{ marginTop:12, padding:"10px 12px", background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.15)", borderRadius:6, fontSize:11, color:"var(--muted)" }}>
                    <strong style={{ color:"var(--text)" }}>Low Confidence</strong> is the top exception cause at <strong style={{ color:"#ef4444" }}>{MOCK.exceptions[0].pct}%</strong> — consider retraining the <code style={{ background:"var(--bg)", padding:"1px 4px", borderRadius:3 }}>redacted-idp-epf</code> analyzer.
                  </div>
                </div>
              </div>
            </Card>

            {/* R12 — Additional quality reports */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
              <Card>
                <SectionHeader reportNum="12a" title="Duplicate Detection Rate" sub="Docs flagged as duplicates" />
                <div style={{ textAlign:"center", padding:"16px 0" }}>
                  <DonutArc pct={rnd(3,8)} color="#6366f1" size={100} />
                  <div style={{ fontSize:11, color:"var(--muted)", marginTop:8 }}>{rndInt(12,40)} duplicates detected this month</div>
                  <div style={{ marginTop:12, fontSize:11, color:"var(--muted)" }}>Top source: <span style={{ color:"var(--text)" }}>Invoice</span></div>
                </div>
              </Card>

              <Card>
                <SectionHeader reportNum="12b" title="Re-submission Rate" sub="Docs rejected and resubmitted" />
                <div style={{ textAlign:"center", padding:"16px 0" }}>
                  <DonutArc pct={rnd(8,15)} color="#f97316" size={100} />
                  <div style={{ fontSize:11, color:"var(--muted)", marginTop:8 }}>{rndInt(20,60)} resubmissions this month</div>
                  <div style={{ marginTop:12, fontSize:11, color:"var(--muted)" }}>Avg resubmit delay: <span style={{ color:"var(--text)" }}>{rnd(2,8).toFixed(1)}h</span></div>
                </div>
              </Card>

              <Card>
                <SectionHeader reportNum="12c" title="Reviewer Workload Distribution" sub="Human review queue by assignee" />
                {["Ana S.","Ben T.","Cara M.","Dev P.","Elan R."].map(name => {
                  const n = rndInt(2,18);
                  return (
                    <div key={name} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <div style={{ width:26, height:26, borderRadius:13, background:`hsl(${name.charCodeAt(0)*5},60%,35%)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"white", flexShrink:0 }}>{name[0]}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                          <span style={{ fontSize:12 }}>{name}</span>
                          <span style={{ fontFamily:"var(--mono)", fontSize:11, color:"var(--muted)" }}>{n}</span>
                        </div>
                        <div style={{ height:4, background:"var(--track)", borderRadius:2, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${n/18*100}%`, background:`hsl(${name.charCodeAt(0)*5},60%,50%)`, borderRadius:2 }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
          </div>
        )}

        {/* ── REAL-TIME TAB ── */}
        {activeTab === "realtime" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <KpiCard label="Processing Now" value={liveCount} color="#10b981" sub="Documents in Azure AI pipeline" icon="⚡" />
              <KpiCard label="Queue Depth" value={rndInt(4,20)} color="#0ea5e9" sub="Awaiting processing" icon="📥" />
              <KpiCard label="Pending Human Review" value={rndInt(3,12)} color="#f59e0b" sub="Awaiting reviewer action" icon="👁" />
              <KpiCard label="Avg Latency (last 1h)" value={`${rnd(2.5,6.5).toFixed(1)}s`} color="#6366f1" sub="Azure Content Understanding" icon="🌐" />
            </div>

            <Card>
              <SectionHeader reportNum="13a" title="Live Document Feed" sub={`Auto-refreshing · Last updated ${refreshed}`} />
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {(() => {
                  const allDocs = [
                    ...documents.map(d => ({ name: d.name, confidence: d.confidence, status: d.status, uploadedAt: d.uploadedAt, size: d.size, isReal: true })),
                    ...processedDocs.map(d => ({ name: d.name, confidence: d.confidence, status: "completed", uploadedAt: d.uploadedAt, size: d.size, isReal: true })),
                  ].reverse().slice(0, 10);
                  const feedItems = allDocs.length > 0 ? allDocs : Array.from({length:10},(_,i)=>{
                    const type = pick(DOC_TYPES);
                    return { name: `${type.toLowerCase().replace(" ","_")}_${rndInt(1000,9999)}.pdf`, confidence: rnd(0.4,0.98), status: pick(["analyzing","needs_review","completed","completed","completed"]), uploadedAt: new Date(Date.now()-rndInt(1000,60000)).toISOString(), size: rndInt(50000,2000000), isReal: false };
                  });
                  return feedItems.map((doc, i) => (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr auto auto auto", alignItems:"center", gap:12, padding:"9px 12px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6 }}>
                      <div>
                        <div style={{ fontSize:12, fontWeight:500, display:"flex", alignItems:"center", gap:6 }}>
                          {doc.name}
                          {doc.isReal && <span style={{ fontSize:9, background:"#0ea5e933", color:"#0ea5e9", padding:"1px 5px", borderRadius:3, fontFamily:"var(--mono)" }}>LIVE</span>}
                        </div>
                        <div style={{ fontSize:10, color:"var(--muted)", marginTop:1, fontFamily:"var(--mono)" }}>
                          {doc.size ? `${(doc.size/1024).toFixed(0)} KB` : "—"} · {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleTimeString() : "—"}
                        </div>
                      </div>
                      <div style={{ fontFamily:"var(--mono)", fontSize:11, color: doc.confidence>=0.75?"#10b981":doc.confidence>=0.5?"#f59e0b":"#ef4444" }}>
                        {doc.confidence ? `${(doc.confidence*100).toFixed(0)}%` : "—"}
                      </div>
                      <div style={{ fontFamily:"var(--mono)", fontSize:10, color:"var(--muted)" }}>
                        {doc.uploadedAt ? `${Math.round((Date.now()-new Date(doc.uploadedAt))/1000)}s ago` : "—"}
                      </div>
                      <StatusChip status={doc.status || "completed"} />
                    </div>
                  ));
                })()}
              </div>
            </Card>

            <Card>
              <SectionHeader reportNum="13b" title="Throughput Sparkline — Last 24h" sub="Documents processed per hour" />
              <BarChart data={MOCK.hourly} valueKey="docs" labelKey="hour" color="#0ea5e9" height={110} showValue={false} />
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontSize:9, color:"var(--muted)", fontFamily:"var(--mono)" }}>
                {MOCK.hourly.filter((_,i)=>i%3===0).map(h=><span key={h.hour}>{h.hour}</span>)}
              </div>
            </Card>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop:32, padding:"16px 0", borderTop:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:10, color:"var(--muted)", fontFamily:"var(--mono)" }}>
          <span>DocIntel Operational Dashboard · Azure Content Understanding · Mock Data</span>
          <span>13 reports across 4 categories · Refreshed {refreshed}</span>
        </div>
      </div>
    </div>
  );
}