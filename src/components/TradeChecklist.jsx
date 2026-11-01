import { useState } from 'react';
import { TIER_COLORS, tierFromChecklist } from '../utils/stats';
import TierTrend from './TierTrend';
import InfoTooltip from './InfoTooltip';
import { useOffline } from '../hooks/useOffline';

export default function TradeChecklist({ entry, saveEntry, tierHistory, checklistTemplate }) {
  const { items, addItem, removeItem } = checklistTemplate;
  const [newItemText, setNewItemText] = useState('');
  const [editModeRaw, setEditMode] = useState(false);
  const offline = useOffline();
  const editMode = editModeRaw && !offline;

  const checklistState = entry.checklist || {};
  const checkedCount = items.filter((item) => !!checklistState[item.label]).length;
  const { tier, name } = tierFromChecklist(checkedCount, items.length);
  const pct = items.length ? (checkedCount / items.length) * 100 : 0;

  function toggle(label) {
    const nextState = { ...checklistState, [label]: !checklistState[label] };
    const nextCheckedCount = items.filter((item) => !!nextState[item.label]).length;
    saveEntry({ checklist: nextState, tierComputed: tierFromChecklist(nextCheckedCount, items.length).tier });
  }

  function handleAdd() {
    if (!newItemText.trim()) return;
    addItem(newItemText);
    setNewItemText('');
  }

  return (
    <div className="journal-col-divider">
      <span className="field-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>
          Trade Checklist
          <InfoTooltip text="The rules you hold yourself to on every trade. Add or remove items to match your own process — your Trade Quality tier below is calculated from how many you check off today." />
        </span>
        {!offline && (
          <button type="button" className="checklist-edit-toggle" onClick={() => setEditMode((v) => !v)}>
            {editMode ? 'Done' : 'Edit list'}
          </button>
        )}
      </span>

      <div className="checklist">
        {items.map((item) => (
          <div key={item.id} className={`check-item-row${checklistState[item.label] ? ' is-checked' : ''}`}>
            <label className="check-item">
              <input type="checkbox" checked={!!checklistState[item.label]} disabled={offline} onChange={() => toggle(item.label)} />
              {item.label}
            </label>
            {editMode && (
              <button type="button" className="checklist-remove-btn" onClick={() => removeItem(item.id)} title="Remove item">×</button>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '8px 0' }}>No checklist items yet — add your first one below.</p>
        )}
      </div>

      {editMode && (
        <div className="checklist-add-row">
          <input
            type="text"
            placeholder="Add a new checklist item…"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <button type="button" className="btn btn-ghost" onClick={handleAdd}>Add</button>
        </div>
      )}

      <span className="field-label">Trade Quality</span>
      <div className={`tier-card tier-${tier}`}>
        <div className="tier-letter">{tier}</div>
        <div className="tier-info">
          <div className="tier-name">{name}</div>
          <div className="tier-sub">{checkedCount} / {items.length} checks passed</div>
          <div className="tier-bar-track">
            <div className="tier-bar-fill" style={{ width: `${pct}%`, background: TIER_COLORS[tier] }} />
          </div>
        </div>
      </div>

      <TierTrend history={tierHistory} todayTier={tier} />
    </div>
  );
}
