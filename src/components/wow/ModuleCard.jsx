import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  GitBranch, Download, Loader2, Check, ExternalLink,
  ChevronDown, ChevronRight, Clock, GitCommit, AlertCircle,
} from 'lucide-react';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ModuleCard({ repo, updateInfo, pullResult, onPull, pulling }) {
  const [commitsOpen, setCommitsOpen] = useState(false);
  const hasUpdates = updateInfo && updateInfo.behind > 0;
  const isChecked = updateInfo !== undefined;
  const isUpToDate = isChecked && !hasUpdates;

  // Build GitHub URL if available
  const ghUrl = repo.remote?.match(/github\.com[:/](.+?)(?:\.git)?$/)?.[1];

  // Parse pull result for display
  const pullMessage = pullResult?.output?.includes('Already up to date')
    ? 'Already up to date'
    : pullResult?.success
      ? 'Pulled successfully'
      : pullResult?.success === false
        ? 'Pull failed'
        : null;

  return (
    <Card className={`bg-card/50 ${hasUpdates ? 'border-primary/30' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            {/* Header: name + repo link */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-sm">{repo.name || repo.id}</h3>
              {ghUrl && (
                <a
                  href={`https://github.com/${ghUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={repo.repoLabel}
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {hasUpdates && (
                <Badge className="bg-primary/20 text-primary text-[10px] px-1.5">
                  {updateInfo.behind} update{updateInfo.behind > 1 ? 's' : ''} available
                </Badge>
              )}
              {isUpToDate && (
                <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5">
                  <Check className="h-2.5 w-2.5 mr-0.5" />
                  Up to date
                </Badge>
              )}
            </div>

            {/* Current state: branch + commit + date */}
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                {repo.branch}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <GitCommit className="h-3 w-3" />
                <code className="text-primary/80">{repo.commit}</code>
              </span>
              {repo.commitDate && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDate(repo.commitDate)}
                </span>
              )}
            </div>

            {/* Current commit message */}
            <p className="text-xs text-muted-foreground/70 truncate">
              {repo.commitMessage}
            </p>

            {/* Pull result feedback */}
            {pullMessage && !hasUpdates && (
              <div className={`flex items-center gap-1.5 text-xs ${
                pullResult?.success === false
                  ? 'text-red-400'
                  : 'text-emerald-400/70'
              }`}>
                {pullResult?.success === false
                  ? <AlertCircle className="h-3 w-3" />
                  : <Check className="h-3 w-3" />
                }
                {pullMessage}
              </div>
            )}

            {/* Available updates (expandable commit list) */}
            {hasUpdates && updateInfo.newCommits?.length > 0 && (
              <Collapsible open={commitsOpen} onOpenChange={setCommitsOpen}>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
                  {commitsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {updateInfo.newCommits.length} incoming commit{updateInfo.newCommits.length > 1 ? 's' : ''}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-1.5 ml-4 space-y-1 border-l-2 border-primary/20 pl-3">
                    {updateInfo.newCommits.slice(0, 10).map((c, i) => (
                      <div key={i} className="flex items-baseline gap-2 text-xs">
                        <code className="text-emerald-400/70 shrink-0">{c.hash}</code>
                        <span className="text-muted-foreground truncate">{c.message}</span>
                        <span className="text-muted-foreground/50 shrink-0 text-[10px]">{c.age}</span>
                      </div>
                    ))}
                    {updateInfo.newCommits.length > 10 && (
                      <p className="text-[10px] text-muted-foreground/50">
                        +{updateInfo.newCommits.length - 10} more
                      </p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>

          {/* Pull button */}
          <div className="shrink-0">
            <Button
              variant={hasUpdates ? 'default' : 'outline'}
              size="sm"
              onClick={onPull}
              disabled={pulling}
              className={hasUpdates ? 'bg-primary text-primary-foreground' : ''}
            >
              {pulling ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
              ) : (
                <Download className="h-3 w-3 mr-1.5" />
              )}
              Pull
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
