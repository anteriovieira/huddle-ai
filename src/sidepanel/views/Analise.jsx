// Análise tab: a dashboard over the scored sessions (lib/scoring.js). Shows totals, a radar of the
// mean score per criterion, a scorecard grid, per-participant and per-session lists, and drill-down
// details for a participant or a session (with the AI's "o que melhorar" analysis). Reads the stored
// scores records; the current huddle can be scored on demand. Styling is inline on the app's CSS
// variables so it tracks the panel theme.

import { useMemo, useState } from 'react';
import { Icon } from '../ui/Icon.jsx';
import {
  CRITERIA,
  SCORE_MAX,
  aggregateScores,
  colorOf,
  bgOf,
  fmtScore,
  labelOf,
  meetingAverage,
  normalizeScores,
  participantDetail,
} from '../lib/scoring.js';

const MUTED = 'var(--muted)';
const STRONG = 'var(--text-strong)';
const SURFACE = 'var(--surface)';
const BORDER = 'var(--border)';

function card(extra) {
  return { border: `1px solid ${BORDER}`, borderRadius: 10, background: SURFACE, ...extra };
}

function sectionTitle(text, action) {
  return (
    <h3
      style={{
        margin: 0,
        padding: '8px 0',
        borderTop: `1px solid ${BORDER}`,
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        fontSize: 13,
        fontWeight: 900,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        color: STRONG,
      }}
    >
      <span>{text}</span>
      {action}
    </h3>
  );
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

function initials(name) {
  return (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// Deterministic avatar color from the name (same approach as lib/format colorFor, kept local).
const AVATAR_COLORS = ['#4a7dbf', '#8e9bf0', '#c799d6', '#cf7b4e', '#2bac76', '#1d9bd1', '#ecb22e'];
function avatarColor(name) {
  let h = 0;
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// --- Radar -------------------------------------------------------------------------------------
function Radar({ criteria, fill = '#2bac76' }) {
  const n = criteria.length;
  const cx = 180;
  const cy = 155;
  const R = 96;
  const labelR = 118;
  const pt = (r, i) => {
    const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const fmt = (pts) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const rings = [1, 2, 3].map((lvl) => fmt(criteria.map((_, i) => pt((R * lvl) / SCORE_MAX, i))));
  const valuePts = criteria.map((c, i) => pt((R * c.score) / SCORE_MAX, i));
  const ticks = [1, 2, 3].map((lvl) => ({ n: lvl, x: cx + 5, y: cy - (R * lvl) / SCORE_MAX - 3 }));
  const labels = criteria.map((c, i) => {
    const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
    const cos = Math.cos(a);
    const lx = cx + labelR * cos;
    const ly = cy + labelR * Math.sin(a);
    const anchor = cos > 0.2 ? 'start' : cos < -0.2 ? 'end' : 'middle';
    const w = 30;
    const rx = anchor === 'start' ? lx : anchor === 'end' ? lx - w : lx - w / 2;
    const tx = anchor === 'start' ? lx + w / 2 : anchor === 'end' ? lx - w / 2 : lx;
    return { label: c.label, score: fmtScore(c.score), color: colorOf(c.score), bg: bgOf(c.score), anchor, x: lx, ny: ly - 6, rx, ry: ly - 1, tx, ty: ly + 10 };
  });
  return (
    <svg viewBox="0 0 360 310" width="100%" role="img" aria-label="Radar de desempenho por critério" style={{ display: 'block' }}>
      {rings.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke="var(--border)" strokeWidth="1" />
      ))}
      {ticks.map((t) => (
        <text key={t.n} x={t.x} y={t.y} fill="var(--border-strong)" fontFamily="Lato, sans-serif" fontSize="9" fontWeight="700">
          {t.n}
        </text>
      ))}
      {criteria.map((_, i) => {
        const [x2, y2] = pt(R, i);
        return <line key={i} x1={cx} y1={cy} x2={x2} y2={y2} stroke="var(--surface-hover)" strokeWidth="1" />;
      })}
      <polygon points={fmt(valuePts)} fill={`${fill}29`} stroke={fill} strokeWidth="2" strokeLinejoin="round" />
      {valuePts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill={colorOf(criteria[i].score)} stroke="var(--surface)" strokeWidth="1.5" />
      ))}
      {labels.map((l, i) => (
        <g key={i}>
          <text x={l.x} y={l.ny} textAnchor={l.anchor} fill="var(--muted)" fontFamily="Lato, sans-serif" fontSize="10.5" fontWeight="700">
            {l.label}
          </text>
          <rect x={l.rx} y={l.ry} width="30" height="15" rx="7.5" fill={l.bg} />
          <text x={l.tx} y={l.ty} textAnchor="middle" fill={l.color} fontFamily="Lato, sans-serif" fontSize="10.5" fontWeight="900">
            {l.score}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ScoreRing({ score, size = 44, stroke = 4, label }) {
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const color = colorOf(score);
  const mid = size / 2;
  return (
    <span style={{ position: 'relative', width: size, height: size, flexShrink: 0, display: 'inline-block' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${((c * score) / SCORE_MAX).toFixed(1)} 999`}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
        <span style={{ fontSize: size > 48 ? 15 : 13, fontWeight: 900, color }}>{fmtScore(score)}</span>
        {label && <span style={{ fontSize: 9, color: MUTED }}>{label}</span>}
      </span>
    </span>
  );
}

function Scorecards({ criteria }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
      {criteria.map((c) => (
        <div key={c.id} style={card({ display: 'flex', flexDirection: 'column', gap: 8, padding: '11px 12px', borderRadius: 8 })}>
          <span style={{ fontSize: 12, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: colorOf(c.score), lineHeight: 1 }}>{fmtScore(c.score)}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>/{SCORE_MAX}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ScoreChip({ score, suffix = `/${SCORE_MAX}` }) {
  return (
    <span style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 999, fontSize: 13, fontWeight: 900, background: bgOf(score), color: colorOf(score) }}>
      {fmtScore(score)}
      {suffix}
    </span>
  );
}

function Improvements({ list }) {
  if (!list.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sectionTitle('O que melhorar')}
      {list.map((r, i) => {
        const score = null;
        const name = labelOf(r.criterion);
        return (
          <div key={i} style={card({ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--yellow)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: STRONG }}>{name}</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text)' }}>{r.analysis}</p>
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, background: 'var(--green-bg)' }}>
              <span style={{ color: 'var(--green)', flexShrink: 0, marginTop: 1, display: 'inline-flex' }} aria-hidden="true">
                <Icon name="bolt" />
              </span>
              <span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--text)' }}>
                <b style={{ color: 'var(--green)' }}>Ação:</b> {r.action}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Backbar({ title, onBack }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Voltar"
        style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 6, background: 'transparent', color: MUTED, cursor: 'pointer' }}
      >
        <Icon name="back" />
      </button>
      <span style={{ fontSize: 15, fontWeight: 900, color: STRONG }}>{title}</span>
    </div>
  );
}

// Score-per-session trend line (also used in the participant detail).
function TrendLine({ points }) {
  if (points.length < 2) return null;
  const x0 = 24;
  const x1 = 336;
  const yTop = 24;
  const yBot = 104;
  const xFor = (i) => x0 + ((x1 - x0) * i) / (points.length - 1);
  const yFor = (s) => yBot - ((s - 1) * (yBot - yTop)) / 2;
  const line = points.map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.score).toFixed(1)}`).join(' ');
  return (
    <div style={card({ padding: '14px 14px 10px' })}>
      <svg viewBox="0 0 360 140" width="100%" role="img" aria-label="Evolução do score por sessão" style={{ display: 'block' }}>
        {[yTop, (yTop + yBot) / 2, yBot].map((y, i) => (
          <line key={i} x1="14" y1={y} x2="346" y2={y} stroke="var(--surface-hover)" strokeWidth="1" />
        ))}
        {[3, 2, 1].map((n, i) => (
          <text key={n} x="4" y={[yTop, (yTop + yBot) / 2, yBot][i]} dominantBaseline="middle" fill="var(--border-strong)" fontSize="9">
            {n}
          </text>
        ))}
        <polyline points={line} fill="none" stroke="#4a7dbf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={xFor(i)} cy={yFor(p.score)} r="4" fill={colorOf(p.score)} stroke="var(--surface)" strokeWidth="2" />
            <text x={xFor(i)} y="126" textAnchor="middle" fill="var(--muted)" fontSize="9">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// --- Detail views ------------------------------------------------------------------------------
function ParticipantDetail({ records, name, onBack }) {
  const d = useMemo(() => participantDetail(records, name), [records, name]);
  const trend = d.sessions.slice().reverse().map((s) => ({ score: s.score, label: fmtDate(s.startedAt) }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Backbar title="Participante" onBack={onBack} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <span style={{ width: 52, height: 52, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, color: '#fff', fontWeight: 900, fontSize: 18, background: avatarColor(name) }}>
          {initials(name)}
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: STRONG }}>{name}</span>
          <span style={{ fontSize: 13, color: MUTED }}>{d.meetings} {d.meetings === 1 ? 'reunião' : 'reuniões'}</span>
        </div>
        <ScoreRing score={d.average} size={56} stroke={5} label={`de ${SCORE_MAX}`} />
      </div>
      {d.focus && (
        <div style={card({ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 })}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--yellow)' }}>
            <Icon name="bulb" />
            Foco de melhoria
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: STRONG }}>{labelOf(d.focus)}</span>
          {d.tip && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text)' }}>{d.tip}</p>}
        </div>
      )}
      {trend.length >= 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sectionTitle('Score por sessão')}
          <TrendLine points={trend} />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sectionTitle(`Sessões de ${name.split(/\s+/)[0]}`)}
        {d.sessions.map((s) => (
          <div key={s.huddleId} style={card({ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px' })}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: STRONG, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
              <span style={{ fontSize: 12, color: MUTED }}>{fmtDate(s.startedAt)}</span>
            </span>
            <ScoreChip score={s.score} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionDetail({ record, onBack, onOpenParticipant }) {
  const data = normalizeScores(record.data);
  const avg = meetingAverage(record.data);
  const meta = record.meta ?? {};
  const strengthLabels = data.strengths.map(labelOf);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Backbar title="Sessão" onBack={onBack} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: STRONG, lineHeight: 1.3 }}>{meta.title || 'Reunião'}</span>
          <span style={{ fontSize: 13, color: MUTED }}>
            {fmtDate(meta.startedAt ?? record.generatedAt ?? Date.now())} · {(meta.participants ?? []).length} pessoas
          </span>
        </div>
        <ScoreRing score={avg} size={56} stroke={5} label={`de ${SCORE_MAX}`} />
      </div>

      {data.summary && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text)' }}>{data.summary}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sectionTitle('Scores da reunião')}
        <div style={card({ padding: 14 })}>
          <Radar criteria={data.overall} />
        </div>
        <Scorecards criteria={data.overall} />
      </div>

      {strengthLabels.length > 0 && (
        <div style={card({ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '11px 12px' })}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>
            <Icon name="check" />
            Pontos fortes
          </span>
          {strengthLabels.map((l) => (
            <span key={l} style={{ padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: 'var(--green-bg)', color: 'var(--green)' }}>
              {l}
            </span>
          ))}
        </div>
      )}

      <Improvements list={data.improvements} />

      {data.participants.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sectionTitle('Por participante')}
          {data.participants.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => onOpenParticipant(p.name)}
              style={{ ...card({ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 12px', textAlign: 'left' }), cursor: 'pointer', color: 'inherit', font: 'inherit' }}
            >
              <span style={{ width: 32, height: 32, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: 12, background: avatarColor(p.name) }}>
                {initials(p.name)}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: STRONG }}>{p.name}</span>
                {p.focus && (
                  <span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--text)' }}>
                    <b style={{ color: colorOf(p.score) }}>Melhorar {labelOf(p.focus)}:</b> {p.tip}
                  </span>
                )}
              </span>
              <ScoreChip score={p.score} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Overview ----------------------------------------------------------------------------------
function Empty({ canScore, scoring, onScore, hasKey, onOpenSettings }) {
  return (
    <div style={{ padding: '40px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <span style={{ width: 64, height: 64, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 16, border: `1px solid ${BORDER}`, background: SURFACE, color: MUTED }}>
        <Icon name="sparkles" />
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 300 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: STRONG }}>Nenhuma reunião pontuada ainda</span>
        <span style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
          A análise pontua cada reunião por critério (direção, decisões, execução…), por participante e sugere o que melhorar.
        </span>
      </div>
      {!hasKey ? (
        <button type="button" className="button button--primary" onClick={onOpenSettings}>
          Configurar chave da API
        </button>
      ) : canScore ? (
        <button type="button" className="button button--primary" disabled={scoring} onClick={onScore}>
          {scoring ? 'Analisando…' : 'Pontuar esta reunião'}
        </button>
      ) : (
        <span style={{ fontSize: 13, color: MUTED }}>Abra uma reunião encerrada para pontuá-la.</span>
      )}
    </div>
  );
}

export function AnaliseView({
  records = [],
  currentScores = null,
  currentHuddleId = null,
  canScore = false,
  scoring = false,
  scoreError = null,
  hasKey = true,
  onScore,
  onOpenSettings,
}) {
  const [view, setView] = useState({ kind: 'overview' });
  const agg = useMemo(() => aggregateScores(records), [records]);
  const currentScored = currentHuddleId && records.some((r) => r.huddleId === currentHuddleId);

  if (view.kind === 'participant') {
    return <ParticipantDetail records={records} name={view.name} onBack={() => setView({ kind: 'overview' })} />;
  }
  if (view.kind === 'session') {
    const record = records.find((r) => r.huddleId === view.huddleId);
    if (record) {
      return (
        <SessionDetail
          record={record}
          onBack={() => setView({ kind: 'overview' })}
          onOpenParticipant={(name) => setView({ kind: 'participant', name })}
        />
      );
    }
  }

  if (!agg.count) {
    return <Empty canScore={canScore} scoring={scoring} onScore={onScore} hasKey={hasKey} onOpenSettings={onOpenSettings} />;
  }

  const pct = Math.round((agg.overall / SCORE_MAX) * 100);
  const trendStr = `${agg.trend >= 0 ? '+' : '−'}${Math.abs(agg.trend).toFixed(1).replace('.', ',')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Score current meeting CTA */}
      {canScore && !currentScored && (
        <button type="button" className="button button--primary button--block" disabled={scoring} onClick={onScore}>
          {scoring ? 'Analisando…' : 'Pontuar esta reunião'}
        </button>
      )}
      {scoreError && <div className="notice notice--error">{scoreError}</div>}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', background: BORDER }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '12px 13px', background: SURFACE }}>
          <span style={{ fontSize: 12, color: MUTED }}>Reuniões</span>
          <span style={{ fontSize: 24, fontWeight: 900, color: STRONG, lineHeight: 1 }}>{agg.count}</span>
          <span style={{ fontSize: 11, color: MUTED }}>pontuadas</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '12px 13px', background: SURFACE }}>
          <span style={{ fontSize: 12, color: MUTED }}>Score médio</span>
          <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--yellow)', lineHeight: 1 }}>
            {fmtScore(agg.overall)}
            <span style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>/{SCORE_MAX}</span>
          </span>
          <span style={{ fontSize: 11, color: MUTED }}>{pct}% do máximo</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '12px 13px', background: SURFACE }}>
          <span style={{ fontSize: 12, color: MUTED }}>Tendência</span>
          <span style={{ fontSize: 24, fontWeight: 900, color: agg.trend >= 0 ? 'var(--green)' : 'var(--danger)', lineHeight: 1 }}>{trendStr}</span>
          <span style={{ fontSize: 11, color: MUTED }}>vs. anteriores</span>
        </div>
      </div>

      {/* Radar */}
      <div style={card({ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 })}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: STRONG }}>Desempenho por critério</h3>
          <span style={{ fontSize: 12, fontWeight: 700, color: MUTED }}>0–{SCORE_MAX}</span>
        </div>
        <Radar criteria={agg.criteria} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4, borderTop: `1px solid ${BORDER}` }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--yellow)' }} />
          <span style={{ fontSize: 13, color: MUTED }}>Média geral</span>
          <span style={{ fontSize: 14, fontWeight: 900, color: STRONG }}>{fmtScore(agg.overall)}/{SCORE_MAX}</span>
          <span style={{ fontSize: 13, color: MUTED }}>({pct}%)</span>
        </div>
      </div>

      {/* Criteria grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sectionTitle('Scores por critério')}
        <Scorecards criteria={agg.criteria} />
      </div>

      {/* Participants */}
      {agg.participants.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sectionTitle('Score por participante')}
          {agg.participants.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => setView({ kind: 'participant', name: p.name })}
              style={{ ...card({ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', textAlign: 'left' }), cursor: 'pointer', color: 'inherit', font: 'inherit' }}
            >
              <span style={{ width: 36, height: 36, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: 13, background: avatarColor(p.name) }}>
                {initials(p.name)}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: STRONG, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                <span style={{ fontSize: 12, color: MUTED }}>
                  {p.meetings} {p.meetings === 1 ? 'reunião' : 'reuniões'}
                  {p.focus ? ` · melhorar ${labelOf(p.focus).toLowerCase()}` : ''}
                </span>
              </span>
              <ScoreRing score={p.average} />
            </button>
          ))}
        </div>
      )}

      {/* Sessions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sectionTitle('Sessões recentes')}
        {agg.sessions.map((s) => (
          <button
            key={s.huddleId}
            type="button"
            onClick={() => setView({ kind: 'session', huddleId: s.huddleId })}
            style={{ ...card({ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', textAlign: 'left' }), cursor: 'pointer', color: 'inherit', font: 'inherit' }}
          >
            <span style={{ width: 36, height: 36, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'var(--surface-hover)', color: MUTED }} aria-hidden="true">
              <Icon name="doc" />
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: STRONG, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
              <span style={{ fontSize: 12, color: MUTED }}>{fmtDate(s.startedAt)} · {s.participants.length} pessoas</span>
            </span>
            <ScoreChip score={s.average} />
            <span style={{ flexShrink: 0, color: 'var(--border-strong)', display: 'inline-flex' }} aria-hidden="true">
              <Icon name="chevron-down" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
