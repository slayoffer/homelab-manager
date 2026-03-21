import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { GitBranch, Download, Loader2 } from 'lucide-react';

export function ModuleCard({ repo, updateInfo, onPull, pulling }) {
  const hasUpdates = updateInfo && updateInfo.behind > 0;

  return (
    <Card className="bg-card/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-sm truncate">{repo.name || repo.id}</h3>
              {hasUpdates && (
                <StatusBadge status="new" label={`${updateInfo.behind} new`} />
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              <span>{repo.branch}</span>
              <span className="text-border">|</span>
              <code className="text-primary/80">{repo.commit}</code>
            </div>

            {repo.commitMessage && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {repo.commitMessage}
              </p>
            )}

            {updateInfo?.newCommits?.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {updateInfo.newCommits.slice(0, 3).map((c, i) => (
                  <p key={i} className="text-xs text-muted-foreground/70 truncate">
                    {c}
                  </p>
                ))}
                {updateInfo.newCommits.length > 3 && (
                  <p className="text-xs text-muted-foreground/50">
                    +{updateInfo.newCommits.length - 3} more
                  </p>
                )}
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onPull}
            disabled={pulling}
            className="shrink-0 ml-2"
          >
            {pulling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            <span className="ml-1.5">Pull</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
