import { Paperclip, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EVIDENCE_ALLOWED_EXTENSIONS,
  EVIDENCE_DEFAULT_MAX_UPLOAD_BYTES,
  evidenceApi,
} from "../../services/evidenceApi";
import type { EvidenceDetail, EvidenceUploadProgress } from "../../types/api";
import { formatFileSize } from "./evidenceFormatting";

const ACCEPT = EVIDENCE_ALLOWED_EXTENSIONS.join(",");

const CONSTRAINTS = `Allowed file types: ${EVIDENCE_ALLOWED_EXTENSIONS.map(
  (extension) => extension.slice(1).toUpperCase(),
).join(", ")}. Maximum size ${formatFileSize(
  EVIDENCE_DEFAULT_MAX_UPLOAD_BYTES,
)}.`;

/**
 * Owns one in-flight multipart upload. Progress comes from real upload events,
 * and cancellation aborts the request rather than hiding a running transfer.
 */
export function useEvidenceUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<EvidenceUploadProgress | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const upload = useCallback(
    async (evidenceId: string, file: File): Promise<EvidenceDetail> => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setUploading(true);
      setProgress({
        loaded: 0,
        total: file.size > 0 ? file.size : null,
        percent: file.size > 0 ? 0 : null,
      });
      try {
        return await evidenceApi.uploadEvidenceFile(evidenceId, file, {
          signal: controller.signal,
          onProgress: setProgress,
        });
      } finally {
        controllerRef.current = null;
        setUploading(false);
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const resetProgress = useCallback(() => setProgress(null), []);

  return { uploading, progress, upload, cancel, resetProgress };
}

interface EvidenceFileUploadProps {
  inputId: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  uploading: boolean;
  progress: EvidenceUploadProgress | null;
  onCancel: () => void;
  fieldError?: string | null;
  disabled?: boolean;
  label?: string;
}

export function EvidenceFileUpload({
  inputId,
  file,
  onFileChange,
  uploading,
  progress,
  onCancel,
  fieldError,
  disabled,
  label = "Evidence file",
}: EvidenceFileUploadProps) {
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const percent = progress?.percent ?? null;

  return (
    <div className="field" data-testid="evidence-file-upload">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        className={`control ${fieldError ? "invalid" : ""}`}
        type="file"
        accept={ACCEPT}
        disabled={disabled || uploading}
        aria-describedby={fieldError ? `${helpId} ${errorId}` : helpId}
        aria-invalid={Boolean(fieldError)}
        data-testid="evidence-file-input"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
      <p className="muted" id={helpId}>
        {CONSTRAINTS}
      </p>
      {file ? (
        <p className="muted" data-testid="evidence-file-selected">
          <Paperclip size={13} aria-hidden /> {file.name} ·{" "}
          {formatFileSize(file.size)}
        </p>
      ) : null}

      <div
        className="evidence-upload-status"
        aria-live="polite"
        data-testid="evidence-upload-status"
      >
        {uploading ? (
          <>
            <div
              className="evidence-progress"
              role="progressbar"
              aria-label="Evidence file upload progress"
              {...(percent === null
                ? {}
                : {
                    "aria-valuenow": percent,
                    "aria-valuemin": 0,
                    "aria-valuemax": 100,
                  })}
            >
              <span
                style={{ width: percent === null ? "100%" : `${percent}%` }}
                className={percent === null ? "indeterminate" : ""}
              />
            </div>
            <p data-testid="evidence-upload-progress-text">
              {percent === null
                ? `Uploading — ${formatFileSize(progress?.loaded ?? 0)} sent`
                : `Uploading — ${percent}% complete`}
            </p>
            <button
              className="btn btn-secondary"
              type="button"
              data-testid="evidence-upload-cancel"
              onClick={onCancel}
            >
              <X size={15} /> Cancel upload
            </button>
          </>
        ) : null}
      </div>

      {fieldError ? (
        <div className="error" id={errorId} role="alert">
          {fieldError}
        </div>
      ) : null}
    </div>
  );
}
