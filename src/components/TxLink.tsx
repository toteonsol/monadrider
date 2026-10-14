import { txUrl, shortHash } from "@/lib/monad";

/** A Monad tx hash that opens on MonadScan. */
export function TxLink({ hash, label }: { hash?: string; label?: string }) {
  if (!hash) return <span className="num text-mute">n/a</span>;
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className="num text-cyan underline decoration-cyan/30 underline-offset-2 hover:decoration-cyan"
    >
      {label ?? shortHash(hash)} ↗
    </a>
  );
}
