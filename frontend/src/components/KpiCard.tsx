import React from 'react';

interface KpiCardProps {
  label: string;
  value: string;
  year?: string;
  icon: React.ReactNode;
  iconColor?: string;
  iconBg?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  year = '2026',
  icon,
  iconColor = '#6366F1',
  iconBg = 'rgba(99, 102, 241, 0.15)'
}) => {
  return (
    <div className="glass-card kpi-card">
      <div className="kpi-header">
        <div
          className="kpi-icon-box"
          style={{
            background: iconBg,
            color: iconColor,
            boxShadow: `0 4px 16px ${iconBg}`
          }}
        >
          {icon}
        </div>
        <div className="kpi-year-badge">{year}</div>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
};
