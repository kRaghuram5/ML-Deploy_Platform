import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

// ── Pure inline-style constants ──────────────────────────────────────────────
const C = {
  bg:        '#060612',
  surface:   'rgba(255,255,255,0.04)',
  border:    'rgba(255,255,255,0.10)',
  borderBr:  'rgba(79,172,254,0.35)',
  accent:    '#4facfe',
  purple:    '#a78bfa',
  green:     '#4ade80',
  red:       '#f87171',
  yellow:    '#fbbf24',
  text:      '#f1f5f9',
  muted:     '#94a3b8',
  dim:       'rgba(255,255,255,0.06)',
}

const card = {
  background : C.surface,
  border     : `1px solid ${C.border}`,
  borderRadius: 16,
  padding    : 20,
  backdropFilter: 'blur(12px)',
}

const label = {
  fontSize   : 11,
  fontWeight : 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color      : C.muted,
  marginBottom: 6,
}

const bigNum = {
  fontSize   : 28,
  fontWeight : 800,
  fontFamily : 'JetBrains Mono, monospace',
  color      : C.text,
  lineHeight : 1.1,
}

// ── Mini chart (SVG path) ────────────────────────────────────────────────────
function LineChart ({ history, dataKey, color, extraKey, extraColor, height = 90, dangerAt }) {
  const maxVal = Math.max(...history.map(d => Math.max(d[dataKey] ?? 0, d[extraKey] ?? 0)), 1)

  const pts = (key) => history.map((d, i) => {
    const x = (i / (history.length - 1)) * 100
    const y = 100 - ((d[key] ?? 0) / (maxVal * 1.15)) * 100
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')

  return (
    <div style={{ position: 'relative', height, borderLeft: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, marginTop: 8 }}>
      {dangerAt && (
        <div style={{
          position: 'absolute',
          top: `${100 - (dangerAt / (maxVal * 1.15)) * 100}%`,
          left: 0, right: 0,
          height: 1,
          background: 'rgba(248,113,113,0.3)',
          borderTop: '1px dashed rgba(248,113,113,0.5)',
        }} />
      )}
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
           style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Fill area */}
        <polygon
          points={`0,100 ${pts(dataKey)} 100,100`}
          fill={`url(#grad-${dataKey})`}
        />
        {/* Main line */}
        <polyline points={pts(dataKey)} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        {/* Optional second line (dashed) */}
        {extraKey && (
          <polyline points={pts(extraKey)} fill="none" stroke={extraColor} strokeWidth="1.5"
                    strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
    </div>
  )
}

// ── Bar chart for replicas ───────────────────────────────────────────────────
function BarChart ({ history, dataKey, color, maxVal = 10, height = 60 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height, borderLeft: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, marginTop: 8, padding: '0 2px' }}>
      {history.map((d, i) => (
        <div key={i} style={{
          flex: 1,
          height: `${Math.max((d[dataKey] / maxVal) * 100, 4)}%`,
          background: color,
          borderRadius: '2px 2px 0 0',
          opacity: 0.75,
          transition: 'height 0.3s ease',
        }} />
      ))}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function AutoScaleSimulator () {
  const MAX_HISTORY = 60

  const [mode, setMode]               = useState('reactive')   // 'reactive' | 'predictive'
  const [trafficMode, setTrafficMode] = useState('normal')     // 'normal' | 'spiking'
  const [history, setHistory]         = useState(() => Array(MAX_HISTORY).fill({ load: 50, predicted: 50, cpu: 15, replicas: 2 }))
  const [pods, setPods]               = useState([
    { id: 'pod-0', status: 'healthy', age: 100 },
    { id: 'pod-1', status: 'healthy', age: 100 },
  ])
  const [stats, setStats]             = useState({ totalCost: 0, costSaved: 0 })
  const [tick, setTick]               = useState(0)
  const [isLive, setIsLive]           = useState(false)
  const [aiAnalysis, setAiAnalysis]   = useState(null)

  const sim = useRef({ load: 50, replicas: 2, pending: 0, totalCost: 0, costSaved: 0 })

  useEffect(() => {
    if (isLive) return
    const id = setInterval(() => runTick(), 1000)
    return () => clearInterval(id)
  }, [mode, trafficMode, pods, isLive])

  useEffect(() => {
    if (!isLive) return
    const poll = async () => {
      try {
        const res = await axios.get('http://localhost:8000/api/live-metrics/status')
        const data = res.data
        if (data.error) return

        setPods(data.pods)
        
        // Update Live Cost Tracking
        const s = sim.current
        // Only increase cost if there is actual traffic (Demo optimization)
        if (data.load > 10) {
            const perSecond = data.replicas * 0.000024 * 20 
            s.totalCost += perSecond
            
            if (mode === 'predictive' && data.load < 150 && data.replicas < 4) {
                s.costSaved += (4 - data.replicas) * perSecond
            }
        }
        
        setStats({ totalCost: s.totalCost, costSaved: s.costSaved })

        setHistory(prev => [...prev.slice(1), { 
          load: data.load, 
          predicted: data.load * 1.05, 
          cpu: data.cpu, 
          replicas: data.replicas 
        }])
      } catch (err) {
        console.error("Live metrics failed", err)
      }
    }
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [isLive])

  function runTick () {
    const s = sim.current

    // 1. Traffic
    const target = trafficMode === 'spiking' ? 350 : 50
    s.load += (target - s.load) * 0.35 + (Math.random() - 0.5) * 12

    // 2. Prediction (AI sees spike early)
    const predicted = mode === 'predictive'
      ? (trafficMode === 'spiking' ? 360 + Math.random() * 15 : 52 + Math.random() * 8)
      : s.load

    // 3. CPU
    const healthy  = pods.filter(p => p.status === 'healthy').length
    const capacity = Math.max(healthy * 40, 1)
    const cpu      = (s.load / capacity) * 100

    // 4. Pod lifecycle update
    let newPods = pods.map(p => ({ ...p, age: p.age + 1 }))
    newPods = newPods.map(p => {
      if (p.status === 'booting'  && p.age > 4) return { ...p, status: 'healthy' }
      if (p.status === 'crashed'  && p.age > 3) return { ...p, status: 'booting', age: 0 }
      if (cpu > 150 && mode === 'reactive' && p.status === 'healthy' && Math.random() < 0.15)
        return { ...p, status: 'crashed', age: 0 }
      return p
    })

    // 5. Scaling decisions
    const decisionMetric = mode === 'predictive' ? (predicted / 40) * 100 : cpu
    if (decisionMetric > 85 && newPods.length < 10) {
      const toAdd = mode === 'predictive' ? 3 : 1
      for (let i = 0; i < toAdd && newPods.length < 10; i++) {
        newPods.push({ id: `pod-${Date.now()}-${i}`, status: 'booting', age: 0 })
      }
    } else if (decisionMetric < 30 && newPods.length > 2) {
      const hIdx = newPods.map((p, i) => p.status === 'healthy' ? i : -1).filter(i => i !== -1)
      if (hIdx.length > 2) newPods.splice(hIdx[0], 1)
    }

    // 6. Cost (Demo optimization: only charge when load is active)
    if (s.load > 10) {
        const perSecond = newPods.length * 0.000024 * 10
        s.totalCost += perSecond
        if (mode === 'predictive' && trafficMode === 'normal' && newPods.length < 4)
            s.costSaved += (4 - newPods.length) * perSecond
    }

    setPods(newPods)
    setStats({ totalCost: s.totalCost, costSaved: s.costSaved })
    setHistory(prev => [...prev.slice(1), { load: s.load, predicted, cpu, replicas: newPods.length }])
    setTick(t => t + 1)
  }

  const cur = history[history.length - 1]
  const cpuColor  = cur.cpu > 100 ? C.red : cur.cpu > 70 ? C.yellow : C.green
  const healthyPods  = pods.filter(p => p.status === 'healthy').length
  const bootingPods  = pods.filter(p => p.status === 'booting').length
  const crashedPods  = pods.filter(p => p.status === 'crashed').length

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Outfit, system-ui, sans-serif', padding: '80px 24px 40px', overflowX: 'hidden', position: 'relative' }}>

      {/* Ambient glows */}
      <div style={{ position: 'fixed', top: '-15%', left: '-10%', width: '45%', height: '45%', background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-10%', right: '-5%',  width: '35%', height: '35%', background: 'radial-gradient(circle, rgba(79,172,254,0.10) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ maxWidth: 1300, margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* ── Page Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ padding: '3px 12px', background: 'rgba(79,172,254,0.12)', border: `1px solid ${C.borderBr}`, borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: C.accent, textTransform: 'uppercase' }}>
                Live Simulator
              </span>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, boxShadow: `0 0 8px ${C.green}`, display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
            <h1 style={{ fontSize: 36, fontWeight: 900, margin: 0, background: 'linear-gradient(135deg, #4facfe 0%, #a78bfa 50%, #f472b6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', letterSpacing: '-0.02em' }}>
              AI Auto-Scale Simulator
            </h1>
            <p style={{ color: C.muted, marginTop: 8, fontSize: 14, maxWidth: 560 }}>
              Demonstrates Phase 1–5 from the Hackathon Guide · Predictive Scaling vs Reactive · Cost Killer · Self-Healing
            </p>
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.5)', border: `1px solid ${isLive ? C.green : C.border}`, borderRadius: 12, padding: 4, gap: 4 }}>
             <button onClick={() => setIsLive(false)} style={{
                padding       : '10px 22px',
                borderRadius  : 9,
                border        : 'none',
                cursor        : 'pointer',
                fontFamily    : 'inherit',
                fontWeight    : 700,
                fontSize      : 13,
                transition    : 'all 0.2s',
                background    : !isLive ? 'rgba(255,255,255,0.10)' : 'transparent',
                color         : !isLive ? '#fff' : C.muted,
              }}>
                Mock Simulation
              </button>
              <button onClick={() => setIsLive(true)} style={{
                padding       : '10px 22px',
                borderRadius  : 9,
                border        : 'none',
                cursor        : 'pointer',
                fontFamily    : 'inherit',
                fontWeight    : 700,
                fontSize      : 13,
                transition    : 'all 0.2s',
                background    : isLive ? 'linear-gradient(135deg,#059669,#10b981)' : 'transparent',
                color         : isLive ? '#fff' : C.muted,
                boxShadow     : isLive ? '0 0 20px rgba(16,185,129,0.35)' : 'none',
              }}>
                ● Live Cluster Mode
              </button>
          </div>
        </div>

        {/* ── Traffic controls strip ── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => setTrafficMode('normal')}
            style={{ padding: '9px 20px', borderRadius: 9, border: `1px solid ${trafficMode === 'normal' ? C.accent : C.border}`, background: trafficMode === 'normal' ? 'rgba(79,172,254,0.12)' : 'transparent', color: trafficMode === 'normal' ? C.accent : C.muted, fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Base Load
          </button>
          <button
            onClick={() => setTrafficMode('spiking')}
            style={{ padding: '9px 20px', borderRadius: 9, border: `1px solid ${trafficMode === 'spiking' ? C.red : C.border}`, background: trafficMode === 'spiking' ? 'rgba(248,113,113,0.15)' : 'transparent', color: trafficMode === 'spiking' ? C.red : C.muted, fontFamily: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            🔥 Trigger Spike
          </button>
          {trafficMode === 'spiking' && (
            <span style={{ alignSelf: 'center', fontSize: 12, color: C.red, fontWeight: 600 }}>
              Traffic surge active → {Math.round(cur.load)} req/s
            </span>
          )}
        </div>

        {/* ── 3-column grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 380px', gap: 16 }}>

          {/* ─ Col 1: Traffic chart ─ */}
          <div style={{ ...card, gridColumn: '1 / 3' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <div style={label}>Total HTTP Traffic</div>
                <div style={bigNum}>{Math.round(cur.load)} <span style={{ fontSize: 14, fontWeight: 400, color: C.muted }}>req/s</span></div>
              </div>
              {mode === 'predictive' && (
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: C.muted, alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 18, height: 2, background: C.accent, display: 'inline-block', borderRadius: 2 }} />
                    Actual Load
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 18, height: 2, background: C.purple, display: 'inline-block', borderRadius: 2, borderTop: '2px dashed' }} />
                    AI Predicted +10s
                  </span>
                </div>
              )}
            </div>
            <LineChart
              history   = {history}
              dataKey   = "load"
              color     = {C.accent}
              extraKey  = {mode === 'predictive' ? 'predicted' : null}
              extraColor= {C.purple}
              height    = {160}
            />
          </div>

          {/* ─ Col 3 (right sidebar) top: Cost Killer ─ */}
          <div style={{ ...card, background: 'rgba(5,25,15,0.85)', border: `1px solid rgba(74,222,128,0.18)`, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, background: 'radial-gradient(circle, rgba(74,222,128,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ ...label, color: '#4ade80' }}>💸 Cost Killer (CD-3)</div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Session Compute Cost</div>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', color: C.text }}>
                ${isNaN(stats.totalCost) ? '0.000000' : stats.totalCost.toFixed(6)}
              </div>
            </div>
            <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: '#86efac', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>AI Cost Savings</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', color: '#4ade80' }}>
                +${isNaN(stats.costSaved) ? '0.000000' : stats.costSaved.toFixed(6)}
              </div>
              <div style={{ fontSize: 11, color: '#86efac', marginTop: 8, lineHeight: 1.7 }}>
                {mode === 'predictive'
                  ? 'AI scales down idle pods immediately after spike, saving compute cost.'
                  : 'Enable AI mode to see savings vs reactive scale-down delays.'}
              </div>
            </div>
          </div>

          {/* ─ Col 1: CPU chart ─ */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={label}>Average CPU Usage</div>
              <span style={{ fontSize: 13, fontWeight: 700, color: cpuColor }}>{cur.cpu > 100 ? '⚠ OVERLOAD' : 'Nominal'}</span>
            </div>
            <div style={{ ...bigNum, color: cpuColor }}>{Math.round(cur.cpu)}<span style={{ fontSize: 14, fontWeight: 400, color: C.muted }}>%</span></div>
            <LineChart history={history} dataKey="cpu" color={cpuColor} height={90} dangerAt={85} />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8, textAlign: 'right' }}>Scale-up threshold: 85%</div>
          </div>

          {/* ─ Col 2: Replicas chart ─ */}
          <div style={card}>
            <div style={label}>Active Replicas</div>
            <div style={bigNum}>{cur.replicas} <span style={{ fontSize: 14, fontWeight: 400, color: C.muted }}>Pods</span></div>
            <BarChart history={history} dataKey="replicas" color="rgba(167,139,250,0.6)" maxVal={10} height={90} />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8, textAlign: 'right' }}>Max limit: 10</div>
          </div>

          {/* ─ Col 3: Self-Healing Grid ─ */}
          <div style={card}>
            <div style={label}>🏥 Self-Healing Cluster (Phase 5)</div>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 16, lineHeight: 1.7 }}>
              Click any <span style={{ color: C.green, fontWeight: 700 }}>green</span> pod to crash it.
              The Self-Healer detects it and auto-restarts.
            </p>

            {/* Pod grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
              {Array(10).fill(0).map((_, i) => {
                const pod = pods[i]
                if (!pod) {
                  return (
                    <div key={i} style={{ aspectRatio: '1', borderRadius: 8, border: `1px solid rgba(255,255,255,0.05)`, background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'block' }} />
                    </div>
                  )
                }

                const isHealthy = pod.status === 'healthy'
                const isBooting = pod.status === 'booting'
                const isCrashed = pod.status === 'crashed'

                const podStyle = {
                  aspectRatio  : '1',
                  borderRadius : 8,
                  border       : `1px solid ${isCrashed ? C.red : isBooting ? C.yellow : 'rgba(74,222,128,0.5)'}`,
                  background   : isCrashed
                    ? 'rgba(248,113,113,0.15)'
                    : isBooting ? 'rgba(251,191,36,0.10)' : 'rgba(74,222,128,0.08)',
                  display      : 'flex',
                  alignItems   : 'center',
                  justifyContent: 'center',
                  cursor       : isHealthy ? 'pointer' : 'default',
                  fontSize     : 14,
                  fontWeight   : 900,
                  color        : isCrashed ? C.red : isBooting ? C.yellow : C.green,
                  boxShadow    : isCrashed ? `0 0 12px rgba(248,113,113,0.3)` : isBooting ? `0 0 8px rgba(251,191,36,0.2)` : 'none',
                  transition   : 'all 0.25s',
                }

                return (
                  <div
                    key={pod.id}
                    style={podStyle}
                    onClick={() => {
                      if (!isHealthy) return
                      setPods(pods.map(p => p.id === pod.id ? { ...p, status: 'crashed', age: 0 } : p))
                    }}
                    title={`Pod ${i + 1} — ${pod.status}`}
                  >
                    {isCrashed ? '✕' : isBooting ? '⟳' : '✓'}
                  </div>
                )
              })}
            </div>

            {/* Pod legend */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.border}`, paddingTop: 12, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
              <span style={{ color: C.green }}>✓ {healthyPods} Healthy</span>
              <span style={{ color: C.yellow }}>⟳ {bootingPods} Booting</span>
              <span style={{ color: C.red }}>✕ {crashedPods} Failed</span>
            </div>
          </div>

        </div>

        {/* ── Bottom: Phase indicator bar ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginTop: 16 }}>
          {[
            { phase: 1, label: 'K8s Infra',       icon: '🏗',  active: true },
            { phase: 2, label: 'Prometheus/Grafana', icon: '📊', active: true },
            { phase: 3, label: 'Load Generator',  icon: '🌊',  active: trafficMode === 'spiking' },
            { phase: 4, label: 'AI LSTM Scaler',  icon: '🤖',  active: mode === 'predictive' },
            { phase: 5, label: 'Self-Healing',    icon: '🏥',  active: crashedPods > 0 || bootingPods > 0 },
          ].map(p => (
            <div key={p.phase} style={{
              ...card,
              padding      : '12px 16px',
              border       : `1px solid ${p.active ? C.borderBr : C.border}`,
              background   : p.active ? 'rgba(79,172,254,0.06)' : C.surface,
              display      : 'flex',
              alignItems   : 'center',
              gap          : 10,
            }}>
              <span style={{ fontSize: 20 }}>{p.icon}</span>
              <div>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Phase {p.phase}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: p.active ? C.accent : C.text }}>{p.label}</div>
              </div>
              <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: p.active ? C.green : 'rgba(255,255,255,0.15)', boxShadow: p.active ? `0 0 8px ${C.green}` : 'none' }} />
            </div>
          ))}
        </div>

      </div>

      {/* Keyframe for pulse (injected via style tag) */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}
