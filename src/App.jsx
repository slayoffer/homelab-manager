import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { WowDashboard } from '@/components/wow/WowDashboard';
import { WorkspaceStub } from '@/components/stubs/WorkspaceStub';
import { useApi } from '@/hooks/useApi';
import { Loader2 } from 'lucide-react';

export default function App() {
  const { get } = useApi();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeId, setActiveId] = useState('wow');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWorkspaces = async () => {
      const data = await get('/workspaces');
      if (Array.isArray(data)) {
        setWorkspaces(data);
      }
      setLoading(false);
    };
    loadWorkspaces();
  }, [get]);

  const activeWorkspace = workspaces.find(w => w.id === activeId);

  const renderWorkspace = () => {
    if (!activeWorkspace) return null;

    if (activeWorkspace.id === 'wow') {
      return <WowDashboard />;
    }

    return <WorkspaceStub workspace={activeWorkspace} />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        workspaces={workspaces}
        activeId={activeId}
        onSelect={setActiveId}
      />
      <main className="flex-1 overflow-auto">
        {renderWorkspace()}
      </main>
    </div>
  );
}
