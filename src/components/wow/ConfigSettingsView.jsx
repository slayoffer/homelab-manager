import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, X, Plus, Info, RotateCcw, Trash2, Undo2 } from 'lucide-react';

const STATUS_COLORS = {
  new: 'border-l-2 border-l-emerald-500/60 bg-emerald-500/5',
  modified: 'border-l-2 border-l-amber-500/60 bg-amber-500/5',
  deprecated: 'border-l-2 border-l-red-500/60 bg-red-500/5',
  unchanged: 'border-l-2 border-l-transparent',
};

const STATUS_DOTS = {
  new: <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />,
  modified: <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />,
  deprecated: <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />,
};

const FILTERS = ['all', 'new', 'modified', 'deprecated', 'unchanged'];

function detectCommonPrefix(settings) {
  if (!settings || settings.length < 3) return '';
  const keys = settings.map(s => s.key);
  const parts0 = keys[0].split('.');
  if (parts0.length < 2) return '';
  for (let depth = parts0.length - 1; depth >= 1; depth--) {
    const prefix = parts0.slice(0, depth).join('.') + '.';
    const matchCount = keys.filter(k => k.startsWith(prefix)).length;
    if (matchCount / keys.length > 0.6) return prefix;
  }
  return '';
}

export function ConfigSettingsView({ diffData, editedValues, deletedKeys, onEditValue, onMergeNew, onResetToDefault, onDeleteKey, onUndoDelete }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingKey, setEditingKey] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);

  const filteredSettings = useMemo(() => {
    if (!diffData?.settings) return [];
    let result = diffData.settings;
    if (statusFilter !== 'all') result = result.filter(s => s.status === statusFilter);
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(s =>
        s.key.toLowerCase().includes(lower) ||
        (s.description && s.description.toLowerCase().includes(lower))
      );
    }
    const order = { new: 0, modified: 1, deprecated: 2, unchanged: 3 };
    return result.sort((a, b) => order[a.status] - order[b.status]);
  }, [diffData, search, statusFilter]);

  const counts = useMemo(() => {
    if (!diffData?.settings) return {};
    const c = { all: diffData.settings.length, new: 0, modified: 0, deprecated: 0, unchanged: 0 };
    for (const s of diffData.settings) c[s.status]++;
    return c;
  }, [diffData]);

  const commonPrefix = useMemo(() => detectCommonPrefix(diffData?.settings), [diffData]);

  const selectedSetting = useMemo(() => {
    if (!selectedKey || !diffData?.settings) return null;
    return diffData.settings.find(s => s.key === selectedKey) || null;
  }, [selectedKey, diffData]);

  const getCurrentValue = (setting) => {
    if (editedValues.has(setting.key)) return editedValues.get(setting.key);
    if (setting.confValue !== null) return setting.confValue;
    return setting.distValue || '';
  };

  const shortKey = (key) => {
    if (commonPrefix && key.startsWith(commonPrefix)) return key.slice(commonPrefix.length);
    return key;
  };

  if (!diffData) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-7 text-xs"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {FILTERS.map(f => (
            <Button
              key={f}
              variant={statusFilter === f ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 text-[11px] px-2 capitalize"
              onClick={() => setStatusFilter(f)}
            >
              {f}
              {counts[f] > 0 && <span className="ml-0.5 text-muted-foreground">({counts[f]})</span>}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          {counts.modified > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px]"
              onClick={() => {
                if (!confirm(`Reset all ${counts.modified} modified settings to their upstream defaults?`)) return;
                const modified = diffData.settings.filter(s => s.status === 'modified');
                for (const s of modified) onResetToDefault(s.key, s.distValue);
              }}
              title="Reset all modified settings to their .conf.dist default values"
            >
              <RotateCcw className="h-3 w-3 mr-0.5" />
              Reset {counts.modified} to defaults
            </Button>
          )}
          {counts.deprecated > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] text-red-400"
              onClick={() => {
                if (!confirm(`Remove all ${counts.deprecated} deprecated settings?`)) return;
                const deprecated = diffData.settings.filter(s => s.status === 'deprecated');
                for (const s of deprecated) onDeleteKey(s.key);
              }}
              title="Comment out all deprecated settings that no longer exist in .conf.dist"
            >
              <Trash2 className="h-3 w-3 mr-0.5" />
              Remove {counts.deprecated} deprecated
            </Button>
          )}
          {counts.new > 0 && (
            <Button
              size="sm"
              className="h-6 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={onMergeNew}
            >
              <Plus className="h-3 w-3 mr-0.5" />
              Accept {counts.new} new
            </Button>
          )}
        </div>
      </div>

      {/* Settings list + description panel side by side */}
      <div className="flex gap-3">
        {/* Settings list */}
        <ScrollArea className="flex-1 max-h-[calc(100vh-480px)] min-h-[300px]">
          <div className="space-y-px">
            {commonPrefix && (
              <div className="px-3 py-1 text-[10px] text-muted-foreground/50 font-mono">
                {commonPrefix}
              </div>
            )}
            {filteredSettings.map((setting, idx) => {
              const isEditing = editingKey === setting.key;
              const currentValue = getCurrentValue(setting);
              const isLocallyModified = editedValues.has(setting.key);
              const isDeleted = deletedKeys?.has(setting.key);
              const isSelected = selectedKey === setting.key;

              return (
                <div
                  key={setting.key}
                  onClick={() => setSelectedKey(setting.key)}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${STATUS_COLORS[setting.status]} ${
                    isSelected ? '!bg-primary/10' : idx % 2 === 0 ? '' : 'bg-white/[0.015]'
                  }`}
                >
                  {/* Status dot */}
                  <div className="w-3 flex justify-center">
                    {STATUS_DOTS[setting.status] || null}
                  </div>

                  {/* Setting name */}
                  <span className={`font-mono text-xs flex-1 min-w-0 truncate ${isDeleted ? 'line-through text-muted-foreground/30' : ''}`} title={setting.key}>
                    {shortKey(setting.key)}
                  </span>

                  {/* Description indicator */}
                  {setting.description && (
                    <Info className="h-2.5 w-2.5 text-muted-foreground/25 shrink-0" />
                  )}

                  {/* Value */}
                  <div className="w-[120px] shrink-0">
                    {isEditing ? (
                      <Input
                        autoFocus
                        defaultValue={currentValue}
                        onBlur={(e) => { onEditValue(setting.key, e.target.value); setEditingKey(null); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { onEditValue(setting.key, e.target.value); setEditingKey(null); }
                          if (e.key === 'Escape') setEditingKey(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-6 text-xs font-mono px-1.5"
                      />
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingKey(setting.key); }}
                        className={`block w-full text-right font-mono text-xs px-1.5 py-0.5 rounded hover:bg-accent/30 truncate ${
                          isLocallyModified ? 'text-primary font-bold' : 'text-foreground'
                        }`}
                        title="Click to edit"
                      >
                        {currentValue || <span className="italic text-muted-foreground/40">-</span>}
                      </button>
                    )}
                  </div>

                  {/* Default */}
                  <span className="w-[80px] shrink-0 text-right font-mono text-xs text-muted-foreground/40 truncate">
                    {setting.distValue !== null ? setting.distValue : ''}
                  </span>
                </div>
              );
            })}
            {filteredSettings.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                No settings found
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Description panel — right side, fixed width */}
        <Card className="w-[280px] shrink-0 bg-card/30 border-border self-start sticky top-0">
          <CardContent className="p-3">
            {selectedSetting ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <span className="font-mono text-xs text-primary font-medium break-all">
                    {selectedSetting.key}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {selectedSetting.distValue !== null && (
                      <Badge variant="outline" className="text-[10px] h-4">
                        default: {selectedSetting.distValue}
                      </Badge>
                    )}
                    {selectedSetting.status === 'new' && <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px] h-4">NEW</Badge>}
                    {selectedSetting.status === 'modified' && <Badge className="bg-amber-500/20 text-amber-400 text-[10px] h-4">MODIFIED</Badge>}
                    {selectedSetting.status === 'deprecated' && <Badge className="bg-red-500/20 text-red-400 text-[10px] h-4">DEPRECATED</Badge>}
                  </div>
                </div>
                {selectedSetting.description ? (
                  <ScrollArea className="max-h-[160px]">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {selectedSetting.description}
                    </p>
                  </ScrollArea>
                ) : (
                  <p className="text-xs text-muted-foreground/40 italic">No description</p>
                )}

                {/* Actions based on status */}
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/30">
                  {selectedSetting.status === 'modified' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      onClick={() => onResetToDefault(selectedSetting.key, selectedSetting.distValue)}
                    >
                      <RotateCcw className="h-2.5 w-2.5 mr-1" />
                      Reset to default
                    </Button>
                  )}
                  {selectedSetting.status === 'deprecated' && !deletedKeys?.has(selectedSetting.key) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2 text-red-400 hover:text-red-300"
                      onClick={() => onDeleteKey(selectedSetting.key)}
                    >
                      <Trash2 className="h-2.5 w-2.5 mr-1" />
                      Remove setting
                    </Button>
                  )}
                  {deletedKeys?.has(selectedSetting.key) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      onClick={() => onUndoDelete(selectedSetting.key)}
                    >
                      <Undo2 className="h-2.5 w-2.5 mr-1" />
                      Undo remove
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center">
                <Info className="h-5 w-5 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground/40">Click a setting</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground/50">
        <span>{filteredSettings.length} settings</span>
        {editedValues.size > 0 && (
          <span className="text-primary">({editedValues.size} unsaved)</span>
        )}
      </div>
    </div>
  );
}
