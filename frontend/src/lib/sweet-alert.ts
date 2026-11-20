import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";

type ConfirmationOptions = {
  title: string;
  text?: string;
  confirmButtonText: string;
  destructive?: boolean;
};

export async function confirmAction({
  title,
  text,
  confirmButtonText,
  destructive = false,
}: ConfirmationOptions) {
  const result = await Swal.fire({
    title,
    text,
    icon: destructive ? "warning" : "question",
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: "Cancel",
    confirmButtonColor: destructive ? "#b91c1c" : "#1b4d35",
    cancelButtonColor: "#64748b",
    reverseButtons: true,
    focusCancel: true,
    customClass: {
      popup: "rounded-2xl",
      title: "text-[#17261d]",
      confirmButton: "rounded-xl px-5 py-2.5 font-semibold",
      cancelButton: "rounded-xl px-5 py-2.5 font-semibold",
    },
  });

  return result.isConfirmed;
}
