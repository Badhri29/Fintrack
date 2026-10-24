package com.networth.service;

import com.lowagie.text.*;
import com.lowagie.text.Font;
import com.lowagie.text.pdf.*;
import com.networth.entity.Transaction;
import com.networth.entity.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@Service
public class PdfStatementService {

    private static final Logger logger = LoggerFactory.getLogger(PdfStatementService.class);

    // Corporate Color Palette
    private static final Color PRIMARY_COLOR = new Color(30, 41, 59);     // Slate 800
    private static final Color ACCENT_COLOR = new Color(79, 70, 229);     // Indigo 600
    private static final Color SUCCESS_COLOR = new Color(16, 185, 129);   // Emerald 500
    private static final Color DANGER_COLOR = new Color(239, 68, 68);     // Rose 500
    private static final Color INFO_COLOR = new Color(59, 130, 246);      // Blue 500
    private static final Color BG_LIGHT = new Color(248, 250, 252);       // Slate 50
    private static final Color BORDER_COLOR = new Color(226, 232, 240);   // Slate 200
    private static final Color TEXT_MUTED = new Color(100, 116, 139);     // Slate 500

    public byte[] generateDailyEodStatementPdf(User user,
                                               String dateStr,
                                               double totalIncome,
                                               double totalExpense,
                                               double netSavings,
                                               List<Map<String, Object>> categories,
                                               List<Transaction> transactions) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4, 36, 36, 40, 40);
            PdfWriter writer = PdfWriter.getInstance(document, out);

            // Add standard metadata
            document.addTitle("FinTrack Daily Financial Statement - " + dateStr);
            document.addAuthor("FinTrack Intelligence");
            document.addCreator("FinTrack Automated Engine");

            document.open();

            // Fonts
            Font brandFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 18, ACCENT_COLOR);
            Font titleFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 12, PRIMARY_COLOR);
            Font sectionTitleFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10, PRIMARY_COLOR);
            Font regularFont = FontFactory.getFont(FontFactory.HELVETICA, 8.5f, PRIMARY_COLOR);
            Font boldFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 8.5f, PRIMARY_COLOR);
            Font mutedFont = FontFactory.getFont(FontFactory.HELVETICA, 7.5f, TEXT_MUTED);
            Font mutedBoldFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 7.5f, TEXT_MUTED);

            // 1. BRAND HEADER TABLE
            PdfPTable headerTable = new PdfPTable(2);
            headerTable.setWidthPercentage(100);
            headerTable.setWidths(new float[]{60, 40});

            // Top Left: Brand Logo & Title
            PdfPCell brandCell = new PdfPCell();
            brandCell.setBorder(Rectangle.NO_BORDER);
            Paragraph pBrand = new Paragraph("FinTrack Intelligence", brandFont);
            pBrand.setSpacingAfter(2);
            Paragraph pSub = new Paragraph("Official Daily Financial Statement & Audit Ledger", mutedFont);
            brandCell.addElement(pBrand);
            brandCell.addElement(pSub);
            headerTable.addCell(brandCell);

            // Top Right: Statement Meta
            PdfPCell metaCell = new PdfPCell();
            metaCell.setBorder(Rectangle.NO_BORDER);
            metaCell.setHorizontalAlignment(Element.ALIGN_RIGHT);
            String refNo = "FT-STMT-" + dateStr.replace("-", "") + "-" + (user != null && user.getId() != null ? user.getId() : "001");
            Paragraph pRef = new Paragraph("Statement Ref: " + refNo, mutedBoldFont);
            pRef.setAlignment(Element.ALIGN_RIGHT);
            Paragraph pDate = new Paragraph("Date of Issue: " + dateStr, boldFont);
            pDate.setAlignment(Element.ALIGN_RIGHT);
            Paragraph pCurrency = new Paragraph("Currency: INR (\u20B9)", mutedFont);
            pCurrency.setAlignment(Element.ALIGN_RIGHT);
            metaCell.addElement(pRef);
            metaCell.addElement(pDate);
            metaCell.addElement(pCurrency);
            headerTable.addCell(metaCell);

            document.add(headerTable);

            // Divider Line
            document.add(createDividerLine());

            // 2. FROM / TO ENTITY DETAILS BOX
            PdfPTable infoBox = new PdfPTable(2);
            infoBox.setWidthPercentage(100);
            infoBox.setWidths(new float[]{50, 50});
            infoBox.setSpacingBefore(8);
            infoBox.setSpacingAfter(14);

            // Left: FROM (FinTrack Administration)
            PdfPCell fromCell = new PdfPCell();
            fromCell.setBackgroundColor(BG_LIGHT);
            fromCell.setBorderColor(BORDER_COLOR);
            fromCell.setPadding(10);

            Paragraph pFromHdr = new Paragraph("ISSUING ENTITY (FROM)", mutedBoldFont);
            pFromHdr.setSpacingAfter(4);
            fromCell.addElement(pFromHdr);
            fromCell.addElement(new Paragraph("FinTrack Technologies Inc.", boldFont));
            fromCell.addElement(new Paragraph("Service Mail: fintracktool@gmail.com", regularFont));
            fromCell.addElement(new Paragraph("Admin Contact: admin@fintrack.app", regularFont));
            fromCell.addElement(new Paragraph("Portal: https://fintrack.app", regularFont));
            infoBox.addCell(fromCell);

            // Right: TO (Account Holder)
            PdfPCell toCell = new PdfPCell();
            toCell.setBackgroundColor(BG_LIGHT);
            toCell.setBorderColor(BORDER_COLOR);
            toCell.setPadding(10);

            Paragraph pToHdr = new Paragraph("ACCOUNT HOLDER (TO)", mutedBoldFont);
            pToHdr.setSpacingAfter(4);
            toCell.addElement(pToHdr);
            String clientName = user != null && user.getName() != null && !user.getName().isBlank() ? user.getName() : "Valued User";
            String clientEmail = user != null && user.getEmail() != null ? user.getEmail() : "N/A";
            String tier = user != null && user.getSubscriptionTier() != null ? user.getSubscriptionTier() : "FREE";

            toCell.addElement(new Paragraph(clientName, boldFont));
            toCell.addElement(new Paragraph("Registered Email: " + clientEmail, regularFont));
            toCell.addElement(new Paragraph("Subscription Package: " + tier + " Plan", regularFont));
            toCell.addElement(new Paragraph("Audit Status: Verified & Recorded", regularFont));
            infoBox.addCell(toCell);

            document.add(infoBox);

            // 3. EXECUTIVE DAILY SUMMARY METRICS
            Paragraph summaryHdr = new Paragraph("EXECUTIVE FINANCIAL SUMMARY", sectionTitleFont);
            summaryHdr.setSpacingAfter(6);
            document.add(summaryHdr);

            PdfPTable summaryTable = new PdfPTable(3);
            summaryTable.setWidthPercentage(100);
            summaryTable.setSpacingAfter(14);

            summaryTable.addCell(createMetricCell("TOTAL INFLOW (INCOME)", String.format("\u20B9 %,.2f", totalIncome), SUCCESS_COLOR));
            summaryTable.addCell(createMetricCell("TOTAL OUTFLOW (EXPENSES)", String.format("\u20B9 %,.2f", totalExpense), DANGER_COLOR));
            summaryTable.addCell(createMetricCell("NET BALANCE (SAVINGS)", String.format("\u20B9 %,.2f", netSavings), INFO_COLOR));

            document.add(summaryTable);

            // 4. ITEMIZED DAILY TRANSACTIONS TABLE
            Paragraph txsHdr = new Paragraph("ITEMIZED DAILY TRANSACTIONS AUDIT", sectionTitleFont);
            txsHdr.setSpacingAfter(6);
            document.add(txsHdr);

            PdfPTable txTable = new PdfPTable(6);
            txTable.setWidthPercentage(100);
            txTable.setWidths(new float[]{12, 28, 18, 16, 12, 14});
            txTable.setSpacingAfter(14);

            // Table Headers
            String[] headers = {"Time / ID", "Description / Note", "Category", "Payment Mode", "Type", "Amount"};
            for (String h : headers) {
                PdfPCell th = new PdfPCell(new Phrase(h, FontFactory.getFont(FontFactory.HELVETICA_BOLD, 7.5f, Color.WHITE)));
                th.setBackgroundColor(PRIMARY_COLOR);
                th.setPadding(6);
                th.setHorizontalAlignment(h.equals("Amount") ? Element.ALIGN_RIGHT : Element.ALIGN_LEFT);
                txTable.addCell(th);
            }

            if (transactions != null && !transactions.isEmpty()) {
                boolean alternate = false;
                for (Transaction t : transactions) {
                    Color rowBg = alternate ? BG_LIGHT : Color.WHITE;
                    alternate = !alternate;

                    String timeStr = t.getCreatedAt() != null ? t.getCreatedAt().format(DateTimeFormatter.ofPattern("HH:mm")) : (t.getId() != null ? "#" + t.getId() : "--");
                    String desc = t.getDescription() != null && !t.getDescription().isBlank() ? t.getDescription() : (t.getCategory() != null ? t.getCategory() : "General Entry");
                    String cat = t.getCategory() != null ? t.getCategory() : "General";
                    String mode = t.getPaymentMode() != null ? t.getPaymentMode().toUpperCase() : (t.getCard() != null ? t.getCard() : "UPI / Cash");
                    String type = t.getType() != null ? t.getType().toUpperCase() : "EXPENSE";
                    double amt = t.getAmount() != null ? t.getAmount() : 0.0;

                    Color typeColor = "INCOME".equalsIgnoreCase(type) ? SUCCESS_COLOR : ("SAVINGS".equalsIgnoreCase(type) ? INFO_COLOR : DANGER_COLOR);

                    txTable.addCell(createTableCell(timeStr, mutedFont, rowBg, Element.ALIGN_LEFT));
                    txTable.addCell(createTableCell(desc, boldFont, rowBg, Element.ALIGN_LEFT));
                    txTable.addCell(createTableCell(cat, regularFont, rowBg, Element.ALIGN_LEFT));
                    txTable.addCell(createTableCell(mode, mutedFont, rowBg, Element.ALIGN_LEFT));

                    PdfPCell typeCell = new PdfPCell(new Phrase(type, FontFactory.getFont(FontFactory.HELVETICA_BOLD, 7.5f, typeColor)));
                    typeCell.setBackgroundColor(rowBg);
                    typeCell.setPadding(5);
                    txTable.addCell(typeCell);

                    PdfPCell amtCell = new PdfPCell(new Phrase(String.format("\u20B9 %,.2f", amt), FontFactory.getFont(FontFactory.HELVETICA_BOLD, 8.5f, typeColor)));
                    amtCell.setBackgroundColor(rowBg);
                    amtCell.setHorizontalAlignment(Element.ALIGN_RIGHT);
                    amtCell.setPadding(5);
                    txTable.addCell(amtCell);
                }
            } else {
                PdfPCell emptyCell = new PdfPCell(new Phrase("No individual transactions recorded on this calendar date.", mutedFont));
                emptyCell.setColspan(6);
                emptyCell.setPadding(12);
                emptyCell.setHorizontalAlignment(Element.ALIGN_CENTER);
                emptyCell.setBackgroundColor(BG_LIGHT);
                emptyCell.setBorderColor(BORDER_COLOR);
                txTable.addCell(emptyCell);
            }

            document.add(txTable);

            // 5. CATEGORY BREAKDOWN TABLE (If available)
            if (categories != null && !categories.isEmpty()) {
                Paragraph catHdr = new Paragraph("SPENDING BY CATEGORY BREAKDOWN", sectionTitleFont);
                catHdr.setSpacingAfter(6);
                document.add(catHdr);

                PdfPTable catTable = new PdfPTable(2);
                catTable.setWidthPercentage(100);
                catTable.setWidths(new float[]{70, 30});
                catTable.setSpacingAfter(14);

                PdfPCell catTh1 = new PdfPCell(new Phrase("Category Name", FontFactory.getFont(FontFactory.HELVETICA_BOLD, 7.5f, Color.WHITE)));
                catTh1.setBackgroundColor(ACCENT_COLOR);
                catTh1.setPadding(5);
                catTable.addCell(catTh1);

                PdfPCell catTh2 = new PdfPCell(new Phrase("Total Amount", FontFactory.getFont(FontFactory.HELVETICA_BOLD, 7.5f, Color.WHITE)));
                catTh2.setBackgroundColor(ACCENT_COLOR);
                catTh2.setHorizontalAlignment(Element.ALIGN_RIGHT);
                catTh2.setPadding(5);
                catTable.addCell(catTh2);

                boolean alt = false;
                for (Map<String, Object> c : categories) {
                    Color cBg = alt ? BG_LIGHT : Color.WHITE;
                    alt = !alt;
                    String cName = String.valueOf(c.getOrDefault("name", "General"));
                    String cAmt = String.valueOf(c.getOrDefault("amount", "0.00"));

                    catTable.addCell(createTableCell(cName, regularFont, cBg, Element.ALIGN_LEFT));
                    catTable.addCell(createTableCell("\u20B9 " + cAmt, boldFont, cBg, Element.ALIGN_RIGHT));
                }
                document.add(catTable);
            }

            // 6. PROFESSIONAL AUDIT NOTICE & FOOTER
            PdfPTable footerBox = new PdfPTable(1);
            footerBox.setWidthPercentage(100);
            footerBox.setSpacingBefore(10);

            PdfPCell noticeCell = new PdfPCell();
            noticeCell.setBackgroundColor(BG_LIGHT);
            noticeCell.setBorderColor(BORDER_COLOR);
            noticeCell.setPadding(8);

            Paragraph pNotice = new Paragraph("AUDIT CERTIFICATION & ADMINISTRATIVE SUPPORT", mutedBoldFont);
            pNotice.setSpacingAfter(2);
            noticeCell.addElement(pNotice);
            noticeCell.addElement(new Paragraph("This is an official system-generated financial statement issued by FinTrack Intelligence Engine. All transaction records are cryptographically verified and archived in your account ledger.", mutedFont));
            noticeCell.addElement(new Paragraph("For discrepancies, quota upgrades, or dispute support, reach out to our administrative team at admin@fintrack.app or fintracktool@gmail.com.", mutedFont));
            footerBox.addCell(noticeCell);

            document.add(footerBox);

            document.close();
            return out.toByteArray();
        } catch (Exception e) {
            logger.error("Failed to generate PDF statement: {}", e.getMessage(), e);
            return null;
        }
    }

    private PdfPCell createMetricCell(String label, String value, Color valueColor) {
        PdfPCell cell = new PdfPCell();
        cell.setBackgroundColor(BG_LIGHT);
        cell.setBorderColor(BORDER_COLOR);
        cell.setPadding(10);
        cell.setHorizontalAlignment(Element.ALIGN_CENTER);

        Paragraph pLbl = new Paragraph(label, FontFactory.getFont(FontFactory.HELVETICA_BOLD, 7f, TEXT_MUTED));
        pLbl.setAlignment(Element.ALIGN_CENTER);
        pLbl.setSpacingAfter(3);

        Paragraph pVal = new Paragraph(value, FontFactory.getFont(FontFactory.HELVETICA_BOLD, 13f, valueColor));
        pVal.setAlignment(Element.ALIGN_CENTER);

        cell.addElement(pLbl);
        cell.addElement(pVal);
        return cell;
    }

    private PdfPCell createTableCell(String text, Font font, Color bgColor, int alignment) {
        PdfPCell cell = new PdfPCell(new Phrase(text, font));
        cell.setBackgroundColor(bgColor);
        cell.setBorderColor(BORDER_COLOR);
        cell.setPadding(5);
        cell.setHorizontalAlignment(alignment);
        return cell;
    }

    private PdfPTable createDividerLine() {
        PdfPTable table = new PdfPTable(1);
        table.setWidthPercentage(100);
        table.setSpacingBefore(6);
        table.setSpacingAfter(6);

        PdfPCell cell = new PdfPCell();
        cell.setBorder(Rectangle.BOTTOM);
        cell.setBorderColor(BORDER_COLOR);
        cell.setBorderWidth(1.2f);
        cell.setPadding(0);
        table.addCell(cell);
        return table;
    }
}
