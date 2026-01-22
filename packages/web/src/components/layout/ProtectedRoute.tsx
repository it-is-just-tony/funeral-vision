import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireApproval?: boolean;
  requireRole?: Array<'user' | 'admin' | 'owner'>;
}

export default function ProtectedRoute({
  children,
  requireApproval = true,
  requireRole,
}: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--text-secondary)]">Loading...</div>
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Check if user needs approval
  if (requireApproval && user.status === 'pending') {
    return <Navigate to="/pending" replace />;
  }

  // Check if user is rejected or suspended
  if (user.status === 'rejected' || user.status === 'suspended') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center card p-8">
          <div className="text-6xl mb-4">{user.status === 'rejected' ? '❌' : '🚫'}</div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Account {user.status === 'rejected' ? 'Rejected' : 'Suspended'}
          </h1>
          <p className="text-[var(--text-secondary)]">
            {user.status === 'rejected'
              ? 'Your account request has been rejected.'
              : 'Your account has been suspended. Please contact support.'}
          </p>
        </div>
      </div>
    );
  }

  // Check role requirement
  if (requireRole && requireRole.length > 0) {
    // Owner always has access
    if (user.role !== 'owner' && !requireRole.includes(user.role)) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
