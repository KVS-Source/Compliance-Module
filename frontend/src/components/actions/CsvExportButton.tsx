import { Download } from "lucide-react";
import { useState } from "react";
import { useToast } from "../../context/ToastContext";
import { exportApi, type CsvExportModule } from "../../services/exportApi";

export function CsvExportButton({ module, registerCode, label = "Export CSV" }: { module?: CsvExportModule; registerCode?: string; label?: string }) {
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const result = registerCode ? await exportApi.downloadRegister(registerCode) : module ? await exportApi.download(module) : null;
      if (!result) throw new Error("No export target was configured.");
      const objectUrl = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = result.fileName;
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      showToast("success", "CSV ready", `${result.fileName} was downloaded.`);
    } catch (error) {
      showToast("error", "Export failed", error instanceof Error ? error.message : "Unable to download the CSV export.");
    } finally {
      setDownloading(false);
    }
  };
  return <button className="btn btn-secondary" type="button" disabled={downloading} onClick={() => void download()}><Download size={15} /> {downloading ? "Exporting…" : label}</button>;
}
