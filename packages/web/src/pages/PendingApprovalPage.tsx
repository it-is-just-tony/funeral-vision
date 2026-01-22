import { useAuth } from '../contexts/AuthContext';

export default function PendingApprovalPage() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="card p-8">
          <div className="text-6xl mb-4">⏳</div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Account Pending Approval
          </h1>
          <p className="text-[var(--text-secondary)] mb-6">
            Your registration is being reviewed. You'll receive access once an administrator approves your account.
          </p>
          <button
            onClick={logout}
            className="btn-secondary px-6 py-2"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
