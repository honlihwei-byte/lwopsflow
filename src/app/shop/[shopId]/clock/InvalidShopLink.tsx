import { InvalidQrFallback } from "@/components/InvalidQrFallback";

export function InvalidShopLink() {
  return (
    <InvalidQrFallback detail="The shop id in this QR link is not valid. Please scan an updated QR from your manager." />
  );
}
