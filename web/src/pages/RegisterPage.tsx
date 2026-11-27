import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PhoneCall } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(email, password, fullName);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="card auth-card">
        <div className="brand" style={{ marginBottom: 16 }}>
          <div className="brand-mark">
            <PhoneCall size={18} />
          </div>
          <span>MocoCall</span>
        </div>
        <h1 style={{ margin: '0 0 6px', fontSize: '1.35rem' }}>Create an operator account</h1>
        <p style={{ margin: '0 0 18px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Place authorized calls and monitor call usage statistics.
        </p>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 14 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label" htmlFor="reg-name">
              Full Name
            </label>
            <input
              id="reg-name"
              className="input"
              type="text"
              required
              minLength={2}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Alex Rivera"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="reg-email">
              Email
            </label>
            <input
              id="reg-email"
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@example.com"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="reg-password">
              Password
            </label>
            <input
              id="reg-password"
              className="input"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
            />
          </div>

          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={{ marginTop: 16, fontSize: '0.86rem', color: 'var(--text-muted)' }}>
          Already registered?{' '}
          <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
