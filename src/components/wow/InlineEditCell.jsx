import { useState, useRef, useEffect } from 'react';

export function InlineEditCell({ value, onSave, isPrimaryKey }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const isNull = value === 'NULL' || value === null || value === undefined;

  const handleDoubleClick = () => {
    if (isPrimaryKey) return;
    setEditValue(isNull ? '' : value);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditValue(value ?? '');
  };

  const handleSave = async () => {
    const newValue = editValue === '' ? null : editValue;
    const oldDisplay = isNull ? 'NULL' : value;
    const newDisplay = newValue === null ? 'NULL' : newValue;

    if (String(oldDisplay) === String(newDisplay)) {
      setEditing(false);
      return;
    }

    if (!confirm(`Update value from "${oldDisplay}" to "${newDisplay}"?`)) return;

    setSaving(true);
    const result = await onSave(newValue);
    setSaving(false);
    if (result?.success) {
      setEditing(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleCancel}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className="w-full px-1.5 py-0.5 bg-background border border-primary rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
      />
    );
  }

  return (
    <span
      onDoubleClick={handleDoubleClick}
      className={`block truncate ${isPrimaryKey ? 'text-primary font-medium' : 'cursor-pointer'} ${isNull ? 'italic text-muted-foreground/50' : ''}`}
      title={isPrimaryKey ? 'Primary key (not editable)' : 'Double-click to edit'}
    >
      {isNull ? 'NULL' : value}
    </span>
  );
}
