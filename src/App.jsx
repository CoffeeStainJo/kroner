import React, { useState, useEffect, useRef, useMemo } from 'react';

/* ----------------------------------------------------------------------------
   Boliglån — mortgage paydown, equity & LTV dashboard
   Nordic "fjord at night / aurora" dark theme. iPhone-first, scales to desktop.
   All numbers formatted nb-NO (space thousands, comma decimals).
---------------------------------------------------------------------------- */

/* ---------- formatting helpers ---------- */
const nf0 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const kr = (n) => nf0.format(Math.round(n || 0)) + ' kr';
const krShort = (n) => nf1.format((n || 0) / 1e6) + ' M';
const mnok = (n) => nf1.format((n || 0) / 1e6) + ' MNOK';
const pct = (n, d = 1) =>
  new Intl.NumberFormat('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0) + ' %';

const parseNum = (s) => {
  if (typeof s === 'number') return s;
  if (s == null) return 0;
  let c = String(s).replace(/[\s\u00A0\u202F]/g, '').replace(/kr/gi, '').replace(/%/g, '').replace(/−/g, '-');
  if (c.includes(',')) c = c.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(c);
  return isFinite(n) ? n : 0;
};

const fmtMonthYear = (d) =>
  new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric' }).format(d);

/* ---------- count-up hook (requestAnimationFrame, easeOutCubic) ---------- */
function useCountUp(target, dur = 950) {
  const [val, setVal] = useState(target || 0);
  const cur = useRef(target || 0);
  const raf = useRef(0);
  useEffect(() => {
    const from = cur.current;
    const to = target || 0;
    if (Math.abs(to - from) < 0.0001) { cur.current = to; setVal(to); return; }
    const start = performance.now();
    cancelAnimationFrame(raf.current);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      const c = from + (to - from) * e;
      cur.current = c; setVal(c);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, dur]);
  return val;
}

function Num({ value, format, dur, className, style }) {
  const v = useCountUp(value, dur);
  return <span className={className} style={style}>{format ? format(v) : Math.round(v)}</span>;
}

/* ---------- amortization simulation ---------- */
function simulate(balance, monthlyRate, payment, maxMonths = 1200) {
  const points = [{ m: 0, bal: balance }];
  let bal = balance, totalInterest = 0, m = 0;
  if (payment <= balance * monthlyRate || payment <= 0) {
    return { months: Infinity, totalInterest: Infinity, points, never: true };
  }
  while (bal > 0 && m < maxMonths) {
    const interest = bal * monthlyRate;
    let principal = payment - interest;
    bal -= principal;
    if (bal < 0) { principal += bal; bal = 0; }
    totalInterest += interest;
    m++;
    points.push({ m, bal });
  }
  return { months: m, totalInterest, points, never: false };
}

/* ---------- small UI atoms ---------- */
function Field({ label, value, onChange, suffix, hint }) {
  return (
    <label className="fld">
      <span className="fld-label">{label}</span>
      <span className="fld-box">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
        {suffix && <span className="fld-suffix">{suffix}</span>}
      </span>
      {hint && <span className="fld-hint">{hint}</span>}
    </label>
  );
}

function Tile({ label, children, accent, sub }) {
  return (
    <div className="tile" style={accent ? { '--accent': accent } : undefined}>
      <span className="tile-bar" />
      <span className="tile-label">{label}</span>
      <span className="tile-value">{children}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}

/* ============================================================ MAIN */
export default function BoliglanDashboard() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
  });
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New content is available, notify user
                if (confirm('New version available! Would you like to update?')) {
                  window.location.reload();
                }
              }
            });
          });
        })
        .catch(error => console.log('Service worker registration failed:', error));
    }
  }, []);

  /* parsed values */
  const original = Math.abs(parseNum(f.original));
  const remaining = Math.abs(parseNum(f.remaining));
  const term = Math.abs(parseNum(f.term));
  const dueDay = Math.min(31, Math.max(1, Math.round(parseNum(f.dueDay)) || 1));
  const nominal = Math.abs(parseNum(f.nominal));
  const effective = Math.abs(parseNum(f.effective));
  const years = Math.abs(parseNum(f.years));
  const purchase = Math.abs(parseNum(f.purchase));
  const valMin = Math.abs(parseNum(f.valMin));
  const valMax = Math.abs(parseNum(f.valMax));

  /* derived */
  const paid = Math.max(0, original - remaining);
  const paidPct = original > 0 ? (paid / original) * 100 : 0;
  const remainPct = 100 - paidPct;

  const mRate = nominal / 100 / 12;
  const interestNow = remaining * mRate;
  const principalNow = Math.max(0, term - interestNow);

  const equityMin = valMin - remaining;
  const equityMax = valMax - remaining;
  const apprMin = valMin - purchase;
  const apprMax = valMax - purchase;
  const apprMinPct = purchase > 0 ? (apprMin / purchase) * 100 : 0;
  const apprMaxPct = purchase > 0 ? (apprMax / purchase) * 100 : 0;

  const ltvLow = valMax > 0 ? (remaining / valMax) * 100 : 0;   // best case (higher value)
  const ltvHigh = valMin > 0 ? (remaining / valMin) * 100 : 0;  // worst case (lower value)
  const ltvPurchase = purchase > 0 ? (remaining / purchase) * 100 : 0;

  const sim = useMemo(() => simulate(remaining, mRate, term), [remaining, mRate, term]);
  const monthsLeft = sim.never ? Infinity : sim.months;
  const yearsLeft = monthsLeft / 12;
  const payoffDate = useMemo(() => {
    if (!isFinite(monthsLeft)) return null;
    const d = new Date();
    d.setMonth(d.getMonth() + monthsLeft);
    return d;
  }, [monthsLeft]);

  /* next payment */
  const nextPay = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let next = new Date(today.getFullYear(), today.getMonth(), dueDay);
    if (next < today) next = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
    return { days: Math.round((next - today) / 86400000), date: next };
  }, [dueDay]);

  /* radial progress geometry */
  const R = 84, STROKE = 14, C = 2 * Math.PI * R;
  const paidPctA = useCountUp(paidPct, 1100);
  const dashOffset = C * (1 - Math.min(100, Math.max(0, paidPctA)) / 100);

  /* equity bar scaling */
  const scaleMax = Math.max(valMax, valMin, remaining, purchase, 1);
  const w = (v) => (Math.max(0, v) / scaleMax) * 100;
  const loanW = w(Math.min(remaining, scaleMax));
  const eqConfW = Math.max(0, w(valMin) - w(remaining));
  const eqUpW = Math.max(0, w(valMax) - w(valMin));
  const underwater = remaining > valMin;

  /* LTV gauge scaling */
  const ltvScale = Math.max(100, ltvHigh + 6);
  const g = (v) => (v / ltvScale) * 100;

  return (
    <div className="boliglan">
      <style>{CSS}</style>

      <div className="bg-aurora" />
      <div className="bg-grain" />

      <div className="wrap">
        {/* ---------------- header ---------------- */}
        <header className="head">
          <div className="head-left">
            <div className="head-mark" />
            <div>
              <h1>Boliglån</h1>
              <p>Nedbetaling · egenkapital · belåningsgrad</p>
            </div>
          </div>
          <button className="btn-edit" onClick={() => setOpen((o) => !o)}>
            {open ? 'Lukk' : 'Rediger tall'}
          </button>
        </header>

        <div className="next-chip">
          <span className="dot" />
          Neste termin · den {dueDay}. ·{' '}
          <strong>{nextPay.days === 0 ? 'i dag' : `om ${nextPay.days} ${nextPay.days === 1 ? 'dag' : 'dager'}`}</strong>
          <span className="next-amt">{kr(term)}</span>
        </div>

        {/* ---------------- inputs ---------------- */}
        <div className={`inputs ${open ? 'inputs-open' : ''}`}>
          <div className="inputs-inner">
            <div className="input-group">
              <h3>Lånet</h3>
              <div className="grid-fields">
                <Field label="Opprinnelig lån" value={f.original} onChange={set('original')} suffix="kr" />
                <Field label="Restgjeld" value={f.remaining} onChange={set('remaining')} suffix="kr" />
                <Field label="Terminbeløp" value={f.term} onChange={set('term')} suffix="kr" />
                <Field label="Forfallsdag" value={f.dueDay} onChange={set('dueDay')} suffix="i mnd." />
                <Field label="Nominell rente" value={f.nominal} onChange={set('nominal')} suffix="%" />
                <Field label="Effektiv rente" value={f.effective} onChange={set('effective')} suffix="%" />
                <Field label="Nedbetalingstid" value={f.years} onChange={set('years')} suffix="år" />
              </div>
            </div>
            <div className="input-group">
              <h3>Boligen</h3>
              <div className="grid-fields">
                <Field label="Kjøpesum" value={f.purchase} onChange={set('purchase')} suffix="kr" />
                <Field label="Estimert verdi — min." value={f.valMin} onChange={set('valMin')} suffix="kr" />
                <Field label="Estimert verdi — maks." value={f.valMax} onChange={set('valMax')} suffix="kr" />
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- hero: paydown ---------------- */}
        <section className="panel hero">
          <div className="hero-ring">
            <svg viewBox="0 0 220 220" className="ring-svg">
              <defs>
                <linearGradient id="aurora" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#43e0a0" />
                  <stop offset="48%" stopColor="#3ec7c7" />
                  <stop offset="100%" stopColor="#7c8cff" />
                </linearGradient>
              </defs>
              <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={STROKE} />
              <circle
                cx="110" cy="110" r={R} fill="none"
                stroke="url(#aurora)" strokeWidth={STROKE} strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={dashOffset}
                transform="rotate(-90 110 110)"
                style={{ filter: 'drop-shadow(0 0 9px rgba(67,224,160,.45))' }}
              />
            </svg>
            <div className="ring-center">
              <span className="ring-eyebrow">Nedbetalt</span>
              <span className="ring-pct"><Num value={paidPct} format={(v) => pct(v, 1)} dur={1100} /></span>
              <span className="ring-amt"><Num value={paid} format={kr} /></span>
            </div>
          </div>

          <div className="hero-stats">
            <div className="hs">
              <span className="hs-label">Opprinnelig lån</span>
              <span className="hs-val"><Num value={original} format={kr} /></span>
            </div>
            <div className="hs">
              <span className="hs-label">Restgjeld</span>
              <span className="hs-val accent-loan"><Num value={remaining} format={kr} /></span>
              <span className="hs-sub">{pct(remainPct, 1)} igjen</span>
            </div>
            <div className="hs-track">
              <div className="hs-track-fill" style={{ width: `${Math.min(100, paidPct)}%` }} />
            </div>
            <div className="hero-foot">
              <span><strong className="accent-eq">{pct(paidPct, 1)}</strong> nedbetalt</span>
              <span><strong className="accent-loan">{pct(remainPct, 1)}</strong> gjenstår</span>
            </div>
          </div>
        </section>

        <div className="cards">
          {/* ---------------- equity vs loan ---------------- */}
          <section className="panel span-all">
            <div className="panel-head">
              <h2>Boligverdi mot gjeld</h2>
              <span className="panel-tag">Egenkapital {mnok(equityMin)} – {mnok(equityMax)}</span>
            </div>

            <div className="eqbar">
              {!underwater && <div className="eqbar-seg seg-loan" style={{ width: `${loanW}%` }} />}
              {underwater && <div className="eqbar-seg seg-under" style={{ width: `${loanW}%` }} />}
              <div className="eqbar-seg seg-eq" style={{ width: `${eqConfW}%` }} />
              <div className="eqbar-seg seg-up" style={{ width: `${eqUpW}%` }} />

              {/* purchase price marker */}
              <div className="eqbar-tick" style={{ left: `${w(purchase)}%` }}>
                <span className="tick-label">Kjøpt {mnok(purchase)}</span>
              </div>
              {/* value range markers */}
              <div className="eqbar-tick tick-soft" style={{ left: `${w(valMin)}%` }}>
                <span className="tick-label down">{mnok(valMin)}</span>
              </div>
              <div className="eqbar-tick tick-soft" style={{ left: `${w(valMax)}%` }}>
                <span className="tick-label down">{mnok(valMax)}</span>
              </div>
            </div>

            <div className="legend">
              <span><i className="sw sw-loan" /> Restgjeld · {kr(remaining)}</span>
              <span><i className="sw sw-eq" /> Sikker egenkapital · {kr(Math.max(0, equityMin))}</span>
              <span><i className="sw sw-up" /> Mulig oppside · {kr(Math.max(0, equityMax - Math.max(equityMin, 0)))}</span>
            </div>
          </section>

          {/* ---------------- LTV gauge ---------------- */}
          <section className="panel">
            <div className="panel-head">
              <h2>Belåningsgrad</h2>
              <span className="panel-tag">LTV</span>
            </div>

            <div className="ltv-readout">
              <Num value={ltvLow} format={(v) => pct(v, 1)} dur={900} />
              <span className="ltv-dash">–</span>
              <Num value={ltvHigh} format={(v) => pct(v, 1)} dur={900} />
            </div>
            <p className="ltv-cap">ved verdi {mnok(valMax)} → {mnok(valMin)}</p>

            <div className="gauge">
              <div className="gauge-zone z1" style={{ left: '0%', width: `${g(60)}%` }} />
              <div className="gauge-zone z2" style={{ left: `${g(60)}%`, width: `${g(75) - g(60)}%` }} />
              <div className="gauge-zone z3" style={{ left: `${g(75)}%`, width: `${g(85) - g(75)}%` }} />
              <div className="gauge-zone z4" style={{ left: `${g(85)}%`, width: `${100 - g(85)}%` }} />

              <div className="gauge-band" style={{ left: `${g(ltvLow)}%`, width: `${Math.max(0.5, g(ltvHigh) - g(ltvLow))}%` }} />

              <div className="gauge-limit" style={{ left: `${g(85)}%` }}>
                <span>85 % grense</span>
              </div>
              <div className="gauge-mark mark-vs" style={{ left: `${g(ltvPurchase)}%` }} title="mot kjøpesum" />
            </div>

            <div className="gauge-scale">
              <span>0</span><span>60</span><span>75</span><span>85</span><span>{Math.round(ltvScale)}</span>
            </div>
            <p className="ltv-note">Stiplet markør = {pct(ltvPurchase, 1)} mot kjøpesum</p>
          </section>

          {/* ---------------- payment breakdown ---------------- */}
          <section className="panel">
            <div className="panel-head">
              <h2>Terminen din</h2>
              <span className="panel-tag">per måned</span>
            </div>

            <div className="pay">
              <div className="pay-donut">
                <svg viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="13" />
                  {term > 0 && (
                    <>
                      <circle cx="60" cy="60" r="46" fill="none" stroke="#7c8cff" strokeWidth="13"
                        strokeDasharray={`${(2 * Math.PI * 46) * (interestNow / term)} ${2 * Math.PI * 46}`}
                        transform="rotate(-90 60 60)" strokeLinecap="butt" />
                      <circle cx="60" cy="60" r="46" fill="none" stroke="#43e0a0" strokeWidth="13"
                        strokeDasharray={`${(2 * Math.PI * 46) * (principalNow / term)} ${2 * Math.PI * 46}`}
                        strokeDashoffset={`${-(2 * Math.PI * 46) * (interestNow / term)}`}
                        transform="rotate(-90 60 60)" strokeLinecap="butt" />
                    </>
                  )}
                  <text x="60" y="56" textAnchor="middle" className="donut-num">{nf0.format(Math.round(term))}</text>
                  <text x="60" y="72" textAnchor="middle" className="donut-unit">kr / mnd</text>
                </svg>
              </div>
              <div className="pay-rows">
                <div className="pay-row">
                  <span><i className="sw" style={{ background: '#7c8cff' }} /> Renter</span>
                  <span className="pay-amt">{kr(interestNow)}</span>
                  <span className="pay-pct">{pct(term > 0 ? (interestNow / term) * 100 : 0, 0)}</span>
                </div>
                <div className="pay-row">
                  <span><i className="sw" style={{ background: '#43e0a0' }} /> Avdrag</span>
                  <span className="pay-amt">{kr(principalNow)}</span>
                  <span className="pay-pct">{pct(term > 0 ? (principalNow / term) * 100 : 0, 0)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* ---------------- projection chart ---------------- */}
          <section className="panel span-all">
            <div className="panel-head">
              <h2>Restgjeld framover</h2>
              <span className="panel-tag">
                {sim.never ? 'betjener ikke renten' : `nedbetalt ~ ${payoffDate ? fmtMonthYear(payoffDate) : ''}`}
              </span>
            </div>
            <Projection sim={sim} balance0={remaining} />
            <div className="proj-foot">
              <span><strong>{sim.never ? '–' : `${nf1.format(yearsLeft)} år`}</strong> igjen est.</span>
              <span><strong>{sim.never ? '–' : kr(sim.totalInterest)}</strong> renter gjenstående est.</span>
            </div>
          </section>
        </div>

        {/* ---------------- tiles ---------------- */}
        <div className="tiles">
          <Tile label="Nedbetalt" accent="#43e0a0" sub={pct(paidPct, 1)}>
            <Num value={paid} format={kr} />
          </Tile>
          <Tile label="Restgjeld" accent="#7c8cff" sub={pct(remainPct, 1)}>
            <Num value={remaining} format={kr} />
          </Tile>
          <Tile label="Egenkapital" accent="#43e0a0" sub={`${mnok(equityMin)} – ${mnok(equityMax)}`}>
            <Num value={equityMin} format={kr} />
          </Tile>
          <Tile label="Verdistigning" accent="#f0b35b" sub={`${pct(apprMinPct, 1)} – ${pct(apprMaxPct, 1)}`}>
            <Num value={apprMin} format={kr} />
          </Tile>
          <Tile label="Belåningsgrad" accent="#3ec7c7" sub="mot estimert verdi">
            {pct(ltvLow, 1)} – {pct(ltvHigh, 1)}
          </Tile>
          <Tile label="Renter denne mnd." accent="#7c8cff" sub="av terminbeløpet">
            <Num value={interestNow} format={kr} />
          </Tile>
          <Tile label="Avdrag denne mnd." accent="#43e0a0" sub="reell nedbetaling">
            <Num value={principalNow} format={kr} />
          </Tile>
          <Tile label="Rente eff. / nom." accent="#f0b35b" sub={`nedbetalingstid ${nf0.format(years)} år`}>
            {pct(effective, 2)} / {pct(nominal, 2)}
          </Tile>
        </div>

        <footer className="foot">
          Estimater regnes ut fra rentene og terminbeløpet du oppgir. Snakk med banken din for nøyaktige tall.
        </footer>
      </div>
    </div>
  );
}

/* ---------- projection sub-component (hand-rolled SVG area chart) ---------- */
function Projection({ sim, balance0 }) {
  const W = 720, H = 230, padL = 8, padR = 8, padT = 14, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const { path, area, dots } = useMemo(() => {
    if (sim.never || !isFinite(sim.months) || sim.months <= 0 || balance0 <= 0) {
      return { path: '', area: '', dots: null };
    }
    const pts = sim.points;
    const step = Math.max(1, Math.floor(pts.length / 120));
    const sampled = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
    const X = (m) => padL + (m / sim.months) * innerW;
    const Y = (b) => padT + (1 - b / balance0) * innerH;
    let d = '';
    sampled.forEach((p, i) => { d += `${i === 0 ? 'M' : 'L'} ${X(p.m).toFixed(1)} ${Y(p.bal).toFixed(1)} `; });
    const a = d + `L ${X(sim.months).toFixed(1)} ${padT + innerH} L ${padL} ${padT + innerH} Z`;
    return {
      path: d, area: a,
      dots: { x0: padL, y0: Y(balance0), x1: X(sim.months), y1: padT + innerH },
    };
  }, [sim, balance0]);

  const grid = [0.25, 0.5, 0.75, 1].map((g) => ({
    y: padT + g * innerH,
    val: balance0 * (1 - g),
  }));

  return (
    <div className="proj">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="proj-svg">
        <defs>
          <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(124,140,255,.42)" />
            <stop offset="100%" stopColor="rgba(124,140,255,0)" />
          </linearGradient>
          <linearGradient id="projLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7c8cff" />
            <stop offset="100%" stopColor="#43e0a0" />
          </linearGradient>
        </defs>

        {grid.map((g, i) => (
          <g key={i}>
            <line x1={padL} y1={g.y} x2={W - padR} y2={g.y} stroke="rgba(255,255,255,.05)" strokeWidth="1" />
          </g>
        ))}

        {area && <path d={area} fill="url(#projFill)" />}
        {path && <path d={path} fill="none" stroke="url(#projLine)" strokeWidth="2.5" strokeLinejoin="round" />}

        {dots && (
          <>
            <circle cx={dots.x0} cy={dots.y0} r="4.5" fill="#7c8cff" stroke="#0a1016" strokeWidth="2" />
            <circle cx={dots.x1} cy={dots.y1} r="4.5" fill="#43e0a0" stroke="#0a1016" strokeWidth="2" />
          </>
        )}
      </svg>

      <div className="proj-grid-labels">
        {grid.map((g, i) => (
          <span key={i} style={{ top: `${(g.y / H) * 100}%` }}>{mnok(g.val)}</span>
        ))}
      </div>

      <div className="proj-x">
        <span>i dag</span>
        <span>nedbetalt</span>
      </div>
    </div>
  );
}

/* ============================================================ STYLES */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');

html, body, #root {
  margin: 0;
  padding: 0;
  min-height: 100%;
  background: #070b10;
}

body {
  overflow-x: hidden;
}

.boliglan{
  --bg:#070b10; --bg2:#0c131a;
  --ink:#e9f1ef; --ink2:#9fb0b3; --ink3:#647479;
  --eq:#43e0a0; --loan:#7c8cff; --teal:#3ec7c7; --gold:#f0b35b; --red:#f0708a;
  --line:rgba(255,255,255,.07);
  --panel:rgba(255,255,255,.025);
  position:relative; min-height:100vh; width:100%;
  background:var(--bg); color:var(--ink);
  font-family:'Hanken Grotesk',system-ui,sans-serif;
  font-feature-settings:'tnum' 1; -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}
.boliglan *{ box-sizing:border-box; }
.boliglan .num,.boliglan input{ font-variant-numeric:tabular-nums; }

.bg-aurora{
  position:fixed; inset:0; pointer-events:none; z-index:0;
  background:
    radial-gradient(60% 40% at 18% -5%, rgba(67,224,160,.16), transparent 70%),
    radial-gradient(55% 45% at 88% 8%, rgba(124,140,255,.16), transparent 70%),
    radial-gradient(70% 50% at 50% 115%, rgba(62,199,199,.12), transparent 70%);
}
.bg-grain{
  position:fixed; inset:0; pointer-events:none; z-index:0; opacity:.05;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.wrap{
  position:relative; z-index:1;
  max-width:1120px; margin:0 auto;
  padding:calc(env(safe-area-inset-top) + 22px) 18px calc(env(safe-area-inset-bottom) + 40px);
  display:flex; flex-direction:column; gap:16px;
}

/* header */
.head{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
.head-left{ display:flex; align-items:center; gap:13px; }
.head-mark{
  width:11px; height:34px; border-radius:6px;
  background:linear-gradient(180deg,var(--eq),var(--teal) 55%,var(--loan));
  box-shadow:0 0 18px rgba(67,224,160,.4);
}
.head h1{ font-family:'Fraunces',serif; font-weight:500; font-size:clamp(26px,7vw,38px); margin:0; letter-spacing:-.01em; line-height:1; }
.head p{ margin:4px 0 0; color:var(--ink3); font-size:12.5px; letter-spacing:.02em; }
.btn-edit{
  background:rgba(255,255,255,.05); color:var(--ink);
  border:1px solid var(--line); border-radius:999px;
  padding:9px 17px; font-size:13px; font-weight:600; font-family:inherit;
  cursor:pointer; transition:.18s; min-height:42px;
}
.btn-edit:hover{ background:rgba(255,255,255,.1); border-color:rgba(255,255,255,.18); }

/* next payment chip */
.next-chip{
  display:flex; align-items:center; gap:9px; flex-wrap:wrap;
  font-size:13px; color:var(--ink2);
  background:var(--panel); border:1px solid var(--line);
  border-radius:14px; padding:11px 15px;
}
.next-chip strong{ color:var(--ink); }
.next-chip .dot{ width:8px; height:8px; border-radius:50%; background:var(--eq); box-shadow:0 0 10px var(--eq); animation:pulse 2.4s infinite; }
.next-amt{ margin-left:auto; color:var(--ink); font-weight:600; }
@keyframes pulse{ 0%,100%{ opacity:1 } 50%{ opacity:.35 } }

/* inputs */
.inputs{ display:grid; grid-template-rows:0fr; transition:grid-template-rows .35s ease; }
.inputs-open{ grid-template-rows:1fr; }
.inputs-inner{ overflow:hidden; }
.inputs-open .inputs-inner{
  padding:18px; margin-top:2px;
  background:var(--panel); border:1px solid var(--line); border-radius:18px;
  display:grid; gap:20px;
}
.input-group h3{ font-family:'Fraunces',serif; font-weight:500; font-size:16px; margin:0 0 12px; color:var(--ink); }
.grid-fields{ display:grid; grid-template-columns:1fr 1fr; gap:11px; }
.fld{ display:flex; flex-direction:column; gap:6px; }
.fld-label{ font-size:11px; letter-spacing:.04em; text-transform:uppercase; color:var(--ink3); }
.fld-box{ display:flex; align-items:center; background:rgba(0,0,0,.25); border:1px solid var(--line); border-radius:11px; padding:0 12px; transition:.18s; min-height:46px; }
.fld-box:focus-within{ border-color:rgba(67,224,160,.5); box-shadow:0 0 0 3px rgba(67,224,160,.1); }
.fld-box input{ flex:1; width:100%; background:none; border:none; outline:none; color:var(--ink); font:600 15px 'Hanken Grotesk',sans-serif; padding:11px 0; }
.fld-suffix{ color:var(--ink3); font-size:12.5px; padding-left:8px; white-space:nowrap; }

/* panels */
.panel{
  background:var(--panel); border:1px solid var(--line); border-radius:20px;
  padding:20px; backdrop-filter:blur(8px);
  animation:rise .5s ease both;
}
.panel-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:16px; }
.panel-head h2{ font-family:'Fraunces',serif; font-weight:500; font-size:18px; margin:0; letter-spacing:-.01em; }
.panel-tag{ font-size:11px; letter-spacing:.04em; text-transform:uppercase; color:var(--ink3); background:rgba(255,255,255,.04); border:1px solid var(--line); border-radius:999px; padding:4px 10px; }
@keyframes rise{ from{ opacity:0; transform:translateY(10px) } to{ opacity:1; transform:none } }

/* hero */
.hero{ display:flex; flex-direction:column; align-items:center; gap:24px; }
.hero-ring{ position:relative; width:min(220px,62vw); aspect-ratio:1; }
.ring-svg{ width:100%; height:100%; transform:rotate(0); }
.ring-svg circle{ transition:stroke-dashoffset .2s linear; }
.ring-center{ position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; }
.ring-eyebrow{ font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink3); }
.ring-pct{ font-family:'Fraunces',serif; font-weight:500; font-size:clamp(30px,9vw,42px); line-height:1; background:linear-gradient(120deg,var(--eq),var(--teal),var(--loan)); -webkit-background-clip:text; background-clip:text; color:transparent; }
.ring-amt{ font-size:13.5px; color:var(--ink2); font-weight:600; margin-top:2px; }

.hero-stats{ width:100%; max-width:380px; display:flex; flex-direction:column; gap:14px; }
.hs{ display:flex; flex-direction:column; gap:2px; }
.hs-label{ font-size:12px; color:var(--ink3); }
.hs-val{ font-size:21px; font-weight:600; letter-spacing:-.01em; }
.hs-sub{ font-size:12px; color:var(--ink2); }
.hs-track{ height:9px; border-radius:99px; background:rgba(255,255,255,.06); overflow:hidden; }
.hs-track-fill{ height:100%; border-radius:99px; background:linear-gradient(90deg,var(--eq),var(--teal)); box-shadow:0 0 12px rgba(67,224,160,.5); transition:width 1s cubic-bezier(.22,1,.36,1); }
.hero-foot{ display:flex; justify-content:space-between; font-size:12.5px; color:var(--ink2); }
.accent-eq{ color:var(--eq); } .accent-loan{ color:var(--loan); }

/* cards grid */
.cards{ display:grid; grid-template-columns:1fr; gap:16px; }
.span-all{ grid-column:1 / -1; }

/* equity bar */
.eqbar{ position:relative; height:60px; border-radius:13px; overflow:visible; display:flex; background:rgba(255,255,255,.03); margin:30px 0 6px; }
.eqbar-seg{ height:100%; transition:width .9s cubic-bezier(.22,1,.36,1); }
.eqbar-seg:first-child{ border-radius:13px 0 0 13px; }
.seg-loan{ background:linear-gradient(180deg,#8e9bff,#6675f2); }
.seg-under{ background:linear-gradient(180deg,#f0708a,#d8546f); }
.seg-eq{ background:linear-gradient(180deg,#54ecaf,#33c98c); }
.seg-up{ background:repeating-linear-gradient(135deg,rgba(67,224,160,.42),rgba(67,224,160,.42) 7px,rgba(67,224,160,.2) 7px,rgba(67,224,160,.2) 14px); border-radius:0 13px 13px 0; }
.eqbar-tick{ position:absolute; top:-12px; bottom:-12px; width:2px; background:rgba(255,255,255,.5); }
.eqbar-tick.tick-soft{ background:rgba(255,255,255,.22); }
.tick-label{ position:absolute; top:-19px; left:50%; transform:translateX(-50%); white-space:nowrap; font-size:11px; font-weight:600; color:var(--ink); background:rgba(10,16,22,.85); padding:2px 7px; border-radius:6px; border:1px solid var(--line); }
.tick-label.down{ top:auto; bottom:-19px; color:var(--ink2); font-weight:500; }
.legend{ display:flex; flex-wrap:wrap; gap:7px 16px; margin-top:22px; font-size:12px; color:var(--ink2); }
.legend span{ display:flex; align-items:center; gap:7px; }
.sw{ width:11px; height:11px; border-radius:3px; display:inline-block; }
.sw-loan{ background:#6675f2; } .sw-eq{ background:#33c98c; }
.sw-up{ background:repeating-linear-gradient(135deg,rgba(67,224,160,.6),rgba(67,224,160,.6) 3px,rgba(67,224,160,.25) 3px,rgba(67,224,160,.25) 6px); }

/* LTV */
.ltv-readout{ font-family:'Fraunces',serif; font-weight:500; font-size:clamp(28px,8vw,40px); line-height:1; display:flex; align-items:baseline; gap:10px; }
.ltv-dash{ color:var(--ink3); }
.ltv-cap{ margin:5px 0 18px; font-size:12px; color:var(--ink3); }
.gauge{ position:relative; height:22px; border-radius:99px; overflow:visible; background:rgba(0,0,0,.25); }
.gauge-zone{ position:absolute; top:0; bottom:0; }
.gauge-zone.z1{ background:rgba(67,224,160,.28); border-radius:99px 0 0 99px; }
.gauge-zone.z2{ background:rgba(62,199,199,.28); }
.gauge-zone.z3{ background:rgba(240,179,91,.3); }
.gauge-zone.z4{ background:rgba(240,112,138,.32); border-radius:0 99px 99px 0; }
.gauge-band{ position:absolute; top:-3px; bottom:-3px; background:linear-gradient(90deg,var(--eq),var(--teal)); border-radius:99px; box-shadow:0 0 14px rgba(67,224,160,.6); border:1.5px solid rgba(255,255,255,.5); transition:left .9s cubic-bezier(.22,1,.36,1),width .9s cubic-bezier(.22,1,.36,1); }
.gauge-limit{ position:absolute; top:-7px; bottom:-7px; width:2px; background:rgba(255,255,255,.45); }
.gauge-limit span{ position:absolute; top:-17px; left:50%; transform:translateX(-50%); font-size:10px; color:var(--ink2); white-space:nowrap; }
.gauge-mark{ position:absolute; top:-5px; bottom:-5px; width:0; border-left:2px dashed rgba(255,255,255,.7); }
.gauge-scale{ display:flex; justify-content:space-between; margin-top:9px; font-size:10.5px; color:var(--ink3); }
.ltv-note{ margin:14px 0 0; font-size:11.5px; color:var(--ink3); }

/* payment */
.pay{ display:flex; align-items:center; gap:18px; }
.pay-donut{ width:120px; flex-shrink:0; }
.pay-donut svg{ width:100%; height:auto; }
.donut-num{ fill:var(--ink); font:600 19px 'Hanken Grotesk',sans-serif; }
.donut-unit{ fill:var(--ink3); font:500 9px 'Hanken Grotesk',sans-serif; letter-spacing:.05em; }
.pay-rows{ flex:1; display:flex; flex-direction:column; gap:13px; }
.pay-row{ display:grid; grid-template-columns:1fr auto; align-items:center; gap:2px 10px; }
.pay-row span:first-child{ display:flex; align-items:center; gap:8px; font-size:13px; color:var(--ink2); }
.pay-amt{ font-size:15px; font-weight:600; }
.pay-pct{ grid-column:2; font-size:11px; color:var(--ink3); text-align:right; }

/* projection */
.proj{ position:relative; }
.proj-svg{ width:100%; height:230px; display:block; }
.proj-grid-labels{ position:absolute; inset:0; pointer-events:none; }
.proj-grid-labels span{ position:absolute; right:4px; transform:translateY(-50%); font-size:10px; color:var(--ink3); background:rgba(7,11,16,.7); padding:0 4px; border-radius:4px; }
.proj-x{ display:flex; justify-content:space-between; font-size:11px; color:var(--ink3); margin-top:2px; }
.proj-foot{ display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-top:14px; font-size:13px; color:var(--ink2); }
.proj-foot strong{ color:var(--ink); }

/* tiles */
.tiles{ display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
.tile{ position:relative; background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:15px 15px 15px 17px; display:flex; flex-direction:column; gap:4px; overflow:hidden; animation:rise .5s ease both; }
.tile-bar{ position:absolute; left:0; top:14px; bottom:14px; width:3px; border-radius:0 3px 3px 0; background:var(--accent,var(--eq)); box-shadow:0 0 12px var(--accent,var(--eq)); }
.tile-label{ font-size:11px; letter-spacing:.03em; text-transform:uppercase; color:var(--ink3); }
.tile-value{ font-size:clamp(16px,4.6vw,20px); font-weight:600; letter-spacing:-.01em; }
.tile-sub{ font-size:11.5px; color:var(--ink2); }

.foot{ text-align:center; font-size:11px; color:var(--ink3); margin-top:6px; line-height:1.5; }

/* ---- larger screens ---- */
@media (min-width:760px){
  .hero{ flex-direction:row; align-items:center; justify-content:center; gap:54px; padding:34px; }
  .hero-ring{ width:230px; }
  .cards{ grid-template-columns:1fr 1fr; }
  .tiles{ grid-template-columns:repeat(4,1fr); }
  .grid-fields{ grid-template-columns:repeat(3,1fr); }
  .inputs-open .inputs-inner{ grid-template-columns:1fr; }
}
@media (min-width:980px){
  .wrap{ padding-left:28px; padding-right:28px; }
}
`;