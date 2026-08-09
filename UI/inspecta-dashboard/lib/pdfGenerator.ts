export interface PDFReportData {
  date: string;
  companyName: string;
  selectedSiteName: string;
  summary: string;
  userName: string;
  incidents: Array<{
    id: string;
    summary: string;
    created?: string;
  }>;
}

/**
 * Generates and downloads a Daily Progress Report PDF using jsPDF based on JSON data.
 */
export async function exportReportToPDF(reportData: PDFReportData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();

  // Page styling / Header
  doc.setFillColor(30, 41, 59); // Dark slate header
  doc.rect(0, 0, 210, 22, "F"); // Reduced height from 35 to 22

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`DPR : ${reportData.selectedSiteName}`, 15, 14);

  // Company name in the header, top right corner
  doc.setFontSize(11);
  doc.text(reportData.companyName, 195, 14, { align: "right" });

  // Metadata section (Y coordinates shifted up and Company removed)
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(11);

  doc.setFont("helvetica", "bold");
  doc.text("Site:", 15, 35);
  doc.setFont("helvetica", "normal");
  doc.text(reportData.selectedSiteName, 45, 35);

  doc.setFont("helvetica", "bold");
  doc.text("Inspector:", 15, 42);
  doc.setFont("helvetica", "normal");
  doc.text(reportData.userName, 45, 42);

  doc.setFont("helvetica", "bold");
  doc.text("Report Date:", 15, 49);
  doc.setFont("helvetica", "normal");
  doc.text(reportData.date, 45, 49);

  // Divider line
  doc.setDrawColor(226, 232, 240);
  doc.line(15, 56, 195, 56);

  // Summary section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("EXECUTIVE SUMMARY", 15, 66);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const splitSummary = doc.splitTextToSize(reportData.summary || "No summary provided.", 180);
  doc.text(splitSummary, 15, 74);

  // Calculate Y position after summary
  let currentY = 74 + (splitSummary.length * 5) + 10;

  // Divider line
  doc.line(15, currentY, 195, currentY);
  currentY += 10;

  // Incidents list
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("COMPILED INCIDENTS & OBSERVATIONS", 15, currentY);
  currentY += 8;

  doc.setFontSize(10);
  if (reportData.incidents && reportData.incidents.length > 0) {
    reportData.incidents.forEach((inc: any) => {
      // Check page overflow
      if (currentY > 270) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFont("helvetica", "normal");
      const splitIncSummary = doc.splitTextToSize(inc.summary || "No summary", 180);
      doc.text(splitIncSummary, 15, currentY);
      currentY += (splitIncSummary.length * 5) + 6;
    });
  } else {
    doc.setFont("helvetica", "normal");
    doc.text("No incidents selected in this report.", 15, currentY);
  }

  // Download the PDF
  doc.save(`DPR_${reportData.companyName.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
}
