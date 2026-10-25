// Centralized Credit Card Service with User Scoping and Event Synchronization

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
          return parsed.map((c: any) => ({
            ...c,
            isActive: c.isActive !== false,
            last4: c.last4 || (c.cardNumber ? c.cardNumber.slice(-4) : '0000')
          }));
        }
      }
    } catch (err) {
      console.error('Error loading cards from storage:', err);
    }

    // Only demo user gets sample default cards
    if (userEmail === 'demo@fintrack.io') {
      return DEFAULT_CARDS;
    }

    // Every other user starts with an empty cards list
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
    return updatedCard;
  },

  deleteCard(id: string, email?: string): boolean {
    const cards = this.getCards(email);
    const filtered = cards.filter(c => c.id !== id);
    this.saveCards(filtered, email);
    return true;
  }
};
