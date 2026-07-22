import { InvalidQrFallback } from "@/components/InvalidQrFallback";

export default function NotFound() {
  return (
    <InvalidQrFallback detail="This page could not be found. If you scanned a shop QR, ask your manager for a newly generated code." />
  );
}
