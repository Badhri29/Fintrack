// Centralized Credit Card Service with User Scoping, Event Synchronization, and Backend API Persistence
import api from './api';

export interface CardModel {
  id: string;
  name: string;
  bank: string;
  network: 'Visa' | 'Mastercard' | 'RuPay' | 'Amex';
  cardNumber?: string;
  last4: string;
  expiryMonth?: number;
  expiryYear?: number;
  cvv?: string;
  limit: number;
  billingDay: number;
  dueDay: number;
  gradient: string;
  accent: string;
  isActive?: boolean;
  isAddon?: boolean;
  primaryCardId?: string;
  holderName?: string;
}

export const DEFAULT_CARDS: CardModel[] = [
  {
    id: 'card-1',
    name: 'HDFC Regalia Gold',
    bank: 'HDFC Bank',
    network: 'Visa',
    cardNumber: '4281739281924281',
    last4: '4281',
    expiryMonth: 12,
    expiryYear: 28,
    cvv: '742',
    limit: 400000,
    billingDay: 15,
    dueDay: 5,
    gradient: 'linear-gradient(135deg, #1E293B 0%, #0F172A 60%, #334155 100%)',
    accent: '#F59E0B',
    isActive: true
  },
  {
    id: 'card-2',
    name: 'ICICI Amazon Pay',
    bank: 'ICICI Bank',
    network: 'Visa',
    cardNumber: '4312890123458819',
    last4: '8819',
    expiryMonth: 8,
    expiryYear: 29,
    cvv: '319',
    limit: 250000,
    billingDay: 12,
    dueDay: 2,
    gradient: 'linear-gradient(135deg, #1E1B4B 0%, #311042 60%, #4C1D95 100%)',
    accent: '#8B5CF6',
    isActive: true
  },
  {
    id: 'card-3',
    name: 'SBI Cashback Card',
    bank: 'State Bank of India',
    network: 'Mastercard',
    cardNumber: '5241987654323014',
    last4: '3014',
    expiryMonth: 5,
    expiryYear: 27,
    cvv: '804',
    limit: 150000,
    billingDay: 20,
    dueDay: 10,
    gradient: 'linear-gradient(135deg, #047857 0%, #065F46 60%, #064E3B 100%)',
    accent: '#34D399',
    isActive: true
  }
];

export const getActiveUserEmail = (providedEmail?: string): string => {
  try {
    const cached = localStorage.getItem('fintrack_user_cache');
    if (cached) {
      const u = JSON.parse(cached);
      if (u.parentUserEmail && u.parentUserEmail.trim()) {
        return u.parentUserEmail.trim().toLowerCase();
      }
      if (!providedEmail && u.email && u.email.trim()) {
        return u.email.trim().toLowerCase();
      }
    }
  } catch {}

  if (providedEmail && providedEmail.trim()) {
    return providedEmail.trim().toLowerCase();
  }

  try {
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return (payload.email || payload.sub || 'anonymous').toLowerCase();
    }
  } catch {}
  return 'anonymous';
};

const getStorageKey = (email?: string): string => {
  const userEmail = getActiveUserEmail(email);
  return `fintrack_credit_cards_${userEmail}`;
};

export const cardService = {
  getCards(email?: string): CardModel[] {
    const userEmail = getActiveUserEmail(email);
    try {
      const stored = localStorage.getItem(getStorageKey(userEmail));
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const list = parsed.map((c: any) => ({
            ...c,
            isActive: c.isActive !== false,
            last4: c.last4 || (c.cardNumber ? c.cardNumber.slice(-4) : '0000')
          }));
          const primaryMap = new Map(list.filter((c: any) => !c.isAddon).map((c: any) => [c.id, c]));
          return list.map((c: any) => {
            if (c.isAddon && c.primaryCardId && primaryMap.has(c.primaryCardId)) {
              return { ...c, bank: primaryMap.get(c.primaryCardId)!.bank };
            }
            return c;
          });
        }
      }
    } catch (err) {
      console.error('Error loading cards from storage:', err);
    }

    // Only demo user gets sample default cards
    if (userEmail === 'demo@fintrack.io') {
      return DEFAULT_CARDS;
    }

    return [];
  },

  getActiveCards(email?: string): CardModel[] {
    return this.getCards(email).filter(c => c.isActive !== false);
  },

  saveCards(cards: CardModel[], email?: string): void {
    const userEmail = getActiveUserEmail(email);
    try {
      localStorage.setItem(getStorageKey(userEmail), JSON.stringify(cards));
      window.dispatchEvent(new CustomEvent('fintrack-cards-updated', { detail: cards }));
    } catch (err) {
      console.error('Error saving cards to storage:', err);
    }

    // Persist to backend API asynchronously
    api.post('/credit-cards/sync', cards).catch((err) => {
      console.debug('Async credit cards sync notice:', err?.message);
    });
  },

  async fetchCardsFromServer(email?: string): Promise<CardModel[]> {
    try {
      const res = await api.get('/credit-cards');
      if (res.data?.success && Array.isArray(res.data.data)) {
        const serverCards: CardModel[] = res.data.data.map((c: any) => ({
          id: c.id,
          name: c.name,
          bank: c.bank,
          network: c.network,
          cardNumber: c.cardNumber,
          last4: c.last4 || '0000',
          expiryMonth: c.expiryMonth,
          expiryYear: c.expiryYear,
          cvv: c.cvv,
          limit: c.limit || 0,
          billingDay: c.billingDay || 1,
          dueDay: c.dueDay || 1,
          gradient: c.gradient,
          accent: c.accent,
          isActive: c.isActive !== false,
          isAddon: Boolean(c.isAddon),
          primaryCardId: c.primaryCardId,
          holderName: c.holderName
        }));

        const local = this.getCards(email);
        if (serverCards.length > 0) {
          const userEmail = getActiveUserEmail(email);
          localStorage.setItem(getStorageKey(userEmail), JSON.stringify(serverCards));
          window.dispatchEvent(new CustomEvent('fintrack-cards-updated', { detail: serverCards }));
          return serverCards;
        } else if (local.length > 0) {
          // Sync local cards to backend
          this.saveCards(local, email);
          return local;
        }
      }
    } catch (err) {
      console.debug('Could not fetch credit cards from server:', err);
    }
    return this.getCards(email);
  },

  addCard(cardData: Omit<CardModel, 'id'>, email?: string): CardModel {
    const cards = this.getCards(email);
    const id = `card-${Date.now()}`;
    const newCard: CardModel = {
      ...cardData,
      id,
      isActive: true,
      last4: cardData.last4 || (cardData.cardNumber ? cardData.cardNumber.slice(-4) : '9999')
    };
    const updated = [...cards, newCard];
    this.saveCards(updated, email);

    api.post('/credit-cards', newCard).catch(() => {});
    return newCard;
  },

  updateCard(id: string, updates: Partial<CardModel>, email?: string): CardModel | null {
    const cards = this.getCards(email);
    const idx = cards.findIndex(c => c.id === id);
    if (idx === -1) return null;

    const current = cards[idx];
    const updatedCard: CardModel = {
      ...current,
      ...updates,
      last4: updates.last4 || (updates.cardNumber ? updates.cardNumber.slice(-4) : current.last4)
    };
    cards[idx] = updatedCard;
    this.saveCards(cards, email);

    api.put(`/credit-cards/${id}`, updatedCard).catch(() => {});
    return updatedCard;
  },

  deleteCard(id: string, email?: string): boolean {
    const cards = this.getCards(email);
    const filtered = cards.filter(c => c.id !== id);
    this.saveCards(filtered, email);
    api.delete(`/credit-cards/${id}`).catch(() => {});
    return true;
  }
};
