import { CHAIN_BY_CODE } from "@/lib/config";

export default function ChainBadge({ code }: { code: string }) {
  const c = CHAIN_BY_CODE.get(code as never);
  return (
    <span className="badge" style={{ "--c": c?.color } as React.CSSProperties}>
      <i /> {c?.short ?? code}
    </span>
  );
}
