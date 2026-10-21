// Centralized Credit Card Service with Cross-View Event Synchronization

export interface CardModel {
  id: string;
  name: string;
  bank: string;
  network: 'Visa' | 'Mastercard' | 'RuPay' | 'Amex';
  cardNumber?: string; // Optional full 16-digit card number
  last4: string;       // 4 digits
  expiryMonth?: number; // 1-12
  expiryYear?: number;  // 2-digit or 4-digit year, e.g. 28
  cvv?: string;         // 3 or 4 digits
  limit: number;
  billingDay: number;
  dueDay: number;
  gradient: string;
  accent: string;
  isActive?: boolean;
}

const CARDS_STORAGE_KEY = 'fintrack_credit_cards';

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
    gradient: 'linear-gradient(135deg, #0369A1 0%, #075985 60%, #0C4A6E 100%)',
    accent: '#38BDF8',
    isActive: true
  },
  {
    id: 'card-3',
    name: 'SBI Cashback',
    bank: 'SBI Card',
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

export const cardService = {
  getCards(): CardModel[] {
    try {
      const stored = localStorage.getItem(CARDS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
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
    return DEFAULT_CARDS;
  },

  getActiveCards(): CardModel[] {
    return this.getCards().filter(c => c.isActive !== false);
  },

  saveCards(cards: CardModel[]): void {
    try {
      localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards));
      window.dispatchEvent(new CustomEvent('fintrack-cards-updated', { detail: cards }));
    } catch (err) {
      console.error('Error saving cards to storage:', err);
    }
  },

  addCard(cardData: Omit<CardModel, 'id'>): CardModel {
    const cards = this.getCards();
    const id = `card-${Date.now()}`;
    const newCard: CardModel = {
      ...cardData,
      id,
      isActive: true,
      last4: cardData.last4 || (cardData.cardNumber ? cardData.cardNumber.slice(-4) : '9999')
    };
    const updated = [...cards, newCard];
    this.saveCards(updated);
    return newCard;
  },

  updateCard(id: string, updates: Partial<CardModel>): CardModel | null {
    const cards = this.getCards();
    const idx = cards.findIndex(c => c.id === id);
    if (idx === -1) return null;

    const current = cards[idx];
    const updatedCard: CardModel = {
      ...current,
      ...updates,
      last4: updates.last4 || (updates.cardNumber ? updates.cardNumber.slice(-4) : current.last4)
    };
    cards[idx] = updatedCard;
    this.saveCards(cards);
    return updatedCard;
  },

  deleteCard(id: string): boolean {
    const cards = this.getCards();
    const filtered = cards.filter(c => c.id !== id);
    this.saveCards(filtered);
    return true;
  }
};
