// WebChat - Simple Interface with Email Verification Messages - App.js
import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { io } from 'socket.io-client';

// API Configuration
const API_BASE_URL = 'http://winwin2home.3bbddns.com:53632';

// API Helper Functions
const api = {
  post: async (endpoint, data, token = null) => {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
    
    return response.json();
  },
  
  get: async (endpoint, token = null) => {
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
    
    return response.json();
  },
  
  put: async (endpoint, data, token = null) => {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
    
    return response.json();
  }
};

// Email Not Verified Component
const EmailNotVerified = ({ email, onResend, onLogout }) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const handleResend = async () => {
    setLoading(true);
    setMessage('');
    try {
      await onResend(email);
      setMessage('Verification email sent successfully! Please check your inbox.');
      setMessageType('success');
    } catch (error) {
      setMessage(error.message);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card verification-required">
        <div className="verification-icon">📧</div>
        <h2>Email Verification Required</h2>
        <p>
          We've sent a verification link to <strong>{email}</strong>. 
          Please check your email and click the verification link to activate your account.
        </p>
        
        {message && (
          <div className={`message ${messageType}`}>
            {message}
          </div>
        )}
        
        <div className="verification-actions">
          <button 
            className="btn-primary" 
            onClick={handleResend}
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Resend Verification Email'}
          </button>
          
          <button className="btn-secondary" onClick={onLogout}>
            Back to Login
          </button>
        </div>
        
        <div className="help-text">
          <p><strong>Didn't receive the email?</strong></p>
          <ul>
            <li>Check your spam/junk folder</li>
            <li>Make sure you entered the correct email address</li>
            <li>Wait a few minutes and try resending</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// Login Component
const Login = ({ onLogin, onToggleMode }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');

  useEffect(() => {
    // Check URL parameters for verification messages
    const urlParams = new URLSearchParams(window.location.search);
    const verified = urlParams.get('verified');
    const message = urlParams.get('message');
    
    if (verified === 'true' && message) {
      setVerificationMessage(message);
      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (verified === 'false' && message) {
      setError(message);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setEmailNotVerified(false);
    setVerificationMessage('');

    try {
      const response = await api.post('/api/auth/login', { email, password });
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      onLogin(response.user, response.token);
    } catch (err) {
      if (err.message.includes('verify your email')) {
        setEmailNotVerified(true);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async (userEmail) => {
    await api.post('/api/auth/resend-verification', { email: userEmail });
  };

  if (emailNotVerified) {
    return (
      <EmailNotVerified 
        email={email}
        onResend={handleResendVerification}
        onLogout={() => {
          setEmailNotVerified(false);
          setEmail('');
          setPassword('');
        }}
      />
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Sign In</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          
          {verificationMessage && (
            <div className="message success">
              ✅ {verificationMessage}
            </div>
          )}
          
          {error && (
            <div className="message error">
              {error}
            </div>
          )}
          
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        <p>
          Don't have an account?{' '}
          <button className="link-button" onClick={onToggleMode}>
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
};

// Register Component
const Register = ({ onRegister, onToggleMode }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const response = await api.post('/api/auth/register', {
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName
      });
      
      setSuccess(true);
      setSuccessMessage(response.message);
      
      // Auto redirect to login after 5 seconds if email verification is required
      if (response.user.emailVerificationRequired) {
        setTimeout(() => {
          onToggleMode();
        }, 5000);
      } else {
        onRegister();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card success-card">
          <div className="verification-icon success">✅</div>
          <h2>Registration Successful!</h2>
          <p>{successMessage}</p>
          {successMessage.includes('email') && (
            <div className="help-text">
              <p><strong>Next steps:</strong></p>
              <ol>
                <li>Check your email inbox</li>
                <li>Click the verification link</li>
                <li>Return here to login</li>
              </ol>
              <p>You will be redirected to login automatically...</p>
            </div>
          )}
          <button className="btn-primary" onClick={onToggleMode}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Sign Up</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="firstName">First Name</label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                required
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label htmlFor="lastName">Last Name</label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                required
                disabled={loading}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength="8"
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              disabled={loading}
            />
          </div>
          {error && <div className="message error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>
        </form>
        <p>
          Already have an account?{' '}
          <button className="link-button" onClick={onToggleMode}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
};

// Theme Selector Component
const ThemeSelector = ({ currentTheme, themes, onThemeChange, token }) => {
  const [loading, setLoading] = useState(false);

  const handleThemeChange = async (themeName) => {
    setLoading(true);
    try {
      await api.put('/api/user/theme', { theme: themeName }, token);
      onThemeChange(themeName);
    } catch (err) {
      console.error('Failed to update theme:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="theme-selector">
      <h4>Choose Theme</h4>
      <div className="theme-options">
        {themes.map((theme) => (
          <button
            key={theme.name}
            className={`theme-option ${currentTheme === theme.name ? 'active' : ''}`}
            onClick={() => handleThemeChange(theme.name)}
            disabled={loading}
            style={{
              '--theme-primary': theme.primary_color,
              '--theme-secondary': theme.secondary_color,
              '--theme-bg': theme.background_color,
              '--theme-text': theme.text_color
            }}
          >
            <div className="theme-preview">
              <div className="theme-color primary" style={{ backgroundColor: theme.primary_color }}></div>
              <div className="theme-color secondary" style={{ backgroundColor: theme.secondary_color }}></div>
            </div>
            <span>{theme.display_name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// Chat Interface Component
const ChatInterface = ({ user, token, onLogout }) => {
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [themes, setThemes] = useState([]);
  const [currentTheme, setCurrentTheme] = useState(user.themePreference || 'light');
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    loadSessions();
    loadThemes();
    socketRef.current = io(API_BASE_URL);
    socketRef.current.on('newMessage', (message) => {
      setMessages(prev => [...prev, message]);
    });
    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (currentSession) {
      loadMessages(currentSession.id);
      socketRef.current.emit('joinSession', currentSession.id);
    }
  }, [currentSession]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadSessions = async () => {
    try {
      const sessionsData = await api.get('/api/chat/sessions', token);
      setSessions(sessionsData);
      if (sessionsData.length > 0 && !currentSession) {
        setCurrentSession(sessionsData[0]);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const loadMessages = async (sessionId) => {
    try {
      const messagesData = await api.get(`/api/chat/sessions/${sessionId}/messages`, token);
      setMessages(messagesData);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  const loadThemes = async () => {
    try {
      const themesData = await api.get('/api/themes', token);
      setThemes(themesData);
    } catch (err) {
      console.error('Failed to load themes:', err);
    }
  };

  const createNewSession = async () => {
    try {
      const sessionName = prompt('Enter session name (optional):') || undefined;
      const newSession = await api.post('/api/chat/sessions', { sessionName }, token);
      setSessions([newSession, ...sessions]);
      setCurrentSession(newSession);
      setMessages([]);
    } catch (err) {
      console.error('Failed to create session:', err);
      alert('Failed to create new session');
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentSession) return;

    setLoading(true);
    const messageText = newMessage;
    setNewMessage('');

    try {
      await api.post('/api/chat/message', {
        sessionId: currentSession.id,
        message: messageText
      }, token);
    } catch (err) {
      console.error('Failed to send message:', err);
      alert('Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const handleThemeChange = (themeName) => {
    setCurrentTheme(themeName);
    const selectedTheme = themes.find(t => t.name === themeName);
    if (selectedTheme) {
      document.documentElement.style.setProperty('--primary-color', selectedTheme.primary_color);
      document.documentElement.style.setProperty('--secondary-color', selectedTheme.secondary_color);
      document.documentElement.style.setProperty('--background-color', selectedTheme.background_color);
      document.documentElement.style.setProperty('--text-color', selectedTheme.text_color);
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className={`chat-app theme-${currentTheme}`}>
      <div className="chat-header">
        <div className="header-left">
          <h1>Web Chat</h1>
          <span className="user-info">
            Welcome, {user.firstName}!
            {user.emailVerified && <span className="verified"> ✅ Verified</span>}
          </span>
        </div>
        <div className="header-right">
          <button className="btn-secondary" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="chat-container">
        <div className="sidebar">
          <div className="sessions-section">
            <div className="section-header">
              <h3>Chat Sessions</h3>
              <button className="btn-primary btn-small" onClick={createNewSession}>
                New Chat
              </button>
            </div>
            <div className="sessions-list">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`session-item ${currentSession?.id === session.id ? 'active' : ''}`}
                  onClick={() => setCurrentSession(session)}
                >
                  <div className="session-name">
                    {session.session_name || `Chat ${session.id}`}
                  </div>
                  <div className="session-meta">
                    {session.message_count} messages
                  </div>
                </div>
              ))}
            </div>
          </div>

          <ThemeSelector
            currentTheme={currentTheme}
            themes={themes}
            onThemeChange={handleThemeChange}
            token={token}
          />
        </div>

        <div className="chat-main">
          {currentSession ? (
            <>
              <div className="chat-header-info">
                <h3>{currentSession.session_name || `Chat ${currentSession.id}`}</h3>
              </div>
              
              <div className="messages-container">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message ${message.message_type === 'user' ? 'user-message' : 'bot-message'}`}
                  >
                    <div className="message-content">
                      <div className="message-text">{message.message_text}</div>
                      <div className="message-time">
                        {formatTimestamp(message.created_at)}
                        {message.response_time_ms && (
                          <span className="response-time"> ({message.response_time_ms}ms)</span>
                        )}
                        {message.message_type === 'bot' && (
                          <span className="bot-indicator"> 🤖</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <form className="message-input-form" onSubmit={sendMessage}>
                <div className="input-container">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    disabled={loading}
                    className="message-input"
                  />
                  <button
                    type="submit"
                    disabled={loading || !newMessage.trim()}
                    className="send-button"
                  >
                    {loading ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="no-session">
              <h3>Select a chat session or create a new one to start chatting</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Main App Component
const App = () => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    
    setLoading(false);
  }, []);

  const handleLogin = (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
  };

  const handleRegister = () => {
    setIsLogin(true);
    alert('Registration successful! Please log in.');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setToken(null);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (user && token) {
    return <ChatInterface user={user} token={token} onLogout={handleLogout} />;
  }

  return (
    <div className="app">
      {isLogin ? (
        <Login onLogin={handleLogin} onToggleMode={() => setIsLogin(false)} />
      ) : (
        <Register onRegister={handleRegister} onToggleMode={() => setIsLogin(true)} />
      )}
    </div>
  );
};

export default App;
