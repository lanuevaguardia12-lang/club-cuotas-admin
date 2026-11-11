import { MyFeeRefreshProvider } from "@/components/players/my-fee-refresh";

export default function MyFeeLayout({ children }: { children: React.ReactNode }) {
  return <MyFeeRefreshProvider>{children}</MyFeeRefreshProvider>;
}
