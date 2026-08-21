import { type ReactNode, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props { children: ReactNode; adminOnly?: boolean; }

function AccessDenied() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center space-y-5 max-w-md">
        <div className="h-16 w-16 rounded-2xl mx-auto flex items-center justify-center border border-destructive/30 bg-destructive/10">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            403 — Restricted Area
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            This administration portal is separate from the customer dashboard and requires an admin account.
            You have not been redirected — this URL simply is not accessible with your current role.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <Link to="/dashboard"><Button variant="default">Go to My Dashboard</Button></Link>
          <Link to="/"><Button variant="outline">Back to Website</Button></Link>
        </div>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children, adminOnly = false }: Props) {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate('/login', { replace: true });
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;
  if (adminOnly && profile?.role !== 'admin') return <AccessDenied />;

  return <>{children}</>;
}
