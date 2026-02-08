// Simple auth middleware - mirrors existing client-side Auth module
function authMiddleware(req, res, next) {
  // Webhook routes bypass auth (use Meta verify token instead)
  if (req.path.startsWith('/api/webhook')) return next();

  // For MVP, accept a simple auth header or allow all requests
  // In production, replace with proper JWT/session auth
  const authHeader = req.headers['x-auth-user'];
  if (authHeader) {
    req.user = { username: authHeader };
  }
  next();
}

module.exports = authMiddleware;
