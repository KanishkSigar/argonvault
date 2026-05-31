/** Blueprint-style architecture diagram: 3 boxes + animated wires + return path. */
export function Schematic() {
  return (
    <div className="schematic">
      <span className="schematic-title">FIG 01 — DATA FLOW</span>
      <div className="schematic-grid" style={{ gridTemplateColumns: "1fr 32px 1fr 32px 1fr" }}>
        <Box label="Browser" sub="aes-gcm · argon2id" />
        <Wire delay={0} />
        <Box label="FastAPI" sub="key broker" />
        <Wire delay={1100} />
        <Box label="S3 / MinIO" sub="ciphertext blobs" />
      </div>
      <div className="schematic-return">
        <span>presigned PUT / GET — bytes never traverse the API</span>
      </div>
    </div>
  );
}

function Box({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="schematic-box">
      <div className="label">{label}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

function Wire({ delay = 0 }: { delay?: number }) {
  return (
    <div className="schematic-wire" aria-hidden>
      <span className="schematic-signal" style={{ animationDelay: `${delay}ms` }} />
    </div>
  );
}
