import React from 'react';
import { BudgetTransactionsView } from './BudgetTransactionsView';

interface TransactionsViewProps {
  onOpenNewTransaction: () => void;
  globalSearchQuery?: string;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({ onOpenNewTransaction, globalSearchQuery }) => {
  return (
    <BudgetTransactionsView
      onOpenNewTransaction={onOpenNewTransaction}
      globalSearchQuery={globalSearchQuery}
      initialViewMode="transactions"
    />
  );
};

export default TransactionsView;
