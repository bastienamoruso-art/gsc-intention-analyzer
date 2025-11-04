// Rate limiter simple en mémoire (suffisant pour beta)
// Pour scale: migrer vers Redis/Upstash

interface RateLimitEntry {
  count: number;
  resetAt: number; // timestamp
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Nettoyage automatique toutes les heures
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(ip);
    }
  }
}, 60 * 60 * 1000); // 1 heure

export function checkRateLimit(ip: string, maxRequests: number = 3): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  // Calculer minuit prochain (UTC)
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  const resetAt = tomorrow.getTime();

  // Première requête ou reset passé
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, {
      count: 1,
      resetAt
    });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt
    };
  }

  // Vérifier la limite
  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt
    };
  }

  // Incrémenter le compteur
  entry.count++;
  rateLimitStore.set(ip, entry);

  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt
  };
}

export function getClientIP(request: Request): string {
  // En production Vercel, l'IP est dans x-forwarded-for ou x-real-ip
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback pour développement local
  return 'localhost';
}
