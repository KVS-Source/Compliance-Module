import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { CheckCircle2, CircleAlert, Info, X, XCircle } from "lucide-react";

type ToastTone = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  message: string;
}

interface ToastContextValue {
  showToast: (tone: ToastTone, title: string, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneIcons = {
  success: CheckCircle2,
  error: XCircle,
  warning: CircleAlert,
  info: Info,
};

export function ToastProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);
  const showToast = useCallback(
    (tone: ToastTone, title: string, message: string) => {
      const id = Date.now();
      setItems((current) => [...current, { id, tone, title, message }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {items.map((item) => {
          const Icon = toneIcons[item.tone];
          return (
            <div className={`toast toast-${item.tone}`} key={item.id} role="status">
              <span className="toast-icon"><Icon size={17} /></span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.message}</p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close notification"
                onClick={() => dismiss(item.id)}
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used within ToastProvider");
  return value;
}
