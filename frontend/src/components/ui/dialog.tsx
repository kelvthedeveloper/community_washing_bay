import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

export function Dialog({
  open,
  title,
  description,
  onOpenChange,
  children,
  className,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = "configuration-dialog-title";
  const descriptionId = "configuration-dialog-description";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={`fixed left-1/2 top-1/2 m-0 max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[#e4ebe4] bg-white p-0 text-foreground shadow-2xl backdrop:bg-slate-950/40 ${className ?? ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
      onClose={() => onOpenChange(false)}
      ref={dialogRef}
    >
      <div className="flex items-start justify-between gap-5 border-b border-[#edf1ed] px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight" id={titleId}>
            {title}
          </h2>
          {description && (
            <p
              className="mt-1 text-sm leading-5 text-muted-foreground"
              id={descriptionId}
            >
              {description}
            </p>
          )}
        </div>
        <Button
          aria-label="Close dialog"
          className="-mr-2 -mt-1 shrink-0"
          onClick={() => onOpenChange(false)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </dialog>
  );
}
