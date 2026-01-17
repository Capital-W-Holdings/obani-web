import { useState, useEffect } from 'react';
import './App.css';

const API_URL = 'https://obani.vercel.app/api';

interface User {
  id: string;
  email: string;
  name: string;
}

interface Contact {
  id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  relationshipStrength: number;
  tags: string[];
  createdAt: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
}

function App() {
  const [auth, setAuth] = useState<AuthState>({ user: null, token: null });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'login' | 'register' | 'contacts' | 'newContact'>('login');
  const [error, setError] = useState('');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [newContact, setNewContact] = useState({ firstName: '', lastName: '', email: '', phone: '', company: '' });

  // Load auth from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('obani_auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      setAuth(parsed);
      setView('contacts');
    }
    setLoading(false);
  }, []);

  // Fetch contacts when authenticated
  useEffect(() => {
    if (auth.token) {
      fetchContacts();
    }
  }, [auth.token]);

  const fetchContacts = async () => {
    try {
      const res = await fetch(`${API_URL}/contacts`, {
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      const data = await res.json();
      if (data.success) {
        setContacts(data.data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch contacts', err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success) {
        const authData = { user: data.data.user, token: data.data.token };
        setAuth(authData);
        localStorage.setItem('obani_auth', JSON.stringify(authData));
        setView('contacts');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });
      const data = await res.json();
      if (data.success) {
        const authData = { user: data.data.user, token: data.data.token };
        setAuth(authData);
        localStorage.setItem('obani_auth', JSON.stringify(authData));
        setView('contacts');
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify(newContact)
      });
      const data = await res.json();
      if (data.success) {
        setContacts([data.data, ...contacts]);
        setNewContact({ firstName: '', lastName: '', email: '', phone: '', company: '' });
        setView('contacts');
      }
    } catch (err) {
      console.error('Failed to create contact', err);
    }
  };

  const handleLogout = () => {
    setAuth({ user: null, token: null });
    localStorage.removeItem('obani_auth');
    setContacts([]);
    setView('login');
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  // Login View
  if (view === 'login') {
    return (
      <div className="container">
        <div className="card auth-card">
          <div className="logo">🤝</div>
          <h1>Welcome to Obani</h1>
          <p className="subtitle">Personal Operating System for Relationships</p>

          {error && <div className="error">{error}</div>}

          <form onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" className="btn primary">Sign In</button>
          </form>

          <p className="switch-text">
            Don't have an account?{' '}
            <button className="link" onClick={() => { setView('register'); setError(''); }}>
              Sign up
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Register View
  if (view === 'register') {
    return (
      <div className="container">
        <div className="card auth-card">
          <div className="logo">🤝</div>
          <h1>Create Account</h1>

          {error && <div className="error">{error}</div>}

          <form onSubmit={handleRegister}>
            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password (8+ chars, upper, lower, number)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <button type="submit" className="btn primary">Create Account</button>
          </form>

          <p className="switch-text">
            Already have an account?{' '}
            <button className="link" onClick={() => { setView('login'); setError(''); }}>
              Sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  // New Contact View
  if (view === 'newContact') {
    return (
      <div className="container">
        <header className="header">
          <button className="back-btn" onClick={() => setView('contacts')}>← Back</button>
          <h1>New Contact</h1>
        </header>

        <div className="card">
          <form onSubmit={handleCreateContact}>
            <input
              type="text"
              placeholder="First Name *"
              value={newContact.firstName}
              onChange={(e) => setNewContact({...newContact, firstName: e.target.value})}
              required
            />
            <input
              type="text"
              placeholder="Last Name"
              value={newContact.lastName}
              onChange={(e) => setNewContact({...newContact, lastName: e.target.value})}
            />
            <input
              type="email"
              placeholder="Email"
              value={newContact.email}
              onChange={(e) => setNewContact({...newContact, email: e.target.value})}
            />
            <input
              type="tel"
              placeholder="Phone"
              value={newContact.phone}
              onChange={(e) => setNewContact({...newContact, phone: e.target.value})}
            />
            <input
              type="text"
              placeholder="Company"
              value={newContact.company}
              onChange={(e) => setNewContact({...newContact, company: e.target.value})}
            />
            <button type="submit" className="btn primary">Save Contact</button>
          </form>
        </div>
      </div>
    );
  }

  // Contacts View (Main)
  return (
    <div className="container">
      <header className="header">
        <div className="header-left">
          <span className="logo-small">🤝</span>
          <h1>Obani</h1>
        </div>
        <div className="header-right">
          <span className="user-name">{auth.user?.name}</span>
          <button className="btn secondary" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div className="toolbar">
        <h2>Contacts ({contacts.length})</h2>
        <button className="btn primary" onClick={() => setView('newContact')}>+ Add Contact</button>
      </div>

      {contacts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <h3>No contacts yet</h3>
          <p>Add your first contact to get started</p>
          <button className="btn primary" onClick={() => setView('newContact')}>Add Contact</button>
        </div>
      ) : (
        <div className="contacts-list">
          {contacts.map((contact) => (
            <div key={contact.id} className="contact-card">
              <div className="contact-avatar">
                {contact.firstName[0]}{contact.lastName?.[0] || ''}
              </div>
              <div className="contact-info">
                <div className="contact-name">
                  {contact.firstName} {contact.lastName || ''}
                </div>
                {contact.company && (
                  <div className="contact-company">
                    {contact.title ? `${contact.title} at ` : ''}{contact.company}
                  </div>
                )}
                {contact.email && <div className="contact-email">{contact.email}</div>}
              </div>
              <div className="contact-strength">
                {'★'.repeat(contact.relationshipStrength || 3)}
                {'☆'.repeat(5 - (contact.relationshipStrength || 3))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
