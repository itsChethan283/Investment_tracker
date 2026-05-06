import { AuthProvider, useAuth } from './AuthContext'
import Auth from './Auth'
import UpdatePassword from './UpdatePassword'
import InvestmentDashboard from './InvestmentDashboard'

function AppContent() {
  const { user, loading, isRecovery } = useAuth();

  if (loading) return null;

  if (!user) return <Auth />;

  if (isRecovery) return <UpdatePassword />;

  return <InvestmentDashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
