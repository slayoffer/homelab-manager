import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ConfigFileBrowser } from './ConfigFileBrowser';
import { ConfigSettingsView } from './ConfigSettingsView';
import { ConfigRawEditor } from './ConfigRawEditor';
import { useApi } from '@/hooks/useApi';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Save, RotateCcw, FileText, Settings2, Loader2, Check, AlertTriangle,
  History, ChevronDown, ChevronRight, Undo2,
} from 'lucide-react';

export function ConfigEditor() {
  const { get, post } = useApi();
  const [selectedFile, setSelectedFile] = useState('');
  const [viewMode, setViewMode] = useState('settings'); // 'settings' | 'raw'
  const [diffData, setDiffData] = useState(null);
  const [rawContent, setRawContent] = useState('');
  const [originalRaw, setOriginalRaw] = useState('');
  const [editedValues, setEditedValues] = useState(new Map());
  const [deletedKeys, setDeletedKeys] = useState(new Set());
  const [diffSummaries, setDiffSummaries] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [restoringId, setRestoringId] = useState(null);

  // Load diff summaries for all files on mount
  useEffect(() => {
    get('/workspaces/wow/configs').then(async (files) => {
      if (!Array.isArray(files)) return;
      const summaries = {};
      // Fetch diffs in parallel (small payloads)
      await Promise.all(files.map(async (f) => {
        if (f.hasDist) {
          const diff = await get(`/workspaces/wow/configs/diff?path=${encodeURIComponent(f.relativePath)}`);
          if (diff?.summary) summaries[f.relativePath] = diff.summary;
        }
      }));
      setDiffSummaries(summaries);
    });
  }, [get]);

  const loadFile = useCallback(async (relativePath) => {
    if (!relativePath) return;
    setLoading(true);
    setEditedValues(new Map());
    setDeletedKeys(new Set());
    setSaved(false);
    setNeedsRestart(false);

    const [configData, diffResult] = await Promise.all([
      get(`/workspaces/wow/configs/read?path=${encodeURIComponent(relativePath)}`),
      get(`/workspaces/wow/configs/diff?path=${encodeURIComponent(relativePath)}`),
    ]);

    if (configData && !configData.error) {
      setRawContent(configData.raw);
      setOriginalRaw(configData.raw);
    }
    if (diffResult && !diffResult.error) {
      setDiffData(diffResult);
    }
    setLoading(false);
  }, [get]);

  const handleSelectFile = (relativePath) => {
    if (isDirty && !confirm('You have unsaved changes. Discard?')) return;
    setSelectedFile(relativePath);
    loadFile(relativePath);
    loadSnapshots(relativePath);
  };

  const handleEditValue = (key, value) => {
    setEditedValues(prev => {
      const next = new Map(prev);
      next.set(key, value);
      return next;
    });
  };

  const handleResetToDefault = (key, defaultValue) => {
    handleEditValue(key, defaultValue);
  };

  const handleDeleteKey = (key) => {
    setDeletedKeys(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const handleUndoDelete = (key) => {
    setDeletedKeys(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  // Reconstruct raw content from settings edits
  const buildSaveContent = () => {
    if (viewMode === 'raw') return rawContent;

    let content = originalRaw;

    // Remove deleted keys (comment them out)
    for (const key of deletedKeys) {
      const regex = new RegExp(`^(\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=.*)$`, 'm');
      content = content.replace(regex, `# $1`);
    }

    // Patch edited values
    for (const [key, value] of editedValues) {
      if (deletedKeys.has(key)) continue;
      const regex = new RegExp(`^(\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*)(.*)$`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, `$1${value}`);
      } else {
        content += `\n${key} = ${value}`;
      }
    }
    return content;
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const content = buildSaveContent();
    const result = await post('/workspaces/wow/configs/save', {
      path: selectedFile,
      content,
    });
    if (result?.success) {
      setSaved(true);
      setNeedsRestart(true);
      setOriginalRaw(content);
      setRawContent(content);
      setEditedValues(new Map());
      setDeletedKeys(new Set());
      // Reload diff data
      const diff = await get(`/workspaces/wow/configs/diff?path=${encodeURIComponent(selectedFile)}`);
      if (diff && !diff.error) {
        setDiffData(diff);
        setDiffSummaries(prev => ({ ...prev, [selectedFile]: diff.summary }));
      }
      await loadSnapshots(selectedFile);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setSaveError(result?.error || 'Save failed');
      setTimeout(() => setSaveError(null), 5000);
    }
    setSaving(false);
  };

  const handleMergeNew = async () => {
    if (!confirm('Accept all new settings from upstream with default values?')) return;
    setSaving(true);
    const result = await post('/workspaces/wow/configs/merge', { path: selectedFile });
    if (result?.success) {
      setNeedsRestart(true);
      await loadFile(selectedFile);
      // Refresh summary
      const diff = await get(`/workspaces/wow/configs/diff?path=${encodeURIComponent(selectedFile)}`);
      if (diff?.summary) setDiffSummaries(prev => ({ ...prev, [selectedFile]: diff.summary }));
    }
    setSaving(false);
  };

  const loadSnapshots = useCallback(async (filePath) => {
    const data = await get(`/workspaces/wow/configs/history?path=${encodeURIComponent(filePath)}`);
    if (Array.isArray(data)) setSnapshots(data);
    else setSnapshots([]);
  }, [get]);

  const handleRestore = async (snapshotId) => {
    if (!confirm('Restore this snapshot? Current content will be saved as a new snapshot first.')) return;
    setRestoringId(snapshotId);
    const result = await post('/workspaces/wow/configs/rollback', { snapshotId });
    if (result?.success) {
      await loadFile(selectedFile);
      await loadSnapshots(selectedFile);
      setNeedsRestart(true);
    }
    setRestoringId(null);
  };

  const handleRestart = async () => {
    if (!confirm('Restart ac-worldserver to apply config changes?')) return;
    setRestarting(true);
    await post('/workspaces/wow/containers/ac-worldserver/restart');
    setRestarting(false);
    setNeedsRestart(false);
  };

  const isDirty = viewMode === 'raw'
    ? rawContent !== originalRaw
    : editedValues.size > 0 || deletedKeys.size > 0;

  const summary = diffData?.summary;

  return (
    <div className="flex gap-4 h-[calc(100vh-400px)] min-h-[500px]">
      {/* Left Sidebar */}
      <Card className="w-64 shrink-0 overflow-hidden">
        <ConfigFileBrowser
          selectedFile={selectedFile}
          onSelectFile={handleSelectFile}
          diffSummaries={diffSummaries}
        />
      </Card>

      {/* Right Panel */}
      <div className="flex-1 min-w-0">
        {selectedFile ? (
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium font-mono">
                  {selectedFile.split('/').pop().replace('.conf', '')}
                </span>
                {summary && (
                  <div className="flex items-center gap-1">
                    {summary.new > 0 && (
                      <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">+{summary.new} new</Badge>
                    )}
                    {summary.modified > 0 && (
                      <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">~{summary.modified} modified</Badge>
                    )}
                    {summary.deprecated > 0 && (
                      <Badge className="bg-red-500/20 text-red-400 text-[10px]">-{summary.deprecated} deprecated</Badge>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* View toggle */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Settings2 className="h-3 w-3" />
                  <span>Settings</span>
                  <Switch
                    checked={viewMode === 'raw'}
                    onCheckedChange={(checked) => {
                      if (isDirty && !confirm('Switch view? Unsaved changes will be lost.')) return;
                      setViewMode(checked ? 'raw' : 'settings');
                      if (!checked) loadFile(selectedFile);
                    }}
                  />
                  <span>Raw</span>
                </div>

                <div className="h-4 w-px bg-border" />

                {/* Save */}
                <Button
                  size="sm"
                  className="h-7"
                  onClick={handleSave}
                  disabled={!isDirty || saving}
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  ) : saved ? (
                    <Check className="h-3 w-3 mr-1.5 text-emerald-400" />
                  ) : (
                    <Save className="h-3 w-3 mr-1.5" />
                  )}
                  {saved ? 'Saved' : 'Save'}
                </Button>

                {/* Restart */}
                {needsRestart && (
                  <Button
                    size="sm"
                    className="h-7 bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={handleRestart}
                    disabled={restarting}
                  >
                    {restarting ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    ) : (
                      <RotateCcw className="h-3 w-3 mr-1.5" />
                    )}
                    Apply & Restart
                  </Button>
                )}
              </div>
            </div>

            {/* Save error */}
            {saveError && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Save failed: {saveError}
              </div>
            )}

            {/* Unsaved warning */}
            {isDirty && !saveError && (
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Unsaved changes
              </div>
            )}

            {/* Snapshots */}
            {snapshots.length > 0 && (
              <Collapsible open={snapshotsOpen} onOpenChange={setSnapshotsOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  {snapshotsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <History className="h-3 w-3" />
                  Snapshots ({snapshots.length})
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="rounded-lg border border-border p-2 space-y-1 max-h-48 overflow-y-auto">
                    {snapshots.map((snap) => (
                      <div key={snap.id} className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-accent/20 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-muted-foreground shrink-0">
                            {new Date(snap.saved_at + 'Z').toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}
                          </span>
                          <span className="text-muted-foreground/60">
                            {(snap.size / 1024).toFixed(1)}KB
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px] shrink-0"
                          onClick={() => handleRestore(snap.id)}
                          disabled={restoringId === snap.id}
                        >
                          {restoringId === snap.id ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Undo2 className="h-3 w-3 mr-1" />
                          )}
                          Restore
                        </Button>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Content */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : viewMode === 'settings' ? (
              <ConfigSettingsView
                diffData={diffData}
                editedValues={editedValues}
                deletedKeys={deletedKeys}
                onEditValue={handleEditValue}
                onMergeNew={handleMergeNew}
                onResetToDefault={handleResetToDefault}
                onDeleteKey={handleDeleteKey}
                onUndoDelete={handleUndoDelete}
              />
            ) : (
              <ConfigRawEditor
                content={rawContent}
                onChange={setRawContent}
                onSave={handleSave}
                isDirty={isDirty}
              />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <Settings2 className="h-10 w-10 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Select a config file to view and edit
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
