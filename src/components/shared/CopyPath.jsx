import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

function toHomePath(absPath) {
  if (!absPath) return '';
  // Container paths → host paths
  if (absPath.startsWith('/wow')) return absPath.replace(/^\/wow/, '~/docker/wow/azerothcore-wotlk');
  if (absPath.startsWith('/backups')) return absPath.replace(/^\/backups/, '/opt/backups/wow');
  // Host paths
  return absPath.replace(/^\/home\/slayo\//, '~/');
}

export function CopyPath({ path, className = '' }) {
  const [copied, setCopied] = useState(false);
  const displayPath = toHomePath(path);

  if (!path) return null;

  const handleCopy = async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(displayPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors font-mono ${className}`}
      title={`Copy: ${displayPath}`}
    >
      {copied
        ? <Check className="h-2.5 w-2.5 text-emerald-400" />
        : <Copy className="h-2.5 w-2.5" />
      }
      <span className="truncate max-w-[200px]">{displayPath}</span>
    </button>
  );
}
