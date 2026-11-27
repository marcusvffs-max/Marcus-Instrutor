export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const body = req.body || {};
    const encoded = typeof body.pdf === "string" ? body.pdf : "";
    if (!encoded || encoded.length > 12 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(encoded)) {
      return res.status(400).send("PDF inválido.");
    }

    const pdf = Buffer.from(encoded, "base64");
    if (pdf.length < 5 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return res.status(400).send("Arquivo PDF inválido.");
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="recibo-venda.pdf"');
    res.setHeader("Content-Length", String(pdf.length));
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.end(pdf);
  } catch (error) {
    return res.status(400).send("Não foi possível preparar o PDF.");
  }
}
