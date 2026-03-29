import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { WowDashboard } from '@/components/wow/WowDashboard';
import { WorkspaceStub } from '@/components/stubs/WorkspaceStub';
import { AiAssistantDashboard } from '@/components/ai-assistant/AiAssistantDashboard';
import { LoginPage } from '@/components/auth/LoginPage';
import { useApi } from '@/hooks/useApi';
import { AiChatWidget } from '@/components/ai-assistant/AiChatWidget';
import { AI_WORKSPACES } from '@/components/ai-assistant/ai-themes';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, authEnabled, loading: authLoading } = useAuth();
  const { get } = useApi();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeId, setActiveId] = useState('wow');
  const [loading, setLoading] = useState(true);

  const needsLogin = authEnabled && !user;

  useEffect(() => {
    if (authLoading || needsLogin) return;
    const loadWorkspaces = async () => {
      const data = await get('/workspaces');
      if (Array.isArray(data)) {
        setWorkspaces(data);
      }
      setLoading(false);
    };
    loadWorkspaces();
  }, [get, authLoading, needsLogin]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (needsLogin) {
    return <LoginPage />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeWorkspace = workspaces.find(w => w.id === activeId);

  const renderWorkspace = () => {
    if (!activeWorkspace) return null;
    if (activeWorkspace.id === 'wow') return <WowDashboard />;
    const aiConfig = AI_WORKSPACES[activeWorkspace.id];
    if (aiConfig) {
      return (
        <AiAssistantDashboard
          workspaceId={activeWorkspace.id}
          workspaceName={aiConfig.name}
          WorkspaceIcon={aiConfig.Icon}
        />
      );
    }
    return <WorkspaceStub workspace={activeWorkspace} />;
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        workspaces={workspaces}
        activeId={activeId}
        onSelect={setActiveId}
        user={user}
      />
      <main className="flex-1 overflow-auto">
        {renderWorkspace()}
      </main>
      <AiChatWidget activeWorkspaceId={activeId} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
