import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { Alert } from '@/components/ui/feedback';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';

export default function VerifyEmailPage() {
  const { verifyEmail, resendOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const stateEmail = (location.state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = React.useState(stateEmail);
  const [otp, setOtp] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isResending, setIsResending] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const user = await verifyEmail(email.trim().toLowerCase(), otp.trim());
      toast.success('Email verified', 'Welcome to Thuthi Dairy!');
      navigate(user.role.name === 'ADMIN' ? '/admin' : '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onResend = async () => {
    if (!email.trim()) {
      setError('Enter your email address first.');
      return;
    }
    setIsResending(true);
    setError(null);
    try {
      await resendOtp(email.trim().toLowerCase(), 'EMAIL_VERIFICATION');
      toast.success('Code sent', 'Check your inbox for a new 6-digit code.');
      setCooldown(45);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend the code.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthLayout title="Verify your email" subtitle="We've sent a 6-digit code to your email address. Enter it below to activate your account.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert variant="error">{error}</Alert>}

        <Alert variant="info" icon={<MailCheck />}>
          Didn't get an email? Check spam, or if SMTP isn't configured in development, check{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">server/storage/mail-outbox.log</code>.
        </Alert>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="otp">6-digit code</Label>
          <Input
            id="otp"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="text-center text-lg tracking-[0.5em]"
          />
        </div>

        <Button type="submit" className="w-full" size="lg" loading={isSubmitting} disabled={otp.length !== 6}>
          Verify email
        </Button>

        <Button type="button" variant="ghost" className="w-full" onClick={onResend} loading={isResending} disabled={cooldown > 0}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </Button>
      </form>
    </AuthLayout>
  );
}
