import { CHAIN_BY_CODE } from "@/lib/config";

export default function ChainBadge({ code, full = false }: { code: string; full?: boolean }) {
  const c = CHAIN_BY_CODE.get(code as never);
  return (
    <span className="badge" style={{ "--c": c?.color } as React.CSSProperties}>
      <i /> {(full ? c?.label : c?.short) ?? code}
    </span>
  );
}
