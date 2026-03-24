import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Shield, Tv } from 'lucide-react';

type AuthView = 'sign_in' | 'sign_up' | 'mfa';

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp, challengeAndVerifyMfa } = useAuth();

  const [view, setView] = useState<AuthView>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaFactorId, setMfaFactorId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) {
      toast.error(result.error.message);
    } else if (result.needsMfa && result.factorId) {
      setMfaFactorId(result.factorId);
      setView('mfa');
    } else {
      navigate('/dashboard');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) return toast.error('Passwords do not match');
    if (password.length < 8) return toast.error('Password must be at least 8 characters');
    setLoading(true);
    const { error } = await signUp(email, password, firstName, lastName);
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Account created! Check your email to confirm, then sign in.');
      setView('sign_in');
    }
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaCode.trim()) return;
    setLoading(true);
    const { error } = await challengeAndVerifyMfa(mfaFactorId, mfaCode.trim());
    setLoading(false);
    if (error) {
      toast.error('Invalid code. Please try again.');
    } else {
      navigate('/dashboard');
    }
  };

  // ── MFA View ───────────────────────────────────────────────────────────
  if (view === 'mfa') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-xl font-bold">Two-Factor Authentication</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter the 6-digit code from your authenticator app</p>
          </div>
          <form onSubmit={handleMfa} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Authentication Code</Label>
              <Input
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="text-center text-2xl tracking-widest"
                maxLength={6}
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || mfaCode.length !== 6}>
              {loading ? 'Verifying...' : 'Verify'}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setView('sign_in')}>
              Back to Sign In
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // ── Sign In / Sign Up ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-2">
            <Tv className="h-7 w-7 text-primary" />
            <span className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk' }}>BCTV</span>
          </Link>
          <p className="text-sm text-muted-foreground">Broadcasters Community Television</p>
        </div>

        {/* Tabs */}
        <div className="flex mb-6 border border-border rounded-lg overflow-hidden">
          <button
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${view === 'sign_in' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            onClick={() => setView('sign_in')}
          >
            Sign In
          </button>
          <button
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${view === 'sign_up' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            onClick={() => setView('sign_up')}
          >
            Create Account
          </button>
        </div>

        {view === 'sign_in' ? (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name <span className="text-destructive">*</span></Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John" required />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name <span className="text-destructive">*</span></Label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div className="space-y-1.5">
              <Label>Password <span className="text-destructive">*</span></Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" required minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm Password <span className="text-destructive">*</span></Label>
              <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <p className="text-xs text-muted-foreground">
              After creating your account, you'll complete your BCTV profile setup.
            </p>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
