import React from 'react';
import { BudgetTransactionsView } from './BudgetTransactionsView';

interface BudgetPlanningViewProps {
  onOpenNewTransaction: (...args: any[]) => void;
}

export const BudgetPlanningView: React.FC<BudgetPlanningViewProps> = ({ onOpenNewTransaction }) => {
  return <BudgetTransactionsView onOpenNewTransaction={onOpenNewTransaction} initialViewMode="budget" />;
};

export default BudgetPlanningView;