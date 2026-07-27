import { ImageResponse } from "next/og";

export const alt = "¿A cómo? · BCV y USDT en tiempo real";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Imagen que ven WhatsApp / redes al pegar el link.
export default function OpengraphImage() {
  const pill = {
    display: "flex",
    padding: "14px 26px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#e2e8f0",
    fontSize: "30px",
    fontWeight: 600,
  } as const;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background:
            "linear-gradient(135deg, #0a0b12 0%, #14161f 55%, #0f2a24 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: "150px",
              height: "150px",
              borderRadius: "36px",
              background: "linear-gradient(135deg, #6366f1, #10b981)",
            }}
          >
            <div style={{ fontSize: "96px", fontWeight: 800, lineHeight: 1 }}>
              ¿?
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: "96px",
                fontWeight: 800,
                letterSpacing: "-2px",
                lineHeight: 1.05,
              }}
            >
              ¿A Cómo?
            </div>
            <div
              style={{ fontSize: "36px", color: "#94a3b8", marginTop: "10px" }}
            >
              ¿A cómo está hoy? El cambio del día
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "18px", marginTop: "60px" }}>
          <div style={pill}>Dólar BCV</div>
          <div style={pill}>Euro BCV</div>
          <div style={pill}>USDT · Binance P2P</div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "44px",
            fontSize: "34px",
            fontWeight: 700,
            color: "#34d399",
          }}
        >
          Calcula cuánto ahorras pagando en USDT
        </div>
      </div>
    ),
    { ...size },
  );
}
