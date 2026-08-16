export const config = {
  api: {
    bodyParser: false
  }
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", chunk => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    req.on("error", reject);
  });
}

function getKey() {
  return (
    process.env.STABILITY_API_KEY ||
    process.env["CLÉ_API_STABILITÉ"] ||
    process.env.CLE_API_STABILITE
  );
}

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({
        error: "POST only"
      });
  }

  const key = getKey();

  if (!key) {
    return res
      .status(500)
      .json({
        error: "Clé Stability AI introuvable."
      });
  }

  try {

    const raw = await readBody(req);

    const contentType =
      req.headers["content-type"];

    if (
      !contentType ||
      !contentType.includes("multipart/form-data")
    ) {
      return res
        .status(400)
        .json({
          error: "multipart/form-data requis."
        });
    }

    const upstream =
      await fetch(
        "https://api.stability.ai/v2beta/stable-image/edit/remove-background",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${key}`,
            Accept: "image/*",
            "Content-Type": contentType
          },

          body: raw
        }
      );

    if (!upstream.ok) {

      let message =
        `Remove Background ${upstream.status}`;

      try {
        message +=
          `: ${await upstream.text()}`;
      }

      catch {}

      return res
        .status(upstream.status)
        .json({
          error: message
        });
    }

    const buffer =
      Buffer.from(
        await upstream.arrayBuffer()
      );

    res.setHeader(
      "Content-Type",
      "image/png"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res
      .status(200)
      .send(buffer);
  }

  catch (error) {

    return res
      .status(500)
      .json({
        error:
          error?.message ||
          "Erreur détourage."
      });
  }
}
