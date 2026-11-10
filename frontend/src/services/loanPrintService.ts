import { type LoanModel, calculateLoanEMIs, generateEmiSchedule } from './loanService';
import { currencyService } from './currencyService';

/**
 * Generates an official, print-ready Loan Account Statement & Amortization Report
 * and triggers the system Print dialog (allowing direct "Save as PDF" / Print).
 */
export const printLoanDetailsPdf = (loan: LoanModel, userName?: string, userEmail?: string) => {
  const metrics = calculateLoanEMIs(loan);
  const schedule = generateEmiSchedule(loan, metrics);
  const now = new Date();
  const printDateStr = now.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  const printTimeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const dueDay = loan.dueDay || 5;
  const currentScheduleItem = schedule.find(s => s.isCurrentMonth);
  const isCurrentPaid = currentScheduleItem ? currentScheduleItem.status === 'paid' : metrics.isClosed;

  const totalPaidAmount = metrics.completedEmis * metrics.emi;
  const remainingEmiAmount = metrics.remainingEmis * metrics.emi;
  const outstandingAmount = metrics.remaining;

  const sanitize = (text?: string | null) => {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  const scheduleRowsHtml = schedule
    .map(s => {
      let statusColor = '#64748B';
      let statusBg = '#F1F5F9';
      let statusText = 'UPCOMING';

      if (s.status === 'paid') {
        statusColor = '#059669';
        statusBg = '#ECFDF5';
        statusText = '✓ PAID';
      } else if (s.isCurrentMonth) {
        statusColor = '#D97706';
        statusBg = '#FFFBEB';
        statusText = '⏳ DUE THIS MONTH';
      } else if (s.status === 'pending') {
        statusColor = '#DC2626';
        statusBg = '#FEF2F2';
        statusText = '⚠️ PENDING';
      }

      let proxyBadge = '';
      if (loan.isForSomeoneElse) {
        if (s.isReceived) {
          proxyBadge = `<span style="display:inline-block;padding:2px 7px;border-radius:999px;font-size:9.5px;font-weight:700;color:#059669;background:#ECFDF5;">✓ RECEIVED</span>`;
        } else {
          proxyBadge = `<span style="display:inline-block;padding:2px 7px;border-radius:999px;font-size:9.5px;font-weight:700;color:#D97706;background:#FFFBEB;">⏳ DUE</span>`;
        }
      }

      return `
        <tr style="border-bottom: 1px solid #E2E8F0; ${s.isCurrentMonth ? 'background-color: #F8FAFC;' : ''}">
          <td style="padding: 7px 10px; font-weight: 700; color: #475569; text-align: center;">#${s.index}</td>
          <td style="padding: 7px 10px; font-weight: 600; color: #1E293B;">${sanitize(s.monthStr)} ${s.isCurrentMonth ? '<span style="color:#6366F1;font-size:10px;font-weight:700;">(Current)</span>' : ''}</td>
          <td style="padding: 7px 10px; color: #64748B;">${dueDay}th of month</td>
          <td style="padding: 7px 10px; font-weight: 700; color: #0F172A; text-align: right;">${currencyService.format(s.emiAmount)}</td>
          <td style="padding: 7px 10px; text-align: center;">
            <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;color:${statusColor};background:${statusBg};border:1px solid ${statusColor}33;">
              ${statusText}
            </span>
          </td>
          ${loan.isForSomeoneElse ? `<td style="padding: 7px 10px; text-align: center;">${proxyBadge}</td>` : ''}
        </tr>
      `;
    })
    .join('');

  const proxySectionHtml = loan.isForSomeoneElse
    ? `
      <div style="margin-top: 18px; border: 1px solid #C7D2FE; border-radius: 10px; background: #EEF2FF; padding: 14px 16px; page-break-inside: avoid;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
          <h4 style="margin: 0; font-size: 13px; font-weight: 800; color: #3730A3; text-transform: uppercase; letter-spacing: 0.04em;">
            👤 Third-Party Beneficiary / Proxy Loan Details
          </h4>
          <span style="background: #4338CA; color: #FFF; font-size: 9.5px; font-weight: 800; padding: 2px 8px; border-radius: 999px;">
            PROXY LOAN
          </span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 11.5px;">
          <div>
            <span style="color: #6366F1; font-weight: 600; font-size: 10px; text-transform: uppercase;">Beneficiary / Borrower</span>
            <div style="font-weight: 800; color: #1E1B4B; margin-top: 2px;">${sanitize(loan.borrowerName || 'Borrower')}</div>
          </div>
          <div>
            <span style="color: #6366F1; font-weight: 600; font-size: 10px; text-transform: uppercase;">Contact Phone</span>
            <div style="font-weight: 700; color: #1E1B4B; margin-top: 2px;">${sanitize(loan.borrowerPhone || 'Not Specified')}</div>
          </div>
          <div>
            <span style="color: #6366F1; font-weight: 600; font-size: 10px; text-transform: uppercase;">Reimbursement Status</span>
            <div style="font-weight: 800; color: ${metrics.pendingFromBorrower > 0 ? '#B45309' : '#059669'}; margin-top: 2px;">
              ${metrics.pendingFromBorrower > 0 ? '⚠️ Dues Pending' : '✓ All Up to Date'}
            </div>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #C7D2FE; font-size: 11.5px;">
          <div>
            <span style="color: #6366F1; font-size: 10px; font-weight: 600; text-transform: uppercase;">Total Received From Borrower</span>
            <div style="font-size: 14px; font-weight: 800; color: #059669; margin-top: 2px;">
              ${currencyService.format(metrics.totalReceivedAmount)} <span style="font-size: 10.5px; font-weight: 600; color: #64748B;">(${metrics.receivedEmisCount} of ${metrics.totalEmis} EMIs)</span>
            </div>
          </div>
          <div>
            <span style="color: #6366F1; font-size: 10px; font-weight: 600; text-transform: uppercase;">Pending Reimbursement Owed to You</span>
            <div style="font-size: 14px; font-weight: 800; color: ${metrics.pendingFromBorrower > 0 ? '#DC2626' : '#059669'}; margin-top: 2px;">
              ${currencyService.format(metrics.pendingFromBorrower)}
            </div>
          </div>
        </div>
        ${
          loan.borrowerNotes
            ? `<div style="margin-top: 8px; font-size: 11px; color: #4338CA; font-style: italic;">
                 Note: "${sanitize(loan.borrowerNotes)}"
               </div>`
            : ''
        }
      </div>
    `
    : '';

  const printableHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${sanitize(loan.name).replace(/\s+/g, '_')}_Loan_Statement</title>
  <style>
    @page {
      size: A4;
      margin: 12mm 14mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #0F172A;
      background: #FFFFFF;
      font-size: 12px;
      line-height: 1.45;
    }
    .statement-container {
      max-width: 100%;
      margin: 0 auto;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2.5px solid #4F46E5;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: -0.02em;
      color: #4F46E5;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .document-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      background: #EEF2FF;
      color: #4F46E5;
      padding: 3px 8px;
      border-radius: 6px;
      margin-top: 4px;
    }
    .meta-box {
      text-align: right;
      font-size: 11px;
      color: #64748B;
    }
    .meta-box strong {
      color: #1E293B;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 16px;
      page-break-inside: avoid;
    }
    .kpi-card {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .kpi-label {
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748B;
      margin-bottom: 3px;
    }
    .kpi-val {
      font-size: 16px;
      font-weight: 800;
      color: #0F172A;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      page-break-inside: avoid;
    }
    .details-table th, .details-table td {
      padding: 7px 10px;
      border: 1px solid #E2E8F0;
      font-size: 11.5px;
    }
    .details-table th {
      background: #F1F5F9;
      color: #334155;
      font-weight: 700;
      text-align: left;
      width: 25%;
    }
    .details-table td {
      background: #FFFFFF;
      color: #0F172A;
      font-weight: 600;
      width: 25%;
    }
    .schedule-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    .schedule-table th {
      background: #1E293B;
      color: #FFFFFF;
      padding: 8px 10px;
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .schedule-table td {
      padding: 6px 10px;
    }
    .status-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .footer-bar {
      margin-top: 22px;
      padding-top: 12px;
      border-top: 1px solid #E2E8F0;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #94A3B8;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="statement-container">
    <!-- Header -->
    <div class="header-bar">
      <div>
        <h1 class="brand-title">FINTRACK</h1>
        <div class="document-badge">Official Loan Statement & Repayment Audit</div>
        <div style="font-size: 15px; font-weight: 800; color: #1E293B; margin-top: 6px;">
          ${sanitize(loan.name)}
        </div>
        <div style="font-size: 11.5px; color: #64748B;">
          Lender: <strong style="color: #0F172A;">${sanitize(loan.lender)}</strong>
          ${loan.loanNumber ? ` &bull; Account: <strong>${sanitize(loan.loanNumber)}</strong>` : ''}
          &bull; Type: <strong>${sanitize(loan.type || 'Standard Loan')}</strong>
        </div>
      </div>

      <div class="meta-box">
        <div>Statement Date: <strong>${printDateStr}</strong></div>
        <div>Generated At: <strong>${printTimeStr}</strong></div>
        ${userName ? `<div>Account Holder: <strong>${sanitize(userName)}</strong></div>` : ''}
        ${userEmail ? `<div>Email: <strong>${sanitize(userEmail)}</strong></div>` : ''}
        <div style="margin-top: 6px;">
          Status:
          ${
            metrics.isClosed
              ? '<span style="color:#DC2626;font-weight:800;">CLOSED (Settled)</span>'
              : '<span style="color:#059669;font-weight:800;">ACTIVE (Ongoing)</span>'
          }
        </div>
      </div>
    </div>

    <!-- 4 Key Loan Metric Cards -->
    <div class="kpi-grid">
      <div class="kpi-card" style="border-left: 4px solid #F59E0B;">
        <div class="kpi-label">Principal Amount</div>
        <div class="kpi-val" style="color: #D97706;">${currencyService.format(loan.principal)}</div>
        <div style="font-size: 9.5px; color: #94A3B8; margin-top: 2px;">Initial Loan Sanction</div>
      </div>

      <div class="kpi-card" style="border-left: 4px solid #6366F1;">
        <div class="kpi-label">Monthly EMI</div>
        <div class="kpi-val" style="color: #4F46E5;">${currencyService.format(metrics.emi)}</div>
        <div style="font-size: 9.5px; color: #94A3B8; margin-top: 2px;">Due on ${dueDay}th of month</div>
      </div>

      <div class="kpi-card" style="border-left: 4px solid #10B981;">
        <div class="kpi-label">Total Repaid to Date</div>
        <div class="kpi-val" style="color: #059669;">${currencyService.format(totalPaidAmount)}</div>
        <div style="font-size: 9.5px; color: #94A3B8; margin-top: 2px;">${metrics.completedEmis} of ${metrics.totalEmis} EMIs (${metrics.paidPct}%)</div>
      </div>

      <div class="kpi-card" style="border-left: 4px solid #EF4444;">
        <div class="kpi-label">Remaining Outstanding</div>
        <div class="kpi-val" style="color: ${outstandingAmount > 0 ? '#DC2626' : '#059669'};">${currencyService.format(outstandingAmount)}</div>
        <div style="font-size: 9.5px; color: #94A3B8; margin-top: 2px;">${metrics.remainingEmis} EMIs remaining</div>
      </div>
    </div>

    <!-- Critical EMI Metrics Summary Box (Highlighted Section as Requested by User) -->
    <div style="background: #F8FAFC; border: 1.5px solid #CBD5E1; border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; page-break-inside: avoid;">
      <div style="font-size: 11px; font-weight: 800; color: #334155; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
        📊 Key EMI Settlement & Outstanding Breakdown
      </div>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; font-size: 12px;">
        <div style="background: #FFFFFF; padding: 8px 10px; border-radius: 6px; border: 1px solid #E2E8F0;">
          <span style="font-size: 10px; color: #64748B; font-weight: 600; display: block;">TOTAL EMIs COMPLETED</span>
          <strong style="font-size: 13.5px; color: #059669;">${metrics.completedEmis} of ${metrics.totalEmis} EMIs</strong>
          <div style="font-size: 10px; color: #64748B; margin-top: 1px;">Completion: <strong>${metrics.paidPct}%</strong></div>
        </div>

        <div style="background: #FFFFFF; padding: 8px 10px; border-radius: 6px; border: 1px solid #E2E8F0;">
          <span style="font-size: 10px; color: #64748B; font-weight: 600; display: block;">REMAINING EMIs</span>
          <strong style="font-size: 13.5px; color: #D97706;">${metrics.remainingEmis} Installments</strong>
          <div style="font-size: 10px; color: #64748B; margin-top: 1px;">Tenure left: <strong>${(metrics.remainingEmis / 12).toFixed(1)} yrs</strong></div>
        </div>

        <div style="background: #FFFFFF; padding: 8px 10px; border-radius: 6px; border: 1px solid #E2E8F0;">
          <span style="font-size: 10px; color: #64748B; font-weight: 600; display: block;">REMAINING EMI AMOUNT</span>
          <strong style="font-size: 13.5px; color: #EA580C;">${currencyService.format(remainingEmiAmount)}</strong>
          <div style="font-size: 10px; color: #64748B; margin-top: 1px;">Scheduled future EMI sum</div>
        </div>

        <div style="background: #FFFFFF; padding: 8px 10px; border-radius: 6px; border: 1px solid #E2E8F0;">
          <span style="font-size: 10px; color: #64748B; font-weight: 600; display: block;">REMAINING OUTSTANDING</span>
          <strong style="font-size: 13.5px; color: ${outstandingAmount > 0 ? '#DC2626' : '#059669'};">${currencyService.format(outstandingAmount)}</strong>
          <div style="font-size: 10px; color: #64748B; margin-top: 1px;">Total principal balance</div>
        </div>
      </div>
    </div>

    <!-- Detailed Specifications Table -->
    <table class="details-table">
      <tbody>
        <tr>
          <th>Loan Name</th>
          <td>${sanitize(loan.name)}</td>
          <th>Lender / Bank</th>
          <td>${sanitize(loan.lender)}</td>
        </tr>
        <tr>
          <th>Loan Account Number</th>
          <td><code>${sanitize(loan.loanNumber || loan.id)}</code></td>
          <th>Loan Category</th>
          <td>${sanitize(loan.type || 'Standard Loan')}</td>
        </tr>
        <tr>
          <th>Annual Interest Rate</th>
          <td>${loan.interestRate ? `${loan.interestRate}% p.a.` : '0% (Standard / Flat)'}</td>
          <th>Total Tenure</th>
          <td>${metrics.tenureMonths} Months (${(metrics.tenureMonths / 12).toFixed(1)} Years)</td>
        </tr>
        <tr>
          <th>Total Interest Payable</th>
          <td>${currencyService.format(metrics.totalInterest)}</td>
          <th>Total Amount Payable</th>
          <td>${currencyService.format(metrics.totalPayable)}</td>
        </tr>
        <tr>
          <th>Monthly Due Date</th>
          <td>${dueDay}th of every month</td>
          <th>Repayment Source</th>
          <td>${
            loan.repaymentSource === 'credit_card'
              ? '💳 Credit Card (' + sanitize(loan.linkedCardName || 'Linked Card') + ')'
              : '🏦 Direct Bank Auto-Debit'
          }</td>
        </tr>
        <tr>
          <th>Start Date</th>
          <td>${loan.startDate || 'N/A'}</td>
          <th>Maturity / End Date</th>
          <td>${loan.endDate || 'N/A'}</td>
        </tr>
        <tr>
          <th>Current Month EMI Status</th>
          <td>
            ${
              isCurrentPaid
                ? '<span style="color:#059669;font-weight:800;">✓ PAID THIS MONTH</span>'
                : `<span style="color:#D97706;font-weight:800;">⏳ DUE (Due Day: ${dueDay}th)</span>`
            }
          </td>
          <th>Net Worth Inclusion</th>
          <td>${loan.includeInNetWorth !== false ? '✓ Included in Net Worth' : '✕ Excluded from Net Worth'}</td>
        </tr>
        ${
          loan.description
            ? `
        <tr>
          <th>Purpose / Remarks</th>
          <td colspan="3">${sanitize(loan.description)}</td>
        </tr>
        `
            : ''
        }
      </tbody>
    </table>

    <!-- Proxy Beneficiary Section (if applicable) -->
    ${proxySectionHtml}

    <!-- Complete Month-by-Month Amortization Schedule Table -->
    <div style="margin-top: 18px; margin-bottom: 8px;">
      <h3 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 800; color: #1E293B; text-transform: uppercase; letter-spacing: 0.04em;">
        📅 Complete Month-by-Month EMI Repayment Schedule (${schedule.length} Months)
      </h3>
    </div>

    <table class="schedule-table">
      <thead>
        <tr>
          <th style="width: 8%; text-align: center;">No.</th>
          <th style="width: 24%; text-align: left;">Scheduled Month</th>
          <th style="width: 20%; text-align: left;">Due Date</th>
          <th style="width: 18%; text-align: right;">EMI Amount</th>
          <th style="width: 15%; text-align: center;">Bank Status</th>
          ${loan.isForSomeoneElse ? '<th style="width: 15%; text-align: center;">From Beneficiary</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${scheduleRowsHtml}
      </tbody>
    </table>

    <!-- Footer -->
    <div class="footer-bar">
      <div>
        <strong>FinTrack Financial Tracking &amp; Net Worth System</strong> &bull; Confidential &bull; Generated from personal account records
      </div>
      <div>
        Page 1 &bull; Document Reference: FT-LOAN-${loan.id?.substring(0, 8)?.toUpperCase() || 'REF'}
      </div>
    </div>
  </div>
</body>
</html>
  `;

  // Create an invisible iframe to render the printable document and invoke window.print()
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('title', 'Loan Statement Print Frame');
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(printableHtml);
      iframeDoc.close();

      // Ensure title on iframe window so "Save as PDF" uses this filename by default
      if (iframe.contentWindow) {
        iframe.contentWindow.document.title = `${loan.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_Loan_Statement`;
      }

      // Small delay for browser layout calculation before invoking print dialog
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          // Fallback if iframe print is blocked
          openFallbackPrintWindow(printableHtml, loan.name);
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 3000);
        }
      }, 350);
      return;
    }
  } catch (err) {
    console.warn('Iframe print error, falling back to window.open', err);
  }

  // Fallback to opening popup window if iframe is blocked
  openFallbackPrintWindow(printableHtml, loan.name);
};

const openFallbackPrintWindow = (html: string, loanName: string) => {
  const printWindow = window.open('', '_blank', 'width=900,height=750,resizable=yes,scrollbars=yes');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.document.title = `${loanName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Loan_Statement`;
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 400);
  }
};
