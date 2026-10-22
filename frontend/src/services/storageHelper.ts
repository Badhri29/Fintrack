// Helper to ensure each user has isolated, private data in localStorage

export const getUserStorageKey = (prefix: string, userEmail?: string): string => {
  let email = userEmail;
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
