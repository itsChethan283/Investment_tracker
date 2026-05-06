import { AuthProvider, useAuth } from './AuthContext'
import Auth from './Auth'
import InvestmentDashboard from './InvestmentDashboard'

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return <Auth />;

  return <InvestmentDashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
