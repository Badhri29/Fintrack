// Helper to ensure each user has isolated, private data in localStorage

export const getUserStorageKey = (prefix: string, userEmail?: string): string => {
  let email: string | undefined;
  try {
    const cached = localStorage.getItem('fintrack_user_cache');
    if (cached) {
      const u = JSON.parse(cached);
      if (u.parentUserEmail && u.parentUserEmail.trim()) {
        email = u.parentUserEmail;
      }
    }
  } catch {}

  if (!email && userEmail && userEmail.trim()) {
    email = userEmail;
  }

  if (!email || !email.trim()) {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        email = payload.email || payload.sub;
      }
    } catch {}
  }

  const cleanEmail = (email && email.trim()) ? email.trim().toLowerCase() : 'guest';
  return `${prefix}_${cleanEmail}`;
};
