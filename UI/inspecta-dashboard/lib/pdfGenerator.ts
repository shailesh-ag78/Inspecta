import { authenticatedFetch } from "./api";

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
    images?: any;
  }>;
}

/**
 * Downloads an image from a URL and converts it into a base64 DataURL.
 */
function getBase64ImageFromUrl(url: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await authenticatedFetch(url);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        reject(new Error("Failed to read image blob as data URL"));
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      reject(error);
    }
  });
}


/**
 * Generates and downloads a Daily Progress Report PDF using jsPDF based on JSON data.
 * Embeds actual images for each incident, formatted 3 in a row.
 */
export async function exportReportToPDF(reportData: PDFReportData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();

  // Page styling / Header
  doc.setFillColor(30, 41, 59); // Dark slate header
  doc.rect(0, 0, 210, 22, "F"); 

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`DPR : ${reportData.selectedSiteName}`, 15, 14);

  // Company name in the header, top right corner
  doc.setFontSize(11);
  doc.text(reportData.companyName, 195, 14, { align: "right" });

  // Metadata section
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

  // Incidents list header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("COMPILED INCIDENTS & OBSERVATIONS", 15, currentY);
  currentY += 8;

  doc.setFontSize(11);
  if (reportData.incidents && reportData.incidents.length > 0) {
    for (const inc of reportData.incidents) {
      // 1. Extract image paths
      let rawList: any[] = [];
      if (inc.images) {
        if (typeof inc.images === "string") {
          try {
            rawList = JSON.parse(inc.images);
          } catch (_) {}
        } else if (Array.isArray(inc.images)) {
          rawList = inc.images;
        }
      }

      const urls = rawList
        .map((item) => typeof item === "string" ? item : (item.url || item.file_url || ""))
        .filter(Boolean);

      // Resolve GCS/local paths to backend proxy endpoint
      const resolvedUrls: string[] = [];
      for (const url of urls) {
        if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
          resolvedUrls.push(url);
        } else {
          resolvedUrls.push(`/api/get-image-forpdf?path=${encodeURIComponent(url)}`);
        }
      }

      // 2. Pre-calculate layout sizes for the card
      const splitIncSummary = doc.splitTextToSize(inc.summary || "No summary", 170);
      const textHeight = splitIncSummary.length * 5.5;

      const imgWidth = 52;
      const imgHeight = 52;
      const gap = 5;
      let imagesHeight = 0;
      if (resolvedUrls.length > 0) {
        const rowsCount = Math.ceil(resolvedUrls.length / 3);
        imagesHeight = rowsCount * imgHeight + (rowsCount - 1) * gap + 6;
      }

      const tileHeight = 8 + textHeight + (imagesHeight > 0 ? imagesHeight : 0) + 8;

      // 3. Page overflow check
      if (currentY + tileHeight > 275) {
        doc.addPage();
        currentY = 20;
      }

      // 4. Draw rounded card tile
      doc.setFillColor(250, 251, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(15, currentY, 180, tileHeight, 2, 2, "FD");

      // 5. Draw elements inside card
      let itemY = currentY + 8;
      
      // Text description
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(splitIncSummary, 20, itemY + 4);
      itemY += textHeight + 4;

      // Image grid
      if (resolvedUrls.length > 0) {
        for (let i = 0; i < resolvedUrls.length; i++) {
          const colIndex = i % 3;
          const rowIndex = Math.floor(i / 3);
          const imgX = 20 + colIndex * (imgWidth + gap);
          const imgY = itemY + rowIndex * (imgHeight + gap);

          try {
            const base64Data = await getBase64ImageFromUrl(resolvedUrls[i]);
            doc.addImage(base64Data, "JPEG", imgX, imgY, imgWidth, imgHeight);
          } catch (err) {
            console.error("Failed to add image to PDF", err);
            doc.setDrawColor(226, 232, 240);
            doc.setFillColor(248, 250, 252);
            doc.rect(imgX, imgY, imgWidth, imgHeight, "FD");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text("Image Unloadable", imgX + 11, imgY + 28);
          }
        }
        itemY += imagesHeight;
      }

      // No divider or metadata info rendered here as per requested changes

      // Increment page Y tracker
      currentY += tileHeight + 6;
    }
  } else {
    doc.setFont("helvetica", "normal");
    doc.text("No incidents selected in this report.", 15, currentY);
  }

  // Download the PDF
  doc.save(`DPR_${reportData.companyName.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
}
